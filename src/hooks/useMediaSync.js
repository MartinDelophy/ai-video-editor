import { useEffect } from "react";
import { PLAYBACK_UI_FRAME_MS, getAudioSegmentPreviewVolume, getTimelineTrackLocalTime, isTimelineTimeInsideTrack } from "../lib/editorRuntime.js";

export function useMediaSync(d) {
  useEffect(() => { d.audioSegments.forEach((s) => { const a = d.audioSegmentRefs.current.get(s.id); if (a) a.volume = getAudioSegmentPreviewVolume(s, d.currentTime); }); }, [d.audioSegments, d.currentTime]);
  useEffect(() => {
    if (!d.isPlaying || !d.trackVisibility.audio) return;
    d.audioSegments.forEach((s) => {
      const a = d.audioSegmentRefs.current.get(s.id); if (!a) return;
      const active = isTimelineTimeInsideTrack(d.currentTime, s.start, s.duration);
      if (active) { const expected = getTimelineTrackLocalTime(d.currentTime, s.start, s.duration); if (Math.abs(a.currentTime - expected) > 0.2) a.currentTime = expected; if (a.paused) a.play().catch(() => {}); }
      else if (!a.paused) a.pause();
    });
  }, [d.audioSegments, d.currentTime, d.isPlaying, d.trackVisibility.audio]);
  useEffect(() => { if (d.sourceAudioRef.current) d.sourceAudioRef.current.volume = d.sourceAudioVolume; }, [d.sourceAudioVolume, d.sourceAudioUrl]);
  useEffect(() => {
    const a = d.sourceAudioRef.current; if (!a || !d.sourceAudioUrl) return;
    const local = getTimelineTrackLocalTime(d.currentTime, d.sourceAudioStart, d.sourceAudioDuration);
    if (Math.abs(a.currentTime - local) > 0.22) a.currentTime = local;
    const play = d.isPlaying && d.trackVisibility.source && isTimelineTimeInsideTrack(d.currentTime, d.sourceAudioStart, d.sourceAudioDuration);
    if (play && a.paused) a.play().catch(() => {}); else if (!play && !a.paused) a.pause();
  }, [d.currentTime, d.isPlaying, d.sourceAudioDuration, d.sourceAudioStart, d.sourceAudioUrl, d.trackVisibility.source]);
  useEffect(() => { if (d.musicRef.current) d.musicRef.current.volume = d.musicVolume; }, [d.musicVolume, d.musicUrl]);
  useEffect(() => { d.currentTimeRef.current = d.currentTime; }, [d.currentTime]);
  useEffect(() => { d.setPreviewVideoMediaTime(d.previewVisualType === "video" ? Math.max(0, Number(d.previewVisualSegment?.sourceStart) || 0) : 0); }, [d.previewVisualSegment?.id, d.previewVisualSrc, d.previewVisualType]);
  useEffect(() => {
    const v = d.previewVideoRef.current; if (!v || d.previewVisualType !== "video") return;
    const max = Math.max(0, (Number(v.duration) || d.previewVisualSourceTime) - 0.001);
    const time = Math.min(Math.max(0, d.previewVisualSourceTime), max);
    if (Number.isFinite(time) && Math.abs(v.currentTime - time) > 0.2) { v.currentTime = time; d.setPreviewVideoMediaTime(time); }
    if (d.isPlaying && d.trackVisibility.image && v.paused) v.play().catch(() => {});
  }, [d.isPlaying, d.previewVisualSourceTime, d.previewVisualSrc, d.previewVisualType, d.trackVisibility.image]);
  useEffect(() => {
    const v = d.previewVideoRef.current; if (!v || d.previewVisualType !== "video") return;
    if (!d.isPlaying || !d.trackVisibility.image) v.pause(); else v.play().catch(() => {});
  }, [d.isPlaying, d.previewVisualSrc, d.previewVisualType, d.trackVisibility.image]);
  useEffect(() => {
    if (!d.isPlaying || d.estimatedDuration <= 0) return undefined;
    const start = d.currentTimeRef.current >= d.estimatedDuration - 0.02 ? 0 : Math.max(0, d.currentTimeRef.current);
    if (start !== d.currentTimeRef.current) { d.setCurrentTime(start); d.currentTimeRef.current = start; }
    d.visualPlaybackStartTimeRef.current = start; d.visualPlaybackStartedAtRef.current = performance.now(); d.visualPlaybackLastUpdateRef.current = 0;
    const tick = (now) => {
      const next = Math.min(d.estimatedDuration, d.visualPlaybackStartTimeRef.current + (now - d.visualPlaybackStartedAtRef.current) / 1000);
      d.currentTimeRef.current = next;
      if (now - d.visualPlaybackLastUpdateRef.current > PLAYBACK_UI_FRAME_MS || next >= d.estimatedDuration) { d.visualPlaybackLastUpdateRef.current = now; d.setCurrentTime(next); }
      if (next >= d.estimatedDuration) { d.pauseTimelineMedia(); d.setIsPlaying(false); d.visualPlaybackFrameRef.current = 0; return; }
      d.visualPlaybackFrameRef.current = requestAnimationFrame(tick);
    };
    d.visualPlaybackFrameRef.current = requestAnimationFrame(tick);
    return () => { if (d.visualPlaybackFrameRef.current) { cancelAnimationFrame(d.visualPlaybackFrameRef.current); d.visualPlaybackFrameRef.current = 0; } };
  }, [d.estimatedDuration, d.isPlaying]);
  useEffect(() => { d.setCurrentTime((time) => {
    const clamped = Math.min(time, d.timelineDuration);
    if (d.audioRef.current && clamped !== time) d.audioRef.current.currentTime = clamped;
    if (d.sourceAudioRef.current && clamped !== time) d.sourceAudioRef.current.currentTime = getTimelineTrackLocalTime(clamped, d.sourceAudioStart, d.sourceAudioDuration);
    if (d.musicRef.current && clamped !== time) d.musicRef.current.currentTime = clamped;
    return clamped;
  }); }, [d.timelineDuration, d.sourceAudioDuration, d.sourceAudioStart]);
}
