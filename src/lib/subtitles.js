import { getCaptionTimeline, makeId } from "./timeline.js";

export const MAX_SRT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SRT_CAPTIONS = 5000;

function parseTimestamp(value) {
  const match = String(value).trim().match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, fraction] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction.padEnd(3, "0")) / 1000;
}

function cleanSrtText(lines) {
  return lines.join("\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+}/g, "")
    .trim();
}

export function parseSrt(source, { maxCaptions = MAX_SRT_CAPTIONS } = {}) {
  const normalized = String(source ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const captions = [];
  let skipped = 0;

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trimEnd());
    while (lines.length && !lines[0].trim()) lines.shift();
    if (!lines.length) continue;
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) { skipped += 1; continue; }
    const timing = lines[timingIndex].split(/\s*-->\s*/);
    const start = parseTimestamp(timing[0]);
    const end = parseTimestamp(timing[1]?.split(/\s+/)[0]);
    const text = cleanSrtText(lines.slice(timingIndex + 1));
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

function formatSrtTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

export function serializeSrt(captions, targetDuration = 0, options = {}) {
  const source = Array.isArray(captions) ? captions : [];
  const timeline = getCaptionTimeline(source, targetDuration);
  const rangeStart = Math.max(0, Number(options.start) || 0);
  const requestedEnd = Number(options.end);
  const rangeEnd = Number.isFinite(requestedEnd) ? Math.max(rangeStart, requestedEnd) : Number.POSITIVE_INFINITY;
  const blocks = [];
  source.forEach((caption, index) => {
    const text = String(caption?.text ?? "").replace(/\r\n?/g, "\n").trim();
    const range = timeline[index];
    if (caption?.hidden || !text || !range) return;
    const start = Math.max(range.start, rangeStart);
    const end = Math.min(range.end, rangeEnd);
    if (end <= start) return;
    blocks.push(`${blocks.length + 1}\r\n${formatSrtTimestamp(start - rangeStart)} --> ${formatSrtTimestamp(end - rangeStart)}\r\n${text}`);
  });
  return blocks.length ? `${blocks.join("\r\n\r\n")}\r\n` : "";
}
