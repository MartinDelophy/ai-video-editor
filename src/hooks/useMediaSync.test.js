import { describe, expect, it, vi } from "vitest";
import { syncTimelineAudioElement, syncVoiceAudioSegments } from "./useMediaSync.js";

function makeMedia(overrides = {}) {
  return {
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    preservesPitch: true,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    ...overrides,
  };
}

describe("syncTimelineAudioElement", () => {
  it("immediately pauses every playing voice when the track is hidden", () => {
    const first = makeMedia({ paused: false });
    const second = makeMedia({ paused: false });
    syncVoiceAudioSegments({
      segments: [{ id: "one", start: 0, duration: 8 }, { id: "two", start: 0, duration: 8 }],
      refs: { current: new Map([["one", first], ["two", second]]) },
      timelineTime: 2,
      isPlaying: true,
      audible: false,
    });
    expect(first.pause).toHaveBeenCalledOnce();
    expect(second.pause).toHaveBeenCalledOnce();
  });

  it("restarts an active voice at the current timeline time when made audible", () => {
    const media = makeMedia({ paused: true });
    syncVoiceAudioSegments({
      segments: [{ id: "one", start: 1, duration: 8 }],
      refs: { current: new Map([["one", media]]) },
      timelineTime: 4,
      isPlaying: true,
      audible: true,
    });
    expect(media.currentTime).toBe(3);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it("maps a sped-up voice to source time and native playback rate", () => {
    const media = makeMedia({ paused: true });
    syncVoiceAudioSegments({
      segments: [{ id: "fast", start: 1, duration: 4, sourceStart: 0.5, playbackRate: 2 }],
      refs: { current: new Map([["fast", media]]) },
      timelineTime: 2.5,
      isPlaying: true,
      audible: true,
    });
    expect(media.currentTime).toBe(3.5);
    expect(media.playbackRate).toBe(2);
    expect(media.preservesPitch).toBe(true);
  });

  it("aligns once when native playback starts", () => {
    const media = makeMedia({ currentTime: 0.2 });
    syncTimelineAudioElement(media, { active: true, shouldPlay: true, expectedTime: 3.5 });
    expect(media.currentTime).toBe(3.5);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it("does not seek media that is already playing", () => {
    const media = makeMedia({ currentTime: 5.8, paused: false });
    syncTimelineAudioElement(media, { active: true, shouldPlay: true, expectedTime: 5.1 });
    expect(media.currentTime).toBe(5.8);
    expect(media.play).not.toHaveBeenCalled();
    expect(media.pause).not.toHaveBeenCalled();
  });

  it("does not interrupt a background music play request that is still pending", () => {
    const media = makeMedia({ currentTime: 0, paused: true, __timelinePlayPending: true });
    syncTimelineAudioElement(media, { active: true, shouldPlay: true, expectedTime: 1.2 });
    expect(media.currentTime).toBe(0);
    expect(media.play).not.toHaveBeenCalled();
  });

  it("pauses media after it leaves its timeline range", () => {
    const media = makeMedia({ paused: false });
    syncTimelineAudioElement(media, { active: false, shouldPlay: true, expectedTime: 0 });
    expect(media.pause).toHaveBeenCalledOnce();
  });
});
