import { MAX_TIMELINE_MARKER_SECONDS, TIMELINE_MARKER_COLORS, TIMELINE_MARKER_TYPES, normalizeTimelineMarkers } from "./timelineMarkers.js";
import { getCaptionTimeline, getTimedSegmentsEnd } from "./timeline.js";

export const PROJECT_COMMAND_SCHEMA_VERSION = 1;

const COMMAND_STATE_KEY = "commandState";
const MIN_TIMED_CAPTION_SECONDS = 0.2;

function failure(code, message, operationId = "") {
  return { ok: false, code, message, ...(operationId ? { operationId } : {}) };
}

function finiteNonNegative(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw Object.assign(new Error(`${name} must be a finite non-negative number`), { code: "INVALID_ARGUMENT" });
  }
  return value;
}

function finitePositive(value, name) {
  const result = finiteNonNegative(value, name);
  if (result <= 0) throw Object.assign(new Error(`${name} must be greater than zero`), { code: "INVALID_ARGUMENT" });
  return result;
}

function requireCaptionRange(start, end) {
  finiteNonNegative(start, "caption start");
  finiteNonNegative(end, "caption end");
  const tolerance = Number.EPSILON * Math.max(1, start, end) * 4;
  if (end - start < MIN_TIMED_CAPTION_SECONDS - tolerance) {
    throw Object.assign(new Error("Captions must last at least 0.2 seconds"), { code: "INVALID_RANGE" });
  }
}

function resolveProjectCaptions(project) {
  const captions = Array.isArray(project?.captionSegments) ? project.captionSegments : [];
  const timeline = getCaptionTimeline(captions, getTimedSegmentsEnd(project?.audioSegments || []));
  return captions.map((caption, index) => ({ ...caption, start: timeline[index].start, end: timeline[index].end }));
}

// Caption timing can be implicit in a saved project. Match the editor's
// voice-track clock before editing so inserting an explicit caption or adding
// voice media cannot rescale the existing subtitles behind the review. Reads
// use the same resolver without the editable-duration constraint.
export function materializeProjectCaptionTimings(project) {
  const captions = resolveProjectCaptions(project);
  for (const caption of captions) requireCaptionRange(caption.start, caption.end);
  return { ...project, captionSegments: captions };
}

function findById(items, id, kind) {
  const item = (Array.isArray(items) ? items : []).find((entry) => entry.id === id);
  if (!item) throw Object.assign(new Error(`${kind} not found: ${id}`), { code: "CLIP_NOT_FOUND" });
  return item;
}

function commandState(project) {
  const value = project?.[COMMAND_STATE_KEY];
  return {
    schemaVersion: PROJECT_COMMAND_SCHEMA_VERSION,
    revision: Number.isInteger(value?.revision) && value.revision >= 0 ? value.revision : 0,
    appliedOperationIds: Array.isArray(value?.appliedOperationIds) ? [...new Set(value.appliedOperationIds)] : [],
  };
}

function moveTimed(project, operation) {
  if (operation.track !== "audio") {
    throw Object.assign(new Error(`Unsupported timed track: ${operation.track}`), { code: "UNSUPPORTED_TRACK" });
  }
  const segment = findById(project.audioSegments, operation.clipId, "Audio clip");
  const nextStart = finiteNonNegative(operation.start, "start");
  const previousStart = Number(segment.start) || 0;
  segment.start = nextStart;
  const delta = nextStart - previousStart;
  project.captionSegments = (project.captionSegments || []).map((caption) => caption.audioSegmentId === segment.id
    ? { ...caption, start: finiteNonNegative((Number(caption.start) || 0) + delta, "caption start"), end: finiteNonNegative((Number(caption.end) || 0) + delta, "caption end") }
    : caption);
}

function resizeTimed(project, operation) {
  const collections = { audio: "audioSegments", sticker: "stickerSegments", overlay: "visualOverlaySegments" };
  const key = collections[operation.track];
  if (!key) throw Object.assign(new Error(`Unsupported timed track: ${operation.track}`), { code: "UNSUPPORTED_TRACK" });
  const segment = findById(project[key], operation.clipId, "Timed clip");
  const previousStart = Number(segment.start) || 0;
  const start = Object.hasOwn(operation, "start") ? finiteNonNegative(operation.start, "start") : previousStart;
  const duration = finitePositive(operation.duration, "duration");
  segment.start = start;
  segment.duration = duration;
  if (operation.track === "audio") {
    const delta = start - previousStart;
    const clipEnd = start + duration;
    project.captionSegments = (project.captionSegments || []).map((caption) => {
      if (caption.audioSegmentId !== segment.id) return caption;
      const captionStart = finiteNonNegative((Number(caption.start) || 0) + delta, "caption start");
      const captionEnd = Math.min(clipEnd, finiteNonNegative((Number(caption.end) || 0) + delta, "caption end"));
      return { ...caption, start: Math.min(captionStart, captionEnd), end: captionEnd };
    });
  }
}

function visualPlaybackRate(segment) {
  const value = Number(segment?.playbackRate) || 1;
  return Math.max(0.25, Math.min(4, value));
}

function remapKeyframes(keyframes, start, end) {
  return (Array.isArray(keyframes) ? keyframes : [])
    .filter((frame) => Number(frame?.time) >= start && Number(frame?.time) <= end)
    .map((frame) => ({ ...frame, time: Number(frame.time) - start }));
}

// Older projects identify source audio by asset ID. Resolve that implicit
// relationship before changing the sequence, so deleting the last explicitly
// mapped piece can never attach previously unmapped sibling clips.
function materializeSourceAudioMappings(project) {
  const visuals = project.visualSegments || [];
  const hasMapped = visuals.some((clip) => clip.type === "video" && Number.isFinite(clip.sourceAudioOffset));
  const candidates = [...new Set(visuals.filter((clip) => clip.type === "video" && clip.assetId).map((clip) => clip.assetId))];
  const legacyAssetId = project.sourceAudioAssetId || (candidates.length === 1 ? candidates[0] : "");
  if (!hasMapped && !(legacyAssetId && Number(project.sourceAudioDuration) > 0)) return;
  project.visualSegments = visuals.map((clip) => {
    if (clip.type !== "video" || clip.sourceAudioUnmapped || Number.isFinite(clip.sourceAudioOffset)) return clip;
    return !hasMapped && clip.assetId === legacyAssetId
      ? { ...clip, sourceAudioOffset: 0 }
      : { ...clip, sourceAudioUnmapped: true };
  });
}

