import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PLAYBACK_UI_FRAME_MS, getAudioSegmentPreviewVolume, getTimelineTrackLocalTime, isAudioSegmentAudible, isTimelineTimeInsideTrack, requestTimelineMediaPlay, setTimelineAudioGain, shouldCorrectPreviewMediaTime } from "../lib/editorRuntime.js";
import { getLinkedSourceAudioState } from "../lib/sourceAudioSync.js";
import { filterTimedSegmentsByLaneVisibility } from "../lib/timeline.js";
import { cancelLatestVideoFrameRequest, requestLatestVideoFrame } from "../lib/videoFrameSync.js";
import { getVisualPlaybackRateAtTime, getVisualSourceTime, MAX_VISUAL_PLAYBACK_RATE } from "../lib/visualEffects.js";

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
    const localTime = getTimelineTrackLocalTime(timelineTime, segment.start, segment.duration);
    const playbackRate = getVisualPlaybackRateAtTime(segment, localTime);
    const expected = getVisualSourceTime(segment, localTime);
    syncTimelineAudioElement(audio, { active, shouldPlay: true, expectedTime: expected, playbackRate });
  });
}

export function useMediaSync(d) {
  const videoClipRef = useRef(null);
  const playbackStateRef = useRef(d);
  playbackStateRef.current = d;
  // Lane packing depends on edits and visibility, never on the playback clock.
  const visibleAudioSegmentIds = useMemo(() => new Set(
    filterTimedSegmentsByLaneVisibility(d.audioSegments, d.trackVisibility).map((segment) => segment.id),
  ), [d.audioSegments, d.trackVisibility]);
  useEffect(() => {
    const video = d.previewVideoRef.current;
    return () => cancelLatestVideoFrameRequest(video);
  }, [d.previewVideoRef, d.previewVisualKey, d.previewVisualSrc, d.previewVisualType]);
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
  useEffect(() => {
    if (!d.sourceAudioRef.current) return;
    const piece = d.sourceAudioLinked ? getLinkedSourceAudioState(d.linkedSourceAudioSegments, d.currentTime).segment : null;
    const clip = piece || { start: d.sourceAudioStart, duration: d.sourceAudioDuration, ...d.sourceAudioFades };
    const gain = getAudioSegmentPreviewVolume({ ...clip, volume: clip.volume ?? d.sourceAudioVolume }, d.currentTime);
    setTimelineAudioGain(d.sourceAudioRef.current, gain, d.sourceAudioSpatialEffect, d.sourceAudioSpatialAmount);
  }, [d.currentTime, d.linkedSourceAudioSegments, d.sourceAudioLinked, d.sourceAudioStart, d.sourceAudioDuration,
    d.sourceAudioFades, d.sourceAudioSpatialAmount, d.sourceAudioSpatialEffect, d.sourceAudioVolume, d.sourceAudioUrl, d.sourceAudioRef]);
  useLayoutEffect(() => {
    const a = d.sourceAudioRef.current; if (!a || !d.sourceAudioUrl) return;
    const state = d.sourceAudioLinked
      ? getLinkedSourceAudioState(d.linkedSourceAudioSegments, d.currentTime)
      : { active: isTimelineTimeInsideTrack(d.currentTime, d.sourceAudioStart, d.sourceAudioDuration), sourceTime: getTimelineTrackLocalTime(d.currentTime, d.sourceAudioStart, d.sourceAudioDuration), playbackRate: 1 };
    const play = d.isPlaying && d.trackVisibility?.source !== false && state.active;
    syncTimelineAudioElement(a, { active: state.active, shouldPlay: play, expectedTime: state.sourceTime, playbackRate: state.playbackRate });
  }, [d.currentTime, d.isPlaying, d.linkedSourceAudioSegments, d.sourceAudioDuration, d.sourceAudioLinked, d.sourceAudioStart, d.sourceAudioUrl, d.trackVisibility.source]);
  useLayoutEffect(() => {
    const video = d.previewVideoRef.current;
    const audio = d.sourceAudioRef.current;
    if (!video || !audio) return;
    let frame = 0;
    let aligned = false;
    const sync = () => {
      const state = playbackStateRef.current;
      if (state.isPlaying && !frame) frame = requestAnimationFrame(() => { frame = 0; sync(); });
      const linked = getLinkedSourceAudioState(state.linkedSourceAudioSegments, state.currentTime);
      const active = state.isPlaying && state.sourceAudioLinked && state.sourceAudioUrl
        && state.previewVisualType === "video" && state.trackVisibility.image !== false && state.trackVisibility.source !== false
        && linked.active && linked.segment?.id === state.previewVisualSegment?.id
        && (linked.segment?.volume ?? state.sourceAudioVolume ?? 1) > 0 && !video.ended;
      if (!active) { aligned = false; video.__timelineLinkedAudioPending = false; return; }
      const ready = video.readyState >= 2 && !video.seeking && !video.__timelineFramePending;
      if (!ready || video.seeking) aligned = false;
      const visualTime = getVisualSourceTime(state.previewVisualSegment, Math.max(0, state.currentTime - (state.previewVisualRange?.start || 0)));
      // A concatenated source-audio buffer can have a different origin. Follow
      // the presented picture clock while retaining that explicit offset.
      const expected = linked.sourceTime + (ready ? video.currentTime - visualTime : 0);
      if (audio.playbackRate !== linked.playbackRate) audio.playbackRate = linked.playbackRate;
      const misaligned = Math.abs(audio.currentTime - expected) > Math.max(0.003, linked.playbackRate * 0.015);
      // Follow the presented picture without stopping it for ordinary native
      // decoder drift; readiness gating is only needed at seeks and starts.
      if (aligned && ready) {
        video.__timelineLinkedAudioPending = false;
        if (!audio.seeking && Math.abs(audio.currentTime - expected) > Math.max(0.004, linked.playbackRate * 0.03)) audio.currentTime = Math.max(0, expected);
        if (!video.__timelineProxyAudioPending) {
          requestTimelineMediaPlay(audio);
          requestTimelineMediaPlay(video);
        }
        return;
      }
      if (!ready || audio.readyState < 3 || audio.seeking || misaligned) {
        video.__timelineLinkedAudioPending = true;
        video.pause(); audio.pause();
        if (audio.readyState >= 1 && !audio.seeking && Math.abs(audio.currentTime - expected) > 0.002) audio.currentTime = Math.max(0, expected);
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync(); });
        return;
      }
      aligned = true;
      video.__timelineLinkedAudioPending = false;
      requestTimelineMediaPlay(audio); requestTimelineMediaPlay(video);
    };
    const events = ["canplay", "seeked", "playing", "timeupdate", "ratechange"];
    events.forEach(name => video.addEventListener(name, sync));
    ["loadedmetadata", "seeked", "canplay", "waiting"].forEach(name => audio.addEventListener(name, sync));
    sync();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      video.__timelineLinkedAudioPending = false;
      events.forEach(name => video.removeEventListener(name, sync));
      ["loadedmetadata", "seeked", "canplay", "waiting"].forEach(name => audio.removeEventListener(name, sync));
    };
  }, [d.isPlaying, d.previewVideoRef, d.previewVisualSrc, d.previewVisualSegment?.id, d.sourceAudioRef, d.sourceAudioUrl, d.sourceAudioLinked, d.linkedSourceAudioSegments, d.trackVisibility.image, d.trackVisibility.source, d.sourceAudioVolume]);
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
  useEffect(() => {
    const v = d.previewVideoRef.current; if (!v || d.previewVisualType !== "video") return;
    const localTime = Math.max(0, d.currentTime - (d.previewVisualRange?.start || 0));
    const rate = getVisualPlaybackRateAtTime(d.previewVisualSegment, localTime);
    const lag = (d.previewVisualSourceTime - v.currentTime) / rate;
    // If a stalled UI reaches a cut late, let the silent picture catch up to
    // the soundtrack with a bounded preview rate instead of forcing a seek.
    const catchUp = v.__timelineCatchUp && d.isPlaying && lag > 0.025;
    v.__timelineCatchUp = catchUp;
    v.playbackRate = catchUp ? Math.min(MAX_VISUAL_PLAYBACK_RATE, rate * (1 + Math.min(0.18, lag))) : rate;
    if ("preservesPitch" in v) v.preservesPitch = true;
  }, [d.currentTime, d.isPlaying, d.previewVisualRange?.start, d.previewVisualSegment, d.previewVisualSourceTime, d.previewVisualSrc, d.previewVisualType]);
  // Metadata restoration and the source-time synchronization below already
  // locate the requested frame. A separate sourceStart seek here races them
  // on every clip change and can briefly reveal the opening frame again.
  useLayoutEffect(() => {
    const v = d.previewVideoRef.current;
    if (!v || d.previewVisualType !== "video") return;
    const previous = videoClipRef.current;
    const clipChanged = previous?.video !== v || previous?.id !== d.previewVisualSegment?.id;
    videoClipRef.current = { video: v, id: d.previewVisualSegment?.id };
    const max = Math.max(0, (Number(v.duration) || d.previewVisualSourceTime) - 0.001);
    const time = Math.min(Math.max(0, d.previewVisualSourceTime), max);
    if (clipChanged) {
      const prepared = Number.isFinite(v.__timelinePreparedTime);
      v.__timelinePreparedTime = undefined;
      v.__timelineCatchUp = false;
      const continuous = previous?.video === v && !v.paused;
      // The normal clock can use a frame prepared at the entrance. Explicit
      // timeline seeks reset lastUpdate and still go through exact alignment.
      if (d.isPlaying && d.visualPlaybackLastUpdateRef.current > 0 && d.trackVisibility.image !== false
        && (prepared || continuous)) {
        const localTime = Math.max(0, d.currentTime - (d.previewVisualRange?.start || 0));
        const rate = getVisualPlaybackRateAtTime(d.previewVisualSegment, localTime);
        const silentEntrance = prepared && d.previewVisualSegment?.sourceAudioDisabled === true;
        const entranceWindow = silentEntrance ? 0.55 : prepared ? 0.1 : 0.065;
        const sourceLag = time - v.currentTime;
        if (sourceLag <= Math.max(0.025, rate * entranceWindow) && sourceLag >= -Math.max(0.025, rate * 0.065)) {
          // If the standby seek is still in flight, its native seeked event
          // can start the picture. Retargeting it would restart decoding.
          const finishingStandbySeek = prepared && v.seeking;
          if (finishingStandbySeek || (!v.seeking && v.readyState >= 2)) {
            v.__timelineFramePending = finishingStandbySeek;
            v.__timelineCatchUp = silentEntrance && sourceLag > rate * 0.04;
            v.playbackRate = rate;
            if (!finishingStandbySeek && v.paused) requestTimelineMediaPlay(v);
            return;
          }
        }
      }
      v.__timelineFramePending = true;
      v.pause();
    }
    // Metadata restoration queues the same target after the source is ready.
    if (v.readyState < 1) return;
    const scrubbing = d.timelineScrubbingRef.current;
    if (clipChanged || shouldCorrectPreviewMediaTime({
      isPlaying: d.isPlaying, currentTime: v.currentTime, targetTime: time, threshold: scrubbing ? 0.002 : undefined,
    })) {
      requestLatestVideoFrame(v, time, {
        immediate: clipChanged,
        scrubbing,
        onDecoded: () => {
          if (d.previewVideoRef.current === v && videoClipRef.current?.id === d.previewVisualSegment?.id) {
            v.__timelineFramePending = false;
          }
        },
        onPresented: mediaTime => {
          if (d.previewVideoRef.current !== v || videoClipRef.current?.id !== d.previewVisualSegment?.id) return;
          v.__timelineFramePending = false;
          d.setPreviewVideoMediaTime(mediaTime);
          const latest = playbackStateRef.current;
          if (latest.isPlaying && latest.trackVisibility?.image !== false) requestTimelineMediaPlay(v);
        },
      });
    }
  }, [d.isPlaying, d.previewVisualSegment?.id, d.previewVisualSourceTime, d.previewVisualSrc, d.previewVisualType]);
  useEffect(() => {
    const v = d.previewVideoRef.current; if (!v || d.previewVisualType !== "video") return;
    if (!d.isPlaying || d.trackVisibility?.image === false) v.pause(); else if (!v.__timelineFramePending) requestTimelineMediaPlay(v);
  }, [d.isPlaying, d.previewVisualSegment?.id, d.previewVisualSrc, d.previewVisualType, d.trackVisibility.image]);
  useEffect(() => {
    if (d.previewVisualType !== "video" || !d.previewVisualSegment) return;
    const clip = d.previewVisualSegment;
    const gain = getAudioSegmentPreviewVolume({ ...clip, start: 0 }, d.previewVisualLocalTime);
    setTimelineAudioGain(d.previewVideoRef.current, gain, clip.spatialEffect, clip.spatialAmount);
  }, [d.previewVideoRef, d.previewVisualType, d.previewVisualSrc, d.previewVisualSegment, d.previewVisualLocalTime]);
  // Clip changes and filmstrip refinement must not re-anchor the master clock.
  // Explicit seeks update its refs directly; only playback state or the actual
  // project duration starts a new clock session.
  useEffect(() => {
    if (!d.isPlaying || d.estimatedDuration <= 0) return undefined;
    const start = d.currentTimeRef.current >= d.estimatedDuration - 0.02 ? 0 : Math.max(0, d.currentTimeRef.current);
    if (start !== d.currentTimeRef.current) { d.setCurrentTime(start); d.currentTimeRef.current = start; }
    d.visualPlaybackStartTimeRef.current = start; d.visualPlaybackStartedAtRef.current = performance.now(); d.visualPlaybackLastUpdateRef.current = 0;
    let previousTick = d.visualPlaybackStartedAtRef.current;
    let frameOnlySince = null;
    const bufferedAudio = new Set();
    const tick = (now) => {
      const state = playbackStateRef.current;
      const video = state.previewVideoRef.current;
      const elapsed = Math.max(0, now - previousTick);
      previousTick = now;
      // A muted picture can briefly run out of queued frames when another
      // decoder starts at a seam. Give it a few display frames to recover
      // without interrupting independent audio. Still buffer on a true seek
      // or while waiting for the picture's own synchronized audio.
      const frameOnly = video?.muted && video.readyState === 2 && !video.seeking
        && !video.__timelineFramePending && !video.__timelineLinkedAudioPending && !video.__timelineProxyAudioPending;
      frameOnlySince = frameOnly ? frameOnlySince ?? now : null;
      const needsBuffer = video?.readyState < 3 && (!frameOnly || now - frameOnlySince > 100);
      const waiting = state.previewVisualType === "video" && state.trackVisibility.image !== false
        && video && !video.error && !video.ended
        && !(Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.1)
        && (video.__timelineFramePending || video.__timelineProxyAudioPending || video.__timelineLinkedAudioPending || video.seeking || needsBuffer
          || (video.paused && video.__timelinePlayPending));
      if (waiting) {
        d.visualPlaybackStartedAtRef.current += elapsed;
        const media = [...state.audioSegmentRefs.current.values(), state.sourceAudioRef.current, state.musicRef.current];
        for (const audio of media) {
          if (audio && !audio.paused) { audio.pause(); bufferedAudio.add(audio); }
        }
        d.visualPlaybackFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      for (const audio of bufferedAudio) requestTimelineMediaPlay(audio);
      bufferedAudio.clear();
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
