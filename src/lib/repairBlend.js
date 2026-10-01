const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] || 0;

// Estimate only a small channel bias on known, low-texture context. Never match
// color against the watermark itself or amplify contrast across a face edge.
export function repairColorOffset(original, repaired, width, height, crop, rect, maskPadding) {
  const channels = [[], [], []];
  const outer = maskPadding + 10;
  for (let y = Math.max(crop.y + 1, rect.y - outer); y < Math.min(crop.y + crop.height - 1, rect.y + rect.height + outer); y += 2) {
    for (let x = Math.max(crop.x + 1, rect.x - outer); x < Math.min(crop.x + crop.width - 1, rect.x + rect.width + outer); x += 2) {
      if (x >= rect.x - maskPadding && x < rect.x + rect.width + maskPadding
        && y >= rect.y - maskPadding && y < rect.y + rect.height + maskPadding) continue;
      if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) continue;
      const i = (y * width + x) * 4, j = ((y - crop.y) * crop.width + x - crop.x) * 4;
      let texture = 0;
      for (let c = 0; c < 3; c++) texture += Math.abs(original[i + 4 + c] - original[i - 4 + c])
        + Math.abs(original[i + width * 4 + c] - original[i - width * 4 + c]);
      if (texture > 48) continue;
      for (let c = 0; c < 3; c++) channels[c].push(original[i + c] - repaired[j + c]);
    }
  }
  return channels.map((values) => values.length < 24 ? 0 : clamp(median(values), -10, 10));
}

export function blendRepairBoundary(original, repaired, rect, width, height) {
  // A large color difference needs a continuous transition, not a thinner one.
  // Keep the perimeter exactly anchored, including corners and very small boxes.
  const feather = Math.min(Math.max(1, (Math.min(rect.width, rect.height) - 1) / 2),
    clamp(Math.min(rect.width, rect.height) * 0.10, 3, 12));
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const i = (y * rect.width + x) * 4;
    const distance = Math.min(rect.x > 0 ? x : feather, rect.y > 0 ? y : feather,
      rect.x + rect.width < width ? rect.width - x - 1 : feather,
      rect.y + rect.height < height ? rect.height - y - 1 : feather);
    if (distance >= feather) continue;
    let texture = 0;
    const left = (y * rect.width + Math.max(0, x - 1)) * 4;
    const right = (y * rect.width + Math.min(rect.width - 1, x + 1)) * 4;
    const above = (Math.max(0, y - 1) * rect.width + x) * 4;
    const below = (Math.min(rect.height - 1, y + 1) * rect.width + x) * 4;
    for (let c = 0; c < 3; c++) {
      texture += Math.abs(original[left + c] - original[right + c]) + Math.abs(original[above + c] - original[below + c]);
    }
    // Detail can shorten the transition modestly, but cannot collapse a skin or
    // clothing seam to one pixel. Do not use color delta as a texture proxy.
    const localFeather = Math.max(Math.min(2, feather), feather / (1 + Math.min(1, texture / 120)));
    const t = clamp(distance / localFeather, 0, 1), alpha = t * t * (3 - 2 * t);
    for (let c = 0; c < 3; c++) repaired[i + c] = original[i + c] * (1 - alpha) + repaired[i + c] * alpha;
  }
}
