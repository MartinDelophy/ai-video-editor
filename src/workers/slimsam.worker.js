import {
  AutoProcessor,
  RawImage,
  SamModel,
  env,
} from "@huggingface/transformers";
import { configureAnnaTransformers } from "../lib/annaWasmRuntime.js";

const MODEL_ID = "Xenova/slimsam-77-uniform";
const MODEL_REVISION = "5850ab45f587c112167512ffef949107115e26a0";

env.useBrowserCache = true;
env.backends.onnx.wasm.proxy = false;

let modelPromise = null;
let processorPromise = null;

function postStatus(requestId, phase, progress = null) {
  self.postMessage({ requestId, type: "progress", phase, progress });
}

async function loadRuntime(requestId) {
  await configureAnnaTransformers(env);
  const progress_callback = (event) => {
    if (event?.status !== "progress") return;
    postStatus(
      requestId,
      `SlimSAM 模型 · ${event.file ?? "下载"} · ${Math.round(event.progress ?? 0)}%`,
      Number(event.progress) || 0,
    );
  };
  modelPromise ??= SamModel.from_pretrained(MODEL_ID, {
    revision: MODEL_REVISION,
    device: self.navigator?.gpu ? "webgpu" : "wasm",
    dtype: self.navigator?.gpu ? "fp16" : "q8",
    progress_callback,
  }).catch((error) => {
    modelPromise = null;
    throw error;
  });
  processorPromise ??= AutoProcessor.from_pretrained(MODEL_ID, {
    revision: MODEL_REVISION,
    progress_callback,
  }).catch((error) => {
    processorPromise = null;
    throw error;
  });
  return Promise.all([modelPromise, processorPromise]);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeBox(box, width, height) {
  const x1 = clamp(box?.xmin, 0, 1) * width;
  const y1 = clamp(box?.ymin, 0, 1) * height;
  const x2 = clamp(box?.xmax, 0, 1) * width;
  const y2 = clamp(box?.ymax, 0, 1) * height;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

function chooseMask(masks, scores, box, positivePoint, negativePoints) {
  const [, channels, height, width] = masks.dims;
  const pixelsPerMask = width * height;
  const boxX1 = clamp(Math.floor(box[0]), 0, width - 1);
  const boxY1 = clamp(Math.floor(box[1]), 0, height - 1);
  const boxX2 = clamp(Math.ceil(box[2]), 1, width);
  const boxY2 = clamp(Math.ceil(box[3]), 1, height);
  const boxArea = Math.max(1, (boxX2 - boxX1) * (boxY2 - boxY1));
  const positiveX = clamp(Math.round(positivePoint[0]), 0, width - 1);
  const positiveY = clamp(Math.round(positivePoint[1]), 0, height - 1);
  const boxCenterX = (boxX1 + boxX2) / 2;
  const boxCenterY = (boxY1 + boxY2) / 2;
  const boxWidth = Math.max(1, boxX2 - boxX1);
  const boxHeight = Math.max(1, boxY2 - boxY1);
  let selected = 0;
  let selectedScore = -Infinity;

  for (let channel = 0; channel < channels; channel += 1) {
    const offset = channel * pixelsPerMask;
    let area = 0;
    let inBox = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!masks.data[offset + y * width + x]) continue;
        area += 1;
        sumX += x;
        sumY += y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (x >= boxX1 && x < boxX2 && y >= boxY1 && y < boxY2) inBox += 1;
      }
    }
    const insideRatio = area ? inBox / area : 0;
    const boxCoverage = inBox / boxArea;
    const areaRatio = area / boxArea;
    const containsPositive = Boolean(masks.data[offset + positiveY * width + positiveX]);
    const negativeHits = negativePoints.reduce((count, point) => {
      const x = clamp(Math.round(point[0]), 0, width - 1);
      const y = clamp(Math.round(point[1]), 0, height - 1);
      return count + (masks.data[offset + y * width + x] ? 1 : 0);
    }, 0);
    const centroidX = area ? sumX / area : boxCenterX;
    const centroidY = area ? sumY / area : boxCenterY;
    const centerDistance = Math.hypot(
      (centroidX - boxCenterX) / boxWidth,
      (centroidY - boxCenterY) / boxHeight,
    );
    const promptTouchesEdge = boxX1 <= 2 || boxY1 <= 2 || boxX2 >= width - 2 || boxY2 >= height - 2;
    const maskTouchesEdge = minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2;
    const score = (Number(scores[channel]) || 0)
      + (containsPositive ? 1.4 : -3)
      + insideRatio * 1.6
      + Math.min(0.7, boxCoverage * 0.7)
      - negativeHits * 1.2
      - centerDistance * 0.55
      - (maskTouchesEdge && !promptTouchesEdge ? 1.5 : 0)
      - Math.max(0, areaRatio - 1.15) * 1.2
      - Math.max(0, 0.08 - areaRatio) * 2;
    if (score > selectedScore) {
      selected = channel;
      selectedScore = score;
    }
  }

  const mask = new Uint8Array(pixelsPerMask);
  const offset = selected * pixelsPerMask;
  for (let index = 0; index < pixelsPerMask; index += 1) {
    mask[index] = masks.data[offset + index] ? 255 : 0;
  }
  return {
    mask,
    width,
    height,
    score: Number(scores[selected]) || 0,
    selectionScore: selectedScore,
  };
}

