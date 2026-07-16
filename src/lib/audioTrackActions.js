import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { decodeWaveform } from "./media.js";
import {
  createCaptionSegments,
  estimateDuration,
  formatSavedTime,
  getCaptionTimeline,
} from "./timeline.js";

export function createAudioTrackActions(d) {
  function replaceAudio(blob, duration, nextPeaks, nextStatusText) {
    const nextUrl = URL.createObjectURL(blob);
    const nextDuration = duration || estimateDuration(d.script);
    const start = Math.max(0, d.currentTimeRef.current || 0);
    const id = crypto.randomUUID();
    const segment = {
      id,
      blob,
      url: nextUrl,
      start,
      duration: nextDuration,
      peaks: nextPeaks,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      reversed: false,
      name: d.selectedVoice?.name || d.t("voiceTrack"),
    };
    d.setAudioSegments((segments) => [...segments, segment]);
    d.setSelectedAudioSegmentId(id);
    d.setSelectedTrack("audio");
    d.setTimelineHorizon((value) => Math.max(value, Math.ceil((start + nextDuration + 5) / 10) * 10));
    d.setCurrentTime(start);
    d.setStatus("done");
    d.setStatusText(nextStatusText);
    d.setProgress(100);
    return segment;
  }

  function clearAudioTrack(message = "配音音频已从时间线移除") {
    d.audioSegmentRefs.current.forEach((audio) => audio.pause());
    d.audioSegments.forEach((segment) => URL.revokeObjectURL(segment.url));
    d.setAudioSegments([]);
    d.setSelectedAudioSegmentId("");
    d.setCurrentTime(0);
    d.setIsPlaying(false);
    d.setStatus("ready");
    d.setStatusText("音频轨已清空");
    d.notify(message);
  }

  function replaceMusic(blob, duration, nextPeaks, nextName, message = "背景音乐已添加到时间线") {
    if (d.musicUrlRef.current) URL.revokeObjectURL(d.musicUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    d.musicUrlRef.current = nextUrl;
    d.setMusicBlob(blob);
    d.setMusicUrl(nextUrl);
    d.setMusicName(nextName);
    d.setMusicDuration(duration || 0);
    d.setMusicStart(0);
    d.setMusicPeaks(nextPeaks);
    d.setSelectedTrack("music");
    d.setActiveTool("audio");
    d.notify(message);
  }

  function replaceSourceAudio(
    blob,
    duration,
    nextPeaks,
    nextName,
    message = "视频原声已分离到时间线",
    timelineStart = 0,
    assetId = d.sourceAudioAssetId,
  ) {
    if (d.sourceAudioUrlRef.current) URL.revokeObjectURL(d.sourceAudioUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    d.sourceAudioUrlRef.current = nextUrl;
    const nextStart = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS, timelineStart || 0));
    d.setSourceAudioBlob(blob);
    d.setSourceAudioUrl(nextUrl);
    d.setSourceAudioName(nextName);
    d.setSourceAudioDuration(duration || 0);
    d.setSourceAudioPeaks(nextPeaks);
    d.setSourceAudioVolume(1);
    d.setSourceAudioStart(nextStart);
    d.setSourceAudioAssetId(assetId || "");
    d.setSourceAudioLinked(true);
    d.setSelectedTrack("source");
    d.setActiveTool("audio");
    d.setStatus("done");
    d.setStatusText("视频原声已分离");
    d.setProgress(100);
    d.notify(message);
  }

  function clearSourceAudioTrack(message = "视频原声已从时间线移除") {
    d.sourceAudioRef.current?.pause();
    if (d.sourceAudioUrlRef.current) {
      URL.revokeObjectURL(d.sourceAudioUrlRef.current);
      d.sourceAudioUrlRef.current = "";
    }
    d.setSourceAudioBlob(null);
    d.setSourceAudioUrl("");
    d.setSourceAudioName("");
    d.setSourceAudioDuration(0);
    d.setSourceAudioPeaks([]);
    d.setSourceAudioStart(0);
    d.setSourceAudioAssetId("");
    d.setSourceAudioLinked(true);
    d.setCurrentTime((time) => Math.min(time, Math.max(
      d.audioBlob ? d.audioDuration : 0,
      d.captionDuration,
      d.musicBlob ? d.musicDuration : 0,
      d.imageSrc ? d.imageDuration : 0,
      estimateDuration(d.script),
    )));
    d.setIsPlaying(false);
    d.setSelectedTrack("source");
    if (message) d.notify(message);
  }

  function clearMusicTrack(message = "背景音乐已从时间线移除") {
    d.musicRef.current?.pause();
    if (d.musicUrlRef.current) {
      URL.revokeObjectURL(d.musicUrlRef.current);
      d.musicUrlRef.current = "";
    }
    d.setMusicBlob(null);
    d.setMusicUrl("");
    d.setMusicName("");
    d.setMusicDuration(0);
    d.setMusicStart(0);
    d.setMusicPeaks([]);
    d.setCurrentTime((time) => Math.min(time, Math.max(
      d.audioBlob ? d.audioDuration : 0,
      d.captionDuration,
      d.sourceAudioBlob ? d.sourceAudioStart + d.sourceAudioDuration : 0,
      d.imageSrc ? d.imageDuration : 0,
      estimateDuration(d.script),
    )));
    d.setIsPlaying(false);
    d.setSelectedTrack("music");
    d.notify(message);
  }

  async function commitAudio(blob, nextStatusText) {
    const decoded = await decodeWaveform(blob);
    const audioSegment = replaceAudio(blob, decoded.duration, decoded.peaks, nextStatusText);
    const generatedCaptions = createCaptionSegments(d.script);
    const generatedTimeline = getCaptionTimeline(generatedCaptions, audioSegment.duration);
    const boundCaptions = generatedCaptions.map((segment, index) => ({
      ...segment,
      audioSegmentId: audioSegment.id,
      start: audioSegment.start + generatedTimeline[index].start,
      end: audioSegment.start + generatedTimeline[index].end,
    }));
    d.setCaptionSegments((segments) => [
      ...segments.filter((segment) => segment.audioSegmentId),
      ...boundCaptions,
    ].sort((a, b) => (a.start || 0) - (b.start || 0)));
    d.setSelectedSegmentId(boundCaptions[0]?.id ?? "");
    d.setHistoryItems((items) => [{
      id: crypto.randomUUID(),
      blob,
      voiceId: d.selectedVoiceId,
      voiceName: d.selectedVoice.name,
      script: d.script,
      duration: decoded.duration || estimateDuration(d.script),
      peaks: decoded.peaks,
      createdAt: formatSavedTime(),
    }, ...items.slice(0, 8)]);
  }

  return {
    clearAudioTrack,
    clearMusicTrack,
    clearSourceAudioTrack,
    commitAudio,
    replaceAudio,
    replaceMusic,
    replaceSourceAudio,
  };
}
