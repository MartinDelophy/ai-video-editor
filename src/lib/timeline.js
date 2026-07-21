import {
  DEFAULT_STICKER_SEGMENT_SECONDS,
  MAX_CAPTION_SEGMENT_SECONDS,
  MAX_IMAGE_THUMBNAILS,
  MAX_TIMELINE_DURATION_SECONDS,
  MIN_CAPTION_SEGMENT_SECONDS,
  MIN_VISUAL_SEGMENT_SECONDS,
  IMAGE_SEGMENT_SECONDS,
} from "../config/editor.js";

const MIN_TIMED_CAPTION_SECONDS = 0.2;

export function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getImageThumbnailCount(duration) {
  return Math.min(
    MAX_IMAGE_THUMBNAILS,
    Math.max(1, Math.ceil(duration / IMAGE_SEGMENT_SECONDS)),
  );
}

export function getVisualAssetPayload(asset) {
  if (!asset) {
    return {};
  }

  return {
    assetId: asset.assetId ?? asset.id ?? "",
    type: asset.type ?? "image",
    src: asset.src ?? "",
    thumbnail: asset.thumbnail ?? "",
    originalSrc: asset.originalSrc ?? "",
    name: asset.name ?? "",
    meta: asset.meta ?? "",
    blob: asset.blob ?? null,
    width: asset.width ?? asset.naturalWidth ?? 0,
    height: asset.height ?? asset.naturalHeight ?? 0,
    sourceStart: Math.max(0, Number(asset.sourceStart) || 0),
    sourceDuration: Math.max(0, Number(asset.sourceDuration ?? asset.duration) || 0),
    playbackRate: Math.max(0.25, Math.min(4, Number(asset.playbackRate) || 1)),
    trackFrames: Array.isArray(asset.trackFrames) ? asset.trackFrames : [],
    preparing: Boolean(asset.preparing),
    prepareProgress: Math.max(0, Math.min(1, Number(asset.prepareProgress) || 0)),
  };
}

export function createVisualSegment(duration = 4, asset = null) {
  return {
    id: makeId("visual"),
    duration: Math.max(MIN_VISUAL_SEGMENT_SECONDS, Math.min(MAX_TIMELINE_DURATION_SECONDS, duration)),
    ...getVisualAssetPayload(asset),
  };
}

export function createStickerSegment(sticker, start = 0, duration = DEFAULT_STICKER_SEGMENT_SECONDS) {
  const safeDuration = Math.max(
    MIN_VISUAL_SEGMENT_SECONDS,
    Math.min(MAX_TIMELINE_DURATION_SECONDS, duration || DEFAULT_STICKER_SEGMENT_SECONDS),
  );

  return {
    id: makeId("sticker"),
    stickerId: sticker?.stickerId ?? sticker?.id ?? "",
    name: sticker?.name ?? "",
    nameEn: sticker?.nameEn ?? "",
    category: sticker?.category ?? "",
    src: sticker?.src ?? "",
    start: Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - safeDuration, start || 0)),
    duration: safeDuration,
    x: Number.isFinite(sticker?.x) ? sticker.x : 82,
    y: Number.isFinite(sticker?.y) ? sticker.y : 20,
    scale: Number.isFinite(sticker?.scale) ? sticker.scale : 1,
    rotation: Number.isFinite(sticker?.rotation) ? sticker.rotation : 0,
    opacity: Number.isFinite(sticker?.opacity) ? sticker.opacity : 1,
  };
}

export function getTimedSegmentsEnd(segments) {
  return segments.reduce(
    (end, segment) => Math.max(end, Math.max(0, segment.start || 0) + Math.max(0, segment.duration || 0)),
    0,
  );
}

export function normalizeTimedSegmentIds(segments, prefix = "segment") {
  const seen = new Set();
  let changed = false;
  const normalized = segments.map((segment) => {
    const id = String(segment?.id || "");
    if (id && !seen.has(id)) {
      seen.add(id);
      return segment;
    }
    const next = { ...segment, id: makeId(prefix) };
    seen.add(next.id);
    changed = true;
    return next;
  });
  return changed ? normalized : segments;
}

