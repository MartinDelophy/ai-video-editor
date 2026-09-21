const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export function normalizeDriftingHalo(value = {}) {
  value = value || {};
  return {
    enabled: value.enabled === true,
    size: bounded(value.size, 24, 5, 60),
    duration: bounded(value.duration, 6, 1, 20),
    speed: bounded(value.speed, 90, -360, 360),
    height: bounded(value.height, 50, 0, 100),
    tilt: bounded(value.tilt, 45, 0, 75),
    glow: bounded(value.glow, 0.7, 0, 1),
    color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#7cecff',
  };
}

// Shared by preview and export; animation depends only on clip-local time.
export function drawDriftingHalo(ctx, width, height, value, time = 0) {
  const effect = normalizeDriftingHalo(value);
  if (!effect.enabled || width <= 0 || height <= 0) return;
  const seconds = Math.max(0, Number.isFinite(time) ? time : 0);
  const phase = (seconds % effect.duration) / effect.duration;
  const radius = Math.min(width, height) * effect.size / 100;
  const margin = radius * 1.6;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
  ctx.translate(-margin + (width + margin * 2) * phase, height * effect.height / 100 + height * 0.06 * Math.sin(phase * Math.PI * 2));
  ctx.rotate(-0.25);
  ctx.scale(1, Math.cos(effect.tilt * Math.PI / 180));
  ctx.rotate(seconds * effect.speed * Math.PI / 180);
  ctx.strokeStyle = effect.color;
  ctx.shadowColor = effect.color;
  ctx.shadowBlur = radius * 0.18 * effect.glow;
  ctx.lineWidth = Math.max(1, radius * 0.025);
  ctx.globalAlpha *= 0.85;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  // Broken bright arcs and ticks make rotation visible even on a circular ring.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, radius * 0.045);
  for (let i = 0; i < 3; i += 1) {
    const angle = i * Math.PI * 2 / 3;
    ctx.beginPath(); ctx.arc(0, 0, radius, angle, angle + 0.48); ctx.stroke();
  }
  ctx.strokeStyle = effect.color;
  ctx.lineWidth = Math.max(1, radius * 0.014);
  for (let i = 0; i < 24; i += 1) {
    const angle = i * Math.PI / 12;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * radius * 1.08, Math.sin(angle) * radius * 1.08);
    ctx.lineTo(Math.cos(angle) * radius * (i % 3 === 0 ? 1.2 : 1.13), Math.sin(angle) * radius * (i % 3 === 0 ? 1.2 : 1.13));
    ctx.stroke();
  }
  ctx.restore();
}
