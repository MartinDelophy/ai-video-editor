import { normalizeRelight, renderRelighting } from "./videoRelighting.js";
export const DEPTH_MODEL_REPOSITORY = "timeline-studio-onnx-models";
export const DEPTH_MODEL_PATH = "depth-anything-v2-small";
export const DEPTH_MODEL_HUGGING_FACE_REVISION = "a0806c6fb9484894dcb78df523156d244461515d";
export const DEPTH_MODEL_MODELSCOPE_REVISION = "4cc757f80330e22cb8f82b628c53ceca6307fd12";

export const DEFAULT_CINEMATIC_DEPTH = Object.freeze({
  enabled: false,
  output: "cinematic",
  inverted: false,
  focus: 0.72,
  focusRange: 0.16,
  blur: 18,
  quality: "balanced",
  highlightBoost: 0.22,
});

const clamp = (value, minimum, maximum, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
};

// Output styling does not affect inference. Include all source-time mapping and
// quality inputs so cached depth never survives a changed trim or speed curve.
export function getDepthAnalysisSignature(segment, quality = "balanced") {
  return JSON.stringify({
    src: segment?.src, type: segment?.type, duration: segment?.duration,
    sourceStart: segment?.sourceStart, sourceDuration: segment?.sourceDuration,
    playbackRate: segment?.playbackRate, speedCurve: segment?.speedCurve,
    quality, samplingVersion: 3, refinement: 2, model: DEPTH_MODEL_HUGGING_FACE_REVISION,
  });
}

export function normalizeCinematicDepth(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_CINEMATIC_DEPTH,
    ...source,
    enabled: source.enabled === true,
    output: ["depth-map", "relight"].includes(source.output) ? source.output : "cinematic",
    relight: normalizeRelight(source.relight),
    inverted: source.inverted === true,
    focus: clamp(source.focus, 0, 1, DEFAULT_CINEMATIC_DEPTH.focus),
    focusRange: clamp(source.focusRange, 0.04, 0.48, DEFAULT_CINEMATIC_DEPTH.focusRange),
    blur: clamp(source.blur, 0, 40, DEFAULT_CINEMATIC_DEPTH.blur),
    quality: ["fast", "balanced", "quality"].includes(source.quality)
      ? source.quality
      : DEFAULT_CINEMATIC_DEPTH.quality,
    highlightBoost: clamp(source.highlightBoost, 0, 0.7, DEFAULT_CINEMATIC_DEPTH.highlightBoost),
  };
}

export function resolveDepthAnalysisAtTime(analysis, time = 0) {
  if (!analysis) return null;
  if (!Array.isArray(analysis.samples) || !analysis.samples.length) return analysis.depthUrl ? analysis : null;
  const target = Math.max(0, Number(time) || 0);
  const samples = analysis.samples;
  const sampleTime = (sample) => Number(sample.sourceTime ?? sample.time) || 0;
  let selected = samples[0];
  let next = selected;
  for (let index = 0; index < samples.length; index += 1) {
    if (sampleTime(samples[index]) > target) {
      next = samples[index];
      break;
    }
    selected = samples[index];
    next = selected;
  }
  const interval = sampleTime(next) - sampleTime(selected);
  const depthMix = interval > 0 ? Math.max(0, Math.min(1, (target - sampleTime(selected)) / interval)) : 0;
  return { ...selected, nextDepthUrl: next.depthUrl, depthMix, sourceSize: analysis.sourceSize, complete: analysis.complete };
}

// Reuse decoded depth images across playback ticks instead of allocating and
// decoding a new Image on every React update. Keep the cache bounded.
const previewDepthImages = new Map();
function loadDepthImage(url) {
  if (!url) return Promise.resolve(null);
  if (previewDepthImages.has(url)) return previewDepthImages.get(url);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { previewDepthImages.delete(url); reject(new Error("Depth image decode failed")); };
    image.src = url;
  });
  previewDepthImages.set(url, promise);
  if (previewDepthImages.size > 16) previewDepthImages.delete(previewDepthImages.keys().next().value);
  return promise;
}
export async function loadPreviewDepthFrame(sample) {
  const [depthVisual, nextDepthVisual] = await Promise.all([
    loadDepthImage(sample?.depthUrl), loadDepthImage(sample?.nextDepthUrl),
  ]);
  return { ...sample, depthVisual, nextDepthVisual };
}

export async function prepareDepthFrame(cache, sample) {
  if (!sample) return;
  await Promise.all([cache?.prepare(sample.depthUrl), sample.nextDepthUrl ? cache?.prepare(sample.nextDepthUrl) : null]);
}
export function getDepthFrame(cache, sample) {
  return sample ? { ...sample, depthVisual: cache?.get(sample.depthUrl) || null,
    nextDepthVisual: cache?.get(sample.nextDepthUrl) || null } : null;
}

const layerCache = new WeakMap();

function getLayers(canvas) {
  let layers = layerCache.get(canvas);
  if (!layers) {
    layers = {
      sharp: document.createElement("canvas"),
      blurred: document.createElement("canvas"),
      mask: document.createElement("canvas"),
      result: document.createElement("canvas"),
    };
    layerCache.set(canvas, layers);
  }
  Object.values(layers).forEach((layer) => {
    if (layer.width !== canvas.width) layer.width = canvas.width;
    if (layer.height !== canvas.height) layer.height = canvas.height;
  });
  return layers;
}

