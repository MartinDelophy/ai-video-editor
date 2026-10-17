import { isTimedSegmentLaneLocked } from "./timeline.js";

const RIPPLE_EPSILON_SECONDS = 0.0005;

function startsAtOrAfter(segment, boundary) {
  return (Number(segment?.start) || 0) >= boundary - RIPPLE_EPSILON_SECONDS;
}

function shiftRange(segment, delta) {
  const start = Math.max(0, (Number(segment?.start) || 0) + delta);
  if (!Number.isFinite(Number(segment?.end))) return { ...segment, start };
  return {
    ...segment,
    start,
    end: Math.max(start, Number(segment.end) + delta),
  };
}

/**
 * Move explicitly timed clips after a main-visual edit point. Main visuals are
 * already a gapless sequence, so they are intentionally excluded here.
 *
 * Active caption/audio links move as one unit. Detached remembered links are
 * treated as independent clips, matching the editor's existing movement rules.
 */
export function applyTimelineRipple(d, boundary, delta) {
  const safeBoundary = Math.max(0, Number(boundary) || 0);
  const safeDelta = Number(delta) || 0;
  if (!d.rippleEditing || Math.abs(safeDelta) < RIPPLE_EPSILON_SECONDS) {
    return { moved: 0, skippedLocked: 0 };
  }

  let moved = 0;
  let skippedLocked = 0;
  const shiftedAudioIds = new Set();
  const ownedVisualIds = new Set((d.visualSegments || []).map(segment => segment.id));
  const isOwned = segment => ownedVisualIds.has(segment.visualSegmentId);
  const activeAudioIds = new Set((d.audioSegments || []).map(segment => segment.id));
  const captionLockedAudioIds = new Set(d.trackLocks.caption
    ? (d.captionSegments || []).map(segment => segment.audioSegmentId).filter(Boolean) : []);

  const nextAudioSegments = (d.audioSegments || []).map((segment) => {
    if (isOwned(segment) || !startsAtOrAfter(segment, safeBoundary)) return segment;
    if (captionLockedAudioIds.has(segment.id) || isTimedSegmentLaneLocked(d.audioSegments, segment.id, d.trackLocks)) {
      skippedLocked += 1;
      return segment;
    }
    shiftedAudioIds.add(segment.id);
    moved += 1;
    return shiftRange(segment, safeDelta);
  });
  d.setAudioSegments(nextAudioSegments);

  if (d.trackLocks.caption) {
    skippedLocked += (d.captionSegments || []).filter((segment) => (
      startsAtOrAfter(segment, safeBoundary)
      || (segment.audioSegmentId && shiftedAudioIds.has(segment.audioSegmentId))
    )).length;
  } else {
    d.setCaptionSegments((d.captionSegments || []).map((segment) => {
      // A deleted voice is not an active link; the caption follows its own time.
      if (isOwned(segment)) return segment;
      const linkedAudioId = activeAudioIds.has(segment.audioSegmentId) ? segment.audioSegmentId : "";
      const shouldMove = linkedAudioId
        ? shiftedAudioIds.has(linkedAudioId)
        : startsAtOrAfter(segment, safeBoundary);
      if (!shouldMove) return segment;
      moved += 1;
      return shiftRange(segment, safeDelta);
    }));
  }

  const shiftCollection = (segments, locked, setter) => {
    const eligible = (segments || []).filter((segment) => startsAtOrAfter(segment, safeBoundary));
    if (locked) {
      skippedLocked += eligible.length;
      return segments || [];
    }
    const next = (segments || []).map((segment) => {
      if (segments === d.stickerSegments && isOwned(segment) || !startsAtOrAfter(segment, safeBoundary)) return segment;
      moved += 1;
      return shiftRange(segment, safeDelta);
    });
    setter(next);
    return next;
  };

  shiftCollection(d.visualOverlaySegments, d.trackLocks.overlay, d.setVisualOverlaySegments);
  shiftCollection(d.stickerSegments, d.trackLocks.sticker, d.setStickerSegments);

  const nextMusicSegments = shiftCollection(
    d.musicSegments,
    d.trackLocks.music,
    d.setMusicSegments,
  );
  if (!d.trackLocks.music && nextMusicSegments.length) {
    d.setMusicStart(Math.min(...nextMusicSegments.map((segment) => Number(segment.start) || 0)));
  } else if (
    !d.trackLocks.music
    && d.musicBlob
    && !nextMusicSegments.length
    && (Number(d.musicStart) || 0) >= safeBoundary - RIPPLE_EPSILON_SECONDS
  ) {
    d.setMusicStart(Math.max(0, (Number(d.musicStart) || 0) + safeDelta));
    moved += 1;
  }

  if (
    d.sourceAudioBlob
    && d.sourceAudioLinked === false
    && (Number(d.sourceAudioStart) || 0) >= safeBoundary - RIPPLE_EPSILON_SECONDS
  ) {
    if (d.trackLocks.source) skippedLocked += 1;
    else {
      d.setSourceAudioStart(Math.max(0, (Number(d.sourceAudioStart) || 0) + safeDelta));
      moved += 1;
    }
  }

  return { moved, skippedLocked };
}