export function packTimedSegmentsIntoLanes(segments, { preferredLaneKey = "" } = {}) {
  const lanes = [];
  [...segments].sort((a, b) => (a.start || 0) - (b.start || 0) || String(a.id).localeCompare(String(b.id))).forEach((segment) => {
    const laneAccepts = (lane = []) => {
      const last = lane.at(-1);
      return !last || (last.start || 0) + (last.duration || 0) <= (segment.start || 0) + 0.001;
    };
    const preferredLane = preferredLaneKey && Number.isInteger(segment?.[preferredLaneKey])
      ? Math.max(0, segment[preferredLaneKey])
      : -1;
    while (preferredLane >= lanes.length) lanes.push([]);
    const laneIndex = preferredLane >= 0 && laneAccepts(lanes[preferredLane])
      ? preferredLane
      : lanes.findIndex(laneAccepts);
    if (laneIndex >= 0) lanes[laneIndex].push(segment);
    else lanes.push([segment]);
  });
  return lanes.length ? lanes : [[]];
}

export function packCaptionSegmentsIntoLanes(segments, timeline) {
  const lanes = [];
  segments
    .map((segment, index) => ({ segment, index, range: timeline[index] }))
    .sort((a, b) => (a.range?.start || 0) - (b.range?.start || 0))
    .forEach((item) => {
      const laneIndex = lanes.findIndex((lane) => {
        const last = lane.at(-1);
        return !last || (last.range?.end || 0) <= (item.range?.start || 0) + 0.001;
      });
      if (laneIndex >= 0) lanes[laneIndex].push(item);
      else lanes.push([item]);
    });
  return lanes.length ? lanes : [[]];
}

export function getTimedSegmentIndexAtTime(segments, time) {
  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    const start = Math.max(0, segment.start || 0);
    const end = start + Math.max(0, segment.duration || 0);
    if (safeTime >= start && safeTime < end) {
      return index;
    }
  }

  return -1;
}

export function getVisualSegmentsTotal(segments) {
  return segments.reduce((sum, segment) => sum + Math.max(0, segment.duration || 0), 0);
}

export function reorderTimelineItems(items, fromIndex, toIndex) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

export function moveTimedCaptionSegment(segments, segmentId, start, end) {
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(safeStart + MIN_TIMED_CAPTION_SECONDS, Number(end) || safeStart);
  return segments.map((segment) =>
    segment.id === segmentId ? { ...segment, start: safeStart, end: safeEnd } : segment,
  );
}

export function materializeCaptionTimings(segments, targetDuration) {
  const timeline = getCaptionTimeline(segments, targetDuration);
  return segments.map((segment, index) => ({
    ...segment,
    start: timeline[index]?.start ?? 0,
    end: timeline[index]?.end ?? Math.max(MIN_TIMED_CAPTION_SECONDS, timeline[index]?.start ?? 0),
  }));
}

export function getVisualSegmentTimeline(segments) {
  let cursor = 0;
  return segments.map((segment) => {
    const duration = Math.max(0, segment.duration || 0);
    const item = {
      id: segment.id,
      start: cursor,
      end: cursor + duration,
      duration,
    };
    cursor += duration;
    return item;
  });
}

export function getVisualSegmentIndexAtTime(segments, time) {
  if (!segments.length) {
    return -1;
  }

  const timeline = getVisualSegmentTimeline(segments);
  const clampedTime = Math.max(0, Math.min(getVisualSegmentsTotal(segments), time));
  const index = timeline.findIndex(
    (segment) => clampedTime >= segment.start && clampedTime < segment.end,
  );
  return index >= 0 ? index : timeline.length - 1;
}

export function getCaptionDefaultWeight(text) {
  const compact = text.replace(/\s/g, "");
  return Math.max(1, Math.min(4, Math.ceil(compact.length / 14)));
}

export function getCaptionBaseDuration(text) {
  const compact = text.replace(/\s/g, "");
  if (!compact) {
    return MIN_CAPTION_SEGMENT_SECONDS;
  }
  return Math.max(
    MIN_CAPTION_SEGMENT_SECONDS,
    Math.min(MAX_CAPTION_SEGMENT_SECONDS, compact.length / 4.2 + 0.45),
  );
}

