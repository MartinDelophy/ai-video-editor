export function getExportDimensions(ratio, shortEdge) {
  const sourceShortEdge = Math.min(ratio.width, ratio.height);
  const scale = shortEdge / sourceShortEdge;
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  return { width: even(ratio.width * scale), height: even(ratio.height * scale) };
}

export function getExportBitrate(resolution, quality, frameRate) {
  const base = { 720: 5, 1080: 10, 1440: 18, 2160: 38 }[resolution] || 10;
  const qualityScale = { standard: 0.65, high: 1, ultra: 1.45 }[quality] || 1;
  return Math.round(base * qualityScale * (frameRate / 30) * 1_000_000);
}
