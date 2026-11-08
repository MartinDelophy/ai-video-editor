import { MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { COLOR_GRADE_KEYFRAME_KEYS, normalizeColorGradeProperty } from "./colorGrade.js";

const DEFAULT_TRANSFORM = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
export const VISUAL_TRANSFORM_KEYS = Object.freeze(["scale", "x", "y", "rotation", "opacity"]);
export const VISUAL_PROPERTY_KEYS = Object.freeze([...VISUAL_TRANSFORM_KEYS, ...COLOR_GRADE_KEYFRAME_KEYS]);
const KEYFRAME_TIME_TOLERANCE = 0.04;
export const MIN_VISUAL_PLAYBACK_RATE = 0.25;
export const MAX_VISUAL_PLAYBACK_RATE = 4;

export function normalizeVisualPlaybackRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return 1;
  return Math.max(MIN_VISUAL_PLAYBACK_RATE, Math.min(MAX_VISUAL_PLAYBACK_RATE, rate));
}

// A split can begin inside an eased interval. Retain a window onto the
// original curve instead of refitting a different easing shape at the cut.
export function getVisualSpeedCurveWindow(curve) {
  const window = curve?.sourceWindow;
  if (Array.isArray(window?.points) && window.points.length >= 2
    && Number.isFinite(window.start) && Number.isFinite(window.end) && window.end > window.start) {
    return { curve: { points: window.points, smooth: window.smooth !== false },
      start: Math.max(0, Math.min(1, window.start)), end: Math.max(0, Math.min(1, window.end)) };
  }
  return { curve, start: 0, end: 1 };
}

export function getVisualSourceTime(segment, localTime = 0) {
  const start = Math.max(0, Number(segment?.sourceStart) || 0);
  const duration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, Number(segment?.duration) || MIN_VISUAL_SEGMENT_SECONDS);
  const sourceDuration = Math.max(1e-12, Number(segment?.sourceDuration) || duration * normalizeVisualPlaybackRate(segment?.playbackRate));
  if (segment?.speedCurve?.enabled && Array.isArray(segment.speedCurve.points)) {
    const progress = Math.max(0, Math.min(1, Math.max(0, Number(localTime) || 0) / duration));
    // Preview, exact thumbnails, audio and export share this source-time clock.
    const basis = getVisualSpeedCurveWindow(segment.speedCurve);
    const sourceIn = getCurveSourceProgress(basis.curve, basis.start);
    const sourceOut = getCurveSourceProgress(basis.curve, basis.end);
    const mapped = getCurveSourceProgress(basis.curve, basis.start + (basis.end - basis.start) * progress);
    return start + sourceDuration * Math.max(0, Math.min(1, (mapped - sourceIn) / Math.max(1e-12, sourceOut - sourceIn)));
  }
  return start + Math.max(0, Number(localTime) || 0) * normalizeVisualPlaybackRate(segment?.playbackRate);
}

export function getVisualPlaybackRateAtTime(segment, localTime = 0) {
  if (!segment?.speedCurve?.enabled || !Array.isArray(segment.speedCurve.points)) return normalizeVisualPlaybackRate(segment?.playbackRate);
  const duration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, Number(segment?.duration) || MIN_VISUAL_SEGMENT_SECONDS);
  const progress = Math.max(0, Math.min(1, Math.max(0, Number(localTime) || 0) / duration));
  const basis = getVisualSpeedCurveWindow(segment.speedCurve);
  const curveProgress = basis.start + (basis.end - basis.start) * progress;
  const points = basis.curve.points
    .filter((point) => point && Number.isFinite(Number(point.progress)) && Number.isFinite(Number(point.rate)))
    .map((point) => ({ progress: Math.max(0, Math.min(1, Number(point.progress))), rate: normalizeVisualPlaybackRate(point.rate) }))
    .sort((left, right) => left.progress - right.progress);
  if (points.length < 2) return normalizeVisualPlaybackRate(segment?.playbackRate);
  const rightIndex = points.findIndex((point) => point.progress >= curveProgress);
  if (rightIndex <= 0) return points[0].rate;
  const left = points[rightIndex - 1];
  const right = points[rightIndex];
  const local = (curveProgress - left.progress) / Math.max(0.0001, right.progress - left.progress);
  const eased = basis.curve.smooth === false ? local : local * local * (3 - 2 * local);
  return normalizeVisualPlaybackRate(left.rate + (right.rate - left.rate) * eased);
}

function getCurveSourceProgress(curve, progress) {
  const points = curve.points
    .filter((point) => point && Number.isFinite(Number(point.progress)) && Number.isFinite(Number(point.rate)))
    .map((point) => ({ progress: Math.max(0, Math.min(1, Number(point.progress))), rate: normalizeVisualPlaybackRate(point.rate) }))
    .sort((left, right) => left.progress - right.progress);
  if (points.length < 2) return progress;
  points[0].progress = 0;
  points[points.length - 1].progress = 1;
  const smooth = curve.smooth !== false;
  const segmentIntegral = (left, right, local = 1) => {
    const t = Math.max(0, Math.min(1, local));
    const easingIntegral = smooth ? t ** 3 - 0.5 * t ** 4 : 0.5 * t ** 2;
    return (right.progress - left.progress) * (left.rate * t + (right.rate - left.rate) * easingIntegral);
  };
  const total = points.slice(0, -1).reduce((sum, point, index) => sum + segmentIntegral(point, points[index + 1]), 0) || 1;
  let consumed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (progress >= right.progress) consumed += segmentIntegral(left, right);
    else if (progress > left.progress) {
      consumed += segmentIntegral(left, right, (progress - left.progress) / Math.max(0.0001, right.progress - left.progress));
      break;
    } else break;
  }
  return Math.max(0, Math.min(1, consumed / total));
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
    speedCurve: segment?.speedCurve ? { ...segment.speedCurve, enabled: false } : segment?.speedCurve,
    sourceDuration,
    duration,
    keyframes: normalizeVisualKeyframes(segment?.keyframes).map((frame) => ({
      ...frame,
      time: Math.min(duration, frame.time * timeScale),
    })),
  };
}

