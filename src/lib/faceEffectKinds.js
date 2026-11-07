export const FACE_EFFECT_IDS = Object.freeze(["cat-ears", "devil-horns", "cat-face"]);
export const isFaceEffect = (clip) => FACE_EFFECT_IDS.includes(clip?.effect);
