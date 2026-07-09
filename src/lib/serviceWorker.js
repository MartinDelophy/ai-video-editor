const MODEL_CACHE_WORKER_URL = "/model-cache-sw.js";

export function registerModelCacheServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register(MODEL_CACHE_WORKER_URL)
    .then((registration) => registration.update().catch(() => {}))
    .catch((error) => {
      console.warn("Model cache service worker registration failed.", error);
    });
}
