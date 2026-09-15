import { applyCommandPlan, diffProjects, inspectProject, materializeProjectCaptionTimings } from "./projectCommandEngine.js";
import { applyTimelineRipple } from "./timelineRipple.js";
import { MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { getTimedSegmentLaneStateKey, isTimedSegmentLaneLocked } from "./timeline.js";
import { getLinkedSourceAudioSegments } from "./sourceAudioSync.js";

const TIME_EPSILON = 0.000001;
const MEDIA_FIELDS = ["blob", "src", "url", "originalSrc", "thumbnail", "originalBlob", "originalPeaks", "compatibilityAudioBlob", "voiceColorOriginalBlob", "peaks", "trackFrames", "trackFrameDuration", "trackFrameSampling", "trackFrameImportBudget", "cutoutVisual", "enhancement", "assetId", "archiveMediaId", "integrity"];
const RIPPLE_ARRAY_FIELDS = ["audioSegments", "captionSegments", "visualOverlaySegments", "stickerSegments", "musicSegments"];
const RIPPLE_FIELDS = [...RIPPLE_ARRAY_FIELDS, "musicStart", "sourceAudioStart"];
const runtimeIdentities = new WeakMap();
let nextRuntimeIdentity = 0;

export const BROWSER_EDIT_TRIM_RULES = Object.freeze({
  sourceTimeUnit: "seconds",
  sourceTimeOrigin: "absolute source-media time",
  minimumDuration: MIN_VISUAL_SEGMENT_SECONDS,
  completeClipOrderRequired: true,
  description: "Reorder existing main-visual clips, or shorten plain 1× videos within their current source range. Curves, reverse, keyframes, transitions, subject effects and processed media cannot be trimmed by this service.",
});

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

// The fingerprint includes UI edits and undo, which do not increment the CLI revision.
function runtimeIdentity(value) {
  if (value === null || typeof value !== "object") return value ?? null;
  if (!runtimeIdentities.has(value)) runtimeIdentities.set(value, ++nextRuntimeIdentity);
  return runtimeIdentities.get(value);
}

export function browserProjectFingerprint(project, rippleEditing, visualSegments, runtimeProject) {
  // Decoded filmstrips are a display cache, not an edit. Refinement may finish
  // after apply or seek; it must neither invalidate a review nor consume undo.
  const withoutFilmstrip = ({ trackFrames: _frames, trackFrameDuration: _duration, trackFrameSampling: _sampling, trackFrameImportBudget: _budget, ...clip }) => clip;
  const { timelineZoom: _zoom, ...projectContent } = project;
  const semanticProject = {
    ...projectContent,
    visualSegments: project.visualSegments?.map(withoutFilmstrip),
    visualOverlaySegments: project.visualOverlaySegments?.map(withoutFilmstrip),
  };
  const runtimeVisuals = visualSegments?.map((clip) => ({
    id: clip.id,
    assetId: clip.assetId,
    archiveMediaId: clip.archiveMediaId,
    src: clip.src,
    blob: runtimeIdentity(clip.blob),
    cutoutVisual: runtimeIdentity(clip.cutoutVisual),
    enhancement: runtimeIdentity(clip.enhancement),
    trimAllowed: supportsBrowserTrim(clip),
  }));
  const runtimeMedia = runtimeProject ? {
    tracks: Object.fromEntries(["audioSegments", "visualOverlaySegments", "musicSegments"].map((key) => [key,
      (runtimeProject[key] || []).map((clip) => ({ id: clip.id, blob: runtimeIdentity(clip.blob), src: clip.src, url: clip.url,
        originalBlob: runtimeIdentity(clip.originalBlob), cutoutVisual: runtimeIdentity(clip.cutoutVisual), enhancement: runtimeIdentity(clip.enhancement) }))])),
    musicBlob: runtimeIdentity(runtimeProject.musicBlob), sourceAudioBlob: runtimeIdentity(runtimeProject.sourceAudioBlob),
  } : undefined;
  return JSON.stringify({ ...semanticProject, rippleEditing, runtimeVisuals, runtimeMedia });
}

export function getBrowserPlanningClips(visualSegments = []) {
  return visualSegments.map((clip, index) => ({
    clipId: clip.id,
    type: clip.type === "video" ? "video" : "image",
    name: String(clip.name || clip.id),
    duration: Number(clip.duration),
    sourceIn: Number(clip.sourceStart) || 0,
    sourceOut: (Number(clip.sourceStart) || 0) + (Number(clip.sourceDuration) || Number(clip.duration)),
    trimAllowed: supportsBrowserTrim(clip) && !hasTransition(visualSegments[index - 1]),
    splitAllowed: supportsBrowserTrim({ ...clip, type: "video" }) && !hasTransition(visualSegments[index - 1])
      && Number(clip.duration) >= MIN_VISUAL_SEGMENT_SECONDS * 2,
  }));
}

function hasTransition(clip) {
  return Boolean(clip?.transition?.id && clip.transition.id !== "none");
}

export function supportsBrowserTrim(clip) {
  const rate = clip?.playbackRate === undefined ? 1 : Number(clip.playbackRate);
  return (
    clip?.type === "video" &&
    !clip.preparing &&
    rate === 1 &&
    !clip.speedCurve?.enabled &&
    !clip.reversed &&
    !clip.reverse &&
    !clip.keyframes?.length &&
    !Object.values(clip.propertyKeyframes || {}).some((frames) => frames?.length) &&
    ![clip.animation?.in, clip.animation?.out].some((phase) => phase?.id && phase.id !== "none") &&
    !clip.effects?.length &&
    !clip.clickRipple?.enabled &&
    !clip.cinematicDepth?.enabled &&
    !clip.photoParallax?.enabled &&
    !clip.smartFrame?.enabled &&
    !clip.subjectEffect?.enabled &&
    !clip.vision &&
    !hasTransition(clip) &&
    !clip.cutoutVisual &&
    !clip.enhancement
  );
}

function indexedSegments(segments) {
  if (!Array.isArray(segments)) reject("BROWSER_EDIT_INVALID_PLAN");
  const index = new Map();
  for (const clip of segments) {
    if (!clip || typeof clip.id !== "string" || !clip.id || index.has(clip.id)) reject("BROWSER_EDIT_INVALID_PLAN");
    index.set(clip.id, clip);
  }
  return index;
}

function completeBrowserProject(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) reject("BROWSER_EDIT_INVALID_PLAN");
  const next = { ...project };
  for (const key of ["visualSegments", ...RIPPLE_ARRAY_FIELDS]) {
    // Older/partial snapshots can omit empty tracks. A present malformed value
    // is rejected rather than silently dropping an existing track's contents.
    if (next[key] == null) next[key] = [];
    else if (!Array.isArray(next[key])) reject("BROWSER_EDIT_INVALID_PLAN");
  }
  for (const key of ["musicStart", "sourceAudioStart"]) {
    if (next[key] == null) next[key] = 0;
    if (typeof next[key] !== "number" || !Number.isFinite(next[key]) || next[key] < 0) reject("BROWSER_EDIT_INVALID_PLAN");
  }
  return next;
}

