import { describe, expect, it, vi } from "vitest";

import { createCaptionEditingActions, findCaptionAudioLinkTarget, snapCaptionPlacement } from "./captionEditingActions.js";

describe("caption canvas snapping", () => {
  it("snaps captions to the horizontal center and bottom safe position", () => {
    expect(snapCaptionPlacement(49.2, 77.4, 1, 1)).toEqual({
      x: 50, y: 78, guideX: 50, guideY: 78,
    });
  });

  it("keeps freely placed captions outside the snap threshold", () => {
    expect(snapCaptionPlacement(42, 63, 1, 1)).toEqual({
      x: 42, y: 63, guideX: null, guideY: null,
    });
  });
});

describe("caption voiceover links", () => {
  const createHarness = () => {
    let captions = [{ id: "caption-1", text: "Hello", start: 3, end: 4, audioSegmentId: "voice-1" }];
    const audioSegments = [{ id: "voice-1", name: "Heart", start: 1, duration: 2 }];
    const setCaptionSegments = vi.fn((update) => { captions = typeof update === "function" ? update(captions) : update; });
    const d = {
      audioSegments, captionSegments: captions, trackLocks: { caption: false }, setCaptionSegments,
      notify: vi.fn(), t: (key) => key,
    };
    return { actions: createCaptionEditingActions(d), audioSegments, getCaptions: () => captions };
  };

  it("unlinks without moving either clip and relinks the remembered voiceover", () => {
    const { actions, getCaptions } = createHarness();
    actions.unlinkCaptionAudio("caption-1");
    expect(getCaptions()[0]).toMatchObject({ start: 3, end: 4, audioSegmentId: "", detachedAudioSegmentId: "voice-1" });
    actions.linkCaptionAudio("caption-1");
    expect(getCaptions()[0]).toMatchObject({ start: 3, end: 4, audioSegmentId: "voice-1" });
  });

  it("aligns a linked caption to the voiceover range only on demand", () => {
    const { actions, getCaptions } = createHarness();
    actions.alignCaptionToAudio("caption-1");
    expect(getCaptions()[0]).toMatchObject({ start: 1, end: 3, audioSegmentId: "voice-1" });
  });

  it("prefers a remembered link before overlap-based matching", () => {
    const target = findCaptionAudioLinkTarget(
      { start: 9, end: 10, detachedAudioSegmentId: "voice-1" },
      [{ id: "voice-1", start: 0, duration: 1 }, { id: "voice-2", start: 9, duration: 1 }],
    );
    expect(target.id).toBe("voice-1");
  });

  it("does not crash when a future caller omits the translator", () => {
    let captions = [{ id: "caption-1", start: 0, end: 1, audioSegmentId: "voice-1" }];
    const actions = createCaptionEditingActions({
      audioSegments: [{ id: "voice-1", start: 0, duration: 1 }],
      captionSegments: captions,
      trackLocks: { caption: false },
      setCaptionSegments: (update) => { captions = update(captions); },
      notify: vi.fn(),
    });
    expect(() => actions.unlinkCaptionAudio("caption-1")).not.toThrow();
  });
});
