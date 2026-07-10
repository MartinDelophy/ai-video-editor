import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

import { LIVE_PORTRAIT_WEB_MODEL, getLivePortraitModelUrl } from "../config/livePortrait.js";

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };

const tensor = (data, dims) => new ort.Tensor("float32", data, dims);

function postProgress(progress, phase) {
  self.postMessage({ type: "progress", progress: Math.max(0, Math.min(100, Math.round(progress))), phase });
}

function resolveModelUrl(file, modelBaseUrl) {
  return modelBaseUrl
    ? new URL(file, new URL(modelBaseUrl, self.location.origin)).href
    : getLivePortraitModelUrl(file);
}

async function fetchModel(key, file, modelBaseUrl, completedBytes, totalBytes) {
  const files = Array.isArray(file) ? file : [file];
  const parts = [];
  let loaded = 0;
  for (const partFile of files) {
    const response = await fetch(resolveModelUrl(partFile, modelBaseUrl));
    if (!response.ok) throw new Error(`${partFile} 下载失败（HTTP ${response.status}）`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    parts.push(bytes);
    loaded += bytes.byteLength;
    postProgress(5 + ((completedBytes + loaded) / totalBytes) * 55, `下载 ${key}`);
  }
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined.buffer;
}

async function loadSession(key, modelBaseUrl, downloadState, executionProvider = "wasm") {
  const file = LIVE_PORTRAIT_WEB_MODEL.files[key];
  const bytes = LIVE_PORTRAIT_WEB_MODEL.knownArtifacts[key]?.bytes ?? 0;
  const model = await fetchModel(key, file, modelBaseUrl, downloadState.completed, downloadState.total);
  downloadState.completed += bytes;
  postProgress(5 + (downloadState.completed / downloadState.total) * 55, `初始化 ${key}`);
  if (executionProvider === "webgpu" && !self.navigator?.gpu) {
    throw new Error("当前浏览器没有可用的 WebGPU，无法运行全 GPU LivePortrait");
  }
  const provider = executionProvider === "webgpu" && key === "generatorWebGpu"
    ? { name: "webgpu", preferredLayout: "NHWC" }
    : executionProvider;
  return ort.InferenceSession.create(model, { executionProviders: [provider], graphOptimizationLevel: "all" });
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

async function outputToBlob(output) {
  const [, , height, width] = output.dims;
  const plane = width * height;
  const rgba = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i += 1) {
    rgba[i * 4] = Math.round(Math.max(0, Math.min(1, output.data[i])) * 255);
    rgba[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, output.data[plane + i])) * 255);
    rgba[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, output.data[plane * 2 + i])) * 255);
    rgba[i * 4 + 3] = 255;
  }
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
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

