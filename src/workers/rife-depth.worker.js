import * as ort from "onnxruntime-web/webgpu";
import wasmMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import wasmBinary from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

ort.env.wasm.wasmPaths = { mjs: wasmMjs, wasm: wasmBinary };
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
ort.env.webgpu.powerPreference = "high-performance";
ort.env.webgpu.forceFallbackAdapter = false;
const MODEL_URL = "https://huggingface.co/notaneimu/onnx-image-models/resolve/f7bf1c91e94ef516900f68456528fa781e2e7174/rife_v4.17_lite_v2.onnx";
const MODEL_SHA256 = "4192e1db7db7d8a110a667b8776b9fe3d92deb1cce04676d5d57a5fd52d7578a";
let session;
let pair;

async function setup(executionProvider = "webgpu") {
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`RIFE model HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (v) => v.toString(16).padStart(2, "0")).join("");
  if (digest !== MODEL_SHA256) throw new Error("RIFE model integrity mismatch");
  session = await ort.InferenceSession.create(bytes, { executionProviders: [executionProvider === "wasm" ? "wasm" : "webgpu"], graphOptimizationLevel: "all" });
}

self.onmessage = async ({ data: message }) => {
  try {
    if (message.type === "setup") await setup(message.executionProvider);
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
      pair = { input, plane, width, height, paddedWidth, paddedHeight };
    }
    if (message.type === "interpolate") {
      if (!pair || !session) throw new Error("RIFE is not ready");
      const { input, plane, width, height, paddedWidth, paddedHeight } = pair;
      input.fill(Math.max(0, Math.min(1, message.time)), 6 * plane);
      const tensor = new ort.Tensor("float32", input, [1, 7, paddedHeight, paddedWidth]);
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
        tensor.dispose();
        Object.values(result || {}).forEach((value) => value.dispose());
      }
      return;
    }
    self.postMessage({ requestId: message.requestId });
  } catch (error) {
    self.postMessage({ requestId: message.requestId, error: String(error?.message || error) });
  }
};
