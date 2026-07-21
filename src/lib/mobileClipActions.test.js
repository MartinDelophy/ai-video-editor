import { describe, expect, it } from "vitest";
import {
  getMobileClipActionIds,
  getMobileClipPanel,
  getMobileClipPanelOrigin,
  resolveMobileClipActionTrack,
  shouldActivateToolRailForClip,
} from "./mobileClipActions.js";

describe("mobile clip actions", () => {
  it("shows audio-specific actions for voiceover and music clips", () => {
    expect(getMobileClipActionIds("audio")).toEqual(["dismiss", "edit", "split", "captions", "separate", "delete"]);
    expect(getMobileClipActionIds("music")).toEqual(["dismiss", "audio", "split", "captions", "separate", "delete"]);
  });

  it("does not offer vocal separation for linked source-audio pieces", () => {
    expect(getMobileClipActionIds("source")).toEqual(["dismiss", "audio", "split", "captions", "delete"]);
  });

  it("keeps visual clip actions free of audio-only commands", () => {
    expect(getMobileClipActionIds("image")).toEqual(["dismiss", "edit", "split", "copy", "delete"]);
  });

  it("shows a compact direct-property menu for sticker clips", () => {
    expect(getMobileClipActionIds("sticker")).toEqual(["dismiss", "properties", "copy", "delete"]);
    expect(getMobileClipPanelOrigin("sticker")).toBe("sticker-clip");
  });

  it("offers source-audio extraction only for an eligible mobile visual clip", () => {
    expect(getMobileClipActionIds("image", { canExtractSourceAudio: true })).toEqual([
      "dismiss", "edit", "split", "copy", "extract-source-audio", "delete",
    ]);
    expect(getMobileClipActionIds("caption", { canExtractSourceAudio: true })).not.toContain("extract-source-audio");
  });

  it("routes every mobile audio clip directly to its property inspector", () => {
    expect(getMobileClipPanel("audio")).toBe("inspector");
    expect(getMobileClipPanel("source")).toBe("inspector");
    expect(getMobileClipPanel("music")).toBe("inspector");
    expect(getMobileClipPanel("image")).toBe("inspector");
  });

  it("marks all audio clips as a dedicated property-sheet session", () => {
    expect(getMobileClipPanelOrigin("audio")).toBe("audio-clip");
    expect(getMobileClipPanelOrigin("source")).toBe("audio-clip");
    expect(getMobileClipPanelOrigin("music")).toBe("audio-clip");
  });

  it("keeps the persistent tool rail unchanged for mobile clip selection", () => {
    expect(shouldActivateToolRailForClip(true)).toBe(false);
    expect(shouldActivateToolRailForClip(false)).toBe(true);
  });

  it("uses the pressed audio clip instead of a stale visual selection", () => {
    expect(resolveMobileClipActionTrack("audio", { visual: true, audio: true })).toBe("audio");
    expect(resolveMobileClipActionTrack("", { visual: true })).toBe("image");
  });
});
