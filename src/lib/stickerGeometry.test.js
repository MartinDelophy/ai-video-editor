import { describe, expect, it } from "vitest";

import { getStickerBaseSize, getStickerRenderGeometry } from "./stickerGeometry.js";

describe("sticker geometry", () => {
  it("uses the same short-edge ratio for portrait preview and 4K export", () => {
    const preview = { width: 276, height: 491 };
    const output = { width: 2160, height: 3840 };
    expect(getStickerBaseSize(preview) / preview.width).toBeCloseTo(0.22, 8);
    expect(getStickerBaseSize(output) / output.width).toBeCloseTo(0.22, 8);
  });

  it("preserves the sticker image aspect ratio while scaling", () => {
    const geometry = getStickerRenderGeometry(
      { x: 70, y: 20, scale: 1.5, rotation: 12, opacity: 0.8 },
      { naturalWidth: 200, naturalHeight: 100 },
      { width: 2160, height: 3840 },
    );
    expect(geometry.width / geometry.height).toBeCloseTo(2, 8);
    expect(geometry.width / 2160).toBeCloseTo(0.33, 8);
    expect(geometry.centerX).toBe(1512);
    expect(geometry.centerY).toBe(768);
  });
});
