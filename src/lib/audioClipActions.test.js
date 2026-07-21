import { describe, expect, it } from "vitest";

import { normalizeAudioPlaybackRate, updateAudioSegmentPlaybackRate } from "./audioClipActions.js";

describe("audio clip playback speed", () => {
  it("changes timeline duration while preserving source duration", () => {
    const segment = updateAudioSegmentPlaybackRate({ duration: 4, playbackRate: 1, fadeIn: 1, fadeOut: 1 }, 2);
    expect(segment).toMatchObject({ playbackRate: 2, sourceDuration: 4, duration: 2, fadeIn: 1, fadeOut: 1 });
  });

  it("restores the original duration when returning to normal speed", () => {
    const fast = updateAudioSegmentPlaybackRate({ duration: 4, playbackRate: 1 }, 2);
    const normal = updateAudioSegmentPlaybackRate(fast, 1);
    expect(normal.duration).toBe(4);
  });

  it("clamps supported playback speed", () => {
    expect(normalizeAudioPlaybackRate(0.1)).toBe(0.25);
    expect(normalizeAudioPlaybackRate(8)).toBe(4);
  });
});
