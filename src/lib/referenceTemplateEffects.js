import { drawBeatStrip, drawMemoryVortex } from "./projectedBeatEffects.js";
import { drawImageTriangle } from "./canvasPerspective.js";

export const REFERENCE_FRAME_EFFECTS = ["seven-slat-reveal", "film-orbit", "beat-strip", "memory-vortex"];
export const SEVEN_SLAT_TICKS = [0, 17, 39, 57, 75, 92, 109, 127, 145, 162, 180];
export const SEVEN_SLAT_LENGTH = 184;
const slatOrder = [0, 1, 2, 3, 4, 5, 6, 3, 4, 5, 6];

const clamp = (n) => Math.max(0, Math.min(1, n));
const ease = (n) => {
  const p = clamp(n);
  return p * p * (3 - 2 * p);
};
const tau = Math.PI * 2;

function drawSlats(ctx, frame, source, clip, localTime, scrubbing) {
  const { width: w, height: h } = frame;
  const step = w / 7;
  const sampleCount = scrubbing ? 1 : 3;
  const referenceFrame = localTime / clip.duration * SEVEN_SLAT_LENGTH;
  const perspective = (x) => 0.77 + 0.22 * Math.sin(Math.PI * x / w);
  ctx.fillStyle = "#030609";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) {
    const age = referenceFrame - SEVEN_SLAT_TICKS[i];
    if (age < 0) continue;
    const entrance = ease(age / 8);
    const flash = SEVEN_SLAT_TICKS.reduce((value, tick, j) =>
      slatOrder[j] === i && referenceFrame >= tick ? Math.max(value, 1 - (referenceFrame - tick) / 4.5) : value, 0);
    const x = i * step + step * 0.055;
    const tileWidth = step * 0.94;
    const fold = 0.17 + 0.83 * entrance;
    const dx = x + tileWidth * (1 - fold) * 0.14;
    const visibleWidth = tileWidth * fold;
    const topHeight = perspective(dx);
    const bottomHeight = perspective(dx + visibleWidth);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx, (1 - topHeight) * h / 2);
    ctx.lineTo(dx + visibleWidth, (1 - bottomHeight) * h / 2);
    ctx.lineTo(dx + visibleWidth, (1 + bottomHeight) * h / 2);
    ctx.lineTo(dx, (1 + topHeight) * h / 2);
    ctx.closePath();
    ctx.clip();
    for (let col = 0; col < sampleCount; col++) {
      const left = col / sampleCount, right = (col + 1) / sampleCount;
      const rect = [x + left * tileWidth, x + right * tileWidth];
      const target = [dx + left * visibleWidth, dx + right * visibleWidth];
      const at = (i, y) => ({ x: target[i], y: h * (0.5 + (y - 0.5) * perspective(target[i])) });
      const uv = (i, y) => ({ x: rect[i], y: h * y });
      drawImageTriangle(ctx, source, [uv(0, 0), uv(1, 0), uv(1, 1)], [at(0, 0), at(1, 0), at(1, 1)]);
      drawImageTriangle(ctx, source, [uv(0, 0), uv(1, 1), uv(0, 1)], [at(0, 0), at(1, 1), at(0, 1)]);
    }
    const light = ctx.createLinearGradient(dx, 0, dx + visibleWidth, 0);
    light.addColorStop(0, "rgba(0,6,22,.38)");
    light.addColorStop(0.32, "transparent");
    light.addColorStop(1, "rgba(158,204,255,.14)");
    ctx.fillStyle = light;
    ctx.fillRect(dx, 0, visibleWidth, h);
    if (flash > 0) {
      ctx.fillStyle = clip.color;
      ctx.globalAlpha = flash * clip.intensity;
      ctx.fillRect(dx, 0, visibleWidth, h);
    }
    ctx.restore();
  }
}

