import { describe, expect, it } from "vitest";

import {
  createCaptionSegments,
  createStickerSegment,
  getCaptionScript,
  getCaptionTimeline,
  getTimedSegmentIndexAtTime,
  getTimedSegmentsEnd,
  getVisualSegmentIndexAtTime,
  getVisualSegmentTimeline,
  reorderTimelineItems,
} from "./timeline.js";
import {
  getTimelineAutoFitZoom,
  getTimelineVisibleDuration,
  getTimelineZoomForVisibleDuration,
} from "./timelineScale.js";

describe("timeline primitives", () => {
  it("fits an uploaded video into most of the visible timeline", () => {
    const zoom = getTimelineAutoFitZoom(15);
    const visibleDuration = getTimelineVisibleDuration(zoom);
    expect(visibleDuration).toBeCloseTo(15 / 0.82, 2);
    expect(15 / visibleDuration).toBeCloseTo(0.82, 2);
  });

  it("clamps automatic timeline fitting to supported zoom limits", () => {
    expect(getTimelineVisibleDuration(getTimelineZoomForVisibleDuration(10_000))).toBeCloseTo(1800, 2);
    expect(getTimelineVisibleDuration(getTimelineAutoFitZoom(0.5))).toBeCloseTo(5, 2);
  });

  it("reorders without mutating the source array", () => {
    const source = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = reorderTimelineItems(source, 0, 2);
    expect(result.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(source.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("returns the original array for an invalid reorder", () => {
    const source = [{ id: "a" }];
    expect(reorderTimelineItems(source, -1, 0)).toBe(source);
    expect(reorderTimelineItems(source, 0, 3)).toBe(source);
  });

  it("builds a contiguous visual timeline", () => {
    const segments = [{ id: "a", duration: 2 }, { id: "b", duration: 3.5 }];
    expect(getVisualSegmentTimeline(segments)).toEqual([
      { id: "a", start: 0, end: 2, duration: 2 },
      { id: "b", start: 2, end: 5.5, duration: 3.5 },
    ]);
    expect(getVisualSegmentIndexAtTime(segments, 2)).toBe(1);
    expect(getVisualSegmentIndexAtTime(segments, 99)).toBe(1);
  });

  it("prefers the last overlapping timed segment", () => {
    const segments = [
      { start: 0, duration: 4 },
      { start: 2, duration: 4 },
    ];
    expect(getTimedSegmentIndexAtTime(segments, 3)).toBe(1);
    expect(getTimedSegmentsEnd(segments)).toBe(6);
  });

  it("scales untimed captions to the target duration", () => {
    const captions = createCaptionSegments("第一句。第二句更长一些。");
    const timeline = getCaptionTimeline(captions, 12);
    expect(timeline[0].start).toBe(0);
    expect(timeline.at(-1).end).toBeCloseTo(12, 8);
    expect(getCaptionScript(captions)).toBe("第一句\n第二句更长一些");
  });

  it("keeps explicit caption timings", () => {
    const timeline = getCaptionTimeline([
      { text: "a", start: 2, end: 3 },
      { text: "b", start: 5, end: 7 },
    ], 20);
    expect(timeline).toEqual([
      { start: 2, end: 3, duration: 1 },
      { start: 5, end: 7, duration: 2 },
    ]);
  });

  it("clamps sticker start and duration to timeline limits", () => {
    const sticker = createStickerSegment({ id: "spark", src: "/spark.png" }, -5, 0.1);
    expect(sticker.start).toBe(0);
    expect(sticker.duration).toBeGreaterThanOrEqual(0.5);
  });
});
