import {
  AudioBufferSource,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";

import {
  createTemporalMaskCache,
  drawPreviewFrame,
  loadImage,
  loadVideo,
  seekVideoFrame,
} from "./media.js";
import {
  createCaptionSegments,
  getSegmentIndexAtTime,
  getVisualSegmentIndexAtTime,
  getVisualSegmentTimeline,
} from "./timeline.js";
import { resolveVisionAnalysisAtTime } from "./vision.js";
import { getVisualSourceTime } from "./visualEffects.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let aacFallbackRegistered = false;

export function createOfflineFramePlan(duration, frameRate) {
  const fps = clamp(Math.round(Number(frameRate) || 30), 24, 60);
  const safeDuration = Math.max(1 / fps, Number(duration) || 0);
  const frameCount = Math.max(1, Math.ceil(safeDuration * fps));
  return Array.from({ length: frameCount }, (_, index) => ({
    index,
    timestamp: index / fps,
    duration: 1 / fps,
    keyFrame: index % (fps * 2) === 0,
  }));
}

export function getOfflineExportCodec(settings = {}) {
  if (settings.codec === "vp8") return { video: "vp8", audio: "opus", extension: "webm", mimeType: "video/webm" };
  if (settings.codec === "vp9") return { video: "vp9", audio: "opus", extension: "webm", mimeType: "video/webm" };
  return { video: "avc", audio: "aac", extension: "mp4", mimeType: "video/mp4" };
}

export function getOfflineStickersAtTime(stickerSegments = [], sticker = null, time = 0) {
  if (!stickerSegments.length) return sticker ? [sticker] : [];
  return stickerSegments.filter((item) => time >= item.start && time < item.start + item.duration);
}

async function decodeAudioInputs(inputs) {
  if (!inputs.length) return [];
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持音频解码。");
  const context = new AudioContextClass();
  const cache = new Map();
  try {
    return await Promise.all(inputs.map(async (input) => {
      if (!cache.has(input.blob)) {
        cache.set(input.blob, input.blob.arrayBuffer().then((data) => context.decodeAudioData(data.slice(0))));
      }
      return { ...input, decoded: await cache.get(input.blob) };
    }));
  } finally {
    await context.close().catch(() => {});
  }
}

export async function mixOfflineAudio({
  duration,
  voiceAudioSegments = [],
  sourceAudioBlob = null,
  sourceAudioSegments = [],
  sourceAudioVolume = 1,
  sourceAudioStart = 0,
  musicBlob = null,
  musicVolume = 0.35,
  musicStart = 0,
}) {
  const inputs = [
    ...voiceAudioSegments.filter((item) => item.blob).map((item) => ({
      blob: item.blob, start: Math.max(0, item.start || 0), volume: item.volume ?? 1,
      sourceOffset: 0, sourceDuration: 0, playbackRate: 1,
      fadeIn: Math.max(0, item.fadeIn || 0), fadeOut: Math.max(0, item.fadeOut || 0),
    })),
    ...(sourceAudioBlob && sourceAudioSegments.length ? sourceAudioSegments.map((item) => ({
      blob: sourceAudioBlob, start: Math.max(0, item.start || 0), volume: sourceAudioVolume,
      sourceOffset: Math.max(0, item.sourceStart || 0), sourceDuration: Math.max(0, item.sourceDuration || 0),
      playbackRate: clamp(Number(item.playbackRate) || 1, 0.25, 4), fadeIn: 0, fadeOut: 0,
    })) : sourceAudioBlob ? [{ blob: sourceAudioBlob, start: Math.max(0, sourceAudioStart), volume: sourceAudioVolume, sourceOffset: 0, sourceDuration: 0, playbackRate: 1, fadeIn: 0, fadeOut: 0 }] : []),
    ...(musicBlob ? [{ blob: musicBlob, start: Math.max(0, musicStart), volume: musicVolume, sourceOffset: 0, sourceDuration: 0, playbackRate: 1, fadeIn: 0, fadeOut: 0 }] : []),
  ];
  if (!inputs.length) return null;
  const decoded = await decodeAudioInputs(inputs);
  const sampleRate = 48_000;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContextClass) throw new Error("当前浏览器不支持离线音频混合。");
  const context = new OfflineContextClass(2, Math.ceil(Math.max(0.01, duration) * sampleRate), sampleRate);
  decoded.forEach((input) => {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = input.decoded;
    source.playbackRate.value = input.playbackRate;
    const offset = Math.min(input.decoded.duration, input.sourceOffset);
    const available = Math.max(0, input.decoded.duration - offset);
    const sourceDuration = Math.min(available, input.sourceDuration || available);
    const outputDuration = sourceDuration / input.playbackRate;
    gain.gain.setValueAtTime(input.volume, input.start);
    if (input.fadeIn > 0) {
      gain.gain.setValueAtTime(0, input.start);
      gain.gain.linearRampToValueAtTime(input.volume, input.start + Math.min(input.fadeIn, outputDuration));
    }
    if (input.fadeOut > 0) {
      const fadeStart = input.start + Math.max(0, outputDuration - input.fadeOut);
      gain.gain.setValueAtTime(input.volume, fadeStart);
      gain.gain.linearRampToValueAtTime(0, input.start + outputDuration);
    }
    source.connect(gain).connect(context.destination);
    source.start(input.start, offset, sourceDuration);
  });
  return context.startRendering();
}

