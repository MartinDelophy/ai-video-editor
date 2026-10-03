const invalid = () => { throw Object.assign(new Error("Invalid animation scene"), { code: "INVALID_ARGUMENT" }); };
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const color = value => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const object = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));

// A data-only contract: the agent never supplies executable React, HTML or CSS.
export function validateAnimationScene(value) {
  if (!object(value, ["kind", "title", "subtitle", "columns", "rows", "rowColors", "items", "duration", "aspectRatio", "accent", "background", "motion"]) || !["table", "chart", "text", "cards"].includes(value.kind)
    || !text(value.title, 100) || value.subtitle !== undefined && !text(value.subtitle, 180)
    || typeof value.duration !== "number" || !Number.isFinite(value.duration) || value.duration < 1 || value.duration > 20
    || value.aspectRatio !== undefined && !["16:9", "9:16", "1:1"].includes(value.aspectRatio)
    || value.accent !== undefined && !color(value.accent) || value.background !== undefined && !color(value.background)
    || value.motion !== undefined && !["reveal", "fade", "none"].includes(value.motion)) invalid();
  if (value.kind === "table") {
    if (value.items !== undefined || !Array.isArray(value.columns) || !value.columns.length || value.columns.length > 4 || !value.columns.every(item => text(item, 40))
      || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 8 || !value.rows.every(row => Array.isArray(row) && row.length === value.columns.length && row.every(item => text(item, 100)))
      || value.rowColors !== undefined && (!Array.isArray(value.rowColors) || value.rowColors.length !== value.rows.length || !value.rowColors.every(item => item === null || color(item)))) invalid();
  } else {
    if (value.columns !== undefined || value.rows !== undefined || value.rowColors !== undefined || !Array.isArray(value.items) || !value.items.length || value.items.length > (value.kind === "cards" ? 4 : 8)) invalid();
    for (const item of value.items) {
      if (!object(item, value.kind === "chart" ? ["label", "value", "color"] : ["label", "detail", "color"]) || !text(item.label, 100)
        || item.color !== undefined && !color(item.color)
        || value.kind === "chart" && (typeof item.value !== "number" || !Number.isFinite(item.value) || item.value < 0 || item.value > 1000000)
        || value.kind !== "chart" && item.detail !== undefined && !text(item.detail, 200)) invalid();
    }
  }
  return structuredClone({ aspectRatio: "16:9", accent: "#29d7cc", background: "#101c24", motion: "reveal", ...value });
}

const string = maxLength => ({ type: "string", minLength: 1, maxLength });
const list = (items, maxItems) => ({ type: "array", minItems: 1, maxItems, items });
const hex = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
export const ANIMATION_SCENE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["table", "chart", "text", "cards"] }, title: string(100), subtitle: string(180),
    duration: { type: "number", minimum: 1, maximum: 20 }, aspectRatio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
    accent: hex, background: hex, motion: { type: "string", enum: ["reveal", "fade", "none"] },
    columns: list(string(40), 4), rows: list(list(string(100), 4), 8),
    rowColors: { ...list({ anyOf: [hex, { type: "null" }] }, 8), description: "Optional table row backgrounds, matching row count; null keeps the default." },
    items: list({ type: "object", additionalProperties: false, properties: { label: string(100), detail: string(200), value: { type: "number", minimum: 0, maximum: 1000000 }, color: hex }, required: ["label"] }, 8),
  }, required: ["kind", "title", "duration"],
};

export const ANIMATION_GENERATE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    stateToken: string(256), scene: ANIMATION_SCENE_SCHEMA,
    targetClipId: { ...string(256), description: "Only for explicitly requested replacement of an existing generated animation clip; source duration must match." },
  }, required: ["stateToken", "scene"],
};

export function animationDimensions(aspectRatio) {
  return aspectRatio === "9:16" ? { width: 720, height: 1280 } : aspectRatio === "1:1" ? { width: 1080, height: 1080 } : { width: 1280, height: 720 };
}
