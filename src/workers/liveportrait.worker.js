import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

import { LIVE_PORTRAIT_WEB_MODEL, getLivePortraitModelUrl } from "../config/livePortrait.js";
import { evaluateLivePortraitFrameQuality } from "../lib/livePortraitQuality.ts";

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };

const tensor = (data, dims) => new ort.Tensor("float32", data, dims);
const sessionPromises = new Map();
let portraitCache = null;
let motionTemplatePromise = null;
let activeGeneratorKey = null;

function postProgress(progress, phaseKey, phaseParams = {}) {
  self.postMessage({ type: "progress", progress: Math.max(0, Math.min(100, Math.round(progress))), phaseKey, phaseParams });
}

function resolveModelUrl(file, modelBaseUrl) {
  return modelBaseUrl
    ? new URL(file, new URL(modelBaseUrl, self.location.origin)).href
    : getLivePortraitModelUrl(file);
}

async function fetchModel(key, file, modelBaseUrl, completedBytes, totalBytes) {
  const files = Array.isArray(file) ? file : [file];
  let loaded = 0;
  const parts = await Promise.all(files.map(async (partFile) => {
    const response = await fetch(resolveModelUrl(partFile, modelBaseUrl));
    if (!response.ok) throw new Error(`${partFile} 下载失败（HTTP ${response.status}）`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    loaded += bytes.byteLength;
    postProgress(5 + ((completedBytes + loaded) / totalBytes) * 55, "avatarProgressDownloadModel", { model: key });
    return bytes;
  }));
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined.buffer;
}

async function loadSession(key, modelBaseUrl, downloadState, executionProvider = "wasm") {
  const cacheKey = `${executionProvider}:${modelBaseUrl || "project"}:${key}`;
  if (sessionPromises.has(cacheKey)) return sessionPromises.get(cacheKey);
  const promise = createSession(key, modelBaseUrl, downloadState, executionProvider).catch((error) => {
    sessionPromises.delete(cacheKey);
    throw error;
  });
  sessionPromises.set(cacheKey, promise);
  return promise;
}

async function createSession(key, modelBaseUrl, downloadState, executionProvider) {
  const file = LIVE_PORTRAIT_WEB_MODEL.files[key];
  const bytes = LIVE_PORTRAIT_WEB_MODEL.knownArtifacts[key]?.bytes ?? 0;
  const model = await fetchModel(key, file, modelBaseUrl, downloadState.completed, downloadState.total);
  downloadState.completed += bytes;
  postProgress(5 + (downloadState.completed / downloadState.total) * 55, "avatarProgressInitModel", { model: key });
  if (executionProvider === "webgpu" && !self.navigator?.gpu) {
    throw new Error("当前浏览器没有可用的 WebGPU，无法运行全 GPU LivePortrait");
  }
  const provider = executionProvider === "webgpu" && key.startsWith("generator")
    ? { name: "webgpu", preferredLayout: "NHWC" }
    : executionProvider;
  const options = { executionProviders: [provider], graphOptimizationLevel: "all" };
  if (executionProvider === "webgpu" && key === "appearanceFeatureExtractorWebGpu") {
    options.preferredOutputLocation = { output: "gpu-buffer" };
  }
  return ort.InferenceSession.create(model, options);
}

function getMotionTemplate(baseUrl) {
  if (!motionTemplatePromise) {
    motionTemplatePromise = fetch(new URL("joyvasa-motion-template.json", new URL(baseUrl, self.location.origin)))
      .then((response) => {
        if (!response.ok) throw new Error(`JoyVASA 运动模板下载失败（HTTP ${response.status}）`);
        return response.json();
      })
      .catch((error) => {
        motionTemplatePromise = null;
        throw error;
      });
  }
  return motionTemplatePromise;
}

function preprocessPortrait(blob) {
  return createImageBitmap(blob).then((bitmap) => {
    const size = Math.min(bitmap.width, bitmap.height);
    const sx = Math.max(0, (bitmap.width - size) / 2);
    const sy = Math.max(0, (bitmap.height - size) / 2 - size * 0.125);
    const canvas = new OffscreenCanvas(256, 256);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, 256, 256);
    context.drawImage(bitmap, sx, sy, size, size, 0, 0, 256, 256);
    bitmap.close();
    const rgba = context.getImageData(0, 0, 256, 256).data;
    const plane = 256 * 256;
    const chw = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i += 1) {
      const alpha = rgba[i * 4 + 3] / 255;
      chw[i] = (rgba[i * 4] / 255) * alpha;
      chw[plane + i] = (rgba[i * 4 + 1] / 255) * alpha;
      chw[plane * 2 + i] = (rgba[i * 4 + 2] / 255) * alpha;
    }
    return tensor(chw, [1, 3, 256, 256]);
  });
}

