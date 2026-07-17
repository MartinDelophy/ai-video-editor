import { describe, expect, it } from "vitest";

import {
  createOfflineFramePlan,
  getOfflineExportCodec,
  getOfflineStickersAtTime,
} from "./offlineVideoExport.js";
import { getVisualDimensions } from "./media.js";

describe("offline video export", () => {
  it("creates deterministic frame timestamps without wall-clock drift", () => {
    const frames = createOfflineFramePlan(1, 30);
    expect(frames).toHaveLength(30);
    expect(frames[0]).toMatchObject({ index: 0, timestamp: 0, duration: 1 / 30, keyFrame: true });
    expect(frames[29].timestamp).toBeCloseTo(29 / 30, 8);
  });

  it("uses stable two-second keyframe intervals", () => {
    const frames = createOfflineFramePlan(4.1, 30);
    expect(frames.filter((frame) => frame.keyFrame).map((frame) => frame.index)).toEqual([0, 60, 120]);
  });

  it("maps codecs directly to their final container without a lossy intermediate", () => {
    expect(getOfflineExportCodec({ codec: "h264" })).toMatchObject({ video: "avc", audio: "aac", extension: "mp4" });
    expect(getOfflineExportCodec({ codec: "vp9" })).toMatchObject({ video: "vp9", audio: "opus", extension: "webm" });
  });

  it("resolves overlapping sticker clips at exact timeline timestamps", () => {
    const stickers = [
      { id: "a", start: 0, duration: 2 },
      { id: "b", start: 1, duration: 2 },
    ];
    expect(getOfflineStickersAtTime(stickers, null, 1.5).map((item) => item.id)).toEqual(["a", "b"]);
    expect(getOfflineStickersAtTime(stickers, null, 2).map((item) => item.id)).toEqual(["b"]);
  });

  it("renders no sticker after the final timeline sticker is deleted", () => {
    expect(getOfflineStickersAtTime([], null, 1)).toEqual([]);
  });

  it("preserves decoded canvas dimensions instead of treating frames as square", () => {
    expect(getVisualDimensions({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(getVisualDimensions({ videoWidth: 1280, videoHeight: 720, width: 1, height: 1 })).toEqual({ width: 1280, height: 720 });
  });
});
