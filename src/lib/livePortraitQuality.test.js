import { describe, expect, it } from "vitest";

import {
  evaluateLivePortraitFrameQuality,
  getLivePortraitFrameDistanceThreshold,
  isLivePortraitFrameDistanceAcceptable,
} from "./livePortraitQuality.ts";
import {
  extremeCorruptFrame,
  flatCorruptFrame,
  healthyPortraitFrame,
  nonFiniteCorruptFrame,
} from "./__fixtures__/livePortraitFrameSamples.js";

describe("LivePortrait frame quality policy", () => {
  it("allows a wider distance for the first generated frame", () => {
    expect(getLivePortraitFrameDistanceThreshold(false)).toBe(0.34);
    expect(getLivePortraitFrameDistanceThreshold(true)).toBe(0.22);
  });

  it("rejects non-finite and negative distances", () => {
    expect(isLivePortraitFrameDistanceAcceptable(Number.NaN, false)).toBe(false);
    expect(isLivePortraitFrameDistanceAcceptable(Number.POSITIVE_INFINITY, true)).toBe(false);
    expect(isLivePortraitFrameDistanceAcceptable(-0.01, true)).toBe(false);
  });

  it("applies the temporal threshold inclusively", () => {
    expect(isLivePortraitFrameDistanceAcceptable(0.22, true)).toBe(true);
    expect(isLivePortraitFrameDistanceAcceptable(0.221, true)).toBe(false);
    expect(isLivePortraitFrameDistanceAcceptable(0.3, false)).toBe(true);
  });

  it("accepts a healthy generated-frame sample", () => {
    expect(evaluateLivePortraitFrameQuality(healthyPortraitFrame, 0.12, true)).toMatchObject({
      accepted: true,
      reason: null,
    });
  });

  it.each([
    ["flat-frame", flatCorruptFrame],
    ["non-finite-samples", nonFiniteCorruptFrame],
    ["extreme-samples", extremeCorruptFrame],
  ])("rejects the %s fixture", (reason, frame) => {
    expect(evaluateLivePortraitFrameQuality(frame, 0.1, true)).toMatchObject({
      accepted: false,
      reason,
    });
  });

  it("rejects a visually valid frame with an implausible temporal jump", () => {
    expect(evaluateLivePortraitFrameQuality(healthyPortraitFrame, 0.4, true)).toMatchObject({
      accepted: false,
      reason: "invalid-distance",
    });
  });
});
