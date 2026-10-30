import { getVisualSourceTime, normalizeVisualTransform, resolveVisualTransform } from "./visualEffects.js";
import { resolveVisualClipAnimation } from "./visualClipAnimations.js";

export function alignPreviewSegment(segment, time, action, frame, box) {
  const base = normalizeVisualTransform(segment.baseTransform);
  const transform = resolveVisualTransform(segment.keyframes, time, base);
  const animation = resolveVisualClipAnimation(segment.animation, time, segment.duration);
  const current = { ...transform, x: transform.x + animation.x, y: transform.y + animation.y,
    scale: transform.scale * animation.scale };
  const next = { ...current };
  const centerX = (box.x + box.width / 2) / frame.width * 100 - 50;
  const centerY = (box.y + box.height / 2) / frame.height * 100 - 50;
  const radians = current.rotation * Math.PI / 180;
  const width = (Math.abs(Math.cos(radians)) * box.width + Math.abs(Math.sin(radians)) * box.height) * current.scale;
  const height = (Math.abs(Math.sin(radians)) * box.width + Math.abs(Math.cos(radians)) * box.height) * current.scale;
  if (action === "center" || action === "fit" || action === "fill") { next.x = -centerX; next.y = -centerY; }
  if (action === "left") next.x = (width / frame.width - 1) * 50 - centerX;
  if (action === "right") next.x = (1 - width / frame.width) * 50 - centerX;
  if (action === "top") next.y = (height / frame.height - 1) * 50 - centerY;
  if (action === "bottom") next.y = (1 - height / frame.height) * 50 - centerY;
  if (action === "fit" || action === "fill") {
    next.rotation = 0;
    next.scale = (action === "fit" ? Math.min : Math.max)(frame.width / box.width, frame.height / box.height);
  }
  // Shift existing animated properties together with the base transform. Never
  // insert an implicit keyframe or erase the user's animation/colour keyframes.
  const keys = ["x", "y", "scale", "rotation"].filter(key => Math.abs(next[key] - current[key]) > 1e-8);
  const adjust = (value, key) => key === "scale" ? value * next.scale / current.scale : value + next[key] - current[key];
  return { ...segment,
    baseTransform: normalizeVisualTransform(Object.fromEntries(Object.entries(base).map(([key, value]) => [key, keys.includes(key) ? adjust(value, key) : value]))),
    keyframes: (segment.keyframes || []).map(keyframe => Object.fromEntries(Object.entries(keyframe)
      .map(([key, value]) => [key, keys.includes(key) && Number.isFinite(value) ? adjust(value, key) : value]))),
  };
}

export function previewTimingFingerprint(segment, start) {
  return JSON.stringify([segment.id, segment.src, start, segment.duration, segment.sourceStart, segment.sourceDuration, segment.playbackRate, segment.speedCurve, segment.speedCurveEnabled, segment.reversed]);
}

export function capturePreviewFrame(segment, track, start, time) {
  return { id: segment.id, track, name: segment.name, time, sourceTime: getVisualSourceTime(segment, Math.max(0, time - start)),
    fingerprint: previewTimingFingerprint(segment, start) };
}

export function alignedOverlayStart(action, overlay, mainRange, time, reference) {
  const value = action === "start" ? mainRange?.start
    : action === "end" ? mainRange?.end - overlay.duration
    : action === "playhead" ? time
    : action === "reference" && reference ? overlay.start + reference.time - time : NaN;
  return Number.isFinite(value) && value >= -1e-7 ? Math.max(0, value) : null;
}

export function moveAlignedOverlay(items, id, start) {
  const target = items.find(item => item.id === id);
  if (!target || start == null || Math.abs(start - target.start) < 1e-7) return items;
  let lane = Math.max(0, Number(target.lane) || (Number(target.layer) || 1) - 1);
  const collision = items.some(item => item.id !== id && (Number(item.lane) || (Number(item.layer) || 1) - 1) === lane
    && item.start < start + target.duration - 1e-7 && item.start + item.duration > start + 1e-7);
  if (collision) lane = Math.max(...items.map(item => Number(item.lane) || (Number(item.layer) || 1) - 1)) + 1;
  return items.map(item => item.id === id ? { ...item, start, lane, layer: lane + 1 } : item);
}
