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

// Rasterize a small antialiased dot stamp once per luminance and row parity.
// The live frame then only needs a low-resolution readback and a pixel copy.
const INK_TILE = 6;
const INK_LEVELS = 32;
const inkStamps = Array.from({ length: 2 }, (_, parity) =>
  Array.from({ length: INK_LEVELS }, (_, level) => {
    const radius = Math.pow(1 - level / (INK_LEVELS - 1), 1.55) * 0.44;
    const stamp = new Uint8ClampedArray(INK_TILE * INK_TILE);
    if (radius < 0.09) return stamp;
    const cx = 0.30 + parity * 0.38;
    const cos = Math.cos(0.5), sin = Math.sin(0.5);
    for (let y = 0; y < INK_TILE; y++) {
      for (let x = 0; x < INK_TILE; x++) {
        let coverage = 0;
        for (const dy of [0.25, 0.75]) for (const dx of [0.25, 0.75]) {
          const px = (x + dx) / INK_TILE - cx;
          const py = (y + dy) / INK_TILE - 0.5;
          const u = px * cos - py * sin;
          const v = (px * sin + py * cos) / 0.72;
          if (u * u + v * v <= radius * radius) coverage++;
        }
        stamp[y * INK_TILE + x] = coverage * 63.75;
      }
    }
    return stamp;
  }),
);
const printSamples = new WeakMap();
function printInk(ctx, canvas, source, amount) {
  const { width, height } = canvas;
  const step = Math.max(3, Math.min(width, height) / 142);
  const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
  let buffers = printSamples.get(canvas);
  if (!buffers || buffers.sample.width !== cols || buffers.sample.height !== rows) {
    const sample = document.createElement("canvas"), ink = document.createElement("canvas");
    sample.width = cols; sample.height = rows;
    ink.width = cols * INK_TILE; ink.height = rows * INK_TILE;
    const reader = sample.getContext("2d", { willReadFrequently: true });
    const raster = ink.getContext("2d");
    const image = raster.createImageData(ink.width, ink.height);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = 20;
      image.data[i + 1] = 21;
      image.data[i + 2] = 28;
    }
    buffers = { sample, reader, ink, raster, image };
    printSamples.set(canvas, buffers);
  }
  const { reader, ink, raster, image } = buffers;
  ctx.globalAlpha = Math.min(1, amount * 1.45);
  ctx.filter = "grayscale(1) contrast(1.25) brightness(1.08)";
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  reader.clearRect(0, 0, cols, rows);
  reader.drawImage(source, 0, 0, width / step, height / step);
  let pixels;
  try { pixels = reader.getImageData(0, 0, cols, rows).data; }
  catch { return; } // Cross-origin input can still use the monochrome treatment.
  const stride = ink.width * 4;
  for (let y = 0; y < rows; y++) {
    const stamps = inkStamps[y % 2];
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const luma = (54 * pixels[i] + 183 * pixels[i + 1] + 19 * pixels[i + 2]) / 65280;
      const stamp = stamps[Math.min(INK_LEVELS - 1, Math.round(luma * (INK_LEVELS - 1)))];
      const origin = y * INK_TILE * stride + x * INK_TILE * 4 + 3;
      for (let row = 0; row < INK_TILE; row++) {
        const start = origin + row * stride;
        for (let col = 0; col < INK_TILE; col++) {
          image.data[start + col * 4] = stamp[row * INK_TILE + col];
        }
      }
    }
  }
  raster.putImageData(image, 0, 0);
  ctx.globalAlpha = amount * 0.76;
  ctx.drawImage(ink, 0, 0, cols * step, rows * step);
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
