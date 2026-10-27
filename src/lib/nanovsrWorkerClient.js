import { getModelSourcePreference } from "./modelSources.js";

let worker = null;
const pending = new Map();
const abortError = () => new DOMException("NanoVSR restoration canceled", "AbortError");

function cleanup(request) {
  clearTimeout(request.timer);
  request.signal?.removeEventListener("abort", request.abort);
}

function stopWorker(activeWorker, error) {
  if (worker !== activeWorker) return;
  worker = null;
  activeWorker?.terminate();
  for (const request of pending.values()) {
    cleanup(request);
    request.reject(error);
  }
  pending.clear();
}

function armWatchdog(request, activeWorker, phaseKey = "") {
  clearTimeout(request.timer);
  // Compilation can be slow on a cold GPU. Repeated identical progress must
  // not keep a stalled operation alive; only real progress resets this clock.
  request.timer = setTimeout(() => stopWorker(activeWorker,
    new DOMException("NanoVSR made no progress", "TimeoutError")),
  phaseKey === "hdRestorePhaseCompile" ? 180_000 : 60_000);
}

function getWorker() {
  if (worker) return worker;
  const activeWorker = new Worker(new URL("../workers/nanovsr.worker.js", import.meta.url), { type: "module" });
  worker = activeWorker;
  activeWorker.addEventListener("message", ({ data: message = {} }) => {
    if (worker !== activeWorker) return;
    const request = pending.get(message.requestId);
    if (!request) return;
    if (message.type === "progress") {
      if (message.phaseKey !== request.phaseKey || Number(message.value) > request.value
        || Number(message.downloadedBytes) > request.downloadedBytes) {
        request.phaseKey = message.phaseKey;
        request.value = Number(message.value) || 0;
        request.downloadedBytes = Number(message.downloadedBytes) || 0;
        armWatchdog(request, activeWorker, message.phaseKey);
      }
      request.onProgress?.(message);
      return;
    }
    if (message.type !== "result") {
      stopWorker(activeWorker, new Error(message.error || "NanoVSR restoration failed"));
      return;
    }
    pending.delete(message.requestId);
    cleanup(request);
    request.resolve(message.result);
  });
  activeWorker.addEventListener("error", (event) => {
    event.preventDefault();
    stopWorker(activeWorker, new Error(event.message || "NanoVSR worker failed"));
  });
  activeWorker.addEventListener("messageerror", () => stopWorker(activeWorker, new Error("NanoVSR response could not be read")));
  return activeWorker;
}

export function enhanceNanoVsrBitmaps({ bitmaps, outputCount = bitmaps.length, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted || pending.size) {
      bitmaps.forEach((bitmap) => bitmap.close?.());
      reject(signal?.aborted ? abortError() : new Error("Another NanoVSR task is already running"));
      return;
    }
    let activeWorker;
    try {
      activeWorker = getWorker();
      const requestId = `nanovsr-${crypto.randomUUID?.() ?? Date.now()}`;
      // A cancel message cannot interrupt synchronous GPU/runtime work.
      const abort = () => stopWorker(activeWorker, abortError());
      const request = { resolve, reject, onProgress, signal, abort, timer: null, phaseKey: "", value: -1, downloadedBytes: 0 };
      signal?.addEventListener("abort", abort, { once: true });
      pending.set(requestId, request);
      armWatchdog(request, activeWorker);
      activeWorker.postMessage({ type: "enhance", requestId, bitmaps, outputCount,
        modelSourcePreference: getModelSourcePreference() }, bitmaps);
    } catch (error) {
      bitmaps.forEach((bitmap) => bitmap.close?.());
      if (activeWorker) stopWorker(activeWorker, error);
      reject(error);
    }
  });
}

export function disposeNanoVsrWorker() { stopWorker(worker, abortError()); }
if (import.meta.hot) import.meta.hot.dispose(disposeNanoVsrWorker);
