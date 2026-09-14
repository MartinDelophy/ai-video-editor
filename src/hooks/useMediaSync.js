import { useEffect, useMemo } from "react";
import { PLAYBACK_UI_FRAME_MS, getAudioSegmentPreviewVolume, getTimelineTrackLocalTime, isAudioSegmentAudible, isTimelineTimeInsideTrack, requestTimelineMediaPlay, setTimelineAudioGain, shouldCorrectPreviewMediaTime } from "../lib/editorRuntime.js";
import { getLinkedSourceAudioState } from "../lib/sourceAudioSync.js";
import { filterTimedSegmentsByLaneVisibility } from "../lib/timeline.js";
import { cancelLatestVideoFrameRequest, requestLatestVideoFrame } from "../lib/videoFrameSync.js";
import { getVisualPlaybackRateAtTime } from "../lib/visualEffects.js";

export function syncTimelineAudioElement(media, { active, shouldPlay, expectedTime, playbackRate = 1 }) {
  if (!media) return;
  if (!shouldPlay || !active) {
    if (!media.paused) media.pause();
    return;
  }
  if (media.playbackRate !== playbackRate) media.playbackRate = playbackRate;
  if ("preservesPitch" in media && !media.preservesPitch) media.preservesPitch = true;
  // React's timeline clock is intentionally throttled. Chasing it while the
  // native media clock is running causes repeated seeks and audible stutter.
  // Align only when starting (or entering a new segment), then let the browser
  // audio clock run continuously until an explicit seek or pause.
  if (media.paused && !media.__timelinePlayPending) {
    if (Math.abs(media.currentTime - expectedTime) > 0.04) media.currentTime = expectedTime;
    requestTimelineMediaPlay(media);
  }
}

export function syncVoiceAudioSegments({ segments, refs, timelineTime, isPlaying, visibility, visibleSegmentIds }) {
  const visibleIds = visibleSegmentIds ?? new Set(
    filterTimedSegmentsByLaneVisibility(segments, visibility).map((segment) => segment.id),
  );
  segments.forEach((segment) => {
    const audio = refs.current.get(segment.id);
    if (!audio) return;
    if (!isPlaying || !visibleIds.has(segment.id) || !isAudioSegmentAudible(segment)) {
      if (!audio.paused) audio.pause();
      return;
    }
    const active = isTimelineTimeInsideTrack(timelineTime, segment.start, segment.duration);
    const playbackRate = Math.max(0.25, Math.min(4, Number(segment.playbackRate) || 1));
    const expected = Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(timelineTime, segment.start, segment.duration) * playbackRate;
    syncTimelineAudioElement(audio, { active, shouldPlay: true, expectedTime: expected, playbackRate });
  });
}

