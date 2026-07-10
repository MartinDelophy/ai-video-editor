const pendingVisionRequests = new Map();

let visionWorker = null;

function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return `vision-${globalThis.crypto.randomUUID()}`;
  }
  return `vision-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAbortError() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("视觉分析已取消。", "AbortError");
  }
  const error = new Error("视觉分析已取消。");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function settleVisionRequest(requestId, settle) {
  const request = pendingVisionRequests.get(requestId);
  if (!request) {
    return;
  }

  pendingVisionRequests.delete(requestId);
  request.signal?.removeEventListener("abort", request.handleAbort);
  settle(request);
}

function rejectPendingVisionRequests(error) {
  pendingVisionRequests.forEach((request) => {
    request.signal?.removeEventListener("abort", request.handleAbort);
    request.reject(error);
  });
  pendingVisionRequests.clear();
}

function resetVisionWorker(error = null) {
  visionWorker?.terminate();
  visionWorker = null;
  if (error) {
    rejectPendingVisionRequests(error);
  }
}

function getVisionWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }

  if (visionWorker) {
    return visionWorker;
  }

  visionWorker = new Worker(new URL("../workers/vision.worker.js", import.meta.url), {
    type: "module",
  });

  visionWorker.addEventListener("message", (event) => {
    const message = event.data;
    const request = pendingVisionRequests.get(message?.requestId);
    if (!request) {
      return;
    }

    if (message.type === "progress") {
      try {
        request.onProgress?.({
          progress: Math.max(0, Math.min(100, Number(message.progress) || 0)),
          phase: String(message.phase ?? ""),
        });
      } catch (error) {
        console.warn("Vision progress callback failed.", error);
      }
      return;
    }

    if (message.type === "result") {
      settleVisionRequest(message.requestId, ({ resolve }) => {
        resolve({
          requestId: message.requestId,
          ...message.result,
        });
      });
      return;
    }

    if (message.type === "error") {
      settleVisionRequest(message.requestId, ({ reject }) => {
        reject(new Error(message.error || "视觉主体分析失败"));
      });
    }
  });

  visionWorker.addEventListener("error", (event) => {
    resetVisionWorker(new Error(event.message || "视觉分析 Worker 运行失败"));
  });

  visionWorker.addEventListener("messageerror", () => {
    resetVisionWorker(new Error("视觉分析 Worker 返回了无法读取的数据"));
  });

  return visionWorker;
}

/**
 * Return a stable cache key for an imported asset or visual timeline segment.
 * Source URL is included so replacing media invalidates stale AI data. Dimensions
 * are intentionally excluded because they are populated asynchronously after import.
 */
export function getVisionKey(segment) {
  if (!segment) {
    return "";
  }

  const identity = segment.assetId ?? segment.id ?? segment.src ?? segment.name ?? "visual";
  const source = segment.src ?? "";
  return `${identity}::${source}`;
}

/**
 * Analyze an image Blob in a lazily-created WASM worker.
 *
 * Stable call form:
 *   analyzeVisualSubject({ blob, includeMatting, threshold, preferredLabels, onProgress, signal })
 */
export function analyzeVisualSubject(input, legacyOptions = {}) {
  const options = input instanceof Blob ? { ...legacyOptions, blob: input } : input ?? {};
  const {
    blob,
    includeMatting = options.removeBackground ?? false,
    threshold = 0.35,
    preferredLabels = ["person"],
    onProgress,
    signal,
  } = options;

  if (!(blob instanceof Blob) || blob.size <= 0) {
    return Promise.reject(new TypeError("analyzeVisualSubject 需要非空图片 Blob。"));
  }
  if (blob.type && !blob.type.startsWith("image/")) {
    return Promise.reject(new TypeError("请先用 captureVisualFrame 把视频转换成图片 Blob。"));
  }

  try {
    throwIfAborted(signal);
  } catch (error) {
    return Promise.reject(error);
  }

  const worker = getVisionWorker();
  if (!worker) {
    return Promise.reject(new Error("当前浏览器不支持 Worker 视觉分析。"));
  }

  const requestId = createRequestId();
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      if (!pendingVisionRequests.has(requestId)) {
        return;
      }
      worker.postMessage({ type: "cancel", requestId });
      settleVisionRequest(requestId, (request) => request.reject(createAbortError()));
    };

    pendingVisionRequests.set(requestId, {
      resolve,
      reject,
      onProgress,
      signal,
      handleAbort,
    });
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      onProgress?.({ progress: 0, phase: "准备视觉分析 Worker" });
      worker.postMessage({
        type: "analyze",
        requestId,
        imageBlob: blob,
        removeBackground: Boolean(includeMatting),
        threshold: Math.max(0.01, Math.min(0.99, Number(threshold) || 0.35)),
        preferredLabels: Array.isArray(preferredLabels) ? preferredLabels : ["person"],
      });
    } catch (error) {
      settleVisionRequest(requestId, (request) => request.reject(error));
    }
  });
}

function isVideoElement(value) {
  return Boolean(value && String(value.tagName ?? "").toUpperCase() === "VIDEO");
}

function isImageElement(value) {
  return Boolean(value && String(value.tagName ?? "").toUpperCase() === "IMG");
}

function isCanvas(value) {
  const tagName = String(value?.tagName ?? "").toUpperCase();
  return tagName === "CANVAS" || (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas);
}

function waitForEvent(target, eventName, errorName = "error", signal = null) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, handleSuccess);
      target.removeEventListener(errorName, handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleSuccess = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("无法读取视觉素材。"));
    };
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    target.addEventListener(eventName, handleSuccess, { once: true });
    target.addEventListener(errorName, handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function ensureVideoReady(video, signal) {
  if (video.readyState < 1) {
    await waitForEvent(video, "loadedmetadata", "error", signal);
  }
  if (video.readyState < 2) {
    await waitForEvent(video, "loadeddata", "error", signal);
  }
}

async function seekVideo(video, requestedTime, signal) {
  await ensureVideoReady(video, signal);
  if (!Number.isFinite(requestedTime)) {
    return;
  }

  const duration = Number.isFinite(video.duration) ? video.duration : requestedTime;
  const time = Math.max(0, Math.min(requestedTime, Math.max(0, duration - 0.001)));
  if (Math.abs(video.currentTime - time) <= 0.01) {
    return;
  }

  const seeked = waitForEvent(video, "seeked", "error", signal);
  video.currentTime = time;
  await seeked;
}

function getVisualDimensions(source) {
  const width = Number(
    source?.videoWidth ??
      source?.naturalWidth ??
      source?.displayWidth ??
      source?.width,
  );
  const height = Number(
    source?.videoHeight ??
      source?.naturalHeight ??
      source?.displayHeight ??
      source?.height,
  );
  return {
    width: Number.isFinite(width) ? Math.max(0, width) : 0,
    height: Number.isFinite(height) ? Math.max(0, height) : 0,
  };
}

function getCaptureDimensions(sourceSize, options) {
  const maximumDimension = Math.max(1, Number(options.maxDimension) || 768);
  const maximumWidth = Math.max(1, Number(options.maxWidth ?? options.width) || maximumDimension);
  const maximumHeight = Math.max(1, Number(options.maxHeight ?? options.height) || maximumDimension);
  const scale = Math.min(
    maximumDimension / Math.max(sourceSize.width, sourceSize.height),
    maximumWidth / sourceSize.width,
    maximumHeight / sourceSize.height,
  );
  const boundedScale = options.allowUpscale ? scale : Math.min(1, scale);
  return {
    width: Math.max(1, Math.round(sourceSize.width * boundedScale)),
    height: Math.max(1, Math.round(sourceSize.height * boundedScale)),
  };
}

function makeCaptureCanvas(width, height) {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  throw new Error("当前环境不支持 Canvas，无法截取视觉帧。");
}

function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type, quality });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("视觉帧编码失败。"));
        }
      },
      type,
      quality,
    );
  });
}

async function loadImageSource(source, signal) {
  if (isImageElement(source)) {
    if (!source.complete || !source.naturalWidth) {
      await waitForEvent(source, "load", "error", signal);
    }
    return { visual: source, cleanup: () => {} };
  }

  if (isCanvas(source) || (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)) {
    return { visual: source, cleanup: () => {} };
  }

  if (source instanceof Blob && typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(source);
    return { visual: bitmap, cleanup: () => bitmap.close?.() };
  }

  if (typeof Image === "undefined") {
    throw new Error("当前环境无法解码图片。");
  }

  const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
  const image = new Image();
  image.crossOrigin = "anonymous";
  const loaded = waitForEvent(image, "load", "error", signal);
  image.src = objectUrl || String(source ?? "");
  try {
    await loaded;
    return {
      visual: image,
      cleanup: () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function loadVideoSource(source, time, signal) {
  if (isVideoElement(source)) {
    const originalTime = source.currentTime;
    const wasPlaying = !source.paused;
    if (Number.isFinite(time)) {
      source.pause();
    }
    try {
      await seekVideo(source, time, signal);
    } catch (error) {
      if (wasPlaying) {
        source.play().catch(() => {});
      }
      throw error;
    }
    return {
      visual: source,
      cleanup: () => {
        if (Number.isFinite(time) && Math.abs(source.currentTime - originalTime) > 0.01) {
          if (wasPlaying) {
            source.addEventListener("seeked", () => source.play().catch(() => {}), { once: true });
          }
          source.currentTime = originalTime;
        } else if (wasPlaying && source.paused) {
          source.play().catch(() => {});
        }
      },
    };
  }

  if (typeof document === "undefined") {
    throw new Error("当前环境无法解码视频。");
  }

  const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl || String(source ?? "");
  try {
    await seekVideo(video, Number.isFinite(time) ? time : 0, signal);
    return {
      visual: video,
      cleanup: () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Capture an image/video source as a bounded image Blob suitable for analyzeVisualSubject.
 * Stable call form: captureVisualFrame({ src, type, videoElement, maxDimension, time }).
 */
export async function captureVisualFrame(input, legacyOptions = {}) {
  const options =
    input && typeof input === "object" && !(input instanceof Blob) &&
    ("src" in input || "videoElement" in input || "maxDimension" in input)
      ? input
      : { ...legacyOptions, src: input };
  const {
    src,
    videoElement,
    type = "",
    time,
    signal,
    outputType = options.mimeType ?? "image/png",
    quality = 0.92,
  } = options;
  const source = videoElement ?? src;
  if (!source) {
    throw new TypeError("captureVisualFrame 需要 src 或 videoElement。");
  }
  throwIfAborted(signal);

  const isVideo =
    Boolean(videoElement) ||
    isVideoElement(source) ||
    String(type).toLowerCase() === "video" ||
    String(type).toLowerCase().startsWith("video/") ||
    (source instanceof Blob && source.type.startsWith("video/"));
  const loaded = isVideo
    ? await loadVideoSource(source, Number(time), signal)
    : await loadImageSource(source, signal);

  try {
    throwIfAborted(signal);
    const sourceSize = getVisualDimensions(loaded.visual);
    if (!sourceSize.width || !sourceSize.height) {
      throw new Error("视觉素材尺寸无效。");
    }

    const targetSize = getCaptureDimensions(sourceSize, options);
    const canvas = makeCaptureCanvas(targetSize.width, targetSize.height);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("无法创建视觉帧画布。");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (String(outputType).toLowerCase() === "image/jpeg") {
      context.fillStyle = options.backgroundColor ?? "#000000";
      context.fillRect(0, 0, targetSize.width, targetSize.height);
    }
    context.drawImage(loaded.visual, 0, 0, targetSize.width, targetSize.height);
    throwIfAborted(signal);
    return await canvasToBlob(canvas, outputType, Math.max(0, Math.min(1, Number(quality) || 0.92)));
  } finally {
    loaded.cleanup();
  }
}

const DEFAULT_VIDEO_VISION_FPS = 2;
const DEFAULT_VIDEO_VISION_MAX_SAMPLES = 180;

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

/**
 * Build a bounded set of timestamps that spans the complete video, including
 * both its first and final decodable frames.
 */
export function getVideoVisionSampleTimes(duration, options = {}) {
  const durationNumber = Number(duration);
  const safeDuration = Number.isFinite(durationNumber) ? Math.max(0, durationNumber) : 0;
  if (!safeDuration) {
    return [0];
  }

  const fps = clampNumber(options.fps, 0.1, 8, DEFAULT_VIDEO_VISION_FPS);
  const maxSamples = Math.max(
    2,
    Math.round(
      clampNumber(
        options.maxSamples,
        2,
        600,
        DEFAULT_VIDEO_VISION_MAX_SAMPLES,
      ),
    ),
  );
  const targetCount = Math.ceil(safeDuration * fps) + 1;
  const sampleCount = Math.max(2, Math.min(maxSamples, targetCount));
  const finalTime = Math.max(0, safeDuration - Math.min(0.04, safeDuration / 2));

  return Array.from({ length: sampleCount }, (_, index) =>
    index === sampleCount - 1
      ? finalTime
      : (index / Math.max(1, sampleCount - 1)) * finalTime,
  );
}

function readBoxValue(box, lowerKey, camelKey) {
  const value = Number(box?.[lowerKey] ?? box?.[camelKey]);
  return Number.isFinite(value) ? value : 0;
}

function getSubjectCenter(subject) {
  if (!subject?.box) {
    return null;
  }
  const xmin = readBoxValue(subject.box, "xmin", "xMin");
  const ymin = readBoxValue(subject.box, "ymin", "yMin");
  const xmax = readBoxValue(subject.box, "xmax", "xMax");
  const ymax = readBoxValue(subject.box, "ymax", "yMax");
  return {
    xmin,
    ymin,
    xmax,
    ymax,
    centerX: (xmin + xmax) / 2,
    centerY: (ymin + ymax) / 2,
  };
}

function interpolateSubject(previous, next, mix) {
  if (!previous?.box) {
    return next ?? null;
  }
  if (!next?.box) {
    return previous;
  }
  if (String(previous.label ?? "") !== String(next.label ?? "")) {
    return mix < 0.5 ? previous : next;
  }

  const previousBox = getSubjectCenter(previous);
  const nextBox = getSubjectCenter(next);
  const centerDistance = Math.hypot(
    previousBox.centerX - nextBox.centerX,
    previousBox.centerY - nextBox.centerY,
  );
  if (centerDistance > 0.48) {
    return mix < 0.5 ? previous : next;
  }

  const lerp = (start, end) => start + (end - start) * mix;
  return {
    ...(mix < 0.5 ? previous : next),
    score: lerp(Number(previous.score) || 0, Number(next.score) || 0),
    box: {
      xmin: lerp(previousBox.xmin, nextBox.xmin),
      ymin: lerp(previousBox.ymin, nextBox.ymin),
      xmax: lerp(previousBox.xmax, nextBox.xmax),
      ymax: lerp(previousBox.ymax, nextBox.ymax),
    },
  };
}

function getTemporalSampleRange(samples, time) {
  if (samples.length <= 1) {
    return { previous: samples[0] ?? null, next: samples[0] ?? null, mix: 0 };
  }

  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if ((Number(samples[middle]?.time) || 0) <= time) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const previous = samples[Math.max(0, high)] ?? samples[0];
  const next = samples[Math.min(samples.length - 1, low)] ?? samples.at(-1);
  const span = Math.max(0, (Number(next?.time) || 0) - (Number(previous?.time) || 0));
  const mix = span > 0 ? Math.max(0, Math.min(1, (time - previous.time) / span)) : 0;
  return { previous, next, mix };
}

/** Resolve an image analysis or a full-video temporal analysis at source time. */
export function resolveVisionAnalysisAtTime(analysis, requestedTime = 0) {
  const samples = Array.isArray(analysis?.samples) ? analysis.samples : [];
  if (analysis?.kind !== "video-timeline" || !samples.length) {
    return analysis ?? null;
  }

  const duration = Math.max(0, Number(analysis.duration) || 0);
  let time = Math.max(0, Number(requestedTime) || 0);
  if (duration > 0) {
    time = Math.min(time, duration);
  }

  const { previous, next, mix } = getTemporalSampleRange(samples, time);
  const nearest = mix < 0.5 ? previous : next;
  if (!nearest) {
    return analysis;
  }

  return {
    ...analysis,
    ...nearest,
    sourceSize: nearest.sourceSize ?? analysis.sourceSize,
    subject: interpolateSubject(previous?.subject, next?.subject, mix),
    temporal: {
      time,
      previousTime: Number(previous?.time) || 0,
      nextTime: Number(next?.time) || 0,
      mix,
      sampleCount: samples.length,
    },
  };
}

/**
 * Analyze a complete video into a time-indexed YOLOS + MODNet track. The
 * models stay resident in the worker for the batch; frames are captured and
 * submitted sequentially so long clips do not queue all source images in RAM.
 */
export async function analyzeVideoVisualTrack(options = {}) {
  const {
    src: requestedSource,
    blob,
    duration: requestedDuration,
    includeMatting = true,
    fps = DEFAULT_VIDEO_VISION_FPS,
    maxSamples = DEFAULT_VIDEO_VISION_MAX_SAMPLES,
    maxDimension = 512,
    threshold = 0.32,
    preferredLabels = ["person", "cat", "dog", "car", "bottle", "chair"],
    signal,
    onProgress,
  } = options;
  const source = blob ?? requestedSource;
  if (!source) {
    throw new TypeError("analyzeVideoVisualTrack 需要视频 src 或 Blob。");
  }

  throwIfAborted(signal);
  onProgress?.({ progress: 1, phase: "读取全视频元数据" });
  const loaded = await loadVideoSource(source, 0, signal);

  try {
    const video = loaded.visual;
    const sourceSize = getVisualDimensions(video);
    if (!sourceSize.width || !sourceSize.height) {
      throw new Error("视频尺寸无效，无法进行全片视觉分析。");
    }

    const rawSourceDuration = Number(video.duration);
    const rawRequestedDuration = Number(requestedDuration);
    const sourceDuration = Number.isFinite(rawSourceDuration)
      ? Math.max(0, rawSourceDuration)
      : 0;
    const requestedDurationValue = Number.isFinite(rawRequestedDuration)
      ? Math.max(0, rawRequestedDuration)
      : 0;
    const duration = Math.max(
      0.05,
      Math.min(
        sourceDuration || requestedDurationValue || 0.05,
        requestedDurationValue > 0 ? requestedDurationValue : sourceDuration || 0.05,
      ),
    );
    const sampleTimes = getVideoVisionSampleTimes(duration, { fps, maxSamples });
    const targetSize = getCaptureDimensions(sourceSize, { maxDimension });
    const canvas = makeCaptureCanvas(targetSize.width, targetSize.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("无法创建全视频视觉分析画布。");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const samples = [];
    for (let index = 0; index < sampleTimes.length; index += 1) {
      throwIfAborted(signal);
      const time = sampleTimes[index];
      onProgress?.({
        progress: Math.max(1, (index / sampleTimes.length) * 100),
        phase: `截取全视频帧 ${index + 1}/${sampleTimes.length}`,
      });
      await seekVideo(video, time, signal);
      context.fillStyle = "#000000";
      context.fillRect(0, 0, targetSize.width, targetSize.height);
      context.drawImage(video, 0, 0, targetSize.width, targetSize.height);
      const frameBlob = await canvasToBlob(canvas, "image/jpeg", 0.9);
      throwIfAborted(signal);

      const result = await analyzeVisualSubject({
        blob: frameBlob,
        includeMatting,
        threshold,
        preferredLabels,
        signal,
        onProgress: ({ progress, phase }) => {
          const overall = ((index + progress / 100) / sampleTimes.length) * 100;
          onProgress?.({
            progress: overall,
            phase: `全视频 ${index + 1}/${sampleTimes.length} · ${phase}`,
          });
        },
      });
      samples.push({ time, ...result });
    }

    const firstSubjectSample = samples.find((sample) => sample.subject) ?? samples[0] ?? null;
    const finalTime = Number(samples.at(-1)?.time) || 0;
    onProgress?.({ progress: 100, phase: "全视频视觉轨道已生成" });
    return {
      kind: "video-timeline",
      duration,
      sourceSize: samples[0]?.sourceSize ?? targetSize,
      samples,
      subject: firstSubjectSample?.subject ?? null,
      detections: firstSubjectSample?.detections ?? [],
      complete: true,
      coverage: {
        start: Number(samples[0]?.time) || 0,
        end: finalTime,
        duration,
        sampleCount: samples.length,
        maxGap: samples.reduce(
          (maximum, sample, index) =>
            index > 0
              ? Math.max(maximum, sample.time - samples[index - 1].time)
              : maximum,
          0,
        ),
      },
      modelIds: samples[0]?.modelIds ?? null,
      modelRevisions: samples[0]?.modelRevisions ?? null,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      resetVisionWorker();
    }
    throw error;
  } finally {
    loaded.cleanup();
  }
}

export function disposeVisionWorker() {
  resetVisionWorker(new Error("视觉分析 Worker 已释放"));
}
