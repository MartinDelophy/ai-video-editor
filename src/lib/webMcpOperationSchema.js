import { CAPTION_FONT_CATALOG } from "./captionFonts.js";
import { AUDIO_SPATIAL_EFFECTS } from "./audioSpatialEffects.js";
import { MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { MAX_TIMELINE_MARKER_SECONDS, TIMELINE_MARKER_COLORS, TIMELINE_MARKER_TYPES } from "./timelineMarkers.js";

const id = { type: "string", minLength: 1, maxLength: 256 };
const time = { type: "number", minimum: 0, maximum: MAX_TIMELINE_DURATION_SECONDS };
const duration = { ...time, minimum: MIN_VISUAL_SEGMENT_SECONDS };
const index = { type: "integer", minimum: 0, maximum: 500 };
const layer = { type: "integer", minimum: 1, maximum: 1000 };
const muted = { type: "boolean" };
const transform = {
  type: "object", additionalProperties: false,
  properties: {
    x: { type: "number", minimum: -1000, maximum: 1000 },
    y: { type: "number", minimum: -1000, maximum: 1000 },
    scale: { type: "number", minimum: 0.1, maximum: 20 },
    rotation: { type: "number", minimum: -36000, maximum: 36000 },
    opacity: { type: "number", minimum: 0, maximum: 1 },
  },
};
const number = (minimum, maximum) => ({ type: "number", minimum, maximum });
const objectPatch = properties => ({ type: "object", additionalProperties: false, minProperties: 1, properties });
const wheel = objectPatch({ hue: number(0, 360), saturation: number(0, 100), luminance: number(-100, 100) });
export const VISUAL_SETTINGS_SCHEMA = objectPatch({
  baseTransform: { ...transform, minProperties: 1, description: "Patch existing transform. x/y are percentages of canvas size; scale is a multiplier; rotation is degrees; opacity is 0..1. Existing keyframes remain active." },
  colorGrade: objectPatch({ temperature: number(-100, 100), tint: number(-100, 100), saturation: number(-100, 100), shadows: wheel, midtones: wheel, highlights: wheel, offset: wheel }),
  glitch: objectPatch({ enabled: muted, intensity: number(0, 100), separation: number(0, 100), frequency: number(0.2, 3), duration: number(0.05, 0.8), scanlines: number(0, 100) }),
  beatShake: objectPatch({ enabled: muted, bpm: number(40, 240), intensity: number(0, 100), decay: number(10, 90), offset: number(0, 2), direction: { type: "string", enum: ["zoom", "horizontal", "vertical", "rotation"] } }),
});
export const CAPTION_SETTINGS_SCHEMA = objectPatch({
  textAlign: { type: "string", enum: ["left", "center", "right"] },
  highlightWords: { type: "string", maxLength: 2000 }, highlightColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
  fontId: { type: "string", enum: CAPTION_FONT_CATALOG.map(font => font.id) },
  letterSpacing: number(0, 12), lineGap: number(0, 32), paddingX: number(0, 52), paddingY: number(0, 32),
  captionSize: number(8, 120), textColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
  backgroundColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, backgroundOpacity: number(0, 1),
});
export const AUDIO_PROCESSING_SCHEMA = objectPatch({
  speechEnhancement: {type:"string",enum:["gentle","natural","strong"]},
  engine: { type: "string", enum: ["off", "rnnoise", "deepfilter"] }, strength: number(0, 1),
  eq: objectPatch({ enabled: muted, low: number(-12, 12), mid: number(-12, 12), high: number(-12, 12) }),
  compressor: objectPatch({ enabled: muted, threshold: number(-60, 0), ratio: number(1, 12), attack: number(1, 100), release: number(20, 1000) }),
  loudness: objectPatch({ enabled: muted, gain: number(-18, 18) }), limiter: objectPatch({ enabled: muted, ceiling: number(-12, 0) }),
});
export const AUDIO_SETTINGS_SCHEMA = objectPatch({ autoDuck: {type:"object",additionalProperties:false,properties:{enabled:{type:"boolean"},strength:{type:"string",enum:["gentle","natural","strong"]}},required:["enabled","strength"]}, spatialEffect: { type: "string", enum: AUDIO_SPATIAL_EFFECTS.map(effect => effect.id) }, spatialAmount: number(0, 1) });
export const STICKER_SETTINGS_SCHEMA = objectPatch({ x: number(0, 100), y: number(0, 100), scale: number(0.1, 10), rotation: number(-3600, 3600), opacity: number(0, 1) });
const marker = {
  markerId: { ...id, maxLength: 160 },
  markerType: { type: "string", enum: [...TIMELINE_MARKER_TYPES] },
  time: { type: "number", minimum: 0, maximum: MAX_TIMELINE_MARKER_SECONDS },
  endTime: { type: "number", minimum: 0, maximum: MAX_TIMELINE_MARKER_SECONDS },
  title: { type: "string", maxLength: 240 },
  notes: { type: "string", maxLength: 20000 },
  color: { type: "string", enum: [...TIMELINE_MARKER_COLORS] },
};
const operation = (type, properties, required) => ({
  type: "object", additionalProperties: false,
  properties: { type: { const: type }, ...properties }, required: ["type", ...required],
});

// Public browser inputs contain references and edit parameters, never runtime
// media, filesystem paths, URLs, reducer payloads, or arbitrary JavaScript.
export const WEB_MCP_OPERATION_SCHEMA = {
  oneOf: [
    operation("caption.configure", { clipId: id, settings: CAPTION_SETTINGS_SCHEMA, placement: objectPatch({ x: number(0, 100), y: number(0, 100) }) }, ["clipId"]),
    operation("audio.configure", { clipId: id, settings: AUDIO_SETTINGS_SCHEMA }, ["clipId", "settings"]),
    operation("sticker.configure", { clipId: id, settings: STICKER_SETTINGS_SCHEMA }, ["clipId", "settings"]),
    operation("timed.move", { clipId: id, start: time, track: { type: "string", enum: ["audio", "caption", "sticker"] } }, ["clipId", "start"]),
    operation("clip.link_visual", { clipId: id, visualClipId: { anyOf: [id, { type: "null" }] } }, ["clipId", "visualClipId"]),
    operation("clip.delete", { clipId: id, track: { type: "string", enum: ["audio", "caption", "sticker"] } }, ["clipId", "track"]),
    operation("audio.replace_media", { clipId: id, resultId: id }, ["clipId", "resultId"]),
    operation("caption.add", { clipId: id, text: { type: "string", maxLength: 20000 }, start: time, end: time, audioClipId: id, visualClipId: id }, ["clipId", "text", "start", "end"]),
    operation("caption.update", { clipId: id, text: { type: "string", maxLength: 20000 }, start: time, end: time }, ["clipId"]),
    operation("caption.link_audio", { clipId: id, audioClipId: id, align: muted }, ["clipId"]),
    operation("caption.unlink_audio", { clipId: id }, ["clipId"]),
    operation("caption.delete", { clipId: id }, ["clipId"]),
    {
      ...operation("clip.set_property", { clipId: id, property: { type: "string", enum: ["volume", "fadeIn", "fadeOut"] }, value: { type: "number", minimum: 0, maximum: 1800 } }, ["clipId", "property", "value"]),
      allOf: [{ if: { properties: { property: { const: "volume" } } }, then: { properties: { value: { maximum: 4 } } } }],
    },
    operation("clip.set_muted", { clipId: id, muted }, ["clipId", "muted"]),
    operation("marker.add", marker, ["markerId", "time"]),
    operation("marker.update", marker, ["markerId"]),
    operation("marker.delete", { markerId: marker.markerId }, ["markerId"]),
    operation("visual.replace_media", { clipId: id, resultId: id }, ["clipId", "resultId"]),
    operation("visual.configure", { clipId: id, settings: VISUAL_SETTINGS_SCHEMA }, ["clipId", "settings"]),
    operation("transition.set", { clipId: id, transitionId: { type: "string", enum: ["none", "fade", "zoom", "flash", "wipe-left", "wipe-up", "blur", "split", "glitch"] }, duration: number(0.01, 2) }, ["clipId", "transitionId"]),
    operation("visual.split", { clipId: id, at: duration, rightClipId: id }, ["clipId", "at", "rightClipId"]),
    operation("visual.delete", { clipId: id }, ["clipId"]),
    operation("visual.duplicate", { clipId: id, newClipId: id, atIndex: index }, ["clipId", "newClipId"]),
    operation("visual.reorder", { clipId: id, toIndex: index }, ["clipId", "toIndex"]),
    operation("visual.trim", { clipId: id, sourceIn: time, sourceOut: time }, ["clipId", "sourceIn", "sourceOut"]),
    {
      ...operation("visual.insert", { clipId: id, sourceClipId: id, assetId: id, atIndex: index, duration }, ["clipId", "atIndex"]),
      oneOf: [{ required: ["sourceClipId"] }, { required: ["assetId"] }],
    },
    {
      ...operation("overlay.add", { clipId: id, sourceClipId: id, assetId: id, start: time, duration, layer, muted, transform }, ["clipId", "start"]),
      oneOf: [{ required: ["sourceClipId"] }, { required: ["assetId"] }],
    },
    {
      ...operation("asset.insert", { visualClipId: id, assetId: id, clipId: id, track: { type: "string", enum: ["visuals", "overlays", "audio", "music"] }, atIndex: index, start: time, duration, layer, muted, transform }, ["assetId", "clipId", "track"]),
      allOf: [{ if: { properties: { track: { const: "visuals" } } }, then: { required: ["atIndex"] }, else: { required: ["start"] } }],
    },
  ],
};

export const WEB_MCP_EDIT_CAPABILITIES = Object.freeze(WEB_MCP_OPERATION_SCHEMA.oneOf.map((entry) => entry.properties.type.const));
