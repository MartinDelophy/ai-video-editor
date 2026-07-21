import { describe, expect, it } from "vitest";

import {
  getMobilePinchAnchorScrollLeft,
  getMobilePinchZoomState,
  getTimelineRulerTicks,
  getTimelineTrackWidthPercent,
  getTimelineZoomForVisibleDuration,
} from "./timelineScale.js";

describe("timeline ruler density", () => {
  it("raises mobile major tick spacing so short-timeline labels do not overlap", () => {
    const ticks = getTimelineRulerTicks(4, 3, 0, 4, { minimumMajorStep: 0.68 });
    const labels = ticks.filter((tick) => tick.isMajor).map((tick) => tick.label);

    expect(labels).toEqual(["00:00", "00:01", "00:02", "00:03", "00:04"]);
  });

  it("keeps subsecond labels when the rendered timeline has enough room", () => {
    const ticks = getTimelineRulerTicks(4, 3, 0, 4, { minimumMajorStep: 0.25 });

    expect(ticks.filter((tick) => tick.isMajor).some((tick) => tick.label === "00:00.50")).toBe(true);
  });
});

describe("mobile timeline pinch zoom", () => {
  it.each([
    [15.06, 1.01],
    [15.06, 1.02],
    [15.06, 1.05],
    [30.13, 1.01],
    [30.13, 1.02],
    [30.13, 1.05],
  ])("maps finger distance linearly to pixels from a %ss fitted timeline at %sx", (timelineDuration, distanceScale) => {
    const startZoom = getTimelineZoomForVisibleDuration(timelineDuration);
    const result = getMobilePinchZoomState({
      timelineDuration,
      minimumZoom: startZoom,
      startZoom,
      startDistance: 100,
      distance: 100 * distanceScale,
      startTrackWidth: 520,
      baseTrackWidth: 520,
    });

    expect(result.nextTrackWidth / 520).toBeCloseTo(distanceScale, 6);
  });

  it("maps a large finger-distance change directly to track pixels", () => {
    const result = getMobilePinchZoomState({
      timelineDuration: 20,
      startZoom: 1,
      startDistance: 100,
      distance: 150,
      startTrackWidth: 1040,
    });

    expect(result.nextZoom).toBeGreaterThan(1);
    expect(result.nextTrackWidth).toBe(1560);
  });

  it("clamps aggressive pinch gestures to the supported zoom range", () => {
    const result = getMobilePinchZoomState({
      timelineDuration: 20,
      startZoom: 12,
      startDistance: 20,
      distance: 500,
      startTrackWidth: 1040,
    });

    expect(result.nextZoom).toBe(16);
    expect(Number.isFinite(result.nextTrackWidth)).toBe(true);
  });

  it("stops mobile pinch-out at the full-project fit instead of changing only the readout", () => {
    const result = getMobilePinchZoomState({
      timelineDuration: 10,
      minimumZoom: 1,
      startZoom: 1,
      startDistance: 120,
      distance: 30,
      startTrackWidth: 520,
    });

    expect(result.nextZoom).toBe(1);
    expect(result.nextTrackWidth).toBe(520);
  });

  it("uses the canonical mobile width so releasing the gesture cannot add a final nudge", () => {
    const result = getMobilePinchZoomState({
      timelineDuration: 20,
      minimumZoom: 1,
      startZoom: 2,
      startDistance: 100,
      distance: 140,
      startTrackWidth: 1107,
      baseTrackWidth: 520,
    });

    expect(result.nextTrackWidth).toBeCloseTo(
      520 * (getTimelineTrackWidthPercent(20, result.nextZoom) / 100),
      5,
    );
  });

  it("keeps the same timeline time under the centered playhead after width changes", () => {
    const scrollLeft = getMobilePinchAnchorScrollLeft({
      currentScrollLeft: 180,
      trackLeft: 220,
      trackWidth: 900,
      viewportLeft: 100,
      viewportWidth: 300,
      anchorTimeRatio: 0.4,
    });

    expect(scrollLeft).toBe(510);
  });
});
