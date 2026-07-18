import { describe, expect, it } from "vitest";
import { shouldCorrectPreviewMediaTime } from "./editorRuntime.js";

describe("preview media clock", () => {
  it("never seeks a natively playing video to chase React timeline state", () => {
    expect(shouldCorrectPreviewMediaTime({ isPlaying: true, currentTime: 4.8, targetTime: 4.1 })).toBe(false);
  });

  it("seeks precisely while paused and ignores negligible drift", () => {
    expect(shouldCorrectPreviewMediaTime({ isPlaying: false, currentTime: 4.8, targetTime: 4.1 })).toBe(true);
    expect(shouldCorrectPreviewMediaTime({ isPlaying: false, currentTime: 4.11, targetTime: 4.1 })).toBe(false);
  });
});
