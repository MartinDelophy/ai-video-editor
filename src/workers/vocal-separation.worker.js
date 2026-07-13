const MODEL_URL = "https://huggingface.co/haixin/timeline-studio-vocal-remover/resolve/main/model.json";
const CHUNK_SIZE = 31744;
const PADDING = 3072;
const FFT_SIZE = 6144;
const HOP_SIZE = 1024;

let modelPromise;
let runtimePromise;
let activeBackend = "webgl";

function postProgress(requestId, progress, phase) {
  self.postMessage({ type: "progress", requestId, progress, phase });
}

async function getRuntime() {
  runtimePromise ??= (async () => {
    try {
      importScripts("/vendor/vocal-remover/tf.min.js?v=4.22.0");
      if (self.navigator.gpu) importScripts("/vendor/vocal-remover/tf-backend-webgpu.js?v=4.22.0");
    } catch {
      throw new Error("VOCAL_RUNTIME_DOWNLOAD_FAILED");
    }
    return self.tf;
  })();
  return runtimePromise;
}

async function getModel(runtime) {
  modelPromise ??= (async () => {
    const requestedBackend = self.navigator.gpu && runtime.findBackend("webgpu") ? "webgpu" : "webgl";
    let ready;
    try { ready = await runtime.setBackend(requestedBackend); } catch { ready = false; }
    if (!ready && requestedBackend === "webgpu") ready = await runtime.setBackend("webgl");
    if (!ready) throw new Error("VOCAL_BACKEND_UNAVAILABLE");
    activeBackend = runtime.getBackend();
    await runtime.ready();
    return runtime.loadGraphModel(MODEL_URL);
  })();
  return modelPromise;
}

function stft(runtime, input) {
  return runtime.tidy(() => {
    const spectrum = runtime.signal.stft(input, FFT_SIZE, HOP_SIZE, FFT_SIZE, (length) => runtime.signal.hannWindow(length));
    const real = runtime.real(spectrum).slice([0, 0], [32, 3072]).transpose();
    const imag = runtime.imag(spectrum).slice([0, 0], [32, 3072]).transpose();
    const output = runtime.stack([real, imag], 0);
    return runtime.where(runtime.isNaN(output), runtime.zerosLike(output), output);
  });
}

function createHannWindow() {
  const window = new Float32Array(FFT_SIZE);
  for (let index = 0; index < FFT_SIZE; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / FFT_SIZE);
  }
  return window;
}

const hannWindow = createHannWindow();

async function inverseChannel(runtime, spectrogram) {
  const frames = spectrogram.shape[1];
  const timeFrames = runtime.tidy(() => {
    const frameMajor = spectrogram.transpose([1, 0, 2]);
    const real = frameMajor.slice([0, 0, 0], [-1, -1, 1]).squeeze([2]);
    const imag = frameMajor.slice([0, 0, 1], [-1, -1, 1]).squeeze([2]);
    return runtime.spectral.irfft(runtime.complex(real, imag));
  });
  const samples = await timeFrames.data();
  timeFrames.dispose();

  const output = new Float32Array(FFT_SIZE + HOP_SIZE * (frames - 1));
  for (let frame = 0; frame < frames; frame += 1) {
    const sourceOffset = frame * FFT_SIZE;
    const outputOffset = frame * HOP_SIZE;
    for (let cursor = 0; cursor < FFT_SIZE; cursor += 1) {
      output[outputOffset + cursor] += samples[sourceOffset + cursor] * hannWindow[cursor];
    }
  }
  return output;
}

async function istft(runtime, tensor) {
  const padded = runtime.pad(tensor, [[0, 0], [0, 0], [0, 1], [0, 0]]);
  const shaped = padded.reshape([2, 2, 3073, 32]).transpose([0, 2, 3, 1]);
  const left = shaped.slice([0, 0, 0, 0], [1, -1, -1, -1]).squeeze([0]);
  const right = shaped.slice([1, 0, 0, 0], [1, -1, -1, -1]).squeeze([0]);
  const result = await Promise.all([inverseChannel(runtime, left), inverseChannel(runtime, right)]);
  runtime.dispose([padded, shaped, left, right]);
  return result;
}

function wavBuffer(channels, sampleRate) {
  const frames = channels[0].length;
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, frames * 4, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) for (let channel = 0; channel < 2; channel += 1) {
    const sample = Math.max(-1, Math.min(1, channels[channel][frame] || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2;
  }
  return buffer;
}

async function separate(requestId, left, right, sampleRate) {
  const runtime = await getRuntime();
  postProgress(requestId, 4, { key: "vocalSeparationLoadingModel" });
  const model = await getModel(runtime);
  postProgress(requestId, 7, { key: activeBackend === "webgpu" ? "vocalSeparationUsingWebGpu" : "vocalSeparationUsingWebGl" });
  const accompaniment = [[], []];
  const vocals = [[], []];
  const chunks = Math.ceil(left.length / CHUNK_SIZE);
  for (let index = 0; index < chunks; index += 1) {
    const start = index * CHUNK_SIZE;
    const valid = Math.min(CHUNK_SIZE, left.length - start);
    const paddedLeft = new Float32Array(CHUNK_SIZE + PADDING * 2); paddedLeft.set(left.subarray(start, start + valid), PADDING);
    const paddedRight = new Float32Array(CHUNK_SIZE + PADDING * 2); paddedRight.set(right.subarray(start, start + valid), PADDING);
    const input = runtime.tidy(() => {
      const l = stft(runtime, runtime.tensor1d(paddedLeft));
      const r = stft(runtime, runtime.tensor1d(paddedRight));
      return runtime.stack([l, r], 3).transpose([0, 3, 1, 2]).reshape([1, 4, 3072, 32]);
    });
    const musicTensor = model.predict(input);
    const vocalTensor = runtime.sub(input, musicTensor);
    const [music, voice] = await Promise.all([istft(runtime, musicTensor), istft(runtime, vocalTensor)]);
    for (let channel = 0; channel < 2; channel += 1) {
      accompaniment[channel].push(...music[channel].slice(PADDING, PADDING + valid));
      vocals[channel].push(...voice[channel].slice(PADDING, PADDING + valid));
    }
    runtime.dispose([input, musicTensor, vocalTensor]);
    postProgress(requestId, 8 + Math.round(((index + 1) / chunks) * 88), {
      key: "vocalSeparationProcessingChunk", current: index + 1, total: chunks,
    });
  }
  const vocalsBuffer = wavBuffer(vocals, sampleRate);
  const accompanimentBuffer = wavBuffer(accompaniment, sampleRate);
  self.postMessage(
    { type: "result", requestId, vocalsBuffer, accompanimentBuffer, backend: activeBackend },
    [vocalsBuffer, accompanimentBuffer],
  );
}

self.addEventListener("message", async ({ data }) => {
  if (data?.type !== "separate") return;
  try {
    await separate(
      data.requestId,
      new Float32Array(data.leftBuffer),
      new Float32Array(data.rightBuffer),
      data.sampleRate,
    );
  } catch (error) {
    self.postMessage({ type: "error", requestId: data.requestId, error: error?.message || "VOCAL_MODEL_FAILED" });
  }
});
