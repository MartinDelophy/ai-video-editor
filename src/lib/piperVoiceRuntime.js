import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { pinyin } from "pinyin-pro";

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };

const PINYIN_VOICES = {
  "zh_CN-xiao_ya-medium": "zh/zh_CN/xiao_ya/medium",
  "zh_CN-chaowen-medium": "zh/zh_CN/chaowen/medium",
};
const PIPER_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];
const GROUP_END = new Set(["1", "2", "3", "4", "5", "。", ".", "？", "?", "！", "!", "—", "…", "、", "，", ",", "：", ":", "；", ";", " "]);
const DIGITS = { 0: "零", 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九" };

const pinyinRuntimePromises = new Map();

function normalizeNumbers(text) {
  return text.replace(/\d/g, (digit) => DIGITS[digit]);
}

function splitSyllable(syllable) {
  const match = /^([a-züv:]+)([1-5])$/i.exec(syllable);
  if (!match) return null;
  let base = match[1].toLowerCase().replaceAll("u:", "v").replaceAll("ü", "v");
  const initial = INITIALS.find((candidate) => base.startsWith(candidate)) ?? "Ø";
  let final = initial === "Ø" ? base : base.slice(initial.length);
  if (["j", "q", "x"].includes(initial)) {
    if (final === "u") final = "v";
    else if (final === "ue") final = "ve";
    else if (final === "uan") final = "van";
    else if (final === "un") final = "vn";
  }
  return [initial, final, match[2]];
}

export function phonemizeXiaoYa(text, phonemeIdMap) {
  const symbols = [];
  for (const token of pinyin(normalizeNumbers(text), { toneType: "num", type: "array" })) {
    const syllable = splitSyllable(token);
    if (syllable) symbols.push(...syllable);
    else if (token in phonemeIdMap) symbols.push(token);
  }

  const ids = [...phonemeIdMap["^"]];
  for (const symbol of symbols) {
    const symbolIds = phonemeIdMap[symbol];
    if (!symbolIds) throw new Error(`小雅不支持音素：${symbol}`);
    ids.push(...symbolIds);
    if (GROUP_END.has(symbol)) ids.push(...phonemeIdMap._);
  }
  ids.push(...phonemeIdMap.$);
  return ids;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true));
  return new Blob([buffer], { type: "audio/wav" });
}

async function fetchArrayBufferWithProgress(url, onProgress, voiceName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${voiceName}模型下载失败 (${response.status})`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.byteLength;
    onProgress?.({ url, total, loaded });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

async function loadPinyinVoice(voiceId, onProgress) {
  const voicePath = PINYIN_VOICES[voiceId];
  const voiceName = voiceId === "zh_CN-xiao_ya-medium" ? "小雅" : "超文";
  const voiceBase = `${PIPER_BASE}/${voicePath}`;
  const configResponse = await fetch(`${voiceBase}/${voiceId}.onnx.json`);
  if (!configResponse.ok) throw new Error(`${voiceName}配置下载失败 (${configResponse.status})`);
  const config = await configResponse.json();
  const model = await fetchArrayBufferWithProgress(`${voiceBase}/${voiceId}.onnx`, onProgress, voiceName);
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  return { config, session };
}

async function predictPinyinVoice(input, onProgress) {
  if (!pinyinRuntimePromises.has(input.voiceId)) {
    pinyinRuntimePromises.set(
      input.voiceId,
      loadPinyinVoice(input.voiceId, onProgress).catch((error) => {
        pinyinRuntimePromises.delete(input.voiceId);
        throw error;
      }),
    );
  }
  const { config, session } = await pinyinRuntimePromises.get(input.voiceId);
  const ids = phonemizeXiaoYa(input.text.trim(), config.phoneme_id_map);
  const feeds = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([ids.length], BigInt), [1]),
    scales: new ort.Tensor("float32", Float32Array.from([
      config.inference.noise_scale,
      config.inference.length_scale,
      config.inference.noise_w,
    ]), [3]),
  };
  const result = await session.run(feeds);
  const samples = result.output.data;
  if (!(samples instanceof Float32Array) || !samples.length || samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error("小雅生成了无效音频");
  }
  return encodeWav(samples, config.audio.sample_rate);
}

export async function predictPiperVoice(tts, input, onProgress) {
  if (input.voiceId in PINYIN_VOICES) return predictPinyinVoice(input, onProgress);
  return tts.predict(input, onProgress);
}
