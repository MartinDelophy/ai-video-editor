import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HostError, type PageSession } from "./sessions.ts";
import type { createProjects } from "./storage/projects.ts";
import { analysisRecord, rawAnalysisRecord } from "./storage/analysis-records.ts";
import { readAnalysisObject } from "./storage/analyses.ts";
import { semanticCorrectionInput, semanticSave, listSemanticAnalyses, prepareSemanticAnalysis, type SemanticSave } from "./storage/semantic-analyses.ts";
import { agentSemanticOutput, buildSemanticOutput, correctedSemanticRecord, rawSemanticRecord, semanticContent,
  semanticRecord, semanticResultRecord, semanticTaskRecord, type SemanticTask } from "./storage/semantic-records.ts";
import { loadSemanticSource } from "./storage/semantic-source.ts";
import { encodeId, normalizedBytes, referenceKey, sha256, type Save } from "./storage/records.ts";
import { planningHarnessConfig } from "./planning-provider.ts";
import { scriptHarnessProvider } from "./storage/script-records.ts";
import { createSemanticGroups, semanticMergeInput, semanticSystemPrompt, validateSemanticWindow } from "./semantic-context.ts";

type Projects = ReturnType<typeof createProjects>;
type Project = ReturnType<Projects["get"]>;
const id = z.string().min(1).max(256);
export const semanticStart = z.strictObject({ analysisId: id, revision: z.number().int().positive().safe(),
  source: scriptHarnessProvider, maxInputBytes: planningHarnessConfig.shape.maxInputBytes });

