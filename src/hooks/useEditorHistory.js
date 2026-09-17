import { useCallback, useEffect, useMemo, useRef } from "react";
import { normalizeTimelineMarkers } from "../lib/timelineMarkers.js";

import {
  createEditorHistory,
  pushEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "../lib/editorHistoryCore.ts";

const HISTORY_LIMIT = 50;
const HISTORY_DEBOUNCE_MS = 180;

function cloneItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
}

function createSnapshot(d) {
  return {
    script: d.script,
    captionSegments: cloneItems(d.captionSegments),
    captionPosition: d.captionPosition,
    captionPlacement: { ...d.captionPlacement },
    captionSize: d.captionSize,
    captionStyle: { ...d.captionStyle },
    captionStylePresetId: d.captionStylePresetId,
    captionStylePresets: cloneItems(d.captionStylePresets),
    captionsEnabled: d.captionsEnabled,
    visualSegments: cloneItems(d.visualSegments),
    visualOverlaySegments: cloneItems(d.visualOverlaySegments),
    imageSrc: d.imageSrc,
    imageName: d.imageName,
    imageMeta: d.imageMeta,
    visualType: d.visualType,
    imageDuration: d.imageDuration,
    imageClipCount: d.imageClipCount,
    fitMode: d.fitMode,
    ratioId: d.ratioId,
    selectedFilterId: d.selectedFilterId,
    selectedTransitionId: d.selectedTransitionId,
    stickerSegments: cloneItems(d.stickerSegments),
    timelineMarkers: normalizeTimelineMarkers(d.timelineMarkers),
    selectedStickerId: d.selectedStickerId,
    audioSegments: cloneItems(d.audioSegments),
    timelineHorizon: d.timelineHorizon,
    musicBlob: d.musicBlob,
    musicSegments: cloneItems(d.musicSegments),
    musicStart: d.musicStart,
    musicUrl: d.musicUrl,
    musicName: d.musicName,
    musicDuration: d.musicDuration,
    musicPeaks: d.musicPeaks,
    musicVolume: d.musicVolume,
    sourceAudioBlob: d.sourceAudioBlob,
    sourceAudioUrl: d.sourceAudioUrl,
    sourceAudioName: d.sourceAudioName,
    sourceAudioDuration: d.sourceAudioDuration,
    sourceAudioPeaks: d.sourceAudioPeaks,
    sourceAudioVolume: d.sourceAudioVolume,
    sourceAudioStart: d.sourceAudioStart,
    sourceAudioAssetId: d.sourceAudioAssetId,
    sourceAudioLinked: d.sourceAudioLinked,
    trackVisibility: { ...d.trackVisibility },
    trackLocks: { ...d.trackLocks },
    userAssets: cloneItems(d.userAssets),
    selectedTrack: d.selectedTrack,
    selectedSegmentId: d.selectedSegmentId,
    selectedVisualSegmentId: d.selectedVisualSegmentId,
    selectedVisualOverlayId: d.selectedVisualOverlayId,
    selectedStickerSegmentId: d.selectedStickerSegmentId,
    selectedAudioSegmentId: d.selectedAudioSegmentId,
    currentTime: d.currentTime,
  };
}

function mediaIdentity(item) {
  const { blob, url, src, peaks, trackFrames: _frames, trackFrameDuration: _duration, trackFrameSampling: _sampling, trackFrameImportBudget: _budget, cutoutVisual, ...serializable } = item;
  return {
    ...serializable,
    media: blob ? "blob" : src || url || "",
    hasPeaks: Boolean(peaks?.length),
    hasCutout: Boolean(cutoutVisual),
  };
}

