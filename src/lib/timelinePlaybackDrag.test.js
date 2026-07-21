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
  it("rolls back a voiceover drag when a second touch turns the gesture into a mobile pinch", () => {
    const listeners = installPointerListeners();
    let audioSegments = [{ id: "voice-1", start: 1, duration: 2 }];
    const setAudioSegments = vi.fn((update) => { audioSegments = update(audioSegments); });
    const seekTo = vi.fn();
    const controls = createTimelineMoveControls({
      audioSegments,
      captionSegments: [],
      trackLocks: { audio: false },
      trackScrollRef: {
        current: {
          classList: { contains: () => false },
          getBoundingClientRect: () => ({ width: 200 }),
        },
      },
      timelineDurationRef: { current: 10 },
      setSelectedTrack: vi.fn(), setSelectedAudioSegmentId: vi.fn(), setAudioSegments,
      setCaptionSegments: vi.fn(), setTimelineHorizon: vi.fn(), setSnapGuide: vi.fn(),
      suppressTimelineClipClickRef: { current: "" }, seekTo, notify: vi.fn(),
      pauseForTimelineEdit: vi.fn(), t: (key) => key,
    });

    controls.startAudioSegmentMove({ button: 0, clientX: 20, stopPropagation: vi.fn() }, "voice-1");
    listeners.get("pointermove")({ clientX: 60, preventDefault: vi.fn() });
    expect(audioSegments[0].start).not.toBe(1);

    listeners.get("timeline-mobile-pinch-start")();
    expect(audioSegments[0].start).toBe(1);
    expect(seekTo).not.toHaveBeenCalled();
  });

  it("reveals and commits a picture-in-picture target when a main visual is dragged downward", () => {
    const listeners = installPointerListeners();
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => ({
        getBoundingClientRect: () => ({ left: 100, width: 500, top: 20, bottom: 68 }),
        querySelectorAll: () => [],
      })),
    });
    const first = { id: "visual-1", assetId: "asset-1", type: "image", src: "one.png", duration: 5 };
    const second = { id: "visual-2", assetId: "asset-2", type: "image", src: "two.png", duration: 5 };
    const timelineClipDragRef = { current: null };
    const setVisualOverlaySegments = vi.fn((update) => update([]));
    const controls = createTimelineReorderControls({
      visualSegments: [first, second], renderedVisualSegments: [first, second], visualOverlaySegments: [],
      timelineDuration: 10, trackLocks: { image: false }, timelineClipDragRef,
      setTimelineClipDrag: vi.fn(), setSelectedTrack: vi.fn(), setSelectedVisualSegmentId: vi.fn(),
      setSelectedVisualOverlayId: vi.fn(), setVisualOverlaySegments, commitVisualSegments: vi.fn(),
      seekTo: vi.fn(), notify: vi.fn(), suppressTimelineClipClickRef: { current: "" },
      pauseForTimelineEdit: vi.fn(),
    });

    controls.startTimelineClipDrag(
      { button: 0, clientX: 400, clientY: 40, target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn() },
      "image", "visual-2", 1,
    );
    listeners.get("pointermove")({ clientX: 200, clientY: 90 });
    expect(timelineClipDragRef.current).toMatchObject({ mode: "overlay", overlayStart: 2, dragging: true });
    listeners.get("pointerup")();
    expect(setVisualOverlaySegments).toHaveBeenCalledTimes(1);
  });

  it("pauses immediately when a sticker clip is pressed", () => {
    const listeners = installPointerListeners();
    const pauseForTimelineEdit = vi.fn();
    const setStickerSegments = vi.fn();
    const setStickerTimelineDrag = vi.fn();
    const controls = createTimelineMoveControls({
      stickerSegments: [{ id: "sticker-1", start: 1, duration: 2, stickerId: "spark" }],
      trackLocks: { sticker: false },
      trackScrollRef: { current: { getBoundingClientRect: () => ({ width: 100 }) } },
      timelineDurationRef: { current: 10 },
      estimatedDuration: 10,
      setSelectedTrack: vi.fn(), setActiveTool: vi.fn(), setSelectedStickerSegmentId: vi.fn(),
      setSelectedStickerId: vi.fn(), setStickerSegments, suppressTimelineClipClickRef: { current: "" },
      setStickerTimelineDrag,
      seekTo: vi.fn(), notify: vi.fn(), pauseForTimelineEdit,
    });
    controls.startStickerSegmentMove({ button: 0, clientX: 20, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() }, "sticker-1");
    expect(pauseForTimelineEdit).toHaveBeenCalledTimes(1);
    listeners.get("pointermove")({ clientX: 22, clientY: 11, preventDefault: vi.fn() });
    expect(pauseForTimelineEdit).toHaveBeenCalledTimes(1);
    listeners.get("pointermove")({ clientX: 30, clientY: 10, preventDefault: vi.fn() });
    listeners.get("pointermove")({ clientX: 35, clientY: 10, preventDefault: vi.fn() });
    expect(pauseForTimelineEdit).toHaveBeenCalledTimes(1);
    expect(setStickerSegments).not.toHaveBeenCalled();
    expect(setStickerTimelineDrag).toHaveBeenCalledWith(expect.objectContaining({ segmentId: "sticker-1" }));
  });

  it("resizes either edge of a sticker clip while preserving the opposite edge", () => {
    const listeners = installPointerListeners();
    const stickerSegments = [{ id: "sticker-1", start: 2, duration: 3, stickerId: "spark" }];
    const setStickerSegments = vi.fn();
    const commitStickerSegments = vi.fn();
    const controls = createTimelineMoveControls({
      stickerSegments, estimatedDuration: 10, timelineDurationRef: { current: 10 },
      trackLocks: { sticker: false }, trackScrollRef: { current: { getBoundingClientRect: () => ({ width: 200 }) } },
      setSelectedTrack: vi.fn(), setActiveTool: vi.fn(), setSelectedStickerSegmentId: vi.fn(),
      setSelectedStickerId: vi.fn(), setStickerSegments, commitStickerSegments, setTimelineHorizon: vi.fn(),
      suppressTimelineClipClickRef: { current: "" }, notify: vi.fn(), pauseForTimelineEdit: vi.fn(),
    });

    controls.startStickerSegmentResize(
      { button: 0, clientX: 40, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() },
      "sticker-1", "start",
    );
    listeners.get("pointermove")({ clientX: 60, clientY: 10, preventDefault: vi.fn() });
    listeners.get("pointerup")();
    expect(commitStickerSegments.mock.calls[0][0][0]).toMatchObject({ start: 3, duration: 2 });

    controls.startStickerSegmentResize(
      { button: 0, clientX: 100, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() },
      "sticker-1", "end",
    );
    listeners.get("pointermove")({ clientX: 120, clientY: 10, preventDefault: vi.fn() });
    listeners.get("pointerup")();
    expect(commitStickerSegments.mock.calls[1][0][0]).toMatchObject({ start: 2, duration: 4 });
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
