import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { openVoiceModelFileUrls } from "../config/voiceModels.js";
import { fetchFirstAvailableModel } from "../lib/modelSources.js";
import { configureAnnaOnnxRuntime } from "../lib/annaWasmRuntime.js";

ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };
configureAnnaOnnxRuntime(ort.env);
ort.env.webgpu.powerPreference = "high-performance";
ort.env.webgpu.forceFallbackAdapter = false;

const MODEL_ROOT = "openvoice-v2-converter-fp16";
const SAMPLE_RATE = 22050;
const FFT_SIZE = 1024;
const HOP_SIZE = 256;
const BINS = FFT_SIZE / 2 + 1;
const SPECTROGRAM_PADDING = (FFT_SIZE - HOP_SIZE) / 2;
let sessionsPromise;

function progress(requestId, value, phase) {
  self.postMessage({ type: "progress", requestId, progress: value, phase });
}

async function cachedModel(path, requestId) {
  const urls = openVoiceModelFileUrls(`${MODEL_ROOT}/${path}`);
  const { response } = await fetchFirstAvailableModel(urls);
  if (response.headers.get("X-Timeline-Model-Cache") === "hit") {
    progress(requestId, 28, "从本地模型缓存加载");
  }
  return response.arrayBuffer();
}

async function getSessions(requestId) {
  if (!sessionsPromise) {
    sessionsPromise = (async () => {
      progress(requestId, 8, "下载 OpenVoice 模型");
      // Remove the short-lived pre-release cache. The service worker owns the
      // canonical, provider-independent model cache and avoids duplicate model
      // copies competing for the browser quota.
      await caches.delete("timeline-studio-voice-models-v2").catch(() => false);
      const [referenceBytes, converterBytes] = await Promise.all([
        cachedModel("reference-encoder.onnx", requestId),
        cachedModel("converter.onnx", requestId),
      ]);
      progress(requestId, 42, "初始化音色编码器");
      const reference = await ort.InferenceSession.create(referenceBytes, {
        executionProviders: ["wasm"], graphOptimizationLevel: "all",
      });
      // Keep OpenVoice conversion on WASM as the stable production route. The
      // FP16 flow/decoder can return numerically valid but audibly corrupted
      // samples on WebGPU, while measured conversion time is close enough that
      // the WASM quality win is the better product tradeoff.
      progress(requestId, 56, "初始化变声模型 · WASM 稳定模式");
      const converter = await ort.InferenceSession.create(converterBytes, {
        executionProviders: ["wasm"], graphOptimizationLevel: "all",
      });
      return { reference, converter };
    })().catch((error) => { sessionsPromise = null; throw error; });
  }
  return sessionsPromise;
}

function fft(real, imag) {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imag[index], imag[reversed]] = [imag[reversed], imag[index]];
    }
  }
  for (let size = 2; size <= length; size <<= 1) {
    const angle = -2 * Math.PI / size;
    const wlenReal = Math.cos(angle);
    const wlenImag = Math.sin(angle);
    for (let start = 0; start < length; start += size) {
      let wr = 1; let wi = 0;
      for (let offset = 0; offset < size / 2; offset += 1) {
        const even = start + offset; const odd = even + size / 2;
        const vr = real[odd] * wr - imag[odd] * wi;
        const vi = real[odd] * wi + imag[odd] * wr;
        real[odd] = real[even] - vr; imag[odd] = imag[even] - vi;
        real[even] += vr; imag[even] += vi;
        const nextWr = wr * wlenReal - wi * wlenImag;
        wi = wr * wlenImag + wi * wlenReal; wr = nextWr;
      }
    }
  }
}

function reflectedSample(samples, index) {
  if (samples.length <= 1) return samples[0] || 0;
  let reflected = index;
  while (reflected < 0 || reflected >= samples.length) {
    reflected = reflected < 0 ? -reflected : 2 * samples.length - 2 - reflected;
  }
  return samples[reflected];
}

