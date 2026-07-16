import { getVisualSegmentTimeline, materializeCaptionTimings, moveTimedCaptionSegment, reorderTimelineItems } from "./timeline.js";

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
    if (event.button !== 0 || event.target.closest(".image-resize-handle")) return;
    if (d.trackLocks[track]) return void d.notify(track === "image" ? "图片轨已锁定，无法拖动片段" : "字幕轨已锁定，无法拖动片段");
    if (track === "image") { d.setSelectedTrack("image"); d.setSelectedVisualSegmentId(segmentId); }
    else { d.setSelectedTrack("caption"); d.setSelectedSegmentId(segmentId); }
    const materializedCaptions = track === "caption" ? materializeCaptionTimings(d.captionSegments, d.captionTargetDuration) : [];
    const caption = materializedCaptions[index];
    if (caption) {
      event.preventDefault(); event.stopPropagation();
      const duration = Math.max(0.2, caption.end - caption.start);
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
        const previewStart = Math.max(0, Math.min(d.timelineDuration - duration, state.originalStart + delta));
        const previewEnd = previewStart + duration;
        const previewSegments = moveTimedCaptionSegment(materializedCaptions, segmentId, previewStart, previewEnd);
        const next = { ...state, previewStart, previewEnd, previewSegments, dragging: true };
        d.timelineClipDragRef.current = next; d.setTimelineClipDrag(next);
      };
      const up = () => {
        removeEventListener("pointermove", move); removeEventListener("pointerup", up);
        const state = d.timelineClipDragRef.current; d.timelineClipDragRef.current = null; d.setTimelineClipDrag(null);
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
    const initial = { track, segmentId, fromIndex: index, overIndex: index, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, dragging: false };
    d.timelineClipDragRef.current = initial; d.setTimelineClipDrag(initial);
    const move = (e) => {
      const state = d.timelineClipDragRef.current; if (!state || state.segmentId !== segmentId) return;
      if (!state.dragging && Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 6) return;
      const overIndex = Math.max(0, Math.min(count - 1, getTimelineReorderIndex(track, e.clientX, e.clientY)));
      const next = { ...state, overIndex, x: e.clientX, y: e.clientY, dragging: true };
      d.timelineClipDragRef.current = next; d.setTimelineClipDrag(next);
    };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      const state = d.timelineClipDragRef.current; d.timelineClipDragRef.current = null; d.setTimelineClipDrag(null);
      if (!state?.dragging) return;
      d.suppressTimelineClipClickRef.current = segmentId;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segmentId) d.suppressTimelineClipClickRef.current = ""; }, 120);
      commitTimelineClipReorder(track, state.fromIndex, state.overIndex);
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true });
  };
  return { commitTimelineClipReorder, getTimelineReorderIndex, startTimelineClipDrag };
}
