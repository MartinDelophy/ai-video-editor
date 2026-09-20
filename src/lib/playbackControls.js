import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { getAudioSegmentPreviewVolume, getTimelineTrackLocalTime, isAudioSegmentAudible, isTimelineTimeInsideTrack, requestTimelineMediaPlay, setTimelineAudioGain } from "./editorRuntime.js";
import { filterTimedSegmentsByLaneVisibility, getVisualSegmentIndexAtTime } from "./timeline.js";
import { getLinkedSourceAudioState } from "./sourceAudioSync.js";
import { getVisualPlaybackRateAtTime, getVisualSourceTime } from "./visualEffects.js";
import { requestLatestVideoFrame } from "./videoFrameSync.js";
import { normalizeTimelineMarkers } from "./timelineMarkers.js";
import { createTimelineSnapGuide, findClosestTimelineSnap } from "./timelineSnap.js";

export function createPlaybackControls(deps) {
  const isTrackAudible = (track) => deps.trackVisibility?.[track] !== false;
  const getSourceState = (timelineTime) => deps.sourceAudioLinked
    ? getLinkedSourceAudioState(deps.linkedSourceAudioSegments, timelineTime)
    : {
        active: isTimelineTimeInsideTrack(timelineTime, deps.sourceAudioStart, deps.sourceAudioDuration),
        sourceTime: getTimelineTrackLocalTime(timelineTime, deps.sourceAudioStart, deps.sourceAudioDuration),
        playbackRate: 1,
      };
  const getMusicState = (timelineTime) => {
    const segments = deps.musicSegments?.length ? deps.musicSegments : [{ start: deps.musicStart, duration: deps.musicDuration, sourceStart: 0, playbackRate: 1 }];
    const segment = segments.find((item) => isTimelineTimeInsideTrack(timelineTime, item.start, item.duration));
    if (!segment) return { active: false, sourceTime: 0, playbackRate: 1 };
    const playbackRate = Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1));
    return {
      active: true,
      playbackRate,
      sourceTime: Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(timelineTime, segment.start, segment.duration) * playbackRate,
    };
  };
  const pauseTimelineMedia = () => {
    deps.audioSegmentRefs.current.forEach((audio) => audio.pause()); deps.sourceAudioRef.current?.pause();
    deps.musicRef.current?.pause(); deps.previewVideoRef.current?.pause();
  };
  const syncPreviewVideoTime = (timelineTime, { immediate = false } = {}) => {
    const video = deps.previewVideoRef.current;
    if (!video || deps.previewVisualType !== "video") return;
    const index = getVisualSegmentIndexAtTime(deps.visualSegments, timelineTime);
    if (index < 0) return;
    const segment = deps.visualSegments[index];
    // When a seek crosses into another clip React will replace/update the
    // preview element on the next render. Do not apply the new clip's source
    // time to the element that still belongs to the previous clip.
    if (deps.previewVisualSegment?.id && segment?.id !== deps.previewVisualSegment.id) return;
    const range = deps.visualTimeline[index];
    const localTime = range ? Math.max(0, timelineTime - range.start) : timelineTime;
    const sourceTime = getVisualSourceTime(segment, localTime);
    const duration = Number(video.duration);
    const maxTime = Number.isFinite(duration) && duration > 0
      ? Math.max(0, duration - 0.001)
      : sourceTime;
    const targetTime = Math.max(0, Math.min(sourceTime, maxTime));
    video.playbackRate = getVisualPlaybackRateAtTime(segment, localTime);
    if ("preservesPitch" in video) video.preservesPitch = true;
    if (Number.isFinite(targetTime)) {
      requestLatestVideoFrame(video, targetTime, {
        immediate,
        onPresented: deps.setPreviewVideoMediaTime,
      });
    }
  };
  const seekTo = (time, options = {}) => {
    const clamped = Math.max(0, Math.min(deps.timelineDurationRef.current || MAX_TIMELINE_DURATION_SECONDS, time));
    const shouldPlay = deps.isPlaying && !options.pause;
    deps.currentTimeRef.current = clamped; deps.setCurrentTime(clamped);
    // Seeking while playback is active must also move the fallback timeline
    // clock. This matters after trimming: the video element can briefly be
    // paused/ended while its new source range is applied, so the animation
    // clock otherwise keeps its pre-seek origin and the UI remains stuck with
    // a visible Pause button.
    if (shouldPlay) {
      deps.visualPlaybackStartTimeRef.current = clamped;
      deps.visualPlaybackStartedAtRef.current = performance.now();
      deps.visualPlaybackLastUpdateRef.current = 0;
    }
    syncPreviewVideoTime(clamped, options);
    const audibleAudioIds = shouldPlay ? new Set(
      filterTimedSegmentsByLaneVisibility(deps.audioSegments, deps.trackVisibility)
        .filter(isAudioSegmentAudible).map((segment) => segment.id),
    ) : null;
    // Paused audio has no visible frame to scrub. Seek only running, audible
    // clips; every clip is aligned to its exact source time when it starts.
    // This avoids seeking all offscreen clips and silent source backups on
    // every pointer move in a large project.
    deps.audioSegments.forEach((segment) => {
      const audio = deps.audioSegmentRefs.current.get(segment.id);
      if (!audio) return;
      if (audibleAudioIds?.has(segment.id) && isTimelineTimeInsideTrack(clamped, segment.start, segment.duration)) {
        audio.currentTime = Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(clamped, segment.start, segment.duration) * Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1));
      } else if (!audio.paused) audio.pause();
    });
    const seekRunningTrack = (media, state, track) => {
      if (!media) return;
      if (shouldPlay && state.active && isTrackAudible(track)) media.currentTime = state.sourceTime;
      else if (!media.paused) media.pause();
    };
    seekRunningTrack(deps.sourceAudioRef.current, getSourceState(clamped), "source");
    seekRunningTrack(deps.musicRef.current, getMusicState(clamped), "music");
    if (shouldPlay) {
      const video = deps.previewVideoRef.current;
      const index = getVisualSegmentIndexAtTime(deps.visualSegments, clamped);
      const segment = index >= 0 ? deps.visualSegments[index] : null;
      if (video && deps.previewVisualType === "video" && (!deps.previewVisualSegment?.id || segment?.id === deps.previewVisualSegment.id)) {
        requestTimelineMediaPlay(video);
      }
    }
  };
  const getTimelineTimeFromClientX = (clientX) => {
    const rect = deps.trackScrollRef.current?.getBoundingClientRect(); const duration = deps.timelineDurationRef.current;
    if (!rect || duration <= 0) return 0;
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / Math.max(rect.width, 1)) * duration));
  };
  const startTimelineSeek = (event) => {
    if (event.button !== 0 || deps.timelineDuration <= 0) return;
    event.preventDefault(); event.stopPropagation();
    if (deps.isPlaying) {
      pauseTimelineMedia();
      deps.setIsPlaying(false);
    }
    window.dispatchEvent(new CustomEvent("timeline-seek-state", { detail: { active: true } }));
    // Pointer devices can deliver several moves per display frame. Keep only
    // the newest position before doing layout reads, React updates and media
    // seeks; the initial press and final release still commit synchronously.
    let pendingFrame = 0;
    let latestClientX = event.clientX;
    let bypassSnap = event.altKey;
    const snapPoints = normalizeTimelineMarkers(deps.timelineMarkers).flatMap((marker) => [
      { time: marker.time, track: "marker", id: marker.id, edge: "start" },
      ...(marker.type === "range" ? [{ time: marker.endTime, track: "marker", id: marker.id, edge: "end" }] : []),
    ]).filter((point) => point.time <= deps.timelineDurationRef.current);
    const commit = (immediate = false) => {
      pendingFrame = 0;
      const time = getTimelineTimeFromClientX(latestClientX);
      const width = deps.trackScrollRef.current?.getBoundingClientRect().width;
      const snap = !bypassSnap && width > 0
        ? findClosestTimelineSnap(time, snapPoints, 10 / width * deps.timelineDurationRef.current) : null;
      deps.setSnapGuide?.(createTimelineSnapGuide(snap, "playhead"));
      seekTo(snap?.time ?? time, { immediate, pause: true });
    };
    commit(true);
    const isPointer = (e) => e.pointerId === event.pointerId;
    const move = (e) => {
      if (!isPointer(e)) return;
      latestClientX = e.clientX;
      bypassSnap = e.altKey;
      if (!pendingFrame) pendingFrame = window.requestAnimationFrame(() => commit());
    };
    const modifier = (e) => {
      if (e.key !== "Alt") return;
      bypassSnap = e.altKey;
      if (!pendingFrame) pendingFrame = window.requestAnimationFrame(() => commit());
    };
    const cleanup = () => {
      if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      removeEventListener("blur", cancel);
      removeEventListener("keydown", modifier);
      removeEventListener("keyup", modifier);
      window.dispatchEvent(new CustomEvent("timeline-seek-state", { detail: { active: false } }));
    };
    const up = (upEvent) => {
      if (!isPointer(upEvent)) return;
      latestClientX = upEvent.clientX;
      bypassSnap = upEvent.altKey;
      cleanup();
      commit(true);
      deps.setSnapGuide?.(null);
    };
    const cancel = (cancelEvent) => {
      if (cancelEvent.type !== "blur" && !isPointer(cancelEvent)) return;
      cleanup();
      commit(true);
      deps.setSnapGuide?.(null);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
    addEventListener("blur", cancel);
    addEventListener("keydown", modifier);
    addEventListener("keyup", modifier);
  };
  const handlePlayToggle = () => {
    const video = deps.previewVideoRef.current;
    const voices = isTrackAudible("audio") ? filterTimedSegmentsByLaneVisibility(deps.audioSegments, deps.trackVisibility)
      .filter(isAudioSegmentAudible)
      .map((segment) => ({ segment, audio: deps.audioSegmentRefs.current.get(segment.id) }))
      .filter(({ audio }) => audio) : [];
    const source = isTrackAudible("source") ? deps.sourceAudioRef.current : null;
    const music = isTrackAudible("music") ? deps.musicRef.current : null;
    if (deps.isPlaying) {
      // Native playhead animation can advance while the UI thread is busy.
      // Resolve its same wall clock before pausing instead of rewinding to
      // currentTimeRef, which was last updated by a possibly delayed rAF.
      const startedAt = Number(deps.visualPlaybackStartedAtRef?.current);
      const startTime = Number(deps.visualPlaybackStartTimeRef?.current);
      const liveTime = startedAt > 0 && Number.isFinite(startTime)
        ? startTime + Math.max(0, performance.now() - startedAt) / 1000
        : Number(deps.currentTimeRef.current) || 0;
      pauseTimelineMedia();
      const pausedTime = Math.max(0, Math.min(deps.estimatedDuration, liveTime));
      deps.currentTimeRef.current = pausedTime;
      deps.setCurrentTime(pausedTime);
      deps.setIsPlaying(false);
      return;
    }
    if (!deps.canPreview) return void deps.notify("请先上传图片/视频素材、生成配音或上传背景音乐");
    if (deps.currentTimeRef.current >= deps.estimatedDuration - 0.02) seekTo(0);
    const timelineTime = deps.currentTimeRef.current;
    const playIf = (media, ready) => ready ? requestTimelineMediaPlay(media) : media?.pause();
    voices.forEach(({ segment, audio }) => {
      const active = isTimelineTimeInsideTrack(timelineTime, segment.start, segment.duration);
      if (!active) {
        if (!audio.paused) audio.pause();
        return;
      }
      const playbackRate = Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1));
      audio.currentTime = Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(timelineTime, segment.start, segment.duration) * playbackRate;
      setTimelineAudioGain(audio, getAudioSegmentPreviewVolume(segment, timelineTime), segment.spatialEffect, segment.spatialAmount); audio.playbackRate = playbackRate;
      if ("preservesPitch" in audio) audio.preservesPitch = true;
      playIf(audio, active);
    });
    if (source && deps.sourceAudioUrl) {
      const sourceState = getSourceState(timelineTime);
      source.currentTime = sourceState.sourceTime;
      source.playbackRate = sourceState.playbackRate;
      setTimelineAudioGain(source, deps.sourceAudioVolume, deps.sourceAudioSpatialEffect, deps.sourceAudioSpatialAmount);
      if ("preservesPitch" in source) source.preservesPitch = true;
      playIf(source, sourceState.active);
    }
    if (music && deps.musicUrl) { const state = getMusicState(timelineTime); const segment = deps.musicSegments?.find((item) => isTimelineTimeInsideTrack(timelineTime, item.start, item.duration)); music.currentTime = state.sourceTime; music.playbackRate = state.playbackRate; setTimelineAudioGain(music, segment ? getAudioSegmentPreviewVolume({ ...segment, volume: segment.volume ?? deps.musicVolume }, timelineTime) : deps.musicVolume, segment?.spatialEffect, segment?.spatialAmount); if ("preservesPitch" in music) music.preservesPitch = true; playIf(music, state.active); }
    if (video && deps.previewVisualType === "video") {
      syncPreviewVideoTime(timelineTime);
      playIf(video, true);
    }
    deps.setIsPlaying(true);
  };
  return { getTimelineTimeFromClientX, handlePlayToggle, pauseTimelineMedia, seekTo, startTimelineSeek };
}
