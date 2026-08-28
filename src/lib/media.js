import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegCoreWasmURL from "@ffmpeg/core/wasm?url";
import ffmpegClassWorkerURL from "@ffmpeg/ffmpeg/worker?worker&url";

import { AUDIO_RECORDING_FORMATS, EXPORT_RECORDING_FORMATS, FILTER_OPTIONS } from "../config/editor.js";
import { throwIfExportAborted, waitForExportTimeout } from "./exportCancellation.js";
import {
  createCaptionSegments,
  getSegmentIndexAtTime,
  getVisualSegmentIndexAtTime,
  getVisualSegmentTimeline,
  makeId,
} from "./timeline.js";
import {
  drawCaptionLayout,
  getCaptionTextLayout,
  positionCaptionLayout,
  resolveCaptionSegmentPlacement,
} from "./captionLayout.js";
import { resolveCaptionStyleForSegment } from "./captionFonts.js";
import { resolveVisionAnalysisAtTime } from "./vision.js";
import { getVisualFitRect } from "./visualGeometry.js";
import { resolveSmartFrameCropAtTime, smartFrameCropToPixels } from "./smartFrame.js";
import {
  getVisualMaskFeatherPixels,
  getVisualMaskGeometry,
  getVisualPlaybackRateAtTime,
  getVisualSourceTime,
  normalizeVisualPlaybackRate,
  resolveVisualTransform,
} from "./visualEffects.js";
import { resolveVisualClipAnimation } from "./visualClipAnimations.js";
import { getStickerRenderGeometry } from "./stickerGeometry.js";
import { createPitchPreservedAudioBuffer } from "./pitchPreservingTimeStretch.js";
import { connectAudioSpatialEffect } from "./audioSpatialEffects.js";
import { emitMediaBackendDiagnostic, getMediaFileExtension, isLibavCompatibilityEnabled, MEDIA_BACKENDS } from "./mediaCompatibility.js";
import { getVectorDesignAppearance, getVectorRenderSource } from "./vectorDesign.js";
import { hasSubjectEffect, normalizeSubjectEffect } from "./subjectEffects.js";
import { resolveSubjectMaterialShadow } from "./subjectMaterialRendering.js";
import { drawCinematicDepthFrame, normalizeCinematicDepth, resolveDepthAnalysisAtTime } from "./depthOfField.js";
import { drawPhotoParallaxFrame, normalizePhotoParallax } from "./photoParallax.js";
import { createVideoTrackFrame } from "./videoTrackFrames.js";
import { composeColorGradeFilter, resolveColorGrade } from "./colorGrade.js";
import { normalizeClickRippleEffect, resolveClickRippleState } from "./clickRippleEffect.js";

export function getAudioRecordingFormat() {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  return (
    AUDIO_RECORDING_FORMATS.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) ?? {
      mimeType: "",
      extension: "webm",
    }
  );
}

let ffmpegLoadPromise = null;
let ffmpegTaskQueue = Promise.resolve();
const subjectMaterialImageCache = new Map();

const SUBJECT_MATERIAL_TEXTURES = {
  paper: "/assets/effects/paper-fiber.webp?v=3",
  frosted: "/assets/effects/frosted-grain.webp?v=3",
  halo: "/assets/effects/halo-ring.webp?v=3",
  chrome: "/assets/effects/chrome-flow.webp?v=3",
  impasto: "/assets/effects/impasto-paint.webp?v=3",
  ink: "/assets/effects/ink-bleed.webp?v=3",
};

function getSubjectMaterialTexture(materialId) {
  if (typeof Image === "undefined") return null;
  if (!subjectMaterialImageCache.has(materialId)) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = SUBJECT_MATERIAL_TEXTURES[materialId] || SUBJECT_MATERIAL_TEXTURES.paper;
    subjectMaterialImageCache.set(materialId, image);
  }
  const image = subjectMaterialImageCache.get(materialId);
  return image?.complete && image.naturalWidth > 0 ? image : null;
}

const VIDEO_TRACK_FRAME_MAX = 480;
const VIDEO_TRACK_FRAME_HEIGHT = 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getVideoTrackSampleCount(duration, maxFrames = VIDEO_TRACK_FRAME_MAX) {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (!safeDuration) {
    return 0;
  }

  // Timeline filmstrips are an editing surface, not a decorative poster row.
  // Short clips need enough timestamped samples for the frame beneath the
  // playhead to agree with the preview after deep timeline zoom. Longer clips
  // remain bounded by VIDEO_TRACK_FRAME_MAX to keep import memory predictable.
  const targetStep =
    safeDuration <= 16
      ? 1 / 30
      : safeDuration <= 30
        ? 1 / 20
      : safeDuration <= 60
        ? 0.1
      : safeDuration <= 120
        ? 0.2
        : safeDuration <= 600
          ? 0.5
          : 1.5;

  return Math.max(1, Math.min(maxFrames, Math.ceil(safeDuration / targetStep)));
}

export function seekVideoFrame(video, time) {
  const safeTime = Math.max(0, Math.min(time, Math.max(0, (video.duration || time) - 0.04)));
  return new Promise((resolve, reject) => {
    let callbackId = 0;
    let timeoutId = 0;
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      if (callbackId) video.cancelVideoFrameCallback?.(callbackId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
    const resolvePresentedFrame = () => {
      if (typeof video.requestVideoFrameCallback !== "function") {
        window.requestAnimationFrame(() => {
          cleanup();
          resolve(video.currentTime);
        });
        return;
      }
      callbackId = video.requestVideoFrameCallback((_now, metadata) => {
        const mediaTime = Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime : video.currentTime;
        cleanup();
        resolve(mediaTime);
      });
      timeoutId = window.setTimeout(() => {
        cleanup();
        resolve(video.currentTime);
      }, 500);
    };
    const handleSeeked = () => {
      video.removeEventListener("seeked", handleSeeked);
      resolvePresentedFrame();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Video frame seek failed"));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    if (video.readyState >= 2 && Math.abs(video.currentTime - safeTime) < 0.015) {
      resolvePresentedFrame();
    } else {
      video.currentTime = safeTime;
    }
  });
}

async function extractVideoTrackFramesWithWebCodecs(src, sampleTimes, options) {
  if (typeof VideoDecoder === "undefined" || !sampleTimes.length) return null;
  const { width, height, quality, signal, duration, maxFrames } = options;
  let input = null;
  try {
    const blob = src instanceof Blob
      ? src
      : await fetch(String(src), { signal }).then((response) => {
          if (!response.ok) throw new Error(`Video read failed (${response.status})`);
          return response.blob();
        });
    if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
    const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import("mediabunny");
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const sink = new CanvasSink(track, {
      width,
      height,
      fit: "fill",
      poolSize: 3,
      decoderOptions: { optimizeForLatency: true },
    });
    const frames = [];
    const packetStats = await track.computePacketStats(Math.max(1, maxFrames) + 1);
    if (packetStats.packetCount <= maxFrames) {
      for await (const result of sink.canvases(0, duration)) {
        if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
        if (!result?.canvas) continue;
        frames.push(createVideoTrackFrame(
          result.canvas.toDataURL("image/jpeg", quality),
          result.timestamp,
        ));
      }
      return frames;
    }
    for await (const result of sink.canvasesAtTimestamps(sampleTimes)) {
      if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
      if (!result?.canvas) continue;
      frames.push(createVideoTrackFrame(
        result.canvas.toDataURL("image/jpeg", quality),
        result.timestamp,
      ));
    }
    return frames;
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    console.warn("Video timeline WebCodecs extraction unavailable; using native seek fallback.", error);
    return null;
  } finally {
    input?.dispose();
  }
}

export async function extractVideoTrackFrames(src, options = {}) {
  const {
    duration,
    width,
    height,
    maxFrames = VIDEO_TRACK_FRAME_MAX,
    quality = 0.88,
    signal,
  } = options;
  const video = await loadVideo(src);
  const safeDuration = Math.max(0, duration || video.duration || 0);
  const frameCount = getVideoTrackSampleCount(safeDuration, maxFrames);
  if (!frameCount) {
    return [];
  }

  const naturalWidth = Math.max(1, width || video.videoWidth || 16);
  const naturalHeight = Math.max(1, height || video.videoHeight || 9);
  const aspectRatio = naturalWidth / naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.height = VIDEO_TRACK_FRAME_HEIGHT;
  canvas.width = Math.max(36, Math.min(360, Math.round(canvas.height * aspectRatio)));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    return [];
  }

  try {
    const sampleTimes = Array.from(
      { length: frameCount },
      (_, index) => (index / frameCount) * safeDuration,
    );
    const decodedFrames = await extractVideoTrackFramesWithWebCodecs(src, sampleTimes, {
      width: canvas.width,
      height: canvas.height,
      quality,
      signal,
      duration: safeDuration,
      maxFrames,
    });
    if (decodedFrames?.length) return decodedFrames;
    const frames = [];
    video.pause();
    for (let index = 0; index < frameCount; index += 1) {
      if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
      const time = sampleTimes[index];
      const sourceTime = await seekVideoFrame(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(createVideoTrackFrame(canvas.toDataURL("image/jpeg", quality), sourceTime));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export async function createVideoTrackFramesFromBlobs(blobs, options = {}) {
  const sourceFrames = Array.isArray(blobs) ? blobs.filter((blob) => blob instanceof Blob) : [];
  if (!sourceFrames.length) return [];
  const {
    duration,
    width,
    height,
    maxFrames = VIDEO_TRACK_FRAME_MAX,
    quality = 0.88,
    signal,
  } = options;
  const frameCount = Math.min(
    sourceFrames.length,
    getVideoTrackSampleCount(Math.max(0, Number(duration) || 0), maxFrames),
  );
  if (!frameCount) return [];
  const naturalWidth = Math.max(1, Number(width) || 16);
  const naturalHeight = Math.max(1, Number(height) || 9);
  const canvas = document.createElement("canvas");
  canvas.height = VIDEO_TRACK_FRAME_HEIGHT;
  canvas.width = Math.max(36, Math.min(360, Math.round(canvas.height * naturalWidth / naturalHeight)));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return [];

  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
    const sourceIndex = Math.max(
      0,
      Math.min(
        sourceFrames.length - 1,
        Math.round(((index + 0.5) / frameCount) * sourceFrames.length - 0.5),
      ),
    );
    const bitmap = await createImageBitmap(sourceFrames[sourceIndex]);
    try {
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const safeDuration = Math.max(0, Number(duration) || 0);
      const sourceTime = safeDuration > 0
        ? ((sourceIndex + 0.5) / sourceFrames.length) * safeDuration
        : sourceIndex;
      frames.push(createVideoTrackFrame(canvas.toDataURL("image/jpeg", quality), sourceTime));
    } finally {
      bitmap.close();
    }
  }
  return frames;
}

export async function decodeWaveform(blob, barCount = 118) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return { duration: 0, peaks: [] };
  }

  const audioContext = new AudioContextClass();

  try {
    const buffer = await blob.arrayBuffer();
    let decoded;
    try {
      decoded = await audioContext.decodeAudioData(buffer.slice(0));
      emitMediaBackendDiagnostic({ phase: "ready", backend: MEDIA_BACKENDS.NATIVE, operation: "audio-decode" });
    } catch (nativeError) {
      let normalized = null;
      let backend = MEDIA_BACKENDS.FFMPEG;
      if (isLibavCompatibilityEnabled() && ["ac3", "mka", "mkv"].includes(getMediaFileExtension(blob))) {
        try {
          const { decodeAudioWithLibavWorker } = await import("./libavCompatibilityClient.js");
          normalized = (await decodeAudioWithLibavWorker(blob)).blob;
          backend = MEDIA_BACKENDS.LIBAV;
        } catch (error) {
          console.warn("libav.js audio decode failed; using FFmpeg.wasm", error);
        }
      }
      emitMediaBackendDiagnostic({ phase: "fallback", backend, operation: "audio-decode" });
      normalized ??= await transcodeAudioToWav(blob);
      try {
        decoded = await audioContext.decodeAudioData((await normalized.arrayBuffer()).slice(0));
      } catch (fallbackError) {
        fallbackError.cause = nativeError;
        throw fallbackError;
      }
    }
    const channelData = decoded.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / barCount));
    const peaks = Array.from({ length: barCount }, (_, index) => {
      const start = index * blockSize;
      let peak = 0;
      let sumSquares = 0;
      let samples = 0;
      for (
        let cursor = start;
        cursor < start + blockSize && cursor < channelData.length;
        cursor += 1
      ) {
        const value = Math.abs(channelData[cursor]);
        peak = Math.max(peak, value);
        sumSquares += value * value;
        samples += 1;
      }
      const rms = samples ? Math.sqrt(sumSquares / samples) : 0;
      return rms * 0.78 + peak * 0.22;
    });
    const strongest = Math.max(...peaks, 0.001);

    return {
      duration: decoded.duration,
      peaks: peaks.map((peak) => Math.max(0.04, Math.min(1, Math.pow(peak / strongest, 0.72)))),
    };
  } finally {
    await audioContext.close().catch(() => {});
  }
}

