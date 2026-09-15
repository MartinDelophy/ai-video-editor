/** Browser recovery keeps Blob handles, avoiding ZIP compression on each edit. */
export const ANNA_SESSION_FORMAT = "timeline-studio-browser-session";
const arrays = (value) => Array.isArray(value) ? value : [];
const MEDIA_LISTS = ["visuals", "overlays", "audioSegments", "userAssets", "historyItems", "recordedVoices"];
const OBJECT_URL_KEY = "__annaSessionObjectUrl";
const isObjectUrl = (value) => typeof value === "string" && value.startsWith("blob:");
const isUrlField = (key) => /(?:url|src)$/i.test(key) || key === "thumbnail";
const DERIVED_MEDIA_FIELDS = new Set([
  "trackFrames", "peaks", "thumbnail", "src", "url", "preparing", "prepareProgress",
  "timelineFrameError", "trackFrameSampling", "trackFrameImportBudget", "trackFrameDuration",
]);
const blobIds = new WeakMap();
let blobSequence = 0;

// Exclude regenerated thumbnail/URL caches, but detect same-sized media replacements.
export function annaSessionFingerprint(value) {
  return JSON.stringify(value, (key, item) => {
    if (DERIVED_MEDIA_FIELDS.has(key)) return undefined;
    if (item instanceof Blob || item instanceof ArrayBuffer || ArrayBuffer.isView(item)) {
      if (!blobIds.has(item)) blobIds.set(item, ++blobSequence);
      return { mediaIdentity: blobIds.get(item), size: item.size ?? item.byteLength, type: item.type ?? item.constructor.name };
    }
    return item;
  });
}

async function mediaItem(item, mediaCache) {
  if (!item || typeof item !== "object" || !item.id) throw new Error("Missing session media identity");
  const { src, url, trackFrames: _frames, ...saved } = item;
  let blob = item.blob;
  const source = src || url;
  if (!(blob instanceof Blob) && source) {
    blob = await readMediaBlob(source, mediaCache);
  }
  if (!(blob instanceof Blob)) throw new Error("Session media missing");
  saved.blob = blob;
  if (src) mediaCache.set(src, Promise.resolve(blob));
  if (url) mediaCache.set(url, Promise.resolve(blob));
  return saveMediaReferences(saved, mediaCache);
}

function readMediaBlob(source, mediaCache) {
  if (!mediaCache.has(source)) mediaCache.set(source, fetch(source).then(async (response) => {
    if (!response.ok) throw new Error("Session media unavailable");
    return response.blob();
  }));
  return mediaCache.get(source);
}

// Record known Blob/URL pairs first. A restorable original remains usable even
// if its earlier URL has already been revoked by a clip replacement.
function rememberMediaReferences(value, cache, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || value instanceof Blob || seen.has(value)) return;
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (isUrlField(key) && isObjectUrl(item)) {
      const pairedKey = key.replace(/(?:url|src)$/i, "Blob");
      const pairedBlob = value[pairedKey] instanceof Blob ? value[pairedKey]
        : ["src", "url"].includes(key) && value.blob instanceof Blob ? value.blob : null;
      if (pairedBlob) cache.set(item, Promise.resolve(pairedBlob));
    }
    rememberMediaReferences(item, cache, seen);
  }
  if (value instanceof Map || value instanceof Set) {
    for (const item of value.values()) rememberMediaReferences(item, cache, seen);
  }
}

