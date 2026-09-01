import {
  AudioBufferSource,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";

import { throwIfExportAborted } from "./exportCancellation.js";
import { resolveCaptionStyleForSegment } from "./captionFonts.js";
import { resolveCaptionSizeForSegment } from "./captionStyles.js";
import { resolveCaptionSegmentPlacement } from "./captionLayout.js";
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
import { createPitchPreservedAudioBuffer } from "./pitchPreservingTimeStretch.js";
import { getVectorRenderSource } from "./vectorDesign.js";
import { hasSubjectEffect } from "./subjectEffects.js";
import { getGeneratedMediaTags } from "./generatedMediaMetadata.js";
import { resolveDepthAnalysisAtTime } from "./depthOfField.js";
import { connectAudioSpatialEffect } from "./audioSpatialEffects.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let aacFallbackRegistered = false;

export function createOfflineFramePlan(duration, frameRate, keyFrameInterval = 2) {
  const fps = clamp(Math.round(Number(frameRate) || 30), 24, 60);
  const safeDuration = Math.max(1 / fps, Number(duration) || 0);
  const frameCount = Math.max(1, Math.ceil(safeDuration * fps));
  const keyFrameEvery = Math.max(1, Math.round(fps * clamp(Number(keyFrameInterval) || 2, 0.25, 10)));
  return Array.from({ length: frameCount }, (_, index) => ({
    index,
    timestamp: index / fps,
    duration: 1 / fps,
    keyFrame: index % keyFrameEvery === 0,
  }));
}

export function getOfflineExportCodec(settings = {}) {
  if (settings.codec === "vp8") return { video: "vp8", audio: "opus", extension: "webm", mimeType: "video/webm" };
  if (settings.codec === "vp9") return { video: "vp9", audio: "opus", extension: "webm", mimeType: "video/webm" };
  if (settings.codec === "h264-mov") return { video: "avc", audio: "aac", extension: "mov", mimeType: "video/quicktime", label: "MOV" };
  return { video: "avc", audio: "aac", extension: "mp4", mimeType: "video/mp4" };
}

export function getOfflineStickersAtTime(stickerSegments = [], sticker = null, time = 0) {
  if (!stickerSegments.length) return sticker ? [sticker] : [];
  return stickerSegments.filter((item) => time >= item.start && time < item.start + item.duration);
}

export function getOfflineVisualOverlaysAtTime(segments = [], time = 0) {
  return segments
    .filter((segment) => time >= segment.start && time < segment.start + segment.duration)
    .sort((left, right) => (left.layer || 1) - (right.layer || 1));
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
  sourceAudioSpatialEffect = "original",
  sourceAudioSpatialAmount = 1,
  sourceAudioStart = 0,
  musicBlob = null,
  musicVolume = 0.35,
  musicStart = 0,
  musicSegments = [],
  timelineOffset = 0,
}) {
  const inputs = [
    ...voiceAudioSegments.filter((item) => item.blob).map((item) => ({
      blob: item.blob, start: Math.max(0, item.start || 0), volume: item.volume ?? 1,
      sourceOffset: Math.max(0, item.sourceStart || 0), sourceDuration: Math.max(0, item.sourceDuration || (item.duration || 0) * (Number(item.playbackRate) || 1)), playbackRate: clamp(Number(item.playbackRate) || 1, 0.25, 4),
      fadeIn: Math.max(0, item.fadeIn || 0), fadeOut: Math.max(0, item.fadeOut || 0),
      spatialEffect: item.spatialEffect, spatialAmount: item.spatialAmount,
    })),
    ...(sourceAudioBlob && sourceAudioSegments.length ? sourceAudioSegments.map((item) => ({
      blob: sourceAudioBlob, start: Math.max(0, item.start || 0), volume: sourceAudioVolume,
      sourceOffset: Math.max(0, item.sourceStart || 0), sourceDuration: Math.max(0, item.sourceDuration || 0),
      playbackRate: clamp(Number(item.playbackRate) || 1, 0.25, 4), fadeIn: 0, fadeOut: 0,
      spatialEffect: sourceAudioSpatialEffect, spatialAmount: sourceAudioSpatialAmount,
    })) : sourceAudioBlob ? [{ blob: sourceAudioBlob, start: Math.max(0, sourceAudioStart), volume: sourceAudioVolume, sourceOffset: 0, sourceDuration: 0, playbackRate: 1, fadeIn: 0, fadeOut: 0, spatialEffect: sourceAudioSpatialEffect, spatialAmount: sourceAudioSpatialAmount }] : []),
    ...(musicBlob ? (musicSegments.length ? musicSegments.map((item) => ({
      blob: musicBlob, start: Math.max(0, item.start || 0), volume: item.volume ?? musicVolume,
      sourceOffset: Math.max(0, item.sourceStart || 0), sourceDuration: Math.max(0, item.sourceDuration || (item.duration || 0) * (Number(item.playbackRate) || 1)),
      playbackRate: clamp(Number(item.playbackRate) || 1, 0.25, 4), fadeIn: Math.max(0, item.fadeIn || 0), fadeOut: Math.max(0, item.fadeOut || 0),
      spatialEffect: item.spatialEffect, spatialAmount: item.spatialAmount,
    })) : [{ blob: musicBlob, start: Math.max(0, musicStart), volume: musicVolume, sourceOffset: 0, sourceDuration: 0, playbackRate: 1, fadeIn: 0, fadeOut: 0 }]) : []),
  ];
  if (!inputs.length) return null;
  const decoded = await decodeAudioInputs(inputs);
  const sampleRate = 48_000;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContextClass) throw new Error("当前浏览器不支持离线音频混合。");
  const context = new OfflineContextClass(2, Math.ceil(Math.max(0.01, duration) * sampleRate), sampleRate);
  const rangeStart = Math.max(0, Number(timelineOffset) || 0);
  const rangeEnd = rangeStart + Math.max(0.01, duration);
  decoded.forEach((input) => {
    const playbackRate = clamp(Number(input.playbackRate) || 1, 0.25, 4);
    const originalOffset = Math.min(input.decoded.duration, input.sourceOffset);
    const available = Math.max(0, input.decoded.duration - originalOffset);
    const originalSourceDuration = Math.min(available, input.sourceDuration || available);
    const originalOutputDuration = originalSourceDuration / playbackRate;
    const visibleStart = Math.max(input.start, rangeStart);
    const visibleEnd = Math.min(input.start + originalOutputDuration, rangeEnd);
    if (visibleEnd <= visibleStart) return;
    const trimOutput = visibleStart - input.start;
    const outputDuration = visibleEnd - visibleStart;
    const offset = originalOffset + trimOutput * playbackRate;
    const sourceDuration = Math.min(input.decoded.duration - offset, outputDuration * playbackRate);
    if (!(sourceDuration > 0)) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const preservePitch = Math.abs(playbackRate - 1) > 0.0001;
    source.buffer = preservePitch
      ? createPitchPreservedAudioBuffer(context, input.decoded, {
          sourceOffset: offset,
          sourceDuration,
          playbackRate,
        })
      : input.decoded;
    source.playbackRate.value = 1;
    const outputStart = visibleStart - rangeStart;
    const fadeInRemaining = Math.max(0, input.fadeIn - trimOutput);
    const originalOutputEnd = input.start + originalOutputDuration;
    const fadeOutStart = originalOutputEnd - input.fadeOut;
    gain.gain.setValueAtTime(input.volume, outputStart);
    if (fadeInRemaining > 0) {
      gain.gain.setValueAtTime(input.volume * clamp(trimOutput / input.fadeIn, 0, 1), outputStart);
      gain.gain.linearRampToValueAtTime(input.volume, outputStart + Math.min(fadeInRemaining, outputDuration));
    }
    if (input.fadeOut > 0 && visibleEnd > fadeOutStart) {
      const localFadeStart = Math.max(outputStart, fadeOutStart - rangeStart);
      gain.gain.setValueAtTime(input.volume, localFadeStart);
      gain.gain.linearRampToValueAtTime(
        input.volume * clamp((originalOutputEnd - visibleEnd) / input.fadeOut, 0, 1),
        outputStart + outputDuration,
      );
    }
    source.connect(gain);
    connectAudioSpatialEffect(context, gain, context.destination, input.spatialEffect, input.spatialAmount, { smooth: false });
    source.start(outputStart, preservePitch ? 0 : offset, preservePitch ? outputDuration : sourceDuration);
  });
  return context.startRendering();
}

