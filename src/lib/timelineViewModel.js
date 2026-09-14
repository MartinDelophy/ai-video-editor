import { useMemo } from "react";

import {
  getCaptionTimeline,
  getVisualAssetPayload,
  getVisualSegmentTimeline,
  reorderTimelineItems,
} from "./timeline.js";

export function shouldShowStickerTrack({ stickerSegments = [], assetDropTargetTrack = "", assetDragPreview = null, draggedAsset = null } = {}) {
  return stickerSegments.length > 0 || assetDropTargetTrack === "sticker" || assetDragPreview?.type === "sticker" || draggedAsset?.type === "sticker";
}

export function useTimelineViewModel(d) {
  const getCurrentVisualAssetSnapshot = d.getCurrentVisualAssetSnapshot;
  const progressPercent = Math.max(0, Math.min(100, d.progress));
  const playheadPercent = Math.max(
    0,
    Math.min(100, ((d.currentTime || 0) / Math.max(d.timelineDuration, 1)) * 100),
  );
  const previewRatio = `${d.ratio.width} / ${d.ratio.height}`;
  const renderedVisualSegments = useMemo(() => d.imageSrc
    ? d.visualSegments.length
      ? d.visualSegments
      : [{
          id: "visual-fallback",
          duration: d.imageDuration,
          ...getVisualAssetPayload(getCurrentVisualAssetSnapshot()),
        }]
    : [], [getCurrentVisualAssetSnapshot, d.imageDuration, d.imageSrc, d.visualSegments]);
  const activeTimelineClipDrag = d.timelineClipDrag?.dragging ? d.timelineClipDrag : null;
  const draggedAsset = d.draggedAssetId ? d.findAssetById(d.draggedAssetId) : null;
  const showStickerTrack = shouldShowStickerTrack({
    stickerSegments: d.stickerSegments,
    assetDropTargetTrack: d.assetDropTargetTrack,
    assetDragPreview: d.assetDragPreview,
    draggedAsset,
  });
  const displayedVisualSegments = useMemo(() => activeTimelineClipDrag?.track === "image" && activeTimelineClipDrag.mode !== "overlay"
    ? reorderTimelineItems(
        renderedVisualSegments,
        activeTimelineClipDrag.fromIndex,
        activeTimelineClipDrag.overIndex,
      )
    : renderedVisualSegments, [activeTimelineClipDrag?.fromIndex, activeTimelineClipDrag?.mode, activeTimelineClipDrag?.overIndex, activeTimelineClipDrag?.track, renderedVisualSegments]);
  // The playback clock never changes clip ranges. Stable references also keep
  // downstream lane packing, selection geometry and filmstrip effects cached.
  const renderedVisualTimeline = useMemo(
    () => getVisualSegmentTimeline(displayedVisualSegments),
    [displayedVisualSegments],
  );
  const displayedCaptionSegments = useMemo(() => activeTimelineClipDrag?.track === "caption"
    ? activeTimelineClipDrag.mode === "move" || activeTimelineClipDrag.mode?.startsWith("resize-")
      ? activeTimelineClipDrag.previewSegments
      : reorderTimelineItems(
          d.captionSegments,
          activeTimelineClipDrag.fromIndex,
          activeTimelineClipDrag.overIndex,
        )
    : d.captionSegments, [activeTimelineClipDrag?.fromIndex, activeTimelineClipDrag?.mode, activeTimelineClipDrag?.overIndex, activeTimelineClipDrag?.previewSegments, activeTimelineClipDrag?.track, d.captionSegments]);
  const displayedCaptionTimeline = useMemo(() => activeTimelineClipDrag?.track === "caption"
    ? getCaptionTimeline(displayedCaptionSegments, d.captionTargetDuration)
    : d.captionTimeline, [activeTimelineClipDrag?.track, d.captionTargetDuration, d.captionTimeline, displayedCaptionSegments]);
  const audioClipPercent = d.audioBlob && d.timelineDuration > 0
    ? Math.max(0.01, Math.min(100, (d.audioDuration / d.timelineDuration) * 100))
    : 0;
  const sourceAudioStartPercent = d.sourceAudioBlob && d.timelineDuration > 0
    ? Math.max(0, Math.min(100, (d.sourceAudioStart / d.timelineDuration) * 100))
    : 0;
  const sourceAudioClipPercent = d.sourceAudioBlob && d.timelineDuration > 0
    ? Math.max(
        0.01,
        Math.min(
          100 - sourceAudioStartPercent,
          (d.sourceAudioDuration / d.timelineDuration) * 100,
        ),
      )
    : 0;
  const musicClipPercent = d.musicBlob && d.timelineDuration > 0
    ? Math.max(0.01, Math.min(100, (d.musicDuration / d.timelineDuration) * 100))
    : 0;
  const musicStartPercent = d.musicBlob && d.timelineDuration > 0
    ? Math.max(0, Math.min(100, (d.musicStart / d.timelineDuration) * 100))
    : 0;
  const exportPercent = Math.max(0, Math.min(100, Math.round(d.exportProgress)));
  const previewFrameStyle = useMemo(() => d.previewFrameSize.width > 0 && d.previewFrameSize.height > 0
    ? {
        "--preview-ratio": previewRatio,
        width: `${d.previewFrameSize.width}px`,
        height: `${d.previewFrameSize.height}px`,
      }
    : { "--preview-ratio": previewRatio }, [d.previewFrameSize.height, d.previewFrameSize.width, previewRatio]);

  return {
    activeTimelineClipDrag, audioClipPercent, displayedCaptionSegments,
    displayedCaptionTimeline, displayedVisualSegments, exportPercent, musicClipPercent,
    musicStartPercent, playheadPercent, previewFrameStyle, previewRatio, progressPercent,
    renderedVisualSegments, renderedVisualTimeline, showStickerTrack,
    sourceAudioClipPercent, sourceAudioStartPercent,
  };
}
