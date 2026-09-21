import * as ort from "onnxruntime-web/wasm";
import wasmModule from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import wasmBinary from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { sileroModelUrls, SILERO_MODEL_SHA256 } from "../config/sileroVad.js";
import { fetchFirstAvailableModel } from "../lib/modelSources.js";

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { mjs: wasmModule, wasm: wasmBinary };
let session;
let state = new Float32Array(256);
let context = new Float32Array(64);

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "init") {
      const { response } = await fetchFirstAvailableModel(sileroModelUrls(data.language));
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (digest !== SILERO_MODEL_SHA256) throw new Error("Model checksum mismatch");
      self.postMessage({ id, type: "phase", phase: "pauseStarting" });
      session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      state = new Float32Array(256); context = new Float32Array(64);
      self.postMessage({ id, type: "done" });
      return;
    }
    if (!session) throw new Error("Not initialized");
    const pcm = data.pcm;
    const count = Math.ceil(pcm.length / 512);
    const probabilities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const input = new Float32Array(576);
      input.set(context); input.set(pcm.subarray(i * 512, (i + 1) * 512), 64);
      const feeds = {
        input: new ort.Tensor("float32", input, [1, 576]),
        state: new ort.Tensor("float32", state, [2, 1, 128]),
        sr: new ort.Tensor("int64", BigInt64Array.of(16000n), []),
      };
      let output;
      try {
        output = await session.run(feeds);
        const probability = Number(output.output.data[0]);
        if (!Number.isFinite(probability)) throw new Error("Invalid model result");
        probabilities[i] = probability;
        state = new Float32Array(output.stateN.data);
        context = input.slice(-64);
      } finally {
        Object.values(feeds).forEach((tensor) => tensor.dispose());
        Object.values(output || {}).forEach((tensor) => tensor.dispose());
      }
      if (i % 32 === 0) self.postMessage({ id, type: "progress", progress: i / count });
    }
    self.postMessage({ id, type: "done", probabilities }, [probabilities.buffer]);
  } catch {
    self.postMessage({ id, type: "error", code: type === "init" ? "pauseModelFailed" : "pauseFailed" });
  }
};
