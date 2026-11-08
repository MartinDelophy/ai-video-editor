import { CARD_ROTATION_ID, CARD_ROTATION_INTRO_SECONDS, CARD_ROTATION_INTRO_URL } from "./cardRotationTemplate.js";
import { extractVideoTrackFrames } from "./media.js";

// Order matches the four surfaces in the card intro renderer.
export const TEMPLATE_CARD_FACES = [["diamond", "♦"], ["club", "♣"], ["heart", "♥"], ["spade", "♠"]];
const DEMO_FACES = ["shake", "glow", "glitch", "halo"].map((name) => ({
  type: "image", src: `/assets/effects/vfx/${name}.webp`, width: 640, height: 480,
}));

export function resolveTemplateCardFaces(template, assets, overrides) {
  if (template.id !== CARD_ROTATION_ID) return [];
  const cuts = template.slots.slice(0, TEMPLATE_CARD_FACES.length).map((slot) => assets[slot]);
  const first = Object.values(assets).find(Boolean);
  if (!first && !Object.values(overrides).some(Boolean)) return [];
  return TEMPLATE_CARD_FACES.map(([key], index) => overrides[key] || cuts[index] || first || DEMO_FACES[index]);
}

export async function prepareTemplateCardIntro(faces, { signal, onProgress } = {}) {
  let blob;
  if (faces.length) {
    const { renderCardFaceIntro } = await import("./cardFaceIntro.js");
    blob = await renderCardFaceIntro(faces, { signal, onProgress });
  } else {
    const response = await fetch(CARD_ROTATION_INTRO_URL, { signal });
    if (!response.ok) throw new Error("Intro unavailable");
    blob = await response.blob();
    if (!blob.size || blob.type === "text/html") throw new Error("Intro unavailable");
  }
  const trackFrames = await extractVideoTrackFrames(blob, {
    duration: CARD_ROTATION_INTRO_SECONDS, width: 768, height: 768, maxFrames: 12, signal,
  }).catch(() => []);
  signal?.throwIfAborted();
  return { blob, trackFrames, personalized: faces.length > 0 };
}