async function prepareComposition(options) {
  const segments = options.visualSegments.some((segment) => segment.src)
    ? options.visualSegments.filter((segment) => segment.src)
    : [{ id: "offline-visual", src: options.imageSrc, type: options.visualType, duration: options.duration }];
  const timeline = getVisualSegmentTimeline(segments);
  const items = await Promise.all(segments.map(async (segment, index) => {
    const visual = segment.type === "video" ? await loadVideo(segment.src) : await loadImage(segment.src);
    const cutoutVisual = segment.type === "image" && segment.vision?.options?.removeBackground && segment.vision?.cutoutUrl
      ? await loadImage(segment.vision.cutoutUrl).catch(() => null) : null;
    const maskUrls = segment.type === "video" && segment.vision?.options?.removeBackground
      ? [...new Set((segment.vision.samples || []).map((sample) => sample.cutoutUrl).filter(Boolean))] : [];
    let sequentialFrames = null;
    if (segment.type === "video" && options.framePlan?.length) {
      try {
        const blob = segment.blob instanceof Blob ? segment.blob : await fetch(segment.src).then((response) => {
          if (!response.ok) throw new Error(`Unable to read video source (${response.status})`);
          return response.blob();
        });
        const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) throw new Error("VideoDecoder does not support this source codec");
        const sink = new CanvasSink(track, { poolSize: 3, decoderOptions: { optimizeForLatency: true } });
        const range = timeline[index];
        const timestamps = options.framePlan
          .filter((frame) => frame.timestamp >= range.start && frame.timestamp < range.end)
          .map((frame) => getVisualSourceTime(segment, frame.timestamp - range.start));
        const iterator = sink.canvasesAtTimestamps(timestamps)[Symbol.asyncIterator]();
        sequentialFrames = {
          async next() {
            const result = await iterator.next();
            return result.done ? null : result.value?.canvas || null;
          },
        };
      } catch (error) {
        console.warn("Sequential WebCodecs video decode unavailable; using precise seek fallback", error);
      }
    }
    return {
      segment, visual, cutoutVisual,
      temporalMaskCache: maskUrls.length ? createTemporalMaskCache(maskUrls) : null,
      sequentialFrames,
      decodeMode: segment.type === "video" ? (sequentialFrames ? "sequential-webcodecs" : "precise-seek") : "static-image",
    };
  }));
  const stickerSources = [...new Set([
    ...options.stickerSegments.map((item) => item.src).filter(Boolean),
    ...(options.sticker?.src ? [options.sticker.src] : []),
  ])];
  const stickerImages = new Map((await Promise.all(stickerSources.map(async (src) => [src, await loadImage(src).catch(() => null)]))).filter(([, image]) => image));
  return { segments, timeline, items, stickerImages };
}

