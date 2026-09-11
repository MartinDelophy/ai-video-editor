import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { PreTrainedTokenizer } from "@huggingface/transformers";
import { configureAnnaOnnxRuntime } from "../lib/annaWasmRuntime.js";

const LAYERS = 17;
const HEAD = 128;
const OUTPUT_SAMPLE_RATE = 24000;
// Narration is segmented into short breath groups before synthesis. Capping the
// autoregressive tail keeps a failed EOS sample from monopolizing WebGPU for
// several minutes while still allowing roughly nine seconds of speech.
const MAX_NEW_TOKENS = 480;

let tokenizer;
let idToCode;
let speechEndId;
let sessions;
let backend = "";
let cancelled = false;
let mirrorBaseUrls = [];
let activeSource = "";
let builtInVoices = new Map();

ort.env.logLevel = "warning";
ort.env.webgpu.powerPreference = "high-performance";
ort.env.wasm.numThreads = Math.min(4, self.navigator?.hardwareConcurrency || 1);
ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };
configureAnnaOnnxRuntime(ort.env);

const postProgress = (stage, value) => postMessage({ type: "progress", stage, value });
const errorMessage = (error) => error instanceof Error ? error.message : String(error);
const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function sha256(bytes) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function fetchBytes(url, expectedBytes, expectedHash, onChunk = () => {}) {
  const response = await fetch(url, { cache: "default" });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      onChunk(value.byteLength);
    }
  } else {
    const value = new Uint8Array(await response.arrayBuffer());
    chunks.push(value);
    size = value.byteLength;
    onChunk(size);
  }
  if (Number.isFinite(expectedBytes) && size !== expectedBytes) throw new Error(`SIZE_MISMATCH:${size}:${expectedBytes}`);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (expectedHash && await sha256(bytes) !== expectedHash) throw new Error(`SHA256_MISMATCH:${url}`);
  return bytes;
}

async function assembleArtifact(baseUrl, artifact, onChunk) {
  const parts = await Promise.all(artifact.parts.map((part) => fetchBytes(
    new URL(part.file, baseUrl), part.bytes, part.sha256, onChunk,
  )));
  const bytes = new Uint8Array(artifact.bytes);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  if (offset !== artifact.bytes || await sha256(bytes) !== artifact.sha256) throw new Error("ASSEMBLED_SHA256_MISMATCH");
  return bytes;
}

