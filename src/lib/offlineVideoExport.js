import { isMaskTransition } from "./maskTransitions.js";
import { getExportFrameCount } from "./exportSettings.js";
import { ensureFaceAttachmentAssets } from "./faceAttachmentAssets.js";
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

function createOfflineFramePlan(duration, frameRate, keyFrameInterval = 2) {
  const fps = clamp(Math.round(Number(frameRate) || 30), 24, 60);
  const safeDuration = Math.max(1 / fps, Number(duration) || 0);
  const frameCount = Math.max(1, getExportFrameCount(safeDuration, fps));
  const keyFrameEvery = Math.max(1, Math.round(fps * clamp(Number(keyFrameInterval) || 2, 0.25, 10)));
  const frameDuration = 1 / fps;
  return {
    frameCount, frameDuration,
    *frames() {
      for (let index = 0; index < frameCount; index++) {
        yield { index, timestamp: index / fps, duration: frameDuration, keyFrame: index % keyFrameEvery === 0 };
      }
    },
    *timestamps(offset, start, end) {
      // Include one candidate on either side of the rounded boundary, then
      // use the same half-open comparison as the compositor.
      const first = Math.max(0, Math.floor((start - offset) * fps) - 1);
      for (let index = first; index < frameCount; index++) {
        const timestamp = index / fps + offset;
        if (timestamp >= end) break;
        if (timestamp >= start) yield timestamp;
      }
    },
  };
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

async function prepareSequentialFrames(segment, options, range, targetWidth, targetHeight, overlay) {
  let sequentialFrames = null;
  if (options.getTimestamps) {
    let input = null;
    try {
      const blob = segment.blob instanceof Blob ? segment.blob : await fetch(segment.src, { signal: options.signal }).then((response) => {
        if (!response.ok) throw new Error(`Unable to read video source (${response.status})`);
        return response.blob();
      });
      throwIfExportAborted(options.signal);
      input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error("VideoDecoder does not support this source codec");
      // Unrotated frames can go straight to the shared compositor. Avoid a
      // full-resolution YUV→canvas→canvas copy for every exported frame.
      // Preserve the existing rasterization when rotation, resampling or
      // visual effects could change pixel rounding.
      const transform = normalizeVisualTransform(segment.baseTransform);
      const pixelAspectRatio = await track.getPixelAspectRatio();
      const canDrawDecodedFrame = (await track.getRotation()) === 0 && pixelAspectRatio.num === pixelAspectRatio.den;
      const isUntransformedPrimary = track.squarePixelWidth === targetWidth && track.squarePixelHeight === targetHeight
        && transform.x === 0 && transform.y === 0 && transform.scale === 1 && transform.rotation === 0
        && transform.opacity === 1 && !segment.keyframes?.length
        && (!segment.animation?.in?.id || segment.animation.in.id === "none")
        && (!segment.animation?.out?.id || segment.animation.out.id === "none")
        && (!segment.mask?.type || segment.mask.type === "none")
        && !segment.smartFrame?.cropKeyframes?.length && !segment.cinematicDepth?.enabled && !segment.photoParallax?.enabled
        && !hasSubjectEffect(segment.subjectEffect) && !segment.vision?.options?.removeBackground
        && (!segment.transition?.id || segment.transition.id === "none")
        && composeColorGradeFilter(options.filter || "none", resolveColorGrade([], 0, segment.colorGrade)) === "none";
      const directFrames = canDrawDecodedFrame && (overlay || isUntransformedPrimary);
      const sink = directFrames
        ? new VideoSampleSink(track, { optimizeForLatency: true })
        : new CanvasSink(track, { poolSize: overlay ? 2 : 3, decoderOptions: { optimizeForLatency: true } });
      throwIfExportAborted(options.signal);
      const timestamps = (function* () {
        for (const time of options.getTimestamps(range)) {
          yield getVisualSourceTime(segment, time - range.start);
        }
      })();
      const iterator = directFrames ? sink.samplesAtTimestamps(timestamps) : sink.canvasesAtTimestamps(timestamps);
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
      let exhausted = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        options.signal?.removeEventListener("abort", dispose);
        currentFrame?.close(); currentFrame = null;
        bufferedSample?.close(); bufferedSample = null;
        input.dispose();
        void iterator.return().catch(() => {});
      };
      options.signal?.addEventListener("abort", dispose, { once: true });
      sequentialFrames = {
        mode: directFrames ? "sequential-video-frame" : "sequential-webcodecs",
        async next() {
          currentFrame?.close();
          currentFrame = null;
          if (exhausted) return null;
          const pending = await pendingFrame;
          throwIfExportAborted(options.signal);
          if (pending.error) throw pending.error;
          const result = pending.result;
          bufferedSample = null;
          if (result.done) { exhausted = true; return null; }
          pendingFrame = readAhead();
          if (!result.value) return null;
          if (!directFrames) return result.value.canvas;
          const sample = result.value;
          try { currentFrame = sample.toVideoFrame(); }
          finally { sample.close(); }
          return currentFrame;
        },
        release() { currentFrame?.close(); currentFrame = null; },
        dispose,
      };
    } catch (error) {
      input?.dispose();
      throwIfExportAborted(options.signal);
      console.warn("Sequential WebCodecs video decode unavailable; using precise seek fallback", error);
    }
  }
  return sequentialFrames;
}