function trimVisual(project, operation) {
  materializeSourceAudioMappings(project);
  const segment = findById(project.visualSegments, operation.clipId, "Visual clip");
  if (segment.type !== "video") throw Object.assign(new Error("visual.trim currently supports video clips only"), { code: "UNSUPPORTED_MEDIA_TYPE" });
  const sourceIn = finiteNonNegative(operation.sourceIn, "sourceIn");
  const sourceOut = finiteNonNegative(operation.sourceOut, "sourceOut");
  if (sourceOut <= sourceIn) throw Object.assign(new Error("sourceOut must be after sourceIn"), { code: "INVALID_RANGE" });
  const previousSourceIn = Math.max(0, Number(segment.sourceStart) || 0);
  const previousSourceDuration = Math.max(0, Number(segment.sourceDuration) || (Number(segment.duration) || 0) * visualPlaybackRate(segment));
  const previousSourceOut = previousSourceIn + previousSourceDuration;
  if (sourceIn < previousSourceIn || sourceOut > previousSourceOut) {
    throw Object.assign(new Error(`Trim range must stay within ${previousSourceIn}-${previousSourceOut}`), { code: "SOURCE_RANGE_EXCEEDED" });
  }
  const rate = visualPlaybackRate(segment);
  const removedLocalTime = (sourceIn - previousSourceIn) / rate;
  const duration = (sourceOut - sourceIn) / rate;
  segment.sourceStart = sourceIn;
  segment.sourceDuration = sourceOut - sourceIn;
  segment.duration = duration;
  if (Array.isArray(segment.keyframes)) segment.keyframes = remapKeyframes(segment.keyframes, removedLocalTime, removedLocalTime + duration);
}

function splitVisual(project, operation) {
  materializeSourceAudioMappings(project);
  const visuals = Array.isArray(project.visualSegments) ? project.visualSegments : [];
  const index = visuals.findIndex((segment) => segment.id === operation.clipId);
  if (index < 0) throw Object.assign(new Error(`Visual clip not found: ${operation.clipId}`), { code: "CLIP_NOT_FOUND" });
  const segment = visuals[index];
  const at = finitePositive(operation.at, "at");
  const duration = finitePositive(Number(segment.duration), "clip duration");
  if (at >= duration) throw Object.assign(new Error("at must be inside the visual clip"), { code: "INVALID_RANGE" });
  const rightClipId = typeof operation.rightClipId === "string" ? operation.rightClipId.trim() : "";
  if (!rightClipId) throw Object.assign(new Error("rightClipId is required"), { code: "INVALID_ARGUMENT" });
  requireNewClipId(project, rightClipId);
  const rate = segment.type === "video" ? visualPlaybackRate(segment) : 1;
  const archiveMediaId = segment.archiveMediaId || segment.id;
  const left = { ...segment, archiveMediaId, duration: at };
  const right = { ...segment, id: rightClipId, archiveMediaId, duration: duration - at };
  if (segment.type === "video") {
    left.sourceDuration = at * rate;
    right.sourceStart = Math.max(0, Number(segment.sourceStart) || 0) + at * rate;
    right.sourceDuration = (duration - at) * rate;
  }
  if (Array.isArray(segment.keyframes)) {
    left.keyframes = remapKeyframes(segment.keyframes, 0, at);
    right.keyframes = remapKeyframes(segment.keyframes, at, duration);
  }
  project.visualSegments = [...visuals.slice(0, index), left, right, ...visuals.slice(index + 1)];
}

function reorderVisual(project, operation) {
  const visuals = Array.isArray(project.visualSegments) ? project.visualSegments : [];
  const from = visuals.findIndex((segment) => segment.id === operation.clipId);
  if (from < 0) throw Object.assign(new Error(`Visual clip not found: ${operation.clipId}`), { code: "CLIP_NOT_FOUND" });
  if (!Number.isInteger(operation.toIndex) || operation.toIndex < 0 || operation.toIndex >= visuals.length) {
    throw Object.assign(new Error("toIndex must identify an existing visual position"), { code: "INVALID_ARGUMENT" });
  }
  if (from === operation.toIndex) return;
  const next = [...visuals];
  const [moved] = next.splice(from, 1);
  next.splice(operation.toIndex, 0, moved);
  project.visualSegments = next;
}

function requireNewClipId(project, clipId) {
  const id = typeof clipId === "string" ? clipId.trim() : "";
  if (!id) throw Object.assign(new Error("clipId is required"), { code: "INVALID_ARGUMENT" });
  const exists = Object.values(TRACK_COLLECTIONS).some((key) => (project?.[key] || []).some((clip) => clip.id === id));
  if (exists) throw Object.assign(new Error(`Clip already exists: ${id}`), { code: "CLIP_ALREADY_EXISTS" });
  return id;
}

function findVisualSource(project, sourceClipId) {
  const source = [...(project.visualSegments || []), ...(project.visualOverlaySegments || [])].find((clip) => clip.id === sourceClipId);
  if (!source) throw Object.assign(new Error(`Visual source clip not found: ${sourceClipId}`), { code: "CLIP_NOT_FOUND" });
  return source;
}

function cloneVisualForSequence(project, operation) {
  const id = requireNewClipId(project, operation.clipId);
  const source = findVisualSource(project, operation.sourceClipId);
  const maximumDuration = finitePositive(Number(source.duration), "source clip duration");
  const duration = Object.hasOwn(operation, "duration") ? finitePositive(operation.duration, "duration") : maximumDuration;
  if (source.type === "video" && duration > maximumDuration) {
    throw Object.assign(new Error(`Video duration cannot exceed source clip duration ${maximumDuration}`), { code: "SOURCE_RANGE_EXCEEDED" });
  }
  const next = { ...source, id, archiveMediaId: source.archiveMediaId || source.id, duration };
  delete next.start;
  delete next.layer;
  delete next.baseTransform;
  delete next.transition;
  if (source.type === "video") next.sourceDuration = duration * visualPlaybackRate(source);
  if (Array.isArray(source.keyframes)) next.keyframes = remapKeyframes(source.keyframes, 0, duration);
  return next;
}

function appendVisual(project, operation) {
  materializeSourceAudioMappings(project);
  project.visualSegments = [...(project.visualSegments || []), cloneVisualForSequence(project, operation)];
}

