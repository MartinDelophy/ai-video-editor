import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

import { REMASTER_DRUNET_MODEL, REMASTER_DRUNET_MODEL_URL } from "../config/models.js";
import { readFloat16TensorValue } from "../lib/float16.js";

const REMASTER_DRUNET_MODEL_LABEL = REMASTER_DRUNET_MODEL.label;

ort.env.wasm.numThreads = self.crossOriginIsolated
  ? Math.max(1, Math.min(4, Number(self.navigator?.hardwareConcurrency) || 1))
  : 1;
ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };
ort.env.webgpu.powerPreference = "high-performance";
ort.env.webgpu.forceFallbackAdapter = false;

let sessionPromise = null;
const canceledRequests = new Set();
let processingChain = Promise.resolve();
let framePool = null;
let residualState = null;
let directRgbaCopySupported = typeof VideoFrame !== "undefined";
const float16Scratch = new Float32Array(1);
const float16Bits = new Uint32Array(float16Scratch.buffer);

function postProgress(requestId, progress, phaseKey, extra = {}) {
  if (!canceledRequests.has(requestId)) {
    self.postMessage({ type: "progress", requestId, progress, phaseKey, ...extra });
  }
}

function describeError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error || "未知错误");
}

async function fetchModel(requestId) {
  const response = await fetch(REMASTER_DRUNET_MODEL_URL);
  if (!response.ok) throw new Error(`Remaster DRUNet 下载失败（HTTP ${response.status}）`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !total) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); received += value.byteLength;
    postProgress(requestId, 8 + Math.round(received / total * 38), "remasterPhaseDownloadModel", { phaseParams: { model: REMASTER_DRUNET_MODEL_LABEL } });
  }
  const result = new Uint8Array(received);
  let offset = 0;
  chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.byteLength; });
  return result.buffer;
}

async function getSession(requestId) {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const model = await fetchModel(requestId);
      postProgress(requestId, 50, "remasterPhaseInitModel");
      const useWebGpu = Boolean(self.navigator?.gpu);
      try {
        if (!useWebGpu) throw new Error("当前环境不支持 WebGPU");
        const session = await ort.InferenceSession.create(model, {
          executionProviders: [{
            name: "webgpu",
            preferredLayout: "NCHW",
            storageBufferCacheMode: "simple",
            uniformBufferCacheMode: "simple",
            validationMode: "wgpuOnly",
          }],
          graphOptimizationLevel: "all",
        });
        postProgress(requestId, 54, "remasterPhaseGpuReady", { backend: "webgpu" });
        return { session, backend: "webgpu" };
      } catch (error) {
        const fallbackReason = describeError(error);
        console.warn(`Remaster WebGPU initialization failed; falling back to WASM. ${fallbackReason}`, error);
        const session = await ort.InferenceSession.create(model, {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        });
        postProgress(requestId, 54, "remasterPhaseCpuFallback", { backend: "wasm", fallbackReason });
        return { session, backend: "wasm", fallbackReason };
      }
    })().catch((error) => { sessionPromise = null; throw error; });
  }
  return sessionPromise;
}

function float32ToFloat16(value) {
  float16Scratch[0] = value;
  const bits = float16Bits[0];
  const sign = (bits >>> 16) & 0x8000;
  const mantissa = bits & 0x7fffff;
  const exponent = (bits >>> 23) & 0xff;
  if (exponent === 0xff) return sign | (mantissa ? 0x7e00 : 0x7c00);
  const halfExponent = exponent - 127 + 15;
  if (halfExponent >= 0x1f) return sign | 0x7c00;
  if (halfExponent <= 0) {
    if (halfExponent < -10) return sign;
    const shifted = (mantissa | 0x800000) >>> (1 - halfExponent);
    return sign | ((shifted + 0x1000) >>> 13);
  }
  return sign | (halfExponent << 10) | ((mantissa + 0x1000) >>> 13);
}

