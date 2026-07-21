import { DEFAULT_TIMELINE_DURATION_SECONDS, MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";

export const TIMELINE_MIN_ZOOM = 0.25;
export const TIMELINE_MAX_ZOOM = 16;
export const TIMELINE_DEFAULT_VISIBLE_SECONDS = 10;
export const TIMELINE_MIN_VISIBLE_SECONDS = 0.5;
export const TIMELINE_FRAME_RATE = 30;

const ZOOM_IN_CURVE = Math.log(TIMELINE_DEFAULT_VISIBLE_SECONDS / TIMELINE_MIN_VISIBLE_SECONDS) /
  Math.log(TIMELINE_MAX_ZOOM);

export function clampTimelineZoom(zoom) {
  return Math.max(TIMELINE_MIN_ZOOM, Math.min(TIMELINE_MAX_ZOOM, zoom));
}

export function getTimelineVisibleDuration(zoom) {
  const clampedZoom = clampTimelineZoom(zoom);

  if (clampedZoom <= 1) {
    const progress = (clampedZoom - TIMELINE_MIN_ZOOM) / (1 - TIMELINE_MIN_ZOOM);
    const maxLog = Math.log(MAX_TIMELINE_DURATION_SECONDS);
    const defaultLog = Math.log(TIMELINE_DEFAULT_VISIBLE_SECONDS);
    return Math.exp(maxLog + (defaultLog - maxLog) * progress);
  }

  return Math.max(
    TIMELINE_MIN_VISIBLE_SECONDS,
    TIMELINE_DEFAULT_VISIBLE_SECONDS / Math.pow(clampedZoom, ZOOM_IN_CURVE),
  );
}

export function getTimelineZoomForVisibleDuration(visibleDuration) {
  const target = Math.max(
    TIMELINE_MIN_VISIBLE_SECONDS,
    Math.min(MAX_TIMELINE_DURATION_SECONDS, Number(visibleDuration) || TIMELINE_DEFAULT_VISIBLE_SECONDS),
  );
  let low = TIMELINE_MIN_ZOOM;
  let high = TIMELINE_MAX_ZOOM;

  for (let index = 0; index < 32; index += 1) {
    const middle = (low + high) / 2;
    if (getTimelineVisibleDuration(middle) > target) low = middle;
    else high = middle;
  }

  return clampTimelineZoom((low + high) / 2);
}

export function getTimelineAutoFitZoom(contentDuration, fillRatio = 0.82) {
  const safeDuration = Math.max(0.5, Number(contentDuration) || 0.5);
  const safeFillRatio = Math.max(0.5, Math.min(0.9, Number(fillRatio) || 0.82));
  const paddedVisibleDuration = Math.max(5, safeDuration / safeFillRatio);
  return getTimelineZoomForVisibleDuration(paddedVisibleDuration);
}

export function getTimelineInitialContentZoom(contentDuration) {
  const safeDuration = Math.max(0, Number(contentDuration) || 0);
  if (safeDuration <= 0) return getTimelineZoomForVisibleDuration(TIMELINE_DEFAULT_VISIBLE_SECONDS);
  if (safeDuration > 60) return getTimelineZoomForVisibleDuration(30);
  return getTimelineAutoFitZoom(safeDuration);
}

export function getTimelineTailPadding(contentDuration) {
  const safeDuration = Math.max(0, Number(contentDuration) || 0);
  if (safeDuration <= 0) return 0;
  if (safeDuration < 10) return 2;
  if (safeDuration <= 60) return 5;
  return Math.min(30, safeDuration * 0.05);
}

export function getTimelineProjectDuration(contentDuration) {
  const safeDuration = Math.max(0, Number(contentDuration) || 0);
  if (safeDuration <= 0) return DEFAULT_TIMELINE_DURATION_SECONDS;
  return Math.min(
    MAX_TIMELINE_DURATION_SECONDS,
    Math.max(DEFAULT_TIMELINE_DURATION_SECONDS, Math.ceil((safeDuration + getTimelineTailPadding(safeDuration)) * 2) / 2),
  );
}

export function getTimelineTrackWidthPercent(timelineDuration, zoom) {
  if (timelineDuration <= 0) {
    return 100;
  }

  const visibleDuration = getTimelineVisibleDuration(zoom);
  return Math.max(100, (timelineDuration / visibleDuration) * 100);
}

export function getMobilePinchZoomState({
  timelineDuration,
  minimumZoom = TIMELINE_MIN_ZOOM,
  startZoom,
  startDistance,
  distance,
  startTrackWidth,
  baseTrackWidth = 0,
}) {
  const distanceScale = Math.max(0.01, distance) / Math.max(1, startDistance);
  const startWidthPercent = getTimelineTrackWidthPercent(timelineDuration, startZoom);
  const minimumWidthPercent = getTimelineTrackWidthPercent(timelineDuration, minimumZoom);
  const maximumWidthPercent = getTimelineTrackWidthPercent(timelineDuration, TIMELINE_MAX_ZOOM);
  const widthUnit = baseTrackWidth > 0
    ? baseTrackWidth / 100
    : startTrackWidth / Math.max(startWidthPercent, 0.001);
  const minimumTrackWidth = widthUnit * minimumWidthPercent;
  const maximumTrackWidth = widthUnit * maximumWidthPercent;
  const nextTrackWidth = Math.max(
    minimumTrackWidth,
    Math.min(maximumTrackWidth, startTrackWidth * distanceScale),
  );
  const nextWidthPercent = nextTrackWidth / Math.max(widthUnit, 0.001);
  const nextVisibleDuration = timelineDuration > 0
    ? timelineDuration / Math.max(nextWidthPercent / 100, 1)
    : getTimelineVisibleDuration(startZoom);
  const isAtMinimumWidth = Math.abs(nextTrackWidth - minimumTrackWidth) < 0.000001;
  const isAtMaximumWidth = Math.abs(nextTrackWidth - maximumTrackWidth) < 0.000001;
  const nextZoom = isAtMinimumWidth
    ? minimumZoom
    : isAtMaximumWidth
      ? TIMELINE_MAX_ZOOM
      : Math.max(minimumZoom, getTimelineZoomForVisibleDuration(nextVisibleDuration));

  return {
    nextZoom,
    nextTrackWidth,
  };
}

export function getMobilePinchAnchorScrollLeft({
  currentScrollLeft,
  trackLeft,
  trackWidth,
  viewportLeft,
  viewportWidth,
  anchorTimeRatio,
}) {
  const fixedPlayheadX = viewportLeft + viewportWidth / 2;
  const anchorX = trackLeft + anchorTimeRatio * trackWidth;
  return currentScrollLeft + anchorX - fixedPlayheadX;
}

export function getTimelineRulerScale(visibleDuration) {
  if (visibleDuration <= 0.75) {
    return { minorStep: 1 / TIMELINE_FRAME_RATE, majorStep: 0.5, labelMode: "frames" };
  }
  if (visibleDuration <= 2) {
    return { minorStep: 0.1, majorStep: 0.5, labelMode: "subseconds" };
  }
  if (visibleDuration <= 6) {
    return { minorStep: 0.25, majorStep: 0.5, labelMode: "subseconds" };
  }
  if (visibleDuration <= 16) {
    return { minorStep: 0.5, majorStep: 1, labelMode: "seconds" };
  }
  if (visibleDuration <= 45) {
    return { minorStep: 1, majorStep: 5, labelMode: "seconds" };
  }
  if (visibleDuration <= 120) {
    return { minorStep: 5, majorStep: 15, labelMode: "seconds" };
  }
  if (visibleDuration <= 420) {
    return { minorStep: 15, majorStep: 60, labelMode: "minutes" };
  }
  if (visibleDuration <= 900) {
    return { minorStep: 60, majorStep: 300, labelMode: "minutes" };
  }
  return { minorStep: 300, majorStep: 600, labelMode: "minutes" };
}

const RULER_MAJOR_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function getTimelineRulerTicks(
  timelineDuration,
  zoom,
  visibleStart = 0,
  visibleEnd = timelineDuration,
  { minimumMajorStep = 0 } = {},
) {
  if (timelineDuration <= 0) {
    return [];
  }

  const visibleDuration = getTimelineVisibleDuration(zoom);
  const scale = getTimelineRulerScale(visibleDuration);
  const majorStep = RULER_MAJOR_STEPS.find((step) => step >= Math.max(scale.majorStep, minimumMajorStep))
    ?? RULER_MAJOR_STEPS.at(-1);
  const scaleWasRaised = majorStep > scale.majorStep;
  const minorStep = scaleWasRaised ? majorStep / 4 : scale.minorStep;
  const labelMode = scaleWasRaised && majorStep >= 1 ? "seconds" : scale.labelMode;
  const rangePadding = Math.max(visibleDuration * 0.35, majorStep);
  const rangeStart = Math.max(0, visibleStart - rangePadding);
  const rangeEnd = Math.min(timelineDuration, visibleEnd + rangePadding);
  const startIndex = Math.max(0, Math.floor(rangeStart / minorStep));
  const endIndex = Math.max(startIndex, Math.ceil(rangeEnd / minorStep));

  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
    const index = startIndex + offset;
    const time = Math.min(timelineDuration, index * minorStep);
    const isMajor = Math.abs(time / majorStep - Math.round(time / majorStep)) < 0.001;
    return {
      id: `${minorStep}-${index}`,
      time,
      left: (time / timelineDuration) * 100,
      isMajor,
      label: isMajor ? formatTimelineRulerLabel(time, labelMode) : "",
    };
  });
}

export function getTimelineZoomLabel(zoom) {
  const visibleDuration = getTimelineVisibleDuration(zoom);

  if (visibleDuration <= 0.75) {
    return "15f";
  }

  if (visibleDuration < 2) {
    return `${visibleDuration.toFixed(1)}s`;
  }

  if (visibleDuration < 60) {
    return `${Math.round(visibleDuration)}s`;
  }

  return `${Math.round(visibleDuration / 60)}m`;
}

export function formatTimelineRulerLabel(value, mode = "seconds") {
  const safeSeconds = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const frame = Math.round((safeSeconds - Math.floor(safeSeconds)) * TIMELINE_FRAME_RATE);
  const centiseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 100);
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (mode === "frames" && frame > 0) {
    return `${clock}:${String(frame).padStart(2, "0")}f`;
  }

  if (mode === "subseconds" && centiseconds > 0) {
    return `${clock}.${String(centiseconds).padStart(2, "0")}`;
  }

  return clock;
}
