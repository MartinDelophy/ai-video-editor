import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { configureAnnaOnnxRuntime } from "../lib/annaWasmRuntime.js";
import {
  FACE_SWAP_MODELS,
  getFaceSwapModelUrls,
} from "../config/faceSwap.js";

ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };
configureAnnaOnnxRuntime(ort.env);
ort.env.webgpu.powerPreference = "high-performance";
ort.env.webgpu.forceFallbackAdapter = false;
ort.env.logLevel = "error";

let runtimePromise = null;
let conditionedWeights = null;
let sourceKey = "";
let activeRequestId = "";
const canceled = new Set();

function postProgress(requestId, progress, phaseKey, extra = {}) {
  if (!canceled.has(requestId)) {
    self.postMessage({ type: "progress", requestId, progress, phaseKey, ...extra });
  }
}

function abortError() {
  const error = new Error("FACE_SWAP_ABORTED");
  error.name = "AbortError";
  return error;
}

function throwIfCanceled(requestId) {
  if (canceled.has(requestId) || (activeRequestId && activeRequestId !== requestId)) throw abortError();
}

async function fetchModel(requestId, kind, progressStart, progressEnd) {
  const model = FACE_SWAP_MODELS[kind];
  const failures = [];
  for (const url of getFaceSwapModelUrls(kind)) {
    throwIfCanceled(requestId);
    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const total = Number(response.headers.get("content-length")) || model.bytes;
      const reader = response.body?.getReader();
      if (!reader) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== model.bytes) throw new Error(`SIZE_MISMATCH:${buffer.byteLength}:${model.bytes}`);
        return buffer;
      }
      const chunks = [];
      let received = 0;
      while (true) {
        throwIfCanceled(requestId);
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        postProgress(
          requestId,
          progressStart + (received / Math.max(1, total)) * (progressEnd - progressStart),
          "faceSwapModelDownload",
          { model: kind, received, total },
        );
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (bytes.byteLength !== model.bytes) throw new Error(`SIZE_MISMATCH:${bytes.byteLength}:${model.bytes}`);
      return bytes.buffer;
    } catch (error) {
      failures.push(`${new URL(url).hostname}: ${error?.message || String(error)}`);
    }
  }
  throw new Error(`FACE_SWAP_MODEL_UNAVAILABLE:${kind}:${failures.join("; ")}`);
}

async function createRuntime(requestId) {
  if (!self.navigator?.gpu) throw new Error("FACE_SWAP_WEBGPU_REQUIRED");
  const [identityModel, conditionerModel, generatorModel, detectorModel] = await Promise.all([
    fetchModel(requestId, "identity", 2, 45),
    fetchModel(requestId, "conditioner", 2, 28),
    fetchModel(requestId, "generator", 2, 8),
    fetchModel(requestId, "scrfd", 2, 12),
  ]);
  throwIfCanceled(requestId);
  const options = {
    executionProviders: ["webgpu"],
    graphOptimizationLevel: "all",
  };
  postProgress(requestId, 35, "faceSwapCompilingDetector");
  const detector = await ort.InferenceSession.create(detectorModel, options);
  postProgress(requestId, 48, "faceSwapCompilingIdentity");
  const identity = await ort.InferenceSession.create(identityModel, options);
  postProgress(requestId, 67, "faceSwapCompilingConditioner");
  const conditioner = await ort.InferenceSession.create(conditionerModel, options);
  postProgress(requestId, 82, "faceSwapCompilingSwapper");
  const generator = await ort.InferenceSession.create(generatorModel, options);
  return { detector, identity, conditioner, generator };
}

