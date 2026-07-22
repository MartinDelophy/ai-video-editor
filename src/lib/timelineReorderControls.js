import { getVisualSegmentTimeline, materializeCaptionTimings, moveTimedCaptionSegment, reorderTimelineItems } from "./timeline.js";
import { collectTimelineSnapPoints, findClosestTimelineSnap, snapTimelineRange } from "./timelineSnap.js";
import { createVisualOverlaySegment } from "./visualOverlayTimeline.js";
import { createTimelineEdgeAutoScroller, getTimelineDragTimeDelta } from "./timelineEdgeAutoScroll.js";

export function createTimelineReorderControls(d) {
  const getTimelineReorderIndex = (track, x, y) => {
    const element = document.querySelector(`[data-timeline-reorder-track="${track}"]`);
    if (!element) return d.timelineClipDragRef.current?.overIndex ?? 0;
    const trackRect = element.getBoundingClientRect();
    if (y < trackRect.top - 28 || y > trackRect.bottom + 28) return d.timelineClipDragRef.current?.overIndex ?? 0;
    const segments = Array.from(element.querySelectorAll(`[data-timeline-segment-track="${track}"]`));
    if (!segments.length) return 0;
    for (let index = 0; index < segments.length; index += 1) {
      const rect = segments[index].getBoundingClientRect(); if (x < rect.left + rect.width / 2) return index;
    }
    return segments.length - 1;
  };
  const commitTimelineClipReorder = (track, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    if (track === "image") {
      const source = d.visualSegments.length ? d.visualSegments : d.renderedVisualSegments;
      if (source.length < 2) return;
      const next = reorderTimelineItems(source, fromIndex, toIndex);
      d.commitVisualSegments(next, "已调整视觉片段顺序", toIndex); d.seekTo(getVisualSegmentTimeline(next)[toIndex]?.start ?? 0); return;
    }
  };
  const startTimelineClipDrag = (event, track, segmentId, index) => {
    if (event.button !== 0 || event.target.closest(".image-resize-handle, .caption-resize-handle")) return;
    d.pauseForTimelineEdit?.();
    if (d.trackLocks[track]) return void d.notify(track === "image" ? "图片轨已锁定，无法拖动片段" : "字幕轨已锁定，无法拖动片段");
    if (track === "image") { d.setSelectedTrack("image"); d.setSelectedVisualSegmentId(segmentId); }
    else { d.setSelectedTrack("caption"); d.setSelectedSegmentId(segmentId); }
    const materializedCaptions = track === "caption" ? materializeCaptionTimings(d.captionSegments, d.captionTargetDuration) : [];
    const caption = materializedCaptions[index];
    if (caption) {
      event.preventDefault(); event.stopPropagation();
      const duration = Math.max(0.2, caption.end - caption.start);
      const snapPoints = collectTimelineSnapPoints(d, { track: "caption", id: segmentId });
      const initial = { track, mode: "move", segmentId, fromIndex: index, startX: event.clientX, startY: event.clientY,
        originalStart: caption.start, originalEnd: caption.end, previewStart: caption.start, previewEnd: caption.end,
        previewSegments: materializedCaptions, dragging: false };
      d.timelineClipDragRef.current = initial; d.setTimelineClipDrag(initial);
      const move = (e) => {
        const state = d.timelineClipDragRef.current; if (!state || state.segmentId !== segmentId) return;
        if (!state.dragging && Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 4) return;
        const trackElement = document.querySelector('[data-timeline-reorder-track="caption"]');
        const width = Math.max(1, trackElement?.getBoundingClientRect().width || 1);
        const delta = ((e.clientX - state.startX) / width) * d.timelineDuration;
        const unsnappedStart = Math.max(0, Math.min(d.timelineDuration - duration, state.originalStart + delta));
        const snapped = snapTimelineRange(unsnappedStart, duration, snapPoints, (10 / width) * d.timelineDuration);
        const previewStart = Math.max(0, Math.min(d.timelineDuration - duration, snapped.start));
        const previewEnd = previewStart + duration;
        const previewSegments = moveTimedCaptionSegment(materializedCaptions, segmentId, previewStart, previewEnd);
        const next = { ...state, previewStart, previewEnd, previewSegments, dragging: true };
        d.timelineClipDragRef.current = next; d.setTimelineClipDrag(next);
        d.setSnapGuide?.(snapped.guide);
      };
      const up = () => {
        removeEventListener("pointermove", move); removeEventListener("pointerup", up);
        const state = d.timelineClipDragRef.current; d.timelineClipDragRef.current = null; d.setTimelineClipDrag(null); d.setSnapGuide?.(null);
        if (!state?.dragging) return;
        d.suppressTimelineClipClickRef.current = segmentId;
        setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segmentId) d.suppressTimelineClipClickRef.current = ""; }, 120);
        d.commitCaptionSegments(state.previewSegments, "已移动字幕片段", index); d.seekTo(state.previewStart);
      };
      addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true });
      return;
    }
    const count = track === "image" ? d.renderedVisualSegments.length : d.captionSegments.length;
    if (count < 2) return;
    event.preventDefault(); event.stopPropagation();
    const imageTrackElement = track === "image" ? document.querySelector('[data-timeline-reorder-track="image"]') : null;
    const imageTrackRect = imageTrackElement?.getBoundingClientRect();
    const draggedVisual = track === "image" ? d.renderedVisualSegments[index] : null;
    const initial = { track, mode: "reorder", segmentId, fromIndex: index, overIndex: index, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, dragging: false };
    d.timelineClipDragRef.current = initial; d.setTimelineClipDrag(initial);
    const move = (e) => {
      const state = d.timelineClipDragRef.current; if (!state || state.segmentId !== segmentId) return;
      if (!state.dragging && Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 6) return;
      const wantsOverlay = track === "image" && imageTrackRect && e.clientY > imageTrackRect.bottom + 8;
      const overIndex = wantsOverlay
        ? state.overIndex
        : Math.max(0, Math.min(count - 1, getTimelineReorderIndex(track, e.clientX, e.clientY)));
      const overlayStart = wantsOverlay
        ? Math.max(0, Math.min(
            Math.max(0, d.timelineDuration - (draggedVisual?.duration || 0)),
            ((e.clientX - imageTrackRect.left) / Math.max(1, imageTrackRect.width)) * d.timelineDuration,
          ))
        : state.overlayStart;
      const next = { ...state, mode: wantsOverlay ? "overlay" : "reorder", overIndex, overlayStart, x: e.clientX, y: e.clientY, dragging: true };
      d.timelineClipDragRef.current = next; d.setTimelineClipDrag(next);
    };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      const state = d.timelineClipDragRef.current; d.timelineClipDragRef.current = null; d.setTimelineClipDrag(null);
      if (!state?.dragging) return;
      d.suppressTimelineClipClickRef.current = segmentId;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segmentId) d.suppressTimelineClipClickRef.current = ""; }, 120);
      if (track === "image" && state.mode === "overlay" && draggedVisual) {
        const remaining = d.visualSegments.filter((segment) => segment.id !== segmentId);
        if (!remaining.length) return void d.notify("至少保留一个主画面后才能转为画中画");
        const overlay = createVisualOverlaySegment(
          { ...draggedVisual, id: draggedVisual.assetId || draggedVisual.id },
          state.overlayStart,
          { duration: draggedVisual.duration, layer: d.visualOverlaySegments.length + 1 },
        );
        d.commitVisualSegments(remaining, "画面片段已移至画中画轨道");
        d.setVisualOverlaySegments((items) => [...items, overlay]);
        d.setSelectedVisualSegmentId("");
        d.setSelectedVisualOverlayId(overlay.id);
        d.setSelectedTrack("overlay");
        d.seekTo(overlay.start);
        return;
      }
      commitTimelineClipReorder(track, state.fromIndex, state.overIndex);
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true });
  };
  const startCaptionResize = (event, segmentId, index, edge) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    if (d.trackLocks.caption) return void d.notify("字幕轨已锁定，无法调整片段时长");
    const materialized = materializeCaptionTimings(d.captionSegments, d.captionTargetDuration);
    const caption = materialized[index];
    if (!caption || caption.id !== segmentId) return;
    d.setSelectedTrack("caption"); d.setSelectedSegmentId(segmentId);
    const trackElement = document.querySelector('[data-timeline-reorder-track="caption"]');
    const startX = event.clientX;
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: d.trackScrollRef?.current,
      pointerType: event.pointerType,
      timelineDuration: d.timelineDuration,
      onScrollFrame: (clientX, scrollOffset) => move({ clientX, preventDefault() {} }, scrollOffset),
    });
    const trackWidth = Math.max(1, trackElement?.getBoundingClientRect().width || 1);
    const snapPoints = collectTimelineSnapPoints(d, { track: "caption", id: segmentId });
    const initial = {
      track: "caption", mode: edge === "start" ? "resize-start" : "resize-end", segmentId,
      fromIndex: index, startX, startY: event.clientY, originalStart: caption.start, originalEnd: caption.end,
      previewStart: caption.start, previewEnd: caption.end, previewSegments: materialized, dragging: false,
    };
    d.timelineClipDragRef.current = initial; d.setTimelineClipDrag(initial);
    const move = (moveEvent, scrollOffset = autoScroller?.getScrollOffset() || 0) => {
      const state = d.timelineClipDragRef.current;
      if (!state || state.segmentId !== segmentId) return;
      if (!state.dragging && Math.abs(moveEvent.clientX - startX) < 3) return;
      if (!state.dragging) d.pauseForTimelineEdit?.();
      autoScroller?.update(moveEvent.clientX);
      const delta = getTimelineDragTimeDelta({ clientX: moveEvent.clientX, startX, scrollOffset, contentWidth: trackWidth, timelineDuration: d.timelineDuration });
      const minimumDuration = 0.2;
      let previewStart = edge === "start"
        ? Math.max(0, Math.min(state.originalEnd - minimumDuration, state.originalStart + delta))
        : state.originalStart;
      let previewEnd = edge === "end"
        ? Math.min(d.timelineDuration, Math.max(state.originalStart + minimumDuration, state.originalEnd + delta))
        : state.originalEnd;
      const movingValue = edge === "start" ? previewStart : previewEnd;
      const snap = findClosestTimelineSnap(movingValue, snapPoints, (10 / trackWidth) * d.timelineDuration);
      if (snap) {
        if (edge === "start") previewStart = Math.min(state.originalEnd - minimumDuration, snap.time);
        else previewEnd = Math.max(state.originalStart + minimumDuration, snap.time);
      }
      const previewSegments = moveTimedCaptionSegment(materialized, segmentId, previewStart, previewEnd);
      const next = { ...state, previewStart, previewEnd, previewSegments, dragging: true };
      d.timelineClipDragRef.current = next; d.setTimelineClipDrag(next);
      d.setSnapGuide?.(snap ? { time: snap.time, label: `${snap.time.toFixed(2)}s` } : null);
    };
    const cleanup = () => {
      autoScroller.stop();
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel);
    };
    const cancel = () => {
      cleanup(); d.timelineClipDragRef.current = null; d.setTimelineClipDrag(null); d.setSnapGuide?.(null);
    };
    const up = () => {
      cleanup();
      const state = d.timelineClipDragRef.current; d.timelineClipDragRef.current = null; d.setTimelineClipDrag(null); d.setSnapGuide?.(null);
      if (!state?.dragging) return;
      d.suppressTimelineClipClickRef.current = segmentId;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segmentId) d.suppressTimelineClipClickRef.current = ""; }, 120);
      d.commitCaptionSegments(state.previewSegments, "已调整字幕片段时长", index);
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true }); addEventListener("pointercancel", cancel, { once: true });
  };
  return { commitTimelineClipReorder, getTimelineReorderIndex, startCaptionResize, startTimelineClipDrag };
}
