export const LIVE_PORTRAIT_FRAME_QUALITY = Object.freeze({
  firstFrameMaxSampledDistance: 0.34,
  temporalFrameMaxSampledDistance: 0.22,
  minimumSampleVariance: 1e-6,
  maximumAbsoluteSampleValue: 8,
  maximumSamples: 512,
});

export type LivePortraitFrameRejectionReason =
  | "invalid-distance"
  | "non-finite-samples"
  | "extreme-samples"
  | "flat-frame"
  | null;

export interface LivePortraitFrameQualityResult {
  accepted: boolean;
  reason: LivePortraitFrameRejectionReason;
  distance: number;
  threshold: number;
  sampledValues: number;
  variance: number;
  maximumAbsoluteValue: number;
}

export function getLivePortraitFrameDistanceThreshold(hasPreviousFrame: boolean): number {
  return hasPreviousFrame
    ? LIVE_PORTRAIT_FRAME_QUALITY.temporalFrameMaxSampledDistance
    : LIVE_PORTRAIT_FRAME_QUALITY.firstFrameMaxSampledDistance;
}

export function isLivePortraitFrameDistanceAcceptable(
  distance: number,
  hasPreviousFrame: boolean,
): boolean {
  return Number.isFinite(distance) &&
    distance >= 0 &&
    distance <= getLivePortraitFrameDistanceThreshold(hasPreviousFrame);
}

function getSampleStatistics(pixels: ArrayLike<number>) {
  const sampleCount = Math.min(pixels.length, LIVE_PORTRAIT_FRAME_QUALITY.maximumSamples);
  const stride = Math.max(1, Math.floor(pixels.length / Math.max(1, sampleCount)));
  let count = 0;
  let sum = 0;
  let squaredSum = 0;
  let maximumAbsoluteValue = 0;
  for (let index = 0; index < pixels.length && count < sampleCount; index += stride) {
    const value = Number(pixels[index]);
    if (!Number.isFinite(value)) {
      return { count, finite: false, variance: 0, maximumAbsoluteValue: Infinity };
    }
    count += 1;
    sum += value;
    squaredSum += value * value;
    maximumAbsoluteValue = Math.max(maximumAbsoluteValue, Math.abs(value));
  }
  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, squaredSum / count - mean * mean) : 0;
  return { count, finite: true, variance, maximumAbsoluteValue };
}

export function evaluateLivePortraitFrameQuality(
  pixels: ArrayLike<number>,
  distance: number,
  hasPreviousFrame: boolean,
): LivePortraitFrameQualityResult {
  const threshold = getLivePortraitFrameDistanceThreshold(hasPreviousFrame);
  const statistics = getSampleStatistics(pixels);
  let reason: LivePortraitFrameRejectionReason = null;
  if (!statistics.finite || !pixels.length) reason = "non-finite-samples";
  else if (statistics.maximumAbsoluteValue > LIVE_PORTRAIT_FRAME_QUALITY.maximumAbsoluteSampleValue) {
    reason = "extreme-samples";
  } else if (statistics.variance < LIVE_PORTRAIT_FRAME_QUALITY.minimumSampleVariance) {
    reason = "flat-frame";
  } else if (!isLivePortraitFrameDistanceAcceptable(distance, hasPreviousFrame)) {
    reason = "invalid-distance";
  }
  return {
    accepted: reason === null,
    reason,
    distance,
    threshold,
    sampledValues: statistics.count,
    variance: statistics.variance,
    maximumAbsoluteValue: statistics.maximumAbsoluteValue,
  };
}
