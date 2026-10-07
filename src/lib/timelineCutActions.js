import { MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { cloneVisualSegment, createVisualSegment, getVisualSegmentTimeline, getVisualSegmentsTotal, isTimedSegmentLaneLocked, makeId, materializeCaptionTimings } from "./timeline.js";
import { normalizeVisualKeyframes, resolveVisualTransform } from "./visualEffects.js";

const MIN_CAPTION_SPLIT_SECONDS = 0.2;

function splitVisualKeyframes(keyframes, splitTime, duration, baseTransform) {
  const frames = normalizeVisualKeyframes(keyframes);
  if (!frames.length) return { left: frames, right: frames };
  const splitTransform = resolveVisualTransform(frames, splitTime, baseTransform);
  return {
    left: normalizeVisualKeyframes([
      ...frames.filter((frame) => frame.time < splitTime),
      { time: splitTime, ...splitTransform },
    ]),
    right: normalizeVisualKeyframes([
      { time: 0, ...splitTransform },
      ...frames
        .filter((frame) => frame.time > splitTime && frame.time <= duration)
        .map((frame) => ({ ...frame, time: frame.time - splitTime })),
    ]),
  };
}

export function splitVisualSegmentState(source, firstDuration, secondDuration) {
  const playbackRate = source.type === "video"
    ? Math.max(0.25, Math.min(4, Number(source.playbackRate) || 1))
    : 1;
  const sourceStart = Math.max(0, Number(source.sourceStart) || 0);
  return [
    cloneVisualSegment(source, {
      id: makeId("visual"),
      duration: firstDuration,
      sourceDuration: source.type === "video" ? firstDuration * playbackRate : source.sourceDuration,
      sourceStart,
    }),
    cloneVisualSegment(source, {
      id: makeId("visual"),
      duration: secondDuration,
      sourceDuration: source.type === "video" ? secondDuration * playbackRate : source.sourceDuration,
      sourceStart: source.type === "video"
        ? sourceStart + firstDuration * playbackRate
        : sourceStart,
    }),
  ];
}

export function createTimelineCutActions(d) {
  const handleCutVisualSegment = () => {
    if (d.trackLocks.image) return void d.notify("图片轨已锁定，无法剪切");
    if (!d.imageSrc) return void d.notify("请先上传或选择图片/视频素材");
    const segments = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 0, d.getCurrentVisualAssetSnapshot())];
    const duration = getVisualSegmentsTotal(segments);
    if (duration < MIN_VISUAL_SEGMENT_SECONDS * 2) return void d.notify("当前视觉片段太短，不适合继续剪切");
    const time = Math.max(0, Math.min(duration, d.currentTime));
    if (time < MIN_VISUAL_SEGMENT_SECONDS || time > duration - MIN_VISUAL_SEGMENT_SECONDS) return void d.notify("请把播放头放在视觉片段中间再剪切");
    const timeline = getVisualSegmentTimeline(segments);
    const index = timeline.findIndex((range) => time > range.start && time < range.end);
    const range = timeline[index]; const source = segments[index];
    if (!source || !range) return void d.notify("请先选中要剪切的视觉片段");
    const firstDuration = time - range.start; const secondDuration = range.end - time;
    if (firstDuration < MIN_VISUAL_SEGMENT_SECONDS || secondDuration < MIN_VISUAL_SEGMENT_SECONDS) return void d.notify("切点离片段边缘太近，先把播放头移到片段中间");
    const [first, second] = splitVisualSegmentState(source, firstDuration, secondDuration);
    const next = [...segments]; next.splice(index, 1, first, second);
    d.commitVisualSegments(next, "已在播放头位置切开视觉片段", index + 1);
  };
  const handleCutCaption = () => {
    if (d.trackLocks.caption) return void d.notify("字幕轨已锁定，无法剪切");
    const index = d.selectedSegmentId ? d.selectedSegmentIndex : d.focusedSegmentIndex;
    const timedSegments = materializeCaptionTimings(d.captionSegments, d.captionTargetDuration);
    const source = timedSegments[index];
    if (!source) return void d.notify("请先选择一个字幕片段");
    const splitTime = Math.max(source.start, Math.min(source.end, d.currentTime));
    if (
      splitTime <= source.start + MIN_CAPTION_SPLIT_SECONDS
      || splitTime >= source.end - MIN_CAPTION_SPLIT_SECONDS
    ) {
      return void d.notify("请把播放头放在字幕片段中间再剪切");
    }
    const next = [...timedSegments];
    next.splice(index, 1,
      { ...source, id: makeId("caption"), end: splitTime },
      { ...source, id: makeId("caption"), start: splitTime });
    d.commitCaptionSegments(next, "已在播放头位置切开字幕片段", index + 1);
  };
  const handleCutAudioSegment = () => {
    const index = d.audioSegments.findIndex((segment) => segment.id === d.selectedAudioSegmentId);
    const source = d.audioSegments[index];
    if (!source) return void d.notify("请先选择一个配音片段");
    if (isTimedSegmentLaneLocked(d.audioSegments, source.id, d.trackLocks)) return void d.notify("配音轨已锁定，无法剪切");
    const time = Math.max(source.start, Math.min(source.start + source.duration, d.currentTime));
    if (time <= source.start + 0.05 || time >= source.start + source.duration - 0.05) {
      return void d.notify("请把播放头放在配音片段中间再剪切");
    }
    const firstDuration = time - source.start;
    const secondDuration = source.duration - firstDuration;
    const playbackRate = Math.max(0.25, Math.min(4, Number(source.playbackRate) || 1));
    const peakSplit = Math.max(1, Math.min((source.peaks?.length || 1) - 1, Math.round((firstDuration / source.duration) * (source.peaks?.length || 0))));
    const firstId = makeId("voice");
    const secondId = makeId("voice");
    const firstUrl = source.blob ? URL.createObjectURL(source.blob) : source.url;
    const secondUrl = source.blob ? URL.createObjectURL(source.blob) : source.url;
    const first = {
      ...source,
      id: firstId,
      url: firstUrl,
      duration: firstDuration,
      sourceDuration: firstDuration * playbackRate,
      peaks: source.peaks?.slice(0, peakSplit) || [],
      fadeOut: 0,
    };
    const second = {
      ...source,
      id: secondId,
      url: secondUrl,
      start: time,
      duration: secondDuration,
      sourceDuration: secondDuration * playbackRate,
      sourceStart: Math.max(0, Number(source.sourceStart) || 0) + firstDuration * playbackRate,
      peaks: source.peaks?.slice(peakSplit) || [],
      fadeIn: 0,
    };
    d.setAudioSegments((segments) => {
      const next = [...segments];
      next.splice(index, 1, first, second);
      return next;
    });
    if (source.blob && source.url) URL.revokeObjectURL(source.url);
    d.setCaptionSegments((captions) => captions.map((caption) => caption.audioSegmentId === source.id
      ? { ...caption, audioSegmentId: firstId, end: Math.min(caption.end, time) }
      : caption));
    d.setSelectedAudioSegmentId(secondId);
    d.notify("已在播放头位置切开配音片段");
  };
  const handleCutMusicSegment = () => {
    if (d.trackLocks.music) return void d.notify("音乐轨已锁定，无法剪切");
    if (!d.musicBlob || d.musicDuration <= 0) return void d.notify("请先添加背景音乐");
    const segments = d.musicSegments?.length ? d.musicSegments : [{
      id: "music-audio", start: d.musicStart || 0, duration: d.musicDuration,
      sourceStart: 0, peaks: d.musicPeaks || [],
    }];
    const index = segments.findIndex((segment) => (
      (!d.selectedMusicSegmentId || segment.id === d.selectedMusicSegmentId)
      && d.currentTime > segment.start + 0.05
      && d.currentTime < segment.start + segment.duration - 0.05
    ));
    const source = segments[index];
    if (!source) return void d.notify("请把播放头放在音乐片段中间再剪切");
    const firstDuration = d.currentTime - source.start;
    const secondDuration = source.duration - firstDuration;
    const playbackRate = Math.max(0.25, Math.min(4, Number(source.playbackRate) || 1));
    const peakCount = source.peaks?.length || 0;
    const peakSplit = peakCount > 1 ? Math.max(1, Math.min(peakCount - 1, Math.round(firstDuration / source.duration * peakCount))) : 0;
    const first = { ...source, id: makeId("music"), duration: firstDuration,
      sourceDuration: firstDuration * playbackRate,
      peaks: peakCount ? source.peaks.slice(0, peakSplit) : [], fadeOut: 0 };
    const second = { ...source, id: makeId("music"), start: d.currentTime, duration: secondDuration,
      sourceDuration: secondDuration * playbackRate,
      sourceStart: Math.max(0, Number(source.sourceStart) || 0) + firstDuration * playbackRate,
      peaks: peakCount ? source.peaks.slice(peakSplit) : [], fadeIn: 0 };
    const next = [...segments];
    next.splice(index, 1, first, second);
    d.setMusicSegments(next);
    d.setSelectedMusicSegmentId?.(second.id);
    d.notify("已在播放头位置切开音乐片段");
  };
  const handleCutOverlaySegment = () => {
    if (d.trackLocks.overlay) return void d.notify(d.t("effectClipLocked"));
    const index = d.visualOverlaySegments.findIndex((segment) => segment.id === d.selectedVisualOverlayId);
    const source = d.visualOverlaySegments[index];
    if (!source) return void d.notify("请先选择一个画中画片段");
    const start = Math.max(0, Number(source.start) || 0);
    const duration = Math.max(0, Number(source.duration) || 0);
    const time = Math.max(start, Math.min(start + duration, d.currentTime));
    const firstDuration = time - start;
    const secondDuration = duration - firstDuration;
    if (firstDuration < MIN_VISUAL_SEGMENT_SECONDS || secondDuration < MIN_VISUAL_SEGMENT_SECONDS) {
      return void d.notify("切点离片段边缘太近，先把播放头移到片段中间");
    }
    const firstId = makeId("overlay");
    const secondId = makeId("overlay");
    const playbackRate = source.type === "video" ? Math.max(0.25, Math.min(4, Number(source.playbackRate) || 1)) : 1;
    const keyframes = splitVisualKeyframes(source.keyframes, firstDuration, duration, source.baseTransform);
    const first = cloneVisualSegment(source, {
      id: firstId,
      duration: firstDuration,
      keyframes: keyframes.left,
      ...(source.type === "video" ? { sourceDuration: firstDuration * playbackRate } : {}),
    });
    const second = cloneVisualSegment(source, {
      id: secondId,
      start: time,
      duration: secondDuration,
      keyframes: keyframes.right,
      ...(source.type === "video" ? {
        sourceStart: Math.max(0, Number(source.sourceStart) || 0) + firstDuration * playbackRate,
        sourceDuration: secondDuration * playbackRate,
      } : {}),
    });
    const next = [...d.visualOverlaySegments];
    next.splice(index, 1, first, second);
    d.setVisualOverlaySegments(next);
    d.setSelectedVisualOverlayId(secondId);
    d.notify("已在播放头位置切开视觉片段");
  };
  const handleCutTrack = () => {
    if (d.selectedTrack === "image") return void handleCutVisualSegment();
    if (d.selectedTrack === "overlay" && d.selectedVisualOverlayId) return void handleCutOverlaySegment();
    if (d.selectedTrack === "caption" && d.selectedSegmentId) return void handleCutCaption();
    if (d.selectedTrack === "audio" && d.selectedAudioSegmentId) return void handleCutAudioSegment();
    if (d.selectedTrack === "music" && d.selectedMusicSegmentId) return void handleCutMusicSegment();
    if (d.selectedTrack === "sticker" && d.selectedStickerSegmentId) {
      if (d.trackLocks.sticker) return void d.notify("贴纸轨已锁定，无法剪切");
      const selected = d.selectedStickerSegmentId && d.stickerSegments.findIndex((segment) => segment.id === d.selectedStickerSegmentId);
      const index = selected >= 0 ? selected : d.currentStickerSegmentIndex >= 0 ? d.currentStickerSegmentIndex : 0;
      const source = d.stickerSegments[index]; if (!source) return void d.notify("请先选择一个贴纸片段");
      const time = Math.max(source.start, Math.min(source.start + source.duration, d.currentTime));
      if (time <= source.start + 0.35 || time >= source.start + source.duration - 0.35) return void d.notify("请把播放头放在贴纸片段中间再剪切");
      const first = { ...source, id: makeId("sticker"), duration: time - source.start };
      const second = { ...source, id: makeId("sticker"), start: time, duration: source.start + source.duration - time };
      const next = [...d.stickerSegments]; next.splice(index, 1, first, second);
      return void d.commitStickerSegments(next, "已在播放头位置切开贴纸片段", second.id);
    }
    // The toolbar split action should remain useful even after the user clicks a
    // track background (which clears clip selection). In that state, treat the
    // primary visual under the playhead as the default editing target.
    return void handleCutVisualSegment();
  };
  return { handleCutTrack };
}
