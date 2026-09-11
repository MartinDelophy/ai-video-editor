const ANNA_EDITION = import.meta.env?.VITE_ANNA_EDITION === "true";
const configuredTransformers = new WeakSet();

/** Anna supports single-threaded WASM without cross-origin isolation. */
export function configureAnnaOnnxRuntime(onnxEnv) {
  if (ANNA_EDITION) onnxEnv.wasm.numThreads = 1;
}

/** Configure the separate ONNX runtime owned by Transformers before inference. */
export async function configureAnnaTransformers(transformersEnv) {
  if (!ANNA_EDITION || configuredTransformers.has(transformersEnv)) return;

  // Keep these resources out of the independent site's runtime path. The Vite
  // alias resolves from Transformers itself, rather than the newer direct ORT.
  const { annaTransformersWasmPaths } = await import("./annaTransformersWasmAssets.js");
  const wasm = transformersEnv.backends.onnx.wasm;
  wasm.numThreads = 1;
  wasm.proxy = false;
  wasm.wasmPaths = { ...annaTransformersWasmPaths };
  configuredTransformers.add(transformersEnv);
}
