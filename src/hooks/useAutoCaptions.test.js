import { describe, expect, it } from "vitest";

import { createTranslator } from "../i18n.js";
import { localizeAutoCaptionPhase } from "./useAutoCaptions.js";

describe("automatic caption progress localization", () => {
  it("localizes Whisper download progress in English", () => {
    expect(localizeAutoCaptionPhase(
      "下载或读取 Whisper small ONNX",
      createTranslator("en"),
    )).toBe("Downloading or loading Whisper small ONNX");
  });

  it("keeps the detected language label in localized transcription progress", () => {
    expect(localizeAutoCaptionPhase(
      "检测为 English 转写字幕",
      createTranslator("en"),
    )).toBe("Transcribing captions in English");
  });
});
