const MODEL_URL = "https://huggingface.co/haixin/timeline-studio-vocal-remover/resolve/main/model.json";
const CHUNK_SIZE = 31744;
const PADDING = 3072;
const FFT_SIZE = 6144;
const HOP_SIZE = 1024;

let modelPromise;
let runtimePromise;
let activeBackend = "webgl";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { if (window.tf) resolve(); else existing.addEventListener("load", resolve, { once: true }); return; }
    const script = document.createElement("script"); script.src = src; script.crossOrigin = "anonymous";
    script.onload = resolve; script.onerror = () => reject(new Error("VOCAL_RUNTIME_DOWNLOAD_FAILED")); document.head.appendChild(script);
  });
}

async function getRuntime() {
  if (!runtimePromise) runtimePromise = (async () => {
    await loadScript("/vendor/vocal-remover/tf.min.js?v=4.22.0");
    if (navigator.gpu) await loadScript("/vendor/vocal-remover/tf-backend-webgpu.js?v=4.22.0");
    return window.tf;
  })();
  return runtimePromise;
}

async function getModel(tf) {
  if (!modelPromise) {
    modelPromise = (async () => {
      const requestedBackend = navigator.gpu && tf.findBackend("webgpu") ? "webgpu" : "webgl";
      let ready = false;
      try { ready = await tf.setBackend(requestedBackend); } catch { ready = false; }
      if (!ready && requestedBackend === "webgpu") ready = await tf.setBackend("webgl");
      if (!ready) throw new Error("VOCAL_BACKEND_UNAVAILABLE");
      activeBackend = tf.getBackend();
      await tf.ready();
      return tf.loadGraphModel(MODEL_URL);
    })();
  }
  return modelPromise;
}

function stft(tf, input) {
  return tf.tidy(() => {
    const spectrum = tf.signal.stft(input, FFT_SIZE, HOP_SIZE, FFT_SIZE, (length) => tf.signal.hannWindow(length));
    const real = tf.real(spectrum).slice([0, 0], [32, 3072]).transpose();
    const imag = tf.imag(spectrum).slice([0, 0], [32, 3072]).transpose();
    const output = tf.stack([real, imag], 0);
    return tf.where(tf.isNaN(output), tf.zerosLike(output), output);
  });
}

async function inverseChannel(tf, spectrogram) {
  const frames = spectrogram.shape[1];
  const output = new Float32Array(FFT_SIZE + HOP_SIZE * (frames - 1));
  const window = await tf.signal.hannWindow(FFT_SIZE).data();
  for (let index = 0; index < frames; index += 1) {
    const frame = tf.tidy(() => {
      const values = spectrogram.slice([0, index, 0], [-1, 1, 2]).squeeze([1]);
      return tf.spectral.irfft(tf.complex(values.slice([0, 0], [-1, 1]).squeeze(), values.slice([0, 1], [-1, 1]).squeeze()));
    });
    const samples = await frame.data();
    frame.dispose();
    const offset = index * HOP_SIZE;
    for (let cursor = 0; cursor < samples.length; cursor += 1) output[offset + cursor] += samples[cursor] * window[cursor];
  }
  return output;
}

async function istft(tf, tensor) {
  const padded = tf.pad(tensor, [[0, 0], [0, 0], [0, 1], [0, 0]]);
  const shaped = padded.reshape([2, 2, 3073, 32]).transpose([0, 2, 3, 1]);
  const left = shaped.slice([0, 0, 0, 0], [1, -1, -1, -1]).squeeze([0]);
  const right = shaped.slice([1, 0, 0, 0], [1, -1, -1, -1]).squeeze([0]);
  const result = await Promise.all([inverseChannel(tf, left), inverseChannel(tf, right)]);
  tf.dispose([padded, shaped, left, right]);
  return result;
}

function wavBlob(channels, sampleRate) {
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
  return new Blob([buffer], { type: "audio/wav" });
}

export async function separateVocals(blob, onProgress = () => {}) {
  const tf = await getRuntime();
  onProgress(4, { key: "vocalSeparationLoadingModel" });
  const model = await getModel(tf);
  onProgress(7, {
    key: activeBackend === "webgpu" ? "vocalSeparationUsingWebGpu" : "vocalSeparationUsingWebGl",
  });
  const context = new AudioContext({ sampleRate: 44100 });
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const left = decoded.getChannelData(0);
    const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
    const accompaniment = [[], []];
    const vocals = [[], []];
    const chunks = Math.ceil(left.length / CHUNK_SIZE);
    for (let index = 0; index < chunks; index += 1) {
      const start = index * CHUNK_SIZE;
      const valid = Math.min(CHUNK_SIZE, left.length - start);
      const paddedLeft = new Float32Array(CHUNK_SIZE + PADDING * 2); paddedLeft.set(left.subarray(start, start + valid), PADDING);
      const paddedRight = new Float32Array(CHUNK_SIZE + PADDING * 2); paddedRight.set(right.subarray(start, start + valid), PADDING);
      const input = tf.tidy(() => {
        const l = stft(tf, tf.tensor1d(paddedLeft)); const r = stft(tf, tf.tensor1d(paddedRight));
        return tf.stack([l, r], 3).transpose([0, 3, 1, 2]).reshape([1, 4, 3072, 32]);
      });
      const musicTensor = model.predict(input);
      const vocalTensor = tf.sub(input, musicTensor);
      const [music, voice] = await Promise.all([istft(tf, musicTensor), istft(tf, vocalTensor)]);
      for (let channel = 0; channel < 2; channel += 1) {
        accompaniment[channel].push(...music[channel].slice(PADDING, PADDING + valid));
        vocals[channel].push(...voice[channel].slice(PADDING, PADDING + valid));
      }
      tf.dispose([input, musicTensor, vocalTensor]);
      onProgress(8 + Math.round(((index + 1) / chunks) * 88), {
        key: "vocalSeparationProcessingChunk",
        current: index + 1,
        total: chunks,
      });
      await tf.nextFrame();
    }
    return {
      vocals: wavBlob(vocals, decoded.sampleRate),
      accompaniment: wavBlob(accompaniment, decoded.sampleRate),
      backend: activeBackend,
    };
  } finally { await context.close().catch(() => {}); }
}
