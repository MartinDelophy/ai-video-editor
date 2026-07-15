import {
  MAX_TIMELINE_DURATION_SECONDS,
  MIN_VISUAL_SEGMENT_SECONDS,
} from "../config/editor.js";
import {
  createVisualSegment,
  estimateDuration,
  getImageThumbnailCount,
  getVisualSegmentsTotal,
} from "./timeline.js";
import { getTimelineAutoFitZoom } from "./timelineScale.js";

export function createVisualTimelineActions(d) {
  function fitTimelineToVideo(duration) {
    if (typeof d.setTimelineZoom !== "function") return;
    d.setTimelineZoom(getTimelineAutoFitZoom(duration));
  }

  function getVisualDurationForAsset(asset, fallbackDuration = 4) {
    if (asset?.type === "video" && asset.duration) {
      return Math.min(
        MAX_TIMELINE_DURATION_SECONDS,
        Math.max(MIN_VISUAL_SEGMENT_SECONDS, asset.duration),
      );
    }
    return Math.min(
      MAX_TIMELINE_DURATION_SECONDS,
      Math.max(MIN_VISUAL_SEGMENT_SECONDS, asset?.duration || fallbackDuration),
    );
  }

  function getCurrentVisualAssetSnapshot() {
    return {
      id: d.previewVisualSegment?.assetId || "",
      assetId: d.previewVisualSegment?.assetId || "",
      type: d.previewVisualSegment?.type || d.visualType,
      src: d.previewVisualSegment?.src || d.imageSrc,
      name: d.previewVisualSegment?.name || d.imageName,
      meta: d.previewVisualSegment?.meta || d.imageMeta,
      blob: d.previewVisualSegment?.blob || null,
      width: d.previewVisualSegment?.width || 0,
      height: d.previewVisualSegment?.height || 0,
      sourceStart: Math.max(0, Number(d.previewVisualSegment?.sourceStart) || 0),
      sourceDuration: Math.max(0, Number(d.previewVisualSegment?.sourceDuration) || 0),
      playbackRate: Math.max(0.25, Math.min(4, Number(d.previewVisualSegment?.playbackRate) || 1)),
      trackFrames: d.previewVisualSegment?.trackFrames || [],
    };
  }

  function setCurrentVisualAsset(asset) {
    d.setImageSrc(asset?.src ?? "");
    d.setImageName(asset?.name ?? "");
    d.setImageMeta(asset?.meta ?? "");
    d.setVisualType(asset?.type ?? "image");
  }

  function commitVisualSegments(nextSegments, message, selectedIndex = 0) {
    const normalizedSegments = nextSegments
      .filter((segment) => segment.duration > 0.05)
      .map((segment) => ({
        ...segment,
        duration: Math.max(
          MIN_VISUAL_SEGMENT_SECONDS,
          Math.min(MAX_TIMELINE_DURATION_SECONDS, segment.duration),
        ),
      }));
    const nextDuration = Math.min(
      MAX_TIMELINE_DURATION_SECONDS,
      getVisualSegmentsTotal(normalizedSegments),
    );
    d.setVisualSegments(normalizedSegments);
    d.setImageDuration(nextDuration);
    d.setImageClipCount(getImageThumbnailCount(nextDuration));
    d.setSelectedTrack("image");
    const selectedSegment = normalizedSegments.length
      ? normalizedSegments[Math.min(Math.max(0, selectedIndex), normalizedSegments.length - 1)]
      : null;
    d.setSelectedVisualSegmentId(selectedSegment?.id ?? "");
    if (selectedSegment?.src) setCurrentVisualAsset(selectedSegment);
    d.setCurrentTime((time) => Math.min(
      time,
      Math.max(nextDuration, d.captionDuration, estimateDuration(d.script)),
    ));
    d.notify(message);
  }

  function replaceVisualTimeline(asset, duration = getVisualDurationForAsset(asset)) {
    const segment = createVisualSegment(duration, asset);
    d.setFitMode("contain");
    setCurrentVisualAsset(asset);
    d.setVisualSegments([segment]);
    d.setSelectedVisualSegmentId(segment.id);
    d.setImageDuration(segment.duration);
    d.setImageClipCount(getImageThumbnailCount(segment.duration));
    if (asset?.type === "video") fitTimelineToVideo(segment.duration);
  }

  function appendVisualAssetToTimeline(asset) {
    if (d.trackLocks.image) {
      d.notify("图片轨已锁定，无法添加素材");
      return;
    }
    const sourceSegments = d.visualSegments.length
      ? d.visualSegments
      : d.imageSrc
        ? [createVisualSegment(d.imageDuration || 4, getCurrentVisualAssetSnapshot())]
        : [];
    const totalDuration = getVisualSegmentsTotal(sourceSegments);
    const availableDuration = MAX_TIMELINE_DURATION_SECONDS - totalDuration;
    if (availableDuration < MIN_VISUAL_SEGMENT_SECONDS) {
      d.notify("视觉轨道已经达到 30 分钟上限");
      return;
    }
    const segmentDuration = Math.min(getVisualDurationForAsset(asset), availableDuration);
    const nextSegment = createVisualSegment(segmentDuration, asset);
    d.setFitMode("contain");
    setCurrentVisualAsset(asset);
    commitVisualSegments(
      [...sourceSegments, nextSegment],
      `${asset.type === "video" ? "视频" : "图片"}素材已追加到图片轨`,
      sourceSegments.length,
    );
    if (asset.type === "video") fitTimelineToVideo(totalDuration + segmentDuration);
    d.seekTo(totalDuration);
    if (asset.type === "video") d.extractVideoSourceAudio(asset, totalDuration);
  }

  function updateVisualAssetInTimeline(assetId, updates) {
    if (!assetId) return;
    d.setVisualSegments((segments) => {
      const matchingSegment = segments.find((segment) => segment.assetId === assetId);
      const nextSegments = segments.map((segment) =>
        segment.assetId === assetId
          ? {
              ...segment,
              ...updates,
              sourceDuration: updates.duration && segment.type === "video"
                ? Math.max(0, Number(updates.duration) || 0)
                : segment.sourceDuration,
              duration: updates.duration
                ? Math.max(
                    MIN_VISUAL_SEGMENT_SECONDS,
                    Math.min(MAX_TIMELINE_DURATION_SECONDS, updates.duration / Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1))),
                  )
                : segment.duration,
            }
          : segment,
      );
      const nextDuration = getVisualSegmentsTotal(nextSegments);
      d.setImageDuration(nextDuration);
      d.setImageClipCount(getImageThumbnailCount(nextDuration));
      if (matchingSegment?.type === "video" && updates.duration) {
        fitTimelineToVideo(nextDuration);
      }
      return nextSegments;
    });
    if (d.previewVisualSegment?.assetId === assetId || d.previewVisualSegment?.src === updates.src) {
      d.setImageMeta(updates.meta ?? d.imageMeta);
      if (updates.type) d.setVisualType(updates.type);
    }
  }

  function clearImageTrack(message = "图片素材已从时间线移除") {
    const remainingDuration = Math.max(
      d.audioBlob ? d.audioDuration : 0,
      d.captionDuration,
      d.sourceAudioBlob ? d.sourceAudioStart + d.sourceAudioDuration : 0,
      d.musicBlob ? d.musicDuration : 0,
      estimateDuration(d.script),
    );
    d.setImageSrc("");
    d.setImageName("");
    d.setImageMeta("");
    d.setVisualType("image");
    d.setImageClipCount(0);
    d.setImageDuration(0);
    d.setVisualSegments([]);
    d.setSelectedVisualSegmentId("");
    d.setCurrentTime((time) => Math.min(time, remainingDuration));
    d.setSelectedTrack("image");
    d.notify(message);
  }

  return {
    appendVisualAssetToTimeline,
    clearImageTrack,
    commitVisualSegments,
    getCurrentVisualAssetSnapshot,
    getVisualDurationForAsset,
    replaceVisualTimeline,
    setCurrentVisualAsset,
    updateVisualAssetInTimeline,
  };
}
