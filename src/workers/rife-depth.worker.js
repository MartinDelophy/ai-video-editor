import { getRifeModelUrls, RIFE_MODEL_SHA256 } from "../lib/rifeModelSources";
import * as ort from "onnxruntime-web/webgpu";
import wasmMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import wasmBinary from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

ort.env.wasm.wasmPaths = { mjs: wasmMjs, wasm: wasmBinary };
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
ort.env.webgpu.powerPreference = "high-performance";
ort.env.webgpu.forceFallbackAdapter = false;
let session;
let pair;

async function setup(executionProvider = "webgpu", modelSource) {
  let modelBytes;
  for (const url of getRifeModelUrls(modelSource)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`RIFE model HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (v) => v.toString(16).padStart(2, "0")).join("");
      if (digest !== RIFE_MODEL_SHA256) throw new Error("RIFE model integrity mismatch");
      modelBytes = bytes;
      break;
    } catch {
      // Both owned mirrors contain the same verified graph; retry the other source.
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!modelBytes) throw new Error("RIFE model mirrors unavailable");
  session = await ort.InferenceSession.create(modelBytes, { executionProviders: [executionProvider === "wasm" ? "wasm" : "webgpu"], graphOptimizationLevel: "all" });
}

self.onmessage = async ({ data: message }) => {
  try {
    if (message.type === "reset") { pair?.tensor?.dispose(); pair = null; return; }
    if (message.type === "setup") await setup(message.executionProvider, message.modelSource);
    if (message.type === "pair") {
      const { width, height, first, second } = message;
      const paddedWidth = Math.ceil(width / 32) * 32;
      const paddedHeight = Math.ceil(height / 32) * 32;
      const plane = paddedWidth * paddedHeight;
      const input = new Float32Array(7 * plane);
      for (let y = 0; y < paddedHeight; y += 1) {
        for (let x = 0; x < paddedWidth; x += 1) {
          const from = Math.min(height - 1, y) * width + Math.min(width - 1, x);
          const to = y * paddedWidth + x;
          for (let c = 0; c < 3; c += 1) {
            input[c * plane + to] = first[from] / 255;
            input[(c + 3) * plane + to] = second[from] / 255;
          }
        }
      }
      pair?.tensor?.dispose();
      const tensor = new ort.Tensor("float32", input, [1, 7, paddedHeight, paddedWidth]);
      pair = { input, tensor, plane, width, height, paddedWidth, paddedHeight };
    }
    if (message.type === "interpolate") {
      if (!pair || !session) throw new Error("RIFE is not ready");
      const { input, tensor, plane, width, height } = pair;
      input.fill(Math.max(0, Math.min(1, message.time)), 6 * plane);
      let result;
      try {
        result = await session.run({ [session.inputNames[0]]: tensor });
        const output = result[session.outputNames[0]];
        const values = output.data;
        const outWidth = output.dims[3];
        const gray = new Uint8ClampedArray(width * height);
        for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
          gray[y * width + x] = Math.round(values[y * outWidth + x] * 255);
        }
        self.postMessage({ requestId: message.requestId, gray, width, height }, [gray.buffer]);
      } finally {
        Object.values(result || {}).forEach((value) => value.dispose());
      }
      return;
    }
    self.postMessage({ requestId: message.requestId });
  } catch (error) {
    self.postMessage({ requestId: message.requestId, error: String(error?.message || error) });
  }
};
