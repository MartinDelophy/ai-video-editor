import { useEffect, useRef, useState } from "react";
import { browserProjectFingerprint } from "../lib/browserEditPlan.js";
import { buildSilenceRemovalReview, canRemovePauses, findPauseCandidates } from "../lib/silenceRemoval.js";
import { analyzeVideoPauses } from "../lib/sileroVad.js";

export function useSilenceRemoval(options) {
  const [settings, setSettings] = useState({ minimum: 0.8, keep: 0.3 });
  const [draft, setDraft] = useState(null);
  const [job, setJob] = useState({ running: false, progress: 0, phase: "" });
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => () => abortRef.current?.abort(), []);
  const { selectedSegment: segment, visualSegments, rippleEditing, locked, projectVersion } = options;
  const index = visualSegments.findIndex((clip) => clip.id === segment?.id);
  const supported = segment?.type === "video" && canRemovePauses(segment, visualSegments[index - 1]);
  const stale = Boolean(draft && (draft.version !== projectVersion || draft.clip.id !== segment?.id));

  const cancel = () => {
    abortRef.current?.abort(); abortRef.current = null;
    setJob({ running: false, progress: 0, phase: "" });
  };
  const run = async () => {
    if (abortRef.current || !supported || locked) return;
    const controller = new AbortController(); abortRef.current = controller;
    const captured = { ...segment };
    const snapshot = options.getSnapshot();
    const runtime = options.getRuntime();
    const fingerprint = browserProjectFingerprint(snapshot, false, runtime.visualSegments, runtime);
    setError(""); setDraft(null); setJob({ running: true, progress: 0, phase: "pauseDownloading" });
    try {
      const probabilities = await analyzeVideoPauses(captured, {
        language: options.language, signal: controller.signal,
        onProgress: (progress, phase) => {
          if (!controller.signal.aborted) setJob({ running: true, progress, phase });
        },
      });
      controller.signal.throwIfAborted();
      setDraft({ clip: captured, fingerprint, probabilities, version: projectVersion,
        start: runtime.visualSegments.slice(0, index).reduce((sum, clip) => sum + clip.duration, 0),
        candidates: findPauseCandidates(probabilities, captured, settings) });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.code || "pauseFailed");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null; setJob({ running: false, progress: 0, phase: "" });
      }
    }
  };
  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next); setError("");
    if (draft && !stale) setDraft({ ...draft, candidates: findPauseCandidates(draft.probabilities, draft.clip, next) });
  };
  const toggle = (id) => {
    setError("");
    setDraft((current) => ({ ...current, candidates: current.candidates.map((cut) => cut.id === id ? { ...cut, enabled: !cut.enabled } : cut) }));
  };
  const apply = () => {
    if (!draft || job.running) return;
    const current = latest.current;
    const now = current.getSnapshot(); const live = current.getRuntime();
    if (current.selectedSegment?.id !== draft.clip.id
      || browserProjectFingerprint(now, false, live.visualSegments, live) !== draft.fingerprint) {
      setError("pauseStale"); return;
    }
    try {
      const review = buildSilenceRemovalReview(now, live, draft.clip.id, draft.candidates, current.rippleEditing);
      current.applyReview(review, current.t("pauseApplied"));
      setDraft(null); setError("");
    } catch (failure) { setError(failure.code?.startsWith("pause") ? failure.code : "pauseStale"); }
  };
  return { segment, supported, locked, settings, updateSettings, draft, stale, job, error, run, cancel, toggle, apply,
    rippleEditing, setRippleEditing: options.setRippleEditing,
    preview: (cut) => { if (!stale) options.seekTo(draft.start + Math.max(0, cut.start - 0.25)); },
  };
}