function encodeAudioBufferAsWav(buffer) {
  const channels = Math.max(1, buffer.numberOfChannels);
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const output = new ArrayBuffer(44 + frames * blockAlign);
  const view = new DataView(output);
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, output.byteLength - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, frames * blockAlign, true);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

export async function sliceAudioBlob(blob, start = 0, duration = Infinity) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持 AudioContext，无法裁剪音频。");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const safeStart = Math.max(0, Math.min(decoded.duration, Number(start) || 0));
    const safeDuration = Math.max(0, Math.min(decoded.duration - safeStart, Number(duration) || decoded.duration));
    if (safeStart <= 0.001 && safeDuration >= decoded.duration - 0.001) return blob;
    const startFrame = Math.floor(safeStart * decoded.sampleRate);
    const frameCount = Math.max(1, Math.floor(safeDuration * decoded.sampleRate));
    const sliced = context.createBuffer(decoded.numberOfChannels, frameCount, decoded.sampleRate);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      sliced.getChannelData(channel).set(decoded.getChannelData(channel).subarray(startFrame, startFrame + frameCount));
    }
    return encodeAudioBufferAsWav(sliced);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function concatenateAudioBlobs(blobs = []) {
  const sources = blobs.filter((blob) => blob instanceof Blob && blob.size > 0);
  if (!sources.length) throw new Error("没有可合并的音频");
  if (sources.length === 1) return sources[0];
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineAudioContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextClass || !OfflineAudioContextClass) throw new Error("当前浏览器不支持音频合并");
  const decoder = new AudioContextClass();
  try {
    const decoded = await Promise.all(sources.map(async (blob) => decoder.decodeAudioData((await blob.arrayBuffer()).slice(0))));
    const sampleRate = Math.max(...decoded.map((buffer) => buffer.sampleRate));
    const channels = Math.max(...decoded.map((buffer) => buffer.numberOfChannels));
    const totalFrames = decoded.reduce((total, buffer) => total + Math.ceil(buffer.duration * sampleRate), 0);
    const offline = new OfflineAudioContextClass(channels, totalFrames, sampleRate);
    let cursor = 0;
    for (const buffer of decoded) {
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start(cursor);
      cursor += buffer.duration;
    }
    return encodeAudioBufferAsWav(await offline.startRendering());
  } finally {
    await decoder.close().catch(() => {});
  }
}

export async function reverseAudioBlob(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持 AudioContext，无法反转音频。");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const reversed = context.createBuffer(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const source = decoded.getChannelData(channel);
      const target = reversed.getChannelData(channel);
      for (let index = 0; index < source.length; index += 1) target[index] = source[source.length - 1 - index];
    }
    return encodeAudioBufferAsWav(reversed);
  } finally {
    await context.close().catch(() => {});
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function createTemporalMaskCache(urls, maxEntries = 8) {
  const orderedUrls = Array.from(new Set(urls.filter(Boolean)));
  const urlIndexes = new Map(orderedUrls.map((url, index) => [url, index]));
  const entries = new Map();
  let lastReadyImage = null;

  const evictIfNeeded = () => {
    while (entries.size > maxEntries) {
      const candidate = Array.from(entries.entries()).find(([, entry]) => entry.image);
      if (!candidate) {
        return;
      }
      const [url, entry] = candidate;
      entries.delete(url);
      if (lastReadyImage === entry.image) {
        lastReadyImage = null;
      }
      entry.image.removeAttribute("src");
    }
  };

  const load = (url) => {
    if (!url) {
      return Promise.resolve(null);
    }
    const existing = entries.get(url);
    if (existing?.image) {
      entries.delete(url);
      entries.set(url, existing);
      return Promise.resolve(existing.image);
    }
    if (existing?.promise) {
      return existing.promise;
    }

    const entry = { image: null, promise: null };
    entry.promise = loadImage(url)
      .then((image) => {
        entry.image = image;
        entry.promise = null;
        lastReadyImage = image;
        entries.delete(url);
        entries.set(url, entry);
        evictIfNeeded();
        return image;
      })
      .catch(() => {
        entries.delete(url);
        return null;
      });
    entries.set(url, entry);
    return entry.promise;
  };

  const prefetchAround = (url) => {
    const index = urlIndexes.get(url);
    if (!Number.isInteger(index)) {
      return load(url);
    }
    return Promise.all(
      [orderedUrls[index], orderedUrls[index + 1], orderedUrls[index - 1]]
        .filter(Boolean)
        .map(load),
    );
  };

  return {
    async prepare(url) {
      await prefetchAround(url);
    },
    get(url) {
      const entry = entries.get(url);
      if (entry?.image) {
        entries.delete(url);
        entries.set(url, entry);
        prefetchAround(url).catch(() => {});
        lastReadyImage = entry.image;
        return entry.image;
      }
      prefetchAround(url).catch(() => {});
      return lastReadyImage;
    },
    dispose() {
      entries.forEach((entry) => entry.image?.removeAttribute("src"));
      entries.clear();
      lastReadyImage = null;
    },
  };
}

export function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => resolve(video);
    video.onerror = reject;
    video.src = src;
  });
}

export function getVisualDimensions(visual) {
  return {
    width: visual.videoWidth || visual.naturalWidth || visual.displayWidth || visual.width || 1,
    height: visual.videoHeight || visual.naturalHeight || visual.displayHeight || visual.height || 1,
  };
}

const maskedVisualLayerCache = new WeakMap();
const visualEffectsLayerCache = new WeakMap();

function getVisualEffectsLayers(canvas) {
  let layers = visualEffectsLayerCache.get(canvas);
  if (!layers) {
    layers = {
      visual: document.createElement("canvas"),
      mask: document.createElement("canvas"),
      shadow: document.createElement("canvas"),
    };
    visualEffectsLayerCache.set(canvas, layers);
  }
  for (const layer of Object.values(layers)) {
    if (layer.width !== canvas.width || layer.height !== canvas.height) {
      layer.width = canvas.width;
      layer.height = canvas.height;
    }
  }
  return layers;
}

function drawVisualEffectsMask(context, mask, canvas) {
  const geometry = getVisualMaskGeometry(mask, canvas);
  const feather = getVisualMaskFeatherPixels(mask, canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  if (mask.inverted) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "destination-out";
  }
  context.fillStyle = "#fff";
  context.filter = feather ? `blur(${feather}px)` : "none";
  context.beginPath();
  if (mask.type === "circle") {
    context.arc(geometry.centerX, geometry.centerY, geometry.radius, 0, Math.PI * 2);
  } else {
    context.roundRect(
      geometry.centerX - geometry.width / 2,
      geometry.centerY - geometry.height / 2,
      geometry.width,
      geometry.height,
      geometry.cornerRadius,
    );
  }
  context.fill();
  context.restore();
}

function drawOverlayMaskShape(context, mask, canvas, visual) {
  const visualSize = getVisualDimensions(visual);
  const box = getVisualFitRect(visualSize, canvas, "contain");
  const geometry = getVisualMaskGeometry(mask, { width: box.width, height: box.height });
  const feather = getVisualMaskFeatherPixels(mask, { width: box.width, height: box.height });
  context.fillStyle = "#fff";
  context.filter = feather ? `blur(${feather}px)` : "none";
  context.beginPath();
  if (mask.type === "circle") {
    context.arc(box.x + geometry.centerX, box.y + geometry.centerY, geometry.radius, 0, Math.PI * 2);
  } else {
    context.roundRect(
      box.x + geometry.centerX - geometry.width / 2,
      box.y + geometry.centerY - geometry.height / 2,
      geometry.width,
      geometry.height,
      geometry.cornerRadius,
    );
  }
  context.fill();
}

function getMaskedVisualLayer(canvas) {
  let layer = maskedVisualLayerCache.get(canvas);
  if (!layer) {
    layer = document.createElement("canvas");
    maskedVisualLayerCache.set(canvas, layer);
  }
  if (layer.width !== canvas.width || layer.height !== canvas.height) {
    layer.width = canvas.width;
    layer.height = canvas.height;
  }
  return layer;
}

function drawVisualUsingLayout(context, visual, layout, isMask = false) {
  if (layout.smartCropRect) {
    const visualSize = getVisualDimensions(visual);
    const scaleX = isMask ? visualSize.width / Math.max(1, layout.sourceSize.width) : 1;
    const scaleY = isMask ? visualSize.height / Math.max(1, layout.sourceSize.height) : 1;
    context.drawImage(
      visual,
      layout.smartCropRect.x * scaleX,
      layout.smartCropRect.y * scaleY,
      layout.smartCropRect.width * scaleX,
      layout.smartCropRect.height * scaleY,
      0,
      0,
      layout.outputSize.width,
      layout.outputSize.height,
    );
    return;
  }

  context.drawImage(
    visual,
    layout.drawRect.x,
    layout.drawRect.y,
    layout.drawRect.width,
    layout.drawRect.height,
  );
}

