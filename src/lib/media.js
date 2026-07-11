import {
  AUDIO_RECORDING_FORMATS,
  EXPORT_RECORDING_FORMATS,
  FFMPEG_CLASS_WORKER_URL,
  FFMPEG_CORE_BASE_URL,
} from "../config/editor.js";
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
} from "./captionLayout.js";
import { resolveVisionAnalysisAtTime } from "./vision.js";
import { getCaptionAvoidancePlacement, getSmartCropRect } from "./visualGeometry.js";

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

const VIDEO_TRACK_FRAME_MAX = 72;
const VIDEO_TRACK_FRAME_HEIGHT = 90;

function getVideoTrackSampleCount(duration, maxFrames = VIDEO_TRACK_FRAME_MAX) {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (!safeDuration) {
    return 0;
  }

  const targetStep =
    safeDuration <= 20
      ? 0.5
      : safeDuration <= 120
        ? 1.25
        : safeDuration <= 600
          ? 3
          : 10;

  return Math.max(1, Math.min(maxFrames, Math.ceil(safeDuration / targetStep)));
}

function seekVideoFrame(video, time) {
  const safeTime = Math.max(0, Math.min(time, Math.max(0, (video.duration || time) - 0.04)));
  if (video.readyState >= 2 && Math.abs(video.currentTime - safeTime) < 0.015) {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };
    const handleSeeked = () => {
      cleanup();
      window.requestAnimationFrame(resolve);
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Video frame seek failed"));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = safeTime;
  });
}

