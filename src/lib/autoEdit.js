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

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function getAdaptiveSceneThreshold(frames, floor = 0.1) {
  const scores = frames.slice(1).map((frame) => Number(frame.difference) || 0);
  const center = median(scores);
  const deviation = median(scores.map((score) => Math.abs(score - center)));
  return Math.max(floor, center + Math.max(0.035, deviation * 2.5));
}

export function selectChangedFrames(frames, { threshold, maxFrames = Infinity, minTimeGap = 1.2 } = {}) {
  if (!frames.length) return [];
  if (maxFrames <= 1) return [frames[0]];
  const selected = frames.filter((frame, index) => index === 0 || frame.segmentId !== frames[index - 1].segmentId).slice(0, maxFrames);
  const effectiveThreshold = Number.isFinite(threshold) ? threshold : getAdaptiveSceneThreshold(frames);
  const ranked = frames.slice(1).map((frame, index) => {
    const previousScore = frames[index]?.difference || 0;
    const localPeak = frame.difference >= previousScore && frame.difference >= (frames[index + 2]?.difference || 0);
    const quality = frame.quality ?? 1;
    return { frame, score: frame.difference * (.7 + quality * .3), localPeak };
  }).filter(({ frame, score }) => score >= effectiveThreshold && (frame.quality ?? 1) >= .28).sort((a, b) => b.score - a.score);
  for (const { frame } of ranked) {
    if (selected.length >= maxFrames) break;
    if (selected.every((item) => item.segmentId !== frame.segmentId || Math.abs(item.time - frame.time) >= minTimeGap)) selected.push(frame);
  }
  // Explicit finite budgets (used only by callers/tests) may request coverage fill.
  if (Number.isFinite(maxFrames) && selected.length < maxFrames) {
    const fallback = frames.slice(1, -1).filter((frame) => (frame.quality ?? 1) >= .28).sort((a, b) => {
      const distance = (frame) => Math.min(...selected.map((item) => Math.abs(item.time - frame.time)));
      return distance(b) - distance(a);
    });
    for (const frame of fallback) {
      if (selected.length >= maxFrames) break;
      if (selected.every((item) => item.segmentId !== frame.segmentId || Math.abs(item.time - frame.time) >= minTimeGap)) selected.push(frame);
    }
  }
  return selected.sort((a, b) => a.time - b.time);
}

export function selectCandidatesBySegment(frames, maxPerSegment) {
  const groups = [];
  frames.forEach((frame) => {
    let group = groups.find((item) => item.segmentId === frame.segmentId);
    if (!group) { group = { segmentId: frame.segmentId, frames: [] }; groups.push(group); }
    group.frames.push(frame);
  });
  return groups.flatMap((group) => {
    return selectChangedFrames(group.frames, { maxFrames: Number.isFinite(maxPerSegment) ? maxPerSegment : Infinity, minTimeGap: 1.2 });
  });
}

export function normalizeGeneratedCaptions(value, duration) {
  const items = Array.isArray(value) ? value : value?.captions;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const start = Math.max(0, Math.min(Math.max(0, duration - 0.2), Number(item.start) || 0));
      const end = Math.max(start + 0.2, Math.min(duration, Number(item.end) || start + 2));
      return { id: makeId("caption"), text: String(item.text || "").trim(), start, end, hidden: false };
    })
    .filter((item) => item.text)
    .sort((a, b) => a.start - b.start);
}