async function segment(requestId, blob, normalizedBox, normalizedPoint = null, normalizedNegativePoints = []) {
  const totalStarted = performance.now();
  const [model, processor] = await loadRuntime(requestId);
  postStatus(requestId, "SlimSAM 解码人物帧");
  const image = await RawImage.read(blob);
  const width = image.width;
  const height = image.height;
  const box = normalizeBox(normalizedBox, width, height);
  const negativePoints = normalizedNegativePoints.slice(0, 4).map((point) => [
    clamp(point?.x, 0, 1) * width,
    clamp(point?.y, 0, 1) * height,
  ]);
  const promptedPoint = Number.isFinite(normalizedPoint?.x) && Number.isFinite(normalizedPoint?.y)
    ? [clamp(normalizedPoint.x, 0, 1) * width, clamp(normalizedPoint.y, 0, 1) * height]
    : null;
  const promptPositions = negativePoints.length ? [0.3, 0.55, 0.78] : [0.38];
  const positivePoints = promptedPoint ? [promptedPoint] : promptPositions.map((verticalPosition) => [
      (box[0] + box[2]) / 2,
      box[1] + (box[3] - box[1]) * verticalPosition,
    ]);
  const positivePoint = positivePoints[Math.floor(positivePoints.length / 2)];
  postStatus(requestId, "SlimSAM 生成人物蒙版");
  const inputs = await processor(image, {
    input_points: [[ [...positivePoints, ...negativePoints] ]],
    input_labels: [[ [
      ...positivePoints.map(() => 1),
      ...negativePoints.map(() => 0),
    ] ]],
    input_boxes: [[box]],
  });
  const inferenceStarted = performance.now();
  const outputs = await model(inputs);
  const inferenceMs = performance.now() - inferenceStarted;
  const processed = await processor.post_process_masks(
    outputs.pred_masks,
    inputs.original_sizes,
    inputs.reshaped_input_sizes,
  );
  const selected = chooseMask(
    processed[0],
    outputs.iou_scores.data,
    box,
    positivePoint,
    negativePoints,
  );
  return {
    ...selected,
    inferenceMs,
    totalMs: performance.now() - totalStarted,
    modelId: MODEL_ID,
    modelRevision: MODEL_REVISION,
    device: self.navigator?.gpu ? "webgpu" : "wasm",
  };
}

self.addEventListener("message", async (event) => {
  const { requestId, type, blob, box, point, negativePoints } = event.data ?? {};
  if (!requestId || type !== "segment") return;
  try {
    const result = await segment(requestId, blob, box, point, negativePoints);
    self.postMessage(
      { requestId, type: "result", result: { ...result, mask: result.mask.buffer } },
      [result.mask.buffer],
    );
  } catch (error) {
    self.postMessage({
      requestId,
      type: "error",
      error: error?.message || String(error),
    });
  }
});
