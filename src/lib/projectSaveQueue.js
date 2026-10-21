import { serializeProjectSnapshot } from "./projectSnapshot.js";

function waitForPoll(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 500);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

// One queue belongs to one opened project. Uncertain requests remain at its head.
export function createProjectSaveQueue({ hostSession, projectId, getEditorSessionId, editorSequence = -1, fetchMedia = fetch }) {
  const listeners = new Set();
  const pending = [];
  const blobs = new WeakMap();
  const urls = new Map();
  let sequence = editorSequence;
  let active = null;
  let closed = false;
  let snapshot = { status: "idle", pending: 0, savedSequence: editorSequence, lastSaved: null, error: "", errorCode: "" };
  const publish = (changes) => {
    snapshot = { ...snapshot, ...changes, pending: pending.length };
    for (const listener of listeners) listener();
  };
  const request = (path, body, key, signal) => hostSession.request(path, body, key, { signal });
  const endpoint = `/api/v1/projects/${encodeURIComponent(projectId)}`;

  async function registerMedia(source, name, path, signal) {
    const cache = source instanceof Blob ? blobs : urls;
    let item = cache.get(source);
    if (!item) {
      item = { key: crypto.randomUUID(), name: String(name || path).slice(0, 1024), blob: source instanceof Blob ? source : null };
      cache.set(source, item);
    }
    if (item.ref) return item.ref;
    if (typeof source === "string") {
      const origin = globalThis.location?.origin;
      const url = origin ? new URL(source, origin) : null;
      const parts = url?.pathname.split("/");
      if (url?.origin === origin && parts?.length === 8 && parts[1] === "api" && parts[2] === "v1" &&
          parts[3] === "projects" && decodeURIComponent(parts[4]) === projectId && parts[5] === "assets" && parts[7] === "content") {
        const assetId = decodeURIComponent(parts[6]);
        const asset = await request(`${endpoint}/assets/${encodeURIComponent(assetId)}`, undefined, undefined, signal);
        if (asset.assetId !== assetId || asset.mediaRef?.entityId !== assetId || asset.mediaRef?.blobId !== url.searchParams.get("blobId")) {
          throw new Error("项目媒体地址与当前素材身份不一致。");
        }
        item.ref = asset.mediaRef;
        return item.ref;
      }
    }
    if (!item.blob) {
      const response = await fetchMedia(source, { credentials: "omit", cache: "no-store", signal });
      if (!response.ok) throw new Error(`无法读取素材 ${name}（HTTP ${response.status}）`);
      item.blob = await response.blob();
    }
    if (!item.receipt) {
      item.receipt = await hostSession.upload(projectId, item.blob,
        { name: item.name, mimeType: item.blob.type, editorSessionId: getEditorSessionId() }, item.key, signal);
    }
    if (item.registrationRetry) {
      const retry = item.registrationRetry;
      item.receipt = await request(`/api/v1/results/${encodeURIComponent(retry.resultId)}/registration-retries`,
        { editorSessionId: getEditorSessionId(), expectedSaveId: retry.saveId }, retry.key, signal);
      item.registrationRetry = null;
    }
    for (;;) {
      const task = await request(`/api/v1/tasks/${encodeURIComponent(item.receipt.taskId)}`, undefined, undefined, signal);
      if (task.status === "failed" || task.status === "cancelled") {
        if (task.status === "failed" && task.resultId && task.saveId) {
          item.registrationRetry = { resultId: task.resultId, saveId: task.saveId, key: crypto.randomUUID() };
        }
        throw Object.assign(new Error(task.error?.message || `素材登记失败：${name}`), { code: task.error?.code, taskId: task.taskId });
      }
      if (task.status === "succeeded") {
        const asset = await request(`${endpoint}/assets/${encodeURIComponent(task.assetId)}`, undefined, undefined, signal);
        if (asset.assetId !== task.assetId || asset.mediaRef?.entityId !== task.assetId || asset.mediaRef?.kind !== "media") {
          throw new Error("素材登记回执与素材身份不一致。");
        }
        item.ref = asset.mediaRef;
        return item.ref;
      }
      await waitForPoll(signal);
    }
  }

  async function pump() {
    if (closed || active || !pending.length) return;
    const controller = new AbortController();
    active = controller;
    publish({ status: "saving", error: "", errorCode: "" });
    try {
      while (pending.length && !closed) {
        const job = pending[0];
        if (!job.receipt) getEditorSessionId();
        job.snapshot ??= await serializeProjectSnapshot(job.captured, {
          editorSnapshotId: job.snapshotId, editorSequence: job.sequence,
          registerMedia: (source, name, path) => registerMedia(source, name, path, controller.signal),
        });
        if (!job.receipt) {
          const editorSessionId = getEditorSessionId();
          const alreadyUnknown = Boolean(job.unknownOutcome);
          job.unknownOutcome = true;
          try {
            job.receipt = await request(`${endpoint}/editor-snapshots`, { ...job.snapshot, editorSessionId }, job.key, controller.signal);
            job.unknownOutcome = false;
          } catch (error) {
            const rejected = ["EDITOR_SESSION_EXPIRED", "SESSION_EXPIRED", "AUTH_REQUIRED", "WRITE_SESSION_REQUIRED", "INVALID_ARGUMENT", "OUT_OF_ORDER_SNAPSHOT", "REFERENCE_INVALID"].includes(error?.code);
            if (rejected && !alreadyUnknown) job.unknownOutcome = false;
            throw error;
          }
        }
        for (;;) {
          const saved = await request(`/api/v1/saves/${encodeURIComponent(job.receipt.saveId)}`, undefined, undefined, controller.signal);
          if (saved.editorSnapshotId !== job.snapshotId || saved.editorSequence !== job.sequence) {
            throw new Error("保存回执与当前快照不一致。");
          }
          if (saved.status === "failed") {
            job.failed = true;
            throw Object.assign(new Error(saved.error?.message || "项目保存失败。"), { code: saved.error?.code });
          }
          if (saved.status === "succeeded") {
            if (!saved.savePointId) throw new Error("保存回执缺少完整保存点。");
            pending.shift();
            publish({ savedSequence: job.sequence, lastSaved: new Date().toISOString() });
            break;
          }
          await waitForPoll(controller.signal);
        }
      }
      if (!closed) publish({ status: "idle" });
    } catch (error) {
      publish({ status: closed ? "closed" : "error", error: error instanceof Error ? error.message : "项目保存中断，请重试。", errorCode: error?.code || "" });
    } finally { active = null; }
  }

  return {
    registerMedia,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    enqueue(captured) {
      if (closed) throw new Error("项目保存队列已关闭。");
      if (!Number.isSafeInteger(sequence + 1)) throw new Error("项目编辑序号超出支持范围。");
      pending.push({ captured, sequence: ++sequence, snapshotId: crypto.randomUUID(), key: crypto.randomUUID() });
      publish({});
      if (snapshot.status !== "error") void pump();
      return sequence;
    },
    async reconcileUnknown() {
      if (closed || active || !pending[0]?.unknownOutcome) return;
      const job = pending[0], controller = new AbortController();
      active = controller; publish({ status: "saving", error: "", errorCode: "" });
      try {
        const result = await request(`${endpoint}/editor-snapshot-requests/${encodeURIComponent(job.key)}`, undefined, undefined, controller.signal);
        if (closed) return;
        if (!result.receipt) throw Object.assign(new Error("The save outcome is still unknown; current edits are retained."), { code: "SAVE_OUTCOME_UNKNOWN" });
        if (result.receipt.editorSnapshotId !== job.snapshotId || result.receipt.editorSequence !== job.sequence) {
          throw Object.assign(new Error("The save receipt does not match this snapshot."), { code: "SAVE_RECEIPT_MISMATCH" });
        }
        job.receipt = result.receipt; job.unknownOutcome = false;
        active = null;
        await pump();
      } catch (error) {
        publish({ status: closed ? "closed" : "error", error: error.message, errorCode: error?.code || "" });
      } finally { if (active === controller) active = null; }
    },
    retry() {
      if (closed || active) return;
      // Only a confirmed pre-commit failure permits a new request identity.
      if (pending[0]?.failed) {
        pending[0].key = crypto.randomUUID(); pending[0].receipt = null; pending[0].failed = false;
      }
      void pump();
    },
    hasUnknownOutcome: () => pending.some(job => job.unknownOutcome),
    canAbandonUnsubmitted: () => !active && pending.every(job => job.failed || (!job.receipt && !job.unknownOutcome)),
    ownsPendingSnapshot: (id, sequence) => pending.some(job => job.snapshotId === id && job.sequence === sequence),
    busy: () => pending.length > 0 || active !== null,
    close() { closed = true; active?.abort(new Error("项目保存已停止。")); publish({ status: "closed" }); listeners.clear(); },
  };
}