function browserCaptionBaseline(project) {
  try {
    return materializeProjectCaptionTimings(project);
  } catch {
    reject("BROWSER_EDIT_INVALID_PLAN");
  }
}

function assertLockedSourceUnchanged(project, next, options) {
  if (!project.trackLocks?.source || !options.hasSourceAudio || project.sourceAudioLinked === false) return;
  const beforeSource = getLinkedSourceAudioSegments(project.visualSegments, project.sourceAudioAssetId, project.sourceAudioDuration);
  const afterSource = getLinkedSourceAudioSegments(next.visualSegments, next.sourceAudioAssetId, next.sourceAudioDuration);
  if (JSON.stringify(beforeSource) !== JSON.stringify(afterSource)) reject("BROWSER_EDIT_TRACK_LOCKED");
}

/**
 * Compile a complete clip ordering and optional absolute source trim ranges into
 * the shared command engine. This is a pure review: callers must compare the
 * fingerprint again and commit the reviewed project as one undoable transaction.
 */
export function buildBrowserTimelineReview(inputProject, response, options = {}) {
  const project = browserCaptionBaseline(completeBrowserProject(inputProject));
  const originals = project.visualSegments;
  const sourceById = indexedSegments(originals);
  const requested = response?.clips;
  if (!originals.length || !Array.isArray(requested) || requested.length !== originals.length)
    reject("BROWSER_EDIT_INVALID_PLAN");
  if (project.trackLocks?.image) reject("BROWSER_EDIT_TRACK_LOCKED");
  const beforeDuration = originals.reduce((sum, clip) => {
    if (typeof clip.duration !== "number" || !Number.isFinite(clip.duration) || clip.duration < MIN_VISUAL_SEGMENT_SECONDS) reject("BROWSER_EDIT_INVALID_PLAN");
    return sum + clip.duration;
  }, 0);
  if (beforeDuration > MAX_TIMELINE_DURATION_SECONDS) reject("BROWSER_EDIT_INVALID_PLAN");
  // Archive snapshots omit processed-media fields. Only the corresponding live
  // clips can establish whether a trim is safe; absent context permits reorder only.
  const runtimeById = options.visualSegments ? indexedSegments(options.visualSegments) : null;
  if (runtimeById && (runtimeById.size !== sourceById.size || originals.some((clip) => !runtimeById.has(clip.id)))) reject("BROWSER_EDIT_STALE_PLAN");
  if (runtimeById && originals.some((clip) => ["type", "duration", "sourceStart", "sourceDuration", "playbackRate", "sourceAudioOffset"]
    .some((key) => !Object.is(clip[key], runtimeById.get(clip.id)[key])))) reject("BROWSER_EDIT_STALE_PLAN");
  const seen = new Set();
  const operations = [];
  const orderedIds = originals.map((clip) => clip.id);
  const baseRevision = project.commandState?.revision || 0;
  const batch = crypto.randomUUID();
  const add = (operation) => operations.push({ ...operation, id: `${batch}-${operations.length}` });
  requested.forEach((item, index) => {
    if (!item || typeof item.clipId !== "string") reject("BROWSER_EDIT_INVALID_PLAN");
    const clip = sourceById.get(item.clipId);
    if (!clip || seen.has(item.clipId)) reject("BROWSER_EDIT_INVALID_PLAN");
    seen.add(item.clipId);
    const originalSourceStart = clip.sourceStart === undefined ? 0 : Number(clip.sourceStart);
    const originalSourceDuration = clip.sourceDuration === undefined ? Number(clip.duration) : Number(clip.sourceDuration);
    const sourceIn = item.sourceIn === undefined ? originalSourceStart : item.sourceIn;
    const sourceOut = item.sourceOut === undefined ? originalSourceStart + originalSourceDuration : item.sourceOut;
    const rangeRequested = item.sourceIn !== undefined || item.sourceOut !== undefined;
    const rangeChanged = rangeRequested && (Math.abs(sourceIn - originalSourceStart) > TIME_EPSILON
      || Math.abs(sourceOut - (originalSourceStart + originalSourceDuration)) > TIME_EPSILON);
    // A reordered complex clip is preserved byte-for-byte. Source times only
    // become editable when a real trim is requested and the safe trim gate passes.
    const offset = rangeChanged ? sourceIn - originalSourceStart : 0;
    const duration = rangeChanged ? sourceOut - sourceIn : clip.duration;
    if (rangeRequested && (typeof sourceIn !== "number" || !Number.isFinite(sourceIn)
      || typeof sourceOut !== "number" || !Number.isFinite(sourceOut))) reject("BROWSER_EDIT_INVALID_PLAN");
    if (
      typeof offset !== "number" ||
      !Number.isFinite(offset) ||
      offset < 0 ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < MIN_VISUAL_SEGMENT_SECONDS ||
      offset + duration > clip.duration + TIME_EPSILON
    )
      reject("BROWSER_EDIT_INVALID_PLAN");
    // Only compile effective moves. A model may return the current sequence;
    // that is a reviewable no-op, not a successful edit or a new revision.
    const fromIndex = orderedIds.indexOf(clip.id);
    if (fromIndex !== index) {
      add({ type: "visual.reorder", clipId: clip.id, toIndex: index });
      orderedIds.splice(fromIndex, 1);
      orderedIds.splice(index, 0, clip.id);
    }
    const changed = offset > TIME_EPSILON || Math.abs(duration - clip.duration) > TIME_EPSILON;
    if (changed) {
      if (clip.type !== "video") reject("BROWSER_EDIT_INVALID_PLAN");
      const runtimeClip = runtimeById?.get(clip.id);
      const originalIndex = originals.findIndex((value) => value.id === clip.id);
      const previousClip = index > 0 ? sourceById.get(requested[index - 1]?.clipId) : null;
      if (!supportsBrowserTrim(clip) || !supportsBrowserTrim(runtimeClip) || hasTransition(originals[originalIndex - 1]) || hasTransition(previousClip)) reject("BROWSER_EDIT_COMPLEX_TIMING");
      const sourceStart = clip.sourceStart === undefined ? 0 : Number(clip.sourceStart);
      const sourceDuration = clip.sourceDuration === undefined ? clip.duration : Number(clip.sourceDuration);
      if (!Number.isFinite(sourceStart) || sourceStart < 0 || !Number.isFinite(sourceDuration) || sourceDuration <= 0) reject("BROWSER_EDIT_INVALID_PLAN");
      const sourceIn = sourceStart + offset;
      const sourceOut = Math.min(sourceStart + sourceDuration, sourceStart + clip.duration, sourceIn + duration);
      // Tolerate rounding at a boundary, never silently shorten a requested trim
      // to fit a missing or inconsistent source range.
      if (Math.abs((sourceOut - sourceIn) - duration) > TIME_EPSILON || sourceOut - sourceIn < MIN_VISUAL_SEGMENT_SECONDS - TIME_EPSILON) reject("BROWSER_EDIT_INVALID_PLAN");
      add({ type: "visual.trim", clipId: clip.id, sourceIn, sourceOut });
    }
  });
  const result = operations.length
    ? applyCommandPlan(project, { schemaVersion: 1, baseRevision, operations })
    : { ok: true, project: structuredClone(project) };
  if (!result.ok) reject("BROWSER_EDIT_INVALID_PLAN");

  // Apply each duration change to one accumulating snapshot, avoiding stale React setters.
  const next = { ...result.project };
  assertLockedSourceUnchanged(project, next, options);
  const originalLocks = project.trackLocks || {};
  const lockedAudioIds = new Set((project.audioSegments || [])
    .filter((clip) => isTimedSegmentLaneLocked(project.audioSegments, clip.id, originalLocks))
    .map((clip) => clip.id));
  if (originalLocks.caption) {
    for (const caption of project.captionSegments || []) {
      if (caption.audioSegmentId) lockedAudioIds.add(caption.audioSegmentId);
    }
  }
  const ripple = {
    ...project,
    // Resolve audio-lane locks once for this atomic edit. Repacking after one
    // trim must not make a formerly locked clip movable during the next trim.
    trackLocks: Object.fromEntries(Object.entries(originalLocks).filter(([key]) => !/^audio-\d+$/.test(key))),
    rippleEditing: options.rippleEditing,
    musicBlob: options.hasMusic,
    sourceAudioBlob: options.hasSourceAudio,
  };
  for (const key of RIPPLE_FIELDS) {
    ripple[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => {
      ripple[key] = typeof value === "function" ? value(ripple[key]) : value;
    };
  }
  let boundary = 0;
  let previousStart = 0;
  const rows = next.visualSegments.map((clip, index) => {
    const before = sourceById.get(clip.id);
    const beforeIndex = originals.findIndex((item) => item.id === clip.id);
    const beforeStart = originals
      .slice(0, beforeIndex)
      .reduce((sum, item) => sum + Number(item.duration), 0);
    boundary += Number(before.duration);
    const delta = Number(clip.duration) - Number(before.duration);
    if (delta) {
      const previousAudio = new Map((ripple.audioSegments || []).map((item) => [item.id, item]));
      const previousCaptions = new Map((ripple.captionSegments || []).map((item) => [item.id, item]));
      applyTimelineRipple(ripple, boundary, delta);
      ripple.audioSegments = ripple.audioSegments.map((item) => lockedAudioIds.has(item.id) ? previousAudio.get(item.id) : item);
      ripple.captionSegments = ripple.captionSegments.map((item) => lockedAudioIds.has(item.audioSegmentId) ? previousCaptions.get(item.id) : item);
    }
    boundary += delta;
    const row = {
      id: clip.id,
      name: clip.name || clip.id,
      index,
      beforeIndex,
      beforeStart,
      start: previousStart,
      beforeDuration: Number(before.duration),
      duration: Number(clip.duration),
      beforeSourceStart: Number(before.sourceStart) || 0,
      sourceStart: Number(clip.sourceStart) || 0,
      reordered: beforeIndex !== index,
      trimmed: Math.abs(delta) > TIME_EPSILON ||
        Math.abs((Number(before.sourceStart) || 0) - (Number(clip.sourceStart) || 0)) > TIME_EPSILON,
      changed:
        beforeIndex !== index ||
        Math.abs(delta) > TIME_EPSILON ||
        Math.abs((Number(before.sourceStart) || 0) - (Number(clip.sourceStart) || 0)) > TIME_EPSILON,
    };
    previousStart += Number(clip.duration);
    return row;
  });
  for (const key of RIPPLE_FIELDS)
    next[key] = ripple[key];
  for (const id of lockedAudioIds) {
    if ((project.audioSegments || []).some((item) => item.id === id) &&
      getTimedSegmentLaneStateKey(project.audioSegments, id) !== getTimedSegmentLaneStateKey(next.audioSegments, id)) reject("BROWSER_EDIT_TRACK_LOCKED");
  }
  const changes = diffProjects(project, next);
  for (const field of ["musicStart", "sourceAudioStart"]) {
    if (project[field] !== next[field]) changes.projectFields.push({ field, before: project[field], after: next[field] });
  }
  return {
    operations,
    diff: changes,
    title: typeof response.title === "string" ? response.title : "",
    summary: typeof response.summary === "string" ? response.summary : "",
    model: typeof response.model === "string" ? response.model : "",
    fingerprint: browserProjectFingerprint(inputProject, options.rippleEditing, options.visualSegments, options.runtimeProject),
    project: completeBrowserProject(next),
    beforeProject: project,
    rows,
    hasChanges: rows.some((row) => row.changed),
    changeSummary: {
      reordered: rows.filter((row) => row.reordered).length,
      trimmed: rows.filter((row) => row.trimmed).length,
    },
    changes,
    beforeDuration,
    duration: previousStart,
  };
}

const MEDIA_COLLECTIONS = ["visualSegments", "visualOverlaySegments", "audioSegments", "musicSegments", "stickerSegments"];
const CLIP_COLLECTIONS = [...MEDIA_COLLECTIONS, "captionSegments"];

export const BROWSER_OPERATION_FIELDS = Object.freeze({
  "caption.add": ["clipId", "text", "start", "end", "audioClipId"],
  "caption.update": ["clipId", "text", "start", "end"],
  "caption.delete": ["clipId"],
  "clip.set_property": ["clipId", "property", "value"],
  "clip.set_muted": ["clipId", "muted"],
  "marker.add": ["markerId", "markerType", "time", "endTime", "title", "notes", "color"],
  "marker.update": ["markerId", "markerType", "time", "endTime", "title", "notes", "color"],
  "marker.delete": ["markerId"],
  "visual.reorder": ["clipId", "toIndex"],
  "visual.trim": ["clipId", "sourceIn", "sourceOut"],
  "visual.split": ["clipId", "at", "rightClipId"],
  "visual.delete": ["clipId"],
  "visual.duplicate": ["clipId", "newClipId", "atIndex"],
  "visual.insert": ["clipId", "sourceClipId", "assetId", "atIndex", "duration"],
  "overlay.add": ["clipId", "sourceClipId", "assetId", "start", "duration", "layer", "muted", "transform"],
  "asset.insert": ["clipId", "assetId", "track", "atIndex", "start", "duration", "layer", "muted", "transform"],
});

function assertId(id) {
  if (typeof id !== "string" || !id || id !== id.trim() || id.length > 256) reject("BROWSER_EDIT_INVALID_PLAN");
}

function validTime(value, minimum = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > MAX_TIMELINE_DURATION_SECONDS) reject("BROWSER_EDIT_INVALID_PLAN");
  return value;
}