function importAsset(project, operation) {
  const id = requireNewClipId(project, operation.clipId);
  if (!["visuals", "audio", "music"].includes(operation.track)) throw Object.assign(new Error("asset.import supports Visuals, Voiceover, or Music"), { code: "UNSUPPORTED_TRACK" });
  if (!operation.prepared || !["image", "video", "audio"].includes(operation.mediaType) || !operation.sha256 || !operation.archivePath) {
    throw Object.assign(new Error("asset.import must be prepared by an archive media service"), { code: "ASSET_NOT_PREPARED" });
  }
  const duration = finitePositive(operation.duration, "duration");
  const integrity = { sha256: operation.sha256, size: operation.size, mimeType: operation.mimeType, archivePath: operation.archivePath };
  if (operation.track === "audio" || operation.track === "music") {
    if (operation.mediaType !== "audio") throw Object.assign(new Error(`${operation.track} import requires audio media`), { code: "UNSUPPORTED_MEDIA_TYPE" });
    const start = Object.hasOwn(operation, "start") ? finiteNonNegative(operation.start, "start") : 0;
    const segment = { id, name: operation.name || id, start, duration, sourceStart: 0, sourceDuration: duration, playbackRate: 1, volume: operation.volume ?? (operation.track === "music" ? 0.35 : 1), fadeIn: 0, fadeOut: 0, muted: operation.muted === true, integrity };
    if (operation.track === "audio") {
      project.audioSegments = operation.replace === true ? [segment] : [...(project.audioSegments || []), segment];
      project.audioDuration = project.audioSegments.reduce((end, item) => Math.max(end, (Number(item.start) || 0) + (Number(item.duration) || 0)), 0);
    } else {
      project.musicSegments = [segment];
      project.musicName = segment.name;
      project.musicDuration = duration;
      project.musicStart = start;
      project.musicVolume = segment.volume;
    }
    return;
  }
  if (!["image", "video"].includes(operation.mediaType)) throw Object.assign(new Error("Visuals import requires image or video media"), { code: "UNSUPPORTED_MEDIA_TYPE" });
  materializeSourceAudioMappings(project);
  const segment = {
    id,
    assetId: operation.assetId || `asset-${operation.sha256.slice(0, 16)}`,
    archiveMediaId: id,
    name: operation.name || id,
    type: operation.mediaType,
    duration,
    width: Math.max(0, Number(operation.width) || 0),
    height: Math.max(0, Number(operation.height) || 0),
    sourceStart: 0,
    sourceDuration: operation.mediaType === "video" ? duration : 0,
    playbackRate: 1,
    muted: operation.muted === true,
    ...(operation.mediaType === "video" ? { sourceAudioUnmapped: true, sourceAudioDisabled: operation.muted === true } : {}),
    integrity,
  };
  project.visualSegments = [...(project.visualSegments || []), segment];
}

function insertVisual(project, operation) {
  materializeSourceAudioMappings(project);
  const visuals = Array.isArray(project.visualSegments) ? project.visualSegments : [];
  if (!Number.isInteger(operation.atIndex) || operation.atIndex < 0 || operation.atIndex > visuals.length) {
    throw Object.assign(new Error("atIndex must be a valid visual insertion position"), { code: "INVALID_ARGUMENT" });
  }
  const next = cloneVisualForSequence(project, operation);
  project.visualSegments = [...visuals.slice(0, operation.atIndex), next, ...visuals.slice(operation.atIndex)];
}

function deleteVisual(project, operation) {
  materializeSourceAudioMappings(project);
  findById(project.visualSegments, operation.clipId, "Visual clip");
  project.visualSegments = project.visualSegments.filter((clip) => clip.id !== operation.clipId);
}

function duplicateVisual(project, operation) {
  materializeSourceAudioMappings(project);
  const source = findById(project.visualSegments, operation.clipId, "Visual clip");
  const id = requireNewClipId(project, operation.newClipId);
  const sourceIndex = project.visualSegments.indexOf(source);
  const atIndex = operation.atIndex === undefined ? sourceIndex + 1 : operation.atIndex;
  if (!Number.isInteger(atIndex) || atIndex < 0 || atIndex > project.visualSegments.length) {
    throw Object.assign(new Error("atIndex must be a valid visual insertion position"), { code: "INVALID_ARGUMENT" });
  }
  const copy = { ...structuredClone(source), id, archiveMediaId: source.archiveMediaId || source.id };
  // A transition belongs to a boundary, not to the duplicated media clip.
  delete copy.transition;
  project.visualSegments.splice(atIndex, 0, copy);
}

// The host prepares local asset metadata. Browser callers cannot supply this
// payload: the browser planner resolves an asset ID and constructs it itself.
function insertPreparedAsset(project, operation) {
  if (operation.track === "visuals") materializeSourceAudioMappings(project);
  const id = requireNewClipId(project, operation.clipId);
  const source = operation.preparedSource;
  if (operation.prepared !== true || !source || !["image", "video", "audio"].includes(source.type)) {
    throw Object.assign(new Error("asset.insert requires host-prepared media metadata"), { code: "ASSET_NOT_PREPARED" });
  }
  const duration = finitePositive(operation.duration, "duration");
  const segment = { ...structuredClone(source), id, duration };
  if (source.type !== "image") {
    const available = finitePositive(source.sourceDuration, "sourceDuration");
    if (duration > available) throw Object.assign(new Error("Asset duration exceeds its source"), { code: "SOURCE_RANGE_EXCEEDED" });
    segment.sourceDuration = duration;
  }
  if (operation.track === "visuals") {
    if (!["image", "video"].includes(source.type)) throw Object.assign(new Error("Visuals require image or video media"), { code: "UNSUPPORTED_MEDIA_TYPE" });
    if (!Number.isInteger(operation.atIndex) || operation.atIndex < 0 || operation.atIndex > (project.visualSegments || []).length) {
      throw Object.assign(new Error("atIndex must be a valid visual insertion position"), { code: "INVALID_ARGUMENT" });
    }
    delete segment.start;
    project.visualSegments.splice(operation.atIndex, 0, segment);
  } else if (operation.track === "overlays") {
    if (!["image", "video"].includes(source.type)) throw Object.assign(new Error("Overlays require image or video media"), { code: "UNSUPPORTED_MEDIA_TYPE" });
    segment.start = finiteNonNegative(operation.start, "start");
    segment.layer = operation.layer;
    segment.baseTransform = { x: 27, y: -24, scale: 0.34, rotation: 0, opacity: 1, ...operation.transform };
    project.visualOverlaySegments = [...(project.visualOverlaySegments || []), segment];
  } else if (["audio", "music"].includes(operation.track)) {
    if (source.type !== "audio") throw Object.assign(new Error("Audio tracks require audio media"), { code: "UNSUPPORTED_MEDIA_TYPE" });
    segment.start = finiteNonNegative(operation.start, "start");
    if (operation.lane !== undefined) segment.lane = operation.lane;
    const key = operation.track === "audio" ? "audioSegments" : "musicSegments";
    project[key] = [...(project[key] || []), segment];
    if (operation.track === "audio") project.audioDuration = project.audioSegments.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
    else {
      project.musicName = source.name;
      project.musicDuration = source.sourceDuration;
      project.musicStart = Math.min(...project.musicSegments.map((clip) => clip.start));
    }
  } else throw Object.assign(new Error("Unknown asset track"), { code: "UNSUPPORTED_TRACK" });
}

