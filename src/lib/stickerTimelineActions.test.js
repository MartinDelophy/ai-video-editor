import { describe, expect, it, vi } from "vitest";

import { createStickerTimelineActions } from "./stickerTimelineActions.js";

describe("sticker timeline actions", () => {
  it("adds a clicked sticker at the current playhead time", () => {
    const setStickerSegments = vi.fn();
    const actions = createStickerTimelineActions({
      estimatedDuration: 10, timelineDurationRef: { current: 10 }, trackLocks: {}, stickerSegments: [],
      setStickerSegments, setSelectedTrack: vi.fn(), setActiveTool: vi.fn(),
      setSelectedStickerSegmentId: vi.fn(), setSelectedStickerId: vi.fn(), notify: vi.fn(), seekTo: vi.fn(),
    });

    actions.addStickerAssetToTimeline(
      { id: "fire", src: "/fire.png", type: "sticker", name: "Fire" },
      { startTime: 6.25 },
    );

    expect(setStickerSegments.mock.calls[0][0][0]).toMatchObject({ stickerId: "fire", start: 6.25 });
  });
});
