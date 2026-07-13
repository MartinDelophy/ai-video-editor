import { MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { createVisualSegment, getVisualSegmentsTotal, hasExplicitCaptionTiming } from "./timeline.js";

export function createTimelineDurationActions(d) {
  return function adjustSelectedSegmentWeight(delta) {
    if (d.selectedTrack === "sticker") {
      if (d.trackLocks.sticker) return void d.notify("贴纸轨已锁定，无法调整片段长度");
      const selected = d.selectedStickerSegmentId ? d.stickerSegments.findIndex((segment) => segment.id === d.selectedStickerSegmentId) : -1;
      const index = selected >= 0 ? selected : d.currentStickerSegmentIndex >= 0 ? d.currentStickerSegmentIndex : 0;
      const source = d.stickerSegments[index]; if (!source) return void d.notify("请先选择一个贴纸片段");
      const duration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, Math.min(MAX_TIMELINE_DURATION_SECONDS - source.start, source.duration + (delta > 0 ? 0.5 : -0.5)));
      if (Math.abs(duration - source.duration) < 0.001) return void d.notify(delta > 0 ? "当前贴纸片段已到最大长度" : "当前贴纸片段已到最短时长");
      const next = d.stickerSegments.map((segment, position) => position === index ? { ...segment, duration } : segment);
      return void d.commitStickerSegments(next, delta > 0 ? "当前贴纸片段已加长" : "当前贴纸片段已缩短", source.id);
    }
    if (d.selectedTrack === "image") {
      if (d.trackLocks.image) return void d.notify("图片轨已锁定，无法调整片段长度");
      if (!d.imageSrc) return void d.notify("请先上传或选择图片/视频素材");
      const source = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 4, d.getCurrentVisualAssetSnapshot())];
      const index = d.selectedVisualSegmentId && source.some((segment) => segment.id === d.selectedVisualSegmentId)
        ? d.selectedVisualSegmentIndex : d.currentVisualSegmentIndex >= 0 ? d.currentVisualSegmentIndex : source.length - 1;
      const target = source[index]; const without = getVisualSegmentsTotal(source) - target.duration;
      const max = Math.max(MIN_VISUAL_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS - without);
      const duration = Math.min(max, Math.max(MIN_VISUAL_SEGMENT_SECONDS, target.duration + (delta > 0 ? 1 : -1)));
      if (duration === target.duration) return void d.notify(delta > 0 ? "视觉轨道已经达到 30 分钟上限" : "当前视觉片段已到最短时长");
      const next = source.map((segment, position) => position === index ? { ...segment, duration } : segment);
      return void d.commitVisualSegments(next, delta > 0 ? "当前视觉片段已加长" : "当前视觉片段已缩短", index);
    }
    if (d.selectedTrack === "music") return void d.notify("背景音乐长度由素材决定，下一版会支持裁剪和淡入淡出");
    if (d.selectedTrack === "source") return void d.notify("视频原声长度由视频决定，下一版会支持分段裁剪");
    if (d.selectedTrack !== "caption") return void d.notify("请先选择字幕片段，再调整片段长短");
    if (!d.captionSegments.length) return void d.notify("当前没有字幕片段可调整");
    if (d.trackLocks.caption) return void d.notify("字幕轨已锁定，无法调整片段长度");
    const index = d.selectedSegmentId ? d.selectedSegmentIndex : d.focusedSegmentIndex;
    const target = d.captionSegments[index];
    if (hasExplicitCaptionTiming(target)) {
      const nextTimed = d.captionSegments.slice(index + 1).find(hasExplicitCaptionTiming);
      const maxEnd = Math.min(MAX_TIMELINE_DURATION_SECONDS, nextTimed?.start ?? MAX_TIMELINE_DURATION_SECONDS);
      const end = Math.max(target.start + 0.45, Math.min(maxEnd, target.end + (delta > 0 ? 0.6 : -0.6)));
      if (Math.abs(end - target.end) < 0.001) return void d.notify(delta > 0 ? "当前字幕已贴近下一段" : "当前字幕已到最短时长");
      const next = d.captionSegments.map((segment, position) => position === index ? { ...segment, end } : segment);
      return void d.commitCaptionSegments(next, delta > 0 ? "当前字幕片段已加长" : "当前字幕片段已缩短", index);
    }
    const next = d.captionSegments.map((segment, position) => position === index
      ? { ...segment, weight: Math.max(0.5, Math.min(5, (segment.weight ?? 1) + delta)) } : segment);
    d.commitCaptionSegments(next, delta > 0 ? "当前字幕片段已加长" : "当前字幕片段已缩短", index);
  };
}
