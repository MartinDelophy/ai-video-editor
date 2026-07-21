import { describe, expect, it } from "vitest";
import { resolveStickerSelectionIntent, resolveVisualDropIntent } from "./assetDragControls.js";

describe("visual asset drop intent", () => {
  it("uses the explicit target track instead of guessing from pointer position", () => {
    expect(resolveVisualDropIntent({ track: "image" })).toBe("image");
    expect(resolveVisualDropIntent({ track: "overlay" })).toBe("overlay");
  });
});

describe("sticker selection intent", () => {
  it("stages a mobile tap and keeps desktop click-to-add behavior", () => {
    expect(resolveStickerSelectionIntent({ isMobile: true })).toBe("stage");
    expect(resolveStickerSelectionIntent({ isMobile: false })).toBe("add");
  });
});
