const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
export function normalizeBeatShake(value = {}) {
  return { enabled: value.enabled === true, bpm: clamp(value.bpm,40,240,100), intensity: clamp(value.intensity,0,100,25), decay: clamp(value.decay,10,90,55), offset: clamp(value.offset,0,2,0), direction: ['zoom','horizontal','vertical','rotation'].includes(value.direction) ? value.direction : 'zoom' };
}
export function resolveBeatShake(value, time = 0) {
  const effect = normalizeBeatShake(value);
  const identity = { x:0, y:0, rotation:0, scale:1 };
  const elapsed = Math.max(0, Number(time) || 0) - effect.offset;
  if (!effect.enabled || elapsed < 0 || effect.intensity === 0) return identity;
  const beat = elapsed / (60 / effect.bpm);
  const progress = (beat - Math.floor(beat)) / (effect.decay / 100);
  if (progress >= 1) return identity;
  const strength = effect.intensity / 100 * (1 - progress) ** 3;
  const oscillation = Math.cos(progress * Math.PI * 6) * strength;
  return { x: effect.direction === 'horizontal' ? oscillation * 2 : 0, y: effect.direction === 'vertical' ? oscillation * 2 : 0, rotation: effect.direction === 'rotation' ? oscillation * 1.8 : 0, scale: 1 + strength * 0.12 };
}
export function applyBeatShakeTransform(base, value, time) {
  const shake = resolveBeatShake(value,time);
  return { ...base, x:base.x + shake.x, y:base.y + shake.y, rotation:base.rotation + shake.rotation, scale:base.scale * shake.scale };
}