function headposeDegree(logits) {
  let max = -Infinity;
  for (const value of logits) max = Math.max(max, value);
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < logits.length; i += 1) {
    const value = Math.exp(logits[i] - max);
    sum += value;
    weighted += value * i;
  }
  return (weighted / sum) * 3 - 97.5;
}

function multiply3x3(a, b) {
  const out = new Float32Array(9);
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) {
    out[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
  }
  return out;
}

function transpose3x3(value) {
  return new Float32Array([value[0], value[3], value[6], value[1], value[4], value[7], value[2], value[5], value[8]]);
}

function rotationMatrix(pitchDegree, yawDegree, rollDegree) {
  const x = pitchDegree * Math.PI / 180;
  const y = yawDegree * Math.PI / 180;
  const z = rollDegree * Math.PI / 180;
  const rx = new Float32Array([1, 0, 0, 0, Math.cos(x), -Math.sin(x), 0, Math.sin(x), Math.cos(x)]);
  const ry = new Float32Array([Math.cos(y), 0, Math.sin(y), 0, 1, 0, -Math.sin(y), 0, Math.cos(y)]);
  const rz = new Float32Array([Math.cos(z), -Math.sin(z), 0, Math.sin(z), Math.cos(z), 0, 0, 0, 1]);
  const value = multiply3x3(rz, multiply3x3(ry, rx));
  return new Float32Array([value[0], value[3], value[6], value[1], value[4], value[7], value[2], value[5], value[8]]);
}

function transformKeypoints(motion) {
  const rotation = rotationMatrix(headposeDegree(motion.pitch.data), headposeDegree(motion.yaw.data), headposeDegree(motion.roll.data));
  const out = new Float32Array(63);
  for (let point = 0; point < 21; point += 1) {
    const offset = point * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      out[offset + axis] = motion.scale.data[0] * (
        motion.kp.data[offset] * rotation[axis]
        + motion.kp.data[offset + 1] * rotation[3 + axis]
        + motion.kp.data[offset + 2] * rotation[6 + axis]
        + motion.exp.data[offset + axis]
      );
    }
    out[offset] += motion.t.data[0];
    out[offset + 1] += motion.t.data[1];
  }
  return out;
}

async function retargetAndStitch(lipSession, stitchingSession, source, targetRatio) {
  const lipInput = new Float32Array(65);
  lipInput.set(source);
  lipInput[63] = 0.05;
  lipInput[64] = targetRatio;
  const lipResult = await lipSession.run({ input: tensor(lipInput, [1, 65]) });
  const driving = new Float32Array(63);
  for (let i = 0; i < 63; i += 1) driving[i] = source[i] + lipResult.output.data[i];
  const stitchInput = new Float32Array(126);
  stitchInput.set(source);
  stitchInput.set(driving, 63);
  const stitchResult = await stitchingSession.run({ input: tensor(stitchInput, [1, 126]) });
  for (let i = 0; i < 63; i += 1) driving[i] += stitchResult.output.data[i];
  for (let point = 0; point < 21; point += 1) {
    driving[point * 3] += stitchResult.output.data[63];
    driving[point * 3 + 1] += stitchResult.output.data[64];
  }
  return driving;
}

async function frameDataToBlob(data, dims) {
  const [, , height, width] = dims;
  const plane = width * height;
  const rgba = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i += 1) {
    rgba[i * 4] = Math.round(Math.max(0, Math.min(1, data[i])) * 255);
    rgba[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, data[plane + i])) * 255);
    rgba[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, data[plane * 2 + i])) * 255);
    rgba[i * 4 + 3] = 255;
  }
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

