import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HostError, type PageSession } from "./sessions.ts";
import type { Projects } from "./storage/projects.ts";
import { normalizedBytes, sha256 } from "./storage/records.ts";
import { exportJianyingDraft } from "./jianying-draft/jianying-export-service.ts";

export function registerJianyingRoutes(app: FastifyInstance, projects: Projects,
  webRoot: string, pageFor: (request: FastifyRequest) => PageSession,
  success: (request: FastifyRequest, data: unknown) => unknown, errorEnvelope: unknown) {
  const id = z.string().min(1).max(256), empty = z.strictObject({});
  const body = z.strictObject({ draftName: z.string().min(1).max(200).optional(), outputDir: z.string().min(1).max(4096).optional() });
  const issue = z.strictObject({ track: z.string(), segmentId: z.string(), feature: z.string(), reason: z.string(),
    targetProfile: z.string() });
  const target = z.strictObject({ id: z.string(), product: z.literal("jianying"), appVersion: z.string(),
    platform: z.literal("macOS"), bundleId: z.string(), applicationPath: z.string(), executableName: z.string(),
    defaultDraftRoots: z.array(z.string()), mainTimelineFile: z.literal("draft_info.json"),
    synchronizedTimelineFiles: z.array(z.string()), template: z.strictObject({ product: z.literal("jianying"),
      appVersion: z.string(), format: z.literal("plaintext-bootstrap") }) });
  const data = z.strictObject({ draftPath: z.string(), draftName: z.string(), replayed: z.boolean(),
    report: z.strictObject({ status: z.enum(["editable-pass", "editable-with-degradation", "blocked"]), target,
      mapped: z.array(issue), degraded: z.array(issue), unsupported: z.array(issue), blocked: z.array(issue),
      skipped: z.array(issue) }) });
  const json = (value: z.ZodType) => z.toJSONSchema(value, { target: "draft-7" });
  const requests = new Map<string, { digest: string; result: ReturnType<typeof exportJianyingDraft> }>();
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof body> }>("/api/v1/projects/:projectId/jianying-export", {
    schema: { params: json(z.strictObject({ projectId: id })), querystring: json(empty), body: json(body),
      response: { 200: json(z.strictObject({ ok: z.literal(true), data, meta: z.strictObject({ requestId: id, protocolVersion: z.literal(1) }) })),
        "4xx": errorEnvelope, "5xx": errorEnvelope } },
  }, async request => {
    const page = pageFor(request), projectId = request.params.projectId;
    const project = projects.get(page, projectId);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !key.length || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    const scope = JSON.stringify([page.pageSessionId, project.files.directory, projectId, key]), digest = sha256(normalizedBytes(request.body));
    let operation = requests.get(scope);
    const replayed = Boolean(operation);
    if (operation && operation.digest !== digest) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This export key has different parameters.");
    if (!operation) {
      if (requests.size >= 128) throw new HostError("RESOURCE_BUSY", 429, "Export receipt capacity reached for this host instance.");
      const draftName = request.body.draftName ?? `Auto-cut-${sha256(normalizedBytes({ projectId, key })).slice(0, 20)}`;
      operation = { digest, result: exportJianyingDraft(projects, page, projectId, { ...request.body, draftName }, webRoot) };
      requests.set(scope, operation);
    }
    return success(request, { ...await operation.result, replayed });
  });
}
