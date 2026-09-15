import { inspectClip, inspectMarkers, inspectProject, inspectTrack, inspectTranscript } from "./projectCommandEngine.js";
import { browserProjectFingerprint, buildBrowserOperationReview, buildBrowserTimelineReview, getBrowserPlanningClips } from "./browserEditPlan.js";
import { WEB_MCP_EDIT_CAPABILITIES, WEB_MCP_OPERATION_SCHEMA } from "./webMcpOperationSchema.js";
import { browserAssetSummary, browserReviewDiff, browserReviewEntities } from "./webMcpProjectData.js";
import { createWebMcpExportJobs, WEB_MCP_EXPORT_SETTINGS_SCHEMA } from "./webMcpExportJobs.js";

const TRACKS = ["visuals", "overlays", "audio", "captions", "stickers", "music"];
const MAX_PAGE = 100;
const MAX_CLIPS = 500;
const ERROR_KEYS = {
  INVALID_ARGUMENT: "invalidInput", CLIP_NOT_FOUND: "notFound", TRACK_NOT_FOUND: "notFound",
  BROWSER_EDIT_INVALID_PLAN: "invalidPlan", BROWSER_EDIT_COMPLEX_TIMING: "complexTiming",
  BROWSER_EDIT_TRACK_LOCKED: "trackLocked", BROWSER_EDIT_STALE_PLAN: "stale",
  STALE_STATE: "stale", EDITOR_BUSY: "busy", PREVIEW_NOT_FOUND: "missingPreview",
  UNDO_NOT_AVAILABLE: "missingUndo", NO_CHANGES: "noChanges", CANCELLED: "cancelled",
  EMPTY_PROJECT: "emptyProject", SESSION_CLOSED: "unavailable",
  ASSET_NOT_FOUND: "assetUnavailable", ASSET_NOT_READY: "assetNotReady", ASSET_UNAVAILABLE: "assetUnavailable",
  BROWSER_EDIT_INVALID_OPERATION: "invalidOperation", UNSUPPORTED_OPERATION: "invalidOperation",
  EXPORT_JOB_NOT_FOUND: "exportNotFound", EXPORT_JOB_LIMIT: "busy", EXPORT_FAILED: "exportFailed",
  EXPORT_PREVIEW_NOT_FOUND: "exportStale", EXPORT_UNAVAILABLE: "exportUnavailable",
  MARKER_NOT_FOUND: "notFound", MARKER_ALREADY_EXISTS: "invalidInput", CLIP_ALREADY_EXISTS: "invalidInput",
  INVALID_RANGE: "invalidInput", UNSUPPORTED_TRACK: "invalidOperation", UNSUPPORTED_PROPERTY: "invalidOperation",
  BROWSER_EDIT_ASSET_UNAVAILABLE: "assetUnavailable", BROWSER_EDIT_MULTIPLE_MUSIC_SOURCES: "invalidOperation",
  BROWSER_EDIT_MUSIC_OVERLAP: "invalidOperation",
};
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const object = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) fail("INVALID_ARGUMENT");
};
const text = (value, maximum = 256) => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail("INVALID_ARGUMENT");
  return value;
};
const finite = (value, maximum = Infinity) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) fail("INVALID_ARGUMENT");
  return value;
};
function page(items, input) {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 50;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) fail("INVALID_ARGUMENT");
  return { items: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}

// Expose metadata deliberately, never media bytes, blob URLs, model state, or credentials.
function properties(clip) {
  const fields = ["type", "name", "start", "end", "duration", "text", "volume", "fadeIn", "fadeOut", "muted", "playbackRate", "sourceKind", "layer", "lane", "hidden", "sourceAudioDisabled", "sourceAudioUnmapped"];
  return {
    ...Object.fromEntries(fields.filter((key) => ["string", "boolean", "number"].includes(typeof clip[key])).map((key) => [key, clip[key]])),
    speedCurveEnabled: Boolean(clip.speedCurve?.enabled),
    reversed: Boolean(clip.reversed || clip.reverse),
    hasKeyframes: Boolean(clip.keyframes?.length || Object.values(clip.propertyKeyframes || {}).some((frames) => frames?.length)),
  };
}

