import { captureProjectPreview } from "../lib/projectPreview.js";
import { useCallback, useRef, useState } from "react";
import { captureAnnaSessionAnalysis, prepareAnnaProjectSession, readAnnaProjectSession, restoreAnnaSessionItems, restoreAnnaSessionMetadata } from "../lib/annaProjectSession.js";
import { DEFAULT_SCRIPT, DEFAULT_TIMELINE_DURATION_SECONDS, normalizeVoiceId, RATIO_OPTIONS, VOICES } from "../config/editor.js";
import { decodeWaveform, downloadBlob } from "../lib/media.js";
import { createProjectArchive, readProjectArchive, readProjectFileAsText, resolveProjectVisualMedia } from "../lib/projectArchive.js";
import { createCaptionSegments, getImageThumbnailCount, getVisualSegmentsTotal } from "../lib/timeline.js";
import { normalizeSmartFrame } from "../lib/smartFrame.js";
import { normalizeTrackLocks, normalizeTrackVisibility } from "../lib/projectTrackState.js";
import { getVisionKey } from "../lib/vision.js";
import { normalizeTimelineMarkers } from "../lib/timelineMarkers.js";
import { PROJECT_IMPORT_COPY } from "../i18nProjectImport.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finiteOr = (value, fallback) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : fallback;
const waitForProjectPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

// Archive and in-memory command callers share one complete snapshot contract.
// Optional tracks must remain arrays even when a caller has no media for them.
export function createProjectSnapshotFromState(deps = {}, commandState) {
  const state = deps ?? {};
  const visualSegments = asArray(state.visualSegments).map(({ blob: _blob, trackFrames: _trackFrames, src: _src, cutoutVisual: _cutoutVisual, enhancement: _enhancement, ...segment }) => segment);
  const visualOverlaySegments = asArray(state.visualOverlaySegments).map(({ blob: _blob, src: _src, ...segment }) => segment);
  const audioSegments = asArray(state.audioSegments).map(({ blob: _blob, url: _url, peaks: _peaks, ...segment }) => segment);
  const musicSegments = asArray(state.musicSegments).map(({ blob: _blob, src: _src, url: _url, peaks: _peaks, ...segment }) => segment);
  return {
    script: state.script ?? DEFAULT_SCRIPT,
    commandState: {
      schemaVersion: 1,
      revision: Number.isInteger(commandState?.revision) && commandState.revision >= 0 ? commandState.revision : 0,
      appliedOperationIds: [...asArray(commandState?.appliedOperationIds)],
    },
    selectedVoiceId: state.selectedVoiceId ?? VOICES[0].id,
    speed: finiteOr(state.speed, VOICES[0].defaultSpeed ?? 1), volume: finiteOr(state.volume, 1),
    ratioId: state.ratioId ?? "16:9", fitMode: state.fitMode ?? "contain", captionPosition: state.captionPosition ?? "bottom",
    captionPlacement: state.captionPlacement ?? { x: 50, y: 78 }, captionSize: finiteOr(state.captionSize, 14),
    captionStyle: state.captionStyle ?? state.captionStyleFallback ?? { fontId: "default" },
    captionStylePresetId: state.captionStylePresetId ?? "classic", captionStylePresets: asArray(state.captionStylePresets),
    captionsEnabled: state.captionsEnabled !== false, captionSegments: asArray(state.captionSegments),
    audioSegments, musicSegments, visualSegments, visualOverlaySegments,
    stickerSegments: asArray(state.stickerSegments), selectedFilterId: state.selectedFilterId ?? "none",
    timelineMarkers: normalizeTimelineMarkers(state.timelineMarkers),
    selectedTransitionId: state.selectedTransitionId ?? "none", selectedStickerId: state.selectedStickerId ?? "none",
    trackVisibility: normalizeTrackVisibility(state.trackVisibility), trackLocks: normalizeTrackLocks(state.trackLocks),
    timelineZoom: finiteOr(state.timelineZoom, 1), audioDuration: finiteOr(state.audioDuration, 0),
    musicName: state.musicName ?? "", musicDuration: finiteOr(state.musicDuration, 0), musicVolume: finiteOr(state.musicVolume, 0.35),
    sourceAudioName: state.sourceAudioName ?? "", sourceAudioDuration: finiteOr(state.sourceAudioDuration, 0),
    sourceAudioStart: finiteOr(state.sourceAudioStart, 0), sourceAudioVolume: finiteOr(state.sourceAudioVolume, 1),
    sourceAudioSpatialEffect: state.sourceAudioSpatialEffect ?? "original", sourceAudioSpatialAmount: finiteOr(state.sourceAudioSpatialAmount, 1),
    musicStart: finiteOr(state.musicStart, 0),
    sourceAudioAssetId: state.sourceAudioAssetId ?? "", sourceAudioLinked: state.sourceAudioLinked !== false,
  };
}