export function getCaptionSegmentDuration(segment) {
  if (hasExplicitCaptionTiming(segment)) {
    return Math.max(MIN_TIMED_CAPTION_SECONDS, segment.end - segment.start);
  }

  const defaultWeight = getCaptionDefaultWeight(segment.text);
  const weight = Number.isFinite(segment.weight) ? segment.weight : defaultWeight;
  const weightScale = Math.max(0.35, weight / defaultWeight);
  return getCaptionBaseDuration(segment.text) * weightScale;
}

export function hasExplicitCaptionTiming(segment) {
  return Number.isFinite(segment?.start) && Number.isFinite(segment?.end) && segment.end > segment.start;
}

export function getCaptionTimeline(captionSegments, targetDuration = 0) {
  if (captionSegments.some(hasExplicitCaptionTiming)) {
    let cursor = 0;
    return captionSegments.map((segment) => {
      const hasTiming = hasExplicitCaptionTiming(segment);
      const start = hasTiming ? Math.max(0, segment.start) : cursor;
      const duration = hasTiming
        ? Math.max(MIN_TIMED_CAPTION_SECONDS, segment.end - segment.start)
        : getCaptionSegmentDuration(segment);
      const timelineItem = {
        start,
        end: start + duration,
        duration,
      };
      cursor = timelineItem.end;
      return timelineItem;
    });
  }

  const naturalDurations = captionSegments.map((segment) => getCaptionSegmentDuration(segment));
  const naturalTotal = naturalDurations.reduce((sum, duration) => sum + duration, 0);
  const shouldAlignToTarget = targetDuration > 0 && naturalTotal > 0;
  const scale = shouldAlignToTarget ? targetDuration / naturalTotal : 1;
  let cursor = 0;
  return captionSegments.map((segment, index) => {
    const duration = naturalDurations[index] * scale;
    const timelineItem = {
      start: cursor,
      end: cursor + duration,
      duration,
    };
    cursor += duration;
    return timelineItem;
  });
}

export function createCaptionSegments(text) {
  return getScriptSegments(text).map((segment) => ({
    id: makeId("caption"),
    text: segment,
    weight: getCaptionDefaultWeight(segment),
    hidden: false,
  }));
}

export function getCaptionScript(segments) {
  return segments.map((segment) => segment.text).join("\n");
}

export function getSegmentIndexAtTime(captionSegments, currentTime, targetDuration = 0) {
  if (!captionSegments.length) {
    return -1;
  }

  const timeline = getCaptionTimeline(captionSegments, targetDuration);
  const time = Math.max(0, currentTime);
  for (let index = 0; index < timeline.length; index += 1) {
    if (time >= timeline[index].start && time <= timeline[index].end) {
      return index;
    }
  }

  return -1;
}

export function getSegmentStartTime(captionSegments, index, targetDuration = 0) {
  return getCaptionTimeline(captionSegments, targetDuration)[Math.max(0, index)]?.start ?? 0;
}

export function getVisualSegmentStartTime(visualSegments, index) {
  const safeIndex = Math.max(0, Math.min(Array.isArray(visualSegments) ? visualSegments.length : 0, Number(index) || 0));
  return (visualSegments || []).slice(0, safeIndex).reduce(
    (total, segment) => total + Math.max(0, Number(segment?.duration) || 0),
    0,
  );
}

export function formatTime(value) {
  const seconds = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(
    2,
    "0",
  )}.${String(centiseconds).padStart(2, "0")}`;
}

export function formatCompactDuration(value) {
  const seconds = Math.max(0, Number.isFinite(value) ? value : 0);
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) return `${roundedSeconds}s`;
  const minutes = Math.floor(roundedSeconds / 60);
  return `${minutes}:${String(roundedSeconds % 60).padStart(2, "0")}`;
}

export function formatClock(value) {
  const seconds = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
}

export function getScriptSegments(text) {
  const cleaned = text
    .split(/[\n。！？!?]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (cleaned.length) {
    return cleaned.slice(0, 8);
  }

  return [];
}

export function estimateDuration(text) {
  const segments = getScriptSegments(text);
  if (!segments.length) {
    return 0;
  }
  return Math.min(45, segments.reduce((sum, segment) => sum + getCaptionBaseDuration(segment), 0));
}

export function formatSavedTime(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
