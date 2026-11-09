import { polygon } from "./canvasPerspective.js";

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const amount = clamp(value);
  return amount * amount * (3 - 2 * amount);
};

export function drawBeatStrip(context, canvas, source, clip, localTime) {
  const { width, height } = canvas;
  const progress = clamp(localTime / clip.duration);
  const { open = 0.18, close = 0.08, startsFull = true } = clip.strip || {};
  const opened = open > 0 ? smooth(progress / open) : 1;
  const closing = close > 0 ? smooth((1 - progress) / close) : 1;
  const aperture = 0.48;
  const fraction = (startsFull ? 1 - (1 - aperture) * opened : aperture * opened) * closing;
  const stripHeight = height * Math.max(0.015, fraction);
  const y = (height - stripHeight) / 2;
  context.fillStyle = "#030508";
  context.fillRect(0, 0, width, height);
  context.save();
  context.shadowBlur = Math.max(1, height * 0.018);
  context.shadowColor = clip.color;
  context.fillStyle = clip.color;
  context.globalAlpha = clip.intensity * 0.66;
  context.fillRect(0, y, width, stripHeight);
  context.shadowBlur = 0;
  context.globalAlpha = 1;
  context.drawImage(source, 0, y, width, stripHeight, 0, y, width, stripHeight);
  context.globalAlpha = clip.intensity * 0.21;
  context.fillRect(0, y, width, stripHeight);
  context.globalAlpha = clip.intensity * 0.65;
  context.fillRect(0, y, width, height * 0.002);
  context.fillRect(0, y + stripHeight - height * 0.002, width, height * 0.002);
  context.restore();
}

const PALETTE = ["#e98e75", "#efbd6b", "#e595b9", "#a2cfee", "#a8d8a5", "#e8d470"];
const RINGS = [0.96, 0.67, 0.47, 0.334, 0.237, 0.166, 0.113, 0.074, 0.047];
const SECTORS = 12;
const TURN = Math.PI * 2;

export function drawMemoryVortex(context, canvas, source, clip, localTime) {
  const { width, height } = canvas;
  const t = clamp(localTime / clip.duration);
  const centerX = width * (0.5 + 0.024 * Math.sin(t * 4));
  const centerY = height * (0.72 + t * 0.025);
  const growth = 0.53 + 0.77 * smooth(t);
  const backdrop = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, height * 0.88);
  backdrop.addColorStop(0, "#040308");
  backdrop.addColorStop(1, "#240b1c");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);
  const project = (radius, angle) => ({
    x: centerX + Math.cos(angle) * radius * height,
    y: centerY - height * radius * 0.29 + Math.sin(angle) * radius * height * 0.86,
  });
  for (let ring = RINGS.length - 2; ring >= 0; ring--) {
    const outer = RINGS[ring] * growth;
    const inner = RINGS[ring + 1] * growth;
    const z = ring / (RINGS.length - 2);
    const rotation = -Math.PI / 2 + t * 0.54 + ring * 0.09;
    const phase = [0.49, 0.37, 0.15, 0.02, 0.10, 0.025, 0.09, 0.06][ring];
    for (let sector = 0; sector < SECTORS; sector++) {
      const a = rotation + sector * TURN / SECTORS;
      const b = a + TURN / SECTORS;
      const mid = (a + b) / 2;
      const scatter = ((sector * 5 + ring * 2) % SECTORS) / SECTORS;
      const rise = smooth((t + 0.16 - phase - 0.24 * scatter) / 0.26);
      if (rise < 0.012) continue;
      const gap = 0.014 + 0.012 * z;
      const tile = [
        project(outer, a + gap), project(outer, mid), project(outer, b - gap),
        project(inner + 0.003, b - gap), project(inner + 0.003, mid), project(inner + 0.003, a + gap),
      ];
      const left = Math.min(...tile.map((p) => p.x)), right = Math.max(...tile.map((p) => p.x));
      const top = Math.min(...tile.map((p) => p.y)), bottom = Math.max(...tile.map((p) => p.y));
      if (right <= 0 || bottom <= 0 || left >= width || top >= height) continue;
      const color = ring === 3 && t < 0.42
        ? PALETTE[sector % 2]
        : PALETTE[(sector * 5 + ring * 3) % PALETTE.length];
      const light = rise * (0.93 - z * 0.43) * (0.47 + clip.intensity * 0.53);
      context.save();
      polygon(context, tile);
      context.clip();
      context.globalAlpha = light;
      context.fillStyle = color;
      context.fillRect(left, top, right - left, bottom - top);
      // Repeat the actual source in the glass panes with alternating crops.
      context.globalAlpha = light * (0.39 - z * 0.09);
      const cropW = source.width * 0.40;
      const cropH = source.height * 0.40;
      const u = ((sector * 3 + ring) % 6) / 5;
      const v = ((sector * 2 + ring * 3) % 6) / 5;
      context.drawImage(source, (source.width - cropW) * u, (source.height - cropH) * v,
        cropW, cropH, left, top, right - left, bottom - top);
      context.globalAlpha = 0.17 * light;
      context.fillStyle = clip.color;
      context.fillRect(left, top, right - left, bottom - top);
      context.restore();
    }
  }
}
