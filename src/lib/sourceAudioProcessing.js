import { packTimedSegmentsIntoLanes } from "./timeline.js";

// Route only when the user applies a processed result. Existing lanes stay put.
export function getSourceProcessingLane(audioSegments = [], locks = {}) {
  if (locks.audio) return null;
  let lane = audioSegments.length
    ? packTimedSegmentsIntoLanes(audioSegments, { preferredLaneKey: "lane" }).length
    : 0;
  while (locks[`audio-${lane}`]) lane += 1;
  return lane;
}

export function applyProcessedSourceMedia(segment, patch) {
  if (!(patch?.blob instanceof Blob) || !(patch.processingOriginalBlob instanceof Blob))
    return null;
  return {
    ...segment,
    ...patch,
    id: segment.id,
    start: segment.start,
    duration: segment.duration,
    playbackRate: segment.playbackRate,
    speedCurve: segment.speedCurve,
    volume: segment.volume,
    fadeIn: segment.fadeIn,
    fadeOut: segment.fadeOut,
    spatialEffect: segment.spatialEffect,
    spatialAmount: segment.spatialAmount,
    lane: segment.lane,
    name: segment.name,
    assetId: segment.assetId,
    sourceKind: "video-source",
    sourceVisualSegmentId: segment.sourceVisualSegmentId,
    sourceAudioWasLinked: segment.sourceAudioWasLinked,
  };
}
