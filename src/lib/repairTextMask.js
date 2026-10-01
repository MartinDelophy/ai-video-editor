import { yieldRepairTask } from "./repairYield.js";

// Use a glyph mask only for several aligned, compact near-white components.
// Ambiguous selections (including ordinary object removal) retain the box mask.
export function repairTextMask(pixels, width, rect, hint = null) {
  const w = rect.width,
    h = rect.height,
    size = w * h;
  if (w < 24 || h < 12) return null;
  const strong = new Uint8Array(size),
    weak = new Uint8Array(size);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((rect.y + y) * width + rect.x + x) * 4;
      const lo = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      const hi = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      const allowed = !hint || hint.length !== size || hint[y * w + x] > 0;
      strong[y * w + x] = allowed && lo >= (hint ? 90 : 220) && hi - lo <= 28 ? 1 : 0;
      weak[y * w + x] = allowed && lo >= (hint ? 60 : 155) && hi - lo <= 45 ? 1 : 0;
    }
  const visited = new Uint8Array(size),
    components = [],
    fragments = [];
  for (let seed = 0; seed < size; seed++) {
    if (!strong[seed] || visited[seed]) continue;
    const queue = [seed];
    visited[seed] = 1;
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0,
      bright = 0;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q],
        x = i % w,
        y = Math.floor(i / w);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      bright += strong[i];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            j = ny * w + nx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || visited[j] || !weak[j]) continue;
          visited[j] = 1;
          queue.push(j);
        }
    }
    const cw = maxX - minX + 1,
      ch = maxY - minY + 1;
    fragments.push({ queue, minX, maxX, minY, maxY, ch });
    if (
      bright >= 6 &&
      cw >= 3 &&
      ch >= h * 0.22 &&
      ch <= h * 0.9 &&
      cw <= ch * 1.8 &&
      queue.length / (cw * ch) < 0.85
    )
      components.push({ queue, minX, maxX, minY, maxY, ch });
  }
  if (hint && components.length < 2) return new Uint8Array(size);
  if (!hint && (components.length < 2 || components.length > 24)) return null;
  const heights = components.map((c) => c.ch).sort((a, b) => a - b),
    median = heights[Math.floor(heights.length / 2)] || h * 0.6;
  const bottoms = components.map((c) => c.maxY).sort((a, b) => a - b),
    baseline = bottoms[Math.floor(bottoms.length / 2)];
  const glyphs = components.filter(
    (c) => c.ch >= median * 0.55 && Math.abs(c.maxY - baseline) <= median * 0.35,
  );
  if (hint && glyphs.length < 2) return new Uint8Array(size);
  // Keep the established stroke silhouette through an opacity fade. Redetecting
  // only its brightest fragments would leave partial letters and flicker.
  if (hint) return hint.slice();
  if (
    !hint &&
    (glyphs.length < 2 ||
      Math.max(...glyphs.map((c) => c.maxX)) - Math.min(...glyphs.map((c) => c.minX)) < w * 0.3)
  )
    return null;
  // Chinese glyphs and dotted letters contain disconnected strokes. Once the
  // text line is established, retain those fragments too, not only tall stems.
  const count = fragments.reduce((sum, c) => sum + c.queue.length, 0);
  if (!hint && (count < size * 0.015 || count > size * 0.42)) return null;
  // Include antialiasing and compression halos, with a soft outer two pixels.
  const radius = Math.max(2, Math.min(5, Math.round(median * 0.07)));
  const alpha = new Uint8Array(size);
  for (const glyph of fragments)
    for (const i of glyph.queue) {
      const x = i % w,
        y = Math.floor(i / w);
      for (let dy = -radius - 2; dy <= radius + 2; dy++)
        for (let dx = -radius - 2; dx <= radius + 2; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const distance = Math.hypot(dx, dy),
            t = Math.max(0, Math.min(1, (radius + 2 - distance) / 2));
          const value = Math.round(255 * t * t * (3 - 2 * t)),
            j = ny * w + nx;
          alpha[j] = Math.max(alpha[j], value);
        }
    }
  return alpha;
}

export function blendRepairText(original, repaired, alpha) {
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i] / 255;
    for (let c = 0; c < 3; c++)
      repaired[i * 4 + c] = original[i * 4 + c] * (1 - a) + repaired[i * 4 + c] * a;
  }
}

// Small glyph holes have nearby real boundary detail. Solve locally against it
// rather than pasting the model's low-frequency brightness into each stroke.
export async function fuseRepairText(original, repaired, alpha, width, height, signal) {
  if (signal?.aborted) throw new DOMException("Repair canceled", "AbortError");
  const values = new Float32Array(original.length);
  for (let i = 0; i < alpha.length; i++)
    for (let c = 0; c < 3; c++)
      values[i * 4 + c] = alpha[i] ? repaired[i * 4 + c] : original[i * 4 + c];
  for (let iteration = 0; iteration < 160; iteration++) {
    let change = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!alpha[i]) continue;
        const neighbors = [];
        if (x) neighbors.push(i - 1);
        if (x + 1 < width) neighbors.push(i + 1);
        if (y) neighbors.push(i - width);
        if (y + 1 < height) neighbors.push(i + width);
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (const j of neighbors) sum += values[j * 4 + c];
          const k = i * 4 + c,
            next = Math.max(
              0,
              Math.min(255, values[k] + 1.6 * (sum / neighbors.length - values[k])),
            );
          change = Math.max(change, Math.abs(next - values[k]));
          values[k] = next;
        }
      }
    if (change < 0.03) break;
    if (iteration % 20 === 19) {
      await yieldRepairTask(signal);
    }
  }
  for (let i = 0; i < alpha.length; i++)
    if (alpha[i]) for (let c = 0; c < 3; c++) repaired[i * 4 + c] = values[i * 4 + c];
  blendRepairText(original, repaired, alpha);
}
