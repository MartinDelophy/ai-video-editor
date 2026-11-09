import {
  addMemoryVortex, addProjectedCardGroups, MEMORY_VORTEX_ID, MEMORY_VORTEX_LENGTH,
  THREE_D_TRANSFORM_ID, THREE_D_TRANSFORM_LENGTH,
} from "./projectedBeatTemplates.js";
import { createBeatPanel, getTemplateShotAsset } from "./beatMontage.js";
import { createVisualSegment } from "./timeline.js";
import { createEffectClip } from "./timelineEffects.js";
import { SEVEN_SLAT_LENGTH, SEVEN_SLAT_TICKS } from "./referenceTemplateEffects.js";

const fps = 30;
const slots = (count) => ["main", ...Array.from({ length: count - 1 }, (_, index) => `shot${index + 2}`)];
const specs = [
  { id: "seven-slat-intro", defaultBpm: 102, end: SEVEN_SLAT_LENGTH, count: 1, tracks: ["image", "effects"], type: "slats" },
  { id: "film-orbit-beat", defaultBpm: 106, end: 392, count: 6, tracks: ["image", "effects"], type: "film" },
  { id: "ripple-mask-beat", defaultBpm: 86, end: 418, count: 10, tracks: ["image"], type: "ripple" },
  { id: "staggered-mask-beat", defaultBpm: 120, end: 323, count: 16, tracks: ["image", "overlay"], type: "masks" },
  { id: THREE_D_TRANSFORM_ID, defaultBpm: 75, end: THREE_D_TRANSFORM_LENGTH, count: 20, tracks: ["image", "overlay", "effects"], type: "projected-cards" },
  { id: MEMORY_VORTEX_ID, defaultBpm: 106, end: MEMORY_VORTEX_LENGTH, count: 48, tracks: ["image", "effects"], type: "vortex", ratio: "4:5" },
];

export const REFERENCE_TEMPLATES = specs.map((spec) => ({
  id: spec.id,
  slots: slots(spec.count),
  defaultBpm: spec.defaultBpm,
  aspectRatio: spec.ratio || "16:9",
  requiredTracks: spec.tracks,
  getDuration: (bpm) => spec.end / fps * spec.defaultBpm / bpm,
  create: (options) => createReferenceTemplate(spec, options),
}));

const demos = {
  [THREE_D_TRANSFORM_ID]: ["glitch", "halo", "vignette", "glow", "shake", "halo", "ripple", "chromatic", "grain", "glitch", "grain", "shake", "halo", "glow", "ripple", "vignette", "chromatic", "glow", "glitch", "halo"],
  [MEMORY_VORTEX_ID]: ["glow", "halo", "grain", "shake", "ripple", "glitch", "vignette", "chromatic"],
  "seven-slat-intro": ["halo"],
  "film-orbit-beat": ["glitch", "shake", "halo", "glow", "vignette", "chromatic"],
  "ripple-mask-beat": ["vignette", "glow", "halo", "shake", "ripple", "chromatic", "grain", "glitch", "glow", "halo"],
  "staggered-mask-beat": ["halo", "glow", "shake", "vignette", "glow", "halo", "ripple", "chromatic", "grain", "shake", "glow", "glitch", "halo", "ripple", "grain", "vignette"],
};

export async function loadReferenceDemoAssets(template, selected, signal, label) {
  const reads = new Map();
  const first = selected.main;
  const assets = await Promise.all(template.slots.map(async (slot, index) => {
    if (selected[slot] || first) return [slot, selected[slot] || first];
    const choices = demos[template.id];
    const name = choices[index % choices.length];
    const src = `/assets/effects/vfx/${name}.webp`;
    if (!reads.has(name)) reads.set(name, (async () => {
      const response = await fetch(src, { signal });
      if (!response.ok) throw new Error("Missing template demo media.");
      const blob = await response.blob();
      const photo = await createImageBitmap(blob);
      const { width, height } = photo;
      photo.close();
      return { id: `template-demo-${name}`, src, thumbnail: src, type: "image", width, height, blob, generatedBy: "template-demo" };
    })());
    return [slot, { ...await reads.get(name), name: `${label} ${String(index + 1).padStart(2, "0")}` }];
  }));
  return Object.fromEntries(assets);
}

