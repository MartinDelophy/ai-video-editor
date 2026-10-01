import { useEffect, useRef, useState } from "react";

import { repairMiganClip, resolveRepairSelection } from "../lib/miganClipRepair.js";
import { captureMiganSource, repairMiganFrame } from "../lib/miganRepair.js";

const DEFAULT_SELECTION = { x: 0.72, y: 0.05, width: 0.23, height: 0.15 };

function makeAssetName(segment, type) {
  const base = String(segment?.name || (type === "video" ? "video" : "image")).replace(/\.[^.]+$/, "");
  return `${base}-ai-repaired.${type === "video" ? "mp4" : "png"}`;
}

function normalizeSelection(next) {
  const width = Math.max(0.015, Math.min(1, Number(next?.width) || 0));
  const height = Math.max(0.015, Math.min(1, Number(next?.height) || 0));
  return {
    x: Math.max(0, Math.min(1 - width, Number(next?.x) || 0)),
    y: Math.max(0, Math.min(1 - height, Number(next?.y) || 0)),
    width,
    height,
  };
}

function initialRegions(segment) {
  const duration = Math.max(0.1, Number(segment?.duration) || 5);
  const saved = segment?.repair?.regions;
  if (Array.isArray(saved) && saved.length) return saved;
  return [{
    id: `repair-region-${Date.now()}`,
    start: 0,
    end: duration,
    selection: normalizeSelection(segment?.repair?.selection || DEFAULT_SELECTION),
    keyframes: [],
  }];
}