function outputToBlob(output) {
  return frameDataToBlob(output.data, output.dims);
}

function sampledFrameDistance(data, dims, reference, referenceDims) {
  const [, channels, height, width] = dims;
  const [, referenceChannels, referenceHeight, referenceWidth] = referenceDims;
  const sampleSize = 32;
  let difference = 0;
  let samples = 0;
  for (let channel = 0; channel < Math.min(3, channels, referenceChannels); channel += 1) {
    const planeOffset = channel * width * height;
    const referenceOffset = channel * referenceWidth * referenceHeight;
    for (let row = 0; row < sampleSize; row += 1) {
      const y = Math.min(height - 1, Math.round((row / (sampleSize - 1)) * (height - 1)));
      const referenceY = Math.min(referenceHeight - 1, Math.round((row / (sampleSize - 1)) * (referenceHeight - 1)));
      for (let column = 0; column < sampleSize; column += 1) {
        const x = Math.min(width - 1, Math.round((column / (sampleSize - 1)) * (width - 1)));
        const referenceX = Math.min(referenceWidth - 1, Math.round((column / (sampleSize - 1)) * (referenceWidth - 1)));
        const value = data[planeOffset + y * width + x];
        const referenceValue = reference[referenceOffset + referenceY * referenceWidth + referenceX];
        if (!Number.isFinite(value) || !Number.isFinite(referenceValue)) return Number.POSITIVE_INFINITY;
        difference += Math.abs(value - referenceValue);
        samples += 1;
      }
    }
  }
  return samples ? difference / samples : Number.POSITIVE_INFINITY;
}

function disposeOutputs(result) {
  Object.values(result || {}).forEach((value) => value?.dispose?.());
}

function templateValue(template, key, index = 0) {
  return Array.isArray(template[key]) ? template[key][index] : template[key];
}

function decodeJoyVasaFrame(coefficients, frame, template) {
  const offset = frame * 73;
  const exp = new Float32Array(63);
  for (let i = 0; i < 63; i += 1) exp[i] = coefficients[offset + i] * template.std_exp[i] + template.mean_exp[i];
  const interpolate = (key, value, index = 0) => value * (templateValue(template, `max_${key}`, index) - templateValue(template, `min_${key}`, index)) + templateValue(template, `min_${key}`, index);
  const scale = interpolate("scale", coefficients[offset + 63]);
  const translation = new Float32Array(3);
  for (let i = 0; i < 3; i += 1) translation[i] = interpolate("t", coefficients[offset + 64 + i], i);
  const pitch = interpolate("pitch", coefficients[offset + 67]);
  const yaw = interpolate("yaw", coefficients[offset + 68]);
  const roll = interpolate("roll", coefficients[offset + 69]);
  return { exp, scale, translation, rotation: rotationMatrix(pitch, yaw, roll) };
}

function selectAdaptiveMotionFrames(coefficients, duration, maximumFps) {
  const lastFrame = Math.min(99, Math.max(1, Math.round(duration * 25)));
  const mandatoryGap = 25;
  const selected = new Set([0, lastFrame]);
  for (let frame = mandatoryGap; frame < lastFrame; frame += mandatoryGap) selected.add(frame);

  const candidates = [];
  for (let frame = 1; frame < lastFrame; frame += 1) {
    const offset = frame * 73;
    const previous = (frame - 1) * 73;
    let squared = 0;
    // Expression coefficients dominate visible lip motion; head pose receives
    // a smaller contribution so a quick turn can still request a keyframe.
    for (let index = 0; index < 63; index += 1) {
      const delta = coefficients[offset + index] - coefficients[previous + index];
      squared += delta * delta;
    }
    for (let index = 67; index < 70; index += 1) {
      const delta = coefficients[offset + index] - coefficients[previous + index];
      squared += delta * delta * 0.2;
    }
    candidates.push({ frame, energy: Math.sqrt(squared / 63) });
  }
  const energies = candidates.map(({ energy }) => energy).sort((a, b) => a - b);
  const threshold = energies[Math.floor(energies.length * 0.62)] || 0;
  const maximumCount = Math.max(selected.size, Math.ceil(duration * maximumFps) + 1);
  for (const candidate of candidates.sort((a, b) => b.energy - a.energy)) {
    if (selected.size >= maximumCount || candidate.energy < threshold) break;
    const separated = [...selected].every((frame) => Math.abs(frame - candidate.frame) >= 8);
    if (separated) selected.add(candidate.frame);
  }
  return [...selected].sort((a, b) => a - b);
}

