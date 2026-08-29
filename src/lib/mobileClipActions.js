const AUDIO_CLIP_ACTIONS = ["dismiss", "audio-properties", "audio-fade", "audio-spatial", "audio-voice-color", "split", "captions", "separate", "delete"];
const MUSIC_CLIP_ACTIONS = ["dismiss", "audio-properties", "audio-fade", "audio-spatial", "split", "captions", "separate", "delete"];
const SOURCE_AUDIO_CLIP_ACTIONS = ["dismiss", "audio-properties", "audio-spatial", "audio-voice-color", "split", "captions", "delete"];
const STICKER_CLIP_ACTIONS = ["dismiss", "sticker-properties", "copy", "delete"];

export function getMobileClipActionIds(track, options = {}) {
  const associationActions = ["caption-link", ...(options.hasLinkedCaption ? ["caption-align"] : [])];
  if (track === "caption") return ["dismiss", "caption-properties", "caption-font", "caption-voice", "split", "copy", ...associationActions, "delete"];
  if (track === "audio") return [...AUDIO_CLIP_ACTIONS.slice(0, -1), ...associationActions, "delete"];
  if (track === "music") return MUSIC_CLIP_ACTIONS;
  if (track === "source") return SOURCE_AUDIO_CLIP_ACTIONS;
  if (track === "sticker") return STICKER_CLIP_ACTIONS;
  if (track === "image" || track === "overlay") {
    const actions = [
      "dismiss",
      "visual-transform",
      ...(options.isVector ? ["visual-vector"] : ["visual-mask", "visual-filter"]),
      ...(track === "overlay" && !options.isVector ? ["visual-effects"] : []),
      "visual-animation",
      ...(!options.isVector && options.isVideo ? ["visual-speed"] : []),
      ...(track === "image" && !options.isVector ? ["visual-repair"] : []),
      ...(track === "overlay" ? ["overlay-timing"] : []),
      "split",
      "copy",
      ...(["image", "overlay"].includes(track) && options.canExtractSourceAudio ? ["extract-source-audio"] : []),
      "delete",
    ];
    return actions;
  }
  return ["dismiss", "split", "copy", "delete"];
}

export function getMobileClipPanel() {
  return "inspector";
}

export function getMobileClipPanelOrigin(track) {
  if (track === "image") return "visual-clip";
  if (track === "overlay") return "overlay-clip";
  if (track === "caption") return "caption-clip";
  if (track === "sticker") return "sticker-clip";
  return ["audio", "source", "music"].includes(track) ? "audio-clip" : "";
}

export function resolveInspectorPanelContext({ origin = "", activeTool = "", selectedTrack = "" } = {}) {
  const explicitContext = {
    "visual-clip": "visual",
    "overlay-clip": "overlay",
    "caption-clip": "caption",
    "sticker-clip": "sticker",
    "audio-clip": "audio",
  }[origin];
  if (explicitContext) return explicitContext;
  if (activeTool === "smart") return "smart";
  if (activeTool === "plugins") return "plugins";
  if (activeTool === "effects") return "effects";
  if (activeTool === "caption") return "caption";
  if (selectedTrack === "image") return "visual";
  if (selectedTrack === "overlay") return "overlay";
  if (selectedTrack === "sticker") return "sticker";
  if (["audio", "source", "music"].includes(selectedTrack)) return "audio";
  return "voice";
}

export function shouldActivateToolRailForClip(isMobile) {
  return !isMobile;
}

export function resolveMobileClipActionTrack(explicitTrack, selections = {}) {
  if (explicitTrack) return explicitTrack;
  if (selections.visual) return "image";
  if (selections.overlay) return "overlay";
  if (selections.sticker) return "sticker";
  if (selections.caption) return "caption";
  if (selections.source) return "source";
  if (selections.audio) return "audio";
  if (selections.music) return "music";
  return "";
}
