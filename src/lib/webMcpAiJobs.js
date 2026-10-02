import { buildSilenceRemovalReview, canRemovePauses } from "./silenceRemoval.js";
import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const check = signal => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
const number = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const languages = ["zh", "en", "ja", "ko", "es", "fr", "de", "pt", "th", "vi", "ru", "it", "id"];
function selection(value) {
  if (!value || Object.keys(value).some(key => !["x", "y", "width", "height"].includes(key))) fail("INVALID_ARGUMENT");
  for (const key of ["x", "y", "width", "height"]) if (!number(value[key], key === "width" || key === "height" ? 0.015 : 0, 1)) fail("INVALID_ARGUMENT");
  if (value.x + value.width > 1 || value.y + value.height > 1) fail("INVALID_ARGUMENT");
}
export function validateAiRegions(regions, duration) {
  if (!Array.isArray(regions) || !regions.length || regions.length > 20) fail("INVALID_ARGUMENT");
  for (const region of regions) {
    if (!region || Object.keys(region).some(key => !["start", "end", "selection", "keyframes"].includes(key)) || !number(region.start, 0, duration) || !number(region.end, 0, duration) || region.end - region.start < 0.04) fail("INVALID_ARGUMENT");
    selection(region.selection);
    if (region.keyframes !== undefined) {
      if (!Array.isArray(region.keyframes) || region.keyframes.length > 100) fail("INVALID_ARGUMENT");
      let previous = -1;
      for (const frame of region.keyframes) {
        if (!frame || Object.keys(frame).some(key => !["time", "selection"].includes(key)) || !number(frame.time, region.start, region.end) || frame.time <= previous) fail("INVALID_ARGUMENT");
        selection(frame.selection); previous = frame.time;
      }
    }
  }
}

