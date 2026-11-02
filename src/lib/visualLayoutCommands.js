import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { arrangeSplitScreen, alignedOverlayStart, moveAlignedOverlay } from "./previewAlignment.js";

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const timeValue = (value) => {
  if (!Number.isFinite(value) || value < 0 || value > MAX_TIMELINE_DURATION_SECONDS) fail("INVALID_ARGUMENT", "Expected finite project seconds within the timeline limit");
  return value;
};

// Main-picture timing is sequential; overlays retain explicit project starts.
export function visualLayoutEntries(project) {
  let cursor = 0;
  return [
    ...(project.visualSegments || []).map(clip => { const start = cursor; cursor += Number(clip.duration) || 0; return { clip, start, end: cursor, track: "image" }; }),
    ...(project.visualOverlaySegments || []).map(clip => ({ clip, start: clip.start, end: clip.start + clip.duration, track: "overlay" })),
  ];
}
const activeAt = (entry, time) => time >= entry.start && time < entry.end;
const visible = (project, entry) => project.trackVisibility?.[entry.track] !== false && !entry.clip.hidden;
const unlocked = (project, entry) => {
  if (project.trackLocks?.[entry.track]) fail("BROWSER_EDIT_TRACK_LOCKED", "The edit affects a locked visual track");
};
const entryById = (entries, id) => {
  const matches = entries.filter(entry => entry.clip.id === id);
  if (matches.length !== 1) fail("CLIP_NOT_FOUND", `Visual clip ID is missing or ambiguous: ${id}`);
  return matches[0];
};

export function applySplitScreenLayout(project, operation) {
  const time = timeValue(operation.time);
  const ids = operation.clipIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 100 || ids.some(id => typeof id !== "string" || !id || id.length > 256)
    || new Set(ids).size !== ids.length || !["columns", "rows", "grid"].includes(operation.layout)) fail("INVALID_ARGUMENT", "Provide 2–100 distinct ordered clipIds and a supported layout");
  const entries = visualLayoutEntries(project);
  const targets = ids.map(id => entryById(entries, id));
  for (const entry of targets) {
    unlocked(project, entry);
    if (!activeAt(entry, time) || !visible(project, entry)) fail("INVALID_ARGUMENT", "Every split-screen clip must be visible at the requested project time");
    if (!(entry.clip.width > 0 && entry.clip.height > 0)) fail("INVALID_ARGUMENT", "Inspect/import real media dimensions before arranging a split screen");
  }
  // Never silently leave another active picture covering an explicitly reviewed layout.
  const active = entries.filter(entry => activeAt(entry, time) && visible(project, entry));
  if (active.length !== ids.length || active.some(entry => !ids.includes(entry.clip.id))) fail("INVALID_ARGUMENT", "clipIds must include every visible main picture and overlay at this time");
  const ratio = String(project.ratioId || "16:9").split(":").map(Number);
  if (ratio.length !== 2 || !ratio.every(value => Number.isFinite(value) && value > 0)) fail("INVALID_ARGUMENT", "Invalid project ratio");
  const arranged = arrangeSplitScreen(targets.map(entry => ({ ...entry.clip, start: entry.start })), ids,
    operation.layout, { width: ratio[0] * 100, height: ratio[1] * 100 }, time);
  const updates = new Map(arranged.map(clip => [clip.id, clip]));
  project.visualSegments = (project.visualSegments || []).map(clip => {
    const update = updates.get(clip.id);
    return update ? { ...clip, baseTransform: update.baseTransform, keyframes: update.keyframes, splitScreenRect: update.splitScreenRect } : clip;
  });
  project.visualOverlaySegments = (project.visualOverlaySegments || []).map(clip => updates.get(clip.id) || clip);
}

// Explicit, inspected timeline-frame pairs. This is not automatic content matching.
export function applyReferenceFrameSync(project, operation) {
  const targetTime = timeValue(operation.targetTime);
  const referenceTime = timeValue(operation.referenceTime);
  if (operation.clipId === operation.referenceClipId) fail("INVALID_ARGUMENT", "Reference and target must be different clips");
  const entries = visualLayoutEntries(project);
  const target = entryById(entries, operation.clipId);
  const reference = entryById(entries, operation.referenceClipId);
  if (target.track !== "overlay" || target.clip.type !== "video" || reference.clip.type !== "video") fail("INVALID_ARGUMENT", "Sync requires a video overlay target and a video reference");
  unlocked(project, target);
  if (!activeAt(target, targetTime) || !activeAt(reference, referenceTime) || !visible(project, target) || !visible(project, reference))
    fail("INVALID_ARGUMENT", "Each frame time must fall inside its visible video clip");
  const start = alignedOverlayStart("reference", target.clip, null, targetTime, { time: referenceTime });
  if (start === null || start + target.clip.duration > MAX_TIMELINE_DURATION_SECONDS) fail("INVALID_ARGUMENT", "The aligned video would exceed timeline bounds");
  const moved = moveAlignedOverlay(project.visualOverlaySegments, target.clip.id, start);
  if (moved.some(clip => clip.layer > 1000)) fail("INVALID_ARGUMENT", "Overlay layer limit exceeded");
  project.visualOverlaySegments = moved;
}
