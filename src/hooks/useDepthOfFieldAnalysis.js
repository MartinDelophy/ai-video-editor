import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDepthAnalysisSignature } from "../lib/depthOfField.js";
import { createDepthSampleStream } from "../lib/depthSampleStream.js";
import { getVisionKey } from "../lib/vision.js";
import { getVisualSourceTime } from "../lib/visualEffects.js";

const QUALITY = {
  fast: { fps: 8, maxDimension: 392 },
  balanced: { fps: 16, maxDimension: 504 },
  quality: { fps: 24, maxDimension: 518 },
};

function waitForEvent(target, eventName, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Canceled", "AbortError"));
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(eventName, done);
      target.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
    };
    const done = () => { cleanup(); resolve(); };
    const aborted = () => { cleanup(); reject(new DOMException("Canceled", "AbortError")); };
    const failed = () => { cleanup(); reject(new Error("Depth source media could not be decoded")); };
    const timer = setTimeout(failed, 30_000);
    target.addEventListener(eventName, done, { once: true });
    target.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

function createWorkerClient(onSetupProgress) {
  const worker = new Worker(new URL("../workers/depth-anything.worker.js", import.meta.url), { type: "module" });
  let requestId = 0;
  const pending = new Map();
  let fatalError = null;
  const fail = (error) => {
    fatalError = error;
    pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(error); });
    pending.clear();
    worker.terminate();
  };
  worker.onerror = (event) => {
    event.preventDefault();
    fail(new Error("Depth model worker failed to load. Refresh the app and retry."));
  };
  worker.onmessageerror = () => fail(new Error("Depth model worker communication failed."));
  worker.onmessage = (event) => {
    const message = event.data || {};
    if (message.type === "setup-progress") {
      pending.forEach((request) => {
        if (request.type === "setup") {
          clearTimeout(request.timer);
          request.timer = setTimeout(() => fail(new Error("Depth model setup stalled; retry the download.")), 120_000);
        }
      });
      onSetupProgress?.(message);
      return;
    }
    const request = pending.get(message.requestId);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.requestId);
    if (message.type === "error") request.reject(new Error(message.message || "Depth inference failed"));
    else request.resolve(message);
  };
  const call = (type, payload = {}, transfer = []) => new Promise((resolve, reject) => {
    if (fatalError) return reject(fatalError);
    requestId += 1;
    const timer = setTimeout(() => fail(new Error("Depth model setup stalled; retry the download.")), type === "setup" ? 120_000 : 60_000);
    pending.set(requestId, { resolve, reject, timer, type });
    worker.postMessage({ type, requestId, ...payload }, transfer);
  });
  return {
    setup: () => call("setup"),
    infer: (bitmap, width, height) => call("infer", { bitmap, width, height }, [bitmap]),
    dispose: () => {
      pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(new DOMException("Worker closed", "AbortError")); });
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
  try {
    if (video.readyState < 1) await waitForEvent(video, "loadedmetadata", signal);
  } catch (error) {
    video.removeAttribute("src"); video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  }
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
  if (/Depth source media could not be decoded/.test(message)) return t("depthAnalysisFailed");
  if (/webgpu|adapter|device/i.test(message)) return t("depthWebGpuRequired");
  if (/failed to fetch|fetch failed|network|worker|stalled/i.test(message)) return t("depthModelUnavailable");
  return message || t("depthAnalysisFailed");
}

