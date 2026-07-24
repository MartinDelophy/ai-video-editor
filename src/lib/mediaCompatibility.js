const COMPATIBLE_CONTAINER_EXTENSIONS = new Set(["mkv", "mka"]);
const KNOWN_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const KNOWN_VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "mkv"]);
const KNOWN_AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "mka", "ac3"]);

export const MEDIA_BACKENDS = Object.freeze({
  NATIVE: "native",
  WEBCODECS: "webcodecs",
  LIBAV: "libav",
  FFMPEG: "ffmpeg",
});

export function getMediaFileExtension(fileOrName) {
  const name = typeof fileOrName === "string" ? fileOrName : fileOrName?.name;
  return (
    String(name || "")
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || ""
  );
}

export function getMediaFileKind(file) {
  const extension = getMediaFileExtension(file);
  if (extension === "mka" || extension === "ac3") return "audio";
  if (extension === "mkv") return "video";
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (KNOWN_IMAGE_EXTENSIONS.has(extension)) return "image";
  if (KNOWN_VIDEO_EXTENSIONS.has(extension)) return "video";
  if (KNOWN_AUDIO_EXTENSIONS.has(extension)) return "audio";
  return "";
}

export function isSupportedMediaFile(file) {
  return Boolean(getMediaFileKind(file));
}

export function isLibavCompatibilityEnabled(env = import.meta.env) {
  return env?.VITE_MEDIA_COMPATIBILITY_FALLBACK !== "false";
}

export function shouldProbeWithLibav(file, options = {}) {
  if (!isLibavCompatibilityEnabled(options.env)) return false;
  if (options.nativeMetadataError)
    return getMediaFileKind(file) === "video" || getMediaFileKind(file) === "audio";
  return COMPATIBLE_CONTAINER_EXTENSIONS.has(getMediaFileExtension(file));
}

export function selectMediaBackends({
  nativeReadable = false,
  container = "",
  videoCodec = "",
  audioCodec = "",
  webCodecsVideoSupported = false,
  webCodecsAudioSupported = false,
  libavAudioSupported = false,
  libavEnabled = true,
} = {}) {
  const normalizedContainer = String(container).toLowerCase();
  const normalizedVideo = String(videoCodec).toLowerCase();
  const normalizedAudio = String(audioCodec).toLowerCase();
  const matroska = normalizedContainer.includes("matroska") || normalizedContainer === "mkv";
  const audioNeedsFallback = Boolean(normalizedAudio) && !webCodecsAudioSupported;
  const videoNeedsFallback = Boolean(normalizedVideo) && !webCodecsVideoSupported;

  if (nativeReadable && !matroska) {
    return {
      probe: MEDIA_BACKENDS.NATIVE,
      video: MEDIA_BACKENDS.NATIVE,
      audio: MEDIA_BACKENDS.NATIVE,
      needsNormalization: false,
    };
  }

  return {
    probe: libavEnabled ? MEDIA_BACKENDS.LIBAV : MEDIA_BACKENDS.FFMPEG,
    video: videoNeedsFallback ? MEDIA_BACKENDS.FFMPEG : MEDIA_BACKENDS.WEBCODECS,
    audio: audioNeedsFallback
      ? libavAudioSupported
        ? MEDIA_BACKENDS.LIBAV
        : MEDIA_BACKENDS.FFMPEG
      : MEDIA_BACKENDS.WEBCODECS,
    needsNormalization: matroska || videoNeedsFallback || audioNeedsFallback,
  };
}

export function emitMediaBackendDiagnostic(detail) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent("timeline-studio:media-backend", { detail }));
}

export async function probeMediaCompatibility(file, options = {}) {
  if (!shouldProbeWithLibav(file, options)) return null;
  emitMediaBackendDiagnostic({
    phase: "probing",
    backend: MEDIA_BACKENDS.LIBAV,
    name: file?.name || "",
  });
  try {
    const { probeAndDecodeAudioWithLibavWorker, probeWithLibavWorker } =
      await import("./libavCompatibilityClient.js");
    const result = options.decodeAudio
      ? await probeAndDecodeAudioWithLibavWorker(file, options)
      : await probeWithLibavWorker(file, options);
    emitMediaBackendDiagnostic({
      phase: "ready",
      backend: MEDIA_BACKENDS.LIBAV,
      name: file?.name || "",
      result,
    });
    return result;
  } catch (error) {
    emitMediaBackendDiagnostic({
      phase: "failed",
      backend: MEDIA_BACKENDS.LIBAV,
      name: file?.name || "",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
