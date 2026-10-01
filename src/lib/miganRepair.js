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
  const x1 = Math.max(0, Math.floor(selection.x * width));
  const y1 = Math.max(0, Math.floor(selection.y * height));
  const x2 = Math.min(width, Math.ceil((selection.x + selection.width) * width));
  const y2 = Math.min(height, Math.ceil((selection.y + selection.height) * height));
  for (let y = y1; y < y2; y += 1) mask.fill(255, y * width + x1, y * width + x2);
  return { mask, rect: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not create repaired frame")),
    "image/png",
  ));
}

export async function repairMiganFrame({ bitmap, selection, signal, onProgress, temporalGuide = null }) {
  if (!bitmap?.width || !bitmap?.height) throw new Error("No frame is available");
  if (!selection || selection.width < 0.005 || selection.height < 0.005) throw new Error("Select a watermark region first");
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { mask, rect } = makeMask(canvas.width, canvas.height, selection);
  const originalPixels = new Uint8ClampedArray(imageData.data);
  const originalRegion = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const sourceStart = ((rect.y + y) * canvas.width + rect.x) * 4;
    originalRegion.set(originalPixels.subarray(sourceStart, sourceStart + rect.width * 4), y * rect.width * 4);
  }
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
  const feather = Math.max(6, Math.min(36, Math.round(Math.min(rect.width, rect.height) * 0.12)));
  for (let y = 0; y < rect.height; y += 1) {
    const sourceStart = ((rect.y - result.crop.y + y) * result.crop.width + (rect.x - result.crop.x)) * 4;
    const targetStart = y * rect.width * 4;
    repairedRegion.set(cropData.data.subarray(sourceStart, sourceStart + rect.width * 4), targetStart);
    for (let x = 0; x < rect.width; x += 1) {
      const edgeDistance = Math.min(
        rect.x > 0 ? x : feather,
        rect.y > 0 ? y : feather,
        rect.x + rect.width < canvas.width ? rect.width - 1 - x : feather,
        rect.y + rect.height < canvas.height ? rect.height - 1 - y : feather,
      );
      const linear = Math.max(0, Math.min(1, edgeDistance / feather));
      const alpha = linear * linear * (3 - 2 * linear);
      const pixelIndex = targetStart + x * 4;
      const originalIndex = (y * rect.width + x) * 4;
      repairedRegion[pixelIndex] = originalRegion[originalIndex] * (1 - alpha) + repairedRegion[pixelIndex] * alpha;
      repairedRegion[pixelIndex + 1] = originalRegion[originalIndex + 1] * (1 - alpha) + repairedRegion[pixelIndex + 1] * alpha;
      repairedRegion[pixelIndex + 2] = originalRegion[originalIndex + 2] * (1 - alpha) + repairedRegion[pixelIndex + 2] * alpha;
      repairedRegion[pixelIndex + 3] = 255;
    }
  }
  const temporalPixels = blendTemporalGuide(repairedRegion, temporalGuide, rect.width, rect.height);
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
