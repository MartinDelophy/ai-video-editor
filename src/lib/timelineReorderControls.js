import { rebindMovedVisualGroup } from "./visualAssociations.js";
import { isTimedSegmentLaneLocked } from "./timeline.js";
import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { materializeCaptionTimings, moveTimedCaptionSegment, packTimedSegmentsIntoLanes, reorderTimelineItems } from "./timeline.js";
import { collectTimelineSnapPoints, createTimelineSnapGuide, findClosestTimelineSnap, snapTimelineRange } from "./timelineSnap.js";
import { compactVisualOverlayLanes, createVisualOverlaySegment } from "./visualOverlayTimeline.js";
import {
  createTimelineEdgeAutoScroller,
  createTimelineVerticalEdgeAutoScroller,
  getTimelineActiveDragHorizon,
  getTimelineDragTimeDelta,
  settleTimelineDrag,
} from "./timelineEdgeAutoScroll.js";

export function getStableTimelineReorderIndex(slotCenters, pointerX, fallbackIndex = 0) {
  if (!Array.isArray(slotCenters) || !slotCenters.length || !Number.isFinite(pointerX)) {
    return Math.max(0, fallbackIndex);
  }
  const index = slotCenters.findIndex((center) => pointerX < center);
  return index >= 0 ? index : slotCenters.length - 1;
}

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
      d.commitVisualSegments(next, "已调整视觉片段顺序", toIndex); return;
    }
  };
  const startTimelineClipDrag = (event, track, segmentId, index) => {
    if (event.button !== 0 || event.target.closest(".image-resize-handle, .caption-resize-handle")) return;
    if (d.trackLocks[track]) return void d.notify(track === "image" ? "图片轨已锁定，无法拖动片段" : "字幕轨已锁定，无法拖动片段");
    if (track === "image") { d.setSelectedTrack("image"); d.setSelectedVisualSegmentId(segmentId); }
    else { d.setSelectedTrack("caption"); d.setSelectedSegmentId(segmentId); }
    const materializedCaptions = track === "caption" ? materializeCaptionTimings(d.captionSegments, d.captionTargetDuration) : [];
    const caption = materializedCaptions[index];
    if (caption) {
      const linkedAudio = d.audioSegments.find(audio => audio.id === caption.audioSegmentId);
      if (linkedAudio && isTimedSegmentLaneLocked(d.audioSegments, linkedAudio.id, d.trackLocks)) return;
      event.preventDefault(); event.stopPropagation();
      const duration = Math.max(0.2, caption.end - caption.start);
      const snapPoints = collectTimelineSnapPoints(d, { track: "caption", id: segmentId });
      const initial = { track, mode: "move", segmentId, fromIndex: index, startX: event.clientX, startY: event.clientY,
        originalStart: caption.start, originalEnd: caption.end, previewStart: caption.start, previewEnd: caption.end,
        previewSegments: materializedCaptions, dragging: false };
      d.timelineClipDragRef.current = initial;
      const trackElement = document.querySelector('[data-timeline-reorder-track="caption"]');
      const width = Math.max(1, trackElement?.getBoundingClientRect().width || 1);
      const autoScroller = createTimelineEdgeAutoScroller({
        trackElement: d.trackScrollRef?.current,
        pointerType: event.pointerType,
        timelineDuration: d.timelineDuration,
        onScrollFrame: (clientX, scrollOffset) => move({ clientX, clientY: event.clientY, preventDefault() {} }, scrollOffset),
      });
      const move = (e, scrollOffset = autoScroller.getScrollOffset()) => {
        const state = d.timelineClipDragRef.current; if (!state || state.segmentId !== segmentId) return;
        if (!state.dragging && Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 4) return;
        if (!state.dragging) d.pauseForTimelineEdit?.();
        e.preventDefault?.();
        autoScroller.update(e.clientX);
        const dragClientX = autoScroller.getDragClientX(e.clientX);
        const delta = getTimelineDragTimeDelta({
          clientX: dragClientX,
          startX: state.startX,
          scrollOffset,
          contentWidth: width,
          timelineDuration: d.timelineDuration,
        });
        const groupFloor = linkedAudio ? Math.max(0, caption.start - Math.min(linkedAudio.start, ...materializedCaptions.filter(item => item.audioSegmentId === linkedAudio.id).map(item => item.start))) : 0;
        const unsnappedStart = Math.max(groupFloor, Math.min(MAX_TIMELINE_DURATION_SECONDS - duration, state.originalStart + delta));
        const snapped = snapTimelineRange(unsnappedStart, duration, snapPoints, (10 / width) * d.timelineDuration);
        const previewStart = Math.max(groupFloor, Math.min(MAX_TIMELINE_DURATION_SECONDS - duration, snapped.start));
        const previewEnd = previewStart + duration;
        const previewSegments = moveTimedCaptionSegment(materializedCaptions, segmentId, previewStart, previewEnd);
        const next = { ...state, previewStart, previewEnd, previewSegments, dragging: true };
        d.setTimelineHorizon?.((value) => getTimelineActiveDragHorizon(value, d.timelineDuration, previewEnd));
        d.timelineClipDragRef.current = next; d.setTimelineClipDrag(next);
        d.setSnapGuide?.(snapped.guide);
      };
      const cleanup = () => {
        removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel);
      };
      const cancel = () => {
        const active = Boolean(d.timelineClipDragRef.current?.dragging);
        settleTimelineDrag(autoScroller, {
          active,
          setTimelineHorizon: d.setTimelineHorizon,
          settle: () => { d.setTimelineClipDrag(null); d.setSnapGuide?.(null); },
        });
        d.timelineClipDragRef.current = null;
        cleanup();
      };
      const up = () => {
        const state = d.timelineClipDragRef.current;
        settleTimelineDrag(autoScroller, {
          active: Boolean(state?.dragging),
          setTimelineHorizon: d.setTimelineHorizon,
          settle: () => {
            d.setTimelineClipDrag(null);
            d.setSnapGuide?.(null);
            if (!state?.dragging) return;
            const delta = state.previewStart - caption.start;
            if (Math.abs(delta) <= 0.000001) return;
            const linkedCaptions = linkedAudio
              ? materializedCaptions.filter(item => item.audioSegmentId === linkedAudio.id)
              : [caption];
            const movedCaptions = linkedCaptions.map(item => ({ ...item, start: item.start + delta, end: item.end + delta }));
            const group = rebindMovedVisualGroup([
              ...movedCaptions,
              ...(linkedAudio ? [{ ...linkedAudio, start: linkedAudio.start + delta }] : []),
            ], d.visualSegments);
            if (linkedAudio) d.setAudioSegments(items => items.map(item => item.id === linkedAudio.id ? group.at(-1) : item));
            const replacements = new Map(group.slice(0, movedCaptions.length).map(item => [item.id, item]));
            d.commitCaptionSegments(materializedCaptions.map(item => replacements.get(item.id) || item), "已移动字幕片段", index);
          },
        });
        d.timelineClipDragRef.current = null;
        cleanup();
        if (!state?.dragging) return;
        d.suppressTimelineClipClickRef.current = segmentId;
        setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segmentId) d.suppressTimelineClipClickRef.current = ""; }, 120);
      };
      addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true }); addEventListener("pointercancel", cancel, { once: true });
      return;
    }
    const count = track === "image" ? d.renderedVisualSegments.length : d.captionSegments.length;
    if (count < 2) return;
    event.preventDefault(); event.stopPropagation();
    const imageTrackElement = track === "image" ? document.querySelector('[data-timeline-reorder-track="image"]') : null;
    const imageTrackRect = imageTrackElement?.getBoundingClientRect();
    const draggedVisual = track === "image" ? d.renderedVisualSegments[index] : null;
    const visualSnapPoints = draggedVisual
      ? collectTimelineSnapPoints(d, { track: "image", id: segmentId })
      : [];
    const stableSlotCenters = Array.from(
      document.querySelectorAll(`[data-timeline-segment-track="${track}"]`),
      (element) => {
        const rect = element.getBoundingClientRect();
        return rect.left + rect.width / 2;
      },
    );
    const dragTarget = event.currentTarget;
    const pointerId = event.pointerId;
    try { dragTarget?.setPointerCapture?.(pointerId); } catch { /* Pointer capture is optional. */ }
    const initial = {
      track, mode: "reorder", segmentId, fromIndex: index, overIndex: index,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      stableSlotCenters, dragging: false,
    };
    d.timelineClipDragRef.current = initial;
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: d.trackScrollRef?.current,
      pointerType: event.pointerType,
      timelineDuration: d.timelineDuration,
      manageTrimScale: false,
      edgeScrollOptions: {
        threshold: 120,
        forwardMaxStep: 14,
        backwardMaxStep: 14,
        minStep: 0,
        curvePower: 1.35,
      },
      onScrollFrame: (clientX, scrollOffset) => move({
        clientX,
        clientY: d.timelineClipDragRef.current?.y ?? event.clientY,
      }, scrollOffset),
    });
    const verticalAutoScroller = createTimelineVerticalEdgeAutoScroller({
      scrollElement: imageTrackElement?.closest?.(".timeline-board"),
      pointerType: event.pointerType,
      onScrollFrame: (clientY) => move({
        clientX: d.timelineClipDragRef.current?.x ?? event.clientX,
        clientY,
      }),
    });
    const move = (e, scrollOffset = autoScroller.getScrollOffset()) => {
      const state = d.timelineClipDragRef.current; if (!state || state.segmentId !== segmentId) return;
      if (e.pointerId !== undefined && pointerId !== undefined && e.pointerId !== pointerId) return;
      if (!state.dragging && Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 6) return;
      if (!state.dragging) d.pauseForTimelineEdit?.();
      autoScroller.update(e.clientX);
      verticalAutoScroller.update(e.clientY);
      const pointerContentX = e.clientX + scrollOffset;
      const wantsOverlay = track === "image"
        && !d.trackLocks.overlay
        && imageTrackRect
        && e.clientY > imageTrackRect.bottom + 8;
      const overIndex = wantsOverlay
        ? state.overIndex
        : Math.max(0, Math.min(
            count - 1,
            getStableTimelineReorderIndex(state.stableSlotCenters, pointerContentX, state.overIndex),
          ));
      const unsnappedOverlayStart = wantsOverlay
        ? Math.max(0, Math.min(
            Math.max(0, d.timelineDuration - (draggedVisual?.duration || 0)),
            ((pointerContentX - imageTrackRect.left) / Math.max(1, imageTrackRect.width)) * d.timelineDuration,
          ))
        : state.overlayStart;
      const overlaySnap = wantsOverlay
        ? snapTimelineRange(
            unsnappedOverlayStart,
            draggedVisual?.duration || 0,
            visualSnapPoints,
            (10 / Math.max(1, imageTrackRect.width)) * d.timelineDuration,
          )
        : null;
      const overlayStart = wantsOverlay
        ? Math.max(0, Math.min(
            Math.max(0, d.timelineDuration - (draggedVisual?.duration || 0)),
            overlaySnap.start,
          ))
        : state.overlayStart;
      d.setSnapGuide?.(wantsOverlay ? overlaySnap.guide : null);
      const packedOverlayLanes = packTimedSegmentsIntoLanes(d.visualOverlaySegments, { preferredLaneKey: "lane" });
      const pointedOverlayTrack = wantsOverlay
        ? document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".visual-overlay-track")
        : null;
      const pointedLane = Number(pointedOverlayTrack?.dataset.dropLayer) - 1;
      const fallbackLane = Number.isInteger(state.overlayLane)
        ? state.overlayLane
        : d.visualOverlaySegments.length ? packedOverlayLanes.length : 0;
      const overlayLane = Number.isInteger(pointedLane) && pointedLane >= 0 ? pointedLane : fallbackLane;
      const targetLaneSegments = overlayLane === packedOverlayLanes.length ? [] : packedOverlayLanes[overlayLane];
      const overlayEnd = overlayStart + (draggedVisual?.duration || 0);
      const overlayDropAllowed = wantsOverlay && Array.isArray(targetLaneSegments) && targetLaneSegments.every((item) => (
        item.start + item.duration <= overlayStart + 0.001
        || overlayEnd <= item.start + 0.001
      ));
      const next = {
        ...state,
        mode: wantsOverlay ? "overlay" : "reorder",
        overIndex,
        overlayStart,
        overlayLane,
        overlayDropAllowed,
        x: e.clientX,
        y: e.clientY,
        dragging: true,
      };
      d.timelineClipDragRef.current = next; d.setTimelineClipDrag(next);
    };
    const cleanup = () => {
      autoScroller.stop();
      verticalAutoScroller.stop();
      d.setSnapGuide?.(null);
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", cancel, true);
      try {
        if (dragTarget?.hasPointerCapture?.(pointerId)) dragTarget.releasePointerCapture(pointerId);
      } catch { /* The pointer may already be released by the browser. */ }
    };
    const cancel = () => {
      cleanup();
      d.timelineClipDragRef.current = null;
      d.setTimelineClipDrag(null);
    };
    const up = (upEvent) => {
      if (upEvent?.pointerId !== undefined && pointerId !== undefined && upEvent.pointerId !== pointerId) return;
      cleanup();
      const state = d.timelineClipDragRef.current; d.timelineClipDragRef.current = null; d.setTimelineClipDrag(null);
      if (!state?.dragging) return;
      d.suppressTimelineClipClickRef.current = segmentId;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segmentId) d.suppressTimelineClipClickRef.current = ""; }, 120);
      if (track === "image" && state.mode === "overlay" && draggedVisual) {
        if (!state.overlayDropAllowed) return void d.notify("目标画中画轨的这个时间段已有片段");
        const remaining = d.visualSegments.filter((segment) => segment.id !== segmentId);
        if (!remaining.length) return void d.notify("至少保留一个主画面后才能转为画中画");
        const targetLane = Math.max(0, Number(state.overlayLane) || 0);
        const overlay = createVisualOverlaySegment(
          { ...draggedVisual, id: draggedVisual.assetId || draggedVisual.id },
          state.overlayStart,
          { duration: draggedVisual.duration, layer: targetLane + 1, lane: targetLane },
        );
        d.commitVisualSegments(remaining, "画面片段已移至画中画轨道");
        d.setVisualOverlaySegments((items) => compactVisualOverlayLanes([...items, overlay]));
        d.setSelectedVisualSegmentId("");
        d.setSelectedVisualOverlayId(overlay.id);
        d.setSelectedTrack("overlay");
        return;
      }
      commitTimelineClipReorder(track, state.fromIndex, state.overIndex);
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, { capture: true, once: true });
    addEventListener("pointercancel", cancel, { capture: true, once: true });
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
    d.timelineClipDragRef.current = initial;
    const move = (moveEvent, scrollOffset = autoScroller?.getScrollOffset() || 0) => {
      const state = d.timelineClipDragRef.current;
      if (!state || state.segmentId !== segmentId) return;
      if (!state.dragging && Math.abs(moveEvent.clientX - startX) < 3) return;
      if (!state.dragging) d.pauseForTimelineEdit?.();
      autoScroller?.update(moveEvent.clientX);
      const dragClientX = autoScroller?.getDragClientX(moveEvent.clientX) ?? moveEvent.clientX;
      const delta = getTimelineDragTimeDelta({ clientX: dragClientX, startX, scrollOffset, contentWidth: trackWidth, timelineDuration: d.timelineDuration });
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
      d.setTimelineHorizon?.((value) => getTimelineActiveDragHorizon(value, d.timelineDuration, previewEnd));
      d.timelineClipDragRef.current = next; d.setTimelineClipDrag(next);
      d.setSnapGuide?.(createTimelineSnapGuide(snap, edge));
    };
    const cleanup = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel);
    };
    const cancel = () => {
      const active = Boolean(d.timelineClipDragRef.current?.dragging);
      settleTimelineDrag(autoScroller, {
        active,
        setTimelineHorizon: d.setTimelineHorizon,
        settle: () => { d.setTimelineClipDrag(null); d.setSnapGuide?.(null); },
      });
      d.timelineClipDragRef.current = null;
      cleanup();
    };
    const up = () => {
      const state = d.timelineClipDragRef.current;
      settleTimelineDrag(autoScroller, {
        active: Boolean(state?.dragging),
        setTimelineHorizon: d.setTimelineHorizon,
        settle: () => {
          d.setTimelineClipDrag(null);
          d.setSnapGuide?.(null);
          d.commitCaptionSegments(state.previewSegments, "已调整字幕片段时长", index);
        },
      });
      d.timelineClipDragRef.current = null;
      cleanup();
      if (!state?.dragging) return;
      d.suppressTimelineClipClickRef.current = segmentId;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segmentId) d.suppressTimelineClipClickRef.current = ""; }, 120);
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true }); addEventListener("pointercancel", cancel, { once: true });
  };
  return { commitTimelineClipReorder, getTimelineReorderIndex, startCaptionResize, startTimelineClipDrag };
}
