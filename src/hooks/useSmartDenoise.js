import { useEffect, useRef, useState } from "react";

import { enhanceRemasterClip } from "../lib/remasterClipEnhancement.js";
import { enhanceRemasterFrame } from "../lib/remasterEnhancement.js";

const MODE_STRENGTH = { light: 0.38, balanced: 0.68, strong: 1 };
const EMPTY_JOB = { running: false, kind: "", progress: 0, phaseKey: "", frameIndex: 0, totalFrames: 0, backend: "" };

function makeName(segment) {
  return `${String(segment?.name || "video").replace(/\.[^.]+$/, "")}-smart-denoise.mp4`;
}

function revoke(result) {
  if (result?.ownedUrl && result.url) URL.revokeObjectURL(result.url);
}

function estimateNoise(bitmap) {
  const width = Math.min(320, bitmap.width);
  const height = Math.max(2, Math.round(bitmap.height * width / Math.max(1, bitmap.width)));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  let residual = 0;
  let samples = 0;
  const luma = (index) => data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = (y * width + x) * 4;
      const center = luma(index);
      const average = (luma(index - 4) + luma(index + 4) + luma(index - width * 4) + luma(index + width * 4)) / 4;
      residual += Math.min(32, Math.abs(center - average));
      samples += 1;
    }
  }
  const score = Math.max(0, Math.min(1, residual / Math.max(1, samples) / 13));
  return { score, strength: Math.max(0.42, Math.min(0.92, 0.42 + score * 0.5)) };
}

