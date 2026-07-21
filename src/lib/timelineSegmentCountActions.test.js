import { describe, expect, it, vi } from "vitest";

import { createTimelineSegmentCountActions } from "./timelineSegmentCountActions.js";

describe("timeline segment insertion", () => {
  it("adds a caption at the playhead", () => {
    const commitCaptionSegments = vi.fn();
    const controls = createTimelineSegmentCountActions({
      selectedTrack: "caption", currentTime: 4.25, captionSegments: [], trackLocks: {},
      commitCaptionSegments, notify: vi.fn(), t: (key) => key === "newCaptionDefault" ? "New caption" : key,
    });
    controls.handleAddSegment();
    expect(commitCaptionSegments.mock.calls[0][0][0]).toMatchObject({ start: 4.25, end: 6.05, text: "New caption" });
  });

  it("adds a caption from the caption panel without depending on a stale selected track", () => {
    const commitCaptionSegments = vi.fn();
    const controls = createTimelineSegmentCountActions({
      selectedTrack: "image", currentTime: 7.5, captionSegments: [], trackLocks: {},
      commitCaptionSegments, notify: vi.fn(), t: (key) => key === "newCaptionDefault" ? "New caption" : key,
    });
    controls.handleAddCaptionSegment();
    expect(commitCaptionSegments.mock.calls[0][0][0]).toMatchObject({ start: 7.5, end: 9.3, text: "New caption" });
    expect(commitCaptionSegments.mock.calls[0][2]).toBe(0);
  });

  it("splits the active visual and inserts the new clip at the playhead", () => {
    const commitVisualSegments = vi.fn();
    const source = { id: "visual-1", type: "image", src: "image.png", duration: 8 };
    const controls = createTimelineSegmentCountActions({
      selectedTrack: "image", currentTime: 3, imageSrc: "image.png", imageDuration: 8,
      visualSegments: [source], selectedVisualSegmentId: "visual-1", selectedVisualSegmentIndex: 0,
      trackLocks: {}, commitVisualSegments, notify: vi.fn(), getCurrentVisualAssetSnapshot: () => source,
    });
    controls.handleAddSegment();
    const [segments, , selectedIndex] = commitVisualSegments.mock.calls[0];
    expect(segments.map((item) => item.duration)).toEqual([3, 2, 5]);
    expect(selectedIndex).toBe(1);
  });
});
