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

function drawFittedVisual(context, visual, canvas, fitMode, filter) {
  const { width, height } = canvas;
  const visualSize = getVisualDimensions(visual);
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
  context.filter = filter;
  context.drawImage(visual, x, y, drawWidth, drawHeight);
  context.filter = "none";
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
    sticker = null,
    stickerImage = null,
    transitionId = "none",
  } = options;

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#090b0f";
  context.fillRect(0, 0, width, height);
  drawFittedVisual(context, visual, canvas, fitMode, filter);

  if (captionsEnabled && subtitle) {
    const overlayHeight = Math.max(72, captionSize * 2.25);
    const yMap = {
      top: 48,
      middle: height / 2 - overlayHeight / 2,
      bottom: height - overlayHeight - 42,
    };
    const overlayWidth = width - 192;
    const overlayX = captionPlacement
      ? Math.max(24, Math.min(width - overlayWidth - 24, (width * captionPlacement.x) / 100 - overlayWidth / 2))
      : 96;
    const overlayY = captionPlacement
      ? Math.max(24, Math.min(height - overlayHeight - 24, (height * captionPlacement.y) / 100 - overlayHeight / 2))
      : yMap[captionPosition] ?? yMap.bottom;
    context.fillStyle = "rgba(5, 8, 13, 0.62)";
    context.fillRect(overlayX, overlayY, overlayWidth, overlayHeight);
    context.font = `600 ${captionSize}px Inter, system-ui, sans-serif`;
    context.textAlign = "center";
    context.fillStyle = "#f5fbff";
    context.fillText(subtitle.slice(0, 34), overlayX + overlayWidth / 2, overlayY + overlayHeight * 0.62);
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
  sticker,
  stickerSegments = [],
  transitionId,
  onProgress,
}) {
  if (!window.MediaRecorder) {
    throw new Error("当前浏览器不支持 MediaRecorder，无法导出视频。");
  }

  onProgress?.({ progress: 4, phase: "准备导出画面" });
  const exportVisualSegments = visualSegments.some((segment) => segment.src)
    ? visualSegments.filter((segment) => segment.src)
    : [{ id: "export-visual", src: imageSrc, type: visualType, duration }];
  const exportVisualTimeline = getVisualSegmentTimeline(exportVisualSegments);
  const visualItems = await Promise.all(
    exportVisualSegments.map(async (segment) => ({
      segment,
      visual: segment.type === "video" ? await loadVideo(segment.src) : await loadImage(segment.src),
    })),
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
    audioBlob ? { blob: audioBlob, volume: voiceVolume, role: "voice", start: 0 } : null,
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

    decodedDuration = decodedInputs.find((input) => input.role === "voice")?.decoded.duration ?? 0;

    decodedInputs.forEach((input) => {
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = input.decoded;
      gain.gain.value = input.volume;
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
  const singleVideo =
    visualItems.length === 1 && visualItems[0]?.segment.type === "video"
      ? visualItems[0].visual
      : null;
  if (singleVideo) {
    singleVideo.currentTime = 0;
    singleVideo.loop = totalDuration > (singleVideo.duration || totalDuration);
    await singleVideo.play().catch(() => {});
  }
  const startTime = performance.now();
  let animationFrame = 0;
  let lastProgressUpdate = 0;
  const getVisualItemAtTime = (elapsed) => {
    const visualIndex = getVisualSegmentIndexAtTime(exportVisualSegments, elapsed);
    return {
      item: visualItems[Math.max(0, visualIndex)] ?? visualItems[0],
      range: exportVisualTimeline[Math.max(0, visualIndex)] ?? exportVisualTimeline[0],
    };
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
    if (visualItem?.segment.type === "video" && !singleVideo) {
      const localTime = Math.max(0, elapsed - (visualRange?.start ?? 0));
      const nextVideoTime = Math.min(localTime, visualItem.visual.duration || localTime);
      if (Math.abs(visualItem.visual.currentTime - nextVideoTime) > 0.18) {
        visualItem.visual.currentTime = nextVideoTime;
      }
    }
    const exportSticker = getStickerAtTime(elapsed);
    drawPreviewFrame(context, visualItem.visual, canvas, {
      subtitle: exportCaption,
      progress: elapsed / totalDuration,
      fitMode,
      filter,
      captionsEnabled,
      captionPosition,
      captionPlacement,
      captionSize,
      sticker: exportSticker,
      stickerImage: exportSticker?.src ? stickerImageMap.get(exportSticker.src) : null,
      transitionId,
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
  const { item: finalVisualItem } = getVisualItemAtTime(totalDuration);
  const finalSticker = getStickerAtTime(totalDuration);
  drawPreviewFrame(context, finalVisualItem.visual, canvas, {
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
    sticker: finalSticker,
    stickerImage: finalSticker?.src ? stickerImageMap.get(finalSticker.src) : null,
    transitionId,
  });
  recorder.stop();
  onProgress?.({ progress: 94, phase: "封装导出文件" });
  await stopped;
  canvasStream.getTracks().forEach((track) => track.stop());
  destination?.stream.getTracks().forEach((track) => track.stop());
  await audioContext?.close().catch(() => {});

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
