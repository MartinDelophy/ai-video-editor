import { describe, expect, it } from "vitest";
import { createMainVisualFromOverlay, createVisualOverlaySegment, getActiveVisualOverlays, getVisualOverlayContainBox, getVisualOverlayPixelBox, getVisualOverlayPreset, snapVisualOverlayTransform, updateVisualOverlayTransform } from "./visualOverlayTimeline.js";

describe("visual overlay timeline", () => {
  it("promotes an overlay to a full main-track visual while preserving its media and duration", () => {
    const overlay = createVisualOverlaySegment({ id: "asset-1", name: "clip.png", type: "image", src: "blob:test", width: 800, height: 600 }, 3, { duration: 4 });
    const visual = createMainVisualFromOverlay(overlay);
    expect(visual).toMatchObject({ assetId: "asset-1", name: "clip.png", type: "image", src: "blob:test", width: 800, height: 600, duration: 4 });
    expect(visual.id).not.toBe(overlay.id);
    expect(visual).not.toHaveProperty("start");
    expect(visual).not.toHaveProperty("layer");
  });
  it("creates a picture-in-picture clip at the requested time", () => {
    const clip = createVisualOverlaySegment({ id: "asset", name: "camera", type: "video", src: "blob:test", duration: 3, trackFrames: ["frame-a", "frame-b"] }, 4, { id: "pip" });
    expect(clip).toMatchObject({ id: "pip", start: 4, duration: 3, type: "video", layer: 1, muted: false, trackFrames: ["frame-a", "frame-b"] });
    expect(clip.baseTransform).toMatchObject({ scale: 0.34, x: 27, y: -24 });
    expect(clip.keyframes).toEqual([]);
  });

  it("preserves a square overlay box inside portrait and landscape frames", () => {
    const square = { width: 2048, height: 2048 };
    expect(getVisualOverlayContainBox(square, "9 / 16")).toEqual({ widthPercent: 100, heightPercent: 56.25 });
    expect(getVisualOverlayContainBox(square, "16 / 9")).toEqual({ widthPercent: 56.25, heightPercent: 100 });
  });

  it("creates pixel bounds that hug the overlay content", () => {
    expect(getVisualOverlayPixelBox({ width: 2048, height: 2048 }, { width: 291, height: 518 }))
      .toEqual({ width: 291, height: 291 });
    const portrait = getVisualOverlayPixelBox({ width: 720, height: 1280 }, { width: 291, height: 518 });
    expect(portrait.width).toBe(291);
    expect(portrait.height).toBeCloseTo(517.3333);
  });

  it("preserves non-square source aspect ratios in the overlay box", () => {
    const box = getVisualOverlayContainBox({ width: 1920, height: 1080 }, "9 / 16");
    expect(box.widthPercent).toBe(100);
    expect(box.heightPercent).toBeCloseTo(31.640625);
  });

  it("returns only active overlays in layer order", () => {
    const clips = [
      { id: "top", start: 0, duration: 5, layer: 2 },
      { id: "past", start: 0, duration: 1, layer: 3 },
      { id: "bottom", start: 1, duration: 5, layer: 1 },
    ];
    expect(getActiveVisualOverlays(clips, 2).map((clip) => clip.id)).toEqual(["bottom", "top"]);
  });

  it("stores direct manipulation as a real keyframe", () => {
    const clip = createVisualOverlaySegment({ src: "x" }, 0, { id: "pip" });
    const updated = updateVisualOverlayTransform(clip, 1.25, { x: 5, y: 6, scale: 0.5, rotation: 10, opacity: 1 });
    expect(updated.keyframes.at(-1)).toMatchObject({ time: 1.25, x: 5, y: 6, scale: 0.5, rotation: 10 });
  });

  it("snaps overlay centers and edges to the canvas", () => {
    expect(snapVisualOverlayTransform({ x: 0.8, y: -33.4, scale: 0.34 }).transform).toMatchObject({ x: 0, y: -33 });
    expect(snapVisualOverlayTransform({ x: 0.8, y: -33.4, scale: 0.34 }).guides).toEqual(["center-x", "top"]);
  });

  it("provides deterministic layout presets", () => {
    expect(getVisualOverlayPreset("bottom-right")).toMatchObject({ x: 29, y: 27, scale: 0.32 });
    expect(getVisualOverlayPreset("missing")).toBeNull();
  });
});