function validSourceTime(value, minimum = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > Number.MAX_SAFE_INTEGER) reject("BROWSER_EDIT_INVALID_PLAN");
  return value;
}

function projectClipMap(project) {
  return indexedSegments(CLIP_COLLECTIONS.flatMap((key) => project[key] || []));
}

function findProjectClip(project, clipId) {
  for (const key of CLIP_COLLECTIONS) {
    const clip = (project[key] || []).find((item) => item.id === clipId);
    if (clip) return { key, clip };
  }
  reject("BROWSER_EDIT_INVALID_PLAN");
}

function assetMap(assets = []) {
  const entries = new Map();
  for (const asset of assets) {
    const id = asset?.assetId || asset?.id;
    assertId(id);
    if (entries.has(id)) reject("BROWSER_EDIT_INVALID_PLAN");
    entries.set(id, asset);
  }
  return entries;
}

function audioLaneMap(project) {
  return new Map((project.audioSegments || []).map((clip) => [clip.id, getTimedSegmentLaneStateKey(project.audioSegments, clip.id)]));
}

function assertClipUnlocked(project, clipId, originalLocks, originalAudioLanes) {
  const { key } = findProjectClip(project, clipId);
  const stateKey = { visualSegments: "image", visualOverlaySegments: "overlay", captionSegments: "caption", musicSegments: "music", stickerSegments: "sticker", audioSegments: "audio" }[key];
  if (originalLocks[stateKey] || (key === "audioSegments" && originalLocks[originalAudioLanes.get(clipId) || getTimedSegmentLaneStateKey(project.audioSegments, clipId)])) reject("BROWSER_EDIT_TRACK_LOCKED");
}

