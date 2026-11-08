import { VISUAL_PROPERTY_KEYS } from "./visualEffects.js";
import { normalizeCinematicDepth } from "./depthOfField.js";
import { CAPTION_STYLE_PROPERTY_SCHEMA } from "./projectCommandEngine.js";

const COLLECTIONS = {
  visuals: "visualSegments", overlays: "visualOverlaySegments", audio: "audioSegments",
  captions: "captionSegments", stickers: "stickerSegments", music: "musicSegments", effects: "effectClips",
};
const FIELDS = [
  "effect", "intensity", "color", "width", "height", "id", "type", "name", "text", "start", "end", "duration", "sourceStart", "sourceDuration",
  "playbackRate", "volume", "fadeIn", "fadeOut", "muted", "layer", "lane", "hidden", "audioSegmentId",
  "sourceAudioDisabled", "sourceAudioUnmapped", "sourceAudioVolume", "audioSeparated",
  "detachedAudioSegmentId", "x", "y", "scale", "rotation", "opacity", "fontId",
];
const GLOBAL_FIELDS = ["script", "ratioId", "fitMode", "musicName", "musicDuration", "musicStart", "musicVolume", "sourceAudioStart", "sourceAudioVolume", "captionsEnabled", "trackVisibility", "trackLocks", "captionStyle", "captionSize", "captionStylePresetId", "captionPlacement", "captionPosition"];
const NESTED_FIELDS = { transition: ["id", "duration"], mask: ["type", "centerX", "centerY", "width", "height", "taper", "feather", "inverted", "cornerRadius", "size"], splitScreenRect: ["x", "y", "width", "height"], baseTransform: ["x", "y", "scale", "rotation", "opacity"], placement: ["x", "y"], styleOverrides: Object.keys(CAPTION_STYLE_PROPERTY_SCHEMA) };
const scalar = (value) => ["string", "boolean", "number"].includes(typeof value) || value === null;
const pick = (value, fields) => Object.fromEntries(fields.filter((key) => Object.hasOwn(value || {}, key) && scalar(value[key])).map((key) => [key, value[key]]));

const numericKeyframes = frames => frames.map(frame => Object.fromEntries(["time", ...VISUAL_PROPERTY_KEYS].filter(key => Number.isFinite(frame?.[key])).map(key => [key, frame[key]])));

const depthProperties = (value) => {
  const { enabled, output, quality, relight } = normalizeCinematicDepth(value);
  return { enabled, output, quality, relight };
};

export function browserClipProperties(clip) {
  return { ...(clip?.keyframes ? { keyframes: numericKeyframes(clip.keyframes) } : {}), ...(clip?.cinematicDepth ? { cinematicDepth: depthProperties(clip.cinematicDepth) } : {}), ...pick(clip, FIELDS), ...Object.fromEntries(Object.entries(NESTED_FIELDS).filter(([key]) => clip?.[key]).map(([key, fields]) => [key, pick(clip[key], fields)])) };
}

export function browserReviewEntities(project) {
  return Object.fromEntries(Object.entries(COLLECTIONS).map(([track, key]) => [track, (project[key] || []).map(browserClipProperties)]));
}

export function browserAssetSummary(asset) {
  const hasMedia = asset?.blob instanceof Blob && asset.blob.size > 0;
  const validType = ["image", "video", "audio"].includes(asset?.type);
  const needsMetadata = validType && (asset.type !== "audio" && !(asset.width > 0 && asset.height > 0)
    || asset.type !== "image" && !(Number(asset.duration) > 0));
  const preparing = !asset?.mediaUnavailable && (asset?.preparing || (hasMedia && needsMetadata));
  const ready = hasMedia && validType && !asset.mediaUnavailable && !preparing;
  return {
    assetId: String(asset.assetId || asset.id || ""), type: asset.type,
    name: String(asset.name || ""), duration: Math.max(0, Number(asset.duration) || (asset.type === "image" ? 4 : 0)),
    width: Math.max(0, Number(asset.width) || 0), height: Math.max(0, Number(asset.height) || 0),
    kind: asset.kind || "", bytes: hasMedia ? asset.blob.size : 0,
    status: preparing ? "preparing" : ready ? "ready" : "unavailable",
    insertableTracks: !ready ? [] : asset.type !== "audio" ? ["visuals", "overlays"] : asset.kind === "music" ? ["music"] : ["audio", "music"],
  };
}

// A semantic diff may contain internal media metadata. Browser results only
// expose the fields the public edit contract can change or help review.
export function browserReviewDiff(diff) {
  const result = { ...diff };
  result.tracks = Object.fromEntries(Object.entries(diff.tracks || {}).map(([track, changes]) => [track, {
    ...changes,
    modified: (changes.modified || []).map((item) => {
      const fields = (item.fields || []).filter((field) => ["cinematicDepth", "keyframes"].includes(field) || FIELDS.includes(field) || Object.hasOwn(NESTED_FIELDS, field));
      const values = (source) => Object.fromEntries(fields.map((field) => [field, field === "keyframes" ? numericKeyframes(source?.keyframes || []) : field === "cinematicDepth" ? source?.[field] ? depthProperties(source[field]) : null : Object.hasOwn(NESTED_FIELDS, field)
        ? source?.[field] ? pick(source[field], NESTED_FIELDS[field]) : null : scalar(source?.[field]) ? source[field] : null]));
      return { id: item.id, fields, before: values(item.before), after: values(item.after) };
    }),
  }]));
  if (Array.isArray(diff.projectFields)) result.projectFields = diff.projectFields.filter((entry) => GLOBAL_FIELDS.includes(entry.field)).map((entry) => {
    const nested = entry.field === "captionStyle" ? Object.keys(CAPTION_STYLE_PROPERTY_SCHEMA) : entry.field === "captionPlacement" ? ["x", "y"] : null;
    return nested ? { ...entry, before: entry.before ? pick(entry.before, nested) : null, after: entry.after ? pick(entry.after, nested) : null } : entry;
  });
  return result;
}
