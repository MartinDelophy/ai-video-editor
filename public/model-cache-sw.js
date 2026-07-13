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
function hasCacheableExtension(pathname) {
  return CACHEABLE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

function isHuggingFaceModelRequest(url) {
  if (!HUGGING_FACE_HOSTS.has(url.hostname)) {
    return false;
  }

  return url.hostname !== "huggingface.co" || url.pathname.includes("/resolve/");
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
  return isHuggingFaceModelRequest(url) || isRuntimeAssetRequest(url);
}

async function cacheFirst(request) {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
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
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (!shouldCacheRequest(event.request)) {
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_MODEL_CACHE") {
    return;
  }

  event.waitUntil(caches.delete(MODEL_CACHE_NAME));
});
