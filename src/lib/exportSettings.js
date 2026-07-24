export const EXPORT_FORMAT_PROFILES = {
  h264: { container: "MP4", video: "H.264", audio: "AAC", extension: "mp4" },
  "h264-mov": { container: "MOV", video: "H.264", audio: "AAC", extension: "mov" },
  vp9: { container: "WebM", video: "VP9", audio: "Opus", extension: "webm" },
  vp8: { container: "WebM", video: "VP8", audio: "Opus", extension: "webm" },
};

export const EXPORT_SETTINGS_STORAGE_KEY = "timeline-studio-export-settings-v1";
export const DEFAULT_EXPORT_SETTINGS = {
  resolution: "1080",
  frameRate: 30,
  codec: "h264",
  quality: "high",
  pipeline: "auto",
  audio: "mix",
  audioBitsPerSecond: 192_000,
  captions: "burned",
  fileName: "ai-voiceover",
  range: "full",
  rangeStart: 0,
  rangeEnd: 10,
  bitrateMode: "auto",
  customVideoBitsPerSecond: 12_000_000,
  keyFrameInterval: 2,
};

const COMPATIBLE_RECORDING_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function getExportDimensions(ratio, shortEdge) {
  const sourceShortEdge = Math.min(ratio.width, ratio.height);
  const scale = shortEdge / sourceShortEdge;
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  return { width: even(ratio.width * scale), height: even(ratio.height * scale) };
}

export function getExportBitrate(resolution, quality, frameRate) {
  const base = { 720: 5, 1080: 10, 1440: 18, 2160: 38 }[resolution] || 10;
  const qualityScale = { standard: 0.65, high: 1, ultra: 1.45 }[quality] || 1;
  return Math.round(base * qualityScale * (frameRate / 30) * 1_000_000);
}

export function getEffectiveExportBitrate(settings) {
  if (settings.bitrateMode === "custom") {
    return Math.max(1_000_000, Math.min(100_000_000, Number(settings.customVideoBitsPerSecond) || 12_000_000));
  }
  return getExportBitrate(
    Number(settings.resolution) || 1080,
    settings.quality,
    Number(settings.frameRate) || 30,
  );
}

export function getExportRange(settings, timelineDuration) {
  const fullDuration = Math.max(0, Number(timelineDuration) || 0);
  if (settings.range !== "custom") return { start: 0, end: fullDuration, duration: fullDuration };
  const start = Math.max(0, Math.min(fullDuration, Number(settings.rangeStart) || 0));
  const requestedEnd = Number(settings.rangeEnd);
  const end = Math.max(start, Math.min(fullDuration, Number.isFinite(requestedEnd) ? requestedEnd : fullDuration));
  return { start, end, duration: Math.max(0, end - start) };
}

export function getExportContentDuration({
  visualDuration = 0,
  voiceDuration = 0,
  captionDuration = 0,
  sourceAudioDuration = 0,
  musicDuration = 0,
  stickerDuration = 0,
  overlaySegments = [],
} = {}) {
  const overlayDuration = overlaySegments.reduce((end, segment) => Math.max(
    end,
    Number(segment?.end) || ((Number(segment?.start) || 0) + (Number(segment?.duration) || 0)),
  ), 0);
  return Math.max(
    0,
    Number(visualDuration) || 0,
    Number(voiceDuration) || 0,
    Number(captionDuration) || 0,
    Number(sourceAudioDuration) || 0,
    Number(musicDuration) || 0,
    Number(stickerDuration) || 0,
    overlayDuration,
  );
}

export function getExportFormatProfile(codec) {
  return EXPORT_FORMAT_PROFILES[codec] || EXPORT_FORMAT_PROFILES.h264;
}

export function sanitizeExportFileName(value, fallback = "ai-video") {
  const sanitized = String(value ?? "")
    .trim()
    .replace(/\.(?:mp4|mov|webm|srt)$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/[.\s]+$/g, "")
    .slice(0, 96);
  return sanitized || fallback;
}

export function normalizeExportSettings(value = {}) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    resolution: ["720", "1080", "1440", "2160"].includes(String(candidate.resolution))
      ? String(candidate.resolution)
      : DEFAULT_EXPORT_SETTINGS.resolution,
    frameRate: [24, 30, 60].includes(Number(candidate.frameRate))
      ? Number(candidate.frameRate)
      : DEFAULT_EXPORT_SETTINGS.frameRate,
    codec: ["h264", "h264-mov", "vp9", "vp8"].includes(candidate.codec) ? candidate.codec : DEFAULT_EXPORT_SETTINGS.codec,
    quality: ["standard", "high", "ultra"].includes(candidate.quality) ? candidate.quality : DEFAULT_EXPORT_SETTINGS.quality,
    pipeline: ["auto", "deterministic", "compatible"].includes(candidate.pipeline) ? candidate.pipeline : DEFAULT_EXPORT_SETTINGS.pipeline,
    audio: ["mix", "none"].includes(candidate.audio) ? candidate.audio : DEFAULT_EXPORT_SETTINGS.audio,
    audioBitsPerSecond: [128_000, 192_000, 256_000, 320_000].includes(Number(candidate.audioBitsPerSecond))
      ? Number(candidate.audioBitsPerSecond)
      : DEFAULT_EXPORT_SETTINGS.audioBitsPerSecond,
    captions: ["burned", "none", "burned-srt"].includes(candidate.captions)
      ? candidate.captions
      : DEFAULT_EXPORT_SETTINGS.captions,
    fileName: sanitizeExportFileName(candidate.fileName, DEFAULT_EXPORT_SETTINGS.fileName),
    range: candidate.range === "custom" ? "custom" : DEFAULT_EXPORT_SETTINGS.range,
    rangeStart: Math.max(0, Number(candidate.rangeStart) || 0),
    rangeEnd: Number.isFinite(Number(candidate.rangeEnd))
      ? Math.max(0, Number(candidate.rangeEnd))
      : DEFAULT_EXPORT_SETTINGS.rangeEnd,
    bitrateMode: candidate.bitrateMode === "custom" ? "custom" : DEFAULT_EXPORT_SETTINGS.bitrateMode,
    customVideoBitsPerSecond: Math.max(
      1_000_000,
      Math.min(100_000_000, Number(candidate.customVideoBitsPerSecond) || DEFAULT_EXPORT_SETTINGS.customVideoBitsPerSecond),
    ),
    keyFrameInterval: [1, 2, 5].includes(Number(candidate.keyFrameInterval))
      ? Number(candidate.keyFrameInterval)
      : DEFAULT_EXPORT_SETTINGS.keyFrameInterval,
  };
}

