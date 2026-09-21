const MODEL_CACHE_NAME = "timeline-studio-model-cache-v5";
const APP_CACHE_NAME = "timeline-studio-app-shell-v3";
const APP_SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/timeline-studio-icon.svg",
  "/icons/timeline-studio-icon-192.png",
  "/icons/timeline-studio-icon-512.png",
  "/icons/timeline-studio-apple-touch.png",
];
const CACHEABLE_EXTENSIONS = [
  ".bin",
  ".css",
  ".js",
  ".json",
  ".model",
  ".mp4",
  ".onnx",
  ".png",
  ".safetensors",
  ".txt",
  ".wasm",
];
const HUGGING_FACE_HOSTS = new Set([
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "cdn-lfs-us-1.hf.co",
  "cdn-lfs-eu-1.hf.co",
]);
const MODEL_SCOPE_HOSTS = new Set([
  "modelscope.cn",
  "www.modelscope.cn",
  "modelscope.oss-cn-beijing.aliyuncs.com",
]);
const MIRRORED_REPOSITORIES = new Set([
  "stable-audio-3-small-music-onnx",
  "timeline-studio-onnx-models",
  "timeline-studio-voice-models",
  "timeline-studio-vocal-remover",
]);
const STABLE_AUDIO_REVISION = "0b8a05e0bc3511e674b4cb3413d3ef6c48880cdb";
const VOCAL_REMOVER_REVISION = "927cd9272154b85c53518daf44063ee033ee22c3";
const PREVIOUS_VOICE_MODEL_HUGGING_FACE_REVISIONS = new Set([
  "8471955b41238ec0b231d0e3e8e3ac852be6652b",
  "b5ea1e4dce976b03cc56b1bdc354412cc9cc77b0",
  "75946ddacf692c9ac75cee206d63cf0b82afc2a6",
  "4e6aeeebef1832b1eb128c61dae04c19dc7112c1",
]);
const VOICE_MODEL_HUGGING_FACE_REVISION = "074a57bc4dac9c58568b031898ea79da6f36b282";
const VOICE_MODEL_MODELSCOPE_REVISION = "9cb5ab964c014b182701153bd00f7a2202f5dce8";
const OPENVOICE_HUGGING_FACE_REVISION = "d9e0542e0e4e8fcfb849240f7e8e7fa8147df1a3";
const OPENVOICE_MODELSCOPE_REVISION = "226b24270b69b38781a35566c7d442061f9e3b81";
const SILERO_HUGGING_FACE_REVISION = "c76fc14496a26d75096072140627db3e4437f52b";
const SILERO_MODELSCOPE_REVISION = "5b210f4bce036b194e4142345bbdaf9b34363ef4";
const DEPTH_MODEL_HUGGING_FACE_REVISION = "a0806c6fb9484894dcb78df523156d244461515d";
const DEPTH_MODEL_MODELSCOPE_REVISION = "4cc757f80330e22cb8f82b628c53ceca6307fd12";
function hasCacheableExtension(pathname) {
  return CACHEABLE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

function isHuggingFaceModelRequest(url) {
  if (!HUGGING_FACE_HOSTS.has(url.hostname)) {
    return false;
  }

  // Piper's runtime owns its OPFS cache. Caching the same voice files here
  // would keep a second full model copy for every non-English language.
  if (isPiperVoiceRequest(url)) return false;
  return url.hostname !== "huggingface.co" || url.pathname.includes("/resolve/");
}

function isModelScopeModelRequest(url) {
  if (!MODEL_SCOPE_HOSTS.has(url.hostname)) return false;
  // Piper is persisted in OPFS by its runtime so both public sources share
  // one source-independent cache entry instead of duplicating a large model.
  if (isPiperVoiceRequest(url)) return false;
  return url.hostname !== "www.modelscope.cn" || url.pathname.includes("/resolve/");
}

function isPiperVoiceRequest(url) {
  return url.pathname.includes("/rhasspy/piper-voices/resolve/")
    || (url.pathname.includes("/timeline-studio-voice-models/resolve/") && url.pathname.includes("/piper/"));
}

function canonicalModelIdentity(url) {
  let match;
  if (HUGGING_FACE_HOSTS.has(url.hostname)) {
    match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/resolve\/([^/]+)\/(.+)$/);
  } else if (MODEL_SCOPE_HOSTS.has(url.hostname)) {
    match = url.pathname.match(/^\/models\/([^/]+)\/([^/]+)\/resolve\/([^/]+)\/(.+)$/);
  }
  if (!match) return "";

  let [, owner, repository, revision, path] = match;
  if (owner === "martindelophy" && MIRRORED_REPOSITORIES.has(repository)) owner = "haixin";
  if (owner === "lsb" && repository === "stable-audio-3-small-music-onnx") {
    owner = "haixin";
    revision = STABLE_AUDIO_REVISION;
  }
  if (owner === "haixin" && repository === "timeline-studio-vocal-remover" && revision === "main") {
    revision = VOCAL_REMOVER_REVISION;
  }
  if (owner === "haixin" && repository === "timeline-studio-voice-models") {
    if (path.startsWith("silero-vad/") && revision === SILERO_MODELSCOPE_REVISION) {
      revision = SILERO_HUGGING_FACE_REVISION;
    } else if (path.startsWith("openvoice-v2-converter-fp16/") && revision === OPENVOICE_MODELSCOPE_REVISION) {
      revision = OPENVOICE_HUGGING_FACE_REVISION;
    } else if (revision === VOICE_MODEL_MODELSCOPE_REVISION) {
      revision = VOICE_MODEL_HUGGING_FACE_REVISION;
    }
  }
  if (
    owner === "haixin"
    && repository === "timeline-studio-onnx-models"
    && revision === DEPTH_MODEL_MODELSCOPE_REVISION
    && path.startsWith("depth-anything-v2-small/")
  ) {
    revision = DEPTH_MODEL_HUGGING_FACE_REVISION;
  }
  return `${owner}/${repository}/${revision}/${path}`;
}

