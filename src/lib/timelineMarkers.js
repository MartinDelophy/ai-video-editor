export const TIMELINE_MARKER_TYPES = Object.freeze(["marker", "chapter", "range", "note"]);
export const TIMELINE_MARKER_COLORS = Object.freeze(["cyan", "amber", "violet", "rose", "green"]);
export const MAX_TIMELINE_MARKER_SECONDS = 24 * 60 * 60;

function markerText(value, limit) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function markerTime(value, fallback = 0) {
  const number = typeof value === "number" || (typeof value === "string" && value.trim())
    ? Number(value)
    : NaN;
  return Math.max(0, Math.min(MAX_TIMELINE_MARKER_SECONDS, Number.isFinite(number) ? number : fallback));
}

/**
 * Markers use absolute project seconds. They are annotations, so they never
 * contribute to media duration or move as part of a clip ripple edit.
 * Keep normalization deterministic so imported IDs and history stay stable.
 */
export function normalizeTimelineMarkers(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  const markers = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const baseId = markerText(item.id, 160).trim() || `timeline-marker-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (ids.has(id)) {
      const tail = `-${suffix++}`;
      id = `${baseId.slice(0, 160 - tail.length)}${tail}`;
    }
    ids.add(id);
    const type = TIMELINE_MARKER_TYPES.includes(item.type) ? item.type : "marker";
    const time = Math.min(type === "range" ? MAX_TIMELINE_MARKER_SECONDS - 0.001 : MAX_TIMELINE_MARKER_SECONDS, markerTime(item.time));
    const marker = {
      id,
      type,
      time,
      ...(type === "range" ? { endTime: Math.min(MAX_TIMELINE_MARKER_SECONDS, Math.max(time + 0.001, markerTime(item.endTime, time + 1))) } : {}),
      title: markerText(item.title, 240),
      notes: markerText(item.notes, 20000),
      color: TIMELINE_MARKER_COLORS.includes(item.color) ? item.color : "cyan",
    };
    markers.push(marker);
  }
  return markers;
}
