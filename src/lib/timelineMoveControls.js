import { rebindMovedVisualGroup } from "./visualAssociations.js";
import { DEFAULT_STICKER_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { collectTimelineSnapPoints, createTimelineSnapGuide, findClosestTimelineSnap, snapTimelineRange } from "./timelineSnap.js";
import {
  createTimelineEdgeAutoScroller,
  createTimelineVerticalEdgeAutoScroller,
  getTimelineActiveDragHorizon,
  getTimelineDragTimeDelta,
  settleTimelineDrag,
} from "./timelineEdgeAutoScroll.js";
import { isTimedSegmentLaneLocked } from "./timeline.js";
import { moveLinkedSourceAudioSegment } from "./sourceAudioSync.js";

export function createTimelineMoveControls(d) {
  const startSingleTrackMove = (event, track, segmentId = "") => {
    if (event.button !== 0) return;
    const isSource = track === "source";
    const resolvedSegmentId = segmentId || event.currentTarget?.dataset?.timelineSegmentId || "";
    const linkedSourceSegment = isSource && d.sourceAudioLinked && resolvedSegmentId !== "source-audio"
      ? d.linkedSourceAudioSegments?.find((segment) => segment.id === resolvedSegmentId) ?? null
      : null;
    const musicSegments = !isSource && Array.isArray(d.musicSegments) ? d.musicSegments : [];
    const musicSegment = musicSegments.find((segment) => segment.id === segmentId) ?? musicSegments[0];
    const clipDuration = isSource ? linkedSourceSegment?.duration ?? d.sourceAudioDuration : musicSegment?.duration ?? d.musicDuration;
    const start = isSource ? linkedSourceSegment?.start ?? d.sourceAudioStart : musicSegment?.start ?? d.musicStart;
    if (!(clipDuration > 0) || d.trackLocks[track]) return void d.notify(`${isSource ? "视频原声" : "音乐"}轨已锁定，无法移动`);
    const rect = d.trackScrollRef.current?.getBoundingClientRect(); const duration = d.timelineDurationRef.current || 10;
    if (!rect) return;
    event.preventDefault(); event.stopPropagation(); d.setSelectedTrack(track);
    if (linkedSourceSegment) d.setSelectedSourceAudioSegmentId?.(linkedSourceSegment.id);
    if (!isSource && musicSegment?.id) d.setSelectedMusicSegmentId?.(musicSegment.id);
    const startX = event.clientX; let moved = false; let latest = start;
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: d.trackScrollRef.current,
      pointerType: event.pointerType,
      timelineDuration: duration,
      onScrollFrame: (clientX, scrollOffset) => move({ clientX, preventDefault() {} }, scrollOffset),
    });
    const snapPoints = collectTimelineSnapPoints(d, { track, id: linkedSourceSegment?.id || musicSegment?.id || track });
    const move = (e, scrollOffset = autoScroller.getScrollOffset()) => {
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      if (!moved) d.pauseForTimelineEdit?.();
      moved = true; e.preventDefault();
      autoScroller.update(e.clientX);
      const dragClientX = autoScroller.getDragClientX(e.clientX);
      const unsnapped = start + getTimelineDragTimeDelta({
        clientX: dragClientX,
        startX,
        scrollOffset,
        contentWidth: rect.width,
        timelineDuration: duration,
      });
      const snapped = snapTimelineRange(unsnapped, clipDuration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      latest = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - clipDuration, snapped.start));
      d.setSnapGuide?.(snapped.guide);
      if (linkedSourceSegment) {
        d.setVisualSegments((segments) => moveLinkedSourceAudioSegment(segments, linkedSourceSegment.id, latest));
      } else if (isSource) { d.setSourceAudioLinked(false); d.setSourceAudioStart(latest); }
      else {
        if (musicSegment) {
          d.setMusicSegments?.((segments) => {
            const next = segments.map((segment) => segment.id === musicSegment.id ? { ...segment, start: latest } : segment);
            d.setMusicStart(Math.min(...next.map((segment) => segment.start)));
            return next;
          });
        } else d.setMusicStart(latest);
      }
      d.setTimelineHorizon((value) => getTimelineActiveDragHorizon(value, duration, latest + clipDuration));
    };
    const cleanup = (settle) => {
      settleTimelineDrag(autoScroller, { active: moved, setTimelineHorizon: d.setTimelineHorizon, settle });
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); d.setSnapGuide?.(null);
    };
    const cancel = () => cleanup(() => {
      if (isSource) {
        if (linkedSourceSegment) d.setVisualSegments(d.visualSegments);
        else {
          d.setSourceAudioStart(start);
          d.setSourceAudioLinked?.(d.sourceAudioLinked);
        }
      } else if (musicSegment) {
        d.setMusicSegments?.(musicSegments);
        d.setMusicStart(Math.min(...musicSegments.map((segment) => segment.start)));
      } else d.setMusicStart(start);
    });
    const up = () => { cleanup(); if (moved) {
      d.suppressTimelineClipClickRef.current = track;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === track) d.suppressTimelineClipClickRef.current = ""; }, 160);
      d.notify(`${isSource ? "视频原声" : "音乐"}片段位置已调整`);
    } };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
  };
  const startSourceAudioMove = (event, segmentId = "") => {
    if (event.button !== 0) return;
    const resolvedSegmentId = segmentId || event.currentTarget?.dataset?.timelineSegmentId || "source-audio";
    const linkedSourceSegment = d.sourceAudioLinked && resolvedSegmentId !== "source-audio"
      ? d.linkedSourceAudioSegments?.find((segment) => segment.id === resolvedSegmentId) ?? null
      : null;
    const clipDuration = linkedSourceSegment?.duration ?? d.sourceAudioDuration;
    const start = linkedSourceSegment?.start ?? d.sourceAudioStart;
    if (!(clipDuration > 0) || d.trackLocks.source) return void d.notify("视频原声轨已锁定，无法移动");
    const rect = d.trackScrollRef.current?.getBoundingClientRect();
    const sourceTrack = event.currentTarget?.closest?.(".source-track");
    const sourceTrackRect = sourceTrack?.getBoundingClientRect?.();
    const duration = d.timelineDurationRef.current || 10;
    if (!rect || !sourceTrackRect) return;

    event.preventDefault();
    event.stopPropagation();
    d.setSelectedTrack("source");
    d.setSelectedSourceAudioSegmentId?.(resolvedSegmentId);
    const startX = event.clientX;
    const startY = event.clientY;
    const rowHeight = sourceTrackRect.height || 48;
    let moved = false;
    let latest = start;
    let latestClientX = startX;
    let latestClientY = startY;
    let targetLane = null;
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: d.trackScrollRef.current,
      pointerType: event.pointerType,
      timelineDuration: duration,
      onScrollFrame: (clientX, scrollOffset) => move({ clientX, clientY: latestClientY, preventDefault() {} }, scrollOffset),
    });
    const verticalAutoScroller = createTimelineVerticalEdgeAutoScroller({
      scrollElement: sourceTrack.closest?.(".timeline-board"),
      pointerType: event.pointerType,
      onScrollFrame: (clientY) => move({ clientX: latestClientX, clientY, preventDefault() {} }),
    });
    const snapPoints = collectTimelineSnapPoints(d, { track: "source", id: linkedSourceSegment?.id || "source" });
    const applySourcePosition = (nextStart) => {
      if (linkedSourceSegment) {
        d.setVisualSegments((segments) => moveLinkedSourceAudioSegment(segments, linkedSourceSegment.id, nextStart));
      } else {
        d.setSourceAudioLinked(false);
        d.setSourceAudioStart(nextStart);
      }
    };
    const resolveAudioLane = (clientX, clientY) => {
      if (!(clientY > startY + rowHeight * 0.45) || d.trackLocks.audio || d.trackVisibility?.audio === false) return null;
      const pointedLaneElement = globalThis.document?.elementFromPoint?.(clientX, clientY)?.closest?.("[data-audio-lane-index]");
      const pointedLane = Number(pointedLaneElement?.dataset?.audioLaneIndex);
      let lane = Number.isInteger(pointedLane) && pointedLane >= 0 ? pointedLane : null;
      const laneElements = Array.from(d.trackScrollRef.current?.querySelectorAll?.("[data-audio-lane-index]") || []);
      if (lane == null && laneElements.length) {
        const lastLaneRect = laneElements.at(-1)?.getBoundingClientRect?.();
        if (lastLaneRect && clientY >= lastLaneRect.bottom && clientY <= lastLaneRect.bottom + rowHeight * 1.2) {
          lane = laneElements.length;
        }
      } else if (lane == null && clientY >= sourceTrackRect.bottom && clientY <= sourceTrackRect.bottom + rowHeight * 1.35) {
        lane = 0;
      }
      if (!Number.isInteger(lane) || lane < 0) return null;
      if (d.trackLocks[`audio-${lane}`] || d.trackVisibility?.[`audio-${lane}`] === false) return null;
      return lane;
    };
    const move = (moveEvent, scrollOffset = autoScroller.getScrollOffset()) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      latestClientX = moveEvent.clientX;
      latestClientY = moveEvent.clientY;
      if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
      if (!moved) d.pauseForTimelineEdit?.();
      moved = true;
      moveEvent.preventDefault();
      autoScroller.update(moveEvent.clientX);
      verticalAutoScroller.update(moveEvent.clientY);
      const dragClientX = autoScroller.getDragClientX(moveEvent.clientX);
      const unsnapped = start + getTimelineDragTimeDelta({
        clientX: dragClientX,
        startX,
        scrollOffset,
        contentWidth: rect.width,
        timelineDuration: duration,
      });
      const snapped = snapTimelineRange(unsnapped, clipDuration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      latest = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - clipDuration, snapped.start));
      targetLane = resolveAudioLane(moveEvent.clientX, moveEvent.clientY);
      d.setSourceAudioDragTargetLane?.(targetLane);
      d.setSnapGuide?.(snapped.guide);
      d.setTimelineHorizon((value) => getTimelineActiveDragHorizon(value, duration, latest + clipDuration));
      if (targetLane == null) applySourcePosition(latest);
    };
    const cleanup = (settle) => {
      verticalAutoScroller.stop();
      settleTimelineDrag(autoScroller, { active: moved, setTimelineHorizon: d.setTimelineHorizon, settle });
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      d.setSourceAudioDragTargetLane?.(null);
      d.setSnapGuide?.(null);
    };
    const cancel = () => cleanup(() => {
      if (linkedSourceSegment) d.setVisualSegments(d.visualSegments);
      else {
        d.setSourceAudioStart(start);
        d.setSourceAudioLinked?.(d.sourceAudioLinked);
      }
    });
    const up = () => {
      const dropLane = targetLane;
      let movedToAudioLane = false;
      cleanup(() => {
        if (Number.isInteger(dropLane)) {
          movedToAudioLane = d.moveSourceAudioToAudioLane?.({
            segmentId: resolvedSegmentId,
            start: latest,
            lane: dropLane,
          }) === true;
        }
      });
      if (!moved) return;
      d.suppressTimelineClipClickRef.current = "source";
      setTimeout(() => {
        if (d.suppressTimelineClipClickRef.current === "source") d.suppressTimelineClipClickRef.current = "";
      }, 160);
      if (!movedToAudioLane) d.notify("视频原声片段位置已调整");
    };
    addEventListener("pointermove", move, { passive: false });
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
  };
  const startAudioSegmentMove = (event, id = "", initialLane = 0) => {
    if (event.button !== 0) return;
    const segment = d.audioSegments.find((item) => item.id === id); if (!segment) return;
    if (isTimedSegmentLaneLocked(d.audioSegments, segment.id, d.trackLocks)) return void d.notify(d.t("audioTrackLockedMove"));
    const captions = d.captionSegments.filter((caption) => caption.audioSegmentId === segment.id);
    if (captions.length && d.trackLocks.caption) {
      return void d.notify("关联字幕轨已锁定，无法移动这个配音片段");
    }
    const rect = d.trackScrollRef.current?.getBoundingClientRect(); const duration = d.timelineDurationRef.current || 10;
    if (!rect) return;
    event.preventDefault(); event.stopPropagation(); d.setSelectedTrack("audio"); d.setSelectedAudioSegmentId(segment.id);
    const startX = event.clientX; const startY = event.clientY; const start = segment.start || 0;
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: d.trackScrollRef.current,
      pointerType: event.pointerType,
      timelineDuration: duration,
      onScrollFrame: (clientX, scrollOffset) => move({ clientX, clientY: startY, preventDefault() {} }, scrollOffset),
    });
    const originalLane = Number.isInteger(segment.lane) ? segment.lane : Math.max(0, Number(initialLane) || 0);
    const rowHeight = event.currentTarget?.closest?.(".audio-track")?.getBoundingClientRect?.().height || 48;
    const maxLane = Math.max(originalLane, globalThis.document?.querySelectorAll?.("[data-audio-lane-index]")?.length || 0);
    const snapPoints = collectTimelineSnapPoints(d, { track: "audio", id: segment.id });
    let moved = false; let latest = start; let latestLane = originalLane; let cancelledByPinch = false;
    const applyPosition = (nextStart, nextLane = latestLane) => {
      const delta = nextStart - start;
      const normalizedLane = Math.max(0, nextLane);
      d.setAudioSegments((items) => {
        let changed = false;
        const next = items.map((item) => {
          if (item.id !== segment.id) return item;
          if (Math.abs((item.start || 0) - nextStart) < 0.0001 && item.lane === normalizedLane) return item;
          changed = true;
          return { ...item, start: nextStart, lane: normalizedLane };
        });
        return changed ? next : items;
      });
      if (!captions.length) return;
      d.setCaptionSegments((items) => {
        let changed = false;
        const next = items.map((caption) => {
          const original = captions.find((item) => item.id === caption.id);
          if (!original) return caption;
          const nextStart = original.start + delta;
          const nextEnd = original.end + delta;
          if (Math.abs(caption.start - nextStart) < 0.0001 && Math.abs(caption.end - nextEnd) < 0.0001) return caption;
          changed = true;
          return { ...caption, start: nextStart, end: nextEnd };
        });
        return changed ? next : items;
      });
    };
    const move = (e, scrollOffset = autoScroller.getScrollOffset()) => {
      if (cancelledByPinch || d.trackScrollRef.current?.classList.contains("is-pinching")) return;
      const deltaX = e.clientX - startX; const deltaY = e.clientY - startY;
      if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
      if (!moved) d.pauseForTimelineEdit?.();
      moved = true; e.preventDefault();
      autoScroller.update(e.clientX);
      const dragClientX = autoScroller.getDragClientX(e.clientX);
      const unsnapped = start + getTimelineDragTimeDelta({
        clientX: dragClientX,
        startX,
        scrollOffset,
        contentWidth: rect.width,
        timelineDuration: duration,
      });
      const snapped = snapTimelineRange(unsnapped, segment.duration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      const groupFloor = Math.max(0, start - Math.min(start, ...captions.map(caption => caption.start)));
      latest = Math.max(groupFloor, Math.min(MAX_TIMELINE_DURATION_SECONDS - segment.duration, snapped.start));
      const laneElement = globalThis.document?.elementFromPoint?.(e.clientX, e.clientY)?.closest?.("[data-audio-lane-index]");
      const pointedLane = Number(laneElement?.dataset?.audioLaneIndex);
      latestLane = Number.isInteger(pointedLane) && pointedLane >= 0
        ? pointedLane
        : Math.max(0, Math.min(maxLane, originalLane + Math.round(deltaY / Math.max(rowHeight, 1))));
      d.setSnapGuide?.(snapped.guide);
      d.setTimelineHorizon((value) => getTimelineActiveDragHorizon(value, duration, latest + segment.duration));
      applyPosition(latest, latestLane);
    };
    const cancelForPinch = () => {
      cancelledByPinch = true;
      cleanup(() => applyPosition(start, originalLane));
    };
    const cleanup = (settle) => {
      settleTimelineDrag(autoScroller, { active: moved, setTimelineHorizon: d.setTimelineHorizon, settle });
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      removeEventListener("timeline-mobile-pinch-start", cancelForPinch);
      d.setSnapGuide?.(null);
    };
    const cancel = () => cleanup(() => applyPosition(start, originalLane));
    const up = () => { cleanup(); if (moved) {
      if (cancelledByPinch) return;
      if (Math.abs(latest - start) > 0.000001) {
        const delta = latest - start;
        const group = rebindMovedVisualGroup([
          { ...segment, start: latest, lane: latestLane },
          ...captions.map(caption => ({ ...caption, start: caption.start + delta, end: caption.end + delta })),
        ], d.visualSegments);
        d.setAudioSegments(items => items.map(item => item.id === segment.id ? group[0] : item));
        d.setCaptionSegments(items => items.map(item => group.slice(1).find(caption => caption.id === item.id) || item));
      }
      d.suppressTimelineClipClickRef.current = segment.id;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segment.id) d.suppressTimelineClipClickRef.current = ""; }, 160);
      d.notify(d.t("audioClipMoved"));
    } };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cancel); addEventListener("timeline-mobile-pinch-start", cancelForPinch);
  };
  const startStickerSegmentMove = (event, id = "", initialLane = 0) => {
    if (event.button !== 0) return;
    const segment = d.stickerSegments.find((item) => item.id === id); if (!segment) return;
    if (d.trackLocks.sticker) return void d.notify("贴纸轨已锁定，无法移动贴纸");
    const rect = d.trackScrollRef.current?.getBoundingClientRect();
    const duration = d.timelineDurationRef.current || Math.max(d.estimatedDuration, segment.start + segment.duration, 10);
    if (!rect || duration <= 0) return;
    const isMobileTouch = event.pointerType === "touch" && globalThis.window?.matchMedia?.("(max-width: 760px)").matches;
    if (!isMobileTouch) event.preventDefault();
    event.stopPropagation(); d.setSelectedTrack("sticker"); d.setActiveTool("stickers"); d.setSelectedStickerSegmentId(segment.id);
    if (segment.stickerId) d.setSelectedStickerId(segment.stickerId);
    const startX = event.clientX; const startY = event.clientY; const start = segment.start || 0;
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: d.trackScrollRef.current,
      pointerType: event.pointerType,
      timelineDuration: duration,
      onScrollFrame: (clientX, scrollOffset) => move({ clientX, clientY: startY, preventDefault() {} }, scrollOffset),
    });
    const segmentDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, segment.duration || DEFAULT_STICKER_SEGMENT_SECONDS);
    let moved = false; let latest = start; let latestLane = Math.max(0, Number(initialLane) || 0);
    const snapPoints = collectTimelineSnapPoints(d, { track: "sticker", id: segment.id });
    const move = (e, scrollOffset = autoScroller.getScrollOffset()) => {
      const deltaX = e.clientX - startX; const deltaY = e.clientY - startY;
      if (!moved && isMobileTouch && Math.abs(deltaY) > Math.abs(deltaX)) return;
      if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
      if (!moved) d.pauseForTimelineEdit?.();
      moved = true; e.preventDefault();
      autoScroller.update(e.clientX);
      const dragClientX = autoScroller.getDragClientX(e.clientX);
      const unsnapped = start + getTimelineDragTimeDelta({
        clientX: dragClientX,
        startX,
        scrollOffset,
        contentWidth: rect.width,
        timelineDuration: duration,
      });
      const snapped = snapTimelineRange(unsnapped, segmentDuration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      latest = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - segmentDuration, snapped.start));
      const laneElement = globalThis.document?.elementFromPoint?.(e.clientX, e.clientY)?.closest?.("[data-sticker-lane-index]");
      const pointedLane = Number(laneElement?.dataset?.stickerLaneIndex);
      if (Number.isInteger(pointedLane) && pointedLane >= 0) latestLane = pointedLane;
      d.setSnapGuide?.(snapped.guide);
      d.setTimelineHorizon((value) => getTimelineActiveDragHorizon(value, duration, latest + segmentDuration));
      d.setStickerTimelineDrag?.({
        segmentId: segment.id,
        start: latest,
        duration: segmentDuration,
        lane: latestLane,
        name: segment.name,
        src: segment.src,
      });
    };
    const cleanup = (settle) => {
      settleTimelineDrag(autoScroller, { active: moved, setTimelineHorizon: d.setTimelineHorizon, settle });
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); d.setSnapGuide?.(null);
    };
    const cancel = () => cleanup(() => d.setStickerTimelineDrag?.(null));
    const up = () => {
      const next = d.stickerSegments.map((item) => item.id === segment.id
        ? moved && Math.abs(latest - start) > 0.000001
          ? rebindMovedVisualGroup([{ ...item, start: latest, lane: latestLane }], d.visualSegments)[0]
          : { ...item, start: latest, lane: latestLane }
        : item);
      cleanup(() => {
        d.setStickerTimelineDrag?.(null);
        if (d.commitStickerSegments) d.commitStickerSegments(next, "已调整贴纸片段位置", segment.id);
      });
      if (!moved) return;
      d.suppressTimelineClipClickRef.current = segment.id;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segment.id) d.suppressTimelineClipClickRef.current = ""; }, 160);
      if (!d.commitStickerSegments) d.notify("贴纸片段位置已调整");
    };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
  };
  const startStickerSegmentResize = (event, id = "", edge = "end") => {
    if (event.button !== 0) return;
    const segment = d.stickerSegments.find((item) => item.id === id); if (!segment) return;
    if (d.trackLocks.sticker) return void d.notify("贴纸轨已锁定，无法调整片段时长");
    const isMobileTouch = event.pointerType === "touch" && globalThis.window?.matchMedia?.("(max-width: 760px)").matches;
    if (!isMobileTouch) event.preventDefault();
    event.stopPropagation();
    d.setSelectedTrack("sticker"); d.setActiveTool("stickers"); d.setSelectedStickerSegmentId(segment.id);
    if (segment.stickerId) d.setSelectedStickerId(segment.stickerId);
    const startX = event.clientX; const startY = event.clientY;
    const timelineDuration = d.timelineDurationRef.current || Math.max(d.estimatedDuration, segment.start + segment.duration, 10);
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: d.trackScrollRef.current,
      pointerType: event.pointerType,
      timelineDuration,
      onScrollFrame: (clientX, scrollOffset) => move({ clientX, clientY: startY, preventDefault() {} }, scrollOffset),
    });
    const rect = d.trackScrollRef.current?.getBoundingClientRect();
    if (!rect || timelineDuration <= 0) { autoScroller.stop(); return; }
    const originalStart = segment.start || 0; const originalDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, segment.duration || DEFAULT_STICKER_SEGMENT_SECONDS);
    const originalEnd = originalStart + originalDuration;
    const snapPoints = collectTimelineSnapPoints(d, { track: "sticker", id: segment.id });
    let moved = false; let latestStart = originalStart; let latestDuration = originalDuration;
    const applyRange = (start, duration) => d.setStickerSegments((items) => items.map((item) => item.id === segment.id ? { ...item, start, duration } : item));
    const move = (e, scrollOffset = autoScroller?.getScrollOffset() || 0) => {
      const deltaX = e.clientX - startX; const deltaY = e.clientY - startY;
      if (!moved && isMobileTouch && Math.abs(deltaY) > Math.abs(deltaX)) return;
      if (!moved && Math.abs(deltaX) < 3) return;
      if (!moved) d.pauseForTimelineEdit?.();
      moved = true; e.preventDefault();
      autoScroller?.update(e.clientX);
      const dragClientX = autoScroller?.getDragClientX(e.clientX) ?? e.clientX;
      const delta = getTimelineDragTimeDelta({ clientX: dragClientX, startX, scrollOffset, contentWidth: rect.width, timelineDuration });
      let nextStart = edge === "start"
        ? Math.max(0, Math.min(originalEnd - MIN_VISUAL_SEGMENT_SECONDS, originalStart + delta))
        : originalStart;
      let nextEnd = edge === "end"
        ? Math.min(MAX_TIMELINE_DURATION_SECONDS, Math.max(originalStart + MIN_VISUAL_SEGMENT_SECONDS, originalEnd + delta))
        : originalEnd;
      const movingValue = edge === "start" ? nextStart : nextEnd;
      const snap = findClosestTimelineSnap(movingValue, snapPoints, (10 / Math.max(rect.width, 1)) * timelineDuration);
      if (snap) {
        if (edge === "start") nextStart = Math.max(0, Math.min(originalEnd - MIN_VISUAL_SEGMENT_SECONDS, snap.time));
        else nextEnd = Math.min(MAX_TIMELINE_DURATION_SECONDS, Math.max(originalStart + MIN_VISUAL_SEGMENT_SECONDS, snap.time));
      }
      latestStart = nextStart; latestDuration = nextEnd - nextStart;
      applyRange(latestStart, latestDuration);
      d.setSnapGuide?.(createTimelineSnapGuide(snap, edge));
      d.setTimelineHorizon((value) => getTimelineActiveDragHorizon(value, timelineDuration, nextEnd));
    };
    const cleanup = (settle) => {
      settleTimelineDrag(autoScroller, { active: moved, setTimelineHorizon: d.setTimelineHorizon, settle });
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); d.setSnapGuide?.(null);
    };
    const cancel = () => cleanup(() => applyRange(originalStart, originalDuration));
    const up = () => {
      const next = d.stickerSegments.map((item) => item.id === segment.id ? { ...item, start: latestStart, duration: latestDuration } : item);
      cleanup(() => {
        if (d.commitStickerSegments) d.commitStickerSegments(next, "已调整贴纸片段时长", segment.id);
        else applyRange(latestStart, latestDuration);
      });
      if (!moved) return;
      d.suppressTimelineClipClickRef.current = segment.id;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segment.id) d.suppressTimelineClipClickRef.current = ""; }, 160);
    };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
  };
  return {
    startAudioSegmentMove,
    startMusicMove: (event, id) => startSingleTrackMove(event, "music", id),
    startSourceAudioMove,
    startStickerSegmentMove,
    startStickerSegmentResize,
  };
}
