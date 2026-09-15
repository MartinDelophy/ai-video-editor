import { useCallback, useEffect, useRef, useState } from "react";
import { readAnnaSession, saveAnnaSession, getAnnaSessionErrorCode } from "../lib/annaSessionStorage.js";
import { resolveAnnaSessionScope } from "../lib/annaRuntime.js";

/** One in-flight save; dirty edits made during it are drained to the next commit.
 * Startup never writes until the previous record has been read or restored.
 */
export function useAnnaSession({ enabled, fingerprint, hasContent, capture, restoreProject, getIntent, externalBusy, isExternallyBusy }) {
  const [state, setState] = useState({ status: "waiting", savedAt: "", errorCode: "" });
  const [tick, setTick] = useState(0);
  const latest = useRef(null);
  latest.current = { enabled, fingerprint, hasContent, capture, restoreProject, getIntent, externalBusy, isExternallyBusy };
  const control = useRef({ alive: false, epoch: 0, scope: "", revision: 0, ready: false, saving: false,
    loading: false, savedFingerprint: null, baseline: null, timer: null, pending: null, paused: false });
  const flushRef = useRef(null);
  const active = useCallback((epoch) => control.current.alive && latest.current.enabled && control.current.epoch === epoch, []);
  const publish = useCallback((epoch, patch) => { if (active(epoch)) setState((previous) => ({ ...previous, ...patch })); }, [active]);

  const load = useCallback(async (manual = false) => {
    const c = control.current;
    if (!c.alive || !latest.current.enabled || c.loading || c.saving) return;
    c.loading = true;
    c.ready = false;
    c.paused = false;
    const epoch = c.epoch;
    const before = latest.current.fingerprint;
    const intent = latest.current.getIntent();
    const unchanged = () => active(epoch) && before === latest.current.fingerprint && intent === latest.current.getIntent() && !latest.current.isExternallyBusy();
    publish(epoch, { status: "checking", errorCode: "" });
    try {
      c.scope = c.scope || await resolveAnnaSessionScope();
      if (!active(epoch)) return;
      const record = await readAnnaSession(c.scope);
      if (!active(epoch)) return;
      c.pending = record;
      c.revision = record?.revision || 0;
      if (record) {
        if (!unchanged()) {
          c.paused = true;
          publish(epoch, { status: "conflict" });
          return;
        }
        // Before a manual replacement, commit the current complete workspace.
        // The next successful save rotates it into #previous in the same scope.
        if (manual && latest.current.hasContent) {
          const currentData = await latest.current.capture();
          if (!unchanged()) { c.paused = true; publish(epoch, { status: "conflict" }); return; }
          const protectedRecord = await saveAnnaSession(c.scope, currentData, { expectedRevision: c.revision });
          c.revision = protectedRecord.revision;
        }
        if (!unchanged()) { c.paused = true; publish(epoch, { status: "conflict" }); return; }
        publish(epoch, { status: "restoring" });
        const restored = await latest.current.restoreProject(record.data, { beforeCommit: unchanged });
        if (!active(epoch)) return;
        if (!restored) {
          c.paused = true;
          publish(epoch, { status: unchanged() ? "error" : "conflict", errorCode: "restore" });
          return;
        }
      }
      c.ready = true;
      c.pending = null;
      c.baseline = record ? null : before;
      c.savedFingerprint = null;
      publish(epoch, { status: record ? "saved" : "idle", savedAt: record?.savedAt || "", errorCode: "" });
      setTick((value) => value + 1);
    } catch (error) {
      c.paused = true;
      publish(epoch, { status: "error", errorCode: getAnnaSessionErrorCode(error, "read") });
    } finally { if (active(epoch)) c.loading = false; }
  }, [active, publish]);

  const flush = useCallback(async () => {
    const c = control.current;
    clearTimeout(c.timer);
    if (!c.alive || !latest.current.enabled || !c.ready || c.paused || c.saving || latest.current.isExternallyBusy()) return;
    const current = latest.current;
    if (c.savedFingerprint === current.fingerprint) return;
    // A brand new default editor need not persist an empty startup state. Once
    // edited (including New project / deleting every clip), empty is meaningful.
    if (!current.hasContent && c.revision === 0 && c.baseline === current.fingerprint && current.getIntent() === 0) return;
    const epoch = c.epoch;
    const savedFingerprint = current.fingerprint;
    c.saving = true;
    publish(epoch, { status: "saving", errorCode: "" });
    try {
      const data = await current.capture();
      if (!active(epoch)) return;
      const result = await saveAnnaSession(c.scope, data, { expectedRevision: c.revision });
      if (!active(epoch)) return;
      c.revision = result.revision;
      c.savedFingerprint = savedFingerprint;
      publish(epoch, { status: savedFingerprint === latest.current.fingerprint ? "saved" : "saving", savedAt: result.savedAt, errorCode: "" });
    } catch (error) {
      if (active(epoch)) {
        c.paused = true;
        const errorCode = getAnnaSessionErrorCode(error, "write");
        publish(epoch, { status: errorCode === "conflict" ? "conflict" : "error", errorCode });
      }
    } finally {
      if (active(epoch)) {
        c.saving = false;
        if (!c.paused && c.savedFingerprint !== latest.current.fingerprint) c.timer = setTimeout(() => flushRef.current?.(), 0);
      }
    }
  }, [active, publish]);
  flushRef.current = flush;

  useEffect(() => {
    const c = control.current;
    c.alive = true;
    c.epoch += 1;
    c.loading = false;
    c.saving = false;
    c.ready = false;
    if (enabled) load();
    return () => { c.alive = false; c.epoch += 1; clearTimeout(c.timer); };
  }, [enabled, load]);

  useEffect(() => {
    const c = control.current;
    if (!enabled || !c.ready || c.paused || externalBusy || c.savedFingerprint === fingerprint) return undefined;
    // Commit edits as they occur; do not rely on an async unload handler.
    c.timer = setTimeout(flush, 200);
    return () => clearTimeout(c.timer);
  }, [enabled, fingerprint, externalBusy, tick, flush]);

  useEffect(() => {
    if (!enabled) return undefined;
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    const unload = (event) => {
      const c = control.current;
      const dirty = c.ready && c.savedFingerprint !== latest.current.fingerprint
        && (latest.current.hasContent || c.revision > 0 || c.baseline !== latest.current.fingerprint || latest.current.getIntent() > 0);
      if (dirty || c.saving) {
        event.preventDefault(); event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", unload);
    };
  }, [enabled, flush]);

  const keepCurrent = async () => {
    const c = control.current;
    if (!c.alive || c.loading || c.saving || !c.scope) return;
    const epoch = c.epoch;
    try {
      const record = await readAnnaSession(c.scope);
      if (!active(epoch)) return;
      c.revision = record?.revision || 0;
      c.pending = null; c.ready = true; c.paused = false; c.savedFingerprint = null; c.baseline = null;
      await flush(); // The replaced complete record remains in #previous.
    } catch (error) { publish(epoch, { status: "error", errorCode: getAnnaSessionErrorCode(error) }); }
  };
  // Reflect an edit in the same render, including while an external task delays
  // the next commit. A previously committed snapshot is not the current one.
  const dirty = enabled && control.current.ready && !control.current.paused
    && control.current.savedFingerprint !== fingerprint
    && (hasContent || control.current.revision > 0 || control.current.baseline !== fingerprint || getIntent() > 0);
  const visibleState = dirty && (state.status === "saved" || state.status === "idle")
    ? { ...state, status: "saving" } : state;
  return { state: visibleState,
    retry: () => { const c = control.current; if (!c.ready) return load(true); c.paused = false; return flush(); },
    restore: () => load(true), keepCurrent,
    busy: state.status === "restoring",
  };
}
