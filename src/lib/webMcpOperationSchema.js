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
    operation("caption.add", { clipId: id, text: { type: "string", maxLength: 20000 }, start: time, end: time, audioClipId: id }, ["clipId", "text", "start", "end"]),
    operation("caption.update", { clipId: id, text: { type: "string", maxLength: 20000 }, start: time, end: time }, ["clipId"]),
    operation("caption.delete", { clipId: id }, ["clipId"]),
    {
      ...operation("clip.set_property", { clipId: id, property: { type: "string", enum: ["volume", "fadeIn", "fadeOut"] }, value: { type: "number", minimum: 0, maximum: 1800 } }, ["clipId", "property", "value"]),
      allOf: [{ if: { properties: { property: { const: "volume" } } }, then: { properties: { value: { maximum: 4 } } } }],
    },
    operation("clip.set_muted", { clipId: id, muted }, ["clipId", "muted"]),
    operation("marker.add", marker, ["markerId", "time"]),
    operation("marker.update", marker, ["markerId"]),
    operation("marker.delete", { markerId: marker.markerId }, ["markerId"]),
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
      ...operation("asset.insert", { assetId: id, clipId: id, track: { type: "string", enum: ["visuals", "overlays", "audio", "music"] }, atIndex: index, start: time, duration, layer, muted, transform }, ["assetId", "clipId", "track"]),
      allOf: [{ if: { properties: { track: { const: "visuals" } } }, then: { required: ["atIndex"] }, else: { required: ["start"] } }],
    },
  ],
};

export const WEB_MCP_EDIT_CAPABILITIES = Object.freeze(WEB_MCP_OPERATION_SCHEMA.oneOf.map((entry) => entry.properties.type.const));
