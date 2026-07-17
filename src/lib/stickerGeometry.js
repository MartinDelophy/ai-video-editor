export const STICKER_FRAME_RATIO = 0.22;

export function getStickerBaseSize(frame) {
  return Math.max(1, Math.min(frame.width, frame.height) * STICKER_FRAME_RATIO);
}

export function getStickerRenderGeometry(sticker, image, frame) {
  const imageWidth = image?.naturalWidth || image?.videoWidth || image?.width || 1;
  const imageHeight = image?.naturalHeight || image?.videoHeight || image?.height || 1;
  const ratio = imageWidth / imageHeight;
  const scale = Math.max(0.2, Math.min(3, Number(sticker?.scale) || 1));
  const boxSize = getStickerBaseSize(frame) * scale;
  return {
    width: ratio >= 1 ? boxSize : boxSize * ratio,
    height: ratio >= 1 ? boxSize / ratio : boxSize,
    centerX: (Number.isFinite(sticker?.x) ? sticker.x : 82) / 100 * frame.width,
    centerY: (Number.isFinite(sticker?.y) ? sticker.y : 20) / 100 * frame.height,
    rotation: Number(sticker?.rotation) || 0,
    opacity: Math.max(0, Math.min(1, Number.isFinite(sticker?.opacity) ? sticker.opacity : 1)),
  };
}
