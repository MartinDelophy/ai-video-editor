import { isBuiltInPinyinVoice, predictPiperVoice } from "./piperVoiceRuntime.js";
import { clearKokoroVoiceCacheIfStorageTight, predictKokoroVoice } from "./kokoroVoiceRuntime.js";
import { predictHojoVoice } from "./hojoTtsRuntime.js";
import { predictMmsVoice } from "./mmsVoiceRuntime.js";
import { clearPiperCacheIfStorageTight, isStorageQuotaError, prepareTextForVoice } from "./ttsText.js";

const TEST_SENTENCES = Object.freeze({
  中文: "你好，这是一段中文克隆音色测试。",
  English: "Hello, this is an English cloned voice test.",
  Deutsch: "Hallo, dies ist ein deutscher Test der geklonten Stimme.",
  Español: "Hola, esta es una prueba en español de la voz clonada.",
  Français: "Bonjour, ceci est un test en français de la voix clonée.",
  Italiano: "Ciao, questa è una prova in italiano della voce clonata.",
  Português: "Olá, este é um teste em português da voz clonada.",
  한국어: "안녕하세요, 복제된 음성의 한국어 테스트입니다.",
  日本語: "こんにちは、これはクローン音声の日本語テストです。",
  "Tiếng Việt": "Xin chào, đây là bản thử giọng nhân bản bằng tiếng Việt.",
  Русский: "Здравствуйте, это проверка клонированного голоса на русском языке.",
  ไทย: "สวัสดี นี่คือการทดสอบเสียงโคลนภาษาไทย",
});

// UI narration, clone tests and WebMCP all share the same model sessions and
// mirrored-fetch adapters. Acquire synchronously before any dynamic import.
let synthesisActive = false;

export function getVoiceCloneTestSentence(voice) {
  return TEST_SENTENCES[voice?.language] || TEST_SENTENCES.English;
}

async function runBaseVoiceSynthesis({ voice, text, speed = 1, onProgress, onStatus, notify, t }) {
  const prepared = prepareTextForVoice(text, voice);
  if (prepared.warningKey) notify?.(t?.(prepared.warningKey) || prepared.warningKey);
  let blob;
  if (voice.engine === "piper") {
    const builtInPinyinVoice = isBuiltInPinyinVoice(voice.id);
    const tts = builtInPinyinVoice ? null : await import("@diffusionstudio/vits-web");
    if (tts && await clearPiperCacheIfStorageTight(tts, voice.id)) notify?.(t?.("ttsNoticePiperCacheCleared") || "ttsNoticePiperCacheCleared");
    onStatus?.(voice.language === "中文" ? "ttsStatusLoadingChineseModel" : "ttsStatusPreparingModel");
    const progress = (event) => {
      if (event?.phase === "initializing") onStatus?.("ttsStatusInitializingModel");
      if (event?.phase === "generating" || event?.backend) onStatus?.(event.backend === "webgpu" ? "ttsStatusGeneratingWebGpu" : "ttsStatusGeneratingWasm");
      if (event?.total) onProgress?.(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    };
    const input = { text: prepared.text, voiceId: voice.id, speed };
    try { blob = await predictPiperVoice(tts, input, progress); }
    catch (error) {
      if (!isStorageQuotaError(error)) throw error;
      onStatus?.("ttsStatusClearingCache"); await tts?.flush?.(); blob = await predictPiperVoice(tts, input, progress);
    }
  } else if (voice.engine === "hojo") {
    onStatus?.("ttsStatusPreparingModel");
    blob = await predictHojoVoice({ text: prepared.text, voiceId: voice.id, speed }, (event) => {
      if (event?.backend) onStatus?.(event.backend === "wasm" ? "ttsStatusGeneratingWasm" : "ttsStatusGeneratingWebGpu");
      if (Number.isFinite(event?.progress)) onProgress?.(event.progress);
    });
  } else if (voice.engine === "mms") {
    onStatus?.("ttsStatusPreparingModel");
    blob = await predictMmsVoice({ text: prepared.text, voiceId: voice.id }, (event) => {
      if (event?.backend) onStatus?.("ttsStatusGeneratingWasm");
      if (Number.isFinite(event?.progress)) onProgress?.(event.progress);
    });
  } else if (voice.engine === "supertonic") {
    onStatus?.("ttsStatusPreparingModel");
    const { predictSupertonicVoice } = await import("./supertonicVoiceRuntime.js");
    blob = await predictSupertonicVoice({ text: prepared.text, speed }, (event) => {
      if (event?.backend) onStatus?.("ttsStatusGeneratingWasm");
      if (Number.isFinite(event?.progress)) onProgress?.(event.progress);
    });
  } else {
    onStatus?.("ttsStatusLoadingKokoro");
    await clearKokoroVoiceCacheIfStorageTight();
    blob = await predictKokoroVoice({ text: prepared.text, voiceId: voice.id, speed }, (event) => {
      if (event?.backend) onStatus?.("ttsStatusGeneratingWasm");
      if (Number.isFinite(event?.progress)) onProgress?.(event.progress);
    });
  }
  return { blob, prepared };
}

export async function synthesizeBaseVoice(options) {
  if (synthesisActive) throw Object.assign(new Error(options.t?.("generating") || "EDITOR_BUSY"), { code: "EDITOR_BUSY" });
  synthesisActive = true;
  try {
    return await runBaseVoiceSynthesis(options);
  } finally {
    synthesisActive = false;
  }
}
