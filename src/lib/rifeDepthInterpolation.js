// Practical-RIFE 4.17-lite: motion interpolation of depth, not crossfading.
// Keep only the current source pair in the worker; cancellation releases its GPU.
export async function createRifeDepthInterpolator(signal, { executionProvider = "webgpu" } = {}) {
  const worker = new Worker(new URL("../workers/rife-depth.worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let sequence = 0;
  let closed = false;
  const dispose = () => {
    if (closed) return;
    closed = true;
    worker.terminate();
    signal?.removeEventListener("abort", dispose);
    pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(new DOMException("Canceled", "AbortError")); });
    pending.clear();
  };
  const fail = (error) => {
    pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(error); });
    pending.clear();
    dispose();
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
  signal?.addEventListener("abort", dispose, { once: true });
  const source = document.createElement("canvas");
  const output = document.createElement("canvas");
  let pairKey = "";
  const grayPixels = (image, width, height) => {
    source.width = width; source.height = height;
    const context = source.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    return Uint8ClampedArray.from({ length: width * height }, (_, i) => rgba[i * 4]);
  };
  try { await call("setup", { executionProvider }); } catch (error) { dispose(); throw error; }
  return {
    dispose,
    async interpolate(frame) {
      const { depthVisual, nextDepthVisual, depthMix, depthUrl, nextDepthUrl } = frame;
      if (!nextDepthVisual || !depthMix || depthUrl === nextDepthUrl) return depthVisual;
      const key = `${depthUrl}::${nextDepthUrl}`;
      const width = depthVisual.naturalWidth || depthVisual.width;
      const height = depthVisual.naturalHeight || depthVisual.height;
      if (key !== pairKey) {
        const first = grayPixels(depthVisual, width, height);
        const second = grayPixels(nextDepthVisual, width, height);
        await call("pair", { width, height, first, second }, [first.buffer, second.buffer]);
        pairKey = key;
      }
      const result = await call("interpolate", { time: depthMix });
      output.width = width; output.height = height;
      const context = output.getContext("2d");
      const pixels = context.createImageData(width, height);
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
