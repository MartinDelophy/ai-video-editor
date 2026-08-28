import { encodePngFrameSequence } from "./media.js";
import { enhanceRemasterFrame } from "./remasterEnhancement.js";

let aacEncoderRegistered = false;

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

function getInferenceSize(width, height, maxLongEdge) {
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return {
    width: Math.max(8, Math.round(width * scale / 8) * 8),
    height: Math.max(8, Math.round(height * scale / 8) * 8),
  };
}

async function getSegmentBlob(segment, signal) {
  if (segment.blob instanceof Blob) return segment.blob;
  const response = await fetch(segment.src, { signal });
  if (!response.ok) throw new Error(`无法读取视频源（HTTP ${response.status}）`);
  return response.blob();
}

async function decodeAudioRange(input, start, duration, signal, AudioBufferSink) {
  throwIfAborted(signal);
  const track = await input.getPrimaryAudioTrack();
  if (!track || !(await track.canDecode())) return null;
  const sink = new AudioBufferSink(track);
  const end = start + duration;
  const wrapped = [];
  const first = await sink.getBuffer(start).catch(() => null);
  if (first) wrapped.push(first);
  for await (const item of sink.buffers(start, end)) {
    throwIfAborted(signal);
    if (!wrapped.some((existing) => Math.abs(existing.timestamp - item.timestamp) < 1e-7)) wrapped.push(item);
  }
  if (!wrapped.length) return null;
  const sampleRate = wrapped[0].buffer.sampleRate;
  const channels = wrapped[0].buffer.numberOfChannels;
  const output = new AudioBuffer({ numberOfChannels: channels, length: Math.max(1, Math.ceil(duration * sampleRate)), sampleRate });
  wrapped.forEach((item) => {
    const itemStart = item.timestamp;
    const itemEnd = item.timestamp + item.buffer.duration;
    const copyStart = Math.max(start, itemStart);
    const copyEnd = Math.min(end, itemEnd);
    if (copyEnd <= copyStart) return;
    const sourceOffset = Math.max(0, Math.round((copyStart - itemStart) * sampleRate));
    const targetOffset = Math.max(0, Math.round((copyStart - start) * sampleRate));
    const frameCount = Math.min(
      Math.round((copyEnd - copyStart) * sampleRate),
      item.buffer.length - sourceOffset,
      output.length - targetOffset,
    );
    for (let channel = 0; channel < channels; channel += 1) {
      output.copyToChannel(item.buffer.getChannelData(channel).subarray(sourceOffset, sourceOffset + frameCount), channel, targetOffset);
    }
  });
  return output;
}

