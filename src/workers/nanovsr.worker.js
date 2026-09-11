import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { fetchFirstAvailableModel, mirroredModelFileUrls } from "../lib/modelSources.js";
import { configureAnnaOnnxRuntime } from "../lib/annaWasmRuntime.js";

const MODEL_REVISION = "d551be137b16ecdf12637387f2fb4776565e763f";
const MODEL_PATHS = {
  image: "nanovsr-644k/nanovsr-644k-t1-fp16.onnx",
  video: "nanovsr-644k/nanovsr-644k-t5-fp16.onnx",
};
const MODEL_CACHE = "timeline-studio-nanovsr-v1";
const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 180;
const WINDOW_SIZE = 5;
const SCALE = 4;

ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };
configureAnnaOnnxRuntime(ort.env);
ort.env.webgpu.powerPreference = "high-performance";
ort.env.webgpu.forceFallbackAdapter = false;

const sessionPromises = new Map();
let activeRequestId = "";
const canceled = new Set();

function progress(requestId, value, phaseKey, extra = {}) {
  if (!canceled.has(requestId)) {
    self.postMessage({ type: "progress", requestId, value, phaseKey, ...extra });
  }
}

async function loadModel(requestId, mode, modelSourcePreference) {
  const modelPath = MODEL_PATHS[mode];
  const cacheKey = `/__model-cache__/haixin/timeline-studio-onnx-models/${MODEL_REVISION}/${modelPath}`;
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(cacheKey);
  if (cached) {
    progress(requestId, 0.34, "hdRestorePhaseModelCached");
    return cached.arrayBuffer();
  }
  const { response } = await fetchFirstAvailableModel(mirroredModelFileUrls({
    repository: "timeline-studio-onnx-models",
    revision: MODEL_REVISION,
    path: modelPath,
    preference: modelSourcePreference,
  }));
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !total) {
    const buffer = await response.arrayBuffer();
    await cache.put(cacheKey, new Response(buffer));
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    progress(requestId, 0.05 + (received / total) * 0.3, "hdRestorePhaseDownload");
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  await cache.put(cacheKey, new Response(bytes));
  return bytes.buffer;
}

async function getSession(requestId, mode, modelSourcePreference) {
  if (!self.navigator?.gpu) throw new Error("NanoVSR requires a WebGPU-capable browser");
  if (!sessionPromises.has(mode)) {
    const promise = (async () => {
      const model = await loadModel(requestId, mode, modelSourcePreference);
      progress(requestId, 0.38, "hdRestorePhaseCompile");
      const session = await ort.InferenceSession.create(model, {
        executionProviders: ["webgpu"],
        graphOptimizationLevel: "all",
      });
      return session;
    })().catch((error) => {
      sessionPromises.delete(mode);
      throw error;
    });
    sessionPromises.set(mode, promise);
  }
  return sessionPromises.get(mode);
}

function getContainRect(width, height) {
  const scale = Math.min(INPUT_WIDTH / width, INPUT_HEIGHT / height);
  const drawWidth = Math.max(8, Math.round((width * scale) / 2) * 2);
  const drawHeight = Math.max(8, Math.round((height * scale) / 2) * 2);
  return {
    x: Math.floor((INPUT_WIDTH - drawWidth) / 2),
    y: Math.floor((INPUT_HEIGHT - drawHeight) / 2),
    width: drawWidth,
    height: drawHeight,
  };
}

function fillTensorFrame(tensor, frameIndex, pixels) {
  const planeSize = INPUT_WIDTH * INPUT_HEIGHT;
  const frameOffset = frameIndex * planeSize * 3;
  for (let index = 0; index < planeSize; index += 1) {
    const pixel = index * 4;
    tensor[frameOffset + index] = pixels[pixel] / 255;
    tensor[frameOffset + planeSize + index] = pixels[pixel + 1] / 255;
    tensor[frameOffset + planeSize * 2 + index] = pixels[pixel + 2] / 255;
  }
}

function addProtectedSourceDetail(canvas, bitmap) {
  const width = canvas.width;
  const height = canvas.height;
  const modelContext = canvas.getContext("2d", { willReadFrequently: true });
  const modelImage = modelContext.getImageData(0, 0, width, height);
  const sourceCanvas = new OffscreenCanvas(width, height);
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(bitmap, 0, 0, width, height);
  const source = sourceContext.getImageData(0, 0, width, height).data;
  const target = modelImage.data;
  const row = width * 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * 4;
      const left = x > 0 ? pixel - 4 : pixel;
      const right = x + 1 < width ? pixel + 4 : pixel;
      const up = y > 0 ? pixel - row : pixel;
      const down = y + 1 < height ? pixel + row : pixel;
      for (let channel = 0; channel < 3; channel += 1) {
        const original = source[pixel + channel];
        const blurred = (
          original * 4
          + source[left + channel]
          + source[right + channel]
          + source[up + channel]
          + source[down + channel]
        ) / 8;
        const protectedDetail = (original - blurred) * 0.32;
        target[pixel + channel] = Math.max(0, Math.min(
          255,
          target[pixel + channel] * 0.12 + original * 0.88 + protectedDetail,
        ));
      }
      target[pixel + 3] = 255;
    }
  }
  modelContext.putImageData(modelImage, 0, 0);
}

