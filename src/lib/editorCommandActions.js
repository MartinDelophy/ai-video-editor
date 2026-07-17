import { saveLanguagePreference } from "../i18n.js";
import { revokeVisionObjectUrls } from "./editorRuntime.js";
import { createCaptionSegments } from "./timeline.js";

export function createEditorCommandActions(d) {
  function clearAllVisionState() {
    d.visionJobGenerationRef.current += 1;
    d.visionAbortControllerRef.current?.abort();
    d.visionAbortControllerRef.current = null;
    d.visionObjectUrlsRef.current.forEach((urls) => revokeVisionObjectUrls(urls));
    d.visionObjectUrlsRef.current.clear();
    d.setVisionRecords({});
    d.setVisionJob({ running: false, key: "", progress: 0, phase: "" });
  }

  function selectTool(toolId) {
    d.setActiveTool(toolId);
    if (toolId !== "smart") d.setAvatarPanelOpen(false);
    if (toolId === "audio") {
      d.setSelectedTrack("audio");
      d.setVoiceTab("synthesis");
    }
    if (toolId === "media") d.setSelectedTrack("image");
    if (toolId === "caption") d.setSelectedTrack("caption");
  }

  function chooseInterfaceLanguage(languageId) {
    saveLanguagePreference(languageId);
    d.setIntroClosing(true);
    window.setTimeout(() => {
      d.setUiLanguage(languageId);
      d.setIntroClosing(false);
    }, 520);
  }

  function toggleTrackVisibility(track) {
    d.setTrackVisibility((visibility) => {
      const baseTrack = track.replace(/-\d+$/, "");
      const currentVisibility = visibility[track] ?? visibility[baseTrack] ?? true;
      return { ...visibility, [track]: !currentVisibility };
    });
  }

  function toggleTrackLock(track) {
    d.setTrackLocks((locks) => ({ ...locks, [track]: !locks[track] }));
  }

  function useHistoryItem(item) {
    d.replaceAudio(item.blob, item.duration, item.peaks, `${item.voiceName} 已恢复`);
    d.setScript(item.script);
    const nextSegments = createCaptionSegments(item.script);
    d.setCaptionSegments(nextSegments);
    d.setSelectedSegmentId(nextSegments[0]?.id ?? "");
    d.setSelectedVoiceId(item.voiceId);
    d.notify("历史配音已恢复到时间线");
  }

  return {
    chooseInterfaceLanguage, clearAllVisionState, selectTool, toggleTrackLock,
    toggleTrackVisibility, useHistoryItem,
  };
}
