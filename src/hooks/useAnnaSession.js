import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAnnaSessionErrorCode } from "../lib/annaSessionStorage.js";
import { createAnnaSessionPersistence } from "../lib/annaSessionPersistence.js";

/** One in-flight save; dirty edits made during it are drained to the next commit.
 * Startup never writes until the previous record has been read or restored.
 */
export function useAnnaSession({ enabled, fingerprint, hasContent, capture, restoreProject, getIntent, externalBusy, isExternallyBusy }) {
  const [state, setState] = useState({ status: "waiting", savedAt: "", errorCode: "", storage: "cloud", migrationErrorCode: "" });
  const [tick, setTick] = useState(0);
  const latest = useRef(null);
  latest.current = { enabled, fingerprint, hasContent, capture, restoreProject, getIntent, externalBusy, isExternallyBusy };
  const control = useRef({ alive: false, epoch: 0, revision: 0, ready: false, saving: false,
    loading: false, savedFingerprint: null, baseline: null, timer: null, pending: null, paused: false,
    loadRequest: null, restoreCommit: null, renderSequence: 0, store: null });
  if (!control.current.store) control.current.store = createAnnaSessionPersistence();
  const renderSequence = ++control.current.renderSequence;
  const flushRef = useRef(null);
  const active = useCallback((epoch) => control.current.alive && latest.current.enabled && control.current.epoch === epoch, []);
  const publish = useCallback((epoch, patch) => {
    if (active(epoch)) setState((previous) => ({ ...previous, ...patch, storage: control.current.store.mode,
      migrationErrorCode: control.current.store.migrationErrorCode || "" }));
  }, [active]);

  // beforeCommit is called immediately before the importer's synchronous state
  // updates. A layout effect observes their committed render before another
  // user interaction can edit it. Never baseline a later async continuation,
  // which could already contain newer edits, or an older concurrent render.
  useLayoutEffect(() => {
    const commit = control.current.restoreCommit;
    if (!commit || !active(commit.epoch) || renderSequence <= commit.afterRender) return;
    commit.finish(fingerprint);
  });

  const load = useCallback(async (manual = false) => {
    const c = control.current;
    if (!c.alive || !latest.current.enabled || c.loading || c.saving) return;
    c.loading = true;
    c.ready = false;
    c.paused = false;
    const epoch = c.epoch;
    // Retry retains the failed read/restore's original edit boundary and target.
    // Only an explicit Restore action may replace work created since that read.
    if (manual || !c.loadRequest) c.loadRequest = {
      fingerprint: latest.current.fingerprint, intent: latest.current.getIntent(),
      explicit: manual, hasRead: false, target: null, protected: false,
    };
    const request = c.loadRequest;
    const before = request.fingerprint;
    const intent = request.intent;
    const unchanged = () => active(epoch) && before === latest.current.fingerprint && intent === latest.current.getIntent() && !latest.current.isExternallyBusy();
    let restoreCommit = null;
    publish(epoch, { status: "checking", errorCode: "" });
    try {
      const currentRecord = await c.store.read();
      if (!active(epoch)) return;
      if (request.hasRead && (currentRecord?.revision || 0) !== c.revision) {
        c.paused = true;
        publish(epoch, { status: "conflict" });
        return;
      }
      if (!request.hasRead) { request.target = currentRecord; request.hasRead = true; }
      const record = request.target;
      c.pending = record;
      c.revision = currentRecord?.revision || 0;
      if (record) {
        if (!unchanged()) {
          c.paused = true;
          publish(epoch, { status: "conflict" });
          return;
        }
        // Before a manual replacement, commit the current complete workspace.
        // The next successful save rotates it into #previous in the same scope.
        if (request.explicit && latest.current.hasContent && !request.protected) {
          const currentData = await latest.current.capture();
          if (!unchanged()) { c.paused = true; publish(epoch, { status: "conflict" }); return; }
          const protectedRecord = await c.store.save(currentData, { expectedRevision: c.revision });
          if (!active(epoch)) return;
          c.revision = protectedRecord.revision;
          request.protected = true;
        }
        if (!unchanged()) { c.paused = true; publish(epoch, { status: "conflict" }); return; }
        publish(epoch, { status: "restoring" });
        let finish;
        const rendered = new Promise((resolve) => { finish = resolve; });
        restoreCommit = { epoch, afterRender: 0, armed: false, finished: false, rendered,
          finish: (value) => {
            if (restoreCommit.finished) return;
            restoreCommit.finished = true;
            finish(value);
          } };
        const restored = await latest.current.restoreProject(record.data, { beforeCommit: () => {
          if (!unchanged()) return false;
          restoreCommit.afterRender = c.renderSequence;
          restoreCommit.armed = true;
          c.restoreCommit = restoreCommit;
          setTick((value) => value + 1);
          return true;
        } });
        if (!active(epoch)) return;
        if (!restored || !restoreCommit.armed) {
          c.paused = true;
          publish(epoch, { status: unchanged() ? "error" : "conflict", errorCode: "restore" });
          return;
        }
        const restoredFingerprint = await restoreCommit.rendered;
        if (!active(epoch)) return;
        if (restoredFingerprint === null) throw Object.assign(new Error("Restore did not commit"), { sessionCode: "read" });
        // An explicit restore may have first protected the current project by
        // saving it. Persist the restored target once so that backup rotates
        // into previous. A local migration has no cloud commit yet, even for
        // an intentionally empty project. Ordinary cloud reopen needs no save.
        c.savedFingerprint = request.protected || record.source === "local" ? null : restoredFingerprint;
      } else {
        c.savedFingerprint = null;
      }
      c.ready = true;
      c.pending = null;
      c.loadRequest = null;
      c.baseline = record ? null : before;
      publish(epoch, { status: record ? c.savedFingerprint === latest.current.fingerprint ? "saved" : "saving" : "idle", savedAt: record?.savedAt || "", errorCode: "" });
      setTick((value) => value + 1);
    } catch (error) {
      c.paused = true;
      publish(epoch, { status: "error", errorCode: getAnnaSessionErrorCode(error, "read") });
    } finally {
      restoreCommit?.finish(null);
      if (c.restoreCommit === restoreCommit) c.restoreCommit = null;
      if (active(epoch)) c.loading = false;
    }
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
      const result = await c.store.save(data, { expectedRevision: c.revision });
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
    return () => {
      c.alive = false; c.epoch += 1; clearTimeout(c.timer);
      c.restoreCommit?.finish(null);
      c.restoreCommit = null;
    };
  }, [enabled, load]);

  useEffect(() => {
    const c = control.current;
    if (!enabled || !c.ready || c.paused || externalBusy || c.savedFingerprint === fingerprint) return undefined;
    // Commit edits as they occur; do not rely on an async unload handler.
    c.timer = setTimeout(flush, c.store.mode === "cloud" ? 1500 : 200);
    return () => clearTimeout(c.timer);
  }, [enabled, fingerprint, externalBusy, tick, flush]);

  useEffect(() => {
    if (!enabled) return undefined;
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    const unload = (event) => {
      const c = control.current;
      const dirty = c.ready && c.savedFingerprint !== latest.current.fingerprint
        && (latest.current.hasContent || c.revision > 0 || c.baseline !== latest.current.fingerprint || latest.current.getIntent() > 0);
      const unsavedDuringLoad = !c.ready && (latest.current.hasContent || latest.current.getIntent() > 0);
      if (dirty || unsavedDuringLoad || c.saving) {
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
    if (!c.alive || c.loading || c.saving) return;
    const epoch = c.epoch;
    try {
      const record = await c.store.read();
      if (!active(epoch)) return;
      c.revision = record?.revision || 0;
      c.pending = null; c.loadRequest = null; c.ready = true; c.paused = false; c.savedFingerprint = null; c.baseline = null;
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
    retry: () => { const c = control.current; if (!c.ready) return load(); c.paused = false; return flush(); },
    restore: () => load(true), keepCurrent,
    busy: state.status === "restoring",
  };
}
