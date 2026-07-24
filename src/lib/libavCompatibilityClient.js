function runLibavWorker(type, file, { signal } = {}) {
  if (!(file instanceof Blob)) return Promise.reject(new TypeError("A media Blob is required"));
  if (signal?.aborted)
    return Promise.reject(new DOMException("Media compatibility task cancelled", "AbortError"));

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/libav-compat.worker.js", import.meta.url), {
      type: "module",
      name: `timeline-studio-libav-${type}`,
    });
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const abort = () =>
      finish(reject, new DOMException("Media compatibility task cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) =>
      finish(reject, new Error(event.message || "libav.js worker failed"));
    worker.onmessage = (event) => {
      if (event.data?.type === "result") return finish(resolve, event.data.result);
      if (event.data?.type === "error")
        return finish(reject, new Error(event.data.message || "libav.js probe failed"));
    };
    worker.postMessage({ type, file, name: file.name || "input.mkv" });
  });
}

export function probeWithLibavWorker(file, options) {
  return runLibavWorker("probe", file, options);
}

export async function probeAndDecodeAudioWithLibavWorker(file, options) {
  const result = await runLibavWorker("probe-and-decode-audio", file, options);
  if (!result.decodedAudio) return result;
  const { buffer, ...decodedAudio } = result.decodedAudio;
  return {
    ...result,
    decodedAudio: {
      ...decodedAudio,
      blob: new Blob([buffer], { type: "audio/wav" }),
    },
  };
}

export async function decodeAudioWithLibavWorker(file, options) {
  const result = await runLibavWorker("decode-audio", file, options);
  return {
    ...result,
    blob: new Blob([result.buffer], { type: "audio/wav" }),
  };
}
