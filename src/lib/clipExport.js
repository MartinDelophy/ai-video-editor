import { sanitizeExportFileName } from "./exportSettings.js";

// Keep timeline coordinates intact: the shared renderer maps source trims,
// speed curves, transitions and audio before cropping the requested interval.
export function getClipExportSettings(settings, track, id, visuals, overlays) {
  if (!["image", "overlay"].includes(track)) return null;
  const segments = track === "image" ? visuals : overlays;
  const index = segments.findIndex((segment) => segment.id === id);
  if (index < 0) return null;
  const segment = segments[index];
  const start = track === "image"
    ? segments.slice(0, index).reduce((sum, item) => sum + (Number(item.duration) || 0), 0)
    : Math.max(0, Number(segment.start) || 0);
  const duration = Number(segment.duration) || 0;
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return null;
  const name = sanitizeExportFileName(String(segment.name || settings.fileName || "clip").replace(/\.[^.]+$/, ""), "clip");
  return {
    ...settings,
    mediaType: "video",
    range: "custom",
    rangeStart: start,
    rangeEnd: start + duration,
    fileName: `${name}-${start.toFixed(3)}-${(start + duration).toFixed(3)}`,
  };
}