export function loadExportSettings(runtime = globalThis) {
  try {
    const stored = runtime?.localStorage?.getItem(EXPORT_SETTINGS_STORAGE_KEY);
    return normalizeExportSettings(stored ? JSON.parse(stored) : DEFAULT_EXPORT_SETTINGS);
  } catch {
    return { ...DEFAULT_EXPORT_SETTINGS };
  }
}

export function saveExportSettings(settings, runtime = globalThis) {
  const normalized = normalizeExportSettings(settings);
  try {
    runtime?.localStorage?.setItem(EXPORT_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Export preferences remain in memory when storage is unavailable.
  }
  return normalized;
}

export function getExportRuntimeCapabilities(runtime = globalThis) {
  return {
    deterministic: typeof runtime?.VideoEncoder === "function",
    compatible: typeof runtime?.MediaRecorder === "function",
  };
}

export function getExportVideoEncoderConfig(settings, ratio) {
  const resolution = Number(settings.resolution) || 1080;
  const frameRate = Number(settings.frameRate) || 30;
  const { width, height } = getExportDimensions(ratio, resolution);
  const longEdge = Math.max(width, height);
  const codec = settings.codec === "vp8"
    ? "vp8"
    : settings.codec === "vp9"
      ? "vp09.00.10.08"
      : longEdge > 2048 || frameRate > 30
        ? longEdge > 2048
          ? "avc1.640034"
          : "avc1.64002A"
        : "avc1.640028";
  return {
    codec,
    width,
    height,
    bitrate: getEffectiveExportBitrate(settings),
    framerate: frameRate,
    hardwareAcceleration: "no-preference",
  };
}

export async function probeExportRuntimeCapabilities(settings, ratio, runtime = globalThis) {
  const baseline = getExportRuntimeCapabilities(runtime);
  let deterministic = baseline.deterministic;
  if (deterministic && typeof runtime.VideoEncoder.isConfigSupported === "function") {
    try {
      const result = await runtime.VideoEncoder.isConfigSupported(getExportVideoEncoderConfig(settings, ratio));
      deterministic = Boolean(result?.supported);
    } catch {
      deterministic = false;
    }
  }
  let compatible = baseline.compatible;
  if (compatible && typeof runtime.MediaRecorder.isTypeSupported === "function") {
    try {
      compatible = COMPATIBLE_RECORDING_MIME_TYPES.some((mimeType) => runtime.MediaRecorder.isTypeSupported(mimeType));
    } catch {
      compatible = false;
    }
  }
  return { deterministic, compatible };
}

export function getExportTechnicalSummary(settings, ratio) {
  const resolution = Number(settings.resolution) || 1080;
  const frameRate = Number(settings.frameRate) || 30;
  const dimensions = getExportDimensions(ratio, resolution);
  const bitrate = getEffectiveExportBitrate(settings);
  const format = getExportFormatProfile(settings.codec);
  return {
    ...dimensions,
    frameRate,
    bitrateMbps: Math.round((bitrate / 1_000_000) * 10) / 10,
    container: format.container,
    video: format.video,
    audio: settings.audio === "none" ? null : format.audio,
    audioBitrateKbps: settings.audio === "none"
      ? null
      : Math.round((Number(settings.audioBitsPerSecond) || 192_000) / 1000),
  };
}

export function getExportEstimate(settings, ratio, duration) {
  const summary = getExportTechnicalSummary(settings, ratio);
  const safeDuration = getExportRange(settings, duration).duration;
  const videoBitsPerSecond = getEffectiveExportBitrate(settings);
  const audioBitsPerSecond = settings.audio === "none"
    ? 0
    : Number(settings.audioBitsPerSecond) || 192_000;
  return {
    duration: safeDuration,
    frameCount: Math.ceil(safeDuration * summary.frameRate),
    estimatedBytes: Math.ceil(((videoBitsPerSecond + audioBitsPerSecond) * safeDuration / 8) * 1.03),
  };
}

export function formatEstimatedFileSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 * 1024 * 1024) return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
  return `${Math.round((value / (1024 * 1024 * 1024)) * 100) / 100} GB`;
}
