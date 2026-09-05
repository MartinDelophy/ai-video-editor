import { useCallback, useEffect, useRef, useState } from "react";
import { getAnnaDraftErrorCode, readAnnaDraft, readAnnaDraftMetadata, saveAnnaDraft } from "../lib/annaDraftStorage.js";

const INITIAL_STATE = { status: "idle", errorCode: "", savedAt: "", bytes: 0 };

/** Explicit local .timeline checkpoints; never overwrite a draft on startup. */
export function useAnnaDraft({ enabled, createArchive, importProject, hasContent }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [available, setAvailable] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const checkGenerationRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; checkGenerationRef.current += 1; };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || busyRef.current) return false;
    const generation = ++checkGenerationRef.current;
    setState((current) => ({ ...current, status: "checking", errorCode: "" }));
    try {
      const draft = await readAnnaDraftMetadata();
      if (!mountedRef.current || generation !== checkGenerationRef.current) return false;
      setAvailable(Boolean(draft));
      setState({ ...INITIAL_STATE, ...(draft || {}) });
      return Boolean(draft);
    } catch (error) {
      if (mountedRef.current && generation === checkGenerationRef.current) {
        setAvailable(false);
        setState((current) => ({ ...current, status: "error", errorCode: getAnnaDraftErrorCode(error) }));
      }
      return false;
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) refresh();
    return () => { checkGenerationRef.current += 1; };
  }, [enabled, refresh]);

  const save = useCallback(async () => {
    if (!enabled || !hasContent || busyRef.current) return false;
    busyRef.current = true;
    checkGenerationRef.current += 1;
    setState((current) => ({ ...current, status: "saving", errorCode: "" }));
    try {
      const archive = await createArchive();
      const draft = await saveAnnaDraft(archive);
      if (mountedRef.current) {
        setAvailable(true);
        setState({ status: "saved", errorCode: "", ...draft });
      }
      return true;
    } catch (error) {
      if (mountedRef.current) {
        setState((current) => ({ ...current, status: "error", errorCode: getAnnaDraftErrorCode(error, "write") }));
      }
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [createArchive, enabled, hasContent]);

  const restore = useCallback(async () => {
    if (!enabled || busyRef.current) return false;
    busyRef.current = true;
    checkGenerationRef.current += 1;
    setState((current) => ({ ...current, status: "restoring", errorCode: "" }));
    let stage = "read";
    try {
      const draft = await readAnnaDraft();
      if (!draft) {
        if (mountedRef.current) {
          setAvailable(false);
          setState({ ...INITIAL_STATE, status: "error", errorCode: "missing" });
        }
        return false;
      }
      stage = "import";
      const restored = await importProject(draft.archive);
      if (restored !== true) throw Object.assign(new Error("Anna draft import failed"), { draftCode: "import" });
      if (mountedRef.current) {
        setAvailable(true);
        setState({ status: "restored", errorCode: "", savedAt: draft.savedAt, bytes: draft.bytes });
      }
      return true;
    } catch (error) {
      if (mountedRef.current) {
        setState((current) => ({ ...current, status: "error", errorCode: getAnnaDraftErrorCode(error, stage) }));
      }
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [enabled, importProject]);

  const busy = ["checking", "saving", "restoring"].includes(state.status);
  return {
    state,
    available,
    canSave: Boolean(enabled && hasContent && !busy),
    canRestore: Boolean(enabled && available && !busy),
    save,
    restore,
    refresh,
  };
}
