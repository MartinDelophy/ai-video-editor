const COLLECTIONS = {
  visuals: "visualSegments", overlays: "visualOverlaySegments", audio: "audioSegments",
  captions: "captionSegments", stickers: "stickerSegments", music: "musicSegments",
};
const FIELDS = [
  "id", "type", "name", "text", "start", "end", "duration", "sourceStart", "sourceDuration",
  "playbackRate", "volume", "fadeIn", "fadeOut", "muted", "layer", "lane", "hidden", "audioSegmentId",
  "sourceAudioDisabled", "sourceAudioUnmapped",
  "detachedAudioSegmentId", "x", "y", "scale", "rotation", "opacity", "fontId",
];
const GLOBAL_FIELDS = ["script", "ratioId", "fitMode", "musicName", "musicDuration", "musicStart", "musicVolume", "sourceAudioStart", "sourceAudioVolume", "captionsEnabled", "trackVisibility", "trackLocks"];
const scalar = (value) => ["string", "boolean", "number"].includes(typeof value) || value === null;
const pick = (value, fields) => Object.fromEntries(fields.filter((key) => Object.hasOwn(value || {}, key) && scalar(value[key])).map((key) => [key, value[key]]));

export function browserReviewEntities(project) {
  return Object.fromEntries(Object.entries(COLLECTIONS).map(([track, key]) => [track, (project[key] || []).map((clip) => ({
    ...pick(clip, FIELDS), ...(clip.baseTransform ? { baseTransform: pick(clip.baseTransform, ["x", "y", "scale", "rotation", "opacity"]) } : {}),
  }))]));
}

export function browserAssetSummary(asset) {
  const hasMedia = asset?.blob instanceof Blob && asset.blob.size > 0;
  const validType = ["image", "video", "audio"].includes(asset?.type);
  const ready = hasMedia && validType && !asset.preparing && (asset.type === "image" || Number(asset.duration) > 0);
  return {
    assetId: String(asset.assetId || asset.id || ""), type: asset.type,
    name: String(asset.name || ""), duration: Math.max(0, Number(asset.duration) || (asset.type === "image" ? 4 : 0)),
    width: Math.max(0, Number(asset.width) || 0), height: Math.max(0, Number(asset.height) || 0),
    kind: asset.kind || "", bytes: hasMedia ? asset.blob.size : 0,
    status: asset.preparing || (hasMedia && asset.type !== "image" && !Number(asset.duration)) ? "preparing" : ready ? "ready" : "unavailable",
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
      const fields = (item.fields || []).filter((field) => FIELDS.includes(field) || field === "baseTransform");
      const values = (source) => Object.fromEntries(fields.map((field) => [field, field === "baseTransform" ? pick(source?.[field], ["x", "y", "scale", "rotation", "opacity"]) : scalar(source?.[field]) ? source[field] : null]));
      return { id: item.id, fields, before: values(item.before), after: values(item.after) };
    }),
  }]));
  if (Array.isArray(diff.projectFields)) result.projectFields = diff.projectFields.filter((entry) => GLOBAL_FIELDS.includes(entry.field));
  return result;
}
