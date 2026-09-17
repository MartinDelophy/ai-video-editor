import { MAX_TIMELINE_DURATION_SECONDS, VOICES } from "../config/editor.js";
import { AUTOMATIC_CAPTION_MODEL_ID } from "../config/models.js";
import { VOICE_MODEL_HUGGING_FACE_REVISION, VOICE_MODEL_MODELSCOPE_REVISION } from "../config/voiceModels.js";
import { DEFAULT_GENERATED_VOICE_GAP } from "./generatedVoicePlacement.js";
import { prepareTextForVoice, splitTextAtSentenceEnd } from "./ttsText.js";

const LANGUAGES = ["zh", "en", "ja", "ko", "es", "fr", "de", "pt", "th", "vi", "ru", "it", "id"];
const VOICE_LANGUAGES = { 中文: "zh", English: "en", 日本語: "ja", 한국어: "ko", Español: "es", Français: "fr", Deutsch: "de", Português: "pt", ไทย: "th", "Tiếng Việt": "vi", Русский: "ru", Italiano: "it", "Bahasa Indonesia": "id" };
const MAX_TEXT = 2000;
const MAX_SEGMENTS = 80;
const MAX_TRANSCRIPTION_SECONDS = 120;
const MIN_CAPTION_SECONDS = 0.2;
const MAX_JOBS = 32;
const MAX_REQUESTS = 1024;
const terminal = (status) => ["succeeded", "failed", "cancelled"].includes(status);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const object = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) fail("INVALID_ARGUMENT");
};
const string = (value, maximum = 256) => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail("INVALID_ARGUMENT");
  return value;
};
const number = (value, minimum, maximum) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail("INVALID_ARGUMENT");
  return value;
};
const aborted = (signal) => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
const schema = (properties, required) => ({ type: "object", additionalProperties: false, properties, required });
const time = { type: "number", minimum: 0, maximum: MAX_TIMELINE_DURATION_SECONDS };
const id = { type: "string", minLength: 1, maxLength: 256 };

export const WEB_MCP_AI_REQUEST_SCHEMA = {
  oneOf: [
    schema({
      kind: { type: "string", const: "voiceover" }, voiceId: id,
      text: { type: "string", minLength: 1, maxLength: MAX_TEXT },
      speed: { type: "number", minimum: 0.7, maximum: 1.3 },
      gain: { type: "number", minimum: 0.1, maximum: 4 }, timelineOffset: time,
    }, ["kind", "voiceId", "text"]),
    schema({
      kind: { type: "string", const: "transcription" }, assetId: id,
      language: { type: "string", enum: LANGUAGES }, sourceStart: time,
      duration: { type: "number", minimum: MIN_CAPTION_SECONDS, maximum: MAX_TRANSCRIPTION_SECONDS }, timelineOffset: time,
    }, ["kind", "assetId"]),
  ],
};

// Keep the narrator stable across independently synthesized breath groups. Long
// phrases use word boundaries (or characters for CJK), never a giant Hojo request.
function breathGroups(text) {
  const groups = [];
  for (const sentence of splitTextAtSentenceEnd(text)) {
    // Protect numeric commas and avoid colon splitting inside URLs/names.
    const phrases = sentence.split(/(?<=[，；;])\s*|(?<=(?<!\d),)\s*|(?<=\d,)(?!\d)\s*/u).filter(Boolean);
    for (let phraseIndex = 0; phraseIndex < phrases.length; phraseIndex += 1) {
      let phrase = phrases[phraseIndex];
      const fragmentThreshold = /\p{Script=Han}/u.test(phrase) ? 4 : 10;
      if (phrase.trim().length < fragmentThreshold && phraseIndex + 1 < phrases.length) phrase += phrases[++phraseIndex];
      const maximum = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(phrase) ? 56 : 180;
      let rest = phrase.trim();
      while (rest.length > maximum) {
        const space = rest.lastIndexOf(" ", maximum);
        const end = space > maximum / 2 ? space : maximum;
        groups.push(rest.slice(0, end).trim());
        rest = rest.slice(end).trim();
      }
      if (rest) groups.push(rest);
    }
  }
  if (!groups.length || groups.length > MAX_SEGMENTS) fail("INVALID_ARGUMENT");
  return groups;
}

