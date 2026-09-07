import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAnnaDraft,
  clearAnnaRecovery,
  getAnnaDraftErrorCode,
  readAnnaDraft,
  readAnnaDraftMetadata,
  readAnnaRecovery,
  readAnnaRecoveryMetadata,
  saveAnnaDraft,
  saveAnnaRecovery,
} from "../lib/annaDraftStorage.js";
import { downloadBlob } from "../lib/media.js";

const INITIAL_STATE = { status: "idle", errorCode: "", savedAt: "", bytes: 0 };
const BUSY_STATUSES = ["checking", "saving", "restoring", "clearing", "downloading", "backingUp"];
const importError = () => Object.assign(new Error("Anna draft import failed"), { draftCode: "import" });

/** Explicit checkpoints and bounded pre-restore recovery; no startup writes. */
export function useAnnaDraft({ enabled, createArchive, importProject, hasContent, externalBusy = false, getFingerprint }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [available, setAvailable] = useState(false);
  const [backups, setBackups] = useState([]);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const refreshRef = useRef(null);
  const latest = useRef(null);
  latest.current = { enabled, createArchive, importProject, hasContent, externalBusy, getFingerprint };
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; generationRef.current += 1; };
  }, []);

  // Reject overlapping actions rather than queueing an import against an old
  // project. Callers coordinating a cloud restore may explicitly own its job.
  const run = useCallback(async (status, fallback, task, { allowExternalBusy = false } = {}) => {
    if (!mountedRef.current || !latest.current.enabled || busyRef.current || (!allowExternalBusy && latest.current.externalBusy)) return false;
    busyRef.current = true;
    const generation = ++generationRef.current;
    const active = () => mountedRef.current && latest.current.enabled && generation === generationRef.current;
    const update = (next) => { if (active()) setState(next); };
    update((current) => ({ ...current, status, errorCode: "" }));
    try {
      const fingerprint = latest.current.getFingerprint?.();
      const ensureUnchanged = () => {
        if (latest.current.getFingerprint && latest.current.getFingerprint() !== fingerprint) {
          throw Object.assign(new Error("Anna project changed during recovery preparation"), { draftCode: "changed" });
        }
      };
      const result = await task({ active, update, ensureUnchanged });
      return active() && result === true;
    } catch (error) {
      update((current) => ({ ...current, status: "error", errorCode: getAnnaDraftErrorCode(error, fallback) }));
      return false;
    } finally {
      busyRef.current = false;
      if (!active() && mountedRef.current && latest.current.enabled) refreshRef.current?.();
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!mountedRef.current || !latest.current.enabled || busyRef.current || latest.current.externalBusy) return false;
    const generation = ++generationRef.current;
    const active = () => mountedRef.current && latest.current.enabled && generation === generationRef.current;
    setState((current) => ({ ...current, status: "checking", errorCode: "" }));
    try {
      const [draft, recovery] = await Promise.all([readAnnaDraftMetadata(), readAnnaRecoveryMetadata()]);
      if (!active()) return false;
      setAvailable(Boolean(draft));
      setBackups(recovery);
      setState({ ...INITIAL_STATE, ...(draft || {}) });
      return Boolean(draft);
    } catch (error) {
      if (active()) setState((current) => ({ ...current, status: "error", errorCode: getAnnaDraftErrorCode(error, "read") }));
      return false;
    }
  }, []);
  refreshRef.current = refresh;

  useEffect(() => {
    if (enabled) refresh();
    return () => { generationRef.current += 1; };
  }, [enabled, refresh]);

  const protectCurrent = useCallback(async (active, ensureUnchanged, preserveId = "recovery") => {
    if (!active()) return false;
    ensureUnchanged();
    if (!latest.current.hasContent) return true;
    const archive = await latest.current.createArchive();
    if (!active()) return false;
    ensureUnchanged();
    await saveAnnaRecovery(archive, { preserveId });
    if (!active()) return false;
    const recovery = await readAnnaRecoveryMetadata();
    if (!active()) return false;
    setBackups(recovery);
    ensureUnchanged();
    return true;
  }, []);

  const save = useCallback(() => {
    if (!latest.current.hasContent) return Promise.resolve(false);
    return run("saving", "write", async ({ active, update, ensureUnchanged }) => {
      const archive = await latest.current.createArchive();
      if (!active()) return false;
      ensureUnchanged();
      const draft = await saveAnnaDraft(archive);
      if (!active()) return false;
      setAvailable(true);
      update({ status: "saved", errorCode: "", ...draft });
      return true;
    });
  }, [run]);

  const restoreArchive = useCallback((recoveryId) => run("restoring", "read", async ({ active, update, ensureUnchanged }) => {
    ensureUnchanged();
    const draft = recoveryId ? await readAnnaRecovery(recoveryId) : await readAnnaDraft();
    if (!active()) return false;
    ensureUnchanged();
    if (!draft) {
      if (recoveryId) {
        const recovery = await readAnnaRecoveryMetadata();
        if (!active()) return false;
        setBackups(recovery);
      } else setAvailable(false);
      update((current) => ({ ...current, ...(recoveryId ? {} : { savedAt: "", bytes: 0 }), status: "error", errorCode: "missing" }));
      return false;
    }
    // Read the target first, then preserve the current full archive. If quota
    // prevents protection, do not invoke the importer or touch the checkpoint.
    try {
      if (!await protectCurrent(active, ensureUnchanged, recoveryId || "recovery")) return false;
    } catch (error) {
      throw Object.assign(new Error("Anna recovery backup failed", { cause: error }), { draftCode: getAnnaDraftErrorCode(error, "write") });
    }
    if (!active()) return false;
    ensureUnchanged();
    try {
      let guardFailure;
      const restored = await latest.current.importProject(draft.archive, {
        beforeCommit: () => {
          if (!active()) return false;
          try { ensureUnchanged(); return true; }
          catch (error) { guardFailure = error; return false; }
        },
      });
      if (!active()) return false;
      if (guardFailure) throw guardFailure;
      if (restored !== true) throw importError();
    } catch (error) {
      if (error?.draftCode === "changed") throw error;
      throw Object.assign(importError(), { cause: error });
    }
    if (!active()) return false;
    if (!recoveryId) setAvailable(true);
    update((current) => ({ ...current, ...(recoveryId ? {} : { savedAt: draft.savedAt, bytes: draft.bytes }), status: "restored", errorCode: "" }));
    return true;
  }), [protectCurrent, run]);

  const restore = useCallback(() => restoreArchive(), [restoreArchive]);
  const recoverPrevious = useCallback((id = "recovery") => restoreArchive(id), [restoreArchive]);

  const prepareRestore = useCallback((options) => run("backingUp", "write", async ({ active, update, ensureUnchanged }) => {
    const hadContent = latest.current.hasContent;
    if (!await protectCurrent(active, ensureUnchanged)) return false;
    update((current) => ({ ...current, status: hadContent ? "backedUp" : "idle", errorCode: "" }));
    return true;
  }, options), [protectCurrent, run]);

  const clear = useCallback(() => run("clearing", "write", async ({ active, update }) => {
    await clearAnnaDraft();
    if (!active()) return false;
    setAvailable(false);
    update({ ...INITIAL_STATE, status: "cleared" });
    return true;
  }), [run]);

  const clearBackup = useCallback(() => run("clearing", "write", async ({ active, update }) => {
    await clearAnnaRecovery();
    if (!active()) return false;
    setBackups([]);
    update((current) => ({ ...current, status: "cleared", errorCode: "" }));
    return true;
  }), [run]);

  const downloadArchive = useCallback((recoveryId) => run("downloading", "read", async ({ active, update }) => {
    const draft = recoveryId ? await readAnnaRecovery(recoveryId) : await readAnnaDraft();
    if (!active()) return false;
    if (!draft) {
      if (recoveryId) {
        const recovery = await readAnnaRecoveryMetadata();
        if (!active()) return false;
        setBackups(recovery);
      } else setAvailable(false);
      update((current) => ({ ...current, ...(recoveryId ? {} : { savedAt: "", bytes: 0 }), status: "error", errorCode: "missing" }));
      return false;
    }
    try {
      // This confirms delivery to the browser download mechanism, not that the
      // browser or host subsequently wrote the file to the user's filesystem.
      downloadBlob(draft.archive, `timeline-studio-${recoveryId ? "recovery" : "checkpoint"}.timeline`);
    } catch (error) {
      throw Object.assign(new Error("Anna draft download failed", { cause: error }), { draftCode: "download" });
    }
    update((current) => ({ ...current, status: "downloaded", errorCode: "" }));
    return true;
  }), [run]);
  const download = useCallback(() => downloadArchive(), [downloadArchive]);
  const downloadBackup = useCallback((id = "recovery") => downloadArchive(id), [downloadArchive]);

  const isBusy = useCallback(() => busyRef.current, []);
  const busy = BUSY_STATUSES.includes(state.status);
  const canAct = Boolean(enabled && !busy && !externalBusy);
  return {
    state, available, backups, busy, isBusy,
    backupAvailable: backups.length > 0,
    canSave: Boolean(canAct && hasContent),
    canRestore: Boolean(canAct && available),
    canClear: Boolean(canAct && available),
    canDownload: Boolean(canAct && available),
    canRecover: Boolean(canAct && backups.length),
    canClearBackup: Boolean(canAct && backups.length),
    save, restore, refresh, clear, download,
    prepareRestore, recoverPrevious, clearBackup, downloadBackup,
  };
}