function spectrogram(samples) {
  // OpenVoice's spectrogram_torch reflect-pads by (n_fft - hop) / 2 before
  // running center=false STFT. Omitting these 384 samples on each side drops
  // three conditioning frames and gives the converter boundary features it
  // never saw during training.
  const paddedLength = samples.length + SPECTROGRAM_PADDING * 2;
  const frameCount = Math.max(1, Math.floor((paddedLength - FFT_SIZE) / HOP_SIZE) + 1);
  const data = new Float32Array(frameCount * BINS);
  const window = Float32Array.from({ length: FFT_SIZE }, (_, index) => 0.5 - 0.5 * Math.cos(2 * Math.PI * index / FFT_SIZE));
  const real = new Float32Array(FFT_SIZE); const imag = new Float32Array(FFT_SIZE);
  for (let frame = 0; frame < frameCount; frame += 1) {
    real.fill(0); imag.fill(0);
    const sampleOffset = frame * HOP_SIZE - SPECTROGRAM_PADDING;
    for (let index = 0; index < FFT_SIZE; index += 1) {
      real[index] = reflectedSample(samples, sampleOffset + index) * window[index];
    }
    fft(real, imag);
    // Match OpenVoice's training-time spectrogram floor. Leaving truly silent
    // bins at exactly zero makes the converter overreact to the very low-level
    // bins produced by the 24 kHz Kokoro base voices after 22.05 kHz resampling.
    for (let bin = 0; bin < BINS; bin += 1) {
      data[frame * BINS + bin] = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin] + 1e-6);
    }
  }
  return { data, frameCount };
}

function embeddingSpeechSamples(samples) {
  const windowSize = Math.round(SAMPLE_RATE * 0.025);
  const hopSize = Math.round(SAMPLE_RATE * 0.01);
  let peakRms = 0;
  const levels = [];
  for (let start = 0; start < samples.length; start += hopSize) {
    const end = Math.min(samples.length, start + windowSize);
    let energy = 0;
    for (let index = start; index < end; index += 1) energy += samples[index] * samples[index];
    const rms = Math.sqrt(energy / Math.max(1, end - start));
    levels.push({ start, end, rms });
    peakRms = Math.max(peakRms, rms);
  }
  if (peakRms < 0.0025) return samples;
  const threshold = Math.max(0.0018, peakRms * 0.04);
  const first = levels.find((level) => level.rms >= threshold);
  const last = levels.findLast((level) => level.rms >= threshold);
  if (!first || !last) return samples;
  const release = Math.round(SAMPLE_RATE * 0.12);
  const start = Math.max(0, first.start - release);
  const end = Math.min(samples.length, last.end + release);
  // Very short detected islands are less reliable than the original clip.
  return end - start >= SAMPLE_RATE * 0.6 ? samples.subarray(start, end) : samples;
}

function transposeFrames(data, frameCount) {
  const output = new Float32Array(data.length);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let bin = 0; bin < BINS; bin += 1) output[bin * frameCount + frame] = data[frame * BINS + bin];
  }
  return output;
}

function seededNoise(length, seed) {
  const output = new Float32Array(length);
  let state = seed >>> 0 || 0x9e3779b9;
  for (let index = 0; index < length; index += 2) {
    state = (1664525 * state + 1013904223) >>> 0; const u1 = Math.max(1e-7, state / 4294967296);
    state = (1664525 * state + 1013904223) >>> 0; const u2 = state / 4294967296;
    const radius = Math.sqrt(-2 * Math.log(u1));
    output[index] = radius * Math.cos(2 * Math.PI * u2);
    if (index + 1 < length) output[index + 1] = radius * Math.sin(2 * Math.PI * u2);
  }
  return output;
}

function findLastActiveSample(samples) {
  const windowSize = Math.round(SAMPLE_RATE * 0.02);
  const hopSize = Math.round(SAMPLE_RATE * 0.01);
  let peakRms = 0;
  const levels = [];
  for (let start = 0; start < samples.length; start += hopSize) {
    const end = Math.min(samples.length, start + windowSize);
    let energy = 0;
    for (let index = start; index < end; index += 1) energy += samples[index] * samples[index];
    const rms = Math.sqrt(energy / Math.max(1, end - start));
    levels.push([start, end, rms]);
    peakRms = Math.max(peakRms, rms);
  }
  // Very quiet references do not provide a reliable activity boundary. Keep
  // their original duration instead of accidentally trimming real speech.
  if (peakRms < 0.0025) return samples.length;
  const threshold = Math.max(0.0015, peakRms * 0.035);
  let lastActive = 0;
  for (const [, end, rms] of levels) {
    if (rms >= threshold) lastActive = end;
  }
  return lastActive || samples.length;
}