function filmStrip(ctx, source, x, y, w, h, angle, { blank = false, flash = 0 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const margin = Math.min(w, h) * 0.028;
  const rail = Math.min(w, h) * 0.105;
  ctx.shadowColor = "#020006";
  ctx.shadowBlur = rail * 0.8;
  ctx.fillStyle = "#151318";
  ctx.fillRect(-w / 2 - margin, -h / 2 - rail, w + 2 * margin, h + 2 * rail);
  ctx.shadowBlur = 0;
  if (!blank) {
    const scale = Math.max(w / source.width, h / source.height);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
  }
  if (blank || flash > 0) {
    ctx.fillStyle = "#fff8ed";
    ctx.globalAlpha = blank ? 0.9 : flash;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = "#918677";
  ctx.lineWidth = Math.max(0.65, margin * 0.2);
  ctx.strokeRect(-w / 2 - margin, -h / 2 - rail, w + 2 * margin, h + 2 * rail);
  ctx.fillStyle = "#fff0cc";
  const count = Math.max(7, Math.round(w / (rail * 1.28)));
  for (let i = 0; i < count; i++) {
    const hole = -w / 2 + (i + 0.23) * w / count;
    ctx.fillRect(hole, -h / 2 - rail * 0.76, w / count * 0.46, rail * 0.48);
    ctx.fillRect(hole, h / 2 + rail * 0.26, w / count * 0.46, rail * 0.48);
  }
  ctx.restore();
}

function drawFilmOrbit(ctx, { width: w, height: h }, source, clip, localTime, scrubbing) {
  const p = clamp(localTime / clip.duration);
  const sequence = clip.orbitIndex || 0;
  const reveal = ease(p / (sequence === 0 ? 0.31 : 0.27));
  const exit = sequence === 5 ? 0 : ease((p - 0.82) / 0.18);
  const side = sequence % 2 ? 1 : -1;
  const dim = Math.min(w, h);
  ctx.fillStyle = "#09030e";
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.69, h * 0.69, 0, w * 0.69, h * 0.69, w * 0.68);
  glow.addColorStop(0, "#421135");
  glow.addColorStop(0.63, "#180a22");
  glow.addColorStop(1, "#07040e");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const lines = scrubbing ? 6 : 13;
  for (let i = 0; i < lines; i++) {
    const v = i / (lines - 1);
    const bend = Math.sin(p * 3.8 + sequence * 0.87) * 0.18 + v * 0.14;
    ctx.beginPath();
    ctx.moveTo(w * (-0.22 + v * 0.13), h * (1.13 - v * 0.55));
    ctx.bezierCurveTo(w * (0.6 - v * 0.4), h * (0.8 + bend), w * (0.61 - bend), h * (0.48 - v * 0.39), w * 1.17, h * (0.32 + v * 0.55));
    ctx.strokeStyle = clip.color;
    ctx.lineWidth = Math.max(1, dim * 0.017);
    ctx.globalAlpha = 0.09 * clip.intensity;
    ctx.stroke();
    ctx.lineWidth *= 0.19;
    ctx.globalAlpha = (0.48 + 0.27 * Math.sin(i * 3 + p * 5)) * clip.intensity;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (!scrubbing) {
    for (let i = 0; i < 17; i++) {
      const x = w * ((i * 0.619 + p * (0.025 + i % 3 * 0.03)) % 1);
      const y = h * ((i * 0.347 + 1 - p * 0.13) % 1);
      ctx.fillStyle = i % 3 ? clip.color : "#f8d1f4";
      ctx.globalAlpha = (0.2 + 0.16 * Math.sin(p * 8 + i)) * clip.intensity;
      ctx.beginPath();
      ctx.arc(x, y, dim * (0.0016 + (i % 4) * 0.001), 0, tau);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 4; i++) {
    const a = p * 1.8 + i * 1.34 + sequence * 0.53;
    const size = dim * (0.07 + i * 0.026);
    ctx.globalAlpha = 0.28 + i * 0.09;
    filmStrip(ctx, source, w * (0.51 + Math.cos(a) * 0.43), h * (0.48 + Math.sin(a * 1.24) * 0.39), size, size * 0.72, a * 0.38, { blank: true });
  }
  ctx.globalAlpha = 1;
  const anchor = [0.30, 0.35, 0.73, 0.70, 0.61, 0.36][sequence] ?? 0.5;
  const x = w * (anchor + side * (1 - reveal) * 0.41 - side * exit * 0.68);
  const y = h * (0.49 + (1 - reveal) * 0.16 - exit * 0.25);
  const rotate = side * (0.16 + (1 - reveal) * 0.68 - exit * 1.45);
  const portrait = [0, 1, 5].includes(sequence);
  const apertureHeight = h * (portrait ? 0.73 : 0.56) * (0.38 + 0.62 * reveal + 0.55 * exit);
  const apertureWidth = apertureHeight * (portrait ? 0.75 : 1.7);
  const sweep = 0.78 * Math.exp(-((p - 0.24) ** 2) / 0.0028);
  const flash = Math.max(1 - p * 16, exit ** 2 * 0.9, sweep);
  filmStrip(ctx, source, x, y, apertureWidth, apertureHeight, rotate, { flash });
}

export function drawReferenceFrameEffect(ctx, canvas, clip, time, copyFrame, scrubbing) {
  if (!(clip.intensity > 0)) return;
  const localTime = Math.max(0, time - clip.start + (clip.sourceOffset || 0));
  const source = copyFrame(canvas);
  if (clip.effect === "seven-slat-reveal") drawSlats(ctx, canvas, source, clip, localTime, scrubbing);
  else if (clip.effect === "film-orbit") drawFilmOrbit(ctx, canvas, source, clip, localTime, scrubbing);
  else if (clip.effect === "beat-strip") drawBeatStrip(ctx, canvas, source, clip, localTime);
  else if (clip.effect === "memory-vortex") drawMemoryVortex(ctx, canvas, source, clip, localTime);
}
