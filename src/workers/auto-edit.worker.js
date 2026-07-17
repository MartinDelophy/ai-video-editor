let previousPixels = null;
let previousSegmentId = "";

function luminance(pixels, width, x, y) {
  const index = (y * width + x) * 4;
  return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
}

function opticalFlowDifference(current, previous, width, height) {
  if (!previous) return { difference: 1, motion: 0, sceneChange: 1, quality: frameQuality(current, width, height) };
  const block = 8;
  const search = 4;
  let motion = 0;
  let residual = 0;
  let samples = 0;
  for (let y = search; y < height - block - search; y += block) {
    for (let x = search; x < width - block - search; x += block) {
      let bestError = Infinity;
      let bestDistance = 0;
      let texture = 0;
      const center = luminance(current, width, x + block / 2, y + block / 2);
      for (let by = 0; by < block; by += 2) for (let bx = 0; bx < block; bx += 2) texture += Math.abs(luminance(current, width, x + bx, y + by) - center);
      for (let dy = -search; dy <= search; dy += 2) {
        for (let dx = -search; dx <= search; dx += 2) {
          let error = 0;
          for (let by = 0; by < block; by += 2) {
            for (let bx = 0; bx < block; bx += 2) {
              error += Math.abs(luminance(current, width, x + bx, y + by) - luminance(previous, width, x + bx + dx, y + by + dy));
            }
          }
          // Prefer zero displacement when several matches are effectively equal.
          const distance = Math.hypot(dx, dy);
          if (error + distance * 1.5 < bestError) { bestError = error + distance * 1.5; bestDistance = distance; }
        }
      }
      motion += texture > 180 ? bestDistance / Math.hypot(search, search) : 0;
      residual += bestError / ((block / 2) ** 2 * 255);
      samples += 1;
    }
  }
  const motionScore = samples ? Math.min(1, motion / samples) : 0;
  const residualScore = samples ? Math.min(1, residual / samples) : 1;
  const sceneChange = histogramDistance(current, previous, width, height);
  const quality = frameQuality(current, width, height);
  return { difference: Math.min(1, sceneChange * 0.62 + residualScore * 0.25 + motionScore * 0.13), motion: motionScore, sceneChange, quality };
}

function histogramDistance(current, previous, width, height) {
  const a = new Uint32Array(32);
  const b = new Uint32Array(32);
  for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
    const index = (y * width + x) * 4;
    const currentLuma = current[index] * .299 + current[index + 1] * .587 + current[index + 2] * .114;
    const previousLuma = previous[index] * .299 + previous[index + 1] * .587 + previous[index + 2] * .114;
    // Ignore letterbox pixels so aspect-ratio padding cannot become a scene signal.
    if (currentLuma > 5) a[Math.min(31, currentLuma >> 3)] += 1;
    if (previousLuma > 5) b[Math.min(31, previousLuma >> 3)] += 1;
  }
  const totalA = a.reduce((sum, value) => sum + value, 0) || 1;
  const totalB = b.reduce((sum, value) => sum + value, 0) || 1;
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) distance += Math.abs(a[index] / totalA - b[index] / totalB);
  return Math.min(1, distance / 2);
}

function frameQuality(pixels, width, height) {
  let visible = 0;
  let contrast = 0;
  let count = 0;
  for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
    const value = luminance(pixels, width, x, y);
    if (value > 8) visible += 1;
    if (x + 4 < width) contrast += Math.abs(value - luminance(pixels, width, x + 4, y));
    count += 1;
  }
  const coverage = visible / Math.max(1, count);
  return Math.min(1, coverage * .75 + Math.min(1, contrast / Math.max(1, count) / 24) * .25);
}

self.onmessage = (event) => {
  const { type, id, pixels, width, height, segmentId } = event.data || {};
  if (type === "reset") {
    previousPixels = null;
    previousSegmentId = "";
    return;
  }
  if (type !== "analyze") return;
  const current = new Uint8ClampedArray(pixels);
  const previous = segmentId === previousSegmentId ? previousPixels : null;
  const metrics = opticalFlowDifference(current, previous, width, height);
  previousPixels = current;
  previousSegmentId = segmentId;
  self.postMessage({ id, ...metrics });
};
