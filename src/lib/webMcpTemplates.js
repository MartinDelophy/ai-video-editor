import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { beatEffectCopy } from "../i18nBeatEffects.js";
import { cardRotationCopy } from "../i18nCardRotationTemplate.js";
import { referenceTemplateCopy } from "../i18nReferenceTemplates.js";
import { BEAT_MONTAGE_ID, MIN_TEMPLATE_BPM, MAX_TEMPLATE_BPM } from "./beatMontage.js";
import { CARD_ROTATION_ID } from "./cardRotationTemplate.js";
import { finishBrowserOperationReview } from "./browserEditPlan.js";
import { prepareReferenceTemplate } from "./referenceTemplates.js";
import { getTimelineTemplate, TIMELINE_TEMPLATES } from "./templateCatalog.js";
import { createTemplateComposition } from "./templateComposition.js";
import { prepareTemplateCardIntro, resolveTemplateCardFaces, TEMPLATE_CARD_FACES } from "./templateMedia.js";
import { getVisualSegmentsTotal } from "./timeline.js";

const faceKeys = TEMPLATE_CARD_FACES.map(([key]) => key);
const assetId = { type: "string", minLength: 1, maxLength: 256 };
const slotSchema = (keys) => ({
  type: "object", additionalProperties: false,
  properties: Object.fromEntries(keys.map((key) => [key, assetId])),
});
export const WEB_MCP_TEMPLATE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["templateId"],
  properties: {
    templateId: { type: "string", enum: TIMELINE_TEMPLATES.map((template) => template.id) },
    slots: slotSchema([...new Set(TIMELINE_TEMPLATES.flatMap((template) => template.slots))]),
    faces: slotSchema(faceKeys),
    bpm: { type: "integer", minimum: MIN_TEMPLATE_BPM, maximum: MAX_TEMPLATE_BPM },
    soundtrack: { type: "string", enum: ["none", "built-in"] },
  },
};

export function inspectBrowserTemplates(language) {
  return TIMELINE_TEMPLATES.map((template) => ({
    templateId: template.id,
    title: referenceTemplateCopy(template.id, language)?.title
      ?? (template.id === CARD_ROTATION_ID ? cardRotationCopy(language).title : beatEffectCopy(language)[BEAT_MONTAGE_ID]),
    slots: template.slots,
    requiredSlots: template.id === BEAT_MONTAGE_ID ? ["main"] : [],
    faceSlots: template.id === CARD_ROTATION_ID ? faceKeys : [],
    defaultBpm: template.defaultBpm,
    duration: template.getDuration(template.defaultBpm),
    requiredTracks: template.requiredTracks.map((track) => ({ image: "visuals", overlay: "overlays", effects: "effects" })[track]),
    aspectRatio: template.aspectRatio || "1:1",
  }));
}

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

function checkKeys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    reject("INVALID_ARGUMENT");
  }
}

function resolveAssets(selections, keys, library, { minDuration = 0 } = {}) {
  checkKeys(selections, keys);
  return Object.fromEntries(Object.entries(selections).map(([slot, id]) => {
    if (typeof id !== "string" || id.length > 256 || !id.trim()) reject("INVALID_ARGUMENT");
    const asset = library.get(id);
    if (!asset) reject("ASSET_NOT_FOUND");
    if (asset.preparing) reject("ASSET_NOT_READY");
    if (!(asset.blob instanceof Blob) || !asset.blob.size || !asset.src || asset.mediaUnavailable
      || !(asset.width > 0 && asset.height > 0) || !["image", "video"].includes(asset.type)) reject("ASSET_UNAVAILABLE");
    if (asset.type === "video" && (!(asset.duration > 0) || asset.duration < minDuration)) reject("INVALID_RANGE");
    return [slot, asset];
  }));
}