export function normalizeClipCaptionTimings(captions, clipStart, clipEnd, preferredMinimum = 1.2) {
  if (!captions.length) return [];
  const safeStart = Math.max(0, Number(clipStart) || 0);
  const safeEnd = Math.max(safeStart + 0.2, Number(clipEnd) || safeStart + 0.2);
  const minimum = Math.min(preferredMinimum, (safeEnd - safeStart) / captions.length);
  const normalized = captions
    .map((caption) => ({
      ...caption,
      start: Math.max(safeStart, Math.min(safeEnd - 0.2, Number(caption.start) || safeStart)),
      end: Math.max(safeStart + 0.2, Math.min(safeEnd, Number(caption.end) || safeEnd)),
    }))
    .sort((a, b) => a.start - b.start);
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const caption = normalized[index];
    if (index < normalized.length - 1) caption.end = Math.min(caption.end, normalized[index + 1].start);
    if (caption.end - caption.start < minimum) caption.start = Math.max(safeStart, caption.end - minimum);
  }
  for (let index = 0; index < normalized.length - 1; index += 1) {
    normalized[index].end = Math.min(normalized[index].end, normalized[index + 1].start);
  }
  return normalized.filter((caption) => caption.end - caption.start >= 0.19);
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

function createFlowWorkerClient() {
  const worker = new Worker(new URL("../workers/auto-edit.worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let requestId = 0;
  worker.onmessage = (event) => {
    const request = pending.get(event.data?.id);
    if (!request) return;
    pending.delete(event.data.id);
    request.resolve(event.data);
  };
  worker.onerror = (error) => {
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
  };
  return {
    analyze(pixels, width, height, segmentId) {
      const id = ++requestId;
      const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      worker.postMessage({ type: "analyze", id, pixels: pixels.buffer, width, height, segmentId }, [pixels.buffer]);
      return promise;
    },
    terminate() { worker.terminate(); pending.forEach(({ reject }) => reject(new DOMException("Aborted", "AbortError"))); pending.clear(); },
  };
}

function drawContainedFrame(context, source, sourceWidth, sourceHeight) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

export function getAspectRatioLabel(width, height) {
  const ratio = width / Math.max(1, height);
  const presets = [[9, 16], [1, 1], [4, 3], [3, 2], [16, 9], [21, 9]];
  const [w, h] = presets.reduce((best, value) => Math.abs(value[0] / value[1] - ratio) < Math.abs(best[0] / best[1] - ratio) ? value : best);
  return `${w}:${h}`;
}

export async function extractAutoEditFrames(segments, onProgress = () => {}, signal) {
  const frames = [];
  const flowWorker = createFlowWorkerClient();
  let timelineStart = 0;
  try {
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const segment = segments[segmentIndex];
      const duration = Math.max(0.2, Number(segment.duration) || 0.2);
      const canvas = document.createElement("canvas");
      canvas.width = 224; canvas.height = 224;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (segment.type === "video") {
        const video = document.createElement("video");
        video.muted = true; video.preload = "auto"; video.src = segment.src;
        if (video.readyState < 1) await waitForMedia(video, "loadedmetadata");
        const sourceStart = Number(segment.sourceStart) || 0;
        const sourceDuration = Math.max(0.2, Number(segment.sourceDuration) || video.duration || duration);
        // Keep a stable temporal resolution instead of a fixed total-frame cap.
        // Long videos therefore receive proportionally more analysis samples.
        const samplesPerSecond = duration <= 120 ? 1.5 : duration <= 600 ? 1 : 0.75;
        const sampleCount = Math.max(3, Math.ceil(duration * samplesPerSecond) + 1);
        for (let sample = 0; sample < sampleCount; sample += 1) {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          const ratio = sampleCount === 1 ? 0 : sample / (sampleCount - 1);
          video.currentTime = Math.min(Math.max(0, video.duration - 0.05), sourceStart + ratio * sourceDuration);
          await waitForMedia(video, "seeked");
          drawContainedFrame(context, video, video.videoWidth, video.videoHeight);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const blob = await canvasBlob(canvas);
          const metrics = await flowWorker.analyze(pixels, canvas.width, canvas.height, segment.id);
          frames.push({ segmentId: segment.id, segmentIndex, segmentName: segment.name || `Clip ${segmentIndex + 1}`, segmentStart: timelineStart, segmentEnd: timelineStart + duration, time: timelineStart + ratio * duration, ...metrics, blob, aspectRatio: getAspectRatioLabel(video.videoWidth, video.videoHeight) });
        }
        video.removeAttribute("src"); video.load();
      } else if (segment.src) {
        const image = new Image(); image.src = segment.src;
        if (!image.complete) await waitForMedia(image, "load");
        drawContainedFrame(context, image, image.naturalWidth, image.naturalHeight);
        frames.push({ segmentId: segment.id, segmentIndex, segmentName: segment.name || `Clip ${segmentIndex + 1}`, segmentStart: timelineStart, segmentEnd: timelineStart + duration, time: timelineStart, difference: 1, blob: await canvasBlob(canvas), aspectRatio: getAspectRatioLabel(image.naturalWidth, image.naturalHeight) });
      }
      timelineStart += duration;
      onProgress(Math.round(((segmentIndex + 1) / segments.length) * 55));
    }
    return selectCandidatesBySegment(frames);
  } finally {
    flowWorker.terminate();
  }
}

export function createFrameCaptionSession({ language, onDownloadProgress, signal }) {
  const modelLanguage = getAutoEditLanguage(language);
  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
    expectedOutputs: [{ type: "text", languages: [modelLanguage] }],
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => onDownloadProgress?.(event.loaded));
    },
    signal,
  };
  return window.LanguageModel.create(options);
}

