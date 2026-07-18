import { decodeWaveform } from "./media.js";

export function createAssetDropActions(d) {
  async function applyAssetToTrack(asset, track, options = {}) {
    if (!d.canDropAssetOnTrack(asset, track)) {
      d.notify("请把素材拖到匹配的轨道");
      return;
    }
    d.setSelectedLibraryAssetId(asset.id);
    if (track === "sticker") {
      d.addStickerAssetToTimeline(asset, options);
      return;
    }
    if (track === "image") {
      d.appendVisualAssetToTimeline(asset);
      return;
    }
    if (track === "overlay") {
      d.addVisualOverlay?.(asset, options);
      return;
    }
    if (track === "music") {
      await d.selectAsset(asset);
      return;
    }
    if (track === "audio") {
      if (!asset.blob) {
        d.notify("当前音频素材不可用，请重新上传");
        return;
      }
      const decoded = asset.peaks?.length
        ? { duration: asset.duration, peaks: asset.peaks }
        : await decodeWaveform(asset.blob, 96);
      d.replaceAudio(asset.blob, decoded.duration, decoded.peaks, "音频已写入配音轨");
      d.setSelectedTrack("audio");
      d.setActiveTool("audio");
      d.notify("音频已拖入配音音频轨");
      return;
    }
    if (track === "source") {
      d.setSelectedTrack("source");
      d.setActiveTool("audio");
      await d.extractVideoSourceAudio(asset);
    }
  }

  function handleTrackAssetDrop(event, track) {
    const asset = d.getDraggedAsset(event);
    let targetTrack = asset?.type === "sticker" ? "sticker" : track;
    if (!d.canDropAssetOnTrack(asset, targetTrack)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = targetTrack === "sticker"
      ? d.trackScrollRef.current?.getBoundingClientRect() ??
        event.currentTarget.getBoundingClientRect()
      : event.currentTarget.getBoundingClientRect();
    const percent = d.getTimelineDropPercent(event.clientX, rect);
    d.draggedAssetIdRef.current = "";
    d.setDraggedAssetId("");
    d.setAssetDropTargetTrack("");
    d.setAssetDropPosition({ track: "", percent: 50 });
    d.triggerAssetDropPulse(targetTrack);
    const startTime = Number.isFinite(Number(event.currentTarget.dataset.dropStartTime)) ? Number(event.currentTarget.dataset.dropStartTime) : undefined;
    const layer = Number.isFinite(Number(event.currentTarget.dataset.dropLayer)) ? Number(event.currentTarget.dataset.dropLayer) : undefined;
    void applyAssetToTrack(asset, targetTrack, { percent, startTime, layer });
  }

  function handleVisualStyleDrop(event) {
    const payload = event.dataTransfer?.getData("application/x-timeline-visual-style") || "";
    const [kind, styleId] = payload.split(":");
    if (!styleId || (kind !== "effect" && kind !== "transition")) {
      handleTrackAssetDrop(event, "image");
      return;
    }
    const clip = event.target.closest?.("[data-timeline-segment-id]");
    const segmentId = clip?.dataset.timelineSegmentId;
    if (!segmentId) {
      d.notify("请将效果或转场拖到具体的画面片段上");
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    d.setVisualSegments((segments) => segments.map((segment) =>
      segment.id === segmentId
        ? { ...segment, [kind === "effect" ? "filterId" : "transitionId"]: styleId }
        : segment,
    ));
    d.setSelectedVisualSegmentId(segmentId);
    d.setSelectedTrack("image");
    if (kind === "effect") d.setSelectedFilterId(styleId);
    else d.setSelectedTransitionId(styleId);
    d.notify(kind === "effect" ? "效果已应用到该画面片段" : "转场已绑定到该片段的结尾");
  }

  return { applyAssetToTrack, handleTrackAssetDrop, handleVisualStyleDrop };
}
