export function composeRepairWithWebCodecs(options) {
  const { signal, onProgress, ...payload } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Repair canceled", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("../workers/repairVideoComposition.worker.js", import.meta.url), { type: "module" });
    const cleanup = () => { signal?.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("Repair canceled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.({ progress: data.progress, phaseKey: "remasterPhaseEncodeVideo" });
      else {
        cleanup();
        if (data.type === "done") resolve(data.blob);
        else reject(new Error(data.message || "Native video composition unavailable"));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      cleanup();
      reject(new Error(event.message || "Native video composition unavailable"));
    };
    try { worker.postMessage(payload); } catch (error) { cleanup(); reject(error); }
  });
}
