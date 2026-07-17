import { afterEach, describe, expect, it, vi } from "vitest";

import { createTimelineMoveControls } from "./timelineMoveControls.js";
import { createTimelineReorderControls } from "./timelineReorderControls.js";

function installPointerListeners() {
  const listeners = new Map();
  vi.stubGlobal("addEventListener", vi.fn((type, listener) => listeners.set(type, listener)));
  vi.stubGlobal("removeEventListener", vi.fn((type, listener) => {
    if (listeners.get(type) === listener) listeners.delete(type);
  }));
  return listeners;
}

afterEach(() => vi.unstubAllGlobals());

describe("timeline drag playback behavior", () => {
  it("pauses immediately when a sticker clip is pressed", () => {
    const listeners = installPointerListeners();
    const pauseForTimelineEdit = vi.fn();
    const setStickerSegments = vi.fn();
    const controls = createTimelineMoveControls({
      stickerSegments: [{ id: "sticker-1", start: 1, duration: 2, stickerId: "spark" }],
      trackLocks: { sticker: false },
      trackScrollRef: { current: { getBoundingClientRect: () => ({ width: 100 }) } },
      timelineDurationRef: { current: 10 },
      estimatedDuration: 10,
      setSelectedTrack: vi.fn(), setActiveTool: vi.fn(), setSelectedStickerSegmentId: vi.fn(),
      setSelectedStickerId: vi.fn(), setStickerSegments, suppressTimelineClipClickRef: { current: "" },
      seekTo: vi.fn(), notify: vi.fn(), pauseForTimelineEdit,
    });
    controls.startStickerSegmentMove({ button: 0, clientX: 20, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() }, "sticker-1");
    expect(pauseForTimelineEdit).toHaveBeenCalledTimes(1);
    listeners.get("pointermove")({ clientX: 22, clientY: 11, preventDefault: vi.fn() });
    expect(pauseForTimelineEdit).toHaveBeenCalledTimes(1);
    listeners.get("pointermove")({ clientX: 30, clientY: 10, preventDefault: vi.fn() });
    listeners.get("pointermove")({ clientX: 35, clientY: 10, preventDefault: vi.fn() });
    expect(pauseForTimelineEdit).toHaveBeenCalledTimes(1);
    expect(setStickerSegments).toHaveBeenCalled();
  });

  it("pauses immediately when a caption clip is pressed", () => {
    const listeners = installPointerListeners();
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => ({
        getBoundingClientRect: () => ({ width: 200, top: 0, bottom: 46 }),
        querySelectorAll: () => [],
      })),
    });
    const pauseForTimelineEdit = vi.fn();
    const timelineClipDragRef = { current: null };
    const controls = createTimelineReorderControls({
      captionSegments: [{ id: "caption-1", text: "test", start: 1, end: 2 }],
      captionTargetDuration: 5,
      trackLocks: { caption: false },
      timelineDuration: 10,
      timelineClipDragRef,
      setTimelineClipDrag: vi.fn(), setSelectedTrack: vi.fn(), setSelectedSegmentId: vi.fn(),
      commitCaptionSegments: vi.fn(), seekTo: vi.fn(), suppressTimelineClipClickRef: { current: "" },
      pauseForTimelineEdit, notify: vi.fn(),
    });
    controls.startTimelineClipDrag({ button: 0, clientX: 40, clientY: 10, target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn() }, "caption", "caption-1", 0);
    listeners.get("pointermove")({ clientX: 42, clientY: 10 });
    expect(pauseForTimelineEdit).toHaveBeenCalledTimes(1);
    listeners.get("pointermove")({ clientX: 50, clientY: 10 });
    listeners.get("pointermove")({ clientX: 60, clientY: 10 });
    expect(pauseForTimelineEdit).toHaveBeenCalledTimes(1);
    expect(timelineClipDragRef.current.dragging).toBe(true);
  });

  it("resizes either edge of a timed caption without moving the opposite edge", () => {
    const listeners = installPointerListeners();
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ width: 200 }) })),
    });
    const commitCaptionSegments = vi.fn();
    const timelineClipDragRef = { current: null };
    const controls = createTimelineReorderControls({
      captionSegments: [{ id: "caption-1", text: "test", start: 2, end: 5 }],
      captionTargetDuration: 10, timelineDuration: 10, trackLocks: { caption: false },
      timelineClipDragRef, setTimelineClipDrag: vi.fn(), setSelectedTrack: vi.fn(),
      setSelectedSegmentId: vi.fn(), commitCaptionSegments, notify: vi.fn(),
      suppressTimelineClipClickRef: { current: "" }, pauseForTimelineEdit: vi.fn(),
    });

    controls.startCaptionResize(
      { button: 0, clientX: 40, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() },
      "caption-1", 0, "start",
    );
    listeners.get("pointermove")({ clientX: 60, clientY: 10 });
    expect(timelineClipDragRef.current.previewStart).toBe(3);
    expect(timelineClipDragRef.current.previewEnd).toBe(5);
    listeners.get("pointerup")();
    expect(commitCaptionSegments.mock.calls[0][0][0]).toMatchObject({ start: 3, end: 5 });

    controls.startCaptionResize(
      { button: 0, clientX: 100, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() },
      "caption-1", 0, "end",
    );
    listeners.get("pointermove")({ clientX: 120, clientY: 10 });
    expect(timelineClipDragRef.current.previewStart).toBe(2);
    expect(timelineClipDragRef.current.previewEnd).toBe(6);
  });
});
