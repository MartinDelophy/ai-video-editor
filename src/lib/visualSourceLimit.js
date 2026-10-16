import { MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";

// trackFrameDuration describes the whole decoded source, sourceDuration the
// current trimmed range. Never invent motion by extending past the source.
export function getVisualSourceDurationLimit(segment) {
  if (segment?.type !== "video") return Infinity;
  if (segment.speedCurve?.enabled) return Math.max(MIN_VISUAL_SEGMENT_SECONDS, Number(segment.duration) || 0);
  const rate = Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1));
  const start = Math.max(0, Number(segment.sourceStart) || 0);
  const range = Math.max(0, Number(segment.sourceDuration) || Number(segment.duration) * rate || 0);
  const limit = Number(segment.trackFrameDuration) > 0 ? Number(segment.trackFrameDuration) : start + range;
  return Math.max(MIN_VISUAL_SEGMENT_SECONDS, (limit - start) / rate);
}
