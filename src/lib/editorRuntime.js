import { RATIO_OPTIONS } from "../config/editor.js";
import { applyAudioSpatialEffect, createAudioSpatialGraph, normalizeAudioSpatialAmount, normalizeAudioSpatialEffect } from "./audioSpatialEffects.js";
import {
  BufferTarget,
  CanvasSource,
  Output,
  WebMOutputFormat,
} from "mediabunny";

// Preserve display-frame updates for preview effects and keyframes. The
// timeline playhead paints independently through useTimelinePlayhead.
export const PLAYBACK_UI_FRAME_MS = 15;
export const DEFAULT_VISION_OPTIONS = Object.freeze({ removeBackground: false });
export const EMPTY_VISION_OPTIONS = Object.freeze({ removeBackground: false });

export function shouldCorrectPreviewMediaTime({ isPlaying, currentTime, targetTime, threshold = 0.04 }) {
  return !isPlaying && Number.isFinite(targetTime) && Math.abs((Number(currentTime) || 0) - targetTime) > threshold;
}

export function getAudioSegmentPreviewVolume(segment, timelineTime) {
  if (segment.muted === true) return 0;
  const volume = Math.max(0, Math.min(4, segment.volume ?? 1));
  const localTime = Math.max(0, Math.min(segment.duration, timelineTime - segment.start));
  const fadeIn = Math.max(0, Math.min(segment.duration, segment.fadeIn || 0));
  const fadeOut = Math.max(0, Math.min(segment.duration, segment.fadeOut || 0));
  const fadeInGain = fadeIn > 0 ? Math.min(1, localTime / fadeIn) : 1;
  const fadeOutGain = fadeOut > 0 ? Math.min(1, (segment.duration - localTime) / fadeOut) : 1;
  return volume * Math.max(0, Math.min(fadeInGain, fadeOutGain));
}

export function isAudioSegmentAudible(segment) {
  // A fade starting at zero still needs its media clock running.
  return segment.muted !== true && Number(segment.volume ?? 1) > 0;
}

let timelineAudioContext = null;
const timelineAudioGainNodes = new WeakMap();

export function setTimelineAudioGain(media, value, spatialEffect = "original", spatialAmount = 1) {
  if (!media) return;
  const gainValue = Math.max(0, Math.min(4, Number(value) || 0));
  let entry = timelineAudioGainNodes.get(media);
  if (!entry) {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    try {
      timelineAudioContext ||= AudioContextClass ? new AudioContextClass() : null;
      if (timelineAudioContext) {
        const source = timelineAudioContext.createMediaElementSource(media);
        const gain = timelineAudioContext.createGain();
        source.connect(gain);
        gain.connect(timelineAudioContext.destination);
        entry = { context: timelineAudioContext, source, gain, spatialGraph: null };
        timelineAudioGainNodes.set(media, entry);
      }
    } catch {
      entry = null;
    }
  }
  if (entry) {
    if (media.volume !== 1) media.volume = 1;
    if (entry.gainValue !== gainValue) {
      entry.gain.gain.value = gainValue;
      entry.gainValue = gainValue;
    }
    // Original audio needs only the source and gain nodes. Allocate the six
    // spatial-processing nodes when this clip actually uses a space effect.
    if (!entry.spatialGraph && normalizeAudioSpatialEffect(spatialEffect) !== "original" && normalizeAudioSpatialAmount(spatialAmount) > 0) {
      entry.source.disconnect(entry.gain);
      entry.spatialGraph = createAudioSpatialGraph(entry.context, entry.source, entry.gain);
      applyAudioSpatialEffect(entry.spatialGraph, "original", 1, { smooth: false });
    }
    if (entry.spatialGraph) applyAudioSpatialEffect(entry.spatialGraph, spatialEffect, spatialAmount);
  } else {
    const nativeVolume = Math.min(1, gainValue);
    if (media.volume !== nativeVolume) media.volume = nativeVolume;
  }
}

export async function decodeAvatarAudio16k(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持音频解码");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const values = decoded.getChannelData(channel);
      for (let i = 0; i < mono.length; i += 1) mono[i] += values[i] / decoded.numberOfChannels;
    }
    const outputLength = Math.min(64_000, Math.ceil(decoded.duration * 16_000));
    const resampled = new Float32Array(64_000);
    for (let i = 0; i < outputLength; i += 1) {
      const position = (i * decoded.sampleRate) / 16_000;
      const left = Math.min(mono.length - 1, Math.floor(position));
      const right = Math.min(mono.length - 1, left + 1);
      const ratio = position - left;
      resampled[i] = mono[left] * (1 - ratio) + mono[right] * ratio;
    }
    return resampled;
  } finally { await context.close().catch(() => {}); }
}

