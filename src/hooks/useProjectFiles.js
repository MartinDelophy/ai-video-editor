import { useCallback, useRef, useState } from "react";
import { DEFAULT_SCRIPT, DEFAULT_TIMELINE_DURATION_SECONDS, normalizeVoiceId, RATIO_OPTIONS, VOICES } from "../config/editor.js";
import { decodeWaveform, downloadBlob } from "../lib/media.js";
import { createProjectArchive, readProjectArchive, readProjectFileAsText, resolveProjectVisualMedia } from "../lib/projectArchive.js";
import { createCaptionSegments, getImageThumbnailCount, getVisualSegmentsTotal } from "../lib/timeline.js";
import { normalizeSmartFrame } from "../lib/smartFrame.js";
import { normalizeTrackLocks, normalizeTrackVisibility } from "../lib/projectTrackState.js";
import { normalizeTimelineMarkers } from "../lib/timelineMarkers.js";
import { PROJECT_IMPORT_COPY } from "../i18nProjectImport.js";

const waitForProjectPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

export function useProjectFiles(deps) {
  const [projectImportProgress, setProjectImportProgress] = useState(null);
  const importingRef = useRef(false);
  const commandStateRef = useRef({ schemaVersion: 1, revision: 0, appliedOperationIds: [] });
  const getProjectSnapshot = useCallback(() => {
    const visualSegments = deps.visualSegments.map(({ blob, trackFrames, src, cutoutVisual, enhancement: _enhancement, ...segment }) => segment);
    const visualOverlaySegments = deps.visualOverlaySegments.map(({ blob, src, ...segment }) => segment);
    const audioSegments = deps.audioSegments.map(({ blob, url, peaks, ...segment }) => segment);
    const musicSegments = deps.musicSegments.map(({ blob: _blob, src: _src, url: _url, peaks: _peaks, ...segment }) => segment);
    return {
      script: deps.script, commandState: commandStateRef.current, selectedVoiceId: deps.selectedVoiceId, speed: deps.speed, volume: deps.volume,
      ratioId: deps.ratioId, fitMode: deps.fitMode, captionPosition: deps.captionPosition,
      captionPlacement: deps.captionPlacement, captionSize: deps.captionSize, captionStyle: deps.captionStyle,
      captionStylePresetId: deps.captionStylePresetId, captionStylePresets: deps.captionStylePresets,
      captionsEnabled: deps.captionsEnabled, captionSegments: deps.captionSegments, audioSegments, musicSegments, visualSegments, visualOverlaySegments,
      stickerSegments: deps.stickerSegments, selectedFilterId: deps.selectedFilterId,
      timelineMarkers: normalizeTimelineMarkers(deps.timelineMarkers),
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

  const createCurrentArchive = useCallback(() => createProjectArchive({
    project: getProjectSnapshot(), visualSegments: [...deps.visualSegments, ...deps.visualOverlaySegments],
    audioSegments: deps.audioSegments,
    audio: deps.audioBlob ? { blob: deps.audioBlob, name: "ai-voiceover" } : null,
    sourceAudio: deps.sourceAudioBlob ? { blob: deps.sourceAudioBlob, name: deps.sourceAudioName || "source-audio" } : null,
    music: deps.musicBlob ? { blob: deps.musicBlob, name: deps.musicName || "background-music" } : null,
  }), [deps, getProjectSnapshot]);

  const handleExportProject = useCallback(async () => {
    if (importingRef.current) return;
    deps.setShowFileMenu(false);
    try {
      deps.notify("正在打包工程与媒体素材…");
      const archive = await createCurrentArchive();
      downloadBlob(archive, "AI-配音项目.timeline");
      deps.notify("工程包已导出（含媒体素材）");
    } catch (error) { deps.notify(error instanceof Error ? `工程导出失败：${error.message}` : "工程导出失败"); }
  }, [deps, createCurrentArchive]);

  const handleNewProject = useCallback(() => {
    if (importingRef.current) return;
    if (!window.confirm("新建工程将清空当前时间线，是否继续？")) return;
    commandStateRef.current = { schemaVersion: 1, revision: 0, appliedOperationIds: [] };
    deps.setScript(DEFAULT_SCRIPT); deps.setCaptionSegments(createCaptionSegments(DEFAULT_SCRIPT));
    deps.setSelectedSegmentId(""); deps.clearImageTrack(""); deps.clearAudioTrack("");
    deps.setVisualOverlaySegments([]); deps.setSelectedVisualOverlayId("");
    deps.clearSourceAudioTrack(""); deps.clearMusicTrack(""); deps.setStickerSegments([]);
    deps.setTimelineMarkers?.([]);
    deps.setSelectedStickerSegmentId(""); deps.clearAllVisionState(); deps.setCurrentTime(0);
    deps.setTimelineHorizon(DEFAULT_TIMELINE_DURATION_SECONDS); deps.setTimelineZoom(1);
    deps.setShowFileMenu(false); deps.notify("已新建空白工程");
  }, [deps]);

  const handleImportProject = useCallback(async (file) => {
    if (importingRef.current) return;
    if (!file) { deps.projectFileInputRef.current?.click(); return; }
    importingRef.current = true;
    const createdUrls = new Set();
    let committed = false;
    let importAudioContext = null;
    const reportProgress = (phase, completed = 0, total = 0) => {
      setProjectImportProgress({ phase, fileName: file.name, completed, total });
    };
    const createImportedUrl = (blob) => {
      const url = URL.createObjectURL(blob);
      createdUrls.add(url);
      return url;
    };
    deps.pauseTimelineMedia?.();
    deps.setIsPlaying?.(false);
    deps.setShowFileMenu(false);
    reportProgress("archive", 0, file.size);
    try {
      // Let the modal paint before starting any decoding or fallback work.
      await waitForProjectPaint();
      let archive;
      try { archive = await readProjectArchive(file, {
        onProgress: ({ loaded, total }) => reportProgress("archive", loaded, total),
      }); }
      catch (archiveError) {
        // A damaged ZIP must not be copied into a hundreds-of-MB UTF-16
        // string just to discover that it is not a legacy JSON project.
        let legacyJsonFound = false;
        const prefixChunkBytes = 4096;
        for (let offset = 0; offset < file.size; offset += prefixChunkBytes) {
          const prefix = (await readProjectFileAsText(file.slice(offset, offset + prefixChunkBytes))).trimStart();
          if (!prefix) continue;
          if (!prefix.startsWith("{")) throw archiveError;
          legacyJsonFound = true;
          break;
        }
        if (!legacyJsonFound) throw archiveError;
        const legacy = JSON.parse(await readProjectFileAsText(file));
        if (legacy?.format !== "timeline-studio-project" || !legacy.project) throw archiveError;
        archive = { payload: { ...legacy, media: { visuals: [] } }, visualMedia: new Map(), audio: null, sourceAudio: null, music: null, legacy: true };
      }
      const { payload, visualMedia, audioSegmentMedia, audio, sourceAudio, music } = archive;
      const data = payload.project;
      const markers = normalizeTimelineMarkers(data.timelineMarkers);
      const visualUrls = new Map();
      const restoreVisualMedia = (segment) => {
        const media = resolveProjectVisualMedia(visualMedia, segment);
        if (!media?.blob) {
          return segment?.src ? segment : null;
        }
        if (!visualUrls.has(media.blob)) {
          const src = createImportedUrl(media.blob);
          visualUrls.set(media.blob, src);
        }
        return { ...segment, src: visualUrls.get(media.blob), blob: media.blob };
      };
      const restoredVisuals = Array.isArray(data.visualSegments) ? data.visualSegments.map((segment) => {
        const restored = restoreVisualMedia(segment);
        if (!restored) return null;
        const smartFrame = normalizeSmartFrame(restored.smartFrame);
        if (!smartFrame) {
          const { smartFrame: _smartFrame, ...withoutSmartFrame } = restored;
          return withoutSmartFrame;
        }
        return { ...restored, smartFrame };
      }).filter(Boolean) : [];
      const restoredOverlays = Array.isArray(data.visualOverlaySegments) ? data.visualOverlaySegments.map(restoreVisualMedia).filter(Boolean) : [];
      // Restored Blobs are ready for native playback. Do not make opening a
      // project wait for every video's decoded filmstrip: the timeline refines
      // those progressively, prioritizing the viewport and exact playhead.
      const visuals = restoredVisuals;
      const overlays = restoredOverlays;
      reportProgress("visuals", visualUrls.size, visualUrls.size);
      const hasAudioSegments = Array.isArray(data.audioSegments) && data.audioSegments.length && (audioSegmentMedia?.size || audio);
      const audioBlobs = new Set([sourceAudio, music].filter(Boolean));
      if (hasAudioSegments) {
        for (const segment of data.audioSegments) {
          const blob = audioSegmentMedia?.get(segment.id)?.blob || audio;
          if (blob) audioBlobs.add(blob);
        }
      } else if (audio) audioBlobs.add(audio);
      let audioCompleted = 0;
      reportProgress("audio", 0, audioBlobs.size);
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (audioBlobs.size && AudioContextClass) importAudioContext = new AudioContextClass();
      const decodedAudio = new Map();
      const decodeImportedAudio = (blob) => {
        if (!decodedAudio.has(blob)) decodedAudio.set(blob, decodeWaveform(blob, 118, { audioContext: importAudioContext }).then((decoded) => {
          reportProgress("audio", ++audioCompleted, audioBlobs.size);
          return decoded;
        }));
        return decodedAudio.get(blob);
      };
      let restoredAudioSegments = null;
      let standaloneAudio = null;
      if (hasAudioSegments) {
        const restoredAudio = new Array(data.audioSegments.length);
        let nextAudioIndex = 0;
        // Full native decodes can allocate many times the compressed size.
        // Share one decoder context, with only two complete PCM allocations
        // in flight at once even for projects containing many audio clips.
        let decodeFailure = null;
        const audioResults = await Promise.allSettled(Array.from({ length: Math.min(2, data.audioSegments.length) }, async () => {
          while (!decodeFailure && nextAudioIndex < data.audioSegments.length) {
            const index = nextAudioIndex++;
            const segment = data.audioSegments[index];
            const blob = audioSegmentMedia?.get(segment.id)?.blob || audio;
            if (!blob) continue;
            try {
              const decoded = await decodeImportedAudio(blob);
              restoredAudio[index] = { ...segment, blob, url: createImportedUrl(blob), peaks: decoded.peaks };
            } catch (error) { decodeFailure = error; throw error; }
          }
        }));
        const failedAudio = audioResults.find((result) => result.status === "rejected");
        if (failedAudio) throw failedAudio.reason;
        restoredAudioSegments = restoredAudio.filter(Boolean);
      } else if (audio) {
        standaloneAudio = await decodeImportedAudio(audio);
      } else restoredAudioSegments = [];
      const decodedSource = sourceAudio ? await decodeImportedAudio(sourceAudio) : null;
      const decodedMusic = music ? await decodeImportedAudio(music) : null;
      if (importAudioContext) {
        await importAudioContext.close().catch(() => {});
        importAudioContext = null;
      }

      // Publish one complete project only after media restoration and waveforms
      // have succeeded. Failed imports leave the previous timeline intact.
      reportProgress("ready");
      await waitForProjectPaint();
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
      deps.markTimelineViewRestored?.(Boolean(captions.length || data.visualSegments?.length || markers.length || audio || sourceAudio || music));
      deps.setCaptionSegments(captions); deps.setSelectedSegmentId(captions[0]?.id ?? "");
      deps.setTimelineMarkers?.(markers);
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
      for (const url of visualUrls.values()) deps.imageUrlRefs.current.add(url);
      for (const segment of [...visuals, ...overlays]) {
        if (segment.src?.startsWith("blob:")) deps.imageUrlRefs.current.add(segment.src);
      }
      deps.setVisualSegments(visuals); deps.setImageDuration(getVisualSegmentsTotal(visuals));
      deps.setVisualOverlaySegments(overlays); deps.setSelectedVisualOverlayId("");
      deps.setImageClipCount(getImageThumbnailCount(getVisualSegmentsTotal(visuals))); deps.setCurrentVisualAsset(visuals[0] || null);
      deps.audioSegments.forEach((segment) => { if (segment.url?.startsWith("blob:")) URL.revokeObjectURL(segment.url); });
      if (restoredAudioSegments) {
        deps.setAudioSegments(restoredAudioSegments);
        deps.setSelectedAudioSegmentId(restoredAudioSegments[0]?.id || "");
      } else if (standaloneAudio) {
        deps.replaceAudio(audio, Number(data.audioDuration) || standaloneAudio.duration, standaloneAudio.peaks, "");
      }
      if (decodedSource) deps.replaceSourceAudio(sourceAudio, Number(data.sourceAudioDuration) || decodedSource.duration, decodedSource.peaks, data.sourceAudioName || "source-audio", "", Number(data.sourceAudioStart) || 0, data.sourceAudioAssetId || "", { focusAudio: false });
      else deps.clearSourceAudioTrack("");
      if (decodedMusic) {
        deps.replaceMusic(music, Number(data.musicDuration) || decodedMusic.duration, decodedMusic.peaks, data.musicName || "background-music", "");
        deps.setMusicStart(Math.max(0, Number(data.musicStart) || 0));
        if (Array.isArray(data.musicSegments) && data.musicSegments.length) deps.setMusicSegments(data.musicSegments.map((segment) => ({ ...segment, peaks: decodedMusic.peaks })));
      } else deps.clearMusicTrack("");
      deps.setMusicVolume(Number(data.musicVolume) || 0.35); deps.setSourceAudioVolume(Number(data.sourceAudioVolume) || 1);
      deps.setSourceAudioSpatialEffect(data.sourceAudioSpatialEffect || "original"); deps.setSourceAudioSpatialAmount(Number.isFinite(Number(data.sourceAudioSpatialAmount)) ? Number(data.sourceAudioSpatialAmount) : 1);
      deps.setSourceAudioAssetId(data.sourceAudioAssetId || ""); deps.setSourceAudioLinked(data.sourceAudioLinked !== false);
      deps.setCurrentTime(0); deps.clearAllVisionState(); deps.setShowFileMenu(false);
      committed = true;
      // Dismiss loading in the same commit as the complete project, before
      // newly mounted clips start their background filmstrip refinement.
      deps.notify(archive.legacy ? "旧版工程已导入；请重新添加未嵌入的本地媒体，然后导出为 .timeline 工程包" : "工程包已导入，媒体素材已恢复");
    } catch (error) {
      console.error("Project import failed", error);
      deps.notify((PROJECT_IMPORT_COPY[deps.language] || PROJECT_IMPORT_COPY.en).error);
    } finally {
      if (importAudioContext) await importAudioContext.close().catch(() => {});
      if (!committed) createdUrls.forEach((url) => URL.revokeObjectURL(url));
      if (deps.projectFileInputRef.current) deps.projectFileInputRef.current.value = "";
      importingRef.current = false;
      setProjectImportProgress(null);
    }
  }, [deps]);

  return { projectImportProgress, handleExportProject, handleImportProject, handleNewProject, getProjectSnapshot, createCurrentArchive };
}
