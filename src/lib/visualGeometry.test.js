import { describe, expect, it } from "vitest";

import {
  getSmartCropRect,
  getVisualFitRect,
  normalizeBoundingBox,
  selectPrimarySubject,
} from "./visualGeometry.js";

describe("visual geometry", () => {
  it("contains a 9:16 source inside 16:9 with centered black side space", () => {
    const rect = getVisualFitRect({ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, "contain");
    expect(rect.height).toBe(1080);
    expect(rect.width).toBeCloseTo(607.5, 6);
    expect(rect.x).toBeCloseTo(656.25, 6);
    expect(rect.y).toBe(0);
  });

  it("only crops a portrait source when cover is explicitly requested", () => {
    const rect = getVisualFitRect({ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, "cover");
    expect(rect.width).toBe(1920);
    expect(rect.height).toBeCloseTo(3413.333333, 5);
    expect(rect.y).toBeLessThan(0);
  });

  it("normalizes pixel coordinates", () => {
    const box = normalizeBoundingBox(
      { xMin: 100, yMin: 50, xMax: 500, yMax: 450 },
      { width: 1000, height: 500 },
    );
    expect(box).toMatchObject({ xMin: 0.1, yMin: 0.1, xMax: 0.5, yMax: 0.9 });
  });

  it("clamps normalized coordinates into the frame", () => {
    const box = normalizeBoundingBox({
      xMin: -0.2,
      yMin: 0.1,
      xMax: 1.4,
      yMax: 0.8,
      coordinateSpace: "normalized",
    });
    expect(box).toMatchObject({ xMin: 0, yMin: 0.1, xMax: 1, yMax: 0.8 });
  });

  it("prefers a person subject over a similarly scored object", () => {
    const subject = selectPrimarySubject([
      { label: "chair", score: 0.95, box: { xMin: 0.2, yMin: 0.2, xMax: 0.8, yMax: 0.8 } },
      { label: "person", score: 0.82, box: { xMin: 0.35, yMin: 0.1, xMax: 0.65, yMax: 0.9 } },
    ]);
    expect(subject.label).toBe("person");
  });

  it("creates an in-bounds crop with the requested aspect ratio", () => {
    const crop = getSmartCropRect(
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      { xMin: 0.7, yMin: 0.1, xMax: 0.95, yMax: 0.9 },
    );
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1920);
    expect(crop.height).toBeLessThanOrEqual(1080);
    expect(crop.width / crop.height).toBeCloseTo(1080 / 1920, 6);
  });
});