async function enhanceRemasterClipWebCodecs({ segment, frameRate = 0, maxLongEdge = 960, strength = 1, signal, onProgress }) {
  if (typeof VideoDecoder === "undefined" || typeof VideoEncoder === "undefined") throw new Error("当前浏览器不支持 WebCodecs");
  const [{ ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output }, { registerAacEncoder }] = await Promise.all([
    import("mediabunny"),
    import("@mediabunny/aac-encoder"),
  ]);
  if (!aacEncoderRegistered) { registerAacEncoder(); aacEncoderRegistered = true; }
  const blob = await getSegmentBlob(segment, signal);
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  let output = null;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error("WebCodecs 无法解码该视频格式");
    const [stats, displayWidth, displayHeight, sourceTrackDuration] = await Promise.all([
      track.computePacketStats(120),
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.computeDuration(),
    ]);
    const sourceStart = Math.max(0, Math.min(sourceTrackDuration, Number(segment.sourceStart) || 0));
    const availableDuration = Math.max(0.001, sourceTrackDuration - sourceStart);
    const sourceDuration = Math.max(0.001, Math.min(availableDuration, Number(segment.sourceDuration) || Number(segment.duration) || availableDuration));
    const sourceFrameRate = Math.max(1, Number(stats.averagePacketRate) || 30);
    const safeFrameRate = Math.max(1, Math.min(60, Number(frameRate) > 0 ? Number(frameRate) : sourceFrameRate));
    const totalFrames = Math.max(1, Math.ceil(sourceDuration * safeFrameRate));
    const frameDuration = 1 / safeFrameRate;
    const size = getInferenceSize(displayWidth, displayHeight, maxLongEdge);
    const timestamps = Array.from({ length: totalFrames }, (_, index) => Math.min(sourceStart + sourceDuration - 0.000001, sourceStart + index * frameDuration));
    const sink = new CanvasSink(track, {
      width: size.width,
      height: size.height,
      fit: "fill",
      poolSize: 4,
      decoderOptions: { optimizeForLatency: true },
    });
    const iterator = sink.canvasesAtTimestamps(timestamps)[Symbol.asyncIterator]();
    const audioPromise = decodeAudioRange(input, sourceStart, sourceDuration, signal, AudioBufferSink).catch((error) => {
      console.warn("Smart denoise audio decode unavailable; continuing without embedded audio", error);
      return null;
    });
    const target = new BufferTarget();
    output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    const videoSource = new CanvasSource(canvas, {
      codec: "avc",
      bitrate: Math.max(2_000_000, Math.min(14_000_000, Math.round(size.width * size.height * safeFrameRate * 0.22))),
      keyFrameInterval: 2,
      latencyMode: "realtime",
    });
    output.addVideoTrack(videoSource, { frameRate: safeFrameRate });
    const audioBuffer = await audioPromise;
    let audioSource = null;
    if (audioBuffer) {
      audioSource = new AudioBufferSource({ codec: "aac", bitrate: 192_000 });
      output.addAudioTrack(audioSource);
    }
    const abortOutput = () => { output?.cancel().catch(() => {}); };
    signal?.addEventListener("abort", abortOutput, { once: true });
    const sequenceId = `denoise-sequence-${crypto.randomUUID?.() ?? Date.now()}`;
    let backend = "";
    let reusedFrames = 0;
    let nextDecoded = iterator.next();
    try {
      await output.start();
      if (audioSource) await audioSource.add(audioBuffer);
      for (let index = 0; index < totalFrames; index += 1) {
        throwIfAborted(signal);
        const decoded = await nextDecoded;
        if (decoded.done || !decoded.value?.canvas) throw new Error(`无法解码第 ${index + 1} 帧`);
        const bitmap = await createImageBitmap(decoded.value.canvas);
        nextDecoded = iterator.next();
        const result = await enhanceRemasterFrame({
          bitmap,
          maxLongEdge,
          strength,
          outputType: "bitmap",
          sequenceId,
          allowResidualReuse: true,
          reuseThreshold: 0.012,
          signal,
          onProgress: ({ backend: frameBackend }) => { if (frameBackend) backend = frameBackend; },
        });
        if (result.backend) backend = result.backend;
        if (result.reusedResidual) reusedFrames += 1;
        context.clearRect(0, 0, size.width, size.height);
        context.drawImage(result.bitmap, 0, 0, size.width, size.height);
        result.bitmap.close();
        await videoSource.add(index * frameDuration, frameDuration, { keyFrame: index % Math.max(1, Math.round(safeFrameRate * 2)) === 0 });
        onProgress?.({
          progress: Math.min(95, 4 + ((index + 1) / totalFrames) * 91),
          phaseKey: "remasterPhaseEnhancingFrame",
          phaseParams: { current: index + 1, total: totalFrames },
          frameIndex: index + 1,
          totalFrames,
          backend,
          reusedFrames,
          pipeline: "webcodecs-stream",
        });
      }
      throwIfAborted(signal);
      onProgress?.({ progress: 97, phaseKey: "remasterPhaseEncodeVideo", frameIndex: totalFrames, totalFrames, backend, reusedFrames, pipeline: "webcodecs-stream" });
      await output.finalize();
      onProgress?.({ progress: 99, phaseKey: "remasterPhaseCreateAsset", frameIndex: totalFrames, totalFrames, backend, reusedFrames, pipeline: "webcodecs-stream" });
    } catch (error) {
      await output.cancel().catch(() => {});
      throw error;
    } finally {
      signal?.removeEventListener("abort", abortOutput);
    }
    if (!target.buffer) throw new Error("WebCodecs 没有生成视频数据");
    return {
      blob: new Blob([target.buffer], { type: "video/mp4" }),
      width: size.width,
      height: size.height,
      sourceDuration,
      frameRate: safeFrameRate,
      totalFrames,
      backend,
      reusedFrames,
      pipeline: "webcodecs-stream",
      audioPreserved: Boolean(audioBuffer),
    };
  } finally {
    input.dispose();
  }
}

async function enhanceRemasterClipLegacy({ segment, videoElement = null, frameRate = 12, maxLongEdge = 960, strength = 1, signal, onProgress }) {
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
      audioSourceBlob: segment.blob instanceof Blob ? segment.blob : null,
      audioStart: sourceStart,
      audioDuration: sourceDuration,
      signal,
      onProgress,
      produceFrame: async (index) => {
        throwIfAborted(signal);
        await seekVideo(video, sourceStart + index / safeFrameRate, signal);
        const bitmap = await createImageBitmap(video);
        const result = await enhanceRemasterFrame({
          bitmap,
          maxLongEdge,
          strength,
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
      reusedFrames: 0,
      pipeline: "png-ffmpeg-fallback",
      audioPreserved: segment.blob instanceof Blob,
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

export async function enhanceRemasterClip(options) {
  if (!options?.segment?.src || options.segment.type !== "video") throw new Error("请选择一个视频片段");
  throwIfAborted(options.signal);
  options.onProgress?.({ progress: 1, phaseKey: "remasterPhaseReadClip", frameIndex: 0, totalFrames: 0, pipeline: "webcodecs-stream" });
  try {
    return await enhanceRemasterClipWebCodecs(options);
  } catch (error) {
    if (error?.name === "AbortError" || options.signal?.aborted) throw error;
    console.warn("Smart denoise WebCodecs pipeline unavailable; using PNG/FFmpeg fallback", error);
    return enhanceRemasterClipLegacy({ ...options, frameRate: Number(options.frameRate) > 0 ? options.frameRate : 12 });
  }
}