export function createEditorSnapshotSignature(snapshot) {
  return JSON.stringify({
    script: snapshot.script,
    ratioId: snapshot.ratioId,
    captions: snapshot.captionSegments,
    captionPosition: snapshot.captionPosition,
    captionPlacement: snapshot.captionPlacement,
    captionSize: snapshot.captionSize,
    captionStyle: snapshot.captionStyle,
    captionStylePresetId: snapshot.captionStylePresetId,
    captionStylePresets: snapshot.captionStylePresets,
    captionsEnabled: snapshot.captionsEnabled,
    visuals: snapshot.visualSegments.map(mediaIdentity),
    visualOverlays: (snapshot.visualOverlaySegments ?? []).map(mediaIdentity),
    image: {
      // With a real sequence these fields follow the playhead's preview clip.
      // Seeking must not create history entries or invalidate an agent undo.
      ...(snapshot.visualSegments.length ? {} : {
        name: snapshot.imageName,
        meta: snapshot.imageMeta,
        type: snapshot.visualType,
      }),
      duration: snapshot.imageDuration,
      clipCount: snapshot.imageClipCount,
      fitMode: snapshot.fitMode,
      filter: snapshot.selectedFilterId,
      transition: snapshot.selectedTransitionId,
    },
    stickers: snapshot.stickerSegments,
    timelineMarkers: snapshot.timelineMarkers ?? [],
    selectedStickerId: snapshot.selectedStickerId,
    audio: snapshot.audioSegments.map(mediaIdentity),
    timelineHorizon: snapshot.timelineHorizon,
    music: {
      present: Boolean(snapshot.musicBlob),
      segments: snapshot.musicSegments,
      name: snapshot.musicName,
      duration: snapshot.musicDuration,
      volume: snapshot.musicVolume,
    },
    source: {
      present: Boolean(snapshot.sourceAudioBlob),
      name: snapshot.sourceAudioName,
      duration: snapshot.sourceAudioDuration,
      volume: snapshot.sourceAudioVolume,
      start: snapshot.sourceAudioStart,
      assetId: snapshot.sourceAudioAssetId,
      linked: snapshot.sourceAudioLinked,
    },
    trackVisibility: snapshot.trackVisibility,
    trackLocks: snapshot.trackLocks,
    assets: snapshot.userAssets.map(mediaIdentity),
  });
}

function createObjectUrl(blob) {
  return blob ? URL.createObjectURL(blob) : "";
}

function restoreSnapshot(snapshot, d) {
  const blobUrls = new Map();
  const getBlobUrl = (blob) => {
    if (!blob) return "";
    if (!blobUrls.has(blob)) blobUrls.set(blob, createObjectUrl(blob));
    return blobUrls.get(blob);
  };
  const restoreAsset = (item) => {
    if (!item.blob) return { ...item };
    const nextUrl = getBlobUrl(item.blob);
    if (nextUrl) d.imageUrlRefs.current.add(nextUrl);
    return { ...item, src: item.src ? nextUrl : item.src, url: item.url ? nextUrl : item.url };
  };
  const visualSegments = snapshot.visualSegments.map(restoreAsset);
  const visualOverlaySegments = (snapshot.visualOverlaySegments ?? []).map(restoreAsset);
  const ratioSource = visualSegments.find((clip) => clip.width > 0 && clip.height > 0);
  if (d.autoRatioSourceKeyRef) {
    d.autoRatioSourceKeyRef.current = ratioSource ? `${ratioSource.assetId || ratioSource.id}:${ratioSource.width}x${ratioSource.height}` : "";
  }
  const userAssets = snapshot.userAssets.map(restoreAsset);
  const restoredImage = visualSegments.find((item) => item.id === snapshot.selectedVisualSegmentId)
    ?? visualSegments.find((item) => item.src)
    ?? null;

  d.setScript(snapshot.script);
  d.setCaptionSegments(cloneItems(snapshot.captionSegments));
  d.setCaptionPosition(snapshot.captionPosition);
  d.setCaptionPlacement({ ...snapshot.captionPlacement });
  d.setCaptionSize(snapshot.captionSize);
  d.setCaptionStyle({ ...snapshot.captionStyle });
  d.setCaptionStylePresetId?.(snapshot.captionStylePresetId || "classic");
  d.setCaptionStylePresets?.(cloneItems(snapshot.captionStylePresets));
  d.setCaptionsEnabled(snapshot.captionsEnabled);
  d.setVisualSegments(visualSegments);
  d.setVisualOverlaySegments(visualOverlaySegments);
  d.setImageSrc(restoredImage?.src || snapshot.imageSrc);
  d.setImageName(snapshot.imageName);
  d.setImageMeta(snapshot.imageMeta);
  d.setVisualType(snapshot.visualType);
  d.setImageDuration(snapshot.imageDuration);
  d.setImageClipCount(snapshot.imageClipCount);
  d.setFitMode(snapshot.fitMode);
  if (snapshot.ratioId) d.setRatioId?.(snapshot.ratioId);
  d.setSelectedFilterId(snapshot.selectedFilterId);
  d.setSelectedTransitionId(snapshot.selectedTransitionId);
  d.setStickerSegments(cloneItems(snapshot.stickerSegments));
  d.setTimelineMarkers?.(normalizeTimelineMarkers(snapshot.timelineMarkers));
  d.setSelectedStickerId(snapshot.selectedStickerId);
  d.setAudioSegments(snapshot.audioSegments.map((item) => ({
    ...item,
    url: item.blob ? getBlobUrl(item.blob) : item.url,
  })));
  d.setTimelineHorizon(snapshot.timelineHorizon);
  const musicUrl = getBlobUrl(snapshot.musicBlob) || snapshot.musicUrl;
  d.musicUrlRef.current = musicUrl;
  d.setMusicBlob(snapshot.musicBlob);
  d.setMusicSegments(cloneItems(snapshot.musicSegments));
  d.setMusicStart(Math.max(0, Number(snapshot.musicStart) || 0));
  d.setMusicUrl(musicUrl);
  d.setMusicName(snapshot.musicName);
  d.setMusicDuration(snapshot.musicDuration);
  d.setMusicPeaks(snapshot.musicPeaks);
  d.setMusicVolume(snapshot.musicVolume);
  const sourceAudioUrl = getBlobUrl(snapshot.sourceAudioBlob) || snapshot.sourceAudioUrl;
  d.sourceAudioUrlRef.current = sourceAudioUrl;
  d.setSourceAudioBlob(snapshot.sourceAudioBlob);
  d.setSourceAudioUrl(sourceAudioUrl);
  d.setSourceAudioName(snapshot.sourceAudioName);
  d.setSourceAudioDuration(snapshot.sourceAudioDuration);
  d.setSourceAudioPeaks(snapshot.sourceAudioPeaks);
  d.setSourceAudioVolume(snapshot.sourceAudioVolume);
  d.setSourceAudioStart(snapshot.sourceAudioStart);
  d.setSourceAudioAssetId(snapshot.sourceAudioAssetId || "");
  d.setSourceAudioLinked(snapshot.sourceAudioLinked !== false);
  d.setTrackVisibility({ ...snapshot.trackVisibility });
  d.setTrackLocks({ ...snapshot.trackLocks });
  d.setUserAssets(userAssets);
  d.setSelectedTrack(snapshot.selectedTrack);
  d.setSelectedSegmentId(snapshot.selectedSegmentId);
  d.setSelectedVisualSegmentId(snapshot.selectedVisualSegmentId);
  d.setSelectedVisualOverlayId(snapshot.selectedVisualOverlayId);
  d.setSelectedStickerSegmentId(snapshot.selectedStickerSegmentId);
  d.setSelectedAudioSegmentId(snapshot.selectedAudioSegmentId);
  d.setCurrentTime(snapshot.currentTime);
  d.setIsPlaying(false);
}