function canonicalModelCacheRequest(request) {
  const identity = canonicalModelIdentity(new URL(request.url));
  return identity
    ? new Request(`${self.location.origin}/__model-cache__/${identity}`)
    : request;
}

async function removeLegacyPiperDuplicates() {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const keys = await cache.keys();
  await Promise.all(keys.filter((request) => isPiperVoiceRequest(new URL(request.url))).map((request) => cache.delete(request)));
}

async function removeLegacyKokoroFp32Model() {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const keys = await cache.keys();
  await Promise.all(keys.filter((request) => {
    const pathname = new URL(request.url).pathname;
    return pathname.endsWith("/kokoro/onnx/model.onnx")
      || (pathname.includes("/Kokoro-82M-v1.0-ONNX/") && pathname.endsWith("/onnx/model.onnx"));
  }).map((request) => cache.delete(request)));
}

async function migratePreviousVoiceRevision() {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const keys = await cache.keys();
  const changedPaths = new Set([
    "kokoro-multi-lang-v1_1-fp16-4voices/README.md",
    "kokoro-multi-lang-v1_1-fp16-4voices/SOURCE_NOTES.md",
    "kokoro-multi-lang-v1_1-fp16-4voices/manifest.json",
    "kokoro-multi-lang-v1_1-fp16-4voices/runtime/sherpa-onnx-wasm-main-tts.data.part-005.bin",
    "kokoro-multi-lang-v1_1-fp16-4voices/samples/zh_m_yansheng.mp3",
  ]);
  await Promise.all(keys.map(async (request) => {
    const pathname = new URL(request.url).pathname;
    const oldRevision = [...PREVIOUS_VOICE_MODEL_HUGGING_FACE_REVISIONS].find((revision) => (
      pathname.startsWith(`/__model-cache__/haixin/timeline-studio-voice-models/${revision}/`)
    ));
    if (!oldRevision) return;
    const relativePath = pathname.slice(`/__model-cache__/haixin/timeline-studio-voice-models/${oldRevision}/`.length);
    if (
      changedPaths.has(relativePath)
      || relativePath.startsWith("kokoro-multi-lang-v1_1-fp16-4voices/")
      || relativePath.startsWith("hojo-tts-light-40m-zh-2voices-fp32-v1/")
      || relativePath.startsWith("hojo-tts-light-80m-zh-2voices-fp16-v1/")
    ) {
      await cache.delete(request);
      return;
    }
    const targetRevision = relativePath.startsWith("openvoice-v2-converter-fp16/")
      ? OPENVOICE_HUGGING_FACE_REVISION
      : VOICE_MODEL_HUGGING_FACE_REVISION;
    const response = await cache.match(request);
    if (!response) return;
    const target = new Request(`${self.location.origin}/__model-cache__/haixin/timeline-studio-voice-models/${targetRevision}/${relativePath}`);
    await cache.put(target, response);
    await cache.delete(request);
  }));
}

function isRuntimeAssetRequest(url) {
  if (url.origin === self.location.origin) {
    return url.pathname.startsWith("/models/")
      || (url.pathname.startsWith("/assets/") && hasCacheableExtension(url.pathname));
  }

  return false;
}

function shouldCacheRequest(request) {
  if (request.method !== "GET" || request.headers.has("range")) {
    return false;
  }

  const url = new URL(request.url);
  return isHuggingFaceModelRequest(url) || isModelScopeModelRequest(url) || isRuntimeAssetRequest(url);
}

function isAiMusicModelRequest(url) {
  return url.pathname.includes("/stable-audio-3-small-music-onnx/");
}