// Owns processing receipts, not editor mutations. Media never enters model JSON.
export function createWebMcpAiJobs({ getEditor, capture, guard, publish = () => {}, makeId }) {
  const results = new Map();
  const controllers = new Set();
  const assets = () => [...results.values()].flatMap(result => result.asset ? [result.asset] : []);
  const get = resultId => { const result = results.get(resultId); if (!result) fail("AI_RESULT_NOT_FOUND"); return result; };
  const process = async (input, signal) => {
    if (Object.keys(input).some(key => !["stateToken", "kind", "clipId", "language", "targetLanguage", "regions", "minimum", "keep"].includes(key)) || !["captions", "watermark", "pauses"].includes(input.kind) || typeof input.clipId !== "string") fail("INVALID_ARGUMENT");
    guard(signal, true);
    const state = capture();
    if (state.stateToken !== input.stateToken) fail("STALE_STATE");
    if (results.size >= 8) fail("AI_RESULT_LIMIT");
    const editor = getEditor();
    if (!editor.processAi || !editor.aiSupport?.()[input.kind]) fail("AI_UNAVAILABLE");
    const collections = [["visualSegments", "image"], ["visualOverlaySegments", "overlay"], ["audioSegments", "audio"]];
    const matches = collections.flatMap(([key, lock]) => (state.project[key] || []).filter(clip => clip.id === input.clipId).map(clip => ({ key, lock, clip })));
    if (matches.length !== 1) fail("CLIP_NOT_FOUND");
    const { key, lock, clip: metadata } = matches[0];
    if (state.project.trackLocks?.[input.kind === "captions" ? "caption" : lock]) fail("BROWSER_EDIT_TRACK_LOCKED");
    const runtime = editor.getRuntimeProject?.() || editor;
    const clip = (runtime[key] || []).find(item => item.id === input.clipId);
    if (!(clip?.blob instanceof Blob) || clip.preparing || clip.reversed || clip.reverse) fail("AI_UNAVAILABLE");
    const language = input.language || editor.language || "zh";
    if (!languages.includes(language) || input.targetLanguage !== undefined && (!languages.includes(input.targetLanguage) || input.targetLanguage === language)) fail("INVALID_ARGUMENT");
    if (input.kind === "pauses") {
      const index = state.project.visualSegments.findIndex(item => item.id === clip.id);
      if (key !== "visualSegments" || !canRemovePauses(clip, runtime.visualSegments[index - 1])) fail("AI_UNAVAILABLE");
      if (input.regions !== undefined || input.targetLanguage !== undefined
        || input.minimum !== undefined && !number(input.minimum, 0.5, 5)
        || input.keep !== undefined && !number(input.keep, 0.3, 1)) fail("INVALID_ARGUMENT");
      if (editor.sourceAudioBlob && state.project.sourceAudioLinked !== false && state.project.trackLocks?.source) fail("BROWSER_EDIT_TRACK_LOCKED");
    } else if (input.minimum !== undefined || input.keep !== undefined) fail("INVALID_ARGUMENT");
    if (input.kind === "watermark") {
      if (clip.type !== "video" || clip.speedCurve?.enabled || !clip.src || input.targetLanguage !== undefined) fail("AI_UNAVAILABLE");
      validateAiRegions(input.regions, clip.duration);
    } else if (input.regions !== undefined || !["video", "audio"].includes(clip.type)) fail("INVALID_ARGUMENT");
    const timelineStart = key === "visualSegments" ? state.project.visualSegments.slice(0, state.project.visualSegments.findIndex(item => item.id === clip.id)).reduce((sum, item) => sum + item.duration, 0) : Number(clip.start) || 0;
    const controller = new AbortController(); const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true }); controllers.add(controller);
    const resultId = makeId();
    publish({ running: true, kind: input.kind, progress: 0 });
    let output;
    try {
      output = await editor.processAi({ ...input, clip: { ...clip }, timelineStart, language, signal: controller.signal, onProgress: value => publish({ running: true, kind: input.kind, progress: Math.min(100, Math.max(0, Number(value.progress) || 0)) }) });
      check(controller.signal); guard(signal);
      if (capture().fingerprint !== state.fingerprint) fail("STALE_STATE");
      let operations;
      if (input.kind === "captions") {
        if (!Array.isArray(output.segments) || !output.segments.length || output.segments.length > 500) fail("AI_EMPTY_RESULT");
        operations = output.segments.map((segment, index) => {
          if (!number(segment.start, timelineStart, timelineStart + metadata.duration) || !number(segment.end, segment.start + 0.2, Math.min(MAX_TIMELINE_DURATION_SECONDS, timelineStart + metadata.duration)) || typeof segment.text !== "string" || !segment.text.trim() || segment.text.length > 20000) fail("AI_EMPTY_RESULT");
          return { type: "caption.add", clipId: `agent-caption-${resultId}-${index}`, text: segment.text, start: segment.start, end: segment.end };
        });
      } else if (input.kind === "pauses") {
        if (!Array.isArray(output.candidates) || output.candidates.length > 500) fail("AI_EMPTY_RESULT");
        if (!output.candidates.length) fail("AI_NO_PAUSES");
        // Compile the same production review as the manual tool before issuing a receipt.
        output.review = buildSilenceRemovalReview(state.project, runtime, clip.id, output.candidates, editor.rippleEditing);
      } else {
        const asset = output.asset;
        if (!(asset?.blob instanceof Blob) || !asset.blob.size || asset.type !== "video" || !number(asset.sourceDuration, 0.001, MAX_TIMELINE_DURATION_SECONDS) || Math.abs(asset.sourceDuration - (clip.sourceDuration || clip.duration * (clip.playbackRate || 1))) > 0.05) fail("AI_EMPTY_RESULT");
        operations = [{ type: "visual.replace_media", clipId: clip.id, resultId }];
      }
      results.set(resultId, { kind: input.kind, fingerprint: state.fingerprint, clipId: clip.id, operations, asset: output.asset, review: output.review, candidates: output.candidates, inspected: input.kind !== "watermark" });
      return { resultId, kind: input.kind, clipId: clip.id, operations, ...(output.candidates ? { cuts: output.candidates.map(cut => ({ start: timelineStart + cut.start, end: timelineStart + cut.end })), removedSeconds: output.candidates.reduce((sum, cut) => sum + cut.end - cut.start, 0), rippleEditing: Boolean(editor.rippleEditing) } : {}), needsVisualInspection: input.kind === "watermark", timing: input.kind === "pauses" ? "Remove only detected pauses in this inspected main clip; source audio follows, other tracks follow the current ripple mode." : input.kind === "captions" ? "Pause-estimated timeline seconds; review alignment. Singing may not be recognized." : "Original clip timing preserved; processed media source starts at zero.", ...(output.asset ? { asset: { name: output.asset.name, duration: output.asset.duration, width: output.asset.width, height: output.asset.height } } : {}) };
    } catch (error) { if (output?.asset) editor.discardAiAsset?.(output.asset); throw error; } finally { signal?.removeEventListener("abort", abort); controllers.delete(controller); publish(null); }
  };
  const inspectFrames = async (input, signal) => {
    if (Object.keys(input).some(key => !["resultId", "times"].includes(key))) fail("INVALID_ARGUMENT");
    const result = get(input.resultId); check(signal);
    if (!result.asset || capture().fingerprint !== result.fingerprint) fail("STALE_STATE");
    const { sampleChatCutMedia } = await import("./chatCutMedia.js");
    const sampled = await sampleChatCutMedia([result.asset], { assetId: result.asset.id, times: input.times }, { signal });
    check(signal); if (capture().fingerprint !== result.fingerprint) fail("STALE_STATE");
    result.inspected = true; return sampled;
  };
  const preview = (resultId, fingerprint) => {
    const result = get(resultId);
    if (result.fingerprint !== fingerprint) fail("STALE_STATE");
    if (!result.inspected) fail("AI_INSPECTION_REQUIRED");
    return result;
  };
  const reset = () => {
    controllers.forEach(controller => controller.abort());
    const editor = getEditor();
    for (const result of results.values()) if (result.asset && !editor.assets?.some(asset => asset.id === result.asset.id)) editor.discardAiAsset?.(result.asset);
    results.clear();
  };
  return { process, inspectFrames, preview, assets, reset, close: reset };
}

