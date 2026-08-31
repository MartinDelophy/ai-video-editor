import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { getAudioSegmentPreviewVolume, getTimelineTrackLocalTime, isTimelineTimeInsideTrack, requestTimelineMediaPlay, setTimelineAudioGain } from "./editorRuntime.js";
import { getVisualSegmentIndexAtTime, isTimedSegmentLaneVisible } from "./timeline.js";
import { getLinkedSourceAudioState } from "./sourceAudioSync.js";
import { getVisualPlaybackRateAtTime, getVisualSourceTime } from "./visualEffects.js";
import { requestLatestVideoFrame } from "./videoFrameSync.js";

export function createPlaybackControls(deps) {
  const isTrackAudible = (track) => deps.trackVisibility?.[track] !== false;
  const getSourceState = (timelineTime) => deps.sourceAudioLinked && deps.linkedSourceAudioSegments?.length
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
    deps.currentTimeRef.current = clamped; deps.setCurrentTime(clamped);
    // Seeking while playback is active must also move the fallback timeline
    // clock. This matters after trimming: the video element can briefly be
    // paused/ended while its new source range is applied, so the animation
    // clock otherwise keeps its pre-seek origin and the UI remains stuck with
    // a visible Pause button.
    if (deps.isPlaying) {
      deps.visualPlaybackStartTimeRef.current = clamped;
      deps.visualPlaybackStartedAtRef.current = performance.now();
      deps.visualPlaybackLastUpdateRef.current = 0;
    }
    syncPreviewVideoTime(clamped, options);
    deps.audioSegments.forEach((segment) => {
      const audio = deps.audioSegmentRefs.current.get(segment.id);
      if (audio) audio.currentTime = Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(clamped, segment.start, segment.duration) * Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1));
    });
    if (deps.sourceAudioRef.current) deps.sourceAudioRef.current.currentTime = getSourceState(clamped).sourceTime;
    if (deps.musicRef.current) deps.musicRef.current.currentTime = getMusicState(clamped).sourceTime;
    if (deps.isPlaying) {
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
    seekTo(getTimelineTimeFromClientX(event.clientX), { immediate: true });
    const move = (e) => seekTo(getTimelineTimeFromClientX(e.clientX));
    const cleanup = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      window.dispatchEvent(new CustomEvent("timeline-seek-state", { detail: { active: false } }));
    };
    const up = (upEvent) => {
      cleanup();
      seekTo(getTimelineTimeFromClientX(upEvent.clientX), { immediate: true });
    };
    const cancel = () => cleanup();
    addEventListener("pointermove", move);
    addEventListener("pointerup", up, { once: true });
    addEventListener("pointercancel", cancel, { once: true });
  };
  const handlePlayToggle = () => {
    const video = deps.previewVideoRef.current;
    const voices = isTrackAudible("audio") ? deps.audioSegments
      .filter((segment) => isTimedSegmentLaneVisible(deps.audioSegments, segment.id, deps.trackVisibility))
      .map((segment) => ({ segment, audio: deps.audioSegmentRefs.current.get(segment.id) }))
      .filter(({ audio }) => audio) : [];
    const source = isTrackAudible("source") ? deps.sourceAudioRef.current : null;
    const music = isTrackAudible("music") ? deps.musicRef.current : null;
    if (deps.isPlaying) { pauseTimelineMedia(); deps.setIsPlaying(false); return; }
    if (!deps.canPreview) return void deps.notify("请先上传图片/视频素材、生成配音或上传背景音乐");
    if (deps.currentTimeRef.current >= deps.estimatedDuration - 0.02) seekTo(0);
    const timelineTime = deps.currentTimeRef.current;
    const playIf = (media, ready) => ready ? requestTimelineMediaPlay(media) : media?.pause();
    voices.forEach(({ segment, audio }) => {
      const active = isTimelineTimeInsideTrack(timelineTime, segment.start, segment.duration);
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