function createReferenceTemplate(spec, { assets, bpm, start, frameRatio, firstLayer }) {
  const factor = spec.defaultBpm / bpm / fps;
  const span = (frames) => frames * factor;
  const at = (frame) => start + span(frame);
  const ids = slots(spec.count);
  const visuals = [], overlays = [], effects = [], ticks = new Map();
  const mark = (frame, color = "cyan") => ticks.set(frame, color);
  const source = (index, duration) => {
    const asset = assets[ids[index]];
    return getTemplateShotAsset(asset, duration, asset === assets.main && spec.count > 1 ? index / (spec.count - 1) : 0);
  };
  const main = (index, from, to, extra = {}) => {
    const duration = span(to - from);
    visuals.push({ ...createVisualSegment(duration, source(index, duration)), fitMode: "cover", sourceAudioDisabled: true, ...extra });
  };
  const effect = (kind, from, to, properties) => {
    effects.push({ ...createEffectClip(kind, at(from), span(to - from)), ...properties });
  };
  const panel = (index, from, to, order, { w, h, x, y, angle, shift, scale = 0.72 }) => {
    const duration = span(to - from);
    const shot = source(index, duration);
    const entry = span(Math.min(7, (to - from) / 2));
    const overlay = createBeatPanel(shot, {
      start: at(from), duration, frameRatio, layer: firstLayer + order, rate: shot.playbackRate,
      width: w, height: h, x, y, focusY: 49,
      frames: [
        { time: 0, x: x + shift, y: y + 5, factor: scale, rotation: angle * 1.6, opacity: 0.07 },
        { time: entry * 0.64, x: x + shift * 0.18, y: y + 1, factor: 0.97, rotation: angle * 1.14 },
        { time: entry, rotation: angle },
        { time: duration, rotation: angle },
      ],
    });
    overlays.push({ ...overlay, mask: { ...overlay.mask, type: "rectangle", taper: angle < 0 ? 0.12 : -0.11 } });
    mark(from);
  };

  let previewFrame;
  if (spec.type === "projected-cards") {
    previewFrame = addProjectedCardGroups({ source, main, effect, mark, overlays, firstLayer, at, span });
  } else if (spec.type === "vortex") {
    previewFrame = addMemoryVortex({ main, effect, mark, span });
  } else if (spec.type === "slats") {
    main(0, 0, spec.end);
    effect("seven-slat-reveal", 0, spec.end, { intensity: 0.92 });
    SEVEN_SLAT_TICKS.forEach((frame) => mark(frame, frame === 0 || frame > SEVEN_SLAT_TICKS[6] ? "violet" : "cyan"));
    previewFrame = 122;
  } else if (spec.type === "film") {
    const cuts = [0, 66, 116, 166, 215, 272, spec.end];
    cuts.slice(0, -1).forEach((from, index) => {
      const to = cuts[index + 1];
      main(index, from, to);
      effect("film-orbit", from, to, { orbitIndex: index });
      mark(from, index % 2 ? "rose" : "violet");
      mark(from + Math.round((to - from) * (index === 0 ? 0.34 : 0.29)), "amber");
    });
    previewFrame = 43;
  } else if (spec.type === "ripple") {
    // 30 fps edge and full-screen arrival measurements from the reference.
    const waveStarts = [84, 126, 167, 209, 251, 293, 335, 376];
    const cuts = [0, 84, 114, 156, 198, 239, 281, 323, 366, 406, spec.end];
    cuts.slice(0, -1).forEach((from, index) => {
      const to = cuts[index + 1];
      const transition = index === 0
        ? { id: "diagonal-fold", duration: span(80) }
        : index <= 8 ? { id: "ripple-mask", duration: span(to - waveStarts[index - 1]) } : null;
      main(index, from, to, transition ? { transition } : {});
      mark(from, "violet");
      if (transition) mark(to - Math.round(transition.duration / factor), "cyan");
    });
    previewFrame = 101;
  } else {
    const cuts = [0, 61, 139, 222, 312, spec.end];
    const backdrops = [0, 3, 7, 11, 15];
    const masks = [
      ["step-mask", 46], ["step-mask", 116], ["shutter-mask", 199], ["shutter-mask", 279],
    ];
    cuts.slice(0, -1).forEach((from, index) => {
      const to = cuts[index + 1];
      const [id, enter] = masks[index] || [];
      main(backdrops[index], from, to, id ? { transition: { id, duration: span(to - enter) } } : {});
      mark(from, "violet");
      if (id) mark(enter, "amber");
    });
    const panels = [
      [0, 0, 13, 0, 0.52, 0.65, -21, -6, -4, -25],
      [1, 14, 59, 0, 0.59, 0.65, -17, -3, -6, -25],
      [2, 28, 59, 1, 0.59, 0.62, 8, 0, 5, 28],
      [4, 81, 136, 0, 0.54, 0.47, -22, -16, -3, -25],
      [5, 94, 136, 1, 0.55, 0.53, -3, 2, 7, -20],
      [6, 106, 136, 2, 0.52, 0.52, 18, 14, 4, 31],
      [8, 157, 220, 0, 0.58, 0.50, -19, -15, -3, -24],
      [9, 175, 220, 1, 0.55, 0.47, 16, -4, -4, 26],
      [10, 186, 220, 2, 0.52, 0.45, -11, 15, 4, -25],
      [12, 230, 310, 0, 0.45, 0.56, -26, -5, 14, -25],
      [13, 247, 310, 1, 0.49, 0.57, -5, 7, -4, -20],
      [14, 266, 310, 2, 0.38, 0.57, 27, 7, -11, 26],
      [15, 289, 312, 3, 0.54, 0.55, 0, 2, 0, 0],
    ];
    panels.forEach(([index, from, to, order, w, h, x, y, angle, shift]) =>
      panel(index, from, to, order, { w, h, x, y, angle, shift }));
    previewFrame = 111;
  }
  const markers = [...ticks].sort(([a], [b]) => a - b).map(([frame, color], index) => ({
    id: crypto.randomUUID(), type: "marker", time: at(frame), title: String(index + 1), color,
  }));
  return { visualSegments: visuals, overlays, effects, markers, duration: span(spec.end), previewTime: at(previewFrame) };
}
