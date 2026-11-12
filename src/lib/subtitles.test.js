import assert from "node:assert/strict";
import test from "node:test";
import { parseSrt, serializeSrt, serializeVtt } from "./subtitles.js";

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

const track = [
  { id: "a", text: "Hello & <welcome>", start: 1, end: 2.5 },
  { id: "b", text: "hidden", start: 3, end: 4, hidden: true },
  { id: "c", text: "Arrow --> here\n\nsecond line", start: 3600, end: 3601.25 },
  { id: "d", text: "   ", start: 5, end: 6 },
];

test("serializeVtt writes a WebVTT file with escaped cue text", () => {
  assert.equal(serializeVtt(track), [
    "WEBVTT",
    "",
    "00:00:01.000 --> 00:00:02.500",
    "Hello &amp; &lt;welcome&gt;",
    "",
    "01:00:00.000 --> 01:00:01.250",
    "Arrow --&gt; here",
    "second line",
    "",
  ].join("\n"));
});

test("serializeSrt keeps a caption with blank lines in one cue", () => {
  assert.equal(
    serializeSrt(track),
    "1\r\n00:00:01,000 --> 00:00:02,500\r\nHello & <welcome>\r\n\r\n2\r\n01:00:00,000 --> 01:00:01,250\r\nArrow --> here\r\nsecond line\r\n",
  );
});

test("exported WebVTT and SRT read back through parseSrt", () => {
  const vtt = parseSrt(serializeVtt(track));
  assert.equal(vtt.skipped, 0);
  assert.deepEqual(times(vtt.captions), [[1, 2.5], [3600, 3601.25]]);
  assert.deepEqual(vtt.captions.map((caption) => caption.text), ["Hello & <welcome>", "Arrow --> here\nsecond line"]);
  const srt = parseSrt(serializeSrt(track));
  assert.equal(srt.skipped, 0);
  assert.deepEqual(times(srt.captions), [[1, 2.5], [3600, 3601.25]]);
});

test("caption serializers clip to a range and skip empty or zero-length cues", () => {
  const captions = [
    { id: "a", text: "Before", start: 0, end: 1 },
    { id: "b", text: "Inside", start: 2, end: 5 },
    { id: "c", text: "Too short", start: 9.9998, end: 10.0001 },
  ];
  assert.equal(serializeVtt(captions, 0, { start: 3, end: 10 }), "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nInside\n");
  assert.equal(serializeVtt([]), "");
  assert.equal(serializeSrt([{ id: "x", text: "hidden", start: 0, end: 1, hidden: true }]), "");
});

test("caption serializers write cues in start-time order", () => {
  const captions = [
    { id: "late", text: "Late", start: 4, end: 5 },
    { id: "early", text: "Early", start: 1, end: 2 },
  ];
  assert.equal(serializeSrt(captions), "1\r\n00:00:01,000 --> 00:00:02,000\r\nEarly\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\nLate\r\n");
  assert.equal(serializeVtt(captions), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nEarly\n\n00:00:04.000 --> 00:00:05.000\nLate\n");
});
