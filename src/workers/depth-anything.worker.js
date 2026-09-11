import { RawImage, env, pipeline } from "@huggingface/transformers";
import {
  DEPTH_MODEL_HUGGING_FACE_REVISION,
  DEPTH_MODEL_MODELSCOPE_REVISION,
  DEPTH_MODEL_PATH,
  DEPTH_MODEL_REPOSITORY,
} from "../lib/depthOfField.js";
import { loadFromMirroredRepository } from "../lib/modelSources.js";
import { configureAnnaTransformers } from "../lib/annaWasmRuntime.js";

env.allowLocalModels = false;
env.useBrowserCache = true;

let estimatorPromise = null;

function progressValue(event) {
  if (event?.status === "progress" && Number.isFinite(event.progress)) return event.progress;
  if (event?.status === "done" || event?.status === "ready") return 100;
  return null;
}

async function getEstimator() {
  await configureAnnaTransformers(env);
  estimatorPromise ??= loadFromMirroredRepository(env, {
    repository: DEPTH_MODEL_REPOSITORY,
    modelPath: DEPTH_MODEL_PATH,
    huggingFaceRevision: DEPTH_MODEL_HUGGING_FACE_REVISION,
    modelScopeRevision: DEPTH_MODEL_MODELSCOPE_REVISION,
  }, (modelPath) => pipeline("depth-estimation", modelPath, {
    device: "webgpu",
    dtype: "q4f16",
    progress_callback: (event) => {
      const progress = progressValue(event);
      self.postMessage({ type: "setup-progress", progress, status: event?.status || "" });
    },
  }));
  return estimatorPromise;
}

self.onmessage = async (event) => {
  const message = event.data || {};
  try {
    if (message.type === "setup") {
      await getEstimator();
      self.postMessage({ type: "ready", requestId: message.requestId });
      return;
    }
    if (message.type !== "infer" || !message.bitmap) return;
    const estimator = await getEstimator();
    const canvas = new OffscreenCanvas(message.width, message.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(message.bitmap, 0, 0, message.width, message.height);
    message.bitmap.close?.();
    const input = RawImage.fromCanvas(canvas);
    const output = await estimator(input);
    const depth = output.depth;
    const pixels = new Uint8Array(depth.data);
    self.postMessage({
      type: "result",
      requestId: message.requestId,
      width: depth.width,
      height: depth.height,
      pixels: pixels.buffer,
    }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
