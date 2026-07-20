import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { getAudioSegmentPreviewVolume, getTimelineTrackLocalTime, isTimelineTimeInsideTrack } from "./editorRuntime.js";
import { getVisualSegmentIndexAtTime } from "./timeline.js";
import { getLinkedSourceAudioState } from "./sourceAudioSync.js";
import { getVisualSourceTime, normalizeVisualPlaybackRate } from "./visualEffects.js";

export function createPlaybackControls(deps) {
  const getSourceState = (timelineTime) => deps.sourceAudioLinked && deps.linkedSourceAudioSegments?.length
    ? getLinkedSourceAudioState(deps.linkedSourceAudioSegments, timelineTime)
    : {
        active: isTimelineTimeInsideTrack(timelineTime, deps.sourceAudioStart, deps.sourceAudioDuration),
        sourceTime: getTimelineTrackLocalTime(timelineTime, deps.sourceAudioStart, deps.sourceAudioDuration),
        playbackRate: 1,
      };
  const pauseTimelineMedia = () => {
    deps.audioSegmentRefs.current.forEach((audio) => audio.pause()); deps.sourceAudioRef.current?.pause();
    deps.musicRef.current?.pause(); deps.previewVideoRef.current?.pause();
  };
  const seekTo = (time) => {
    const clamped = Math.max(0, Math.min(deps.timelineDurationRef.current || MAX_TIMELINE_DURATION_SECONDS, time));
    deps.currentTimeRef.current = clamped; deps.setCurrentTime(clamped);
    deps.audioSegments.forEach((segment) => {
      const audio = deps.audioSegmentRefs.current.get(segment.id);
      if (audio) audio.currentTime = Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(clamped, segment.start, segment.duration);
    });
    if (deps.sourceAudioRef.current) deps.sourceAudioRef.current.currentTime = getSourceState(clamped).sourceTime;
    if (deps.musicRef.current) deps.musicRef.current.currentTime = getTimelineTrackLocalTime(clamped, deps.musicStart, deps.musicDuration);
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
    seekTo(getTimelineTimeFromClientX(event.clientX));
    const move = (e) => seekTo(getTimelineTimeFromClientX(e.clientX));
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true });
  };
  const handlePlayToggle = () => {
    const video = deps.previewVideoRef.current;
    const voices = deps.trackVisibility.audio ? deps.audioSegments.map((segment) => ({ segment, audio: deps.audioSegmentRefs.current.get(segment.id) })).filter(({ audio }) => audio) : [];
    const source = deps.trackVisibility.source ? deps.sourceAudioRef.current : null;
    const music = deps.trackVisibility.music ? deps.musicRef.current : null;
    if (deps.isPlaying) { pauseTimelineMedia(); deps.setIsPlaying(false); return; }
    if (!deps.canPreview) return void deps.notify("请先上传图片/视频素材、生成配音或上传背景音乐");
    if (deps.currentTimeRef.current >= deps.estimatedDuration - 0.02) seekTo(0);
    const timelineTime = deps.currentTimeRef.current;
    const playIf = (media, ready) => ready ? media?.play().catch(() => {}) : media?.pause();
    voices.forEach(({ segment, audio }) => {
      const active = isTimelineTimeInsideTrack(timelineTime, segment.start, segment.duration);
      audio.currentTime = Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(timelineTime, segment.start, segment.duration);
      audio.volume = getAudioSegmentPreviewVolume(segment, timelineTime); audio.playbackRate = 1; playIf(audio, active);
    });
    if (source && deps.sourceAudioUrl) {
      const sourceState = getSourceState(timelineTime);
      source.currentTime = sourceState.sourceTime;
      source.playbackRate = sourceState.playbackRate;
      playIf(source, sourceState.active);
    }
    if (music && deps.musicUrl) { const active = isTimelineTimeInsideTrack(timelineTime, deps.musicStart, deps.musicDuration); music.currentTime = getTimelineTrackLocalTime(timelineTime, deps.musicStart, deps.musicDuration); playIf(music, active); }
    if (video && deps.previewVisualType === "video") {
      const index = getVisualSegmentIndexAtTime(deps.visualSegments, timelineTime);
      const range = deps.visualTimeline[Math.max(0, index)] ?? deps.currentVisualRange;
      const local = range ? Math.max(0, timelineTime - range.start) : timelineTime;
      const segment = deps.visualSegments[Math.max(0, index)];
      video.playbackRate = normalizeVisualPlaybackRate(segment?.playbackRate);
      const sourceTime = getVisualSourceTime(segment, local);
      video.currentTime = Math.min(sourceTime, video.duration || sourceTime); playIf(video, true);
    }
    deps.setIsPlaying(true);
  };
  return { getTimelineTimeFromClientX, handlePlayToggle, pauseTimelineMedia, seekTo, startTimelineSeek };
}