export async function buildBrowserTemplateReview(project, request, options, { language, ratio, signal } = {}) {
  checkKeys(request, Object.keys(WEB_MCP_TEMPLATE_SCHEMA.properties));
  const template = getTimelineTemplate(request.templateId);
  if (!template) reject("INVALID_ARGUMENT");
  const bpm = request.bpm === undefined ? template.defaultBpm : request.bpm;
  if (!Number.isInteger(bpm) || bpm < MIN_TEMPLATE_BPM || bpm > MAX_TEMPLATE_BPM) reject("INVALID_ARGUMENT");
  const soundtrack = request.soundtrack === undefined ? "none" : request.soundtrack;
  if (!["none", "built-in"].includes(soundtrack)) reject("INVALID_ARGUMENT");

  const blocked = (track) => project.trackLocks?.[track] || project.trackVisibility?.[track] === false;
  if (template.requiredTracks.some(blocked)) reject("BROWSER_EDIT_TRACK_LOCKED");
  const start = getVisualSegmentsTotal(project.visualSegments || []);
  if (start + template.getDuration(bpm) > MAX_TIMELINE_DURATION_SECONDS) reject("INVALID_RANGE");
  const hasMusic = options.hasMusic || Boolean(project.musicSegments?.length);
  const builtInMusic = soundtrack === "built-in" && !hasMusic;
  if (builtInMusic && blocked("music")) reject("BROWSER_EDIT_TRACK_LOCKED");

  const isCard = template.id === CARD_ROTATION_ID;
  const isReference = Boolean(template.aspectRatio);
  const library = new Map(options.assets.map((asset) => [asset.assetId || asset.id, asset]));
  const selected = resolveAssets(request.slots === undefined ? {} : request.slots, template.slots, library, { minDuration: 1 });
  const overrides = resolveAssets(request.faces === undefined ? {} : request.faces, isCard ? faceKeys : [], library);
  if (template.id === BEAT_MONTAGE_ID && !selected.main) reject("INVALID_ARGUMENT");
  let assets = Object.fromEntries(template.slots.map((slot) => [slot, selected[slot] || selected.main]));
  let intro;
  if (isCard) {
    intro = await prepareTemplateCardIntro(resolveTemplateCardFaces(template, assets, overrides), { signal });
  } else if (isReference) {
    ({ assets, intro } = await prepareReferenceTemplate(template, assets, {
      bpm, language, label: cardRotationCopy(language).slot, signal,
    }));
  }
  signal?.throwIfAborted();
  const targetRatio = project.visualSegments?.length ? undefined : template.aspectRatio || "1:1";
  const result = createTemplateComposition(template, {
    assets, bpm, intro, language, start, ratio, targetRatio, builtInMusic,
    overlays: project.visualOverlaySegments || [], markers: project.timelineMarkers || [],
    audioSegments: project.audioSegments, trackLocks: project.trackLocks, trackVisibility: project.trackVisibility,
  });
  const stripMedia = ({ src: _src, blob: _blob, trackFrames: _frames, thumbnail: _thumbnail, originalSrc: _originalSrc, ...clip }) => clip;
  const musicSegments = result.music ? [{
    id: crypto.randomUUID(), start, duration: result.duration, sourceStart: 0, sourceDuration: result.duration,
    playbackRate: 1, volume: result.music.volume,
  }] : project.musicSegments;
  const next = {
    ...project, ratioId: targetRatio || project.ratioId,
    visualSegments: [...(project.visualSegments || []), ...result.visualSegments.map(stripMedia)],
    visualOverlaySegments: [...(project.visualOverlaySegments || []), ...result.overlays.map(stripMedia)],
    effectClips: [...(project.effectClips || []), ...result.effects],
    audioSegments: [...(project.audioSegments || []), ...result.audio.map(({ blob: _blob, peaks: _peaks, ...clip }) => clip)],
    timelineMarkers: [...(project.timelineMarkers || []), ...result.markers],
    ...(result.music ? { musicSegments, musicStart: start, musicName: result.music.name, musicDuration: result.music.duration } : {}),
  };
  const review = finishBrowserOperationReview(project, project, next, {}, options, {
    focusTime: result.previewTime, musicAdded: Boolean(result.music),
  });
  return {
    ...review, title: result.message,
    template: { templateId: template.id, bpm, start, duration: result.duration, soundtrackAdded: Boolean(result.music) },
    templateMedia: { visuals: result.visualSegments, overlays: result.overlays, music: result.music, audio: result.audio,
      personalizedIntroId: intro?.personalized ? result.visualSegments[0].id : undefined },
  };
}
