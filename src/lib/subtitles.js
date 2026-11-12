import { getCaptionDisplayText } from "./captionDisplayText.js";
import { getCaptionTimeline, makeId } from "./timeline.js";

export const MAX_SRT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SRT_CAPTIONS = 5000;

function parseTimestamp(value) {
  // SRT always carries hours; WebVTT allows "MM:SS.mmm" when the hour is zero.
  const match = String(value).trim().match(/^(?:(\d{1,3}):)?(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return null;
  const [, hours = "0", minutes, seconds, fraction] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction.padEnd(3, "0")) / 1000;
}

const VTT_ENTITIES = { amp: "&", lt: "<", gt: ">", nbsp: "\u00a0", lrm: "\u200e", rlm: "\u200f" };

function decodeVttEntities(text) {
  return text.replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (_, name) => VTT_ENTITIES[name]);
}

function cleanSrtText(lines, isVtt) {
  const text = lines.join("\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+}/g, "");
  return (isVtt ? decodeVttEntities(text) : text).trim();
}

// WebVTT blocks that carry no cues; they are metadata rather than malformed captions.
const VTT_NON_CUE_BLOCK = /^(?:WEBVTT|NOTE|STYLE|REGION)(?:[ \t\n]|$)/;

export function parseSrt(source, { maxCaptions = MAX_SRT_CAPTIONS } = {}) {
  const normalized = String(source ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
    .replace(/^[ \t]+$/gm, "");
  const isVtt = /^WEBVTT(?:[ \t\n]|$)/.test(normalized);
  const blocks = normalized.split(/\n{2,}/);
  const captions = [];
  let skipped = 0;

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trimEnd());
    while (lines.length && !lines[0].trim()) lines.shift();
    if (!lines.length) continue;
    if (isVtt && VTT_NON_CUE_BLOCK.test(lines[0])) continue;
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) { skipped += 1; continue; }
    const timing = lines[timingIndex].split(/\s*-->\s*/);
    const start = parseTimestamp(timing[0]);
    const end = parseTimestamp(timing[1]?.split(/\s+/)[0]);
    const text = cleanSrtText(lines.slice(timingIndex + 1), isVtt);
    if (start === null || end === null || end <= start || !text) { skipped += 1; continue; }
    if (captions.length >= maxCaptions) { skipped += 1; continue; }
    captions.push({ id: makeId("caption"), text, start, end, hidden: false });
  }

  captions.sort((a, b) => a.start - b.start || a.end - b.end);
  return { captions, skipped };
}

export function appendImportedCaptions(existing, imported) {
  return [...existing, ...imported].sort((a, b) => {
    const aStart = Number.isFinite(a.start) ? a.start : Number.POSITIVE_INFINITY;
    const bStart = Number.isFinite(b.start) ? b.start : Number.POSITIVE_INFINITY;
    return aStart - bStart;
  });
}

function formatTimestamp(seconds, separator) {
  const milliseconds = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

// Visible captions as cues relative to options.start, in start-time order as
// WebVTT requires. A blank line would end the cue early in both formats, so the
// text keeps its non-empty lines only.
function collectCaptionCues(captions, targetDuration, options) {
  const source = Array.isArray(captions) ? captions : [];
  const timeline = getCaptionTimeline(source, targetDuration);
  const rangeStart = Math.max(0, Number(options.start) || 0);
  const requestedEnd = Number(options.end);
  const rangeEnd = Number.isFinite(requestedEnd) ? Math.max(rangeStart, requestedEnd) : Number.POSITIVE_INFINITY;
  const cues = [];
  source.forEach((caption, index) => {
    const lines = getCaptionDisplayText(caption?.text).split(/\r\n?|\n/)
      .map((line) => line.trim()).filter(Boolean);
    const range = timeline[index];
    if (caption?.hidden || !lines.length || !range) return;
    const start = Math.max(range.start, rangeStart) - rangeStart;
    const end = Math.min(range.end, rangeEnd) - rangeStart;
    // Both formats store milliseconds; a cue that rounds to zero length cannot be read back.
    if (Math.round(end * 1000) <= Math.round(start * 1000)) return;
    cues.push({ start, end, lines });
  });
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function serializeSrt(captions, targetDuration = 0, options = {}) {
  const blocks = collectCaptionCues(captions, targetDuration, options).map(({ start, end, lines }, index) => (
    `${index + 1}\r\n${formatTimestamp(start, ",")} --> ${formatTimestamp(end, ",")}\r\n${lines.join("\r\n")}`
  ));
  return blocks.length ? `${blocks.join("\r\n\r\n")}\r\n` : "";
}

function escapeVttText(line) {
  return line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function serializeVtt(captions, targetDuration = 0, options = {}) {
  const blocks = collectCaptionCues(captions, targetDuration, options).map(({ start, end, lines }) => (
    `${formatTimestamp(start, ".")} --> ${formatTimestamp(end, ".")}\n${lines.map(escapeVttText).join("\n")}`
  ));
  return blocks.length ? `WEBVTT\n\n${blocks.join("\n\n")}\n` : "";
}