function getFramePool(width, height) {
  if (framePool?.width === width && framePool?.height === height) return framePool;
  const planeSize = width * height;
  const inputCanvas = new OffscreenCanvas(width, height);
  const outputCanvas = new OffscreenCanvas(width, height);
  const enhanced = new Uint8ClampedArray(planeSize * 4);
  framePool = {
    width,
    height,
    planeSize,
    inputCanvas,
    inputContext: inputCanvas.getContext("2d", { willReadFrequently: true }),
    outputCanvas,
    outputContext: outputCanvas.getContext("2d"),
    pixels: new Uint8ClampedArray(planeSize * 4),
    tensorData: new Uint16Array(planeSize * 3),
    enhanced,
    outputImageData: new ImageData(enhanced, width, height),
  };
  framePool.tensor = new ort.Tensor("float16", framePool.tensorData, [1, 3, height, width]);
  residualState = null;
  return framePool;
}

async function copyBitmapToPixels(bitmap, pool) {
  if (directRgbaCopySupported && bitmap.width === pool.width && bitmap.height === pool.height) {
    let frame = null;
    try {
      frame = new VideoFrame(bitmap, { timestamp: 0 });
      await frame.copyTo(pool.pixels, {
        format: "RGBA",
        layout: [{ offset: 0, stride: pool.width * 4 }],
      });
      frame.close();
      bitmap.close();
      return pool.pixels;
    } catch (error) {
      frame?.close();
      directRgbaCopySupported = false;
      console.warn("Direct VideoFrame RGBA copy unavailable; using the pooled canvas path.", error);
    }
  }
  pool.inputContext.clearRect(0, 0, pool.width, pool.height);
  pool.inputContext.drawImage(bitmap, 0, 0, pool.width, pool.height);
  bitmap.close();
  pool.pixels.set(pool.inputContext.getImageData(0, 0, pool.width, pool.height).data);
  return pool.pixels;
}

function getFrameChange(previous, current) {
  if (!previous || previous.length !== current.length) return { score: 1, changedRatio: 1 };
  let difference = 0;
  let changed = 0;
  let samples = 0;
  const stride = 32;
  for (let index = 0; index < current.length; index += stride) {
    const delta = (Math.abs(current[index] - previous[index])
      + Math.abs(current[index + 1] - previous[index + 1])
      + Math.abs(current[index + 2] - previous[index + 2])) / 3;
    difference += delta;
    if (delta > 18) changed += 1;
    samples += 1;
  }
  return {
    score: difference / Math.max(1, samples) / 255,
    changedRatio: changed / Math.max(1, samples),
  };
}

function canReuseResidual({ sequenceId, width, height, pixels, threshold }) {
  if (!sequenceId || residualState?.sequenceId !== sequenceId || residualState.width !== width || residualState.height !== height) return null;
  const change = getFrameChange(residualState.original, pixels);
  return change.score <= threshold && change.changedRatio <= 0.045 ? change : null;
}

function rememberResidual(sequenceId, width, height, pixels, enhanced) {
  if (!sequenceId) return;
  if (residualState?.sequenceId !== sequenceId || residualState.width !== width || residualState.height !== height) {
    residualState = {
      sequenceId,
      width,
      height,
      original: new Uint8ClampedArray(pixels.length),
      enhanced: new Uint8ClampedArray(enhanced.length),
    };
  }
  residualState.original.set(pixels);
  residualState.enhanced.set(enhanced);
}

function getInferenceSize(width, height, maxLongEdge) {
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return {
    width: Math.max(8, Math.round(width * scale / 8) * 8),
    height: Math.max(8, Math.round(height * scale / 8) * 8),
  };
}