function validateBrowserOperation(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) reject("BROWSER_EDIT_INVALID_PLAN");
  const fields = Object.hasOwn(BROWSER_OPERATION_FIELDS, operation.type) ? BROWSER_OPERATION_FIELDS[operation.type] : null;
  if (!fields || Object.keys(operation).some((field) => field !== "type" && !fields.includes(field))) reject("BROWSER_EDIT_INVALID_PLAN");
  for (const field of ["clipId", "sourceClipId", "newClipId", "rightClipId", "assetId", "audioClipId", "markerId"]) {
    if (Object.hasOwn(operation, field)) assertId(operation[field]);
  }
  if (operation.type.startsWith("marker.")) {
    assertId(operation.markerId);
    if (operation.markerId.length > 160) reject("BROWSER_EDIT_INVALID_PLAN");
  }
  else assertId(operation.clipId);
  if (Object.hasOwn(operation, "text") && (typeof operation.text !== "string" || operation.text.length > 20000)) reject("BROWSER_EDIT_INVALID_PLAN");
  if (Object.hasOwn(operation, "muted") && typeof operation.muted !== "boolean") reject("BROWSER_EDIT_INVALID_PLAN");
  if (Object.hasOwn(operation, "duration")) validTime(operation.duration, MIN_VISUAL_SEGMENT_SECONDS);
  for (const field of ["start", "end", "at"]) if (Object.hasOwn(operation, field)) validTime(operation[field]);
  for (const field of ["sourceIn", "sourceOut"]) if (Object.hasOwn(operation, field)) validSourceTime(operation[field]);
  if (Object.hasOwn(operation, "layer") && (!Number.isInteger(operation.layer) || operation.layer < 1 || operation.layer > 1000)) reject("BROWSER_EDIT_INVALID_PLAN");
  if (Object.hasOwn(operation, "transform")) {
    const limits = { x: [-1000, 1000], y: [-1000, 1000], scale: [0.1, 20], rotation: [-36000, 36000], opacity: [0, 1] };
    if (!operation.transform || typeof operation.transform !== "object" || Array.isArray(operation.transform)) reject("BROWSER_EDIT_INVALID_PLAN");
    for (const [key, value] of Object.entries(operation.transform)) {
      if (!Object.hasOwn(limits, key) || typeof value !== "number" || !Number.isFinite(value) || value < limits[key][0] || value > limits[key][1]) reject("BROWSER_EDIT_INVALID_PLAN");
    }
  }
}