function browserSupport(voice) {
  const audio = Boolean(globalThis.AudioContext || globalThis.webkitAudioContext);
  const wasm = typeof WebAssembly !== "undefined";
  return audio && wasm && (voice?.engine !== "hojo" || Boolean(globalThis.navigator?.gpu && globalThis.Worker));
}

/** Page-scoped jobs reuse the production synthesis/ASR services and their caches.
 * The host owns preview/fingerprint validation and the atomic My assets commit.
 * No timeline mutation, model-cache probing, or download occurs during prepare.
 */
export function createWebMcpAiJobs(getEditor, { makeId = () => crypto.randomUUID(), onUpdate = () => {} } = {}) {
  const jobs = new Map();
  const requests = new Map();
  let active = null;
  let closed = false;
  const guard = () => { if (closed) fail("SESSION_CLOSED"); };
  const describe = (job) => clone({
    jobId: job.jobId, requestId: job.requestId, stateToken: job.stateToken, kind: job.plan.request.kind,
    status: job.status, progress: job.progress, progressKind: "reported-stage-progress",
    phaseKey: job.phaseKey, cancelRequested: job.cancelRequested,
    cancellation: job.plan.cancellation,
    createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt,
    ...(job.segment ? { segment: job.segment } : {}),
    ...(job.result ? { result: job.result } : {}), ...(job.error ? { error: job.error } : {}),
  });
  const publish = (job) => { try { onUpdate(describe(job)); } catch { /* Observers cannot interrupt inference/commits. */ } };
  const update = (job, phaseKey, progress, segment) => {
    if (terminal(job.status)) return;
    if (job.phaseKey !== phaseKey || (segment && segment.current !== job.segment?.current)) job.progress = null;
    job.phaseKey = phaseKey;
    if (Number.isFinite(progress)) job.progress = Math.max(0, Math.min(99, Math.round(progress)));
    if (segment) job.segment = segment;
    publish(job);
  };
  const findAsset = (assetId) => {
    const asset = (getEditor().assets || []).find((item) => (item.assetId || item.id) === assetId);
    if (!asset) fail("ASSET_NOT_FOUND");
    if (asset.preparing) fail("ASSET_NOT_READY");
    if (asset.type !== "audio" || !(asset.blob instanceof Blob) || !asset.blob.size || !(asset.duration > 0)) fail("AI_INVALID_SOURCE");
    return asset;
  };
  const capabilities = (input = {}) => {
    guard(); object(input, ["language"]);
    if (input.language !== undefined && !LANGUAGES.includes(input.language)) fail("INVALID_ARGUMENT");
    return {
      execution: "browser-local", modelReadiness: "not-probed", modelDownload: "on-demand-at-start",
      requiresPrepare: true, requiresAllowModelDownload: true, maxConcurrentJobs: 1,
      voiceover: {
        available: browserSupport() && typeof getEditor().commitAiVoiceAssets === "function",
        maxTextCharacters: MAX_TEXT, maxSegments: MAX_SEGMENTS, delivery: "my-assets", timelineInsertion: false,
        segmentation: "breath-groups", suggestedGap: DEFAULT_GENERATED_VOICE_GAP,
        cancellation: "cooperative-discard-current-segment", cloneEnrollment: false,
        ownedModelRevisions: { huggingFace: VOICE_MODEL_HUGGING_FACE_REVISION, modelScope: VOICE_MODEL_MODELSCOPE_REVISION },
        voices: VOICES.filter((voice) => !input.language || VOICE_LANGUAGES[voice.language] === input.language).map((voice) => ({
          voiceId: voice.id, name: voice.name, language: VOICE_LANGUAGES[voice.language], engine: voice.engine,
          available: browserSupport(voice), cacheState: "unknown",
          adjustableSpeed: voice.engine === "kokoro",
        })),
      },
      transcription: {
        available: browserSupport() && typeof globalThis.Worker === "function", modelId: AUTOMATIC_CAPTION_MODEL_ID,
        source: "ready-local-audio-asset", timeMapping: "source-range-seconds-plus-timeline-offset",
        maxDuration: MAX_TRANSCRIPTION_SECONDS, languages: LANGUAGES, languageSelection: "automatic-with-preferred-language",
        delivery: "caption.add-operations-for-edit-preview", timelineInsertion: false,
        cancellation: "terminate-worker-after-audio-decode", speedCurveMapping: false,
      },
    };
  };
  const prepare = (input = {}) => {
    guard(); object(input, ["request"]);
    const raw = input.request;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("INVALID_ARGUMENT");
    const timelineOffset = number(raw.timelineOffset ?? 0, 0, MAX_TIMELINE_DURATION_SECONDS);
    const downloadPolicy = { allowedAtPrepare: false, cacheState: "unknown", startRequiresAllowModelDownload: true, behavior: "reuse-existing-cache-or-fetch-missing-model-artifacts" };
    if (raw.kind === "voiceover") {
      object(raw, ["kind", "voiceId", "text", "speed", "gain", "timelineOffset"]);
      const voice = VOICES.find((item) => item.id === string(raw.voiceId));
      if (!voice) fail("AI_INVALID_VOICE");
      if (!browserSupport(voice) || typeof getEditor().commitAiVoiceAssets !== "function") fail("AI_UNAVAILABLE");
      const rawText = string(raw.text, MAX_TEXT).trim();
      const speed = number(raw.speed ?? voice.defaultSpeed ?? 1, 0.7, 1.3);
      // Only Kokoro's present adapter honors speed. The non-Chinese vits-web
      // Piper adapter, Hojo, MMS and Supertonic currently synthesize at 1×.
      if (voice.engine !== "kokoro" && speed !== 1) fail("INVALID_ARGUMENT");
      const gain = number(raw.gain ?? 1, 0.1, 4);
      const prepared = prepareTextForVoice(rawText, voice);
      const segments = breathGroups(prepared.text);
      return {
        request: { kind: "voiceover", voiceId: voice.id, text: rawText, speed, gain, timelineOffset },
        spokenText: prepared.text, segments, voice: { voiceId: voice.id, name: voice.name, language: VOICE_LANGUAGES[voice.language] },
        warnings: prepared.warningKey ? [prepared.warningKey] : [], downloadPolicy,
        delivery: "my-assets", suggestedGap: DEFAULT_GENERATED_VOICE_GAP, timelineInsertion: false,
        cancellation: "cooperative-discard-current-segment",
      };
    }
    if (raw.kind === "transcription") {
      object(raw, ["kind", "assetId", "language", "sourceStart", "duration", "timelineOffset"]);
      if (!browserSupport() || typeof globalThis.Worker !== "function") fail("AI_UNAVAILABLE");
      const asset = findAsset(string(raw.assetId));
      const sourceStart = number(raw.sourceStart ?? 0, 0, asset.duration);
      const duration = number(raw.duration ?? Math.min(MAX_TRANSCRIPTION_SECONDS, asset.duration - sourceStart), MIN_CAPTION_SECONDS, MAX_TRANSCRIPTION_SECONDS);
      if (sourceStart + duration > asset.duration + 0.001 || timelineOffset + duration > MAX_TIMELINE_DURATION_SECONDS) fail("INVALID_ARGUMENT");
      const language = raw.language ?? (LANGUAGES.includes(getEditor().language) ? getEditor().language : "en");
      if (!LANGUAGES.includes(language)) fail("INVALID_ARGUMENT");
      return {
        request: { kind: "transcription", assetId: raw.assetId, language, sourceStart, duration, timelineOffset },
        source: { assetId: raw.assetId, name: String(asset.name || ""), duration: asset.duration }, downloadPolicy,
        modelId: AUTOMATIC_CAPTION_MODEL_ID, delivery: "caption.add-operations-for-edit-preview", timelineInsertion: false,
        languageSelection: "automatic-with-preferred-language", timeMapping: "source-range-seconds-plus-timeline-offset",
        cancellation: "terminate-worker-after-audio-decode",
      };
    }
    fail("INVALID_ARGUMENT");
  };
  const finish = (job, status, error) => {
    job.status = status; job.finishedAt = new Date().toISOString();
    if (error) job.error = { code: error, phaseKey: job.phaseKey };
    job.phaseKey = status === "succeeded" ? "aiComplete" : status === "cancelled" ? "aiCancelled" : "aiFailed";
    if (status === "succeeded") job.progress = 100;
    job.detachSignal?.(); job.detachSignal = null;
    if (active === job.jobId) active = null;
    publish(job);
  };
  const lookup = (input) => {
    guard(); object(input, ["jobId"]);
    const job = jobs.get(string(input.jobId));
    if (!job) fail("AI_JOB_NOT_FOUND");
    return job;
  };
  const runVoiceover = async (job) => {
    const [{ synthesizeBaseVoice }, { applyVoiceOutputGain }, { decodeWaveform }] = await Promise.all([
      import("./baseVoiceSynthesis.js"), import("./openVoiceRuntime.js"), import("./media.js"),
    ]);
    const { request, segments } = job.plan;
    const voice = VOICES.find((item) => item.id === request.voiceId);
    const items = [];
    for (let index = 0; index < segments.length; index += 1) {
      aborted(job.controller.signal);
      const segment = { current: index + 1, total: segments.length };
      update(job, "aiSynthesizing", null, segment);
      let { blob } = await synthesizeBaseVoice({
        voice, text: segments[index], speed: request.speed,
        onProgress: (progress) => update(job, job.phaseKey, progress, segment),
        onStatus: (key) => update(job, key.includes("Generating") ? "aiSynthesizing" : "aiPreparing", null, segment),
      });
      aborted(job.controller.signal);
      blob = await applyVoiceOutputGain(blob, request.gain);
      aborted(job.controller.signal);
      update(job, "aiDecoding", null, segment);
      const decoded = await decodeWaveform(blob, 96);
      aborted(job.controller.signal);
      if (!(blob instanceof Blob) || !blob.size || !Number.isFinite(decoded.duration) || decoded.duration <= 0) fail("AI_FAILED");
      items.push({ blob, decoded, name: `${voice.name} · ${index + 1}`, voiceId: voice.id, text: segments[index] });
    }
    if (request.timelineOffset + items.reduce((total, item) => total + item.decoded.duration, 0)
      + Math.max(0, items.length - 1) * DEFAULT_GENERATED_VOICE_GAP > MAX_TIMELINE_DURATION_SECONDS) fail("INVALID_ARGUMENT");
    update(job, "aiCommitting", null);
    aborted(job.controller.signal);
    // The host checks this signal immediately before its single synchronous
    // state commit. Until then a cancellation discards every staged sentence.
    const assets = await getEditor().commitAiVoiceAssets({ items, voiceId: voice.id, text: request.text }, { signal: job.controller.signal });
    if (!Array.isArray(assets) || assets.length !== items.length || assets.some((asset) => !asset?.id)) fail("AI_FAILED");
    let cursor = request.timelineOffset;
    const placements = assets.map((asset, index) => {
      const duration = items[index].decoded.duration;
      const placement = { assetId: asset.id, start: cursor, duration, text: items[index].text };
      cursor += duration + DEFAULT_GENERATED_VOICE_GAP;
      return placement;
    });
    return {
      delivery: "my-assets", assetIds: assets.map((asset) => asset.id), placements,
      duration: placements.reduce((total, item) => total + item.duration, 0),
      suggestedGap: DEFAULT_GENERATED_VOICE_GAP, suggestedEnd: cursor - DEFAULT_GENERATED_VOICE_GAP,
      timelineInserted: false,
    };
  };
  const runTranscription = async (job, sourceBlob) => {
    const [{ sliceAudioBlob }, { transcribeAudioToCaptionSegments }] = await Promise.all([import("./media.js"), import("./asr.js")]);
    const request = job.plan.request;
    aborted(job.controller.signal); update(job, "aiDecoding", null);
    const blob = await sliceAudioBlob(sourceBlob, request.sourceStart, request.duration);
    aborted(job.controller.signal); update(job, "aiTranscribing", null);
    const result = await transcribeAudioToCaptionSegments(blob, {
      preferredLanguage: request.language, timelineOffset: request.timelineOffset,
      signal: job.controller.signal, requireWorker: true,
      onProgress: ({ progress, phase }) => update(job, /下载|初始化/.test(phase) ? "aiPreparing" : /解码/.test(phase) ? "aiDecoding" : "aiTranscribing", progress),
    });
    aborted(job.controller.signal);
    const rangeEnd = Math.min(MAX_TIMELINE_DURATION_SECONDS, request.timelineOffset + result.duration);
    const rawCaptions = result.segments.map((segment) => ({
      clipId: `ai-caption-${makeId()}`, text: segment.text,
      start: Math.max(request.timelineOffset, segment.start), end: Math.min(rangeEnd, segment.end),
    })).filter((segment) => segment.end > segment.start);
    // Whisper may emit a word clipped to the last few samples. Keep its words
    // by merging adjacent short fragments rather than returning an operation
    // that the shared caption command's 0.2-second minimum would reject.
    const captions = [];
    for (const caption of rawCaptions) {
      const previous = captions.at(-1);
      if (previous && (previous.end - previous.start < MIN_CAPTION_SECONDS || caption.end - caption.start < MIN_CAPTION_SECONDS)) {
        const separator = ["zh", "ja"].includes(result.language) ? "" : " ";
        previous.text = `${previous.text}${separator}${caption.text}`;
        previous.end = Math.max(previous.end, caption.end);
      } else captions.push(caption);
    }
    if (captions.some((caption) => caption.end - caption.start < MIN_CAPTION_SECONDS - 1e-9)) fail("AI_FAILED");
    if (!captions.length || captions.length > 500) fail("AI_FAILED");
    return {
      delivery: "caption.add-operations-for-edit-preview", assetId: request.assetId,
      language: result.language, languageDetected: result.languageDetected, text: result.text,
      duration: result.duration, captions, operations: captions.map((caption) => ({ type: "caption.add", ...caption })),
      timelineInserted: false,
    };
  };
  const start = (input, { signal } = {}) => {
    guard(); object(input, ["stateToken", "requestId", "request", "allowModelDownload"]);
    const stateToken = string(input.stateToken);
    const requestId = string(input.requestId);
    if (input.allowModelDownload !== true) fail("AI_MODEL_DOWNLOAD_REQUIRED");
    object(input.request, Object.keys(WEB_MCP_AI_REQUEST_SCHEMA.oneOf.find((entry) => entry.properties.kind.const === input.request?.kind)?.properties || {}));
    const signature = JSON.stringify({ stateToken, request: Object.entries(input.request).sort(([a], [b]) => a.localeCompare(b)) });
    if (requests.has(requestId)) {
      const previous = requests.get(requestId);
      if (previous.signature !== signature) fail("INVALID_ARGUMENT");
      const job = jobs.get(previous.jobId);
      if (!job) fail("AI_JOB_NOT_FOUND");
      return { ...describe(job), alreadyStarted: true };
    }
    aborted(signal);
    if (active || getEditor().isBusy?.()) fail("EDITOR_BUSY");
    const plan = prepare({ request: input.request });
    if (requests.size >= MAX_REQUESTS) fail("AI_JOB_LIMIT");
    if (jobs.size >= MAX_JOBS) {
      const oldest = [...jobs.values()].find((job) => terminal(job.status));
      if (!oldest) fail("EDITOR_BUSY");
      jobs.delete(oldest.jobId);
    }
    const sourceBlob = plan.request.kind === "transcription" ? findAsset(plan.request.assetId).blob : null;
    const job = {
      jobId: makeId(), requestId, stateToken, plan, controller: new AbortController(),
      status: "running", progress: null, phaseKey: "aiPreparing", cancelRequested: false,
      createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null,
    };
    jobs.set(job.jobId, job); requests.set(requestId, { signature, jobId: job.jobId }); active = job.jobId;
    const abort = () => {
      if (terminal(job.status)) return;
      job.cancelRequested = true; job.controller.abort(); publish(job);
    };
    signal?.addEventListener("abort", abort, { once: true });
    job.detachSignal = () => signal?.removeEventListener("abort", abort);
    publish(job);
    const completion = plan.request.kind === "voiceover" ? runVoiceover(job) : runTranscription(job, sourceBlob);
    Promise.resolve(completion).then((result) => {
      // A late cancellation cannot remove an already committed asset batch.
      job.result = result; finish(job, "succeeded");
    }).catch((error) => {
      if (error?.name !== "AbortError" && !job.controller.signal.aborted) console.warn("[WebMCP AI] Local job failed.", error);
      finish(job, error?.name === "AbortError" || job.controller.signal.aborted ? "cancelled" : "failed",
        error?.name === "AbortError" || job.controller.signal.aborted ? undefined : error?.code === "EDITOR_BUSY" ? "EDITOR_BUSY" : "AI_FAILED");
    });
    return describe(job);
  };
  return {
    capabilities, prepare, start,
    inspect(input) { return describe(lookup(input)); },
    cancel(input) {
      const job = lookup(input);
      if (!terminal(job.status)) { job.cancelRequested = true; job.controller.abort(); publish(job); }
      return describe(job);
    },
    isRunning() { return active !== null; },
    close() {
      closed = true;
      for (const job of jobs.values()) {
        if (!terminal(job.status)) { job.cancelRequested = true; job.controller.abort(); }
        job.detachSignal?.(); job.detachSignal = null;
      }
    },
  };
}
