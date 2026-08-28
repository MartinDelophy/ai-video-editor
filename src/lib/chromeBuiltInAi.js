// Chrome requires a fresh user activation while a built-in model is not ready.
// Automatic create() retries therefore cannot reliably resume a download; the
// UI must ask the user to click Retry so the next attempt has activation.
const DEFAULT_MAX_ATTEMPTS = 1;
const DEFAULT_STALL_TIMEOUT_MS = 45_000;
const DEFAULT_RETRY_DELAY_MS = 900;
const NON_RETRYABLE_ERROR_NAMES = new Set([
  "NotAllowedError",
  "NotSupportedError",
  "SecurityError",
  "TypeError",
]);

function abortError() {
  if (typeof DOMException === "function") return new DOMException("Aborted", "AbortError");
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function stalledError() {
  const error = new Error("Chrome built-in model download stalled");
  error.name = "ModelDownloadStalledError";
  return error;
}

function clampProgress(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function waitForRetry(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(done, delayMs);
    function done() {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

function isRetryable(error) {
  return !NON_RETRYABLE_ERROR_NAMES.has(error?.name);
}

/**
 * Creates a Chrome built-in AI session with stall detection and bounded retries.
 * Chrome owns the model files and partial-download cache, so a new create() call
 * is the only supported way for an app to resume an interrupted download.
 */
export async function createChromeBuiltInSession({
  create,
  options = {},
  signal,
  onDownloadProgress,
  onRetry,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}) {
  if (typeof create !== "function") throw new TypeError("Chrome built-in AI create() is unavailable");
  const attempts = Math.max(1, Math.floor(Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS));
  let furthestProgress = 0;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) throw abortError();
    const attemptController = new AbortController();
    let attemptProgress = 0;
    let abandoned = false;
    let watchdogTimeout;
    let rejectWatchdog;
    const watchdog = new Promise((_, reject) => { rejectWatchdog = reject; });
    const resetWatchdog = () => {
      clearTimeout(watchdogTimeout);
      watchdogTimeout = setTimeout(() => {
        abandoned = true;
        rejectWatchdog(stalledError());
        attemptController.abort();
      }, Math.max(1_000, Number(stallTimeoutMs) || DEFAULT_STALL_TIMEOUT_MS));
    };
    const handleExternalAbort = () => {
      abandoned = true;
      attemptController.abort();
      rejectWatchdog(abortError());
    };
    signal?.addEventListener("abort", handleExternalAbort, { once: true });
    resetWatchdog();

    const originalMonitor = options.monitor;
    let createPromise;
    try {
      // Keep the first call synchronous so Chrome can consume transient user
      // activation when it needs permission to begin a model download.
      createPromise = Promise.resolve(create({
        ...options,
        signal: attemptController.signal,
        monitor(monitor) {
          originalMonitor?.(monitor);
          monitor.addEventListener("downloadprogress", (event) => {
            const loaded = clampProgress(event.loaded);
            if (loaded > attemptProgress) {
              attemptProgress = loaded;
              resetWatchdog();
            }
            furthestProgress = Math.max(furthestProgress, loaded);
            onDownloadProgress?.(furthestProgress);
          });
        },
      }));
    } catch (error) {
      createPromise = Promise.reject(error);
    }
    createPromise.then((session) => {
      if (abandoned) session?.destroy?.();
    }, () => {});

    try {
      const session = await Promise.race([createPromise, watchdog]);
      clearTimeout(watchdogTimeout);
      signal?.removeEventListener("abort", handleExternalAbort);
      return session;
    } catch (error) {
      clearTimeout(watchdogTimeout);
      signal?.removeEventListener("abort", handleExternalAbort);
      abandoned = true;
      attemptController.abort();
      if (signal?.aborted) throw abortError();
      lastError = error;
      if (attempt >= attempts || !isRetryable(error)) throw error;
      onRetry?.({ attempt: attempt + 1, maxAttempts: attempts, progress: furthestProgress, error });
      await waitForRetry(Math.min(4_000, retryDelayMs * (2 ** (attempt - 1))), signal);
    }
  }
  throw lastError;
}
