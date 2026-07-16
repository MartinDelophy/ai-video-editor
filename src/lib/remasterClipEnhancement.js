import { encodePngFrameSequence } from "./media.js";
import { enhanceRemasterFrame } from "./remasterEnhancement.js";

function createAbortError() {
  const error = new Error("整段增强已取消");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError();
}

function waitForVideo(video, eventName, signal, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      video.removeEventListener(eventName, ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", aborted);
      window.clearTimeout(timer);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("无法读取待增强视频")); };
    const aborted = () => { cleanup(); reject(createAbortError()); };
    video.addEventListener(eventName, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
    timer = window.setTimeout(() => {
      if (video.readyState >= 2) ready();
      else { cleanup(); reject(new Error("读取视频帧超时，请重新选择片段后重试")); }
    }, timeoutMs);
  });
}

async function loadVideo(src, signal) {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto";
  video.src = src;
  video.load();
  if (video.readyState < 1) await waitForVideo(video, "loadedmetadata", signal);
  if (video.readyState < 2) await waitForVideo(video, "loadeddata", signal);
  return video;
}

async function seekVideo(video, time, signal) {
  throwIfAborted(signal);
  const maximum = Math.max(0, (Number(video.duration) || 0) - 0.001);
  const target = Math.max(0, Math.min(maximum, time));
  if (Math.abs(video.currentTime - target) <= 0.0005 && video.readyState >= 2) return;
  const waiting = waitForVideo(video, "seeked", signal);
  video.currentTime = target;
  await waiting;
}

export async function enhanceRemasterClip({ segment, videoElement = null, frameRate = 30, maxLongEdge = 960, signal, onProgress }) {
  if (!segment?.src || segment.type !== "video") throw new Error("请选择一个视频片段");
  throwIfAborted(signal);
  onProgress?.({ progress: 1, phaseKey: "remasterPhaseReadClip", frameIndex: 0, totalFrames: 0 });
  const expectedSrc = new URL(segment.src, window.location.href).href;
  const reusableVideo = videoElement
    && videoElement.readyState >= 2
    && videoElement.videoWidth > 0
    && (videoElement.currentSrc === expectedSrc || videoElement.src === expectedSrc);
  const video = reusableVideo ? videoElement : await loadVideo(segment.src, signal);
  if (reusableVideo) onProgress?.({ progress: 2, phaseKey: "remasterPhaseReuseVideo", frameIndex: 0, totalFrames: 0 });
  const restoreTime = reusableVideo ? video.currentTime : 0;
  const sourceStart = Math.max(0, Math.min(Number(video.duration) || 0, Number(segment.sourceStart) || 0));
  const availableDuration = Math.max(0.001, (Number(video.duration) || 0) - sourceStart);
  const sourceDuration = Math.max(0.001, Math.min(
    availableDuration,
    Number(segment.sourceDuration) || Number(segment.duration) || availableDuration,
  ));
  const safeFrameRate = Math.max(1, Math.min(60, Math.round(Number(frameRate) || 30)));
  const totalFrames = Math.max(1, Math.ceil(sourceDuration * safeFrameRate));
  let outputSize = null;
  let backend = "";
  try {
    const blob = await encodePngFrameSequence({
      totalFrames,
      frameRate: safeFrameRate,
      signal,
      onProgress,
      produceFrame: async (index) => {
        throwIfAborted(signal);
        await seekVideo(video, sourceStart + index / safeFrameRate, signal);
        const bitmap = await createImageBitmap(video);
        const result = await enhanceRemasterFrame({
          bitmap,
          maxLongEdge,
          signal,
          onProgress: ({ progress: frameProgress, backend: frameBackend }) => {
            if (frameBackend) backend = frameBackend;
            onProgress?.({
            progress: Math.min(90, 4 + ((index + Math.max(0, Math.min(100, frameProgress || 0)) / 100) / totalFrames) * 86),
            phaseKey: "remasterPhaseEnhancingFrame",
            phaseParams: { current: index + 1, total: totalFrames },
            frameIndex: index + 1,
            totalFrames,
            backend,
          });
          },
        });
        if (result.backend) backend = result.backend;
        outputSize ??= { width: result.width, height: result.height };
        onProgress?.({
          progress: Math.min(90, 4 + ((index + 1) / totalFrames) * 86),
          phaseKey: "remasterPhaseFrameEnhanced",
          phaseParams: { current: index + 1, total: totalFrames },
          frameIndex: index + 1,
          totalFrames,
          backend,
        });
        return result.blob;
      },
    });
    return {
      blob,
      width: outputSize?.width || video.videoWidth,
      height: outputSize?.height || video.videoHeight,
      sourceDuration,
      frameRate: safeFrameRate,
      totalFrames,
      backend,
    };
  } finally {
    video.pause();
    if (reusableVideo) {
      if (Number.isFinite(restoreTime)) video.currentTime = Math.min(Math.max(0, restoreTime), Math.max(0, (Number(video.duration) || 0) - 0.001));
    } else {
      video.removeAttribute("src"); video.load();
    }
  }
}