const id = { type: "string", minLength: 1, maxLength: 256 };
const rect = { type: "object", additionalProperties: false, properties: Object.fromEntries(["x", "y", "width", "height"].map(key => [key, { type: "number", minimum: key === "width" || key === "height" ? 0.015 : 0, maximum: 1 }])), required: ["x", "y", "width", "height"] };
const time = { type: "number", minimum: 0, maximum: MAX_TIMELINE_DURATION_SECONDS };
const object = (properties, required) => ({ type: "object", additionalProperties: false, properties, required });
export const AI_PROCESS_SCHEMA = object({ stateToken: id, clipId: id, kind: { type: "string", enum: ["captions", "watermark", "pauses"] }, minimum: { type: "number", minimum: 0.5, maximum: 5 }, keep: { type: "number", minimum: 0.3, maximum: 1 }, language: { type: "string", enum: languages }, targetLanguage: { type: "string", enum: languages }, regions: { type: "array", minItems: 1, maxItems: 20, items: object({ start: time, end: time, selection: rect, keyframes: { type: "array", maxItems: 100, items: object({ time, selection: rect }, ["time", "selection"]) } }, ["start", "end", "selection"]) } }, ["stateToken", "clipId", "kind"]);
export const AI_FRAMES_SCHEMA = object({ resultId: id, times: { type: "array", minItems: 1, maxItems: 6, items: time } }, ["resultId", "times"]);
export const AI_PREVIEW_SCHEMA = object({ stateToken: id, resultId: id, summary: { type: "string", maxLength: 2000 } }, ["stateToken", "resultId"]);
