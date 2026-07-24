import { describe, expect, it, vi } from "vitest";
import { generateFrameCaptions, getAdaptiveSceneThreshold, getAspectRatioLabel, getAutoEditLanguage, getAutoEditPromptLanguage, normalizeClipCaptionTimings, normalizeGeneratedCaptions, probeBuiltInAI, selectCandidatesBySegment, selectChangedFrames } from "./autoEdit.js";

describe("auto edit", () => {
  it("keeps scene changes and clip boundaries", () => {
    const frames = [{ segmentId: "a", time: 0, difference: 1 }, { segmentId: "a", time: 1, difference: .03 }, { segmentId: "a", time: 2, difference: .3 }, { segmentId: "b", time: 3, difference: .01 }];
    expect(selectChangedFrames(frames).map((frame) => frame.time)).toEqual([0, 2, 3]);
  });
  it("keeps candidates for every visual segment", () => {
    const frames = [
      { segmentId: "a", time: 0, difference: 1 }, { segmentId: "a", time: 2, difference: .4 },
      { segmentId: "b", time: 4, difference: 1 }, { segmentId: "b", time: 6, difference: .5 },
    ];
    expect(selectCandidatesBySegment(frames, 1).map((frame) => frame.segmentId)).toEqual(["a", "b"]);
  });
  it("derives the scene threshold from the clip's own motion distribution", () => {
    const quiet = [{ difference: 1 }, ...Array.from({ length: 8 }, () => ({ difference: .04 })), { difference: .35 }];
    expect(getAdaptiveSceneThreshold(quiet)).toBeLessThan(.35);
  });
  it("returns every separated scene peak without a fixed candidate cap", () => {
    const frames = Array.from({ length: 31 }, (_, index) => ({
      segmentId: "a", time: index * 2, difference: index > 0 && index % 3 === 0 ? .75 : .03, quality: .9,
    }));
    expect(selectCandidatesBySegment(frames)).toHaveLength(11);
  });
  it("does not force a low-quality end card into the candidates", () => {
    const frames = [
      { segmentId: "a", time: 0, difference: 1, quality: .9 },
      { segmentId: "a", time: 2, difference: .65, quality: .9 },
      { segmentId: "a", time: 5, difference: .5, quality: .8 },
      { segmentId: "a", time: 10, difference: .9, quality: .12 },
    ];
    expect(selectChangedFrames(frames, { maxFrames: 3 }).map((frame) => frame.time)).toEqual([0, 2, 5]);
  });
  it("uses the language selected by the user", () => {
    expect(getAutoEditLanguage("zh")).toBe("zh-CN");
    expect(getAutoEditLanguage("pt")).toBe("pt-BR");
    expect(getAutoEditLanguage("ko")).toBe("ko");
    expect(getAutoEditPromptLanguage("zh")).toBe("en");
    expect(getAutoEditPromptLanguage("ja")).toBe("ja");
  });
  it("translates Prompt API fallback output into the selected language", async () => {
    const session = { prompt: vi.fn().mockResolvedValue('{"captions":[{"text":"A red lantern"}]}') };
    const translator = { translate: vi.fn().mockResolvedValue("一盏红灯笼") };
    const result = await generateFrameCaptions({
      frames: [{ segmentId: "clip-a", segmentStart: 0, segmentEnd: 2, time: 0, blob: {} }],
      duration: 2,
      language: "zh",
      session,
      translator,
    });
    expect(result[0].text).toBe("一盏红灯笼");
    expect(translator.translate).toHaveBeenCalledWith("A red lantern");
  });
  it("reports translated languages as available when both local APIs are ready", async () => {
    vi.stubGlobal("window", {
      LanguageModel: { availability: vi.fn().mockResolvedValue("available") },
      Translator: { availability: vi.fn().mockResolvedValue("available") },
    });
    await expect(probeBuiltInAI("zh")).resolves.toMatchObject({
      availability: "available",
      language: "zh-CN",
      promptLanguage: "en",
    });
    expect(window.Translator.availability).toHaveBeenCalledWith({ sourceLanguage: "en", targetLanguage: "zh" });
    vi.unstubAllGlobals();
  });
  it("does not require translation for a Prompt API native language", async () => {
    vi.stubGlobal("window", {
      LanguageModel: { availability: vi.fn().mockResolvedValue("available") },
    });
    await expect(probeBuiltInAI("ja")).resolves.toMatchObject({
      availability: "available",
      language: "ja",
      promptLanguage: "ja",
    });
    vi.unstubAllGlobals();
  });
  it("labels common source aspect ratios", () => {
    expect(getAspectRatioLabel(1080, 1920)).toBe("9:16");
    expect(getAspectRatioLabel(1920, 1080)).toBe("16:9");
  });
  it("clamps and sorts generated captions", () => {
    const result = normalizeGeneratedCaptions({ captions: [{ start: 4, end: 9, text: "B" }, { start: -2, end: 1, text: "A" }] }, 5);
    expect(result.map(({ text, start, end }) => ({ text, start, end }))).toEqual([{ text: "A", start: 0, end: 1 }, { text: "B", start: 4, end: 5 }]);
  });
  it("removes end-of-clip overlap and keeps the last caption readable", () => {
    const result = normalizeClipCaptionTimings([
      { id: "a", start: 0, end: 1.37 },
      { id: "b", start: 1.37, end: 15.06 },
      { id: "c", start: 14.86, end: 15.06 },
    ], 0, 15.06);
    expect(result[2].start).toBeCloseTo(13.86, 5);
    expect(result[2].end).toBeCloseTo(15.06, 5);
    expect(result[1].end).toBeCloseTo(13.86, 5);
    expect(result[0].end).toBeLessThanOrEqual(result[1].start);
  });
  it("falls back to per-frame descriptions when the batch is empty", async () => {
    const onPartial = vi.fn();
    const session = {
      prompt: vi.fn()
        .mockResolvedValueOnce('{"captions":[]}')
        .mockResolvedValueOnce('{"text":"A lantern-lit interior"}')
        .mockResolvedValueOnce('{"text":"A person enters the room"}'),
    };
    const result = await generateFrameCaptions({
      frames: [{ segmentId: "clip-a", time: 0, blob: {} }, { segmentId: "clip-a", time: 3, blob: {} }], duration: 6, language: "en", session, onPartial,
    });
    expect(result.map(({ text, start, end }) => ({ text, start, end }))).toEqual([
      { text: "A lantern-lit interior", start: 0, end: 3 },
      { text: "A person enters the room", start: 3, end: 6 },
    ]);
    expect(session.prompt).toHaveBeenCalledTimes(3);
    expect(onPartial.mock.calls.map(([value]) => value.status)).toEqual(["running", "running", "complete"]);
    expect(onPartial.mock.calls[1][0]).toMatchObject({ windowIndex: 1, totalWindows: 1 });
  });
  it("returns one model result for every candidate frame", async () => {
    const session = { prompt: vi.fn().mockResolvedValue('{"captions":[{"text":"A"},{"text":"B"},{"text":"C"},{"text":"D"}]}') };
    const frames = Array.from({ length: 4 }, (_, index) => ({ segmentId: "clip-a", segmentStart: 0, segmentEnd: 8, time: index * 2, blob: {} }));
    const result = await generateFrameCaptions({ frames, duration: 8, language: "en", session });
    expect(result.map(({ text }) => text)).toEqual(["A", "B", "C", "D"]);
    expect(result).toHaveLength(frames.length);
  });
});
