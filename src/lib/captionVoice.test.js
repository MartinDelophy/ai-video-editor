import { describe, expect, it } from "vitest";

import { getCaptionVoiceSegment } from "./captionVoice.js";

describe("getCaptionVoiceSegment", () => {
  const oldVoice = { id: "voice-old", url: "blob:old", blob: { size: 10 } };
  const newVoice = { id: "voice-new", url: "blob:new", blob: { size: 20 } };
  const audioSegments = [oldVoice, newVoice];

  it("returns only the voice linked to the selected caption", () => {
    expect(getCaptionVoiceSegment(audioSegments, { id: "caption-old", audioSegmentId: "voice-old" })).toBe(oldVoice);
    expect(getCaptionVoiceSegment(audioSegments, { id: "caption-new", audioSegmentId: "voice-new" })).toBe(newVoice);
  });

  it("does not leak the previously selected caption voice into an unvoiced caption", () => {
    expect(getCaptionVoiceSegment(audioSegments, { id: "caption-fresh" })).toBeNull();
    expect(getCaptionVoiceSegment(audioSegments, { id: "caption-missing", audioSegmentId: "removed-voice" })).toBeNull();
  });
});
