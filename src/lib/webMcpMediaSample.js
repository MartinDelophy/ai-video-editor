import { prepareEditorComposition } from "./editorComposition.js";
import { renderOfflineFrames } from "./offlineVideoExport.js";
import { mixOfflineAudio } from "./audioExport.js";
import { encodeAudioBufferAsWav } from "./media.js";
import { ensureCaptionFontLoaded, resolveCaptionStyleForSegment } from "./captionFonts.js";
import { throwIfExportAborted } from "./exportCancellation.js";

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const time = { type: "number", minimum: 0 };
export const WEB_MCP_MEDIA_SAMPLE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["stateToken"],
  properties: {
    stateToken: { type: "string", minLength: 1, maxLength: 256 },
    times: { type: "array", minItems: 1, maxItems: 4, uniqueItems: true, items: time },
    maxDimension: { type: "integer", minimum: 256, maximum: 1024 },
    audio: { type: "object", additionalProperties: false, required: ["start", "duration"], properties: {
      start: time, duration: { type: "number", exclusiveMinimum: 0, maximum: 10 },
    } },
  },
  anyOf: [{ required: ["times"] }, { required: ["audio"] }],
};

export function validateMediaSample(input, duration) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !Object.hasOwn(WEB_MCP_MEDIA_SAMPLE_SCHEMA.properties, key))) fail("INVALID_ARGUMENT");
  if (!(duration > 0)) fail("EMPTY_PROJECT");
  if (input.times === undefined && input.audio === undefined) fail("INVALID_ARGUMENT");
  if (input.times !== undefined && (!Array.isArray(input.times) || !input.times.length || input.times.length > 4
    || new Set(input.times).size !== input.times.length
    || input.times.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= duration))) fail("INVALID_ARGUMENT");
  if (input.maxDimension !== undefined && (!Number.isInteger(input.maxDimension) || input.maxDimension < 256 || input.maxDimension > 1024)) fail("INVALID_ARGUMENT");
  if (input.audio !== undefined) {
    const audio = input.audio;
    if (!audio || typeof audio !== "object" || Array.isArray(audio) || Object.keys(audio).some((key) => !["start", "duration"].includes(key))
      || !Number.isFinite(audio.start) || audio.start < 0 || !Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 10
      || audio.start + audio.duration > duration + 0.000001) fail("INVALID_ARGUMENT");
  }
}

function blobDataUrl(blob, signal) {
  throwIfExportAborted(signal);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    signal?.addEventListener("abort", abort, { once: true });
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(Object.assign(new Error("CANCELLED"), { name: "AbortError" }));
    reader.onloadend = () => signal?.removeEventListener("abort", abort);
    reader.readAsDataURL(blob);
  });
}

/** Explicit, bounded media access; metadata inspection never calls this path. */
export async function sampleEditorMedia(d, input, { signal } = {}) {
  throwIfExportAborted(signal);
  const times = [...(input.times || [])].sort((a, b) => a - b);
  if (times.length && !d.renderedVisualSegments?.length) fail("MEDIA_SAMPLE_UNAVAILABLE");
  const maxDimension = input.maxDimension ?? 640;
  const scale = maxDimension / Math.max(d.ratio.width, d.ratio.height);
  const width = Math.max(2, Math.round(d.ratio.width * scale));
  const height = Math.max(2, Math.round(d.ratio.height * scale));
  const burnCaptions = Boolean(times.length && d.captionsEnabled && d.trackVisibility.caption);
  if (burnCaptions) {
    await Promise.all(d.captionSegments.map((segment) => ensureCaptionFontLoaded(resolveCaptionStyleForSegment(d.captionStyle, segment).fontId, segment.text || "")));
    throwIfExportAborted(signal);
  }
  const rangeStart = input.audio?.start ?? times[0] ?? 0;
  const rangeDuration = input.audio?.duration ?? Math.max(0.001, (times.at(-1) ?? rangeStart) - rangeStart);
  const options = await prepareEditorComposition(d, {
    exportSettings: { width, height }, exportRange: { start: rangeStart, end: rangeStart + rangeDuration, duration: rangeDuration },
    exportAudio: Boolean(input.audio), burnCaptions, signal,
  });
  const frames = times.length ? await renderOfflineFrames(options, times) : [];
  let audio;
  if (input.audio) {
    const mixed = await mixOfflineAudio(options);
    throwIfExportAborted(signal);
    const sampleRate = 24_000;
    const context = new OfflineAudioContext(1, Math.max(1, Math.round(input.audio.duration * sampleRate)), sampleRate);
    if (mixed) {
      const source = context.createBufferSource();
      source.buffer = mixed; source.connect(context.destination); source.start();
    }
    const buffer = await context.startRendering();
    throwIfExportAborted(signal);
    let peak = 0; let squares = 0; let clipped = 0;
    for (const value of buffer.getChannelData(0)) {
      peak = Math.max(peak, Math.abs(value)); squares += value * value;
      if (Math.abs(value) >= 1) clipped += 1;
    }
    const blob = encodeAudioBufferAsWav(buffer);
    audio = { start: input.audio.start, duration: buffer.duration, sampleRate, channels: 1, mimeType: "audio/wav",
      peak, rms: Math.sqrt(squares / buffer.length), clippedSamples: clipped, byteSize: blob.size, dataUrl: await blobDataUrl(blob, signal) };
  }
  throwIfExportAborted(signal);
  return { frames, ...(audio ? { audio } : {}), renderer: "shared-offline-composition" };
}
