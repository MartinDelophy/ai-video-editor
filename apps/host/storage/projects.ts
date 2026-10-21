import { prepareAnalysis } from "./analyses.ts";
import { prepareScript } from "./scripts.ts";
import { preparePlanningTask } from "./planning-tasks.ts";
import { prepareExecutionPlan } from "./execution-plans.ts";
import { prepareSemanticAnalysis } from "./semantic-analyses.ts";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import type { Readable } from "node:stream";
import { HostError, type PageSession } from "../sessions.ts";
import { createProjectCommits, inspectProjectRecovery, prepareRecovery, recoveryChoice, type RecoveryChoice } from "./commits.ts";
import { openProjectFiles, StorageIOError } from "./files.ts";
import { claimProject } from "./ownership.ts";
import { commitRecord, emptyRoots, entryRecord } from "./records.ts";
import { createEditorSessions } from "./editor-sessions.ts";
import { prepareSnapshot, readSnapshot, snapshotInput, validateSnapshot, type SnapshotInput } from "./snapshots.ts";
import { importMetadata, prepareAsset, readAsset, receiveAsset, receivedAssets, receiptRecord, type ImportMetadata } from "./assets.ts";

type Project = { projectId: string; name: string; files: Awaited<ReturnType<typeof openProjectFiles>>;
  commits: Awaited<ReturnType<typeof createProjectCommits>>;
  release: () => Promise<void>; pages: Set<string> };

