const MODEL_CACHE_NAME = "timeline-studio-model-cache-v4";
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
  "timeline-studio-vocal-remover",
]);
const STABLE_AUDIO_REVISION = "0b8a05e0bc3511e674b4cb3413d3ef6c48880cdb";
const VOCAL_REMOVER_REVISION = "927cd9272154b85c53518daf44063ee033ee22c3";
function hasCacheableExtension(pathname) {
  return CACHEABLE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

function isHuggingFaceModelRequest(url) {
  if (!HUGGING_FACE_HOSTS.has(url.hostname)) {
    return false;
  }

  // Piper's runtime owns its OPFS cache. Caching the same voice files here
  // would keep a second full model copy for every non-English language.
  if (url.pathname.includes("/rhasspy/piper-voices/resolve/")) return false;
  return url.hostname !== "huggingface.co" || url.pathname.includes("/resolve/");
}

function isModelScopeModelRequest(url) {
  if (!MODEL_SCOPE_HOSTS.has(url.hostname)) return false;
  // Piper is persisted in OPFS by its runtime so both public sources share
  // one source-independent cache entry instead of duplicating a large model.
  if (url.pathname.includes("/rhasspy/piper-voices/resolve/")) return false;
  return url.hostname !== "www.modelscope.cn" || url.pathname.includes("/resolve/");
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
  await Promise.all(keys.filter((request) => new URL(request.url).pathname.includes("/rhasspy/piper-voices/resolve/")).map((request) => cache.delete(request)));
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
  if (response.ok || response.type === "opaque") {
    // Keep the service worker alive until the large model shard is durably
    // committed. The live response remains streaming and is not blocked.
    event.waitUntil(cache.put(cacheRequest, response.clone()).catch((error) => {
      if (error?.name !== "QuotaExceededError") console.warn("Model cache write failed.", error);
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
