import { describe, expect, it } from "vitest";
import { getAutoEditLanguage, normalizeGeneratedCaptions, selectChangedFrames } from "./autoEdit.js";

describe("auto edit", () => {
  it("keeps scene changes and clip boundaries", () => {
    const frames = [{ segmentId: "a", time: 0, difference: 1 }, { segmentId: "a", time: 1, difference: .03 }, { segmentId: "a", time: 2, difference: .3 }, { segmentId: "b", time: 3, difference: .01 }];
    expect(selectChangedFrames(frames).map((frame) => frame.time)).toEqual([0, 2, 3]);
  });
  it("falls back to an officially supported output language", () => expect(getAutoEditLanguage("zh")).toBe("en"));
  it("clamps and sorts generated captions", () => {
    const result = normalizeGeneratedCaptions({ captions: [{ start: 4, end: 9, text: "B" }, { start: -2, end: 1, text: "A" }] }, 5);
    expect(result.map(({ text, start, end }) => ({ text, start, end }))).toEqual([{ text: "A", start: 0, end: 1 }, { text: "B", start: 4, end: 5 }]);
  });
});
