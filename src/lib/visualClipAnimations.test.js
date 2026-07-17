import { describe, expect, it } from "vitest";
import { resolveVisualClipAnimation } from "./visualClipAnimations.js";

describe("visual clip animations", () => {
  it("resolves an entrance animation only near the clip start", () => {
    const animation = { in: { id: "zoom", duration: 1 } };
    expect(resolveVisualClipAnimation(animation, 0, 5).scale).toBeCloseTo(0.82);
    expect(resolveVisualClipAnimation(animation, 1.5, 5).scale).toBe(1);
  });

  it("reverses an exit animation near the clip end", () => {
    const animation = { out: { id: "fade", duration: 1 } };
    expect(resolveVisualClipAnimation(animation, 3, 5).opacity).toBe(1);
    expect(resolveVisualClipAnimation(animation, 5, 5).opacity).toBeCloseTo(0);
  });
});
