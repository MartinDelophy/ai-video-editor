import {
  MODNET_MODEL_ID,
  MODNET_MODEL_LABEL,
  MODNET_MODEL_REVISION,
  YOLOS_TINY_MODEL_ID,
  YOLOS_TINY_MODEL_LABEL,
  YOLOS_TINY_MODEL_REVISION,
} from "../config/models.js";
import { normalizeDetections, selectPrimarySubject } from "../lib/visualGeometry.js";

let transformersPromise = null;
let detectorPromise = null;
let backgroundRemoverPromise = null;
let analysisQueue = Promise.resolve();

const canceledRequests = new Set();

function clampProgress(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

function isCanceled(requestId) {
  return canceledRequests.has(requestId);
}

function postProgress(requestId, progress, phase) {
  if (isCanceled(requestId)) {
    return;
  }

  self.postMessage({
    type: "progress",
    requestId,
    progress: clampProgress(progress),
    phase,
  });
}

function createModelLoadProgressCallback(requestId, { start, end, label }) {
  const progressByFile = new Map();
  let lastReported = start;

  return (event) => {
    if (isCanceled(requestId)) {
      return;
    }

    const rawProgress = Number(event?.progress);
    if (!Number.isFinite(rawProgress)) {
      return;
    }

    const fileKey = event.file ?? event.name ?? event.url ?? "__model__";
    progressByFile.set(fileKey, clampProgress(rawProgress));
    const values = Array.from(progressByFile.values());
    const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const nextProgress = Math.round(start + (average / 100) * (end - start));
    if (nextProgress <= lastReported) {
      return;
    }

    lastReported = nextProgress;
    postProgress(requestId, nextProgress, `下载或读取 ${label} ONNX`);
  };
}

function getTransformers() {
  transformersPromise ??= import("@huggingface/transformers").then((transformers) => {
    if (transformers.env?.backends?.onnx?.wasm) {
      transformers.env.backends.onnx.wasm.numThreads = 1;
    }
    return transformers;
  });
  return transformersPromise;
}

async function getDetector(requestId) {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { pipeline } = await getTransformers();
      return pipeline("object-detection", YOLOS_TINY_MODEL_ID, {
        device: "wasm",
        dtype: "q8",
        revision: YOLOS_TINY_MODEL_REVISION,
        progress_callback: createModelLoadProgressCallback(requestId, {
          start: 8,
          end: 48,
          label: YOLOS_TINY_MODEL_LABEL,
        }),
      });
    })().catch((error) => {
      detectorPromise = null;
      throw error;
    });
  } else {
    postProgress(requestId, 48, `${YOLOS_TINY_MODEL_LABEL} 已就绪`);
  }

  return detectorPromise;
}

async function getBackgroundRemover(requestId) {
  if (!backgroundRemoverPromise) {
    backgroundRemoverPromise = (async () => {
      const { pipeline } = await getTransformers();
      return pipeline("background-removal", MODNET_MODEL_ID, {
        device: "wasm",
        dtype: "q8",
        revision: MODNET_MODEL_REVISION,
        progress_callback: createModelLoadProgressCallback(requestId, {
          start: 62,
          end: 88,
          label: MODNET_MODEL_LABEL,
        }),
      });
    })().catch((error) => {
      backgroundRemoverPromise = null;
      throw error;
    });
  } else {
    postProgress(requestId, 88, `${MODNET_MODEL_LABEL} 已就绪`);
  }

  return backgroundRemoverPromise;
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "视觉主体分析失败";
}

function getMatteSubject(cutoutImage, sourceSize) {
  const channels = Number(cutoutImage?.channels) || 0;
  const data = cutoutImage?.data;
  const width = Number(cutoutImage?.width) || 0;
  const height = Number(cutoutImage?.height) || 0;
  if (!data || !width || !height || (channels !== 2 && channels !== 4)) {
    return null;
  }

  const alphaOffset = channels - 1;
  const alphaThreshold = 24;
  let xmin = width;
  let ymin = height;
  let xmax = -1;
  let ymax = -1;
  let foregroundPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + alphaOffset];
      if (alpha < alphaThreshold) {
        continue;
      }
      foregroundPixels += 1;
      xmin = Math.min(xmin, x);
      ymin = Math.min(ymin, y);
      xmax = Math.max(xmax, x);
      ymax = Math.max(ymax, y);
    }
  }

  const matteCoverage = foregroundPixels / Math.max(1, width * height);
  if (xmax < xmin || ymax < ymin || matteCoverage < 0.004 || matteCoverage > 0.96) {
    return null;
  }

  return {
    label: "foreground",
    score: Math.max(0.58, Math.min(0.96, 0.72 + Math.sqrt(matteCoverage) * 0.24)),
    box: {
      xmin: xmin / sourceSize.width,
      ymin: ymin / sourceSize.height,
      xmax: (xmax + 1) / sourceSize.width,
      ymax: (ymax + 1) / sourceSize.height,
    },
    source: "modnet",
    matteCoverage,
  };
}

