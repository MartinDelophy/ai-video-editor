import { reconcileVisualAssociations } from "./visualAssociations.js";
import {
  MAX_TIMELINE_DURATION_SECONDS,
  MIN_VISUAL_SEGMENT_SECONDS,
} from "../config/editor.js";
import {
  createVisualSegment,
  ensureUniqueVisualSegmentIds,
  estimateDuration,
  getImageThumbnailCount,
  getVisualSegmentsTotal,
} from "./timeline.js";

export function createVisualTimelineActions(d) {
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
      generatedBy: d.previewVisualSegment?.generatedBy || "",
      generationMetadata: d.previewVisualSegment?.generationMetadata,
    };
  }

  function setCurrentVisualAsset(asset) {
    d.setImageSrc(asset?.src ?? "");
    d.setImageName(asset?.name ?? "");
    d.setImageMeta(asset?.meta ?? "");
    d.setVisualType(asset?.type ?? "image");
  }

  function reconcileOwnedContent(next, deletedIds = []) {
    const state = { trackLocks: d.trackLocks, audioSegments: d.audioSegments || [], captionSegments: d.captionSegments || [], stickerSegments: d.stickerSegments || [] };
    reconcileVisualAssociations(state, d.visualSegments || [], next, deletedIds);
    if (state.script !== undefined) d.setScript?.(state.script);
    for (const [key, setter] of [["audioSegments", d.setAudioSegments], ["captionSegments", d.setCaptionSegments], ["stickerSegments", d.setStickerSegments]]) {
      const before = new Map((d[key] || []).map(segment => [segment.id, segment]));
      const after = new Map(state[key].map(segment => [segment.id, segment]));
      setter?.(items => items.flatMap(segment => {
        if (!before.has(segment.id)) return [segment];
        if (!after.has(segment.id)) return [];
        return [after.get(segment.id) !== before.get(segment.id) ? after.get(segment.id) : segment];
      }));
    }
  }

  function commitVisualSegments(nextSegments, message, selectedIndex = 0, deletedIds = []) {
    const normalizedSegments = ensureUniqueVisualSegmentIds(nextSegments
      .filter((segment) => segment.duration > 0.05)
      .map((segment) => ({
        ...segment,
        duration: Math.max(
          MIN_VISUAL_SEGMENT_SECONDS,
          Math.min(MAX_TIMELINE_DURATION_SECONDS, segment.duration),
        ),
      }))).segments;
    const nextDuration = Math.min(
      MAX_TIMELINE_DURATION_SECONDS,
      getVisualSegmentsTotal(normalizedSegments),
    );
    reconcileOwnedContent(normalizedSegments, deletedIds);
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
  }

  function appendVisualAssetToTimeline(asset, options = {}) {
    if (d.trackLocks.image) {
      d.notify("图片轨已锁定，无法添加素材");
      return null;
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
      return null;
    }
    const segmentDuration = Math.min(getVisualDurationForAsset(asset), availableDuration);
    const nextSegment = createVisualSegment(segmentDuration, asset);
    const requestedInsertIndex = Number(options.insertIndex);
    const insertIndex = Number.isInteger(requestedInsertIndex)
      ? Math.max(0, Math.min(sourceSegments.length, requestedInsertIndex))
      : sourceSegments.length;
    const insertionTime = getVisualSegmentsTotal(sourceSegments.slice(0, insertIndex));
    const nextSegments = [...sourceSegments];
    nextSegments.splice(insertIndex, 0, nextSegment);
    d.setFitMode("contain");
    setCurrentVisualAsset(asset);
    commitVisualSegments(
      nextSegments,
      options.message ?? `${asset.type === "video" ? "视频" : "图片"}素材已${insertIndex < sourceSegments.length ? "插入" : "追加"}到图片轨`,
      insertIndex,
    );
    d.rippleTimelineAfter?.(insertionTime, nextSegment.duration);
    d.seekTo(insertionTime);
    return nextSegment;
  }

  function updateVisualAssetInTimeline(assetId, updates) {
    if (!assetId) return;
    d.setVisualSegments((segments) => {
      const {
        id: _assetRecordId,
        assetId: _updatedAssetId,
        duration: updatedMediaDuration,
        sourceStart: _updatedSourceStart,
        sourceDuration: _updatedSourceDuration,
        ...mediaUpdates
      } = updates;
      const nextSegments = ensureUniqueVisualSegmentIds(segments.map((segment) => {
        if (segment.assetId !== assetId && !(updates.src && segment.src === updates.src)) return segment;
        const shouldAdoptMediaDuration = Boolean(
          updatedMediaDuration && (
            segment.preparing ||
            (segment.type === "video" && !Number(segment.sourceDuration) && !Number(segment.sourceStart))
          ),
        );
        const playbackRate = Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1));
        return {
          ...segment,
          ...mediaUpdates,
          id: segment.id,
          assetId: segment.assetId || assetId,
          sourceStart: Math.max(0, Number(segment.sourceStart) || 0),
          sourceDuration: shouldAdoptMediaDuration
            ? Math.max(0, Number(updatedMediaDuration) || 0)
            : segment.sourceDuration,
          duration: shouldAdoptMediaDuration
            ? Math.max(
                MIN_VISUAL_SEGMENT_SECONDS,
                Math.min(MAX_TIMELINE_DURATION_SECONDS, updatedMediaDuration / playbackRate),
              )
            : segment.duration,
        };
      })).segments;
      const nextDuration = getVisualSegmentsTotal(nextSegments);
      d.setImageDuration(nextDuration);
      d.setImageClipCount(getImageThumbnailCount(nextDuration));
      return nextSegments;
    });
    if (d.previewVisualSegment?.assetId === assetId || d.previewVisualSegment?.src === updates.src) {
      d.setImageMeta(updates.meta ?? d.imageMeta);
      if (updates.type) d.setVisualType(updates.type);
      if (updates.src) d.setImageSrc(updates.src);
    }
  }

  function clearImageTrack(message = "图片素材已从时间线移除", deletedIds = []) {
    if (deletedIds.length) reconcileOwnedContent([], deletedIds);
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
    reconcileOwnedContent,
    getCurrentVisualAssetSnapshot,
    getVisualDurationForAsset,
    replaceVisualTimeline,
    setCurrentVisualAsset,
    updateVisualAssetInTimeline,
  };
}
