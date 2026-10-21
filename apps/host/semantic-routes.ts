import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HostError, type PageSession } from "./sessions.ts";
import { semanticCorrectionInput } from "./storage/semantic-analyses.ts";
import { agentSemanticOutput, agentSemanticStep, correctedSemanticRecord, rawSemanticRecord, semanticTaskRecord } from "./storage/semantic-records.ts";
import { semanticStart, type createSemanticService } from "./semantic-service.ts";

export function registerSemanticRoutes(app: FastifyInstance, service: ReturnType<typeof createSemanticService>,
  pageFor: (request: FastifyRequest) => PageSession, success: (request: FastifyRequest, data: unknown) => unknown, errorEnvelope: unknown) {
  const id = z.string().min(1).max(256), empty = z.strictObject({}), params = z.strictObject({ projectId: id });
  const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
  const responses = (value: z.ZodType) => ({ 200: json(z.strictObject({ ok: z.literal(true), data: value,
    meta: z.strictObject({ requestId: id, protocolVersion: z.literal(1) }) })), "4xx": errorEnvelope, "5xx": errorEnvelope });
  const key = (request: FastifyRequest) => {
    const value = request.headers["idempotency-key"];
    if (typeof value !== "string" || !value.length || value.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    return value;
  };
  const editor = z.strictObject({ editorSessionId: id });
  const start = semanticStart.extend({ editorSessionId: id });
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof start> }>("/api/v1/projects/:projectId/agent-semantic-runs", {
    schema: { params: json(params), querystring: json(empty), body: json(start), response: responses(agentSemanticStep) },
  }, async request => {
    const { editorSessionId, ...input } = request.body;
    return success(request, await service.prepareAgent(pageFor(request), request.params.projectId, editorSessionId, input, key(request)));
  });
  const taskParams = params.extend({ taskId: id });
  app.post<{ Params: z.infer<typeof taskParams>; Body: z.infer<typeof editor> }>("/api/v1/projects/:projectId/agent-semantic-runs/:taskId/context", {
    schema: { params: json(taskParams), querystring: json(empty), body: json(editor), response: responses(agentSemanticStep) },
  }, async request => success(request, await service.inspectAgent(pageFor(request), request.params.projectId, request.body.editorSessionId, request.params.taskId)));
  const output = agentSemanticOutput.extend({ editorSessionId: id });
  app.post<{ Params: z.infer<typeof taskParams>; Body: z.infer<typeof output> }>("/api/v1/projects/:projectId/agent-semantic-runs/:taskId/outputs", {
    bodyLimit: 4_000_000, schema: { params: json(taskParams), querystring: json(empty), body: json(output), response: responses(agentSemanticStep) },
  }, async request => {
    const { editorSessionId, ...input } = request.body;
    if (request.headers["idempotency-key"] !== input.inputDigest) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key must match the semantic input digest.");
    return success(request, await service.submitAgent(pageFor(request), request.params.projectId, editorSessionId, request.params.taskId, input));
  });
  app.get<{ Params: { projectId: string } }>("/api/v1/projects/:projectId/semantic-catalog", {
    schema: { params: json(params), querystring: json(empty), response: responses(z.strictObject({
      sources: z.array(z.strictObject({ analysisId: id, revision: z.number().int().positive().safe(), assetId: id,
        range: rawSemanticRecord.shape.basis.shape.range, textPreview: z.string().max(4096), complete: z.boolean() })),
      analyses: z.array(z.strictObject({ analysisId: id, revision: z.number().int().positive().safe(), assetId: id,
        sourceAnalysisRef: rawSemanticRecord.shape.basis.shape.sourceAnalysisRef, centralIdea: rawSemanticRecord.shape.output.shape.centralIdea,
        themes: rawSemanticRecord.shape.output.shape.themes, sourceCurrent: z.boolean() })),
      tasks: z.array(z.strictObject({ taskId: id, status: semanticTaskRecord.shape.status,
        analysisRef: semanticTaskRecord.shape.analysisRef, sourceAnalysisRef: rawSemanticRecord.shape.basis.shape.sourceAnalysisRef })),
    })) },
  }, async request => success(request, await service.catalog(pageFor(request), request.params.projectId)));
  app.get<{ Params: { projectId: string }; Querystring: { assetId?: string; cursor?: string } }>("/api/v1/projects/:projectId/semantic-analyses", {
    schema: { params: json(params), querystring: json(z.strictObject({ assetId: id.optional(), cursor: id.optional() })),
      response: responses(z.strictObject({ items: z.array(z.strictObject({ raw: rawSemanticRecord,
        correction: correctedSemanticRecord.nullable(), sourceCurrent: z.boolean() })).max(100), cursor: id.nullable() })) },
  }, async request => success(request, await service.list(pageFor(request), request.params.projectId, request.query.assetId, request.query.cursor)));
  app.get<{ Params: { projectId: string } }>("/api/v1/projects/:projectId/semantic-runs", {
    schema: { params: json(params), querystring: json(empty), response: responses(z.strictObject({ items: z.array(semanticTaskRecord) })) },
  }, async request => success(request, await service.tasks(pageFor(request), request.params.projectId)));
  const correction = semanticCorrectionInput.extend({ editorSessionId: id }), analysisParams = params.extend({ analysisId: id });
  app.post<{ Params: z.infer<typeof analysisParams>; Body: z.infer<typeof correction> }>("/api/v1/projects/:projectId/semantic-analyses/:analysisId/revisions", {
    bodyLimit: 4_000_000, schema: { params: json(analysisParams), querystring: json(empty), body: json(correction), response: responses(z.strictObject({
      saveId: id, saveStatus: z.enum(["queued", "writing", "succeeded", "failed"]), replayed: z.boolean(),
      taskId: id.nullable(), analysisId: id.nullable(), error: z.strictObject({ code: id, message: z.string().max(1024) }).nullable() })) },
  }, async request => {
    const { editorSessionId, ...input } = request.body;
    return success(request, await service.correct(pageFor(request), request.params.projectId, editorSessionId, request.params.analysisId, key(request), input));
  });
  app.post<{ Params: z.infer<typeof taskParams>; Body: z.infer<typeof editor> }>("/api/v1/projects/:projectId/semantic-runs/:taskId/cancel", {
    schema: { params: json(taskParams), querystring: json(empty), body: json(editor), response: responses(semanticTaskRecord) },
  }, async request => success(request, await service.cancel(pageFor(request), request.params.projectId, request.body.editorSessionId, request.params.taskId)));
  const saveParams = params.extend({ saveId: id });
  app.post<{ Params: z.infer<typeof saveParams>; Body: z.infer<typeof editor> }>("/api/v1/projects/:projectId/semantic-saves/:saveId/retries", {
    schema: { params: json(saveParams), querystring: json(empty), body: json(editor), response: responses(z.strictObject({
      saveId: id, saveStatus: z.enum(["queued", "writing", "succeeded", "failed"]), replayed: z.boolean(),
      taskId: id.nullable(), analysisId: id.nullable(), error: z.strictObject({ code: id, message: z.string().max(1024) }).nullable() })) },
  }, async request => success(request, await service.retrySave(pageFor(request), request.params.projectId, request.body.editorSessionId,
    request.params.saveId, key(request))));
}
