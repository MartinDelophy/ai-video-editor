import { drawImageTriangle, polygon } from "./canvasPerspective.js";

const HALF_PI = Math.PI / 2;
const STAGE_SIZE = 768;
const CARD_ORBIT = [
  [0, 0], [0.66, 1], [1.13, 2], [1.9, 3], [2.68, 4],
  [3.22, 5], [3.78, 6], [4.5, 7], [6.467, 7 + 0.09 / HALF_PI],
];
const PHOTO = { left: 0.08, top: 0.177, right: 0.92, bottom: 0.823 };
const SUITS = [
  { phase: 3, accent: "#ca6aff" },
  { phase: 2, accent: "#4cf0ad" },
  { phase: 1, accent: "#ff705b" },
  { phase: 0, accent: "#55dcfd" },
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function createShards() {
  let seed = 913421;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // The stage footage spends six random values per background particle.
  for (let index = 0; index < 86 * 6; index += 1) random();
  return Array.from({ length: 70 }, () => ({
    vx: random() * 2 - 1, vy: random() * 2 - 1, spin: random() * 2 - 1, delay: random() * 0.26,
  }));
}
const shards = createShards();

function orbitAt(time) {
  const index = CARD_ORBIT.findIndex(([t], i) => i > 0 && time <= t);
  if (index < 0) return CARD_ORBIT.at(-1)[1] * HALF_PI;
  const [start, from] = CARD_ORBIT[index - 1];
  const [end, to] = CARD_ORBIT[index];
  const fraction = clamp01((time - start) / (end - start));
  return (from + (to - from) * (0.73 * fraction + 0.27 * ease(fraction))) * HALF_PI;
}

function cardSurface(time, phase, push, breakProgress) {
  const angle = orbitAt(time) + phase * HALF_PI;
  const depth = Math.cos(angle), lateral = Math.sin(angle);
  const roll = 0.125 + 0.078 * Math.sin(angle + 0.3);
  const cosine = Math.cos(roll), sine = Math.sin(roll);
  const tilt = 0.14 + 0.04 * lateral;
  const scale = 1 + push * 0.10;
  const zoom = 1.11 + push * 0.40 + breakProgress * 0.12;
  const front = depth > -0.12;
  const point = (u, v) => {
    const localX = (u - 0.5) * 1.30 * scale * (front ? 1 : -1);
    const localY = (0.5 - v) * 1.85 * scale;
    const x = localX * cosine - localY * sine;
    const y = localX * sine + localY * cosine;
    const worldX = lateral * 1.27 + x * depth;
    const worldY = y + 0.07 + 0.045 * Math.sin(time * 3 + angle);
    const worldZ = depth * 1.27 - x * lateral - y * tilt;
    const perspective = 1.48 * zoom / (6.25 - (worldZ * 0.967 + worldY * 0.255));
    return {
      x: STAGE_SIZE * (0.5 + worldX * perspective),
      y: STAGE_SIZE * (0.495 - (worldY * 0.967 - worldZ * 0.255) * perspective),
    };
  };
  const alpha = ease((time - 0.16) / 0.55) * (depth < 0.5 ? 1 - push * 0.85 : 1);
  return { depth, front, point, alpha, breakProgress: depth > 0.65 ? breakProgress : 0 };
}

function quad(point, x0, y0, x1, y1) {
  return [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];
}

function drawTile(context, texture, point, left, top, right, bottom) {
  const uv = (u, v) => ({
    x: (u - PHOTO.left) / (PHOTO.right - PHOTO.left) * texture.width,
    y: (v - PHOTO.top) / (PHOTO.bottom - PHOTO.top) * texture.height,
  });
  const [s0, s1, s2, s3] = quad(uv, left, top, right, bottom);
  const [d0, d1, d2, d3] = quad(point, left, top, right, bottom);
  drawImageTriangle(context, texture, [s0, s1, s2], [d0, d1, d2]);
  drawImageTriangle(context, texture, [s0, s2, s3], [d0, d2, d3]);
}

function eraseCard(context, corners, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.globalCompositeOperation = "destination-out";
  polygon(context, corners);
  context.fill();
  context.restore();
}

function drawSurface(context, texture, { point, front, alpha, breakProgress }) {
  if (alpha <= 0) return;
  if (!breakProgress) {
    eraseCard(context, quad(point, 0, 0, 1, 1), alpha);
    if (!front) return;
    context.save();
    context.globalAlpha = alpha;
    for (let row = 0; row < 5; row += 1) {
      const top = PHOTO.top + (PHOTO.bottom - PHOTO.top) * row / 5;
      const bottom = PHOTO.top + (PHOTO.bottom - PHOTO.top) * (row + 1) / 5;
      for (let col = 0; col < 4; col += 1) {
        const left = PHOTO.left + (PHOTO.right - PHOTO.left) * col / 4;
        const right = PHOTO.left + (PHOTO.right - PHOTO.left) * (col + 1) / 4;
        drawTile(context, texture, point, left, top, right, bottom);
      }
    }
    context.restore();
    return;
  }

  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const x0 = col / 7, x1 = (col + 1) / 7, y0 = row / 10, y1 = (row + 1) / 10;
      const shard = shards[row * 7 + col];
      const split = ease((breakProgress - shard.delay) / (1 - shard.delay));
      const shardAlpha = alpha * (1 - split);
      if (shardAlpha <= 0) continue;
      const a = point(x0, y0), b = point(x1, y1);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const angle = split * 2.3 * shard.spin, cos = Math.cos(angle), sin = Math.sin(angle);
      const shardPoint = (u, v) => {
        const p = point(u, v), x = p.x - cx, y = p.y - cy;
        return {
          x: cx + x * cos - y * sin + shard.vx * split * (110 + row * 15),
          y: cy + x * sin + y * cos + shard.vy * split * 160 - split * 64,
        };
      };
      eraseCard(context, quad(shardPoint, x0, y0, x1, y1), shardAlpha);
      const left = Math.max(x0, PHOTO.left), right = Math.min(x1, PHOTO.right);
      const top = Math.max(y0, PHOTO.top), bottom = Math.min(y1, PHOTO.bottom);
      if (!front || right <= left || bottom <= top) continue;
      context.save();
      context.globalAlpha = shardAlpha;
      drawTile(context, texture, shardPoint, left, top, right, bottom);
      context.restore();
    }
  }
}

