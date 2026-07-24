export function createExportAbortError() {
  const error = new Error("Export canceled");
  error.name = "AbortError";
  return error;
}

export function isExportAbortError(error) {
  return error?.name === "AbortError";
}

export function throwIfExportAborted(signal) {
  if (signal?.aborted) throw createExportAbortError();
}

export function waitForExportTimeout(milliseconds, signal, runtime = globalThis) {
  throwIfExportAborted(signal);
  return new Promise((resolve, reject) => {
    let timer;
    const abort = () => {
      runtime.clearTimeout(timer);
      reject(createExportAbortError());
    };
    timer = runtime.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, Math.max(0, Number(milliseconds) || 0));
    signal?.addEventListener("abort", abort, { once: true });
  });
}
