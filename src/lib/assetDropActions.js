import { decodeWaveform, extractVideoTrackFrames } from "./media.js";
import { getRemoteAssetBlob } from "./remoteAssetCache.js";

export function createAssetDropActions(d) {
  const tr = (key, fallback) => d.t?.(key, fallback) ?? fallback;
  async function resolveRemoteAsset(asset, onProgress) {
    if (!asset?.src || asset.blob || !/^https?:/i.test(asset.src)) return asset;
    try {
      d.notify(tr("remoteAssetDownloading", "正在下载在线素材…"));
      const blob = await getRemoteAssetBlob(asset, (progress) => {
        d.onRemoteAssetProgress?.(asset.id, progress);
        onProgress?.(progress);
      });
      if (!blob) throw new Error("Missing remote asset");
      const src = URL.createObjectURL(blob);
      d.imageUrlRefs?.current?.add(src);
      return { ...asset, src, blob, remoteSrc: asset.src };
    } catch {
      d.notify(tr("remoteAssetDownloadFailed", "在线素材下载失败，请稍后重试或打开来源页下载"));
      return null;
    }
  }

  async function applyAssetToTrack(asset, track, options = {}) {
    if (!d.canDropAssetOnTrack(asset, track)) {
      d.notify(tr("assetTrackMismatch", "请把素材拖到匹配的轨道"));
      return;
    }
    const isRemoteVisual = (track === "image" || track === "overlay") && asset?.src && !asset.blob && /^https?:/i.test(asset.src);
    const hadVisualBefore = Boolean(d.visualSegments?.length);
    let pendingSegment = null;
    let progressBucket = -1;
    if (isRemoteVisual && track === "image") {
      pendingSegment = d.appendVisualAssetToTimeline({ ...asset, preparing: true, prepareProgress: 0 }, { message: tr("remoteAssetPreparing", "在线素材正在准备") });
      d.onFirstVisualDropped?.();
    }
    asset = await resolveRemoteAsset(asset, pendingSegment ? (progress) => {
      const bucket = Math.round(Math.max(0, Math.min(1, progress || 0)) * 20) / 20;
      if (bucket === progressBucket) return;
      progressBucket = bucket;
      d.setVisualSegments((segments) => segments.map((segment) => segment.id === pendingSegment.id ? { ...segment, prepareProgress: bucket } : segment));
    } : undefined);
    if (!asset) {
      if (pendingSegment) {
        if (hadVisualBefore) d.setVisualSegments((segments) => segments.filter((segment) => segment.id !== pendingSegment.id));
        else d.clearImageTrack?.(tr("remoteAssetRemovedAfterFailure", "在线素材下载失败，已移除临时片段"));
      }
      return;
    }
    d.setSelectedLibraryAssetId(asset.id);
    if (track === "sticker") {
      d.addStickerAssetToTimeline(asset, options);
      return;
    }
    if (track === "image") {
      if (pendingSegment) {
        d.updateVisualAssetInTimeline(asset.id, { ...asset, preparing: false, prepareProgress: 1 });
        if (asset.type === "video") {
          extractVideoTrackFrames(asset.src, { duration: asset.duration, width: asset.width, height: asset.height })
            .then((trackFrames) => { if (trackFrames.length) d.updateVisualAssetInTimeline(asset.id, { trackFrames }); })
            .catch((error) => console.warn("Remote video timeline frame extraction failed", error));
        }
      } else {
        d.appendVisualAssetToTimeline(asset);
        d.onFirstVisualDropped?.();
      }
      return;
    }
    if (track === "overlay") {
      d.addVisualOverlay?.(asset, options);
      d.onFirstVisualDropped?.();
      return;
    }
    if (track === "music") {
      await d.selectAsset(asset, { focusAudio: false });
      return;
    }
    if (track === "audio") {
      if (!asset.blob) {
        d.notify(tr("audioAssetUnavailable", "当前音频素材不可用，请重新上传"));
        return;
      }
      const hasValidDuration = Number.isFinite(Number(asset.duration)) && Number(asset.duration) > 0;
      const decoded = asset.peaks?.length && hasValidDuration
        ? { duration: Number(asset.duration), peaks: asset.peaks }
        : await decodeWaveform(asset.blob, 96);
      d.replaceAudio(asset.blob, decoded.duration, decoded.peaks, "音频已写入配音轨");
      d.setSelectedTrack("audio");
      d.notify(tr("audioDroppedOnVoiceTrack", "音频已拖入配音音频轨"));
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
