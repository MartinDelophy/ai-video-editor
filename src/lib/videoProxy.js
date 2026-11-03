// Proxies never enter project state, undo snapshots, analysis or export inputs.
const records = new Map();
const listeners = new Set();
const proxyUrls = new Set();
const urlUsers = new Map();
function releaseUnusedUrls() {
  const retained = new Set([...records.values()].map((record) => record.url));
  for (const url of proxyUrls)
    if (!retained.has(url) && !urlUsers.get(url)) {
      URL.revokeObjectURL(url);
      proxyUrls.delete(url);
      urlUsers.delete(url);
    }
}
export function retainVideoProxyUrl(url) {
  if (proxyUrls.has(url)) urlUsers.set(url, (urlUsers.get(url) || 0) + 1);
}
export function releaseVideoProxyUrl(url) {
  if (urlUsers.has(url)) urlUsers.set(url, Math.max(0, urlUsers.get(url) - 1));
  releaseUnusedUrls();
}
let revision = 0;
let queue = Promise.resolve();
let playing = false;
let pointerDown = false;
let mode = "auto";
let activeWorker = null;
let activeCancel = null;
let activeSource = "";
let cacheEpoch = 0;
let database;
const emit = () => {
  revision++;
  listeners.forEach((listener) => listener());
};
export const subscribeVideoProxy = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getVideoProxyRevision = () => revision;
export const getVideoProxyMode = () => mode;
export function setVideoProxyMode(value) {
  const next = value === "original" ? "original" : "auto";
  if (next === "auto" && mode !== next)
    for (const [src, record] of records) {
      if (record.state === "original") records.delete(src);
    }
  mode = next;
  emit();
}
export function setVideoProxyPlaying(value) {
  playing = value;
  activeWorker?.postMessage({ type: "pause", paused: playing || pointerDown });
}
export function videoProxyInteractionActive() {
  return pointerDown;
}
export function getVideoProxyRecord(src) {
  return records.get(src);
}
export function assertOriginalMediaSource(src, message = "Export requires original media") {
  if (proxyUrls.has(src)) throw new Error(message);
}
export function resolvePreviewMediaSource(src) {
  return mode === "auto" ? records.get(src)?.url || src : src;
}
function openCache() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("timeline-studio-video-proxies", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("proxies", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Proxy cache blocked"));
  });
  return database;
}
async function readCache(key) {
  try {
    const db = await openCache();
    return await new Promise((resolve) => {
      const request = db.transaction("proxies").objectStore("proxies").get(key);
      request.onsuccess = () => resolve(request.result?.blob);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function writeCache(key, blob, epoch) {
  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate?.quota && estimate.quota - estimate.usage < blob.size * 2) return;
    const db = await openCache();
    if (epoch !== cacheEpoch) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction("proxies", "readwrite");
      const store = tx.objectStore("proxies");
      // Keep at most 512 MiB of rebuildable media, oldest first.
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result
          .filter((entry) => entry.key !== key)
          .sort((a, b) => a.created - b.created);
        let bytes = entries.reduce((total, entry) => total + entry.blob.size, 0) + blob.size;
        for (const entry of entries) {
          if (bytes <= 512 * 1024 * 1024) break;
          store.delete(entry.key);
          bytes -= entry.blob.size;
        }
        if (blob.size <= 512 * 1024 * 1024) store.put({ key, blob, created: Date.now() });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* Optional cache: an in-memory proxy remains usable. */
  }
}
function complete(src, blob) {
  const url = URL.createObjectURL(blob);
  proxyUrls.add(url);
  records.set(src, { state: "ready", progress: 1, url });
  emit();
}
async function run(asset) {
  const src = asset.src;
  while (records.get(src)?.state === "queued" && (playing || pointerDown || document.hidden))
    await new Promise((resolve) => setTimeout(resolve, 300));
  if (records.get(src)?.state !== "queued") return;
  const blob =
    asset.blob instanceof Blob
      ? asset.blob
      : await fetch(src).then((response) => {
          if (!response.ok) throw new Error("Source unavailable");
          return response.blob();
        });
  if (records.get(src)?.state !== "queued") return;
  await new Promise((resolve) => {
    const worker = new Worker(new URL("../workers/videoProxy.worker.js", import.meta.url), {
      type: "module",
    });
    activeWorker = worker;
    activeSource = src;
    const epoch = cacheEpoch;
    const finish = () => {
      worker.terminate();
      if (activeWorker === worker) {
        activeWorker = null;
        activeCancel = null;
        activeSource = "";
      }
      resolve();
    };
    activeCancel = finish;
    worker.onmessage = async ({ data }) => {
      if (activeWorker !== worker) return;
      if (data.type === "identity") {
        const cached = await readCache(data.key);
        if (activeWorker !== worker) return;
        if (cached instanceof Blob) {
          complete(src, cached);
          finish();
        } else worker.postMessage({ type: "continue" });
      } else if (data.type === "progress") {
        records.set(src, { state: "preparing", progress: data.progress });
        emit();
      } else if (data.type === "done") {
        complete(src, data.blob);
        void writeCache(data.key, data.blob, epoch);
        finish();
      } else if (data.type === "skip") {
        records.set(src, { state: "original" });
        emit();
        finish();
      } else if (data.type === "error") {
        finish();
        records.set(src, { state: "original", reason: data.message });
        emit();
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      records.set(src, { state: "original", reason: event.message });
      emit();
    };
    worker.postMessage({ type: "start", blob });
    worker.postMessage({ type: "pause", paused: playing || pointerDown });
  });
}
export function cancelVideoProxy(src) {
  const failed = records.get(src)?.state === "ready";
  records.set(src, { state: "original", failed });
  if (activeSource === src) activeCancel?.();
  emit();
}
export async function clearVideoProxyCache() {
  cacheEpoch++;
  mode = "original";
  activeCancel?.();
  // Mounted players retain their URL until React has switched their source.
  records.clear();
  releaseUnusedUrls();
  emit();
  try {
    const db = await openCache();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("proxies", "readwrite");
      tx.objectStore("proxies").clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* Cache is optional. */
  }
}
export function synchronizeVideoProxyAssets(assets) {
  const sources = new Set(assets.map((asset) => asset.src));
  for (const src of records.keys())
    if (!sources.has(src)) {
      if (activeSource === src) activeCancel?.();
      records.delete(src);
    }
  releaseUnusedUrls();
}
export function prepareVideoProxy(asset) {
  if (
    mode === "original" ||
    asset?.type !== "video" ||
    !asset.src ||
    asset.preparing ||
    records.has(asset.src) ||
    Math.max(asset.width || 0, asset.height || 0) <= 1280 ||
    typeof VideoEncoder === "undefined" ||
    typeof VideoDecoder === "undefined"
  )
    return;
  records.set(asset.src, { state: "queued", progress: 0 });
  emit();
  queue = queue
    .then(() => run(asset))
    .catch((error) => {
      records.set(asset.src, { state: "original", reason: error.message });
      emit();
    });
}
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () =>
    activeWorker?.postMessage({ type: "pause", paused: playing || pointerDown || document.hidden }),
  );
  window.addEventListener(
    "pointerdown",
    () => {
      pointerDown = true;
      activeWorker?.postMessage({ type: "pause", paused: true });
    },
    true,
  );
  const release = () => {
    pointerDown = false;
    activeWorker?.postMessage({ type: "pause", paused: playing });
    emit();
  };
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
  window.addEventListener("blur", release);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      activeWorker?.terminate();
      proxyUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  });
}