export function runAvatarWorkerTask(worker, message, transfer, terminalType, onProgress) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      if (event.data?.type === "progress") return void onProgress?.(event.data);
      if (event.data?.type === "error") return void reject(new Error(event.data.message));
      if (event.data?.type === terminalType) resolve(event.data);
    };
    worker.onerror = (event) => reject(new Error(event.message || "Worker error"));
    worker.postMessage(message, transfer);
  });
}

export function formatAvatarProgress(t, progress) {
  const template = progress.phaseKey ? t(progress.phaseKey) : progress.phase || t("avatarGenerating");
  return Object.entries(progress.phaseParams || {}).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

export async function encodeAvatarFrames(blobs, width, height, fps, keyframeTimes = [], duration = blobs.length / fps, options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("无法创建视频编码画布");
  if (typeof VideoEncoder === "undefined") throw new Error("当前浏览器不支持 WebCodecs 视频编码");
  const bitmaps = await Promise.all(blobs.map((blob) => createImageBitmap(blob)));
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const videoSource = new CanvasSource(canvas, {
    codec: "vp8",
    bitrate: Math.max(1_000_000, Math.round(width * height * Math.max(8, fps) * 0.55)),
    latencyMode: "realtime",
  });
  output.addVideoTrack(videoSource, { frameRate: fps });
  const abortOutput = () => { output.cancel().catch(() => {}); };
  options.signal?.addEventListener("abort", abortOutput, { once: true });
  try {
    await output.start();
    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (options.signal?.aborted) {
        const error = new Error("视频编码已取消");
        error.name = "AbortError";
        throw error;
      }
      const frameTime = frame / fps;
      let nearestIndex = 0; let nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < bitmaps.length; index += 1) {
        const time = keyframeTimes[index] ?? (index * duration) / Math.max(1, bitmaps.length - 1);
        const distance = Math.abs(time - frameTime);
        if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
      }
      context.drawImage(bitmaps[nearestIndex], 0, 0, width, height);
      await videoSource.add(frameTime, 1 / fps, { keyFrame: frame === 0 });
      options.onProgress?.((frame + 1) / totalFrames);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortOutput);
    bitmaps.forEach((bitmap) => bitmap.close());
  }
  const result = new Blob([target.buffer], { type: "video/webm" });
  if (!result.size) throw new Error("数字人视频编码结果为空");
  return result;
}

export function getNearestRatioIdForSize(width, height) {
  const w = Number(width); const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "";
  const mediaRatio = w / h;
  return RATIO_OPTIONS.reduce((best, option) => {
    const distance = Math.abs(Math.log(mediaRatio / (option.width / option.height)));
    return distance < best.distance ? { id: option.id, distance } : best;
  }, { id: RATIO_OPTIONS[0]?.id ?? "", distance: Number.POSITIVE_INFINITY }).id;
}

export function getObjectPositionForCrop(cropRect) {
  const normalized = cropRect?.normalized;
  if (!normalized) return "50% 50%";
  const horizontalRange = Math.max(0, 1 - normalized.width);
  const verticalRange = Math.max(0, 1 - normalized.height);
  const x = horizontalRange > 0.0001 ? (normalized.xMin / horizontalRange) * 100 : 50;
  const y = verticalRange > 0.0001 ? (normalized.yMin / verticalRange) * 100 : 50;
  return `${Math.max(0, Math.min(100, x))}% ${Math.max(0, Math.min(100, y))}%`;
}

export function isSameVisionDetection(detection, subject) {
  if (!detection?.box || !subject?.box || detection.label !== subject.label) return false;
  return [["xMin", "xmin"], ["yMin", "ymin"], ["xMax", "xmax"], ["yMax", "ymax"]].every(([camel, lower]) =>
    Math.abs((detection.box[camel] ?? detection.box[lower] ?? 0) - (subject.box[camel] ?? subject.box[lower] ?? 0)) < 0.004);
}

export function revokeVisionObjectUrls(value) {
  (Array.isArray(value) ? value : value ? [value] : []).forEach((url) => URL.revokeObjectURL(url));
}
export function getTimelineTrackLocalTime(time, start = 0, duration = 0) { return Math.max(0, Math.min(duration || 0, time - start)); }
export function isTimelineTimeInsideTrack(time, start = 0, duration = 0) { return duration > 0 && time >= start && time < start + duration; }

export function requestTimelineMediaPlay(media) {
  if (!media || media.__timelinePlayPending) return;
  timelineAudioGainNodes.get(media)?.context?.resume?.().catch(() => {});
  media.__timelinePlayPending = true;
  let request;
  try {
    request = media.play();
  } catch {
    media.__timelinePlayPending = false;
    return;
  }
  if (!request?.then) {
    media.__timelinePlayPending = false;
    return;
  }
  request.catch(() => {}).finally(() => { media.__timelinePlayPending = false; });
}
