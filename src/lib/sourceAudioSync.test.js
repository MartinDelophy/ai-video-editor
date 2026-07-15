import { describe, expect, it } from "vitest";
import { getLinkedSourceAudioEnd, getLinkedSourceAudioSegments, getLinkedSourceAudioState } from "./sourceAudioSync.js";

describe("linked source audio", () => {
  const visualSegments = [
    { id: "a", assetId: "video-1", type: "video", duration: 2, sourceStart: 0, sourceDuration: 4, playbackRate: 2 },
    { id: "b", assetId: "image-1", type: "image", duration: 1 },
    { id: "c", assetId: "video-1", type: "video", duration: 2, sourceStart: 4, sourceDuration: 2, playbackRate: 1 },
  ];

  it("aligns linked audio pieces with their matching visual segments", () => {
    const segments = getLinkedSourceAudioSegments(visualSegments, "video-1", 6);
    expect(segments).toMatchObject([
      { id: "a", start: 0, duration: 2, sourceStart: 0, playbackRate: 2 },
      { id: "c", start: 3, duration: 2, sourceStart: 4, playbackRate: 1 },
    ]);
    expect(getLinkedSourceAudioEnd(segments)).toBe(5);
  });

  it("maps timeline time to the correct audio source time", () => {
    const segments = getLinkedSourceAudioSegments(visualSegments, "video-1", 6);
    expect(getLinkedSourceAudioState(segments, 1)).toMatchObject({ active: true, sourceTime: 2, playbackRate: 2 });
    expect(getLinkedSourceAudioState(segments, 2.5)).toMatchObject({ active: false, playbackRate: 1 });
    expect(getLinkedSourceAudioState(segments, 4)).toMatchObject({ active: true, sourceTime: 5, playbackRate: 1 });
  });
});
