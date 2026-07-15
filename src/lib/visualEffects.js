import { MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";

const DEFAULT_TRANSFORM = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
export const VISUAL_TRANSFORM_KEYS = Object.freeze(["scale", "x", "y", "rotation", "opacity"]);
const KEYFRAME_TIME_TOLERANCE = 0.04;
export const MIN_VISUAL_PLAYBACK_RATE = 0.25;
export const MAX_VISUAL_PLAYBACK_RATE = 4;

export function normalizeVisualPlaybackRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return 1;
  return Math.max(MIN_VISUAL_PLAYBACK_RATE, Math.min(MAX_VISUAL_PLAYBACK_RATE, rate));
}

export function getVisualSourceTime(segment, localTime = 0) {
  return Math.max(0, Number(segment?.sourceStart) || 0)
    + Math.max(0, Number(localTime) || 0) * normalizeVisualPlaybackRate(segment?.playbackRate);
}

export function updateVisualSegmentPlaybackRate(segment, value) {
  const previousRate = normalizeVisualPlaybackRate(segment?.playbackRate);
  const playbackRate = normalizeVisualPlaybackRate(value);
  const previousDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, Number(segment?.duration) || MIN_VISUAL_SEGMENT_SECONDS);
  const sourceDuration = Math.max(
    MIN_VISUAL_SEGMENT_SECONDS,
    Number(segment?.sourceDuration) || previousDuration * previousRate,
  );
  const duration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, Math.min(MAX_TIMELINE_DURATION_SECONDS, sourceDuration / playbackRate));
  const timeScale = duration / previousDuration;
  return {
    ...segment,
    playbackRate,
    sourceDuration,
    duration,
    keyframes: normalizeVisualKeyframes(segment?.keyframes).map((frame) => ({
      ...frame,
      time: Math.min(duration, frame.time * timeScale),
    })),
  };
}

function normalizeVisualProperty(key, value) {
  if (key === "scale") return Math.max(0.1, Number(value) || 1);
  if (key === "opacity") return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 1));
  return Number(value) || 0;
}

export function normalizeVisualTransform(value = {}) {
  return {
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    scale: Math.max(0.1, Number(value.scale) || 1),
    rotation: Number(value.rotation) || 0,
    opacity: Math.max(0, Math.min(1, Number.isFinite(Number(value.opacity)) ? Number(value.opacity) : 1)),
  };
}

export function normalizeVisualKeyframes(keyframes = []) {
  return keyframes
    .filter((frame) => frame && Number.isFinite(Number(frame.time)))
    .map((frame) => ({ ...frame, time: Math.max(0, Number(frame.time)) }))
    .sort((a, b) => a.time - b.time)
    .reduce((frames, frame) => {
      const previous = frames.at(-1);
      if (!previous || Math.abs(previous.time - frame.time) > KEYFRAME_TIME_TOLERANCE) {
        frames.push(frame);
        return frames;
      }
      frames[frames.length - 1] = { ...previous, ...frame };
      return frames;
    }, []);
}

export function resolveVisualTransform(keyframes = [], time = 0) {
  const safeTime = Math.max(0, Number(time) || 0);
  const normalizedKeyframes = normalizeVisualKeyframes(keyframes);
  return Object.fromEntries(VISUAL_TRANSFORM_KEYS.map((key) => {
    const frames = normalizedKeyframes
      .filter((frame) => Number.isFinite(Number(frame[key])))
      .map((frame) => ({ time: Math.max(0, Number(frame.time) || 0), value: normalizeVisualProperty(key, frame[key]) }))
      .sort((a, b) => a.time - b.time);
    if (!frames.length) return [key, DEFAULT_TRANSFORM[key]];
    // A keyframe starts controlling its property at its own timestamp. Before
    // the first keyframe the clip must retain its unmodified default value.
    if (safeTime < frames[0].time) return [key, DEFAULT_TRANSFORM[key]];
    if (safeTime === frames[0].time) return [key, frames[0].value];
    if (safeTime >= frames.at(-1).time) return [key, frames.at(-1).value];
    const rightIndex = frames.findIndex((frame) => frame.time >= safeTime);
    const left = frames[rightIndex - 1];
    const right = frames[rightIndex];
    const progress = (safeTime - left.time) / Math.max(0.0001, right.time - left.time);
    return [key, left.value + (right.value - left.value) * progress];
  }));
}

export function upsertVisualKeyframe(keyframes = [], time, transform) {
  const safeTime = Math.max(0, Number(time) || 0);
  const normalized = normalizeVisualKeyframes(keyframes);
  const matching = normalized.filter((frame) => Math.abs(frame.time - safeTime) <= KEYFRAME_TIME_TOLERANCE);
  const next = normalized.filter((frame) => Math.abs(frame.time - safeTime) > KEYFRAME_TIME_TOLERANCE);
  next.push({ ...Object.assign({}, ...matching), time: safeTime, ...normalizeVisualTransform(transform) });
  return normalizeVisualKeyframes(next);
}

export function hasVisualPropertyKeyframe(keyframes = [], time, key) {
  return normalizeVisualKeyframes(keyframes).some((frame) => Math.abs(frame.time - (Number(time) || 0)) <= KEYFRAME_TIME_TOLERANCE && Number.isFinite(Number(frame[key])));
}

export function upsertVisualPropertyKeyframe(keyframes = [], time, key, value) {
  if (!VISUAL_TRANSFORM_KEYS.includes(key)) return keyframes;
  const safeTime = Math.max(0, Number(time) || 0);
  const normalized = normalizeVisualKeyframes(keyframes);
  const matching = normalized.filter((frame) => Math.abs(frame.time - safeTime) <= KEYFRAME_TIME_TOLERANCE);
  const next = normalized.filter((frame) => Math.abs(frame.time - safeTime) > KEYFRAME_TIME_TOLERANCE);
  next.push({ ...Object.assign({}, ...matching), time: safeTime, [key]: normalizeVisualProperty(key, value) });
  return normalizeVisualKeyframes(next);
}

