import { DEFAULT_STICKER_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { collectTimelineSnapPoints, findClosestTimelineSnap, snapTimelineRange } from "./timelineSnap.js";

export function createTimelineMoveControls(d) {
  const startSingleTrackMove = (event, track) => {
    if (event.button !== 0) return;
    d.pauseForTimelineEdit?.();
    const isSource = track === "source";
    const clipDuration = isSource ? d.sourceAudioDuration : d.musicDuration;
    const start = isSource ? d.sourceAudioStart : d.musicStart;
    if (!(clipDuration > 0) || d.trackLocks[track]) return void d.notify(`${isSource ? "视频原声" : "音乐"}轨已锁定，无法移动`);
    const rect = d.trackScrollRef.current?.getBoundingClientRect(); const duration = d.timelineDurationRef.current || 10;
    if (!rect) return;
    event.preventDefault(); event.stopPropagation(); d.setSelectedTrack(track);
    const startX = event.clientX; let moved = false; let latest = start;
    const originalMusicSegments = !isSource && Array.isArray(d.musicSegments) ? d.musicSegments : [];
    const snapPoints = collectTimelineSnapPoints(d, { track, id: track });
    const move = (e) => {
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      moved = true; e.preventDefault();
      const unsnapped = start + ((e.clientX - startX) / Math.max(rect.width, 1)) * duration;
      const snapped = snapTimelineRange(unsnapped, clipDuration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      latest = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - clipDuration, snapped.start));
      d.setSnapGuide?.(snapped.guide);
      if (isSource) { d.setSourceAudioLinked(false); d.setSourceAudioStart(latest); }
      else {
        d.setMusicStart(latest);
        if (originalMusicSegments.length) d.setMusicSegments?.(originalMusicSegments.map((segment) => ({ ...segment, start: segment.start + latest - start })));
      }
      d.setTimelineHorizon((value) => Math.max(value, Math.ceil((latest + clipDuration + 5) / 10) * 10));
    };
    const cleanup = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cleanup); d.setSnapGuide?.(null); };
    const up = () => { cleanup(); if (moved) {
      d.suppressTimelineClipClickRef.current = track;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === track) d.suppressTimelineClipClickRef.current = ""; }, 160);
      d.seekTo(latest); d.notify(`${isSource ? "视频原声" : "音乐"}片段位置已调整`);
    } };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cleanup);
  };
  const startAudioSegmentMove = (event, id = "") => {
    if (event.button !== 0) return;
    d.pauseForTimelineEdit?.();
    const segment = d.audioSegments.find((item) => item.id === id); if (!segment) return;
    if (d.trackLocks.audio) return void d.notify(d.t("audioTrackLockedMove"));
    const rect = d.trackScrollRef.current?.getBoundingClientRect(); const duration = d.timelineDurationRef.current || 10;
    if (!rect) return;
    event.stopPropagation(); d.setSelectedTrack("audio"); d.setSelectedAudioSegmentId(segment.id);
    const startX = event.clientX; const start = segment.start || 0;
    const snapPoints = collectTimelineSnapPoints(d, { track: "audio", id: segment.id });
    const captions = d.captionSegments.filter((caption) => caption.audioSegmentId === segment.id);
    let moved = false; let latest = start; let cancelledByPinch = false;
    const move = (e) => {
      if (cancelledByPinch || d.trackScrollRef.current?.classList.contains("is-pinching")) return;
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      moved = true; e.preventDefault();
      const unsnapped = start + ((e.clientX - startX) / Math.max(rect.width, 1)) * duration;
      const snapped = snapTimelineRange(unsnapped, segment.duration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      latest = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - segment.duration, snapped.start));
      d.setSnapGuide?.(snapped.guide);
      d.setAudioSegments((items) => items.map((item) => item.id === segment.id ? { ...item, start: latest } : item));
      const delta = latest - start;
      d.setCaptionSegments((items) => items.map((caption) => {
        const original = captions.find((item) => item.id === caption.id);
        return original ? { ...caption, start: original.start + delta, end: original.end + delta } : caption;
      }));
      d.setTimelineHorizon((value) => Math.max(value, Math.ceil((latest + segment.duration + 5) / 10) * 10));
    };
    const cancelForPinch = () => {
      cancelledByPinch = true;
      if (moved) {
        d.setAudioSegments((items) => items.map((item) => item.id === segment.id ? { ...item, start } : item));
        d.setCaptionSegments((items) => items.map((caption) => {
          const original = captions.find((item) => item.id === caption.id);
          return original ? { ...caption, start: original.start, end: original.end } : caption;
        }));
      }
      cleanup();
    };
    const cleanup = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cleanup);
      removeEventListener("timeline-mobile-pinch-start", cancelForPinch);
      d.setSnapGuide?.(null);
    };
    const up = () => { cleanup(); if (moved) {
      if (cancelledByPinch) return;
      d.suppressTimelineClipClickRef.current = segment.id;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segment.id) d.suppressTimelineClipClickRef.current = ""; }, 160);
      d.seekTo(latest); d.notify(d.t("audioClipMoved"));
    } };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cleanup); addEventListener("timeline-mobile-pinch-start", cancelForPinch);
  };
  const startStickerSegmentMove = (event, id = "", initialLane = 0) => {
    if (event.button !== 0) return;
    d.pauseForTimelineEdit?.();
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
    const segmentDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, segment.duration || DEFAULT_STICKER_SEGMENT_SECONDS);
    let moved = false; let latest = start; let latestLane = Math.max(0, Number(initialLane) || 0);
    const snapPoints = collectTimelineSnapPoints(d, { track: "sticker", id: segment.id });
    const move = (e) => {
      const deltaX = e.clientX - startX; const deltaY = e.clientY - startY;
      if (!moved && isMobileTouch && Math.abs(deltaY) > Math.abs(deltaX)) return;
      if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
      moved = true; e.preventDefault();
      const unsnapped = start + (deltaX / Math.max(rect.width, 1)) * duration;
      const snapped = snapTimelineRange(unsnapped, segmentDuration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      latest = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - segmentDuration, snapped.start));
      const laneElement = globalThis.document?.elementFromPoint?.(e.clientX, e.clientY)?.closest?.("[data-sticker-lane-index]");
      const pointedLane = Number(laneElement?.dataset?.stickerLaneIndex);
      if (Number.isInteger(pointedLane) && pointedLane >= 0) latestLane = pointedLane;
      d.setSnapGuide?.(snapped.guide);
      d.setStickerTimelineDrag?.({
        segmentId: segment.id,
        start: latest,
        duration: segmentDuration,
        lane: latestLane,
        name: segment.name,
        src: segment.src,
      });
    };
    const cleanup = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); d.setSnapGuide?.(null); };
    const cancel = () => { cleanup(); d.setStickerTimelineDrag?.(null); };
    const up = () => {
      cleanup(); d.setStickerTimelineDrag?.(null); if (!moved) return;
      d.suppressTimelineClipClickRef.current = segment.id;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segment.id) d.suppressTimelineClipClickRef.current = ""; }, 160);
      const next = d.stickerSegments.map((item) => item.id === segment.id ? { ...item, start: latest, lane: latestLane } : item);
      if (d.commitStickerSegments) d.commitStickerSegments(next, "已调整贴纸片段位置", segment.id);
      else d.notify("贴纸片段位置已调整");
      d.seekTo(latest);
    };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
  };
  const startStickerSegmentResize = (event, id = "", edge = "end") => {
    if (event.button !== 0) return;
    const segment = d.stickerSegments.find((item) => item.id === id); if (!segment) return;
    if (d.trackLocks.sticker) return void d.notify("贴纸轨已锁定，无法调整片段时长");
    const rect = d.trackScrollRef.current?.getBoundingClientRect();
    const timelineDuration = d.timelineDurationRef.current || Math.max(d.estimatedDuration, segment.start + segment.duration, 10);
    if (!rect || timelineDuration <= 0) return;
    const isMobileTouch = event.pointerType === "touch" && globalThis.window?.matchMedia?.("(max-width: 760px)").matches;
    if (!isMobileTouch) event.preventDefault();
    event.stopPropagation();
    d.setSelectedTrack("sticker"); d.setActiveTool("stickers"); d.setSelectedStickerSegmentId(segment.id);
    if (segment.stickerId) d.setSelectedStickerId(segment.stickerId);
    const startX = event.clientX; const startY = event.clientY;
    const originalStart = segment.start || 0; const originalDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, segment.duration || DEFAULT_STICKER_SEGMENT_SECONDS);
    const originalEnd = originalStart + originalDuration;
    const snapPoints = collectTimelineSnapPoints(d, { track: "sticker", id: segment.id });
    let moved = false; let latestStart = originalStart; let latestDuration = originalDuration;
    const applyRange = (start, duration) => d.setStickerSegments((items) => items.map((item) => item.id === segment.id ? { ...item, start, duration } : item));
    const move = (e) => {
      const deltaX = e.clientX - startX; const deltaY = e.clientY - startY;
      if (!moved && isMobileTouch && Math.abs(deltaY) > Math.abs(deltaX)) return;
      if (!moved && Math.abs(deltaX) < 3) return;
      if (!moved) d.pauseForTimelineEdit?.();
      moved = true; e.preventDefault();
      const delta = (deltaX / Math.max(rect.width, 1)) * timelineDuration;
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
      d.setSnapGuide?.(snap ? { time: snap.time, label: `${snap.time.toFixed(2)}s` } : null);
      d.setTimelineHorizon((value) => Math.max(value, Math.ceil((nextEnd + 5) / 10) * 10));
    };
    const cleanup = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); d.setSnapGuide?.(null); };
    const cancel = () => { cleanup(); if (moved) applyRange(originalStart, originalDuration); };
    const up = () => {
      cleanup(); if (!moved) return;
      d.suppressTimelineClipClickRef.current = segment.id;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segment.id) d.suppressTimelineClipClickRef.current = ""; }, 160);
      const next = d.stickerSegments.map((item) => item.id === segment.id ? { ...item, start: latestStart, duration: latestDuration } : item);
      if (d.commitStickerSegments) d.commitStickerSegments(next, "已调整贴纸片段时长", segment.id);
      else applyRange(latestStart, latestDuration);
    };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
  };
  return {
    startAudioSegmentMove,
    startMusicMove: (event) => startSingleTrackMove(event, "music"),
    startSourceAudioMove: (event) => startSingleTrackMove(event, "source"),
    startStickerSegmentMove,
    startStickerSegmentResize,
  };
}
