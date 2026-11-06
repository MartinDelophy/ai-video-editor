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

/** Resolve once before a batch so async downloads cannot change its targets. */
export function getSelectedClipExportJobs(settings, selected, visuals, overlays) {
  const seen = new Set();
  return selected.flatMap(({ track, id }) => {
    const key = `${track}:${id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const clip = getClipExportSettings(settings, track, id, visuals, overlays);
    return clip ? [clip] : [];
  }).sort((left, right) => left.rangeStart - right.rangeStart)
    .map((clip, index) => ({ ...clip, fileName: `${String(index + 1).padStart(2, "0")}-${clip.fileName}` }));
}

export async function exportClipJobs(jobs, exportVideo, { signal, onStart } = {}) {
  let completed = 0;
  for (const settings of jobs) {
    if (signal?.aborted) return { status: "canceled", completed };
    onStart?.({ current: completed + 1, total: jobs.length });
    const result = await exportVideo({ settings, signal, suppressNotification: true });
    if (result?.status !== "success") return { status: result?.status || "failed", completed };
    completed += 1;
  }
  return { status: "success", completed };
}
