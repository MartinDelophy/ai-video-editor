import { loadTextToSpeech, loadVoiceStyle, writeWavFile } from "./supertonicWebRuntime.js";

const MODEL_BASE = "https://huggingface.co/Supertone/supertonic-3/resolve/main/onnx";
const STYLE_URL = "https://huggingface.co/Supertone/supertonic-3/resolve/main/voice_styles/F1.json";
let runtimePromise;

async function loadRuntime(onProgress) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const [{ textToSpeech }, style] = await Promise.all([
        loadTextToSpeech(MODEL_BASE, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }, (modelName, current, total) => {
          onProgress?.({ progress: (current / total) * 100, file: modelName });
        }),
        loadVoiceStyle([STYLE_URL], false),
      ]);
      return { textToSpeech, style };
    })().catch((error) => { runtimePromise = undefined; throw error; });
  }
  return runtimePromise;
}

export async function predictSupertonicVoice(input, onProgress) {
  const { textToSpeech, style } = await loadRuntime(onProgress);
  onProgress?.({ backend: "wasm" });
  const { wav, duration } = await textToSpeech.call(input.text.trim(), "ja", style, 5, Number(input.speed) || 1.05, 0.3, (step, total) => {
    onProgress?.({ progress: (step / total) * 100 });
  });
  const sampleCount = Math.max(1, Math.floor(textToSpeech.sampleRate * duration[0]));
  return new Blob([writeWavFile(wav.slice(0, sampleCount), textToSpeech.sampleRate)], { type: "audio/wav" });
}
