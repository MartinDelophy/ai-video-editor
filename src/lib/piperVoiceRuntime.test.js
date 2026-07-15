import { describe, expect, it, vi } from "vitest";

import { phonemizeXiaoYa, predictPiperVoice } from "./piperVoiceRuntime.js";

describe("Piper voice runtime", () => {
  it("converts Mandarin syllables into Xiao Ya initial/final/tone groups", () => {
    const map = {
      _: [0], "^": [1], $: [2], n: [10], i: [39], 3: [66], h: [14], ao: [32],
      "，": [72], zh: [18], e: [29], 4: [67], sh: [20], 5: [68], x: [17], iao: [42], y: [25], a: [27], "。": [69],
    };
    const ids = phonemizeXiaoYa("你好，这是小雅。", map);
    expect(ids).toEqual([
      1, 10, 39, 66, 0, 14, 32, 66, 0, 72, 0, 18, 29, 67, 0, 20, 39, 67, 0,
      17, 42, 66, 0, 25, 27, 66, 0, 69, 0, 2,
    ]);
  });

  it("keeps unknown legacy voices on the bundled Piper runtime", async () => {
    const tts = { predict: vi.fn(async () => new Blob(["wav"])) };
    await predictPiperVoice(tts, { text: "你好", voiceId: "legacy-voice" });
    expect(tts.predict).toHaveBeenCalledOnce();
  });
});
