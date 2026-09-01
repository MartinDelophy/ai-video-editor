import { decodeWaveform, extractVideoTrackFrames, getVideoTrackImportFrameBudget } from "./media.js";
import { getRemoteAssetBlob } from "./remoteAssetCache.js";
import { getVisualInsertionHover, resolveVisualInsertion } from "./visualDropInsertion.js";

function getRemoteVideoImportFrameBudget(duration) {
  const seconds = Math.max(0, Number(duration) || 0);
  const fastFirstPass = seconds > 300 ? 16 : seconds > 120 ? 24 : 48;
  return Math.min(fastFirstPass, getVideoTrackImportFrameBudget(seconds));
}

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
    } catch (error) {
      console.warn("Remote asset download failed", asset?.src || "", error);
      d.notify(tr("remoteAssetDownloadFailed", "在线素材下载失败，请稍后重试或打开来源页下载"));
      return null;
    }
  }

  async function applyAssetToTrack(asset, track, options = {}) {
    if (asset?.type === "audio" && asset.kind === "music") track = "music";
    if (!d.canDropAssetOnTrack(asset, track)) {
      d.notify(tr("assetTrackMismatch", "请把素材拖到匹配的轨道"));
      return;
    }
    const isRemoteVisual = (track === "image" || track === "overlay") && asset?.src && !asset.blob && /^https?:/i.test(asset.src);
    const hadVisualBefore = Boolean(d.visualSegments?.length);
    let pendingSegment = null;
    let progressBucket = -1;
    if (isRemoteVisual && track === "image") {
      pendingSegment = d.appendVisualAssetToTimeline({
        ...asset,
        preparing: true,
        prepareStage: "download",
        prepareProgress: 0,
      }, { message: tr("remoteAssetDownloading", "正在下载在线素材…"), insertIndex: options.insertIndex });
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
        d.updateVisualAssetInTimeline(asset.id, {
          ...asset,
          preparing: asset.type === "video",
          prepareStage: asset.type === "video" ? "prepare" : "",
          prepareProgress: asset.type === "video" ? 0.02 : 1,
        });
        if (asset.type === "video") {
          d.notify(tr("remoteAssetPreparing", "在线素材正在准备"));
          progressBucket = -1;
          let trackFrames = [];
          try {
            trackFrames = await extractVideoTrackFrames(asset.blob || asset.src, {
              duration: asset.duration,
              width: asset.width,
              height: asset.height,
              maxFrames: getRemoteVideoImportFrameBudget(asset.duration),
              // Browser-native seeking is slower per frame but remains PTS-
              // accurate for Wikimedia VP9/WebM files whose sparse WebCodecs
              // seeks can otherwise collapse the strip to repeated frames.
              preferNativeSeek: true,
              onProgress: (progress) => {
                const bucket = Math.round(Math.max(0, Math.min(1, progress || 0)) * 20) / 20;
                if (bucket === progressBucket) return;
                progressBucket = bucket;
                d.setVisualSegments((segments) => segments.map((segment) => segment.id === pendingSegment.id
                  ? { ...segment, prepareStage: "prepare", prepareProgress: bucket }
                  : segment));
              },
            });
          } catch (error) {
            console.warn("Remote video timeline frame extraction failed", error);
          }
          d.updateVisualAssetInTimeline(asset.id, {
            ...(trackFrames.length ? { trackFrames, trackFrameSampling: "exact-pts-hq-v5-seed" } : {}),
            preparing: false,
            prepareStage: "",
            prepareProgress: 1,
            timelineFrameError: !trackFrames.length,
          });
          return;
        }
      } else {
        d.appendVisualAssetToTimeline(asset, { insertIndex: options.insertIndex });
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
      const dropStart = Number.isFinite(Number(options.startTime))
        ? Number(options.startTime)
        : Number.isFinite(Number(options.percent)) && Number.isFinite(Number(d.timelineDuration))
          ? Math.max(0, Number(options.percent) / 100 * Number(d.timelineDuration))
          : undefined;
      d.replaceAudio(asset.blob, decoded.duration, decoded.peaks, "音频已写入配音轨", {
        sourceKind: "upload",
        assetId: asset.id,
        name: asset.name,
        start: dropStart,
      });
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
    const insertion = targetTrack === "image"
      ? resolveVisualInsertion({
          segments: d.visualSegments,
          percent,
          timelineDuration: d.timelineDuration,
          hover: getVisualInsertionHover(event.target, event.clientX),
        })
      : null;
    d.draggedAssetIdRef.current = "";
    d.setDraggedAssetId("");
    d.setAssetDropTargetTrack("");
    d.setAssetDropPosition({ track: "", percent: 50 });
    d.triggerAssetDropPulse(targetTrack);
    const startTime = targetTrack === "overlay"
      ? Math.max(0, percent / 100 * Math.max(0, Number(d.timelineDuration) || 0))
      : Number.isFinite(Number(event.currentTarget.dataset.dropStartTime)) ? Number(event.currentTarget.dataset.dropStartTime) : undefined;
    const layer = Number.isFinite(Number(event.currentTarget.dataset.dropLayer)) ? Number(event.currentTarget.dataset.dropLayer) : undefined;
    void applyAssetToTrack(asset, targetTrack, { percent, startTime, layer, insertIndex: insertion?.index });
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