async function loadCompositionItem(item, options, targetWidth, targetHeight, overlay) {
  const { segment } = item;
  throwIfExportAborted(options.signal);
  item.visual ??= segment.type === "video"
    ? await loadVideo(segment.src, { signal: options.signal })
    : await loadImage(getVectorRenderSource(segment, { targetWidth, targetHeight }));
  throwIfExportAborted(options.signal);
  if (item.temporalMaskCache) return;
  const needsMask = segment.vision?.options?.removeBackground || hasSubjectEffect(segment.subjectEffect);
  const imageMaskUrl = needsMask && segment.type === "image" ? segment.vision?.cutoutUrl : null;
  const maskUrls = needsMask && segment.type === "video"
    ? [...new Set((segment.vision?.samples || []).map((sample) => sample.cutoutUrl).filter(Boolean))] : [];
  item.temporalMaskCache = createTemporalMaskCache(imageMaskUrl ? [imageMaskUrl] : maskUrls);
  const depthUrls = [...new Set((segment.depth?.samples || []).map((sample) => sample.depthUrl).filter(Boolean))];
  item.depthCache = createTemporalMaskCache(depthUrls);
  if (imageMaskUrl && !overlay) item.cutoutVisual = await loadImage(imageMaskUrl).catch(() => null);
}

async function prepareComposition(options) {
  throwIfExportAborted(options.signal);
  const segments = options.visualSegments.some((segment) => segment.src)
    ? options.visualSegments.filter((segment) => segment.src)
    : [{ id: "offline-visual", src: options.imageSrc, type: options.visualType, duration: options.duration }];
  const timeline = getVisualSegmentTimeline(segments);
  const items = segments.map((segment) => ({ segment }));
  const stickerSources = [...new Set([
    ...options.stickerSegments.map((item) => item.src).filter(Boolean),
    ...(options.sticker?.src ? [options.sticker.src] : []),
  ])];
  const stickerImages = new Map((await Promise.all(stickerSources.map(async (src) => [src, await loadImage(src).catch(() => null)]))).filter(([, image]) => image));
  const overlayItems = (options.visualOverlaySegments || [])
    .filter((segment) => segment.src && segment.hidden !== true)
    .map((segment) => ({ segment, overlay: true }));
  throwIfExportAborted(options.signal);
  return { timeline, items, stickerImages, overlayItems, activeItems: new Set(), primaryIndex: 0 };
}

function disposeItem(item) {
  item.temporalMaskCache?.dispose();
  item.depthCache?.dispose();
  item.sequentialFrames?.dispose();
  if (item.visual && item.segment.type === "video") {
    item.visual.removeAttribute("src");
    item.visual.load();
  }
  item.visual = item.cutoutVisual = item.temporalMaskCache = item.depthCache = item.sequentialFrames = null;
  item.sequentialAttempted = false;
}