export function createSemanticService(projects: Projects) {
  const pending = new Map<string, { digest: string; promise: Promise<SemanticTask> }>();
  let closing = false;
  const identity = (project: Project, taskId: string) => `${project.files.directory}\0${taskId}`;
  const digest = (value: unknown) => sha256(normalizedBytes(value));
  const write = (page: PageSession, projectId: string, editorSessionId: string) => {
    if (closing) throw new HostError("TASKS_DRAINING", 409, "Semantic analysis is stopping.");
    projects.editors.requireWrite(page, editorSessionId, projectId);
    return projects.get(page, projectId);
  };
  const load = async (project: Project, taskId: string) => {
    const ref = project.commits.current()?.roots.tasks.find(item => item.entityId === taskId);
    if (!ref) throw new HostError("TASK_NOT_FOUND", 404, "Semantic analysis task not found.");
    return semanticTaskRecord.parse(await readAnalysisObject(project.files, project.commits.current(), ref));
  };
  const receipt = (save: Save, replayed: boolean) => {
    const parsed = semanticSave.safeParse(save.request);
    return { saveId: save.saveId, saveStatus: save.status, replayed,
      taskId: parsed.success && parsed.data.action === "task" ? parsed.data.task.taskId : null,
      analysisId: parsed.success && parsed.data.action === "correct" ? parsed.data.analysis.analysisId : null,
      error: save.error ?? null };
  };
  const internalKey = (project: Project, task: SemanticTask) => {
    const failed = project.commits.requests().filter(save => save.route === "semantic-analysis" && save.subject === task.taskId && save.status === "failed")
      .sort((a, b) => b.requestSequence - a.requestSequence)[0];
    return `${task.attemptId}:${task.revision}${failed ? `:retry:${failed.saveId}` : ""}`;
  };
  const saveTask = async (project: Project, task: SemanticTask, analysis: z.infer<typeof rawSemanticRecord> | null = null,
    result: z.infer<typeof semanticResultRecord> | null = null) => {
    const request: SemanticSave = { action: "task", operation: { revision: task.revision }, task, analysis, result };
    const accepted = await project.commits.accept({ route: "semantic-analysis", subject: task.taskId,
      idempotencyKey: internalKey(project, task), request, editorSnapshotId: null, editorSequence: null },
    prepareSemanticAnalysis(project.files, project.projectId));
    await project.commits.drain();
    const saved = project.commits.get(accepted.save.saveId);
    if (saved.status !== "succeeded") throw new HostError("STORAGE_IO_FAILED", 503, "The semantic output is retained; retry the same Agent submission without generating again.");
    return task;
  };
  const advance = (task: SemanticTask, fields: Partial<SemanticTask>): SemanticTask => ({ ...task, ...fields,
    revision: task.revision + 1, previousRef: { kind: "task", entityId: task.taskId, revision: task.revision }, updatedAt: new Date().toISOString() });
  const validateCurrentSource = async (project: Project, task: SemanticTask) => {
    const source = await loadSemanticSource(project.files, project.commits.current(), task.basis.sourceAnalysisRef, true);
    if (source.sourceDigest !== task.basis.sourceDigest || JSON.stringify(source.units) !== JSON.stringify(task.units)) {
      throw new HostError("REFERENCE_STALE", 409, "The speech evidence changed; create a new semantic analysis task.");
    }
  };
  const agentStep = (task: SemanticTask) => {
    const source = scriptHarnessProvider.parse((({ maxInputBytes: _bytes, timeoutSeconds: _timeout, ...value }) => value)(task.provider));
    if (task.status === "registered" || task.status === "cancelled" || task.status === "failed") {
      return { taskId: task.taskId, status: task.status, source, analysisRef: task.analysisRef, next: null };
    }
    const index = task.groups.findIndex(group => !group.output);
    const inputText = index >= 0 ? task.groups[index].inputText : semanticMergeInput(task);
    return { taskId: task.taskId, status: task.status, source, analysisRef: task.analysisRef,
      next: { stage: index >= 0 ? "window" as const : "merge" as const, groupIndex: index >= 0 ? index : null,
        inputText, inputDigest: sha256(Buffer.from(inputText)), instructions: semanticSystemPrompt } };
  };
  const register = async (project: Project, task: SemanticTask, content: z.infer<typeof semanticContent>, remoteId: string | null) => {
    const output = buildSemanticOutput(task.units, task.basis.sourceKind, content);
    const analysisId = encodeId(`${task.taskId}:semantic-analysis`), resultId = encodeId(`${task.taskId}:semantic-result`), now = new Date().toISOString();
    const next = advance(task, { status: "registered", content, remoteId, analysisRef: { kind: "analysis", entityId: analysisId, revision: 1 }, resultId });
    const analysis = rawSemanticRecord.parse({ schemaVersion: 1, format: "semantic-analysis", projectId: task.projectId,
      analysisId, revision: 1, taskId: task.taskId, attemptId: task.attemptId, resultId, basis: task.basis, units: task.units, output, createdAt: now });
    const result = semanticResultRecord.parse({ schemaVersion: 1, format: "semantic-analysis-result", projectId: task.projectId,
      resultId, revision: 1, taskId: task.taskId, attemptId: task.attemptId, registration: "registered",
      analysisRef: next.analysisRef, taskRef: { kind: "task", entityId: task.taskId, revision: next.revision } });
    await project.files.mkdir("staging/semantic");
    await project.files.writeJson(`staging/semantic/${encodeId(task.taskId)}.json`, { task: next, analysis, result });
    return saveTask(project, next, analysis, result);
  };
  return {
    async prepareAgent(page: PageSession, projectId: string, editorSessionId: string, inputValue: z.infer<typeof semanticStart>, idempotencyKey: string) {
      const project = write(page, projectId, editorSessionId), input = semanticStart.parse(inputValue);
      const taskId = encodeId(`semantic:${page.pageSessionId}:${idempotencyKey}`), provider = planningHarnessConfig.parse({ ...input.source,
        maxInputBytes: input.maxInputBytes, timeoutSeconds: 600 }), requestDigest = digest({ ...input, source: provider });
      const key = identity(project, taskId), active = pending.get(key);
      if (active) {
        if (active.digest !== requestDigest) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This request key belongs to another semantic analysis.");
        return agentStep(await active.promise);
      }
      const begin = async () => {
        if (project.commits.current()?.roots.tasks.some(ref => ref.entityId === taskId)) {
          const old = await load(project, taskId);
          if (old.requestDigest !== requestDigest) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This request key belongs to another semantic analysis.");
          return old;
        }
        const sourceRef = { kind: "analysis" as const, entityId: input.analysisId, revision: input.revision };
        const source = await loadSemanticSource(project.files, project.commits.current(), sourceRef, true);
        const basis = { sourceAnalysisRef: sourceRef, assetRef: source.raw.basis.assetRef, mediaRef: source.raw.basis.mediaRef,
          range: source.raw.basis.range, language: source.raw.output.language || source.raw.basis.settings.language,
          sourceKind: source.sourceKind, sourceDigest: source.sourceDigest, provider: input.source };
        const groups = createSemanticGroups(source.units, provider.maxInputBytes);
        if (input.source.providerId !== "unknown" && input.source.model !== "unknown") {
          for (const ref of project.commits.current()?.roots.tasks ?? []) {
            const previous = semanticTaskRecord.safeParse(await readAnalysisObject(project.files, project.commits.current(), ref));
            if (!previous.success || digest(previous.data.provider) !== digest(provider) || previous.data.basis.sourceDigest !== basis.sourceDigest) continue;
            for (const group of groups) {
              const cached = previous.data.groups.find(value => value.digest === group.digest && value.output);
              if (cached) { group.output = cached.output; group.remoteId = cached.remoteId; }
            }
          }
        }
        const now = new Date().toISOString();
        return saveTask(project, semanticTaskRecord.parse({ schemaVersion: 1, format: "semantic-analysis-task", projectId, taskId,
          revision: 1, attemptId: randomUUID(), previousRef: null, status: "prepared", provider, requestDigest, basis, units: source.units,
          groups, content: null, remoteId: null, resultId: null, analysisRef: null, error: "", createdAt: now, updatedAt: now }));
      };
      const promise = begin().finally(() => pending.delete(key)); pending.set(key, { digest: requestDigest, promise });
      return agentStep(await promise);
    },
    async inspectAgent(page: PageSession, projectId: string, editorSessionId: string, taskId: string) {
      const project = write(page, projectId, editorSessionId), task = await load(project, taskId);
      if (!["registered", "cancelled", "failed"].includes(task.status)) await validateCurrentSource(project, task);
      return agentStep(task);
    },
    async submitAgent(page: PageSession, projectId: string, editorSessionId: string, taskId: string,
      inputValue: z.infer<typeof agentSemanticOutput>) {
      const project = write(page, projectId, editorSessionId), input = agentSemanticOutput.parse(inputValue), key = identity(project, taskId);
      const inputDigest = digest(input), active = pending.get(key);
      if (active) {
        if (active.digest !== inputDigest) throw new HostError("RESOURCE_BUSY", 409, "Another semantic output is being saved for this task.");
        return agentStep(await active.promise);
      }
      const submit = async () => {
        let task = await load(project, taskId);
        if (task.status === "registered") return task;
        if (["cancelled", "failed"].includes(task.status)) throw new HostError("TASK_TERMINAL", 409, "This semantic task no longer accepts output.");
        await validateCurrentSource(project, task);
        if (input.groupIndex !== null) {
          const group = task.groups[input.groupIndex];
          if (!group) throw new HostError("REFERENCE_STALE", 409, "The semantic window does not exist.");
          if (input.inputDigest !== group.digest) throw new HostError("REFERENCE_STALE", 409, "The output belongs to another semantic window.");
          const output = validateSemanticWindow(task, group, input.content), groups = structuredClone(task.groups);
          if (group.output) {
            if (digest(group.output) !== digest(output)) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This semantic window already has different saved output.");
            return task;
          }
          if (task.groups.findIndex(value => !value.output) !== input.groupIndex) throw new HostError("REFERENCE_STALE", 409, "Submit the current semantic window first.");
          groups[input.groupIndex] = { ...group, output, remoteId: input.remoteId };
          task = await saveTask(project, advance(task, { groups }));
          return task;
        }
        if (task.groups.some(group => !group.output)) throw new HostError("REFERENCE_STALE", 409, "Complete all semantic windows before submitting the merge.");
        const merge = semanticMergeInput(task);
        if (input.inputDigest !== sha256(Buffer.from(merge))) throw new HostError("REFERENCE_STALE", 409, "The semantic merge belongs to another task state.");
        const content = semanticContent.parse(input.content);
        buildSemanticOutput(task.units, task.basis.sourceKind, content);
        return register(project, task, content, input.remoteId);
      };
      const promise = submit().finally(() => pending.delete(key)); pending.set(key, { digest: inputDigest, promise });
      return agentStep(await promise);
    },
    async catalog(page: PageSession, projectId: string) {
      const project = projects.get(page, projectId), current = project.commits.current(), sources = [];
      for (const ref of current?.roots.analyses ?? []) {
        const parsed = analysisRecord.safeParse(await readAnalysisObject(project.files, current, ref));
        if (!parsed.success) continue;
        const raw = parsed.data.format === "material-analysis" ? parsed.data : rawAnalysisRecord.parse(await readAnalysisObject(project.files, current, parsed.data.rawRef));
        if (raw.basis.capability !== "speech") continue;
        const text = parsed.data.format === "material-analysis-correction" ? parsed.data.correction.text : raw.output.text;
        if (text.trim()) sources.push({ analysisId: ref.entityId, revision: ref.revision!, assetId: raw.basis.assetRef.entityId,
          range: raw.basis.range, textPreview: text.slice(0, 4096), complete: raw.output.complete });
      }
      const tasks: SemanticTask[] = [];
      for (const ref of current?.roots.tasks ?? []) {
        const parsed = semanticTaskRecord.safeParse(await readAnalysisObject(project.files, current, ref));
        if (parsed.success) tasks.push(parsed.data);
      }
      const analyses = await listSemanticAnalyses(project.files, current);
      return { sources, analyses: analyses.items.map(item => ({ analysisId: item.raw.analysisId,
        revision: item.correction?.revision ?? 1, assetId: item.raw.basis.assetRef.entityId,
        sourceAnalysisRef: item.raw.basis.sourceAnalysisRef, centralIdea: (item.correction?.output ?? item.raw.output).centralIdea,
        themes: (item.correction?.output ?? item.raw.output).themes, sourceCurrent: item.sourceCurrent })),
        tasks: tasks.map(task => ({ taskId: task.taskId, status: task.status, analysisRef: task.analysisRef,
          sourceAnalysisRef: task.basis.sourceAnalysisRef })) };
    },
    async list(page: PageSession, projectId: string, assetId?: string, cursor?: string) {
      const project = projects.get(page, projectId); return listSemanticAnalyses(project.files, project.commits.current(), assetId, cursor);
    },
    async tasks(page: PageSession, projectId: string) {
      const project = projects.get(page, projectId), items: SemanticTask[] = [];
      for (const ref of project.commits.current()?.roots.tasks ?? []) {
        const parsed = semanticTaskRecord.safeParse(await readAnalysisObject(project.files, project.commits.current(), ref));
        if (parsed.success) items.push(parsed.data);
      }
      return { items };
    },
    async correct(page: PageSession, projectId: string, editorSessionId: string, analysisId: string, idempotencyKey: string,
      inputValue: z.infer<typeof semanticCorrectionInput>) {
      const project = write(page, projectId, editorSessionId), input = semanticCorrectionInput.parse(inputValue);
      const ref = project.commits.current()?.roots.analyses.find(item => item.entityId === analysisId);
      if (!ref || ref.revision !== input.expectedRevision) throw new HostError("REVISION_CONFLICT", 409, "The semantic analysis revision changed.");
      const current = semanticRecord.parse(await readAnalysisObject(project.files, project.commits.current(), ref));
      const raw = current.format === "semantic-analysis" ? current : rawSemanticRecord.parse(await readAnalysisObject(project.files, project.commits.current(), current.rawRef));
      const output = buildSemanticOutput(raw.units, raw.basis.sourceKind, input.content);
      const request: SemanticSave = { action: "correct", operation: input,
        analysis: correctedSemanticRecord.parse({ schemaVersion: 1, format: "semantic-analysis-correction", projectId, analysisId,
          revision: input.expectedRevision + 1, rawRef: { kind: "analysis", entityId: analysisId, revision: 1 },
          previousRef: { kind: "analysis", entityId: analysisId, revision: input.expectedRevision }, content: input.content, output,
          createdAt: new Date().toISOString() }) };
      const accepted = await project.commits.accept({ route: "semantic-analysis", subject: analysisId, idempotencyKey,
        request, editorSnapshotId: null, editorSequence: null }, prepareSemanticAnalysis(project.files, projectId));
      await project.commits.drain(); return receipt(project.commits.get(accepted.save.saveId), accepted.replayed);
    },
    async cancel(page: PageSession, projectId: string, editorSessionId: string, taskId: string) {
      const project = write(page, projectId, editorSessionId), task = await load(project, taskId);
      if (task.status !== "prepared") throw new HostError("TASK_TERMINAL", 409, "This semantic task is no longer cancellable.");
      return saveTask(project, advance(task, { status: "cancelled" }));
    },
    async findTask(page: PageSession, taskId: string) {
      for (const project of projects.opened(page)) {
        const ref = project.commits.current()?.roots.tasks.find(item => item.entityId === taskId); if (!ref) continue;
        const parsed = semanticTaskRecord.safeParse(await readAnalysisObject(project.files, project.commits.current(), ref));
        if (parsed.success) return parsed.data;
      }
      return null;
    },
    async findResult(page: PageSession, resultId: string) {
      for (const project of projects.opened(page)) {
        for (const saved of project.commits.requests().sort((a, b) => b.requestSequence - a.requestSequence)) {
          if (saved.route !== "semantic-analysis") continue;
          const value = semanticSave.parse(saved.request);
          if (value.action !== "task" || value.result?.resultId !== resultId) continue;
          return { resultId, projectId: project.projectId, taskId: value.task.taskId, attemptId: value.result.attemptId,
            registration: project.commits.current()?.roots.results.some(ref => ref.entityId === resultId) ? "registered" as const : "staged" as const,
            saveId: saved.saveId, saveStatus: saved.status, analysisRef: value.result.analysisRef, error: saved.error ?? null };
        }
      }
      return null;
    },
    async retrySave(page: PageSession, projectId: string, editorSessionId: string, saveId: string, idempotencyKey: string, resultId?: string) {
      const project = write(page, projectId, editorSessionId), original = project.commits.get(saveId);
      if (original.route !== "semantic-analysis" || original.status !== "failed") throw new HostError("REFERENCE_STALE", 409, "Only a confirmed failed semantic save can be retried.");
      const input = semanticSave.parse(original.request);
      if (resultId && (input.action !== "task" || input.result?.resultId !== resultId)) throw new HostError("REFERENCE_STALE", 409, "This failed save belongs to another semantic result.");
      const accepted = await project.commits.accept({ route: "semantic-analysis", subject: saveId, idempotencyKey,
        request: { ...input, operation: { retrySaveId: saveId, resultId: resultId ?? null } }, editorSnapshotId: null, editorSequence: null },
      prepareSemanticAnalysis(project.files, projectId));
      await project.commits.drain(); return receipt(project.commits.get(accepted.save.saveId), accepted.replayed);
    },
    busy: () => pending.size > 0,
    async close() { closing = true; await Promise.allSettled([...pending.values()].map(value => value.promise)); pending.clear(); },
  };
}
