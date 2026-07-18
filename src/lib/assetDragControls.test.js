import { describe, expect, it } from "vitest";
import { resolveVisualDropIntent } from "./assetDragControls.js";

describe("visual asset drop intent", () => {
  it("uses the explicit target track instead of guessing from pointer position", () => {
    expect(resolveVisualDropIntent({ track: "image" })).toBe("image");
    expect(resolveVisualDropIntent({ track: "overlay" })).toBe("overlay");
  });
});
