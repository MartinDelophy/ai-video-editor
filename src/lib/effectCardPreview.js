import { drawPreviewFrame } from "./media.js";
import {
  isFaceEffect,
  drawAttachmentSprite,
  drawFaceAttachment,
  resolveFaceAttachmentPose,
} from "./faceAttachments.js";
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
// Calibrated once with the face model on the generated 640 × 480 library photo.
const CAT_FACE_COVER = {
  score: 1,
  five: [
    { x: 0.40866077, z: 0.01786962, y: 0.44908404 },
    { x: 0.58145756, z: 0.0017358, y: 0.43169558 },
    { x: 0.49723426, z: -0.06421307, y: 0.56164372 },
    { x: 0.45353124, z: 0.02418709, y: 0.61123765 },
    { x: 0.56653655, z: 0.01465608, y: 0.59768295 },
  ],
  forehead: { x: 0.48055065, z: -0.04197972, y: 0.30461717 },
};
export function drawEffectCardPreview(canvas, image, clip, { live = false, time = 0 } = {}) {
  const context = canvas.getContext("2d");
  const person = isFaceEffect(clip);
  const makeup = clip.effect === "cat-face";
  const sprite = person && !makeup && live ? getFaceAttachmentAsset(clip.effect, clip.color) : null;
  if (person && !makeup && live && !sprite) return false;
  drawPreviewFrame(context, image, canvas, {
    fitMode: "cover",
    captionsEnabled: false,
    effectClips: live && !person ? [clip] : [],
    timelineTime: time,
  });
  if (makeup) {
    const fit = getVisualFitRect(
      { width: image.naturalWidth, height: image.naturalHeight },
      canvas,
      "cover",
    );
    context.save();
    context.translate(fit.x, fit.y);
    context.scale(fit.width / 640, fit.height / 480);
    drawFaceAttachment(context, resolveFaceAttachmentPose(CAT_FACE_COVER, 640, 480), "cat-face", {
      opacity: live ? 0.96 + 0.04 * Math.cos(time * 1.8) : 0.76,
      color: clip.color,
    });
    context.restore();
  }
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
