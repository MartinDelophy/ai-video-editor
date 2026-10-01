import { blendRepairPoisson } from "./repairPoisson.js";
import { repairTextMask, fuseRepairText } from "./repairTextMask.js";
import { blendRepairBoundary, repairColorOffset } from "./repairBlend.js";
import { blendTemporalGuide } from "./repairTemporal.js";
import { getModelSourcePreference } from "./modelSources.js";

let worker = null;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/miganRepair.worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event) => {
    const message = event.data ?? {};
    const request = pending.get(message.requestId);
    if (!request) return;
    if (message.type === "progress") {
      request.onProgress?.(message);
      return;
    }
    pending.delete(message.requestId);
    request.signal?.removeEventListener("abort", request.abort);
    if (message.type === "error") request.reject(new Error(message.message || "AI repair failed"));
    else request.resolve(message);
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "AI repair worker failed");
    pending.forEach((request) => request.reject(error));
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

function makeMask(width, height, selection) {
  const mask = new Uint8Array(width * height);
  const x1 = Math.max(0, Math.floor(selection.x * width + 1e-7));
  const y1 = Math.max(0, Math.floor(selection.y * height + 1e-7));
  const x2 = Math.min(width, Math.ceil((selection.x + selection.width) * width - 1e-7));
  const y2 = Math.min(height, Math.ceil((selection.y + selection.height) * height - 1e-7));
  const padding = Math.max(2, Math.min(6, Math.round(Math.min(x2 - x1, y2 - y1) * 0.03)));
  for (let y = Math.max(0, y1 - padding); y < Math.min(height, y2 + padding); y += 1) {
    mask.fill(255, y * width + Math.max(0, x1 - padding), y * width + Math.min(width, x2 + padding));
  }
  return { mask, padding, rect: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not create repaired frame")),
    "image/png",
  ));
}

