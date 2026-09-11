import mjs from "@timeline-studio/transformers-ort/ort-wasm-simd-threaded.jsep.mjs?url";
import wasm from "@timeline-studio/transformers-ort/ort-wasm-simd-threaded.jsep.wasm?url";

// This JSEP pair matches Transformers' own ORT dependency. Despite the asset
// name, ORT runs it without pthread workers when numThreads is explicitly 1.
export const annaTransformersWasmPaths = { mjs, wasm };
