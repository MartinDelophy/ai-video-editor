import {
  getCaptionTimeline,
  getVisualAssetPayload,
  getVisualSegmentTimeline,
  reorderTimelineItems,
} from "./timeline.js";

export function createTimelineViewModel(d) {
  const progressPercent = Math.max(0, Math.min(100, d.progress));
  const playheadPercent = Math.max(
    0,
    Math.min(100, ((d.currentTime || 0) / Math.max(d.timelineDuration, 1)) * 100),
  );
  const previewRatio = `${d.ratio.width} / ${d.ratio.height}`;
  const renderedVisualSegments = d.imageSrc
    ? d.visualSegments.length
      ? d.visualSegments
      : [{
          id: "visual-fallback",
          duration: d.imageDuration,
          ...getVisualAssetPayload(d.getCurrentVisualAssetSnapshot()),
        }]
    : [];
  const activeTimelineClipDrag = d.timelineClipDrag?.dragging ? d.timelineClipDrag : null;
  const draggedAsset = d.draggedAssetId ? d.findAssetById(d.draggedAssetId) : null;
  const showStickerTrack =
    d.stickerSegments.length > 0 ||
    d.selectedTrack === "sticker" ||
    d.assetDropTargetTrack === "sticker" ||
    d.assetDragPreview?.type === "sticker" ||
    draggedAsset?.type === "sticker";
  const displayedVisualSegments = activeTimelineClipDrag?.track === "image"
    ? reorderTimelineItems(
        renderedVisualSegments,
        activeTimelineClipDrag.fromIndex,
        activeTimelineClipDrag.overIndex,
      )
    : renderedVisualSegments;
  const renderedVisualTimeline = getVisualSegmentTimeline(displayedVisualSegments);
  const displayedCaptionSegments = activeTimelineClipDrag?.track === "caption"
    ? activeTimelineClipDrag.mode === "move"
      ? activeTimelineClipDrag.previewSegments
      : reorderTimelineItems(
          d.captionSegments,
          activeTimelineClipDrag.fromIndex,
          activeTimelineClipDrag.overIndex,
        )
    : d.captionSegments;
  const displayedCaptionTimeline = activeTimelineClipDrag?.track === "caption"
    ? getCaptionTimeline(displayedCaptionSegments, d.captionTargetDuration)
    : d.captionTimeline;
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
  const previewFrameStyle = d.previewFrameSize.width > 0 && d.previewFrameSize.height > 0
    ? {
        "--preview-ratio": previewRatio,
        width: `${d.previewFrameSize.width}px`,
        height: `${d.previewFrameSize.height}px`,
      }
    : { "--preview-ratio": previewRatio };

  return {
    activeTimelineClipDrag, audioClipPercent, displayedCaptionSegments,
    displayedCaptionTimeline, displayedVisualSegments, exportPercent, musicClipPercent,
    musicStartPercent, playheadPercent, previewFrameStyle, previewRatio, progressPercent,
    renderedVisualSegments, renderedVisualTimeline, showStickerTrack,
    sourceAudioClipPercent, sourceAudioStartPercent,
  };
}
