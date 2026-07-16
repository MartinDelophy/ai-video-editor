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
let activeRequestId = "";
const canceledRequests = new Set();

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
  const floatView = new Float32Array(1);
  const intView = new Uint32Array(floatView.buffer);
  floatView[0] = value;
  const bits = intView[0];
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

function getInferenceSize(width, height, maxLongEdge) {
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return {
    width: Math.max(8, Math.round(width * scale / 8) * 8),
    height: Math.max(8, Math.round(height * scale / 8) * 8),
  };
}

async function enhanceFrame(requestId, bitmap, maxLongEdge) {
  const size = getInferenceSize(bitmap.width, bitmap.height, maxLongEdge);
  const inputCanvas = new OffscreenCanvas(size.width, size.height);
  const inputContext = inputCanvas.getContext("2d", { willReadFrequently: true });
  inputContext.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const pixels = inputContext.getImageData(0, 0, size.width, size.height).data;
  const planeSize = size.width * size.height;
  const tensorData = new Uint16Array(planeSize * 3);
  for (let index = 0; index < planeSize; index += 1) {
    const pixelIndex = index * 4;
    tensorData[index] = float32ToFloat16(pixels[pixelIndex] / 255);
    tensorData[planeSize + index] = float32ToFloat16(pixels[pixelIndex + 1] / 255);
    tensorData[planeSize * 2 + index] = float32ToFloat16(pixels[pixelIndex + 2] / 255);
  }
  if (canceledRequests.has(requestId)) return null;
  const { session, backend, fallbackReason } = await getSession(requestId);
  postProgress(requestId, 58, backend === "webgpu" ? "remasterPhaseGpuFrame" : "remasterPhaseCpuFrame", { backend, fallbackReason });
  const startedAt = performance.now();
  const outputMap = await session.run({ input: new ort.Tensor("float16", tensorData, [1, 3, size.height, size.width]) });
  const output = outputMap.output.data;
  const readOutput = (index) => readFloat16TensorValue(output, index);
  if (canceledRequests.has(requestId)) return null;
  const enhanced = new Uint8ClampedArray(planeSize * 4);
  for (let index = 0; index < planeSize; index += 1) {
    const pixelIndex = index * 4;
    enhanced[pixelIndex] = Math.round(Math.max(0, Math.min(1, readOutput(index))) * 255);
    enhanced[pixelIndex + 1] = Math.round(Math.max(0, Math.min(1, readOutput(planeSize + index))) * 255);
    enhanced[pixelIndex + 2] = Math.round(Math.max(0, Math.min(1, readOutput(planeSize * 2 + index))) * 255);
    enhanced[pixelIndex + 3] = 255;
  }
  postProgress(requestId, 94, "remasterPhaseGeneratePreview");
  const outputCanvas = new OffscreenCanvas(size.width, size.height);
  outputCanvas.getContext("2d").putImageData(new ImageData(enhanced, size.width, size.height), 0, 0);
  const blob = await outputCanvas.convertToBlob({ type: "image/png" });
  return { blob, width: size.width, height: size.height, inferenceMs: Math.round(performance.now() - startedAt), backend, fallbackReason };
}

self.addEventListener("message", async (event) => {
  const message = event.data ?? {};
  if (message.type === "cancel") { canceledRequests.add(message.requestId); return; }
  if (message.type !== "enhance") return;
  const { requestId, bitmap, maxLongEdge = 960 } = message;
  if (activeRequestId) {
    self.postMessage({ type: "error", requestId, error: "已有增强任务正在运行" });
    bitmap?.close?.(); return;
  }
  activeRequestId = requestId;
  try {
    postProgress(requestId, 2, "remasterPhasePrepareFrame");
    const result = await enhanceFrame(requestId, bitmap, maxLongEdge);
    if (result && !canceledRequests.has(requestId)) self.postMessage({ type: "result", requestId, result });
  } catch (error) {
    if (!canceledRequests.has(requestId)) self.postMessage({ type: "error", requestId, error: error instanceof Error ? error.message : "视频增强失败" });
  } finally {
    canceledRequests.delete(requestId); activeRequestId = "";
  }
});