async function generateVideo({ portraitBlob, motionBuffer, modelBaseUrl, joyVasaModelBaseUrl, webGpuModelBaseUrl, renderFps = 8 }) {
  postProgress(2, "准备肖像与真实口型运动");
  const image = await preprocessPortrait(portraitBlob);
  const keys = ["appearanceFeatureExtractorWebGpu", "motionExtractorWebGpu", "stitchingWebGpu", "generatorWebGpu"];
  const downloadState = { completed: 0, total: keys.reduce((sum, key) => sum + (LIVE_PORTRAIT_WEB_MODEL.knownArtifacts[key]?.bytes ?? 0), 0) };
  const sessions = {};
  for (const key of keys) {
    sessions[key] = await loadSession(
      key,
      webGpuModelBaseUrl,
      downloadState,
      "webgpu",
    );
  }
  const templateResponse = await fetch(new URL("joyvasa-motion-template.json", new URL(joyVasaModelBaseUrl, self.location.origin)));
  if (!templateResponse.ok) throw new Error(`JoyVASA 运动模板下载失败（HTTP ${templateResponse.status}）`);
  const template = await templateResponse.json();
  const coefficients = new Float32Array(motionBuffer);

  postProgress(63, "提取人物 3D 特征");
  const feature = (await sessions.appearanceFeatureExtractorWebGpu.run({ img: image })).output;
  const sourceMotion = await sessions.motionExtractorWebGpu.run({ img: image });
  const source = transformKeypoints(sourceMotion);
  const initialDriving = decodeJoyVasaFrame(coefficients, 0, template);
  const frameCount = Math.ceil(4 * renderFps);
  const blobs = [];
  for (let outputFrame = 0; outputFrame < frameCount; outputFrame += 1) {
    const motionFrame = Math.min(99, Math.round((outputFrame / renderFps) * 25));
    const driving = decodeJoyVasaFrame(coefficients, motionFrame, template);
    const rawDriving = buildDrivingKeypoints(sourceMotion, source, driving, initialDriving);
    const stitched = await (async () => {
      const input = new Float32Array(126);
      input.set(source);
      input.set(rawDriving, 63);
      const result = await sessions.stitchingWebGpu.run({ input: tensor(input, [1, 126]) });
      const value = new Float32Array(rawDriving);
      for (let i = 0; i < 63; i += 1) value[i] += result.output.data[i];
      for (let point = 0; point < 21; point += 1) {
        value[point * 3] += result.output.data[63];
        value[point * 3 + 1] += result.output.data[64];
      }
      return value;
    })();
    const inferenceStarted = performance.now();
    const generated = await sessions.generatorWebGpu.run({
      feature_3d: feature,
      kp_source: tensor(source, [1, 21, 3]),
      kp_driving: tensor(stitched, [1, 21, 3]),
    });
    const inferenceMs = performance.now() - inferenceStarted;
    postProgress(68 + (outputFrame / frameCount) * 31, `WebGPU 帧 ${outputFrame + 1}/${frameCount} · ${(inferenceMs / 1000).toFixed(1)}s`);
    const encodeStarted = performance.now();
    blobs.push(await outputToBlob(generated.out));
    const encodeMs = performance.now() - encodeStarted;
    postProgress(68 + ((outputFrame + 1) / frameCount) * 31, `完成帧 ${outputFrame + 1}/${frameCount} · 编码 ${(encodeMs / 1000).toFixed(1)}s`);
  }
  postProgress(100, "真实口型帧生成完成");
  self.postMessage({ type: "videoFrames", blobs, width: 512, height: 512, fps: renderFps, duration: 4 });
}

async function generate({ portraitBlob, modelBaseUrl }) {
  postProgress(2, "准备肖像");
  const image = await preprocessPortrait(portraitBlob);
  const keys = ["appearanceFeatureExtractor", "motionExtractor", "stitchingLip", "stitching", "warping", "spadeGenerator"];
  const downloadState = {
    completed: 0,
    total: keys.reduce((sum, key) => sum + (LIVE_PORTRAIT_WEB_MODEL.knownArtifacts[key]?.bytes ?? 0), 0),
  };
  const sessions = {};
  for (const key of keys) sessions[key] = await loadSession(key, modelBaseUrl, downloadState);

  postProgress(63, "提取人物特征");
  const feature = (await sessions.appearanceFeatureExtractor.run({ img: image })).output;
  const motion = await sessions.motionExtractor.run({ img: image });
  const source = transformKeypoints(motion);
  const driving = await retargetAndStitch(sessions.stitchingLip, sessions.stitching, source, 0.35);

  postProgress(70, "计算 3D 形变（可能需要约 1 分钟）");
  const warped = await sessions.warping.run({
    feature_3d: feature,
    kp_source: tensor(source, [1, 21, 3]),
    kp_driving: tensor(driving, [1, 21, 3]),
  });
  postProgress(86, "渲染 512×512 人像");
  const generated = await sessions.spadeGenerator.run({ input: warped["879"] });
  const blob = await outputToBlob(generated.output);
  postProgress(100, "单帧验收完成");
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
