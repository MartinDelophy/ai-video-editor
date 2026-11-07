import { drawPreviewFrame } from "./media.js";
import { isFaceEffect, drawAttachmentSprite } from "./faceAttachments.js";
import { getFaceAttachmentAsset } from "./faceAttachmentAssets.js";
import { getVisualFitRect } from "./visualGeometry.js";

// Art-directed mounts on the immutable 640×480 built-in portrait sources.
// These match the paired cover photographs; they are never copied into clips
// or used in place of face analysis on the user's media.
const PORTRAIT_MOUNTS = {
  "cat-ears": [
    { root: { x: 266, y: 96 }, across: { x: 46, y: 7 }, up: { x: 4, y: -68 }, mirror: -1 },
    { root: { x: 393, y: 118 }, across: { x: 70, y: 7 }, up: { x: 3, y: -80 }, mirror: 1 },
  ],
  "devil-horns": [
    { root: { x: 232, y: 126 }, across: { x: 44, y: 2 }, up: { x: -9, y: -98 }, mirror: -1 },
    { root: { x: 370, y: 109 }, across: { x: 52, y: 3 }, up: { x: -9, y: -100 }, mirror: 1 },
  ],
};
export function drawEffectCardPreview(canvas, image, clip, { live = false, time = 0 } = {}) {
  const context = canvas.getContext("2d");
  const person = isFaceEffect(clip);
  const sprite = person && live ? getFaceAttachmentAsset(clip.effect, clip.color) : null;
  if (person && live && !sprite) return false;
  drawPreviewFrame(context, image, canvas, {
    fitMode: "cover",
    captionsEnabled: false,
    effectClips: live && !person ? [clip] : [],
    timelineTime: time,
  });
  if (sprite) {
    const fit = getVisualFitRect(
      { width: image.naturalWidth, height: image.naturalHeight },
      canvas,
      "cover",
    );
    context.save();
    context.translate(fit.x, fit.y);
    context.scale(fit.width / 640, fit.height / 480);
    // Material-only shimmer: roots stay fixed while the glass catches light.
    const opacity = 0.94 + 0.06 * Math.cos(time * 1.8);
    for (const mount of PORTRAIT_MOUNTS[clip.effect])
      drawAttachmentSprite(context, sprite, { ...mount, opacity });
    context.restore();
  }
  return true;
}
