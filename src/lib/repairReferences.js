// Bounded bidirectional search beyond the four immediate presentation neighbors.
export function repairReferenceTimes(frames, time, start, duration, excluded = []) {
  const result = [];
  for (const offset of [-0.4, 0.4, -0.9, 0.9, -1.8, 1.8, -3, 3]) {
    // Include the actual first/last source frame when the search reaches an end.
    const wanted = Math.max(start, Math.min(start + duration - 1e-7, start + time + offset));
    let lo = 0, hi = frames.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (frames[mid].timestamp <= wanted + 1e-7) lo = mid + 1; else hi = mid; }
    const actual = frames[lo - 1]?.timestamp - start;
    if (!Number.isFinite(actual) || actual < 0 || Math.abs(actual - time) > 3.000001 || Math.abs(actual - time) < 0.000002
      || [...excluded, ...result].some((value) => Math.abs(value - actual) < 0.000002)) continue;
    result.push(actual);
  }
  return result;
}

export function sameRepairScene(a, b) {
  const histA = new Float32Array(64), histB = new Float32Array(64);
  let spatial = 0;
  for (let i = 0; i < a.length; i += 4) {
    const bin = (p) => (p[i] >> 6) * 16 + (p[i + 1] >> 6) * 4 + (p[i + 2] >> 6);
    histA[bin(a)]++; histB[bin(b)]++;
    spatial += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
  }
  const pixels = a.length / 4;
  const histogram = histA.reduce((sum, value, i) => sum + Math.abs(value - histB[i]), 0) / pixels;
  if (histogram >= 0.8) return false;
  if (spatial / pixels < 36) return true;
  // A small camera/object translation must not itself look like a shot cut.
  // This is only a continuity gate; output still requires full optical-flow checks.
  const width = 48, height = pixels / width;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    let error = 0, count = 0;
    for (let y = 4; y < height - 4; y++) for (let x = 4; x < width - 4; x++) {
      const i = (y * width + x) * 4, j = ((y + dy) * width + x + dx) * 4;
      for (let c = 0; c < 3; c++) error += Math.abs(a[i + c] - b[j + c]);
      count++;
    }
    if (count && error / (count * 3) < 24) return true;
  }
  return false;
}

// Rank only; this coarse translation is NEVER used to produce output pixels.
// Every shortlisted donor still needs bidirectional optical flow and local gates.
export function rankRepairReference(target, reference, size, box, targetMasks, referenceMasks) {
  const inside = (x, y, masks, pad = 1) => masks.some((r) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.width + pad && y < r.y + r.height + pad);
  let best = null;
  for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) {
    let error = 0, count = 0;
    for (let y = 2; y < size - 2; y += 2) for (let x = 2; x < size - 2; x += 2) {
      const rx = x + dx, ry = y + dy;
      if (rx < 0 || ry < 0 || rx >= size || ry >= size || inside(x, y, targetMasks) || inside(rx, ry, referenceMasks)) continue;
      const i = (y * size + x) * 4, j = (ry * size + rx) * 4;
      error += (Math.abs(target[i] - reference[j]) + Math.abs(target[i + 1] - reference[j + 1]) + Math.abs(target[i + 2] - reference[j + 2])) / 3;
      count++;
    }
    if (count < 80 || error / count > 14) continue;
    let visible = 0, area = 0;
    for (let y = Math.ceil(box.y); y < box.y + box.height; y++) for (let x = Math.ceil(box.x); x < box.x + box.width; x++) {
      area++;
      if (x + dx >= 0 && y + dy >= 0 && x + dx < size && y + dy < size && !inside(x + dx, y + dy, referenceMasks)) visible++;
    }
    if (!visible) continue;
    const score = error / count + 8 * (1 - visible / Math.max(1, area));
    if (!best || score < best.score) best = { score, visible: visible / Math.max(1, area) };
  }
  return best;
}
