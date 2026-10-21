import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HostError, type PageSession } from "./sessions.ts";
import type { createProjects } from "./storage/projects.ts";
import { executionContent, executionRecord, executionDigest, prepareExecutionPlan, validateExecutionBasis, type ExecutionRecord } from "./storage/execution-plans.ts";
import { readScriptObject } from "./storage/scripts.ts";
import { normalizedBytes, sha256 } from "./storage/records.ts";
import { WEB_MCP_OPERATION_SCHEMA } from "../../src/lib/webMcpOperationSchema.js";
import { WEB_MCP_AI_REQUEST_SCHEMA } from "../../src/lib/webMcpAiJobs.js";

export function registerExecutionRoutes(app: FastifyInstance, projects: ReturnType<typeof createProjects>,
  pageFor: (request: FastifyRequest) => PageSession, success: (request: FastifyRequest, data: unknown) => unknown, errorEnvelope: unknown) {
  const id = z.string().min(1).max(256), empty = z.strictObject({}), params = z.strictObject({ projectId: id });
  const planParams = params.extend({ planId: id });
  // Reuse the editor's public parameter schemas at the HTTP boundary. Zod owns
  // persisted envelopes; the editor owns operation and inference parameters.
  const json = (schema: z.ZodType) => JSON.parse(JSON.stringify(z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" })), (key, value) => {
    if (key === "operations" && value?.type === "array") return { ...value, items: WEB_MCP_OPERATION_SCHEMA };
    if (key === "request" && value?.anyOf) return { anyOf: [WEB_MCP_AI_REQUEST_SCHEMA, { type: "null" }] };
    if (key === "propertyNames") return undefined;
    return value;
  });
  const responses = (schema: z.ZodType) => ({ 200: json(z.strictObject({ ok: z.literal(true), data: schema,
    meta: z.strictObject({ requestId: id, protocolVersion: z.literal(1) }) })), "4xx": errorEnvelope, "5xx": errorEnvelope });
  const leases = new Map<string, { page: string; directory: string; expires: number }>();
  const confirmations = new Map<string, { purpose: string; page: string; directory: string; planId: string; revision: number; digest: string; expires: number }>();
  const find = async (page: PageSession, projectId: string, planId: string) => {
    const project = projects.get(page, projectId), current = project.commits.current();
    const ref = current?.roots.plans.find(item => item.entityId === planId);
    if (!ref) throw new HostError("PLAN_NOT_FOUND", 404, "Execution plan not found.");
    return { project, record: executionRecord.parse(await readScriptObject(project.files, current, ref)) };
  };
  const currentExecutor = (attemptId: string, page: PageSession, directory: string) => {
    const lease = leases.get(attemptId);
    return Boolean(lease && lease.page === page.pageSessionId && lease.directory === directory && lease.expires > Date.now());
  };
  const view = (record: ExecutionRecord, page: PageSession, directory: string) => ({ ...record,
    attempts: record.attempts.map(attempt => (["running", "cancel_requested"].includes(attempt.status) && !currentExecutor(attempt.attemptId, page, directory))
      ? { ...attempt, status: "interrupted" as const, error: "Browser executor is no longer available." } : attempt) });
  app.get<{ Params: { projectId: string } }>("/api/v1/projects/:projectId/plans", {
    schema: { params: json(params), querystring: json(empty), response: responses(z.strictObject({ items: z.array(executionRecord) })) },
  }, async request => {
    const page = pageFor(request), project = projects.get(page, request.params.projectId), current = project.commits.current();
    const items = await Promise.all((current?.roots.plans ?? []).map(async ref => view(executionRecord.parse(
      await readScriptObject(project.files, current, ref)), page, project.files.directory)));
    return success(request, { items });
  });
  app.get<{ Params: { projectId: string; planId: string } }>("/api/v1/projects/:projectId/plans/:planId", {
    schema: { params: json(planParams), querystring: json(empty), response: responses(executionRecord) },
  }, async request => {
    const page = pageFor(request), { project, record } = await find(page, request.params.projectId, request.params.planId);
    return success(request, view(record, page, project.files.directory));
  });
  const base = z.strictObject({ editorSessionId: id, expectedRevision: z.number().int().nonnegative().safe() });
  const create = base.extend({ planId: id, content: executionContent });
  const authorize = base.extend({ confirmationId: id });
  const step = base.extend({ stepId: id });
  const heartbeat = base.extend({ attemptId: id });
  const complete = heartbeat.extend({ status: z.enum(["succeeded", "failed", "cancelled", "remote_status_unknown", "registration_pending"]),
    operations: executionRecord.shape.attempts.element.shape.operations,
    resultRefs: executionRecord.shape.attempts.element.shape.resultRefs, error: z.string().max(2000).nullable() });
  const previewBody = base.extend(executionRecord.shape.proposal.unwrap().shape);
  const application = base.extend({ ...executionRecord.shape.application.unwrap().shape, confirmationId: id });
  const response = z.strictObject({ record: executionRecord, saveId: id, saveStatus: z.enum(["queued", "writing", "failed", "succeeded"]) });
  const actions = { revisions: create, authorizations: authorize, validations: base, claims: step, heartbeats: heartbeat,
    completions: complete, "cancel-requests": heartbeat, "preview-receipts": previewBody, "application-receipts": application } as const;
  const confirmationBody = base.extend({ digest: z.string().length(64) });
  for (const purpose of ["processing", "application"]) app.post<{ Params: { projectId: string; planId: string }; Body: z.infer<typeof confirmationBody> }>(
    `/api/v1/projects/:projectId/plans/:planId/${purpose === "processing" ? "confirmations" : "application-confirmations"}`, {
      schema: { params: json(planParams), querystring: json(empty), body: json(confirmationBody), response: responses(z.strictObject({ confirmationId: id })) },
    }, async request => {
      const page = pageFor(request), { project, record } = await find(page, request.params.projectId, request.params.planId);
      projects.editors.requireWrite(page, request.body.editorSessionId, request.params.projectId);
      const expectedDigest = purpose === "processing" ? record.digest : record.proposal?.previewDigest;
      if (record.revision !== request.body.expectedRevision || expectedDigest !== request.body.digest) throw new HostError("REVISION_CONFLICT", 409, "Review the current plan first.");
      await validateExecutionBasis(project.files, project.commits.current(), record.content);
      for (const [key, value] of confirmations) if (value.expires <= Date.now()) confirmations.delete(key);
      if (confirmations.size >= 128) throw new HostError("RESOURCE_BUSY", 429, "Too many pending confirmations.");
      const confirmationId = randomUUID();
      confirmations.set(confirmationId, { purpose, page: page.pageSessionId, directory: project.files.directory, planId: record.planId,
        revision: record.revision, digest: request.body.digest, expires: Math.min(Date.now() + 60_000, Date.parse(page.expiresAt)) });
      return success(request, { confirmationId });
    });
  for (const action of ["create", ...Object.keys(actions)] as const) {
    const bodySchema = action === "create" ? create : actions[action as keyof typeof actions];
    app.post<{ Params: { projectId: string; planId?: string }; Body: z.infer<typeof create> & z.infer<typeof authorize> & z.infer<typeof step> & z.infer<typeof complete> & z.infer<typeof application> & z.infer<typeof previewBody> }>(
      action === "create" ? "/api/v1/projects/:projectId/plans" : `/api/v1/projects/:projectId/plans/:planId/${action}`, {
        bodyLimit: 8 * 1024 * 1024,
        schema: { params: json(action === "create" ? params : planParams), querystring: json(empty), body: json(bodySchema), response: responses(response) },
      }, async request => {
        const page = pageFor(request), input = request.body, projectId = request.params.projectId;
        projects.editors.requireWrite(page, input.editorSessionId, projectId);
        const project = projects.get(page, projectId), planId = request.params.planId ?? input.planId;
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || !key.length || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
        const { editorSessionId: _editor, ...command } = input;
        const commandDigest = sha256(normalizedBytes({ action, command }));
        const previousSave = project.commits.requests().find(save => save.route === "execution-plan" && save.subject === planId && save.idempotencyKey === key);
        if (previousSave) {
          const record = executionRecord.parse(previousSave.request);
          if (record.commandDigest !== commandDigest) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "The request content changed.");
          await project.commits.drain();
          return success(request, { record: view(record, page, project.files.directory), saveId: previousSave.saveId, saveStatus: project.commits.get(previousSave.saveId).status });
        }
        let record: ExecutionRecord;
        if (action === "create") {
          if (input.expectedRevision !== 0) throw new HostError("REVISION_CONFLICT", 409, "Creation requires revision zero.");
          await validateExecutionBasis(project.files, project.commits.current(), input.content);
          record = { schemaVersion: 1, format: "execution-plan", projectId, planId, revision: 1, previousRef: null,
            content: input.content, digest: executionDigest(input.content), commandDigest, createdAt: new Date().toISOString(),
            authorization: null, attempts: [], proposal: null, application: null };
        } else {
          const found = await find(page, projectId, planId), old = found.record;
          if (old.revision !== input.expectedRevision) throw new HostError("REVISION_CONFLICT", 409, "Execution plan changed.");
          record = structuredClone(old);
          record.previousRef = { kind: "plan", entityId: planId, revision: old.revision }; record.revision++; record.commandDigest = commandDigest;
          if (action === "validations") {
            await validateExecutionBasis(project.files, project.commits.current(), old.content);
            return success(request, { record: old, saveId: project.commits.current()!.saveId, saveStatus: "succeeded" });
          } else if (action === "revisions") {
            if (input.planId !== planId || old.attempts.some(attempt => currentExecutor(attempt.attemptId, page, project.files.directory) && ["running", "cancel_requested"].includes(attempt.status))) {
              throw new HostError("RESOURCE_BUSY", 409, "Stop active processing before revising the plan.");
            }
            await validateExecutionBasis(project.files, project.commits.current(), input.content);
            record.content = input.content; record.digest = executionDigest(input.content); record.authorization = null; record.attempts = []; record.proposal = null; record.application = null;
          } else if (action === "authorizations") {
            const confirmation = confirmations.get(input.confirmationId);
            if (!confirmation || confirmation.purpose !== "processing" || confirmation.page !== page.pageSessionId || confirmation.directory !== project.files.directory ||
                confirmation.planId !== planId || confirmation.revision !== old.revision || confirmation.digest !== old.digest || confirmation.expires <= Date.now()) {
              throw new HostError("USER_CONFIRMATION_REQUIRED", 403, "Directly authorize this exact processing plan.");
            }
            await validateExecutionBasis(project.files, project.commits.current(), record.content);
            confirmations.delete(input.confirmationId);
            record.authorization = { authorizationId: randomUUID(), digest: record.digest, at: new Date().toISOString(), expiresAt: page.expiresAt };
          } else if (action === "claims") {
            await validateExecutionBasis(project.files, project.commits.current(), record.content);
            if (record.authorization?.digest !== record.digest || Date.parse(record.authorization.expiresAt) <= Date.now() || record.application) throw new HostError("USER_CONFIRMATION_REQUIRED", 403, "Authorize the current plan before processing.");
            const target = record.content.steps.find(value => value.stepId === input.stepId);
            const latest = (stepId: string) => record.attempts.findLast(value => value.stepId === stepId);
            if (!target || target.dependsOn.some(id => latest(id)?.status !== "succeeded")) throw new HostError("DEPENDENCY_NOT_READY", 409, "A dependency has not succeeded.");
            const prior = latest(input.stepId);
            if (prior && ["succeeded", "remote_status_unknown", "registration_pending"].includes(prior.status) || (prior && currentExecutor(prior.attemptId, page, project.files.directory) && ["running", "cancel_requested"].includes(prior.status))) {
              throw new HostError("RESOURCE_BUSY", 409, "This step cannot be resubmitted.");
            }
            if (prior && ["running", "cancel_requested"].includes(prior.status)) { prior.status = "interrupted"; prior.finishedAt = new Date().toISOString(); }
            record.attempts.push({ attemptId: randomUUID(), stepId: input.stepId, status: "running", startedAt: new Date().toISOString(), finishedAt: null,
              operations: [], resultRefs: [], error: null });
          } else if (action === "preview-receipts" || action === "application-receipts") {
            await validateExecutionBasis(project.files, project.commits.current(), record.content);
            if (record.application || input.stepIds.some(id => record.attempts.findLast(attempt => attempt.stepId === id)?.status !== "succeeded") ||
                new Set(input.stepIds).size !== input.stepIds.length) throw new HostError("REVISION_CONFLICT", 409, "Review completed results before application.");
            if (action === "preview-receipts") {
              record.proposal = { proposalId: input.proposalId, previewId: input.previewId, previewDigest: input.previewDigest,
                stateToken: input.stateToken, stepIds: input.stepIds, at: input.at };
            } else {
              const confirmation = confirmations.get(input.confirmationId);
              if (!record.proposal || record.proposal.previewId !== input.previewId || JSON.stringify(record.proposal.stepIds) !== JSON.stringify(input.stepIds) ||
                  !confirmation || confirmation.purpose !== "application" || confirmation.page !== page.pageSessionId || confirmation.directory !== project.files.directory ||
                  confirmation.planId !== planId || confirmation.revision !== old.revision || confirmation.digest !== record.proposal.previewDigest || confirmation.expires <= Date.now()) {
                throw new HostError("USER_CONFIRMATION_REQUIRED", 403, "Confirm the exact visible result before application.");
              }
              confirmations.delete(input.confirmationId);
              record.application = { previewId: input.previewId, transactionId: input.transactionId, stateToken: input.stateToken, stepIds: input.stepIds, at: input.at };
            }
          } else {
            const target = record.attempts.find(attempt => attempt.attemptId === input.attemptId);
            const lease = target && leases.get(target.attemptId);
            const pendingRegistration = target?.status === "registration_pending" && lease?.page === page.pageSessionId && lease?.directory === project.files.directory;
            if (!target || (!currentExecutor(target.attemptId, page, project.files.directory) && !pendingRegistration) || !["running", "cancel_requested", "registration_pending"].includes(target.status)) {
              throw new HostError("EXECUTOR_INTERRUPTED", 409, "This browser no longer owns the attempt.");
            }
            if (action === "heartbeats") {
              leases.get(target.attemptId)!.expires = Date.now() + 45_000;
              return success(request, { record: old, saveId: project.commits.current()!.saveId, saveStatus: "succeeded" });
            }
            if (action === "cancel-requests") target.status = "cancel_requested";
            else {
              target.status = input.status; target.operations = input.operations; target.resultRefs = input.resultRefs;
              target.error = input.error; target.finishedAt = new Date().toISOString();
            }
          }
        }
        const accepted = await project.commits.accept({ route: "execution-plan", subject: planId, idempotencyKey: key,
          request: executionRecord.parse(record), editorSnapshotId: null, editorSequence: null }, prepareExecutionPlan(project.files, projectId),
        () => projects.editors.requireWrite(page, input.editorSessionId, projectId));
        await project.commits.drain();
        const saved = project.commits.get(accepted.save.saveId);
        if (saved.status === "succeeded" && action === "claims") {
          const attempt = record.attempts.at(-1)!;
          leases.set(attempt.attemptId, { page: page.pageSessionId, directory: project.files.directory, expires: Date.now() + 45_000 });
        }
        return success(request, { record: view(record, page, project.files.directory), saveId: saved.saveId, saveStatus: saved.status });
      });
  }
}
