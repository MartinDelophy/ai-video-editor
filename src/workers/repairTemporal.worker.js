/* global cv */
// Reuse the editor's pinned, local OpenCV runtime. No new model download.
importScripts("/vendor/opencv.js");
const ready = new Promise((resolve, reject) => {
  const runtime = cv;
  const done = () => runtime?.calcOpticalFlowFarneback ? resolve() : reject(new Error("Optical flow unavailable"));
  if (runtime?.Mat) done();
  else runtime.onRuntimeInitialized = done;
});
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const inside = (x, y, boxes, pad = 0) => boxes.some((b) => x >= b.x - pad && y >= b.y - pad && x < b.x + b.width + pad && y < b.y + b.height + pad);

async function compare(data) {
  await ready;
  const runtime = cv;
  const { target, reference, width, height, box, targetMasks, referenceMasks } = data;
  const scale = Math.min(1, 256 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const sx = w / width, sy = h / height;
  const canvas = new OffscreenCanvas(w, h);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const mats = [];
  const gray = (bitmap) => {
    context.drawImage(bitmap, 0, 0, w, h);
    const rgba = runtime.matFromImageData(context.getImageData(0, 0, w, h));
    const result = new runtime.Mat(); mats.push(rgba, result);
    runtime.cvtColor(rgba, result, runtime.COLOR_RGBA2GRAY);
    return { gray: result, rgba };
  };
  try {
    const targetFrame = gray(target), referenceFrame = gray(reference);
    const a = targetFrame.gray, b = referenceFrame.gray;
    const forward = new runtime.Mat(), backward = new runtime.Mat(); mats.push(forward, backward);
    runtime.calcOpticalFlowFarneback(a, b, forward, 0.5, 3, 15, 3, 5, 1.2, 0);
    runtime.calcOpticalFlowFarneback(b, a, backward, 0.5, 3, 15, 3, 5, 1.2, 0);
    const points = [], xs = [], ys = [];
    // Only trust surrounding, unmasked texture. Flow inside the watermark is
    // meaningless: it describes the overlaid letters, not the hidden background.
    for (let y = 2; y < h - 2; y += 2) for (let x = 2; x < w - 2; x += 2) {
      if (inside(x / sx, y / sy, targetMasks, 12 / scale)) continue;
      const i = y * w + x, dx = forward.data32F[i * 2], dy = forward.data32F[i * 2 + 1];
      const rx = Math.round(x + dx), ry = Math.round(y + dy);
      if (!Number.isFinite(dx + dy) || Math.hypot(dx, dy) > 32 || rx < 2 || ry < 2 || rx >= w - 2 || ry >= h - 2) continue;
      if (inside(rx / sx, ry / sy, referenceMasks, 12 / scale)) continue;
      const j = ry * w + rx;
      if (Math.hypot(dx + backward.data32F[j * 2], dy + backward.data32F[j * 2 + 1]) > 0.7) continue;
      const texture = Math.abs(a.data[i + 1] - a.data[i - 1]) + Math.abs(a.data[i + w] - a.data[i - w]);
      if (texture < 8) continue;
      points.push({ x, y, dx, dy }); xs.push(dx); ys.push(dy);
    }
    if (points.length < 40) return null;
    const dx = median(xs), dy = median(ys);
    const errors = [], sectors = [0, 0, 0, 0];
    let inliers = 0;
    for (const p of points) {
      if (Math.hypot(p.dx - dx, p.dy - dy) > 0.65) continue;
      const x = Math.round(p.x + dx), y = Math.round(p.y + dy);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const sourceIndex = p.y * w + p.x, referenceIndex = y * w + x;
      const colorError = [0, 1, 2].reduce((sum, channel) => sum + Math.abs(
        targetFrame.rgba.data[sourceIndex * 4 + channel] - referenceFrame.rgba.data[referenceIndex * 4 + channel],
      ), 0) / 3;
      const error = Math.max(colorError, Math.abs(a.data[sourceIndex] - b.data[referenceIndex]));
      errors.push(error);
      if (error > 14) continue;
      inliers++;
      if (p.x / sx < box.x) sectors[0]++;
      if (p.x / sx >= box.x + box.width) sectors[1]++;
      if (p.y / sy < box.y) sectors[2]++;
      if (p.y / sy >= box.y + box.height) sectors[3]++;
    }
    // Conservative rigid-motion gate: reject cuts, occlusion, deformation, and
    // ambiguous flat backgrounds. Never propagate a previous generated result.
    if (inliers / points.length < 0.85 || sectors.filter((count) => count >= 8).length < 3
      || median(errors) > 6 || Math.hypot(dx, dy) < 0.5) return null;
    const full = new OffscreenCanvas(width, height);
    const fullContext = full.getContext("2d", { willReadFrequently: true });
    fullContext.drawImage(reference, 0, 0);
    const pixels = fullContext.getImageData(0, 0, width, height).data;
    const rgba = new Uint8ClampedArray(box.width * box.height * 4);
    const coverage = new Uint8Array(box.width * box.height);
    let count = 0;
    for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
      const rx = box.x + x + dx / sx, ry = box.y + y + dy / sy;
      const ix = Math.floor(rx), iy = Math.floor(ry);
      if (ix < 0 || iy < 0 || ix + 1 >= width || iy + 1 >= height || inside(rx, ry, referenceMasks, 4 / scale)) continue;
      // Do not extrapolate far into a hidden region based on its outer motion.
      if (Math.min(x, y, box.width - 1 - x, box.height - 1 - y) * scale > 12) continue;
      const fx = rx - ix, fy = ry - iy, index = y * box.width + x;
      for (let channel = 0; channel < 3; channel++) {
        const p = (iy * width + ix) * 4 + channel;
        rgba[index * 4 + channel] = pixels[p] * (1 - fx) * (1 - fy) + pixels[p + 4] * fx * (1 - fy)
          + pixels[p + width * 4] * (1 - fx) * fy + pixels[p + width * 4 + 4] * fx * fy;
      }
      rgba[index * 4 + 3] = 255; coverage[index] = 255; count++;
    }
    return count ? { rgba: rgba.buffer, coverage: coverage.buffer, count } : null;
  } finally { mats.forEach((mat) => mat.delete()); }
}
self.onmessage = async ({ data }) => {
  try {
    const result = await compare(data);
    self.postMessage({ result }, result ? [result.rgba, result.coverage] : []);
  } catch (error) { self.postMessage({ error: error.message }); }
  finally { data.target.close(); data.reference.close(); }
};