export function useMediaSync(d) {
  // Lane packing depends on edits and visibility, never on the playback clock.
  const visibleAudioSegmentIds = useMemo(() => new Set(
    filterTimedSegmentsByLaneVisibility(d.audioSegments, d.trackVisibility).map((segment) => segment.id),
  ), [d.audioSegments, d.trackVisibility]);
  useEffect(() => {
    const video = d.previewVideoRef.current;
    return () => cancelLatestVideoFrameRequest(video);
  }, [d.previewVideoRef, d.previewVisualSrc, d.previewVisualType]);
  useEffect(() => { d.audioSegments.forEach((s) => { const a = d.audioSegmentRefs.current.get(s.id); if (a) setTimelineAudioGain(a, getAudioSegmentPreviewVolume(s, d.currentTime), s.spatialEffect, s.spatialAmount); }); }, [d.audioSegments, d.currentTime]);
  useEffect(() => {
    syncVoiceAudioSegments({
      segments: d.audioSegments,
      refs: d.audioSegmentRefs,
      timelineTime: d.currentTime,
      isPlaying: d.isPlaying,
      visibility: d.trackVisibility,
      visibleSegmentIds: visibleAudioSegmentIds,
    });
  }, [d.audioSegments, d.currentTime, d.isPlaying, d.trackVisibility, visibleAudioSegmentIds]);
  useEffect(() => { if (d.sourceAudioRef.current) setTimelineAudioGain(d.sourceAudioRef.current, d.sourceAudioVolume, d.sourceAudioSpatialEffect, d.sourceAudioSpatialAmount); }, [d.sourceAudioSpatialAmount, d.sourceAudioSpatialEffect, d.sourceAudioVolume, d.sourceAudioUrl]);
  useEffect(() => {
    const a = d.sourceAudioRef.current; if (!a || !d.sourceAudioUrl) return;
    const state = d.sourceAudioLinked
      ? getLinkedSourceAudioState(d.linkedSourceAudioSegments, d.currentTime)
      : { active: isTimelineTimeInsideTrack(d.currentTime, d.sourceAudioStart, d.sourceAudioDuration), sourceTime: getTimelineTrackLocalTime(d.currentTime, d.sourceAudioStart, d.sourceAudioDuration), playbackRate: 1 };
    const play = d.isPlaying && d.trackVisibility?.source !== false && state.active;
    syncTimelineAudioElement(a, { active: state.active, shouldPlay: play, expectedTime: state.sourceTime, playbackRate: state.playbackRate });
  }, [d.currentTime, d.isPlaying, d.linkedSourceAudioSegments, d.sourceAudioDuration, d.sourceAudioLinked, d.sourceAudioStart, d.sourceAudioUrl, d.trackVisibility.source]);
  useEffect(() => {
    const music = d.musicRef.current;
    if (!music) return;
    const segment = d.musicSegments?.find((item) => isTimelineTimeInsideTrack(d.currentTime, item.start, item.duration));
    setTimelineAudioGain(music, segment
      ? getAudioSegmentPreviewVolume({ ...segment, volume: segment.volume ?? d.musicVolume }, d.currentTime)
      : d.musicVolume, segment?.spatialEffect, segment?.spatialAmount);
  }, [d.currentTime, d.musicSegments, d.musicVolume, d.musicUrl]);
  useEffect(() => {
    const music = d.musicRef.current; if (!music || !d.musicUrl) return;
    const segments = d.musicSegments?.length ? d.musicSegments : [{ start: d.musicStart, duration: d.musicDuration, sourceStart: 0, playbackRate: 1 }];
    const segment = segments.find((item) => isTimelineTimeInsideTrack(d.currentTime, item.start, item.duration));
    const active = Boolean(segment);
    const playbackRate = Math.max(0.25, Math.min(4, Number(segment?.playbackRate) || 1));
    const expected = segment ? Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(d.currentTime, segment.start, segment.duration) * playbackRate : 0;
    const play = d.isPlaying && d.trackVisibility?.music !== false && active;
    syncTimelineAudioElement(music, { active, shouldPlay: play, expectedTime: expected, playbackRate });
  }, [d.currentTime, d.isPlaying, d.musicDuration, d.musicSegments, d.musicStart, d.musicUrl, d.trackVisibility.music]);
  useEffect(() => { d.currentTimeRef.current = d.currentTime; }, [d.currentTime]);
  useEffect(() => { d.setPreviewVideoMediaTime(d.previewVisualType === "video" ? Math.max(0, Number(d.previewVisualSegment?.sourceStart) || 0) : 0); }, [d.previewVisualSegment?.id, d.previewVisualSrc, d.previewVisualType]);
  useEffect(() => {
    const v = d.previewVideoRef.current; if (!v || d.previewVisualType !== "video") return;
    const localTime = Math.max(0, d.currentTime - (d.previewVisualRange?.start || 0));
    v.playbackRate = getVisualPlaybackRateAtTime(d.previewVisualSegment, localTime);
    if ("preservesPitch" in v) v.preservesPitch = true;
  }, [d.currentTime, d.previewVisualRange?.start, d.previewVisualSegment, d.previewVisualSrc, d.previewVisualType]);
  useEffect(() => {
    const v = d.previewVideoRef.current; if (!v || d.previewVisualType !== "video") return;
    const sourceStart = Math.max(0, Number(d.previewVisualSegment?.sourceStart) || 0);
    const max = Math.max(0, (Number(v.duration) || sourceStart) - 0.001);
    const time = Math.min(sourceStart, max);
    if (Number.isFinite(time) && Math.abs(v.currentTime - time) > 0.04) {
      requestLatestVideoFrame(v, time, {
        immediate: true,
        onPresented: d.setPreviewVideoMediaTime,
      });
    }
  }, [d.previewVisualSegment?.id, d.previewVisualSegment?.sourceStart, d.previewVisualSrc, d.previewVisualType]);
  useEffect(() => {
    const v = d.previewVideoRef.current; if (!v || d.previewVisualType !== "video") return;
    const max = Math.max(0, (Number(v.duration) || d.previewVisualSourceTime) - 0.001);
    const time = Math.min(Math.max(0, d.previewVisualSourceTime), max);
    if (shouldCorrectPreviewMediaTime({ isPlaying: d.isPlaying, currentTime: v.currentTime, targetTime: time })) {
      requestLatestVideoFrame(v, time, {
        onPresented: d.setPreviewVideoMediaTime,
      });
    }
  }, [d.isPlaying, d.previewVisualSegment?.id, d.previewVisualSourceTime, d.previewVisualSrc, d.previewVisualType]);
  useEffect(() => {
    const v = d.previewVideoRef.current; if (!v || d.previewVisualType !== "video") return;
    if (!d.isPlaying || d.trackVisibility?.image === false) v.pause(); else requestTimelineMediaPlay(v);
  }, [d.isPlaying, d.previewVisualSegment?.id, d.previewVisualSrc, d.previewVisualType, d.trackVisibility.image]);
  // Clip changes and filmstrip refinement must not re-anchor the master clock.
  // Explicit seeks update its refs directly; only playback state or the actual
  // project duration starts a new clock session.
  useEffect(() => {
    if (!d.isPlaying || d.estimatedDuration <= 0) return undefined;
    const start = d.currentTimeRef.current >= d.estimatedDuration - 0.02 ? 0 : Math.max(0, d.currentTimeRef.current);
    if (start !== d.currentTimeRef.current) { d.setCurrentTime(start); d.currentTimeRef.current = start; }
    d.visualPlaybackStartTimeRef.current = start; d.visualPlaybackStartedAtRef.current = performance.now(); d.visualPlaybackLastUpdateRef.current = 0;
    const tick = (now) => {
      const wallClockTime = Math.min(
        d.estimatedDuration,
        d.visualPlaybackStartTimeRef.current + (now - d.visualPlaybackStartedAtRef.current) / 1000,
      );
      // The timeline is the monotonic master clock. A video element can stall
      // just before `ended` while decoding its tail; using that media time as
      // the clock pins the playhead inside one clip and appears to loop it.
      // Video/audio elements are synchronized to this clock, never vice versa.
      const next = wallClockTime;
      d.currentTimeRef.current = next;
      if (now - d.visualPlaybackLastUpdateRef.current > PLAYBACK_UI_FRAME_MS || next >= d.estimatedDuration) {
        d.visualPlaybackLastUpdateRef.current = now;
        d.setCurrentTime(next);
      }
      if (next >= d.estimatedDuration) { d.pauseTimelineMedia(); d.setIsPlaying(false); d.visualPlaybackFrameRef.current = 0; return; }
      d.visualPlaybackFrameRef.current = requestAnimationFrame(tick);
    };
    d.visualPlaybackFrameRef.current = requestAnimationFrame(tick);
    return () => { if (d.visualPlaybackFrameRef.current) { cancelAnimationFrame(d.visualPlaybackFrameRef.current); d.visualPlaybackFrameRef.current = 0; } };
  }, [d.estimatedDuration, d.isPlaying]);
  useEffect(() => { d.setCurrentTime((time) => {
    const clamped = Math.min(time, d.timelineDuration);
    if (d.audioRef.current && clamped !== time) d.audioRef.current.currentTime = clamped;
    if (d.sourceAudioRef.current && clamped !== time) d.sourceAudioRef.current.currentTime = d.sourceAudioLinked
      ? getLinkedSourceAudioState(d.linkedSourceAudioSegments, clamped).sourceTime
      : getTimelineTrackLocalTime(clamped, d.sourceAudioStart, d.sourceAudioDuration);
    if (d.musicRef.current && clamped !== time) {
      const segment = d.musicSegments?.find((item) => isTimelineTimeInsideTrack(clamped, item.start, item.duration));
      const playbackRate = Math.max(0.25, Math.min(4, Number(segment?.playbackRate) || 1));
      d.musicRef.current.currentTime = segment
        ? Math.max(0, Number(segment.sourceStart) || 0) + getTimelineTrackLocalTime(clamped, segment.start, segment.duration) * playbackRate
        : getTimelineTrackLocalTime(clamped, d.musicStart, d.musicDuration);
    }
    return clamped;
  }); }, [d.linkedSourceAudioSegments, d.musicDuration, d.musicSegments, d.musicStart, d.sourceAudioDuration, d.sourceAudioLinked, d.sourceAudioStart, d.timelineDuration]);
}