function addOverlay(project, operation) {
  const id = requireNewClipId(project, operation.clipId);
  const source = findVisualSource(project, operation.sourceClipId);
  const start = finiteNonNegative(operation.start, "start");
  const sourceDuration = finitePositive(Number(source.duration), "source clip duration");
  const duration = Object.hasOwn(operation, "duration") ? finitePositive(operation.duration, "duration") : Math.min(5, sourceDuration);
  if (source.type === "video" && duration > sourceDuration) {
    throw Object.assign(new Error(`Overlay duration cannot exceed source clip duration ${sourceDuration}`), { code: "SOURCE_RANGE_EXCEEDED" });
  }
  const layer = Object.hasOwn(operation, "layer") ? finitePositive(operation.layer, "layer")
    : (project.visualOverlaySegments || []).reduce((maximum, clip) => Math.max(maximum, Number(clip.layer) || 1), 0) + 1;
  const transform = operation.transform || {};
  for (const key of ["x", "y", "scale", "rotation", "opacity"]) {
    if (Object.hasOwn(transform, key) && (typeof transform[key] !== "number" || !Number.isFinite(transform[key]))) {
      throw Object.assign(new Error(`transform.${key} must be finite`), { code: "INVALID_ARGUMENT" });
    }
  }
  const rate = visualPlaybackRate(source);
  const overlay = {
    id,
    assetId: source.assetId || "",
    archiveMediaId: source.archiveMediaId || source.id,
    name: source.name || "Overlay",
    type: source.type === "video" ? "video" : "image",
    width: Number(source.width) || 0,
    height: Number(source.height) || 0,
    sourceStart: Math.max(0, Number(source.sourceStart) || 0),
    sourceDuration: source.type === "video" ? duration * rate : Math.max(0, Number(source.sourceDuration) || 0),
    playbackRate: rate,
    start,
    duration,
    muted: operation.muted === true,
    layer,
    baseTransform: { x: 27, y: -24, scale: 0.34, rotation: 0, opacity: 1, ...transform },
    keyframes: [],
  };
  project.visualOverlaySegments = [...(project.visualOverlaySegments || []), overlay];
}

function setTransition(project, operation) {
  const transitions = new Set(["none", "fade", "zoom", "flash", "wipe-left", "wipe-up", "blur", "split", "glitch"]);
  if (!transitions.has(operation.transitionId)) throw Object.assign(new Error(`Unknown transition: ${operation.transitionId}`), { code: "INVALID_TRANSITION" });
  const visuals = Array.isArray(project.visualSegments) ? project.visualSegments : [];
  const index = visuals.findIndex((clip) => clip.id === operation.clipId);
  if (index < 0) throw Object.assign(new Error(`Visual clip not found: ${operation.clipId}`), { code: "CLIP_NOT_FOUND" });
  if (operation.transitionId !== "none" && index >= visuals.length - 1) {
    throw Object.assign(new Error("A transition requires a following visual clip"), { code: "INVALID_TRANSITION_TARGET" });
  }
  const maximum = index < visuals.length - 1
    ? Math.max(0.1, Math.min(2, Number(visuals[index].duration) / 2, Number(visuals[index + 1].duration) / 2))
    : 0.5;
  const duration = Object.hasOwn(operation, "duration") ? finitePositive(operation.duration, "duration") : 0.5;
  if (duration > maximum) throw Object.assign(new Error(`Transition duration cannot exceed ${maximum}`), { code: "INVALID_RANGE" });
  visuals[index].transition = { id: operation.transitionId, duration: Math.min(duration, maximum) };
}

function updateCaption(project, operation) {
  project.captionSegments = materializeProjectCaptionTimings(project).captionSegments;
  const caption = findById(project.captionSegments, operation.clipId, "Caption clip");
  if (Object.hasOwn(operation, "text")) {
    if (typeof operation.text !== "string") throw Object.assign(new Error("text must be a string"), { code: "INVALID_ARGUMENT" });
    caption.text = operation.text;
  }
  if (Object.hasOwn(operation, "start")) caption.start = finiteNonNegative(operation.start, "start");
  if (Object.hasOwn(operation, "end")) caption.end = finiteNonNegative(operation.end, "end");
  requireCaptionRange(caption.start, caption.end);
  project.script = (project.captionSegments || []).map((item) => item.text).join("\n");
}

function addCaption(project, operation) {
  project.captionSegments = materializeProjectCaptionTimings(project).captionSegments;
  const id = requireNewClipId(project, operation.clipId);
  const captions = Array.isArray(project.captionSegments) ? project.captionSegments : [];
  if (captions.some((caption) => caption.id === id)) {
    throw Object.assign(new Error(`Caption clip already exists: ${id}`), { code: "CLIP_ALREADY_EXISTS" });
  }
  if (typeof operation.text !== "string") throw Object.assign(new Error("text must be a string"), { code: "INVALID_ARGUMENT" });
  const start = finiteNonNegative(operation.start, "start");
  const end = finiteNonNegative(operation.end, "end");
  requireCaptionRange(start, end);
  let audioSegmentId = "";
  if (operation.audioClipId) audioSegmentId = findById(project.audioSegments, operation.audioClipId, "Audio clip").id;
  const previousCaption = [...captions]
    .sort((left, right) => (Number(left.start) || 0) - (Number(right.start) || 0))
    .filter((caption) => (Number(caption.start) || 0) <= start)
    .at(-1);
  project.captionSegments = [...captions, {
    id,
    text: operation.text,
    start,
    end,
    fontId: operation.fontId || previousCaption?.fontId || project.captionStyle?.fontId || "default",
    ...(audioSegmentId ? { audioSegmentId } : {}),
  }].sort((left, right) => (Number(left.start) || 0) - (Number(right.start) || 0));
  project.script = project.captionSegments.map((item) => item.text).join("\n");
  project.captionsEnabled = true;
}

function deleteClip(project, operation) {
  const collections = { caption: "captionSegments", audio: "audioSegments" };
  const key = collections[operation.track];
  if (!key) throw Object.assign(new Error(`Unsupported clip track: ${operation.track}`), { code: "UNSUPPORTED_TRACK" });
  if (operation.track === "caption") project.captionSegments = materializeProjectCaptionTimings(project).captionSegments;
  findById(project[key], operation.clipId, `${operation.track === "caption" ? "Caption" : "Audio"} clip`);
  project[key] = project[key].filter((item) => item.id !== operation.clipId);
  if (operation.track === "caption") {
    project.script = project.captionSegments.map((item) => item.text).join("\n");
  } else {
    project.captionSegments = (project.captionSegments || []).map((caption) => (
      caption.audioSegmentId === operation.clipId || caption.detachedAudioSegmentId === operation.clipId
        ? { ...caption, audioSegmentId: "", detachedAudioSegmentId: "" }
        : caption
    ));
  }
}