export function removeVisualPropertyKeyframe(keyframes = [], time, key) {
  return normalizeVisualKeyframes(keyframes).flatMap((frame) => {
    if (Math.abs(frame.time - (Number(time) || 0)) > KEYFRAME_TIME_TOLERANCE || !(key in frame)) return [frame];
    const { [key]: _removed, ...rest } = frame;
    return VISUAL_TRANSFORM_KEYS.some((property) => property in rest) ? [rest] : [];
  });
}

export function getVisualMaskCss(mask = {}) {
  const feather = Math.max(0, Math.min(40, Number(mask.feather) || 0));
  const edge = Math.max(0, 50 - feather);
  if (mask.type === "circle") return `radial-gradient(circle at 50% 50%, #000 ${edge}%, transparent 50%)`;
  if (mask.type === "rounded") return "linear-gradient(#000, #000)";
  return "";
}

export function getVisualMaskInsets(mask = {}) {
  const centerX = Number.isFinite(mask.centerX) ? mask.centerX : 50;
  const centerY = Number.isFinite(mask.centerY) ? mask.centerY : 50;
  const width = Number.isFinite(mask.width) ? mask.width : 80;
  const height = Number.isFinite(mask.height) ? mask.height : 80;
  return {
    top: Math.max(0, centerY - height / 2),
    right: Math.max(0, 100 - (centerX + width / 2)),
    bottom: Math.max(0, 100 - (centerY + height / 2)),
    left: Math.max(0, centerX - width / 2),
  };
}

export function getCircleMaskCss(mask = {}, frame = {}) {
  if (mask.type !== "circle") return "";
  const feather = Math.max(0, Math.min(40, Number(mask.feather) || 0));
  if (!feather && !mask.inverted) return "";
  const width = Math.max(1, Number(frame.width) || 1);
  const height = Math.max(1, Number(frame.height) || 1);
  const radius = ((Number.isFinite(mask.size) ? mask.size : 72) / 200) * Math.min(width, height);
  const centerX = Number.isFinite(mask.centerX) ? mask.centerX : 50;
  const centerY = Number.isFinite(mask.centerY) ? mask.centerY : 50;
  const innerStop = Math.max(0, 100 - feather);
  return `radial-gradient(circle ${radius}px at ${centerX}% ${centerY}%, ${mask.inverted ? "transparent" : "#000"} ${innerStop}%, ${mask.inverted ? "#000" : "transparent"} 100%)`;
}

export function getVisualMaskGeometry(mask = {}, frame = {}) {
  const frameWidth = Math.max(1, Number(frame.width) || 1);
  const frameHeight = Math.max(1, Number(frame.height) || 1);
  const centerX = (Number.isFinite(mask.centerX) ? mask.centerX : 50) / 100 * frameWidth;
  const centerY = (Number.isFinite(mask.centerY) ? mask.centerY : 50) / 100 * frameHeight;
  if (mask.type === "circle") {
    const diameter = (Number.isFinite(mask.size) ? mask.size : 72) / 100 * Math.min(frameWidth, frameHeight);
    return { centerX, centerY, width: diameter, height: diameter, radius: diameter / 2, cornerRadius: diameter / 2 };
  }
  const width = (Number.isFinite(mask.width) ? mask.width : 80) / 100 * frameWidth;
  const height = (Number.isFinite(mask.height) ? mask.height : 80) / 100 * frameHeight;
  const cornerRadius = mask.type === "rounded"
    ? Math.min(width, height) * (Number.isFinite(mask.cornerRadius) ? mask.cornerRadius : 12) / 100
    : 0;
  return { centerX, centerY, width, height, radius: 0, cornerRadius };
}

export function getVisualMaskFeatherPixels(mask = {}, frame = {}) {
  if (!mask.type || mask.type === "none") return 0;
  const geometry = getVisualMaskGeometry(mask, frame);
  return Math.max(0, Math.min(40, Number(mask.feather) || 0)) / 100 * Math.min(geometry.width, geometry.height) * 0.25;
}

export function getVisualMaskSvgDataUrl(mask = {}, frame = {}) {
  if (!mask.type || mask.type === "none") return "";
  const width = Math.max(1, Math.round(Number(frame.width) || 1));
  const height = Math.max(1, Math.round(Number(frame.height) || 1));
  const geometry = getVisualMaskGeometry(mask, { width, height });
  const feather = getVisualMaskFeatherPixels(mask, { width, height });
  if (!feather && !mask.inverted) return "";
  const x = geometry.centerX - geometry.width / 2;
  const y = geometry.centerY - geometry.height / 2;
  const shape = mask.type === "circle"
    ? `<circle cx="${geometry.centerX}" cy="${geometry.centerY}" r="${geometry.radius}" fill="${mask.inverted ? "black" : "white"}"${feather ? ' filter="url(#blur)"' : ""}/>`
    : `<rect x="${x}" y="${y}" width="${geometry.width}" height="${geometry.height}" rx="${geometry.cornerRadius}" fill="${mask.inverted ? "black" : "white"}"${feather ? ' filter="url(#blur)"' : ""}/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${feather ? `<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${feather}"/></filter>` : ""}<mask id="mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${mask.inverted ? "white" : "black"}"/>${shape}</mask></defs><rect width="${width}" height="${height}" fill="white" mask="url(#mask)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
