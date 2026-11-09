import { createVisualOverlaySegment } from "./visualOverlayTimeline.js";

// Frame indices are measured at 30 fps. Each row starts with a horizontal
// photo strip, then adds four independent cards in the observed order.
const cardGroups = [
  {
    start: 0, end: 72, open: 12, close: 5, fade: 59, cardEnd: 67, color: "#83e8af",
    cards: [
      [29, 34, [[0.64, 0.01], [0.67, -0.02], [0.94, 0.77], [0.72, 0.68]]],
      [37, 42, [[0.02, 0.66], [0.27, 0.55], [0.43, 0.95], [0.15, 0.79]]],
      [45, 51, [[0.14, 0.73], [0.42, 0.0], [0.50, -0.07], [0.46, 0.45]]],
      [53, 59, [[0.32, 0.89], [0.53, 0.55], [0.93, 0.44], [0.48, 1.04]]],
    ],
  },
  {
    start: 72, end: 137, open: 6, close: 5, fade: 125, cardEnd: 132, color: "#f43d9b",
    cards: [
      [93, 98, [[0.14, 0.37], [0.30, -0.02], [0.36, 0.30], [0.24, 0.51]]],
      [99, 105, [[0.09, 0.63], [0.59, 0.34], [0.52, 0.74], [0.23, 0.97]]],
      [107, 112, [[0.49, 0.05], [0.72, 0.40], [0.86, 0.67], [0.58, 0.92]]],
      [116, 122, [[0.53, 0.45], [0.95, 0.02], [1.04, 0.41], [0.67, 0.73]]],
    ],
  },
  {
    start: 137, end: 198, open: 5, close: 4, fade: 188, cardEnd: 197, color: "#3e779f",
    cards: [
      [155, 161, [[-0.05, -0.13], [0.25, -0.02], [0.49, 0.17], [0.45, 0.42]]],
      [163, 168, [[0.11, 0.30], [0.57, 0.41], [0.55, 0.69], [0.12, 0.79]]],
      [171, 176, [[0.04, 0.69], [0.54, 0.59], [0.61, 0.91], [0.10, 1.08]]],
      [179, 185, [[0.43, 0.31], [1.00, 0.51], [0.98, 1.01], [0.42, 0.76]]],
    ],
  },
  {
    start: 198, end: 258, open: 6, close: 0, fade: 258, cardEnd: 258, color: "#bd5699",
    cards: [
      [219, 224, [[-0.02, 0.41], [0.23, 0.41], [0.51, 1.00], [0.26, 1.06]]],
      [227, 232, [[0.12, 0.58], [0.35, 0.46], [0.53, 0.56], [0.55, 0.91]]],
      [234, 240, [[0.55, 0.64], [0.88, 0.47], [1.06, 0.64], [0.51, 1.05]]],
      [242, 248, [[0.42, -0.10], [0.50, 0.08], [0.80, 1.02], [0.60, 0.85]]],
    ],
  },
];

export const THREE_D_TRANSFORM_ID = "3d-transform-beat";
export const MEMORY_VORTEX_ID = "memory-vortex-beat";
export const THREE_D_TRANSFORM_LENGTH = 258;
export const MEMORY_VORTEX_INTRO = 81;
export const MEMORY_VORTEX_LENGTH = 897;

// Perceptual midpoints of the numbered dissolves. The three video frames of
// the tutorial title preceding the actual template have already been removed.
const vortexBeats = [
  81, 98, 115, 133, 149, 166, 183, 199, 217, 233, 251, 266,
  285, 301, 319, 335, 353, 369, 386, 403, 420, 437, 454, 471,
  487, 505, 522, 538, 555, 572, 589, 607, 624, 641, 658, 675,
  691, 708, 726, 744, 759, 778, 794, 811, 829, 845, 863, 879,
];

export function addProjectedCardGroups({ source, main, effect, mark, overlays, firstLayer, at, span }) {
  cardGroups.forEach(({ start, end, open, close, fade, cardEnd, color, cards }, group) => {
    const slot = group * 5;
    main(slot, start, end);
    effect("beat-strip", start, end, {
      color, intensity: 0.72,
      strip: { open: open / (end - start), close: close / (end - start), startsFull: group === 0 },
    });
    mark(start, "violet");
    cards.forEach(([enter, settle, corners], index) => {
      const duration = span(cardEnd - enter);
      const x = corners.reduce((sum, point) => sum + point[0], 0) / 4;
      const y = corners.reduce((sum, point) => sum + point[1], 0) / 4;
      const pos = { x: (x - 0.5) * 100, y: (y - 0.5) * 100 };
      const entry = span(settle - enter);
      const direction = x > 0.5 ? 1 : -1;
      const keyframes = [
        { time: 0, x: pos.x * 0.30, y: pos.y * 0.30, scale: 0.15, rotation: -24 * direction, opacity: 0.36 },
        { time: entry * 0.55, x: pos.x * 0.84, y: pos.y * 0.78, scale: 0.76, rotation: -8 * direction, opacity: 1 },
        { time: entry, ...pos, scale: 1, rotation: 0, opacity: 1 },
      ];
      if (fade < cardEnd) {
        keyframes.push(
          { time: span(fade - enter), ...pos, scale: 1, rotation: 0, opacity: 1 },
          { time: duration, ...pos, scale: 1, rotation: 0, opacity: 0 },
        );
      }
      const shot = source(slot + index + 1, duration);
      const overlay = createVisualOverlaySegment(shot, at(enter), {
        duration, layer: firstLayer + index, playbackRate: shot.playbackRate, muted: true,
        baseTransform: { ...pos, scale: 1, rotation: 0, opacity: 1 }, keyframes,
      });
      overlays.push({ ...overlay, templateCardCorners: corners.map(([u, v]) => [u - x, v - y]) });
      mark(enter, "cyan");
    });
  });
  return 59;
}

export function addMemoryVortex({ main, effect, mark, span }) {
  main(0, 0, MEMORY_VORTEX_INTRO);
  effect("memory-vortex", 0, MEMORY_VORTEX_INTRO, { color: "#e892ac", intensity: 0.82 });
  [0, 5, 10, 19, 31, 40, 46, 54, 62].forEach((frame, index) => mark(frame, index === 0 ? "amber" : "cyan"));
  const boundaries = vortexBeats.map((frame, index) => frame + (index === 0 ? 0 : 2));
  boundaries.push(MEMORY_VORTEX_LENGTH);
  vortexBeats.forEach((beat, index) => {
    const transition = index < vortexBeats.length - 1 ? { id: "fade", duration: span(5) } : null;
    main(index, boundaries[index], boundaries[index + 1], transition ? { transition } : {});
    mark(beat, index % 4 === 0 ? "violet" : "amber");
  });
  return 70;
}
