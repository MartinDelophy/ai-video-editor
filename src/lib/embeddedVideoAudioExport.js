import { concatenateAudioBlobs, decodeWaveform, extractAudioFromVideo } from "./media.js";
import { getVisualSegmentTimeline } from "./timeline.js";

const getAssetKey = (segment) => segment?.assetId || segment?.src || segment?.id || "";

export function createEmbeddedVideoAudioSegments(visualSegments = [], audioAssets = new Map()) {
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
      start: timeline[index]?.start || 0,
      duration: Math.min(segment.duration, sourceDuration / playbackRate),
      sourceStart: audio.offset + sourceStart,
      sourceDuration,
      playbackRate,
    }];
  });
}

export async function prepareEmbeddedVideoAudio(visualSegments = [], onProgress) {
  const candidates = visualSegments.filter((segment) => segment.type === "video" && !segment.sourceAudioDisabled);
  const uniqueAssets = [...new Map(candidates.map((segment) => [getAssetKey(segment), segment])).entries()];
  if (!uniqueAssets.length) return { blob: null, segments: [] };

  const extracted = [];
  for (let index = 0; index < uniqueAssets.length; index += 1) {
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
          ? await fetch(segment.src).then((response) => {
              if (!response.ok) throw new Error(`无法读取视频素材：${response.status}`);
              return response.blob();
            })
          : null;
      if (!sourceBlob) continue;
      const blob = await extractAudioFromVideo(sourceBlob, segment.name || "source-video.mp4");
      const decoded = await decodeWaveform(blob, 24);
      if (decoded.duration > 0) extracted.push({ key, blob, duration: decoded.duration });
    } catch (error) {
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
  return {
    blob: await concatenateAudioBlobs(extracted.map((item) => item.blob)),
    segments: createEmbeddedVideoAudioSegments(visualSegments, audioAssets),
  };
}
