import { describe, expect, it } from "vitest";
import { createEmbeddedVideoAudioSegments } from "./embeddedVideoAudioExport.js";

describe("embedded video audio export mapping", () => {
  it("keeps embedded audio after the separated source track has been removed", () => {
    const visuals = [
      { id: "image", type: "image", duration: 4 },
      { id: "video", assetId: "asset-video", type: "video", duration: 5, sourceStart: 2, sourceDuration: 10, playbackRate: 2 },
    ];
    const segments = createEmbeddedVideoAudioSegments(visuals, new Map([
      ["asset-video", { offset: 0, duration: 15 }],
    ]));
    expect(segments).toEqual([{
      id: "video", assetId: "asset-video", start: 4, duration: 5,
      sourceStart: 2, sourceDuration: 10, playbackRate: 2,
    }]);
  });

  it("does not export embedded audio from a muted video clip", () => {
    const visuals = [{ id: "video", assetId: "asset-video", type: "video", duration: 5, sourceAudioDisabled: true }];
    expect(createEmbeddedVideoAudioSegments(visuals, new Map([
      ["asset-video", { offset: 0, duration: 15 }],
    ]))).toEqual([]);
  });
});
