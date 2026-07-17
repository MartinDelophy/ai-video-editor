import { makeId } from "./timeline.js";

export const BUILT_IN_AI_LANGUAGES = new Set(["en", "es", "ja", "de", "fr"]);

export function getAutoEditLanguage(language = "en") {
  const normalized = language === "pt" ? "pt-BR" : language;
  return BUILT_IN_AI_LANGUAGES.has(normalized) ? normalized : "en";
}

export async function probeBuiltInAI(language = "en") {
  if (typeof window === "undefined" || !window.LanguageModel) {
    return { availability: "unavailable", reason: "api-missing", language: getAutoEditLanguage(language) };
  }
  const modelLanguage = getAutoEditLanguage(language);
  try {
    const availability = await window.LanguageModel.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
      expectedOutputs: [{ type: "text", languages: [modelLanguage] }],
    });
    return { availability, reason: "", language: modelLanguage };
  } catch (error) {
    return { availability: "unavailable", reason: error?.name || "probe-failed", language: modelLanguage };
  }
}

export function selectChangedFrames(frames, { threshold = 0.12, maxFrames = 12 } = {}) {
  if (!frames.length) return [];
  const selected = [frames[0]];
  for (let index = 1; index < frames.length && selected.length < maxFrames; index += 1) {
    const frame = frames[index];
    const previous = selected.at(-1);
    if (frame.segmentId !== previous.segmentId || frame.difference >= threshold) selected.push(frame);
  }
  const last = frames.at(-1);
  if (selected.length < maxFrames && last && selected.at(-1)?.time !== last.time) selected.push(last);
  return selected;
}

export function normalizeGeneratedCaptions(value, duration) {
  const items = Array.isArray(value) ? value : value?.captions;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const start = Math.max(0, Math.min(duration, Number(item.start) || 0));
      const end = Math.max(start + 0.2, Math.min(duration, Number(item.end) || start + 2));
      return { id: makeId("caption"), text: String(item.text || "").trim(), start, end, hidden: false };
    })
    .filter((item) => item.text)
    .sort((a, b) => a.start - b.start);
}

function waitForMedia(element, event) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(element.error || new Error(`Media ${event} failed`)); };
    const cleanup = () => { element.removeEventListener(event, done); element.removeEventListener("error", fail); };
    element.addEventListener(event, done, { once: true });
    element.addEventListener("error", fail, { once: true });
  });
}

async function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Frame encoding failed")), "image/jpeg", 0.82));
}

function pixelDifference(current, previous) {
  if (!previous) return 1;
  let sum = 0;
  for (let index = 0; index < current.length; index += 4) {
    sum += Math.abs(current[index] - previous[index]);
    sum += Math.abs(current[index + 1] - previous[index + 1]);
    sum += Math.abs(current[index + 2] - previous[index + 2]);
  }
  return sum / ((current.length / 4) * 3 * 255);
}

export async function extractAutoEditFrames(segments, onProgress = () => {}, signal) {
  const frames = [];
  let timelineStart = 0;
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const segment = segments[segmentIndex];
    const duration = Math.max(0.2, Number(segment.duration) || 0.2);
    const canvas = document.createElement("canvas");
    canvas.width = 224; canvas.height = 126;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let previousPixels = null;
    if (segment.type === "video") {
      const video = document.createElement("video");
      video.muted = true; video.preload = "auto"; video.src = segment.src;
      if (video.readyState < 1) await waitForMedia(video, "loadedmetadata");
      const sourceStart = Number(segment.sourceStart) || 0;
      const sourceDuration = Math.max(0.2, Number(segment.sourceDuration) || video.duration || duration);
      const sampleCount = Math.min(30, Math.max(3, Math.ceil(duration * 1.5)));
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const ratio = sampleCount === 1 ? 0 : sample / (sampleCount - 1);
        video.currentTime = Math.min(Math.max(0, video.duration - 0.05), sourceStart + ratio * sourceDuration);
        await waitForMedia(video, "seeked");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        frames.push({ segmentId: segment.id, time: timelineStart + ratio * duration, difference: pixelDifference(pixels, previousPixels), blob: await canvasBlob(canvas) });
        previousPixels = new Uint8ClampedArray(pixels);
      }
      video.removeAttribute("src"); video.load();
    } else if (segment.src) {
      const image = new Image(); image.src = segment.src;
      if (!image.complete) await waitForMedia(image, "load");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      frames.push({ segmentId: segment.id, time: timelineStart, difference: 1, blob: await canvasBlob(canvas) });
    }
    timelineStart += duration;
    onProgress(Math.round(((segmentIndex + 1) / segments.length) * 55));
  }
  return selectChangedFrames(frames);
}

export async function generateFrameCaptions({ frames, duration, language, onDownloadProgress }) {
  const modelLanguage = getAutoEditLanguage(language);
  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
    expectedOutputs: [{ type: "text", languages: [modelLanguage] }],
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => onDownloadProgress?.(event.loaded));
    },
  };
  const session = await window.LanguageModel.create(options);
  try {
    const content = [{ type: "text", value: `Create concise on-screen captions for these chronological video frames. Output in ${modelLanguage}. Use only visible evidence, do not invent names or facts. Frame timestamps: ${frames.map((frame) => frame.time.toFixed(2)).join(", ")} seconds. Keep each caption on screen for 1.5 to 4 seconds and within 0 to ${duration.toFixed(2)} seconds.` }];
    frames.forEach((frame) => content.push({ type: "image", value: frame.blob }));
    const schema = { type: "object", properties: { captions: { type: "array", items: { type: "object", properties: { start: { type: "number" }, end: { type: "number" }, text: { type: "string" } }, required: ["start", "end", "text"], additionalProperties: false } } }, required: ["captions"], additionalProperties: false };
    const response = await session.prompt([{ role: "user", content }], { responseConstraint: schema });
    return normalizeGeneratedCaptions(JSON.parse(response), duration);
  } finally {
    session.destroy?.();
  }
}
