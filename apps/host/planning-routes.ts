import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HostError, type PageSession } from "./sessions.ts";
import { planningConfigInput, type createPlanningConfig } from "./planning-config.ts";
import { planningProviderConfig } from "./planning-provider.ts";
import type { createPlanningService } from "./planning-service.ts";
import { agentPlanningOutput, agentPlanningStep, planningTaskRecord } from "./storage/planning-records.ts";
import { scriptHarnessProvider, scriptGoals, scriptDraft } from "./storage/script-records.ts";

export function registerPlanningRoutes(app: FastifyInstance, config: ReturnType<typeof createPlanningConfig>, service: ReturnType<typeof createPlanningService>,
  pageFor: (request: FastifyRequest) => PageSession, success: (request: FastifyRequest, data: unknown) => unknown, errorEnvelope: unknown) {
  const id = z.string().min(1).max(256), empty = z.strictObject({}), params = z.strictObject({ projectId: id });
  const json = (value: z.ZodType) => z.toJSONSchema(value, { target: "draft-7", unrepresentable: "any" });
  const responses = (value: z.ZodType) => ({ 200: json(z.strictObject({ ok: z.literal(true), data: value,
    meta: z.strictObject({ requestId: id, protocolVersion: z.literal(1) }) })), "4xx": errorEnvelope, "5xx": errorEnvelope });
  const configResponse = responses(z.strictObject({ config: planningProviderConfig.nullable(), keyConfigured: z.boolean() }));
  app.get("/api/v1/planning-provider", { schema: { querystring: json(empty), response: configResponse } }, async request => {
    pageFor(request); return success(request, await config.describe());
  });
  app.post<{ Body: z.infer<typeof planningConfigInput> }>("/api/v1/planning-provider", {
    bodyLimit: 32768, schema: { querystring: json(empty), body: json(planningConfigInput), response: configResponse },
  }, async request => { pageFor(request); return success(request, await config.save(request.body)); });
  const preview = z.strictObject({ editorSessionId: id, scriptId: id, revision: z.number().int().positive().safe() });
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof preview> }>("/api/v1/projects/:projectId/planning-previews", {
    schema: { params: json(params), querystring: json(empty), body: json(preview), response: responses(z.strictObject({ confirmationId: id,
      inputText: z.string().max(2_000_000), inputDigest: z.string().length(64), destination: z.string().max(2048), model: id, providerId: id, cost: z.literal("unknown") })) },
  }, async request => success(request, await service.preview(pageFor(request), request.params.projectId, request.body.editorSessionId, request.body.scriptId, request.body.revision)));
  const start = z.strictObject({ editorSessionId: id, confirmationId: id });
  const agentOptions = { editorSessionId: id, source: scriptHarnessProvider, maxInputBytes: planningProviderConfig.shape.maxInputBytes };
  const agentStart = z.union([
    preview.extend(agentOptions),
    z.strictObject({ ...agentOptions, sourceIds: z.array(id).min(1).max(10000), goals: scriptGoals, feedback: scriptDraft.shape.feedback }),
  ]);
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof agentStart> }>("/api/v1/projects/:projectId/agent-planning-runs", {
    schema: { params: json(params), querystring: json(empty), body: json(agentStart), response: responses(agentPlanningStep) },
  }, async request => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !key.length || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    const { editorSessionId, source, maxInputBytes, ...input } = request.body;
    return success(request, await service.prepareAgent(pageFor(request), request.params.projectId, editorSessionId,
      input, source, maxInputBytes, key));
  });
  const agentParams = params.extend({ taskId: id }), agentContext = z.strictObject({ editorSessionId: id });
  app.post<{ Params: z.infer<typeof agentParams>; Body: z.infer<typeof agentContext> }>("/api/v1/projects/:projectId/agent-planning-runs/:taskId/context", {
    schema: { params: json(agentParams), querystring: json(empty), body: json(agentContext), response: responses(agentPlanningStep) },
  }, async request => success(request, await service.inspectAgent(pageFor(request), request.params.projectId, request.body.editorSessionId, request.params.taskId)));
  const agentOutput = agentPlanningOutput.extend({ editorSessionId: id });
  app.post<{ Params: z.infer<typeof agentParams>; Body: z.infer<typeof agentOutput> }>("/api/v1/projects/:projectId/agent-planning-runs/:taskId/outputs", {
    bodyLimit: 4_000_000, schema: { params: json(agentParams), querystring: json(empty), body: json(agentOutput), response: responses(agentPlanningStep) },
  }, async request => {
    const { editorSessionId, ...output } = request.body;
    if (request.headers["idempotency-key"] !== output.inputDigest) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key must match the planning input digest.");
    return success(request, await service.submitAgent(pageFor(request), request.params.projectId, editorSessionId, request.params.taskId, output));
  });
  app.post<{ Params: { projectId: string }; Body: z.infer<typeof start> }>("/api/v1/projects/:projectId/planning-runs", {
    schema: { params: json(params), querystring: json(empty), body: json(start), response: responses(planningTaskRecord) },
  }, async request => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !key.length || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
    return success(request, await service.start(pageFor(request), request.params.projectId, request.body.editorSessionId, request.body.confirmationId, key));
  });
  app.get<{ Params: { projectId: string } }>("/api/v1/projects/:projectId/planning-runs", {
    schema: { params: json(params), querystring: json(empty), response: responses(z.strictObject({ items: z.array(planningTaskRecord) })) },
  }, async request => success(request, await service.list(pageFor(request), request.params.projectId)));
  for (const action of ["cancel", "register"] as const) app.post<{ Params: { projectId: string; taskId: string }; Body: { editorSessionId: string } }>(`/api/v1/projects/:projectId/planning-runs/:taskId/${action}`, {
    schema: { params: json(params.extend({ taskId: id })), querystring: json(empty), body: json(z.strictObject({ editorSessionId: id })), response: responses(planningTaskRecord) },
  }, async request => success(request, await (action === "cancel" ? service.cancel : service.retryRegistration)(pageFor(request),
    request.params.projectId, request.body.editorSessionId, request.params.taskId)));
}
