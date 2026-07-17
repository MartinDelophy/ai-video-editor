import { DEFAULT_STICKER_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { collectTimelineSnapPoints, snapTimelineRange } from "./timelineSnap.js";

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
    event.preventDefault(); event.stopPropagation(); d.setSelectedTrack(track); d.setActiveTool("audio");
    const startX = event.clientX; let moved = false; let latest = start;
    const snapPoints = collectTimelineSnapPoints(d, { track, id: track });
    const move = (e) => {
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      moved = true; e.preventDefault();
      const unsnapped = start + ((e.clientX - startX) / Math.max(rect.width, 1)) * duration;
      const snapped = snapTimelineRange(unsnapped, clipDuration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      latest = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - clipDuration, snapped.start));
      d.setSnapGuide?.(snapped.guide);
      if (isSource) { d.setSourceAudioLinked(false); d.setSourceAudioStart(latest); }
      else d.setMusicStart(latest);
      d.setTimelineHorizon((value) => Math.max(value, Math.ceil((latest + clipDuration + 5) / 10) * 10));
    };
    const cleanup = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cleanup); d.setSnapGuide?.(null); };
    const up = () => { cleanup(); if (moved) { d.seekTo(latest); d.notify(`${isSource ? "视频原声" : "音乐"}片段位置已调整`); } };
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
    let moved = false; let latest = start;
    const move = (e) => {
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
    const cleanup = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cleanup); d.setSnapGuide?.(null); };
    const up = () => { cleanup(); if (moved) { d.seekTo(latest); d.notify(d.t("audioClipMoved")); } };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cleanup);
  };
  const startStickerSegmentMove = (event, id = "") => {
    if (event.button !== 0) return;
    d.pauseForTimelineEdit?.();
    const segment = d.stickerSegments.find((item) => item.id === id); if (!segment) return;
    if (d.trackLocks.sticker) return void d.notify("贴纸轨已锁定，无法移动贴纸");
    const rect = d.trackScrollRef.current?.getBoundingClientRect();
    const duration = d.timelineDurationRef.current || Math.max(d.estimatedDuration, segment.start + segment.duration, 10);
    if (!rect || duration <= 0) return;
    event.preventDefault(); event.stopPropagation(); d.setSelectedTrack("sticker"); d.setActiveTool("stickers"); d.setSelectedStickerSegmentId(segment.id);
    if (segment.stickerId) d.setSelectedStickerId(segment.stickerId);
    const startX = event.clientX; const startY = event.clientY; const start = segment.start || 0;
    const segmentDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, segment.duration || DEFAULT_STICKER_SEGMENT_SECONDS);
    let moved = false; let latest = start;
    const snapPoints = collectTimelineSnapPoints(d, { track: "sticker", id: segment.id });
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
      moved = true; e.preventDefault();
      const unsnapped = start + ((e.clientX - startX) / Math.max(rect.width, 1)) * duration;
      const snapped = snapTimelineRange(unsnapped, segmentDuration, snapPoints, (10 / Math.max(rect.width, 1)) * duration);
      latest = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - segmentDuration, snapped.start));
      d.setSnapGuide?.(snapped.guide);
      d.setStickerSegments((items) => items.map((item) => item.id === segment.id ? { ...item, start: latest } : item));
    };
    const cleanup = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cleanup); d.setSnapGuide?.(null); };
    const up = () => {
      cleanup(); if (!moved) return;
      d.suppressTimelineClipClickRef.current = segment.id;
      setTimeout(() => { if (d.suppressTimelineClipClickRef.current === segment.id) d.suppressTimelineClipClickRef.current = ""; }, 160);
      d.seekTo(latest); d.notify("贴纸片段位置已调整");
    };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cleanup);
  };
  return {
    startAudioSegmentMove,
    startMusicMove: (event) => startSingleTrackMove(event, "music"),
    startSourceAudioMove: (event) => startSingleTrackMove(event, "source"),
    startStickerSegmentMove,
  };
}
