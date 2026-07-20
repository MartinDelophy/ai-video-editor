import { makeId } from "./timeline.js";

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
