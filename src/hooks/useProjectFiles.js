import { useCallback, useRef } from "react";
import { DEFAULT_SCRIPT, DEFAULT_TIMELINE_DURATION_SECONDS, normalizeVoiceId, RATIO_OPTIONS, VOICES } from "../config/editor.js";
import { decodeWaveform, downloadBlob } from "../lib/media.js";
import { createProjectArchive, readProjectArchive, readProjectFileAsText, resolveProjectVisualMedia } from "../lib/projectArchive.js";
import { createCaptionSegments, getImageThumbnailCount, getVisualSegmentsTotal } from "../lib/timeline.js";
import { normalizeSmartFrame } from "../lib/smartFrame.js";
import { normalizeTrackLocks, normalizeTrackVisibility } from "../lib/projectTrackState.js";

export function useProjectFiles(deps) {
  const commandStateRef = useRef({ schemaVersion: 1, revision: 0, appliedOperationIds: [] });
  const getProjectSnapshot = useCallback(() => {
    const visualSegments = deps.visualSegments.map(({ blob, trackFrames, src, cutoutVisual, enhancement: _enhancement, ...segment }) => segment);
    const visualOverlaySegments = deps.visualOverlaySegments.map(({ blob, src, ...segment }) => segment);
    const audioSegments = deps.audioSegments.map(({ blob, url, peaks, ...segment }) => segment);
    return {
      script: deps.script, commandState: commandStateRef.current, selectedVoiceId: deps.selectedVoiceId, speed: deps.speed, volume: deps.volume,
      ratioId: deps.ratioId, fitMode: deps.fitMode, captionPosition: deps.captionPosition,
      captionPlacement: deps.captionPlacement, captionSize: deps.captionSize, captionStyle: deps.captionStyle,
      captionStylePresetId: deps.captionStylePresetId, captionStylePresets: deps.captionStylePresets,
      captionsEnabled: deps.captionsEnabled, captionSegments: deps.captionSegments, audioSegments, musicSegments: deps.musicSegments, visualSegments, visualOverlaySegments,
      stickerSegments: deps.stickerSegments, selectedFilterId: deps.selectedFilterId,
      selectedTransitionId: deps.selectedTransitionId, selectedStickerId: deps.selectedStickerId,
      trackVisibility: deps.trackVisibility, trackLocks: deps.trackLocks, timelineZoom: deps.timelineZoom, audioDuration: deps.audioDuration,
      musicName: deps.musicName, musicDuration: deps.musicDuration, musicVolume: deps.musicVolume,
      sourceAudioName: deps.sourceAudioName, sourceAudioDuration: deps.sourceAudioDuration,
      sourceAudioStart: deps.sourceAudioStart, sourceAudioVolume: deps.sourceAudioVolume,
      sourceAudioSpatialEffect: deps.sourceAudioSpatialEffect, sourceAudioSpatialAmount: deps.sourceAudioSpatialAmount,
      musicStart: deps.musicStart,
      sourceAudioAssetId: deps.sourceAudioAssetId, sourceAudioLinked: deps.sourceAudioLinked,
    };
  }, [deps]);

  const handleExportProject = useCallback(async () => {
    deps.setShowFileMenu(false);
    try {
      deps.notify("正在打包工程与媒体素材…");
      const archive = await createProjectArchive({
        project: getProjectSnapshot(), visualSegments: [...deps.visualSegments, ...deps.visualOverlaySegments],
        audioSegments: deps.audioSegments,
        audio: deps.audioBlob ? { blob: deps.audioBlob, name: "ai-voiceover" } : null,
        sourceAudio: deps.sourceAudioBlob ? { blob: deps.sourceAudioBlob, name: deps.sourceAudioName || "source-audio" } : null,
        music: deps.musicBlob ? { blob: deps.musicBlob, name: deps.musicName || "background-music" } : null,
      });
      downloadBlob(archive, "AI-配音项目.timeline");
      deps.notify("工程包已导出（含媒体素材）");
    } catch (error) { deps.notify(error instanceof Error ? `工程导出失败：${error.message}` : "工程导出失败"); }
  }, [deps, getProjectSnapshot]);

  const handleNewProject = useCallback(() => {
    if (!window.confirm("新建工程将清空当前时间线，是否继续？")) return;
    commandStateRef.current = { schemaVersion: 1, revision: 0, appliedOperationIds: [] };
    deps.setScript(DEFAULT_SCRIPT); deps.setCaptionSegments(createCaptionSegments(DEFAULT_SCRIPT));
    deps.setSelectedSegmentId(""); deps.clearImageTrack(""); deps.clearAudioTrack("");
    deps.setVisualOverlaySegments([]); deps.setSelectedVisualOverlayId("");
    deps.clearSourceAudioTrack(""); deps.clearMusicTrack(""); deps.setStickerSegments([]);
    deps.setSelectedStickerSegmentId(""); deps.clearAllVisionState(); deps.setCurrentTime(0);
    deps.setTimelineHorizon(DEFAULT_TIMELINE_DURATION_SECONDS); deps.setTimelineZoom(1);
    deps.setShowFileMenu(false); deps.notify("已新建空白工程");
  }, [deps]);

  const handleImportProject = useCallback(async (file) => {
    if (!file) { deps.projectFileInputRef.current?.click(); return; }
    try {
      let archive;
      try { archive = await readProjectArchive(file); }
      catch (archiveError) {
        const legacy = JSON.parse(await readProjectFileAsText(file));
        if (legacy?.format !== "timeline-studio-project" || !legacy.project) throw archiveError;
        archive = { payload: { ...legacy, media: { visuals: [] } }, visualMedia: new Map(), audio: null, sourceAudio: null, music: null, legacy: true };
      }
      const { payload, visualMedia, audioSegmentMedia, audio, sourceAudio, music } = archive;
      const data = payload.project;
      commandStateRef.current = data.commandState || { schemaVersion: 1, revision: 0, appliedOperationIds: [] };
      deps.setTimelineHorizon(DEFAULT_TIMELINE_DURATION_SECONDS);
      deps.setScript(typeof data.script === "string" ? data.script : DEFAULT_SCRIPT);
      const legacyFontId = data.captionStyle?.fontId || "default";
      let inheritedCaptionFontId = legacyFontId;
      const captions = (Array.isArray(data.captionSegments) ? data.captionSegments : createCaptionSegments(data.script || DEFAULT_SCRIPT))
        .map((segment) => {
          inheritedCaptionFontId = segment.fontId || inheritedCaptionFontId;
          return segment.fontId ? segment : { ...segment, fontId: inheritedCaptionFontId };
        });
      deps.markTimelineViewRestored?.(Boolean(captions.length || data.visualSegments?.length || audio || sourceAudio || music));
      deps.setCaptionSegments(captions); deps.setSelectedSegmentId(captions[0]?.id ?? "");
      const importedVoice = VOICES.find((voice) => voice.id === normalizeVoiceId(data.selectedVoiceId)) ?? VOICES[0];
      deps.setSelectedVoiceId(importedVoice.id);
      deps.setSpeed(Number.isFinite(Number(data.speed)) && Number(data.speed) > 0
        ? Number(data.speed)
        : importedVoice.defaultSpeed ?? 1);
      deps.setVolume(Number(data.volume) || 1); deps.setRatioId(RATIO_OPTIONS.some((option) => option.id === data.ratioId) ? data.ratioId : "16:9");
      deps.setFitMode(data.fitMode || "contain"); deps.setCaptionPosition(data.captionPosition || "bottom");
      deps.setCaptionPlacement(data.captionPlacement || { x: 50, y: 78 }); deps.setCaptionSize(Number(data.captionSize) || 14);
      deps.setCaptionStyle(data.captionStyle || deps.captionStyle);
      deps.setCaptionStylePresetId?.(data.captionStylePresetId || "classic");
      deps.setCaptionStylePresets?.(Array.isArray(data.captionStylePresets) ? data.captionStylePresets : []);
      deps.setCaptionsEnabled(data.captionsEnabled !== false);
      deps.setTrackVisibility(normalizeTrackVisibility(data.trackVisibility)); deps.setTrackLocks(normalizeTrackLocks(data.trackLocks)); deps.setTimelineZoom(Number(data.timelineZoom) || 1);
      deps.setSelectedFilterId(data.selectedFilterId || "none"); deps.setSelectedTransitionId(data.selectedTransitionId || "none");
      deps.setSelectedStickerId(data.selectedStickerId || "none"); deps.setStickerSegments(Array.isArray(data.stickerSegments) ? data.stickerSegments : []);
      const visuals = Array.isArray(data.visualSegments) ? data.visualSegments.map((segment) => {
        const media = resolveProjectVisualMedia(visualMedia, segment);
        const restored = media?.blob ? { ...segment, src: URL.createObjectURL(media.blob), blob: media.blob } : segment?.src ? segment : null;
        if (!restored) return null;
        const smartFrame = normalizeSmartFrame(restored.smartFrame);
        if (!smartFrame) {
          const { smartFrame: _smartFrame, ...withoutSmartFrame } = restored;
          return withoutSmartFrame;
        }
        return { ...restored, smartFrame };
      }).filter(Boolean) : [];
      visuals.filter((segment) => segment.src?.startsWith("blob:")).forEach((segment) => deps.imageUrlRefs.current.add(segment.src));
      deps.setVisualSegments(visuals); deps.setImageDuration(getVisualSegmentsTotal(visuals));
      const overlays = Array.isArray(data.visualOverlaySegments) ? data.visualOverlaySegments.map((segment) => {
        const media = resolveProjectVisualMedia(visualMedia, segment);
        return media?.blob ? { ...segment, src: URL.createObjectURL(media.blob), blob: media.blob } : segment?.src ? segment : null;
      }).filter(Boolean) : [];
      deps.setVisualOverlaySegments(overlays); deps.setSelectedVisualOverlayId("");
      deps.setImageClipCount(getImageThumbnailCount(getVisualSegmentsTotal(visuals))); deps.setCurrentVisualAsset(visuals[0] || null);
      deps.audioSegments.forEach((segment) => { if (segment.url?.startsWith("blob:")) URL.revokeObjectURL(segment.url); });
      if (Array.isArray(data.audioSegments) && data.audioSegments.length && (audioSegmentMedia?.size || audio)) {
        let legacyDecoded = null;
        const restoredAudioSegments = (await Promise.all(data.audioSegments.map(async (segment) => {
          const blob = audioSegmentMedia?.get(segment.id)?.blob || audio;
          if (!blob) return null;
          const decoded = blob === audio
            ? (legacyDecoded ||= await decodeWaveform(blob))
            : await decodeWaveform(blob);
          return { ...segment, blob, url: URL.createObjectURL(blob), peaks: decoded.peaks };
        }))).filter(Boolean);
        deps.setAudioSegments(restoredAudioSegments);
        deps.setSelectedAudioSegmentId(restoredAudioSegments[0]?.id || "");
      } else if (audio) {
        const decoded = await decodeWaveform(audio);
        deps.replaceAudio(audio, Number(data.audioDuration) || decoded.duration, decoded.peaks, "已恢复工程配音");
      } else {
        deps.setAudioSegments([]);
        deps.setSelectedAudioSegmentId("");
      }
      if (sourceAudio) { const decoded = await decodeWaveform(sourceAudio); deps.replaceSourceAudio(sourceAudio, Number(data.sourceAudioDuration) || decoded.duration, decoded.peaks, data.sourceAudioName || "source-audio", "", Number(data.sourceAudioStart) || 0, data.sourceAudioAssetId || "", { focusAudio: false }); } else deps.clearSourceAudioTrack("");
      if (music) {
        const decoded = await decodeWaveform(music);
        deps.replaceMusic(music, Number(data.musicDuration) || decoded.duration, decoded.peaks, data.musicName || "background-music", "");
        deps.setMusicStart(Math.max(0, Number(data.musicStart) || 0));
        if (Array.isArray(data.musicSegments) && data.musicSegments.length) deps.setMusicSegments(data.musicSegments.map((segment) => ({ ...segment, peaks: decoded.peaks })));
      } else deps.clearMusicTrack("");
      deps.setMusicVolume(Number(data.musicVolume) || 0.35); deps.setSourceAudioVolume(Number(data.sourceAudioVolume) || 1);
      deps.setSourceAudioSpatialEffect(data.sourceAudioSpatialEffect || "original"); deps.setSourceAudioSpatialAmount(Number.isFinite(Number(data.sourceAudioSpatialAmount)) ? Number(data.sourceAudioSpatialAmount) : 1);
      deps.setSourceAudioAssetId(data.sourceAudioAssetId || ""); deps.setSourceAudioLinked(data.sourceAudioLinked !== false);
      deps.setCurrentTime(0); deps.clearAllVisionState(); deps.setShowFileMenu(false);
      deps.notify(archive.legacy ? "旧版工程已导入；请重新添加未嵌入的本地媒体，然后导出为 .timeline 工程包" : "工程包已导入，媒体素材已恢复");
    } catch (error) { deps.notify(`无法读取工程文件${error instanceof Error && error.message ? `：${error.message}` : ""}`); }
    if (deps.projectFileInputRef.current) deps.projectFileInputRef.current.value = "";
  }, [deps]);

  return { handleExportProject, handleImportProject, handleNewProject };
}