async function renderCompositionAt(context, canvas, prepared, options, time) {
  const resolvedIndex = getVisualSegmentIndexAtTime(prepared.segments, time);
  const index = resolvedIndex >= 0 ? resolvedIndex : Math.max(0, prepared.items.length - 1);
  const item = prepared.items[index] || prepared.items[0];
  const range = prepared.timeline[index] || prepared.timeline[0];
  const localTime = Math.max(0, time - (range?.start || 0));
  let sourceTime = getVisualSourceTime(item.segment, localTime);
  let frameVisual = item.cutoutVisual || item.visual;
  if (item.segment.type === "video" && item.sequentialFrames) {
    frameVisual = await item.sequentialFrames.next() || item.visual;
  } else if (item.segment.type === "video") {
    sourceTime = Math.min(Math.max(0, (item.visual.duration || 0) - 0.04), sourceTime);
    await seekVideoFrame(item.visual, sourceTime);
  }
  const vision = resolveVisionAnalysisAtTime(item.segment.vision || null, sourceTime);
  if (vision?.cutoutUrl) await item.temporalMaskCache?.prepare(vision.cutoutUrl);
  const frameVision = vision ? {
    ...vision,
    options: item.segment.vision?.options || vision.options,
    maskVisual: vision.cutoutUrl ? item.temporalMaskCache?.get(vision.cutoutUrl) : null,
  } : null;
  const junction = item.segment.transition;
  const transitionDuration = junction?.id && junction.id !== "none"
    ? Math.min(Math.max(0.1, Number(junction.duration) || 0.5), Math.max(0, (range?.end || 0) - (range?.start || 0))) : 0;
  const transitionProgress = transitionDuration && time >= range.end - transitionDuration
    ? clamp((time - (range.end - transitionDuration)) / transitionDuration, 0, 1) : 0;
  const next = transitionProgress > 0 ? prepared.items[index + 1] : null;
  if (next?.segment.type === "video") await seekVideoFrame(next.visual, getVisualSourceTime(next.segment, transitionProgress * transitionDuration));
  const captionSegments = options.captionSegments?.length ? options.captionSegments : createCaptionSegments(options.text);
  const captionIndex = getSegmentIndexAtTime(captionSegments, time, 0);
  const caption = captionIndex >= 0 && !captionSegments[captionIndex]?.hidden ? captionSegments[captionIndex].text : "";
  const stickers = getOfflineStickersAtTime(options.stickerSegments, options.sticker, time);
  drawPreviewFrame(context, frameVisual, canvas, {
    subtitle: caption, fitMode: options.fitMode, filter: options.filter,
    captionsEnabled: options.captionsEnabled, captionPosition: options.captionPosition,
    captionPlacement: options.captionPlacement, captionSize: options.captionSize,
    captionStyle: options.captionStyle, captionReferenceSize: options.captionReferenceSize,
    stickers, stickerImages: stickers.map((sticker) => prepared.stickerImages.get(sticker.src)),
    transitionId: next ? junction.id : "none",
    transitionNext: next ? { visual: next.cutoutVisual || next.visual } : null,
    transitionProgress, vision: frameVision, visualEffects: item.segment, visualTime: localTime,
  });
}

export async function exportOfflineVideo(options) {
  if (typeof VideoEncoder === "undefined") throw new Error("当前浏览器不支持 WebCodecs 离线编码。");
  const settings = options.exportSettings || {};
  const width = Math.max(2, Math.round(Number(settings.width) || options.ratio.width));
  const height = Math.max(2, Math.round(Number(settings.height) || options.ratio.height));
  const codec = getOfflineExportCodec(settings);
  if (codec.audio === "aac" && !aacFallbackRegistered) {
    registerAacEncoder();
    aacFallbackRegistered = true;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, desynchronized: false });
  if (!context) throw new Error("无法创建离线导出画布。");
  options.onProgress?.({ progress: 4, phase: "准备离线渲染" });
  const frames = createOfflineFramePlan(options.duration, settings.frameRate);
  const preparedPromise = prepareComposition({ ...options, framePlan: frames });
  const audioPromise = mixOfflineAudio({ ...options, duration: frames.length * frames[0].duration });
  const [prepared, audioBuffer] = await Promise.all([preparedPromise, audioPromise]);
  const target = new BufferTarget();
  const output = new Output({ format: codec.extension === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target });
  let encoderConfig = null;
  const videoSource = new CanvasSource(canvas, {
    codec: codec.video,
    bitrate: Math.max(2_000_000, Number(settings.videoBitsPerSecond) || 12_000_000),
    keyFrameInterval: 2,
    latencyMode: "quality",
    onEncoderConfig: (config) => { encoderConfig = config; },
  });
  output.addVideoTrack(videoSource, { frameRate: frames.length / Math.max(options.duration, 1 / frames[0].duration) });
  let audioSource = null;
  if (audioBuffer) {
    audioSource = new AudioBufferSource({ codec: codec.audio, bitrate: codec.audio === "aac" ? 256_000 : 192_000 });
    output.addAudioTrack(audioSource);
  }
  await output.start();
  if (audioSource) await audioSource.add(audioBuffer);
  try {
    for (const frame of frames) {
      await renderCompositionAt(context, canvas, prepared, options, frame.timestamp);
      await videoSource.add(frame.timestamp, frame.duration, { keyFrame: frame.keyFrame });
      if (frame.index % Math.max(1, Math.round(frames.length / 100)) === 0) {
        options.onProgress?.({ progress: 10 + Math.round((frame.index / frames.length) * 84), phase: `离线渲染 ${frame.index + 1} / ${frames.length}` });
      }
    }
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    prepared.items.forEach((item) => {
      item.temporalMaskCache?.dispose();
      if (item.segment.type === "video") { item.visual.removeAttribute("src"); item.visual.load(); }
    });
  }
  options.onProgress?.({ progress: 98, phase: "验证导出文件" });
  return {
    blob: new Blob([target.buffer], { type: codec.mimeType }), extension: codec.extension,
    label: codec.extension === "mp4" ? "MP4" : "WebM", mimeType: codec.mimeType,
    nativeMp4: codec.extension === "mp4", diagnostics: {
      width, height, frameCount: frames.length, frameRate: settings.frameRate, encoderConfig,
      videoDecodeModes: prepared.items.map((item) => item.decodeMode),
    },
  };
}