function drawFittedVisual(context, visual, canvas, fitMode, filter, vision = null, requestedSubjectEffect = null, smartFrameCrop = null) {
  const { width, height } = canvas;
  const visualSize = getVisualDimensions(visual);
  const smartCropRect = smartFrameCrop
    ? smartFrameCropToPixels(smartFrameCrop, visualSize)
    : null;

  let layout;
  if (smartCropRect?.presentation === "safe-contain") {
    const backgroundRect = getVisualFitRect(visualSize, canvas, "cover");
    const backgroundScale = 1.1;
    const backgroundWidth = backgroundRect.width * backgroundScale;
    const backgroundHeight = backgroundRect.height * backgroundScale;
    context.save();
    context.fillStyle = "#080a0e";
    context.fillRect(0, 0, width, height);
    context.filter = "blur(20px) brightness(58%) saturate(112%)";
    drawVisualUsingLayout(context, visual, {
      sourceSize: visualSize,
      smartCropRect: null,
      drawRect: {
        x: backgroundRect.x - (backgroundWidth - backgroundRect.width) / 2,
        y: backgroundRect.y - (backgroundHeight - backgroundRect.height) / 2,
        width: backgroundWidth,
        height: backgroundHeight,
      },
      outputSize: { width, height },
    });
    context.restore();
    const fitRect = getVisualFitRect(visualSize, canvas, "contain");
    layout = {
      sourceSize: visualSize,
      smartCropRect: null,
      drawRect: { x: fitRect.x, y: fitRect.y, width: fitRect.width, height: fitRect.height },
      fitMode: "contain",
      outputSize: { width, height },
    };
  } else if (smartCropRect) {
    layout = {
      sourceSize: visualSize,
      smartCropRect,
      drawRect: { x: 0, y: 0, width, height },
      fitMode: "cover",
      outputSize: { width, height },
    };
  } else {
    const fitRect = getVisualFitRect(visualSize, canvas, fitMode);
    layout = {
      sourceSize: visualSize,
      smartCropRect: null,
      drawRect: { x: fitRect.x, y: fitRect.y, width: fitRect.width, height: fitRect.height },
      fitMode: fitRect.fitMode,
      outputSize: { width, height },
    };
  }

  const subjectEffect = normalizeSubjectEffect(requestedSubjectEffect);
  const subjectEffectActive = hasSubjectEffect(subjectEffect) && Boolean(vision?.maskVisual);
  const maskVisual = (
    vision?.options?.removeBackground || subjectEffectActive
  ) && vision?.maskVisual ? vision.maskVisual : null;
  if (maskVisual) {
    const layer = getMaskedVisualLayer(canvas);
    const layerContext = layer.getContext("2d");
    layerContext.clearRect(0, 0, layer.width, layer.height);
    layerContext.save();
    layerContext.filter = filter;
    drawVisualUsingLayout(layerContext, visual, layout);
    layerContext.filter = "none";
    layerContext.globalCompositeOperation = "destination-in";
    drawVisualUsingLayout(layerContext, maskVisual, layout, true);
    layerContext.restore();
    if (subjectEffectActive) {
      const background = subjectEffect.background;
      if (background.visible !== false && background.mode === "original") {
        context.filter = filter;
        drawVisualUsingLayout(context, visual, layout);
        context.filter = "none";
      } else if (background.visible !== false && background.mode === "blur") {
        context.save();
        context.filter = `blur(${background.blur}px) brightness(${1 - background.darken})`;
        context.globalAlpha = background.opacity;
        drawVisualUsingLayout(context, visual, layout);
        context.restore();
      } else if (background.visible !== false && background.mode === "color") {
        context.save();
        context.globalAlpha = background.opacity;
        context.fillStyle = background.color;
        context.fillRect(layout.drawRect.x, layout.drawRect.y, layout.drawRect.width, layout.drawRect.height);
        context.restore();
      }
      if (subjectEffect.outline.enabled && subjectEffect.outline.width > 0) {
        const outlineLayer = getVisualEffectsLayers(canvas).mask;
        const outlineContext = outlineLayer.getContext("2d");
        outlineContext.clearRect(0, 0, outlineLayer.width, outlineLayer.height);
        outlineContext.drawImage(layer, 0, 0);
        outlineContext.globalCompositeOperation = "source-in";
        outlineContext.globalAlpha = subjectEffect.outline.opacity;
        const materialTexture = getSubjectMaterialTexture(subjectEffect.material.id);
        if (materialTexture) {
          const pattern = outlineContext.createPattern(materialTexture, "repeat");
          const textureScale = Math.max(0.35, subjectEffect.material.textureScale);
          pattern?.setTransform?.(new DOMMatrix().scale(0.22 / textureScale));
          outlineContext.fillStyle = pattern || subjectEffect.outline.color;
          outlineContext.fillRect(0, 0, outlineLayer.width, outlineLayer.height);
          outlineContext.globalCompositeOperation = "source-atop";
          outlineContext.globalAlpha = Math.max(0, 1 - subjectEffect.material.textureStrength) * subjectEffect.outline.opacity;
          outlineContext.fillStyle = subjectEffect.outline.color;
          outlineContext.fillRect(0, 0, outlineLayer.width, outlineLayer.height);
        } else {
          outlineContext.fillStyle = subjectEffect.outline.color;
          outlineContext.fillRect(0, 0, outlineLayer.width, outlineLayer.height);
        }
        outlineContext.globalAlpha = 1;
        outlineContext.globalCompositeOperation = "source-over";
        const width = subjectEffect.outline.width;
        const materialId = subjectEffect.material.id;
        const edgeDensity = subjectEffect.material.edgeDensity;
        const irregularity = ["paper", "impasto", "ink"].includes(materialId)
          ? subjectEffect.material.irregularity * width * (materialId === "ink" ? 0.32 : 0.18)
          : 0;
        const waveCount = 2.4 + edgeDensity * 9.6;
        const offsetAt = (angle, radius) => [
          Math.cos(angle) * (radius + Math.sin(angle * waveCount + 0.7) * irregularity),
          Math.sin(angle) * (radius + Math.cos(angle * (waveCount * 0.89) - 0.35) * irregularity),
        ];
        const offsetCount = Math.round((materialId === "frosted" ? 18 : 10) + edgeDensity * 14);
        const offsets = Array.from({ length: offsetCount }, (_, index) => (
          offsetAt((Math.PI * 2 * index) / offsetCount, width)
        ));
        if (materialId === "halo" && subjectEffect.material.rings > 1) {
          const secondRadius = width + subjectEffect.material.ringGap;
          offsets.push(...Array.from({ length: 16 }, (_, index) => offsetAt((Math.PI * 2 * index) / 16, secondRadius)));
        }
        if (subjectEffect.material.shadowDepth > 0) {
          const shadowLayer = getVisualEffectsLayers(canvas).shadow;
          const shadowContext = shadowLayer.getContext("2d");
          const shadowDepth = subjectEffect.material.shadowDepth;
          const materialShadow = resolveSubjectMaterialShadow(width, shadowDepth);
          shadowContext.clearRect(0, 0, shadowLayer.width, shadowLayer.height);
          shadowContext.save();
          shadowContext.shadowColor = `rgba(2, 4, 6, ${materialShadow.opacity})`;
          shadowContext.shadowBlur = materialShadow.blur;
          shadowContext.shadowOffsetX = materialShadow.offsetX;
          shadowContext.shadowOffsetY = materialShadow.offsetY;
          offsets.forEach(([x, y]) => shadowContext.drawImage(outlineLayer, x, y));
          shadowContext.restore();
          shadowContext.save();
          shadowContext.globalCompositeOperation = "destination-out";
          offsets.forEach(([x, y]) => shadowContext.drawImage(outlineLayer, x, y));
          shadowContext.restore();
          context.drawImage(shadowLayer, 0, 0);
        }
        context.save();
        if (subjectEffect.outline.glow > 0) {
          context.shadowColor = subjectEffect.outline.color;
          context.shadowBlur = subjectEffect.outline.glowRadius * subjectEffect.outline.glow;
        }
        offsets.forEach(([x, y]) => context.drawImage(outlineLayer, x, y));
        context.restore();
      }
    }
    context.drawImage(layer, 0, 0);
  } else {
    context.filter = filter;
    drawVisualUsingLayout(context, visual, layout);
    context.filter = "none";
  }

  return layout;
}