function buildDrivingKeypoints(motion, source, driving, initialDriving) {
  const sourceRotation = rotationMatrix(headposeDegree(motion.pitch.data), headposeDegree(motion.yaw.data), headposeDegree(motion.roll.data));
  const relativeRotation = multiply3x3(multiply3x3(driving.rotation, transpose3x3(initialDriving.rotation)), sourceRotation);
  const lipPoints = new Set([6, 12, 14, 17, 19, 20]);
  const output = new Float32Array(63);
  for (let point = 0; point < 21; point += 1) {
    const base = point * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      const relativeExpression = motion.exp.data[base + axis] + driving.exp[base + axis] - initialDriving.exp[base + axis];
      const expression = lipPoints.has(point) ? driving.exp[base + axis] : relativeExpression;
      const canonical = motion.kp.data[base] * relativeRotation[axis]
        + motion.kp.data[base + 1] * relativeRotation[3 + axis]
        + motion.kp.data[base + 2] * relativeRotation[6 + axis];
      output[base + axis] = motion.scale.data[0] * (driving.scale / initialDriving.scale) * (canonical + expression);
    }
    output[base] += motion.t.data[0] + driving.translation[0] - initialDriving.translation[0];
    output[base + 1] += motion.t.data[1] + driving.translation[1] - initialDriving.translation[1];
  }
  return output;
}