export function createProjects(instanceId: string, executable: string) {
  const projects = new Map<string, Project>();
  const editors = createEditorSessions();
  let tail: Promise<void> = Promise.resolve();
  let closing = false;
  let pendingOperations = 0;
  const importing = new Set<string>();
  const importWaiters = new Set<() => void>();
  const serialize = <T>(action: () => Promise<T>) => {
    pendingOperations++;
    const result = tail.then(action).finally(() => { pendingOperations--; });
    tail = result.then(() => {}, () => {});
    return result;
  };
  const initialize = async (directory: string, projectId: string, recovery?: { choice: RecoveryChoice; key: string }) => {
    const files = await openProjectFiles(directory, executable);
    let lost = false;
    let commits: Awaited<ReturnType<typeof createProjectCommits>> | undefined;
    const release = await claimProject(files, projectId, instanceId, () => { lost = true; commits?.stopWrites(); });
    try {
      commits = await createProjectCommits(files, projectId, recovery?.choice);
      if (lost) throw new HostError("PROJECT_WRITE_LOCKED", 409, "Project ownership was lost while opening.");
      const recoveryAccepted = recovery ? await commits.accept({ route: "project-recovery", subject: projectId,
        idempotencyKey: recovery.key, request: recovery.choice, editorSnapshotId: null, editorSequence: null }, prepareRecovery(files, projectId)) : null;
      for (const save of commits.pending()) {
        if (!["queued", "writing"].includes(commits.get(save.saveId).status)) continue;
        const prepare = save.route === "material-analysis" ? prepareAnalysis(files, projectId) : save.route === "review-script" ? prepareScript(files, projectId) : save.route === "script-planning" ? preparePlanningTask(files, projectId) : save.route === "execution-plan" ? prepareExecutionPlan(files, projectId) : save.route === "semantic-analysis" ? prepareSemanticAnalysis(files, projectId) : save.route === "project-recovery" ? prepareRecovery(files, projectId) : save.route === "editor-snapshots" ? prepareSnapshot(files, projectId) :
          ["asset-imports", "result-registrations"].includes(save.route) ? prepareAsset(files, projectId) : null;
        if (!prepare) { commits.stopWrites(); break; }
        await commits.resume(save.saveId, prepare);
        if (commits.state().blocked) break;
      }
      if (!commits.state().blocked) {
        for await (const { key, receipt } of receivedAssets(files, projectId, commits.requests())) {
          await commits.accept({ route: "asset-imports", subject: projectId, idempotencyKey: key, request: receipt,
            editorSnapshotId: null, editorSequence: null }, prepareAsset(files, projectId));
          await commits.drain();
          if (commits.state().blocked) break;
        }
      }
      return { projectId, name: basename(directory), files, commits, release, pages: new Set<string>(), recoverySaveId: recoveryAccepted?.save.saveId,
        recoveryReplayed: recoveryAccepted?.replayed ?? false };
    } catch (error) { await release().catch(() => {}); throw error; }
  };
  const get = (page: PageSession, projectId: string) => {
    const project = projects.get(projectId);
    if (!project || !project.pages.has(page.pageSessionId)) throw new HostError("PROJECT_NOT_FOUND", 404, "Open this project in the current page first.");
    return project;
  };
  const describe = (project: Project) => {
    const current = project.commits.current();
    return { projectId: project.projectId, name: project.name, ...project.commits.state(),
      currentSavePointId: current?.savePointId ?? null, editorSnapshotId: current?.editorSnapshotId ?? null,
      editorSequence: current?.editorSequence ?? null, lastSaveId: current?.saveId ?? null };
  };
  const active = () => { if (closing) throw new HostError("TASKS_DRAINING", 409, "The service is closing its projects."); };
  const findResult = (page: PageSession, resultId: string) => {
    for (const project of projects.values()) {
      if (!project.pages.has(page.pageSessionId)) continue;
      for (const save of project.commits.requests().sort((a, b) => b.requestSequence - a.requestSequence)) {
        if (!["asset-imports", "result-registrations"].includes(save.route)) continue;
        const receipt = receiptRecord.parse(save.request);
        if (receipt.resultId === resultId) return { project, save, receipt };
      }
    }
    throw new HostError("RESULT_NOT_FOUND", 404, "Result not found in an open project.");
  };
  return {
    async recoveryOptions(path: string) {
      active();
      return inspectProjectRecovery(await openProjectFiles(path, executable));
    },
    async recoverProject(page: PageSession, path: string, projectId: string, value: RecoveryChoice, key: string) {
      return serialize(async () => {
        active();
        const parsed = recoveryChoice.safeParse(value);
        if (!parsed.success) throw new HostError("INVALID_ARGUMENT", 400, "A complete recovery selection is required.");
        const choice = parsed.data, files = await openProjectFiles(path, executable);
        const existing = projects.get(projectId);
        let releasedSameDirectory = false;
        if (existing && existing.files.directory === files.directory && existing.commits.requests().some(save =>
          save.route === "project-recovery" && save.subject === projectId && save.idempotencyKey === key)) {
          const replay = await existing.commits.accept({ route: "project-recovery", subject: projectId, idempotencyKey: key,
            request: choice, editorSnapshotId: null, editorSequence: null }, prepareRecovery(existing.files, projectId));
          existing.pages.add(page.pageSessionId);
          return { projectId, saveId: replay.save.saveId, replayed: true };
        }
        if (existing && (editors.hasWriter(projectId) || importing.has(projectId) || existing.commits.state().pending ||
            (existing.files.directory !== files.directory && existing.commits.state().blocked))) {
          throw new HostError("PROJECT_ID_CONFLICT", 409, "Close the active editor and finish pending writes before recovering this project.");
        }
        if (existing?.files.directory === files.directory) {
          const report = await inspectProjectRecovery(files);
          if (report.projectId !== projectId || report.status !== "previous_available" || report.currentSavePointId !== choice.currentSavePointId ||
              report.currentCommitSequence !== choice.currentCommitSequence || report.currentCommitSha256 !== choice.currentCommitSha256 ||
              report.previousSavePointId !== choice.previousSavePointId) throw new HostError("REFERENCE_STALE", 409, "Recovery options changed.");
          if (editors.hasWriter(projectId) || importing.has(projectId) || existing.commits.state().pending) {
            throw new HostError("PROJECT_ID_CONFLICT", 409, "The project became active while recovery was being prepared.");
          }
          existing.commits.stopWrites(); await existing.release(); editors.closeProject(projectId);
          // Keep the blocked registration readable if replacement initialization fails.
          releasedSameDirectory = true;
        }
        const recovered = await initialize(files.directory, projectId, { choice, key });
        try {
          if (existing && !releasedSameDirectory) {
            if (editors.hasWriter(projectId) || importing.has(projectId) || existing.commits.state().pending || existing.commits.state().blocked) {
              throw new HostError("PROJECT_ID_CONFLICT", 409, "The other project copy became active during recovery.");
            }
            existing.commits.stopWrites(); await existing.release(); editors.closeProject(projectId);
          }
          recovered.pages.add(page.pageSessionId); projects.set(projectId, recovered);
          return { projectId, saveId: recovered.recoverySaveId!, replayed: recovered.recoveryReplayed };
        } catch (error) { recovered.commits.stopWrites(); await recovered.release().catch(() => {}); throw error; }
      });
    },
    async create(page: PageSession, parent: string, name: string) {
      return serialize(async () => {
        active();
        const normalized = name.normalize("NFC");
        const reserved = ["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)];
        if (!normalized || Buffer.byteLength(normalized) > 200 || normalized === "." || normalized === ".." ||
            [...normalized].some(char => char.charCodeAt(0) < 32 || '/\\:*?"<>|'.includes(char)) ||
            normalized.endsWith(".") || normalized.endsWith(" ") || reserved.includes(normalized.split(".")[0].toUpperCase())) {
          throw new HostError("INVALID_ARGUMENT", 400, "Choose a valid project folder name.");
        }
        const parentFiles = await openProjectFiles(parent, executable);
        const projectId = randomUUID(), temporary = `.timeline-studio-create-${projectId}`;
        await parentFiles.mkdir(temporary);
        const project = await initialize(join(parentFiles.directory, temporary), projectId);
        try {
          const accepted = await project.commits.accept({ route: "project-create", subject: projectId, idempotencyKey: projectId,
            request: { name: normalized }, editorSnapshotId: null, editorSequence: null }, async () => ({
            roots: emptyRoots(), objects: [], editorSnapshotId: null, editorSequence: null,
          }));
          await project.commits.drain();
          if (project.commits.get(accepted.save.saveId).status !== "succeeded") throw new HostError("SAVE_FAILED", 503, "The initial project save could not be confirmed.");
        } finally { await project.release(); }
        try { await parentFiles.publish(temporary, normalized); }
        catch (error) {
          if (error instanceof StorageIOError && error.errno === 17) throw new HostError("PROJECT_EXISTS", 409, "The target project folder already exists.");
          throw error;
        }
        const published = await initialize(join(parentFiles.directory, normalized), projectId);
        published.pages.add(page.pageSessionId);
        projects.set(projectId, published);
        return describe(published);
      });
    },
    async open(page: PageSession, path: string) {
      return serialize(async () => {
        active();
        const files = await openProjectFiles(path, executable);
        let projectId: string;
        try { projectId = entryRecord.parse(JSON.parse((await files.read("project.json")).toString("utf8"))).projectId; }
        catch {
          try {
            const names = (await files.list("saves/commits")).filter(name => name.endsWith(".json"));
            if (!names.length) throw new Error("Missing commit.");
            projectId = commitRecord.parse(JSON.parse((await files.read(`saves/commits/${names[0]}`)).toString("utf8"))).projectId;
          } catch { throw new HostError("PROJECT_INVALID", 409, "No valid project identity could be recovered."); }
        }
        const existing = projects.get(projectId);
        if (existing) {
          if (existing.files.directory === files.directory) {
            existing.pages.add(page.pageSessionId);
            return describe(existing);
          }
          if (editors.hasWriter(projectId) || importing.has(projectId) || existing.commits.state().pending || existing.commits.state().blocked) {
            throw new HostError("PROJECT_ID_CONFLICT", 409, "Close the writable session and finish saving the current copy first.");
          }
        }
        const project = await initialize(files.directory, projectId);
        if (existing) {
          try {
            // Opening the candidate can take time; another page may have resumed editing.
            if (editors.hasWriter(projectId) || importing.has(projectId) || existing.commits.state().pending || existing.commits.state().blocked) {
              throw new HostError("PROJECT_ID_CONFLICT", 409, "The current copy became active while the new copy was opening.");
            }
            existing.commits.stopWrites();
            await existing.release();
            editors.closeProject(projectId);
          } catch (error) {
            project.commits.stopWrites();
            await project.release().catch(() => {});
            throw error;
          }
        }
        project.pages.add(page.pageSessionId);
        projects.set(projectId, project);
        return describe(project);
      });
    },
    describe(page: PageSession, projectId: string) { return describe(get(page, projectId)); },
    async snapshot(page: PageSession, projectId: string) {
      const project = get(page, projectId);
      return readSnapshot(project.files, project.commits.current());
    },
    snapshotRequest(page: PageSession, projectId: string, key: string) {
      const project = get(page, projectId);
      const save = project.commits.requests().find(item => item.route === "editor-snapshots" && item.idempotencyKey === key);
      return { receipt: save ? { saveId: save.saveId, status: save.status, editorSnapshotId: save.editorSnapshotId,
        editorSequence: save.editorSequence, replayed: true } : null };
    },
    async saveSnapshot(page: PageSession, projectId: string, editorSessionId: string, idempotencyKey: string, value: SnapshotInput) {
      active();
      const project = get(page, projectId), input = snapshotInput.parse(value);
      editors.requireWrite(page, editorSessionId, projectId);
      const accepted = await project.commits.accept({ route: "editor-snapshots", subject: projectId, idempotencyKey,
        request: input, editorSnapshotId: input.editorSnapshotId, editorSequence: input.editorSequence },
      prepareSnapshot(project.files, projectId), (current, pending) => {
        editors.requireWrite(page, editorSessionId, projectId);
        const latest = Math.max(current?.editorSequence ?? -1, ...pending.map(save => save.editorSequence ?? -1));
        if (input.editorSequence <= latest) throw new HostError("OUT_OF_ORDER_SNAPSHOT", 409, "The editor sequence must advance beyond accepted snapshots.");
        validateSnapshot(input, current);
      });
      return { saveId: accepted.save.saveId, status: accepted.save.status, editorSnapshotId: accepted.save.editorSnapshotId,
        editorSequence: accepted.save.editorSequence, replayed: accepted.replayed };
    },
    save(page: PageSession, saveId: string) {
      for (const project of projects.values()) {
        if (!project.pages.has(page.pageSessionId)) continue;
        try {
          const save = project.commits.get(saveId);
          return { saveId: save.saveId, status: save.status, savePointId: save.status === "succeeded" ? save.savePointId : null,
            editorSnapshotId: save.editorSnapshotId, editorSequence: save.editorSequence, error: save.error ?? null };
        } catch (error) { if (!(error instanceof HostError) || error.code !== "SAVE_NOT_FOUND") throw error; }
      }
      throw new HostError("SAVE_NOT_FOUND", 404, "Save request not found in an open project.");
    },
    async importAsset(page: PageSession, projectId: string, editorSessionId: string, key: string, metadata: ImportMetadata, input: Readable) {
      active();
      const project = get(page, projectId);
      editors.requireWrite(page, editorSessionId, projectId);
      if (project.commits.state().blocked) throw new HostError("PROJECT_WRITE_LOCKED", 409, "Resolve the previous save before importing.");
      if (importing.has(projectId)) throw new HostError("RESOURCE_BUSY", 429, "Another media upload is in progress.");
      importing.add(projectId);
      try {
        const receipt = await receiveAsset(project.files, projectId, key, importMetadata.parse(metadata), input);
        editors.requireWrite(page, editorSessionId, projectId);
        const accepted = await project.commits.accept({ route: "asset-imports", subject: projectId, idempotencyKey: key,
          request: receipt, editorSnapshotId: null, editorSequence: null }, prepareAsset(project.files, projectId));
        return { taskId: receipt.taskId, stepId: receipt.stepId, saveId: accepted.save.saveId, replayed: accepted.replayed };
      } finally {
        importing.delete(projectId);
        if (!importing.size) { for (const resolve of importWaiters) resolve(); importWaiters.clear(); }
      }
    },
    async assets(page: PageSession, projectId: string, after?: string) {
      const project = get(page, projectId), current = project.commits.current();
      const ids = (current?.roots.assets ?? []).map(ref => ref.entityId).sort();
      const index = after ? ids.indexOf(after) : -1;
      if (after && index < 0) throw new HostError("INVALID_CURSOR", 400, "The asset cursor is no longer available.");
      const selected = ids.slice(index + 1, index + 101);
      const items = [];
      for (const id of selected) items.push(await readAsset(project.files, current, id));
      return { items, cursor: index + 101 < ids.length ? selected.at(-1)! : null };
    },
    async asset(page: PageSession, projectId: string, assetId: string) {
      const project = get(page, projectId);
      return readAsset(project.files, project.commits.current(), assetId);
    },
    async media(page: PageSession, projectId: string, assetId: string, blobId: string) {
      const project = get(page, projectId), current = project.commits.current();
      const asset = await readAsset(project.files, current, assetId, true);
      const object = current?.objects.find(item => item.kind === "media" && item.entityId === assetId && item.blobId === blobId);
      if (!object || asset.mediaRef.blobId !== blobId) throw new HostError("ASSET_NOT_READY", 409, "This media revision is not available.");
      return { asset, object, files: project.files };
    },
    task(page: PageSession, taskId: string) {
      for (const project of projects.values()) {
        if (!project.pages.has(page.pageSessionId)) continue;
        for (const save of project.commits.requests().sort((a, b) => b.requestSequence - a.requestSequence)) {
          if (!["asset-imports", "result-registrations"].includes(save.route)) continue;
          const receipt = receiptRecord.parse(save.request);
          if (receipt.taskId !== taskId) continue;
          const registered = Boolean(project.commits.current()?.roots.results.some(ref => ref.entityId === receipt.resultId));
          const excluded = save.status === "succeeded" && !registered;
          return { taskId, projectId: project.projectId, status: registered ? "succeeded" : excluded ? "failed" : save.status === "writing" ? "running" : save.status,
            saveId: save.saveId, stepId: receipt.stepId, attemptId: receipt.attemptId,
            resultId: receipt.resultId,
            assetId: registered ? receipt.asset.assetId : null,
            error: registered ? null : excluded ? { code: "RESULT_NOT_REGISTERED", message: "The current save point excludes this result. Retry registration of its retained output." } : save.error ?? null };
        }
      }
      throw new HostError("TASK_NOT_FOUND", 404, "Task not found in an open project.");
    },
    result(page: PageSession, resultId: string) {
      const { project, save, receipt } = findResult(page, resultId);
      const registered = Boolean(project.commits.current()?.roots.results.some(ref => ref.entityId === resultId));
      return { resultId, projectId: project.projectId, taskId: receipt.taskId, attemptId: receipt.attemptId,
        registration: registered ? "registered" : "staged", saveId: save.saveId, saveStatus: save.status,
        artifacts: [{ artifactId: receipt.artifactId, mediaRef: receipt.asset.mediaRef }], error: save.error ?? null };
    },
    async retryRegistration(page: PageSession, resultId: string, editorSessionId: string, expectedSaveId: string, key: string) {
      active();
      const { project, receipt } = findResult(page, resultId);
      editors.requireWrite(page, editorSessionId, project.projectId);
      const accepted = await project.commits.accept({ route: "result-registrations", subject: resultId, idempotencyKey: key,
        request: { ...receipt, registrationSourceSaveId: expectedSaveId }, editorSnapshotId: null, editorSequence: null }, prepareAsset(project.files, project.projectId), () => {
        editors.requireWrite(page, editorSessionId, project.projectId);
        const latest = findResult(page, resultId).save;
        const registered = project.commits.current()?.roots.results.some(ref => ref.entityId === resultId);
        if (latest.saveId !== expectedSaveId || registered || !["failed", "succeeded"].includes(latest.status)) {
          throw new HostError("REFERENCE_STALE", 409, "Registration state changed. Query the result before retrying.");
        }
      });
      return { taskId: receipt.taskId, stepId: receipt.stepId, saveId: accepted.save.saveId, replayed: accepted.replayed };
    },
    get,
    opened(page: PageSession) { return [...projects.values()].filter(project => project.pages.has(page.pageSessionId)); },
    editors,
    busy() { return pendingOperations > 0 || importing.size > 0 || [...projects.values()].some(project => project.commits.state().pending > 0 || project.commits.state().blocked); },
    async close() {
      closing = true;
      await tail;
      if (importing.size) await new Promise<void>(resolve => importWaiters.add(resolve));
      const results = await Promise.allSettled([...projects.values()].map(async project => {
        await project.commits.drain();
        project.commits.stopWrites();
        await project.release();
      }));
      projects.clear(); editors.clear();
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Some project locks could not be released.");
    },
  };
}

export type Projects = ReturnType<typeof createProjects>;
