import { yieldRepairTask } from "./repairYield.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Solve a screened, edge-weighted Poisson correction on a bounded grid. Apply
// ONLY to the collar: interior model/temporal pixels remain byte-for-byte intact.
export async function blendRepairPoisson({ original, repaired, model, crop, rect, width, height, signal, modelOffset = [0, 0, 0] }) {
  if (rect.width < 3 || rect.height < 3) return false;
  const scale = Math.min(1, 96 / Math.max(rect.width, rect.height));
  const w = Math.max(3, Math.round(rect.width * scale)) + 2, h = Math.max(3, Math.round(rect.height * scale)) + 2;
  const guide = new Float32Array(w * h * 3), correction = new Float32Array(w * h * 3);
  const sample = (pixels, stride, x, y, c) => pixels[(y * stride + x) * 4 + c] + (pixels === model ? modelOffset[c] : 0);
  const check = () => { if (signal?.aborted) throw new DOMException("Repair canceled", "AbortError"); };
  check();
  let anchors = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const rx = clamp(Math.round((x - 1) * (rect.width - 1) / (w - 3)), 0, rect.width - 1);
    const ry = clamp(Math.round((y - 1) * (rect.height - 1) / (h - 3)), 0, rect.height - 1);
    const outside = !x || !y || x === w - 1 || y === h - 1;
    const sx = rect.x + (!x ? -1 : x === w - 1 ? rect.width : rx);
    const sy = rect.y + (!y ? -1 : y === h - 1 ? rect.height : ry);
    const valid = (px, py) => px >= 0 && py >= 0 && px < width && py < height
      && px >= crop.x && py >= crop.y && px < crop.x + crop.width && py < crop.y + crop.height;
    for (let c = 0; c < 3; c++) guide[i * 3 + c] = outside && valid(sx, sy)
      ? sample(model, crop.width, sx - crop.x, sy - crop.y, c) : sample(repaired, rect.width, rx, ry, c);
    if (!outside || !valid(sx, sy)) continue;
    // Only known exterior pixels constrain the solve, never source lettering in
    // the mask. Robust local samples reduce contamination by crossing text/edges.
    const differences = [[], [], []];
    for (let offset = -2; offset <= 2; offset++) {
      const px = sx + ((!y || y === h - 1) ? offset : 0), py = sy + ((!x || x === w - 1) ? offset : 0);
      if (!valid(px, py) || (px >= rect.x && py >= rect.y && px < rect.x + rect.width && py < rect.y + rect.height)) continue;
      let change = 0;
      for (let c = 0; c < 3; c++) change += Math.abs(sample(model, crop.width, px - crop.x, py - crop.y, c) - guide[i * 3 + c]);
      if (change > 45) continue;
      for (let c = 0; c < 3; c++) differences[c].push(sample(original, width, px, py, c) - sample(model, crop.width, px - crop.x, py - crop.y, c));
    }
    if (differences[0].length < 3) continue;
    for (let c = 0; c < 3; c++) {
      const values = differences[c].sort((a, b) => a - b);
      correction[i * 3 + c] = clamp(values[Math.floor(values.length / 2)], -24, 24);
    }
    anchors++;
  }
  if (!anchors) return false;
  const right = new Float32Array(w * h), down = new Float32Array(w * h);
  const weight = (i, j) => {
    let delta = 0;
    for (let c = 0; c < 3; c++) delta += (guide[i * 3 + c] - guide[j * 3 + c]) ** 2;
    return Math.exp(-delta / (3 * 24 * 24));
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x + 1 < w) right[i] = weight(i, i + 1);
    if (y + 1 < h) down[i] = weight(i, i + w);
  }
  for (let iteration = 0; iteration < 120; iteration++) {
    let maximumChange = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, wl = right[i - 1], wr = right[i], wt = down[i - w], wb = down[i];
      for (let c = 0; c < 3; c++) {
        const j = i * 3 + c;
        const value = (wl * correction[j - 3] + wr * correction[j + 3] + wt * correction[j - w * 3] + wb * correction[j + w * 3]) / (wl + wr + wt + wb + 0.008);
        const next = clamp(correction[j] + 1.5 * (value - correction[j]), -24, 24);
        maximumChange = Math.max(maximumChange, Math.abs(next - correction[j])); correction[j] = next;
      }
    }
    if (maximumChange < 0.015) break;
    if (iteration % 12 === 11) { await yieldRepairTask(signal); check(); }
  }
  check();
  const band = Math.min(Math.max(1, (Math.min(rect.width, rect.height) - 1) / 2), clamp(Math.min(rect.width, rect.height) * 0.10, 3, 12));
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const distance = Math.min(rect.x > 0 ? x : band, rect.y > 0 ? y : band,
      rect.x + rect.width < width ? rect.width - x - 1 : band, rect.y + rect.height < height ? rect.height - y - 1 : band);
    if (distance >= band) continue;
    const t = clamp(distance / band, 0, 1), strength = 1 - t * t * (3 - 2 * t);
    const gx = 1 + x * (w - 3) / (rect.width - 1), gy = 1 + y * (h - 3) / (rect.height - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, i = (y * rect.width + x) * 4;
    const nodes = [y0 * w + x0, y0 * w + x0 + 1, (y0 + 1) * w + x0, (y0 + 1) * w + x0 + 1];
    const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    let total = 0;
    for (let k = 0; k < 4; k++) {
      let delta = 0;
      for (let c = 0; c < 3; c++) delta += (guide[nodes[k] * 3 + c] - repaired[i + c]) ** 2;
      weights[k] *= Math.exp(-delta / (3 * 24 * 24)); total += weights[k];
    }
    if (total < 1e-8) continue;
    for (let c = 0; c < 3; c++) {
      let value = 0;
      for (let k = 0; k < 4; k++) value += correction[nodes[k] * 3 + c] * weights[k];
      repaired[i + c] += strength * value / total;
    }
  }
  return true;
}
