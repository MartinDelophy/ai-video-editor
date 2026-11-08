import { createVisualSegment } from "./timeline.js";
import { getTemplateShotAsset } from "./beatMontage.js";

export const CARD_ROTATION_ID = "card-rotation";
export const CARD_ROTATION_BPM = 112;
export const CARD_ROTATION_SLOTS = ["main", ...Array.from({ length: 9 }, (_, index) => `shot${index + 2}`)];
export const CARD_ROTATION_MEDIA = "/assets/templates/card-rotation";
export const CARD_ROTATION_INTRO_URL = `${CARD_ROTATION_MEDIA}/intro.mp4`;

// Cut points measured on the 30 fps square composition in the reference.
const CUT_FRAMES = [194, 210, 226, 242, 258, 275, 291, 307, 323, 339, 355];
export const CARD_ROTATION_INTRO_SECONDS = CUT_FRAMES[0] / 30;
const INTRO_BEATS = [13, 29, 46, 62, 79, 95, 112, 128, 145, 161, 178];
const PALETTES = [
  ["#f1f2bc", "#e7eb87"], ["#ff9da5", "#a94663"], ["#f9f1e8", "#c8d8db"],
  ["#f8ff77", "#d4ce25"], ["#f2d8f0", "#cb96cc"], ["#a650fc", "#5115ad"],
  ["#f0f6fa", "#d3e9e2"], ["#ffb68c", "#c16c55"], ["#a9f0c2", "#57b599"], ["#81d7e4", "#347d9f"],
];

export const getCardRotationDuration = (bpm) => CUT_FRAMES.at(-1) / 30 * CARD_ROTATION_BPM / bpm;

function createPlaceholder(index, name) {
  const [light, dark] = PALETTES[index];
  const number = index + 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 768" width="768" height="768">
    <defs>
      <linearGradient id="paper" x2="1" y2="1" gradientUnits="objectBoundingBox">
        <stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/>
      </linearGradient>
      <linearGradient id="ink" x2="0" y2="1">
        <stop stop-color="#cf42ff"/><stop offset="1" stop-color="#6117b4"/>
      </linearGradient>
      <pattern id="grain" width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.6" fill="#fff" opacity=".24"/>
      </pattern>
    </defs>
    <path fill="url(#paper)" d="M0 0h768v768H0z"/><path fill="url(#grain)" d="M0 0h768v768H0z"/>
    <g fill="none" stroke="#fff" stroke-width="2" opacity=".57">
      <path d="M55 114V59h55m548 0h55v55M55 654v55h55m548 0h55v-55"/>
      <path d="M55 651h133m392 0h133M55 117h82m494 0h82"/>
      <circle cx="384" cy="384" r="230" opacity=".35"/>
      <circle cx="384" cy="384" r="198" opacity=".27" stroke-dasharray="2 12"/>
    </g>
    <circle cx="70" cy="88" r="5" fill="#ff335d"/>
    <path d="M664 80h43v16h-43zm44 4h5v8h-5z" fill="none" stroke="#fff" stroke-width="2" opacity=".75"/>
    <path d="M667 83h29v10h-29z" fill="#fff" opacity=".7"/>
    <g text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="bold" font-size="226">
      <text x="394" y="479" fill="#280959" opacity=".48">${number}</text>
      <text x="384" y="467" fill="url(#ink)" stroke="#f9edff" stroke-width="5" paint-order="stroke">${number}</text>
    </g>
    <path fill="#fff" opacity=".8" d="M55 675h57v8H55z"/><path fill="#fff" opacity=".44" d="M121 675h34v8h-34z"/>
  </svg>`;
  const src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return { id: `card-rotation-placeholder-${number}`, type: "image", width: 768, height: 768, name, src, thumbnail: src,
    blob: new Blob([svg], { type: "image/svg+xml" }), generatedBy: CARD_ROTATION_ID };
}

export function createCardRotationTemplate({ assets, bpm, start, intro, copy }) {
  const span = (frames) => frames / 30 * CARD_ROTATION_BPM / bpm;
  const introDuration = span(CUT_FRAMES[0]);
  const sourceDuration = CARD_ROTATION_INTRO_SECONDS;
  const introClip = {
    ...createVisualSegment(introDuration, {
      id: intro.personalized ? crypto.randomUUID() : "card-rotation-intro",
      type: "video",
      generatedBy: CARD_ROTATION_ID,
      src: intro.src || CARD_ROTATION_INTRO_URL,
      blob: intro.blob,
      trackFrames: intro.trackFrames,
      trackFrameSampling: "exact-pts-hq-v5-seed",
      trackFrameDuration: sourceDuration,
      thumbnail: intro.trackFrames?.[0]?.src || `${CARD_ROTATION_MEDIA}/cover.webp`,
      name: copy.intro,
      width: 768,
      height: 768,
      sourceDuration,
      playbackRate: bpm / CARD_ROTATION_BPM,
    }),
    fitMode: "contain",
    sourceAudioDisabled: true,
    transition: { id: "flash", duration: span(4) },
  };
  const shots = CARD_ROTATION_SLOTS.map((slot, index) => {
    const duration = span(CUT_FRAMES[index + 1] - CUT_FRAMES[index]);
    const asset = assets[slot] || assets.main || createPlaceholder(index, `${copy.slot} ${String(index + 1).padStart(2, "0")}`);
    const portion = asset === assets.main ? index / (CARD_ROTATION_SLOTS.length - 1) : 0;
    const shot = getTemplateShotAsset(asset, duration, portion);
    const direction = index % 2 ? 1 : -1;
    return {
      ...createVisualSegment(duration, shot),
      fitMode: "cover",
      sourceAudioDisabled: true,
      baseTransform: { scale: 1.025, x: 0, y: 0, rotation: 0, opacity: 1 },
      keyframes: [
        { time: 0, scale: 1.14, y: direction * 3, rotation: direction * 1.6 },
        { time: span(3), scale: 1.018, y: 0, rotation: 0 },
        { time: duration, scale: 1.045 },
      ],
      ...(index < CARD_ROTATION_SLOTS.length - 1 ? { transition: { id: "blur", duration: span(3) } } : {}),
    };
  });
  const marker = (frame, color, title) => ({ id: crypto.randomUUID(), type: "marker", time: start + span(frame), color, title });
  const markers = [
    ...INTRO_BEATS.map((frame, index) => marker(frame, index === 0 ? "violet" : "amber", String(index + 1))),
    ...CUT_FRAMES.slice(0, -1).map((frame, index) => marker(frame, index === 0 ? "rose" : "cyan", `${copy.slot} ${String(index + 1).padStart(2, "0")}`)),
  ];
  return {
    visualSegments: [introClip, ...shots],
    overlays: [],
    effects: [],
    markers,
    duration: getCardRotationDuration(bpm),
    previewTime: start + span(80),
  };
}
