import { getModelSourcePreference } from "./modelSources";

// Practical-RIFE 4.17-lite: motion interpolation of depth, not crossfading.
// Keep only the current source pair in the worker; cancellation releases its GPU.
const idleWorkers = new Map();
const IDLE_TIMEOUT = 60_000;

// Reuse a verified session between successive jobs, never an active lease.
export async function createRifeDepthInterpolator(signal, { executionProvider = "webgpu", modelSource = getModelSourcePreference() } = {}) {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  executionProvider = executionProvider === "wasm" ? "wasm" : "webgpu";
  const idle = idleWorkers.get(executionProvider);
  if (idle) { clearTimeout(idle.timer); idleWorkers.delete(executionProvider); }
  const worker = idle?.worker || new Worker(new URL("../workers/rife-depth.worker.js", import.meta.url), { type: "module" });
  let initialized = Boolean(idle);
  const pending = new Map();
  let sequence = 0;
  let closed = false;
  const abort = () => dispose(true);
  const dispose = (terminate = false) => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener("abort", abort);
    if (terminate || !initialized || pending.size || signal?.aborted || idleWorkers.has(executionProvider)) {
      worker.terminate();
    } else {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      try { worker.postMessage({ type: "reset" }); } catch { worker.terminate(); return; }
      const entry = { worker, timer: setTimeout(() => {
        if (idleWorkers.get(executionProvider) === entry) idleWorkers.delete(executionProvider);
        worker.terminate();
      }, IDLE_TIMEOUT) };
      const invalidate = () => {
        clearTimeout(entry.timer);
        if (idleWorkers.get(executionProvider) === entry) idleWorkers.delete(executionProvider);
        worker.terminate();
      };
      worker.onerror = (event) => { event.preventDefault(); invalidate(); };
      worker.onmessageerror = invalidate;
      idleWorkers.set(executionProvider, entry);
    }
    pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(new DOMException("Canceled", "AbortError")); });
    pending.clear();
  };
  const fail = (error) => {
    pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(error); });
    pending.clear();
    dispose(true);
  };
  worker.onerror = (event) => { event.preventDefault(); fail(new Error("RIFE worker failed")); };
  worker.onmessageerror = () => fail(new Error("RIFE worker communication failed"));
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.requestId);
    if (!request) return;
    pending.delete(data.requestId);
    clearTimeout(request.timer);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data);
  };
  const call = (type, payload = {}, transfer = []) => new Promise((resolve, reject) => {
    if (closed || signal?.aborted) return reject(new DOMException("Canceled", "AbortError"));
    const requestId = ++sequence;
    const timer = setTimeout(() => fail(new Error("RIFE inference timed out")), 180_000);
    pending.set(requestId, { resolve, reject, timer });
    try { worker.postMessage({ type, requestId, ...payload }, transfer); }
    catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
  });
  signal?.addEventListener("abort", abort, { once: true });
  const source = document.createElement("canvas");
  const output = document.createElement("canvas");
  let pairKey = "";
  let lastGray = null;
  let pixels = null;
  const grayPixels = (image, width, height) => {
    if (source.width !== width || source.height !== height) { source.width = width; source.height = height; }
    const context = source.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < gray.length; i += 1) gray[i] = rgba[i * 4];
    return gray;
  };
  try { if (!initialized) await call("setup", { executionProvider, modelSource }); initialized = true; } catch (error) { dispose(true); throw error; }
  return {
    dispose,
    async interpolate(frame) {
      const { depthVisual, nextDepthVisual, depthMix, depthUrl, nextDepthUrl } = frame;
      if (!nextDepthVisual || depthMix <= 1e-9 || depthUrl === nextDepthUrl) return depthVisual;
      if (depthMix >= 1 - 1e-9) return nextDepthVisual;
      const key = `${depthUrl}::${nextDepthUrl}`;
      const width = depthVisual.naturalWidth || depthVisual.width;
      const height = depthVisual.naturalHeight || depthVisual.height;
      if (key !== pairKey) {
        const first = lastGray?.url === depthUrl && lastGray.width === width && lastGray.height === height
          ? lastGray.gray : grayPixels(depthVisual, width, height);
        const second = grayPixels(nextDepthVisual, width, height);
        // Keep the next frame locally for the following pair; transfer a copy.
        lastGray = { url: nextDepthUrl, width, height, gray: second.slice() };
        await call("pair", { width, height, first, second }, [first.buffer, second.buffer]);
        pairKey = key;
      }
      const result = await call("interpolate", { time: depthMix });
      if (output.width !== width || output.height !== height) {
        output.width = width; output.height = height; pixels = null;
      }
      const context = output.getContext("2d");
      pixels ||= context.createImageData(width, height);
      for (let i = 0; i < result.gray.length; i += 1) {
        pixels.data[i * 4] = result.gray[i];
        pixels.data[i * 4 + 1] = result.gray[i];
        pixels.data[i * 4 + 2] = result.gray[i];
        pixels.data[i * 4 + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      return output;
    },
  };
}
