import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { fetchFirstAvailableModel, mirroredModelFileUrls } from "../lib/modelSources.js";
import { configureAnnaOnnxRuntime } from "../lib/annaWasmRuntime.js";

const MODEL_REPOSITORY = "timeline-studio-onnx-models";
const MODEL_REVISION = "f1005093a90dec7a23746518f9623ee6aaba9cdc";
const MODEL_PATH = "object-outline/nanodet-plus-m_320.onnx";
const MODEL_BYTES = 4_793_615;
const INPUT_SIZE = 320;
const CLASS_COUNT = 80;
const REG_MAX = 7;
const STRIDES = [8, 16, 32, 64];
const CLASS_NAMES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
  "traffic_light", "fire_hydrant", "stop_sign", "parking_meter", "bench", "bird", "cat",
  "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
  "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports_ball",
  "kite", "baseball_bat", "baseball_glove", "skateboard", "surfboard", "tennis_racket",
  "bottle", "wine_glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
  "sandwich", "orange", "broccoli", "carrot", "hot_dog", "pizza", "donut", "cake",
  "chair", "couch", "potted_plant", "bed", "dining_table", "toilet", "tv", "laptop",
  "mouse", "remote", "keyboard", "cell_phone", "microwave", "oven", "toaster", "sink",
  "refrigerator", "book", "clock", "vase", "scissors", "teddy_bear", "hair_drier",
  "toothbrush",
];
const MEAN = [103.53, 116.28, 123.675];
const STD = [57.375, 57.12, 58.395];

ort.env.wasm.numThreads = self.crossOriginIsolated
  ? Math.max(1, Math.min(4, Number(self.navigator?.hardwareConcurrency) || 1))
  : 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };
configureAnnaOnnxRuntime(ort.env);

let sessionPromise = null;
let executionProvider = "wasm";

function postProgress(requestId, progress, phase) {
  self.postMessage({ requestId, type: "progress", progress, phase });
}

async function getSession(requestId) {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      postProgress(requestId, 8, "加载 NanoDet-Plus 实物检测模型");
      const { response } = await fetchFirstAvailableModel(mirroredModelFileUrls({
        repository: MODEL_REPOSITORY,
        revision: MODEL_REVISION,
        path: MODEL_PATH,
      }));
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== MODEL_BYTES) {
        throw new Error(`NANODET_MODEL_SIZE_MISMATCH:${bytes.byteLength}:${MODEL_BYTES}`);
      }
      postProgress(requestId, 36, "初始化 NanoDet-Plus ONNX");
      executionProvider = "wasm";
      return ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

function softmaxExpected(values, offset) {
  let maximum = -Infinity;
  for (let index = 0; index <= REG_MAX; index += 1) {
    maximum = Math.max(maximum, values[offset + index]);
  }
  let total = 0;
  let expected = 0;
  for (let index = 0; index <= REG_MAX; index += 1) {
    const probability = Math.exp(values[offset + index] - maximum);
    total += probability;
    expected += probability * index;
  }
  return total > 0 ? expected / total : 0;
}

function intersectionOverUnion(left, right) {
  const width = Math.max(0, Math.min(left.xmax, right.xmax) - Math.max(left.xmin, right.xmin));
  const height = Math.max(0, Math.min(left.ymax, right.ymax) - Math.max(left.ymin, right.ymin));
  const intersection = width * height;
  const leftArea = Math.max(0, left.xmax - left.xmin) * Math.max(0, left.ymax - left.ymin);
  const rightArea = Math.max(0, right.xmax - right.xmin) * Math.max(0, right.ymax - right.ymin);
  return intersection / Math.max(1, leftArea + rightArea - intersection);
}

function nonMaximumSuppression(detections, threshold = 0.5, maxResults = 24) {
  const selected = [];
  const sorted = detections.sort((left, right) => right.score - left.score);
  for (const candidate of sorted) {
    if (selected.some((item) => item.classId === candidate.classId
      && intersectionOverUnion(item.box, candidate.box) >= threshold)) continue;
    selected.push(candidate);
    if (selected.length >= maxResults) break;
  }
  return selected;
}

