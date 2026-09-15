import { concatenateAudioBlobs, decodeWaveform, extractAudioFromVideo } from "./media.js";
import { isExportAbortError, throwIfExportAborted } from "./exportCancellation.js";
import { getVisualSegmentTimeline } from "./timeline.js";

const getAssetKey = (segment) => segment?.assetId || segment?.src || segment?.id || "";

export function createEmbeddedVideoAudioSegments(visualSegments = [], audioAssets = new Map(), { preserveTimelineStarts = false } = {}) {
  const timeline = getVisualSegmentTimeline(visualSegments);
  return visualSegments.flatMap((segment, index) => {
    if (segment.type !== "video" || segment.sourceAudioDisabled) return [];
    const audio = audioAssets.get(getAssetKey(segment));
    if (!audio) return [];
    const playbackRate = Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1));
    const sourceStart = Math.max(0, Number(segment.sourceStart) || 0);
    const requestedSourceDuration = Math.max(0, Number(segment.sourceDuration) || segment.duration * playbackRate);
    const availableSourceDuration = Math.max(0, audio.duration - sourceStart);
    const sourceDuration = Math.min(requestedSourceDuration || availableSourceDuration, availableSourceDuration);
    if (!(sourceDuration > 0)) return [];
    return [{
      id: segment.id,
      assetId: segment.assetId,
      start: preserveTimelineStarts ? Math.max(0, Number(segment.start) || 0) : timeline[index]?.start || 0,
      duration: Math.min(segment.duration, sourceDuration / playbackRate),
      sourceStart: audio.offset + sourceStart,
      sourceDuration,
      playbackRate,
      speedCurve: segment.speedCurve,
    }];
  });
}

export async function prepareEmbeddedVideoAudio(visualSegments = [], onProgress, signal, options = {}) {
  const { strict = false, range, preserveTimelineStarts = false } = options;
  throwIfExportAborted(signal);
  const timeline = strict && range && !preserveTimelineStarts ? getVisualSegmentTimeline(visualSegments) : null;
  const candidates = visualSegments.filter((segment, index) => {
    if (segment.type !== "video" || segment.sourceAudioDisabled) return false;
    if (!strict || !range) return true;
    const start = preserveTimelineStarts ? Math.max(0, Number(segment.start) || 0) : timeline[index]?.start || 0;
    return start < range.end && start + segment.duration > range.start;
  });
  const uniqueAssets = [...new Map(candidates.map((segment) => [getAssetKey(segment), segment])).entries()];
  if (!uniqueAssets.length) return { blob: null, segments: [] };

  const extracted = [];
  for (let index = 0; index < uniqueAssets.length; index += 1) {
    throwIfExportAborted(signal);
    const [key, segment] = uniqueAssets[index];
    onProgress?.({
      progress: 2 + Math.round((index / uniqueAssets.length) * 3),
      phaseKey: "exportEmbeddedAudio",
      phaseParams: { current: index + 1, total: uniqueAssets.length },
    });
    try {
      const sourceBlob = segment.blob instanceof Blob
        ? segment.blob
        : segment.src
          ? await fetch(segment.src, { signal }).then((response) => {
              if (!response.ok) throw new Error(`无法读取视频素材：${response.status}`);
              return response.blob();
            })
          : null;
      if (!sourceBlob) {
        if (strict) throw new Error("missing_video_media");
        continue;
      }
      if (strict && !(segment.compatibilityAudioBlob instanceof Blob)) {
        // Container metadata is parsed in JavaScript; no WASM or decoder is
        // needed to distinguish a truly silent file from extraction failure.
        const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
        const input = new Input({ source: new BlobSource(sourceBlob), formats: ALL_FORMATS });
        const cancel = () => input.dispose();
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          const tracks = await input.getAudioTracks();
          throwIfExportAborted(signal);
          if (!tracks.length) continue;
        } finally {
          signal?.removeEventListener("abort", cancel);
          input.dispose();
        }
      }
      const blob = segment.compatibilityAudioBlob instanceof Blob
        ? segment.compatibilityAudioBlob
        : await extractAudioFromVideo(sourceBlob, segment.name || "source-video.mp4");
      throwIfExportAborted(signal);
      const decoded = await decodeWaveform(blob, 24);
      throwIfExportAborted(signal);
      if (decoded.duration > 0) extracted.push({ key, blob, duration: decoded.duration });
      else if (strict) throw new Error("empty_video_audio");
    } catch (error) {
      throwIfExportAborted(signal);
      if (isExportAbortError(error)) throw error;
      if (strict) throw Object.assign(new Error("ANNA_SOURCE_AUDIO_UNAVAILABLE", { cause: error }), { code: "ANNA_SOURCE_AUDIO_UNAVAILABLE" });
      console.warn("Embedded video audio extraction skipped", segment.name || segment.id, error);
    }
  }
  if (!extracted.length) return { blob: null, segments: [] };

  let offset = 0;
  const audioAssets = new Map(extracted.map((item) => {
    const mapped = [item.key, { offset, duration: item.duration }];
    offset += item.duration;
    return mapped;
  }));
  throwIfExportAborted(signal);
  const blob = await concatenateAudioBlobs(extracted.map((item) => item.blob));
  throwIfExportAborted(signal);
  return {
    blob,
    segments: createEmbeddedVideoAudioSegments(visualSegments, audioAssets, options),
  };
}