async function generateVideo({
  portraitBlob,
  motionBuffer,
  modelBaseUrl,
  joyVasaModelBaseUrl,
  webGpuModelBaseUrl,
  quality = "preview",
  renderFps = 8,
  neuralFps = 2,
  duration = 4,
  portraitKey = "",
}) {
  postProgress(2, "avatarProgressPreparePortraitMotion");
  const image = await preprocessPortrait(portraitBlob);
  const preferredGeneratorKey = quality === "quality" ? "generatorQualityFp16" : "generatorPreviewFp16";
  if (activeGeneratorKey && activeGeneratorKey !== preferredGeneratorKey) {
    for (const [cacheKey, promise] of sessionPromises.entries()) {
      if (!cacheKey.endsWith(`:${activeGeneratorKey}`)) continue;
      sessionPromises.delete(cacheKey);
      const session = await promise.catch(() => null);
      session?.release();
    }
  }
  activeGeneratorKey = preferredGeneratorKey;
  const keys = ["appearanceFeatureExtractorWebGpu", "motionExtractorWebGpu", "stitchingWebGpu", preferredGeneratorKey];
  const downloadState = { completed: 0, total: keys.reduce((sum, key) => sum + (LIVE_PORTRAIT_WEB_MODEL.knownArtifacts[key]?.bytes ?? 0), 0) };
  const sessions = {};
  for (const key of keys) sessions[key] = await loadSession(key, webGpuModelBaseUrl, downloadState, "webgpu");
  const template = await getMotionTemplate(joyVasaModelBaseUrl);
  const coefficients = new Float32Array(motionBuffer);

  postProgress(63, "avatarProgressExtract3d");
  let feature;
  let sourceMotion;
  let portraitPixels;
  if (portraitKey && portraitCache?.key === portraitKey) {
    ({ feature, sourceMotion, portraitPixels } = portraitCache);
    image.dispose();
    postProgress(66, "avatarProgressReuseGpuFeature");
  } else {
    portraitPixels = new Float32Array(image.data);
    feature = (await sessions.appearanceFeatureExtractorWebGpu.run({ img: image })).output;
    sourceMotion = await sessions.motionExtractorWebGpu.run({ img: image });
    image.dispose();
    if (portraitCache) {
      portraitCache.feature.dispose();
      Object.values(portraitCache.sourceMotion).forEach((value) => value?.dispose?.());
    }
    portraitCache = { key: portraitKey, feature, sourceMotion, portraitPixels };
  }
  const source = transformKeypoints(sourceMotion);
  const sourceTensor = tensor(source, [1, 21, 3]);
  const stitchInput = new Float32Array(126);
  const stitchTensor = tensor(stitchInput, [1, 126]);
  const drivingInput = new Float32Array(63);
  const drivingTensor = tensor(drivingInput, [1, 21, 3]);
  const initialDriving = decodeJoyVasaFrame(coefficients, 0, template);
  const safeDuration = Math.max(0.25, Math.min(4, Number(duration) || 4));
  const safeOutputFps = Math.max(1, Math.min(30, Number(renderFps) || 8));
  const safeNeuralFps = Math.max(1, Math.min(safeOutputFps, Number(neuralFps) || 2));
  const motionFrames = selectAdaptiveMotionFrames(coefficients, safeDuration, safeNeuralFps);
  const frameCount = motionFrames.length;
  const blobs = [];
  let previousFramePixels = null;
  let previousFrameDims = null;
  for (let outputFrame = 0; outputFrame < frameCount; outputFrame += 1) {
    const motionFrame = motionFrames[outputFrame];
    const frameTime = Math.min(safeDuration, motionFrame / 25);
    const driving = decodeJoyVasaFrame(coefficients, motionFrame, template);
    const rawDriving = buildDrivingKeypoints(sourceMotion, source, driving, initialDriving);
    stitchInput.set(source);
    stitchInput.set(rawDriving, 63);
    const stitchResult = await sessions.stitchingWebGpu.run({ input: stitchTensor });
    drivingInput.set(rawDriving);
    for (let i = 0; i < 63; i += 1) drivingInput[i] += stitchResult.output.data[i];
    for (let point = 0; point < 21; point += 1) {
      drivingInput[point * 3] += stitchResult.output.data[63];
      drivingInput[point * 3 + 1] += stitchResult.output.data[64];
    }
    disposeOutputs(stitchResult);
    let acceptedPixels = null;
    let acceptedDims = null;
    let inferenceMs = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inferenceStarted = performance.now();
      const generated = await sessions[preferredGeneratorKey].run({
        feature_3d: feature,
        kp_source: sourceTensor,
        kp_driving: drivingTensor,
      });
      inferenceMs += performance.now() - inferenceStarted;
      const output = generated.out;
      const pixels = new Float32Array(output.data);
      const dims = [...output.dims];
      const reference = previousFramePixels || portraitPixels;
      const referenceDims = previousFrameDims || [1, 3, 256, 256];
      const distance = sampledFrameDistance(pixels, dims, reference, referenceDims);
      disposeOutputs(generated);
      const frameQuality = evaluateLivePortraitFrameQuality(
        pixels,
        distance,
        Boolean(previousFramePixels),
      );
      if (frameQuality.accepted) {
        acceptedPixels = pixels;
        acceptedDims = dims;
        break;
      }
      console.warn("LivePortrait generated frame rejected", frameQuality);
      postProgress(68 + (outputFrame / frameCount) * 31, "avatarProgressRetryCorruptFrame", { current: outputFrame + 1, total: frameCount, attempt: attempt + 1 });
    }
    postProgress(68 + (outputFrame / frameCount) * 31, "avatarProgressKeyframe", { current: outputFrame + 1, total: frameCount, seconds: (inferenceMs / 1000).toFixed(1) });
    const encodeStarted = performance.now();
    if (acceptedPixels) {
      blobs.push(await frameDataToBlob(acceptedPixels, acceptedDims));
      previousFramePixels = acceptedPixels;
      previousFrameDims = acceptedDims;
    } else if (blobs.length) {
      blobs.push(blobs[blobs.length - 1]);
      postProgress(68 + (outputFrame / frameCount) * 31, "avatarProgressDroppedCorruptFrame", { current: outputFrame + 1, total: frameCount });
    } else {
      throw new Error("WebGPU 首帧连续异常，已阻止损坏画面写入视频；请释放其他 GPU 页面后重试");
    }
    const encodeMs = performance.now() - encodeStarted;
    postProgress(68 + ((outputFrame + 1) / frameCount) * 31, "avatarProgressFrameEncoded", { current: outputFrame + 1, total: frameCount, seconds: (encodeMs / 1000).toFixed(1) });
  }
  sourceTensor.dispose();
  stitchTensor.dispose();
  drivingTensor.dispose();
  const size = quality === "quality" ? 512 : 256;
  postProgress(100, "avatarProgressInterpolate");
  self.postMessage({
    type: "videoFrames",
    blobs,
    width: size,
    height: size,
    fps: safeOutputFps,
    keyframeFps: safeNeuralFps,
    keyframeTimes: motionFrames.map((frame) => Math.min(safeDuration, frame / 25)),
    duration: safeDuration,
    quality,
    precision: "mixed-fp16",
  });
}

