export const DEFAULT_DETAIL_SETTINGS = Object.freeze({ depth: 30, edges: 25 });

export function normalizeDetailSettings(settings = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_DETAIL_SETTINGS).map(([key, fallback]) => {
    const value = Number(settings[key] ?? fallback);
    return [key, Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback];
  }));
}

// Separable sliding box filter: linear work and bounded memory at native resolution.
function buffer(workspace, key, length) {
  if (workspace[key]?.length !== length) workspace[key] = new Float32Array(length);
  return workspace[key];
}

function blurLuminance(source, width, height, radius, workspace, key) {
  const horizontal = buffer(workspace, "horizontal", source.length);
  const output = buffer(workspace, key, source.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) sum += source[row + Math.max(0, Math.min(width - 1, x))];
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / span;
      sum += source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += horizontal[Math.max(0, Math.min(height - 1, y)) * width + x];
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / span;
      sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x] - horizontal[Math.max(0, y - radius) * width + x];
    }
  }
  return output;
}

export function enhanceDetailPixels(image, settings, workspace = {}) {
  const { depth, edges } = normalizeDetailSettings(settings);
  if (!depth && !edges) return image;
  const { data, width, height } = image;
  const luminance = buffer(workspace, "luminance", width * height);
  for (let i = 0; i < luminance.length; i += 1) {
    const pixel = i * 4;
    luminance[i] = data[pixel] * 0.2126 + data[pixel + 1] * 0.7152 + data[pixel + 2] * 0.0722;
  }
  const fine = edges ? blurLuminance(luminance, width, height, 1, workspace, "fine") : null;
  const broad = depth ? blurLuminance(luminance, width, height, Math.max(2, Math.round(Math.min(width, height) * 0.012)), workspace, "broad") : null;
  for (let i = 0; i < luminance.length; i += 1) {
    const value = luminance[i];
    // Reject sub-level noise; cap corrections to restrain halos around strong edges.
    const high = fine ? value - fine[i] : 0;
    const edgeDetail = Math.sign(high) * Math.max(0, Math.abs(high) - 1.5);
    const localContrast = broad ? 10 * Math.tanh((value - broad[i]) / 20) * depth / 100 : 0;
    const sharpness = 12 * Math.tanh(edgeDetail / 12) * edges / 100;
    const correction = localContrast + sharpness;
    const pixel = i * 4;
    // Scale positive/negative corrections to available RGB headroom, retaining hue.
    const headroom = correction > 0
      ? 255 - Math.max(data[pixel], data[pixel + 1], data[pixel + 2])
      : Math.min(data[pixel], data[pixel + 1], data[pixel + 2]);
    const delta = Math.sign(correction) * Math.min(Math.abs(correction), headroom);
    for (let c = 0; c < 3; c += 1) data[pixel + c] += delta;
  }
  return image;
}
