import { useMemo } from "react";
import { SAMPLE_IMAGE, VOICES } from "../config/editor.js";

export function useEditorCatalog(voiceFilter) {
  const filteredVoices = useMemo(() => VOICES.filter((voice) => {
    if (voiceFilter === "all") return true;
    if (voiceFilter === "中文") return voice.language === "中文";
    if (voiceFilter === "English") return voice.language === "English";
    return voice.engine === voiceFilter;
  }), [voiceFilter]);
  const builtInAssets = useMemo(() => [
    { id: "sample", type: "image", src: SAMPLE_IMAGE, name: "sample-portrait.png", meta: "1920 x 1080", width: 1920, height: 1080 },
    { id: "sample-motion", type: "video", src: "/assets/sample-motion.mp4", name: "sample-motion.mp4", meta: "640 x 360 · 00:02.50", duration: 2.5, width: 640, height: 360, trackFrames: [] },
  ], []);
  return { builtInAssets, filteredVoices };
}
