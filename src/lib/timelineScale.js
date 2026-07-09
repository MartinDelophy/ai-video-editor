import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";

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

export function getTimelineTrackWidthPercent(timelineDuration, zoom) {
  if (timelineDuration <= 0) {
    return 100;
  }

  const visibleDuration = getTimelineVisibleDuration(zoom);
  return Math.max(100, (timelineDuration / visibleDuration) * 100);
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

export function getTimelineRulerTicks(timelineDuration, zoom, visibleStart = 0, visibleEnd = timelineDuration) {
  if (timelineDuration <= 0) {
    return [];
  }

  const visibleDuration = getTimelineVisibleDuration(zoom);
  const { minorStep, majorStep, labelMode } = getTimelineRulerScale(visibleDuration);
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
