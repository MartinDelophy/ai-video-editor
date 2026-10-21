import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HostError, type PageSession } from "./sessions.ts";
import { analysisSelection, analysisAction, correctionInput, type createAnalysisService } from "./analysis-service.ts";
import { rawAnalysisRecord, correctedAnalysisRecord, analysisTaskRecord } from "./storage/analysis-records.ts";
import { randomUUID } from "node:crypto";
import { whisperModelId, whisperRevision, yolosModelId, yolosRevision, sileroModelId, sileroRevision, type createAnalysisResources } from "./whisper-resources.ts";

export function registerAnalysisRoutes(app: FastifyInstance, service: ReturnType<typeof createAnalysisService>,
  components: { speech: ReturnType<typeof createAnalysisResources>; detection: ReturnType<typeof createAnalysisResources>; segmentation: ReturnType<typeof createAnalysisResources> },
  pageFor: (request: FastifyRequest) => PageSession, success: (request: FastifyRequest, data: unknown) => unknown,
  errorEnvelope: unknown) {
  const id = z.string().min(1).max(256), empty = z.strictObject({});
  const params = z.strictObject({ projectId: id });
  const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
  const envelope = (data: z.ZodType) => json(z.strictObject({ ok: z.literal(true), data,
    meta: z.strictObject({ requestId: id, protocolVersion: z.literal(1) }) }));
  const responses = (data: z.ZodType) => ({ 200: envelope(data), "4xx": errorEnvelope, "5xx": errorEnvelope });
  const accepted = z.strictObject({ saveId: id, saveStatus: z.enum(["queued", "writing", "succeeded", "failed"]),
    replayed: z.boolean(), taskId: id.nullable(), analysisId: id.nullable(),
    error: z.strictObject({ code: id, message: z.string().max(1024) }).nullable() });
  const key = (request: FastifyRequest) => {
    const value = request.headers["idempotency-key"];
    if (typeof value !== "string" || !value.length || value.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    return value;
  };
  for (const [componentId, modelId, revision, localRoot, resources] of [
    ["whisper-small-q8", whisperModelId, whisperRevision, "whisper", components.speech],
    ["yolos-tiny-q8", yolosModelId, yolosRevision, "yolos", components.detection],
    ["silero-vad", sileroModelId, sileroRevision, "silero", components.segmentation],
  ] as const) {
  const preparations = new Map<string, { page: string; expires: number }>();
  const acceptedPreparations = new Map<string, string>();
  app.get(`/api/v1/components/${componentId}`, { schema: { querystring: json(empty), response: responses(z.strictObject({
    componentId: id, modelId: id, revision: id, precision: id, state: z.enum(["missing", "preparing", "verified"]),
    receivedBytes: z.number().nonnegative(), totalBytes: z.number().nonnegative(), error: z.string(), localModelRoot: id,
  })) } }, async request => { pageFor(request); return success(request, await resources.status()); });
  app.post(`/api/v1/components/${componentId}/confirmations`, { schema: { querystring: json(empty), body: json(z.strictObject({ revision: z.literal(revision) })),
    response: responses(z.strictObject({ confirmationId: id })) } }, async request => {
    const page = pageFor(request);
    for (const [key, value] of preparations) if (value.expires <= Date.now()) preparations.delete(key);
    if (preparations.size >= 128) throw new HostError("RESOURCE_BUSY", 429, "Too many pending component confirmations.");
    const confirmationId = randomUUID();
    preparations.set(confirmationId, { page: page.pageSessionId, expires: Math.min(Date.now() + 60_000, Date.parse(page.expiresAt)) });
    return success(request, { confirmationId });
  });
  app.post<{ Body: { revision: string; confirmationId: string } }>(`/api/v1/components/${componentId}/prepare-runs`, {
    schema: { querystring: json(empty), body: json(z.strictObject({ revision: z.literal(revision), confirmationId: id })),
      response: responses(z.strictObject({ status: z.literal("preparing") })) },
  }, async request => {
    const identity = `${pageFor(request).pageSessionId}:${key(request)}`;
    const previous = acceptedPreparations.get(identity);
    if (previous) {
      if (previous !== request.body.confirmationId) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This key belongs to another component confirmation.");
      return success(request, { status: "preparing" });
    }
    const confirmation = preparations.get(request.body.confirmationId);
    if (!confirmation || confirmation.page !== pageFor(request).pageSessionId || confirmation.expires <= Date.now()) {
      throw new HostError("USER_CONFIRMATION_REQUIRED", 403, "Confirm this fixed component download first.");
    }
    preparations.delete(request.body.confirmationId); resources.prepare();
    acceptedPreparations.set(identity, request.body.confirmationId);
    return success(request, { status: "preparing" });
  });
  app.get<{ Params: { "*": string } }>(`/local-components/${localRoot}/*`, async (request, reply) => {
    if (request.headers["sec-fetch-site"] !== "same-origin") throw new HostError("ORIGIN_REJECTED", 403, "Same-origin component access required.");
    const prefix = `${modelId}/`;
    if (!request.params["*"].startsWith(prefix)) throw new HostError("COMPONENT_NOT_READY", 404, "Unknown component resource.");
    const resource = await resources.content(request.params["*"].slice(prefix.length));
    reply.type(resource.mimeType).header("Content-Length", resource.size).header("Cache-Control", "no-store");
    return reply.send(resource.stream);
  });
  }
  const selectionBody = analysisSelection.extend({ editorSessionId: id });
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof selectionBody> }>("/api/v1/projects/:projectId/analysis-confirmations", {
    schema: { params: json(params), querystring: json(empty), body: json(selectionBody),
      response: responses(z.strictObject({ confirmationId: id, expiresAt: z.string() })) },
  }, async request => {
    const { editorSessionId, ...selection } = request.body;
    return success(request, await service.confirm(pageFor(request), request.params.projectId, editorSessionId, selection));
  });
  const runBody = selectionBody.extend({ confirmationId: id });
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof runBody> }>("/api/v1/projects/:projectId/analysis-runs", {
    schema: { params: json(params), querystring: json(empty), body: json(runBody),
      response: { 202: envelope(accepted), "4xx": errorEnvelope, "5xx": errorEnvelope } },
  }, async (request, reply) => {
    const { editorSessionId, confirmationId, ...selection } = request.body;
    const value = await service.start(pageFor(request), request.params.projectId, editorSessionId, key(request), selection, confirmationId);
    reply.code(202); return success(request, value);
  });
  app.get<{ Params: { projectId: string }; Querystring: { assetId?: string; cursor?: string } }>("/api/v1/projects/:projectId/analyses", {
    schema: { params: json(params), querystring: json(z.strictObject({ assetId: id.optional(), cursor: id.optional() })),
      response: responses(z.strictObject({ items: z.array(z.strictObject({ raw: rawAnalysisRecord, correction: correctedAnalysisRecord.nullable() })).max(100), cursor: id.nullable() })) },
  }, async request => success(request, await service.list(pageFor(request), request.params.projectId, request.query.assetId, request.query.cursor)));
  app.get<{ Params: { projectId: string } }>("/api/v1/projects/:projectId/analysis-tasks", {
    schema: { params: json(params), querystring: json(empty), response: responses(z.strictObject({ items: z.array(analysisTaskRecord), pendingSaves: z.array(accepted) })) },
  }, async request => success(request, await service.tasks(pageFor(request), request.params.projectId)));
  const taskParams = params.extend({ taskId: id });
  app.get<{ Params: { projectId: string; taskId: string } }>("/api/v1/projects/:projectId/analysis-tasks/:taskId", {
    schema: { params: json(taskParams), querystring: json(empty), response: responses(analysisTaskRecord) },
  }, async request => success(request, await service.task(pageFor(request), request.params.projectId, request.params.taskId)));
  const actionBody = z.strictObject({ editorSessionId: id, operation: analysisAction });
  app.post<{ Params: { projectId: string; taskId: string }; Body: z.infer<typeof actionBody> }>("/api/v1/projects/:projectId/analysis-tasks/:taskId/actions", {
    bodyLimit: 16 * 1024 * 1024,
    schema: { params: json(taskParams), querystring: json(empty), body: json(actionBody), response: responses(accepted) },
  }, async request => success(request, await service.act(pageFor(request), request.params.projectId, request.body.editorSessionId,
    request.params.taskId, key(request), request.body.operation)));
  const heartbeat = z.strictObject({ editorSessionId: id, stepId: id, attemptId: id });
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof heartbeat> }>("/api/v1/projects/:projectId/analysis-heartbeats", {
    schema: { params: json(params), querystring: json(empty), body: json(heartbeat), response: responses(z.strictObject({ expiresAt: z.string() })) },
  }, async request => success(request, service.heartbeat(pageFor(request), request.params.projectId, request.body.editorSessionId,
    request.body.stepId, request.body.attemptId)));
  const correction = correctionInput.extend({ editorSessionId: id });
  app.post<{ Params: { projectId: string; saveId: string }; Body: { editorSessionId: string } }>("/api/v1/projects/:projectId/analysis-saves/:saveId/retries", {
    schema: { params: json(params.extend({ saveId: id })), querystring: json(empty), body: json(z.strictObject({ editorSessionId: id })), response: responses(accepted) },
  }, async request => success(request, await service.retrySave(pageFor(request), request.params.projectId, request.body.editorSessionId, request.params.saveId, key(request))));
  app.post<{ Params: { projectId: string; analysisId: string }; Body: z.infer<typeof correction> }>("/api/v1/projects/:projectId/analyses/:analysisId/revisions", {
    bodyLimit: 16 * 1024 * 1024,
    schema: { params: json(params.extend({ analysisId: id })), querystring: json(empty), body: json(correction), response: responses(accepted) },
  }, async request => {
    const { editorSessionId, ...input } = request.body;
    return success(request, await service.correct(pageFor(request), request.params.projectId, editorSessionId, request.params.analysisId, key(request), input));
  });
}
