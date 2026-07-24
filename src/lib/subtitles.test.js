import { describe, expect, it } from "vitest";
import { appendImportedCaptions, parseSrt, serializeSrt } from "./subtitles.js";

describe("parseSrt", () => {
  it("parses BOM, CRLF, multiline text, tags, and missing sequence numbers", () => {
    const result = parseSrt("\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\n<i>Hello</i>\r\nworld\r\n\r\n00:01:02.005 --> 00:01:04.050\r\nSecond");
    expect(result.skipped).toBe(0);
    expect(result.captions).toHaveLength(2);
    expect(result.captions[0]).toMatchObject({ text: "Hello\nworld", start: 1.25, end: 3.5, hidden: false });
    expect(result.captions[1]).toMatchObject({ text: "Second", start: 62.005, end: 64.05 });
  });

  it("skips malformed entries and enforces the caption limit", () => {
    const result = parseSrt("1\nnot a timestamp\nBad\n\n2\n00:00:04,000 --> 00:00:03,000\nBackwards\n\n3\n00:00:05,000 --> 00:00:06,000\nGood\n\n4\n00:00:07,000 --> 00:00:08,000\nExtra", { maxCaptions: 1 });
    expect(result.captions.map((caption) => caption.text)).toEqual(["Good"]);
    expect(result.skipped).toBe(3);
  });
});

describe("appendImportedCaptions", () => {
  it("keeps all captions and orders explicit timings", () => {
    const result = appendImportedCaptions([{ id: "later", text: "Later", start: 8, end: 9 }], [{ id: "first", text: "First", start: 2, end: 3 }]);
    expect(result.map((caption) => caption.id)).toEqual(["first", "later"]);
  });
});

describe("serializeSrt", () => {
  it("writes explicit caption timing and excludes hidden captions", () => {
    expect(serializeSrt([
      { text: "First\nline", start: 1.25, end: 3.5 },
      { text: "Hidden", start: 3.5, end: 4, hidden: true },
      { text: "Second", start: 62.005, end: 64.05 },
    ])).toBe(
      "1\r\n00:00:01,250 --> 00:00:03,500\r\nFirst\nline\r\n\r\n"
      + "2\r\n00:01:02,005 --> 00:01:04,050\r\nSecond\r\n",
    );
  });

  it("materializes captions without explicit timing across the target duration", () => {
    const serialized = serializeSrt([{ text: "One" }, { text: "Two" }], 4);
    expect(serialized).toContain("00:00:00,000 --> 00:00:02,000");
    expect(serialized).toContain("00:00:02,000 --> 00:00:04,000");
    expect(parseSrt(serialized).captions.map((caption) => caption.text)).toEqual(["One", "Two"]);
  });

  it("clips captions to a custom export range and rebases timestamps", () => {
    expect(serializeSrt([
      { text: "Before and inside", start: 1, end: 3 },
      { text: "Inside", start: 4, end: 5 },
      { text: "After", start: 7, end: 8 },
    ], 10, { start: 2, end: 6 })).toBe(
      "1\r\n00:00:00,000 --> 00:00:01,000\r\nBefore and inside\r\n\r\n"
      + "2\r\n00:00:02,000 --> 00:00:03,000\r\nInside\r\n",
    );
  });
});