export async function generateImageVoiceoverText({ src, language = "en", signal }) {
  if (!src) throw new Error("image-missing");
  const modelLanguage = getAutoEditLanguage(language);
  const session = await createFrameCaptionSession({ language, signal });
  try {
    const response = await fetch(src, { signal });
    if (!response.ok) throw new Error("image-load-failed");
    const image = await response.blob();
    const schema = {
      type: "object",
      properties: { text: { type: "string", minLength: 1 } },
      required: ["text"],
      additionalProperties: false,
    };
    const result = await session.prompt([{ role: "user", content: [
      { type: "text", value: `Write one concise, natural voiceover narration sentence in ${modelLanguage} describing only the visible content of this image. Do not invent names, identities, locations, or unseen events. Do not use labels, markdown, or quotation marks.` },
      { type: "image", value: image },
    ] }], { responseConstraint: schema, signal });
    const text = String(JSON.parse(result)?.text || "").trim();
    if (!text) throw new Error("empty-caption");
    return text;
  } finally {
    session.destroy?.();
  }
}

async function generateCaptionGroup(session, frames, duration, modelLanguage) {
  const content = [{ type: "text", value: `Describe every provided candidate frame with one concise on-screen caption. Output in ${modelLanguage}. Return exactly ${frames.length} captions in the same order as the images. Use only visible evidence; do not invent names or facts. Frame timestamps: ${frames.map((frame) => frame.time.toFixed(2)).join(", ")} seconds.` }];
  frames.forEach((frame) => content.push({ type: "image", value: frame.blob }));
  const schema = { type: "object", properties: { captions: { type: "array", minItems: frames.length, maxItems: frames.length, items: { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false } } }, required: ["captions"], additionalProperties: false };
  const response = await session.prompt([{ role: "user", content }], { responseConstraint: schema });
  const returned = JSON.parse(response)?.captions;
  const descriptions = Array.isArray(returned) ? returned.map((item) => String(item?.text || "").trim()) : [];
  const singleSchema = { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false };
  for (let index = 0; index < frames.length; index += 1) {
    if (descriptions[index]) continue;
    const frame = frames[index];
    const singleResponse = await session.prompt([{ role: "user", content: [
      { type: "text", value: `Write one concise ${modelLanguage} on-screen caption describing only what is visibly happening in this video frame at ${frame.time.toFixed(2)} seconds. Return a meaningful non-empty caption. Do not mention the timestamp.` },
      { type: "image", value: frame.blob },
    ] }], { responseConstraint: singleSchema });
    descriptions[index] = String(JSON.parse(singleResponse)?.text || "").trim();
  }
  return frames.map((frame, index) => ({
    id: makeId("caption"),
    text: descriptions[index],
    start: frame.time,
    end: Math.min(duration, Math.max(frame.time + 1.2, frames[index + 1]?.time ?? frame.segmentEnd ?? duration)),
    hidden: false,
  })).filter((caption) => caption.text);
}