function decodeOutput(tensor, scoreThreshold) {
  const values = tensor.data;
  const detections = [];
  let pointIndex = 0;
  for (const stride of STRIDES) {
    const featureSize = Math.ceil(INPUT_SIZE / stride);
    for (let y = 0; y < featureSize; y += 1) {
      for (let x = 0; x < featureSize; x += 1, pointIndex += 1) {
        const rowOffset = pointIndex * (CLASS_COUNT + 4 * (REG_MAX + 1));
        let classId = 0;
        let score = 0;
        for (let index = 0; index < CLASS_COUNT; index += 1) {
          const value = values[rowOffset + index];
          if (value > score) {
            score = value;
            classId = index;
          }
        }
        if (score < scoreThreshold) continue;
        const regressionOffset = rowOffset + CLASS_COUNT;
        const left = softmaxExpected(values, regressionOffset) * stride;
        const top = softmaxExpected(values, regressionOffset + REG_MAX + 1) * stride;
        const right = softmaxExpected(values, regressionOffset + (REG_MAX + 1) * 2) * stride;
        const bottom = softmaxExpected(values, regressionOffset + (REG_MAX + 1) * 3) * stride;
        const centerX = (x + 0.5) * stride;
        const centerY = (y + 0.5) * stride;
        detections.push({
          classId,
          label: CLASS_NAMES[classId] || `class_${classId}`,
          score,
          box: {
            xmin: Math.max(0, centerX - left),
            ymin: Math.max(0, centerY - top),
            xmax: Math.min(INPUT_SIZE, centerX + right),
            ymax: Math.min(INPUT_SIZE, centerY + bottom),
          },
        });
      }
    }
  }
  return nonMaximumSuppression(detections);
}

async function preprocess(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, INPUT_SIZE, INPUT_SIZE);
    const rgba = context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
    const planeSize = INPUT_SIZE * INPUT_SIZE;
    const values = new Float32Array(planeSize * 3);
    for (let index = 0; index < planeSize; index += 1) {
      const source = index * 4;
      // NanoDet's official OpenCV pipeline is BGR.
      values[index] = (rgba[source + 2] - MEAN[0]) / STD[0];
      values[planeSize + index] = (rgba[source + 1] - MEAN[1]) / STD[1];
      values[planeSize * 2 + index] = (rgba[source] - MEAN[2]) / STD[2];
    }
    return {
      tensor: new ort.Tensor("float32", values, [1, 3, INPUT_SIZE, INPUT_SIZE]),
      sourceSize: { width: bitmap.width, height: bitmap.height },
    };
  } finally {
    bitmap.close();
  }
}

async function detect(requestId, blob, scoreThreshold) {
  const startedAt = performance.now();
  const session = await getSession(requestId);
  postProgress(requestId, 52, "NanoDet-Plus 正在识别实物");
  const { tensor, sourceSize } = await preprocess(blob);
  const inferenceStartedAt = performance.now();
  const outputMap = await session.run({ data: tensor });
  const inferenceMs = performance.now() - inferenceStartedAt;
  const output = outputMap.output || Object.values(outputMap)[0];
  const scaleX = sourceSize.width / INPUT_SIZE;
  const scaleY = sourceSize.height / INPUT_SIZE;
  const detections = decodeOutput(output, scoreThreshold).map((item) => ({
    label: item.label,
    score: item.score,
    box: {
      xmin: item.box.xmin * scaleX / sourceSize.width,
      ymin: item.box.ymin * scaleY / sourceSize.height,
      xmax: item.box.xmax * scaleX / sourceSize.width,
      ymax: item.box.ymax * scaleY / sourceSize.height,
    },
  }));
  return {
    sourceSize,
    detections,
    inferenceMs,
    totalMs: performance.now() - startedAt,
    executionProvider,
    modelId: "NanoDet-Plus-m-320",
    modelPath: `${MODEL_REPOSITORY}@${MODEL_REVISION}/${MODEL_PATH}`,
  };
}

self.addEventListener("message", async (event) => {
  const { requestId, type, blob, scoreThreshold = 0.24 } = event.data || {};
  if (!requestId || type !== "detect" || !(blob instanceof Blob)) return;
  try {
    const result = await detect(requestId, blob, Math.max(0.05, Math.min(0.95, scoreThreshold)));
    self.postMessage({ requestId, type: "result", result });
  } catch (error) {
    self.postMessage({
      requestId,
      type: "error",
      error: error?.message || String(error),
    });
  }
});
