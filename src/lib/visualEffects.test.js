import { describe, expect, it } from "vitest";
import { getCircleMaskCss, getVisualMaskFeatherPixels, getVisualMaskInsets, getVisualMaskSvgDataUrl, getVisualSourceTime, hasVisualPropertyKeyframe, normalizeVisualKeyframes, removeVisualPropertyKeyframe, resolveVisualTransform, snapVisualScaleToFrameEdges, updateVisualSegmentPlaybackRate, upsertVisualKeyframe, upsertVisualPropertyKeyframe } from "./visualEffects.js";

describe("visual effects", () => {
  it("snaps visual scaling to nearby frame edges", () => {
    const snapped = snapVisualScaleToFrameEdges({ x: 0, y: 0, scale: 0.985, rotation: 0 }, { width: 360, height: 640 });
    expect(snapped.transform.scale).toBe(1);
    expect(snapped.guides).toEqual(["left", "right", "top", "bottom"]);
  });

  it("keeps free scaling outside the edge snap threshold", () => {
    const transform = { x: 0, y: 0, scale: 0.8, rotation: 0 };
    expect(snapVisualScaleToFrameEdges(transform, { width: 360, height: 640 })).toEqual({ transform, guides: [] });
  });

  it("maps timeline time to source time using the clip playback rate", () => {
    expect(getVisualSourceTime({ sourceStart: 1.5, playbackRate: 2 }, 2)).toBe(5.5);
  });

  it("retimes a video clip and its keyframes when playback speed changes", () => {
    const segment = updateVisualSegmentPlaybackRate({
      id: "video-1",
      type: "video",
      duration: 10,
      sourceDuration: 10,
      playbackRate: 1,
      keyframes: [{ time: 2, x: 10 }, { time: 8, x: 80 }],
    }, 2);
    expect(segment).toMatchObject({ duration: 5, sourceDuration: 10, playbackRate: 2 });
    expect(segment.keyframes.map((frame) => frame.time)).toEqual([1, 4]);
  });

  it("preserves the selected source span across repeated speed changes", () => {
    const faster = updateVisualSegmentPlaybackRate({ type: "video", duration: 10 }, 2);
    const slower = updateVisualSegmentPlaybackRate(faster, 0.5);
    expect(faster.sourceDuration).toBe(10);
    expect(slower.sourceDuration).toBe(10);
    expect(slower.duration).toBe(20);
  });

  it("interpolates visual keyframes", () => {
    expect(resolveVisualTransform([{ time: 0, x: 0, scale: 1 }, { time: 2, x: 40, scale: 2 }], 1))
      .toMatchObject({ x: 20, scale: 1.5 });
  });

  it("applies a clip-wide base transform when no keyframe was explicitly added", () => {
    const baseTransform = { x: 12, y: -8, scale: 1.6, rotation: 4, opacity: 0.75 };
    expect(resolveVisualTransform([], 0, baseTransform)).toEqual(baseTransform);
    expect(resolveVisualTransform([], 8, baseTransform)).toEqual(baseTransform);
  });

  it("uses the clip-wide transform before sparse keyframes and for unkeyed properties", () => {
    const baseTransform = { x: 10, y: -8, scale: 1.4, rotation: 4, opacity: 0.75 };
    expect(resolveVisualTransform([{ time: 2, scale: 2 }], 1, baseTransform)).toEqual(baseTransform);
    expect(resolveVisualTransform([{ time: 2, scale: 2 }], 3, baseTransform))
      .toEqual({ ...baseTransform, scale: 2 });
  });

  it("keeps defaults before the first keyframe, interpolates between frames, and holds the last frame", () => {
    const frames = [{ time: 1, x: 20, scale: 1.2 }, { time: 3, x: 60, scale: 1.6 }];
    expect(resolveVisualTransform(frames, 0.5)).toMatchObject({ x: 0, scale: 1 });
    expect(resolveVisualTransform(frames, 1)).toMatchObject({ x: 20, scale: 1.2 });
    expect(resolveVisualTransform(frames, 2)).toMatchObject({ x: 40, scale: 1.4 });
    expect(resolveVisualTransform(frames, 3.5)).toMatchObject({ x: 60, scale: 1.6 });
  });

  it("replaces a keyframe at the same time", () => {
    expect(upsertVisualKeyframe([{ time: 1, x: 2 }], 1.02, { x: 8 })).toHaveLength(1);
  });

  it("coalesces duplicate sparse frames before resolving them", () => {
    expect(normalizeVisualKeyframes([{ time: 1, x: 20 }, { time: 1.02, opacity: 0.5 }]))
      .toEqual([{ time: 1.02, x: 20, opacity: 0.5 }]);
  });

  it("matches the editor workflow before, between, and after two edited frames", () => {
    let frames = upsertVisualKeyframe([], 1, resolveVisualTransform([], 1));
    frames = upsertVisualPropertyKeyframe(frames, 1, "x", 20);
    frames = upsertVisualKeyframe(frames, 3, resolveVisualTransform(frames, 3));
    frames = upsertVisualPropertyKeyframe(frames, 3, "x", 60);
    expect(resolveVisualTransform(frames, 0.5).x).toBe(0);
    expect(resolveVisualTransform(frames, 1).x).toBe(20);
    expect(resolveVisualTransform(frames, 2).x).toBe(40);
    expect(resolveVisualTransform(frames, 4).x).toBe(60);
  });

  it("stores and interpolates complete transforms using only add-all frames", () => {
    let frames = upsertVisualKeyframe([], 1, { x: 20, y: -10, scale: 1.2, rotation: 5, opacity: 0.8 });
    frames = upsertVisualKeyframe(frames, 3, { x: 60, y: 30, scale: 1.6, rotation: 25, opacity: 0.4 });
    expect(frames).toEqual([
      { time: 1, x: 20, y: -10, scale: 1.2, rotation: 5, opacity: 0.8 },
      { time: 3, x: 60, y: 30, scale: 1.6, rotation: 25, opacity: 0.4 },
    ]);
    expect(resolveVisualTransform(frames, 0.5)).toEqual({ scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 });
    const midpoint = resolveVisualTransform(frames, 2);
    expect(midpoint).toMatchObject({ scale: 1.4, x: 40, y: 10, rotation: 15 });
    expect(midpoint.opacity).toBeCloseTo(0.6);
    expect(resolveVisualTransform(frames, 4)).toEqual({ scale: 1.6, x: 60, y: 30, rotation: 25, opacity: 0.4 });
  });

  it("interpolates sparse property keyframes independently", () => {
    expect(resolveVisualTransform([{ time: 0, x: 0 }, { time: 1, opacity: 0.5 }, { time: 2, x: 40 }], 1))
      .toMatchObject({ x: 20, opacity: 0.5, scale: 1, y: 0 });
  });

  it("adds and removes one property without touching others", () => {
    const added = upsertVisualPropertyKeyframe([{ time: 1, x: 12 }], 1, "opacity", 0.4);
    expect(added).toEqual([{ time: 1, x: 12, opacity: 0.4 }]);
    expect(hasVisualPropertyKeyframe(added, 1, "opacity")).toBe(true);
    expect(removeVisualPropertyKeyframe(added, 1, "opacity")).toEqual([{ time: 1, x: 12 }]);
  });

  it("maps a moved mask to CSS inset sides without mirroring", () => {
    expect(getVisualMaskInsets({ centerX: 30, centerY: 60, width: 40, height: 20 }))
      .toEqual({ top: 50, right: 50, bottom: 30, left: 10 });
  });

  it("does not stack a gradient mask on a zero-feather circle", () => {
    expect(getCircleMaskCss({ type: "circle", size: 72, feather: 0 }, { width: 1600, height: 900 })).toBe("");
  });

  it("uses the full pixel radius for a feathered circle", () => {
    expect(getCircleMaskCss({ type: "circle", size: 72, feather: 10 }, { width: 1600, height: 900 }))
      .toBe("radial-gradient(circle 324px at 50% 50%, #000 90%, transparent 100%)");
  });

  it("builds an alpha hole for an inverted rectangle", () => {
    const svg = decodeURIComponent(getVisualMaskSvgDataUrl({ type: "rectangle", inverted: true }, { width: 1000, height: 500 }).split(",")[1]);
    expect(svg).toContain('<rect width="1000" height="500" fill="white"/>');
    expect(svg).toContain('width="800" height="400" rx="0" fill="black"');
  });

  it("adds blur to feathered rectangle and rounded masks", () => {
    for (const type of ["rectangle", "rounded"]) {
      const svg = decodeURIComponent(getVisualMaskSvgDataUrl({ type, feather: 20 }, { width: 1000, height: 500 }).split(",")[1]);
      expect(svg).toContain("<feGaussianBlur");
      expect(svg).toContain('filter="url(#blur)"');
    }
  });

  it("scales feather width from the active shape rather than the full frame", () => {
    expect(getVisualMaskFeatherPixels({ type: "rectangle", width: 80, height: 40, feather: 20 }, { width: 1000, height: 500 })).toBe(10);
  });
});