function withCacheStatus(response, status) {
  const headers = new Headers(response.headers);
  headers.set("X-Timeline-Model-Cache", status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cacheFirst(request, event) {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cacheRequest = canonicalModelCacheRequest(request);
  let cached = await cache.match(cacheRequest);
  let needsCanonicalMigration = false;
  if (!cached && cacheRequest.url !== request.url) {
    cached = await cache.match(request);
    needsCanonicalMigration = Boolean(cached);
  }
  if (!cached && cacheRequest.url !== request.url) {
    const keys = await cache.keys();
    const equivalent = keys.find((key) => canonicalModelCacheRequest(key).url === cacheRequest.url);
    if (equivalent) {
      cached = await cache.match(equivalent);
      needsCanonicalMigration = Boolean(cached && equivalent.url !== cacheRequest.url);
    }
  }
  if (cached) {
    // Only copy legacy source-specific entries into the canonical key. A
    // canonical hit must never overwrite itself while its body is streaming
    // to the requesting worker; doing so can leave reader.read() pending.
    if (needsCanonicalMigration) {
      event.waitUntil(cache.put(cacheRequest, cached.clone()).catch(() => {}));
    }
    return withCacheStatus(cached, "hit");
  }

  const response = await fetch(request);
  // AI music downloads remain parallel, while its worker owns canonical,
  // cross-tab-deduplicated Cache Storage writes. Cloning several ~100 MB
  // streams here would create a second persistent copy of every artifact.
  if ((response.ok || response.type === "opaque") && !isAiMusicModelRequest(new URL(request.url))) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname.includes("timeline-studio-voice-models")) {
      try {
        const estimate = await self.navigator?.storage?.estimate?.();
        const requiredBytes = Number(response.headers.get("content-length")) || 0;
        const remainingBytes = Math.max(0, (estimate?.quota || 0) - (estimate?.usage || 0));
        if (requiredBytes && estimate?.quota && remainingBytes < requiredBytes * 1.15) {
          const keys = await cache.keys();
          const currentIdentity = canonicalModelIdentity(requestUrl);
          const currentFamily = currentIdentity.split("/")[3] || "";
          const staleVoiceKeys = keys.filter((key) => {
            const keyUrl = new URL(key.url);
            if (!keyUrl.pathname.includes("timeline-studio-voice-models")) return false;
            const identity = canonicalModelIdentity(keyUrl) || keyUrl.pathname.split("timeline-studio-voice-models/").at(-1) || "";
            return !currentFamily || !identity.includes(`/${currentFamily}/`);
          });
          await Promise.all(staleVoiceKeys.map((key) => cache.delete(key)));
          await caches.delete("kokoro-voices").catch(() => false);
          await caches.delete("timeline-studio-voice-models-v2").catch(() => false);
        }
      } catch {
        // Capacity checks are advisory. A failed estimate must never block the
        // live response or expose a storage error to the editor.
      }
    }
    // Keep the service worker alive until the large model shard is durably
    // committed. The live response remains streaming and is not blocked.
    event.waitUntil(cache.put(cacheRequest, response.clone()).catch(async (error) => {
      if (error?.name !== "QuotaExceededError") {
        console.warn("Model cache write failed.", error);
        return;
      }
      const requestUrl = new URL(request.url);
      if (!requestUrl.pathname.includes("timeline-studio-voice-models")) return;
      // Voice models share a bounded browser quota. Evict older voice families
      // so the next model file can persist. Do not clone/refetch this large
      // response a second time merely to fill an optional cache.
      const keys = await cache.keys();
      const modelFamily = (url) => {
        const pathname = new URL(url).pathname;
        const markerIndex = pathname.indexOf("timeline-studio-voice-models/");
        if (markerIndex < 0) return "";
        const parts = pathname.slice(markerIndex + "timeline-studio-voice-models/".length).split("/").filter(Boolean);
        if (parts[0] === "resolve") parts.splice(0, 2);
        else parts.shift();
        return parts[0] || "";
      };
      const currentFamily = modelFamily(request.url);
      const staleVoiceKeys = keys.filter((key) => (
        key.url !== cacheRequest.url
        && new URL(key.url).pathname.includes("timeline-studio-voice-models")
        && modelFamily(key.url) !== currentFamily
      ));
      await Promise.all(staleVoiceKeys.map((key) => cache.delete(key)));
      await caches.delete("kokoro-voices").catch(() => false);
    }));
  }
  return withCacheStatus(response, "miss");
}

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const activeCacheNames = new Set([APP_CACHE_NAME, MODEL_CACHE_NAME]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("timeline-studio-") && !activeCacheNames.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
  // Older Transformers.js builds created a second copy of Hugging Face model
  // assets here. The service worker is now the sole cache owner.
  event.waitUntil(caches.delete("transformers-cache").catch(() => false));
  event.waitUntil(caches.delete("stable-audio-3-small-music-q4-v1").catch(() => false));
  event.waitUntil(removeLegacyPiperDuplicates().catch(() => {}));
  event.waitUntil(removeLegacyKokoroFp32Model().catch(() => {}));
  event.waitUntil(migratePreviousVoiceRevision().catch(() => {}));
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (!shouldCacheRequest(event.request)) {
    return;
  }

  event.respondWith(cacheFirst(event.request, event));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_MODEL_CACHE") {
    return;
  }

  event.waitUntil(caches.delete(MODEL_CACHE_NAME));
});
