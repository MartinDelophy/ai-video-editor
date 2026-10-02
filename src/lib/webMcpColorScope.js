import { getBrowserPlanningClips } from "./browserEditPlan.js";

// Timeline intervals are half-open: a point at a cut belongs to the next shot.
// These references deliberately contain no source URLs or runtime media.
export function inspectColorScopes(editor, project) {
  const planning = getBrowserPlanningClips(editor.visualSegments || []);
  let cursor = 0;
  const clips = (project.visualSegments || []).map((clip, index) => {
    const start = cursor;
    cursor += Number(clip.duration) || 0;
    return { clipId: clip.id, start, end: cursor, splitAllowed: Boolean(planning[index]?.splitAllowed) };
  });
  const selectedId = editor.selectedTrack === "image" ? editor.selectedVisualSegmentId
    : editor.selectedTrack === "overlay" ? editor.selectedVisualOverlayId : null;
  const selected = clips.find(clip => clip.clipId === selectedId);
  const overlay = (project.visualOverlaySegments || []).find(clip => clip.id === selectedId);
  return {
    selected: selected ? { ...selected, track: "visuals" }
      : overlay ? { clipId: overlay.id, track: "overlays", start: overlay.start, end: overlay.start + overlay.duration, splitAllowed: false } : null,
    markers: (project.timelineMarkers || []).map(marker => {
      const range = marker.type === "range";
      const matches = clips.filter(clip => range
        ? clip.start < marker.endTime && clip.end > marker.time
        : clip.start <= marker.time && clip.end > marker.time);
      return {
        markerId: marker.id, type: marker.type, start: marker.time,
        ...(range ? { end: marker.endTime } : {}),
        targets: matches.map(clip => {
          const start = range ? Math.max(clip.start, marker.time) : clip.start;
          const end = range ? Math.min(clip.end, marker.endTime) : clip.end;
          const partial = start > clip.start || end < clip.end;
          return { ...clip, targetStart: start, targetEnd: end, localStart: start - clip.start, localEnd: end - clip.start, requiresSplit: partial, supported: !partial || clip.splitAllowed };
        }),
      };
    }),
  };
}
