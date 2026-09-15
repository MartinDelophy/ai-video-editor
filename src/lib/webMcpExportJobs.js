import {
  DEFAULT_EXPORT_SETTINGS,
  getExportEstimate,
  getExportRange,
  getExportTechnicalSummary,
  normalizeExportSettings,
  sanitizeExportFileName,
} from "./exportSettings.js";

const MAX_JOBS = 64;
const MAX_REQUESTS = 1024;
const terminal = (status) => ["succeeded", "failed", "cancelled"].includes(status);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const object = (value, allowed) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))) fail("INVALID_ARGUMENT");
};
const identifier = (value) => {
  if (typeof value !== "string" || !value.trim() || value.length > 256) fail("INVALID_ARGUMENT");
  return value;
};
const clone = (value) => JSON.parse(JSON.stringify(value));

export const WEB_MCP_EXPORT_SETTINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    resolution: { type: "string", enum: ["720", "1080", "1440", "2160"] },
    frameRate: { type: "number", enum: [24, 30, 60] },
    codec: { type: "string", enum: ["h264", "h264-mov", "vp9", "vp8"] },
    quality: { type: "string", enum: ["standard", "high", "ultra"] },
    pipeline: { type: "string", enum: ["auto", "deterministic", "compatible"] },
    audio: { type: "string", enum: ["mix", "none"] },
    audioBitsPerSecond: { type: "number", enum: [128_000, 192_000, 256_000, 320_000] },
    captions: { type: "string", enum: ["burned", "none", "burned-srt"] },
    fileName: { type: "string", minLength: 1, maxLength: 96 },
    range: { type: "string", enum: ["full", "custom"] },
    rangeStart: { type: "number", minimum: 0 },
    rangeEnd: { type: "number", minimum: 0 },
    bitrateMode: { type: "string", enum: ["auto", "custom"] },
    customVideoBitsPerSecond: { type: "number", minimum: 1_000_000, maximum: 100_000_000 },
    keyFrameInterval: { type: "number", enum: [1, 2, 5] },
  },
};

/** Reject invalid agent input before the UI's forgiving preference normalization. */
export function validateWebMcpExportSettings(input = {}, defaults = DEFAULT_EXPORT_SETTINGS) {
  const fields = WEB_MCP_EXPORT_SETTINGS_SCHEMA.properties;
  object(input, Object.keys(fields));
  for (const [key, value] of Object.entries(input)) {
    const field = fields[key];
    if (typeof value !== field.type || (field.type === "number" && !Number.isFinite(value))) fail("INVALID_ARGUMENT");
    if (field.enum && !field.enum.includes(value)) fail("INVALID_ARGUMENT");
    if (field.minimum !== undefined && value < field.minimum) fail("INVALID_ARGUMENT");
    if (field.maximum !== undefined && value > field.maximum) fail("INVALID_ARGUMENT");
    if (key === "fileName" && (value.length > 96 || !value.trim()
      || sanitizeExportFileName(value) !== value)) fail("INVALID_ARGUMENT");
  }
  const settings = normalizeExportSettings({ ...normalizeExportSettings(defaults), ...input });
  // This command's reviewed contract is video-only. Audio UI preferences must
  // neither change its output type nor leak unknown fields into a second review.
  delete settings.mediaType;
  delete settings.audioFormat;
  // The real exporter forces MOV through WebCodecs; make that visible in the plan.
  if (settings.codec === "h264-mov") {
    if (input.pipeline === "compatible") fail("INVALID_ARGUMENT");
    settings.pipeline = "deterministic";
  }
  return settings;
}

/**
 * Page-scoped export receipts. The host validates the reviewed project state before
 * start. The shared UI action owns encoding, downloads and its AbortController.
 */
