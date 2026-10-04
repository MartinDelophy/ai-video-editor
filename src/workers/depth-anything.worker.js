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
let inputCanvas = null;
let depthCanvas = null;

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
  })).catch((error) => {
    estimatorPromise = null;
    throw error;
  });
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
    inputCanvas ??= new OffscreenCanvas(message.width, message.height);
    const canvas = inputCanvas;
    if (canvas.width !== message.width) canvas.width = message.width;
    if (canvas.height !== message.height) canvas.height = message.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(message.bitmap, 0, 0, message.width, message.height);
    message.bitmap.close?.();
    const input = RawImage.fromCanvas(canvas);
    const output = await estimator(input);
    const depth = output.depth;
    depthCanvas ??= new OffscreenCanvas(depth.width, depth.height);
    if (depthCanvas.width !== depth.width) depthCanvas.width = depth.width;
    if (depthCanvas.height !== depth.height) depthCanvas.height = depth.height;
    const depthContext = depthCanvas.getContext("2d");
    const image = depthContext.createImageData(depth.width, depth.height);
    for (let index = 0; index < depth.data.length; index += 1) {
      const offset = index * 4;
      image.data[offset] = depth.data[index];
      image.data[offset + 1] = depth.data[index];
      image.data[offset + 2] = depth.data[index];
      image.data[offset + 3] = 255;
    }
    depthContext.putImageData(image, 0, 0);
    const blob = await depthCanvas.convertToBlob({ type: "image/png" });
    self.postMessage({
      type: "result",
      requestId: message.requestId,
      width: depth.width,
      height: depth.height,
      blob,
    });
  } catch (error) {
    message.bitmap?.close?.();
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
