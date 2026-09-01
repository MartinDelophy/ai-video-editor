export const CAPTION_VISUAL_STYLE_KEYS = [
  "fontId",
  "textColor",
  "backgroundColor",
  "backgroundOpacity",
  "borderColor",
  "borderWidth",
  "radius",
  "paddingX",
  "paddingY",
  "shadowOpacity",
  "effect",
  "textStrokeColor",
  "textStrokeWidth",
];

export const CAPTION_SEGMENT_STYLE_KEYS = [...CAPTION_VISUAL_STYLE_KEYS, "captionSize"];

export const BUILTIN_CAPTION_STYLE_PRESETS = [
  {
    id: "plain",
    labelKey: "captionStylePresetPlain",
    sampleClass: "is-plain",
    captionSize: 14,
    style: {
      textColor: "#f5fbff",
      backgroundColor: "#05080d",
      backgroundOpacity: 0,
      borderColor: "#35f0dd",
      borderWidth: 0,
      radius: 7,
      paddingX: 16,
      paddingY: 8,
      shadowOpacity: 0.55,
      effect: "normal",
      textStrokeColor: "#05080d",
      textStrokeWidth: 0,
    },
  },
  {
    id: "outline",
    labelKey: "captionStylePresetOutline",
    sampleClass: "is-outline",
    captionSize: 14,
    style: {
      textColor: "#ffffff",
      backgroundColor: "#05080d",
      backgroundOpacity: 0,
      borderColor: "#35f0dd",
      borderWidth: 0,
      radius: 7,
      paddingX: 16,
      paddingY: 8,
      shadowOpacity: 0.35,
      effect: "normal",
      textStrokeColor: "#05080d",
      textStrokeWidth: 2,
    },
  },
  {
    id: "classic",
    labelKey: "captionStylePresetClassicBoard",
    sampleClass: "is-classic",
    captionSize: 14,
    style: {
      textColor: "#f5fbff",
      backgroundColor: "#05080d",
      backgroundOpacity: 0.72,
      borderColor: "#35f0dd",
      borderWidth: 0,
      radius: 7,
      paddingX: 22,
      paddingY: 12,
      shadowOpacity: 0.45,
      effect: "normal",
      textStrokeColor: "#05080d",
      textStrokeWidth: 0,
    },
  },
  {
    id: "translucent",
    labelKey: "captionStylePresetTranslucent",
    sampleClass: "is-translucent",
    captionSize: 14,
    style: {
      textColor: "#effffd",
      backgroundColor: "#17303a",
      backgroundOpacity: 0.46,
      borderColor: "#8ef7ed",
      borderWidth: 1,
      radius: 12,
      paddingX: 22,
      paddingY: 11,
      shadowOpacity: 0.35,
      effect: "normal",
      textStrokeColor: "#05080d",
      textStrokeWidth: 0,
    },
  },
  {
    id: "neon",
    labelKey: "captionStylePresetNeon",
    sampleClass: "is-neon",
    captionSize: 14,
    style: {
      textColor: "#ecfffd",
      backgroundColor: "#071517",
      backgroundOpacity: 0.22,
      borderColor: "#35f0dd",
      borderWidth: 1,
      radius: 9,
      paddingX: 22,
      paddingY: 11,
      shadowOpacity: 0.5,
      effect: "neon",
      textStrokeColor: "#071517",
      textStrokeWidth: 0,
    },
  },
];

export function getCaptionStylePreset(id) {
  return BUILTIN_CAPTION_STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function getCaptionSegmentOverrides(segment) {
  const overrides = { ...(segment?.styleOverrides ?? {}) };
  if (!overrides.fontId && segment?.fontId && segment.fontId !== "default") {
    overrides.fontId = segment.fontId;
  }
  return overrides;
}

export function countCaptionSegmentOverrides(segment) {
  const styleCount = Object.keys(getCaptionSegmentOverrides(segment)).filter((key) => (
    CAPTION_SEGMENT_STYLE_KEYS.includes(key)
  )).length;
  return styleCount + (segment?.placement ? 1 : 0);
}

export function resolveCaptionSizeForSegment(captionSize, segment) {
  const override = Number(getCaptionSegmentOverrides(segment).captionSize);
  return Number.isFinite(override) && override > 0 ? override : captionSize;
}

export function applyCaptionPresetToStyle(currentStyle, preset) {
  if (!preset) return currentStyle;
  return {
    ...currentStyle,
    ...preset.style,
  };
}

export function buildCaptionPresetSnapshot(name, captionStyle, captionSize) {
  return {
    id: `caption-style-${crypto.randomUUID()}`,
    name,
    captionSize,
    style: Object.fromEntries(CAPTION_VISUAL_STYLE_KEYS.map((key) => [key, captionStyle[key]])),
  };
}