function drawClickRippleEffect(context, canvas, value, time, region = null) {
  const effect = normalizeClickRippleEffect(value);
  if (!effect.enabled) return;
  const state = resolveClickRippleState(effect, time);
  const { width, height } = canvas;
  const effectRegion = region || { x: 0, y: 0, width, height };
  const minDimension = Math.min(effectRegion.width, effectRegion.height);
  const x = effectRegion.x + state.hitX / 100 * effectRegion.width;
  const y = effectRegion.y + state.hitY / 100 * effectRegion.height;
  const cursorX = effectRegion.x + state.x / 100 * effectRegion.width;
  const cursorY = effectRegion.y + state.y / 100 * effectRegion.height;
  const revealX = effectRegion.x + state.revealX / 100 * effectRegion.width;
  const revealY = effectRegion.y + state.revealY / 100 * effectRegion.height;
  const startRadius = effect.radius / 100 * minDimension;
  const farthestRevealRadius = Math.max(
    Math.hypot(revealX - effectRegion.x, revealY - effectRegion.y),
    Math.hypot(revealX - (effectRegion.x + effectRegion.width), revealY - effectRegion.y),
    Math.hypot(revealX - effectRegion.x, revealY - (effectRegion.y + effectRegion.height)),
    Math.hypot(revealX - (effectRegion.x + effectRegion.width), revealY - (effectRegion.y + effectRegion.height)),
  );
  const farthestRingRadius = Math.max(
    Math.hypot(x - effectRegion.x, y - effectRegion.y),
    Math.hypot(x - (effectRegion.x + effectRegion.width), y - effectRegion.y),
    Math.hypot(x - effectRegion.x, y - (effectRegion.y + effectRegion.height)),
    Math.hypot(x - (effectRegion.x + effectRegion.width), y - (effectRegion.y + effectRegion.height)),
  );
  const revealRadius = startRadius + (farthestRevealRadius - startRadius) * state.revealProgress;
  const ringRadius = startRadius + (farthestRingRadius - startRadius) * state.rippleProgress;
  const grayscale = effect.colorAmount;
  const snapshot = getVisualEffectsLayers(canvas).visual;
  const snapshotContext = snapshot.getContext("2d");
  snapshotContext.clearRect(0, 0, width, height);
  snapshotContext.drawImage(canvas, 0, 0);
  if (grayscale > 0.002) {
    context.save();
    context.beginPath();
    context.rect(effectRegion.x, effectRegion.y, effectRegion.width, effectRegion.height);
    context.clip();
    context.filter = `grayscale(${grayscale})`;
    context.drawImage(snapshot, 0, 0);
    context.restore();
    context.save();
    context.beginPath();
    context.arc(revealX, revealY, Math.max(2, revealRadius), 0, Math.PI * 2);
    context.clip();
    context.drawImage(snapshot, 0, 0);
    context.restore();
  }
  if (state.ringOpacity > 0.002) {
    const color = effect.color;
    const refractSnapshot = getVisualEffectsLayers(canvas).mask;
    const refractContext = refractSnapshot.getContext("2d");
    refractContext.clearRect(0, 0, width, height);
    refractContext.drawImage(canvas, 0, 0);
    const wavelength = Math.max(3, minDimension * 0.028);
    context.save();
    context.beginPath(); context.rect(effectRegion.x, effectRegion.y, effectRegion.width, effectRegion.height); context.clip();
    {
      const waveRadius = ringRadius;
      const bandWidth = Math.max(2, wavelength * 0.34);
      const opacity = state.ringOpacity;

      context.save();
      context.beginPath();
      context.arc(x, y, waveRadius + bandWidth, 0, Math.PI * 2);
      context.arc(x, y, Math.max(0, waveRadius - bandWidth), 0, Math.PI * 2, true);
      context.clip("evenodd");
      const refractionScale = 1 + 0.006 * opacity;
      context.globalAlpha = Math.min(0.72, opacity * 0.52);
      context.translate(x, y);
      context.scale(refractionScale, refractionScale);
      context.translate(-x, -y);
      context.drawImage(refractSnapshot, 0, 0);
      context.restore();

      context.globalAlpha = opacity * 0.92;
      context.strokeStyle = color;
      context.lineWidth = Math.max(1, bandWidth * 0.5);
      context.shadowColor = color;
      context.shadowBlur = minDimension * 0.025 * effect.glow * opacity;
      context.beginPath();
      context.arc(x, y, waveRadius, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = opacity * 0.32;
      context.strokeStyle = "rgba(3, 16, 22, .72)";
      context.lineWidth = Math.max(1, bandWidth * 0.3);
      context.shadowBlur = 0;
      context.beginPath();
      context.arc(x, y, Math.max(1, waveRadius - bandWidth * 0.72), 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }
  context.save();
  context.globalAlpha = Math.max(0.24, state.ringOpacity) * state.hitOpacity;
  context.strokeStyle = "rgba(255, 255, 255, .96)";
  context.lineWidth = Math.max(1.5, minDimension * 0.003);
  context.shadowColor = effect.color;
  context.shadowBlur = minDimension * 0.025 * effect.glow;
  context.beginPath();
  context.arc(cursorX, cursorY, Math.max(5, startRadius * state.press * state.hitScale), 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

export function drawPreviewFrame(context, visual, canvas, options) {
  const {
    subtitle,
    fitMode = "contain",
    filter = "none",
    captionsEnabled = true,
    captionPosition = "bottom",
    captionPlacement = null,
    captionSize = 14,
    captionStyle = {},
    captionReferenceSize = null,
    sticker = null,
    stickerImage = null,
    stickers = [],
    stickerImages = [],
    transitionId = "none",
    transitionNext = null,
    transitionProgress = 0,
    vision = null,
    depth = null,
    visualEffects = null,
    visualTime = 0,
    visualOverlays = [],
    visualOverlaySources = [],
  } = options;

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#090b0f";
  context.fillRect(0, 0, width, height);
  const subjectEffect = normalizeSubjectEffect(visualEffects?.subjectEffect);
  if (hasSubjectEffect(subjectEffect) && subjectEffect.background.mode === "color") {
    context.save();
    context.globalAlpha = subjectEffect.background.opacity;
    context.fillStyle = subjectEffect.background.color;
    context.fillRect(0, 0, width, height);
    context.restore();
  }
  const transform = resolveVisualTransform(visualEffects?.keyframes, visualTime, visualEffects?.baseTransform);
  const animation = resolveVisualClipAnimation(visualEffects?.animation, visualTime, visualEffects?.duration);
  const animatedTransform = {
    ...transform,
    x: transform.x + animation.x,
    y: transform.y + animation.y,
    scale: transform.scale * animation.scale,
    opacity: transform.opacity * animation.opacity,
  };
  const mask = visualEffects?.mask ?? {};
  const maskCenterX = (Number.isFinite(mask.centerX) ? mask.centerX : 50) / 100 * width;
  const maskCenterY = (Number.isFinite(mask.centerY) ? mask.centerY : 50) / 100 * height;
  const circleSize = (Number.isFinite(mask.size) ? mask.size : 72) / 100 * Math.min(width, height);
  const maskWidth = mask.type === "circle" ? circleSize : (Number.isFinite(mask.width) ? mask.width : 80) / 100 * width;
  const maskHeight = mask.type === "circle" ? circleSize : (Number.isFinite(mask.height) ? mask.height : 80) / 100 * height;
  const usesAlphaMask = mask.type && mask.type !== "none" && (mask.inverted || Number(mask.feather) > 0);
  const cinematicDepth = normalizeCinematicDepth(visualEffects?.cinematicDepth);
  const photoParallax = normalizePhotoParallax(visualEffects?.photoParallax);
  const primaryFilter = composeColorGradeFilter(filter, resolveColorGrade(visualEffects?.keyframes, visualTime, visualEffects?.colorGrade));
  const drawPrimaryVisual = (targetContext, targetCanvas) => {
    if ((photoParallax.enabled || cinematicDepth.enabled) && depth?.depthVisual) {
      if (photoParallax.enabled) drawPhotoParallaxFrame(targetContext, visual, targetCanvas, {
        effect: photoParallax, depthVisual: depth.depthVisual, fitMode, filter: primaryFilter, time: visualTime, clear: false,
      });
      else drawCinematicDepthFrame(targetContext, visual, targetCanvas, {
        effect: cinematicDepth, depthVisual: depth.depthVisual, fitMode, filter: primaryFilter, clear: false,
      });
      const sourceSize = getVisualDimensions(visual);
      const fitRect = getVisualFitRect(sourceSize, targetCanvas, fitMode);
      return {
        sourceSize,
        smartCropRect: null,
        drawRect: fitRect,
        fitMode: fitRect.fitMode,
        outputSize: { width: targetCanvas.width, height: targetCanvas.height },
      };
    }
    const smartFrameSourceTime = getVisualSourceTime(visualEffects, visualTime);
    const smartFrameCrop = resolveSmartFrameCropAtTime(visualEffects?.smartFrame, smartFrameSourceTime);
    return drawFittedVisual(targetContext, visual, targetCanvas, fitMode, primaryFilter, vision, visualEffects?.subjectEffect, smartFrameCrop);
  };
  if (usesAlphaMask) {
    const layers = getVisualEffectsLayers(canvas);
    const layerContext = layers.visual.getContext("2d");
    const maskContext = layers.mask.getContext("2d");
    layerContext.clearRect(0, 0, width, height);
    layerContext.save();
    layerContext.globalAlpha = animatedTransform.opacity;
    layerContext.translate(width / 2 + (animatedTransform.x / 100) * width, height / 2 + (animatedTransform.y / 100) * height);
    layerContext.rotate((animatedTransform.rotation * Math.PI) / 180);
    layerContext.scale(animatedTransform.scale, animatedTransform.scale);
    layerContext.translate(-width / 2, -height / 2);
    drawPrimaryVisual(layerContext, layers.visual);
    layerContext.restore();
    drawVisualEffectsMask(maskContext, mask, layers.mask);
    layerContext.save();
    layerContext.globalCompositeOperation = "destination-in";
    layerContext.drawImage(layers.mask, 0, 0);
    layerContext.restore();
    context.drawImage(layers.visual, 0, 0);
  } else {
    context.save();
    if (mask.type === "circle") {
      context.beginPath();
      context.ellipse(maskCenterX, maskCenterY, maskWidth / 2, maskHeight / 2, 0, 0, Math.PI * 2);
      context.clip();
    } else if (["rectangle", "rounded"].includes(mask.type)) {
      context.beginPath(); context.roundRect(maskCenterX - maskWidth / 2, maskCenterY - maskHeight / 2, maskWidth, maskHeight, mask.type === "rounded" ? Math.min(maskWidth, maskHeight) * (Number.isFinite(mask.cornerRadius) ? mask.cornerRadius : 12) / 100 : 0); context.clip();
    }
    context.globalAlpha = animatedTransform.opacity;
    context.translate(width / 2 + (animatedTransform.x / 100) * width, height / 2 + (animatedTransform.y / 100) * height);
    context.rotate((animatedTransform.rotation * Math.PI) / 180);
    context.scale(animatedTransform.scale, animatedTransform.scale);
    context.translate(-width / 2, -height / 2);
    drawPrimaryVisual(context, canvas);
    context.restore();
  }

  drawClickRippleEffect(context, canvas, visualEffects?.clickRipple, visualTime);

  if (transitionNext?.visual && transitionId !== "none" && transitionProgress > 0) {
    const amount = Math.max(0, Math.min(1, transitionProgress));
    context.save();
    if (transitionId === "wipe-left") context.rect(width * (1 - amount), 0, width * amount, height);
    else if (transitionId === "wipe-up") context.rect(0, height * (1 - amount), width, height * amount);
    else if (transitionId === "split") {
      context.rect(width * (0.5 - amount / 2), 0, width * amount, height);
    }
    if (["wipe-left", "wipe-up", "split"].includes(transitionId)) context.clip();
    context.globalAlpha = transitionId === "flash" ? Math.max(0, (amount - 0.35) / 0.65) : amount;
    if (transitionId === "zoom") {
      const scale = 1.12 - amount * 0.12;
      context.translate(width / 2, height / 2); context.scale(scale, scale); context.translate(-width / 2, -height / 2);
    }
    const nextBaseFilter = composeColorGradeFilter(
      transitionNext.filter || filter,
      resolveColorGrade(transitionNext.visualEffects?.keyframes, transitionNext.visualTime || 0, transitionNext.visualEffects?.colorGrade),
    );
    const nextFilter = transitionId === "blur" ? `${nextBaseFilter === "none" ? "" : nextBaseFilter} blur(${Math.max(0, (1 - amount) * 14)}px)`.trim() : nextBaseFilter;
    const nextSourceTime = getVisualSourceTime(transitionNext.visualEffects, transitionNext.visualTime || 0);
    const nextSmartFrameCrop = resolveSmartFrameCropAtTime(transitionNext.visualEffects?.smartFrame, nextSourceTime);
    drawFittedVisual(context, transitionNext.visual, canvas, fitMode, nextFilter, transitionNext.vision || null, null, nextSmartFrameCrop);
    context.restore();
    if (transitionId === "flash") {
      context.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - Math.abs(amount - 0.5) * 2) * 0.7})`;
      context.fillRect(0, 0, width, height);
    }
    if (transitionId === "glitch") {
      context.fillStyle = `rgba(53,234,217,${Math.sin(amount * Math.PI * 8) * 0.12})`;
      context.fillRect(0, 0, width, height);
    }
  }

  visualOverlays.forEach((overlay, index) => {
    const overlayVisual = visualOverlaySources[index];
    if (!overlayVisual) return;
    const overlayTime = Math.max(0, visualTime - (overlay.start || 0));
    const overlayTransform = resolveVisualTransform(overlay.keyframes, overlayTime, overlay.baseTransform);
    const overlayAnimation = resolveVisualClipAnimation(overlay.animation, overlayTime, overlay.duration);
    const animatedOverlayTransform = {
      ...overlayTransform,
      x: overlayTransform.x + overlayAnimation.x,
      y: overlayTransform.y + overlayAnimation.y,
      scale: overlayTransform.scale * overlayAnimation.scale,
      opacity: overlayTransform.opacity * overlayAnimation.opacity,
    };
    const isVector = overlay.kind === "vector" || Boolean(overlay.vectorBody);
    const vectorAppearance = getVectorDesignAppearance(overlay.vectorDesign);
    const overlayClickRipple = normalizeClickRippleEffect(overlay.clickRipple);
    const overlayFilter = isVector
      ? vectorAppearance.filter
      : FILTER_OPTIONS.find((option) => option.id === overlay.filterId)?.css || "none";
    const mask = overlay.mask ?? { type: "none" };
    const hasMask = mask.type && mask.type !== "none";
    const paintOverlay = (targetContext) => {
      targetContext.save();
      targetContext.globalAlpha = animatedOverlayTransform.opacity * (isVector ? vectorAppearance.opacity : 1);
      targetContext.translate(width / 2 + (animatedOverlayTransform.x / 100) * width, height / 2 + (animatedOverlayTransform.y / 100) * height);
      targetContext.rotate((animatedOverlayTransform.rotation * Math.PI) / 180);
      targetContext.scale(animatedOverlayTransform.scale, animatedOverlayTransform.scale);
      targetContext.translate(-width / 2, -height / 2);
      const overlayDepth = normalizeCinematicDepth(overlay.cinematicDepth);
      const overlayParallax = normalizePhotoParallax(overlay.photoParallax);
      if ((overlayParallax.enabled || overlayDepth.enabled) && overlay.depth?.depthVisual) {
        if (overlayParallax.enabled) drawPhotoParallaxFrame(targetContext, overlayVisual, canvas, {
          effect: overlayParallax, depthVisual: overlay.depth.depthVisual, fitMode: "contain", filter: overlayFilter, time: overlayTime, clear: false,
        });
        else drawCinematicDepthFrame(targetContext, overlayVisual, canvas, {
          effect: overlayDepth, depthVisual: overlay.depth.depthVisual, fitMode: "contain", filter: overlayFilter, clear: false,
        });
      } else {
        drawFittedVisual(
          targetContext,
          overlayVisual,
          canvas,
          "contain",
          overlayFilter,
          overlay.vision || null,
          overlay.subjectEffect,
        );
      }
      targetContext.restore();
    };
    if (hasMask) {
      const layers = getVisualEffectsLayers(canvas);
      const layerContext = layers.visual.getContext("2d");
      const maskContext = layers.mask.getContext("2d");
      layerContext.clearRect(0, 0, width, height);
      maskContext.clearRect(0, 0, width, height);
      paintOverlay(layerContext);
      if (overlayClickRipple.enabled) {
        const fitted = getVisualFitRect(getVisualDimensions(overlayVisual), canvas, "contain");
        drawClickRippleEffect(layerContext, layers.visual, overlayClickRipple, overlayTime, {
          x: width / 2 + animatedOverlayTransform.x / 100 * width - fitted.width * animatedOverlayTransform.scale / 2,
          y: height / 2 + animatedOverlayTransform.y / 100 * height - fitted.height * animatedOverlayTransform.scale / 2,
          width: fitted.width * animatedOverlayTransform.scale,
          height: fitted.height * animatedOverlayTransform.scale,
        });
      }
      maskContext.save();
      if (mask.inverted) {
        maskContext.fillStyle = "#fff";
        maskContext.fillRect(0, 0, width, height);
        maskContext.globalCompositeOperation = "destination-out";
      }
      maskContext.translate(width / 2 + (animatedOverlayTransform.x / 100) * width, height / 2 + (animatedOverlayTransform.y / 100) * height);
      maskContext.rotate((animatedOverlayTransform.rotation * Math.PI) / 180);
      maskContext.scale(animatedOverlayTransform.scale, animatedOverlayTransform.scale);
      maskContext.translate(-width / 2, -height / 2);
      drawOverlayMaskShape(maskContext, mask, canvas, overlayVisual);
      maskContext.restore();
      layerContext.save();
      layerContext.globalCompositeOperation = "destination-in";
      layerContext.drawImage(layers.mask, 0, 0);
      layerContext.restore();
      context.save();
      if (isVector) context.globalCompositeOperation = vectorAppearance.compositeOperation;
      context.drawImage(layers.visual, 0, 0);
      context.restore();
    } else if (overlayClickRipple.enabled) {
      const layers = getVisualEffectsLayers(canvas);
      const layerContext = layers.visual.getContext("2d");
      layerContext.clearRect(0, 0, width, height);
      paintOverlay(layerContext);
      const fitted = getVisualFitRect(getVisualDimensions(overlayVisual), canvas, "contain");
      drawClickRippleEffect(layerContext, layers.visual, overlayClickRipple, overlayTime, {
        x: width / 2 + animatedOverlayTransform.x / 100 * width - fitted.width * animatedOverlayTransform.scale / 2,
        y: height / 2 + animatedOverlayTransform.y / 100 * height - fitted.height * animatedOverlayTransform.scale / 2,
        width: fitted.width * animatedOverlayTransform.scale,
        height: fitted.height * animatedOverlayTransform.scale,
      });
      context.save();
      if (isVector) context.globalCompositeOperation = vectorAppearance.compositeOperation;
      context.drawImage(layers.visual, 0, 0);
      context.restore();
    } else {
      context.save();
      if (isVector) context.globalCompositeOperation = vectorAppearance.compositeOperation;
      paintOverlay(context);
      context.restore();
    }
  });

  if (captionsEnabled && subtitle) {
    const captionLayout = getCaptionTextLayout({
      context,
      text: subtitle,
      captionSize,
      captionStyle,
      referenceFrame: captionReferenceSize ?? canvas,
      renderFrame: canvas,
    });
    const effectiveCaptionPlacement = captionPlacement ?? captionPosition;
    drawCaptionLayout(
      context,
      captionLayout,
      positionCaptionLayout(captionLayout, effectiveCaptionPlacement),
    );
  }

  const visibleStickers = stickers.length ? stickers : sticker ? [sticker] : [];
  visibleStickers.forEach((activeSticker, index) => {
    const activeStickerImage = stickerImages[index] ?? (activeSticker === sticker ? stickerImage : null);
    if (activeSticker?.src && activeStickerImage) {
    const geometry = getStickerRenderGeometry(activeSticker, activeStickerImage, canvas);
    context.save();
    context.globalAlpha = geometry.opacity;
    context.translate(geometry.centerX, geometry.centerY);
    context.rotate((geometry.rotation * Math.PI) / 180);
    context.drawImage(activeStickerImage, -geometry.width / 2, -geometry.height / 2, geometry.width, geometry.height);
    context.restore();
    } else if (activeSticker?.text) {
    context.fillStyle = "rgba(53, 240, 221, 0.92)";
    context.fillRect(width - 246, 54, 172, 54);
    context.fillStyle = "#061515";
    context.font = "800 24px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(activeSticker.text, width - 160, 90);
    }
  });

}

export function getSupportedRecordingFormat() {
  if (typeof MediaRecorder === "undefined") {
    return {
      mimeType: "",
      extension: "webm",
      label: "默认视频",
    };
  }

  const supportedFormat = EXPORT_RECORDING_FORMATS.find((format) =>
    MediaRecorder.isTypeSupported(format.mimeType),
  );

  return supportedFormat ?? {
    mimeType: "",
    extension: "webm",
    label: "默认视频",
  };
}

function createVideoRecorder(outputStream, {
  codec = "h264",
  videoBitsPerSecond = 12_000_000,
  audioBitsPerSecond = 192_000,
  keyFrameInterval = 2,
} = {}) {
  const recorderOptions = (mimeType = "") => ({
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond,
    audioBitsPerSecond,
    videoKeyFrameIntervalDuration: Math.max(250, Number(keyFrameInterval) * 1000 || 2_000),
  });
  const codecMatch = (format) => {
    const mime = format.mimeType.toLowerCase();
    if (codec === "vp9") return mime.includes("vp9");
    if (codec === "vp8") return mime.includes("vp8");
    return format.extension === "mp4";
  };
  const orderedFormats = [
    ...EXPORT_RECORDING_FORMATS.filter(codecMatch),
    ...EXPORT_RECORDING_FORMATS.filter((format) => !codecMatch(format)),
  ];

  for (const format of orderedFormats) {
    if (!MediaRecorder.isTypeSupported(format.mimeType)) {
      continue;
    }

    try {
      return {
        recorder: new MediaRecorder(outputStream, recorderOptions(format.mimeType)),
        format,
      };
    } catch (error) {
      console.warn(`MediaRecorder cannot start with ${format.mimeType}`, error);
    }
  }

  return {
    recorder: new MediaRecorder(outputStream, recorderOptions()),
    format: {
      mimeType: "",
      extension: "webm",
      label: "默认视频",
    },
  };
}

export async function exportBrowserVideo({
  imageSrc,
  visualType,
  visualSegments = [],
  audioBlob,
  voiceAudioSegments = [],
  voiceVolume = 1,
  sourceAudioBlob,
  sourceAudioVolume = 1,
  sourceAudioSpatialEffect = "original",
  sourceAudioSpatialAmount = 1,
  sourceAudioStart = 0,
  sourceAudioSegments = [],
  musicBlob,
  musicVolume = 0.35,
  musicStart = 0,
  musicSegments = [],
  text,
  captionSegments,
  duration,
  ratio,
  fitMode,
  filter,
  captionsEnabled,
  captionPosition,
  captionPlacement,
  captionSize,
  captionStyle,
  captionReferenceSize,
  sticker,
  stickerSegments = [],
  visualOverlaySegments = [],
  transitionId,
  exportSettings = {},
  onProgress,
  signal,
  timelineOffset = 0,
  captionTargetDuration: providedCaptionTargetDuration = 0,
}) {
  throwIfExportAborted(signal);
  if (!window.MediaRecorder) {
    throw new Error("当前浏览器不支持 MediaRecorder，无法导出视频。");
  }

  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }
  throwIfExportAborted(signal);

  onProgress?.({ progress: 4, phaseKey: "exportPrepareVisuals" });
  const exportVisualSegments = visualSegments.some((segment) => segment.src)
    ? visualSegments.filter((segment) => segment.src)
    : [{ id: "export-visual", src: imageSrc, type: visualType, duration }];
  const exportVisualTimeline = getVisualSegmentTimeline(exportVisualSegments);
  const exportWidth = Math.max(2, Math.round(Number(exportSettings.width) || ratio.width));
  const exportHeight = Math.max(2, Math.round(Number(exportSettings.height) || ratio.height));
  const visualItems = await Promise.all(
    exportVisualSegments.map(async (segment) => {
      const visualSource = getVectorRenderSource(segment, {
        targetWidth: exportWidth,
        targetHeight: exportHeight,
      });
      const visual = segment.type === "video" ? await loadVideo(segment.src) : await loadImage(visualSource);
      if (segment.type === "video") {
        await seekVideoFrame(
          visual,
          Math.max(0, Number(segment.sourceStart) || 0),
        );
      }
      const shouldUseCutout = Boolean(
        segment.type === "image" &&
          (segment.vision?.options?.removeBackground || hasSubjectEffect(segment.subjectEffect)) &&
          segment.vision?.cutoutUrl,
      );
      const cutoutVisual = shouldUseCutout
        ? await loadImage(segment.vision.cutoutUrl).catch(() => null)
        : null;
      const temporalMaskUrls =
        segment.type === "video" && (
          segment.vision?.options?.removeBackground || hasSubjectEffect(segment.subjectEffect)
        )
          ? Array.from(
              new Set(
                (segment.vision.samples ?? [])
                  .map((sample) => sample.cutoutUrl)
                  .filter(Boolean),
              ),
            )
          : [];
      const temporalMaskCache = temporalMaskUrls.length
        ? createTemporalMaskCache(temporalMaskUrls)
        : null;
      if (temporalMaskCache) {
        const initialVision = resolveVisionAnalysisAtTime(
          segment.vision,
          Math.max(0, Number(segment.sourceStart) || 0),
        );
        await temporalMaskCache.prepare(initialVision?.cutoutUrl);
      }
      const depthUrls = [...new Set((segment.depth?.samples || []).map((sample) => sample.depthUrl).filter(Boolean))];
      const depthCache = depthUrls.length ? createTemporalMaskCache(depthUrls) : null;
      if (depthCache && depthUrls[0]) await depthCache.prepare(depthUrls[0]);
      return {
        segment,
        visual,
        cutoutVisual,
        temporalMaskCache,
        depthCache,
      };
    }),
  );
  throwIfExportAborted(signal);
  const stickerSources = Array.from(
    new Set([
      ...(sticker?.src ? [sticker.src] : []),
      ...stickerSegments.map((segment) => segment.src).filter(Boolean),
    ]),
  );
  const stickerImageEntries = await Promise.all(
    stickerSources.map(async (src) => [src, await loadImage(src).catch(() => null)]),
  );
  throwIfExportAborted(signal);
  const stickerImageMap = new Map(stickerImageEntries.filter(([, image]) => image));
  const visualOverlayItems = await Promise.all(
    visualOverlaySegments.filter((segment) => segment.src && segment.hidden !== true).map(async (segment) => {
      const subjectMaskNeeded = hasSubjectEffect(segment.subjectEffect);
      const maskUrls = (
        segment.type === "video"
        && (segment.vision?.options?.removeBackground || subjectMaskNeeded)
      ) ? [...new Set((segment.vision?.samples || []).map((sample) => sample.cutoutUrl).filter(Boolean))] : [];
      const imageMaskUrl = (
        segment.type === "image"
        && (segment.vision?.options?.removeBackground || subjectMaskNeeded)
      ) ? segment.vision?.cutoutUrl : "";
      const temporalMaskCache = createTemporalMaskCache(imageMaskUrl ? [imageMaskUrl] : maskUrls);
      if (imageMaskUrl || maskUrls[0]) await temporalMaskCache.prepare(imageMaskUrl || maskUrls[0]);
      const depthUrls = [...new Set((segment.depth?.samples || []).map((sample) => sample.depthUrl).filter(Boolean))];
      const depthCache = createTemporalMaskCache(depthUrls);
      if (depthUrls[0]) await depthCache.prepare(depthUrls[0]);
      return {
        segment,
        visual: segment.type === "video"
          ? await loadVideo(segment.src)
          : await loadImage(getVectorRenderSource(segment, {
              targetWidth: exportWidth,
              targetHeight: exportHeight,
            })),
        temporalMaskCache,
        depthCache,
      };
    }),
  );
  throwIfExportAborted(signal);
  onProgress?.({ progress: 8, phaseKey: "exportPrepareTracks" });
  const canvas = document.createElement("canvas");
  canvas.width = exportWidth;
  canvas.height = exportHeight;
  const context = canvas.getContext("2d");
  const exportFrameRate = Math.max(24, Math.min(60, Number(exportSettings.frameRate) || 30));
  const canvasStream = canvas.captureStream(exportFrameRate);

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const rangeStart = Math.max(0, Number(timelineOffset) || 0);
  const rangeEnd = rangeStart + Math.max(0, Number(duration) || 0);
  let audioContext = null;
  let decodedDuration = 0;
  const sources = [];
  let destination = null;
  const audioInputs = [
    ...voiceAudioSegments.map((segment) => ({
      blob: segment.blob,
      volume: segment.volume ?? 1,
      role: "voice",
      start: Math.max(0, segment.start || 0),
      sourceOffset: Math.max(0, segment.sourceStart || 0),
      sourceDuration: Math.max(0, segment.sourceDuration || (segment.duration || 0) * normalizeVisualPlaybackRate(segment.playbackRate)),
      playbackRate: normalizeVisualPlaybackRate(segment.playbackRate),
      outputDuration: Math.max(0, segment.duration || 0),
      fadeIn: Math.max(0, segment.fadeIn || 0),
      fadeOut: Math.max(0, segment.fadeOut || 0),
      spatialEffect: segment.spatialEffect,
      spatialAmount: segment.spatialAmount,
    })),
    audioBlob && !voiceAudioSegments.length
      ? { blob: audioBlob, volume: voiceVolume, role: "voice", start: 0, fadeIn: 0, fadeOut: 0 }
      : null,
    ...(sourceAudioBlob && sourceAudioSegments.length
      ? sourceAudioSegments.map((segment) => ({
          blob: sourceAudioBlob,
          volume: sourceAudioVolume,
          role: "source",
          start: Math.max(0, segment.start || 0),
          sourceOffset: Math.max(0, segment.sourceStart || 0),
          sourceDuration: Math.max(0, segment.sourceDuration || 0),
          playbackRate: normalizeVisualPlaybackRate(segment.playbackRate),
          outputDuration: Math.max(0, segment.duration || 0),
          spatialEffect: sourceAudioSpatialEffect,
          spatialAmount: sourceAudioSpatialAmount,
        }))
      : sourceAudioBlob
        ? [{ blob: sourceAudioBlob, volume: sourceAudioVolume, role: "source", start: Math.max(0, sourceAudioStart || 0), spatialEffect: sourceAudioSpatialEffect, spatialAmount: sourceAudioSpatialAmount }]
        : []),
    ...(musicBlob ? (musicSegments.length ? musicSegments.map((segment) => ({
      blob: musicBlob, volume: segment.volume ?? musicVolume, role: "music",
      start: Math.max(0, segment.start || 0), sourceOffset: Math.max(0, segment.sourceStart || 0),
      sourceDuration: Math.max(0, segment.sourceDuration || (segment.duration || 0) * normalizeVisualPlaybackRate(segment.playbackRate)),
      playbackRate: normalizeVisualPlaybackRate(segment.playbackRate), outputDuration: Math.max(0, segment.duration || 0),
      fadeIn: Math.max(0, segment.fadeIn || 0), fadeOut: Math.max(0, segment.fadeOut || 0),
      spatialEffect: segment.spatialEffect, spatialAmount: segment.spatialAmount,
    })) : [{ blob: musicBlob, volume: musicVolume, role: "music", start: Math.max(0, musicStart || 0) }]) : []),
  ].filter(Boolean);

  if (audioInputs.length) {
    if (!AudioContextClass) {
      throw new Error("当前浏览器不支持 AudioContext，无法混入音频。");
    }

    onProgress?.({ progress: 12, phaseKey: "exportMixAudio" });
    audioContext = new AudioContextClass();
    destination = audioContext.createMediaStreamDestination();
    const decodedByBlob = new Map();
    const decodedInputs = await Promise.all(
      audioInputs.map(async (input) => {
        if (!decodedByBlob.has(input.blob)) {
          decodedByBlob.set(input.blob, input.blob.arrayBuffer()
            .then((audioBuffer) => audioContext.decodeAudioData(audioBuffer.slice(0))));
        }
        const decoded = await decodedByBlob.get(input.blob);
        const playbackRate = normalizeVisualPlaybackRate(input.playbackRate);
        const sourceOffset = Math.min(decoded.duration, Math.max(0, Number(input.sourceOffset) || 0));
        const sourceDuration = Math.max(0, Math.min(
          Number(input.sourceDuration) || decoded.duration - sourceOffset,
          decoded.duration - sourceOffset,
        ));
        const originalOutputDuration = Number(input.outputDuration) || sourceDuration / playbackRate;
        const visibleStart = Math.max(input.start, rangeStart);
        const visibleEnd = Math.min(input.start + originalOutputDuration, rangeEnd);
        if (visibleEnd <= visibleStart) return null;
        const trimOutput = visibleStart - input.start;
        const outputDuration = visibleEnd - visibleStart;
        const trimmedSourceOffset = sourceOffset + trimOutput * playbackRate;
        const trimmedSourceDuration = Math.min(
          decoded.duration - trimmedSourceOffset,
          outputDuration * playbackRate,
        );
        const preservePitch = Math.abs(playbackRate - 1) > 0.0001;
        const prepared = preservePitch
          ? createPitchPreservedAudioBuffer(audioContext, decoded, {
              sourceOffset: trimmedSourceOffset,
              sourceDuration: trimmedSourceDuration,
              playbackRate,
            })
          : decoded;
        const fadeInRemaining = Math.max(0, (input.fadeIn || 0) - trimOutput);
        const tailTrim = Math.max(0, input.start + originalOutputDuration - visibleEnd);
        const fadeOutRemaining = Math.max(0, (input.fadeOut || 0) - tailTrim);
        return {
          ...input,
          decoded: prepared,
          playbackRate: 1,
          start: visibleStart - rangeStart,
          sourceOffset: preservePitch ? 0 : trimmedSourceOffset,
          sourceDuration: preservePitch ? outputDuration : trimmedSourceDuration,
          outputDuration,
          fadeIn: fadeInRemaining,
          fadeOut: fadeOutRemaining,
          initialGain: fadeInRemaining > 0 && input.fadeIn > 0
            ? input.volume * clamp(trimOutput / input.fadeIn, 0, 1)
            : input.volume,
          finalGain: fadeOutRemaining > 0 && input.fadeOut > 0
            ? input.volume * clamp(tailTrim / input.fadeOut, 0, 1)
            : input.volume,
        };
      }),
    ).then((items) => items.filter(Boolean));
    throwIfExportAborted(signal);

    decodedDuration = Math.max(0, ...decodedInputs.filter((input) => input.role === "voice").map((input) => input.start + input.outputDuration));

    decodedInputs.forEach((input) => {
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = input.decoded;
      source.playbackRate.value = input.playbackRate;
      gain.gain.value = input.initialGain;
      if (input.fadeIn > 0) {
        gain.gain.setValueAtTime(input.initialGain, audioContext.currentTime + input.start);
        gain.gain.linearRampToValueAtTime(input.volume, audioContext.currentTime + input.start + input.fadeIn);
      }
      if (input.fadeOut > 0) {
        const fadeStart = audioContext.currentTime + input.start + Math.max(0, input.outputDuration - input.fadeOut);
        gain.gain.setValueAtTime(input.volume, fadeStart);
        gain.gain.linearRampToValueAtTime(input.finalGain, audioContext.currentTime + input.start + input.outputDuration);
      }
      source.connect(gain);
      connectAudioSpatialEffect(audioContext, gain, destination, input.spatialEffect, input.spatialAmount, { smooth: false });
      sources.push({
        node: source,
        start: input.start,
        sourceOffset: input.sourceOffset,
        sourceDuration: input.sourceDuration,
        outputDuration: input.outputDuration,
      });
    });
  }

  if (audioContext?.state === "suspended") {
    await audioContext.resume();
  }
  throwIfExportAborted(signal);
  const outputStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(destination ? destination.stream.getAudioTracks() : []),
  ]);
  const { recorder, format: recordingFormat } = createVideoRecorder(outputStream, {
    codec: exportSettings.codec,
    videoBitsPerSecond: Math.max(1_000_000, Number(exportSettings.videoBitsPerSecond) || 12_000_000),
    audioBitsPerSecond: Math.max(96_000, Number(exportSettings.audioBitsPerSecond) || 192_000),
    keyFrameInterval: exportSettings.keyFrameInterval,
  });
  const chunks = [];
  const exportSegments = captionSegments?.length ? captionSegments : createCaptionSegments(text);
  const segments = exportSegments.map((segment) => segment.text);
  const totalDuration = Math.max(Number(duration) || 0, 1 / exportFrameRate);
  const captionTargetDuration = Number(providedCaptionTargetDuration) || decodedDuration || 0;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve();
  });

  onProgress?.({ progress: 16, phaseKey: "exportStartRecording" });
  recorder.start(250);
  let startTime = 0;
  let audioStartTime = 0;
  let animationFrame = 0;
  let lastProgressUpdate = 0;
  let activeVideoItem = null;
  const getVisualItemAtTime = (timelineTime) => {
    const visualIndex = getVisualSegmentIndexAtTime(exportVisualSegments, timelineTime);
    const resolvedIndex =
      visualIndex >= 0
        ? visualIndex
        : Math.max(0, visualItems.length - 1);
    return {
      item: visualItems[resolvedIndex] ?? visualItems[0],
      range: exportVisualTimeline[resolvedIndex] ?? exportVisualTimeline[0],
    };
  };
  const syncVideoItem = (visualItem, localTime) => {
    if (visualItem?.segment.type !== "video") {
      activeVideoItem?.visual.pause();
      activeVideoItem = null;
      return Math.max(0, Number(visualItem?.segment.sourceStart) || 0) + localTime;
    }

    const video = visualItem.visual;
    const playbackRate = getVisualPlaybackRateAtTime(visualItem.segment, localTime);
    video.playbackRate = playbackRate;
    const maximumTime = Math.max(0, (Number(video.duration) || 0) - 0.001);
    const expectedTime = Math.min(
      maximumTime,
      getVisualSourceTime(visualItem.segment, localTime),
    );
    if (activeVideoItem !== visualItem) {
      activeVideoItem?.visual.pause();
      activeVideoItem = visualItem;
      video.loop = false;
      if (Math.abs(video.currentTime - expectedTime) > 0.03) {
        video.currentTime = expectedTime;
      }
      video.play().catch(() => {});
    } else if (!video.seeking && Math.abs(video.currentTime - expectedTime) > 0.35) {
      video.currentTime = expectedTime;
    }
    return Math.min(maximumTime, Math.max(0, Number(video.currentTime) || expectedTime));
  };
  const getStickersAtTime = (elapsed) => {
    if (!stickerSegments.length) {
      return sticker ? [sticker] : [];
    }

    return stickerSegments.filter((segment) => {
      const start = Math.max(0, segment.start || 0);
      const end = start + Math.max(0, segment.duration || 0);
      return elapsed >= start && elapsed < end;
    });
  };
  const getVisualOverlaysAtTime = (timelineTime) => visualOverlayItems
    .filter(({ segment }) => timelineTime >= segment.start && timelineTime < segment.start + segment.duration)
    .sort((left, right) => (left.segment.layer || 1) - (right.segment.layer || 1));
  const syncVisualOverlays = (items, timelineTime) => {
    items.forEach(({ segment, visual, temporalMaskCache }) => {
      const sourceTime = segment.type === "video"
        ? getVisualSourceTime(segment, Math.max(0, timelineTime - segment.start))
        : Math.max(0, timelineTime - segment.start);
      const vision = resolveVisionAnalysisAtTime(segment.vision || null, sourceTime);
      if (vision?.cutoutUrl) void temporalMaskCache?.prepare(vision.cutoutUrl);
      if (segment.type !== "video") return;
      const expectedTime = sourceTime;
      if (!visual.seeking && Math.abs((visual.currentTime || 0) - expectedTime) > 0.12) visual.currentTime = expectedTime;
      visual.playbackRate = getVisualPlaybackRateAtTime(segment, Math.max(0, timelineTime - segment.start));
      visual.play().catch(() => {});
    });
  };
  const draw = () => {
    const elapsed = Math.min(totalDuration, (performance.now() - startTime) / 1000);
    const timelineTime = rangeStart + elapsed;
    const segmentIndex = getSegmentIndexAtTime(exportSegments, timelineTime, captionTargetDuration);
    const activeCaptionSegment = segmentIndex >= 0 ? exportSegments[segmentIndex] : null;
    const exportCaption =
      activeCaptionSegment && !activeCaptionSegment.hidden ? segments[segmentIndex] : "";
    const { item: visualItem, range: visualRange } = getVisualItemAtTime(timelineTime);
    const localTime = Math.max(0, timelineTime - (visualRange?.start ?? 0));
    const visualSourceTime = syncVideoItem(visualItem, localTime);
    const exportStickers = getStickersAtTime(timelineTime);
    const activeVisualOverlays = getVisualOverlaysAtTime(timelineTime);
    syncVisualOverlays(activeVisualOverlays, timelineTime);
    const renderedVisualOverlays = activeVisualOverlays.map((item) => {
      const sourceTime = item.segment.type === "video"
        ? getVisualSourceTime(item.segment, Math.max(0, timelineTime - item.segment.start))
        : Math.max(0, timelineTime - item.segment.start);
      const vision = resolveVisionAnalysisAtTime(item.segment.vision || null, sourceTime);
      const depthSample = resolveDepthAnalysisAtTime(item.segment.depth || null, sourceTime);
      if (depthSample?.depthUrl) void item.depthCache?.prepare(depthSample.depthUrl);
      return {
        ...item,
        renderSegment: {
          ...item.segment,
          ...(vision ? { vision: {
            ...vision,
            options: item.segment.vision?.options || vision.options,
            maskVisual: item.temporalMaskCache?.get(vision.cutoutUrl) || null,
          } } : {}),
          ...(depthSample ? { depth: { ...depthSample, depthVisual: item.depthCache?.get(depthSample.depthUrl) || null } } : {}),
        },
      };
    });
    const exportVisual = visualItem.cutoutVisual || visualItem.visual;
    const visualIndex = visualItems.indexOf(visualItem);
    const junction = visualItem.segment.transition;
    const transitionDuration = junction?.id && junction.id !== "none"
      ? Math.max(0.1, Math.min(Number(junction.duration) || 0.5, (visualRange?.end || 0) - (visualRange?.start || 0)))
      : 0;
    const transitionStart = (visualRange?.end || 0) - transitionDuration;
    const nextVisualItem = transitionDuration > 0 && timelineTime >= transitionStart ? visualItems[visualIndex + 1] : null;
    const transitionProgress = nextVisualItem ? (timelineTime - transitionStart) / transitionDuration : 0;
    if (nextVisualItem?.segment.type === "video") {
      const nextTime = Math.max(0, Number(nextVisualItem.segment.sourceStart) || 0) + transitionProgress * transitionDuration;
      if (!nextVisualItem.visual.seeking && Math.abs(nextVisualItem.visual.currentTime - nextTime) > 0.05) nextVisualItem.visual.currentTime = nextTime;
    }
    const resolvedVision = resolveVisionAnalysisAtTime(
      visualItem.segment.vision ?? null,
      visualSourceTime,
    );
    const frameVision = resolvedVision
      ? {
          ...resolvedVision,
          options: visualItem.segment.vision?.options ?? resolvedVision.options,
          maskVisual: resolvedVision.cutoutUrl
            ? visualItem.temporalMaskCache?.get(resolvedVision.cutoutUrl) ?? null
            : null,
        }
      : null;
    const resolvedDepth = resolveDepthAnalysisAtTime(visualItem.segment.depth ?? null, visualSourceTime);
    if (resolvedDepth?.depthUrl) void visualItem.depthCache?.prepare(resolvedDepth.depthUrl);
    const frameDepth = resolvedDepth
      ? { ...resolvedDepth, depthVisual: visualItem.depthCache?.get(resolvedDepth.depthUrl) || null }
      : null;
    drawPreviewFrame(context, exportVisual, canvas, {
      subtitle: exportCaption,
      progress: elapsed / totalDuration,
      fitMode,
      filter,
      captionsEnabled,
      captionPosition,
      captionPlacement: resolveCaptionSegmentPlacement(activeCaptionSegment, captionPlacement),
      captionSize,
      captionStyle: resolveCaptionStyleForSegment(captionStyle, activeCaptionSegment),
      captionReferenceSize,
      stickers: exportStickers,
      stickerImages: exportStickers.map((item) => item?.src ? stickerImageMap.get(item.src) : null),
      transitionId: nextVisualItem ? junction.id : "none",
      transitionNext: nextVisualItem ? {
        visual: nextVisualItem.cutoutVisual || nextVisualItem.visual,
        visualEffects: nextVisualItem.segment,
        visualTime: transitionProgress * transitionDuration,
      } : null,
      transitionProgress,
      vision: frameVision,
      depth: frameDepth,
      visualEffects: visualItem.segment,
      visualTime: localTime,
      visualOverlays: renderedVisualOverlays.map(({ segment, renderSegment }) => ({
        ...renderSegment,
        start: segment.start - (visualRange?.start ?? 0),
      })),
      visualOverlaySources: renderedVisualOverlays.map(({ visual }) => visual),
    });

    if (elapsed === totalDuration || performance.now() - lastProgressUpdate > 180) {
      lastProgressUpdate = performance.now();
      onProgress?.({
        progress: Math.min(92, 16 + Math.round((elapsed / totalDuration) * 76)),
        phaseKey: "exportRecording",
      });
    }

    if (!signal?.aborted && elapsed < totalDuration) {
      animationFrame = requestAnimationFrame(draw);
    }
  };

  try {
    throwIfExportAborted(signal);
    // Give MediaRecorder a short warm-up window before the timeline and Web
    // Audio sources start. Without it, short exports can lose their first
    // audio packet under CPU load and produce a one-timeslice file.
    await waitForExportTimeout(60, signal, window);
    throwIfExportAborted(signal);
    startTime = performance.now();
    audioStartTime = audioContext?.currentTime || 0;
    draw();
    sources.forEach(({ node, start, sourceOffset, sourceDuration }) => node.start(audioStartTime + start, sourceOffset, sourceDuration));
    await waitForExportTimeout(totalDuration * 1000, signal, window);
    throwIfExportAborted(signal);
    const finalTimelineTime = rangeStart + Math.max(0, totalDuration - 1 / exportFrameRate);
    const finalSegmentIndex = getSegmentIndexAtTime(exportSegments, finalTimelineTime, captionTargetDuration);
    const finalCaptionSegment = finalSegmentIndex >= 0 ? exportSegments[finalSegmentIndex] : null;
    const { item: finalVisualItem, range: finalVisualRange } = getVisualItemAtTime(finalTimelineTime);
    const finalStickers = getStickersAtTime(finalTimelineTime);
    const finalVisualOverlays = getVisualOverlaysAtTime(finalTimelineTime);
    syncVisualOverlays(finalVisualOverlays, finalTimelineTime);
    const finalLocalTime = Math.max(0, finalTimelineTime - (finalVisualRange?.start ?? 0));
    const finalVisualSourceTime = syncVideoItem(finalVisualItem, finalLocalTime);
    const finalResolvedVision = resolveVisionAnalysisAtTime(
      finalVisualItem.segment.vision ?? null,
      finalVisualSourceTime,
    );
    const finalFrameVision = finalResolvedVision
      ? {
          ...finalResolvedVision,
          options: finalVisualItem.segment.vision?.options ?? finalResolvedVision.options,
          maskVisual: finalResolvedVision.cutoutUrl
            ? finalVisualItem.temporalMaskCache?.get(finalResolvedVision.cutoutUrl) ?? null
            : null,
        }
      : null;
    const finalResolvedDepth = resolveDepthAnalysisAtTime(finalVisualItem.segment.depth ?? null, finalVisualSourceTime);
    if (finalResolvedDepth?.depthUrl) await finalVisualItem.depthCache?.prepare(finalResolvedDepth.depthUrl);
    const finalFrameDepth = finalResolvedDepth
      ? { ...finalResolvedDepth, depthVisual: finalVisualItem.depthCache?.get(finalResolvedDepth.depthUrl) || null }
      : null;
    drawPreviewFrame(context, finalVisualItem.cutoutVisual || finalVisualItem.visual, canvas, {
      subtitle:
        finalSegmentIndex >= 0 && !exportSegments[finalSegmentIndex]?.hidden
          ? segments[finalSegmentIndex]
          : "",
      progress: 1,
      fitMode,
      filter,
      captionsEnabled,
      captionPosition,
      captionPlacement: resolveCaptionSegmentPlacement(finalCaptionSegment, captionPlacement),
      captionSize,
      captionStyle: resolveCaptionStyleForSegment(captionStyle, finalCaptionSegment),
      captionReferenceSize,
      stickers: finalStickers,
      stickerImages: finalStickers.map((item) => item?.src ? stickerImageMap.get(item.src) : null),
      transitionId,
      vision: finalFrameVision,
      depth: finalFrameDepth,
      visualEffects: finalVisualItem.segment,
      visualTime: finalLocalTime,
      visualOverlays: finalVisualOverlays.map(({ segment }) => ({
        ...segment,
        start: segment.start - (finalVisualRange?.start ?? 0),
      })),
      visualOverlaySources: finalVisualOverlays.map(({ visual }) => visual),
    });
    recorder.stop();
    onProgress?.({ progress: 94, phaseKey: "exportPackageFile" });
    await stopped;
    throwIfExportAborted(signal);
    const blobType = recorder.mimeType || recordingFormat.mimeType || "video/webm";
    return {
      blob: new Blob(chunks, { type: blobType }),
      extension: recordingFormat.extension,
      label: recordingFormat.label,
      mimeType: blobType,
      nativeMp4: recordingFormat.extension === "mp4",
      diagnostics: {
        audioInputCount: audioInputs.length,
        audioTrackCount: outputStream.getAudioTracks().length,
      },
    };
  } finally {
    cancelAnimationFrame(animationFrame);
    if (recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* Recorder may already be stopping. */ }
    }
    sources.forEach(({ node }) => {
      try { node.stop(); } catch { /* Audio source may already have ended. */ }
    });
    canvasStream.getTracks().forEach((track) => track.stop());
    destination?.stream.getTracks().forEach((track) => track.stop());
    await audioContext?.close().catch(() => {});
    visualItems.forEach((item) => {
      item.temporalMaskCache?.dispose();
      if (item.segment.type === "video") {
        item.visual.pause();
        item.visual.removeAttribute("src");
        item.visual.load();
      }
    });
    visualOverlayItems.forEach(({ segment, visual }) => {
      if (segment.type !== "video") return;
      visual.pause();
      visual.removeAttribute("src");
      visual.load();
    });
  }
}

async function getFfmpeg() {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        classWorkerURL: ffmpegClassWorkerURL,
        coreURL: ffmpegCoreURL,
        wasmURL: ffmpegCoreWasmURL,
      });
      return ffmpeg;
    })();
  }

  return ffmpegLoadPromise;
}

function runFfmpegTask(task) {
  const nextTask = ffmpegTaskQueue.catch(() => {}).then(task);
  ffmpegTaskQueue = nextTask.catch(() => {});
  return nextTask;
}

function createAbortError(message = "任务已取消") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function getAbortableFfmpeg(signal) {
  const loading = getFfmpeg();
  if (!signal) return loading;
  if (signal.aborted) return Promise.reject(createAbortError("整段增强已取消"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      reject(createAbortError("整段增强已取消"));
    };
    signal.addEventListener("abort", abort, { once: true });
    loading.then((ffmpeg) => {
      signal.removeEventListener("abort", abort);
      if (settled || signal.aborted) {
        try { ffmpeg.terminate(); } catch { /* The loader may already be closed. */ }
        ffmpegLoadPromise = null;
        return;
      }
      settled = true;
      resolve(ffmpeg);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

export async function encodePngFrameSequence({
  totalFrames,
  frameRate,
  produceFrame,
  signal,
  onProgress,
  audioSourceBlob = null,
  audioStart = 0,
  audioDuration = 0,
}) {
  return runFfmpegTask(async () => {
    if (signal?.aborted) throw createAbortError("整段增强已取消");
    let ffmpeg = null;
    const id = makeId("remaster");
    const prefix = `${id}-frame`;
    const outputName = `${id}.mp4`;
    const audioInputName = `${id}-audio-source`;
    const frameNames = [];
    const frameBlobs = [];
    let terminated = false;
    const abort = () => {
      terminated = true;
      try { ffmpeg.terminate(); } catch { /* FFmpeg may already be stopped. */ }
      ffmpegLoadPromise = null;
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      for (let index = 0; index < totalFrames; index += 1) {
        if (signal?.aborted) throw createAbortError("整段增强已取消");
        const blob = await produceFrame(index);
        if (signal?.aborted) throw createAbortError("整段增强已取消");
        frameBlobs.push(blob);
      }
      if (signal?.aborted) throw createAbortError("整段增强已取消");
      onProgress?.({ progress: 91, phaseKey: "remasterPhaseLoadEncoder" });
      ffmpeg = await getAbortableFfmpeg(signal);
      if (signal?.aborted) throw createAbortError("整段增强已取消");
      for (let index = 0; index < frameBlobs.length; index += 1) {
        const name = `${prefix}-${String(index).padStart(6, "0")}.png`;
        frameNames.push(name);
        await ffmpeg.writeFile(name, new Uint8Array(await frameBlobs[index].arrayBuffer()));
      }
      if (audioSourceBlob instanceof Blob) {
        await ffmpeg.writeFile(audioInputName, new Uint8Array(await audioSourceBlob.arrayBuffer()));
      }
      if (signal?.aborted) throw createAbortError("整段增强已取消");
      onProgress?.({ progress: 92, phaseKey: "remasterPhaseEncodeVideo" });
      const audioArgs = audioSourceBlob instanceof Blob
        ? ["-ss", String(Math.max(0, audioStart)), ...(audioDuration > 0 ? ["-t", String(audioDuration)] : []), "-i", audioInputName]
        : [];
      await ffmpeg.exec([
        "-framerate", String(frameRate),
        "-i", `${prefix}-%06d.png`,
        ...audioArgs,
        ...(audioSourceBlob instanceof Blob ? ["-map", "0:v:0", "-map", "1:a?", "-c:a", "aac", "-b:a", "192k", "-shortest"] : ["-an"]),
        "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "faststart",
        outputName,
      ]);
      if (signal?.aborted) throw createAbortError("整段增强已取消");
      const data = await ffmpeg.readFile(outputName);
      onProgress?.({ progress: 99, phaseKey: "remasterPhaseCreateAsset" });
      return new Blob([data], { type: "video/mp4" });
    } finally {
      signal?.removeEventListener("abort", abort);
      if (!terminated && ffmpeg) {
        await Promise.all(frameNames.map((name) => ffmpeg.deleteFile(name).catch(() => {})));
        if (audioSourceBlob instanceof Blob) await ffmpeg.deleteFile(audioInputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});
      }
    }
  });
}

export async function transcodeWebmToMp4(webmBlob, {
  signal,
  generationMetadata = null,
  copyStreams = false,
} = {}) {
  return runFfmpegTask(async () => {
    if (signal?.aborted) throw createAbortError("Export canceled");
    let ffmpeg = null;
    let terminated = false;
    const id = makeId("export");
    const inputName = `${id}.webm`;
    const outputName = `${id}.mp4`;
    const abort = () => {
      terminated = true;
      try { ffmpeg?.terminate(); } catch { /* FFmpeg may already be stopped. */ }
      ffmpegLoadPromise = null;
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const [{ fetchFile }, loadedFfmpeg] = await Promise.all([import("@ffmpeg/util"), getAbortableFfmpeg(signal)]);
      ffmpeg = loadedFfmpeg;
      if (signal?.aborted) throw createAbortError("Export canceled");
      await ffmpeg.writeFile(inputName, await fetchFile(webmBlob));
      try {
        const metadataArgs = generationMetadata ? [
          "-metadata", `AIGC_GENERATION_TYPE=${generationMetadata.generationType || ""}`,
          "-metadata", `AIGC_TOOL=${generationMetadata.toolName || ""}`,
          "-metadata", `AIGC_CREATED_AT=${generationMetadata.createdAt || ""}`,
          "-metadata", `AIGC_CONTENT_ID=${generationMetadata.contentId || ""}`,
          "-metadata", `AIGC_GENERATOR=${generationMetadata.generator || ""}`,
          "-metadata", `AIGC_DISCLOSURE=${generationMetadata.disclosure || ""}`,
          "-metadata", `AIGC_METADATA=${JSON.stringify(generationMetadata)}`,
        ] : [];
        await ffmpeg.exec(copyStreams ? [
          "-i", inputName,
          "-map", "0",
          "-c", "copy",
          ...metadataArgs,
          "-movflags", generationMetadata ? "faststart+use_metadata_tags" : "faststart",
          outputName,
        ] : [
          "-i", inputName,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          ...metadataArgs,
          "-movflags", generationMetadata ? "faststart+use_metadata_tags" : "faststart",
          outputName,
        ]);
      } catch {
        if (signal?.aborted) throw createAbortError("Export canceled");
        await ffmpeg.deleteFile(outputName).catch(() => {});
        await ffmpeg.exec([
          "-i", inputName,
          ...(generationMetadata ? [
            "-metadata", `AIGC_GENERATION_TYPE=${generationMetadata.generationType || ""}`,
            "-metadata", `AIGC_TOOL=${generationMetadata.toolName || ""}`,
            "-metadata", `AIGC_CREATED_AT=${generationMetadata.createdAt || ""}`,
            "-metadata", `AIGC_CONTENT_ID=${generationMetadata.contentId || ""}`,
            "-metadata", `AIGC_GENERATOR=${generationMetadata.generator || ""}`,
            "-metadata", `AIGC_DISCLOSURE=${generationMetadata.disclosure || ""}`,
            "-metadata", `AIGC_METADATA=${JSON.stringify(generationMetadata)}`,
          ] : []),
          "-movflags", generationMetadata ? "faststart+use_metadata_tags" : "faststart", outputName,
        ]);
      }
      if (signal?.aborted) throw createAbortError("Export canceled");
      const data = await ffmpeg.readFile(outputName);
      return new Blob([data], { type: "video/mp4" });
    } finally {
      signal?.removeEventListener("abort", abort);
      if (!terminated && ffmpeg) {
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});
      }
    }
  });
}

export async function normalizeVideoForEditing(videoBlob, filename = "source-video.mkv", { decodedAudioBlob = null } = {}) {
  return runFfmpegTask(async () => {
    const [{ fetchFile }, ffmpeg] = await Promise.all([import("@ffmpeg/util"), getFfmpeg()]);
    const id = makeId("compat-video");
    const extension = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mkv";
    const inputName = `${id}.${extension}`;
    const audioInputName = `${id}-libav-audio.wav`;
    const outputName = `${id}.mp4`;
    await ffmpeg.writeFile(inputName, await fetchFile(videoBlob));
    if (decodedAudioBlob) await ffmpeg.writeFile(audioInputName, await fetchFile(decodedAudioBlob));
    const inputArgs = decodedAudioBlob ? ["-i", inputName, "-i", audioInputName] : ["-i", inputName];
    const audioMap = decodedAudioBlob ? ["-map", "1:a:0"] : ["-map", "0:a:0?"];
    try {
      try {
        await ffmpeg.exec([
          ...inputArgs, "-map", "0:v:0", ...audioMap,
          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "faststart", outputName,
        ]);
      } catch {
        await ffmpeg.deleteFile(outputName).catch(() => {});
        await ffmpeg.exec([
          ...inputArgs, "-map", "0:v:0", ...audioMap,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "192k", "-movflags", "faststart", outputName,
        ]);
      }
      const data = await ffmpeg.readFile(outputName);
      return new Blob([data], { type: "video/mp4" });
    } finally {
      await ffmpeg.deleteFile(inputName).catch(() => {});
      if (decodedAudioBlob) await ffmpeg.deleteFile(audioInputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
    }
  });
}

export async function transcodeAudioToWav(audioBlob, filename = "source-audio.bin") {
  return runFfmpegTask(async () => {
    const [{ fetchFile }, ffmpeg] = await Promise.all([import("@ffmpeg/util"), getFfmpeg()]);
    const id = makeId("compat-audio");
    const extension = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const inputName = `${id}.${extension}`;
    const outputName = `${id}.wav`;
    await ffmpeg.writeFile(inputName, await fetchFile(audioBlob));
    try {
      await ffmpeg.exec(["-i", inputName, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", outputName]);
      const data = await ffmpeg.readFile(outputName);
      return new Blob([data], { type: "audio/wav" });
    } finally {
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
    }
  });
}

export async function extractAudioFromVideo(videoBlob, filename = "source-video.mp4") {
  return runFfmpegTask(async () => {
    const [{ fetchFile }, ffmpeg] = await Promise.all([import("@ffmpeg/util"), getFfmpeg()]);
    const id = makeId("source-audio");
    const extension = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const inputName = `${id}.${extension}`;
    const outputName = `${id}.wav`;

    await ffmpeg.writeFile(inputName, await fetchFile(videoBlob));
    try {
      await ffmpeg.exec([
        "-i",
        inputName,
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-f",
        "wav",
        outputName,
      ]);
      const data = await ffmpeg.readFile(outputName);
      return new Blob([data], { type: "audio/wav" });
    } finally {
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
    }
  });
}
