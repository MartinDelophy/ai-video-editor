import { describe, expect, it, vi } from "vitest";

import { createTimelineCutActions } from "./timelineCutActions.js";

describe("timeline cut actions", () => {
  it("cuts music at the playhead and preserves waveform and source offsets", () => {
    let musicSegments = [];
    const notify = vi.fn();
    const actions = createTimelineCutActions({
      currentTime: 6,
      musicBlob: new Blob(["music"]),
      musicDuration: 10,
      musicPeaks: [0.1, 0.2, 0.3, 0.4],
      musicSegments,
      musicStart: 2,
      notify,
      selectedTrack: "music",
      setMusicSegments: (segments) => { musicSegments = segments; },
      trackLocks: {},
    });

    actions.handleCutTrack();

    expect(musicSegments).toHaveLength(2);
    expect(musicSegments[0]).toMatchObject({ start: 2, duration: 4, sourceStart: 0, peaks: [0.1, 0.2] });
    expect(musicSegments[1]).toMatchObject({ start: 6, duration: 6, sourceStart: 4, peaks: [0.3, 0.4] });
    expect(notify).toHaveBeenCalledWith("已在播放头位置切开音乐片段");
  });

  it("cuts a selected voiceover at the playhead and offsets the second source", () => {
    const source = {
      id: "voice-original",
      blob: new Blob(["voice"]),
      url: "blob:voice-original",
      start: 2,
      duration: 4,
      sourceStart: 1,
      peaks: [0.1, 0.2, 0.3, 0.4],
      fadeIn: 0.2,
      fadeOut: 0.3,
    };
    let audioSegments = [source];
    let captions = [{ id: "caption", audioSegmentId: source.id, start: 2, end: 6 }];
    let selectedId = source.id;
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const actions = createTimelineCutActions({
      audioSegments,
      currentTime: 3.5,
      notify: vi.fn(),
      selectedAudioSegmentId: source.id,
      selectedTrack: "audio",
      setAudioSegments: (updater) => { audioSegments = updater(audioSegments); },
      setCaptionSegments: (updater) => { captions = updater(captions); },
      setSelectedAudioSegmentId: (id) => { selectedId = id; },
      trackLocks: {},
    });

    actions.handleCutTrack();

    expect(audioSegments).toHaveLength(2);
    expect(audioSegments[0]).toMatchObject({ start: 2, duration: 1.5, sourceStart: 1, url: "blob:first", fadeOut: 0 });
    expect(audioSegments[1]).toMatchObject({ start: 3.5, duration: 2.5, sourceStart: 2.5, url: "blob:second", fadeIn: 0 });
    expect(audioSegments[0].peaks).toEqual([0.1, 0.2]);
    expect(audioSegments[1].peaks).toEqual([0.3, 0.4]);
    expect(captions[0]).toMatchObject({ audioSegmentId: audioSegments[0].id, end: 3.5 });
    expect(selectedId).toBe(audioSegments[1].id);
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith(source.url);
  });
});
