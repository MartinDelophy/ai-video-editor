import { applyCommandPlan, diffProjects } from "./projectCommandEngine.js";
import { applyTimelineRipple } from "./timelineRipple.js";
import { MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { getTimedSegmentLaneStateKey, isTimedSegmentLaneLocked } from "./timeline.js";
import { getLinkedSourceAudioSegments } from "./sourceAudioSync.js";

const TIME_EPSILON = 0.000001;
const MEDIA_FIELDS = ["blob", "src", "url", "peaks", "trackFrames", "cutoutVisual", "enhancement", "assetId", "archiveMediaId", "integrity"];
const RIPPLE_ARRAY_FIELDS = ["audioSegments", "captionSegments", "visualOverlaySegments", "stickerSegments", "musicSegments"];
const RIPPLE_FIELDS = [...RIPPLE_ARRAY_FIELDS, "musicStart", "sourceAudioStart"];
const runtimeIdentities = new WeakMap();
let nextRuntimeIdentity = 0;

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

// The fingerprint includes UI edits and undo, which do not increment the CLI revision.
function runtimeIdentity(value) {
  if (value === null || typeof value !== "object") return value ?? null;
  if (!runtimeIdentities.has(value)) runtimeIdentities.set(value, ++nextRuntimeIdentity);
  return runtimeIdentities.get(value);
}

export function annaProjectFingerprint(project, rippleEditing, visualSegments) {
  const runtimeVisuals = visualSegments?.map((clip) => ({
    id: clip.id,
    assetId: clip.assetId,
    archiveMediaId: clip.archiveMediaId,
    src: clip.src,
    blob: runtimeIdentity(clip.blob),
    cutoutVisual: runtimeIdentity(clip.cutoutVisual),
    enhancement: runtimeIdentity(clip.enhancement),
    trimAllowed: supportsAnnaTrim(clip),
  }));
  return JSON.stringify({ ...project, rippleEditing, runtimeVisuals });
}

export function getAnnaPlanningAssets(visualSegments) {
  return visualSegments.map((clip, index) => ({
    id: clip.id,
    type: clip.type === "video" ? "video" : "image",
    name: String(clip.name || clip.id),
    duration: Number(clip.duration),
    trimAllowed: supportsAnnaTrim(clip) && !hasTransition(visualSegments[index - 1]),
  }));
}

function hasTransition(clip) {
  return Boolean(clip?.transition?.id && clip.transition.id !== "none");
}

export function supportsAnnaTrim(clip) {
  const rate = clip?.playbackRate === undefined ? 1 : Number(clip.playbackRate);
  return (
    clip?.type === "video" &&
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
    !clip.vision &&
    !hasTransition(clip) &&
    !clip.cutoutVisual &&
    !clip.enhancement
  );
}

function indexedSegments(segments) {
  if (!Array.isArray(segments)) reject("ANNA_INVALID_PLAN");
  const index = new Map();
  for (const clip of segments) {
    if (!clip || typeof clip.id !== "string" || !clip.id || index.has(clip.id)) reject("ANNA_INVALID_PLAN");
    index.set(clip.id, clip);
  }
  return index;
}

function completeAnnaProject(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) reject("ANNA_INVALID_PLAN");
  const next = { ...project };
  for (const key of ["visualSegments", ...RIPPLE_ARRAY_FIELDS]) {
    // Older/partial snapshots can omit empty tracks. A present malformed value
    // is rejected rather than silently dropping an existing track's contents.
    if (next[key] == null) next[key] = [];
    else if (!Array.isArray(next[key])) reject("ANNA_INVALID_PLAN");
  }
  for (const key of ["musicStart", "sourceAudioStart"]) {
    if (next[key] == null) next[key] = 0;
    if (typeof next[key] !== "number" || !Number.isFinite(next[key]) || next[key] < 0) reject("ANNA_INVALID_PLAN");
  }
  return next;
}

function assertLockedSourceUnchanged(project, next, options) {
  if (!project.trackLocks?.source || !options.hasSourceAudio || project.sourceAudioLinked === false) return;
  const beforeSource = getLinkedSourceAudioSegments(project.visualSegments, project.sourceAudioAssetId, project.sourceAudioDuration);
  const afterSource = getLinkedSourceAudioSegments(next.visualSegments, next.sourceAudioAssetId, next.sourceAudioDuration);
  if (JSON.stringify(beforeSource) !== JSON.stringify(afterSource)) reject("ANNA_TRACK_LOCKED");
}

