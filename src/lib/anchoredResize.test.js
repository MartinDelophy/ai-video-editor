import { describe, expect, it } from "vitest";
import { getAnchoredResize } from "./anchoredResize.js";

describe("getAnchoredResize", () => {
  it("keeps the opposite corner fixed while resizing", () => {
    const result = getAnchoredResize({
      handle: "se", pointer: { x: 300, y: 300 },
      frame: { left: 0, top: 0, width: 200, height: 200 },
      box: { width: 200, height: 200 }, transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    });
    expect(result).toMatchObject({ x: 25, y: 25, scale: 1.5 });
  });

  it("uses the opposite edge as the anchor for an edge handle", () => {
    const result = getAnchoredResize({
      handle: "e", pointer: { x: 250, y: 100 },
      frame: { left: 0, top: 0, width: 200, height: 200 },
      box: { width: 100, height: 80 }, transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    });
    expect(result).toMatchObject({ x: 25, y: 0, scale: 2 });
  });
});