export function useProjectFiles(deps = {}) {
  const [projectImportProgress, setProjectImportProgress] = useState(null);
  // Only file imports count as external work. A session's own guarded restore
  // must not block itself when useAnnaSession checks isProjectImporting().
  const importingRef = useRef(false);
  const commandStateRef = useRef({ schemaVersion: 1, revision: 0, appliedOperationIds: [] });
  const importGenerationRef = useRef(0);
  const intentRef = useRef(0);
  const latestDeps = useRef(deps);
  latestDeps.current = deps;
  const getProjectSnapshot = useCallback(() => createProjectSnapshotFromState(deps, commandStateRef.current), [deps]);

  const createCurrentArchive = useCallback(() => createProjectArchive({
    project: getProjectSnapshot(), visualSegments: [...asArray(deps.visualSegments), ...asArray(deps.visualOverlaySegments)],
    audioSegments: asArray(deps.audioSegments),
    audio: deps.audioBlob ? { blob: deps.audioBlob, name: "ai-voiceover" } : null,
    sourceAudio: deps.sourceAudioBlob ? { blob: deps.sourceAudioBlob, name: deps.sourceAudioName || "source-audio" } : null,
    music: deps.musicBlob ? { blob: deps.musicBlob, name: deps.musicName || "background-music" } : null,
  }), [deps, getProjectSnapshot]);

  const getSessionInput = useCallback(() => {
    const current = latestDeps.current;
    return {
      project: createProjectSnapshotFromState(current, commandStateRef.current),
      visuals: asArray(current.visualSegments), overlays: asArray(current.visualOverlaySegments),
      audioSegments: asArray(current.audioSegments), audio: current.audioBlob,
      sourceAudio: current.sourceAudioBlob, music: current.musicBlob,
      userAssets: asArray(current.userAssets), historyItems: asArray(current.historyItems),
      recordedVoices: asArray(current.recordedVoices),
      rippleEditing: current.rippleEditing,
      sourceVoiceColorOriginal: current.sourceAudioBlob ? current.sourceVoiceColorOriginalRef?.current || null : null,
      ...captureAnnaSessionAnalysis([...asArray(current.visualSegments), ...asArray(current.visualOverlaySegments)], current.visionRecords, current.depthRecords, getVisionKey),
    };
  }, []);
  const captureSession = useCallback(async () => {
    const input = getSessionInput();
    const [data, projectPreview] = await Promise.all([prepareAnnaProjectSession(input), captureProjectPreview(input.visuals)]);
    return { ...data, projectPreview };
  }, [getSessionInput]);
  const getProjectIntent = useCallback(() => intentRef.current, []);
  const isProjectImporting = useCallback(() => importingRef.current, []);

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

  const handleNewProject = useCallback((options = {}) => {
    if (importingRef.current) return;
    if (!options.confirmed && !window.confirm("新建工程将清空当前时间线，是否继续？")) return false;
    deps.resetProjectHistory?.();
    // Anna saves the outgoing project before invoking this reset. Its media
    // catalog belongs to that saved project, not to the newly created one.
    if (options.clearProjectAssets) {
      deps.setUserAssets?.([]);
      deps.setSelectedLibraryAssetId?.("");
    }
    deps.pauseTimelineMedia?.(); deps.setIsPlaying?.(false);
    importGenerationRef.current += 1;
    intentRef.current += 1;
    commandStateRef.current = { schemaVersion: 1, revision: 0, appliedOperationIds: [] };
    deps.setScript(DEFAULT_SCRIPT); deps.setCaptionSegments(createCaptionSegments(DEFAULT_SCRIPT));
    deps.setSelectedSegmentId(""); deps.clearImageTrack(""); deps.clearAudioTrack("");
    deps.setVisualOverlaySegments([]); deps.setSelectedVisualOverlayId("");
    deps.clearSourceAudioTrack(""); deps.clearMusicTrack(""); deps.setStickerSegments([]);
    deps.setTimelineMarkers?.([]);
    deps.setSelectedStickerSegmentId(""); deps.clearAllVisionState(); deps.setCurrentTime(0);
    deps.setTimelineHorizon(DEFAULT_TIMELINE_DURATION_SECONDS); deps.setTimelineZoom(1);
    deps.setShowFileMenu(false); deps.notify("已新建空白工程");
    return true;
  }, [deps]);

  const handleImportProject = useCallback(async (file, options = {}) => {
    if (importingRef.current) return false;
    if (!file && !options.session) { latestDeps.current.projectFileInputRef?.current?.click(); return false; }
    if (!options.session) intentRef.current += 1;
    const generation = ++importGenerationRef.current;
    if (!options.session) importingRef.current = true;
    const preparedUrls = new Set();
    let committed = false;
    let importAudioContext = null;
    const reportProgress = (phase, completed = 0, total = 0) => {
      if (!options.session && generation === importGenerationRef.current) {
        setProjectImportProgress({ phase, fileName: file.name, completed, total });
      }
    };
    const mediaUrl = (blob) => {
      const url = URL.createObjectURL(blob);
      preparedUrls.add(url);
      return url;
    };
    try {
      if (!options.session) {
        const current = latestDeps.current;
        current.pauseTimelineMedia?.();
        current.setIsPlaying?.(false);
        current.setShowFileMenu(false);
        reportProgress("archive", 0, file.size);
        // Paint progress before any decode or synchronous archive fallback.
        await waitForProjectPaint();
      }
      let archive;
      try { archive = options.session ? readAnnaProjectSession(options.session, mediaUrl) : await readProjectArchive(file, {
        onProgress: ({ loaded, total }) => reportProgress("archive", loaded, total),
      }); }
      catch (archiveError) {
        if (options.session) throw archiveError;
        // Reject damaged binary archives before converting the whole file to
        // a large UTF-16 string. Only legacy JSON needs a full text read.
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
      const legacyFontId = data.captionStyle?.fontId || "default";
      let inheritedCaptionFontId = legacyFontId;
      const captions = (Array.isArray(data.captionSegments) ? data.captionSegments : createCaptionSegments(data.script || DEFAULT_SCRIPT))
        .map((segment) => {
          inheritedCaptionFontId = segment.fontId || inheritedCaptionFontId;
          return segment.fontId ? segment : { ...segment, fontId: inheritedCaptionFontId };
        });
      const importedVoice = VOICES.find((voice) => voice.id === normalizeVoiceId(data.selectedVoiceId)) ?? VOICES[0];
      const hasAudioSegments = Boolean(Array.isArray(data.audioSegments) && data.audioSegments.length && (audioSegmentMedia?.size || audio));
      const pendingAudioSegments = hasAudioSegments ? data.audioSegments.flatMap((segment) => {
        const blob = audioSegmentMedia?.get(segment.id)?.blob || audio;
        return blob ? [{ segment, blob }] : [];
      }) : [];
      if (generation !== importGenerationRef.current) return false;
      const visualUrls = new Map();
      const restoreVisualMedia = (segment) => {
        const media = resolveProjectVisualMedia(visualMedia, segment);
        if (!media?.blob) return segment?.src ? segment : null;
        if (!visualUrls.has(media.blob)) visualUrls.set(media.blob, mediaUrl(media.blob));
        return { ...segment, src: visualUrls.get(media.blob), blob: media.blob };
      };
      const visuals = Array.isArray(data.visualSegments) ? data.visualSegments.map((segment) => {
        const restored = restoreVisualMedia(segment);
        if (!restored) return null;
        const smartFrame = normalizeSmartFrame(restored.smartFrame);
        if (!smartFrame) {
          const { smartFrame: _smartFrame, ...withoutSmartFrame } = restored;
          return withoutSmartFrame;
        }
        return { ...restored, smartFrame };
      }).filter(Boolean) : [];
      const overlays = asArray(data.visualOverlaySegments).map(restoreVisualMedia).filter(Boolean);
      // Playback can use restored Blobs immediately. Timeline filmstrips refine
      // progressively after the complete project commits, not during import.
      reportProgress("visuals", visualUrls.size, visualUrls.size);
      const decoded = new Map();
      const audioBlobs = [...new Set([...pendingAudioSegments.map((item) => item.blob), ...(!hasAudioSegments && audio ? [audio] : []), sourceAudio, music].filter(Boolean))];
      let audioCompleted = 0;
      let nextAudioIndex = 0;
      let decodeFailure = null;
      reportProgress("audio", 0, audioBlobs.length);
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (audioBlobs.length && AudioContextClass) importAudioContext = new AudioContextClass();
      // Decode every distinct dependency before changing editor state. Reuse
      // one native context and bound full PCM allocations to two at a time.
      const results = await Promise.allSettled(Array.from({ length: Math.min(2, audioBlobs.length) }, async () => {
        while (!decodeFailure && generation === importGenerationRef.current && nextAudioIndex < audioBlobs.length) {
          const blob = audioBlobs[nextAudioIndex++];
          try {
            decoded.set(blob, await decodeWaveform(blob, 118, { audioContext: importAudioContext }));
            reportProgress("audio", ++audioCompleted, audioBlobs.length);
          } catch (error) { decodeFailure = error; throw error; }
        }
      }));
      const failedAudio = results.find((result) => result.status === "rejected");
      if (failedAudio) throw failedAudio.reason;
      if (importAudioContext) {
        await importAudioContext.close().catch(() => {});
        importAudioContext = null;
      }
      if (generation !== importGenerationRef.current) return false;
      const restoredAudioSegments = pendingAudioSegments.map(({ segment, blob }) => ({ ...segment, blob, url: mediaUrl(blob), peaks: decoded.get(blob).peaks }));
      // Prepare recovery-only collections before the same guarded project commit.
      const sessionCollections = options.session ? {
        userAssets: restoreAnnaSessionItems(options.session.userAssets, mediaUrl),
        historyItems: restoreAnnaSessionItems(options.session.historyItems, mediaUrl),
        recordedVoices: restoreAnnaSessionItems(options.session.recordedVoices, mediaUrl),
      } : null;
      const sessionMetadata = options.session
        ? restoreAnnaSessionMetadata(options.session, [...visuals, ...overlays], mediaUrl, getVisionKey) : null;
      const visualDuration = getVisualSegmentsTotal(visuals);
      const restoredMusicSegments = music && Array.isArray(data.musicSegments) && data.musicSegments.length
        ? data.musicSegments.map((segment) => ({ ...segment, peaks: decoded.get(music).peaks })) : null;
      if (!options.session) {
        reportProgress("ready");
        await waitForProjectPaint();
      }
      // The guard is synchronous, immediately adjacent to the commit. A caller
      // can reject edits/unmounts that happened during archive reads or decoding.
      if (generation !== importGenerationRef.current || (options.beforeCommit && options.beforeCommit() !== true)) return false;
      const current = latestDeps.current;
      current.resetProjectHistory?.();
      const oldAudioUrls = asArray(current.audioSegments).map((segment) => segment.url).filter((url) => url?.startsWith("blob:"));
      commandStateRef.current = data.commandState || { schemaVersion: 1, revision: 0, appliedOperationIds: [] };
      current.setTimelineHorizon(DEFAULT_TIMELINE_DURATION_SECONDS);
      current.setScript(typeof data.script === "string" ? data.script : DEFAULT_SCRIPT);
      current.markTimelineViewRestored?.(Boolean(captions.length || visuals.length || overlays.length || markers.length || restoredAudioSegments.length || audio || sourceAudio || music));
      current.setCaptionSegments(captions); current.setSelectedSegmentId(captions[0]?.id ?? "");
      current.setTimelineMarkers?.(markers);
      current.setSelectedVoiceId(importedVoice.id);
      current.setSpeed(Number.isFinite(Number(data.speed)) && Number(data.speed) > 0
        ? Number(data.speed) : importedVoice.defaultSpeed ?? 1);
      current.setVolume(finiteOr(data.volume, 1)); current.setRatioId(RATIO_OPTIONS.some((option) => option.id === data.ratioId) ? data.ratioId : "16:9");
      current.setFitMode(data.fitMode || "contain"); current.setCaptionPosition(data.captionPosition || "bottom");
      current.setCaptionPlacement(data.captionPlacement || { x: 50, y: 78 }); current.setCaptionSize(Number(data.captionSize) || 14);
      current.setCaptionStyle(data.captionStyle || current.captionStyle);
      current.setCaptionStylePresetId?.(data.captionStylePresetId || "classic");
      current.setCaptionStylePresets?.(Array.isArray(data.captionStylePresets) ? data.captionStylePresets : []);
      current.setCaptionsEnabled(data.captionsEnabled !== false);
      current.setTrackVisibility(normalizeTrackVisibility(data.trackVisibility)); current.setTrackLocks(normalizeTrackLocks(data.trackLocks)); current.setTimelineZoom(Number(data.timelineZoom) || 1);
      current.setSelectedFilterId(data.selectedFilterId || "none"); current.setSelectedTransitionId(data.selectedTransitionId || "none");
      current.setSelectedStickerId(data.selectedStickerId || "none"); current.setStickerSegments(Array.isArray(data.stickerSegments) ? data.stickerSegments : []);
      current.setVisualSegments(visuals); current.setImageDuration(visualDuration);
      current.setVisualOverlaySegments(overlays); current.setSelectedVisualOverlayId("");
      current.setImageClipCount(getImageThumbnailCount(visualDuration)); current.setCurrentVisualAsset(visuals[0] || null);
      if (hasAudioSegments) {
        current.setAudioSegments(restoredAudioSegments);
        current.setSelectedAudioSegmentId(restoredAudioSegments[0]?.id || "");
      } else if (audio) {
        const item = decoded.get(audio);
        current.setAudioSegments([]);
        current.replaceAudio(audio, Number(data.audioDuration) || item.duration, item.peaks, "已恢复工程配音", { start: 0 });
      } else {
        current.setAudioSegments([]);
        current.setSelectedAudioSegmentId("");
      }
      if (sourceAudio) {
        const item = decoded.get(sourceAudio);
        current.replaceSourceAudio(sourceAudio, Number(data.sourceAudioDuration) || item.duration, item.peaks, data.sourceAudioName || "source-audio", "", Number(data.sourceAudioStart) || 0, data.sourceAudioAssetId || "", { focusAudio: false });
      } else current.clearSourceAudioTrack("");
      if (music) {
        const item = decoded.get(music);
        current.replaceMusic(music, Number(data.musicDuration) || item.duration, item.peaks, data.musicName || "background-music", "");
        current.setMusicStart(Math.max(0, Number(data.musicStart) || 0));
        if (restoredMusicSegments) current.setMusicSegments(restoredMusicSegments);
      } else current.clearMusicTrack("");
      current.setMusicVolume(finiteOr(data.musicVolume, 0.35)); current.setSourceAudioVolume(finiteOr(data.sourceAudioVolume, 1));
      current.setSourceAudioSpatialEffect(data.sourceAudioSpatialEffect || "original"); current.setSourceAudioSpatialAmount(finiteOr(data.sourceAudioSpatialAmount, 1));
      current.setSourceAudioAssetId(data.sourceAudioAssetId || ""); current.setSourceAudioLinked(data.sourceAudioLinked !== false);
      if (sessionCollections) {
        current.setUserAssets?.(sessionCollections.userAssets);
        current.setHistoryItems?.(sessionCollections.historyItems);
        current.setRecordedVoices?.(sessionCollections.recordedVoices);
        current.setRippleEditing?.(options.session.rippleEditing === true);
        Object.values(sessionCollections).flat().forEach((item) => {
          if (preparedUrls.has(item.src)) current.imageUrlRefs.current.add(item.src);
          if (preparedUrls.has(item.url)) current.imageUrlRefs.current.add(item.url);
        });
      }
      current.setCurrentTime(0); current.clearAllVisionState(); current.setShowFileMenu(false);
      if (sessionMetadata) {
        if (current.sourceVoiceColorOriginalRef) {
          const previousUrl = current.sourceVoiceColorOriginalRef.current?.url;
          current.sourceVoiceColorOriginalRef.current = sessionMetadata.sourceVoiceColorOriginal;
          if (previousUrl?.startsWith("blob:") && !preparedUrls.has(previousUrl)) {
            URL.revokeObjectURL(previousUrl);
            current.imageUrlRefs.current.delete(previousUrl);
          }
        }
        current.setVisionRecords?.(sessionMetadata.visionRecords);
        current.setDepthRecords?.(sessionMetadata.depthRecords);
        sessionMetadata.visionObjectUrls.forEach((urls, key) => current.visionObjectUrlsRef?.current.set(key, urls));
      }
      committed = true;
      if (options.session) preparedUrls.forEach((url) => current.imageUrlRefs.current.add(url));
      [...visuals, ...overlays].filter((segment) => preparedUrls.has(segment.src)).forEach((segment) => current.imageUrlRefs.current.add(segment.src));
      oldAudioUrls.forEach((url) => URL.revokeObjectURL(url));
      if (!options.session) current.notify(archive.legacy ? "旧版工程已导入；请重新添加未嵌入的本地媒体，然后导出为 .timeline 工程包" : "工程包已导入，媒体素材已恢复");
      return true;
    } catch (error) {
      if (generation !== importGenerationRef.current) return false;
      if (!options.session) {
        console.error("Project import failed", error);
        const current = latestDeps.current;
        current.notify((PROJECT_IMPORT_COPY[current.language] || PROJECT_IMPORT_COPY.en).error);
      }
      return false;
    } finally {
      if (importAudioContext) await importAudioContext.close().catch(() => {});
      if (!committed) preparedUrls.forEach((url) => URL.revokeObjectURL(url));
      const input = latestDeps.current.projectFileInputRef?.current;
      if (input && generation === importGenerationRef.current) input.value = "";
      if (!options.session) {
        importingRef.current = false;
        setProjectImportProgress(null);
      }
    }
  }, []);

  const restoreSession = useCallback((session, options) => handleImportProject(null, { ...options, session }), [handleImportProject]);
  return { projectImportProgress, getProjectSnapshot, createCurrentArchive, handleExportProject, handleImportProject, handleNewProject,
    getSessionInput, captureSession, restoreSession, getProjectIntent, isProjectImporting };
}