export async function repairMiganFrame({ bitmap, selection, signal, onProgress, temporalGuide = null, getTemporalGuide, textHint = null }) {
  if (!bitmap?.width || !bitmap?.height) throw new Error("No frame is available");
  if (!selection || selection.width < 0.005 || selection.height < 0.005) throw new Error("Select a watermark region first");
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { mask, rect, padding } = makeMask(canvas.width, canvas.height, selection);
  const originalPixels = new Uint8ClampedArray(imageData.data);
  const hint = textHint?.width === rect.width && textHint?.height === rect.height ? textHint.data : null;
  const textMask = repairTextMask(originalPixels, canvas.width, rect, hint);
  if (textMask) {
    mask.fill(0);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      if (textMask[y * rect.width + x]) mask[(rect.y + y) * canvas.width + rect.x + x] = 255;
    }
  }
  const originalRegion = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const sourceStart = ((rect.y + y) * canvas.width + rect.x) * 4;
    originalRegion.set(originalPixels.subarray(sourceStart, sourceStart + rect.width * 4), y * rect.width * 4);
  }
  if (textMask && !textMask.some(Boolean)) {
    return { blob: await canvasToBlob(canvas), rect, width: canvas.width, height: canvas.height,
      backend: "", inferenceMs: 0, temporalPixels: 0, maskKind: "text", textMask: textHint };
  }
  // For a confidently isolated text line the untouched original is the nearest
  // reliable context. Reserve expensive far-frame matching for broader holes.
  if (!textMask && getTemporalGuide) temporalGuide = await getTemporalGuide();
  const requestId = `migan-${crypto.randomUUID?.() ?? Date.now()}`;
  const result = await new Promise((resolve, reject) => {
    const activeWorker = getWorker();
    const abort = () => {
      pending.delete(requestId);
      if (worker === activeWorker) {
        activeWorker.terminate();
        worker = null;
      }
      const error = new Error("AI repair canceled");
      error.name = "AbortError";
      reject(error);
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    pending.set(requestId, { resolve, reject, onProgress, signal, abort });
    activeWorker.postMessage({
      type: "inpaint",
      requestId,
      rgbaBuffer: imageData.data.buffer,
      maskBuffer: mask.buffer,
      width: canvas.width,
      height: canvas.height,
      modelSourcePreference: getModelSourcePreference(),
    }, [imageData.data.buffer, mask.buffer]);
  });
  const cropData = new ImageData(new Uint8ClampedArray(result.resultBuffer), result.crop.width, result.crop.height);
  let changedPixels = 0;
  let totalDelta = 0;
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const originalIndex = (y * rect.width + x) * 4;
      const resultIndex = ((rect.y - result.crop.y + y) * result.crop.width + (rect.x - result.crop.x + x)) * 4;
      const delta = Math.abs(originalRegion[originalIndex] - cropData.data[resultIndex])
        + Math.abs(originalRegion[originalIndex + 1] - cropData.data[resultIndex + 1])
        + Math.abs(originalRegion[originalIndex + 2] - cropData.data[resultIndex + 2]);
      totalDelta += delta;
      if (delta > 12) changedPixels += 1;
    }
  }
  const repairedRegion = new Uint8ClampedArray(rect.width * rect.height * 4);
  const colorOffset = repairColorOffset(originalPixels, cropData.data, canvas.width, canvas.height, result.crop, rect, padding);
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const i = (y * rect.width + x) * 4;
    const j = ((rect.y - result.crop.y + y) * result.crop.width + rect.x - result.crop.x + x) * 4;
    for (let c = 0; c < 3; c++) repairedRegion[i + c] = cropData.data[j + c] + colorOffset[c];
    repairedRegion[i + 3] = 255;
  }
  const temporalPixels = blendTemporalGuide(repairedRegion, temporalGuide, rect.width, rect.height);
  if (!textMask) await blendRepairPoisson({ original: originalPixels, repaired: repairedRegion,
    model: cropData.data, modelOffset: colorOffset, crop: result.crop, rect, width: canvas.width, height: canvas.height, signal });
  // Poisson correction is bounded and cannot guarantee a matching perimeter.
  // Always anchor the final edge while leaving the repaired core untouched.
  blendRepairBoundary(originalRegion, repairedRegion, rect, canvas.width, canvas.height);
  if (textMask) await fuseRepairText(originalRegion, repairedRegion, textMask, rect.width, rect.height, signal);
  const outputPixels = originalPixels;
  for (let y = 0; y < rect.height; y += 1) {
    const targetStart = ((rect.y + y) * canvas.width + rect.x) * 4;
    outputPixels.set(repairedRegion.subarray(y * rect.width * 4, (y + 1) * rect.width * 4), targetStart);
  }
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  outputCanvas.getContext("2d").putImageData(new ImageData(outputPixels, canvas.width, canvas.height), 0, 0);
  const composedRegion = repairedRegion;
  let composedChangedPixels = 0;
  for (let index = 0; index < composedRegion.length; index += 4) {
    const delta = Math.abs(originalRegion[index] - composedRegion[index])
      + Math.abs(originalRegion[index + 1] - composedRegion[index + 1])
      + Math.abs(originalRegion[index + 2] - composedRegion[index + 2]);
    if (delta > 12) composedChangedPixels += 1;
  }
  return {
    blob: await canvasToBlob(outputCanvas),
    rect,
    width: canvas.width,
    height: canvas.height,
    backend: result.backend,
    inferenceMs: result.inferenceMs,
    temporalPixels,
    maskKind: textMask ? "text" : "region",
    textMask: textMask ? { data: hint || textMask, width: rect.width, height: rect.height } : null,
    changedRatio: changedPixels / Math.max(1, rect.width * rect.height),
    meanDelta: totalDelta / Math.max(1, rect.width * rect.height * 3),
    composedChangedRatio: composedChangedPixels / Math.max(1, rect.width * rect.height),
  };
}

export async function captureMiganSource({ segment, video }) {
  if (segment?.type === "video") {
    if (!video || video.readyState < 2 || !video.videoWidth) throw new Error("The current video frame is not ready");
    return createImageBitmap(video);
  }
  const response = await fetch(segment?.src);
  if (!response.ok) throw new Error(`Could not read image (HTTP ${response.status})`);
  return createImageBitmap(await response.blob());
}

export function disposeMiganRepairWorker() {
  worker?.terminate();
  worker = null;
  pending.forEach((request) => request.reject(new Error("AI repair worker closed")));
  pending.clear();
}

if (import.meta.hot) import.meta.hot.dispose(disposeMiganRepairWorker);
