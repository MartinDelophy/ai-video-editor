// Use actual presentation neighbors, never an FPS-derived or fixed-time offset.
export function repairNeighborTimes(frames, time, start, duration) {
  let lo = 0, hi = frames.length;
  while (lo < hi) {
    const middle = (lo + hi) >>> 1;
    if (frames[middle].timestamp <= start + time + 1e-7) lo = middle + 1;
    else hi = middle;
  }
  const current = lo - 1;
  if (current < 0) return [];
  const target = frames[current].timestamp;
  return [-2, -1, 1, 2].map((offset) => frames[current + offset]?.timestamp)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= start
      && timestamp < start + duration && Math.abs(timestamp - target) <= 0.2)
    .sort((a, b) => {
      const delta = Math.abs(a - target) - Math.abs(b - target);
      return Math.abs(delta) < 1e-6 ? a - b : delta;
    })
    .map((timestamp) => timestamp - start);
}

export function combineRepairNeighbors(guides, width, height, minimumDonors = 1) {
  const rgba = new Uint8ClampedArray(width * height * 4), coverage = new Uint8Array(width * height);
  for (let i = 0; i < coverage.length; i++) {
    // Guides arrive nearest first and already passed local flow/occlusion tests.
    const candidates = guides.filter((guide) => guide.coverage[i]);
    if (candidates.length < minimumDonors) continue;
    const best = candidates[0];
    if (candidates.some((candidate) => [0, 1, 2].some((c) => Math.abs(candidate.rgba[i * 4 + c] - best.rgba[i * 4 + c]) > 24))) continue;
    // Keep one aligned donor's detail, not a temporal average that ghosts edges.
    rgba.set(best.rgba.subarray(i * 4, i * 4 + 4), i * 4);
    rgba[i * 4 + 3] = 255; coverage[i] = 255;
  }
  return { rgba, coverage, width, height };
}
