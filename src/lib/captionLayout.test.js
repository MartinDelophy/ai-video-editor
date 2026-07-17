import { describe, expect, it } from "vitest";

import { getCaptionScale, resolveCaptionMetrics } from "./captionLayout.js";

describe("caption design scaling", () => {
  it("uses a readable 14px default without changing explicit project sizes", () => {
    expect(resolveCaptionMetrics({ renderFrame: { width: 360, height: 640 } }).fontSize).toBe(14);
    expect(resolveCaptionMetrics({ captionSize: 12, renderFrame: { width: 360, height: 640 } }).fontSize).toBe(12);
  });

  it("keeps 12px captions independent from the editor preview window size", () => {
    const smallPreview = resolveCaptionMetrics({ captionSize: 12, renderFrame: { width: 276, height: 491 } });
    const largePreview = resolveCaptionMetrics({ captionSize: 12, renderFrame: { width: 360, height: 640 } });
    expect(smallPreview.fontSize).toBeCloseTo(9.2, 6);
    expect(largePreview.fontSize).toBe(12);
  });

  it("maps the 360px design short edge consistently to vertical 1080p and 4K", () => {
    expect(getCaptionScale(null, { width: 1080, height: 1920 })).toBe(3);
    expect(resolveCaptionMetrics({ captionSize: 12, renderFrame: { width: 1080, height: 1920 } }).fontSize).toBe(36);
    expect(resolveCaptionMetrics({ captionSize: 12, renderFrame: { width: 2160, height: 3840 } }).fontSize).toBe(72);
  });

  it("uses the same scale for landscape and portrait outputs with the same short edge", () => {
    expect(getCaptionScale(null, { width: 3840, height: 2160 })).toBe(6);
    expect(getCaptionScale(null, { width: 2160, height: 3840 })).toBe(6);
  });
});