function mergePortraitSubject(detectedSubject, matteSubject) {
  if (!detectedSubject) {
    return matteSubject;
  }
  if (!matteSubject || String(detectedSubject.label).toLowerCase() !== "person") {
    return detectedSubject;
  }

  return {
    ...detectedSubject,
    box: {
      xmin: Math.min(detectedSubject.box.xmin, matteSubject.box.xmin),
      ymin: Math.min(detectedSubject.box.ymin, matteSubject.box.ymin),
      xmax: Math.max(detectedSubject.box.xmax, matteSubject.box.xmax),
      ymax: Math.max(detectedSubject.box.ymax, matteSubject.box.ymax),
    },
    matteCoverage: matteSubject.matteCoverage,
  };
}

async function analyzeVisual(message) {
  const {
    requestId,
    imageBlob,
    removeBackground = false,
    threshold = 0.35,
    preferredLabels = ["person"],
  } = message;

  if (!(imageBlob instanceof Blob) || imageBlob.size <= 0) {
    throw new Error("没有可分析的图片数据。");
  }

  postProgress(requestId, 3, "解码视觉素材");
  const { RawImage } = await getTransformers();
  const image = await RawImage.read(imageBlob);
  const sourceSize = {
    width: Math.max(1, Number(image.width) || 1),
    height: Math.max(1, Number(image.height) || 1),
  };

  if (isCanceled(requestId)) {
    return;
  }

  const detector = await getDetector(requestId);
  postProgress(requestId, 52, `使用 ${YOLOS_TINY_MODEL_LABEL} 识别主体`);
  const rawDetections = await detector(image, {
    threshold: Math.max(0.01, Math.min(0.99, Number(threshold) || 0.35)),
    percentage: false,
  });
  const detections = normalizeDetections(rawDetections, sourceSize)
    .map((detection) => ({
      label: detection.label,
      score: detection.score,
      box: {
        xmin: detection.box.xMin,
        ymin: detection.box.yMin,
        xmax: detection.box.xMax,
        ymax: detection.box.yMax,
      },
    }))
    .sort((left, right) => right.score - left.score);
  const rankedSubject = selectPrimarySubject(detections, { preferredLabels });
  let subject = rankedSubject
    ? {
        label: rankedSubject.label,
        score: rankedSubject.score,
        box: {
          xmin: rankedSubject.box.xMin,
          ymin: rankedSubject.box.yMin,
          xmax: rankedSubject.box.xMax,
          ymax: rankedSubject.box.yMax,
        },
      }
    : null;
  postProgress(
    requestId,
    removeBackground ? 60 : 96,
    subject ? `已识别主体：${subject.label}` : "未识别到高置信度主体",
  );

  if (isCanceled(requestId)) {
    return;
  }

  let cutoutBlob = null;
  let matteSubject = null;
  if (removeBackground) {
    const backgroundRemover = await getBackgroundRemover(requestId);
    postProgress(requestId, 90, `使用 ${MODNET_MODEL_LABEL} 生成透明抠图`);
    const cutoutImages = await backgroundRemover(image);
    const cutoutImage = Array.isArray(cutoutImages) ? cutoutImages[0] : cutoutImages;
    if (!cutoutImage) {
      throw new Error(`${MODNET_MODEL_LABEL} 没有返回有效抠图。`);
    }
    matteSubject = getMatteSubject(cutoutImage, sourceSize);
    subject = mergePortraitSubject(subject, matteSubject);
    if (!detections.length && matteSubject) {
      detections.push(matteSubject);
    }
    cutoutBlob = await cutoutImage.toBlob("image/png");
    if (!(cutoutBlob instanceof Blob) || cutoutBlob.size <= 0) {
      throw new Error(`${MODNET_MODEL_LABEL} 透明 PNG 生成失败。`);
    }
    postProgress(requestId, 97, "透明抠图已生成");
  }

  if (isCanceled(requestId)) {
    return;
  }

  postProgress(requestId, 100, "视觉主体分析完成");
  self.postMessage({
    type: "result",
    requestId,
    result: {
      sourceSize,
      detections,
      subject,
      matteSubject,
      cutoutBlob,
      modelIds: {
        detector: YOLOS_TINY_MODEL_ID,
        matting: removeBackground ? MODNET_MODEL_ID : null,
      },
      modelRevisions: {
        detector: YOLOS_TINY_MODEL_REVISION,
        matting: removeBackground ? MODNET_MODEL_REVISION : null,
      },
    },
  });
}

function enqueueAnalysis(message) {
  analysisQueue = analysisQueue.then(async () => {
    try {
      if (!isCanceled(message.requestId)) {
        await analyzeVisual(message);
      }
    } catch (error) {
      if (!isCanceled(message.requestId)) {
        self.postMessage({
          type: "error",
          requestId: message.requestId,
          error: getErrorMessage(error),
        });
      }
    } finally {
      canceledRequests.delete(message.requestId);
    }
  });
}

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "cancel") {
    if (message.requestId) {
      canceledRequests.add(message.requestId);
    }
    return;
  }

  if (message?.type === "analyze" && message.requestId) {
    enqueueAnalysis(message);
  }
});