function unlinkCaption(project, operation) {
  const caption = findById(project.captionSegments, operation.clipId, "Caption clip");
  if (caption.audioSegmentId) caption.detachedAudioSegmentId = caption.audioSegmentId;
  caption.audioSegmentId = "";
}

function linkCaption(project, operation) {
  const caption = findById(project.captionSegments, operation.clipId, "Caption clip");
  const audioId = operation.audioClipId || caption.detachedAudioSegmentId;
  if (!audioId) throw Object.assign(new Error("audioClipId is required"), { code: "INVALID_ARGUMENT" });
  const audio = findById(project.audioSegments, audioId, "Audio clip");
  caption.audioSegmentId = audio.id;
  caption.detachedAudioSegmentId = "";
  if (operation.align === true) {
    caption.start = Number(audio.start) || 0;
    caption.end = caption.start + finiteNonNegative(audio.duration, "audio duration");
  }
}

function findClipMatch(project, clipId) {
  const matches = Object.entries(TRACK_COLLECTIONS).flatMap(([track, key]) => {
    const clips = Array.isArray(project?.[key]) ? project[key] : [];
    return clips.flatMap((clip, index) => clip.id === clipId ? [{ track, key, clip, index }] : []);
  });
  if (!matches.length) throw Object.assign(new Error(`Clip not found: ${clipId}`), { code: "CLIP_NOT_FOUND" });
  if (matches.length > 1) throw Object.assign(new Error(`Clip ID is not globally unique: ${clipId}`), { code: "CLIP_ID_AMBIGUOUS" });
  return matches[0];
}

const NUMERIC_CLIP_PROPERTIES = Object.freeze({
  x: { min: -1000, max: 1000 },
  y: { min: -1000, max: 1000 },
  scale: { min: 0.1, max: 20 },
  rotation: { min: -36000, max: 36000 },
  opacity: { min: 0, max: 1 },
  volume: { min: 0, max: 4 },
  fadeIn: { min: 0, max: 1800 },
  fadeOut: { min: 0, max: 1800 },
  layer: { min: 0, max: 1000 },
});

function setClipProperty(project, operation) {
  const { clip } = findClipMatch(project, operation.clipId);
  const limits = NUMERIC_CLIP_PROPERTIES[operation.property];
  if (!limits) throw Object.assign(new Error(`Unsupported clip property: ${operation.property}`), { code: "UNSUPPORTED_PROPERTY" });
  if (typeof operation.value !== "number" || !Number.isFinite(operation.value) || operation.value < limits.min || operation.value > limits.max) {
    throw Object.assign(new Error(`${operation.property} must be between ${limits.min} and ${limits.max}`), { code: "INVALID_ARGUMENT" });
  }
  clip[operation.property] = operation.value;
}

function setClipSpeed(project, operation) {
  const match = findClipMatch(project, operation.clipId);
  if (match.track === "captions" || match.track === "stickers" || (match.track === "visuals" && match.clip.type !== "video") || (match.track === "overlays" && match.clip.type !== "video")) {
    throw Object.assign(new Error(`Speed is unsupported for ${match.track} clip ${operation.clipId}`), { code: "UNSUPPORTED_MEDIA_TYPE" });
  }
  const speed = finitePositive(operation.speed, "speed");
  if (speed < 0.25 || speed > 4) throw Object.assign(new Error("speed must be between 0.25 and 4"), { code: "INVALID_ARGUMENT" });
  const clip = match.clip;
  const previousDuration = finitePositive(Number(clip.duration), "clip duration");
  const previousRate = visualPlaybackRate(clip);
  const sourceDuration = Math.max(0.001, Number(clip.sourceDuration) || previousDuration * previousRate);
  const duration = sourceDuration / speed;
  clip.playbackRate = speed;
  clip.sourceDuration = sourceDuration;
  clip.duration = duration;
  if (Array.isArray(clip.keyframes)) {
    const timeScale = duration / previousDuration;
    clip.keyframes = clip.keyframes.map((frame) => ({ ...frame, time: Math.max(0, Number(frame.time) || 0) * timeScale }));
  }
  if (match.track === "audio") {
    const clipEnd = (Number(clip.start) || 0) + duration;
    project.captionSegments = (project.captionSegments || []).map((caption) => caption.audioSegmentId === clip.id
      ? { ...caption, end: Math.max(Number(caption.start) || 0, Math.min(Number(caption.end) || 0, clipEnd)) }
      : caption);
  }
}

function setClipMuted(project, operation) {
  if (typeof operation.muted !== "boolean") throw Object.assign(new Error("muted must be a boolean"), { code: "INVALID_ARGUMENT" });
  const { track, clip } = findClipMatch(project, operation.clipId);
  if (!["visuals", "audio", "overlays", "music"].includes(track)) {
    throw Object.assign(new Error(`Mute is unsupported for ${track} clips`), { code: "UNSUPPORTED_TRACK" });
  }
  if ((track === "visuals" || track === "overlays") && clip.type !== "video") {
    throw Object.assign(new Error("Mute is supported only for video or audio clips"), { code: "UNSUPPORTED_MEDIA_TYPE" });
  }
  if (track === "visuals") clip.sourceAudioDisabled = operation.muted;
  clip.muted = operation.muted;
}

const TRACK_STATE_KEYS = Object.freeze({
  visuals: "image", image: "image",
  captions: "caption", caption: "caption",
  audio: "audio",
  stickers: "sticker", sticker: "sticker",
  overlays: "overlay", overlay: "overlay",
  source: "source",
  music: "music",
});

function setTrackState(project, operation, stateKey) {
  const track = TRACK_STATE_KEYS[operation.track];
  if (!track) throw Object.assign(new Error(`Unknown track: ${operation.track}`), { code: "TRACK_NOT_FOUND" });
  const value = operation[stateKey];
  if (typeof value !== "boolean") throw Object.assign(new Error(`${stateKey} must be a boolean`), { code: "INVALID_ARGUMENT" });
  const projectKey = stateKey === "visible" ? "trackVisibility" : "trackLocks";
  project[projectKey] = { ...(project[projectKey] || {}), [track]: value };
}

