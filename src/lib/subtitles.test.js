import assert from "node:assert/strict";
import test from "node:test";
import { parseSrt } from "./subtitles.js";

const times = (captions) => captions.map(({ start, end }) => [start, end]);

test("parseSrt still reads SRT files", () => {
  const { captions, skipped } = parseSrt("1\r\n00:00:01,000 --> 00:00:02,500\r\nHello <i>there</i>\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nAT &amp; T\r\n");
  assert.equal(skipped, 0);
  assert.deepEqual(times(captions), [[1, 2.5], [3, 4]]);
  assert.deepEqual(captions.map((caption) => caption.text), ["Hello there", "AT &amp; T"]);
});

test("parseSrt reads WebVTT cues without counting metadata blocks as skipped", () => {
  const vtt = [
    "WEBVTT - demo",
    "Kind: captions",
    "",
    "STYLE",
    "::cue { color: red }",
    "",
    "NOTE a comment",
    "",
    "intro",
    "00:01.000 --> 00:02.500 align:start position:10%",
    "<v Roger>Hello &amp; welcome</v>",
    "",
    "01:00:03.000 --> 01:00:04.000",
    "<c.yellow>Line one</c>",
    "line &lt;two&gt;",
    "",
  ].join("\n");
  const { captions, skipped } = parseSrt(vtt);
  assert.equal(skipped, 0);
  assert.deepEqual(times(captions), [[1, 2.5], [3603, 3604]]);
  assert.deepEqual(captions.map((caption) => caption.text), ["Hello & welcome", "Line one\nline <two>"]);
});

test("parseSrt treats whitespace-only lines as cue separators", () => {
  const { captions } = parseSrt("WEBVTT\n\n00:00.000 --> 00:01.000\nA\n  \n00:01.000 --> 00:02.000\nB\n");
  assert.deepEqual(captions.map((caption) => caption.text), ["A", "B"]);
});

test("parseSrt still skips malformed cues", () => {
  const { captions, skipped } = parseSrt("WEBVTT\n\n00:02.000 --> 00:01.000\nbackwards\n\nno timing here\n");
  assert.equal(captions.length, 0);
  assert.equal(skipped, 2);
});