export function useMiganRepair({
  selectedSegment,
  imageUrlRefs,
  setVisualSegments,
  setUserAssets,
  notify,
  t,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [regions, setRegions] = useState(() => initialRegions(selectedSegment));
  const [activeRegionId, setActiveRegionId] = useState("");
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [preview, setPreview] = useState(null);
  const [resultDirty, setResultDirty] = useState(false);
  const [clipPreview, setClipPreview] = useState(null);
  const [job, setJob] = useState({ running: false, progress: 0, phaseKey: "", frameIndex: 0, totalFrames: 0, backend: "" });
  const controllerRef = useRef(null);
  const previewRef = useRef(null);
  const clipPreviewRef = useRef(null);
  const regionsRef = useRef(regions);

  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  useEffect(() => {
    const next = initialRegions(selectedSegment);
    setDialogOpen(false);
    setResultDirty(false);
    setRegions(next);
    setActiveRegionId(next[0]?.id || "");
    setUndoStack([]);
    setRedoStack([]);
    if (previewRef.current?.url) URL.revokeObjectURL(previewRef.current.url);
    if (clipPreviewRef.current?.url) URL.revokeObjectURL(clipPreviewRef.current.url);
    previewRef.current = null;
    clipPreviewRef.current = null;
    setPreview(null);
    setClipPreview(null);
    setJob({ running: false, progress: 0, phaseKey: "", frameIndex: 0, totalFrames: 0, backend: "" });
  // Toggling back to the original or replacing a clip must not reuse a preview
  // generated from its previous source, even when the segment ID stays stable.
  }, [selectedSegment?.id, selectedSegment?.src]);

  useEffect(() => {
    const duration = Math.max(0.1, Number(selectedSegment?.duration) || 5);
    setRegions((items) => items.map((region) => {
      const start = Math.max(0, Math.min(duration - 0.04, Number(region.start) || 0));
      return { ...region, start, end: Math.max(start + 0.04, Math.min(duration, Number(region.end) || duration)) };
    }));
  }, [selectedSegment?.duration]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    if (previewRef.current?.url) URL.revokeObjectURL(previewRef.current.url);
    if (clipPreviewRef.current?.url) URL.revokeObjectURL(clipPreviewRef.current.url);
  }, []);

  const activeRegion = regions.find((region) => region.id === activeRegionId) || regions[0] || null;

  const clearPreview = () => {
    if (previewRef.current?.url) URL.revokeObjectURL(previewRef.current.url);
    previewRef.current = null;
    setPreview(null);
  };

  const clearClipPreview = () => {
    if (clipPreviewRef.current?.url) URL.revokeObjectURL(clipPreviewRef.current.url);
    clipPreviewRef.current = null;
    setClipPreview(null);
  };

  const checkpoint = () => {
    const snapshot = structuredClone(regionsRef.current);
    setUndoStack((items) => [...items.slice(-39), snapshot]);
    setRedoStack([]);
  };

  const undo = () => {
    if (job.running) return;
    setUndoStack((items) => {
      if (!items.length) return items;
      const previous = items.at(-1);
      setRedoStack((future) => [...future.slice(-39), structuredClone(regionsRef.current)]);
      setRegions(previous);
      setActiveRegionId((current) => previous.some((region) => region.id === current) ? current : previous[0]?.id || "");
      setResultDirty(true);
      return items.slice(0, -1);
    });
  };

  const redo = () => {
    if (job.running) return;
    setRedoStack((items) => {
      if (!items.length) return items;
      const next = items.at(-1);
      setUndoStack((past) => [...past.slice(-39), structuredClone(regionsRef.current)]);
      setRegions(next);
      setActiveRegionId((current) => next.some((region) => region.id === current) ? current : next[0]?.id || "");
      setResultDirty(true);
      return items.slice(0, -1);
    });
  };

  const openDialog = () => {
    if (!selectedSegment) return;
    const next = regions.length ? regions : initialRegions(selectedSegment);
    setRegions(next);
    setActiveRegionId((current) => current || next[0]?.id || "");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (job.running) return;
    setDialogOpen(false);
  };

  const updateRegion = (id, patch, time = null) => {
    if (job.running) return;
    setResultDirty(true);
    setRegions((items) => items.map((region) => {
      if (region.id !== id) return region;
      const selection = patch.selection ? normalizeSelection(patch.selection) : region.selection;
      const localTime = Math.max(region.start, Math.min(region.end, time));
      const keyframes = patch.selection && region.keyframes?.length && Number.isFinite(time)
        ? [...region.keyframes.filter((frame) => Math.abs(frame.time - localTime) > 0.0001), {
          time: localTime, selection,
        }].sort((a, b) => a.time - b.time)
        : region.keyframes;
      return { ...region, ...patch, selection, keyframes };
    }));
  };

  const addRegion = (time = 0) => {
    if (job.running) return;
    checkpoint();
    setResultDirty(true);
    const duration = Math.max(0.1, Number(selectedSegment?.duration) || 5);
    const start = Math.max(0, Math.min(duration - 0.1, Number(time) || 0));
    const region = {
      id: `repair-region-${crypto.randomUUID?.() ?? Date.now()}`,
      start,
      end: Math.min(duration, start + Math.min(2, duration)),
      selection: { ...DEFAULT_SELECTION },
      keyframes: [],
    };
    setRegions((items) => [...items, region]);
    setActiveRegionId(region.id);
  };

  const removeRegion = (id) => {
    if (job.running) return;
    checkpoint();
    setResultDirty(true);
    setRegions((items) => {
      if (items.length <= 1) return items;
      const next = items.filter((region) => region.id !== id);
      setActiveRegionId((current) => current === id ? next[0]?.id || "" : current);
      return next;
    });
  };

  const addRegionKeyframe = (id, time, selection) => {
    if (job.running) return;
    checkpoint();
    setRegions((items) => items.map((region) => {
      if (region.id !== id) return region;
      const localTime = Math.max(region.start, Math.min(region.end, Number(time) || 0));
      const keyframes = [...(region.keyframes || []).filter((frame) => Math.abs(frame.time - localTime) > 0.0001), {
        time: localTime,
        selection: normalizeSelection(selection || region.selection),
      }].sort((a, b) => a.time - b.time);
      return { ...region, selection: normalizeSelection(selection || region.selection), keyframes };
    }));
  };

  const replacePreview = (result) => {
    if (previewRef.current?.url) URL.revokeObjectURL(previewRef.current.url);
    const url = URL.createObjectURL(result.blob);
    const next = { ...result, url };
    previewRef.current = next;
    setPreview(next);
    return next;
  };

  const runFramePreview = async ({ videoElement = null, selection = activeRegion?.selection, selections = null, usePrevious = false } = {}) => {
    const requestedSelections = (Array.isArray(selections) ? selections : [selection]).filter(Boolean);
    if (!selectedSegment || job.running || !requestedSelections.length) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    setJob({ running: true, mode: "frame", progress: 1, phaseKey: "repairPhasePrepare", frameIndex: 0, totalFrames: 1, backend: "" });
    try {
      let bitmap = usePrevious && selectedSegment.type === "image" && previewRef.current
        ? await createImageBitmap(previewRef.current.blob)
        : await captureMiganSource({ segment: selectedSegment, video: videoElement });
      let result = null;
      for (let index = 0; index < requestedSelections.length; index += 1) {
        result = await repairMiganFrame({
          bitmap,
          selection: requestedSelections[index],
          signal: controller.signal,
          onProgress: (message) => setJob((current) => ({
            ...current,
            progress: message.stage === "download"
              ? Math.round(message.value * 70)
              : message.stage === "compile"
                ? 82
                : 86 + ((index + 1) / requestedSelections.length) * 10,
            phaseKey: message.stage === "download" ? "repairPhaseDownload" : message.stage === "compile" ? "repairPhaseCompile" : "repairPhaseFrame",
            backend: message.backend || current.backend,
          })),
        });
        if (index < requestedSelections.length - 1) bitmap = await createImageBitmap(result.blob);
      }
      replacePreview(result);
      if (selectedSegment.type === "image") setResultDirty(false);
      setJob({ running: false, mode: "frame", progress: 100, phaseKey: "repairPhaseReady", frameIndex: 1, totalFrames: 1, backend: result.backend });
      notify(t("repairPreviewReady"));
      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        notify(t("repairCanceled"));
        setJob({ running: false, progress: 0, phaseKey: "", frameIndex: 0, totalFrames: 0, backend: "" });
      } else {
        notify(`${t("repairFailed")}：${error.message}`);
        setJob((current) => ({ ...current, running: false }));
      }
      return null;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const commitResult = ({ blob, width, height, type, backend, sourceDuration, frameRate, totalFrames, temporalFrames = 0 }) => {
    const url = URL.createObjectURL(blob);
    imageUrlRefs.current.add(url);
    const name = makeAssetName(selectedSegment, type);
    const asset = {
      id: `repair-${crypto.randomUUID?.() ?? Date.now()}`,
      type, src: url, blob, name,
      duration: type === "video" ? Number(selectedSegment.duration) || sourceDuration : Number(selectedSegment.duration) || 5,
      width, height,
      meta: type === "video" ? `${width}×${height} · ${Number(selectedSegment.duration || 0).toFixed(1)}s` : `${width}×${height}`,
      trackFrames: [],
    };
    setUserAssets((items) => [asset, ...items]);
    setVisualSegments((items) => items.map((item) => {
      if (item.id !== selectedSegment.id) return item;
      const original = item.repair?.original || {
        src: item.src, blob: item.blob, width: item.width, height: item.height,
        sourceStart: item.sourceStart, sourceDuration: item.sourceDuration, trackFrames: item.trackFrames || [],
      };
      return {
        ...item, src: url, blob, width, height, sourceStart: 0,
        sourceDuration: sourceDuration || item.sourceDuration, trackFrames: [],
        repair: {
          mode: "migan-256-webgpu", enabled: true,
          selection: activeRegion?.selection || DEFAULT_SELECTION,
          regions, original,
          processed: { src: url, blob, width, height, sourceStart: 0, sourceDuration: sourceDuration || item.sourceDuration, trackFrames: [] },
          backend, frameRate, totalFrames,
          temporal: { method: "farneback-bidirectional-reference-v4", reference: "original", neighborOffsets: [-2, -1, 1, 2], maxGapSeconds: 0.2, referenceSearchSeconds: 3, minimumFarDonors: 2, reusedFrames: temporalFrames },
        },
      };
    }));
    return asset;
  };

  const applyRepair = async ({ videoElement = null } = {}) => {
    if (!selectedSegment || job.running) return false;
    if (selectedSegment.type === "image") {
      let result = previewRef.current;
      if (!result || resultDirty) {
        result = await runFramePreview({ videoElement, selections: regions.map((region) => region.selection) });
      }
      if (!result) return false;
      commitResult({ ...result, type: "image" });
      notify(t("repairImageReady"));
      setDialogOpen(false);
      return true;
    }
    return processVideoRepair();
  };

  const processVideoRepair = async ({ usePrevious = true } = {}) => {
    if (!selectedSegment || selectedSegment.type !== "video" || job.running) return false;
    const original = selectedSegment.repair?.original;
    const referenceSegment = original && selectedSegment.src !== original.src
      ? { ...selectedSegment, ...original, sourceStart: (Number(original.sourceStart) || 0) + (Number(selectedSegment.sourceStart) || 0) }
      : selectedSegment;
    const previous = usePrevious ? clipPreviewRef.current : null;
    const source = previous ? { ...selectedSegment, src: previous.url, blob: previous.blob, sourceStart: 0, sourceDuration: previous.sourceDuration } : selectedSegment;
    const controller = new AbortController();
    controllerRef.current = controller;
    clearPreview();
    setJob({ running: true, mode: "clip", progress: 1, phaseKey: "repairPhasePrepare", frameIndex: 0, totalFrames: 0, backend: "", startedAt: Date.now() });
    try {
      const result = await repairMiganClip({
        segment: source, referenceSegment, regions, videoElement: null,
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.phaseKey === "repairPhaseLoadEncoder") clearPreview();
          setJob((current) => ({ ...current, ...progress, running: true, mode: "clip" }));
        },
        onFrame: async (frame) => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(frame.blob);
          const decoded = new Image();
          decoded.src = url;
          try {
            await decoded.decode();
          } catch {
            // The visible image can still load from the object URL on browsers without decode support.
          }
          if (controller.signal.aborted) {
            URL.revokeObjectURL(url);
            return;
          }
          const previousUrl = previewRef.current?.url;
          const nextFrame = { ...frame, url, type: "video-progress" };
          previewRef.current = nextFrame;
          setPreview(nextFrame);
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl);
        },
      });
      if (clipPreviewRef.current?.url) URL.revokeObjectURL(clipPreviewRef.current.url);
      const url = URL.createObjectURL(result.blob);
      const nextPreview = { ...result, url, type: "video" };
      clipPreviewRef.current = nextPreview;
      setClipPreview(nextPreview);
      setResultDirty(false);
      clearPreview();
      setJob((current) => ({ ...current, running: false, progress: 100, phaseKey: "repairPhaseReady" }));
      notify(t("repairClipPreviewReady"));
      return true;
    } catch (error) {
      if (error.name === "AbortError") {
        notify(t("repairCanceled"));
        setJob({ running: false, progress: 0, phaseKey: "", frameIndex: 0, totalFrames: 0, backend: "" });
      } else {
        notify(`${t("repairFailed")}：${error.message}`);
        setJob((current) => ({ ...current, running: false }));
      }
      return false;
    } finally {
      clearPreview();
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const applyVideoPreview = () => {
    if (job.running || resultDirty || !clipPreviewRef.current || !selectedSegment || selectedSegment.type !== "video") return false;
    commitResult({ ...clipPreviewRef.current, type: "video" });
    notify(t("repairClipReady"));
    clearClipPreview();
    setDialogOpen(false);
    return true;
  };

  const cancel = () => {
    if (!controllerRef.current) return;
    setJob((current) => ({ ...current, phaseKey: "repairPhaseStopping" }));
    controllerRef.current.abort();
  };

  return {
    dialogOpen, openDialog, closeDialog,
    checkpoint, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    regions, activeRegion, activeRegionId, setActiveRegionId,
    updateRegion, addRegion, removeRegion, addRegionKeyframe,
    preview, clipPreview, resultDirty, resolveSelection: resolveRepairSelection, job, runFramePreview, applyRepair, processVideoRepair, applyVideoPreview,
    cancel, clearPreview, clearClipPreview,
  };
}