async function enhanceFrame(requestId, bitmap, maxLongEdge, strength = 1, options = {}) {
  const size = getInferenceSize(bitmap.width, bitmap.height, maxLongEdge);
  const pool = getFramePool(size.width, size.height);
  const pixels = await copyBitmapToPixels(bitmap, pool);
  const { planeSize, tensorData, enhanced } = pool;
  const reuseThreshold = Math.max(0, Math.min(0.04, Number(options.reuseThreshold) || 0));
  const change = options.allowResidualReuse
    ? canReuseResidual({ sequenceId: options.sequenceId, width: size.width, height: size.height, pixels, threshold: reuseThreshold })
    : null;
  if (canceledRequests.has(requestId)) return null;
  const blend = Math.max(0, Math.min(1, Number(strength) || 0));
  let backend = residualState?.backend || "";
  let fallbackReason = residualState?.fallbackReason || "";
  const startedAt = performance.now();
  if (change) {
    for (let index = 0; index < planeSize; index += 1) {
      const pixelIndex = index * 4;
      enhanced[pixelIndex] = pixels[pixelIndex] + residualState.enhanced[pixelIndex] - residualState.original[pixelIndex];
      enhanced[pixelIndex + 1] = pixels[pixelIndex + 1] + residualState.enhanced[pixelIndex + 1] - residualState.original[pixelIndex + 1];
      enhanced[pixelIndex + 2] = pixels[pixelIndex + 2] + residualState.enhanced[pixelIndex + 2] - residualState.original[pixelIndex + 2];
      enhanced[pixelIndex + 3] = 255;
    }
  } else {
    for (let index = 0; index < planeSize; index += 1) {
      const pixelIndex = index * 4;
      tensorData[index] = float32ToFloat16(pixels[pixelIndex] / 255);
      tensorData[planeSize + index] = float32ToFloat16(pixels[pixelIndex + 1] / 255);
      tensorData[planeSize * 2 + index] = float32ToFloat16(pixels[pixelIndex + 2] / 255);
    }
    const resolved = await getSession(requestId);
    backend = resolved.backend;
    fallbackReason = resolved.fallbackReason;
    postProgress(requestId, 58, backend === "webgpu" ? "remasterPhaseGpuFrame" : "remasterPhaseCpuFrame", { backend, fallbackReason });
    const outputMap = await resolved.session.run({ input: pool.tensor });
    const outputTensor = outputMap.output;
    const output = outputTensor.data;
    const readOutput = (index) => readFloat16TensorValue(output, index);
    if (canceledRequests.has(requestId)) return null;
    for (let index = 0; index < planeSize; index += 1) {
      const pixelIndex = index * 4;
      const red = Math.max(0, Math.min(1, readOutput(index))) * 255;
      const green = Math.max(0, Math.min(1, readOutput(planeSize + index))) * 255;
      const blue = Math.max(0, Math.min(1, readOutput(planeSize * 2 + index))) * 255;
      enhanced[pixelIndex] = Math.round(pixels[pixelIndex] + (red - pixels[pixelIndex]) * blend);
      enhanced[pixelIndex + 1] = Math.round(pixels[pixelIndex + 1] + (green - pixels[pixelIndex + 1]) * blend);
      enhanced[pixelIndex + 2] = Math.round(pixels[pixelIndex + 2] + (blue - pixels[pixelIndex + 2]) * blend);
      enhanced[pixelIndex + 3] = 255;
    }
    outputTensor.dispose?.();
  }
  rememberResidual(options.sequenceId, size.width, size.height, pixels, enhanced);
  if (residualState) { residualState.backend = backend; residualState.fallbackReason = fallbackReason; }
  postProgress(requestId, 94, "remasterPhaseGeneratePreview");
  pool.outputContext.putImageData(pool.outputImageData, 0, 0);
  const common = { width: size.width, height: size.height, inferenceMs: Math.round(performance.now() - startedAt), backend, fallbackReason, reusedResidual: Boolean(change), changeScore: change?.score ?? null };
  if (options.outputType === "bitmap") return { ...common, bitmap: await createImageBitmap(pool.outputCanvas) };
  return { ...common, blob: await pool.outputCanvas.convertToBlob({ type: "image/png" }) };
}

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "cancel") { canceledRequests.add(message.requestId); return; }
  if (message.type !== "enhance") return;
  const { requestId, bitmap, maxLongEdge = 960, strength = 1, outputType = "blob", sequenceId = "", allowResidualReuse = false, reuseThreshold = 0.012 } = message;
  processingChain = processingChain.then(async () => {
    try {
      if (canceledRequests.has(requestId)) { bitmap?.close?.(); return; }
      postProgress(requestId, 2, "remasterPhasePrepareFrame");
      const result = await enhanceFrame(requestId, bitmap, maxLongEdge, strength, { outputType, sequenceId, allowResidualReuse, reuseThreshold });
      if (result && !canceledRequests.has(requestId)) self.postMessage({ type: "result", requestId, result }, result.bitmap ? [result.bitmap] : []);
      else result?.bitmap?.close?.();
    } catch (error) {
      if (!canceledRequests.has(requestId)) self.postMessage({ type: "error", requestId, error: error instanceof Error ? error.message : "视频增强失败" });
    } finally {
      canceledRequests.delete(requestId);
    }
  });
});
