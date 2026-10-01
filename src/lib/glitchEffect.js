const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
export function normalizeGlitch(value = {}) {
  const frequency = clamp(value.frequency, 0.2, 3, 1);
  return { enabled: value.enabled === true, intensity: clamp(value.intensity, 0, 100, 35), separation: clamp(value.separation, 0, 100, 35), frequency, duration: clamp(value.duration, 0.05, Math.min(0.8, 0.8 / frequency), 0.2), scanlines: clamp(value.scanlines, 0, 100, 25) };
}
export function glitchState(value, time = 0) {
  const effect = normalizeGlitch(value);
  const seconds = Math.max(0, Number(time) || 0);
  const phase = seconds * effect.frequency % 1;
  const active = effect.enabled && phase < Math.min(0.8, effect.duration * effect.frequency);
  return { ...effect, active, seed: 1 + Math.floor(seconds * 24) % 10000, direction: Math.floor(seconds * 24) % 2 ? -1 : 1 };
}
const NS = 'http://www.w3.org/2000/svg';
// The preview and canvas exporter use the same SVG filter graph and timeline clock.
export function updateGlitchFilter(id, value, time, width, height) {
  const state = glitchState(value, time);
  if (!state.active || typeof document === 'undefined') return 'none';
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElementNS(NS, 'svg');
    root.id = id;
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden';
    document.body.append(root);
  }
  const shift = state.separation / 100 * width * 0.018 * state.direction;
  const tear = state.intensity / 100 * width * 0.055;
  const scan = state.scanlines / 100 * 0.22;
  root.innerHTML = `<defs><filter id="${id}-filter" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feTurbulence type="turbulence" baseFrequency="0 ${12 / Math.max(1, height)}" numOctaves="1" seed="${state.seed}" result="rawNoise"/>
    <feComponentTransfer in="rawNoise" result="noise"><feFuncR type="discrete" tableValues="0.1 0.8 0.35 0.95 0.2 0.65"/></feComponentTransfer>
    <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 1" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${tear}" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feColorMatrix in="torn" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>
    <feOffset in="red" dx="${shift}" result="redShift"/>
    <feColorMatrix in="torn" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cyan"/>
    <feOffset in="cyan" dx="${-shift}" result="cyanShift"/>
    <feBlend in="redShift" in2="cyanShift" mode="screen" result="rgb"/>
    <feComposite in="noise" in2="rgb" operator="in" result="grain"/>
    <feComposite in="grain" in2="rgb" operator="arithmetic" k1="0" k2="${scan}" k3="${1 - scan}" k4="0"/>
  </filter></defs>`;
  return `url(#${id}-filter)`;
}
const exportLayers = new WeakMap();
let sequence = 0;
export function drawGlitch(context, canvas, value, time) {
  if (!glitchState(value, time).active) return;
  let layer = exportLayers.get(canvas);
  if (!layer) { layer = { canvas: document.createElement('canvas'), id: `glitch-export-${++sequence}` }; exportLayers.set(canvas, layer); }
  layer.canvas.width = canvas.width; layer.canvas.height = canvas.height;
  layer.canvas.getContext('2d').drawImage(canvas, 0, 0);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.filter = updateGlitchFilter(layer.id, value, time, canvas.width, canvas.height);
  context.drawImage(layer.canvas, 0, 0);
  context.restore();
  document.getElementById(layer.id)?.remove();
}
