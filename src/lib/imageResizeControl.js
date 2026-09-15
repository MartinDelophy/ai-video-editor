import {
  IMAGE_SNAP_THRESHOLD_PIXELS, MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS,
} from "../config/editor.js";
import { createVisualSegment, estimateDuration, getImageThumbnailCount, getVisualSegmentsTotal } from "./timeline.js";
import { createTimelineSnapGuide } from "./timelineSnap.js";
import { normalizeTimelineMarkers } from "./timelineMarkers.js";
import {
  createTimelineEdgeAutoScroller,
  getTimelineActiveDragHorizon,
  getTimelineDragTimeDelta,
  settleTimelineDrag,
} from "./timelineEdgeAutoScroll.js";

export function createImageResizeControl(d) {
  return function startImageResize(event, segmentId = "", segmentIndex = -1, edge = "end") {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    if (d.trackLocks.image) return void d.notify("图片轨已锁定，无法拉长片段");
    if (!d.imageSrc || d.timelineDuration <= 0) return void d.notify("请先上传或选择图片/视频素材");
    d.setSelectedTrack("image");
    const segments = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 4, d.getCurrentVisualAssetSnapshot())];
    const startDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, d.imageDuration);
    const timelineDuration = Math.max(10, startDuration, d.timelineDurationRef.current || d.timelineDuration);
    let apply = () => {};
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: d.trackScrollRef.current,
      pointerType: event.pointerType,
      timelineDuration,
      onScrollFrame: (clientX, scrollOffset) => apply(clientX, scrollOffset),
    });
    const rect = d.trackScrollRef.current?.getBoundingClientRect();
    if (!rect) { autoScroller.stop(); return; }
    const idIndex = segments.findIndex((segment) => segment.id === segmentId);
    const index = idIndex >= 0 ? idIndex : segmentIndex >= 0 && segmentIndex < segments.length ? segmentIndex : Math.max(0, segments.length - 1);
    const resizeId = segments[index]?.id ?? "";
    const before = getVisualSegmentsTotal(segments.slice(0, index));
    const after = getVisualSegmentsTotal(segments.slice(index + 1));
    const originalDuration = segments[index]?.duration || 0;
    const isStartEdge = edge === "start" && index > 0;
    const previous = isStartEdge ? segments[index - 1] : null;
    const previousStart = isStartEdge ? getVisualSegmentsTotal(segments.slice(0, index - 1)) : 0;
    const previousDuration = previous?.duration || 0;
    let finalDuration = originalDuration;
    d.setSelectedVisualSegmentId(resizeId);
    const snapPoints = [
      d.audioBlob && d.audioDuration > 0 ? { time: Math.min(MAX_TIMELINE_DURATION_SECONDS, d.audioDuration), label: "配音结尾" } : null,
      d.sourceAudioBlob && d.sourceAudioDuration > 0 ? { time: Math.min(MAX_TIMELINE_DURATION_SECONDS, d.sourceAudioStart + d.sourceAudioDuration), label: "原声结尾" } : null,
      d.musicBlob && d.musicDuration > 0 ? { time: Math.min(MAX_TIMELINE_DURATION_SECONDS, (d.musicStart || 0) + d.musicDuration), label: "音乐结尾" } : null,
      ...normalizeTimelineMarkers(d.timelineMarkers).flatMap((marker) => [
        { time: marker.time, track: "marker", id: marker.id, edge: "start" },
        ...(marker.type === "range" ? [{ time: marker.endTime, track: "marker", id: marker.id, edge: "end" }] : []),
      ]),
    ].filter(Boolean);
    let activeLabel = "";
    let editingStarted = false;
    let moved = false;
    apply = (clientX, scrollOffset = autoScroller.getScrollOffset()) => {
      if (!editingStarted && moved) {
        editingStarted = true;
        d.pauseForTimelineEdit?.();
      }
      const dragClientX = autoScroller.getDragClientX(clientX);
      const pointerX = dragClientX - rect.left + scrollOffset;
      const raw = getTimelineDragTimeDelta({
        clientX: dragClientX, startX: rect.left, scrollOffset, contentWidth: rect.width, timelineDuration,
      });
      const clamped = Math.max(0.5, Math.min(MAX_TIMELINE_DURATION_SECONDS, raw));
      const snap = snapPoints.map((point) => ({ ...point, distance: Math.abs(pointerX - (point.time / timelineDuration) * rect.width) }))
        .filter((point) => point.distance <= IMAGE_SNAP_THRESHOLD_PIXELS).sort((a, b) => a.distance - b.distance)[0] ?? null;
      const target = snap?.time ?? clamped;
      if (isStartEdge) {
        let minimumBoundary = previousStart + MIN_VISUAL_SEGMENT_SECONDS;
        let maximumBoundary = before + originalDuration - MIN_VISUAL_SEGMENT_SECONDS;
        const currentRate = Math.max(0.25, Math.min(4, Number(segments[index]?.playbackRate) || 1));
        const previousRate = Math.max(0.25, Math.min(4, Number(previous?.playbackRate) || 1));
        if (segments[index]?.type === "video") {
          minimumBoundary = Math.max(minimumBoundary, before - (Number(segments[index].sourceStart) || 0) / currentRate);
        }
        if (previous?.type === "video") {
          const sourceEnd = (Number(previous.sourceStart) || 0) + (Number(previous.sourceDuration) || previousDuration * previousRate);
          const sourceLimit = Math.max(sourceEnd, Number(previous.trackFrameDuration) || sourceEnd);
          maximumBoundary = Math.min(maximumBoundary, before + (sourceLimit - sourceEnd) / previousRate);
        }
        const boundary = Math.max(minimumBoundary, Math.min(maximumBoundary, target));
        const delta = boundary - before;
        const next = segments.map((segment, position) => {
          if (position === index - 1) {
            const duration = previousDuration + delta;
            return {
              ...segment,
              duration,
              ...(segment.type === "video" ? { sourceDuration: Math.max(0, (Number(segment.sourceDuration) || previousDuration * previousRate) + delta * previousRate) } : {}),
            };
          }
          if (position !== index) return segment;
          const duration = originalDuration - delta;
          return {
            ...segment,
            duration,
            ...(segment.type === "video" ? {
              sourceStart: Math.max(0, (Number(segment.sourceStart) || 0) + delta * currentRate),
              sourceDuration: Math.max(0, (Number(segment.sourceDuration) || originalDuration * currentRate) - delta * currentRate),
            } : {}),
          };
        });
        activeLabel = snap?.label ?? "";
        d.setSnapGuide(createTimelineSnapGuide(snap || { time: boundary }, "start"));
        d.setVisualSegments(next);
        d.setImageDuration(getVisualSegmentsTotal(next));
        d.setImageClipCount(getImageThumbnailCount(getVisualSegmentsTotal(next)));
        return;
      }
      const maxDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS - before - after);
      const resized = Math.min(maxDuration, Math.max(MIN_VISUAL_SEGMENT_SECONDS, target - before));
      finalDuration = resized;
      const next = segments.map((segment, position) => position === index ? {
        ...segment,
        duration: resized,
        ...(segment.type === "video" ? { sourceDuration: resized * Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1)) } : {}),
      } : segment);
      const visualDuration = getVisualSegmentsTotal(next);
      const projectDuration = Math.max(d.audioBlob ? d.audioDuration : 0, d.captionDuration,
        d.sourceAudioBlob ? d.sourceAudioStart + d.sourceAudioDuration : 0,
        d.musicBlob ? d.musicDuration : 0, estimateDuration(d.script), visualDuration);
      activeLabel = snap?.label ?? ""; d.setSnapGuide(createTimelineSnapGuide(snap, "end")); d.setVisualSegments(next);
      if (moved) {
        d.setTimelineHorizon((value) => getTimelineActiveDragHorizon(value, timelineDuration, projectDuration));
      }
      d.setImageDuration(visualDuration); d.setImageClipCount(getImageThumbnailCount(visualDuration));
    };
    const move = (e) => {
      if (!moved && Math.abs(e.clientX - event.clientX) < 3) return;
      moved = true;
      autoScroller.update(e.clientX);
      apply(e.clientX);
    };
    const up = () => {
      settleTimelineDrag(autoScroller, { active: moved, setTimelineHorizon: d.setTimelineHorizon });
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); d.setSnapGuide(null);
      if (!moved) return;
      if (!isStartEdge) d.rippleTimelineAfter?.(before + originalDuration, finalDuration - originalDuration);
      d.notify(isStartEdge
        ? d.t?.("visualStartAdjusted", "画面片段起点已调整") || "画面片段起点已调整"
        : activeLabel === "配音结尾" ? "图片已吸附到配音结尾" : activeLabel === "原声结尾" ? "图片已吸附到视频原声结尾" : activeLabel === "音乐结尾" ? "图片已吸附到音乐结尾" : "图片片段时长已调整");
    };
    const cancel = () => {
      settleTimelineDrag(autoScroller, {
        active: moved,
        setTimelineHorizon: d.setTimelineHorizon,
        settle: () => {
          d.setVisualSegments(segments);
          d.setImageDuration(d.imageDuration);
          d.setImageClipCount(getImageThumbnailCount(d.imageDuration));
        },
      });
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); d.setSnapGuide(null);
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true }); addEventListener("pointercancel", cancel, { once: true });
  };
}