async function saveMediaReferences(value, cache, key = "", seen = new WeakMap()) {
  if (isUrlField(key) && isObjectUrl(value)) {
    return { [OBJECT_URL_KEY]: await readMediaBlob(value, cache) };
  }
  if (!value || typeof value !== "object" || value instanceof Blob || value instanceof Date || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? [] : value instanceof Map ? new Map() : value instanceof Set ? new Set() : {};
  seen.set(value, result);
  if (value instanceof Map) {
    for (const [entryKey, item] of value) result.set(entryKey, await saveMediaReferences(item, cache, "", seen));
  } else if (value instanceof Set) {
    for (const item of value) result.add(await saveMediaReferences(item, cache, "", seen));
  } else {
    for (const [entryKey, item] of Object.entries(value)) {
      if (entryKey !== "trackFrames") result[entryKey] = await saveMediaReferences(item, cache, entryKey, seen);
    }
  }
  return result;
}

function restoreMediaReferences(value, createUrl, seen = new WeakMap()) {
  if (!value || typeof value !== "object" || value instanceof Blob || value instanceof Date || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (Object.hasOwn(value, OBJECT_URL_KEY)) {
    if (!(value[OBJECT_URL_KEY] instanceof Blob) || typeof createUrl !== "function") throw new Error("Missing session media URL factory");
    return createUrl(value[OBJECT_URL_KEY]);
  }
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? [] : value instanceof Map ? new Map() : value instanceof Set ? new Set() : {};
  seen.set(value, result);
  if (value instanceof Map) {
    for (const [key, item] of value) result.set(key, restoreMediaReferences(item, createUrl, seen));
  } else if (value instanceof Set) {
    for (const item of value) result.add(restoreMediaReferences(item, createUrl, seen));
  } else {
    for (const [key, item] of Object.entries(value)) result[key] = restoreMediaReferences(item, createUrl, seen);
  }
  return result;
}

export async function prepareAnnaProjectSession(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid browser session");
  for (const key of MEDIA_LISTS) {
    if (input[key] !== undefined && !Array.isArray(input[key])) throw new Error("Invalid session media collection");
  }
  const cache = new Map();
  rememberMediaReferences(input, cache);
  const entries = await Promise.all(MEDIA_LISTS.map(async (key) => [key, await Promise.all(arrays(input[key]).map((item) => mediaItem(item, cache)))]));
  const { visuals: _visuals, overlays: _overlays, audioSegments: _audio, userAssets: _assets, historyItems: _history, recordedVoices: _recordings, ...metadata } = input;
  const session = { ...await saveMediaReferences(metadata, cache), ...Object.fromEntries(entries), format: ANNA_SESSION_FORMAT, version: 1 };
  validateSession(session);
  return session;
}

function validateSession(session) {
  if (session?.format !== ANNA_SESSION_FORMAT || session.version !== 1 || !session.project || typeof session.project !== "object") throw new Error("Invalid browser session");
  for (const key of MEDIA_LISTS) {
    if (session[key] !== undefined && !Array.isArray(session[key])) throw new Error("Invalid session media collection");
    for (const item of arrays(session[key])) if (!item?.id || !(item.blob instanceof Blob)) throw new Error("Missing session library media");
  }
  for (const key of ["audio", "sourceAudio", "music"]) {
    if (session[key] != null && !(session[key] instanceof Blob)) throw new Error("Invalid session audio media");
  }
  if (session.sourceVoiceColorOriginal != null && !(session.sourceVoiceColorOriginal?.blob instanceof Blob)) throw new Error("Invalid original source audio");
  for (const key of ["analysisBindings", "visionRecords", "depthRecords"]) {
    if (session[key] != null && (typeof session[key] !== "object" || Array.isArray(session[key]))) throw new Error("Invalid session analysis records");
  }
  for (const key of ["visualSegments", "visualOverlaySegments", "audioSegments", "captionSegments", "musicSegments", "stickerSegments"]) {
    if (session.project[key] !== undefined && !Array.isArray(session.project[key])) throw new Error("Invalid session project collection");
  }
  const visualIds = new Set([...arrays(session.visuals), ...arrays(session.overlays)].map((item) => item.id));
  const audioIds = new Set(arrays(session.audioSegments).map((item) => item.id));
  for (const item of [...arrays(session.project.visualSegments), ...arrays(session.project.visualOverlaySegments)]) {
    if (!item?.id || !visualIds.has(item.id)) throw new Error("Incomplete session visual media");
  }
  for (const item of arrays(session.project.audioSegments)) {
    if (!item?.id || !audioIds.has(item.id)) throw new Error("Incomplete session audio media");
  }
}

export function readAnnaProjectSession(session, createUrl) {
  validateSession(session);
  const visualMedia = new Map();
  for (const item of [...arrays(session.visuals), ...arrays(session.overlays)]) {
    if (!item?.id || !(item.blob instanceof Blob)) throw new Error("Missing session visual");
    visualMedia.set(item.id, { blob: item.blob });
  }
  const audioSegmentMedia = new Map();
  for (const item of arrays(session.audioSegments)) {
    if (!item?.id || !(item.blob instanceof Blob)) throw new Error("Missing session audio");
    audioSegmentMedia.set(item.id, { blob: item.blob });
  }
  for (const item of [...arrays(session.project.visualSegments), ...arrays(session.project.visualOverlaySegments)]) {
    if (!visualMedia.has(item.id)) throw new Error("Incomplete session visual media");
  }
  const visuals = new Map([...arrays(session.visuals), ...arrays(session.overlays)].map((item) => [item.id, item]));
  const audios = new Map(arrays(session.audioSegments).map((item) => [item.id, item]));
  // The archive snapshot intentionally omits editable processing originals.
  // Browser recovery has the complete media items, so restore those fields too.
  const project = restoreMediaReferences({ ...session.project,
    visualSegments: arrays(session.project.visualSegments).map((item) => ({ ...visuals.get(item.id), ...item, preparing: false, prepareProgress: 0 })),
    visualOverlaySegments: arrays(session.project.visualOverlaySegments).map((item) => ({ ...visuals.get(item.id), ...item, preparing: false, prepareProgress: 0 })),
    audioSegments: arrays(session.project.audioSegments).map((item) => ({ ...audios.get(item.id), ...item })),
  }, createUrl);
  return { payload: { project }, visualMedia, audioSegmentMedia,
    audio: session.audio || null, sourceAudio: session.sourceAudio || null, music: session.music || null };
}

/** Recreate only owned Blob URLs; never reuse a previous iframe's object URLs. */
export function restoreAnnaSessionItems(items, createUrl) {
  return arrays(items).map((item) => {
    if (!(item?.blob instanceof Blob)) throw new Error("Missing session library media");
    const restored = restoreMediaReferences(item, createUrl);
    const url = createUrl(item.blob);
    return { ...restored, src: url, url, preparing: false, prepareProgress: 0 };
  });
}

/** Analysis keys include the old source URL and trim. Bind them to clip IDs at
 * capture, then use the editor's key function after its new URLs are prepared. */
export function captureAnnaSessionAnalysis(segments, visionRecords, depthRecords, getVisionKey) {
  const analysisBindings = {};
  const savedVision = {};
  const savedDepth = {};
  for (const segment of arrays(segments)) {
    if (!segment?.id) continue;
    const key = getVisionKey(segment);
    analysisBindings[segment.id] = key;
    const vision = visionRecords?.[key];
    const depth = depthRecords?.[key];
    // Interrupted jobs expose provisional samples. Preserve only completed
    // records; recovery must not pretend a partial model run has finished.
    if (vision?.analysis && vision.analysis.complete !== false) savedVision[key] = vision;
    if (depth && depth.complete !== false) savedDepth[key] = depth;
  }
  return { analysisBindings, visionRecords: savedVision, depthRecords: savedDepth };
}

export function restoreAnnaSessionMetadata(session, segments, createUrl, getVisionKey) {
  validateSession(session);
  const visionRecords = {};
  const depthRecords = {};
  const visionObjectUrls = new Map();
  for (const segment of arrays(segments)) {
    const oldKey = session.analysisBindings?.[segment.id];
    if (typeof oldKey !== "string") continue;
    const key = getVisionKey(segment);
    const vision = session.visionRecords?.[oldKey];
    const depth = session.depthRecords?.[oldKey];
    if (vision?.analysis && vision.analysis.complete !== false) {
      const urls = [];
      visionRecords[key] = restoreMediaReferences(vision, (blob) => {
        const url = createUrl(blob);
        urls.push(url);
        return url;
      });
      visionObjectUrls.set(key, urls);
    }
    if (depth && depth.complete !== false) depthRecords[key] = restoreMediaReferences(depth, createUrl);
  }
  const { url: _originalUrl, ...originalSource } = session.sourceVoiceColorOriginal || {};
  const sourceVoiceColorOriginal = session.sourceVoiceColorOriginal
    ? restoreMediaReferences(originalSource, createUrl) : null;
  if (sourceVoiceColorOriginal) sourceVoiceColorOriginal.url = createUrl(sourceVoiceColorOriginal.blob);
  return { sourceVoiceColorOriginal, visionRecords, depthRecords, visionObjectUrls };
}
