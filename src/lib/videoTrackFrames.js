import { getVisualSourceTime } from "./visualEffects.js";

export const PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS = 0.025;

const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;
const frameIndexCache = new WeakMap();
const sampledFrameCache = new WeakMap();

function getTimedVideoTrackFrames(frames, duration) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  let cached = frameIndexCache.get(frames);
  if (!cached || cached.length !== frames.length) {
    cached = { length: frames.length, durations: new Map() };
    frameIndexCache.set(frames, cached);
  }
  if (cached.durations.has(safeDuration)) return cached.durations.get(safeDuration);

  // Filmstrip refinement replaces the frame array. Index that immutable set
  // once instead of sorting hundreds of PTS entries on every playhead tick.
  const timedFrames = frames
    .map((frame, index) => ({
      frame,
      sourceTime: getVideoTrackFrameTime(frame, index, frames.length, safeDuration),
    }))
    .filter(({ frame }) => Boolean(getVideoTrackFrameSource(frame)))
    .sort((left, right) => left.sourceTime - right.sourceTime);
  // Split legacy clips can share frames but use different implicit durations.
  // Keep that case correct without retaining every intermediate trim value.
  if (cached.durations.size >= 4) cached.durations.delete(cached.durations.keys().next().value);
  cached.durations.set(safeDuration, timedFrames);
  return timedFrames;
}

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
  const timedFrames = getTimedVideoTrackFrames(frames, duration);
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
  const duration = Math.max(0.001, Number(segment?.duration) || sourceSpan / playbackRate);
  const cacheKey = segment && typeof segment === "object" ? segment : frames;
  const cached = sampledFrameCache.get(cacheKey);
  if (cached
    && cached.frames === frames
    && cached.frameCount === frames.length
    && cached.count === safeCount
    && cached.sourceStart === sourceStart
    && cached.sourceSpan === sourceSpan
    && cached.playbackRate === playbackRate
    && cached.frameDuration === frameDuration
    && cached.duration === duration
    && cached.speedCurve === segment?.speedCurve) return cached.sampledFrames;

  const timedFrames = getTimedVideoTrackFrames(frames, frameDuration);
  if (!timedFrames.length) return [];

  const sampledFrames = Array.from({ length: safeCount }, (_, index) => {
    const localTime = (index / safeCount) * duration;
    const targetTime = segment
      ? getVisualSourceTime(segment, localTime)
      : sourceStart + (index / safeCount) * sourceSpan;
    return getFrameAtOrBefore(timedFrames, Math.min(sourceStart + sourceSpan, targetTime));
  });
  // Callers treat this representative strip as read-only and copy it before
  // replacing the live playhead cell. Keep only the latest density per clip.
  sampledFrameCache.set(cacheKey, {
    frames, frameCount: frames.length, count: safeCount, sourceStart, sourceSpan,
    playbackRate, frameDuration, duration, speedCurve: segment?.speedCurve, sampledFrames,
  });
  return sampledFrames;
}
