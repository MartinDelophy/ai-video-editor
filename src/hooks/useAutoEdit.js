import { useCallback, useEffect, useRef, useState } from "react";
import { createAutoEditTranslator, createFrameCaptionSession, extractAutoEditFrames, generateFrameCaptions, generateImageVoiceoverText, probeBuiltInAI } from "../lib/autoEdit.js";
import { getVisualSegmentsTotal, makeId } from "../lib/timeline.js";

export function useAutoEdit({ language, visualSegments, captionSegments, commitCaptionSegments, setCaptionsEnabled, setTrackVisibility, setSelectedSegmentId, setSelectedTrack, notify, t }) {
  const [support, setSupport] = useState({ availability: "unknown", reason: "", language: "en" });
  const [job, setJob] = useState({ running: false, progress: 0, phase: "" });
  const [review, setReview] = useState({ open: false, candidates: [], captions: [], segments: [], error: "" });
  const abortRef = useRef(null);
  const candidateUrlsRef = useRef([]);
  const clearCandidateUrls = useCallback(() => {
    candidateUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    candidateUrlsRef.current = [];
  }, []);
  useEffect(() => clearCandidateUrls, [clearCandidateUrls]);
  const checkSupport = useCallback(async () => {
    setSupport((value) => ({ ...value, availability: "checking" }));
    const result = await probeBuiltInAI(language);
    setSupport(result);
    return result;
  }, [language]);
  useEffect(() => { checkSupport(); }, [checkSupport]);
  const prepareSupport = useCallback(async () => {
    const environment = await probeBuiltInAI(language);
    if (environment.availability !== "downloadable" && environment.availability !== "downloading") {
      setSupport(environment);
      return environment;
    }
    setSupport({ ...environment, availability: "downloading", progress: 0 });
    let promptSession = null;
    let translator = null;
    const needsTranslation = environment.promptLanguage !== environment.language;
    let promptProgress = 0;
    let translationProgress = 0;
    const updateProgress = (kind, loaded) => {
      const value = Math.max(0, Math.min(1, Number(loaded) || 0));
      if (kind === "prompt") promptProgress = value;
      else translationProgress = value;
      const progress = Math.round((needsTranslation ? (promptProgress + translationProgress) / 2 : promptProgress) * 100);
      setSupport((value) => ({ ...value, availability: "downloading", progress }));
    };
    try {
      [promptSession, translator] = await Promise.all([
        createFrameCaptionSession({ language, onDownloadProgress: (loaded) => updateProgress("prompt", loaded) }),
        createAutoEditTranslator({ language, onDownloadProgress: (loaded) => updateProgress("translation", loaded) }),
      ]);
      const ready = await probeBuiltInAI(language);
      setSupport({ ...ready, progress: ready.availability === "available" ? 100 : undefined });
      return ready;
    } catch (error) {
      const failed = { ...environment, availability: "unavailable", reason: error?.name || "model-download-failed" };
      setSupport(failed);
      return failed;
    } finally {
      promptSession?.destroy?.();
      translator?.destroy?.();
    }
  }, [language]);

  const generateImageCaption = useCallback(async (segment) => {
    if (!segment?.src || segment.type === "video" || support.availability !== "available" || job.running) return;
    const index = visualSegments.findIndex((item) => item.id === segment.id);
    if (index < 0) return;
    const start = visualSegments.slice(0, index).reduce((sum, item) => sum + Math.max(0, Number(item.duration) || 0), 0);
    const end = start + Math.max(0.2, Number(segment.duration) || 0.2);
    setJob({ running: true, progress: 15, phase: t("autoEditWritingCaptions") });
    try {
      const text = await generateImageVoiceoverText({ src: segment.src, language });
      const caption = { id: makeId("caption"), text, start, end, hidden: false, visualSegmentId: segment.id };
      const next = [...captionSegments, caption].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
      commitCaptionSegments(next, t("imageAiCaptionAdded"), next.findIndex((item) => item.id === caption.id));
      setCaptionsEnabled(true);
      setTrackVisibility((visibility) => ({ ...visibility, caption: true }));
      setSelectedTrack("caption"); setSelectedSegmentId(caption.id);
      notify(t("imageAiCaptionAdded"));
    } catch (error) {
      console.error(error);
      notify(t("imageAiCaptionFailed"));
    } finally {
      setJob({ running: false, progress: 0, phase: "" });
    }
  }, [captionSegments, commitCaptionSegments, job.running, language, notify, setCaptionsEnabled, setSelectedSegmentId, setSelectedTrack, setTrackVisibility, support.availability, t, visualSegments]);
  const run = useCallback(async () => {
    if (!visualSegments.length || job.running) return;
    const environment = support.availability === "unknown" ? await checkSupport() : support;
    if (environment.availability === "unavailable") return void notify(t("autoEditUnavailable"));
    abortRef.current = new AbortController();
    clearCandidateUrls();
    setReview({ open: true, candidates: [], captions: [], segments: [], error: "" });
    let session = null;
    let translator = null;
    setJob({ running: true, progress: 2, phase: t("autoEditFindingScenes") });
    // Chrome requires LanguageModel.create() to happen during the button's
    // transient user activation when the model still needs downloading.
    const sessionPromise = createFrameCaptionSession({
      language,
      signal: abortRef.current.signal,
      onDownloadProgress: (loaded) => setJob({ running: true, progress: Math.max(4, Math.round(loaded * 55)), phase: t("autoEditDownloadingModel") }),
    });
    const translatorPromise = createAutoEditTranslator({
      language,
      signal: abortRef.current.signal,
      onDownloadProgress: (loaded) => setJob({ running: true, progress: Math.max(4, Math.round(loaded * 55)), phase: t("autoEditDownloadingModel") }),
    });
    try {
      const frames = await extractAutoEditFrames(visualSegments, (progress) => setJob({ running: true, progress, phase: t("autoEditFindingScenes") }), abortRef.current.signal);
      const candidates = frames.map((frame, index) => {
        const url = URL.createObjectURL(frame.blob);
        candidateUrlsRef.current.push(url);
        return { id: `${frame.segmentId}-${index}`, segmentId: frame.segmentId, segmentIndex: frame.segmentIndex, segmentName: frame.segmentName, url, time: frame.time, difference: frame.difference, aspectRatio: frame.aspectRatio };
      });
      const segments = candidates.reduce((items, candidate) => items.some((item) => item.id === candidate.segmentId) ? items : [...items, { id: candidate.segmentId, index: candidate.segmentIndex, name: candidate.segmentName, status: "waiting", error: "" }], []);
      setReview((value) => ({ ...value, candidates, segments }));
      setJob({ running: true, progress: 60, phase: t("autoEditWritingCaptions") });
      session = await sessionPromise;
      translator = await translatorPromise;
      const captions = await generateFrameCaptions({
        frames, duration: getVisualSegmentsTotal(visualSegments), language, session, translator,
        onPartial: (partial) => {
          const modelProgress = partial.allWindows ? partial.completedWindows / partial.allWindows : 0;
          setJob({ running: true, progress: Math.min(96, 60 + Math.round(modelProgress * 36)), phase: t("autoEditWritingCaptions") });
          setReview((value) => ({
            ...value,
            captions: partial.captions.length ? [...value.captions.filter((caption) => caption.visualSegmentId !== partial.segmentId), ...partial.captions].sort((a, b) => a.start - b.start) : value.captions,
            segments: value.segments.map((segment) => segment.id === partial.segmentId ? { ...segment, status: partial.status, error: partial.error || "", windowIndex: partial.windowIndex || 0, totalWindows: partial.totalWindows || 0 } : segment),
          }));
        },
      });
      if (!captions.length) {
        setJob({ running: false, progress: 100, phase: t("autoEditNoResults") });
        return;
      }
      setReview((value) => ({ ...value, captions }));
      setJob({ running: false, progress: 100, phase: t("autoEditDone") });
    } catch (error) {
      if (error?.name !== "AbortError") setReview((value) => ({ ...value, error: error?.message || String(error) }));
      setJob({ running: false, progress: 0, phase: "" });
    } finally {
      session?.destroy?.();
      translator?.destroy?.();
    }
  }, [checkSupport, clearCandidateUrls, job.running, language, notify, support, t, visualSegments]);
  const cancel = () => { abortRef.current?.abort(); setJob({ running: false, progress: 0, phase: "" }); };
  const closeReview = () => {
    if (job.running) abortRef.current?.abort();
    setJob({ running: false, progress: 0, phase: "" });
    setReview({ open: false, candidates: [], captions: [], segments: [], error: "" });
    clearCandidateUrls();
  };
  const applyCaptions = () => {
    if (!review.captions.length) return;
    commitCaptionSegments(review.captions);
    setCaptionsEnabled(true); setSelectedTrack("caption"); setSelectedSegmentId(review.captions[0].id);
    notify(t("autoEditDone"));
    closeReview();
  };
  return { support, job, review, checkSupport, prepareSupport, run, generateImageCaption, cancel, closeReview, applyCaptions };
}
