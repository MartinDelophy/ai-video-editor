const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export function normalizeDriftingHalo(value = {}) {
  value = value || {};
  const current = value.version === 2;
  return {
    version: 2,
    enabled: value.enabled === true,
    size: bounded(current ? value.size : undefined, 100, 50, 180),
    duration: bounded(current ? value.duration : undefined, 4, 1, 20),
    speed: bounded(current ? value.speed : undefined, 30, -180, 180),
    x: bounded(value.x, 50, 0, 100),
    height: bounded(value.height, 50, 0, 100),
    beams: Math.round(bounded(value.beams, 6, 3, 12)),
    softness: bounded(value.softness, 0.7, 0.1, 1),
    glow: bounded(value.glow, 0.55, 0, 1),
    color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#7cecff',
  };
}

const surfaces = new WeakMap();
function makeCanvas(ctx, size) {
  const canvas = ctx.canvas.ownerDocument?.createElement('canvas') ?? new OffscreenCanvas(size, size);
  canvas.width = size; canvas.height = size;
  return canvas;
}
function getSurfaces(ctx, effect) {
  let surface = surfaces.get(ctx);
  if (!surface) {
    surface = { texture: makeCanvas(ctx, 1024), frame: makeCanvas(ctx, 1024) };
    surfaces.set(ctx, surface);
  }
  const key = `${effect.color}:${effect.beams}:${effect.softness}`;
  if (surface.key !== key) {
    const paint = surface.texture.getContext('2d');
    paint.clearRect(0, 0, 1024, 1024);
    const cone = paint.createConicGradient(0, 512, 512);
    const channels = effect.color.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
    const colors = [channels, [channels[2], channels[0], channels[1]], [channels[1], channels[2], channels[0]]];
    for (let i = 0; i < effect.beams; i++) {
      const rgb = colors[i % colors.length].join(',');
      const start = i / effect.beams;
      const span = 1 / effect.beams;
      cone.addColorStop(start, `rgba(${rgb},0)`);
      cone.addColorStop(start + span * 0.22, `rgba(${rgb},${0.45 + effect.softness * 0.4})`);
      cone.addColorStop(start + span * (0.24 + effect.softness * 0.32), `rgba(${rgb},0.2)`);
      cone.addColorStop(start + span * 0.94, `rgba(${rgb},0)`);
    }
    cone.addColorStop(1, `rgba(${channels.join(',')},0)`);
    paint.fillStyle = cone; paint.fillRect(0, 0, 1024, 1024);
    surface.key = key;
  }
  return surface;
}

// Conical light fans, not a travelling ring. Preview/export share clip-local timing.
export function drawDriftingHalo(ctx, width, height, value, time = 0) {
  const effect = normalizeDriftingHalo(value);
  if (!effect.enabled || effect.glow <= 0 || width <= 0 || height <= 0) return;
  const seconds = Math.max(0, Number.isFinite(time) ? time : 0);
  const surface = getSurfaces(ctx, effect);
  const frame = surface.frame.getContext('2d');
  frame.clearRect(0, 0, 1024, 1024);
  frame.globalCompositeOperation = 'source-over';
  frame.drawImage(surface.texture, 0, 0);
  // Smooth outward-moving light envelopes. Their amplitudes vanish at wrap,
  // leaving a quiet continuous light field rather than blinking or hard rings.
  const mask = frame.createRadialGradient(512, 512, 0, 512, 512, 512);
  const phase = (seconds % effect.duration) / effect.duration;
  for (let i = 0; i <= 48; i++) {
    const r = i / 48;
    let pulse = 0;
    for (const offset of [0, 0.5]) {
      const p = (phase + offset) % 1;
      pulse += Math.sin(p * Math.PI) ** 2 * Math.exp(-(((r - p) / 0.28) ** 2));
    }
    const alpha = Math.min(1, (0.24 + 0.75 * pulse) * (1 - r) ** 0.65);
    mask.addColorStop(r, `rgba(255,255,255,${alpha})`);
  }
  frame.globalCompositeOperation = 'destination-in';
  frame.fillStyle = mask; frame.fillRect(0, 0, 1024, 1024);
  frame.globalCompositeOperation = 'source-over';
  const radius = Math.hypot(width, height) * effect.size / 100;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
  ctx.translate(width * effect.x / 100, height * effect.height / 100);
  ctx.rotate(seconds * effect.speed * Math.PI / 180);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha *= effect.glow;
  ctx.drawImage(surface.frame, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}