async function renderOutputFrame(output, frameIndex, rect, sourceBitmap) {
  const outputWidth = INPUT_WIDTH * SCALE;
  const outputHeight = INPUT_HEIGHT * SCALE;
  const planeSize = outputWidth * outputHeight;
  const frameOffset = frameIndex * planeSize * 3;
  const rgba = new Uint8ClampedArray(planeSize * 4);
  for (let index = 0; index < planeSize; index += 1) {
    const pixel = index * 4;
    rgba[pixel] = Math.round(Math.max(0, Math.min(1, output[frameOffset + index])) * 255);
    rgba[pixel + 1] = Math.round(Math.max(0, Math.min(1, output[frameOffset + planeSize + index])) * 255);
    rgba[pixel + 2] = Math.round(Math.max(0, Math.min(1, output[frameOffset + planeSize * 2 + index])) * 255);
    rgba[pixel + 3] = 255;
  }
  const full = new OffscreenCanvas(outputWidth, outputHeight);
  full.getContext("2d").putImageData(new ImageData(rgba, outputWidth, outputHeight), 0, 0);
  const modelWidth = rect.width * SCALE;
  const modelHeight = rect.height * SCALE;
  const protectSourceResolution = sourceBitmap.width * sourceBitmap.height > modelWidth * modelHeight;
  const width = protectSourceResolution ? sourceBitmap.width : modelWidth;
  const height = protectSourceResolution ? sourceBitmap.height : modelHeight;
  const cropped = new OffscreenCanvas(width, height);
  cropped.getContext("2d").drawImage(
    full,
    rect.x * SCALE,
    rect.y * SCALE,
    modelWidth,
    modelHeight,
    0,
    0,
    width,
    height,
  );
  if (protectSourceResolution) addProtectedSourceDetail(cropped, sourceBitmap);
  return { blob: await cropped.convertToBlob({ type: "image/png" }), width, height, protectedSourceResolution: protectSourceResolution };
}

async function enhance(requestId, bitmaps, outputCount, modelSourcePreference) {
  const mode = bitmaps.length === 1 && outputCount === 1 ? "image" : "video";
  const temporalSize = mode === "image" ? 1 : WINDOW_SIZE;
  const first = bitmaps[0];
  const rect = getContainRect(first.width, first.height);
  const tensorData = new Float32Array(temporalSize * 3 * INPUT_WIDTH * INPUT_HEIGHT);
  const canvas = new OffscreenCanvas(INPUT_WIDTH, INPUT_HEIGHT);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  for (let index = 0; index < temporalSize; index += 1) {
    const bitmap = bitmaps[Math.min(index, bitmaps.length - 1)];
    context.fillStyle = "#000";
    context.fillRect(0, 0, INPUT_WIDTH, INPUT_HEIGHT);
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
    fillTensorFrame(tensorData, index, context.getImageData(0, 0, INPUT_WIDTH, INPUT_HEIGHT).data);
  }
  if (canceled.has(requestId)) {
    bitmaps.forEach((bitmap) => bitmap.close?.());
    return null;
  }
  const session = await getSession(requestId, mode, modelSourcePreference);
  progress(requestId, 0.45, "hdRestorePhaseInference", { backend: "webgpu" });
  const startedAt = performance.now();
  const result = await session.run({
    lr: new ort.Tensor("float32", tensorData, [1, temporalSize, 3, INPUT_HEIGHT, INPUT_WIDTH]),
  });
  if (canceled.has(requestId)) {
    result.sr?.dispose?.();
    bitmaps.forEach((bitmap) => bitmap.close?.());
    return null;
  }
  const blobs = [];
  let outputSize = null;
  let protectedSourceResolution = false;
  for (let index = 0; index < outputCount; index += 1) {
    const rendered = await renderOutputFrame(result.sr.data, index, rect, bitmaps[index]);
    blobs.push(rendered.blob);
    outputSize ||= { width: rendered.width, height: rendered.height };
    protectedSourceResolution ||= rendered.protectedSourceResolution;
    bitmaps[index]?.close?.();
    progress(requestId, 0.82 + ((index + 1) / outputCount) * 0.16, "hdRestorePhaseRender", { backend: "webgpu" });
  }
  bitmaps.slice(outputCount).forEach((bitmap) => bitmap.close?.());
  result.sr.dispose?.();
  return {
    blobs,
    width: outputSize?.width || rect.width * SCALE,
    height: outputSize?.height || rect.height * SCALE,
    protectedSourceResolution,
    inferenceMs: Math.round(performance.now() - startedAt),
    backend: "webgpu",
  };
}

self.addEventListener("message", async (event) => {
  const message = event.data ?? {};
  if (message.type === "cancel") {
    canceled.add(message.requestId);
    return;
  }
  if (message.type !== "enhance") return;
  const { requestId, bitmaps = [], outputCount = bitmaps.length, modelSourcePreference } = message;
  if (activeRequestId) {
    bitmaps.forEach((bitmap) => bitmap.close?.());
    self.postMessage({ type: "error", requestId, error: "Another NanoVSR task is already running" });
    return;
  }
  activeRequestId = requestId;
  try {
    progress(requestId, 0.02, "hdRestorePhasePrepare");
    const result = await enhance(
      requestId,
      bitmaps,
      Math.max(1, Math.min(WINDOW_SIZE, outputCount)),
      modelSourcePreference,
    );
    if (result && !canceled.has(requestId)) self.postMessage({ type: "result", requestId, result });
  } catch (error) {
    bitmaps.forEach((bitmap) => bitmap.close?.());
    if (!canceled.has(requestId)) {
      self.postMessage({ type: "error", requestId, error: error instanceof Error ? error.message : String(error) });
    }
  } finally {
    canceled.delete(requestId);
    activeRequestId = "";
  }
});
