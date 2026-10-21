import { useMaterialAnalysis } from "./useMaterialAnalysis.js";
import { useScriptReview } from "./useScriptReview.js";
import { projectMediaUrl } from "../lib/projectSnapshot.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { hostText, hostErrorText } from "../i18nHost.js";
import { createProjectSaveQueue } from "../lib/projectSaveQueue.js";
import { waitForHostMediaController } from "../lib/serviceWorker.js";

const PROJECT_BINDING_KEY = "timeline-studio.project-binding";

export function useCompleteProject({ hostSession, captureCompleteProject, prepareCompleteProject, handleNewProject, isEditorBusy, isAnalysisBusy, notify, language, handleImportProject, projectFileInputRef }) {
  const ht = (key) => hostText(language, key);
  const [state, setState] = useState({ status: "unbound", name: "", pending: 0, lastSaved: null, error: "" });
  const binding = useRef(null);
  const creating = useRef(false);
  const latest = useRef({ captureCompleteProject, prepareCompleteProject, handleNewProject, isEditorBusy, notify, language, handleImportProject, projectFileInputRef });
  latest.current = { captureCompleteProject, prepareCompleteProject, handleNewProject, isEditorBusy, isAnalysisBusy, notify };
  const operationVersion = useRef(0);
  const recoveryAttempt = useRef(null);
  const identities = useRef({ blobs: new WeakMap(), next: 0 });
  const lastSignature = useRef("");
  const observedSignature = useRef("");
  const captureTimer = useRef(null);
  const pendingCapture = useRef(false);
  const ensureOperation = (version) => {
    if (version !== operationVersion.current) throw new Error("项目操作已结束。");
  };
  const remember = (current) => {
    try {
      sessionStorage.setItem(PROJECT_BINDING_KEY, JSON.stringify({ projectId: current.project.projectId,
        instanceId: hostSession.getSnapshot().session.instanceId }));
    } catch { /* Saving the project does not depend on browser storage availability. */ }
  };
  const signature = (captured) => {
    const content = { ...captured };
    for (const key of ["currentTime", "selectedTrack", "selectedSegmentId", "selectedVisualSegmentId", "selectedVisualOverlayId", "selectedStickerSegmentId", "selectedAudioSegmentId"]) delete content[key];
    if (content.visualSegments?.length) {
      for (const key of ["imageSrc", "imageName", "imageMeta", "visualType"]) delete content[key];
    }
    if (content.audioSegments?.length) {
      for (const key of ["audioBlob", "audioUrl", "audioDuration"]) delete content[key];
    }
    return JSON.stringify(content, (_key, value) => {
      if (!(value instanceof Blob)) return value;
      if (!identities.current.blobs.has(value)) identities.current.blobs.set(value, ++identities.current.next);
      return { blobIdentity: identities.current.blobs.get(value) };
    });
  };

  const acquire = useCallback(async (current, isCurrent = () => true) => {
    const pageSessionId = hostSession.getSnapshot().session?.pageSessionId;
    const lease = await hostSession.request(`/api/v1/projects/${encodeURIComponent(current.project.projectId)}/editor-sessions`, { pageSessionId, mode: "write" });
    if (!isCurrent()) return;
    current.lease = lease;
    if (current.queue) {
      const project = await hostSession.request(`/api/v1/projects/${encodeURIComponent(current.project.projectId)}`);
      if (!isCurrent()) return;
      // Lease revision is not project revision. A new writer may have saved while
      // this page was suspended; never replay its older timeline over that save.
      if ((project.editorSequence ?? -1) !== current.queue.getSnapshot().savedSequence &&
          !current.queue.ownsPendingSnapshot(project.editorSnapshotId, project.editorSequence)) {
        current.conflict = true;
        throw Object.assign(new Error("The project changed in another session. Current edits are retained."), { code: "PROJECT_REVISION_CONFLICT" });
      }
    }
  }, [hostSession]);
  const installQueue = (current) => {
    current.queue = createProjectSaveQueue({ hostSession, projectId: current.project.projectId,
      editorSequence: current.project.editorSequence ?? -1,
      getEditorSessionId: () => {
        if (current.conflict) throw Object.assign(new Error("The project changed in another session."), { code: "PROJECT_REVISION_CONFLICT" });
        if (!current.lease || Date.parse(current.lease.expiresAt) <= Date.now()) throw Object.assign(new Error("编辑会话已过期，请重试保存。"), { code: "EDITOR_SESSION_EXPIRED" });
        return current.lease.editorSessionId;
      } });
    current.unsubscribe = current.queue.subscribe(() => {
      const queued = current.queue.getSnapshot();
      if (queued.lastSaved) remember(current);
      setState(previous => ({ ...previous, ...queued, name: current.project.name,
        status: pendingCapture.current && queued.status !== "error" ? "dirty" : queued.status }));
    });
  };

  const save = async (requestedName) => {
    if (!hostSession || creating.current) return;
    const version = ++operationVersion.current;
    creating.current = true;
    setState(previous => ({ ...previous, status: "preparing", error: "" }));
    try {
      let current = binding.current;
      if (!current) {
        const name = typeof requestedName === "string" ? requestedName.trim() : "";
        if (!name) throw Object.assign(new Error("A project name is required."), { code: "INVALID_ARGUMENT" });
        const selection = await hostSession.request("/api/v1/file-selections", { purpose: "project-create", multiple: false }, undefined,
          { signal: AbortSignal.timeout(130_000) });
        const project = await hostSession.request("/api/v1/projects", { selectionId: selection.selectionId, name });
        ensureOperation(version);
        current = { project, lease: null, queue: null, unsubscribe: null };
        binding.current = current;
      }
      if (!current.lease || Date.parse(current.lease.expiresAt) <= Date.now()) await acquire(current);
      ensureOperation(version);
      if (current.conflict && current.queue?.hasUnknownOutcome()) {
        // After a project conflict, only read the existing receipt. Replaying
        // a POST could overwrite a deliberately restored older project basis.
        void current.queue.reconcileUnknown();
        return;
      }
      if (current.conflict) {
        throw Object.assign(new Error("Reopen the current project before saving again."), { code: "PROJECT_REVISION_CONFLICT" });
      }
      if (!current.queue) installQueue(current);
      const captured = latest.current.captureCompleteProject();
      const nextSignature = signature(captured);
      if (nextSignature !== lastSignature.current) {
        current.queue.enqueue(captured);
        lastSignature.current = nextSignature;
      }
      clearTimeout(captureTimer.current); pendingCapture.current = false; observedSignature.current = nextSignature;
      current.queue.retry();
      setState({ ...current.queue.getSnapshot(), name: current.project.name });
    } catch (error) {
      if (version !== operationVersion.current) return;
      const message = error instanceof Error ? error.message : "完整项目保存失败。";
      setState(previous => ({ ...previous, status: "error", error: message, errorCode: error?.code }));
      latest.current.notify(hostErrorText(language, error));
    } finally { if (version === operationVersion.current) creating.current = false; }
  };

  const open = async (resumeProjectId = null) => {
    if (!hostSession || creating.current) return;
    const previous = binding.current;
    if (analysis.running || analysis.unresolved || analysis.pendingSave || scriptReview.saving) { latest.current.notify(ht("wait")); return; }
    if ((pendingCapture.current || (previous?.queue?.busy() && !(previous.conflict && previous.queue.canAbandonUnsubmitted()))) || latest.current.isEditorBusy?.()) {
      latest.current.notify(ht("wait")); return;
    }
    if (!resumeProjectId && !window.confirm(ht("openConfirm"))) return;
    const originalSignature = signature(latest.current.captureCompleteProject());
    const version = ++operationVersion.current;
    creating.current = true;
    setState(old => ({ ...old, status: "preparing", error: "" }));
    let candidate;
    try {
      let project;
      if (resumeProjectId) project = await hostSession.request(`/api/v1/projects/${encodeURIComponent(resumeProjectId)}`);
      else {
        const selection = await hostSession.request("/api/v1/file-selections", { purpose: "project-open", multiple: false }, undefined,
          { signal: AbortSignal.timeout(130_000) });
        try {
          project = await hostSession.request("/api/v1/projects/open", { selectionId: selection.selectionId });
        } catch (error) {
          if (!["PROJECT_INVALID", "STORAGE_IO_FAILED", "REFERENCE_INVALID", "INVALID_ARGUMENT"].includes(error?.code)) throw error;
          const report = await hostSession.request("/api/v1/projects/recovery-options", { selectionId: selection.selectionId });
          if (report.status !== "previous_available") throw new Error(report.status === "no_valid_previous"
            ? "当前及上一保存点均不可用，项目文件已保留。" : error.message, { cause: error });
          ensureOperation(version);
          if (signature(latest.current.captureCompleteProject()) !== originalSignature || latest.current.isEditorBusy?.()) {
            throw new Error("当前内容发生变化，请先保存再执行项目恢复。", { cause: error });
          }
          if (!window.confirm(ht("recoverConfirm"))) {
            throw new Error("已取消回退，项目文件保持原样。", { cause: error });
          }
          const choice = { currentSavePointId: report.currentSavePointId, currentCommitSequence: report.currentCommitSequence,
            currentCommitSha256: report.currentCommitSha256, previousSavePointId: report.previousSavePointId };
          const signal = AbortSignal.timeout(300_000);
          const recoveryBasis = JSON.stringify([report.projectId, choice]);
          if (recoveryAttempt.current?.basis !== recoveryBasis) recoveryAttempt.current = { basis: recoveryBasis, key: crypto.randomUUID() };
          const receipt = await hostSession.request("/api/v1/projects/recoveries", { selectionId: selection.selectionId,
            projectId: report.projectId, choice }, recoveryAttempt.current.key, { signal });
          for (;;) {
            ensureOperation(version);
            const saved = await hostSession.request(`/api/v1/saves/${encodeURIComponent(receipt.saveId)}`, undefined, undefined, { signal });
            if (saved.status === "failed") throw new Error(saved.error?.message || "项目回退未完成，原文件已保留。", { cause: error });
            if (saved.status === "succeeded") {
              if (!saved.savePointId) throw new Error("回退回执缺少保存点。", { cause: error });
              recoveryAttempt.current = null;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          project = await hostSession.request(`/api/v1/projects/${encodeURIComponent(receipt.projectId)}`);
          if (!project.editorSnapshot) throw new Error("回退已完成，但该保存点不含可打开的编辑快照。", { cause: error });
        }
      }
      ensureOperation(version);
      candidate = { project, lease: null, queue: null, unsubscribe: null };
      await acquire(candidate);
      await waitForHostMediaController();
      const data = await hostSession.request(`/api/v1/projects/${encodeURIComponent(project.projectId)}`);
      if (!data.editorSnapshot) throw new Error("此项目还没有已保存的完整编辑快照。");
      candidate.project = data;
      const prepared = await latest.current.prepareCompleteProject(data.editorSnapshot, project.projectId);
      ensureOperation(version);
      if (signature(latest.current.captureCompleteProject()) !== originalSignature || latest.current.isEditorBusy?.()) {
        throw new Error("打开期间当前内容发生变化，已保留当前时间线。请保存后重新打开。");
      }
      await acquire(candidate);
      ensureOperation(version);
      if (previous?.lease && previous.lease.editorSessionId !== candidate.lease.editorSessionId) {
        await hostSession.request(`/api/v1/editor-sessions/${encodeURIComponent(previous.lease.editorSessionId)}`, undefined, undefined, { method: "DELETE" });
        previous.lease = null;
      }
      ensureOperation(version);
      const restoredSignature = signature(prepared.captured);
      installQueue(candidate);
      previous?.unsubscribe?.(); previous?.queue?.close();
      clearTimeout(captureTimer.current); pendingCapture.current = false;
      binding.current = candidate;
      lastSignature.current = restoredSignature; observedSignature.current = restoredSignature;
      prepared.apply();
      remember(candidate);
      setState({ ...candidate.queue.getSnapshot(), status: "opened", name: project.name });
      latest.current.notify(ht("opened"));
    } catch (error) {
      if (candidate?.lease && candidate.lease.editorSessionId !== previous?.lease?.editorSessionId) {
        await hostSession.request(`/api/v1/editor-sessions/${encodeURIComponent(candidate.lease.editorSessionId)}`, undefined, undefined, { method: "DELETE" }).catch(() => {});
      }
      if (version !== operationVersion.current) return;
      const message = error?.code === "PROJECT_ID_CONFLICT" ? "请先在文件菜单关闭正在编辑的项目副本，再打开所选目录。"
        : error instanceof Error ? error.message : "打开完整项目失败。";
      setState(old => ({ ...old, status: "error", error: message, errorCode: error?.code })); latest.current.notify(hostErrorText(language, error));
    } finally { if (version === operationVersion.current) creating.current = false; }
  };

  const resetProject = async (closeCurrent = false) => {
    if (creating.current) return;
    const current = binding.current;
    if (closeCurrent && !current) return;
    if (analysis.running || analysis.unresolved || analysis.pendingSave || scriptReview.saving) { latest.current.notify(ht("wait")); return; }
    if ((pendingCapture.current || (current?.queue?.busy() && !(current.conflict && current.queue.canAbandonUnsubmitted()))) || latest.current.isEditorBusy?.()) {
      latest.current.notify(ht("wait")); return;
    }
    if (!window.confirm(ht(closeCurrent ? "closeConfirm" : "newConfirm"))) return;
    const originalSignature = signature(latest.current.captureCompleteProject());
    const version = ++operationVersion.current;
    creating.current = true;
    try {
      if (current?.lease) {
        await hostSession.request(`/api/v1/editor-sessions/${encodeURIComponent(current.lease.editorSessionId)}`, undefined, undefined, { method: "DELETE" });
        current.lease = null;
      }
      ensureOperation(version);
      if (signature(latest.current.captureCompleteProject()) !== originalSignature || latest.current.isEditorBusy?.()) {
        throw new Error("当前内容发生变化，已保留时间线。请保存后重试。");
      }
      current?.unsubscribe?.(); current?.queue?.close(); binding.current = null;
      clearTimeout(captureTimer.current); pendingCapture.current = false;
      lastSignature.current = ""; observedSignature.current = "";
      try { sessionStorage.removeItem(PROJECT_BINDING_KEY); } catch { /* Memory-only mode. */ }
      latest.current.handleNewProject({ confirmed: true, complete: true, ...(closeCurrent ? { closed: true } : {}) });
      setState({ status: "unbound", name: "", pending: 0, lastSaved: null, error: "" });
    } catch (error) {
      if (version === operationVersion.current) {
        setState(old => ({ ...old, status: "error", error: error.message, errorCode: error.code })); latest.current.notify(hostErrorText(language, error));
      }
    } finally { if (version === operationVersion.current) creating.current = false; }
  };
  latest.current.open = open;

  useEffect(() => {
    const current = binding.current;
    if (!current?.queue || creating.current) return undefined;
    try {
      const captured = captureCompleteProject();
      const nextSignature = signature(captured);
      if (nextSignature === observedSignature.current) return undefined;
      observedSignature.current = nextSignature;
      clearTimeout(captureTimer.current);
      pendingCapture.current = nextSignature !== lastSignature.current;
      if (!pendingCapture.current) return undefined;
      setState(previous => ({ ...previous, status: previous.status === "error" ? "error" : "dirty" }));
      captureTimer.current = setTimeout(() => {
        pendingCapture.current = false;
        current.queue.enqueue(captured);
        lastSignature.current = nextSignature;
      }, 750);
    } catch (error) {
      pendingCapture.current = true;
      setState(previous => previous.error === error.message ? previous : { ...previous, status: "error", error: error.message, errorCode: error.code });
    }
    return undefined;
  }, [captureCompleteProject]);

  useEffect(() => {
    if (!hostSession) return undefined;
    let disposed = false;
    let timer;
    const operations = operationVersion;
    const resumeTimer = setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(PROJECT_BINDING_KEY) || "null");
        if (!saved) return;
        if (typeof saved.projectId !== "string" || saved.instanceId !== hostSession.getSnapshot().session?.instanceId) {
          sessionStorage.removeItem(PROJECT_BINDING_KEY); return;
        }
        if (!binding.current && !creating.current) void latest.current.open(saved.projectId);
      } catch { /* No valid remembered project. */ }
    }, 0);
    const renew = async () => {
      if (disposed || hostSession.getSnapshot().connection === "draining") return;
      const current = binding.current;
      const lease = current?.lease;
      if (lease) {
        try {
          const renewed = await hostSession.request(`/api/v1/editor-sessions/${encodeURIComponent(lease.editorSessionId)}/renew`, { revision: lease.revision });
          if (!disposed && binding.current === current && current.lease === lease) current.lease = renewed;
        } catch (error) {
          if (!disposed && binding.current === current && current.lease === lease && hostSession.getSnapshot().connection !== "draining") {
            if (["EDITOR_SESSION_EXPIRED", "REVISION_CONFLICT"].includes(error?.code)) {
              try {
                await acquire(current, () => !disposed && binding.current === current);
                if (!disposed && binding.current === current && current.lease !== lease) {
                  const queued = current.queue?.getSnapshot();
                  // Recovery is specific to the lease; unrelated failures stay visible.
                  if (!current.conflict && queued?.status === "error" && queued.errorCode === "EDITOR_SESSION_EXPIRED") current.queue.retry();
                  if (queued?.status !== "error") setState(previous => ({ ...previous, error: "" }));
                }
              } catch (recoveryError) {
                if (!disposed && binding.current === current) {
                  // Retain the recovered lease for an explicit close/reopen, but
                  // preserve project conflicts until the user resolves them.
                  if (recoveryError?.code !== "PROJECT_REVISION_CONFLICT") current.lease = null;
                  setState(previous => ({ ...previous, status: "error", error: recoveryError.message, errorCode: recoveryError.code }));
                }
              }
            } else {
              current.lease = null;
              setState(previous => ({ ...previous, status: "error", error: error.message, errorCode: error.code }));
            }
          }
        }
      }
      if (!disposed && hostSession.getSnapshot().connection !== "draining") timer = setTimeout(renew, 20_000);
    };
    timer = setTimeout(renew, 20_000);
    const preventLoss = (event) => {
      if (binding.current && (pendingCapture.current || binding.current.queue?.busy())) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => {
      disposed = true; operations.current++; creating.current = false;
      clearTimeout(timer); clearTimeout(resumeTimer); clearTimeout(captureTimer.current); window.removeEventListener("beforeunload", preventLoss);
      const current = binding.current;
      current?.unsubscribe?.(); current?.queue?.close();
      binding.current = null;
    };
  }, [acquire, hostSession]);

  const getAnalysisContext = async () => {
    const current = binding.current;
    if (!current || creating.current) throw new Error("Open or save a complete project first.");
    if (!current.lease || Date.parse(current.lease.expiresAt) <= Date.now()) await acquire(current);
    if (binding.current !== current) throw new Error("Project changed.");
    return { projectId: current.project.projectId, editorSessionId: current.lease.editorSessionId };
  };
  const analysis = useMaterialAnalysis({ hostSession, language, getContext: getAnalysisContext, isEditorBusy: () => latest.current.isAnalysisBusy?.() });
  const scriptReview = useScriptReview({ hostSession, getContext: getAnalysisContext });
  const execution = {
    context: getAnalysisContext,
    async request(path, body, key) {
      const context = await getAnalysisContext();
      return hostSession.request(`/api/v1/projects/${encodeURIComponent(context.projectId)}/${path}`,
        body === undefined ? undefined : { ...body, editorSessionId: context.editorSessionId }, key, { signal: AbortSignal.timeout(300_000) });
    },
    async registerMedia(asset) {
      await getAnalysisContext();
      const current = binding.current;
      if (!current?.queue) throw new Error("Save the complete project first.");
      const source = asset.projectMedia?.projectId === current.project.projectId && asset.projectMedia.bindings?.blob
        ? projectMediaUrl(current.project.projectId, asset.projectMedia.bindings.blob) : asset.blob || asset.src;
      const ref = await current.queue.registerMedia(source, asset.name, "execution-result", AbortSignal.timeout(300_000));
      if (binding.current !== current) throw new Error("Project changed.");
      return ref;
    },
  };
  return hostSession ? { ...state, analysis, scriptReview, execution,
    canClose: () => !analysis.running && !analysis.unresolved && !analysis.pendingSave && !scriptReview.saving && !creating.current && !pendingCapture.current && (!binding.current?.queue?.busy() ||
      Boolean(binding.current.conflict && binding.current.queue.canAbandonUnsubmitted())),
    importPortable: (file) => {
      if (projectFileInputRef.current) projectFileInputRef.current.value = "";
      if (binding.current || creating.current) { notify(ht("importBound")); return; }
      return handleImportProject(file);
    }, error: binding.current?.conflict ? hostErrorText(language, { code: "PROJECT_REVISION_CONFLICT" }) : state.error ? hostErrorText(language, { code: state.errorCode }) : "", save, open, projectId: binding.current?.project.projectId,
    newProject: () => resetProject(), closeProject: () => resetProject(true),
    busy: () => analysis.running || analysis.unresolved || Boolean(analysis.pendingSave) || scriptReview.saving || creating.current || pendingCapture.current || Boolean(binding.current?.queue?.busy()) } : null;
}
