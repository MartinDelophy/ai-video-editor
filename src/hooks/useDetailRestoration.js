import { useEffect, useRef, useState } from "react";

import { restoreDetailImage, restoreDetailVideo } from "../lib/hdDetailRestoration.js";
import { DEFAULT_DETAIL_SETTINGS, normalizeDetailSettings } from "../lib/detailEnhancement.js";

function makeName(segment) {
  const base = String(segment?.name || segment?.type || "media").replace(/\.[^.]+$/, "");
  return `${base}-detail-enhanced.${segment?.type === "video" ? "mp4" : "png"}`;
}

const EMPTY_JOB = {
  running: false,
  progress: 0,
  phaseKey: "",
  frameIndex: 0,
  totalFrames: 0,
  backend: "",
};

export function useDetailRestoration({
  selectedSegment,
  imageUrlRefs,
  setVisualSegments,
  setUserAssets,
  notify,
  t,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_DETAIL_SETTINGS);
  const [job, setJob] = useState(EMPTY_JOB);
  const resultRef = useRef(null);
  const controllerRef = useRef(null);
  const savedEnhancement = ["nanovsr-644k", "detail-enhancement"].includes(selectedSegment?.enhancement?.mode)
    ? selectedSegment.enhancement
    : null;
  const sourceSegment = savedEnhancement?.original?.src
    ? { ...selectedSegment, ...savedEnhancement.original, type: selectedSegment.type, name: selectedSegment.name }
    : selectedSegment;

  const clearResult = () => {
    if (resultRef.current?.ownedUrl && resultRef.current.url) URL.revokeObjectURL(resultRef.current.url);
    resultRef.current = null;
    setResult(null);
  };

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setDialogOpen(false);
    clearResult();
    setJob(EMPTY_JOB);
    setSettings(DEFAULT_DETAIL_SETTINGS);
  }, [selectedSegment?.id]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    if (resultRef.current?.ownedUrl && resultRef.current.url) URL.revokeObjectURL(resultRef.current.url);
  }, []);

  const openDialog = () => {
    setSettings(normalizeDetailSettings(resultRef.current?.settings ?? savedEnhancement?.settings));
    if (!selectedSegment || !["image", "video"].includes(selectedSegment.type)) {
      notify(t("hdRestoreSelectMedia"));
      return;
    }
    if (!resultRef.current && savedEnhancement?.processed?.src) {
      const ownedUrl = savedEnhancement.processed.blob instanceof Blob;
      const url = ownedUrl ? URL.createObjectURL(savedEnhancement.processed.blob) : savedEnhancement.processed.src;
      const savedResult = {
        ...savedEnhancement.processed,
        blob: savedEnhancement.processed.blob,
        url,
        ownedUrl,
        type: selectedSegment.type,
        backend: savedEnhancement.backend || "local",
        settings: normalizeDetailSettings(savedEnhancement.settings),
        frameRate: savedEnhancement.frameRate,
        totalFrames: savedEnhancement.totalFrames,
      };
      resultRef.current = savedResult;
      setResult(savedResult);
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!job.running) setDialogOpen(false);
  };

  const run = async () => {
    if (!selectedSegment || controllerRef.current) return false;
    clearResult();
    const controller = new AbortController();
    controllerRef.current = controller;
    setJob({ ...EMPTY_JOB, running: true, progress: 1, phaseKey: "hdRestorePhasePrepare", startedAt: Date.now() });
    try {
      const restore = selectedSegment.type === "video" ? restoreDetailVideo : restoreDetailImage;
      const nextResult = await restore({
        segment: sourceSegment,
        signal: controller.signal,
        settings: normalizeDetailSettings(settings),
        onProgress: (message) => {
          if (controller.signal.aborted || controllerRef.current !== controller) return;
          setJob((current) => ({
          ...current,
          ...message,
          running: true,
          progress: message.progress ?? (message.value == null ? current.progress : Math.round(message.value * 100)),
          backend: message.backend || current.backend || "local",
        }));
        },
      });
      const url = URL.createObjectURL(nextResult.blob);
      if (controller.signal.aborted) { URL.revokeObjectURL(url); return false; }
      const next = { ...nextResult, settings: normalizeDetailSettings(settings), url, ownedUrl: true };
      resultRef.current = next;
      setResult(next);
      setJob((current) => ({ ...current, running: false, progress: 100, phaseKey: "hdRestorePhaseReady", backend: nextResult.backend || "cpu" }));
      notify(t("hdRestorePreviewReady"));
      return true;
    } catch (error) {
      if (controllerRef.current !== controller) return false;
      if (error?.name === "AbortError") notify(t("hdRestoreCanceled"));
      else notify(`${t("hdRestoreFailed")}：${error?.name === "TimeoutError" ? t("hdRestoreWorkerTimeout") : error instanceof Error ? error.message : String(error)}`);
      setJob((current) => ({ ...current, running: false }));
      return false;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const apply = () => {
    const restored = resultRef.current;
    if (!restored?.blob || !selectedSegment || job.running || JSON.stringify(restored.settings) !== JSON.stringify(normalizeDetailSettings(settings))) return false;
    const url = URL.createObjectURL(restored.blob);
    imageUrlRefs.current.add(url);
    const isVideo = selectedSegment.type === "video";
    const asset = {
      id: `detail-${crypto.randomUUID?.() ?? Date.now()}`,
      type: selectedSegment.type,
      src: url,
      blob: restored.blob,
      name: makeName(selectedSegment),
      duration: Number(selectedSegment.duration) || restored.sourceDuration || 5,
      width: restored.width,
      height: restored.height,
      meta: isVideo
        ? `${restored.width}×${restored.height} · ${(Number(selectedSegment.duration) || restored.sourceDuration || 0).toFixed(1)}s`
        : `${restored.width}×${restored.height}`,
      trackFrames: [],
    };
    setUserAssets((items) => [asset, ...items]);
    setVisualSegments((items) => items.map((item) => {
      if (item.id !== selectedSegment.id) return item;
      const original = item.enhancement?.original || {
        src: item.src,
        blob: item.blob,
        width: item.width,
        height: item.height,
        sourceStart: item.sourceStart,
        sourceDuration: item.sourceDuration,
        trackFrames: item.trackFrames || [],
      };
      const processed = {
        src: url,
        blob: restored.blob,
        width: restored.width,
        height: restored.height,
        sourceStart: 0,
        sourceDuration: restored.sourceDuration || item.sourceDuration,
        trackFrames: [],
      };
      return {
        ...item,
        ...processed,
        enhancement: {
          mode: "detail-enhancement",
          settings: restored.settings,
          enabled: true,
          original,
          processed,
          backend: restored.backend || "local",
          frameRate: restored.frameRate,
          totalFrames: restored.totalFrames,
        },
      };
    }));
    notify(t("hdRestoreApplied"));
    clearResult();
    setDialogOpen(false);
    return true;
  };

  const cancel = () => {
    if (!controllerRef.current) return;
    setJob((current) => ({ ...current, phaseKey: "hdRestorePhaseCanceling" }));
    controllerRef.current.abort();
  };

  return {
    dialogOpen,
    settings,
    setSettings,
    settingsDirty: Boolean(result && JSON.stringify(result.settings) !== JSON.stringify(normalizeDetailSettings(settings))),
    sourceSegment,
    result,
    job,
    openDialog,
    closeDialog,
    run,
    apply,
    cancel,
    clearResult,
  };
}
