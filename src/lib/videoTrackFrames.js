import { getVisualSourceTime } from "./visualEffects.js";

const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;

export function getVideoTrackFrameSource(frame) {
  if (typeof frame === "string") return frame;
  return typeof frame?.src === "string" ? frame.src : "";
}

export function getVideoTrackFrameTime(frame, index, frameCount, duration) {
  const storedTime = Number(frame?.sourceTime);
  if (Number.isFinite(storedTime) && storedTime >= 0) return storedTime;
  const safeDuration = Math.max(0, Number(duration) || 0);
  return safeDuration > 0 && frameCount > 0
    ? ((index + 0.5) / frameCount) * safeDuration
    : index;
}

export function createVideoTrackFrame(src, sourceTime) {
  return {
    src,
    sourceTime: Math.max(0, Number(sourceTime) || 0),
  };
}

function getFrameAtOrBefore(timedFrames, targetTime) {
  if (!timedFrames.length) return null;
  const safeTarget = Math.max(0, Number(targetTime) || 0);
  let low = 0;
  let high = timedFrames.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (timedFrames[middle].sourceTime <= safeTarget) low = middle + 1;
    else high = middle - 1;
  }
  return timedFrames[Math.max(0, high)].frame;
}

export function getVideoTrackFrameAtSourceTime(frames, targetTime, duration = 0) {
  if (!Array.isArray(frames) || !frames.length) return null;
  const timedFrames = frames
    .map((frame, index) => ({
      frame,
      sourceTime: getVideoTrackFrameTime(frame, index, frames.length, duration),
    }))
    .filter(({ frame }) => Boolean(getVideoTrackFrameSource(frame)))
    .sort((left, right) => left.sourceTime - right.sourceTime);
  if (!timedFrames.length) return null;

  return getFrameAtOrBefore(timedFrames, targetTime);
}

export function getSampledVideoTrackFrames(frames, count, segment = null) {
  if (!Array.isArray(frames) || !frames.length) return [];

  const safeCount = Math.max(1, Math.round(Number(count) || 1));
  const sourceStart = Math.max(0, Number(segment?.sourceStart) || 0);
  const playbackRate = Math.max(
    MIN_PLAYBACK_RATE,
    Math.min(MAX_PLAYBACK_RATE, Number(segment?.playbackRate) || 1),
  );
  const sourceSpan = Math.max(
    0.001,
    Number(segment?.sourceDuration)
      || Math.max(0.001, Number(segment?.duration) || 0) * playbackRate,
  );
  const frameDuration = Math.max(
    sourceStart + sourceSpan,
    Number(segment?.trackFrameDuration) || 0,
  );
  const timedFrames = frames
    .map((frame, index) => ({
      frame,
      sourceTime: getVideoTrackFrameTime(frame, index, frames.length, frameDuration),
    }))
    .filter(({ frame }) => Boolean(getVideoTrackFrameSource(frame)))
    .sort((left, right) => left.sourceTime - right.sourceTime);
  if (!timedFrames.length) return [];

  return Array.from({ length: safeCount }, (_, index) => {
    const localTime = (index / safeCount) * Math.max(0.001, Number(segment?.duration) || sourceSpan / playbackRate);
    const targetTime = segment
      ? getVisualSourceTime(segment, localTime)
      : sourceStart + (index / safeCount) * sourceSpan;
    return getFrameAtOrBefore(timedFrames, Math.min(sourceStart + sourceSpan, targetTime));
  });
}
