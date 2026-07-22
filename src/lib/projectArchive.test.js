import { describe, expect, it } from "vitest";
import { resolveProjectVisualMedia } from "./projectArchive.js";

describe("project archive visual media resolution", () => {
  it("restores a headless-cloned clip through its stable archive media reference", () => {
    const original = { id: "visual-original", blob: new Blob(["media"]) };
    const media = new Map([[original.id, original]]);
    expect(resolveProjectVisualMedia(media, { id: "visual-clone", archiveMediaId: "visual-original", assetId: "library-asset" })).toBe(original);
  });

  it("prefers a clip-specific media entry before archive and library fallbacks", () => {
    const exact = { id: "visual-clone" };
    const archived = { id: "visual-original" };
    const media = new Map([[exact.id, exact], [archived.id, archived]]);
    expect(resolveProjectVisualMedia(media, { id: exact.id, archiveMediaId: archived.id })).toBe(exact);
  });
});
