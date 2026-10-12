import {
  AudioSample,
  AudioSampleSource,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  canEncodeVideo,
  VideoSampleSink,
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
import { composeColorGradeFilter, resolveColorGrade } from "./colorGrade.js";
import { resolveVisionAnalysisAtTime } from "./vision.js";
import { getVisualSourceTime, normalizeVisualTransform } from "./visualEffects.js";
import { getVectorRenderSource } from "./vectorDesign.js";
import { hasSubjectEffect } from "./subjectEffects.js";
import { getGeneratedMediaTags } from "./generatedMediaMetadata.js";
import { prepareDepthFrame, getDepthFrame, resolveDepthAnalysisAtTime } from "./depthOfField.js";
import { mixOfflineAudio } from "./audioExport.js";

export { mixOfflineAudio } from "./audioExport.js";

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

// Feed bounded planar chunks so cancellation can stop between submissions,
// before closing an encoder that may still be awaiting its dequeue event.
async function encodeAudioBuffer(source, buffer, signal) {
  const channels = buffer.numberOfChannels;
  const chunkFrames = Math.max(1, Math.floor(240_000 / channels));
  for (let offset = 0; offset < buffer.length; offset += chunkFrames) {
    throwIfExportAborted(signal);
    const frames = Math.min(chunkFrames, buffer.length - offset);
    const data = new Float32Array(frames * channels);
    for (let channel = 0; channel < channels; channel++) {
      buffer.copyFromChannel(data.subarray(channel * frames, (channel + 1) * frames), channel, offset);
    }
    const sample = new AudioSample({
      format: "f32-planar", sampleRate: buffer.sampleRate, numberOfChannels: channels,
      timestamp: offset / buffer.sampleRate, data,
    });
    try { await source.add(sample); }
    finally { sample.close(); }
  }
  throwIfExportAborted(signal);
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
      ? [...new Set((segment.vision?.samples || []).map((sample) => sample.cutoutUrl).filter(Boolean))] : [];
    let sequentialFrames = null;
    if (segment.type === "video" && options.framePlan?.length) {
      let input = null;
      try {
        const blob = segment.blob instanceof Blob ? segment.blob : await fetch(segment.src, { signal: options.signal }).then((response) => {
          if (!response.ok) throw new Error(`Unable to read video source (${response.status})`);
          return response.blob();
        });
        input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) throw new Error("VideoDecoder does not support this source codec");
        // Unrotated frames can go straight to the shared compositor. Avoid a
        // full-resolution YUV→canvas→canvas copy for every exported frame.
        // Preserve the existing rasterization when rotation, resampling or
        // visual effects could change pixel rounding.
        const transform = normalizeVisualTransform(segment.baseTransform);
        const pixelAspectRatio = await track.getPixelAspectRatio();
        const directFrames = (await track.getRotation()) === 0
          && pixelAspectRatio.num === pixelAspectRatio.den
          && track.squarePixelWidth === targetWidth && track.squarePixelHeight === targetHeight
          && transform.x === 0 && transform.y === 0 && transform.scale === 1 && transform.rotation === 0
          && transform.opacity === 1 && !segment.keyframes?.length
          && (!segment.animation?.in?.id || segment.animation.in.id === "none")
          && (!segment.animation?.out?.id || segment.animation.out.id === "none")
          && (!segment.mask?.type || segment.mask.type === "none")
          && !segment.smartFrame?.cropKeyframes?.length && !segment.cinematicDepth?.enabled && !segment.photoParallax?.enabled
          && !subjectMaskNeeded && !segment.vision?.options?.removeBackground
          && (!segment.transition?.id || segment.transition.id === "none")
          && composeColorGradeFilter(options.filter || "none", resolveColorGrade([], 0, segment.colorGrade)) === "none";
        const sink = directFrames
          ? new VideoSampleSink(track, { optimizeForLatency: true })
          : new CanvasSink(track, { poolSize: 3, decoderOptions: { optimizeForLatency: true } });
        const range = timeline[index];
        const timestamps = options.framePlan
          .filter((frame) => frame.timestamp >= range.start && frame.timestamp < range.end)
          .map((frame) => getVisualSourceTime(segment, frame.timestamp - range.start));
        const iterator = (directFrames ? sink.samplesAtTimestamps(timestamps) : sink.canvasesAtTimestamps(timestamps))[Symbol.asyncIterator]();
        let currentFrame = null;
        let disposed = false;
        let bufferedSample = null;
        // Decode at most one frame ahead while the current frame is composed
        // and encoded. Reflect rejection immediately so cancellation cannot
        // leave an unhandled background promise.
        const readAhead = () => iterator.next().then((result) => {
          if (directFrames) {
            if (disposed) result.value?.close();
            else bufferedSample = result.value || null;
          }
          return { result };
        }, (error) => ({ error }));
        let pendingFrame = readAhead();
        sequentialFrames = {
          mode: directFrames ? "sequential-video-frame" : "sequential-webcodecs",
          async next() {
            currentFrame?.close();
            currentFrame = null;
            const pending = await pendingFrame;
            if (pending.error) throw pending.error;
            const result = pending.result;
            bufferedSample = null;
            if (result.done) return null;
            pendingFrame = readAhead();
            if (!result.value) return null;
            if (!directFrames) return result.value.canvas;
            const sample = result.value;
            try { currentFrame = sample.toVideoFrame(); }
            finally { sample.close(); }
            return currentFrame;
          },
          release() { currentFrame?.close(); currentFrame = null; },
          dispose() {
            disposed = true;
            currentFrame?.close(); currentFrame = null;
            bufferedSample?.close(); bufferedSample = null;
            input.dispose();
          },
        };
      } catch (error) {
        input?.dispose();
        throwIfExportAborted(options.signal);
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
      decodeMode: segment.type === "video" ? (sequentialFrames ? sequentialFrames.mode : "precise-seek") : "static-image",
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
  if (depthSample?.depthUrl) await prepareDepthFrame(item.depthCache, depthSample);
  const frameDepth = getDepthFrame(item.depthCache, depthSample);
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
    if (depthSample?.depthUrl) await prepareDepthFrame(overlay.depthCache, depthSample);
    return {
      ...overlay,
      renderSegment: {
        ...overlay.segment,
        ...(vision ? { vision: {
          ...vision,
          options: overlay.segment.vision?.options || vision.options,
          maskVisual: overlay.temporalMaskCache?.get(vision.cutoutUrl) || null,
        } } : {}),
        ...(depthSample ? { depth: getDepthFrame(overlay.depthCache, depthSample) } : {}),
      },
    };
  }));
  try {
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
  } finally {
    item.sequentialFrames?.release();
  }
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
  const videoBitrate = Math.max(1_000_000, Number(settings.videoBitsPerSecond) || 12_000_000);
  const hardwareAvailable = await canEncodeVideo(codec.video, {
    width, height, bitrate: videoBitrate, latencyMode: "realtime", hardwareAcceleration: "prefer-hardware",
  }).catch(() => false);
  throwIfExportAborted(options.signal);
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
    bitrate: videoBitrate,
    ...(hardwareAvailable ? { hardwareAcceleration: "prefer-hardware" } : {}),
    keyFrameInterval: Math.max(0.25, Number(settings.keyFrameInterval) || 2),
    latencyMode: "realtime",
    onEncoderConfig: (config) => { encoderConfig = config; },
  });
  output.addVideoTrack(videoSource, { frameRate: frames.length / Math.max(options.duration, frames[0].duration) });
  let audioSource = null;
  const audioBitrate = Math.max(96_000, Number(settings.audioBitsPerSecond) || 192_000);
  if (audioBuffer) {
    audioSource = new AudioSampleSource({
      codec: codec.audio,
      bitrate: audioBitrate,
    });
    output.addAudioTrack(audioSource);
  }
  const encodingController = new AbortController();
  const abortEncoding = () => encodingController.abort();
  options.signal?.addEventListener("abort", abortEncoding, { once: true });
  let pendingAudio = Promise.resolve(null);
  let pendingVideo = Promise.resolve(null);
  let audioError = null;
  try {
    throwIfExportAborted(options.signal);
    await output.start();
    // Audio and video use independent encoders. Observe failures immediately,
    // while allowing the picture pipeline to start before long audio finishes.
    if (audioSource) pendingAudio = encodeAudioBuffer(audioSource, audioBuffer, encodingController.signal).then(
      () => null, (error) => { audioError = error; return error; },
    );
    for (const frame of frames) {
      throwIfExportAborted(options.signal);
      await renderCompositionAt(context, canvas, prepared, options, frame.timestamp + timelineOffset);
      throwIfExportAborted(options.signal);
      if (audioError) throw audioError;
      const videoError = await pendingVideo;
      throwIfExportAborted(options.signal);
      if (videoError) throw videoError;
      // CanvasSource captures an immutable VideoFrame synchronously in add().
      // Compose the next picture while this submission waits for backpressure;
      // only one submission is in flight, so the encoder queue stays bounded.
      pendingVideo = videoSource.add(frame.timestamp, frame.duration, { keyFrame: frame.keyFrame }).then(
        () => null, (error) => error,
      );
      if (frame.index % Math.max(1, Math.round(frames.length / 100)) === 0) {
        options.onProgress?.({ progress: 10 + Math.round((frame.index / frames.length) * 84), phaseKey: "exportOfflineRendering", phaseParams: { current: frame.index + 1, total: frames.length } });
      }
    }
    const [finalAudioError, finalVideoError] = await Promise.all([pendingAudio, pendingVideo]);
    throwIfExportAborted(options.signal);
    if (finalAudioError) throw finalAudioError;
    if (finalVideoError) throw finalVideoError;
    throwIfExportAborted(options.signal);
    await output.finalize();
  } catch (error) {
    encodingController.abort();
    // Finish the bounded in-flight submissions before closing encoders:
    // closing first can strand native WebCodecs dequeue promises forever.
    await Promise.all([pendingAudio, pendingVideo]);
    await output.cancel().catch(() => {});
    throwIfExportAborted(options.signal);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortEncoding);
    for (const item of [...prepared.items, ...prepared.overlayItems]) {
      item.temporalMaskCache?.dispose();
      item.depthCache?.dispose();
      item.sequentialFrames?.dispose?.();
      if (item.segment.type === "video") { item.visual.removeAttribute("src"); item.visual.load(); }
    }
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
