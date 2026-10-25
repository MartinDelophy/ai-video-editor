import { useEffect, useRef, useState } from "react";
import { annaMusicCall, getAnnaMusicCatalog, isAnnaEdition, readAnnaMusicPending, writeAnnaMusicPending } from "../lib/annaRuntime.js";
import { buildAnnaMusicRequest } from "../plugins/generation/providers/anna/music.js";
import { getGenerationAdapter } from "../plugins/generation/adapters.js";
import { commitGenerationOutputs } from "../plugins/generation/host.js";

export function useAnnaMusic(host) {
  const [models, setModels] = useState([]), [status, setStatus] = useState("idle"), [error, setError] = useState("");
  const [pending, setPending] = useState(null), [preview, setPreview] = useState(null);
  const controller = useRef(null), pendingRef = useRef(null), mounted = useRef(true);
  const [draft, setDraft] = useState({ model: "", prompt: "", lyrics: "", instrumental: true, durationSec: "", format: "" });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const load = async () => {
    if (!isAnnaEdition || controller.current) return;
    setStatus("loading"); setError("");
    try {
      const [catalog, record] = await Promise.all([getAnnaMusicCatalog(), readAnnaMusicPending()]);
      if (!mounted.current) return;
      const list = (Array.isArray(catalog.models) ? catalog.models : []).filter(m => typeof m?.modelName === "string" && m.modelName && m.capabilities);
      setModels(list);
      setDraft(d => record?.submission && !record.finished ? { ...d, ...record.submission, lyrics: record.submission.lyrics || "", durationSec: record.submission.durationSec || "", format: record.submission.format || "" } : { ...d, model: list.some(m => m.modelName === d.model) ? d.model : (list.find(m => m.isUserPreferred) || list[0])?.modelName || "" });
      pendingRef.current = record; setPending(record); setStatus("idle");
    } catch (e) { if (mounted.current) { setError(String(e.code || e.message)); setStatus("error"); } }
  };
  const save = async record => {
    pendingRef.current = record; if (mounted.current) setPending(record);
    await writeAnnaMusicPending(record);
  };
  const run = async (resume = false) => {
    if (controller.current) return;
    const active = new AbortController(); controller.current = active;
    setError(""); setStatus("queued");
    try {
      let record = pendingRef.current;
      if (!resume) {
        if (record && !record.finished) throw new Error("pending");
        const submission = buildAnnaMusicRequest(models.find(m => m.modelName === draft.model), draft, crypto.randomUUID());
        record = { submission, createdAt: Date.now() };
        // Persist the exact request and key before a potentially billed call.
        await writeAnnaMusicPending(record);
        pendingRef.current = record; setPending(record);
      }
      if (!record?.submission) throw new Error("invalid");
      if (resume && !record.jobId) {
        let cursor;
        // Read-only recovery first; do not create another paid job.
        for (let page = 0; page < 10; page++) {
          const history = await annaMusicCall("listJobs", { clientTag: "timeline-studio-music", limit: 50, ...(cursor ? { cursor } : {}) }, { signal: active.signal });
          const found = history.jobs?.find(job => job.idempotencyKey === record.submission.idempotencyKey);
          if (found) { record = { ...record, jobId: found.jobId }; await save(record); break; }
          if (!history.nextCursor) break;
          cursor = history.nextCursor;
        }
      }
      if (!record.jobId && Date.now() - record.createdAt > 23 * 3600000) throw new Error("expired_key");
      const result = await getGenerationAdapter("anna").generate({ request: {
        mode: "text-to-music", submission: record.submission, jobId: record.jobId,
        onJob: async jobId => { record = { ...record, jobId }; await save(record); },
        onState: view => { if (mounted.current) setStatus(view.state === "succeeded" ? "saving" : view.state === "queued" ? "queued" : "running"); },
      }, signal: active.signal });
      if (active.signal.aborted) return;
      const committed = await commitGenerationOutputs(result.outputs, { ...host, notify: undefined, shouldCommit: () => mounted.current && !active.signal.aborted });
      if (!mounted.current) return;
      setPreview(committed.assets[0]); setStatus("complete");
      await save({ ...record, finished: true });
    } catch (e) {
      const code = String(e.code || e.message);
      if (!pendingRef.current?.jobId && /-3216[0235689]|MUSIC_(?:NOT_GRANTED|INVALID_REQUEST|MODEL_UNAVAILABLE|FEATURE_UNSUPPORTED|LYRICS_TOO_LONG|CONTENT_REJECTED|QUOTA_EXCEEDED)|APP_(?:NOT_GRANTED|QUOTA_EXCEEDED)/.test(code)) {
        await save({ ...pendingRef.current, finished: true }).catch(() => {});
      }
      if (mounted.current) { setError(code); setStatus("error"); }
    } finally { if (controller.current === active) controller.current = null; }
  };
  const cancel = async () => {
    const record = pendingRef.current;
    if (!record?.jobId) return;
    try {
      const view = await annaMusicCall("cancelJob", { jobId: record.jobId });
      if (view.state === "cancelled") { controller.current?.abort(); await save({ ...record, finished: true }); setStatus("cancelled"); setError(""); }
      // Running jobs may be non-cancellable; keep monitoring and retain the receipt.
    } catch (e) { setError(String(e.code || e.message)); }
  };
  const dismiss = async () => {
    if (controller.current || !pendingRef.current?.jobId) return;
    try {
      const view = await annaMusicCall("getJob", { jobId: pendingRef.current.jobId });
      if (["failed", "cancelled", "expired"].includes(view.state)) { await save({ ...pendingRef.current, finished: true }); setStatus(view.state); setError(""); }
      else setError("pending");
    } catch (e) { setError(String(e.code || e.message)); }
  };
  return { models, status, error, pending, preview, draft, setDraft, load, run, cancel, dismiss };
}
