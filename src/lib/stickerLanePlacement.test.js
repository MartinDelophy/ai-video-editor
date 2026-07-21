import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeTimedSegmentIds, packTimedSegmentsIntoLanes } from "./timeline.js";
import { createTimelineMoveControls } from "./timelineMoveControls.js";

function installPointerListeners() {
  const listeners = new Map();
  vi.stubGlobal("addEventListener", vi.fn((type, listener) => listeners.set(type, listener)));
  vi.stubGlobal("removeEventListener", vi.fn((type, listener) => {
    if (listeners.get(type) === listener) listeners.delete(type);
  }));
  return listeners;
}

afterEach(() => vi.unstubAllGlobals());

describe("sticker subtrack placement", () => {
  it("keeps a same-asset sticker in the third subtrack after a cross-lane drag", () => {
    const listeners = installPointerListeners();
    const original = [
      { id: "spark-a", stickerId: "spark", start: 5, duration: 3, lane: 0 },
      { id: "spark-b", stickerId: "spark", start: 5, duration: 3, lane: 1 },
      { id: "flame", stickerId: "flame", start: 0, duration: 4, lane: 2 },
    ];
    let stickerSegments = original;
    const setStickerSegments = vi.fn((update) => { stickerSegments = update(stickerSegments); });
    const commitStickerSegments = vi.fn((next) => { stickerSegments = next; });
    const setStickerTimelineDrag = vi.fn();
    vi.stubGlobal("document", {
      elementFromPoint: vi.fn(() => ({
        closest: () => ({ dataset: { stickerLaneIndex: "2" } }),
      })),
    });
    const controls = createTimelineMoveControls({
      stickerSegments: original,
      trackLocks: { sticker: false },
      trackScrollRef: { current: { getBoundingClientRect: () => ({ width: 100 }) } },
      timelineDurationRef: { current: 10 }, estimatedDuration: 10,
      setSelectedTrack: vi.fn(), setActiveTool: vi.fn(), setSelectedStickerSegmentId: vi.fn(),
      setSelectedStickerId: vi.fn(), setStickerSegments, commitStickerSegments,
      setStickerTimelineDrag,
      suppressTimelineClipClickRef: { current: "" }, setSnapGuide: vi.fn(),
      seekTo: vi.fn(), notify: vi.fn(), pauseForTimelineEdit: vi.fn(),
    });

    controls.startStickerSegmentMove(
      { button: 0, clientX: 50, clientY: 60, preventDefault: vi.fn(), stopPropagation: vi.fn() },
      "spark-b",
      1,
    );
    listeners.get("pointermove")({ clientX: 55, clientY: 108, preventDefault: vi.fn() });
    expect(stickerSegments).toBe(original);
    expect(setStickerTimelineDrag).toHaveBeenLastCalledWith(expect.objectContaining({ segmentId: "spark-b", lane: 2 }));
    listeners.get("pointerup")();

    const moved = stickerSegments.find((segment) => segment.id === "spark-b");
    const untouched = stickerSegments.find((segment) => segment.id === "spark-a");
    expect(moved).toMatchObject({ lane: 2, stickerId: "spark" });
    expect(untouched).toMatchObject({ lane: 0, start: 5 });
    const lanes = packTimedSegmentsIntoLanes(stickerSegments, { preferredLaneKey: "lane" });
    expect(lanes[2].map((segment) => segment.id)).toEqual(["flame", "spark-b"]);
    expect(setStickerTimelineDrag).toHaveBeenLastCalledWith(null);
  });

  it("repairs duplicate instance ids without changing sticker asset identity", () => {
    const source = [
      { id: "duplicate", stickerId: "spark" },
      { id: "duplicate", stickerId: "spark" },
    ];
    const normalized = normalizeTimedSegmentIds(source, "sticker");
    expect(normalized[0].id).toBe("duplicate");
    expect(normalized[1].id).not.toBe("duplicate");
    expect(normalized.map((segment) => segment.stickerId)).toEqual(["spark", "spark"]);
  });
});