function normalizeVisualProperty(key, value) {
  if (COLOR_GRADE_KEYFRAME_KEYS.includes(key)) return normalizeColorGradeProperty(key, value);
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

export function clampVisualKeyframeTime(frames, index, value, duration) {
  const time = frames[index].time;
  const gap = KEYFRAME_TIME_TOLERANCE + 0.001;
  const min = Math.min(time, Math.max(0, (frames[index - 1]?.time ?? -gap) + gap));
  const max = Math.max(time, Math.min(duration, (frames[index + 1]?.time ?? duration + gap) - gap));
  return Math.max(min, Math.min(max, Math.round(value * 1000) / 1000));
}

export function moveVisualKeyframe(keyframes, from, to, duration) {
  const frames = normalizeVisualKeyframes(keyframes);
  const index = frames.findIndex((frame) => frame.time === from);
  if (index < 0) return keyframes;
  const time = clampVisualKeyframeTime(frames, index, to, duration);
  if (time === from) return keyframes;
  frames[index] = { ...frames[index], time };
  return frames;
}

export function resolveVisualTransform(keyframes = [], time = 0, baseTransform = DEFAULT_TRANSFORM) {
  const safeTime = Math.max(0, Number(time) || 0);
  const normalizedKeyframes = normalizeVisualKeyframes(keyframes);
  const normalizedBaseTransform = normalizeVisualTransform(baseTransform);
  return Object.fromEntries(VISUAL_TRANSFORM_KEYS.map((key) => {
    const frames = normalizedKeyframes
      .filter((frame) => Number.isFinite(Number(frame[key])))
      .map((frame) => ({ time: Math.max(0, Number(frame.time) || 0), value: normalizeVisualProperty(key, frame[key]) }))
      .sort((a, b) => a.time - b.time);
    if (!frames.length) return [key, normalizedBaseTransform[key]];
    // A keyframe starts controlling its property at its own timestamp. Before
    // the first keyframe the clip must retain its unmodified default value.
    if (safeTime < frames[0].time) return [key, normalizedBaseTransform[key]];
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
  if (!VISUAL_PROPERTY_KEYS.includes(key)) return keyframes;
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
    return VISUAL_PROPERTY_KEYS.some((property) => property in rest) ? [rest] : [];
  });
}

export function snapVisualScaleToFrameEdges(transform = {}, frame = {}, thresholdPixels = 8, contentBox = frame) {
  const width = Math.max(1, Number(frame.width) || 1);
  const height = Math.max(1, Number(frame.height) || 1);
  const boxWidth = Math.max(1, Number(contentBox?.width) || width);
  const boxHeight = Math.max(1, Number(contentBox?.height) || height);
  const scale = Math.max(0.1, Number(transform.scale) || 1);
  const centerX = width * (0.5 + (Number(transform.x) || 0) / 100);
  const centerY = height * (0.5 + (Number(transform.y) || 0) / 100);
  const radians = (Number(transform.rotation) || 0) * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const horizontalExtent = Math.max(0.5, (cosine * boxWidth + sine * boxHeight) / 2);
  const verticalExtent = Math.max(0.5, (sine * boxWidth + cosine * boxHeight) / 2);
  const divisions = [
    { ratio: 0, xGuide: "left", yGuide: "top" },
    { ratio: 0.25, xGuide: "quarter-x-1", yGuide: "quarter-y-1" },
    { ratio: 0.5, xGuide: "center-x", yGuide: "center-y" },
    { ratio: 0.75, xGuide: "quarter-x-3", yGuide: "quarter-y-3" },
    { ratio: 1, xGuide: "right", yGuide: "bottom" },
  ];
  const targets = divisions.flatMap(({ ratio, xGuide, yGuide }) => {
    const guideX = ratio * width;
    const guideY = ratio * height;
    return [
      { scale: (centerX - guideX) / horizontalExtent, guide: xGuide, extent: horizontalExtent },
      { scale: (guideX - centerX) / horizontalExtent, guide: xGuide, extent: horizontalExtent },
      { scale: (centerY - guideY) / verticalExtent, guide: yGuide, extent: verticalExtent },
      { scale: (guideY - centerY) / verticalExtent, guide: yGuide, extent: verticalExtent },
    ];
  }).filter((target) => Number.isFinite(target.scale) && target.scale >= 0.1 && target.scale <= 4);
  const nearest = targets.reduce((best, target) => {
    const distance = Math.abs(scale - target.scale) * target.extent;
    return distance < best.distance ? { ...target, distance } : best;
  }, { distance: Infinity });
  if (nearest.distance > Math.max(1, Number(thresholdPixels) || 8)) return { transform, guides: [] };
  const snappedScale = nearest.scale;
  const guideOrder = ["left", "quarter-x-1", "center-x", "quarter-x-3", "right", "top", "quarter-y-1", "center-y", "quarter-y-3", "bottom"];
  const guides = [...new Set(targets
    .filter((target) => Math.abs(snappedScale - target.scale) * target.extent <= 0.75)
    .map((target) => target.guide))].sort((left, right) => guideOrder.indexOf(left) - guideOrder.indexOf(right));
  return { transform: { ...transform, scale: snappedScale }, guides };
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
