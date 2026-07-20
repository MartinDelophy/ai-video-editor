import { describe, expect, it } from "vitest";
import { mapOpenverseAudio } from "./useEditorCatalog.js";

describe("mapOpenverseAudio", () => {
  it("normalizes Openverse millisecond durations for timeline use", () => {
    const asset = mapOpenverseAudio({
      id: "track-1",
      title: "Ambient Flight",
      duration: 264000,
      url: "https://example.com/track.mp3",
      license: "by",
    });
    expect(asset.duration).toBe(264);
    expect(asset.meta).toBe("04:24 · BY");
    expect(asset.type).toBe("audio");
  });
});
