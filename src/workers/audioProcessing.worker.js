import { denoisePcmChannel } from "../lib/audioDenoiseFrames.js";
import {
  AUDIO_PROCESSING_MODELS,
  audioProcessingModelUrls,
} from "../config/audioProcessingModels.js";
import { processAudioDsp, normalizeAudioProcessing } from "../lib/audioProcessingDsp.js";
import { fetchFirstAvailableModel } from "../lib/modelSources.js";
const loaded = new Map();
async function loadEngine(name, language) {
  if (loaded.has(name)) return loaded.get(name);
  const spec = AUDIO_PROCESSING_MODELS[name];
  let received = 0;
  // Executable loaders must be bundled same-origin modules, never blob scripts.
  const runtime = name === "rnnoise"
    ? import("../vendor/audio-processing/rnnoise/runtime.js")
    : import("../vendor/audio-processing/deepfilter/runtime.js");
  const files = spec.files.filter((file) => file.path.endsWith(".wasm"));
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const blobs = await Promise.all(
    files.map(async (file) => {
      const { response } = await fetchFirstAvailableModel(
        audioProcessingModelUrls(file.path, language),
      );
      const reader = response.body?.getReader(),
        chunks = [];
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          self.postMessage({ phase: "download", progress: Math.min(1, received / total) });
        }
      } else chunks.push(new Uint8Array(await response.arrayBuffer()));
      const blob = new Blob(chunks, {
        type: file.path.endsWith(".wasm") ? "application/wasm" : "text/javascript",
      });
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== file.sha256) throw Error("MODEL_INTEGRITY");
      return blob;
    }),
  );
  const module = await runtime;
  const engine = name === "rnnoise"
    ? { rn: await module.Rnnoise.load() }
    : { module, wasm: blobs[0] };
  loaded.set(name, engine);
  return engine;
}
self.onmessage = async ({ data }) => {
  try {
    const settings = normalizeAudioProcessing(data.settings),
      channels = data.channels;
    if (
      !Array.isArray(channels) ||
      !channels.length ||
      channels.length > 2 ||
      channels.some((ch) => !(ch instanceof Float32Array) || ch.length !== channels[0].length)
    )
      throw Error("INVALID_AUDIO");
    const spec = AUDIO_PROCESSING_MODELS[settings.engine];
    if (spec && settings.strength > 0) {
      const loaded = await loadEngine(settings.engine, data.language);
      for (let ch = 0; ch < channels.length; ch++) {
        const url = loaded.wasm ? URL.createObjectURL(loaded.wasm) : null;
        let engine;
        try {
          engine = loaded.rn
            ? loaded.rn.createDenoiseState()
            : await loaded.module.DeepFilter.create({ wasmUrl: url, attenuationLimit: 100 });
          const frameSize = loaded.rn ? loaded.rn.frameSize : engine.frameLength;
          if (frameSize !== 480) throw Error("MODEL_FRAME_SIZE");
          await denoisePcmChannel(channels[ch], engine, {
            rnnoise: Boolean(loaded.rn),
            delay: spec.delay,
            strength: settings.strength,
            onProgress: (progress) =>
              self.postMessage({ phase: "denoise", progress: (ch + progress) / channels.length }),
          });
        } finally {
          engine?.destroy();
          if (url) URL.revokeObjectURL(url);
        }
      }
    }
    await processAudioDsp(channels, settings, 48000, (progress) =>
      self.postMessage({ phase: "enhance", progress }),
    );
    let peak = 0;
    for (const channel of channels)
      for (const sample of channel) {
        if (!Number.isFinite(sample)) throw Error("INVALID_OUTPUT");
        peak = Math.max(peak, Math.abs(sample));
      }
    self.postMessage(
      { type: "done", channels, peak },
      channels.map((ch) => ch.buffer),
    );
  } catch {
    self.postMessage({ type: "error" });
  }
};