function setProjectRatio(project, operation) {
  const supportedRatios = new Set(["16:9", "9:16", "1:1", "4:5"]);
  if (!supportedRatios.has(operation.ratio)) throw Object.assign(new Error(`Unsupported project ratio: ${operation.ratio}`), { code: "INVALID_RATIO" });
  project.ratioId = operation.ratio;
}

function requireMarkerId(value) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 160) {
    throw Object.assign(new Error("markerId must be a non-empty string of at most 160 characters without surrounding whitespace"), { code: "INVALID_ARGUMENT" });
  }
  return value;
}

function markerNumber(value, field) {
  const result = finiteNonNegative(value, field);
  if (result > MAX_TIMELINE_MARKER_SECONDS) {
    throw Object.assign(new Error(`${field} must not exceed ${MAX_TIMELINE_MARKER_SECONDS} seconds`), { code: "INVALID_ARGUMENT" });
  }
  return result;
}

function markerString(value, field, maximumLength) {
  if (typeof value !== "string" || value.length > maximumLength) {
    throw Object.assign(new Error(`${field} must be a string of at most ${maximumLength} characters`), { code: "INVALID_ARGUMENT" });
  }
  return value;
}

function markerKind(value) {
  if (!TIMELINE_MARKER_TYPES.includes(value)) {
    throw Object.assign(new Error(`markerType must be one of ${TIMELINE_MARKER_TYPES.join(", ")}`), { code: "INVALID_ARGUMENT" });
  }
  return value;
}

function markerColor(value) {
  if (!TIMELINE_MARKER_COLORS.includes(value)) {
    throw Object.assign(new Error(`color must be one of ${TIMELINE_MARKER_COLORS.join(", ")}`), { code: "INVALID_ARGUMENT" });
  }
  return value;
}

function markerEntries(project) {
  const raw = Array.isArray(project?.timelineMarkers) ? project.timelineMarkers : [];
  const indices = raw.flatMap((item, index) => item && typeof item === "object" && !Array.isArray(item) ? [index] : []);
  return normalizeTimelineMarkers(raw).map((marker, index) => ({ marker, index: indices[index] }));
}

function findMarkerEntry(project, markerId) {
  const markers = Array.isArray(project.timelineMarkers) ? project.timelineMarkers : [];
  const index = markers.findIndex((marker) => marker.id === markerId);
  if (index < 0) throw Object.assign(new Error(`Marker not found: ${markerId}`), { code: "MARKER_NOT_FOUND" });
  return { marker: markers[index], index };
}

function nextMarker(operation, markerId, previous = null) {
  const has = (field) => Object.hasOwn(operation, field);
  const type = has("markerType") ? markerKind(operation.markerType) : previous?.type || "marker";
  const time = has("time") ? markerNumber(operation.time, "time") : previous ? previous.time : markerNumber(undefined, "time");
  const marker = {
    id: markerId,
    type,
    time,
    title: has("title") ? markerString(operation.title, "title", 240) : previous?.title || "",
    notes: has("notes") ? markerString(operation.notes, "notes", 20000) : previous?.notes || "",
    color: has("color") ? markerColor(operation.color) : previous?.color || "cyan",
  };
  if (type === "range") {
    const endTime = has("endTime") ? markerNumber(operation.endTime, "endTime")
      : previous?.type === "range" ? markerNumber(has("time") ? time + Math.max(0.001, previous.endTime - previous.time) : previous.endTime, "endTime")
        : markerNumber(undefined, "endTime");
    const timeTolerance = Number.EPSILON * Math.max(1, time, endTime) * 4;
    if (endTime <= time || endTime - time < 0.001 - timeTolerance) {
      throw Object.assign(new Error("A range marker must span at least 0.001 seconds"), { code: "INVALID_RANGE" });
    }
    marker.endTime = endTime;
  } else if (has("endTime")) {
    throw Object.assign(new Error("endTime is supported only for range markers"), { code: "INVALID_ARGUMENT" });
  }
  return marker;
}

function addMarker(project, operation) {
  const markerId = requireMarkerId(operation.markerId);
  if ((project.timelineMarkers || []).some((marker) => marker.id === markerId)) {
    throw Object.assign(new Error(`Marker already exists: ${markerId}`), { code: "MARKER_ALREADY_EXISTS" });
  }
  const marker = nextMarker(operation, markerId);
  project.timelineMarkers = [...(Array.isArray(project.timelineMarkers) ? project.timelineMarkers : []), marker];
}

function updateMarker(project, operation) {
  const markerId = requireMarkerId(operation.markerId);
  const { marker, index } = findMarkerEntry(project, markerId);
  const updated = { ...project.timelineMarkers[index], ...nextMarker(operation, markerId, marker) };
  if (updated.type !== "range") delete updated.endTime;
  project.timelineMarkers[index] = updated;
}

function deleteMarker(project, operation) {
  const markerId = requireMarkerId(operation.markerId);
  const { index } = findMarkerEntry(project, markerId);
  project.timelineMarkers.splice(index, 1);
}

const reducers = {
  "asset.import": importAsset,
  "asset.insert": insertPreparedAsset,
  "timed.move": moveTimed,
  "timed.resize": resizeTimed,
  "visual.trim": trimVisual,
  "visual.split": splitVisual,
  "visual.reorder": reorderVisual,
  "visual.append": appendVisual,
  "visual.insert": insertVisual,
  "visual.delete": deleteVisual,
  "visual.duplicate": duplicateVisual,
  "overlay.add": addOverlay,
  "transition.set": setTransition,
  "caption.add": addCaption,
  "caption.update": updateCaption,
  "caption.delete": (project, operation) => deleteClip(project, { ...operation, track: "caption" }),
  "caption.unlink_audio": unlinkCaption,
  "caption.link_audio": linkCaption,
  "marker.add": addMarker,
  "marker.update": updateMarker,
  "marker.delete": deleteMarker,
  "clip.delete": deleteClip,
  "clip.set_property": setClipProperty,
  "clip.set_speed": setClipSpeed,
  "clip.set_muted": setClipMuted,
  "track.set_visibility": (project, operation) => setTrackState(project, operation, "visible"),
  "track.set_locked": (project, operation) => setTrackState(project, operation, "locked"),
  "project.set_ratio": setProjectRatio,
};