/** A page-scoped session. Callers provide the actual live editor actions, not reducers. */
export function createWebMcpEditorSession(getEditor, { publish = () => {}, commit = (action) => action(), makeId = () => crypto.randomUUID() } = {}) {
  let closed = false;
  let busy = false;
  let pointerActive = false;
  let observed = null;
  let pending = null;
  let undoReceipt = null;
  let lastApplied = null;
  let exportPreview = null;
  const exportRequests = new Map();
  const exportJobs = createWebMcpExportJobs(getEditor, { makeId });
  const mediaIds = new WeakMap();
  let mediaSequence = 0;
  const identity = (value) => {
    if (!value || typeof value !== "object") return value ?? null;
    if (!mediaIds.has(value)) mediaIds.set(value, ++mediaSequence);
    return mediaIds.get(value);
  };
  const runtimeProject = (editor, project) => editor.getRuntimeProject?.() || { ...project, ...Object.fromEntries([
    "visualSegments", "visualOverlaySegments", "audioSegments", "musicSegments", "musicBlob", "musicUrl", "musicPeaks", "sourceAudioBlob", "audioBlob",
  ].filter((key) => key in editor).map((key) => [key, editor[key]])) };
  const fingerprint = (editor, project) => JSON.stringify({
    project: browserProjectFingerprint(project, editor.rippleEditing, editor.visualSegments, runtimeProject(editor, project)),
    historyVersion: editor.historyVersion,
    media: [...(editor.audioSegments || []), ...(editor.visualOverlaySegments || [])].map((clip) => [clip.id, identity(clip.blob), clip.url || clip.src]),
    sourceAudio: identity(editor.sourceAudioBlob), music: identity(editor.musicBlob), audio: identity(editor.audioBlob),
    assets: (editor.assets || []).map((asset) => [asset.id, asset.assetId, asset.type, asset.kind, asset.name, asset.duration, asset.width, asset.height, asset.preparing, identity(asset.blob), asset.src]),
  });
  const capture = () => {
    if (closed) fail("SESSION_CLOSED");
    const editor = getEditor();
    const project = editor.getProjectSnapshot();
    const signature = fingerprint(editor, project);
    if (!observed || observed.fingerprint !== signature) observed = { stateToken: makeId(), fingerprint: signature };
    return { editor, project, ...observed };
  };
  const guard = (signal, editing = false) => {
    if (closed) fail("SESSION_CLOSED");
    if (signal?.aborted) fail("CANCELLED");
    if (editing && (pointerActive || getEditor().isBusy?.() || exportJobs.isRunning?.())) fail("EDITOR_BUSY");
  };
  const requireState = (state, token) => {
    if (text(token) !== state.stateToken) fail("STALE_STATE");
  };
  const planningClips = (editor) => getBrowserPlanningClips(editor.visualSegments);
  const readProject = (state) => {
    const { duration: _duration, warnings: _warnings, appliedOperationIds: _ids, revision: _revision, ...summary } = inspectProject(state.project);
    return {
      ...summary, stateToken: state.stateToken, duration: state.editor.duration,
      playhead: state.editor.currentTime, rippleEditing: Boolean(state.editor.rippleEditing),
      trackLocks: state.project.trackLocks, trackVisibility: state.project.trackVisibility,
      sourceAudio: { present: Boolean(state.editor.sourceAudioBlob), linked: state.project.sourceAudioLinked, start: state.project.sourceAudioStart, duration: state.project.sourceAudioDuration },
      capabilities: {
        edit: [...WEB_MCP_EDIT_CAPABILITIES], maxPlanClips: MAX_CLIPS, maxOperations: MAX_CLIPS,
        requiresPreview: true, projectSave: "download-timeline-archive", videoExport: Boolean(state.editor.exportVideo),
        assets: "existing-local-assets", exportRequiresPrepare: true,
        timeUnits: { timeline: "seconds", source: "absolute source-media seconds", split: "clip-local seconds", volume: "multiplier (1 = 100%)", fades: "seconds" },
      },
    };
  };
  const previewSummary = (draft) => ({
    previewId: draft.id, stateToken: draft.stateToken, hasChanges: draft.review.hasChanges,
    beforeDuration: draft.review.beforeDuration, afterDuration: draft.review.duration,
    rows: draft.review.rows, diff: browserReviewDiff(draft.review.diff),
    entities: { before: browserReviewEntities(draft.before), after: browserReviewEntities(draft.review.project) },
  });
  const run = async (name, input = {}, { signal } = {}) => {
    const editor = getEditor();
    // Polling and cancelling an export must remain available while an archive
    // download or another asynchronous tool invocation is being prepared.
    if (["timeline_export_inspect", "timeline_export_cancel"].includes(name)) {
      try {
        guard(signal);
        object(input, ["jobId"]); text(input.jobId);
        const result = name === "timeline_export_inspect" ? exportJobs.inspect(input) : exportJobs.cancel(input);
        return { ok: true, ...result };
      } catch (error) {
        const code = error?.code || "FAILED";
        return { ok: false, error: { code, message: editor.t(ERROR_KEYS[code] || "failed") } };
      }
    }
    if (busy) return { ok: false, error: { code: "EDITOR_BUSY", message: editor.t("busy") } };
    busy = true;
    try {
      guard(signal);
      const state = capture();
      let result;
      switch (name) {
        case "timeline_project_inspect":
          object(input, []);
          result = readProject(state);
          break;
        case "timeline_track_inspect": {
          object(input, ["track", "offset", "limit"]);
          if (!TRACKS.includes(input.track)) fail("INVALID_ARGUMENT");
          const track = inspectTrack(state.project, input.track);
          const planning = input.track === "visuals" ? planningClips(state.editor) : [];
          const entries = track.clips.map((clip, index) => ({ ...clip, ...(planning[index] || {}) }));
          const { clips: _clips, revision: _revision, ...metadata } = track;
          result = { ...metadata, stateToken: state.stateToken, ...page(entries, input) };
          break;
        }
        case "timeline_clip_inspect": {
          object(input, ["clipId"]);
          const clip = inspectClip(state.project, text(input.clipId));
          const { revision: _revision, properties: raw, ...metadata } = clip;
          const planning = clip.track === "visuals" ? planningClips(state.editor).find((item) => (item.clipId || item.id) === input.clipId) : null;
          result = { ...metadata, stateToken: state.stateToken, properties: properties(raw), ...(planning ? { editing: planning } : {}) };
          break;
        }
        case "timeline_transcript_inspect": {
          object(input, ["audioClipId", "offset", "limit"]);
          const transcript = inspectTranscript(state.project, input.audioClipId === undefined ? "" : text(input.audioClipId));
          const { revision: _revision, segments: _segments, text: _text, ...metadata } = transcript;
          result = { ...metadata, stateToken: state.stateToken, ...page(transcript.segments, input) };
          break;
        }
        case "timeline_assets_inspect": {
          object(input, ["query", "type", "readyOnly", "offset", "limit"]);
          if (input.query !== undefined && (typeof input.query !== "string" || input.query.length > 256)) fail("INVALID_ARGUMENT");
          if (input.type !== undefined && !["image", "video", "audio"].includes(input.type)) fail("INVALID_ARGUMENT");
          if (input.readyOnly !== undefined && typeof input.readyOnly !== "boolean") fail("INVALID_ARGUMENT");
          const query = (input.query || "").toLocaleLowerCase();
          const entries = (state.editor.assets || []).map(browserAssetSummary).filter((asset) =>
            (!input.type || asset.type === input.type) && (!input.readyOnly || asset.status === "ready") && (!query || asset.name.toLocaleLowerCase().includes(query)));
          result = { stateToken: state.stateToken, ...page(entries, input) };
          break;
        }
        case "timeline_markers_inspect": {
          object(input, ["markerId", "offset", "limit"]);
          if (input.markerId !== undefined) text(input.markerId, 160);
          const markers = inspectMarkers(state.project, input.markerId || "");
          result = { stateToken: state.stateToken, ...page(markers.markers, input) };
          break;
        }
        case "timeline_edit_preview": {
          object(input, ["stateToken", "clips", "operations", "summary"]);
          guard(signal, true);
          requireState(state, input.stateToken);
          if ((input.operations === undefined) === (input.clips === undefined)) fail("INVALID_ARGUMENT");
          const plan = input.operations ?? input.clips;
          if (!Array.isArray(plan) || !plan.length || plan.length > MAX_CLIPS) fail("INVALID_ARGUMENT");
          for (const clip of input.clips || []) {
            object(clip, ["clipId", "sourceIn", "sourceOut"]);
            text(clip.clipId);
            if (clip.sourceIn !== undefined) finite(clip.sourceIn);
            if (clip.sourceOut !== undefined) finite(clip.sourceOut);
            if ((clip.sourceIn === undefined) !== (clip.sourceOut === undefined)) fail("INVALID_ARGUMENT");
          }
          if (input.summary !== undefined && (typeof input.summary !== "string" || input.summary.length > 2000)) fail("INVALID_ARGUMENT");
          const options = {
            visualSegments: state.editor.visualSegments, rippleEditing: state.editor.rippleEditing,
            hasMusic: Boolean(state.editor.musicBlob), hasSourceAudio: Boolean(state.editor.sourceAudioBlob),
            runtimeProject: runtimeProject(state.editor, state.project), assets: state.editor.assets || [],
          };
          const review = input.operations ? buildBrowserOperationReview(state.project, input, options) : buildBrowserTimelineReview(state.project, input, options);
          pending = { id: makeId(), stateToken: state.stateToken, fingerprint: state.fingerprint, before: review.beforeProject || state.project, review };
          publish({ status: "pending", preview: previewSummary(pending), summary: input.summary || "" });
          result = previewSummary(pending);
          break;
        }
        case "timeline_export_prepare": {
          object(input, ["stateToken", "settings"]);
          guard(signal, true);
          requireState(state, input.stateToken);
          if (!state.editor.exportVideo) fail("EXPORT_UNAVAILABLE");
          if (!state.editor.visualSegments?.length) fail("EMPTY_PROJECT");
          const prepared = exportJobs.prepare({ settings: input.settings });
          exportPreview = { id: makeId(), stateToken: state.stateToken, fingerprint: state.fingerprint, prepared };
          result = { exportId: exportPreview.id, stateToken: state.stateToken, ...prepared };
          break;
        }
        case "timeline_export_start": {
          object(input, ["exportId", "requestId"]);
          text(input.exportId); text(input.requestId);
          const previous = exportRequests.get(input.requestId);
          if (previous) {
            if (previous.exportId !== input.exportId) fail("INVALID_ARGUMENT");
            result = { ...exportJobs.inspect({ jobId: previous.jobId }), alreadyStarted: true };
            break;
          }
          guard(signal, true);
          if (!exportPreview || exportPreview.id !== input.exportId) fail("EXPORT_PREVIEW_NOT_FOUND");
          if (exportPreview.fingerprint !== state.fingerprint) fail("STALE_STATE");
          result = exportJobs.start({ stateToken: state.stateToken, settings: exportPreview.prepared.resolvedSettings, requestId: input.requestId }, { signal });
          exportRequests.set(input.requestId, { exportId: input.exportId, jobId: result.jobId });
          // Receipts match the task service's bound and are never silently
          // forgotten while a retry could start another download.
          break;
        }
        case "timeline_edit_apply": {
          object(input, ["previewId"]);
          text(input.previewId);
          guard(signal, true);
          // Retrying a completed call acknowledges that edit without applying it twice.
          if (lastApplied?.previewId === input.previewId) {
            result = { ...lastApplied.result, alreadyApplied: true, currentStateToken: state.stateToken };
            break;
          }
          if (!pending || input.previewId !== pending.id) fail("PREVIEW_NOT_FOUND");
          if (pending.fingerprint !== state.fingerprint) fail("STALE_STATE");
          if (!pending.review.hasChanges) fail("NO_CHANGES");
          const draft = pending;
          guard(signal, true);
          commit(() => state.editor.applyReview(draft.review, state.editor.t("applied")));
          const after = capture();
          if (after.fingerprint === state.fingerprint) fail("NO_CHANGES");
          undoReceipt = { id: makeId(), fingerprint: after.fingerprint };
          pending = null;
          result = { transactionId: undoReceipt.id, stateToken: after.stateToken, changed: true };
          lastApplied = { previewId: draft.id, result };
          publish({ status: "applied", transactionId: undoReceipt.id, preview: previewSummary(draft) });
          break;
        }
        case "timeline_edit_undo": {
          object(input, ["transactionId"]);
          text(input.transactionId);
          guard(signal, true);
          if (!undoReceipt || input.transactionId !== undoReceipt.id) fail("UNDO_NOT_AVAILABLE");
          if (undoReceipt.fingerprint !== state.fingerprint) fail("STALE_STATE");
          commit(() => state.editor.undo());
          undoReceipt = null;
          pending = null;
          result = { stateToken: capture().stateToken, undone: true };
          publish(null);
          break;
        }
        case "timeline_preview_seek": {
          object(input, ["time"]);
          guard(signal, true);
          finite(input.time, state.editor.duration);
          commit(() => state.editor.seek(input.time));
          result = { time: getEditor().currentTime, stateToken: capture().stateToken };
          break;
        }
        case "timeline_project_save": {
          object(input, ["stateToken"]);
          guard(signal, true);
          requireState(state, input.stateToken);
          if (!["visualSegments", "visualOverlaySegments", "audioSegments", "captionSegments", "stickerSegments", "musicSegments", "timelineMarkers"].some((key) => state.project[key]?.length)
            && !state.editor.audioBlob && !state.editor.musicBlob && !state.editor.sourceAudioBlob) fail("EMPTY_PROJECT");
          const archive = await state.editor.createArchive();
          guard(signal, true);
          if (capture().fingerprint !== state.fingerprint) fail("STALE_STATE");
          const filename = `Timeline-Studio-${new Date().toISOString().replace(/[:.]/g, "-")}.timeline`;
          state.editor.download(archive, filename);
          result = { stateToken: state.stateToken, filename, bytes: archive.size, downloaded: true };
          state.editor.notify(state.editor.t("saved"));
          break;
        }
        default: fail("INVALID_ARGUMENT");
      }
      return { ok: true, ...result };
    } catch (error) {
      const code = error?.name === "AbortError" ? "CANCELLED" : error?.code || "FAILED";
      const message = getEditor().t(ERROR_KEYS[code] || "failed");
      return { ok: false, error: { code, message } };
    } finally { busy = false; }
  };
  return {
    run,
    setPointerActive(value) { pointerActive = value; },
    dismiss() { pending = null; publish(null); },
    isCurrentPreview() { return Boolean(pending && pending.fingerprint === capture().fingerprint); },
    canUndo() { return Boolean(undoReceipt && undoReceipt.fingerprint === capture().fingerprint); },
    close() { closed = true; pending = null; undoReceipt = null; exportPreview = null; exportJobs.close(); exportRequests.clear(); },
  };
}

