import { isTimedSegmentLaneLocked } from "./timeline.js";

function positions(visuals) {
  let start = 0;
  return new Map(visuals.map(clip => { const entry = [clip.id, start]; start += Number(clip.duration) || 0; return entry; }));
}

// Ownership is explicit and clip-scoped. Time overlap and shared source assets
// do not establish ownership (split siblings can share the same asset).
export function reconcileVisualAssociations(project, before, after, deletedIds = []) {
  const oldStarts = positions(before), newStarts = positions(after);
  const deleted = new Set(deletedIds), removedAudio = new Set(), audioDeltas = new Map();
  const locks = project.trackLocks || {};
  const captionCount = (project.captionSegments || []).length;
  for (const [key, track] of [["audioSegments", "audio"], ["captionSegments", "caption"], ["stickerSegments", "sticker"]]) {
    const segments = project[key] || [];
    project[key] = segments.flatMap(segment => {
      const locked = track === "audio" ? isTimedSegmentLaneLocked(segments, segment.id, locks) : locks[track];
      if (locked || track === "audio" && locks.caption && (project.captionSegments || []).some(caption => caption.audioSegmentId === segment.id)) return [segment];
      const owner = segment.visualSegmentId;
      if (owner && deleted.has(owner)) {
        if (track === "audio") removedAudio.add(segment.id);
        return [];
      }
      if (track === "caption" && removedAudio.has(segment.audioSegmentId)) return [];
      const delta = owner && oldStarts.has(owner) && newStarts.has(owner)
        ? newStarts.get(owner) - oldStarts.get(owner)
        : track === "caption" ? audioDeltas.get(segment.audioSegmentId) || 0 : 0;
      if (!delta) return [segment];
      if (track === "audio") audioDeltas.set(segment.id, delta);
      return [{ ...segment, start: Math.max(0, (Number(segment.start) || 0) + delta),
        ...(Number.isFinite(segment.end) ? { end: Math.max(0, segment.end + delta) } : {}) }];
    });
  }
  if (project.captionSegments.length !== captionCount) project.script = project.captionSegments.map(segment => segment.text).join("\n");
  return project;
}

// A deliberate timed move transfers existing ownership only. A linked group
// must fit wholly inside one visual; ambiguous placements become independent.
export function rebindMovedVisualGroup(segments, visuals) {
  if (!segments.some(segment => segment.visualSegmentId)) return segments;
  const start = Math.min(...segments.map(segment => Number(segment.start) || 0));
  const end = Math.max(...segments.map(segment => Number.isFinite(segment.end)
    ? segment.end : (Number(segment.start) || 0) + (Number(segment.duration) || 0)));
  let cursor = 0;
  const owner = visuals.find(visual => {
    const from = cursor;
    cursor += Number(visual.duration) || 0;
    return start >= from - 0.000001 && end <= cursor + 0.000001 && end > start;
  });
  return segments.map(segment => {
    const { visualSegmentId: previous, ...rest } = segment;
    return owner ? { ...rest, visualSegmentId: owner.id } : previous ? rest : segment;
  });
}
