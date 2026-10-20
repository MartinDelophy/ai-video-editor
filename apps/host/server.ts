import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { timingSafeEqual } from "node:crypto";
import { lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { agentDiscoveryLinkHeader } from "../../scripts/agent-discovery.mjs";
import { inspectWebResources } from "./components.ts";
import { createSessions, HostError, type PageSession } from "./sessions.ts";
import { createEvents } from "./events.ts";
import { createLifecycle } from "./lifecycle.ts";
import { createProjects } from "./storage/projects.ts";
import { createFileSelections, type SelectionPurpose } from "./storage/selections.ts";
import type { SnapshotInput } from "./storage/snapshots.ts";
import type { RecoveryChoice } from "./storage/commits.ts";
import { importMetadata } from "./storage/assets.ts";
import { z } from "zod";
import { mediaRange } from "./storage/media.ts";
import type { Readable } from "node:stream";
import { registerJianyingRoutes } from "./jianying-routes.ts";

const text = { type: "string", minLength: 1, maxLength: 256 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required,
});
const meta = object({ requestId: text, protocolVersion: { const: 1 } });
const errorEnvelope = object({ ok: { const: false }, error: object({
  code: text, category: text, message: { type: "string", maxLength: 1024 },
  messageKey: text, retryable: { type: "boolean" }, action: text,
  fieldIssues: { type: "array", maxItems: 0, items: object({}) },
}), meta });
const responses = (data: unknown) => ({
  200: object({ ok: { const: true }, data, meta }),
  "4xx": errorEnvelope, "5xx": errorEnvelope,
});
const emptyQuery = object({});
const subjectSchema = object({ action: { const: "application.stop" }, subjectId: text,
  subjectRevision: { type: "integer", minimum: 1 }, digest: text });
const nullableText = { anyOf: [text, { type: "null" }] };
const editorSchema = object({ editorSessionId: text, projectId: text, pageSessionId: text,
  mode: { enum: ["read", "write"] }, revision: { type: "integer", minimum: 1 }, expiresAt: text });
const projectSchema = object({ projectId: text, name: text, blocked: { type: "boolean" },
  pending: { type: "integer", minimum: 0 }, currentSavePointId: nullableText, editorSnapshotId: nullableText,
  editorSequence: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, lastSaveId: nullableText });
const sequenceSchema = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const snapshotProperties = {
  editorSnapshotId: text, editorSequence: sequenceSchema, format: { const: "timeline-studio-editor-snapshot" },
  payload: { type: "object", additionalProperties: true },
  refs: { type: "array", maxItems: 100_000, items: object({ kind: { enum: ["asset", "media", "resource"] }, entityId: text,
    revision: sequenceSchema, blobId: text }, ["kind", "entityId"]) },
};
const saveProperties = { saveId: text, status: { enum: ["queued", "writing", "succeeded", "failed"] },
  editorSnapshotId: nullableText, editorSequence: { anyOf: [sequenceSchema, { type: "null" }] } };
const assetSchema = object({ schemaVersion: { const: 1 }, projectId: text, assetId: text, revision: { type: "integer", minimum: 1 },
  name: { type: "string", minLength: 1, maxLength: 1024 }, kind: { enum: ["image", "video", "audio"] }, mimeType: text,
  sizeBytes: sequenceSchema, sha256: { type: "string", minLength: 64, maxLength: 64 },
  mediaRef: object({ kind: { const: "media" }, entityId: text, blobId: text }) });

