import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getVisionKey } from "../lib/vision.js";
import { getVisualSourceTime } from "../lib/visualEffects.js";

const QUALITY = {
  fast: { fps: 4, maxDimension: 392 },
  balanced: { fps: 8, maxDimension: 504 },
  quality: { fps: 12, maxDimension: 518 },
};

function waitForEvent(target, eventName, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, done);
      signal?.removeEventListener("abort", aborted);
    };
    const done = () => { cleanup(); resolve(); };
    const aborted = () => { cleanup(); reject(new DOMException("Canceled", "AbortError")); };
    target.addEventListener(eventName, done, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

function createWorkerClient(onSetupProgress) {
  const worker = new Worker(new URL("../workers/depth-anything.worker.js", import.meta.url), { type: "module" });
  let requestId = 0;
  const pending = new Map();
  worker.onmessage = (event) => {
    const message = event.data || {};
    if (message.type === "setup-progress") {
      onSetupProgress?.(message);
      return;
    }
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    if (message.type === "error") request.reject(new Error(message.message || "Depth inference failed"));
    else request.resolve(message);
  };
  const call = (type, payload = {}, transfer = []) => new Promise((resolve, reject) => {
    requestId += 1;
    pending.set(requestId, { resolve, reject });
    worker.postMessage({ type, requestId, ...payload }, transfer);
  });
  return {
    setup: () => call("setup"),
    infer: (bitmap, width, height) => call("infer", { bitmap, width, height }, [bitmap]),
    dispose: () => {
      pending.forEach(({ reject }) => reject(new DOMException("Worker closed", "AbortError")));
      pending.clear();
      worker.terminate();
    },
  };
}

async function prepareSource(segment, signal) {
  if (segment.type === "image") {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = segment.src;
    if (!image.complete) await waitForEvent(image, "load", signal);
    return { media: image, cleanup: () => {}, width: image.naturalWidth, height: image.naturalHeight };
  }
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  const objectUrl = segment.blob instanceof Blob ? URL.createObjectURL(segment.blob) : "";
  video.src = objectUrl || segment.src;
  video.preload = "auto";
  if (video.readyState < 1) await waitForEvent(video, "loadedmetadata", signal);
  return {
    media: video,
    cleanup: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

async function seekVideo(video, time, signal) {
  const target = Math.min(Math.max(0, (video.duration || 0) - 0.025), Math.max(0, time));
  if (Math.abs(video.currentTime - target) < 0.008 && video.readyState >= 2) return;
  video.currentTime = target;
  await waitForEvent(video, "seeked", signal);
}

function userError(error, t) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/webgpu|adapter|device/i.test(message)) return t("depthWebGpuRequired");
  if (/failed to fetch|fetch failed|network/i.test(message)) return t("depthModelUnavailable");
  return message || t("depthAnalysisFailed");
}

export function useDepthOfFieldAnalysis({
  segment,
  depthRecords,
  setDepthRecords,
  updateEffect,
  onAssetReady,
  effectField = "cinematicDepth",
  readyToastKey = "depthReadyToast",
  notify,
  setCurrentTime,
  timelineStart = 0,
  t,
}) {
  const key = getVisionKey(segment);
  const record = key ? depthRecords[key] || null : null;
  const [job, setJob] = useState({ running: false, key: "", stage: "idle", progress: 0, phase: "", error: "" });
  const workerRef = useRef(null);
  const abortRef = useRef(null);
  const urlsRef = useRef(new Map());

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = createWorkerClient(({ progress }) => {
        if (!Number.isFinite(progress)) return;
        setJob((current) => current.running && current.stage === "setup"
          ? { ...current, progress: Math.max(current.progress, Math.round(progress)), phase: t("depthModelDownloading") }
          : current);
      });
    }
    return workerRef.current;
  }, [t]);

  useEffect(() => () => {
    abortRef.current?.abort();
    workerRef.current?.dispose();
    urlsRef.current.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    // Keep the job occupied until its in-flight inference releases shared buffers.
    setJob((current) => ({ ...current, phase: t("depthCanceled") }));
  }, [t]);

  const analyze = useCallback(async (overrides = {}) => {
    if (!segment?.src || !key) return void notify(t("effectSelectClip"));
    if (abortRef.current || job.running) {
      cancel();
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const effect = { ...segment?.[effectField], ...overrides };
    const quality = QUALITY[effect.quality] || QUALITY.balanced;
    setJob({ running: true, key, stage: "setup", progress: 1, phase: t("depthModelPreparing"), error: "" });
    const previousRecord = record;
    let source;
    const createdUrls = [];
    try {
      const worker = ensureWorker();
      await worker.setup();
      if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
      setJob({ running: true, key, stage: "analysis", progress: 0, phase: t("depthAnalyzingFrames"), error: "" });
      source = await prepareSource(segment, controller.signal);
      const scale = Math.min(1, quality.maxDimension / Math.max(source.width, source.height));
      const width = Math.max(14, Math.round(source.width * scale / 14) * 14);
      const height = Math.max(14, Math.round(source.height * scale / 14) * 14);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
      const duration = segment.type === "video" ? Math.max(0.05, Number(segment.duration) || 0.05) : 0;
      const count = segment.type === "video" ? Math.max(1, Math.min(360, Math.ceil(duration * quality.fps))) : 1;
      const samples = [];
      const capture = async (index) => {
        if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
        const localTime = segment.type === "video" ? index * duration / count : 0;
        const sourceTime = segment.type === "video" ? getVisualSourceTime(segment, localTime) : 0;
        if (segment.type === "video") await seekVideo(source.media, sourceTime, controller.signal);
        if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
        context.drawImage(source.media, 0, 0, width, height);
        return { bitmap: await createImageBitmap(canvas), localTime, sourceTime };
      };
      let frame = await capture(0);
      let lastPublished = -Infinity;
      for (let index = 0; index < count; index += 1) {
        if (controller.signal.aborted) {
          frame.bitmap.close();
          throw new DOMException("Canceled", "AbortError");
        }
        const { bitmap, localTime, sourceTime } = frame;
        // Transfer the current bitmap before decoding the next frame. Only one
        // inference and one prefetched frame are in flight, keeping memory bounded.
        const inference = worker.infer(bitmap, width, height);
        const nextFrame = index + 1 < count ? capture(index + 1) : Promise.resolve(null);
        const [inferred, captured] = await Promise.allSettled([inference, nextFrame]);
        frame = captured.status === "fulfilled" ? captured.value : null;
        if (inferred.status === "rejected" || captured.status === "rejected" || controller.signal.aborted) {
          frame?.bitmap.close();
          if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
          throw inferred.status === "rejected" ? inferred.reason : captured.reason;
        }
        const result = inferred.value;
        const depthUrl = URL.createObjectURL(result.blob);
        createdUrls.push(depthUrl);
        samples.push({ time: localTime, sourceTime, depthUrl, width: result.width, height: result.height });
        if (index + 1 < count && performance.now() - lastPublished < 250) continue;
        lastPublished = performance.now();
        const progress = Math.round(((index + 1) / count) * 100);
        setJob({ running: true, key, stage: "analysis", progress, phase: t("depthFrameProgress").replace("{current}", index + 1).replace("{total}", count), error: "" });
        setDepthRecords((records) => ({
          ...records,
          [key]: {
            complete: false,
            samples: [...samples],
            sourceSize: { width: source.width, height: source.height },
            fps: duration ? count / duration : 1,
            model: "Depth Anything V2 Small · Q4F16 · WebGPU",
          },
        }));
        setCurrentTime?.(timelineStart + Math.min(duration, localTime));
      }
      const analysis = {
        complete: true,
        samples,
        sourceSize: { width: source.width, height: source.height },
        duration,
        fps: duration ? count / duration : 1,
        model: "Depth Anything V2 Small · Q4F16 · WebGPU",
        analyzedAt: Date.now(),
      };
      if (effect.output === "depth-map" && onAssetReady) {
        setJob({ running: true, key, stage: "encoding", progress: 0, phase: t("depthMapEncoding"), error: "" });
        const { renderDepthMapAsset } = await import("../lib/depthMapAsset.js");
        const rendered = await renderDepthMapAsset({ segment, analysis, effect, signal: controller.signal,
          onProgress: (progress) => setJob({ running: true, key, stage: "encoding", progress,
            phase: t("depthMapEncoding"), error: "" }),
        });
        if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
        await onAssetReady({ ...rendered, type: "video", generatedBy: "depth-map",
          name: `${t("depthMapTitle")} · ${segment.name || "video"}.webm`,
          meta: `${rendered.width} × ${rendered.height} · 30 fps`,
        }, { sourceSegment: segment });
      }
      const oldUrls = urlsRef.current.get(key) || [];
      oldUrls.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current.set(key, createdUrls);
      setDepthRecords((records) => ({ ...records, [key]: analysis }));
      if (effect.output !== "depth-map" || !onAssetReady) updateEffect?.({ ...effect, enabled: true });

      setJob({ running: false, key, stage: "complete", progress: 100, phase: t("depthAnalysisComplete"), error: "" });
      notify(t(effect.output === "depth-map" ? "depthMapAssetReady" : readyToastKey));
    } catch (error) {
      setDepthRecords((records) => {
        const restored = { ...records };
        if (previousRecord) restored[key] = previousRecord;
        else delete restored[key];
        return restored;
      });
      if (error?.name === "AbortError") {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        setJob({ running: false, key, stage: "idle", progress: 0, phase: t("depthCanceled"), error: "" });
        return;
      }
      console.error("[Cinematic Depth]", error);
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
      const detail = userError(error, t);
      setJob({ running: false, key, stage: "error", progress: 0, phase: t("depthAnalysisFailed"), error: detail });
      notify(`${t("depthAnalysisFailed")}：${detail}`);
    } finally {
      source?.cleanup?.();
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [cancel, onAssetReady, effectField, ensureWorker, job.running, key, notify, readyToastKey, record, segment, setCurrentTime, setDepthRecords, t, timelineStart, updateEffect]);

  return useMemo(() => ({ key, record, job, analyze, cancel }), [analyze, cancel, job, key, record]);
}