async function prepare({ webGpuModelBaseUrl, quality = "preview" }) {
  const generator = quality === "quality" ? "generatorQualityFp16" : "generatorPreviewFp16";
  const keys = ["appearanceFeatureExtractorWebGpu", "motionExtractorWebGpu", "stitchingWebGpu", generator];
  const downloadState = { completed: 0, total: keys.reduce((sum, key) => sum + (LIVE_PORTRAIT_WEB_MODEL.knownArtifacts[key]?.bytes ?? 0), 0) };
  for (const key of keys) await loadSession(key, webGpuModelBaseUrl, downloadState, "webgpu");
  self.postMessage({ type: "prepared", quality });
}

async function releaseGpuSessions() {
  if (portraitCache) {
    portraitCache.feature.dispose();
    Object.values(portraitCache.sourceMotion).forEach((value) => value?.dispose?.());
    portraitCache = null;
  }
  const pending = [...sessionPromises.entries()];
  sessionPromises.clear();
  activeGeneratorKey = null;
  for (const [, promise] of pending) {
    const session = await promise.catch(() => null);
    session?.release();
  }
  self.postMessage({ type: "gpuReleased" });
}

async function generate({ portraitBlob, modelBaseUrl }) {
  postProgress(2, "avatarPreparing");
  const image = await preprocessPortrait(portraitBlob);
  const keys = ["appearanceFeatureExtractor", "motionExtractor", "stitchingLip", "stitching", "warping", "spadeGenerator"];
  const downloadState = {
    completed: 0,
    total: keys.reduce((sum, key) => sum + (LIVE_PORTRAIT_WEB_MODEL.knownArtifacts[key]?.bytes ?? 0), 0),
  };
  const sessions = {};
  for (const key of keys) sessions[key] = await loadSession(key, modelBaseUrl, downloadState);

  postProgress(63, "avatarProgressExtractFeature");
  const feature = (await sessions.appearanceFeatureExtractor.run({ img: image })).output;
  const motion = await sessions.motionExtractor.run({ img: image });
  const source = transformKeypoints(motion);
  const driving = await retargetAndStitch(sessions.stitchingLip, sessions.stitching, source, 0.35);

  postProgress(70, "avatarProgressWarp3d");
  const warped = await sessions.warping.run({
    feature_3d: feature,
    kp_source: tensor(source, [1, 21, 3]),
    kp_driving: tensor(driving, [1, 21, 3]),
  });
  postProgress(86, "avatarProgressRenderPortrait");
  const generated = await sessions.spadeGenerator.run({ input: warped["879"] });
  const blob = await outputToBlob(generated.output);
  postProgress(100, "avatarAcceptanceDone");
  self.postMessage({ type: "result", blob, width: 512, height: 512 });
}

async function probe({ modelBaseUrl }) {
  const bytes = LIVE_PORTRAIT_WEB_MODEL.knownArtifacts.stitching.bytes;
  const session = await loadSession("stitching", modelBaseUrl, { completed: 0, total: bytes });
  session.release();
  self.postMessage({ type: "ready", backend: "wasm" });
}

self.onmessage = (event) => {
  const task = event.data?.type === "generateVideo"
    ? generateVideo
    : event.data?.type === "prepare"
      ? prepare
    : event.data?.type === "releaseGpuSessions"
      ? releaseGpuSessions
    : event.data?.type === "generate"
      ? generate
      : event.data?.type === "probe"
        ? probe
        : null;
  if (!task) return;
  task(event.data).catch((error) => {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  });
};