const stringSchema = { type: "string", minLength: 1, maxLength: 256 };
const pagination = { offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: MAX_PAGE } };
const schema = (properties = {}, required = []) => ({ type: "object", properties, required, additionalProperties: false });

export function createWebMcpTools(session, t) {
  const editSchema = schema({
    stateToken: stringSchema, summary: { type: "string", maxLength: 2000 },
    clips: { type: "array", minItems: 1, maxItems: MAX_CLIPS, items: schema({ clipId: stringSchema, sourceIn: { type: "number", minimum: 0, description: t("sourceInDescription") }, sourceOut: { type: "number", minimum: 0, description: t("sourceOutDescription") } }, ["clipId"]) },
    operations: { type: "array", minItems: 1, maxItems: MAX_CLIPS, items: WEB_MCP_OPERATION_SCHEMA },
  }, ["stateToken"]);
  editSchema.oneOf = [{ required: ["clips"] }, { required: ["operations"] }];
  const tools = [
    ["timeline_project_inspect", "Project", schema(), true],
    ["timeline_track_inspect", "Track", schema({ track: { type: "string", enum: TRACKS }, ...pagination }, ["track"]), true],
    ["timeline_clip_inspect", "Clip", schema({ clipId: stringSchema }, ["clipId"]), true],
    ["timeline_transcript_inspect", "Transcript", schema({ audioClipId: stringSchema, ...pagination }), true],
    ["timeline_assets_inspect", "Assets", schema({ query: { type: "string", maxLength: 256 }, type: { type: "string", enum: ["image", "video", "audio"] }, readyOnly: { type: "boolean" }, ...pagination }), true],
    ["timeline_markers_inspect", "Markers", schema({ markerId: { ...stringSchema, maxLength: 160 }, ...pagination }), true],
    ["timeline_edit_preview", "Preview", editSchema, false],
    ["timeline_edit_apply", "Apply", schema({ previewId: stringSchema }, ["previewId"]), false],
    ["timeline_preview_seek", "Seek", schema({ time: { type: "number", minimum: 0, description: t("seekTimeDescription") } }, ["time"]), false],
    ["timeline_edit_undo", "Undo", schema({ transactionId: stringSchema }, ["transactionId"]), false],
    ["timeline_project_save", "Save", schema({ stateToken: stringSchema }, ["stateToken"]), false],
    ["timeline_export_prepare", "ExportPrepare", schema({ stateToken: stringSchema, settings: WEB_MCP_EXPORT_SETTINGS_SCHEMA }, ["stateToken"]), true],
    ["timeline_export_start", "ExportStart", schema({ exportId: stringSchema, requestId: stringSchema }, ["exportId", "requestId"]), false],
    ["timeline_export_inspect", "ExportInspect", schema({ jobId: stringSchema }, ["jobId"]), true],
    ["timeline_export_cancel", "ExportCancel", schema({ jobId: stringSchema }, ["jobId"]), false],
  ];
  return tools.map(([name, key, inputSchema, readOnlyHint]) => ({
    name, title: t(`tool${key}Title`), description: t(`tool${key}Description`), inputSchema,
    annotations: { readOnlyHint, untrustedContentHint: true },
    execute: (input, options) => session.run(name, input, options),
  }));
}