export function validateCommandPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return failure("INVALID_PLAN", "Plan must be an object");
  if (plan.schemaVersion !== PROJECT_COMMAND_SCHEMA_VERSION) return failure("UNSUPPORTED_SCHEMA", "schemaVersion must be 1");
  if (!Number.isInteger(plan.baseRevision) || plan.baseRevision < 0) return failure("INVALID_PLAN", "baseRevision must be a non-negative integer");
  if (!Array.isArray(plan.operations) || plan.operations.length === 0) return failure("INVALID_PLAN", "operations must be a non-empty array");
  const ids = new Set();
  for (const operation of plan.operations) {
    if (!operation || typeof operation.id !== "string" || !operation.id.trim()) return failure("INVALID_PLAN", "Every operation requires an id");
    if (ids.has(operation.id)) return failure("DUPLICATE_OPERATION_ID", `Duplicate operation id: ${operation.id}`, operation.id);
    ids.add(operation.id);
    if (!Object.hasOwn(reducers, operation.type)) return failure("UNKNOWN_OPERATION", `Unknown operation type: ${operation.type}`, operation.id);
  }
  return { ok: true };
}

export function inspectProject(project) {
  const state = commandState(project);
  const captions = resolveProjectCaptions(project);
  const audio = Array.isArray(project?.audioSegments) ? project.audioSegments : [];
  const visuals = Array.isArray(project?.visualSegments) ? project.visualSegments : [];
  const stickers = Array.isArray(project?.stickerSegments) ? project.stickerSegments : [];
  const overlays = Array.isArray(project?.visualOverlaySegments) ? project.visualOverlaySegments : [];
  const music = Array.isArray(project?.musicSegments) ? project.musicSegments : [];
  const markers = normalizeTimelineMarkers(project?.timelineMarkers);
  const visualDuration = visuals.reduce((total, item) => total + Math.max(0, Number(item.duration) || 0), 0);
  const duration = [visualDuration, ...captions.map((item) => Number(item.end) || 0), ...audio.map((item) => (Number(item.start) || 0) + (Number(item.duration) || 0)),
    ...stickers.map((item) => (Number(item.start) || 0) + (Number(item.duration) || 0)),
    ...overlays.map((item) => (Number(item.start) || 0) + (Number(item.duration) || 0)),
    ...music.map((item) => (Number(item.start) || 0) + (Number(item.duration) || 0))]
    .reduce((maximum, value) => Math.max(maximum, value), 0);
  return {
    schemaVersion: PROJECT_COMMAND_SCHEMA_VERSION,
    revision: state.revision,
    duration,
    ratio: project?.ratioId || "16:9",
    tracks: { captions: captions.length, audio: audio.length, visuals: visuals.length, stickers: stickers.length, overlays: overlays.length, music: music.length },
    markers: { count: markers.length, byType: Object.fromEntries(TIMELINE_MARKER_TYPES.map((type) => [type, markers.filter((marker) => marker.type === type).length])) },
    appliedOperationIds: state.appliedOperationIds,
    warnings: audio.length ? [] : ["Project has no serialized voiceover clips"],
  };
}

const TRACK_COLLECTIONS = Object.freeze({
  visuals: "visualSegments",
  captions: "captionSegments",
  audio: "audioSegments",
  stickers: "stickerSegments",
  overlays: "visualOverlaySegments",
  music: "musicSegments",
});

function clipSummary(track, clip, index, visualStart = 0) {
  if (track === "visuals") {
    const duration = Math.max(0, Number(clip.duration) || 0);
    return { id: clip.id, index, type: clip.type || "image", start: visualStart, end: visualStart + duration, duration,
      assetId: clip.assetId || "", name: clip.name || "" };
  }
  if (track === "captions") {
    const start = Math.max(0, Number(clip.start) || 0);
    const end = Math.max(start, Number(clip.end) || start);
    return { id: clip.id, index, start, end, duration: end - start, text: clip.text || "", audioSegmentId: clip.audioSegmentId || "" };
  }
  const start = Math.max(0, Number(clip.start) || 0);
  const duration = Math.max(0, Number(clip.duration) || 0);
  return { id: clip.id, index, start, end: start + duration, duration, name: clip.name || "" };
}

export function inspectTrack(project, track) {
  const key = TRACK_COLLECTIONS[track];
  if (!key) throw Object.assign(new Error(`Unknown track: ${track}`), { code: "TRACK_NOT_FOUND" });
  const clips = track === "captions" ? resolveProjectCaptions(project) : Array.isArray(project?.[key]) ? project[key] : [];
  let visualCursor = 0;
  const summaries = clips.map((clip, index) => {
    const summary = clipSummary(track, clip, index, visualCursor);
    if (track === "visuals") visualCursor = summary.end;
    return summary;
  }).sort((left, right) => left.start - right.start || left.index - right.index);
  return {
    schemaVersion: PROJECT_COMMAND_SCHEMA_VERSION,
    revision: commandState(project).revision,
    track,
    visible: project?.trackVisibility?.[TRACK_STATE_KEYS[track]] ?? true,
    locked: project?.trackLocks?.[TRACK_STATE_KEYS[track]] ?? false,
    clipCount: summaries.length,
    duration: summaries.reduce((maximum, clip) => Math.max(maximum, clip.end), 0),
    clips: summaries,
  };
}

export function inspectClip(project, clipId) {
  const { track, clip: storedClip, index } = findClipMatch(project, clipId);
  const clip = track === "captions" ? resolveProjectCaptions(project)[index] : storedClip;
  const visualStart = track === "visuals"
    ? project.visualSegments.slice(0, index).reduce((total, item) => total + Math.max(0, Number(item.duration) || 0), 0)
    : 0;
  return {
    schemaVersion: PROJECT_COMMAND_SCHEMA_VERSION,
    revision: commandState(project).revision,
    track,
    summary: clipSummary(track, clip, index, visualStart),
    source: {
      assetId: clip.assetId || "",
      archiveMediaId: clip.archiveMediaId || clip.id,
      sourceStart: Math.max(0, Number(clip.sourceStart) || 0),
      sourceDuration: Math.max(0, Number(clip.sourceDuration) || 0),
      playbackRate: visualPlaybackRate(clip),
    },
    links: { audioSegmentId: clip.audioSegmentId || "", detachedAudioSegmentId: clip.detachedAudioSegmentId || "" },
    properties: Object.fromEntries(Object.entries(clip).filter(([key]) => !["id", "assetId", "archiveMediaId", "sourceStart", "sourceDuration", "playbackRate", "audioSegmentId", "detachedAudioSegmentId"].includes(key))),
  };
}

