import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HostError, type PageSession } from "./sessions.ts";
import { visualSearchComponentIdentity, visualSearchQuery, visualSearchSource } from "./visual-search-records.ts";
import type { createVisualSearchService } from "./visual-search-service.ts";

export function registerVisualSearchRoutes(app: FastifyInstance, service: ReturnType<typeof createVisualSearchService>,
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
  const component = z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("missing"), component: z.null() }),
    z.strictObject({ state: z.literal("verified"), component: visualSearchComponentIdentity }),
  ]);
  const status = z.strictObject({ component, sceneCount: z.number().int().nonnegative().safe(),
    cache: z.strictObject({ state: z.enum(["missing", "ready"]), basisDigest: z.string().length(64).nullable(), rows: z.number().int().nonnegative().safe() }),
    running: z.boolean() });
  app.get<{ Params: z.infer<typeof params> }>("/api/v1/projects/:projectId/visual-search", {
    schema: { params: json(params), querystring: json(empty), response: responses(status) },
  }, async request => success(request, await service.status(pageFor(request), request.params.projectId)));
  const editor = z.strictObject({ editorSessionId: id });
  app.post<{ Params: z.infer<typeof params>; Body: z.infer<typeof editor> }>("/api/v1/projects/:projectId/visual-search/indexes", {
    schema: { params: json(params), querystring: json(empty), body: json(editor), response: responses(z.strictObject({
      status: z.literal("ready"), basisDigest: z.string().length(64), rows: z.number().int().positive().safe(), replayed: z.boolean() })) },
  }, async request => success(request, await service.build(pageFor(request), request.params.projectId, request.body.editorSessionId, key(request))));
  const query = visualSearchQuery.extend({ editorSessionId: id });
  app.post<{ Params: z.infer<typeof params>; Body: z.infer<typeof query> }>("/api/v1/projects/:projectId/visual-search/queries", {
    schema: { params: json(params), querystring: json(empty), body: json(query), response: responses(z.strictObject({
      query: z.string().max(2000), basisDigest: z.string().length(64), model: visualSearchComponentIdentity.shape.model,
      items: z.array(z.strictObject({ sourceId: id, score: z.number().finite(), source: visualSearchSource,
        preview: z.strictObject({ sourceTimeSeconds: z.number().finite().nonnegative() }) })).max(50),
    })) },
  }, async request => {
    const { editorSessionId: _editor, ...input } = request.body;
    return success(request, await service.query(pageFor(request), request.params.projectId, input));
  });
  app.post<{ Params: z.infer<typeof params>; Body: z.infer<typeof editor> }>("/api/v1/projects/:projectId/visual-search/cancel", {
    schema: { params: json(params), querystring: json(empty), body: json(editor), response: responses(z.strictObject({ cancelRequested: z.boolean() })) },
  }, async request => success(request, await service.cancel(pageFor(request), request.params.projectId, request.body.editorSessionId)));
}