async function prepareComposition(options) {
  throwIfExportAborted(options.signal);
  const targetWidth = Math.max(2, Math.round(Number(options.exportSettings?.width) || options.ratio.width));
  const targetHeight = Math.max(2, Math.round(Number(options.exportSettings?.height) || options.ratio.height));
  const segments = options.visualSegments.some((segment) => segment.src)
    ? options.visualSegments.filter((segment) => segment.src)
    : [{ id: "offline-visual", src: options.imageSrc, type: options.visualType, duration: options.duration }];
  const timeline = getVisualSegmentTimeline(segments);
  const items = await Promise.all(segments.map(async (segment, index) => {
    throwIfExportAborted(options.signal);
    const visual = segment.type === "video"
      ? await loadVideo(segment.src)
      : await loadImage(getVectorRenderSource(segment, { targetWidth, targetHeight }));
    throwIfExportAborted(options.signal);
    const subjectMaskNeeded = hasSubjectEffect(segment.subjectEffect);
    const cutoutVisual = segment.type === "image"
      && (segment.vision?.options?.removeBackground || subjectMaskNeeded)
      && segment.vision?.cutoutUrl
      ? await loadImage(segment.vision.cutoutUrl).catch(() => null) : null;
    const maskUrls = segment.type === "video"
      && (segment.vision?.options?.removeBackground || subjectMaskNeeded)
      ? [...new Set((segment.vision.samples || []).map((sample) => sample.cutoutUrl).filter(Boolean))] : [];
    let sequentialFrames = null;
    if (segment.type === "video" && options.framePlan?.length) {
      try {
        const blob = segment.blob instanceof Blob ? segment.blob : await fetch(segment.src, { signal: options.signal }).then((response) => {
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
      depthCache: (segment.depth?.samples || []).length
        ? createTemporalMaskCache([...new Set(segment.depth.samples.map((sample) => sample.depthUrl).filter(Boolean))])
        : null,
      sequentialFrames,
      decodeMode: segment.type === "video" ? (sequentialFrames ? "sequential-webcodecs" : "precise-seek") : "static-image",
    };
  }));
  throwIfExportAborted(options.signal);
  const stickerSources = [...new Set([
    ...options.stickerSegments.map((item) => item.src).filter(Boolean),
    ...(options.sticker?.src ? [options.sticker.src] : []),
  ])];
  const stickerImages = new Map((await Promise.all(stickerSources.map(async (src) => [src, await loadImage(src).catch(() => null)]))).filter(([, image]) => image));
  const overlayItems = await Promise.all((options.visualOverlaySegments || []).filter((segment) => segment.src && segment.hidden !== true).map(async (segment) => {
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
        : await loadImage(getVectorRenderSource(segment, { targetWidth, targetHeight })),
      temporalMaskCache,
      depthCache,
    };
  }));
  throwIfExportAborted(options.signal);
  return { segments, timeline, items, stickerImages, overlayItems };
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
  const depthSample = resolveDepthAnalysisAtTime(item.segment.depth || null, sourceTime);
  if (depthSample?.depthUrl) await item.depthCache?.prepare(depthSample.depthUrl);
  const frameDepth = depthSample ? {
    ...depthSample,
    depthVisual: item.depthCache?.get(depthSample.depthUrl) || null,
  } : null;
  const junction = item.segment.transition;
  const transitionDuration = junction?.id && junction.id !== "none"
    ? Math.min(Math.max(0.1, Number(junction.duration) || 0.5), Math.max(0, (range?.end || 0) - (range?.start || 0))) : 0;
  const transitionProgress = transitionDuration && time >= range.end - transitionDuration
    ? clamp((time - (range.end - transitionDuration)) / transitionDuration, 0, 1) : 0;
  const next = transitionProgress > 0 ? prepared.items[index + 1] : null;
  if (next?.segment.type === "video") await seekVideoFrame(next.visual, getVisualSourceTime(next.segment, transitionProgress * transitionDuration));
  const captionSegments = options.captionSegments?.length ? options.captionSegments : createCaptionSegments(options.text);
  const captionIndex = getSegmentIndexAtTime(captionSegments, time, options.captionTargetDuration || 0);
  const activeCaptionSegment = captionIndex >= 0 ? captionSegments[captionIndex] : null;
  const caption = activeCaptionSegment && !activeCaptionSegment.hidden ? activeCaptionSegment.text : "";
  const stickers = getOfflineStickersAtTime(options.stickerSegments, options.sticker, time);
  const activeOverlaySegments = getOfflineVisualOverlaysAtTime(prepared.overlayItems.map((item) => item.segment), time);
  const activeOverlayIds = new Set(activeOverlaySegments.map((segment) => segment.id));
  const activeOverlayItems = prepared.overlayItems
    .filter((item) => activeOverlayIds.has(item.segment.id))
    .sort((left, right) => activeOverlaySegments.findIndex((segment) => segment.id === left.segment.id) - activeOverlaySegments.findIndex((segment) => segment.id === right.segment.id));
  for (const overlay of activeOverlayItems) {
    if (overlay.segment.type === "video") {
      await seekVideoFrame(overlay.visual, Math.min(Math.max(0, (overlay.visual.duration || 0) - 0.04), Math.max(0, time - overlay.segment.start)));
    }
  }
  const renderedOverlayItems = await Promise.all(activeOverlayItems.map(async (overlay) => {
    const sourceTime = overlay.segment.type === "video"
      ? getVisualSourceTime(overlay.segment, Math.max(0, time - overlay.segment.start))
      : Math.max(0, time - overlay.segment.start);
    const vision = resolveVisionAnalysisAtTime(overlay.segment.vision || null, sourceTime);
    const depthSample = resolveDepthAnalysisAtTime(overlay.segment.depth || null, sourceTime);
    if (vision?.cutoutUrl) await overlay.temporalMaskCache?.prepare(vision.cutoutUrl);
    if (depthSample?.depthUrl) await overlay.depthCache?.prepare(depthSample.depthUrl);
    return {
      ...overlay,
      renderSegment: {
        ...overlay.segment,
        ...(vision ? { vision: {
          ...vision,
          options: overlay.segment.vision?.options || vision.options,
          maskVisual: overlay.temporalMaskCache?.get(vision.cutoutUrl) || null,
        } } : {}),
        ...(depthSample ? { depth: { ...depthSample, depthVisual: overlay.depthCache?.get(depthSample.depthUrl) || null } } : {}),
      },
    };
  }));
  drawPreviewFrame(context, frameVisual, canvas, {
    subtitle: caption, fitMode: options.fitMode, filter: options.filter,
    captionsEnabled: options.captionsEnabled, captionPosition: options.captionPosition,
    captionPlacement: resolveCaptionSegmentPlacement(activeCaptionSegment, options.captionPlacement),
    captionSize: resolveCaptionSizeForSegment(options.captionSize, activeCaptionSegment),
    captionStyle: resolveCaptionStyleForSegment(options.captionStyle, activeCaptionSegment),
    captionReferenceSize: options.captionReferenceSize,
    stickers, stickerImages: stickers.map((sticker) => prepared.stickerImages.get(sticker.src)),
    transitionId: next ? junction.id : "none",
    transitionNext: next ? {
      visual: next.cutoutVisual || next.visual,
      visualEffects: next.segment,
      visualTime: transitionProgress * transitionDuration,
    } : null,
    transitionProgress, vision: frameVision, depth: frameDepth, visualEffects: item.segment, visualTime: localTime,
    visualOverlays: renderedOverlayItems.map((item) => ({ ...item.renderSegment, start: item.segment.start - (range?.start || 0) })),
    visualOverlaySources: renderedOverlayItems.map((item) => item.visual),
  });
}

export async function exportOfflineVideo(options) {
  throwIfExportAborted(options.signal);
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
  options.onProgress?.({ progress: 4, phaseKey: "exportOfflinePreparing" });
  const frames = createOfflineFramePlan(options.duration, settings.frameRate, settings.keyFrameInterval);
  const timelineOffset = Math.max(0, Number(options.timelineOffset) || 0);
  const compositionFrames = frames.map((frame) => ({ ...frame, timestamp: frame.timestamp + timelineOffset }));
  const preparedPromise = prepareComposition({ ...options, framePlan: compositionFrames });
  const audioPromise = mixOfflineAudio({ ...options, duration: frames.length * frames[0].duration });
  const [prepared, audioBuffer] = await Promise.all([preparedPromise, audioPromise]);
  throwIfExportAborted(options.signal);
  const target = new BufferTarget();
  const outputFormat = codec.extension === "mp4"
    ? new Mp4OutputFormat({ fastStart: "in-memory", metadataFormat: "mdta" })
    : codec.extension === "mov"
      ? new MovOutputFormat({ fastStart: "in-memory", metadataFormat: "mdta" })
      : new WebMOutputFormat();
  const output = new Output({ format: outputFormat, target });
  const metadataTags = getGeneratedMediaTags(options.generationMetadata);
  if (metadataTags) output.setMetadataTags(metadataTags);
  let encoderConfig = null;
  const videoSource = new CanvasSource(canvas, {
    codec: codec.video,
    bitrate: Math.max(1_000_000, Number(settings.videoBitsPerSecond) || 12_000_000),
    keyFrameInterval: Math.max(0.25, Number(settings.keyFrameInterval) || 2),
    latencyMode: "realtime",
    onEncoderConfig: (config) => { encoderConfig = config; },
  });
  output.addVideoTrack(videoSource, { frameRate: frames.length / Math.max(options.duration, frames[0].duration) });
  let audioSource = null;
  const audioBitrate = Math.max(96_000, Number(settings.audioBitsPerSecond) || 192_000);
  if (audioBuffer) {
    audioSource = new AudioBufferSource({
      codec: codec.audio,
      bitrate: audioBitrate,
    });
    output.addAudioTrack(audioSource);
  }
  const abortOutput = () => { output.cancel().catch(() => {}); };
  options.signal?.addEventListener("abort", abortOutput, { once: true });
  try {
    throwIfExportAborted(options.signal);
    await output.start();
    if (audioSource) await audioSource.add(audioBuffer);
    for (const frame of frames) {
      throwIfExportAborted(options.signal);
      await renderCompositionAt(context, canvas, prepared, options, frame.timestamp + timelineOffset);
      throwIfExportAborted(options.signal);
      await videoSource.add(frame.timestamp, frame.duration, { keyFrame: frame.keyFrame });
      if (frame.index % Math.max(1, Math.round(frames.length / 100)) === 0) {
        options.onProgress?.({ progress: 10 + Math.round((frame.index / frames.length) * 84), phaseKey: "exportOfflineRendering", phaseParams: { current: frame.index + 1, total: frames.length } });
      }
    }
    throwIfExportAborted(options.signal);
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortOutput);
    prepared.items.forEach((item) => {
      item.temporalMaskCache?.dispose();
      if (item.segment.type === "video") { item.visual.removeAttribute("src"); item.visual.load(); }
    });
    prepared.overlayItems.forEach((item) => {
      if (item.segment.type === "video") { item.visual.removeAttribute("src"); item.visual.load(); }
    });
  }
  throwIfExportAborted(options.signal);
  options.onProgress?.({ progress: 98, phaseKey: "exportVerifyFile" });
  return {
    blob: new Blob([target.buffer], { type: codec.mimeType }), extension: codec.extension,
    label: codec.label || (codec.extension === "mp4" ? "MP4" : "WebM"), mimeType: codec.mimeType,
    nativeMp4: codec.extension === "mp4", diagnostics: {
      width, height, frameCount: frames.length, frameRate: settings.frameRate, encoderConfig,
      audioBitrate: audioSource ? audioBitrate : null,
      videoDecodeModes: prepared.items.map((item) => item.decodeMode),
    },
  };
}
