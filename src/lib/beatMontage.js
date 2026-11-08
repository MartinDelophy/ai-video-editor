import { createVisualOverlaySegment, getVisualOverlayContainBox } from "./visualOverlayTimeline.js";
import { createVisualSegment } from "./timeline.js";
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

function createBeatPanel(asset, { start, duration, layer = 1, frameRatio = 1, width = 0.64, height = 0.26, x = 0, y = 0, focusX = 50, focusY = 50, frames = [], rate = 1 }) {
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

// Generate ordinary PiP clips so each entrance is editable on the timeline.
function createTriptych({ start, duration, frameRatio, firstLayer, panelAssets }) {
  const step = duration / 8;
  return rows.map((row, index) => {
    const center = index === 2;
    const entry = Math.min(0.31, step * (center ? 0.95 : 1.2));
    const panel = panelAssets[index];
    return createBeatPanel(panel, {
      start: start + row.beat * step, duration: duration - row.beat * step, layer: firstLayer + index, frameRatio,
      y: row.y, rate: panel.playbackRate,
      frames: [
        { time: 0, x: row.enterX, y: row.enterY, factor: center ? 0.34 : 1.04, opacity: center ? 0 : 1 },
        { time: entry * 0.6, x: row.enterX * 0.13, y: row.y + (row.enterY - row.y) * 0.13, factor: center ? 0.94 : 1.014, opacity: 1 },
        { time: entry, x: 0, y: row.y },
      ],
    });
  });
}

export const BEAT_TEMPLATE_SECONDS = 592 / 30;
export const MIN_TEMPLATE_BPM = 60;
export const MAX_TEMPLATE_BPM = 180;
export const TEMPLATE_SLOTS = ["main", "detail", "alternate"];

export function getBeatTemplateDuration(bpm) {
  return BEAT_TEMPLATE_SECONDS * MONTAGE_BPM / bpm;
}

export function isUntouchedTemplateSource(clip, asset) {
  if (!clip?.src || !asset?.src || clip.type !== asset.type || clip.preparing) return false;
  if (clip.assetId !== asset.id && clip.src !== asset.src) return false;
  const originalDuration = clip.type === "video"
    ? asset.trackFrameDuration || clip.trackFrameDuration
    : 4; // The standard local image import duration.
  const near = (a, b) => Math.abs(a - b) < 0.001;
  if (!(originalDuration > 0) || !near(clip.duration, originalDuration)
    || !near(clip.sourceDuration ?? clip.duration, originalDuration)
    || !near(clip.sourceStart || 0, 0) || !near(clip.playbackRate ?? 1, 1)
    || !near(clip.volume ?? 1, 1)) return false;
  // Keep any edited clip in place, even if it is the only clip in the project.
  return !(clip.keyframes?.length || clip.baseTransform || clip.splitScreenRect || clip.fitMode
    || clip.speedCurve?.enabled || clip.sourceAudioDisabled || clip.muted || clip.audioSeparated
    || clip.hidden || (clip.filterId && clip.filterId !== "none")
    || (clip.mask?.type && clip.mask.type !== "none")
    || (clip.transition?.id && clip.transition.id !== "none")
    || clip.animation || clip.colorGrade || clip.smartFrame || clip.subjectEffect
    || clip.clickRipple?.enabled || clip.cinematicDepth?.enabled || clip.photoParallax?.enabled
    || (clip.spatialEffect && clip.spatialEffect !== "original"));
}

export function getTemplateShotAsset(asset, duration, fraction) {
  const available = asset.type === "video" ? asset.sourceDuration ?? asset.duration : 0;
  const sourceDuration = Math.min(available, duration);
  return {
    ...asset,
    sourceStart: asset.type === "video"
      ? (asset.sourceStart || 0) + Math.max(0, available - sourceDuration) * fraction
      : 0,
    sourceDuration,
    playbackRate: asset.type === "video" ? sourceDuration / duration : 1,
    trackFrameDuration: asset.trackFrameDuration || asset.duration,
    speedCurve: undefined,
  };
}

const scenes = [
  { start: 10.733, end: 12.067, panels: [
    { slot: "detail", portion: 0.35, w: 0.83, h: 0.48, x: 2, y: -10, roll: -4, shift: -41 },
    { slot: "alternate", portion: 0.69, w: 0.38, h: 0.69, x: 21, y: 10, roll: 5, shift: 58, delay: 0.13 },
  ] },
  { start: 13, end: 14.333, panels: [
    { slot: "main", portion: 0.14, w: 0.74, h: 0.46, x: -8, y: 17, roll: 5, shift: 54 },
    { slot: "detail", portion: 0.56, w: 0.47, h: 0.72, x: -9, y: -8, roll: -6, shift: -48, delay: 0.12 },
  ] },
  { start: 15.4, end: 16.767, panels: [
    { slot: "alternate", portion: 0.9, w: 0.73, h: 0.46, x: 5, y: -15, roll: -4, shift: -49 },
    { slot: "main", portion: 0.24, w: 0.38, h: 0.66, x: -24, y: 9, roll: 4, shift: 55, delay: 0.13 },
    { slot: "detail", portion: 0.46, w: 0.53, h: 0.40, x: 15, y: 16, roll: -2, shift: 40, delay: 0.3 },
  ] },
];

export function createBeatTemplate({ assets, bpm, start, frameRatio, firstLayer }) {
  const stretch = MONTAGE_BPM / bpm;
  const at = (time) => start + time * stretch;
  const span = (time) => time * stretch;
  const duration = getBeatTemplateDuration(bpm);
  const intro = 0.533;
  const groups = Array.from({ length: 4 }, (_, i) => intro + i * MONTAGE_DURATION);
  const later = intro + 4 * MONTAGE_DURATION;
  const cuts = [0, ...groups, later, 10.733, 12.067, 13, 14.333, 15.4, 16.767, 17.85, 18.88, BEAT_TEMPLATE_SECONDS];
  const roles = ["main", "main", "main", "detail", "alternate", "detail", "main", "detail", "main", "alternate", "main", "alternate", "alternate", "alternate"];
  const portions = [0, 0.01, 0.16, 0.36, 0.72, 0.45, 0.3, 0.54, 0.2, 0.71, 0.26, 0.82, 0.9, 1];
  const beat = { source: "markers", bpm, subdivision: 2 };
  const visualSegments = roles.map((role, i) => {
    const length = span(cuts[i + 1] - cuts[i]);
    const shot = getTemplateShotAsset(assets[role], length, portions[i]);
    const zoom = (time, scale, y = 0, opacity = 1) => ({ time, scale, y, opacity });
    const keyframes = i === 0
      ? [zoom(0, 1.08, 0, 0), zoom(span(0.36), 1.08)]
      : i <= 4
        ? [zoom(0, 1.27, 8), zoom(span(0.14), 1.13, 1.4), zoom(span(0.34), 1.045), zoom(length, 1.075)]
        : i === roles.length - 1
          ? [zoom(0, 1.13), zoom(span(0.42), 1.17), zoom(length, 1.18, 0, 0)]
          : i % 2 ? [zoom(0, 1.19), zoom(span(0.27), 1.09), zoom(length, 1.12)] : [];
    return {
      ...createVisualSegment(length, shot),
      fitMode: "cover",
      sourceAudioDisabled: true,
      baseTransform: { x: 0, y: 0, scale: 1.07, rotation: 0, opacity: 1 },
      keyframes,
    };
  });
  const overlays = [], effects = [], markers = [];
  const effect = (id, time, length, parameters) => effects.push({ ...createEffectClip(id, at(time), span(length)), ...parameters });
  const mark = (time, color) => markers.push({ id: crypto.randomUUID(), type: "marker", time: at(time), color });
  const panelRoles = [
    ["main", "alternate", "detail"], ["main", "detail", "alternate"],
    ["main", "alternate", "detail"], ["main", "detail", "alternate"],
  ];
  const panelPortions = [[0.08, 0.72, 0.40], [0.21, 0.54, 0.78], [0.31, 0.88, 0.46], [0.14, 0.6, 0.93]];
  groups.forEach((group, i) => {
    const available = span(MONTAGE_DURATION);
    const panels = panelRoles[i].map((role, index) => getTemplateShotAsset(assets[role], available * (8 - rows[index].beat) / 8, panelPortions[i][index]));
    overlays.push(...createTriptych({ start: at(group), duration: available, frameRatio, firstLayer, panelAssets: panels }));
    effect("ink-print", group, MONTAGE_DURATION, { intensity: 0.85 });
    effect("beat-backdrop", group, MONTAGE_DURATION, { beat, intensity: 0.48 });
    effect("beat-zoom", group, MONTAGE_DURATION, { beat, intensity: 0.21 });
    [0, 3, 5, 6].forEach((tick) => mark(group + tick * MONTAGE_STEP, tick ? "cyan" : "violet"));
  });
  for (const scene of scenes) {
    effect("ink-print", scene.start, scene.end - scene.start, { intensity: 0.78 });
    effect("beat-backdrop", scene.start, scene.end - scene.start, { beat, intensity: 0.33 });
    scene.panels.forEach((panel, i) => {
      const time = scene.start + (panel.delay || 0), length = span(scene.end - time);
      const shot = getTemplateShotAsset(assets[panel.slot], length, panel.portion);
      overlays.push(createBeatPanel(shot, {
        start: at(time), duration: length, frameRatio, layer: firstLayer + i, rate: shot.playbackRate,
        width: panel.w, height: panel.h, x: panel.x, y: panel.y, focusY: 44,
        frames: [
          { time: 0, x: panel.x + panel.shift, y: panel.y + (i ? -6 : 8), factor: 0.82, rotation: panel.roll * 2, opacity: 0.02 },
          { time: span(0.16), x: panel.x + panel.shift * 0.11, factor: 1.03, rotation: panel.roll },
          { time: span(0.29), rotation: panel.roll },
          { time: length, factor: 1.045, rotation: panel.roll * 0.8 },
        ],
      }));
    });
  }
  for (const [time, length, shape] of [[11.88, 0.28, "circle"], [14.1, 0.30, "star"], [16.22, 0.58, "line"], [18.79, 0.38, "circle"]]) {
    effect("shape-flash", time, length, { shape, intensity: 1 });
    mark(time, "rose");
  }
  for (const [time, length, intensity] of [[later, 0.58, 0.67], [10.62, 0.27, 0.58], [12.067, 0.50, 0.61], [12.92, 0.31, 0.54], [14.333, 0.47, 0.62], [15.27, 0.32, 0.57], [16.767, 0.52, 0.59], [17.85, 0.51, 0.48]]) {
    effect("beat-zoom", time, length, { beat, intensity });
    mark(time, "amber");
  }
  for (const time of [10.733, 13, 15.4]) mark(time, "amber");
  markers.sort((a, b) => a.time - b.time).forEach((marker, i) => { marker.title = String(i + 1); });
  // Land just after the final entrance of the first set of panels, while all
  // three are still on screen. Scale this time with the rest of the template.
  const previewTime = at(intro + MONTAGE_DURATION * 0.89);
  return { visualSegments, overlays, effects, markers, duration, previewTime };
}