function getFitRect(source, canvas, fitMode = "contain") {
  const sourceWidth = Math.max(1, Number(source?.videoWidth || source?.naturalWidth || source?.width) || 1);
  const sourceHeight = Math.max(1, Number(source?.videoHeight || source?.naturalHeight || source?.height) || 1);
  const scale = fitMode === "cover"
    ? Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
    : Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
}

function paintFitted(context, source, canvas, fitMode, filter = "none", scale = 1) {
  const rect = getFitRect(source, canvas, fitMode);
  context.save();
  context.filter = filter || "none";
  if (scale !== 1) {
    context.translate(canvas.width / 2, canvas.height / 2);
    context.scale(scale, scale);
    context.translate(-canvas.width / 2, -canvas.height / 2);
  }
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  context.restore();
  return rect;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Draws one depth-aware frame. Depth Anything emits relative inverse depth,
 * where brighter pixels are normally nearer to the camera.
 */
export function drawCinematicDepthFrame(context, source, canvas, options = {}) {
  const effect = normalizeCinematicDepth(options.effect);
  const depthVisual = options.depthVisual;
  const fitMode = options.fitMode || "contain";
  const filter = options.filter || "none";
  const shouldClear = options.clear !== false;
  if (effect.enabled && depthVisual && effect.output === "depth-map") {
    if (shouldClear) context.clearRect(0, 0, canvas.width, canvas.height);
    const mix = Math.max(0, Math.min(1, Number(options.depthMix) || 0));
    // Blend on an isolated surface so opacity never leaks to the underlying
    // source image or other timeline layers.
    const layer = getLayers(canvas).result;
    const layerContext = layer.getContext("2d");
    layerContext.clearRect(0, 0, layer.width, layer.height);
    const depthFilter = effect.inverted ? "invert(1)" : "none";
    paintFitted(layerContext, depthVisual, layer, fitMode, depthFilter);
    if (options.nextDepthVisual && mix > 0) {
      layerContext.save();
      layerContext.globalAlpha = mix;
      paintFitted(layerContext, options.nextDepthVisual, layer, fitMode, depthFilter);
      layerContext.restore();
    }
    context.drawImage(layer, 0, 0);
    return;
  }
  if (effect.enabled && depthVisual && effect.output === "relight") {
    const layers = getLayers(canvas);
    const sharp = layers.sharp.getContext("2d");
    sharp.clearRect(0, 0, canvas.width, canvas.height);
    paintFitted(sharp, source, layers.sharp, fitMode, filter);
    const mask = layers.mask.getContext("2d");
    mask.clearRect(0, 0, canvas.width, canvas.height);
    paintFitted(mask, depthVisual, layers.mask, fitMode);
    const next = layers.blurred.getContext("2d");
    next.clearRect(0, 0, canvas.width, canvas.height);
    paintFitted(next, options.nextDepthVisual || depthVisual, layers.blurred, fitMode);
    const lit = renderRelighting(canvas, layers.sharp, layers.mask, layers.blurred, options.depthMix, effect.relight);
    if (shouldClear) context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(lit, 0, 0);
    return;
  }
  if (!effect.enabled || !depthVisual || effect.blur <= 0) {
    if (shouldClear) context.clearRect(0, 0, canvas.width, canvas.height);
    paintFitted(context, source, canvas, fitMode, filter);
    return;
  }

  const layers = getLayers(canvas);
  const sharpContext = layers.sharp.getContext("2d", { willReadFrequently: false });
  const blurContext = layers.blurred.getContext("2d", { willReadFrequently: false });
  const maskContext = layers.mask.getContext("2d", { willReadFrequently: true });
  const resultContext = layers.result.getContext("2d", { willReadFrequently: false });
  [sharpContext, blurContext, maskContext, resultContext].forEach((layerContext) => {
    layerContext.setTransform(1, 0, 0, 1, 0, 0);
    layerContext.clearRect(0, 0, canvas.width, canvas.height);
  });

  paintFitted(sharpContext, source, layers.sharp, fitMode, filter);
  const blurFilter = `${filter && filter !== "none" ? `${filter} ` : ""}blur(${effect.blur}px) brightness(${1 + effect.highlightBoost * 0.08})`;
  paintFitted(blurContext, source, layers.blurred, fitMode, blurFilter, 1 + Math.min(0.08, effect.blur / 500));
  paintFitted(maskContext, depthVisual, layers.mask, fitMode, "none");

  const image = maskContext.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const focus = effect.focus * 255;
  const halfBand = effect.focusRange * 255;
  const feather = Math.max(8, halfBand * 0.72);
  for (let index = 0; index < data.length; index += 4) {
    const depth = data[index];
    const distance = Math.abs(depth - focus);
    const alpha = Math.round(255 * smoothstep(halfBand, halfBand + feather, distance));
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = alpha;
  }
  maskContext.putImageData(image, 0, 0);

  blurContext.save();
  blurContext.globalCompositeOperation = "destination-in";
  blurContext.drawImage(layers.mask, 0, 0);
  blurContext.restore();
  resultContext.drawImage(layers.sharp, 0, 0);
  resultContext.drawImage(layers.blurred, 0, 0);
  if (shouldClear) context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(layers.result, 0, 0);
}
