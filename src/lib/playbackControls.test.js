import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlaybackControls } from "./playbackControls.js";

afterEach(() => vi.unstubAllGlobals());

function createDeps(overrides = {}) {
  return {
    isPlaying: true,
    timelineDuration: 10,
    timelineDurationRef: { current: 10 },
    trackScrollRef: { current: { getBoundingClientRect: () => ({ left: 100, width: 500 }) } },
    currentTimeRef: { current: 0 },
    setCurrentTime: vi.fn(), setIsPlaying: vi.fn(),
    audioSegments: [], audioSegmentRefs: { current: new Map() },
    sourceAudioRef: { current: { pause: vi.fn(), currentTime: 0 } },
    musicRef: { current: { pause: vi.fn(), currentTime: 0 } },
    previewVideoRef: { current: { pause: vi.fn() } },
    sourceAudioLinked: false, sourceAudioStart: 0, sourceAudioDuration: 0,
    musicStart: 0, musicDuration: 0,
    ...overrides,
  };
}

describe("timeline playhead seeking", () => {
  it("pauses playback immediately on pointer-down before any move", () => {
    const pointerListeners = new Map();
    vi.stubGlobal("addEventListener", vi.fn((type, listener) => pointerListeners.set(type, listener)));
    vi.stubGlobal("removeEventListener", vi.fn());
    const deps = createDeps();
    const controls = createPlaybackControls(deps);
    controls.startTimelineSeek({
      button: 0, clientX: 250, preventDefault: vi.fn(), stopPropagation: vi.fn(),
    });
    expect(deps.sourceAudioRef.current.pause).toHaveBeenCalledTimes(1);
    expect(deps.musicRef.current.pause).toHaveBeenCalledTimes(1);
    expect(deps.previewVideoRef.current.pause).toHaveBeenCalledTimes(1);
    expect(deps.setIsPlaying).toHaveBeenCalledWith(false);
    expect(deps.setCurrentTime).toHaveBeenCalledWith(3);
    expect(pointerListeners.has("pointermove")).toBe(true);
  });

  it("does not issue a redundant pause when playback is already stopped", () => {
    vi.stubGlobal("addEventListener", vi.fn());
    vi.stubGlobal("removeEventListener", vi.fn());
    const deps = createDeps({ isPlaying: false });
    createPlaybackControls(deps).startTimelineSeek({
      button: 0, clientX: 350, preventDefault: vi.fn(), stopPropagation: vi.fn(),
    });
    expect(deps.previewVideoRef.current.pause).not.toHaveBeenCalled();
    expect(deps.setIsPlaying).not.toHaveBeenCalled();
    expect(deps.setCurrentTime).toHaveBeenCalledWith(5);
  });
});
