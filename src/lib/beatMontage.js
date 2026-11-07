import { createVisualOverlaySegment, getVisualOverlayContainBox } from "./visualOverlayTimeline.js";
import { createEffectClip } from "./timelineEffects.js";

export const BEAT_MONTAGE_ID = "beat-montage";
export const MONTAGE_BPM = 104;
export const MONTAGE_STEP = 30 / MONTAGE_BPM;
export const MONTAGE_DURATION = 8 * MONTAGE_STEP;
const rows = [
  { beat: 3, y: -31, enterX: 88, enterY: -38 },
  { beat: 5, y: 31, enterX: -88, enterY: 38 },
  { beat: 6, y: 0, enterX: 0, enterY: 0 },
];

export function createBeatPanel(asset, { start, duration, layer = 1, frameRatio = 1, width = 0.64, height = 0.26, x = 0, y = 0, focusX = 50, focusY = 50, frames = [], rate = 1 }) {
  const box = getVisualOverlayContainBox(asset, frameRatio);
  const scale = Math.max(width * 100 / box.widthPercent, height * 100 / box.heightPercent);
  const maskWidth = Math.min(100, width * 10000 / (box.widthPercent * scale));
  const maskHeight = Math.min(100, height * 10000 / (box.heightPercent * scale));
  const center = (focus, length) => Math.min(100 - length / 2, Math.max(length / 2, focus));
  const centerX = center(focusX, maskWidth), centerY = center(focusY, maskHeight);
  const place = (values = {}) => {
    const factor = values.factor || 1;
    return {
      x: (values.x ?? x) - (centerX - 50) * box.widthPercent * scale * factor / 100,
      y: (values.y ?? y) - (centerY - 50) * box.heightPercent * scale * factor / 100,
      scale: scale * factor, rotation: values.rotation ?? 0, opacity: values.opacity ?? 1,
    };
  };
  return createVisualOverlaySegment({ ...asset, speedCurve: undefined }, start, {
    duration, layer, muted: true, playbackRate: rate,
    mask: { type: "rounded", centerX, centerY, width: maskWidth, height: maskHeight, cornerRadius: 2.3 },
    baseTransform: place(), keyframes: frames.map(({ time, ...frame }) => ({ time, ...place(frame) })),
  });
}

// Three regular PiP clips, three ordinary timeline effects and optional ruler
// points. Nothing is baked into media and existing clips are left in place.
export function createBeatMontage({ asset, start, available, frameRatio, firstLayer = 1, sourceStarts, focusX = 50, focusY = 50, useMarkers = false }) {
  const duration = Math.min(available, MONTAGE_DURATION);
  if (!asset?.src || !Number.isFinite(duration) || duration < 0.5) return null;
  const step = duration / 8;
  const bpm = 30 / step;
  const overlays = rows.map((row, index) => {
    const center = index === 2;
    const entry = Math.min(0.31, step * (center ? 0.95 : 1.2));
    const span = duration - row.beat * step;
    const sourceStart = Math.max(0, Number(sourceStarts?.[index]) || (Number(asset.sourceStart) || 0));
    return createBeatPanel({ ...asset, sourceStart }, {
      start: start + row.beat * step, duration: span, layer: firstLayer + index, frameRatio,
      y: row.y, focusX, focusY,
      frames: [
        { time: 0, x: row.enterX, y: row.enterY, factor: center ? 0.34 : 1.04, opacity: center ? 0 : 1 },
        { time: entry * 0.6, x: row.enterX * 0.13, y: row.y + (row.enterY - row.y) * 0.13, factor: center ? 0.94 : 1.014, opacity: 1 },
        { time: entry, x: 0, y: row.y },
      ],
    });
  });
  const beat = { source: useMarkers || bpm > 300 ? "markers" : "tempo", bpm: Math.min(300, bpm), subdivision: 2 };
  const effects = [
    { ...createEffectClip("ink-print", start, duration), intensity: 0.85 },
    { ...createEffectClip("beat-backdrop", start, duration), beat, intensity: 0.64 },
    { ...createEffectClip("beat-zoom", start, duration), beat, intensity: 0.36 },
  ];
  const markers = Array.from({ length: 8 }, (_, index) => ({
    id: crypto.randomUUID(), type: "marker", time: start + index * step, title: String(index + 1),
    color: [0, 3, 5, 6].includes(index) ? "violet" : "cyan",
  }));
  return { overlays, effects, markers };
}
