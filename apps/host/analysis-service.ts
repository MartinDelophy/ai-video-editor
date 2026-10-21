import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { HostError, type PageSession } from "./sessions.ts";
import type { createProjects } from "./storage/projects.ts";
import { analysisBasis, analysisTaskRecord, analysisResultRecord, analysisRecord, analysisCorrection, analysisOutput, sourceRange,
  analysisBasisDigest, validAnalysisOutput, type AnalysisTask } from "./storage/analysis-records.ts";
import { analysisSave, prepareAnalysis, readAnalysisObject, validateAnalysisBasis, listAnalyses, type AnalysisSave } from "./storage/analyses.ts";
import { encodeId, normalizedBytes, referenceKey, type Save } from "./storage/records.ts";
import { whisperModelId, whisperRevision, yolosModelId, yolosRevision, type createAnalysisResources } from "./whisper-resources.ts";
import { SILERO_SPEECH_SEGMENTATION } from "../../src/config/sileroVad.js";
import { sceneDetectToolId, sceneDetectToolRevision, type SceneDetectRunner } from "./scene-detect-runner.ts";
import { LEGACY_SCENE_DETECT_TOOL_ID } from "../../src/config/sceneDetect.js";

const id = z.string().min(1).max(256);
export const analysisSelection = z.strictObject({ inputs: z.array(analysisBasis).min(1).max(1000), force: z.boolean() });
export const analysisAction = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("claim"), stepId: id, expectedRevision: z.number().int().positive().safe() }),
  z.strictObject({ action: z.literal("checkpoint"), stepId: id, attemptId: id, range: sourceRange, output: analysisOutput }),
  z.strictObject({ action: z.literal("finish"), stepId: id, attemptId: id, output: analysisOutput }),
  z.strictObject({ action: z.literal("run-scene"), stepId: id, attemptId: id }),
  z.strictObject({ action: z.literal("fail"), stepId: id, attemptId: id, code: id, message: z.string().max(1024) }),
  z.strictObject({ action: z.literal("cancel"), stepId: id }),
  z.strictObject({ action: z.literal("cancelled"), stepId: id, attemptId: id }),
  z.strictObject({ action: z.literal("retry"), stepId: id, expectedRevision: z.number().int().positive().safe() }),
]);
export const correctionInput = z.strictObject({ expectedRevision: z.number().int().positive().safe(), correction: analysisCorrection });
type Projects = ReturnType<typeof createProjects>;
type Project = ReturnType<Projects["get"]>;
type Lease = { pageSessionId: string; editorSessionId: string; attemptId: string; expiresAt: number };

