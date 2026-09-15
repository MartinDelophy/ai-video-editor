import { getVisualSegmentTimeline } from "./timeline.js";
import { getVisualPlaybackRateAtTime, getVisualSourceTime, normalizeVisualPlaybackRate } from "./visualEffects.js";

function resolveLinkedAssetId(visualSegments, sourceAudioAssetId) {
  if (sourceAudioAssetId) return sourceAudioAssetId;
  const assetIds = Array.from(new Set(
    visualSegments
      .filter((segment) => segment.type === "video" && segment.assetId)
      .map((segment) => segment.assetId),
  ));
  return assetIds.length === 1 ? assetIds[0] : "";
}

export function getSourceAudioAssetId(source = {}) {
  return source.assetId || source.id || "";
}

export function attachSourceAudioOffset(visualSegments = [], source = {}, sourceAudioOffset = 0) {
  const assetId = getSourceAudioAssetId(source);
  const clipId = source.id || "";
  const offset = Math.max(0, Number(sourceAudioOffset) || 0);
  if (!assetId && !clipId) return visualSegments;
  const hasExactClipTarget = Boolean(clipId && visualSegments.some((segment) => (
    segment.type === "video" && segment.id === clipId
  )));
  return visualSegments.map((segment) => {
    if (segment.type !== "video") return segment;
    const matchesExactClip = hasExactClipTarget && segment.id === clipId;
    const matchesAssetFallback = !hasExactClipTarget && Boolean(assetId && segment.assetId === assetId);
    const matchesUnboundClip = !hasExactClipTarget && Boolean(clipId && !segment.assetId && segment.id === clipId);
    return matchesExactClip || matchesAssetFallback || matchesUnboundClip
      ? { ...segment, sourceAudioOffset: offset, sourceAudioUnmapped: false }
      : segment;
  });
}

export function getLinkedSourceAudioSegments(visualSegments = [], sourceAudioAssetId = "", sourceAudioDuration = 0) {
  const hasMappedOffsets = visualSegments.some((segment) => segment.type === "video" && Number.isFinite(segment.sourceAudioOffset));
  const linkedAssetId = resolveLinkedAssetId(visualSegments, sourceAudioAssetId);
  if (!hasMappedOffsets && !linkedAssetId) return [];
  const timeline = getVisualSegmentTimeline(visualSegments);
  const maximumSourceTime = Math.max(0, Number(sourceAudioDuration) || 0);
  return visualSegments.flatMap((segment, index) => {
    const hasSegmentMapping = Number.isFinite(segment.sourceAudioOffset);
    const matchesLegacyAssetMapping = !hasMappedOffsets && segment.assetId === linkedAssetId;
    if (segment.type !== "video" || segment.sourceAudioDisabled || segment.sourceAudioUnmapped || (!hasSegmentMapping && !matchesLegacyAssetMapping)) return [];
    const range = timeline[index];
    const playbackRate = normalizeVisualPlaybackRate(segment.playbackRate);
    const sourceStart = Math.max(0, Number(segment.sourceAudioOffset) || 0) + Math.max(0, Number(segment.sourceStart) || 0);
    const requestedSourceDuration = Math.max(0, Number(segment.sourceDuration) || segment.duration * playbackRate);
    const sourceDuration = maximumSourceTime
      ? Math.max(0, Math.min(requestedSourceDuration, maximumSourceTime - sourceStart))
      : requestedSourceDuration;
    if (!range || sourceDuration <= 0) return [];
    const timelineOffset = Number.isFinite(Number(segment.sourceAudioTimelineOffset))
      ? Number(segment.sourceAudioTimelineOffset)
      : 0;
    return [{
      id: segment.id,
      assetId: segment.assetId || linkedAssetId,
      start: Math.max(0, range.start + timelineOffset),
      duration: Math.min(range.duration, sourceDuration / playbackRate),
      sourceStart,
      sourceDuration,
      playbackRate,
      speedCurve: segment.speedCurve,
    }];
  });
}

export function moveLinkedSourceAudioSegment(visualSegments = [], segmentId = "", timelineStart = 0) {
  const index = visualSegments.findIndex((segment) => segment.type === "video" && segment.id === segmentId);
  if (index < 0) return visualSegments;
  const range = getVisualSegmentTimeline(visualSegments)[index];
  if (!range) return visualSegments;
  const offset = Math.max(0, Number(timelineStart) || 0) - range.start;
  return visualSegments.map((segment, position) => (
    position === index ? { ...segment, sourceAudioTimelineOffset: offset } : segment
  ));
}

export function getLinkedSourceAudioState(linkedSegments = [], timelineTime = 0) {
  const time = Math.max(0, Number(timelineTime) || 0);
  const segment = linkedSegments.find((item) => time >= item.start && time < item.start + item.duration);
  if (!segment) return { active: false, sourceTime: 0, playbackRate: 1, segment: null };
  const localTime = Math.max(0, time - segment.start);
  return {
    active: true,
    sourceTime: getVisualSourceTime(segment, localTime),
    playbackRate: getVisualPlaybackRateAtTime(segment, localTime),
    segment,
  };
}

export function getLinkedSourceAudioEnd(linkedSegments = []) {
  return linkedSegments.reduce((end, segment) => Math.max(end, segment.start + segment.duration), 0);
}

export function shouldMuteEmbeddedVideoAudio(segment, { sourceAudioBlob = null, sourceAudioAssetId = "", sourceAudioLinked = true, linkedSegments = [] } = {}) {
  if (!segment || segment.type !== "video" || segment.sourceAudioDisabled) return true;
  if (segment.sourceAudioUnmapped) return false;
  if (!sourceAudioBlob) return false;
  return Number.isFinite(segment.sourceAudioOffset) ||
    Boolean(!sourceAudioLinked && sourceAudioAssetId && segment.assetId === sourceAudioAssetId) ||
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
