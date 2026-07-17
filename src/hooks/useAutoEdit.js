import { useCallback, useRef, useState } from "react";
import { extractAutoEditFrames, generateFrameCaptions, probeBuiltInAI } from "../lib/autoEdit.js";
import { getVisualSegmentsTotal } from "../lib/timeline.js";

export function useAutoEdit({ language, visualSegments, commitCaptionSegments, setCaptionsEnabled, setSelectedSegmentId, setSelectedTrack, notify, t }) {
  const [support, setSupport] = useState({ availability: "unknown", reason: "", language: "en" });
  const [job, setJob] = useState({ running: false, progress: 0, phase: "" });
  const abortRef = useRef(null);
  const checkSupport = useCallback(async () => {
    setSupport((value) => ({ ...value, availability: "checking" }));
    const result = await probeBuiltInAI(language);
    setSupport(result);
    return result;
  }, [language]);
  const run = useCallback(async () => {
    if (!visualSegments.length || job.running) return;
    const environment = support.availability === "unknown" ? await checkSupport() : support;
    if (environment.availability === "unavailable") return void notify(t("autoEditUnavailable"));
    abortRef.current = new AbortController();
    setJob({ running: true, progress: 2, phase: t("autoEditFindingScenes") });
    try {
      const frames = await extractAutoEditFrames(visualSegments, (progress) => setJob({ running: true, progress, phase: t("autoEditFindingScenes") }), abortRef.current.signal);
      setJob({ running: true, progress: 60, phase: t("autoEditWritingCaptions") });
      const captions = await generateFrameCaptions({ frames, duration: getVisualSegmentsTotal(visualSegments), language, onDownloadProgress: (loaded) => setJob({ running: true, progress: 60 + Math.round(loaded * 20), phase: t("autoEditDownloadingModel") }) });
      if (!captions.length) throw new Error("No captions generated");
      commitCaptionSegments(captions);
      setCaptionsEnabled(true); setSelectedTrack("caption"); setSelectedSegmentId(captions[0].id);
      setJob({ running: false, progress: 100, phase: t("autoEditDone") });
      notify(t("autoEditDone"));
    } catch (error) {
      if (error?.name !== "AbortError") notify(`${t("autoEditFailed")}: ${error?.message || error}`);
      setJob({ running: false, progress: 0, phase: "" });
    }
  }, [checkSupport, commitCaptionSegments, job.running, language, notify, setCaptionsEnabled, setSelectedSegmentId, setSelectedTrack, support, t, visualSegments]);
  const cancel = () => { abortRef.current?.abort(); setJob({ running: false, progress: 0, phase: "" }); };
  return { support, job, checkSupport, run, cancel };
}
