function abortError() { return new DOMException("Detail enhancement canceled", "AbortError"); }

// Keep the input alive until the GPU attempt completes. A stuck driver can also
// block the worker's event loop, so the watchdog must live on the main thread.
export function createDetailProcessor(signal, onProgress) {
  const makeWorker = () => new Worker(new URL("../workers/detailEnhancement.worker.js", import.meta.url), { type: "module" });
  let worker = makeWorker();
  let cpuOnly = false;
  let rejectActive = null;
  let disposed = false;
  const abort = () => { worker.terminate(); rejectActive?.(abortError()); };
  signal?.addEventListener("abort", abort, { once: true });

  function request(bitmap, settings, outputType, forceCpu) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const activeWorker = worker;
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        activeWorker.onmessage = activeWorker.onerror = activeWorker.onmessageerror = null;
        rejectActive = null;
        if (error) reject(error); else resolve(result);
      };
      const timer = setTimeout(() => {
        activeWorker.terminate();
        finish(new DOMException("Detail enhancement worker timed out", "TimeoutError"));
      }, forceCpu ? 60_000 : 15_000);
      rejectActive = (error) => finish(error);
      activeWorker.onmessage = ({ data }) => {
        if (data.requestId !== requestId) return;
        finish(data.error ? new Error(data.error) : null, data.result);
      };
      activeWorker.onerror = (event) => { event.preventDefault(); finish(new Error(event.message)); };
      activeWorker.onmessageerror = () => finish(new Error("Detail enhancement response could not be read"));
      try { activeWorker.postMessage({ requestId, bitmap, settings, outputType, forceCpu }, [bitmap]); }
      catch (error) { bitmap.close(); finish(error); }
    });
  }

  return {
    async frame({ bitmap, settings, outputType = "blob" }) {
      try {
        if (signal?.aborted || disposed) throw abortError();
        if (cpuOnly) return await request(bitmap, settings, outputType, true);
        // Only accelerated attempts need a backup; CPU frames transfer directly.
        const transferable = await createImageBitmap(bitmap);
        if (signal?.aborted || disposed) { transferable.close(); throw abortError(); }
        try {
          const result = await request(transferable, settings, outputType, false);
          cpuOnly = result.backend === "cpu";
          return result;
        } catch (error) {
          if (signal?.aborted || disposed || error?.name === "AbortError") throw error;
          worker.terminate();
          worker = makeWorker();
          cpuOnly = true;
          onProgress?.({ phaseKey: "hdRestorePhaseCpuFallback", backend: "cpu" });
          return await request(bitmap, settings, outputType, true);
        }
      } finally { bitmap.close(); }
    },
    dispose() {
      disposed = true;
      signal?.removeEventListener("abort", abort);
      abort();
    },
  };
}
