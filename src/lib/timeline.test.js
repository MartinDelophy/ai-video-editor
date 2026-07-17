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
  moveTimedCaptionSegment,
  materializeCaptionTimings,
  packTimedSegmentsIntoLanes,
  reorderTimelineItems,
} from "./timeline.js";
import {
  getTimelineAutoFitZoom,
  getTimelineInitialContentZoom,
  getTimelineProjectDuration,
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
    expect(getTimelineVisibleDuration(getTimelineZoomForVisibleDuration(100_000))).toBeCloseTo(86_400, 2);
    expect(getTimelineVisibleDuration(getTimelineAutoFitZoom(0.5))).toBeCloseTo(5, 2);
  });

  it("uses an approachable empty and first-content timeline window", () => {
    expect(getTimelineVisibleDuration(getTimelineInitialContentZoom(0))).toBeCloseTo(10, 2);
    expect(getTimelineVisibleDuration(getTimelineInitialContentZoom(1.8))).toBeCloseTo(5, 2);
    expect(getTimelineVisibleDuration(getTimelineInitialContentZoom(15))).toBeCloseTo(15 / 0.82, 2);
    expect(getTimelineVisibleDuration(getTimelineInitialContentZoom(90))).toBeCloseTo(30, 2);
  });

  it("grows the project horizon from real content with bounded tail room", () => {
    expect(getTimelineProjectDuration(0)).toBe(10);
    expect(getTimelineProjectDuration(1.8)).toBe(10);
    expect(getTimelineProjectDuration(12)).toBe(17);
    expect(getTimelineProjectDuration(100)).toBe(105);
    expect(getTimelineProjectDuration(1_000)).toBe(1_030);
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

  it("moves one timed caption without changing its duration or neighboring captions", () => {
    const source = [
      { id: "a", text: "first", start: 1, end: 2.5 },
      { id: "b", text: "second", start: 4, end: 5 },
    ];
    const moved = moveTimedCaptionSegment(source, "a", 6, 7.5);
    expect(moved[0]).toMatchObject({ id: "a", start: 6, end: 7.5 });
    expect(moved[0].end - moved[0].start).toBe(1.5);
    expect(moved[1]).toEqual(source[1]);
    expect(source[0]).toMatchObject({ start: 1, end: 2.5 });
  });

  it("materializes contiguous untimed captions before free-position dragging", () => {
    const source = createCaptionSegments("第一条。第二条。");
    const materialized = materializeCaptionTimings(source, 8);
    expect(materialized).toHaveLength(2);
    expect(materialized[0].start).toBe(0);
    expect(materialized[0].end).toBeCloseTo(materialized[1].start, 8);
    const moved = moveTimedCaptionSegment(materialized, materialized[1].id, 6, 8);
    expect(moved[1]).toMatchObject({ start: 6, end: 8 });
    expect(moved[1].start - moved[0].end).toBeGreaterThan(0);
  });

  it("packs overlapping free-position clips into additional lanes", () => {
    const lanes = packTimedSegmentsIntoLanes([
      { id: "a", start: 0, duration: 4 },
      { id: "b", start: 2, duration: 3 },
      { id: "c", start: 5, duration: 1 },
    ]);
    expect(lanes).toHaveLength(2);
    expect(lanes[0].map((item) => item.id)).toEqual(["a", "c"]);
    expect(lanes[1].map((item) => item.id)).toEqual(["b"]);
  });

  it("clamps sticker start and duration to timeline limits", () => {
    const sticker = createStickerSegment({ id: "spark", src: "/spark.png" }, -5, 0.1);
    expect(sticker.start).toBe(0);
    expect(sticker.duration).toBeGreaterThanOrEqual(0.5);
  });
});