async function readSequentialFrame(item, options, range, canvas) {
  if (!item.sequentialAttempted) {
    item.sequentialAttempted = true;
    item.sequentialFrames = await prepareSequentialFrames(item.segment, options, range, canvas.width, canvas.height, item.overlay);
    item.decodeMode = item.sequentialFrames?.mode || "precise-seek";
  }
  try {
    return await item.sequentialFrames?.next();
  } catch (error) {
    throwIfExportAborted(options.signal);
    item.sequentialFrames.dispose();
    item.sequentialFrames = null;
    item.decodeMode = "precise-seek";
    console.warn("Sequential decode interrupted; using precise seek fallback", error);
    return null;
  }
}

async function renderCompositionAt(context, canvas, prepared, options, time) {
  const { items, timeline, overlayItems } = prepared;
  let index = prepared.primaryIndex;
  while (index > 0 && time < timeline[index].start) index--;
  while (index < items.length - 1 && time >= timeline[index].end) index++;
  prepared.primaryIndex = index;
  const item = items[index];
  const range = timeline[index];
  const localTime = Math.max(0, time - range.start);
  const junction = item.segment.transition;
  const transitionDuration = junction?.id && junction.id !== "none"
    ? Math.min(Math.max(0.1, Number(junction.duration) || 0.5), range.duration) : 0;
  const transitionProgress = transitionDuration && time >= range.end - transitionDuration
    ? clamp((time - (range.end - transitionDuration)) / transitionDuration, 0, 1) : 0;
  const next = transitionProgress > 0 ? items[index + 1] : null;
  const activeOverlayItems = overlayItems
    .filter(({ segment }) => time >= segment.start && time < segment.start + segment.duration)
    .sort((left, right) => (left.segment.layer || 1) - (right.segment.layer || 1));
  const activeItems = new Set([item, ...(next ? [next] : []), ...activeOverlayItems]);
  for (const previous of prepared.activeItems) {
    if (!activeItems.has(previous)) disposeItem(previous);
  }
  prepared.activeItems = activeItems;
  for (const active of activeItems) {
    await loadCompositionItem(active, options, canvas.width, canvas.height, active.overlay);
  }

  let sourceTime = getVisualSourceTime(item.segment, localTime);
  let frameVisual = item.cutoutVisual || item.visual;
  if (item.segment.type === "video") {
    const decoded = time < range.end
      ? await readSequentialFrame(item, options, range, canvas)
      : null;
    if (decoded) frameVisual = decoded;
    else {
      sourceTime = Math.min(Math.max(0, (item.visual.duration || 0) - 0.04), sourceTime);
      await seekVideoFrame(item.visual, sourceTime, undefined, options.signal);
    }
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
  const holdIncomingFrame = isMaskTransition(junction?.id);
  const nextLocalTime = holdIncomingFrame ? 0 : transitionProgress * transitionDuration;
  if (next?.segment.type === "video") {
    const sourceTime = getVisualSourceTime(next.segment, nextLocalTime);
    const heldTime = Math.min(sourceTime, Math.max(0, (next.visual.duration || sourceTime) - 0.04));
    // Masks reveal a single incoming frame. Waiting on another native
    // video-frame callback at the same seek position otherwise incurs a
    // timeout on each output frame of every transition.
    const alreadyReady = holdIncomingFrame && next.visual.readyState >= 2 && !next.visual.seeking
      && Math.abs(next.visual.currentTime - heldTime) < 0.002;
    if (!alreadyReady) await seekVideoFrame(next.visual, sourceTime, holdIncomingFrame ? 0.002 : undefined, options.signal);
  }
  const captionSegments = options.captionSegments?.length ? options.captionSegments : createCaptionSegments(options.text);
  const captionIndex = getSegmentIndexAtTime(captionSegments, time, options.captionTargetDuration || 0);
  const activeCaptionSegment = captionIndex >= 0 ? captionSegments[captionIndex] : null;
  const caption = activeCaptionSegment && !activeCaptionSegment.hidden ? activeCaptionSegment.text : "";
  const stickers = getOfflineStickersAtTime(options.stickerSegments, options.sticker, time);
  try {
    const overlayFrames = await Promise.allSettled(activeOverlayItems.map(async (overlay) => {
      const sourceTime = overlay.segment.type === "video"
        ? getVisualSourceTime(overlay.segment, Math.max(0, time - overlay.segment.start))
        : Math.max(0, time - overlay.segment.start);
      let decoded = null;
      if (overlay.segment.type === "video") {
        const { start, duration } = overlay.segment;
        decoded = await readSequentialFrame(overlay, options, { start, end: start + duration }, canvas);
        if (!decoded) await seekVideoFrame(overlay.visual, sourceTime, undefined, options.signal);
      }
      const vision = resolveVisionAnalysisAtTime(overlay.segment.vision || null, sourceTime);
      const depthSample = resolveDepthAnalysisAtTime(overlay.segment.depth || null, sourceTime);
      if (vision?.cutoutUrl) await overlay.temporalMaskCache?.prepare(vision.cutoutUrl);
      if (depthSample?.depthUrl) await prepareDepthFrame(overlay.depthCache, depthSample);
      return {
        ...overlay,
        frameVisual: decoded || overlay.visual,
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
    const renderedOverlayItems = overlayFrames.map((frame) => {
      if (frame.status === "rejected") throw frame.reason;
      return frame.value;
    });
    drawPreviewFrame(context, frameVisual, canvas, {
      effectClips: options.effectClips, timelineMarkers: options.timelineMarkers, timelineTime: time,
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
        visualTime: nextLocalTime,
      } : null,
      transitionProgress, vision: frameVision, depth: frameDepth, visualEffects: item.segment, visualTime: localTime,
      visualOverlays: renderedOverlayItems.map((item) => ({ ...item.renderSegment, start: item.segment.start - (range?.start || 0) })),
      visualOverlaySources: renderedOverlayItems.map((item) => item.frameVisual),
    });
  } finally {
    item.sequentialFrames?.release();
    for (const overlay of activeOverlayItems) overlay.sequentialFrames?.release();
  }
}

function disposeComposition(prepared) {
  for (const item of prepared.activeItems) disposeItem(item);
  prepared.activeItems.clear();
}

/** Render bounded review images through exactly the exported composition. */
export async function renderOfflineFrames(options, times) {
  await ensureFaceAttachmentAssets(options.effectClips || []);
  throwIfExportAborted(options.signal);
  const canvas = document.createElement("canvas");
  canvas.width = options.exportSettings.width;
  canvas.height = options.exportSettings.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("MEDIA_SAMPLE_UNAVAILABLE");
  const renderOptions = {
    ...options,
    getTimestamps: (range) => times.filter((time) => time >= range.start && time < range.end),
  };
  const prepared = await prepareComposition(renderOptions);
  try {
    const frames = [];
    for (const time of times) {
      throwIfExportAborted(options.signal);
      await renderCompositionAt(context, canvas, prepared, renderOptions, time);
      throwIfExportAborted(options.signal);
      frames.push({ time, width: canvas.width, height: canvas.height, mimeType: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.82) });
    }
    return frames;
  } finally {
    disposeComposition(prepared);
    canvas.width = 0; canvas.height = 0;
  }
}

export async function exportOfflineVideo(options) {
  throwIfExportAborted(options.signal);
  await ensureFaceAttachmentAssets(options.effectClips || []);
  if (typeof VideoEncoder === "undefined") throw new Error("当前浏览器不支持 WebCodecs 离线编码。");
  const settings = options.exportSettings || {};
  const width = Math.max(2, Math.round(Number(settings.width) || options.ratio.width));
  const height = Math.max(2, Math.round(Number(settings.height) || options.ratio.height));
  const codec = getOfflineExportCodec(settings);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, desynchronized: false });
  if (!context) throw new Error("无法创建离线导出画布。");
  options.onProgress?.({ progress: 4, phaseKey: "exportOfflinePreparing" });
  const frames = createOfflineFramePlan(options.duration, settings.frameRate, settings.keyFrameInterval);
  const timelineOffset = Math.max(0, Number(options.timelineOffset) || 0);
  const renderOptions = {
    ...options,
    getTimestamps: (range) => frames.timestamps(timelineOffset, range.start, range.end),
  };
  const videoBitrate = Math.max(1_000_000, Number(settings.videoBitsPerSecond) || 12_000_000);
  const hardwareAvailable = await canEncodeVideo(codec.video, {
    width, height, bitrate: videoBitrate, latencyMode: "realtime", hardwareAcceleration: "prefer-hardware",
  }).catch(() => false);
  throwIfExportAborted(options.signal);
  const preparedPromise = prepareComposition(renderOptions);
  const audioPromise = mixOfflineAudio({ ...options, duration: frames.frameCount * frames.frameDuration });
  const [prepared, audioBuffer] = await Promise.all([preparedPromise, audioPromise]);
  throwIfExportAborted(options.signal);
  const target = new BufferTarget();
  const audioBitrate = Math.max(96_000, Number(settings.audioBitsPerSecond) || 192_000);
  const expectedBytes = frames.frameCount * frames.frameDuration
    * (videoBitrate + (audioBuffer ? audioBitrate : 0)) / 8;
  // Large local exports put the index at the end so the muxer can write
  // media as it is encoded instead of retaining every packet until finalization.
  const isobmffOptions = { fastStart: expectedBytes < 256 * 1024 * 1024 ? "in-memory" : false, metadataFormat: "mdta" };
  const outputFormat = codec.extension === "mp4"
    ? new Mp4OutputFormat(isobmffOptions)
    : codec.extension === "mov"
      ? new MovOutputFormat(isobmffOptions)
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
  output.addVideoTrack(videoSource, { frameRate: frames.frameCount / Math.max(options.duration, frames.frameDuration) });
  let audioSource = null;
  const encodingController = new AbortController();
  const abortEncoding = () => encodingController.abort();
  options.signal?.addEventListener("abort", abortEncoding, { once: true });
  let pendingAudio = Promise.resolve(null);
  let pendingVideo = Promise.resolve(null);
  let audioError = null;
  try {
    throwIfExportAborted(options.signal);
    if (audioBuffer) {
      if (codec.audio === "aac" && !aacFallbackRegistered) {
        const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
        throwIfExportAborted(options.signal);
        if (!aacFallbackRegistered) {
          registerAacEncoder();
          aacFallbackRegistered = true;
        }
      }
      audioSource = new AudioSampleSource({
        codec: codec.audio,
        bitrate: audioBitrate,
      });
      output.addAudioTrack(audioSource);
    }
    await output.start();
    // Audio and video use independent encoders. Observe failures immediately,
    // while allowing the picture pipeline to start before long audio finishes.
    if (audioSource) pendingAudio = encodeAudioBuffer(audioSource, audioBuffer, encodingController.signal).then(
      () => null, (error) => { audioError = error; return error; },
    );
    for (const frame of frames.frames()) {
      throwIfExportAborted(options.signal);
      await renderCompositionAt(context, canvas, prepared, renderOptions, frame.timestamp + timelineOffset);
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
      if (frame.index % Math.max(1, Math.round(frames.frameCount / 100)) === 0) {
        options.onProgress?.({ progress: 10 + Math.round((frame.index / frames.frameCount) * 84), phaseKey: "exportOfflineRendering", phaseParams: { current: frame.index + 1, total: frames.frameCount } });
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
    disposeComposition(prepared);
    canvas.width = 0;
    canvas.height = 0;
  }
  throwIfExportAborted(options.signal);
  options.onProgress?.({ progress: 98, phaseKey: "exportVerifyFile" });
  return {
    blob: new Blob([target.buffer], { type: codec.mimeType }), extension: codec.extension,
    label: codec.label || (codec.extension === "mp4" ? "MP4" : "WebM"), mimeType: codec.mimeType,
    nativeMp4: codec.extension === "mp4", diagnostics: {
      width, height, frameCount: frames.frameCount, frameRate: settings.frameRate, encoderConfig,
      audioBitrate: audioSource ? audioBitrate : null,
      videoDecodeModes: prepared.items.map((item) => item.decodeMode || (item.segment.type === "video" ? "not-rendered" : "static-image")),
    },
  };
}