export function inspectTranscript(project, audioClipId = "") {
  const captions = resolveProjectCaptions(project)
    .map((caption, index) => {
      const start = Math.max(0, Number(caption.start) || 0);
      const end = Math.max(start, Number(caption.end) || start);
      const words = (Array.isArray(caption.words) ? caption.words : []).map((word) => ({
        text: String(word?.text ?? word?.word ?? ""),
        start: Math.max(start, Number(word?.start) || start),
        end: Math.max(start, Number(word?.end) || Number(word?.start) || start),
        ...(Number.isFinite(Number(word?.confidence)) ? { confidence: Number(word.confidence) } : {}),
      }));
      return {
        id: caption.id,
        index,
        text: caption.text || "",
        start,
        end,
        duration: end - start,
        speaker: caption.speaker || caption.speakerId || "",
        audioClipId: caption.audioSegmentId || "",
        detachedAudioClipId: caption.detachedAudioSegmentId || "",
        words,
      };
    }).filter((caption) => !audioClipId || (caption.audioClipId || caption.detachedAudioClipId) === audioClipId)
    .sort((left, right) => left.start - right.start || left.index - right.index);
  return {
    schemaVersion: PROJECT_COMMAND_SCHEMA_VERSION,
    revision: commandState(project).revision,
    audioClipId,
    segmentCount: captions.length,
    wordCount: captions.reduce((total, caption) => total + caption.words.length, 0),
    duration: captions.reduce((maximum, caption) => Math.max(maximum, caption.end), 0),
    text: captions.map((caption) => caption.text).join("\n"),
    segments: captions,
  };
}

export function inspectMarkers(project, markerId = "") {
  const entries = markerEntries(project).sort((left, right) => left.marker.time - right.marker.time || left.index - right.index);
  const markers = entries.filter(({ marker }) => markerId === "" || marker.id === markerId).map(({ marker }) => marker);
  if (markerId !== "" && !markers.length) throw Object.assign(new Error(`Marker not found: ${markerId}`), { code: "MARKER_NOT_FOUND" });
  return {
    schemaVersion: PROJECT_COMMAND_SCHEMA_VERSION,
    revision: commandState(project).revision,
    markerCount: markers.length,
    markers,
  };
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function diffProjects(beforeProject, afterProject) {
  const projectFields = ["ratioId", "fitMode", "trackVisibility", "trackLocks", "script", "captionsEnabled"]
    .flatMap((field) => sameValue(beforeProject?.[field], afterProject?.[field]) ? [] : [{ field, before: beforeProject?.[field] ?? null, after: afterProject?.[field] ?? null }]);
  const tracks = Object.fromEntries(Object.entries(TRACK_COLLECTIONS).flatMap(([track, key]) => {
    const before = Array.isArray(beforeProject?.[key]) ? beforeProject[key] : [];
    const after = Array.isArray(afterProject?.[key]) ? afterProject[key] : [];
    const beforeById = new Map(before.map((clip) => [clip.id, clip]));
    const afterById = new Map(after.map((clip) => [clip.id, clip]));
    const added = after.filter((clip) => !beforeById.has(clip.id)).map((clip) => clip.id);
    const removed = before.filter((clip) => !afterById.has(clip.id)).map((clip) => clip.id);
    const modified = after.flatMap((clip) => {
      const previous = beforeById.get(clip.id);
      if (!previous || sameValue(previous, clip)) return [];
      const fields = [...new Set([...Object.keys(previous), ...Object.keys(clip)])]
        .filter((field) => !sameValue(previous[field], clip[field]));
      return [{ id: clip.id, fields, before: Object.fromEntries(fields.map((field) => [field, previous[field] ?? null])), after: Object.fromEntries(fields.map((field) => [field, clip[field] ?? null])) }];
    });
    const orderBefore = before.map((clip) => clip.id);
    const orderAfter = after.map((clip) => clip.id);
    if (!added.length && !removed.length && !modified.length && sameValue(orderBefore, orderAfter)) return [];
    return [[track, { added, removed, modified, ...(sameValue(orderBefore, orderAfter) ? {} : { orderBefore, orderAfter }) }]];
  }));
  const beforeMarkers = inspectMarkers(beforeProject).markers;
  const afterMarkers = inspectMarkers(afterProject).markers;
  const beforeMarkersById = new Map(beforeMarkers.map((marker) => [marker.id, marker]));
  const afterMarkersById = new Map(afterMarkers.map((marker) => [marker.id, marker]));
  const markers = {
    added: afterMarkers.filter((marker) => !beforeMarkersById.has(marker.id)),
    removed: beforeMarkers.filter((marker) => !afterMarkersById.has(marker.id)),
    modified: afterMarkers.flatMap((marker) => {
      const previous = beforeMarkersById.get(marker.id);
      if (!previous || sameValue(previous, marker)) return [];
      const fields = [...new Set([...Object.keys(previous), ...Object.keys(marker)])]
        .filter((field) => !sameValue(previous[field], marker[field]));
      return [{ id: marker.id, fields, before: previous, after: marker }];
    }),
  };
  return { projectFields, tracks, ...(markers.added.length || markers.removed.length || markers.modified.length ? { markers } : {}) };
}

export function applyCommandPlan(project, plan) {
  const validity = validateCommandPlan(plan);
  if (!validity.ok) return validity;
  const current = commandState(project);
  const alreadyApplied = new Set(current.appliedOperationIds);
  if (plan.operations.every((operation) => alreadyApplied.has(operation.id))) {
    return {
      ok: true,
      revision: current.revision,
      appliedOperationIds: [],
      warnings: [],
      project: structuredClone(project),
      before: inspectProject(project),
      after: inspectProject(project),
      changes: { projectFields: [], tracks: {} },
    };
  }
  if (plan.baseRevision !== current.revision) {
    return failure("REVISION_CONFLICT", `Expected revision ${plan.baseRevision}, found ${current.revision}`);
  }
  const next = structuredClone(project);
  const appliedOperationIds = [];
  let operationId = "";
  try {
    // Resolve imported/missing/duplicate IDs once before any marker mutations.
    // Deleting an earlier entry must not reassign a later annotation's identity.
    if (plan.operations.some((operation) => !alreadyApplied.has(operation.id) && operation.type.startsWith("marker."))) {
      next.timelineMarkers = normalizeTimelineMarkers(next.timelineMarkers);
    }
    for (const operation of plan.operations) {
      if (alreadyApplied.has(operation.id)) continue;
      operationId = operation.id;
      reducers[operation.type](next, operation);
      appliedOperationIds.push(operation.id);
    }
  } catch (error) {
    return failure(error?.code || "OPERATION_FAILED", error instanceof Error ? error.message : "Operation failed", operationId);
  }
  const revision = appliedOperationIds.length ? current.revision + 1 : current.revision;
  next[COMMAND_STATE_KEY] = {
    schemaVersion: PROJECT_COMMAND_SCHEMA_VERSION,
    revision,
    appliedOperationIds: [...current.appliedOperationIds, ...appliedOperationIds],
  };
  return {
    ok: true,
    revision,
    appliedOperationIds,
    warnings: [],
    project: next,
    before: inspectProject(project),
    after: inspectProject(next),
    changes: diffProjects(project, next),
  };
}
