import { randomUUID } from "node:crypto";
import { HostError, type PageSession } from "./sessions.ts";
import type { createProjects } from "./storage/projects.ts";
import type { createPlanningConfig } from "./planning-config.ts";
import { planningRequestText, planningSystemPrompt, generatePlanningContent, planningEndpoint, planningHarnessConfig } from "./planning-provider.ts";
import { agentPlanningOutput, planningTaskRecord, type PlanningTask } from "./storage/planning-records.ts";
import { preparePlanningTask } from "./storage/planning-tasks.ts";
import { readScriptObject, listScriptSources, prepareScript, validateScriptSources } from "./storage/scripts.ts";
import { scriptRecord, scriptDraft, scriptProvider, scriptHarnessProvider, type ScriptRecord } from "./storage/script-records.ts";
import type { z } from "zod";
import { encodeId, normalizedBytes, sha256 } from "./storage/records.ts";
import { planningContext } from "./planning-context.ts";

type Projects = ReturnType<typeof createProjects>;
type Project = ReturnType<Projects["get"]>;
export function createPlanningService(projects: Projects, config: ReturnType<typeof createPlanningConfig>) {
  const grants = new Map<string, { page: string; directory: string; record: ScriptRecord; providerDigest: string; inputText: string; groups: PlanningTask["groups"]; expires: number }>();
  const active = new Map<string, { controller: AbortController; done: Promise<void> }>();
  const starting = new Map<string, { digest: string; promise: Promise<PlanningTask> }>();
  let closing = false;
  const identity = (project: Project, taskId: string) => `${project.files.directory}\0${taskId}`;
  const load = async (project: Project, taskId: string) => {
    const ref = project.commits.current()?.roots.tasks.find(ref => ref.entityId === taskId);
    if (!ref) throw new HostError("TASK_NOT_FOUND", 404, "Planning task not found.");
    return planningTaskRecord.parse(await readScriptObject(project.files, project.commits.current(), ref));
  };
  const persist = async (project: Project, task: PlanningTask) => {
    const result = await project.commits.accept({ route: "script-planning", subject: task.taskId,
      idempotencyKey: `${task.attemptId}:${task.revision}`, request: task, editorSnapshotId: null, editorSequence: null },
    preparePlanningTask(project.files, project.projectId));
    await project.commits.drain();
    const saved = project.commits.get(result.save.saveId);
    if (saved.status !== "succeeded") throw new HostError("STORAGE_IO_FAILED", 503, "The planning task state was not committed; no automatic request retry will occur.");
    return task;
  };
  const advance = (task: PlanningTask, fields: Partial<PlanningTask>): PlanningTask => ({ ...task, ...fields,
    revision: task.revision + 1, previousRef: { kind: "task", entityId: task.taskId, revision: task.revision }, updatedAt: new Date().toISOString() });
  const register = async (project: Project, task: PlanningTask) => {
    if (!task.output) throw new HostError("RESULT_NOT_READY", 409, "This task has no verified output to register.");
    const scriptId = task.taskId;
    const existing = project.commits.current()?.roots.scripts.find(ref => ref.entityId === scriptId);
    if (!existing) {
      const saved = await project.commits.accept({ route: "review-script", subject: scriptId, idempotencyKey: randomUUID(),
        request: { scriptId, expectedRevision: 0, draft: task.output, createdAt: task.createdAt, confirmDigest: null }, editorSnapshotId: null, editorSequence: null }, prepareScript(project.files, project.projectId));
      await project.commits.drain();
      if (project.commits.get(saved.save.saveId).status !== "succeeded") throw new HostError("STORAGE_IO_FAILED", 503, "The output is retained. Retry registration without generating again.");
    }
    return persist(project, advance(task, { status: "registered", scriptRef: { kind: "script", entityId: scriptId, revision: 1 } }));
  };
  const saveOutput = async (project: Project, task: PlanningTask, result: { content: ScriptRecord["draft"]["content"]; remoteId: string | null }) => {
    const { maxInputBytes: _bytes, timeoutSeconds: _timeout, ...metadata } = task.provider;
    const source = "maxOutputTokens" in metadata ? (({ maxOutputTokens: _tokens, ...rest }) => rest)(metadata) : metadata;
    const output = { ...task.basis, content: result.content, provider: scriptProvider.parse(source) };
    await validateScriptSources(project.files, project.commits.current(), output);
    const next = advance(task, { status: "output_ready", output, remoteId: result.remoteId });
    await project.files.mkdir("staging/planning");
    await project.files.writeJson(`staging/planning/${encodeId(task.taskId)}.json`, next);
    return persist(project, next);
  };
  const mergeInput = (task: PlanningTask) => normalizedBytes(JSON.parse(planningRequestText({ goals: task.basis.goals, feedback: task.basis.feedback,
    groups: task.groups.map(group => ({ ...group.output!, segments: group.output!.segments.map(({ originalText: _originalText, ...segment }) => segment) })) }))).toString("utf8");
  const agentStep = (task: PlanningTask) => {
    const source = scriptHarnessProvider.parse((( { maxInputBytes: _bytes, timeoutSeconds: _timeout, ...value }) => value)(task.provider));
    if (task.output) return { taskId: task.taskId, status: task.status, source, scriptRef: task.scriptRef, next: null };
    const index = task.groups.findIndex(group => !group.output);
    const inputText = index >= 0 ? task.groups[index].inputText : task.groups.length === 1 ? task.groups[0].inputText : mergeInput(task);
    if (Buffer.byteLength(inputText) > task.provider.maxInputBytes) throw new HostError("RESOURCE_LIMIT_EXCEEDED", 400, "Completed groups are retained, but the merge exceeds the input limit.");
    return { taskId: task.taskId, status: task.status, source, scriptRef: task.scriptRef,
      next: { groupIndex: index >= 0 ? index : task.groups.length === 1 ? 0 : null, inputText, inputDigest: sha256(Buffer.from(inputText)),
        instructions: planningSystemPrompt + (index < 0 && task.groups.length > 1 ? " Merge the supplied groups. Emit empty originalText in sourceSpeech; the host restores exact words from source IDs." : "") } };
  };
  const execute = async (project: Project, task: PlanningTask, key: string, controller: AbortController) => {
    const provider = task.provider;
    if ("kind" in provider) throw new HostError("INVALID_ARGUMENT", 400, "Agent planning is executed by the connected Agent.");
    const generate = (input: string, merge = false) => generatePlanningContent(provider, key, input, controller.signal, merge);
    try {
      for (let index = 0; index < task.groups.length; index++) {
        if (task.groups[index].output) continue;
        task = await persist(project, advance(task, { status: "dispatched", activeGroup: index }));
        const group = task.groups[index];
        const result = await generate(group.inputText);
        const sourceIds = new Set(JSON.parse(group.inputText).input.sources.map((source: { sourceId: string }) => source.sourceId));
        await validateScriptSources(project.files, project.commits.current(), { ...task.basis,
          sources: task.basis.sources.filter(source => sourceIds.has(source.sourceId)), content: result.content });
        const groups = structuredClone(task.groups); groups[index] = { ...group, output: result.content, remoteId: result.remoteId };
        task = await persist(project, advance(task, { status: "prepared", groups, activeGroup: null }));
      }
      let result = { content: task.groups[0].output!, remoteId: task.groups[0].remoteId! };
      if (task.groups.length > 1) {
        const mergeText = mergeInput(task);
        if (Buffer.byteLength(mergeText) > task.provider.maxInputBytes) throw new HostError("RESOURCE_LIMIT_EXCEEDED", 400, "Classified groups are retained, but the merge exceeds the configured input limit. Reduce the source selection or increase the limit.");
        task = await persist(project, advance(task, { status: "dispatched", activeGroup: null }));
        result = await generate(mergeText, true);
        for (const segment of result.content.segments) if (segment.kind === "sourceSpeech") {
          if (segment.originalText !== "") throw new HostError("PROVIDER_OUTPUT_INVALID", 502, "The merge supplied unsupported original words.");
          segment.originalText = segment.sourceIds.map(id => task.basis.sources.find(source => source.sourceId === id)?.originalText ?? "").join("\n");
        }
      }
      task = await saveOutput(project, task, result);
      await register(project, task);
    } catch (error) {
      if (task.status === "dispatched" || task.status === "prepared") {
        const code = error instanceof HostError ? error.code : "PROVIDER_OUTCOME_UNKNOWN";
        await persist(project, advance(task, { status: task.status === "prepared" || ["PROVIDER_OUTPUT_INVALID", "REFERENCE_INVALID", "REFERENCE_STALE"].includes(code) ? "failed" : "remote_unknown",
          error: code })).catch(() => {});
      }
    }
  };
  const write = (page: PageSession, projectId: string, editorSessionId: string) => {
    if (closing) throw new HostError("TASKS_DRAINING", 409, "Planning is stopping.");
    projects.editors.requireWrite(page, editorSessionId, projectId);
    return projects.get(page, projectId);
  };
  return {
    async prepareAgent(page: PageSession, projectId: string, editorSessionId: string,
      input: { scriptId: string; revision: number } | { sourceIds: string[]; goals: ScriptRecord["draft"]["goals"]; feedback: string },
      source: z.infer<typeof scriptHarnessProvider>, maxInputBytes: number, idempotencyKey: string) {
      const project = write(page, projectId, editorSessionId), taskId = encodeId(`${page.pageSessionId}:${idempotencyKey}`);
      const provider = planningHarnessConfig.parse({ ...source, maxInputBytes, timeoutSeconds: 600 });
      const id = identity(project, taskId), requestDigest = config.digest({ ...input, provider });
      const pending = starting.get(id);
      if (pending) {
        if (pending.digest !== requestDigest) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This request key belongs to another Harness generation.");
        return agentStep(await pending.promise);
      }
      const begin = async () => {
        if (project.commits.current()?.roots.tasks.some(ref => ref.entityId === taskId)) {
          const task = await load(project, taskId);
          if (task.requestDigest !== requestDigest) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This request key belongs to another generation.");
          return task;
        }
          const current = write(page, projectId, editorSessionId).commits.current();
          let basis: ScriptRecord["draft"];
          if ("scriptId" in input) {
            const ref = current?.roots.scripts.find(ref => ref.entityId === input.scriptId && ref.revision === input.revision);
            if (!ref) throw new HostError("REVISION_CONFLICT", 409, "Save the current draft before generating a script.");
            basis = scriptRecord.parse(await readScriptObject(project.files, current, ref)).draft;
          } else {
            const available = new Map((await listScriptSources(project.files, current)).map(source => [source.sourceId, source]));
            if (new Set(input.sourceIds).size !== input.sourceIds.length || input.sourceIds.some(id => !available.has(id))) {
              throw new HostError("REFERENCE_STALE", 409, "Selected sources changed; inspect the available sources again.");
            }
            const sources = input.sourceIds.map(id => available.get(id)!);
            basis = scriptDraft.parse({ goals: input.goals, feedback: input.feedback, sources, provider: null,
              content: { title: "脚本草稿", theme: input.goals.theme, rationale: "", suggestions: [], candidates: [], gaps: [],
                classifications: sources.map(source => ({ sourceId: source.sourceId, themes: [], tags: source.labels, included: true, note: "" })),
                segments: sources.map((source, index) => ({ segmentId: `source-${index}`, sourceIds: [source.sourceId],
                  kind: source.capability === "speech" ? "sourceSpeech" : source.kind === "audio" ? "narration" : "visual",
                  originalText: source.capability === "speech" ? source.originalText : "",
                  editedText: source.capability === "speech" ? source.originalText : "", visualSuggestion: source.visualNotes,
                  estimatedDurationSeconds: source.range.sourceEndSeconds - source.range.sourceStartSeconds, included: true })) } });
          }
          await validateScriptSources(project.files, current, basis, true);
          const { inputText, groups }: { inputText: string; groups: PlanningTask["groups"] } = planningContext(basis, provider.maxInputBytes);
          for (const ref of source.providerId !== "unknown" && source.model !== "unknown" ? current?.roots.tasks ?? [] : []) {
            const previous = planningTaskRecord.safeParse(await readScriptObject(project.files, current, ref));
            if (!previous.success || config.digest(previous.data.provider) !== config.digest(provider)) continue;
            for (const group of groups) {
              const cached = previous.data.groups.find(value => value.digest === group.digest && value.output);
              if (cached) { group.output = cached.output; group.remoteId = cached.remoteId; }
            }
          }
          const now = new Date().toISOString();
          const task = await persist(project, planningTaskRecord.parse({ schemaVersion: 1, format: "script-planning-task", projectId,
            taskId, revision: 1, previousRef: null, attemptId: randomUUID(), status: "prepared", provider, requestDigest,
            inputDigest: sha256(Buffer.from(inputText)), inputText, groups, activeGroup: null, basis,
            output: null, remoteId: null, scriptRef: null, error: "", createdAt: now, updatedAt: now }));
          if (groups.length === 1 && groups[0].output) return register(project, await saveOutput(project, task, { content: groups[0].output, remoteId: groups[0].remoteId }));
          return task;
      };
      const promise = begin().finally(() => starting.delete(id));
      starting.set(id, { digest: requestDigest, promise });
      return agentStep(await promise);
    },
    async inspectAgent(page: PageSession, projectId: string, editorSessionId: string, taskId: string) {
      const project = write(page, projectId, editorSessionId), task = await load(project, taskId);
      if (!task.output) await validateScriptSources(project.files, project.commits.current(), task.basis, true);
      return agentStep(task);
    },
    async submitAgent(page: PageSession, projectId: string, editorSessionId: string, taskId: string, input: z.infer<typeof agentPlanningOutput>) {
      const project = write(page, projectId, editorSessionId), id = identity(project, taskId), digest = config.digest(input);
      const pending = starting.get(id);
      if (pending) {
        if (pending.digest !== digest) throw new HostError("RESOURCE_BUSY", 409, "Another output is being saved for this task.");
        return agentStep(await pending.promise);
      }
      const submit = async () => {
        let task = await load(project, taskId);
        if (!("kind" in task.provider)) throw new HostError("INVALID_ARGUMENT", 400, "This is not an Agent planning task.");
        const group = input.groupIndex === null ? null : task.groups[input.groupIndex];
        if (input.groupIndex !== null && !group) throw new HostError("INVALID_ARGUMENT", 400, "Unknown planning group.");
        if (input.groupIndex === null && (task.groups.length < 2 || task.groups.some(group => !group.output))) {
          throw new HostError("REFERENCE_STALE", 409, "Complete the planning groups before submitting the merge.");
        }
        const inputText = group ? group.inputText : mergeInput(task);
        if (input.inputDigest !== sha256(Buffer.from(inputText))) throw new HostError("REFERENCE_STALE", 409, "The output belongs to a different planning input.");
        const content = structuredClone(input.content);
        if (!group) for (const segment of content.segments) if (segment.kind === "sourceSpeech") {
          if (segment.originalText !== "") throw new HostError("PROVIDER_OUTPUT_INVALID", 400, "The merge must leave original words for the host to restore.");
          segment.originalText = segment.sourceIds.map(id => task.basis.sources.find(source => source.sourceId === id)?.originalText ?? "").join("\n");
        }
        const saved = group?.output ?? (!group ? task.output?.content : null);
        if (saved && config.digest(saved) !== config.digest(content)) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This planning input already has a different saved output.");
        if (task.output) return task.status === "registered" ? task : register(project, task);
        await validateScriptSources(project.files, project.commits.current(), task.basis, true);
        if (group) {
          if (!group.output) {
            if (task.groups.findIndex(value => !value.output) !== input.groupIndex) throw new HostError("REFERENCE_STALE", 409, "Submit the current planning group first.");
            const sourceIds = new Set(JSON.parse(group.inputText).input.sources.map((source: { sourceId: string }) => source.sourceId));
            await validateScriptSources(project.files, project.commits.current(), { ...task.basis,
              sources: task.basis.sources.filter(source => sourceIds.has(source.sourceId)), content });
            const groups = structuredClone(task.groups);
            groups[input.groupIndex!] = { ...group, output: content, remoteId: input.remoteId };
            task = await persist(project, advance(task, { groups }));
          }
          if (task.groups.length > 1) return task;
        }
        return register(project, await saveOutput(project, task, { content, remoteId: input.remoteId }));
      };
      const promise = submit().finally(() => starting.delete(id));
      starting.set(id, { digest, promise });
      return agentStep(await promise);
    },
    async preview(page: PageSession, projectId: string, editorSessionId: string, scriptId: string, revision: number) {
      const project = write(page, projectId, editorSessionId), current = project.commits.current();
      const ref = current?.roots.scripts.find(ref => ref.entityId === scriptId && ref.revision === revision);
      if (!ref) throw new HostError("REVISION_CONFLICT", 409, "Save the current draft before reviewing an outgoing request.");
      const record = scriptRecord.parse(await readScriptObject(project.files, current, ref));
      await validateScriptSources(project.files, current, record.draft, true);
      const provider = (await config.get()).config;
      const { inputText, groups } = planningContext(record.draft, provider.maxInputBytes);
      for (const [id, item] of grants) if (item.expires <= Date.now()) grants.delete(id);
      if (grants.size >= 128) throw new HostError("RESOURCE_BUSY", 429, "Too many pending outgoing previews.");
      const confirmationId = randomUUID();
      grants.set(confirmationId, { page: page.pageSessionId, directory: project.files.directory, record,
        providerDigest: config.digest(provider), inputText, groups, expires: Math.min(Date.now() + 300_000, Date.parse(page.expiresAt)) });
      return { confirmationId, inputText, inputDigest: sha256(Buffer.from(inputText)), destination: planningEndpoint(provider),
        model: provider.model, providerId: provider.providerId, cost: "unknown" as const };
    },
    async start(page: PageSession, projectId: string, editorSessionId: string, confirmationId: string, idempotencyKey: string) {
      const project = write(page, projectId, editorSessionId), taskId = encodeId(`${page.pageSessionId}:${idempotencyKey}`);
      const old = project.commits.current()?.roots.tasks.find(ref => ref.entityId === taskId);
      const requestDigest = sha256(Buffer.from(confirmationId));
      if (old) {
        const task = await load(project, taskId);
        if (task.requestDigest !== requestDigest) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This request key belongs to another outgoing confirmation.");
        return task;
      }
      const grant = grants.get(confirmationId), provider = await config.get();
      if (!grant || grant.page !== page.pageSessionId || grant.directory !== project.files.directory || grant.expires <= Date.now() ||
          grant.providerDigest !== config.digest(provider.config) || !project.commits.current()?.roots.scripts.some(ref =>
            ref.entityId === grant.record.scriptId && ref.revision === grant.record.revision)) {
        throw new HostError("USER_CONFIRMATION_REQUIRED", 403, "Review and confirm the exact destination, model and outgoing text again.");
      }
      await validateScriptSources(project.files, project.commits.current(), grant.record.draft, true);
      if (grants.get(confirmationId) !== grant) throw new HostError("USER_CONFIRMATION_REQUIRED", 403, "The outgoing confirmation was already used.");
      grants.delete(confirmationId);
      const secret = await config.key(provider.credentialIdentity);
      const groups = structuredClone(grant.groups);
      for (const ref of project.commits.current()?.roots.tasks ?? []) {
        const previous = planningTaskRecord.safeParse(await readScriptObject(project.files, project.commits.current(), ref));
        if (!previous.success || config.digest(previous.data.provider) !== config.digest(provider.config)) continue;
        for (const group of groups) {
          const cached = previous.data.groups.find(value => value.digest === group.digest && value.output);
          if (cached) { group.output = cached.output; group.remoteId = cached.remoteId; }
        }
      }
      const now = new Date().toISOString();
      const task = await persist(project, planningTaskRecord.parse({ schemaVersion: 1, format: "script-planning-task", projectId,
        taskId, revision: 1, previousRef: null, attemptId: randomUUID(), status: "prepared", provider: provider.config,
        requestDigest, inputDigest: sha256(Buffer.from(grant.inputText)), inputText: grant.inputText, groups, activeGroup: null, basis: grant.record.draft,
        output: null, remoteId: null, scriptRef: null, error: "", createdAt: now, updatedAt: now }));
      const controller = new AbortController(), id = identity(project, taskId);
      const done = execute(project, task, secret, controller).finally(() => active.delete(id));
      active.set(id, { controller, done });
      return task;
    },
    async list(page: PageSession, projectId: string) {
      const project = projects.get(page, projectId), items: PlanningTask[] = [];
      for (const ref of project.commits.current()?.roots.tasks ?? []) {
        const value = planningTaskRecord.safeParse(await readScriptObject(project.files, project.commits.current(), ref));
        if (value.success) items.push(value.data.status === "dispatched" && !active.has(identity(project, value.data.taskId)) ?
          { ...value.data, status: "remote_unknown" } : value.data);
      }
      return { items };
    },
    async cancel(page: PageSession, projectId: string, editorSessionId: string, taskId: string) {
      const project = write(page, projectId, editorSessionId);
      const running = active.get(identity(project, taskId));
      running?.controller.abort();
      if (running) await running.done;
      return load(project, taskId);
    },
    async retryRegistration(page: PageSession, projectId: string, editorSessionId: string, taskId: string) {
      const project = write(page, projectId, editorSessionId);
      if (active.has(identity(project, taskId)) || starting.has(identity(project, taskId))) throw new HostError("RESOURCE_BUSY", 409, "The task is still running.");
      let task = await load(project, taskId);
      if (task.status === "registered") return task;
      if (!task.output) {
        const staged = planningTaskRecord.parse(JSON.parse((await project.files.read(`staging/planning/${encodeId(taskId)}.json`)).toString("utf8")));
        if (staged.taskId !== taskId || staged.attemptId !== task.attemptId || staged.inputDigest !== task.inputDigest || !staged.output) throw new HostError("REFERENCE_INVALID", 409, "The retained output identity differs.");
        task = await persist(project, advance(task, { status: "output_ready", output: staged.output, remoteId: staged.remoteId }));
      }
      return register(project, task);
    },
    busy: () => active.size > 0 || starting.size > 0,
    async close() {
      closing = true; grants.clear();
      await Promise.allSettled([...starting.values()].map(value => value.promise));
      for (const value of active.values()) value.controller.abort();
      await Promise.allSettled([...active.values()].map(value => value.done));
    },
  };
}