export function useSmartDenoise({ selectedSegment, imageUrlRefs, setVisualSegments, setUserAssets, notify, t }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setModeState] = useState("auto");
  const [analysis, setAnalysis] = useState(null);
  const [framePreview, setFramePreview] = useState(null);
  const [result, setResult] = useState(null);
  const [job, setJob] = useState(EMPTY_JOB);
  const frameRef = useRef(null);
  const resultRef = useRef(null);
  const controllerRef = useRef(null);
  const saved = selectedSegment?.enhancement?.mode === "smart-denoise-drunet" ? selectedSegment.enhancement : null;
  const sourceSegment = saved?.original?.src
    ? { ...selectedSegment, ...saved.original, type: "video", name: selectedSegment.name }
    : selectedSegment;

  const clearPreviews = () => {
    revoke(frameRef.current); revoke(resultRef.current);
    frameRef.current = null; resultRef.current = null;
    setFramePreview(null); setResult(null);
  };

  useEffect(() => {
    controllerRef.current?.abort();
    setDialogOpen(false); clearPreviews(); setAnalysis(null); setJob(EMPTY_JOB);
  }, [selectedSegment?.id]);

  useEffect(() => () => { controllerRef.current?.abort(); revoke(frameRef.current); revoke(resultRef.current); }, []);

  const openDialog = () => {
    if (!selectedSegment || selectedSegment.type !== "video") return void notify(t("denoiseSelectVideo"));
    if (!resultRef.current && saved?.processed?.blob instanceof Blob) {
      const url = URL.createObjectURL(saved.processed.blob);
      const next = { ...saved.processed, url, ownedUrl: true, backend: saved.backend, strength: saved.strength };
      resultRef.current = next; setResult(next); setModeState(saved.preset || "auto"); setAnalysis(saved.analysis || null);
    }
    setDialogOpen(true);
  };

  const setMode = (nextMode) => {
    if (job.running || nextMode === mode) return;
    clearPreviews(); setAnalysis(null); setModeState(nextMode);
  };

  const resolveStrength = async (video) => {
    if (mode !== "auto") return MODE_STRENGTH[mode] || MODE_STRENGTH.balanced;
    if (analysis?.strength) return analysis.strength;
    const bitmap = await createImageBitmap(video);
    const next = estimateNoise(bitmap);
    bitmap.close(); setAnalysis(next);
    return next.strength;
  };

  const runFrame = async (video) => {
    if (!video || video.readyState < 2 || job.running) return false;
    revoke(frameRef.current); frameRef.current = null; setFramePreview(null);
    const controller = new AbortController(); controllerRef.current = controller;
    setJob({ ...EMPTY_JOB, running: true, kind: "frame", progress: 1, phaseKey: "remasterPhasePrepareFrame" });
    try {
      const strength = await resolveStrength(video);
      const bitmap = await createImageBitmap(video);
      const enhanced = await enhanceRemasterFrame({ bitmap, strength, signal: controller.signal, onProgress: (message) => setJob((current) => ({ ...current, ...message, running: true })) });
      const url = URL.createObjectURL(enhanced.blob);
      const next = { ...enhanced, url, ownedUrl: true, strength };
      frameRef.current = next; setFramePreview(next);
      setJob({ ...EMPTY_JOB, progress: 100, phaseKey: "denoiseFrameReady", backend: enhanced.backend });
      notify(t("denoiseFrameReady")); return true;
    } catch (error) {
      if (error?.name !== "AbortError") notify(`${t("denoiseFailed")}：${error.message || error}`);
      setJob(EMPTY_JOB); return false;
    } finally { if (controllerRef.current === controller) controllerRef.current = null; }
  };

  const runClip = async (video) => {
    if (!sourceSegment || job.running) return false;
    revoke(resultRef.current); resultRef.current = null; setResult(null);
    const controller = new AbortController(); controllerRef.current = controller;
    setJob({ ...EMPTY_JOB, running: true, kind: "clip", progress: 1, phaseKey: "remasterPhaseReadClip" });
    try {
      const strength = await resolveStrength(video);
      const enhanced = await enhanceRemasterClip({ segment: sourceSegment, videoElement: video, frameRate: 0, maxLongEdge: 960, strength, signal: controller.signal, onProgress: (message) => setJob((current) => ({ ...current, ...message, running: true })) });
      const url = URL.createObjectURL(enhanced.blob);
      const next = { ...enhanced, url, ownedUrl: true, strength };
      resultRef.current = next; setResult(next);
      setJob({ ...EMPTY_JOB, progress: 100, phaseKey: "denoiseClipReady", backend: enhanced.backend });
      notify(t("denoiseClipReady")); return true;
    } catch (error) {
      if (error?.name === "AbortError") notify(t("denoiseCanceled"));
      else notify(`${t("denoiseFailed")}：${error.message || error}`);
      setJob(EMPTY_JOB); return false;
    } finally { if (controllerRef.current === controller) controllerRef.current = null; }
  };

  const apply = () => {
    const denoised = resultRef.current;
    if (!denoised || !selectedSegment) return false;
    const url = URL.createObjectURL(denoised.blob); imageUrlRefs.current.add(url);
    const asset = { id: `denoise-${crypto.randomUUID?.() ?? Date.now()}`, type: "video", src: url, blob: denoised.blob, name: makeName(selectedSegment), duration: Number(selectedSegment.duration) || denoised.sourceDuration, width: denoised.width, height: denoised.height, meta: `${denoised.width}×${denoised.height} · ${(Number(selectedSegment.duration) || denoised.sourceDuration || 0).toFixed(1)}s`, trackFrames: [] };
    setUserAssets((items) => [asset, ...items]);
    setVisualSegments((items) => items.map((item) => {
      if (item.id !== selectedSegment.id) return item;
      const original = item.enhancement?.original || { src: item.src, blob: item.blob, width: item.width, height: item.height, sourceStart: item.sourceStart, sourceDuration: item.sourceDuration, trackFrames: item.trackFrames || [] };
      const processed = { src: url, blob: denoised.blob, width: denoised.width, height: denoised.height, sourceStart: 0, sourceDuration: denoised.sourceDuration || item.sourceDuration, trackFrames: [] };
      return { ...item, ...processed, enhancement: { mode: "smart-denoise-drunet", enabled: true, original, processed, backend: denoised.backend, preset: mode, strength: denoised.strength, analysis, pipeline: denoised.pipeline, frameRate: denoised.frameRate, reusedFrames: denoised.reusedFrames, audioPreserved: denoised.audioPreserved } };
    }));
    notify(t("denoiseApplied")); clearPreviews(); setDialogOpen(false); return true;
  };

  const cancel = () => controllerRef.current?.abort();
  return { dialogOpen, sourceSegment, mode, analysis, framePreview, result, job, openDialog, closeDialog: () => !job.running && setDialogOpen(false), setMode, runFrame, runClip, apply, cancel };
}
