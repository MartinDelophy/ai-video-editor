import {
  DEFAULT_STICKER_SEGMENT_SECONDS,
  MAX_TIMELINE_DURATION_SECONDS,
  MIN_VISUAL_SEGMENT_SECONDS,
} from "../config/editor.js";
import { createStickerSegment } from "./timeline.js";

export function createStickerTimelineActions(d) {
  function getTimelineTimeFromDropPercent(percent = 0) {
    const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    const duration = d.timelineDurationRef.current || Math.max(d.estimatedDuration, 10);
    return Math.max(
      0,
      Math.min(MAX_TIMELINE_DURATION_SECONDS, (safePercent / 100) * duration),
    );
  }

  function commitStickerSegments(nextSegments, message, selectedId = "") {
    const normalizedSegments = nextSegments
      .filter((segment) => segment?.src && segment.duration > 0.05)
      .map((segment) => {
        const duration = Math.max(
          MIN_VISUAL_SEGMENT_SECONDS,
          Math.min(MAX_TIMELINE_DURATION_SECONDS, segment.duration),
        );
        return {
          ...segment,
          duration,
          start: Math.max(
            0,
            Math.min(MAX_TIMELINE_DURATION_SECONDS - duration, segment.start || 0),
          ),
        };
      });
    d.setStickerSegments(normalizedSegments);
    d.setSelectedTrack("sticker");
    d.setActiveTool("stickers");
    const selectedSegment =
      normalizedSegments.find((segment) => segment.id === selectedId) ??
      normalizedSegments[Math.max(0, normalizedSegments.length - 1)] ??
      null;
    d.setSelectedStickerSegmentId(selectedSegment?.id ?? "");
    if (selectedSegment?.stickerId) d.setSelectedStickerId(selectedSegment.stickerId);
    d.notify(message);
  }

  function addStickerAssetToTimeline(asset, options = {}) {
    if (d.trackLocks.sticker) {
      d.notify("贴纸轨已锁定，无法添加贴纸");
      return;
    }
    if (!asset?.src) {
      d.notify("当前贴纸素材不可用");
      return;
    }
    const startTime = Math.min(
      MAX_TIMELINE_DURATION_SECONDS - DEFAULT_STICKER_SEGMENT_SECONDS,
      getTimelineTimeFromDropPercent(options.percent ?? 0),
    );
    const nextSegment = createStickerSegment(
      asset,
      startTime,
      DEFAULT_STICKER_SEGMENT_SECONDS,
    );
    commitStickerSegments(
      [...d.stickerSegments, nextSegment],
      "贴纸已添加到贴纸轨",
      nextSegment.id,
    );
    d.seekTo(startTime);
  }

  return {
    addStickerAssetToTimeline,
    commitStickerSegments,
    getTimelineTimeFromDropPercent,
  };
}