export function createCardFaceProjector() {
  const canvas = new OffscreenCanvas(STAGE_SIZE, STAGE_SIZE);
  const context = canvas.getContext("2d");
  const textures = SUITS.map(() => new OffscreenCanvas(360, 400));
  const lastImages = SUITS.map(() => null);
  return (time, images) => {
    context.clearRect(0, 0, STAGE_SIZE, STAGE_SIZE);
    const flashAlpha = 1 - ease((time - 6.32) / 0.147) * 0.96;
    const push = ease((time - 4.20) / 1.15);
    const breakProgress = ease((time - 5.49) / 0.94);
    const cards = SUITS.map((suit, index) => ({ ...cardSurface(time, suit.phase, push, breakProgress), index }))
      .sort((a, b) => a.depth - b.depth);
    for (const card of cards) {
      const { index } = card;
      const texture = textures[index], image = images[index];
      // CanvasSink reuses mutable canvas instances for video frames.
      if (image !== lastImages[index] || !(image instanceof ImageBitmap)) {
        const paint = texture.getContext("2d");
        const w = texture.width, h = texture.height;
        const scale = Math.max(w / image.width, h / image.height);
        paint.clearRect(0, 0, w, h);
        paint.save();
        paint.beginPath();
        paint.roundRect(1, 1, w - 2, h - 2, 15);
        paint.clip();
        paint.fillStyle = "#060b12";
        paint.fillRect(0, 0, w, h);
        paint.drawImage(image, (w - image.width * scale) / 2, (h - image.height * scale) / 2, image.width * scale, image.height * scale);
        const shade = paint.createLinearGradient(0, 0, w, h);
        shade.addColorStop(0, "#020b1940");
        shade.addColorStop(0.54, "#020b1900");
        shade.addColorStop(1, "#020b1960");
        paint.fillStyle = shade;
        paint.fillRect(0, 0, w, h);
        paint.strokeStyle = SUITS[index].accent;
        paint.lineWidth = 5;
        paint.stroke();
        paint.restore();
        lastImages[index] = image;
      }
      drawSurface(context, texture, { ...card, alpha: card.alpha * flashAlpha });
    }
    return canvas;
  };
}
