const ANNA_EDITION = import.meta.env.VITE_ANNA_EDITION === "true";
const MODEL_CACHE_WORKER_URL = ANNA_EDITION
  ? new URL("model-cache-sw.js", document.baseURI).href
  : "/model-cache-sw.js";
let registrationPromise = null;

function waitForController() {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 3000);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export function registerModelCacheServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  registrationPromise ??= Promise.resolve()
    .then(() =>
      navigator.serviceWorker.register(
        MODEL_CACHE_WORKER_URL,
        ANNA_EDITION ? { scope: new URL("./", document.baseURI).href } : undefined,
      ),
    )
    .then(async (registration) => {
      if (!ANNA_EDITION) await navigator.serviceWorker.ready;
      await registration.update().catch(() => {});
      await waitForController();
      return registration;
    })
    .catch((error) => {
      console.warn("Model cache service worker registration failed.", error);
      return null;
    });
  return registrationPromise;
}

export function waitForModelCacheServiceWorker() {
  return registerModelCacheServiceWorker();
}
