import { describe, expect, it } from "vitest";
import { shouldShowStickerTrack } from "./timelineViewModel.js";

describe("sticker track visibility", () => {
  it("hides an empty sticker track even if it was previously selected", () => {
    expect(shouldShowStickerTrack({ stickerSegments: [] })).toBe(false);
  });

  it("shows the sticker track for content and active sticker drags", () => {
    expect(shouldShowStickerTrack({ stickerSegments: [{ id: "one" }] })).toBe(true);
    expect(shouldShowStickerTrack({ assetDragPreview: { type: "sticker" } })).toBe(true);
  });
});