function finishConvertedAudio(output, source) {
  // Voice conversion must preserve timing. Some decoder graphs expose padded
  // samples after the masked spectrogram; seeded noise turns that padding into
  // a faint, long breath/noise tail unless it is explicitly removed.
  const activeEnd = findLastActiveSample(source);
  const tailPadding = Math.round(SAMPLE_RATE * 0.16);
  const targetLength = Math.max(1, Math.min(
    output.length,
    source.length,
    activeEnd + tailPadding,
  ));
  const finished = Float32Array.from(output.subarray(0, targetLength));
  const startFadeLength = Math.min(Math.round(SAMPLE_RATE * 0.012), finished.length);
  for (let index = 0; index < startFadeLength; index += 1) {
    finished[index] *= Math.sin((index / Math.max(1, startFadeLength - 1)) * Math.PI * 0.5);
  }
  const endFadeLength = Math.min(Math.round(SAMPLE_RATE * 0.04), finished.length);
  const fadeStart = finished.length - endFadeLength;
  for (let index = 0; index < endFadeLength; index += 1) {
    const gain = Math.cos((index / Math.max(1, endFadeLength - 1)) * Math.PI * 0.5);
    finished[fadeStart + index] *= gain;
  }

  // OpenVoice returns unclipped float audio. Some built-in base voices can
  // drive isolated samples above full scale; encodeWav would
  // otherwise hard-clip those overshoots into audible grit. Limit only the
  // over-limit samples: scaling the whole file from one decoder spike can make
  // the actual speech nearly inaudible while leaving its noise floor obvious.
  let peak = 0;
  for (let index = 0; index < finished.length; index += 1) {
    if (!Number.isFinite(finished[index])) finished[index] = 0;
    peak = Math.max(peak, Math.abs(finished[index]));
  }
  if (peak > 0.98) {
    const knee = 0.82;
    const ceiling = 0.98;
    for (let index = 0; index < finished.length; index += 1) {
      const value = finished[index];
      const magnitude = Math.abs(value);
      if (magnitude <= knee) continue;
      const limited = knee + (ceiling - knee) * Math.tanh((magnitude - knee) / (ceiling - knee));
      finished[index] = Math.sign(value) * limited;
    }
  }
  return finished;
}

async function encode(samples, requestId) {
  const { reference } = await getSessions(requestId);
  const spec = spectrogram(embeddingSpeechSamples(samples));
  progress(requestId, 78, "提取音色特征");
  const result = await reference.run({
    spectrogram_frames: new ort.Tensor("float32", spec.data, [1, spec.frameCount, BINS]),
  });
  return Float32Array.from(result.speaker_embedding.data);
}

async function convert(samples, targetEmbedding, seed, requestId) {
  const { converter } = await getSessions(requestId);
  const spec = spectrogram(samples);
  const sourceEmbedding = await encode(samples, requestId);
  const transposed = transposeFrames(spec.data, spec.frameCount);
  progress(requestId, 84, "转换为克隆音色");
  const result = await converter.run({
    spectrogram: new ort.Tensor("float32", transposed, [1, BINS, spec.frameCount]),
    frame_mask: new ort.Tensor("float32", new Float32Array(spec.frameCount).fill(1), [1, 1, spec.frameCount]),
    source_embedding: new ort.Tensor("float32", sourceEmbedding, [1, 256, 1]),
    target_embedding: new ort.Tensor("float32", targetEmbedding, [1, 256, 1]),
    noise: new ort.Tensor("float32", seededNoise(192 * spec.frameCount, seed), [1, 192, spec.frameCount]),
  });
  const tensor = result.audio || Object.values(result)[0];
  progress(requestId, 96, "清理尾部静音");
  return finishConvertedAudio(tensor.data, samples);
}

self.onmessage = async ({ data }) => {
  const { requestId, action, samples, embedding, seed = 2026 } = data;
  try {
    const result = action === "encode"
      ? await encode(samples, requestId)
      : await convert(samples, embedding, seed, requestId);
    self.postMessage({ type: "result", requestId, result }, [result.buffer]);
  } catch (error) {
    self.postMessage({ type: "error", requestId, message: error?.message || String(error) });
  }
};
