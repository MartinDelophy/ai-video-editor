import { loadVoiceModelFromMirrors, voiceModelFileUrls } from "../config/voiceModels.js";
import { orderModelUrlsForNetwork } from "./modelSources.js";
import { prepareVoiceModelStorage } from "./voiceModelStorage.js";
import { configureAnnaTransformers } from "./annaWasmRuntime.js";

const SHARED_MODEL_CACHE = "timeline-studio-model-cache-v4";
const KOKORO_VOICE_CACHE = "kokoro-voices";
const UPSTREAM_VOICE_PREFIX = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/";

let runtimePromise;

function isLegacyFp32KokoroModel(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.endsWith("/kokoro/onnx/model.onnx")
      || (pathname.includes("/Kokoro-82M-v1.0-ONNX/") && pathname.endsWith("/onnx/model.onnx"));
  } catch {
    return false;
  }
}

async function removeLegacyFp32Cache() {
  if (!globalThis.caches) return;
  for (const cacheName of [SHARED_MODEL_CACHE, "transformers-cache"]) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      await Promise.all(keys.filter((request) => isLegacyFp32KokoroModel(request.url)).map((request) => cache.delete(request)));
    } catch {
      // Cache cleanup is best-effort. The q8 runtime can still use the network.
    }
  }
}

async function loadRuntime(onProgress) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      // Earlier builds downloaded the 325 MB fp32 WebGPU graph before falling
      // back. It is no longer used and can prevent the 92 MB q8 model from
      // being cached when the site's storage quota is tight.
      await removeLegacyFp32Cache();
      await prepareVoiceModelStorage({
        preserveModelPath: "kokoro",
        requiredBytes: 120 * 1024 * 1024,
        clearPiper: true,
      });
      const [{ env: transformersEnv }, { KokoroTTS }] = await Promise.all([
        import("@huggingface/transformers"),
        import("kokoro-js"),
      ]);
      await configureAnnaTransformers(transformersEnv);
      // The service worker is the single persistent cache owner for model
      // files, so Transformers.js must not keep a second full model copy.
      transformersEnv.useBrowserCache = false;
      const modelProgress = (event) => {
        // Transformers reports each config/tokenizer/model file separately.
        // Treating a tiny JSON file's 100% as the whole download is what made
        // the previous UI jump to 86% long before the ONNX graph was ready.
        if (!String(event?.file || "").endsWith(".onnx")) return;
        if (Number.isFinite(event?.progress)) {
          onProgress?.({ ...event, progress: 10 + (Math.max(0, Math.min(100, event.progress)) * 0.78) });
        }
      };
      return loadVoiceModelFromMirrors(transformersEnv, "kokoro", (modelId) => KokoroTTS.from_pretrained(modelId, {
        dtype: "q8",
        device: "wasm",
        progress_callback: modelProgress,
      }));
    })().catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

async function fetchOwnedVoiceStyle(voiceId, originalFetch, init) {
  const candidates = await orderModelUrlsForNetwork(voiceModelFileUrls(`kokoro/voices/${voiceId}.bin`));
  const failures = [];
  for (const candidate of candidates) {
    try {
      const response = await originalFetch(candidate, init);
      if (response.ok) return response;
      failures.push(`${new URL(candidate).hostname}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${new URL(candidate).hostname}: ${error?.message || String(error)}`);
    }
  }
  throw new Error(`MODEL_MIRRORS_UNAVAILABLE: ${failures.join("; ")}`);
}

export async function predictKokoroVoice(input, onProgress) {
  const tts = await loadRuntime(onProgress);
  onProgress?.({ backend: "wasm", progress: 92 });
  // Let React paint the phase change before main-thread WASM inference starts.
  // Otherwise the last download label remains visible throughout generation.
  await new Promise((resolve) => {
    if (globalThis.requestAnimationFrame) requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

  // kokoro-js currently hard-codes its upstream voice-style URL. Intercept
  // only that one request so every runtime voice artifact comes from the
  // owned, immutable provider mirrors while retaining kokoro-js's cache key.
  const upstreamUrl = `${UPSTREAM_VOICE_PREFIX}${input.voiceId}.bin`;
  const originalFetch = globalThis.fetch;
  const mirroredFetch = (resource, init) => {
    const requestUrl = typeof resource === "string" ? resource : resource?.url;
    return requestUrl === upstreamUrl
      ? fetchOwnedVoiceStyle(input.voiceId, originalFetch, init)
      : originalFetch(resource, init);
  };
  globalThis.fetch = mirroredFetch;
  try {
    const audio = await tts.generate(input.text, { voice: input.voiceId, speed: input.speed });
    return audio.toBlob();
  } finally {
    if (globalThis.fetch === mirroredFetch) globalThis.fetch = originalFetch;
  }
}

export async function clearKokoroVoiceCacheIfStorageTight() {
  if (!globalThis.navigator?.storage?.estimate || !globalThis.caches) return false;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const remaining = Math.max(0, quota - usage);
    if (!quota || (usage / quota <= 0.85 && remaining >= 100 * 1024 * 1024)) return false;
    return caches.delete(KOKORO_VOICE_CACHE);
  } catch {
    return false;
  }
}
