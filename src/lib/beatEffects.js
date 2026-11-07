// Timeline seconds are the clock in both preview and export.
export const BEAT_EFFECT_IDS = Object.freeze(["beat-backdrop", "beat-zoom", "ink-print", "shape-flash"]);
export const FLASH_SHAPES = Object.freeze(["circle", "star", "line"]);
export const BEAT_SOURCES = Object.freeze(["tempo", "markers"]);
const clamp = (number, min, max) => Math.min(max, Math.max(min, number));

export function normalizeBeatSettings(value) {
  const bpm = Number(value?.bpm);
  return {
    source: value?.source === "markers" ? "markers" : "tempo",
    bpm: Number.isFinite(bpm) ? clamp(bpm, 30, 300) : 104,
    subdivision: Number(value?.subdivision) === 2 ? 2 : 1,
  };
}

export function resolveBeatAge(clip, time, markers = []) {
  const local = time - clip.start + (clip.sourceOffset || 0);
  if (!clip.beat) return Math.max(0, local) % 1; // Existing shake clips keep their original clock.
  const { source, bpm, subdivision } = clip.beat;
  if (source === "markers") {
    let last = -Infinity;
    for (const marker of markers) {
      if (marker.type === "marker" && Number.isFinite(marker.time) &&
          marker.time >= clip.start - 0.00001 && marker.time <= time + 0.00001) {
        last = Math.max(last, marker.time);
      }
    }
    return Math.max(0, time - last);
  }
  const interval = 60 / bpm / subdivision;
  return Math.max(0, local - Math.floor((local + 0.00001) / interval) * interval);
}

export function isCompositionEffect(clip) {
  return clip.effect === "beat-zoom" || clip.effect === "shape-flash";
}

const printSamples = new WeakMap();
function printInk(ctx, canvas, source, amount) {
  const { width, height } = canvas;
  const step = Math.max(3, Math.min(width, height) / 142);
  const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
  let sample = printSamples.get(canvas);
  if (!sample) {
    sample = document.createElement("canvas");
    printSamples.set(canvas, sample);
  }
  if (sample.width !== cols) sample.width = cols;
  if (sample.height !== rows) sample.height = rows;
  const reader = sample.getContext("2d", { willReadFrequently: true });
  reader.clearRect(0, 0, cols, rows);
  reader.drawImage(source, 0, 0, cols, rows);
  ctx.globalAlpha = Math.min(1, amount * 1.45);
  ctx.filter = "grayscale(1) contrast(1.25) brightness(1.08)";
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  let pixels;
  try { pixels = reader.getImageData(0, 0, cols, rows).data; }
  catch { return; } // Cross-origin input can still use the monochrome treatment.
  ctx.globalAlpha = amount * 0.76;
  ctx.fillStyle = "#14151c";
  ctx.beginPath();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const luma = (0.213 * pixels[i] + 0.715 * pixels[i + 1] + 0.072 * pixels[i + 2]) / 255;
      const radius = Math.pow(1 - luma, 1.55) * step * 0.44;
      if (radius < step * 0.09) continue;
      const cx = (x + 0.30 + (y % 2) * 0.38) * step;
      const cy = (y + 0.50) * step;
      ctx.moveTo(cx + radius, cy);
      ctx.ellipse(cx, cy, radius, radius * 0.72, -0.5, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

function drawFlash(ctx, canvas, clip, time) {
  const { width: w, height: h } = canvas;
  const phase = clamp((time - clip.start) / clip.duration, 0, 1);
  const grow = Math.min(1, phase / (clip.shape === "line" ? 0.76 : 0.57));
  const reach = Math.pow(grow, clip.shape === "line" ? 1.9 : 2.5);
  ctx.fillStyle = clip.color;
  ctx.globalAlpha = clip.intensity * (phase <= 0.79 ? 1 : Math.max(0, (1 - phase) / 0.21));
  const cx = w / 2, cy = h / 2, diagonal = Math.hypot(w, h);
  if (clip.shape === "line") {
    const thickness = Math.min(h, Math.max(1, h * reach));
    ctx.fillRect(0, cy - thickness / 2, w, thickness);
  } else {
    ctx.beginPath();
    if (clip.shape === "star") {
      const radius = Math.max(1, reach * diagonal * 1.64);
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI / 5 - Math.PI / 2;
        const r = radius * (i % 2 ? 0.39 : 1);
        const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, Math.max(1, reach * diagonal * 0.54), 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

export function drawBeatEffect(ctx, canvas, clip, time, markers, copyFrame) {
  const { width: w, height: h } = canvas;
  if (clip.intensity <= 0) return;
  const age = resolveBeatAge(clip, time, markers);
  if (clip.effect === "beat-backdrop") {
    if (age > 0.32) return;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = clip.intensity * Math.exp(-age * 12) * 0.88;
    ctx.fillStyle = clip.color;
    ctx.fillRect(0, 0, w, h);
  } else if (clip.effect === "beat-zoom") {
    if (age > 0.28) return;
    const source = copyFrame(canvas);
    const strength = clip.intensity * Math.exp(-age * 12);
    const scale = 1 + strength * 0.30;
    const shiftX = w * strength * 0.032, shiftY = h * strength * 0.019;
    ctx.drawImage(source, (w - w * scale) / 2 + shiftX, (h - h * scale) / 2 - shiftY, w * scale, h * scale);
    // Two bounded directional samples soften the first few frames without exposing edges.
    ctx.globalAlpha = strength * 0.19;
    ctx.drawImage(source, (w - w * scale) / 2 - shiftX, (h - h * scale) / 2 + shiftY, w * scale, h * scale);
  } else if (clip.effect === "ink-print") {
    printInk(ctx, canvas, copyFrame(canvas), clip.intensity);
  } else if (clip.effect === "shape-flash") {
    drawFlash(ctx, canvas, clip, time);
  }
}