async function getRuntime(requestId) {
  if (!runtimePromise) {
    runtimePromise = createRuntime(requestId).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

function disposeWeights() {
  conditionedWeights?.forEach((tensor) => tensor?.dispose?.());
  conditionedWeights = null;
}

async function prepare(requestId, pixels, key) {
  const runtime = await getRuntime(requestId);
  if (conditionedWeights && sourceKey === key) {
    postProgress(requestId, 100, "faceSwapSourceCached");
    return;
  }
  throwIfCanceled(requestId);
  postProgress(requestId, 86, "faceSwapPreparingSource");
  const source = new ort.Tensor("float32", pixels, [1, 3, 112, 112]);
  const identityResult = await runtime.identity.run({ [runtime.identity.inputNames[0]]: source });
  source.dispose?.();
  throwIfCanceled(requestId);
  postProgress(requestId, 92, "faceSwapConditioningSource");
  const conditionerResult = await runtime.conditioner.run({
    [runtime.conditioner.inputNames[0]]: identityResult[runtime.identity.outputNames[0]],
    [runtime.conditioner.inputNames[1]]: identityResult[runtime.identity.outputNames[1]],
  });
  disposeWeights();
  conditionedWeights = runtime.conditioner.outputNames.map((name) => conditionerResult[name]);
  Object.values(identityResult).forEach((tensor) => tensor?.dispose?.());
  sourceKey = key;
  postProgress(requestId, 100, "faceSwapSourceReady");
}

async function swap(requestId, pixels) {
  if (!conditionedWeights) throw new Error("FACE_SWAP_SOURCE_NOT_READY");
  const runtime = await getRuntime(requestId);
  throwIfCanceled(requestId);
  const target = new ort.Tensor("float32", pixels, [1, 3, 224, 224]);
  const feeds = { [runtime.generator.inputNames[0]]: target };
  conditionedWeights.forEach((tensor, index) => {
    feeds[runtime.generator.inputNames[index + 1]] = tensor;
  });
  const started = performance.now();
  const result = await runtime.generator.run(feeds);
  const output = new Float32Array(result[runtime.generator.outputNames[0]].data);
  const mask = new Float32Array(result[runtime.generator.outputNames[1]].data);
  const inferenceMs = performance.now() - started;
  target.dispose?.();
  Object.values(result).forEach((tensor) => tensor?.dispose?.());
  self.postMessage({
    type: "swapResult",
    requestId,
    pixels: output.buffer,
    mask: mask.buffer,
    inferenceMs,
    model: "mobilefaceswap-224",
  }, [output.buffer, mask.buffer]);
}

function intersectionOverUnion(left, right) {
  const x1 = Math.max(left.box[0], right.box[0]);
  const y1 = Math.max(left.box[1], right.box[1]);
  const x2 = Math.min(left.box[2], right.box[2]);
  const y2 = Math.min(left.box[3], right.box[3]);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const leftArea = Math.max(0, left.box[2] - left.box[0]) * Math.max(0, left.box[3] - left.box[1]);
  const rightArea = Math.max(0, right.box[2] - right.box[0]) * Math.max(0, right.box[3] - right.box[1]);
  return intersection / Math.max(1e-6, leftArea + rightArea - intersection);
}

function decodeScrfd(result, outputNames, inputSize, threshold = 0.55) {
  const scores = outputNames.slice(0, 3).map((name) => result[name].data);
  const boxes = outputNames.slice(3, 6).map((name) => result[name].data);
  const keypoints = outputNames.slice(6, 9).map((name) => result[name].data);
  const candidates = [];
  [8, 16, 32].forEach((stride, level) => {
    const width = Math.ceil(inputSize / stride);
    const levelScores = scores[level];
    const levelBoxes = boxes[level];
    const levelKeypoints = keypoints[level];
    for (let index = 0; index < levelScores.length; index += 1) {
      const score = levelScores[index];
      if (score < threshold) continue;
      const cell = Math.floor(index / 2);
      const centerX = (cell % width) * stride;
      const centerY = Math.floor(cell / width) * stride;
      const boxOffset = index * 4;
      const pointOffset = index * 10;
      const box = [
        centerX - levelBoxes[boxOffset] * stride,
        centerY - levelBoxes[boxOffset + 1] * stride,
        centerX + levelBoxes[boxOffset + 2] * stride,
        centerY + levelBoxes[boxOffset + 3] * stride,
      ];
      const five = Array.from({ length: 5 }, (_, pointIndex) => ({
        x: centerX + levelKeypoints[pointOffset + pointIndex * 2] * stride,
        y: centerY + levelKeypoints[pointOffset + pointIndex * 2 + 1] * stride,
      }));
      candidates.push({ score, box, five });
    }
  });
  candidates.sort((left, right) => right.score - left.score);
  const accepted = [];
  for (const candidate of candidates) {
    if (accepted.every((face) => intersectionOverUnion(candidate, face) < 0.4)) {
      accepted.push(candidate);
      if (accepted.length >= 12) break;
    }
  }
  return accepted;
}

async function detect(requestId, pixels, inputSize, threshold) {
  const runtime = await getRuntime(requestId);
  throwIfCanceled(requestId);
  const safeSize = inputSize === 320 ? 320 : 640;
  const input = new ort.Tensor("float32", pixels, [1, 3, safeSize, safeSize]);
  const result = await runtime.detector.run({ [runtime.detector.inputNames[0]]: input });
  const safeThreshold = Math.max(0.2, Math.min(0.9, Number(threshold) || 0.55));
  const faces = decodeScrfd(result, runtime.detector.outputNames, safeSize, safeThreshold);
  input.dispose?.();
  Object.values(result).forEach((tensor) => tensor?.dispose?.());
  self.postMessage({ type: "detectResult", requestId, faces });
}

async function release() {
  const runtime = await runtimePromise?.catch(() => null);
  disposeWeights();
  await runtime?.detector?.release?.();
  await runtime?.identity?.release?.();
  await runtime?.conditioner?.release?.();
  await runtime?.generator?.release?.();
  runtimePromise = null;
  sourceKey = "";
}

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  const requestId = message.requestId;
  if (message.type === "cancel") {
    canceled.add(requestId);
    return;
  }
  if (!requestId) return;
  try {
    if (message.type === "prepare") {
      activeRequestId = requestId;
      canceled.delete(requestId);
      await prepare(requestId, new Float32Array(message.pixels), String(message.sourceKey || ""));
      self.postMessage({ type: "prepared", requestId });
      return;
    }
    if (message.type === "detect") {
      activeRequestId = requestId;
      canceled.delete(requestId);
      await detect(
        requestId,
        new Float32Array(message.pixels),
        Number(message.inputSize),
        Number(message.threshold),
      );
      return;
    }
    if (message.type === "swap") {
      await swap(requestId, new Float32Array(message.pixels));
      return;
    }
    if (message.type === "release") {
      await release();
      self.postMessage({ type: "released", requestId });
      return;
    }
    throw new Error(`FACE_SWAP_UNKNOWN_MESSAGE:${message.type}`);
  } catch (error) {
    if (error?.name === "AbortError" || canceled.has(requestId)) {
      self.postMessage({ type: "canceled", requestId });
    } else {
      self.postMessage({ type: "error", requestId, message: error?.message || String(error) });
    }
  }
});
