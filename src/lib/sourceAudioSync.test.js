import { describe, expect, it } from "vitest";
import { getLinkedSourceAudioEnd, getLinkedSourceAudioSegments, getLinkedSourceAudioState, shouldMuteEmbeddedVideoAudio } from "./sourceAudioSync.js";

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

  it("keeps source audio mappings for multiple imported video assets", () => {
    const clips = [
      { id: "first", assetId: "video-1", type: "video", duration: 4, sourceStart: 0, sourceDuration: 4, sourceAudioOffset: 0 },
      { id: "second", assetId: "video-2", type: "video", duration: 3, sourceStart: 0, sourceDuration: 3, sourceAudioOffset: 4 },
    ];
    const segments = getLinkedSourceAudioSegments(clips, "", 7);
    expect(segments).toMatchObject([
      { id: "first", assetId: "video-1", start: 0, duration: 4, sourceStart: 0 },
      { id: "second", assetId: "video-2", start: 4, duration: 3, sourceStart: 4 },
    ]);
    expect(getLinkedSourceAudioState(segments, 2)).toMatchObject({ active: true, sourceTime: 2 });
    expect(getLinkedSourceAudioState(segments, 5)).toMatchObject({ active: true, sourceTime: 5 });
  });

  it("omits only the linked audio piece disabled on its visual clip", () => {
    const segments = getLinkedSourceAudioSegments(
      visualSegments.map((segment) => segment.id === "a" ? { ...segment, sourceAudioDisabled: true } : segment),
      "video-1",
      6,
    );
    expect(segments.map((segment) => segment.id)).toEqual(["c"]);
  });

  it("plays embedded video audio until that clip has an extracted source-audio mapping", () => {
    const clip = { id: "video-clip", assetId: "video-1", type: "video" };
    expect(shouldMuteEmbeddedVideoAudio(clip)).toBe(false);
    expect(shouldMuteEmbeddedVideoAudio({ ...clip, sourceAudioDisabled: true })).toBe(true);
    expect(shouldMuteEmbeddedVideoAudio(clip, { sourceAudioBlob: new Blob(), sourceAudioAssetId: "video-1" })).toBe(true);
    expect(shouldMuteEmbeddedVideoAudio(clip, { sourceAudioBlob: new Blob(), sourceAudioAssetId: "another-video" })).toBe(false);
  });
});