async function downloadBundle(baseUrl) {
  const manifestResponse = await fetch(new URL("manifest.json", baseUrl), { cache: "default" });
  if (!manifestResponse.ok) throw new Error(`MANIFEST_HTTP_${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (manifest?.format !== "timeline-studio-hojo-zero-shot-runtime-v1") throw new Error("INVALID_MANIFEST");
  const graphs = [manifest.graphs.llm, manifest.graphs.decoder];
  const resources = [...manifest.resources, ...manifest.references];
  const total = [...graphs, ...resources].reduce((sum, item) => sum + item.bytes, 0);
  let loaded = 0;
  const onChunk = (bytes) => {
    loaded += bytes;
    postProgress("下载并校验模型分片", total ? (loaded / total) * 48 : 0);
  };
  const [llm, decoder, ...resourceBytes] = await Promise.all([
    assembleArtifact(baseUrl, manifest.graphs.llm, onChunk),
    assembleArtifact(baseUrl, manifest.graphs.decoder, onChunk),
    ...resources.map((item) => fetchBytes(new URL(item.file, baseUrl), item.bytes, item.sha256, onChunk)),
  ]);
  const resourceMap = new Map(resources.map((item, index) => [item.file, resourceBytes[index]]));
  return { manifest, llm, decoder, resourceMap, baseUrl };
}

async function loadFromMirrors() {
  const failures = [];
  for (const baseUrl of mirrorBaseUrls) {
    try {
      const bundle = await downloadBundle(baseUrl);
      activeSource = new URL(baseUrl).hostname;
      return bundle;
    } catch (error) {
      failures.push(`${new URL(baseUrl).hostname}:${errorMessage(error)}`);
      postMessage({ type: "mirror-fallback", failures: [...failures] });
    }
  }
  throw new Error(`MODEL_MIRRORS_UNAVAILABLE:${failures.join(";")}`);
}

function jsonResource(bundle, name) {
  const bytes = bundle.resourceMap.get(name);
  if (!bytes) throw new Error(`MISSING_RESOURCE:${name}`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function buildTokenizerTables(bundle) {
  const raw = jsonResource(bundle, "tokenizer.json");
  const tokenizerConfig = jsonResource(bundle, "tokenizer_config.json");
  tokenizer = new PreTrainedTokenizer(raw, tokenizerConfig);
  const vocab = { ...(raw.model?.vocab || {}) };
  for (const item of raw.added_tokens || []) vocab[item.content] = item.id;
  idToCode = new Int32Array(Math.max(...Object.values(vocab)) + 1).fill(-1);
  for (const [token, id] of Object.entries(vocab)) {
    const match = /^\[(\d+)\]$/.exec(token);
    if (match) idToCode[id] = Number(match[1]);
  }
  speechEndId = vocab["[target_speech_end]"] ?? vocab["[speech_end]"];
  if (speechEndId == null) throw new Error("分词器缺少 Hojo 结束标记");
}

function f16ToF32(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function tensorIds(values, dims = [1, values.length]) {
  return new ort.Tensor("int64", BigInt64Array.from(values, BigInt), dims);
}

async function createSessions(bundle) {
  const llm = await ort.InferenceSession.create(bundle.llm, {
    executionProviders: ["webgpu"],
    graphOptimizationLevel: "all",
  });
  postProgress("创建语音语言模型 · WebGPU", 66);
  const decoder = await ort.InferenceSession.create(bundle.decoder, {
    // The autoregressive model benefits from WebGPU, but this one-shot
    // waveform decoder is audibly cleaner through the WASM execution provider.
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return { llm, decoder };
}

async function load() {
  if (sessions) return;
  const started = performance.now();
  postProgress("读取模型清单", 2);
  const bundle = await loadFromMirrors();
  buildTokenizerTables(bundle);
  const referenceCodes = jsonResource(bundle, "reference-codes.json");
  postProgress("初始化高性能 WebGPU", 52);
  if (!self.navigator?.gpu) throw new Error("WEBGPU_UNAVAILABLE");
  sessions = await createSessions(bundle);
  for (const reference of bundle.manifest.references) {
    const encoded = referenceCodes[reference.codeKey];
    if (!encoded?.codes?.length) throw new Error(`MISSING_REFERENCE_CODES:${reference.voiceId}`);
    builtInVoices.set(reference.voiceId, encoded);
  }
  backend = "webgpu+wasm";
  postMessage({ type: "ready", backend, source: activeSource, seconds: (performance.now() - started) / 1000 });
}

function promptFor(text, reference) {
  const codes = reference.codes.map((code) => `[${code}]`).join("");
  return `[ref_text_start]${reference.text}[ref_text_end] [target_text_start]${text}[target_text_end]`
    + `[ref_speech_start]${codes}[ref_speech_end][target_speech_start]`;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(logits, generated, random, temperature = 0.8, topP = 0.95, penalty = 1.1) {
  const seen = new Set(generated);
  const ranked = new Array(logits.length);
  // Older engines expose float16 tensor data as raw Uint16 bits, while newer
  // browsers expose actual Float16Array numeric values. Decoding both as bits
  // corrupts logits and can make the decoder produce silence.
  const logitsAreRawBits = logits instanceof Uint16Array;
  let maximum = -Infinity;
  for (let index = 0; index < logits.length; index++) {
    let value = logitsAreRawBits ? f16ToF32(logits[index]) : Number(logits[index]);
    if (seen.has(index)) value = value > 0 ? value / penalty : value * penalty;
    value /= temperature;
    ranked[index] = [index, value];
    maximum = Math.max(maximum, value);
  }
  ranked.sort((left, right) => right[1] - left[1]);
  let total = 0;
  for (const item of ranked) { item[1] = Math.exp(item[1] - maximum); total += item[1]; }
  let cumulative = 0;
  let cutoff = ranked.length;
  for (let index = 0; index < ranked.length; index++) {
    cumulative += ranked[index][1] / total;
    if (cumulative > topP) { cutoff = index + 1; break; }
  }
  let kept = 0;
  for (let index = 0; index < cutoff; index++) kept += ranked[index][1];
  let target = random() * kept;
  for (let index = 0; index < cutoff; index++) {
    target -= ranked[index][1];
    if (target <= 0) return ranked[index][0];
  }
  return ranked[0][0];
}

function emptyPast() {
  const result = {};
  for (let layer = 0; layer < LAYERS; layer++) {
    result[`past_key_values.${layer}.key`] = new ort.Tensor("float16", new Uint16Array(0), [1, 1, 0, HEAD]);
    result[`past_key_values.${layer}.value`] = new ort.Tensor("float16", new Uint16Array(0), [1, 1, 0, HEAD]);
  }
  return result;
}

function outputPast(outputs) {
  return Array.from({ length: LAYERS }, (_, layer) => [
    outputs[`present.${layer}.key`], outputs[`present.${layer}.value`],
  ]);
}

async function generateCodes(promptIds, seed, maxTokens) {
  const sequenceLength = promptIds.length;
  let outputs = await sessions.llm.run({
    input_ids: tensorIds(promptIds),
    attention_mask: tensorIds(new Array(sequenceLength).fill(1)),
    position_ids: tensorIds(Array.from({ length: sequenceLength }, (_, index) => index)),
    ...emptyPast(),
  });
  let past = outputPast(outputs);
  const generated = [];
  const random = mulberry32(seed);
  let logits = outputs.logits.data.subarray((sequenceLength - 1) * idToCode.length);
  let next = sample(logits, generated, random);
  generated.push(next);
  outputs.logits.dispose();

  for (let step = 1; step < maxTokens; step++) {
    if (cancelled) throw new DOMException("Cancelled", "AbortError");
    if (generated.length >= 10 && next === speechEndId) break;
    const feeds = {
      input_ids: tensorIds([next]),
      attention_mask: tensorIds(new Array(sequenceLength + step).fill(1)),
      position_ids: tensorIds([sequenceLength + step - 1]),
    };
    for (let layer = 0; layer < LAYERS; layer++) {
      feeds[`past_key_values.${layer}.key`] = past[layer][0];
      feeds[`past_key_values.${layer}.value`] = past[layer][1];
    }
    outputs = await sessions.llm.run(feeds);
    const previousPast = past;
    past = outputPast(outputs);
    previousPast.flat().forEach((tensor) => tensor.dispose());
    logits = outputs.logits.data;
    next = sample(logits, generated, random);
    generated.push(next);
    outputs.logits.dispose();
    if (step % 8 === 0) postProgress(`生成语音 Token · ${step}`, Math.min(91, 78 + step / maxTokens * 13));
  }
  past.flat().forEach((tensor) => tensor.dispose());
  const stop = generated.indexOf(speechEndId);
  const tail = stop >= 0 ? generated.slice(0, stop) : generated;
  const codes = tail.map((id) => idToCode[id]).filter((code) => code >= 0);
  if (!codes.length) throw new Error("语言模型没有生成有效语音 Token");
  return codes;
}

function wavBuffer(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, OUTPUT_SAMPLE_RATE, true); view.setUint32(28, OUTPUT_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-0.98, Math.min(0.98, samples[index]));
    view.setInt16(44 + index * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return buffer;
}

async function generate(text, voiceId, seed) {
  if (!sessions) await load();
  cancelled = false;
  const reference = builtInVoices.get(voiceId);
  if (!reference) throw new Error(`未知音色：${voiceId}`);
  const started = performance.now();
  const encoded = await tokenizer(promptFor(text, reference), { add_special_tokens: true });
  const promptIds = Array.from(encoded.input_ids.data, Number);
  const visibleLength = [...text.trim()].length;
  const maxTokens = Math.min(MAX_NEW_TOKENS, Math.max(140, visibleLength * 10 + 80));
  const codes = await generateCodes(promptIds, seed, maxTokens);
  postProgress("解码 24 kHz 波形", 94);
  const decoded = await sessions.decoder.run({ vq_codes: tensorIds(codes, [1, 1, codes.length]) });
  const waveformData = decoded.wav_24k.data;
  const waveform = waveformData instanceof Uint16Array
    ? Float32Array.from(waveformData, f16ToF32)
    : Float32Array.from(waveformData, Number);
  decoded.wav_24k.dispose();
  let peak = 0;
  let energy = 0;
  for (const sample of waveform) {
    if (!Number.isFinite(sample)) throw new Error("HOJO_DECODER_INVALID_WAVEFORM");
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
  }
  const rms = Math.sqrt(energy / Math.max(1, waveform.length));
  if (peak < 0.005 || rms < 0.0005) throw new Error("HOJO_DECODER_SILENT_WAVEFORM");
  const seconds = (performance.now() - started) / 1000;
  const duration = waveform.length / OUTPUT_SAMPLE_RATE;
  const wav = wavBuffer(waveform);
  return { wav, duration, seconds, rtf: seconds / duration, peak, rms };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "cancel") { cancelled = true; return; }
    if (data.type === "init") {
      mirrorBaseUrls = [...new Set((data.baseUrls || []).filter(Boolean))];
      if (!mirrorBaseUrls.length) throw new Error("MISSING_MODEL_MIRRORS");
      await load();
    }
    if (data.type === "generate") {
      const result = await generate(data.text, data.voice, data.seed);
      postMessage({ type: "audio", requestId: data.requestId, ...result }, [result.wav]);
    }
  } catch (error) {
    if (error?.name === "AbortError") postMessage({ type: "cancelled" });
    else { console.error(error); postMessage({ type: "error", requestId: data?.requestId, message: error?.message || String(error) }); }
  }
};