function createSlidingWindows(frames, size = 6, overlap = 2) {
  if (!frames.length) return [];
  const stride = Math.max(1, size - overlap);
  const windows = [];
  for (let start = 0; start < frames.length; start += stride) {
    windows.push({ frames: frames.slice(start, start + size), start, commitEnd: frames[start + stride]?.time ?? Infinity });
    if (start + size >= frames.length) break;
  }
  return windows;
}

export async function generateFrameCaptions({ frames, duration, language, session: providedSession, onDownloadProgress, onPartial }) {
  const modelLanguage = getAutoEditLanguage(language);
  const session = providedSession || await createFrameCaptionSession({ language, onDownloadProgress });
  const groups = [];
  frames.forEach((frame) => {
    let group = groups.find((item) => item.segmentId === frame.segmentId);
    if (!group) { group = { segmentId: frame.segmentId, segmentIndex: frame.segmentIndex, segmentName: frame.segmentName, frames: [] }; groups.push(group); }
    group.frames.push(frame);
  });
  const allCaptions = [];
  const windowsBySegment = new Map(groups.map((group) => [group.segmentId, createSlidingWindows(group.frames)]));
  const totalWindows = [...windowsBySegment.values()].reduce((sum, windows) => sum + windows.length, 0);
  let completedWindows = 0;
  try {
    for (const group of groups) {
      const windows = windowsBySegment.get(group.segmentId) || [];
      const clipStart = group.frames[0]?.segmentStart ?? 0;
      const clipEnd = group.frames[0]?.segmentEnd ?? duration;
      let groupCaptions = [];
      onPartial?.({ segmentId: group.segmentId, status: "running", captions: [], windowIndex: 0, totalWindows: windows.length, completedWindows, allWindows: totalWindows });
      try {
        for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
          const window = windows[windowIndex];
          const generated = await generateCaptionGroup(session, window.frames, duration, modelLanguage);
          // Overlap gives the model context; each window commits only its new time region.
          const committed = generated.filter((caption) => (caption.start + caption.end) / 2 < window.commitEnd || windowIndex === windows.length - 1);
          groupCaptions.push(...committed);
          completedWindows += 1;
          const partialCaptions = normalizeClipCaptionTimings(groupCaptions, clipStart, clipEnd).map((caption) => ({ ...caption, visualSegmentId: group.segmentId, visualSegmentIndex: group.segmentIndex, visualSegmentName: group.segmentName }));
          onPartial?.({ segmentId: group.segmentId, status: "running", captions: partialCaptions, windowIndex: windowIndex + 1, totalWindows: windows.length, completedWindows, allWindows: totalWindows });
        }
        const timedCaptions = normalizeClipCaptionTimings(groupCaptions, clipStart, clipEnd);
        const captions = timedCaptions.map((caption) => ({ ...caption, visualSegmentId: group.segmentId, visualSegmentIndex: group.segmentIndex, visualSegmentName: group.segmentName }));
        allCaptions.push(...captions);
        onPartial?.({ segmentId: group.segmentId, status: captions.length ? "complete" : "empty", captions, windowIndex: windows.length, totalWindows: windows.length, completedWindows, allWindows: totalWindows });
      } catch (error) {
        onPartial?.({ segmentId: group.segmentId, status: "error", captions: [], error: error?.message || String(error) });
      }
    }
    return allCaptions.sort((a, b) => a.start - b.start);
  } finally {
    if (!providedSession) session.destroy?.();
  }
}
