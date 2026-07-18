import { getVisualSegmentTimeline } from "./timeline.js";
import { getVisualSourceTime, normalizeVisualPlaybackRate } from "./visualEffects.js";

function resolveLinkedAssetId(visualSegments, sourceAudioAssetId) {
  if (sourceAudioAssetId) return sourceAudioAssetId;
  const assetIds = Array.from(new Set(
    visualSegments
      .filter((segment) => segment.type === "video" && segment.assetId)
      .map((segment) => segment.assetId),
  ));
  return assetIds.length === 1 ? assetIds[0] : "";
}

export function getLinkedSourceAudioSegments(visualSegments = [], sourceAudioAssetId = "", sourceAudioDuration = 0) {
  const hasMappedOffsets = visualSegments.some((segment) => segment.type === "video" && Number.isFinite(segment.sourceAudioOffset));
  const linkedAssetId = resolveLinkedAssetId(visualSegments, sourceAudioAssetId);
  if (!hasMappedOffsets && !linkedAssetId) return [];
  const timeline = getVisualSegmentTimeline(visualSegments);
  const maximumSourceTime = Math.max(0, Number(sourceAudioDuration) || 0);
  return visualSegments.flatMap((segment, index) => {
    if (segment.type !== "video" || segment.sourceAudioDisabled || (!hasMappedOffsets && segment.assetId !== linkedAssetId)) return [];
    const range = timeline[index];
    const playbackRate = normalizeVisualPlaybackRate(segment.playbackRate);
    const sourceStart = Math.max(0, Number(segment.sourceAudioOffset) || 0) + Math.max(0, Number(segment.sourceStart) || 0);
    const requestedSourceDuration = Math.max(0, Number(segment.sourceDuration) || segment.duration * playbackRate);
    const sourceDuration = maximumSourceTime
      ? Math.max(0, Math.min(requestedSourceDuration, maximumSourceTime - sourceStart))
      : requestedSourceDuration;
    if (!range || sourceDuration <= 0) return [];
    return [{
      id: segment.id,
      assetId: segment.assetId || linkedAssetId,
      start: range.start,
      duration: Math.min(range.duration, sourceDuration / playbackRate),
      sourceStart,
      sourceDuration,
      playbackRate,
    }];
  });
}

export function getLinkedSourceAudioState(linkedSegments = [], timelineTime = 0) {
  const time = Math.max(0, Number(timelineTime) || 0);
  const segment = linkedSegments.find((item) => time >= item.start && time < item.start + item.duration);
  if (!segment) return { active: false, sourceTime: 0, playbackRate: 1, segment: null };
  const localTime = Math.max(0, time - segment.start);
  return {
    active: true,
    sourceTime: getVisualSourceTime(segment, localTime),
    playbackRate: normalizeVisualPlaybackRate(segment.playbackRate),
    segment,
  };
}

export function getLinkedSourceAudioEnd(linkedSegments = []) {
  return linkedSegments.reduce((end, segment) => Math.max(end, segment.start + segment.duration), 0);
}

export function shouldMuteEmbeddedVideoAudio(segment, { sourceAudioBlob = null, sourceAudioAssetId = "", linkedSegments = [] } = {}) {
  if (!segment || segment.type !== "video" || segment.sourceAudioDisabled) return true;
  if (!sourceAudioBlob) return false;
  return Number.isFinite(segment.sourceAudioOffset) ||
    Boolean(sourceAudioAssetId && segment.assetId === sourceAudioAssetId) ||
    linkedSegments.some((item) => item.id === segment.id);
}

export function sliceSourceAudioPeaks(peaks = [], segment, sourceAudioDuration = 0) {
  if (!peaks.length || !segment || sourceAudioDuration <= 0) return peaks;
  const startIndex = Math.max(0, Math.floor((segment.sourceStart / sourceAudioDuration) * peaks.length));
  const endIndex = Math.min(
    peaks.length,
    Math.max(startIndex + 1, Math.ceil(((segment.sourceStart + segment.sourceDuration) / sourceAudioDuration) * peaks.length)),
  );
  return peaks.slice(startIndex, endIndex);
}
