const SOURCE_TEMPLATE = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];
const SWAP_TEMPLATE = SOURCE_TEMPLATE.map(([x, y]) => [x * 2, y * 2]);
const DEFAULT_FPS = 8;
const DEFAULT_ANCHOR_FPS = 2;
const MAX_VIDEO_SECONDS = 60;
const pendingFlow = new Map();
let flowWorker = null;
let flowReadyPromise = null;

function id(prefix) {
  return globalThis.crypto?.randomUUID
    ? `${prefix}-${globalThis.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function abortError() {
  const error = new Error("换脸生成已取消。");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function boxScore(box, previous) {
  const width = box.xmax - box.xmin;
  const height = box.ymax - box.ymin;
  const area = width * height;
  const centerX = (box.xmin + box.xmax) / 2;
  const centerY = (box.ymin + box.ymax) / 2;
  if (!previous) return area - Math.hypot(centerX - 0.5, centerY - 0.5) * 0.05;
  const previousX = (previous.xmin + previous.xmax) / 2;
  const previousY = (previous.ymin + previous.ymax) / 2;
  const previousArea = (previous.xmax - previous.xmin) * (previous.ymax - previous.ymin);
  const distance = Math.hypot(centerX - previousX, centerY - previousY);
  const areaDelta = Math.abs(Math.log(Math.max(1e-5, area) / Math.max(1e-5, previousArea)));
  return 1 - distance * 3 - areaDelta * 0.35;
}

function chooseFace(faces, previousBox = null, highestConfidence = false) {
  return [...(faces || [])]
    .sort((left, right) => (
      highestConfidence
        ? right.score - left.score
        : boxScore(right.box, previousBox) - boxScore(left.box, previousBox)
    ))[0] || null;
}

function isCompleteFace(face) {
  if (!face?.box || !Array.isArray(face.five) || face.five.length !== 5) return false;
  const width = face.box.xmax - face.box.xmin;
  const height = face.box.ymax - face.box.ymin;
  if (width <= 0 || height <= 0) return false;
  if (
    face.box.xmin < -0.05
    || face.box.ymin < -0.05
    || face.box.xmax > 1.05
    || face.box.ymax > 1.05
  ) return false;
  const [leftEye, rightEye, nose, leftMouth, rightMouth] = face.five;
  const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) / width;
  const mouthDistance = Math.hypot(rightMouth.x - leftMouth.x, rightMouth.y - leftMouth.y) / width;
  const eyeY = (leftEye.y + rightEye.y) / 2;
  const mouthY = (leftMouth.y + rightMouth.y) / 2;
  return eyeDistance >= 0.14
    && mouthDistance >= 0.1
    && nose.y > eyeY
    && nose.y < mouthY
    && mouthY - eyeY >= height * 0.16;
}

function estimateSimilarity(source, target) {
  const sourceCenter = source.reduce((sum, point) => ({
    x: sum.x + point.x / source.length,
    y: sum.y + point.y / source.length,
  }), { x: 0, y: 0 });
  const targetCenter = target.reduce((sum, point) => ({
    x: sum.x + point[0] / target.length,
    y: sum.y + point[1] / target.length,
  }), { x: 0, y: 0 });
  let denominator = 0;
  let aNumerator = 0;
  let bNumerator = 0;
  for (let index = 0; index < source.length; index += 1) {
    const sx = source[index].x - sourceCenter.x;
    const sy = source[index].y - sourceCenter.y;
    const dx = target[index][0] - targetCenter.x;
    const dy = target[index][1] - targetCenter.y;
    denominator += sx * sx + sy * sy;
    aNumerator += sx * dx + sy * dy;
    bNumerator += sx * dy - sy * dx;
  }
  const a = aNumerator / Math.max(1e-8, denominator);
  const b = bNumerator / Math.max(1e-8, denominator);
  return [
    a,
    -b,
    targetCenter.x - a * sourceCenter.x + b * sourceCenter.y,
    b,
    a,
    targetCenter.y - b * sourceCenter.x - a * sourceCenter.y,
  ];
}

function invertSimilarity(matrix) {
  const [a, c, e, b, d, f] = matrix;
  const denominator = a * d - b * c;
  return [
    d / denominator,
    -c / denominator,
    (c * f - d * e) / denominator,
    -b / denominator,
    a / denominator,
    (b * e - a * f) / denominator,
  ];
}

function alignedCanvas(source, five, size, template) {
  const pixelPoints = five.map((point) => ({
    x: point.x * source.width,
    y: point.y * source.height,
  }));
  const matrix = estimateSimilarity(pixelPoints, template);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.setTransform(matrix[0], matrix[3], matrix[1], matrix[4], matrix[2], matrix[5]);
  context.drawImage(source, 0, 0);
  context.resetTransform();
  return { canvas, matrix };
}

function pixelsToTensor(canvas, mean, std) {
  const { data } = canvas.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, canvas.width, canvas.height);
  const plane = canvas.width * canvas.height;
  const tensor = new Float32Array(plane * 3);
  const means = Array.isArray(mean) ? mean : [mean, mean, mean];
  const standardDeviations = Array.isArray(std) ? std : [std, std, std];
  for (let index = 0; index < plane; index += 1) {
    tensor[index] = (data[index * 4] - means[0]) / standardDeviations[0];
    tensor[plane + index] = (data[index * 4 + 1] - means[1]) / standardDeviations[1];
    tensor[plane * 2 + index] = (data[index * 4 + 2] - means[2]) / standardDeviations[2];
  }
  return tensor;
}

async function detectFaces({
  worker,
  source,
  requestId,
  signal,
  onProgress,
  detectorSize = 640,
  threshold = 0.55,
}) {
  const scale = Math.min(detectorSize / source.width, detectorSize / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = detectorSize;
  canvas.height = detectorSize;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.fillStyle = "rgb(0, 0, 0)";
  context.fillRect(0, 0, detectorSize, detectorSize);
  context.drawImage(source, 0, 0, width, height);
  const pixels = pixelsToTensor(canvas, 127.5, 128);
  const result = await requestWorker(worker, {
    type: "detect",
    requestId,
    inputSize: detectorSize,
    threshold,
    pixels: pixels.buffer,
  }, [pixels.buffer], "detectResult", signal, onProgress);
  return (result.faces || []).map((face) => ({
    score: face.score,
    box: {
      xmin: face.box[0] / scale / source.width,
      ymin: face.box[1] / scale / source.height,
      xmax: face.box[2] / scale / source.width,
      ymax: face.box[3] / scale / source.height,
    },
    five: face.five.map((point) => ({
      x: point.x / scale / source.width,
      y: point.y / scale / source.height,
    })),
  })).filter((face) => (
    face.five.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    && face.box.xmax > face.box.xmin
    && face.box.ymax > face.box.ymin
  ));
}

function colorMatch(values, targetCanvas, maskValues) {
  const target = targetCanvas.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, 224, 224).data;
  const plane = 224 * 224;
  const sourceSum = [0, 0, 0];
  const targetSum = [0, 0, 0];
  const sourceSquareSum = [0, 0, 0];
  const targetSquareSum = [0, 0, 0];
  let count = 0;
  for (let index = 0; index < plane; index += 1) {
    const x = index % 224;
    const y = Math.floor(index / 224);
    if (maskValues[index] < 0.55 || x < 24 || x >= 200 || y < 24 || y >= 200) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const sourceValue = values[channel * plane + index];
      const targetValue = target[index * 4 + channel] / 255;
      sourceSum[channel] += sourceValue;
      targetSum[channel] += targetValue;
      sourceSquareSum[channel] += sourceValue * sourceValue;
      targetSquareSum[channel] += targetValue * targetValue;
    }
    count += 1;
  }
  if (count < 256) return values;
  const corrected = new Float32Array(values.length);
  const strength = 0.72;
  for (let channel = 0; channel < 3; channel += 1) {
    const sourceMean = sourceSum[channel] / count;
    const targetMean = targetSum[channel] / count;
    const sourceDeviation = Math.sqrt(Math.max(1e-6, sourceSquareSum[channel] / count - sourceMean ** 2));
    const targetDeviation = Math.sqrt(Math.max(1e-6, targetSquareSum[channel] / count - targetMean ** 2));
    const scale = Math.max(0.78, Math.min(1.22, targetDeviation / sourceDeviation));
    const shift = Math.max(-0.12, Math.min(0.12, targetMean - sourceMean * scale));
    const offset = channel * plane;
    for (let index = 0; index < plane; index += 1) {
      const matched = values[offset + index] * scale + shift;
      corrected[offset + index] = values[offset + index] * (1 - strength) + matched * strength;
    }
  }
  return corrected;
}

function outputCanvas(values, targetCanvas, maskValues) {
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;
  const context = canvas.getContext("2d");
  const image = context.createImageData(224, 224);
  const plane = 224 * 224;
  const matchedValues = colorMatch(values, targetCanvas, maskValues);
  for (let index = 0; index < plane; index += 1) {
    image.data[index * 4] = Math.max(0, Math.min(255, Math.round(matchedValues[index] * 255)));
    image.data[index * 4 + 1] = Math.max(0, Math.min(255, Math.round(matchedValues[plane + index] * 255)));
    image.data[index * 4 + 2] = Math.max(0, Math.min(255, Math.round(matchedValues[plane * 2 + index] * 255)));
    image.data[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function horizontalFilter(values, size, radius, mode) {
  const output = new Float32Array(values.length);
  const paddedLength = size + radius * 2;
  const windowSize = radius * 2 + 1;
  const dequeIndexes = new Int32Array(paddedLength);
  const dequeValues = new Float32Array(paddedLength);
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    let head = 0;
    let tail = 0;
    for (let paddedIndex = 0; paddedIndex < paddedLength; paddedIndex += 1) {
      const sampleX = Math.max(0, Math.min(size - 1, paddedIndex - radius));
      const value = values[row + sampleX];
      while (tail > head && (
        mode === "max"
          ? dequeValues[tail - 1] <= value
          : dequeValues[tail - 1] >= value
      )) {
        tail -= 1;
      }
      dequeIndexes[tail] = paddedIndex;
      dequeValues[tail] = value;
      tail += 1;
      while (tail > head && dequeIndexes[head] <= paddedIndex - windowSize) head += 1;
      if (paddedIndex >= windowSize - 1) {
        output[row + paddedIndex - windowSize + 1] = dequeValues[head];
      }
    }
  }
  return output;
}

function verticalFilter(values, size, radius, mode) {
  const output = new Float32Array(values.length);
  const paddedLength = size + radius * 2;
  const windowSize = radius * 2 + 1;
  const dequeIndexes = new Int32Array(paddedLength);
  const dequeValues = new Float32Array(paddedLength);
  for (let x = 0; x < size; x += 1) {
    let head = 0;
    let tail = 0;
    for (let paddedIndex = 0; paddedIndex < paddedLength; paddedIndex += 1) {
      const sampleY = Math.max(0, Math.min(size - 1, paddedIndex - radius));
      const value = values[sampleY * size + x];
      while (tail > head && (
        mode === "max"
          ? dequeValues[tail - 1] <= value
          : dequeValues[tail - 1] >= value
      )) {
        tail -= 1;
      }
      dequeIndexes[tail] = paddedIndex;
      dequeValues[tail] = value;
      tail += 1;
      while (tail > head && dequeIndexes[head] <= paddedIndex - windowSize) head += 1;
      if (paddedIndex >= windowSize - 1) {
        output[(paddedIndex - windowSize + 1) * size + x] = dequeValues[head];
      }
    }
  }
  return output;
}

function morphology(values, size, radius, mode) {
  return verticalFilter(horizontalFilter(values, size, radius, mode), size, radius, mode);
}

function boxBlur(values, size, radius) {
  const horizontal = new Float32Array(values.length);
  const output = new Float32Array(values.length);
  const diameter = radius * 2 + 1;
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += values[row + Math.max(0, Math.min(size - 1, offset))];
    }
    for (let x = 0; x < size; x += 1) {
      horizontal[row + x] = sum / diameter;
      const removeX = Math.max(0, Math.min(size - 1, x - radius));
      const addX = Math.max(0, Math.min(size - 1, x + radius + 1));
      sum += values[row + addX] - values[row + removeX];
    }
  }
  for (let x = 0; x < size; x += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += horizontal[Math.max(0, Math.min(size - 1, offset)) * size + x];
    }
    for (let y = 0; y < size; y += 1) {
      output[y * size + x] = sum / diameter;
      const removeY = Math.max(0, Math.min(size - 1, y - radius));
      const addY = Math.max(0, Math.min(size - 1, y + radius + 1));
      sum += horizontal[addY * size + x] - horizontal[removeY * size + x];
    }
  }
  return output;
}

function officialBlendMask(values) {
  const size = 224;
  let mask = Float32Array.from(values, (value) => (value > 0.001 ? 1 : 0));
  mask = morphology(mask, size, 5, "max");
  mask = morphology(mask, size, 5, "min");
  mask = morphology(mask, size, 5, "min");
  mask = boxBlur(mask, size, 3);
  const border = new Float32Array(size * size);
  for (let y = 10; y < size - 10; y += 1) {
    border.fill(1, y * size + 10, y * size + size - 10);
  }
  const featheredBorder = boxBlur(border, size, 5);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] *= featheredBorder[index];
  }
  return mask;
}

function outputMaskCanvas(values) {
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;
  const context = canvas.getContext("2d");
  const image = context.createImageData(224, 224);
  const mask = officialBlendMask(values);
  for (let index = 0; index < mask.length; index += 1) {
    const alpha = Math.max(0, Math.min(255, Math.round(mask[index] * 255)));
    image.data[index * 4] = 255;
    image.data[index * 4 + 1] = 255;
    image.data[index * 4 + 2] = 255;
    image.data[index * 4 + 3] = alpha;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export function compositeSwappedFace(frameCanvas, swappedValues, maskValues, matrix, targetCanvas) {
  const inverse = invertSimilarity(matrix);
  const layer = document.createElement("canvas");
  layer.width = frameCanvas.width;
  layer.height = frameCanvas.height;
  const layerContext = layer.getContext("2d");
  layerContext.setTransform(inverse[0], inverse[3], inverse[1], inverse[4], inverse[2], inverse[5]);
  layerContext.drawImage(outputCanvas(swappedValues, targetCanvas, maskValues), 0, 0);
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.drawImage(outputMaskCanvas(maskValues), 0, 0);
  layerContext.resetTransform();
  layerContext.globalCompositeOperation = "source-over";
  const context = frameCanvas.getContext("2d");
  context.drawImage(layer, 0, 0);
  return frameCanvas;
}

function imageFromBlob(blob) {
  return createImageBitmap(blob);
}

async function canvasBlob(canvas, type = "image/png", quality = 0.94) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("换脸帧编码失败。")), type, quality);
  });
}

function requestWorker(worker, message, transfer, terminalTypes, signal, onProgress) {
  const accepted = new Set(Array.isArray(terminalTypes) ? terminalTypes : [terminalTypes]);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleMessage = (event) => {
      if (event.data?.requestId !== message.requestId) return;
      if (event.data.type === "progress") return void onProgress?.(event.data);
      if (event.data.type === "error") {
        cleanup();
        reject(new Error(event.data.message || "换脸 Worker 失败。"));
      } else if (event.data.type === "canceled") {
        cleanup();
        reject(abortError());
      } else if (accepted.has(event.data.type)) {
        cleanup();
        resolve(event.data);
      }
    };
    const handleError = (event) => {
      cleanup();
      reject(new Error(event.message || "换脸 Worker 运行失败。"));
    };
    const handleAbort = () => {
      worker.postMessage({ type: "cancel", requestId: message.requestId });
      cleanup();
      reject(abortError());
    };
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
    worker.postMessage(message, transfer);
  });
}

export async function prepareFaceSwapSource({ worker, blob, sourceKey, requestId, signal, onProgress }) {
  throwIfAborted(signal);
  const bitmap = await imageFromBlob(blob);
  try {
    let candidates = (await detectFaces({
      worker,
      source: bitmap,
      requestId,
      signal,
      onProgress,
    })).filter(isCompleteFace);
    if (!candidates.length) {
      candidates = (await detectFaces({
        worker,
        source: bitmap,
        requestId,
        signal,
        onProgress,
        threshold: 0.25,
      })).filter(isCompleteFace);
    }
    const face = chooseFace(candidates, null, true);
    if (!face) throw new Error("源图片中没有检测到清晰完整的人脸。");
    const aligned = alignedCanvas(bitmap, face.five, 112, SOURCE_TEMPLATE);
    const pixels = pixelsToTensor(
      aligned.canvas,
      [0.485 * 255, 0.456 * 255, 0.406 * 255],
      [0.229 * 255, 0.224 * 255, 0.225 * 255],
    );
    await requestWorker(worker, {
      type: "prepare",
      requestId,
      sourceKey,
      pixels: pixels.buffer,
    }, [pixels.buffer], "prepared", signal, onProgress);
    return { face, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function swapFaceFrame({
  worker,
  frameCanvas,
  five,
  requestId,
  signal,
}) {
  throwIfAborted(signal);
  const aligned = alignedCanvas(frameCanvas, five, 224, SWAP_TEMPLATE);
  const pixels = pixelsToTensor(aligned.canvas, 0, 255);
  const result = await requestWorker(worker, {
    type: "swap",
    requestId,
    pixels: pixels.buffer,
  }, [pixels.buffer], "swapResult", signal);
  const swappedValues = new Float32Array(result.pixels);
  const maskValues = new Float32Array(result.mask);
  compositeSwappedFace(frameCanvas, swappedValues, maskValues, aligned.matrix, aligned.canvas);
  return {
    frameCanvas,
    inferenceMs: result.inferenceMs,
    model: result.model || "mobilefaceswap-224",
  };
}

async function createFrameReader(blob, times, signal) {
  if (typeof VideoDecoder === "undefined") return null;
  let input;
  try {
    const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import("mediabunny");
    throwIfAborted(signal);
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const sink = new CanvasSink(track, {
      poolSize: 3,
      decoderOptions: { optimizeForLatency: true },
    });
    const iterator = sink.canvasesAtTimestamps(times)[Symbol.asyncIterator]();
    return {
      async next() {
        throwIfAborted(signal);
        const result = await iterator.next();
        return result.done ? null : result.value?.canvas || null;
      },
      async dispose() {
        await iterator.return?.();
        input?.dispose();
      },
    };
  } catch (error) {
    input?.dispose();
    console.warn("换脸 WebCodecs 顺序解码不可用，回退视频 seek。", error);
    return null;
  }
}

function getFlowWorker() {
  if (flowWorker && flowReadyPromise) return { worker: flowWorker, ready: flowReadyPromise };
  flowWorker = new Worker(new URL("../workers/face-flow.worker.js", import.meta.url));
  flowReadyPromise = new Promise((resolve, reject) => {
    const handle = (event) => {
      if (event.data?.type === "ready") resolve();
      if (event.data?.type === "fatal") reject(new Error(event.data.message || "人脸光流初始化失败。"));
    };
    flowWorker.addEventListener("message", handle);
  });
  flowWorker.addEventListener("message", (event) => {
    const pending = pendingFlow.get(event.data?.requestId);
    if (!pending) return;
    if (event.data.type === "result") {
      pendingFlow.delete(event.data.requestId);
      pending.resolve(event.data);
    } else if (event.data.type === "error") {
      pendingFlow.delete(event.data.requestId);
      pending.reject(new Error(event.data.message || "人脸光流失败。"));
    }
  });
  return { worker: flowWorker, ready: flowReadyPromise };
}

async function requestFlow(type, payload, signal) {
  const { worker, ready } = getFlowWorker();
  await ready;
  throwIfAborted(signal);
  const requestId = id("face-flow");
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      pendingFlow.delete(requestId);
      reject(abortError());
    };
    pendingFlow.set(requestId, { resolve, reject });
    signal?.addEventListener("abort", handleAbort, { once: true });
    const transfer = [];
    if (payload.rgba instanceof ArrayBuffer) transfer.push(payload.rgba);
    if (payload.points instanceof ArrayBuffer) transfer.push(payload.points);
    worker.postMessage({ type, requestId, ...payload }, transfer);
  });
}

function fiveToPointBuffer(five, width, height) {
  const output = new Float32Array(10);
  five.forEach((point, index) => {
    output[index * 2] = point.x * width;
    output[index * 2 + 1] = point.y * height;
  });
  return output;
}

function pointBufferToFive(points, width, height) {
  return Array.from({ length: 5 }, (_, index) => ({
    x: points[index * 2] / width,
    y: points[index * 2 + 1] / height,
  }));
}

async function waitEvent(target, name, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(name, success);
      target.removeEventListener("error", failure);
      signal?.removeEventListener("abort", aborted);
    };
    const success = () => { cleanup(); resolve(); };
    const failure = () => { cleanup(); reject(new Error("无法读取换脸目标视频。")); };
    const aborted = () => { cleanup(); reject(abortError()); };
    target.addEventListener(name, success, { once: true });
    target.addEventListener("error", failure, { once: true });
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

async function seek(video, time, signal) {
  if (Math.abs(video.currentTime - time) < 0.006) return;
  const done = waitEvent(video, "seeked", signal);
  video.currentTime = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001)));
  await done;
}

export async function generateFaceSwapMedia({
  worker,
  targetBlob,
  targetType,
  duration,
  sourceStart = 0,
  requestId,
  signal,
  fps = DEFAULT_FPS,
  anchorFps = DEFAULT_ANCHOR_FPS,
  onProgress,
}) {
  throwIfAborted(signal);
  if (targetType === "image") {
    const bitmap = await imageFromBlob(targetBlob);
    try {
      const frame = document.createElement("canvas");
      frame.width = bitmap.width;
      frame.height = bitmap.height;
      frame.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0);
      const face = chooseFace((await detectFaces({
        worker,
        source: bitmap,
        requestId,
        signal,
      })).filter(isCompleteFace), null, true);
      if (!face) throw new Error("当前图片中没有检测到可换脸的人脸。");
      const swap = await swapFaceFrame({
        worker,
        frameCanvas: frame,
        five: face.five,
        requestId,
        signal,
      });
      onProgress?.({ progress: 100, phaseKey: "faceSwapComplete" });
      return {
        type: "image",
        blob: await canvasBlob(frame),
        width: frame.width,
        height: frame.height,
        duration,
        inferenceFrames: 1,
        inferenceMs: swap.inferenceMs,
        model: swap.model,
      };
    } finally {
      bitmap.close();
    }
  }

  const objectUrl = URL.createObjectURL(targetBlob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;
  try {
    if (video.readyState < 1) await waitEvent(video, "loadedmetadata", signal);
    if (video.readyState < 2) await waitEvent(video, "loadeddata", signal);
    const safeDuration = Math.max(0.1, Math.min(MAX_VIDEO_SECONDS, Number(duration) || video.duration || 0.1));
    const safeFps = Math.max(2, Math.min(12, Number(fps) || DEFAULT_FPS));
    const count = Math.max(2, Math.ceil(safeDuration * safeFps));
    const times = Array.from({ length: count }, (_, index) => (
      sourceStart + Math.min(safeDuration - 0.001, index / safeFps)
    ));
    const reader = await createFrameReader(targetBlob, times, signal);
    const frame = document.createElement("canvas");
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    const frameContext = frame.getContext("2d", { alpha: false });
    const analysis = document.createElement("canvas");
    const analysisScale = Math.min(1, 720 / Math.max(frame.width, frame.height));
    analysis.width = Math.max(2, Math.round(frame.width * analysisScale));
    analysis.height = Math.max(2, Math.round(frame.height * analysisScale));
    const analysisContext = analysis.getContext("2d", { alpha: false, willReadFrequently: true });
    const anchorEvery = Math.max(1, Math.round(safeFps / Math.max(0.5, anchorFps)));
    const blobs = [];
    const keyframeTimes = [];
    let previousBox = null;
    let five = null;
    let flowInitialized = false;
    let acceptedFrames = 0;
    let inferenceFrames = 0;
    let inferenceMs = 0;
    let modelName = "";
    try {
      for (let index = 0; index < times.length; index += 1) {
        throwIfAborted(signal);
        const decoded = await reader?.next();
        if (!decoded) await seek(video, times[index], signal);
        frameContext.drawImage(decoded || video, 0, 0, frame.width, frame.height);
        analysisContext.drawImage(decoded || video, 0, 0, analysis.width, analysis.height);
        const rgba = analysisContext.getImageData(0, 0, analysis.width, analysis.height).data;
        const isAnchor = index === 0 || index % anchorEvery === 0 || !five;
        if (isAnchor) {
          let detected = await detectFaces({
            worker,
            source: analysis,
            requestId,
            signal,
          });
          if (!previousBox) detected = detected.filter(isCompleteFace);
          const selected = chooseFace(detected, previousBox, !previousBox);
          if (selected) {
            five = selected.five;
            previousBox = selected.box;
            const points = fiveToPointBuffer(five, analysis.width, analysis.height);
            await requestFlow("init", {
              width: analysis.width,
              height: analysis.height,
              rgba: new Uint8ClampedArray(rgba).buffer,
              points: points.buffer,
            }, signal);
            flowInitialized = true;
          } else {
            five = null;
          }
        } else if (flowInitialized) {
          const tracked = await requestFlow("step", {
            rgba: new Uint8ClampedArray(rgba).buffer,
          }, signal);
          if (tracked.accepted >= 4 && tracked.forwardBackwardError <= 3.5) {
            five = pointBufferToFive(new Float32Array(tracked.points), analysis.width, analysis.height);
          } else {
            five = null;
          }
        }
        if (five) {
          const swap = await swapFaceFrame({ worker, frameCanvas: frame, five, requestId, signal });
          inferenceFrames += 1;
          inferenceMs += Number(swap.inferenceMs) || 0;
          modelName = swap.model || modelName;
          acceptedFrames += 1;
        }
        blobs.push(await canvasBlob(frame, "image/webp", 0.92));
        keyframeTimes.push(index / safeFps);
        onProgress?.({
          progress: ((index + 1) / times.length) * 100,
          phaseKey: five ? "faceSwapFrameProgress" : "faceSwapFrameSkipped",
          phaseParams: { current: index + 1, total: times.length },
        });
      }
    } finally {
      await reader?.dispose();
      if (flowInitialized) await requestFlow("dispose", {}, signal).catch(() => {});
    }
    if (!acceptedFrames) throw new Error("目标视频中没有稳定锁定到可换脸的人脸。");
    return {
      type: "video-frames",
      blobs,
      keyframeTimes,
      width: frame.width,
      height: frame.height,
      fps: safeFps,
      duration: safeDuration,
      acceptedFrames,
      inferenceFrames,
      inferenceMs,
      model: modelName || "mobilefaceswap-224",
      totalFrames: times.length,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function disposeFaceSwapRuntime() {
  flowWorker?.terminate();
  flowWorker = null;
  flowReadyPromise = null;
  pendingFlow.forEach(({ reject }) => reject(new Error("人脸光流运行时已关闭。")));
  pendingFlow.clear();
}