export async function extractVideoTrackFrames(src, options = {}) {
  const {
    duration,
    width,
    height,
    maxFrames = VIDEO_TRACK_FRAME_MAX,
    quality = 0.72,
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
  canvas.width = Math.max(36, Math.min(180, Math.round(canvas.height * aspectRatio)));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    return [];
  }

  try {
    const frames = [];
    video.pause();
    for (let index = 0; index < frameCount; index += 1) {
      const time = ((index + 0.5) / frameCount) * safeDuration;
      await seekVideoFrame(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", quality));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export async function decodeWaveform(blob, barCount = 118) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return { duration: 0, peaks: [] };
  }

  const audioContext = new AudioContextClass();

  try {
    const buffer = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(buffer.slice(0));
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function createTemporalMaskCache(urls, maxEntries = 8) {
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

function loadVideo(src) {
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

function getVisualDimensions(visual) {
  return {
    width: visual.videoWidth || visual.naturalWidth || 1,
    height: visual.videoHeight || visual.naturalHeight || 1,
  };
}

const maskedVisualLayerCache = new WeakMap();

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

function drawFittedVisual(context, visual, canvas, fitMode, filter, vision = null) {
  const { width, height } = canvas;
  const visualSize = getVisualDimensions(visual);
  const smartCropEnabled = Boolean(vision?.options?.smartCrop && vision?.subject?.box);
  const smartCropRect = smartCropEnabled
    ? getSmartCropRect(visualSize, canvas, vision.subject.box, { padding: 0.14 })
    : null;

  let layout;
  if (smartCropRect) {
    layout = {
      sourceSize: visualSize,
      smartCropRect,
      drawRect: { x: 0, y: 0, width, height },
      fitMode: "cover",
      outputSize: { width, height },
    };
  } else {
    const imageRatio = visualSize.width / visualSize.height;
    const canvasRatio = width / height;
    const cover = fitMode === "cover";
    let drawWidth;
    let drawHeight;

    if (cover ? imageRatio > canvasRatio : imageRatio < canvasRatio) {
      drawHeight = height;
      drawWidth = height * imageRatio;
    } else {
      drawWidth = width;
      drawHeight = width / imageRatio;
    }

    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    layout = {
      sourceSize: visualSize,
      smartCropRect: null,
      drawRect: { x, y, width: drawWidth, height: drawHeight },
      fitMode,
      outputSize: { width, height },
    };
  }

  const maskVisual =
    vision?.options?.removeBackground && vision?.maskVisual ? vision.maskVisual : null;
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
    context.drawImage(layer, 0, 0);
  } else {
    context.filter = filter;
    drawVisualUsingLayout(context, visual, layout);
    context.filter = "none";
  }

  return layout;
}

function drawPreviewFrame(context, visual, canvas, options) {
  const {
    subtitle,
    progress = 0,
    fitMode = "contain",
    filter = "none",
    captionsEnabled = true,
    captionPosition = "bottom",
    captionPlacement = null,
    captionSize = 12,
    captionStyle = {},
    captionReferenceSize = null,
    sticker = null,
    stickerImage = null,
    transitionId = "none",
    vision = null,
  } = options;

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#090b0f";
  context.fillRect(0, 0, width, height);
  const visualLayout = drawFittedVisual(context, visual, canvas, fitMode, filter, vision);

  if (captionsEnabled && subtitle) {
    const captionLayout = getCaptionTextLayout({
      context,
      text: subtitle,
      captionSize,
      captionStyle,
      referenceFrame: captionReferenceSize ?? canvas,
      renderFrame: canvas,
    });
    const baseCaptionPlacement = captionPlacement ?? captionPosition;
    const avoidingPlacement =
      vision?.options?.avoidCaptions && vision?.subject?.box
        ? getCaptionAvoidancePlacement(vision.subject.box, {
            sourceSize: visualLayout.sourceSize,
            frameSize: canvas,
            fitMode: visualLayout.fitMode,
            smartCrop: visualLayout.smartCropRect || false,
            basePlacement: baseCaptionPlacement,
            previousPlacement: baseCaptionPlacement,
            captionSize: {
              width: captionLayout.width / Math.max(1, width),
              height: captionLayout.height,
            },
            safeMargin: 0.045,
          })
        : null;
    const effectiveCaptionPlacement = avoidingPlacement || baseCaptionPlacement;
    drawCaptionLayout(
      context,
      captionLayout,
      positionCaptionLayout(captionLayout, effectiveCaptionPlacement),
    );
  }

  if (sticker?.src && stickerImage) {
    const stickerRatio =
      (stickerImage.naturalWidth || stickerImage.width || 1) /
      (stickerImage.naturalHeight || stickerImage.height || 1);
    const maxStickerSize = Math.min(width, height) * 0.22;
    const stickerWidth = stickerRatio >= 1 ? maxStickerSize : maxStickerSize * stickerRatio;
    const stickerHeight = stickerRatio >= 1 ? maxStickerSize / stickerRatio : maxStickerSize;
    context.drawImage(stickerImage, width - stickerWidth - width * 0.1, height * 0.1, stickerWidth, stickerHeight);
  } else if (sticker?.text) {
    context.fillStyle = "rgba(53, 240, 221, 0.92)";
    context.fillRect(width - 246, 54, 172, 54);
    context.fillStyle = "#061515";
    context.font = "800 24px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(sticker.text, width - 160, 90);
  }

  if (transitionId === "fade") {
    const fadeAlpha =
      progress < 0.12 ? 1 - progress / 0.12 : progress > 0.88 ? (progress - 0.88) / 0.12 : 0;
    if (fadeAlpha > 0) {
      context.fillStyle = `rgba(0, 0, 0, ${Math.min(0.72, fadeAlpha * 0.72)})`;
      context.fillRect(0, 0, width, height);
    }
  }

  if (transitionId === "flash" && progress < 0.08) {
    context.fillStyle = `rgba(255, 255, 255, ${0.45 * (1 - progress / 0.08)})`;
    context.fillRect(0, 0, width, height);
  }

  context.fillStyle = "#35f0dd";
  context.fillRect(110, height - 24, (width - 220) * progress, 6);
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

function createVideoRecorder(outputStream) {
  for (const format of EXPORT_RECORDING_FORMATS) {
    if (!MediaRecorder.isTypeSupported(format.mimeType)) {
      continue;
    }

    try {
      return {
        recorder: new MediaRecorder(outputStream, { mimeType: format.mimeType }),
        format,
      };
    } catch (error) {
      console.warn(`MediaRecorder cannot start with ${format.mimeType}`, error);
    }
  }

  return {
    recorder: new MediaRecorder(outputStream),
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
  sourceAudioStart = 0,
  musicBlob,
  musicVolume = 0.35,
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
  transitionId,
  onProgress,
}) {
  if (!window.MediaRecorder) {
    throw new Error("当前浏览器不支持 MediaRecorder，无法导出视频。");
  }

  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  onProgress?.({ progress: 4, phase: "准备导出画面" });
  const exportVisualSegments = visualSegments.some((segment) => segment.src)
    ? visualSegments.filter((segment) => segment.src)
    : [{ id: "export-visual", src: imageSrc, type: visualType, duration }];
  const exportVisualTimeline = getVisualSegmentTimeline(exportVisualSegments);
  const visualItems = await Promise.all(
    exportVisualSegments.map(async (segment) => {
      const visual = segment.type === "video" ? await loadVideo(segment.src) : await loadImage(segment.src);
      if (segment.type === "video") {
        await seekVideoFrame(
          visual,
          Math.max(0, Number(segment.sourceStart) || 0),
        );
      }
      const shouldUseCutout = Boolean(
        segment.type === "image" &&
          segment.vision?.options?.removeBackground &&
          segment.vision?.cutoutUrl,
      );
      const cutoutVisual = shouldUseCutout
        ? await loadImage(segment.vision.cutoutUrl).catch(() => null)
        : null;
      const temporalMaskUrls =
        segment.type === "video" && segment.vision?.options?.removeBackground
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
      return {
        segment,
        visual,
        cutoutVisual,
        temporalMaskCache,
      };
    }),
  );
  const stickerSources = Array.from(
    new Set([
      ...(sticker?.src ? [sticker.src] : []),
      ...stickerSegments.map((segment) => segment.src).filter(Boolean),
    ]),
  );
  const stickerImageEntries = await Promise.all(
    stickerSources.map(async (src) => [src, await loadImage(src).catch(() => null)]),
  );
  const stickerImageMap = new Map(stickerImageEntries.filter(([, image]) => image));
  onProgress?.({ progress: 8, phase: "准备画布与轨道" });
  const canvas = document.createElement("canvas");
  canvas.width = ratio.width;
  canvas.height = ratio.height;
  const context = canvas.getContext("2d");
  const canvasStream = canvas.captureStream(30);

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
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
      fadeIn: Math.max(0, segment.fadeIn || 0),
      fadeOut: Math.max(0, segment.fadeOut || 0),
    })),
    audioBlob && !voiceAudioSegments.length
      ? { blob: audioBlob, volume: voiceVolume, role: "voice", start: 0, fadeIn: 0, fadeOut: 0 }
      : null,
    sourceAudioBlob
      ? { blob: sourceAudioBlob, volume: sourceAudioVolume, role: "source", start: Math.max(0, sourceAudioStart || 0) }
      : null,
    musicBlob ? { blob: musicBlob, volume: musicVolume, role: "music", start: 0 } : null,
  ].filter(Boolean);

  if (audioInputs.length) {
    if (!AudioContextClass) {
      throw new Error("当前浏览器不支持 AudioContext，无法混入音频。");
    }

    onProgress?.({ progress: 12, phase: "解码并混合音频轨" });
    audioContext = new AudioContextClass();
    destination = audioContext.createMediaStreamDestination();
    const decodedInputs = await Promise.all(
      audioInputs.map(async (input) => {
        const audioBuffer = await input.blob.arrayBuffer();
        const decoded = await audioContext.decodeAudioData(audioBuffer.slice(0));
        return { ...input, decoded };
      }),
    );

    decodedDuration = Math.max(0, ...decodedInputs.filter((input) => input.role === "voice").map((input) => input.start + input.decoded.duration));

    decodedInputs.forEach((input) => {
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = input.decoded;
      gain.gain.value = input.volume;
      if (input.fadeIn > 0) {
        gain.gain.setValueAtTime(0, audioContext.currentTime + input.start);
        gain.gain.linearRampToValueAtTime(input.volume, audioContext.currentTime + input.start + input.fadeIn);
      }
      if (input.fadeOut > 0) {
        const fadeStart = audioContext.currentTime + input.start + Math.max(0, input.decoded.duration - input.fadeOut);
        gain.gain.setValueAtTime(input.volume, fadeStart);
        gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + input.start + input.decoded.duration);
      }
      source.connect(gain);
      gain.connect(destination);
      sources.push({
        node: source,
        start: input.start,
      });
    });
  }

  const outputStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(destination ? destination.stream.getAudioTracks() : []),
  ]);
  const { recorder, format: recordingFormat } = createVideoRecorder(outputStream);
  const chunks = [];
  const exportSegments = captionSegments?.length ? captionSegments : createCaptionSegments(text);
  const segments = exportSegments.map((segment) => segment.text);
  const totalDuration = Math.max(
    duration,
    decodedDuration,
    ...sources.map(({ node, start }) => start + (node.buffer?.duration ?? 0)),
    1,
  );
  const captionTargetDuration = decodedDuration || 0;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve();
  });

  onProgress?.({ progress: 16, phase: "开始录制视频流" });
  recorder.start(250);
  const startTime = performance.now();
  let animationFrame = 0;
  let lastProgressUpdate = 0;
  let activeVideoItem = null;
  const getVisualItemAtTime = (elapsed) => {
    const visualIndex = getVisualSegmentIndexAtTime(exportVisualSegments, elapsed);
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
    const maximumTime = Math.max(0, (Number(video.duration) || 0) - 0.001);
    const expectedTime = Math.min(
      maximumTime,
      Math.max(0, Number(visualItem.segment.sourceStart) || 0) + localTime,
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
  const getStickerAtTime = (elapsed) => {
    if (!stickerSegments.length) {
      return sticker;
    }

    for (let index = stickerSegments.length - 1; index >= 0; index -= 1) {
      const segment = stickerSegments[index];
      const start = Math.max(0, segment.start || 0);
      const end = start + Math.max(0, segment.duration || 0);
      if (elapsed >= start && elapsed < end) {
        return segment;
      }
    }

    return null;
  };
  const draw = () => {
    const elapsed = Math.min(totalDuration, (performance.now() - startTime) / 1000);
    const segmentIndex = getSegmentIndexAtTime(exportSegments, elapsed, captionTargetDuration);
    const exportCaption =
      segmentIndex >= 0 && !exportSegments[segmentIndex]?.hidden ? segments[segmentIndex] : "";
    const { item: visualItem, range: visualRange } = getVisualItemAtTime(elapsed);
    const localTime = Math.max(0, elapsed - (visualRange?.start ?? 0));
    const visualSourceTime = syncVideoItem(visualItem, localTime);
    const exportSticker = getStickerAtTime(elapsed);
    const exportVisual = visualItem.cutoutVisual || visualItem.visual;
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
    drawPreviewFrame(context, exportVisual, canvas, {
      subtitle: exportCaption,
      progress: elapsed / totalDuration,
      fitMode,
      filter,
      captionsEnabled,
      captionPosition,
      captionPlacement,
      captionSize,
      captionStyle,
      captionReferenceSize,
      sticker: exportSticker,
      stickerImage: exportSticker?.src ? stickerImageMap.get(exportSticker.src) : null,
      transitionId,
      vision: frameVision,
    });

    if (elapsed === totalDuration || performance.now() - lastProgressUpdate > 180) {
      lastProgressUpdate = performance.now();
      onProgress?.({
        progress: Math.min(92, 16 + Math.round((elapsed / totalDuration) * 76)),
        phase: "录制视频流",
      });
    }

    if (elapsed < totalDuration) {
      animationFrame = requestAnimationFrame(draw);
    }
  };

  draw();
  sources.forEach(({ node, start }) => node.start(start));
  await new Promise((resolve) => {
    window.setTimeout(resolve, totalDuration * 1000);
  });
  cancelAnimationFrame(animationFrame);
  visualItems.forEach((item) => {
    if (item.segment.type === "video") {
      item.visual.pause();
    }
  });
  const finalSegmentIndex = getSegmentIndexAtTime(exportSegments, totalDuration, captionTargetDuration);
  const { item: finalVisualItem, range: finalVisualRange } = getVisualItemAtTime(totalDuration);
  const finalSticker = getStickerAtTime(totalDuration);
  const finalLocalTime = Math.max(0, totalDuration - (finalVisualRange?.start ?? 0));
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
    captionPlacement,
    captionSize,
    captionStyle,
    captionReferenceSize,
    sticker: finalSticker,
    stickerImage: finalSticker?.src ? stickerImageMap.get(finalSticker.src) : null,
    transitionId,
    vision: finalFrameVision,
  });
  recorder.stop();
  onProgress?.({ progress: 94, phase: "封装导出文件" });
  await stopped;
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

  const blobType = recorder.mimeType || recordingFormat.mimeType || "video/webm";

  return {
    blob: new Blob(chunks, { type: blobType }),
    extension: recordingFormat.extension,
    label: recordingFormat.label,
    mimeType: blobType,
    nativeMp4: recordingFormat.extension === "mp4",
  };
}

async function getFfmpeg() {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ffmpeg = new FFmpeg();
      const classWorkerURL = URL.createObjectURL(
        new Blob([`import "${FFMPEG_CLASS_WORKER_URL}";`], { type: "text/javascript" }),
      );
      await ffmpeg.load({
        classWorkerURL,
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
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

export async function transcodeWebmToMp4(webmBlob) {
  return runFfmpegTask(async () => {
    const [{ fetchFile }, ffmpeg] = await Promise.all([import("@ffmpeg/util"), getFfmpeg()]);
    const id = makeId("export");
    const inputName = `${id}.webm`;
    const outputName = `${id}.mp4`;

    await ffmpeg.writeFile(inputName, await fetchFile(webmBlob));
    try {
      await ffmpeg.exec([
        "-i",
        inputName,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "faststart",
        outputName,
      ]);
    } catch (error) {
      await ffmpeg.deleteFile(outputName).catch(() => {});
      await ffmpeg.exec(["-i", inputName, "-movflags", "faststart", outputName]);
    }
    const data = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    return new Blob([data], { type: "video/mp4" });
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