export function useEditorHistory(d) {
  // Playback and selection update the restore position, but do not change the
  // edit itself. Reuse the immutable content snapshot and its signature until
  // actual project state changes instead of cloning/serializing every clip on
  // each clock tick (including the background filmstrip/playback UI renders).
  const contentSnapshot = useMemo(() => createSnapshot({
    script: d.script,
    captionSegments: d.captionSegments,
    captionPosition: d.captionPosition,
    captionPlacement: d.captionPlacement,
    captionSize: d.captionSize,
    captionStyle: d.captionStyle,
    captionStylePresetId: d.captionStylePresetId,
    captionStylePresets: d.captionStylePresets,
    captionsEnabled: d.captionsEnabled,
    visualSegments: d.visualSegments,
    visualOverlaySegments: d.visualOverlaySegments,
    imageSrc: d.imageSrc,
    imageName: d.imageName,
    imageMeta: d.imageMeta,
    visualType: d.visualType,
    imageDuration: d.imageDuration,
    imageClipCount: d.imageClipCount,
    fitMode: d.fitMode,
    ratioId: d.ratioId,
    selectedFilterId: d.selectedFilterId,
    selectedTransitionId: d.selectedTransitionId,
    stickerSegments: d.stickerSegments,
    timelineMarkers: d.timelineMarkers,
    selectedStickerId: d.selectedStickerId,
    audioSegments: d.audioSegments,
    timelineHorizon: d.timelineHorizon,
    musicBlob: d.musicBlob,
    musicSegments: d.musicSegments,
    musicStart: d.musicStart,
    musicUrl: d.musicUrl,
    musicName: d.musicName,
    musicDuration: d.musicDuration,
    musicPeaks: d.musicPeaks,
    musicVolume: d.musicVolume,
    sourceAudioBlob: d.sourceAudioBlob,
    sourceAudioUrl: d.sourceAudioUrl,
    sourceAudioName: d.sourceAudioName,
    sourceAudioDuration: d.sourceAudioDuration,
    sourceAudioPeaks: d.sourceAudioPeaks,
    sourceAudioVolume: d.sourceAudioVolume,
    sourceAudioStart: d.sourceAudioStart,
    sourceAudioAssetId: d.sourceAudioAssetId,
    sourceAudioLinked: d.sourceAudioLinked,
    trackVisibility: d.trackVisibility,
    trackLocks: d.trackLocks,
    userAssets: d.userAssets,
  }), [
    d.script, d.captionSegments, d.captionPosition, d.captionPlacement,
    d.captionSize, d.captionStyle, d.captionStylePresetId, d.captionStylePresets,
    d.captionsEnabled, d.visualSegments, d.visualOverlaySegments, d.imageSrc,
    d.imageName, d.imageMeta, d.visualType, d.imageDuration, d.imageClipCount,
    d.fitMode, d.ratioId, d.selectedFilterId, d.selectedTransitionId, d.stickerSegments,
    d.timelineMarkers, d.selectedStickerId, d.audioSegments, d.timelineHorizon,
    d.musicBlob, d.musicSegments, d.musicStart, d.musicUrl, d.musicName,
    d.musicDuration, d.musicPeaks, d.musicVolume, d.sourceAudioBlob,
    d.sourceAudioUrl, d.sourceAudioName, d.sourceAudioDuration, d.sourceAudioPeaks,
    d.sourceAudioVolume, d.sourceAudioStart, d.sourceAudioAssetId,
    d.sourceAudioLinked, d.trackVisibility, d.trackLocks, d.userAssets,
  ]);
  const signature = useMemo(() => createEditorSnapshotSignature(contentSnapshot), [contentSnapshot]);
  const snapshot = {
    ...contentSnapshot,
    selectedTrack: d.selectedTrack,
    selectedSegmentId: d.selectedSegmentId,
    selectedVisualSegmentId: d.selectedVisualSegmentId,
    selectedVisualOverlayId: d.selectedVisualOverlayId,
    selectedStickerSegmentId: d.selectedStickerSegmentId,
    selectedAudioSegmentId: d.selectedAudioSegmentId,
    currentTime: d.currentTime,
  };
  const historyRef = useRef(null);
  const latestSnapshotRef = useRef(snapshot);
  const pendingRef = useRef(null);
  const timerRef = useRef(0);
  const restoredSignatureRef = useRef("");
  const checkpointNextRef = useRef(false);
  latestSnapshotRef.current = snapshot;
  if (!historyRef.current) historyRef.current = createEditorHistory(snapshot);

  const commitPending = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
    if (!pendingRef.current) return;
    historyRef.current = pushEditorHistory(historyRef.current, pendingRef.current, HISTORY_LIMIT);
    pendingRef.current = null;
  }, []);

  useEffect(() => {
    const latestSnapshot = latestSnapshotRef.current;
    if (restoredSignatureRef.current === signature) {
      restoredSignatureRef.current = "";
      historyRef.current = { ...historyRef.current, current: latestSnapshot };
      return;
    }
    const currentSignature = createEditorSnapshotSignature(historyRef.current.current);
    if (signature === currentSignature) return;
    pendingRef.current = latestSnapshot;
    window.clearTimeout(timerRef.current);
    if (checkpointNextRef.current) {
      checkpointNextRef.current = false;
      commitPending();
      return;
    }
    timerRef.current = window.setTimeout(commitPending, HISTORY_DEBOUNCE_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [commitPending, signature]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const undo = useCallback(() => {
    commitPending();
    const transition = undoEditorHistory(historyRef.current);
    if (!transition.changed) return void d.notify("没有可撤销的编辑操作");
    historyRef.current = transition.history;
    restoredSignatureRef.current = createEditorSnapshotSignature(transition.value);
    restoreSnapshot(transition.value, d);
    d.notify("已撤销上一步编辑");
  }, [commitPending, d]);

  const redo = useCallback(() => {
    commitPending();
    const transition = redoEditorHistory(historyRef.current);
    if (!transition.changed) return void d.notify("没有可重做的编辑操作");
    historyRef.current = transition.history;
    restoredSignatureRef.current = createEditorSnapshotSignature(transition.value);
    restoreSnapshot(transition.value, d);
    d.notify("已重做编辑");
  }, [commitPending, d]);

  useEffect(() => {
    const handleHistoryShortcut = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
      if (isTyping || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [redo, undo]);

  // Keep a reviewed batch edit separate from the edits immediately before and after it.
  const checkpoint = useCallback(() => {
    commitPending();
    const latest = latestSnapshotRef.current;
    if (createEditorSnapshotSignature(historyRef.current.current) !== createEditorSnapshotSignature(latest)) {
      historyRef.current = pushEditorHistory(historyRef.current, latest, HISTORY_LIMIT);
    }
    checkpointNextRef.current = true;
  }, [commitPending]);

  return { redo, undo, checkpoint, signature };
}