// Registrations share a queue per real browser context so StrictMode cleanup or
// a language change cannot race an unfinished legacy registration.
const webMcpRegistrationContexts = new WeakMap();

// Progressive enhancement: use a real browser API; never simulate agent connectivity.
export function registerEditorWebMcpTools(documentObject, navigatorObject, tools) {
  const current = documentObject?.modelContext;
  const context = current?.registerTool ? current : navigatorObject?.modelContext;
  const legacy = context !== current && typeof context?.unregisterTool === "function";
  if (typeof context?.registerTool !== "function") {
    return { supported: false, ready: Promise.resolve(false), dispose() {} };
  }
  let shared = webMcpRegistrationContexts.get(context);
  if (!shared) {
    shared = { tail: Promise.resolve(), owners: new Map() };
    webMcpRegistrationContexts.set(context, shared);
  }
  const enqueue = (action) => {
    const result = shared.tail.then(action);
    shared.tail = result.then(() => {}, () => {});
    return result;
  };
  const controller = new AbortController();
  const owner = Symbol("webmcp-registration");
  const registered = new Set();
  let disposed = false;
  const cleanup = async () => {
    let complete = true;
    for (const name of [...registered]) {
      if (shared.owners.get(name) !== owner) {
        registered.delete(name);
        continue;
      }
      try {
        if (legacy) await context.unregisterTool(name);
        if (shared.owners.get(name) === owner) shared.owners.delete(name);
        registered.delete(name);
      } catch {
        // Keep ownership when removal failed: a later setup must not mistake
        // this old tool for an available name or remove another setup's tool.
        complete = false;
      }
    }
    return complete;
  };
  const dispose = () => {
    disposed = true;
    controller.abort();
    // Enqueue cleanup behind this setup, including a still-pending legacy call,
    // and ahead of the next setup. It is safe to request cleanup more than once.
    void enqueue(cleanup);
  };
  const ready = enqueue(async () => {
    try {
      for (const tool of tools) {
        if (disposed) { await cleanup(); return false; }
        if (shared.owners.has(tool.name)) throw new Error("WebMCP tool is already registered");
        await context.registerTool(tool, { signal: controller.signal });
        registered.add(tool.name);
        shared.owners.set(tool.name, owner);
        if (disposed) { await cleanup(); return false; }
      }
      return true;
    } catch {
      disposed = true;
      controller.abort();
      await cleanup();
      return false;
    }
  });
  return { supported: true, ready, dispose };
}