/** Compile untrusted model data into the existing command engine before touching UI state. */
export function buildAnnaTimelineReview(inputProject, response, options = {}) {
  const project = completeAnnaProject(inputProject);
  const originals = project.visualSegments;
  const sourceById = indexedSegments(originals);
  const requested = response?.segments;
  if (!originals.length || !Array.isArray(requested) || requested.length !== originals.length)
    reject("ANNA_INVALID_PLAN");
  if (project.trackLocks?.image) reject("ANNA_TRACK_LOCKED");
  const beforeDuration = originals.reduce((sum, clip) => {
    if (typeof clip.duration !== "number" || !Number.isFinite(clip.duration) || clip.duration < MIN_VISUAL_SEGMENT_SECONDS) reject("ANNA_INVALID_PLAN");
    return sum + clip.duration;
  }, 0);
  if (beforeDuration > MAX_TIMELINE_DURATION_SECONDS) reject("ANNA_INVALID_PLAN");
  // Archive snapshots omit processed-media fields. Only the corresponding live
  // clips can establish whether a trim is safe; absent context permits reorder only.
  const runtimeById = options.visualSegments ? indexedSegments(options.visualSegments) : null;
  if (runtimeById && (runtimeById.size !== sourceById.size || originals.some((clip) => !runtimeById.has(clip.id)))) reject("ANNA_STALE_PLAN");
  if (runtimeById && originals.some((clip) => ["type", "duration", "sourceStart", "sourceDuration", "playbackRate", "sourceAudioOffset"]
    .some((key) => !Object.is(clip[key], runtimeById.get(clip.id)[key])))) reject("ANNA_STALE_PLAN");
  const seen = new Set();
  const operations = [];
  const orderedIds = originals.map((clip) => clip.id);
  const baseRevision = project.commandState?.revision || 0;
  const batch = crypto.randomUUID();
  const add = (operation) => operations.push({ ...operation, id: `${batch}-${operations.length}` });
  requested.forEach((item, index) => {
    if (!item || typeof item.assetId !== "string") reject("ANNA_INVALID_PLAN");
    const clip = sourceById.get(item.assetId);
    if (!clip || seen.has(item.assetId)) reject("ANNA_INVALID_PLAN");
    seen.add(item.assetId);
    const offset = item.sourceStart;
    const duration = item.duration;
    if (
      typeof offset !== "number" ||
      !Number.isFinite(offset) ||
      offset < 0 ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < MIN_VISUAL_SEGMENT_SECONDS ||
      offset + duration > clip.duration + TIME_EPSILON
    )
      reject("ANNA_INVALID_PLAN");
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
      if (clip.type !== "video") reject("ANNA_INVALID_PLAN");
      const runtimeClip = runtimeById?.get(clip.id);
      const originalIndex = originals.findIndex((value) => value.id === clip.id);
      const previousClip = index > 0 ? sourceById.get(requested[index - 1]?.assetId) : null;
      if (!supportsAnnaTrim(clip) || !supportsAnnaTrim(runtimeClip) || hasTransition(originals[originalIndex - 1]) || hasTransition(previousClip)) reject("ANNA_COMPLEX_TIMING");
      const sourceStart = clip.sourceStart === undefined ? 0 : Number(clip.sourceStart);
      const sourceDuration = clip.sourceDuration === undefined ? clip.duration : Number(clip.sourceDuration);
      if (!Number.isFinite(sourceStart) || sourceStart < 0 || !Number.isFinite(sourceDuration) || sourceDuration <= 0) reject("ANNA_INVALID_PLAN");
      const sourceIn = sourceStart + offset;
      const sourceOut = Math.min(sourceStart + sourceDuration, sourceStart + clip.duration, sourceIn + duration);
      // Tolerate rounding at a boundary, never silently shorten a requested trim
      // to fit a missing or inconsistent source range.
      if (Math.abs((sourceOut - sourceIn) - duration) > TIME_EPSILON || sourceOut - sourceIn < MIN_VISUAL_SEGMENT_SECONDS - TIME_EPSILON) reject("ANNA_INVALID_PLAN");
      add({ type: "visual.trim", clipId: clip.id, sourceIn, sourceOut });
    }
  });
  const result = operations.length
    ? applyCommandPlan(project, { schemaVersion: 1, baseRevision, operations })
    : { ok: true, project: structuredClone(project) };
  if (!result.ok) reject("ANNA_INVALID_PLAN");

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
      getTimedSegmentLaneStateKey(project.audioSegments, id) !== getTimedSegmentLaneStateKey(next.audioSegments, id)) reject("ANNA_TRACK_LOCKED");
  }
  return {
    title: typeof response.title === "string" ? response.title : "",
    summary: typeof response.summary === "string" ? response.summary : "",
    model: typeof response.model === "string" ? response.model : "",
    fingerprint: annaProjectFingerprint(inputProject, options.rippleEditing, options.visualSegments),
    project: completeAnnaProject(next),
    rows,
    hasChanges: rows.some((row) => row.changed),
    changeSummary: {
      reordered: rows.filter((row) => row.reordered).length,
      trimmed: rows.filter((row) => row.trimmed).length,
    },
    changes: diffProjects(project, next),
    beforeDuration,
    duration: previousStart,
  };
}

export function restoreAnnaVisualMedia(segments, originals) {
  return restoreAnnaSegmentMedia(segments, originals);
}

export function restoreAnnaSegmentMedia(segments = [], originals = []) {
  const sourceById = indexedSegments(originals);
  const nextById = indexedSegments(segments);
  if (sourceById.size !== nextById.size || segments.some((clip) => !sourceById.has(clip.id))) reject("ANNA_STALE_PLAN");
  return segments.map((clip) => {
    const original = sourceById.get(clip.id);
    const restored = { ...original, ...clip };
    for (const key of MEDIA_FIELDS) {
      if (Object.hasOwn(original, key)) restored[key] = original[key];
      else delete restored[key];
    }
    return restored;
  });
}
