const GENERIC_CLIP_ACTIONS = ["dismiss", "edit", "split", "copy", "delete"];
const AUDIO_CLIP_ACTIONS = ["dismiss", "edit", "split", "captions", "separate", "delete"];
const MUSIC_CLIP_ACTIONS = ["dismiss", "audio", "split", "captions", "separate", "delete"];
const SOURCE_AUDIO_CLIP_ACTIONS = ["dismiss", "audio", "split", "captions", "delete"];
const STICKER_CLIP_ACTIONS = ["dismiss", "properties", "copy", "delete"];

export function getMobileClipActionIds(track, options = {}) {
  const associationActions = ["caption-link", ...(options.hasLinkedCaption ? ["caption-align"] : [])];
  if (track === "caption") return ["dismiss", "edit", "split", "copy", ...associationActions, "delete"];
  if (track === "audio") return [...AUDIO_CLIP_ACTIONS.slice(0, -1), ...associationActions, "delete"];
  if (track === "music") return MUSIC_CLIP_ACTIONS;
  if (track === "source") return SOURCE_AUDIO_CLIP_ACTIONS;
  if (track === "sticker") return STICKER_CLIP_ACTIONS;
  if (track === "image" && options.canExtractSourceAudio) {
    return ["dismiss", "edit", "split", "copy", "extract-source-audio", "delete"];
  }
  return GENERIC_CLIP_ACTIONS;
}

export function getMobileClipPanel() {
  return "inspector";
}

export function getMobileClipPanelOrigin(track) {
  if (track === "sticker") return "sticker-clip";
  return ["audio", "source", "music"].includes(track) ? "audio-clip" : "";
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