function assertPlainVisual(clip) {
  if (!clip || !["image", "video"].includes(clip.type) || !supportsBrowserTrim({ ...clip, type: "video" })) reject("BROWSER_EDIT_COMPLEX_TIMING");
}

function projectDuration(project, options) {
  const base = inspectProject(project).duration;
  const sourceDuration = options.hasSourceAudio
    ? project.sourceAudioLinked === false
      ? (Number(project.sourceAudioStart) || 0) + (Number(project.sourceAudioDuration) || 0)
      : getLinkedSourceAudioSegments(project.visualSegments, project.sourceAudioAssetId, project.sourceAudioDuration)
        .reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0)
    : 0;
  const musicDuration = options.hasMusic && !(project.musicSegments || []).length
    ? (Number(project.musicStart) || 0) + (Number(project.musicDuration) || 0) : 0;
  return Math.max(base, sourceDuration, musicDuration);
}

function applyBrowserRipple(project, boundary, delta, options, originalAudioLanes, locks) {
  if (!options.rippleEditing || Math.abs(delta) < TIME_EPSILON) return;
  const fixedAudio = new Set((project.audioSegments || []).filter((clip) => locks.audio
    || locks[originalAudioLanes.get(clip.id) || getTimedSegmentLaneStateKey(project.audioSegments, clip.id)]).map((clip) => clip.id));
  if (locks.caption) for (const caption of project.captionSegments || []) if (caption.audioSegmentId) fixedAudio.add(caption.audioSegmentId);
  const beforeAudio = new Map(project.audioSegments.map((clip) => [clip.id, clip]));
  const beforeCaptions = new Map(project.captionSegments.map((clip) => [clip.id, clip]));
  const state = { ...project, trackLocks: Object.fromEntries(Object.entries(locks).filter(([key]) => !/^audio-\d+$/.test(key))),
    rippleEditing: true, musicBlob: options.hasMusic || project.musicSegments.length > 0, sourceAudioBlob: options.hasSourceAudio };
  for (const key of RIPPLE_FIELDS) state[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => { state[key] = typeof value === "function" ? value(state[key]) : value; };
  applyTimelineRipple(state, boundary, delta);
  state.audioSegments = state.audioSegments.map((clip) => fixedAudio.has(clip.id) ? beforeAudio.get(clip.id) : clip);
  state.captionSegments = state.captionSegments.map((clip) => fixedAudio.has(clip.audioSegmentId) ? beforeCaptions.get(clip.id) : clip);
  for (const key of RIPPLE_FIELDS) project[key] = state[key];
}

function prepareAssetOperation(operation, asset, project) {
  if (!asset || asset.preparing || !(asset.blob instanceof Blob) || asset.blob.size === 0 || !["image", "video", "audio"].includes(asset.type)) reject("BROWSER_EDIT_ASSET_UNAVAILABLE");
  if (asset.reversed || asset.speedCurve?.enabled || (asset.playbackRate !== undefined && asset.playbackRate !== 1)) reject("BROWSER_EDIT_COMPLEX_TIMING");
  const assetId = asset.assetId || asset.id;
  const track = operation.type === "visual.insert" ? "visuals" : operation.type === "overlay.add" ? "overlays" : operation.track;
  if (!["visuals", "overlays", "audio", "music"].includes(track)) reject("BROWSER_EDIT_INVALID_PLAN");
  if (asset.kind === "music" && track !== "music") reject("BROWSER_EDIT_INVALID_PLAN");
  if (asset.type === "image" && Object.hasOwn(operation, "muted")) reject("BROWSER_EDIT_INVALID_PLAN");
  const irrelevantFields = track === "visuals" ? ["start", "layer", "transform"]
    : track === "overlays" ? ["atIndex"] : track === "audio" ? ["atIndex", "transform"] : ["atIndex", "transform", "layer"];
  if (irrelevantFields.some((field) => Object.hasOwn(operation, field))) reject("BROWSER_EDIT_INVALID_PLAN");
  const sourceStart = validSourceTime(Number(asset.sourceStart) || 0);
  const sourceDuration = asset.type === "image" ? 0 : validSourceTime(Number(asset.sourceDuration ?? asset.duration), MIN_VISUAL_SEGMENT_SECONDS);
  const duration = operation.duration ?? (asset.type === "image" ? Number(asset.duration) > 0 ? Number(asset.duration) : 4 : sourceDuration);
  validTime(duration, MIN_VISUAL_SEGMENT_SECONDS);
  if (asset.type !== "image" && duration > sourceDuration + TIME_EPSILON) reject("BROWSER_EDIT_INVALID_PLAN");
  const preparedSource = {
    assetId, archiveMediaId: operation.clipId, type: asset.type, name: String(asset.name || assetId),
    width: Math.max(0, Number(asset.width) || 0), height: Math.max(0, Number(asset.height) || 0),
    sourceStart, sourceDuration, playbackRate: 1, muted: operation.muted === true,
    ...(asset.type === "video" ? { sourceAudioUnmapped: true, sourceAudioDisabled: operation.muted === true } : {}),
    ...(asset.type === "audio" ? { volume: track === "music" ? 0.35 : 1, fadeIn: 0, fadeOut: 0 } : {}),
  };
  const layer = track === "overlays" ? operation.layer ?? project.visualOverlaySegments.reduce((max, clip) => Math.max(max, Number(clip.layer) || 1), 0) + 1 : operation.layer;
  return { ...operation, type: "asset.insert", track, duration, layer, prepared: true, preparedSource };
}

/**
 * Pure multi-track compilation. All metadata mutations go through the shared
 * command reducers; runtime media is restored only from trusted host snapshots.
 */
export function buildBrowserOperationReview(inputProject, response, options = {}) {
  const original = browserCaptionBaseline(completeBrowserProject(inputProject));
  const requested = response?.operations;
  if (!Array.isArray(requested) || !requested.length || requested.length > 500) reject("BROWSER_EDIT_INVALID_PLAN");
  if (response.summary !== undefined && (typeof response.summary !== "string" || response.summary.length > 4000)) reject("BROWSER_EDIT_INVALID_PLAN");
  projectClipMap(original);
  const initialRuntime = { ...original, ...(options.runtimeProject || {}), visualSegments: options.visualSegments || options.runtimeProject?.visualSegments || original.visualSegments };
  for (const key of MEDIA_COLLECTIONS) {
    const snapshots = indexedSegments(original[key] || []);
    const live = indexedSegments(initialRuntime[key] || []);
    if (snapshots.size !== live.size || [...snapshots.keys()].some((id) => !live.has(id))) reject("BROWSER_EDIT_STALE_PLAN");
  }
  const assets = assetMap(options.assets || []);
  const origins = Object.create(null);
  const usedIds = new Set([...projectClipMap(original).keys(), ...(original.timelineMarkers || []).map((marker) => marker.id)]);
  const locks = original.trackLocks || {};
  const originalAudioLanes = audioLaneMap(original);
  const reserve = (id) => { assertId(id); if (usedIds.has(id)) reject("BROWSER_EDIT_INVALID_PLAN"); usedIds.add(id); };
  const inherit = (id, sourceId) => { origins[id] = origins[sourceId] || { kind: "clip", id: sourceId }; };
  const commands = [];
  let next = structuredClone(original);
  let focusTime;
  let musicAssetId = null;
  for (const [index, value] of requested.entries()) {
    validateBrowserOperation(value);
    let operation = { ...value };
    const beforeVisuals = next.visualSegments;
    const durationBefore = beforeVisuals.reduce((sum, clip) => sum + Number(clip.duration), 0);
    let boundary;
    const sourceIndex = beforeVisuals.findIndex((clip) => clip.id === operation.clipId);
    const clipStart = sourceIndex >= 0 ? beforeVisuals.slice(0, sourceIndex).reduce((sum, clip) => sum + Number(clip.duration), 0) : 0;
    const isInsertion = ["visual.insert", "overlay.add", "asset.insert"].includes(operation.type);
    if (operation.type.startsWith("visual.") || operation.type === "asset.insert" && operation.track === "visuals") {
      if (locks.image) reject("BROWSER_EDIT_TRACK_LOCKED");
    }
    if (operation.type.startsWith("caption.")) {
      if (locks.caption) reject("BROWSER_EDIT_TRACK_LOCKED");
      if (operation.type === "caption.add") reserve(operation.clipId);
    }
    if (operation.type === "marker.add") reserve(operation.markerId);
    if (operation.type === "clip.set_property" || operation.type === "clip.set_muted") {
      assertClipUnlocked(next, operation.clipId, locks, originalAudioLanes);
      const { key, clip } = findProjectClip(next, operation.clipId);
      if (operation.type === "clip.set_property") {
        if (!["audioSegments", "musicSegments"].includes(key) || !["volume", "fadeIn", "fadeOut"].includes(operation.property)) reject("BROWSER_EDIT_INVALID_PLAN");
        if (operation.property !== "volume" && operation.value > clip.duration) reject("BROWSER_EDIT_INVALID_PLAN");
      }
    }
    if (operation.type === "visual.split" || operation.type === "visual.trim") {
      const clip = beforeVisuals[sourceIndex];
      const live = restoreBrowserProjectMedia(next, initialRuntime, origins, options.assets).visualSegments.find((item) => item.id === operation.clipId);
      assertPlainVisual(clip); assertPlainVisual(live);
      if (hasTransition(beforeVisuals[sourceIndex - 1])) reject("BROWSER_EDIT_COMPLEX_TIMING");
      if (operation.type === "visual.split") {
        validTime(operation.at, MIN_VISUAL_SEGMENT_SECONDS);
        if (clip.duration - operation.at < MIN_VISUAL_SEGMENT_SECONDS) reject("BROWSER_EDIT_INVALID_PLAN");
        reserve(operation.rightClipId); inherit(operation.rightClipId, operation.clipId);
        focusTime = clipStart + operation.at;
      } else {
        if (clip.type !== "video" || operation.sourceOut - operation.sourceIn < MIN_VISUAL_SEGMENT_SECONDS) reject("BROWSER_EDIT_INVALID_PLAN");
        boundary = clipStart + clip.duration;
      }
    }
    if (operation.type === "visual.delete") {
      if (sourceIndex < 0) reject("BROWSER_EDIT_INVALID_PLAN");
      boundary = clipStart + beforeVisuals[sourceIndex].duration;
      focusTime = clipStart;
    }
    if (operation.type === "visual.duplicate") {
      if (sourceIndex < 0) reject("BROWSER_EDIT_INVALID_PLAN");
      reserve(operation.newClipId); inherit(operation.newClipId, operation.clipId);
      operation.atIndex ??= sourceIndex + 1;
      boundary = beforeVisuals.slice(0, operation.atIndex).reduce((sum, clip) => sum + Number(clip.duration), 0);
      focusTime = boundary;
    }
    if (isInsertion) {
      reserve(operation.clipId);
      if (Boolean(operation.assetId) === Boolean(operation.sourceClipId)) reject("BROWSER_EDIT_INVALID_PLAN");
      if (operation.assetId) {
        const asset = assets.get(operation.assetId);
        operation = prepareAssetOperation(operation, asset, next);
        origins[operation.clipId] = { kind: "asset", id: operation.assetId };
      } else {
        const { clip, key } = findProjectClip(next, operation.sourceClipId);
        if (!["visualSegments", "visualOverlaySegments"].includes(key)) reject("BROWSER_EDIT_INVALID_PLAN");
        const live = restoreBrowserProjectMedia(next, initialRuntime, origins, options.assets)[key].find((item) => item.id === operation.sourceClipId);
        assertPlainVisual(clip); assertPlainVisual(live);
        inherit(operation.clipId, operation.sourceClipId);
      }
      const track = operation.type === "visual.insert" ? "visuals" : operation.type === "overlay.add" ? "overlays" : operation.track;
      if (locks[{ visuals: "image", overlays: "overlay", audio: "audio", music: "music" }[track]]) reject("BROWSER_EDIT_TRACK_LOCKED");
      if (track === "visuals") {
        boundary = beforeVisuals.slice(0, operation.atIndex).reduce((sum, clip) => sum + Number(clip.duration), 0);
        focusTime = boundary;
      } else {
        validTime(operation.start);
        focusTime = operation.start;
      }
      if (track === "music") {
        const asset = assets.get(operation.assetId);
        if (!asset || musicAssetId && musicAssetId !== operation.assetId
          || (options.hasMusic || initialRuntime.musicBlob || original.musicSegments.length) && initialRuntime.musicBlob !== asset.blob) reject("BROWSER_EDIT_MULTIPLE_MUSIC_SOURCES");
        musicAssetId = operation.assetId;
        const end = operation.start + operation.duration;
        if (next.musicSegments.some((clip) => clip.start < end - TIME_EPSILON && clip.start + clip.duration > operation.start + TIME_EPSILON)) reject("BROWSER_EDIT_MUSIC_OVERLAP");
      }
      if (track === "audio") {
        // Freeze existing lane placement before adding a voice clip. New clips
        // go to their requested lane or a new lane, without moving siblings.
        for (const clip of next.audioSegments) {
          if (!Number.isInteger(clip.lane)) clip.lane = Number(getTimedSegmentLaneStateKey(next.audioSegments, clip.id).slice(6));
        }
        operation.lane = operation.layer === undefined ? Math.max(-1, ...next.audioSegments.map((clip) => clip.lane || 0)) + 1 : operation.layer - 1;
        if (locks[`audio-${operation.lane}`]) reject("BROWSER_EDIT_TRACK_LOCKED");
      }
    }
    operation.id = `browser-${crypto.randomUUID()}-${index}`;
    const result = applyCommandPlan(next, { schemaVersion: 1, baseRevision: next.commandState?.revision || 0, operations: [operation] });
    if (!result.ok) reject(result.code === "REVISION_CONFLICT" ? "BROWSER_EDIT_STALE_PLAN" : "BROWSER_EDIT_INVALID_PLAN");
    next = completeBrowserProject(result.project);
    if (operation.type === "asset.insert" && operation.track === "audio") {
      const actualLane = getTimedSegmentLaneStateKey(next.audioSegments, operation.clipId);
      if (locks[actualLane] || operation.layer !== undefined && actualLane !== `audio-${operation.lane}`) reject("BROWSER_EDIT_TRACK_LOCKED");
    }
    commands.push(operation);
    const durationAfter = next.visualSegments.reduce((sum, clip) => sum + Number(clip.duration), 0);
    if (boundary !== undefined) applyBrowserRipple(next, boundary, durationAfter - durationBefore, options, originalAudioLanes, locks);
    if (durationAfter > MAX_TIMELINE_DURATION_SECONDS || next.visualSegments.some((clip) => clip.duration < MIN_VISUAL_SEGMENT_SECONDS)
      || projectDuration(next, { ...options, hasMusic: options.hasMusic || Boolean(musicAssetId) }) > MAX_TIMELINE_DURATION_SECONDS) reject("BROWSER_EDIT_INVALID_PLAN");
    assertLockedSourceUnchanged(original, next, options);
    for (const [id, lane] of originalAudioLanes) {
      if (locks.audio || locks[lane]) {
        const before = original.audioSegments.find((clip) => clip.id === id);
        const after = next.audioSegments.find((clip) => clip.id === id);
        const { lane: _beforeLane, ...beforeContent } = before;
        const { lane: _afterLane, ...afterContent } = after || {};
        if (JSON.stringify(beforeContent) !== JSON.stringify(afterContent) || getTimedSegmentLaneStateKey(next.audioSegments, id) !== lane) reject("BROWSER_EDIT_TRACK_LOCKED");
      }
    }
  }
  const diff = diffProjects(original, next);
  for (const field of ["musicStart", "sourceAudioStart", "musicName", "musicDuration"]) {
    if (original[field] !== next[field]) diff.projectFields.push({ field, before: original[field] ?? null, after: next[field] ?? null });
  }
  const changes = [
    ...Object.entries(diff.tracks).flatMap(([track, change]) => [
      ...change.added.map((id) => ({ track, id, action: "added" })),
      ...change.removed.map((id) => ({ track, id, action: "removed" })),
      ...change.modified.map((entry) => ({ track, id: entry.id, action: "modified", fields: entry.fields })),
      ...(change.orderBefore && !change.added.length && !change.removed.length ? [{ track, action: "reordered" }] : []),
    ]),
    ...(diff.markers?.added || []).map((marker) => ({ track: "markers", id: marker.id, action: "added" })),
    ...(diff.markers?.removed || []).map((marker) => ({ track: "markers", id: marker.id, action: "removed" })),
    ...(diff.markers?.modified || []).map((marker) => ({ track: "markers", id: marker.id, action: "modified", fields: marker.fields })),
    ...diff.projectFields.map((entry) => ({ track: "project", action: "modified", fields: [entry.field] })),
  ];
  const hasChanges = changes.length > 0;
  if (hasChanges) next.commandState.revision = (original.commandState?.revision || 0) + 1;
  else next = structuredClone(original);
  let beforeCursor = 0;
  const beforeById = new Map(original.visualSegments.map((clip, index) => {
    const before = { clip, index, start: beforeCursor }; beforeCursor += clip.duration; return [clip.id, before];
  }));
  let cursor = 0;
  const rows = next.visualSegments.map((clip, index) => {
    const before = beforeById.get(clip.id);
    const row = { id: clip.id, name: clip.name || clip.id, index, beforeIndex: before?.index ?? -1,
      beforeStart: before?.start ?? 0, start: cursor, beforeDuration: before?.clip.duration ?? 0, duration: clip.duration,
      beforeSourceStart: before?.clip.sourceStart || 0, sourceStart: clip.sourceStart || 0,
      added: !before, reordered: Boolean(before && before.index !== index),
      trimmed: Boolean(before && (clip.duration !== before.clip.duration || (clip.sourceStart || 0) !== (before.clip.sourceStart || 0))),
      changed: !before || JSON.stringify(before.clip) !== JSON.stringify(clip) || before.index !== index };
    cursor += clip.duration; return row;
  });
  return { project: next, beforeProject: original, operations: commands, mediaOrigins: origins, rows, diff, changes, hasChanges,
    visualsChanged: Boolean(diff.tracks.visuals), summary: response.summary || "", title: "",
    changeSummary: { reordered: rows.filter((row) => row.reordered).length, trimmed: rows.filter((row) => row.trimmed).length },
    beforeDuration: projectDuration(original, options), duration: projectDuration(next, { ...options, hasMusic: options.hasMusic || Boolean(musicAssetId) }),
    fingerprint: browserProjectFingerprint(inputProject, options.rippleEditing, options.visualSegments, options.runtimeProject),
    ...(focusTime === undefined ? {} : { focusTime: Math.min(focusTime, projectDuration(next, options)) }) };
}

export function restoreBrowserVisualMedia(segments, originals, origins, assets) {
  return restoreBrowserSegmentMedia(segments, originals, origins, assets);
}

export function restoreBrowserSegmentMedia(segments = [], originals = [], origins, assets = []) {
  const sourceById = indexedSegments(originals);
  const nextById = indexedSegments(segments);
  const assetsById = assetMap(assets);
  if (origins === undefined && (sourceById.size !== nextById.size || segments.some((clip) => !sourceById.has(clip.id)))) reject("BROWSER_EDIT_STALE_PLAN");
  return segments.map((clip) => {
    const existing = sourceById.get(clip.id);
    const origin = origins && Object.hasOwn(origins, clip.id) ? origins[clip.id] : null;
    if (existing && origin) reject("BROWSER_EDIT_STALE_PLAN");
    const original = existing || (origin?.kind === "clip" ? sourceById.get(origin.id) : origin?.kind === "asset" ? assetsById.get(origin.id) : null);
    if (!original) reject("BROWSER_EDIT_STALE_PLAN");
    if (existing && clip.assetId !== undefined && clip.assetId !== existing.assetId) reject("BROWSER_EDIT_STALE_PLAN");
    const restored = { ...(existing || (origin?.kind === "clip" ? original : {})), ...clip };
    for (const key of MEDIA_FIELDS) {
      if (Object.hasOwn(original, key)) restored[key] = original[key];
      else delete restored[key];
    }
    if (!existing) {
      restored.assetId = original.assetId || (origin.kind === "asset" ? origin.id : "");
      restored.archiveMediaId = origin.kind === "asset" ? clip.id : original.archiveMediaId || original.id;
      if (!restored.url && original.src && original.type === "audio") restored.url = original.src;
      if (!restored.src && original.url && original.type !== "audio") restored.src = original.url;
    }
    return restored;
  });
}

// Cross-track media origins resolve against the entire original snapshot. The
// returned music/source fields preserve runtime state unless a new music asset
// was explicitly selected; no object URLs are created during pure review.
export function restoreBrowserProjectMedia(next, runtimeProject, origins = {}, assets = []) {
  const originals = MEDIA_COLLECTIONS.flatMap((key) => runtimeProject[key] || []);
  const restored = { ...runtimeProject, ...next };
  for (const key of MEDIA_COLLECTIONS) restored[key] = restoreBrowserSegmentMedia(next[key] || [], originals, origins, assets);
  restored.musicSegments = restored.musicSegments.map(({ blob: _blob, src: _src, url: _url, originalBlob: _originalBlob,
    compatibilityAudioBlob: _compatibilityAudioBlob, voiceColorOriginalBlob: _voiceColorOriginalBlob, ...clip }) => clip);
  const musicAssetIds = new Set((next.musicSegments || []).flatMap((clip) => {
    const origin = Object.hasOwn(origins, clip.id) ? origins[clip.id] : null;
    return origin?.kind === "asset" ? [origin.id] : [];
  }));
  if (musicAssetIds.size > 1) reject("BROWSER_EDIT_MULTIPLE_MUSIC_SOURCES");
  if (musicAssetIds.size) {
    const asset = assetMap(assets).get([...musicAssetIds][0]);
    if (!asset?.blob) reject("BROWSER_EDIT_ASSET_UNAVAILABLE");
    restored.musicBlob = asset.blob;
    restored.musicUrl = asset.url || asset.src || "";
    restored.musicPeaks = asset.peaks || [];
  }
  return restored;
}
