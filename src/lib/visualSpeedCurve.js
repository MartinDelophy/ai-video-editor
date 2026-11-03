import { MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { MAX_VISUAL_PLAYBACK_RATE, MIN_VISUAL_PLAYBACK_RATE, normalizeVisualKeyframes, getVisualPlaybackRateAtTime, getVisualSourceTime, getVisualSpeedCurveWindow } from "./visualEffects.js";

export const DEFAULT_VISUAL_SPEED_CURVE_POINTS = Object.freeze([
  { id: "speed-0", progress: 0, rate: 1 },
  { id: "speed-1", progress: 0.18, rate: 1 },
  { id: "speed-2", progress: 0.48, rate: 1 },
  { id: "speed-3", progress: 0.72, rate: 1 },
  { id: "speed-4", progress: 1, rate: 1 },
]);

export const VISUAL_SPEED_STAGE_KEYS = Object.freeze([
  "visualSpeedStageStart",
  "visualSpeedStagePush",
  "visualSpeedStageClimax",
  "visualSpeedStageClose",
]);

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function normalizeVisualSpeedCurve(value) {
  const source = Array.isArray(value?.points) && value.points.length >= 2
    ? value.points
    : DEFAULT_VISUAL_SPEED_CURVE_POINTS;
  const points = source
    .filter((point) => point && Number.isFinite(Number(point.progress)) && Number.isFinite(Number(point.rate)))
    .map((point, index) => ({
      id: String(point.id || `speed-${index}`),
      progress: clamp(Number(point.progress), 0, 1),
      rate: clamp(Number(point.rate), MIN_VISUAL_PLAYBACK_RATE, MAX_VISUAL_PLAYBACK_RATE),
    }))
    .sort((left, right) => left.progress - right.progress)
    .reduce((result, point) => {
      const previous = result.at(-1);
      if (previous && Math.abs(previous.progress - point.progress) < 0.005) result[result.length - 1] = point;
      else result.push(point);
      return result;
    }, []);
  const safePoints = points.length >= 2 ? points : DEFAULT_VISUAL_SPEED_CURVE_POINTS.map((point) => ({ ...point }));
  safePoints[0] = { ...safePoints[0], progress: 0 };
  safePoints[safePoints.length - 1] = { ...safePoints.at(-1), progress: 1 };
  const window = value?.sourceWindow;
  const basis = window && Number.isFinite(window.start) && Number.isFinite(window.end)
    && window.start >= 0 && window.end <= 1 && window.end > window.start && Array.isArray(window.points) && window.points.length >= 2
    ? normalizeVisualSpeedCurve({ enabled: true, smooth: window.smooth, points: window.points }) : null;
  return {
    ...(basis ? { sourceWindow: { points: basis.points, smooth: basis.smooth, start: window.start, end: window.end } } : {}),
    enabled: value?.enabled === true,
    smooth: value?.smooth !== false,
    points: safePoints,
  };
}

export function getVisualSpeedCurveAverageRate(value) {
  const curve = normalizeVisualSpeedCurve(value);
  if (curve.sourceWindow) {
    const basis = getVisualSpeedCurveWindow(curve);
    const root = { ...basis.curve, enabled: true };
    const sourceSpan = getVisualSpeedCurveSourceProgress(root, basis.end) - getVisualSpeedCurveSourceProgress(root, basis.start);
    return getVisualSpeedCurveAverageRate(root) * sourceSpan / Math.max(1e-12, basis.end - basis.start);
  }
  return curve.points.slice(0, -1).reduce((total, point, index) => {
    const next = curve.points[index + 1];
    return total + (next.progress - point.progress) * (point.rate + next.rate) / 2;
  }, 0) || 1;
}

export function getVisualSpeedCurveRateAtProgress(value, progress) {
  const curve = normalizeVisualSpeedCurve(value);
  return getVisualPlaybackRateAtTime({ duration: 1, speedCurve: { ...curve, enabled: true } }, clamp(Number(progress) || 0, 0, 1));
}

export function getVisualSpeedCurveSourceProgress(value, progress) {
  const curve = normalizeVisualSpeedCurve(value);
  return getVisualSourceTime({ duration: 1, sourceDuration: 1, sourceStart: 0, speedCurve: { ...curve, enabled: true } }, clamp(Number(progress) || 0, 0, 1));
}

export function splitVisualSpeedCurve(value, progress) {
  const curve = normalizeVisualSpeedCurve(value);
  const basis = getVisualSpeedCurveWindow(curve);
  const split = basis.start + (basis.end - basis.start) * clamp(progress, 0, 1);
  const root = { ...basis.curve, enabled: true };
  const slice = (start, end) => {
    const span = Math.max(1e-12, end - start);
    const points = [
      { id: `cut-start-${start}`, progress: 0, rate: getVisualSpeedCurveRateAtProgress(root, start) },
      ...root.points.filter(point => point.progress > start && point.progress < end)
        .map(point => ({ ...point, progress: (point.progress - start) / span })),
      { id: `cut-end-${end}`, progress: 1, rate: getVisualSpeedCurveRateAtProgress(root, end) },
    ];
    return normalizeVisualSpeedCurve({ enabled: curve.enabled, smooth: curve.smooth, points,
      sourceWindow: { points: root.points, smooth: root.smooth, start, end } });
  };
  return [slice(basis.start, split), slice(split, basis.end)];
}

export function getVisualSpeedCurveTimelineProgress(value, sourceProgress) {
  const target = clamp(Number(sourceProgress) || 0, 0, 1);
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (getVisualSpeedCurveSourceProgress(value, middle) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function updateVisualSegmentSpeedCurve(segment, value) {
  const previousDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, Number(segment?.duration) || MIN_VISUAL_SEGMENT_SECONDS);
  const previousRate = Math.max(MIN_VISUAL_PLAYBACK_RATE, Number(segment?.playbackRate) || 1);
  const sourceDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, Number(segment?.sourceDuration) || previousDuration * previousRate);
  // Explicit editing creates a new local curve; passive split playback keeps its exact source window.
  const speedCurve = { ...normalizeVisualSpeedCurve({ ...value, sourceWindow: null }), enabled: true };
  const playbackRate = getVisualSpeedCurveAverageRate(speedCurve);
  const duration = clamp(sourceDuration / playbackRate, MIN_VISUAL_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS);
  const timeScale = duration / previousDuration;
  return {
    ...segment,
    playbackRate,
    sourceDuration,
    duration,
    speedCurve,
    keyframes: normalizeVisualKeyframes(segment?.keyframes).map((frame) => ({
      ...frame,
      time: Math.min(duration, frame.time * timeScale),
    })),
  };
}

export function resetVisualSegmentSpeedCurve(segment) {
  return updateVisualSegmentSpeedCurve(segment, {
    enabled: true,
    smooth: true,
    points: DEFAULT_VISUAL_SPEED_CURVE_POINTS,
  });
}
