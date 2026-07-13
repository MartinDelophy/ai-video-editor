import { useCallback } from "react";
import { MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { JOYVASA_PROJECT_MODEL_BASE_URL } from "../config/joyVasa.js";
import { LIVE_PORTRAIT_WEBGPU_PROJECT_MODEL_BASE_URL } from "../config/livePortrait.js";
import { decodeAvatarAudio16k, encodeAvatarFrames, formatAvatarProgress, runAvatarWorkerTask } from "../lib/editorRuntime.js";

const createMotionWorker = () => new Worker(new URL("../workers/joyvasa.worker.js", import.meta.url), { type: "module" });
const createRenderWorker = () => new Worker(new URL("../workers/liveportrait.worker.js", import.meta.url), { type: "module" });

export function useAvatarGeneration(d) {
  const openAvatarPanel = useCallback(() => {
    d.setAvatarPanelOpen(true);
    if (!d.avatarMotionWorkerRef.current) d.avatarMotionWorkerRef.current = createMotionWorker();
    if (!d.avatarRenderWorkerRef.current) d.avatarRenderWorkerRef.current = createRenderWorker();
  }, [d]);
  const generateAvatarAcceptanceFrame = useCallback(async (quality = "preview") => {
    if (d.avatarJob.running) return;
    if (!d.previewVisualSrc || d.previewVisualType !== "image") return void d.notify(d.t("avatarNeedsPortrait"));
    if (!d.audioBlob) return void d.notify(d.t("avatarNeedsAudio"));
    d.setAvatarJob({ running: true, progress: 1, phase: d.t("avatarPreparing") });
    try {
      const portrait = d.previewVisualSegment?.blob instanceof Blob ? d.previewVisualSegment.blob : await fetch(d.previewVisualSrc).then((response) => {
        if (!response.ok) throw new Error(`读取肖像失败（HTTP ${response.status}）`); return response.blob();
      });
      const testDuration = import.meta.env.DEV ? Number(import.meta.env.VITE_AVATAR_TEST_DURATION || 0) : 0;
      const duration = testDuration > 0 ? Math.max(0.5, Math.min(4, testDuration))
        : Math.max(MIN_VISUAL_SEGMENT_SECONDS, Math.min(4, d.audioDuration || d.imageDuration || 4));
      let motionBuffer;
      if (d.avatarMotionCacheRef.current.audioBlob === d.audioBlob && d.avatarMotionCacheRef.current.motion) {
        motionBuffer = d.avatarMotionCacheRef.current.motion.slice(0);
        d.setAvatarJob({ running: true, progress: 65, phase: d.t("avatarProgressReuseMotion") });
      } else {
        if (d.avatarRenderWorkerRef.current) await runAvatarWorkerTask(d.avatarRenderWorkerRef.current, { type: "releaseGpuSessions" }, [], "gpuReleased");
        const samples = await decodeAvatarAudio16k(d.audioBlob);
        if (!d.avatarMotionWorkerRef.current) d.avatarMotionWorkerRef.current = createMotionWorker();
        const result = await runAvatarWorkerTask(d.avatarMotionWorkerRef.current,
          { type: "generate", audioSamples: samples.buffer, modelBaseUrl: JOYVASA_PROJECT_MODEL_BASE_URL }, [samples.buffer], "motion",
          (progress) => d.setAvatarJob({ running: true, progress: progress.progress, phase: formatAvatarProgress(d.t, progress) }));
        d.avatarMotionCacheRef.current = { audioBlob: d.audioBlob, motion: result.motion.slice(0) }; motionBuffer = result.motion;
        await runAvatarWorkerTask(d.avatarMotionWorkerRef.current, { type: "release", modelBaseUrl: JOYVASA_PROJECT_MODEL_BASE_URL }, [], "released");
      }
      if (!d.avatarRenderWorkerRef.current) d.avatarRenderWorkerRef.current = createRenderWorker();
      const result = await runAvatarWorkerTask(d.avatarRenderWorkerRef.current, {
        type: "generateVideo", portraitBlob: portrait, motionBuffer,
        modelBaseUrl: import.meta.env.VITE_LIVE_PORTRAIT_MODEL_BASE_URL || "",
        joyVasaModelBaseUrl: JOYVASA_PROJECT_MODEL_BASE_URL, webGpuModelBaseUrl: LIVE_PORTRAIT_WEBGPU_PROJECT_MODEL_BASE_URL,
        quality, renderFps: Math.max(1, Number(import.meta.env.VITE_AVATAR_RENDER_FPS || 8)),
        neuralFps: Math.max(1, Number(import.meta.env.VITE_AVATAR_NEURAL_FPS || 2)), duration,
        portraitKey: d.previewVisualSegment?.id || d.previewVisualSrc,
      }, [motionBuffer], "videoFrames",
      (progress) => d.setAvatarJob({ running: true, progress: progress.progress, phase: formatAvatarProgress(d.t, progress) }));
      d.setAvatarJob({ running: true, progress: 99, phase: d.t("avatarProgressEncodeVideo") });
      const blob = await encodeAvatarFrames(result.blobs, result.width, result.height, result.fps, result.keyframeTimes, result.duration);
      const src = URL.createObjectURL(blob); d.imageUrlRefs.current.add(src);
      const asset = { id: crypto.randomUUID(), type: "video", src, name: "liveportrait-joyvasa.webm",
        meta: `${result.width} x ${result.height} · JoyVASA + LivePortrait FP16 WebGPU`, blob, duration, width: result.width, height: result.height, trackFrames: [] };
      d.setUserAssets((assets) => [asset, ...assets]); d.replaceVisualTimeline(asset, duration); d.setCurrentTime(0);
      d.setAvatarJob({ running: false, progress: 100, phase: d.t("avatarAcceptanceDone") }); d.notify(d.t("avatarTrackReplaced"));
    } catch (error) {
      d.setAvatarJob({ running: false, progress: 0, phase: "" }); d.notify(`${d.t("avatarGenerationFailed")}：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [d]);
  return { generateAvatarAcceptanceFrame, openAvatarPanel };
}