export function createAnalysisService(projects: Projects, resources: { speech: ReturnType<typeof createAnalysisResources>; detection: ReturnType<typeof createAnalysisResources>; segmentation: ReturnType<typeof createAnalysisResources>; scene: SceneDetectRunner }) {
  const confirmations = new Map<string, { page: string; directory: string; selection: string; expiresAt: number }>();
  const leases = new Map<string, Lease>();
  const sceneRuns = new Map<string, AbortController>();
  const executions = new Set<Promise<unknown>>();
  let tail: Promise<unknown> = Promise.resolve();
  let closing = false;
  const serialize = <T>(action: () => Promise<T>) => {
    const result = tail.then(action); tail = result.catch(() => {}); return result;
  };
  const writable = (page: PageSession, projectId: string, editorId: string) => {
    if (closing) throw new HostError("TASKS_DRAINING", 409, "Analysis execution is stopping.");
    projects.editors.requireWrite(page, editorId, projectId);
    return projects.get(page, projectId);
  };
  const previous = (project: Project, subject: string, key: string, operation: unknown) => {
    const save = project.commits.requests().find(item => item.route === "material-analysis" && item.subject === subject && item.idempotencyKey === key);
    if (save && !normalizedBytes(analysisSave.parse(save.request).operation).equals(normalizedBytes(operation))) {
      throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This analysis key was used for a different request.");
    }
    return save;
  };
  const receipt = (save: Save, replayed: boolean) => {
    const value = analysisSave.parse(save.request);
    return { saveId: save.saveId, saveStatus: save.status, replayed,
      taskId: value.action === "task" ? value.task.taskId : null,
      analysisId: value.analysis?.analysisId ?? null, error: save.error ?? null };
  };
  const save = async (project: Project, page: PageSession, editorId: string, subject: string, key: string, value: AnalysisSave) => {
    const accepted = await project.commits.accept({ route: "material-analysis", subject, idempotencyKey: key,
      request: value, editorSnapshotId: null, editorSequence: null }, prepareAnalysis(project.files, project.projectId), () => {
      writable(page, project.projectId, editorId);
    });
    await project.commits.drain();
    return receipt(project.commits.get(accepted.save.saveId), accepted.replayed);
  };
  const task = async (project: Project, taskId: string) => {
    const ref = project.commits.current()?.roots.tasks.find(item => item.entityId === taskId);
    if (!ref) throw new HostError("TASK_NOT_FOUND", 404, "Analysis task not found.");
    const value = await readAnalysisObject(project.files, project.commits.current(), ref);
    const parsed = analysisTaskRecord.safeParse(value);
    if (!parsed.success) throw new HostError("TASK_NOT_FOUND", 404, "This is not a material analysis task.");
    return parsed.data;
  };
  const leaseKey = (project: Project, stepId: string) => `${project.files.directory}\0${stepId}`;
  const activeLease = (project: Project, stepId: string) => {
    const key = leaseKey(project, stepId), lease = leases.get(key);
    if (!lease || lease.expiresAt <= Date.now()) { leases.delete(key); return null; }
    return lease;
  };
  const describeTask = (project: Project, value: AnalysisTask) => ({ ...value,
    steps: value.steps.map(step => ({ ...step,
      status: ["running", "cancel_requested"].includes(step.status) && !activeLease(project, step.stepId) ? "interrupted" as const : step.status })) });
  const complete = (projectId: string, taskId: string, step: AnalysisTask["steps"][number], now: string, output: z.infer<typeof analysisOutput>) => {
    const analysisId = randomUUID(), resultId = randomUUID();
    step.status = "succeeded"; step.resultId = resultId; step.analysisRef = { kind: "analysis", entityId: analysisId, revision: 1 };
    return {
      analysis: { schemaVersion: 1 as const, format: "material-analysis" as const, projectId, analysisId, revision: 1 as const,
        taskId, attemptId: step.attemptId, resultId, basis: step.basis, basisDigest: analysisBasisDigest(step.basis), output, createdAt: now },
      result: { schemaVersion: 1 as const, format: "material-analysis-result" as const, projectId, resultId, revision: 1 as const,
        taskId, attemptId: step.attemptId, registration: "registered" as const, analysisRef: step.analysisRef,
        taskRef: { kind: "task" as const, entityId: taskId, revision: 0 } },
    };
  };
  const sceneOutput = (basis: z.infer<typeof analysisBasis>, values: unknown[]) => {
    const { sourceStartSeconds: start, sourceEndSeconds: end } = basis.range;
    const scenes = values.map((value, index) => {
      if (!value || typeof value !== "object") throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "SceneDetect returned a malformed scene.");
      const sourceStart = Number((value as { start_seconds?: unknown }).start_seconds);
      const sourceEnd = Number((value as { end_seconds?: unknown }).end_seconds);
      if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) {
        throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "SceneDetect returned an invalid scene range.");
      }
      const clippedStart = Math.max(start, sourceStart), clippedEnd = Math.min(end, sourceEnd);
      return clippedEnd > clippedStart ? { index, range: { sourceStartSeconds: clippedStart, sourceEndSeconds: clippedEnd }, durationSeconds: clippedEnd - clippedStart } : null;
    }).filter((value): value is { index: number; range: { sourceStartSeconds: number; sourceEndSeconds: number }; durationSeconds: number } => value !== null)
      .map((value, index) => ({ ...value, index }));
    if (!scenes.length) throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "The detector returned no source intervals.");
    const normalized = scenes;
    const epsilon = 0.0015;
    let cursor = start;
    for (const item of normalized) {
      if (Math.abs(item.range.sourceStartSeconds - cursor) > epsilon) {
        throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "SceneDetect returned gaps or overlaps in the scene list.");
      }
      item.range.sourceStartSeconds = cursor;
      item.durationSeconds = item.range.sourceEndSeconds - cursor;
      cursor = item.range.sourceEndSeconds;
    }
    if (Math.abs(cursor - end) <= epsilon) {
      const last = normalized.at(-1)!;
      last.range.sourceEndSeconds = end;
      last.durationSeconds = end - last.range.sourceStartSeconds;
      cursor = end;
    }
    if (cursor !== end) throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "SceneDetect did not cover the requested source range.");
    return { text: "", language: "", words: [], samples: [], scenes: normalized, coverage: [basis.range], complete: true, missingCapabilities: [] };
  };
  const requireCurrentSceneBasis = (basis: z.infer<typeof analysisBasis>) => {
    if (basis.capability !== "scene") return;
    if (basis.model.id === LEGACY_SCENE_DETECT_TOOL_ID) {
      throw new HostError("ANALYSIS_BASIS_OUTDATED", 409, "This legacy OpenMontage SceneDetect task cannot continue with the Auto-cut adapter. Start a new scene analysis.");
    }
    if (basis.model.id !== sceneDetectToolId || basis.model.revision !== sceneDetectToolRevision ||
        basis.model.runtime !== "host-python-pyscenedetect" || !basis.settings.sceneDetection ||
        basis.settings.sceneDetection.backend !== "pyscenedetect" || basis.settings.sceneDetection.method !== "content" ||
        basis.settings.sceneDetection.threshold !== 27 || basis.settings.sceneDetection.minSceneLengthSeconds !== 1 ||
        basis.settings.sceneDetection.toolRevision !== sceneDetectToolRevision) {
      throw new HostError("INVALID_ARGUMENT", 400, "SceneDetect requires the fixed Auto-cut PySceneDetect content configuration.");
    }
  };
  const runScene = (page: PageSession, projectId: string, editorId: string, taskId: string, key: string, operation: z.infer<typeof analysisAction> & { action: "run-scene" }) => (async () => {
    const project = writable(page, projectId, editorId), old = previous(project, taskId, key, operation);
    if (old) return receipt(old, true);
    const value = await task(project, taskId), step = value.steps.find(item => item.stepId === operation.stepId);
    if (!step || step.basis.capability !== "scene") throw new HostError("INVALID_ARGUMENT", 400, "This step is not a SceneDetect analysis.");
    requireCurrentSceneBasis(step.basis);
    const lease = activeLease(project, step.stepId);
    if (step.status !== "running" || !lease || lease.attemptId !== operation.attemptId || lease.pageSessionId !== page.pageSessionId || lease.editorSessionId !== editorId) {
      throw new HostError("ATTEMPT_STALE", 409, "This SceneDetect attempt is no longer owned by the current executor.");
    }
    const media = project.commits.current()?.objects.find(item => referenceKey(item) === referenceKey(step.basis.mediaRef));
    if (!media || media.kind !== "media") throw new HostError("REFERENCE_INVALID", 409, "The SceneDetect source media is missing.");
    const staging = `staging/analysis/${encodeId(taskId)}/${encodeId(operation.attemptId)}`;
    await project.files.mkdir(staging);
    const controller = new AbortController(), runKey = leaseKey(project, step.stepId);
    if (sceneRuns.has(runKey)) throw new HostError("RESOURCE_BUSY", 409, "This SceneDetect step is already running.");
    sceneRuns.set(runKey, controller);
    try {
      const detected = await resources.scene.run({ taskId, stepId: step.stepId, attemptId: step.attemptId,
        inputPath: join(project.files.directory, media.path), outputDir: join(project.files.directory, staging),
        outputPath: join(project.files.directory, staging, "scenes.json"), deadline: Date.now() + 30 * 60_000,
        signal: controller.signal, readOutput: () => project.files.read(`${staging}/scenes.json`) });
      if (controller.signal.aborted) throw new HostError("TASK_CANCELLED", 409, "Scene analysis cancelled.");
      const current = await task(project, taskId), currentStep = current.steps.find(item => item.stepId === step.stepId);
      if (current.revision !== value.revision || currentStep?.status !== "running" || currentStep.attemptId !== step.attemptId) {
        throw new HostError("ATTEMPT_STALE", 409, "This scene attempt changed while detection was running.");
      }
      const output = sceneOutput(step.basis, detected.scenes), now = new Date().toISOString();
      value.previousRef = { kind: "task", entityId: taskId, revision: value.revision }; value.revision++; value.updatedAt = now;
      const completed = complete(projectId, taskId, step, now, output);
      completed.result.taskRef.revision = value.revision;
      const saved = await save(project, page, editorId, taskId, key, { action: "task", operation, task: value, analysis: completed.analysis, result: completed.result });
      if (saved.saveStatus === "succeeded") leases.delete(runKey);
      return saved;
    } finally { sceneRuns.delete(runKey); }
  })();
  return {
    async findTask(page: PageSession, taskId: string) {
      for (const project of projects.opened(page)) {
        const ref = project.commits.current()?.roots.tasks.find(item => item.entityId === taskId);
        if (!ref) continue;
        const parsed = analysisTaskRecord.safeParse(await readAnalysisObject(project.files, project.commits.current(), ref));
        if (parsed.success) return describeTask(project, parsed.data);
      }
      return null;
    },
    async findResult(page: PageSession, resultId: string) {
      for (const project of projects.opened(page)) {
        for (const saved of project.commits.requests().sort((a, b) => b.requestSequence - a.requestSequence)) {
          if (saved.route !== "material-analysis") continue;
          const value = analysisSave.parse(saved.request);
          if (value.action !== "task" || value.result?.resultId !== resultId) continue;
          return { resultId, projectId: project.projectId, taskId: value.task.taskId, attemptId: value.result.attemptId,
            registration: project.commits.current()?.roots.results.some(ref => ref.entityId === resultId) ? "registered" : "staged",
            saveId: saved.saveId, saveStatus: saved.status, analysisRef: value.result.analysisRef, error: saved.error ?? null };
        }
        const current = project.commits.current(), ref = current?.roots.results.find(item => item.entityId === resultId);
        if (ref) {
          const result = analysisResultRecord.safeParse(await readAnalysisObject(project.files, current, ref));
          if (result.success) return { resultId, projectId: project.projectId, taskId: result.data.taskId, attemptId: result.data.attemptId,
            registration: "registered", saveId: current!.saveId, saveStatus: "succeeded", analysisRef: result.data.analysisRef, error: null };
        }
      }
      return null;
    },
    async confirm(page: PageSession, projectId: string, editorId: string, selection: z.infer<typeof analysisSelection>) {
      const project = writable(page, projectId, editorId), input = analysisSelection.parse(selection);
      for (const basis of input.inputs) await validateAnalysisBasis(project.files, project.commits.current(), basis);
      for (const [key, value] of confirmations) if (value.expiresAt <= Date.now()) confirmations.delete(key);
      if (confirmations.size >= 128) throw new HostError("RESOURCE_BUSY", 429, "Too many pending analysis confirmations.");
      const confirmationId = randomUUID(), expiresAt = Math.min(Date.now() + 60_000, Date.parse(page.expiresAt));
      confirmations.set(confirmationId, { page: page.pageSessionId, directory: project.files.directory,
        selection: normalizedBytes(input).toString("utf8"), expiresAt });
      return { confirmationId, expiresAt: new Date(expiresAt).toISOString() };
    },
    start(page: PageSession, projectId: string, editorId: string, key: string, selection: z.infer<typeof analysisSelection>, confirmationId: string) {
      return serialize(async () => {
        const project = writable(page, projectId, editorId), input = analysisSelection.parse(selection);
        const old = previous(project, projectId, key, input);
        if (old) return receipt(old, true);
        const confirmation = confirmations.get(confirmationId);
        if (!confirmation || confirmation.page !== page.pageSessionId || confirmation.directory !== project.files.directory ||
            confirmation.expiresAt <= Date.now() || confirmation.selection !== normalizedBytes(input).toString("utf8")) {
          throw new HostError("USER_CONFIRMATION_REQUIRED", 403, "Confirm this exact analysis selection in the current page.");
        }
        const identities = new Set<string>();
        for (const basis of input.inputs) {
          await validateAnalysisBasis(project.files, project.commits.current(), basis);
          if (basis.capability === "speech" && (basis.model.id !== whisperModelId || basis.model.revision !== whisperRevision || basis.model.precision !== "q8")) {
            throw new HostError("INVALID_ARGUMENT", 400, "Speech analysis requires the fixed Whisper Q8 identity.");
          }
          if (basis.capability === "speech" && !normalizedBytes(basis.settings.speechSegmentation ?? null).equals(normalizedBytes(SILERO_SPEECH_SEGMENTATION))) {
            throw new HostError("INVALID_ARGUMENT", 400, "Speech analysis requires the fixed speech segmentation settings.");
          }
          if (basis.capability === "detection" && (basis.model.id !== yolosModelId || basis.model.revision !== yolosRevision || basis.model.precision !== "q8")) {
            throw new HostError("INVALID_ARGUMENT", 400, "Subject detection requires the fixed YOLOS Q8 identity.");
          }
          requireCurrentSceneBasis(basis);
          const identity = analysisBasisDigest(basis);
          if (identities.has(identity)) throw new HostError("INVALID_ARGUMENT", 400, "The same analysis input was selected twice.");
          identities.add(identity);
        }
        const now = new Date().toISOString();
        const value: AnalysisTask = { schemaVersion: 1, format: "material-analysis-task", projectId,
          taskId: randomUUID(), revision: 1, previousRef: null, createdAt: now, updatedAt: now,
          steps: input.inputs.map(basis => ({ stepId: randomUUID(), basis, attemptId: randomUUID(), status: "queued",
            checkpoints: [], resultId: null, analysisRef: null, error: null })) };
        // Reuse is an explicit source reference; the original task and correction history remain intact.
        if (!input.force) for (const step of value.steps) {
          let cursor: string | undefined;
          do {
            const page = await listAnalyses(project.files, project.commits.current(), step.basis.assetRef.entityId, cursor);
            const reused = page.items.find(item => item.raw.output.complete && item.raw.basis.model.revision !== null &&
              item.raw.basisDigest === analysisBasisDigest(step.basis));
            if (reused) {
              // A new run may omit already complete inputs; it must never forge a result owned by a different task.
              value.steps = value.steps.filter(item => item !== step); break;
            }
            cursor = page.cursor ?? undefined;
          } while (cursor);
        }
        if (!value.steps.length) throw new HostError("ANALYSIS_ALREADY_AVAILABLE", 409, "All selected analyses are already saved. Open the existing results or explicitly analyze again.");
        if (value.steps.some(step => step.basis.capability === "speech")) {
          await resources.speech.requireFiles(); await resources.segmentation.requireFiles();
        }
        if (value.steps.some(step => step.basis.capability === "detection")) await resources.detection.requireFiles();
        if (value.steps.some(step => step.basis.capability === "scene")) await resources.scene.requireFiles();
        confirmations.delete(confirmationId);
        return save(project, page, editorId, projectId, key, { action: "task", operation: input, task: value, analysis: null, result: null });
      });
    },
    async list(page: PageSession, projectId: string, assetId?: string, cursor?: string) {
      const project = projects.get(page, projectId);
      return listAnalyses(project.files, project.commits.current(), assetId, cursor);
    },
    async tasks(page: PageSession, projectId: string) {
      const project = projects.get(page, projectId), current = project.commits.current(), items = [];
      for (const ref of current?.roots.tasks ?? []) {
        const value = analysisTaskRecord.safeParse(await readAnalysisObject(project.files, current, ref));
        if (value.success) items.push(describeTask(project, value.data));
      }
      const pendingSaves = project.commits.requests().filter(saved => {
        if (saved.route !== "material-analysis" || saved.status === "succeeded") return false;
        const value = analysisSave.parse(saved.request);
        const root = value.action === "task" ? current?.roots.tasks.find(ref => ref.entityId === value.task.taskId)
          : current?.roots.analyses.find(ref => ref.entityId === value.analysis.analysisId);
        return (root?.revision ?? 0) < (value.action === "task" ? value.task.revision : value.analysis.revision);
      }).sort((a, b) => b.requestSequence - a.requestSequence).map(saved => receipt(saved, true));
      return { items, pendingSaves };
    },
    async task(page: PageSession, projectId: string, taskId: string) {
      const project = projects.get(page, projectId); return describeTask(project, await task(project, taskId));
    },
    heartbeat(page: PageSession, projectId: string, editorId: string, stepId: string, attemptId: string) {
      const project = writable(page, projectId, editorId), lease = activeLease(project, stepId);
      if (!lease || lease.pageSessionId !== page.pageSessionId || lease.editorSessionId !== editorId || lease.attemptId !== attemptId) {
        throw new HostError("ATTEMPT_STALE", 409, "This analysis executor no longer owns the step.");
      }
      lease.expiresAt = Math.min(Date.now() + 45_000, Date.parse(page.expiresAt));
      return { expiresAt: new Date(lease.expiresAt).toISOString() };
    },
    act(page: PageSession, projectId: string, editorId: string, taskId: string, key: string, action: z.infer<typeof analysisAction>) {
      const input = analysisAction.parse(action);
      if (input.action === "run-scene") {
        const execution = runScene(page, projectId, editorId, taskId, key, input);
        executions.add(execution);
        void execution.finally(() => executions.delete(execution)).catch(() => {});
        return execution;
      }
      if (input.action === "cancel") {
        const project = writable(page, projectId, editorId);
        sceneRuns.get(leaseKey(project, input.stepId))?.abort();
      }
      return serialize(async () => {
        const project = writable(page, projectId, editorId);
        const old = previous(project, taskId, key, input); if (old) return receipt(old, true);
        const value = await task(project, taskId), step = value.steps.find(item => item.stepId === input.stepId);
        if (!step) throw new HostError("STEP_NOT_FOUND", 404, "Analysis step not found.");
        if ("expectedRevision" in input && input.expectedRevision !== value.revision) throw new HostError("REVISION_CONFLICT", 409, "The task changed. Refresh its state.");
        const lease = activeLease(project, step.stepId);
        if ("attemptId" in input && (input.attemptId !== step.attemptId || !lease || lease.attemptId !== step.attemptId ||
            lease.pageSessionId !== page.pageSessionId || lease.editorSessionId !== editorId)) {
          throw new HostError("ATTEMPT_STALE", 409, "This analysis attempt is no longer owned by the current executor.");
        }
        const change: AnalysisSave = { action: "task", operation: input, task: value, analysis: null, result: null };
        const now = new Date().toISOString();
        value.previousRef = { kind: "task", entityId: taskId, revision: value.revision }; value.revision++; value.updatedAt = now;
        switch (input.action) {
          case "claim":
            if (step.status !== "queued" || lease) throw new HostError("RESOURCE_BUSY", 409, "This analysis step is not available to claim.");
            requireCurrentSceneBasis(step.basis);
            await validateAnalysisBasis(project.files, project.commits.current(), step.basis);
            step.status = "running"; break;
          case "checkpoint": {
            const end = step.checkpoints.at(-1)?.range.sourceEndSeconds ?? step.basis.range.sourceStartSeconds;
            if (step.status !== "running" || input.range.sourceStartSeconds !== end || input.range.sourceEndSeconds <= end ||
                input.range.sourceEndSeconds > step.basis.range.sourceEndSeconds || !input.output.complete ||
                !validAnalysisOutput({ ...step.basis, range: input.range }, input.output)) throw new HostError("INVALID_ARGUMENT", 400, "The analysis checkpoint does not continue the completed source range.");
            step.checkpoints.push({ range: input.range, output: input.output }); break;
          }
          case "finish": {
            if (step.status !== "running" || !validAnalysisOutput(step.basis, input.output)) throw new HostError("INVALID_ARGUMENT", 400, "The analysis output does not match its source range.");
            const completed = complete(projectId, taskId, step, now, input.output);
            completed.result.taskRef.revision = value.revision;
            change.analysis = completed.analysis; change.result = completed.result; break;
          }
          case "fail":
            if (!["running", "cancel_requested"].includes(step.status)) throw new HostError("TASK_TERMINAL", 409, "This step is no longer running.");
            step.status = "failed"; step.error = { code: input.code, message: input.message }; break;
          case "cancel":
            if (step.status === "queued") step.status = "cancelled";
            else if (step.status === "running" && lease) step.status = "cancel_requested";
            else if (["running", "cancel_requested"].includes(step.status) && !lease) step.status = "interrupted";
            else throw new HostError("TASK_TERMINAL", 409, "This step is no longer cancellable.");
            break;
          case "cancelled":
            if (!["running", "cancel_requested"].includes(step.status)) throw new HostError("TASK_TERMINAL", 409, "This step is no longer running.");
            step.status = "cancelled"; break;
          case "retry":
            if (lease || !(["failed", "interrupted", "cancelled"].includes(step.status) || ["running", "cancel_requested"].includes(step.status))) {
              throw new HostError("TASK_NOT_RETRYABLE", 409, "Only failed or interrupted steps can be continued.");
            }
            requireCurrentSceneBasis(step.basis);
            await validateAnalysisBasis(project.files, project.commits.current(), step.basis);
            step.attemptId = randomUUID(); step.status = "queued"; step.error = null; break;
        }
        const saved = await save(project, page, editorId, taskId, key, change);
        if (saved.saveStatus === "succeeded") {
          if (input.action === "claim") leases.set(leaseKey(project, step.stepId), { pageSessionId: page.pageSessionId,
            editorSessionId: editorId, attemptId: step.attemptId, expiresAt: Math.min(Date.now() + 45_000, Date.parse(page.expiresAt)) });
          else if (["finish", "fail", "cancelled", "retry"].includes(input.action) || step.status === "cancelled") leases.delete(leaseKey(project, step.stepId));
        }
        return saved;
      });
    },
    correct(page: PageSession, projectId: string, editorId: string, analysisId: string, key: string, input: z.infer<typeof correctionInput>) {
      return serialize(async () => {
        const project = writable(page, projectId, editorId), operation = correctionInput.parse(input);
        const old = previous(project, analysisId, key, operation); if (old) return receipt(old, true);
        const ref = project.commits.current()?.roots.analyses.find(item => item.entityId === analysisId);
        if (!ref || ref.revision !== input.expectedRevision) throw new HostError("REVISION_CONFLICT", 409, "The analysis revision changed.");
        analysisRecord.parse(await readAnalysisObject(project.files, project.commits.current(), ref));
        return save(project, page, editorId, analysisId, key, { action: "correct", operation,
          analysis: { schemaVersion: 1, format: "material-analysis-correction", projectId, analysisId,
            revision: input.expectedRevision + 1, rawRef: { kind: "analysis", entityId: analysisId, revision: 1 },
            previousRef: { kind: "analysis", entityId: analysisId, revision: input.expectedRevision }, correction: input.correction,
            createdAt: new Date().toISOString() } });
      });
    },
    retrySave(page: PageSession, projectId: string, editorId: string, saveId: string, key: string, resultId?: string) {
      return serialize(async () => {
        const project = writable(page, projectId, editorId), operation = { retrySaveId: saveId, resultId: resultId ?? null };
        const old = previous(project, saveId, key, operation); if (old) return receipt(old, true);
        const original = project.commits.get(saveId);
        if (original.route !== "material-analysis" || original.status !== "failed") {
          throw new HostError("REFERENCE_STALE", 409, "Only a confirmed failed analysis save can be retried.");
        }
        const input = analysisSave.parse(original.request);
        if (resultId && (input.action !== "task" || input.result?.resultId !== resultId)) {
          throw new HostError("REFERENCE_STALE", 409, "This failed save belongs to another analysis result.");
        }
        const value = { ...input, operation };
        return save(project, page, editorId, saveId, key, value);
      });
    },
    busy: () => executions.size > 0,
    async close() { closing = true; for (const controller of sceneRuns.values()) controller.abort(); await Promise.allSettled([...executions]); sceneRuns.clear(); await tail; leases.clear(); confirmations.clear(); },
  };
}