export function createWebMcpExportJobs(getEditor, { makeId = () => crypto.randomUUID() } = {}) {
  const jobs = new Map();
  // Keep small tombstones after receipt eviction so a retry never downloads twice.
  const requests = new Map();
  let active = null;
  let closed = false;
  const guard = () => { if (closed) fail("SESSION_CLOSED"); };
  const describe = (job) => clone({
    jobId: job.jobId,
    requestId: job.requestId,
    stateToken: job.stateToken,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    phaseKey: job.phaseKey,
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    ...job.plan,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
  const prepare = (input = {}) => {
    guard();
    object(input, ["settings"]);
    const editor = getEditor();
    const resolvedSettings = validateWebMcpExportSettings(input.settings, editor.exportSettings);
    const duration = editor.exportContentDuration ?? editor.duration;
    const { ratio } = editor;
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) fail("EMPTY_PROJECT");
    if (!ratio || !Number.isFinite(ratio.width) || !Number.isFinite(ratio.height)
      || ratio.width <= 0 || ratio.height <= 0) fail("INVALID_ARGUMENT");
    if (resolvedSettings.range === "custom" && (resolvedSettings.rangeEnd > duration
      || resolvedSettings.rangeStart >= resolvedSettings.rangeEnd)) fail("INVALID_ARGUMENT");
    const range = getExportRange(resolvedSettings, duration);
    if (range.duration < 1 / Math.max(24, resolvedSettings.frameRate)) fail("INVALID_ARGUMENT");
    return {
      resolvedSettings,
      range,
      technical: getExportTechnicalSummary(resolvedSettings, ratio),
      estimate: getExportEstimate(resolvedSettings, ratio, duration),
      delivery: "browser-download",
    };
  };
  const lookup = (input) => {
    guard();
    object(input, ["jobId"]);
    const job = jobs.get(identifier(input.jobId));
    if (!job) fail("EXPORT_JOB_NOT_FOUND");
    return job;
  };
  const finish = (job, status, error) => {
    job.status = status;
    job.finishedAt = new Date().toISOString();
    if (error) job.error = { code: error };
    job.detachSignal?.();
    job.detachSignal = null;
    if (active === job.jobId) active = null;
  };
  const start = (input, { signal } = {}) => {
    guard();
    object(input, ["stateToken", "settings", "requestId"]);
    const stateToken = identifier(input.stateToken);
    const requestId = input.requestId === undefined ? makeId() : identifier(input.requestId);
    // Compare the caller's supplied settings, independent of changed UI defaults.
    object(input.settings ?? {}, Object.keys(WEB_MCP_EXPORT_SETTINGS_SCHEMA.properties));
    const signature = JSON.stringify({ stateToken, settings: Object.entries(input.settings ?? {}).sort(([a], [b]) => a.localeCompare(b)) });
    if (requests.has(requestId)) {
      const previous = requests.get(requestId);
      if (previous.signature !== signature) fail("INVALID_ARGUMENT");
      const job = jobs.get(previous.jobId);
      if (!job) fail("EXPORT_JOB_NOT_FOUND");
      return { ...describe(job), alreadyStarted: true };
    }
    if (signal?.aborted) fail("CANCELLED");
    const editor = getEditor();
    if (active || editor.exporting || editor.isBusy?.()) fail("EDITOR_BUSY");
    if (typeof editor.exportVideo !== "function") fail("SESSION_CLOSED");
    const plan = prepare({ settings: input.settings });
    if (requests.size >= MAX_REQUESTS) fail("EXPORT_JOB_LIMIT");
    if (jobs.size >= MAX_JOBS) {
      const oldest = [...jobs.values()].find((job) => terminal(job.status));
      if (!oldest) fail("EDITOR_BUSY");
      jobs.delete(oldest.jobId);
    }
    const controller = new AbortController();
    const job = {
      jobId: makeId(), requestId, stateToken, plan, controller,
      status: "queued", progress: 0, phase: "", phaseKey: "",
      cancelRequested: false,
      createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
    };
    jobs.set(job.jobId, job);
    requests.set(requestId, { jobId: job.jobId, signature });
    active = job.jobId;
    const abort = () => {
      if (terminal(job.status)) return;
      job.cancelRequested = true;
      controller.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    job.detachSignal = () => signal?.removeEventListener("abort", abort);
    job.status = "running";
    job.startedAt = new Date().toISOString();
    // Invoke synchronously so the export hook acquires its ref lock before another
    // UI click or tool call can start. Only its completion runs in the background.
    let completion;
    try {
      completion = editor.exportVideo({
        settings: clone(plan.resolvedSettings),
        signal: controller.signal,
        onProgress: (update = {}) => {
          if (terminal(job.status)) return;
          if (Number.isFinite(update.progress)) job.progress = Math.max(job.progress, Math.min(100, Math.max(0, Math.round(update.progress))));
          if (typeof update.phase === "string") job.phase = update.phase;
          if (typeof update.phaseKey === "string") job.phaseKey = update.phaseKey;
        },
      });
    } catch (error) {
      finish(job, error?.name === "AbortError" ? "cancelled" : "failed", error?.name === "AbortError" ? undefined : "EXPORT_FAILED");
      return describe(job);
    }
    Promise.resolve(completion).then((result) => {
      if (result?.status === "success") {
        if (!["mp4", "webm", "mov"].includes(result.extension)
          || !Number.isFinite(result.byteSize) || result.byteSize < 12
          || !["compatible", "deterministic"].includes(result.actualPipeline)) {
          finish(job, "failed", "EXPORT_FAILED");
          return;
        }
        job.progress = 100;
        job.result = {
          extension: result.extension,
          byteSize: result.byteSize,
          actualPipeline: result.actualPipeline,
          fileName: `${plan.resolvedSettings.fileName}.${result.extension}`,
          delivery: "browser-download",
          // The browser controls whether a triggered download is saved to disk.
          downloadTriggered: true,
          formatFallback: result.extension !== ({ h264: "mp4", "h264-mov": "mov", vp9: "webm", vp8: "webm" }[plan.resolvedSettings.codec]),
          sidecars: Array.isArray(result.sidecars) ? result.sidecars.filter((item) => item.extension === "srt" && Number.isFinite(item.byteSize) && item.byteSize > 0)
            .map((item) => ({ fileName: `${plan.resolvedSettings.fileName}.srt`, extension: "srt", byteSize: item.byteSize })) : [],
        };
        // A late cancellation cannot undo an already-triggered browser download.
        finish(job, "succeeded");
      } else if (["canceled", "cancelled"].includes(result?.status)) {
        finish(job, "cancelled");
      } else {
        finish(job, "failed", result?.status === "busy" ? "EDITOR_BUSY" : result?.status === "blocked" ? "EMPTY_PROJECT" : "EXPORT_FAILED");
      }
    }).catch((error) => {
      finish(job, error?.name === "AbortError" ? "cancelled" : "failed", error?.name === "AbortError" ? undefined : "EXPORT_FAILED");
    });
    return describe(job);
  };
  return {
    prepare,
    start,
    isRunning() { return active !== null; },
    inspect(input) { return describe(lookup(input)); },
    cancel(input) {
      const job = lookup(input);
      if (!terminal(job.status)) {
        job.cancelRequested = true;
        job.controller.abort();
      }
      return describe(job);
    },
    close() {
      closed = true;
      for (const job of jobs.values()) {
        if (!terminal(job.status)) { job.cancelRequested = true; job.controller.abort(); }
        job.detachSignal?.();
        job.detachSignal = null;
      }
    },
  };
}
