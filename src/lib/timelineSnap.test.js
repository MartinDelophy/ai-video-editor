import { describe, expect, it } from "vitest";

import { collectTimelineSnapPoints, snapTimelineRange } from "./timelineSnap.js";

describe("cross-track timeline snapping", () => {
  it("collects start and end boundaries from every timed track", () => {
    const points = collectTimelineSnapPoints({
      visualSegments: [{ id: "visual", duration: 2 }],
      captionSegments: [{ id: "caption", text: "x", start: 3, end: 4 }],
      stickerSegments: [{ id: "sticker", start: 5, duration: 1 }],
      audioSegments: [{ id: "voice", start: 7, duration: 2 }],
      sourceAudioStart: 10, sourceAudioDuration: 2,
      musicStart: 13, musicDuration: 2,
      timelineDuration: 20,
    });
    expect(points.map((point) => point.time)).toEqual(expect.arrayContaining([0, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13, 15]));
  });

  it("snaps either moving edge to the closest foreign boundary", () => {
    expect(snapTimelineRange(2.94, 1, [{ time: 3, track: "caption", id: "a" }], 0.1)).toMatchObject({ start: 3, guide: { time: 3 } });
    expect(snapTimelineRange(1.96, 1, [{ time: 3, track: "audio", id: "b" }], 0.1)).toMatchObject({ start: 2, guide: { time: 3 } });
  });
});