export async function startHost(options: {
  instanceId: string; proof: string; dist: string; storageExecutable?: string; machineDirectory?: string;
  openBrowser: (url: string) => Promise<void>;
  release: () => Promise<void>;
}) {
  let web = await inspectWebResources(options.dist);
  const app = Fastify({ logger: false, disableRequestLogging: true, bodyLimit: 16_384,
    requestTimeout: 0, connectionTimeout: 60_000, forceCloseConnections: true,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } } });
  const sessions = createSessions(options.instanceId);
  const events = createEvents(options.instanceId);
  const lifecycle = createLifecycle(options.instanceId);
  const projects = createProjects(options.instanceId, options.storageExecutable ?? join(dirname(options.dist), "timeline-studio-storage"));
  const selections = createFileSelections();
  app.addContentTypeParser("application/octet-stream", (_request, payload, done) => done(null, payload));
  const requestSessions = new WeakMap<FastifyRequest, PageSession>();
  let origin = "";
  let host = "";
  let ready = false;
  let closing: Promise<void> | undefined;

  const success = (request: FastifyRequest, data: unknown) => ({
    ok: true, data, meta: { requestId: request.id, protocolVersion: 1 },
  });
  const pageFor = (request: FastifyRequest) => {
    const page = requestSessions.get(request);
    if (!page) throw new HostError("AUTH_REQUIRED", 401, "Page authentication required.");
    return page;
  };
  const reopen = async () => {
    if (!ready || lifecycle.state() !== "Active") throw new HostError("SERVICE_NOT_READY", 503, "Service is not accepting browser launches.");
    const nonce = sessions.nonce();
    try { await options.openBrowser(`${origin}/#bootstrap=${nonce}&instance=${options.instanceId}`); }
    catch { throw new HostError("COMPONENT_NOT_READY", 503, "The browser could not be opened. Check Chrome and run the launcher again."); }
  };
  const stop = () => {
    closing ??= (async () => {
      ready = false;
      lifecycle.drain();
      events.publish("application.stopping");
      events.close();
      sessions.clear();
      await app.close();
      await projects.close();
      selections.clear();
      await options.release();
    })();
    return closing;
  };

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode : 500;
    const status = error instanceof HostError ? error.status :
      error instanceof Error && "validation" in error && error.validation ? 400 :
        statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    const code = error instanceof HostError ? error.code : status < 500 ? "INVALID_ARGUMENT" : "SERVICE_NOT_READY";
    const category = status === 400 ? "invalid_input" : status === 401 ? "authentication" :
      status === 403 ? "authorization" : status === 404 ? "not_found" : status === 409 ? "conflict" :
        status === 422 ? code === "PACKAGE_VERSION_UNSUPPORTED" ? "unsupported" : "precondition" :
          status === 429 ? "resource_busy" : status === 503 ? "dependency_unavailable" : "internal";
    // Fastify validation and system errors may contain paths or request values.
    reply.code(status).send({ ok: false, error: { code, category,
      message: error instanceof HostError ? error.message : "Request could not be completed.",
      messageKey: code, retryable: false, action: "review_request", fieldIssues: [],
    }, meta: { requestId: request.id, protocolVersion: 1 } });
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.headers({ "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff", Link: agentDiscoveryLinkHeader });
    if (!host || request.headers.host !== host) throw new HostError("ORIGIN_REJECTED", 403, "Exact loopback Host required.");
    const path = request.url.split("?")[0];
    const browserApi = path === "/api" || path.startsWith("/api/");
    const internal = path === "/internal" || path.startsWith("/internal/");
    if (!browserApi && !internal) return;
    reply.header("Cache-Control", "no-store");
    if (request.headers["x-timeline-studio-protocol-version"] !== "1") {
      throw new HostError("PROTOCOL_VERSION_UNSUPPORTED", 400, "Protocol version 1 is required.");
    }
    const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
    const upload = request.method === "POST" && request.routeOptions.url === "/api/v1/projects/:projectId/asset-imports";
    const media = (request.method === "GET" || request.method === "HEAD") && request.routeOptions.url === "/api/v1/projects/:projectId/assets/:assetId/content";
    if (contentType !== "application/json" && !(upload && contentType === "application/octet-stream") && !media) {
      throw new HostError("INVALID_ARGUMENT", 400, "JSON content type required.");
    }
    if (internal) {
      if (request.headers.origin !== undefined || request.headers["sec-fetch-site"] !== undefined) {
        throw new HostError("ORIGIN_REJECTED", 403, "Launcher-only route.");
      }
      const expected = Buffer.from(`Instance ${options.proof}`);
      const supplied = Buffer.from(request.headers.authorization ?? "");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        throw new HostError("INSTANCE_PROOF_INVALID", 401, "Instance proof required.");
      }
      return;
    }
    const requestOrigin = request.headers.origin;
    const read = request.method === "GET" || request.method === "HEAD";
    if (request.headers["sec-fetch-site"] !== "same-origin" ||
        (requestOrigin !== undefined ? requestOrigin !== origin : !read)) {
      throw new HostError("ORIGIN_REJECTED", 403, "Same-origin browser request required.");
    }
    if (path === "/api/v1/sessions/bootstrap") {
      if (!ready || lifecycle.state() !== "Active") throw new HostError("SERVICE_NOT_READY", 503, "Service is stopping.");
    } else requestSessions.set(request, sessions.authenticate(request.headers.authorization));
  });

  registerJianyingRoutes(app, projects, options.dist, pageFor, success, errorEnvelope);
  app.get("/healthz", { schema: { querystring: emptyQuery, response: {
    200: object({ status: { const: "ready" }, protocolVersion: { const: 1 } }),
    503: object({ status: { const: "not_ready" }, protocolVersion: { const: 1 } }),
  } } }, async (_request, reply) => {
    if (!ready || lifecycle.state() !== "Active") return reply.code(503).send({ status: "not_ready", protocolVersion: 1 });
    return { status: "ready", protocolVersion: 1 };
  });
  app.post<{ Body: { instanceId: string; bootstrapNonce: string } }>("/api/v1/sessions/bootstrap", {
    schema: { querystring: emptyQuery, body: object({ instanceId: text, bootstrapNonce: text }),
      response: responses(object({ pageSessionId: text, instanceId: text, bearer: text, expiresAt: text })) },
  }, async (request) => success(request, sessions.bootstrap(request.body.instanceId, request.body.bootstrapNonce)));
  app.get("/api/v1/session", { schema: { querystring: emptyQuery, response: responses(object({
    pageSessionId: text, instanceId: text, expiresAt: text, protocolVersion: { const: 1 },
    writableProjects: { type: "array", items: editorSchema },
    state: { enum: ["Active", "Draining"] }, exitSubject: subjectSchema,
  })) } }, async (request) => {
    const { pageSessionId, instanceId, expiresAt } = pageFor(request);
    return success(request, { pageSessionId, instanceId, expiresAt, protocolVersion: 1,
      writableProjects: projects.editors.writable(pageFor(request)), state: lifecycle.state(), exitSubject: lifecycle.subject });
  });
  app.post<{ Body: { purpose: SelectionPurpose; multiple: boolean; mediaKinds?: ("image" | "video" | "audio")[] } }>("/api/v1/file-selections", {
    schema: { querystring: emptyQuery, body: object({ purpose: { enum: ["project-create", "project-open", "asset-import"] },
      multiple: { type: "boolean" }, mediaKinds: { type: "array", maxItems: 3, uniqueItems: true, items: { enum: ["image", "video", "audio"] } } }, ["purpose", "multiple"]),
    response: responses(object({ selectionId: text, expiresAt: text, items: { type: "array", maxItems: 256,
      items: object({ name: { type: "string", maxLength: 1024 }, kind: { enum: ["directory", "file"] } }) } })) },
  }, async request => {
    if (lifecycle.state() !== "Active") throw new HostError("TASKS_DRAINING", 409, "Service is stopping.");
    const socket = request.raw.socket, timeout = socket.timeout;
    // Keep the request alive for the native chooser's 120-second interaction window.
    socket.setTimeout(130_000);
    try { return success(request, await selections.choose(pageFor(request), request.body.purpose, request.body.multiple, request.body.mediaKinds)); }
    finally { socket.setTimeout(timeout ?? 60_000); }
  });
  app.post<{ Body: { selectionId: string; name: string } }>("/api/v1/projects", {
    schema: { querystring: emptyQuery, body: object({ selectionId: text, name: text }), response: responses(projectSchema) },
  }, async request => success(request, await projects.create(pageFor(request),
    selections.resolve(pageFor(request), request.body.selectionId, "project-create")[0], request.body.name)));
  app.post<{ Body: { selectionId: string } }>("/api/v1/projects/open", {
    schema: { querystring: emptyQuery, body: object({ selectionId: text }), response: responses(projectSchema) },
  }, async request => success(request, await projects.open(pageFor(request),
    selections.resolve(pageFor(request), request.body.selectionId, "project-open")[0])));
  app.post<{ Body: { selectionId: string } }>("/api/v1/projects/recovery-options", {
    schema: { querystring: emptyQuery, body: object({ selectionId: text }), response: responses(object({ projectId: text,
      currentSavePointId: text, currentCommitSequence: { type: "integer", minimum: 1 }, currentCommitSha256: text,
      previousSavePointId: nullableText, previousEditorSequence: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
      status: { enum: ["healthy", "previous_available", "no_valid_previous"] } })) },
  }, async request => success(request, await projects.recoveryOptions(
    selections.resolve(pageFor(request), request.body.selectionId, "project-open")[0])));
  app.post<{ Body: { selectionId: string; projectId: string; choice: RecoveryChoice } }>("/api/v1/projects/recoveries", {
    schema: { querystring: emptyQuery, body: object({ selectionId: text, projectId: text, choice: object({ currentSavePointId: text,
      currentCommitSequence: { type: "integer", minimum: 1 }, currentCommitSha256: { type: "string", minLength: 64, maxLength: 64 }, previousSavePointId: text }) }),
      response: { 202: object({ ok: { const: true }, data: object({ projectId: text, saveId: text, replayed: { type: "boolean" } }), meta }), "4xx": errorEnvelope, "5xx": errorEnvelope } },
  }, async (request, reply) => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !key.length || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    const result = await projects.recoverProject(pageFor(request), selections.resolve(pageFor(request), request.body.selectionId, "project-open")[0],
      request.body.projectId, request.body.choice, key);
    reply.code(202); return success(request, result);
  });
  app.get<{ Params: { projectId: string } }>("/api/v1/projects/:projectId", {
    schema: { querystring: emptyQuery, params: object({ projectId: text }), response: responses(object({ ...projectSchema.properties,
      editorSnapshot: { anyOf: [object({ ...snapshotProperties, schemaVersion: { const: 1 }, projectId: text }), { type: "null" }] } })) },
  }, async request => success(request, { ...projects.describe(pageFor(request), request.params.projectId),
    editorSnapshot: await projects.snapshot(pageFor(request), request.params.projectId) }));
  app.get<{ Params: { projectId: string; requestId: string } }>("/api/v1/projects/:projectId/editor-snapshot-requests/:requestId", {
    schema: { params: object({ projectId: text, requestId: { type: "string", minLength: 1, maxLength: 128 } }), querystring: emptyQuery,
      response: responses(object({ receipt: { anyOf: [object({ ...saveProperties, replayed: { type: "boolean" } }), { type: "null" }] } })) },
  }, async request => success(request, projects.snapshotRequest(pageFor(request), request.params.projectId, request.params.requestId)));
  app.post<{ Params: { projectId: string }; Body: SnapshotInput & { editorSessionId: string } }>("/api/v1/projects/:projectId/editor-snapshots", {
    bodyLimit: 63 * 1024 * 1024,
    schema: { querystring: emptyQuery, params: object({ projectId: text }), body: object({ ...snapshotProperties, editorSessionId: text }),
      response: { 202: object({ ok: { const: true }, data: object({ ...saveProperties, replayed: { type: "boolean" } }), meta }), "4xx": errorEnvelope, "5xx": errorEnvelope } },
  }, async (request, reply) => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !key.length || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    const { editorSessionId, ...input } = request.body;
    const saved = await projects.saveSnapshot(pageFor(request), request.params.projectId, editorSessionId, key, input);
    reply.code(202);
    return success(request, saved);
  });
  app.get<{ Params: { saveId: string } }>("/api/v1/saves/:saveId", {
    schema: { querystring: emptyQuery, params: object({ saveId: text }), response: responses(object({ ...saveProperties, savePointId: nullableText,
      error: { anyOf: [object({ code: text, message: { type: "string", maxLength: 1024 } }), { type: "null" }] } })) },
  }, async request => success(request, projects.save(pageFor(request), request.params.saveId)));
  app.post<{ Params: { projectId: string }; Body: Readable }>("/api/v1/projects/:projectId/asset-imports", {
    schema: { params: object({ projectId: text }), querystring: emptyQuery,
      response: { 202: object({ ok: { const: true }, data: object({ taskId: text, stepId: text, saveId: text, replayed: { type: "boolean" } }), meta }), "4xx": errorEnvelope, "5xx": errorEnvelope } },
  }, async (request, reply) => {
    const key = request.headers["idempotency-key"], encoded = request.headers["x-timeline-studio-import-metadata"];
    if (typeof key !== "string" || !key.length || key.length > 128) {
      throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    }
    if (request.headers["content-type"]?.split(";")[0].trim() === "application/json") {
      const parsed = z.strictObject({ selectionId: z.string().min(1).max(256), editorSessionId: z.string().min(1).max(256),
        options: z.strictObject({ itemIndex: z.number().int().nonnegative().safe().default(0) }).default({ itemIndex: 0 }) }).safeParse(request.body);
      if (!parsed.success) throw new HostError("INVALID_ARGUMENT", 400, "Native import metadata is invalid.");
      const page = pageFor(request), input = parsed.data;
      const selected = await selections.openAsset(page, input.selectionId, input.options.itemIndex);
      try {
        const result = await projects.importAsset(page, request.params.projectId, input.editorSessionId, key, selected.metadata, selected.input);
        reply.code(202);
        return success(request, result);
      } finally { await selected.close(); }
    }
    if (typeof encoded !== "string" || encoded.length > 8192) {
      throw new HostError("INVALID_ARGUMENT", 400, "Import identity and bounded metadata are required.");
    }
    let metadata;
    let editorSessionId: string;
    try {
      const raw = Buffer.from(encoded, "base64url");
      if (raw.toString("base64url") !== encoded) throw new Error("Invalid encoding.");
      const value = JSON.parse(raw.toString("utf8"));
      const { editorSessionId: session, ...description } = value;
      if (typeof session !== "string" || !session.length || session.length > 256) throw new Error("Missing session.");
      metadata = importMetadata.parse(description); editorSessionId = session;
    } catch { throw new HostError("INVALID_ARGUMENT", 400, "Import metadata is invalid."); }
    const result = await projects.importAsset(pageFor(request), request.params.projectId, editorSessionId, key, metadata, request.body);
    reply.code(202);
    return success(request, result);
  });
  app.get<{ Params: { projectId: string }; Querystring: { cursor?: string } }>("/api/v1/projects/:projectId/assets", {
    schema: { params: object({ projectId: text }), querystring: object({ cursor: text }, []),
      response: responses(object({ items: { type: "array", maxItems: 100, items: assetSchema }, cursor: nullableText })) },
  }, async request => success(request, await projects.assets(pageFor(request), request.params.projectId, request.query.cursor)));
  app.get<{ Params: { projectId: string; assetId: string } }>("/api/v1/projects/:projectId/assets/:assetId", {
    schema: { params: object({ projectId: text, assetId: text }), querystring: emptyQuery, response: responses(assetSchema) },
  }, async request => success(request, await projects.asset(pageFor(request), request.params.projectId, request.params.assetId)));
  app.get<{ Params: { projectId: string; assetId: string }; Querystring: { blobId: string } }>("/api/v1/projects/:projectId/assets/:assetId/content", {
    schema: { params: object({ projectId: text, assetId: text }), querystring: object({ blobId: text }), response: { "4xx": errorEnvelope, "5xx": errorEnvelope } },
  }, async (request, reply) => {
    const { asset, object: media, files } = await projects.media(pageFor(request), request.params.projectId, request.params.assetId, request.query.blobId);
    const etag = `"${media.sha256}"`;
    let range;
    try { range = mediaRange(request.headers["if-range"] && request.headers["if-range"] !== etag ? undefined : request.headers.range, media.sizeBytes); }
    catch (error) { reply.header("Content-Range", `bytes */${media.sizeBytes}`); throw error; }
    reply.code(range.partial ? 206 : 200).type(asset.mimeType).headers({ "Accept-Ranges": "bytes", ETag: etag, "Content-Length": range.length });
    if (range.partial) reply.header("Content-Range", `bytes ${range.start}-${range.start + range.length - 1}/${media.sizeBytes}`);
    if (request.method === "HEAD") return reply.send();
    return reply.send(files.stream(media.path, range.start, range.length));
  });
  app.get<{ Params: { taskId: string } }>("/api/v1/tasks/:taskId", {
    schema: { params: object({ taskId: text }), querystring: emptyQuery, response: responses(object({ taskId: text, projectId: text,
      status: { enum: ["queued", "running", "succeeded", "failed"] }, saveId: text, stepId: text, attemptId: text,
      resultId: nullableText, assetId: nullableText, error: { anyOf: [object({ code: text, message: { type: "string", maxLength: 1024 } }), { type: "null" }] } })) },
  }, async request => success(request, projects.task(pageFor(request), request.params.taskId)));
  app.get<{ Params: { resultId: string } }>("/api/v1/results/:resultId", {
    schema: { params: object({ resultId: text }), querystring: emptyQuery,
      response: responses(object({ resultId: text, projectId: text, taskId: text, attemptId: text,
        registration: { enum: ["staged", "registered"] }, saveId: text, saveStatus: { enum: ["queued", "writing", "succeeded", "failed"] },
        artifacts: { type: "array", items: object({ artifactId: text, mediaRef: object({ kind: { const: "media" }, entityId: text, blobId: text }) }) },
        error: { anyOf: [object({ code: text, message: { type: "string", maxLength: 1024 } }), { type: "null" }] } })) },
  }, async request => success(request, projects.result(pageFor(request), request.params.resultId)));
  app.post<{ Params: { resultId: string }; Body: { editorSessionId: string; expectedSaveId: string } }>("/api/v1/results/:resultId/registration-retries", {
    schema: { params: object({ resultId: text }), querystring: emptyQuery, body: object({ editorSessionId: text, expectedSaveId: text }),
      response: { 202: object({ ok: { const: true }, data: object({ taskId: text, stepId: text, saveId: text, replayed: { type: "boolean" } }), meta }), "4xx": errorEnvelope, "5xx": errorEnvelope } },
  }, async (request, reply) => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !key.length || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    const result = await projects.retryRegistration(pageFor(request), request.params.resultId, request.body.editorSessionId, request.body.expectedSaveId, key);
    reply.code(202);
    return success(request, result);
  });
  app.post<{ Params: { projectId: string }; Body: { pageSessionId: string; mode: "read" | "write" } }>("/api/v1/projects/:projectId/editor-sessions", {
    schema: { querystring: emptyQuery, params: object({ projectId: text }), body: object({ pageSessionId: text, mode: { enum: ["read", "write"] } }),
      response: responses(editorSchema) },
  }, async request => {
    const page = pageFor(request);
    if (request.body.pageSessionId !== page.pageSessionId) throw new HostError("AUTH_REQUIRED", 401, "The editor session must belong to this page.");
    const project = projects.get(page, request.params.projectId);
    if (request.body.mode === "write" && project.commits.state().blocked) throw new HostError("PROJECT_WRITE_LOCKED", 409, "Project recovery must finish before editing.");
    return success(request, projects.editors.acquire(page, request.params.projectId, request.body.mode));
  });
  app.post<{ Params: { editorSessionId: string }; Body: { revision: number } }>("/api/v1/editor-sessions/:editorSessionId/renew", {
    schema: { querystring: emptyQuery, params: object({ editorSessionId: text }), body: object({ revision: { type: "integer", minimum: 1 } }), response: responses(editorSchema) },
  }, async request => success(request, projects.editors.renew(pageFor(request), request.params.editorSessionId, request.body.revision)));
  app.delete<{ Params: { editorSessionId: string } }>("/api/v1/editor-sessions/:editorSessionId", {
    schema: { querystring: emptyQuery, params: object({ editorSessionId: text }), response: responses(object({ released: { const: true } })) },
  }, async request => {
    projects.editors.release(pageFor(request), request.params.editorSessionId);
    return success(request, { released: true });
  });
  app.get("/api/v1/components", { schema: { querystring: emptyQuery, response: responses(object({
    items: { type: "array", items: object({ identity: text,
      version: { type: "string", maxLength: 256 }, platform: text,
      state: { enum: ["available", "unknown"] }, detail: { type: "string", maxLength: 1024 } }) },
  })) } }, async (request) => success(request, { items: web.components }));
  app.get<{ Querystring: { after?: string } }>("/api/v1/events", {
    schema: { querystring: object({ after: text }, []), response: { "4xx": errorEnvelope, "5xx": errorEnvelope } },
  }, async (request, reply) => { events.subscribe(reply, pageFor(request), request.query.after); });
  app.post<{ Body: { instanceId: string } }>("/internal/v1/launcher/reopen", {
    schema: { querystring: emptyQuery, body: object({ instanceId: text }), response: responses(object({ instanceId: text })) },
  }, async (request) => {
    if (request.body.instanceId !== options.instanceId) throw new HostError("INSTANCE_CHANGED", 401, "Instance changed.");
    await reopen();
    return success(request, { instanceId: options.instanceId });
  });
  app.post<{ Body: typeof lifecycle.subject }>("/api/v1/confirmation-challenges", {
    schema: { querystring: emptyQuery, body: subjectSchema, response: responses(object({ confirmationId: text, expiresAt: text })) },
  }, async request => success(request, lifecycle.confirm(pageFor(request), request.body)));
  app.post<{ Body: { mode: string; confirmationId: string } }>("/api/v1/application/exit-requests", {
    schema: { querystring: emptyQuery, body: object({ mode: { const: "normal" }, confirmationId: text }),
      response: responses(object({ state: { const: "Draining" }, replayed: { type: "boolean" } })) },
    onResponse: async (_request, reply) => {
      if (reply.statusCode === 200) setImmediate(() => { void stop().catch(() => {
        console.error("Timeline Studio could not finish instance cleanup. Inspect the previous instance before restarting.");
        process.exitCode = 1;
      }); });
    },
  }, async (request) => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !key.length || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    if (projects.busy() || selections.busy()) throw new HostError("TASKS_DRAINING", 409, "Wait for project operations to finish before stopping.");
    return success(request, lifecycle.exit(pageFor(request), request.body, key));
  });

  await app.register(fastifyStatic, { root: options.dist, serve: false, index: false,
    dotfiles: "allow", redirect: false, maxAge: 0 });
  const serve = async (request: FastifyRequest<{ Params: { "*"?: string } }>, reply: FastifyReply) => {
    const name = request.params["*"] || "index.html";
    if (name === "index.html") web = await inspectWebResources(options.dist);
    if (!web.files.has(name) || name.includes("\\") || name.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new HostError("INVALID_ARGUMENT", 404, "Web resource not found.");
    }
    let path = options.dist;
    for (const part of name.split("/")) {
      path = join(path, part);
      if ((await lstat(path)).isSymbolicLink()) throw new HostError("INVALID_ARGUMENT", 403, "Linked resources are not served.");
    }
    if (name === "index.html") return reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8").send(web.html);
    return reply.sendFile(name);
  };
  app.get<{ Params: { "*"?: string } }>("/", serve);
  app.get<{ Params: { "*"?: string } }>("/*", async (request, reply) => {
    const name = request.params["*"] ?? "";
    if (name === "api" || name.startsWith("api/") || name === "internal" || name.startsWith("internal/")) {
      throw new HostError("UNSUPPORTED_CAPABILITY", 404, "This route is not implemented in the current slice.");
    }
    return serve(request, reply);
  });
  app.setNotFoundHandler(() => { throw new HostError("UNSUPPORTED_CAPABILITY", 404, "Route not found."); });
  try {
    origin = await app.listen({ host: "127.0.0.1", port: 0 });
    host = new URL(origin).host;
    ready = true;
    events.publish("application.ready");
    return { port: Number(new URL(origin).port), reopen, stop };
  } catch (error) { await app.close(); throw error; }
}