export function useDepthOfFieldAnalysis({
  segment,
  depthRecords,
  setDepthRecords,
  updateEffect,
  onAssetReady,
  isBlocked,
  effectField = "cinematicDepth",
  readyToastKey = "depthReadyToast",
  notify,
  t,
}) {
  const key = getVisionKey(segment);
  const record = key ? depthRecords[key] || null : null;
  const [job, setJob] = useState({ running: false, key: "", stage: "idle", progress: 0, phase: "", error: "" });
  const workerRef = useRef(null);
  const abortRef = useRef(null);
  const progressRef = useRef(null);
  const urlsRef = useRef(new Map());

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = createWorkerClient(({ progress }) => {
        if (!Number.isFinite(progress)) return;
        progressRef.current?.({ stage: "setup", progress: Math.round(progress) });
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
    workerRef.current?.dispose();
    workerRef.current = null;
    setJob((current) => ({ ...current, phase: t("depthCanceled") }));
  }, [t]);

  const analyze = useCallback(async (overrides = {}, execution = null) => {
    // Both UI and WebMCP use this pipeline. Agent runs bind an inspected source,
    // stage analysis privately, and never enable an effect or replace a clip.
    if (!execution && isBlocked?.()) return;
    const target = execution?.segment || segment;
    const targetKey = getVisionKey(target);
    const targetRecord = targetKey ? depthRecords[targetKey] || null : null;
    const segmentForRun = target;
    const publishJob = (value) => {
      setJob(value);
      if (execution?.onProgress && typeof value !== "function") execution.onProgress(value);
    };
    if (!segmentForRun?.src || !targetKey) {
      if (execution) throw Object.assign(new Error("Invalid depth source"), { code: "AI_INVALID_SOURCE" });
      return void notify(t("effectSelectClip"));
    }
    if (abortRef.current || job.running) {
      if (execution) throw Object.assign(new Error("Depth analysis is busy"), { code: "EDITOR_BUSY" });
      cancel();
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    progressRef.current = execution?.onProgress || null;
    const abort = () => { controller.abort(); workerRef.current?.dispose(); workerRef.current = null; };
    execution?.signal?.addEventListener("abort", abort, { once: true });
    const commitAsset = execution?.onAssetReady || onAssetReady;
    const { reanalyze = false, ...effectOverrides } = overrides;
    const effect = { ...segmentForRun?.[effectField], ...effectOverrides };
    const qualityId = QUALITY[effect.quality] ? effect.quality : "balanced";
    const quality = QUALITY[qualityId];
    const signature = getDepthAnalysisSignature(segmentForRun, qualityId);
    const reuseAnalysis = !reanalyze && ["depth-map", "relight"].includes(effect.output) && targetRecord?.complete
      && targetRecord.signature === signature && targetRecord.samples?.length > 0;
    publishJob({ running: true, key: targetKey, stage: "setup", progress: 1, phase: t("depthModelPreparing"), error: "" });
    const previousRecord = targetRecord;
    let source;
    const createdUrls = [];
    let completedAnalysis = reuseAnalysis ? targetRecord : null;
    let analysisCommitted = reuseAnalysis;
    let assetReceipt = null;
    let encodingStarted = false;
    let sampleStream = null;
    let pipelineResult = null;
    let analysisRunning = true;
    let pipelineProgress = 0;
    let pipelinePhase = "depthMapEncoding";
    const reportEncodingProgress = (progress, phase = "depthMapEncoding") => {
      pipelineProgress = progress;
      pipelinePhase = phase;
      if (analysisRunning) return;
      publishJob({ running: true, key: targetKey, stage: "encoding", progress: pipelineResult ? Math.round((100 + progress) / 2) : progress, phase: t(phase), error: "" });
    };
    try {
      if (execution?.signal?.aborted) throw new DOMException("Canceled", "AbortError");
      let analysis = reuseAnalysis ? targetRecord : null;
      if (!reuseAnalysis) {
        const worker = ensureWorker();
        await worker.setup();
        if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
        publishJob({ running: true, key: targetKey, stage: "analysis", progress: 0, phase: t("depthAnalyzingFrames"), error: "" });
        source = await prepareSource(segmentForRun, controller.signal);
        const scale = Math.min(1, quality.maxDimension / Math.max(source.width, source.height));
        const width = Math.max(14, Math.round(source.width * scale / 14) * 14);
        const height = Math.max(14, Math.round(source.height * scale / 14) * 14);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
        const duration = segmentForRun.type === "video" ? Math.max(0.05, Number(segmentForRun.duration) || 0.05) : 0;
        const requestedCount = Math.ceil(duration * quality.fps);
        const count = segmentForRun.type === "video" ? Math.max(1, Math.min(720, requestedCount)) : 1;
        // A fixed sample clock lets 24fps output reuse real 8/16/24fps samples.
        // Keep even coverage only when a long clip reaches the bounded budget.
        const sampleFps = duration ? (requestedCount > 720 ? count / duration : quality.fps) : 1;
        const samples = [];
        if (segmentForRun.type === "video" && effect.output === "depth-map" && commitAsset && ["fast", "balanced"].includes(qualityId)) {
          const streamingAnalysis = { samples, sourceSize: { width: source.width, height: source.height }, duration, fps: sampleFps };
          sampleStream = createDepthSampleStream(streamingAnalysis, controller.signal);
          pipelineResult = import("../lib/depthMapAsset.js").then(({ renderDepthMapAsset }) => renderDepthMapAsset({ segment: segmentForRun, analysis: streamingAnalysis, effect, signal: controller.signal,
            onProgress: reportEncodingProgress, sampleStream,
          })).then((rendered) => ({ rendered }), (error) => {
            sampleStream.releaseConsumer();
            return { error };
          });
        }
        const capture = async (index) => {
          if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
          const localTime = segmentForRun.type === "video" ? index / sampleFps : 0;
          const sourceTime = segmentForRun.type === "video" ? getVisualSourceTime(segmentForRun, localTime) : 0;
          if (segmentForRun.type === "video") await seekVideo(source.media, sourceTime, controller.signal);
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
          const sample = { time: localTime, sourceTime, depthUrl, width: result.width, height: result.height };
          if (sampleStream) await sampleStream.append(sample);
          else samples.push(sample);
          if (index + 1 < count && performance.now() - lastPublished < 250) continue;
          lastPublished = performance.now();
          const analysisProgress = ((index + 1) / count) * 100;
          const progress = Math.round(sampleStream ? (analysisProgress + pipelineProgress) / 2 : analysisProgress);
          publishJob({ running: true, key: targetKey, stage: "analysis", progress, phase: sampleStream ? t("depthMapPipeline") : t("depthFrameProgress").replace("{current}", index + 1).replace("{total}", count), error: "" });
          if (!execution) setDepthRecords((records) => ({
            ...records,
            [targetKey]: {
              complete: false,
              samples: [...samples],
              sourceSize: { width: source.width, height: source.height },
              fps: sampleFps,
              model: "Depth Anything V2 Small · Q4F16 · WebGPU",
            },
          }));
          // The depth thumbnail already shows progress. Avoid seeking/repainting
          // the full editor preview on every sample while inference owns the GPU.
        }
        analysis = {
          complete: true,
          signature,
          samples,
          sourceSize: { width: source.width, height: source.height },
          duration,
          fps: sampleFps,
          model: "Depth Anything V2 Small · Q4F16 · WebGPU",
          analyzedAt: Date.now(),
        };
      }
      analysisRunning = false;
      sampleStream?.finish();
      completedAnalysis = analysis;
      if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
      execution?.validateSource?.();
      if (!reuseAnalysis) {
        const oldUrls = urlsRef.current.get(targetKey) || [];
        urlsRef.current.set(targetKey, createdUrls);
        setDepthRecords((records) => ({ ...records, [targetKey]: analysis }));
        analysisCommitted = true;
        oldUrls.forEach((url) => URL.revokeObjectURL(url));
      }
      if (effect.output === "depth-map" && commitAsset) {
        encodingStarted = true;
        publishJob({ running: true, key: targetKey, stage: "encoding", progress: pipelineResult ? Math.round((100 + pipelineProgress) / 2) : 0, phase: t(pipelineResult ? pipelinePhase : "depthMapEncoding"), error: "" });
        let rendered;
        if (pipelineResult) {
          const result = await pipelineResult;
          if (result.error) throw result.error;
          rendered = result.rendered;
        } else {
          const { renderDepthMapAsset } = await import("../lib/depthMapAsset.js");
          rendered = await renderDepthMapAsset({ segment: segmentForRun, analysis, effect, signal: controller.signal,
            onProgress: reportEncodingProgress,
          });
        }
        if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
        assetReceipt = await commitAsset({ ...rendered, type: "video", generatedBy: "depth-map",
          name: `${t("depthMapTitle")} · ${segmentForRun.name || "video"}.webm`,
          meta: `${rendered.width} × ${rendered.height} · ${rendered.fps} fps`,
        }, { sourceSegment: segmentForRun });
      }
      if (!execution && (effect.output !== "depth-map" || !onAssetReady)) updateEffect?.({ ...effect, enabled: true });

      publishJob({ running: false, key: targetKey, stage: "complete", progress: 100, phase: t("depthAnalysisComplete"), error: "" });
      if (!execution) notify(t(effect.output === "depth-map" ? "depthMapAssetReady" : readyToastKey));
      return { analysis: { complete: true, quality: qualityId, samples: analysis.samples.length, fps: analysis.fps,
        sourceSize: analysis.sourceSize, model: analysis.model }, asset: assetReceipt };
    } catch (error) {
      sampleStream?.fail(error);
      if (pipelineResult) {
        controller.abort();
        await pipelineResult;
      }
      if (!execution || analysisCommitted) setDepthRecords((records) => {
        const restored = { ...records };
        if (analysisCommitted && completedAnalysis) restored[targetKey] = completedAnalysis;
        else if (previousRecord) restored[targetKey] = previousRecord;
        else delete restored[targetKey];
        return restored;
      });
      if (error?.name === "AbortError") {
        if (!analysisCommitted) createdUrls.forEach((url) => URL.revokeObjectURL(url));
        publishJob({ running: false, key: targetKey, stage: "idle", progress: 0, phase: t("depthCanceled"), error: "" });
        if (execution) throw error;
        return;
      }
      workerRef.current?.dispose();
      workerRef.current = null;
      console.error("[Cinematic Depth]", error);
      if (!analysisCommitted) createdUrls.forEach((url) => URL.revokeObjectURL(url));
      const phase = t(encodingStarted ? "depthMapExportFailed" : "depthAnalysisFailed");
      const detail = encodingStarted ? phase : userError(error, t);
      publishJob((current) => ({ ...current, running: false, key: targetKey, stage: "error", phase, error: detail }));
      if (execution) throw error;
      notify(encodingStarted ? detail : `${phase}：${detail}`);
    } finally {
      execution?.signal?.removeEventListener("abort", abort);
      sampleStream?.dispose();
      source?.cleanup?.();
      if (abortRef.current === controller) { abortRef.current = null; progressRef.current = null; }
    }
  }, [cancel, onAssetReady, isBlocked, effectField, ensureWorker, job.running, notify, readyToastKey, depthRecords, segment, setDepthRecords, t, updateEffect]);

  return useMemo(() => ({ key, record, job, analyze, cancel }), [analyze, cancel, job, key, record]);
}
