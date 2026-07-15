import { MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { createVisualSegment, getVisualSegmentTimeline, getVisualSegmentsTotal, hasExplicitCaptionTiming, makeId } from "./timeline.js";

export function createTimelineCutActions(d) {
  const handleCutVisualSegment = () => {
    if (d.trackLocks.image) return void d.notify("图片轨已锁定，无法剪切");
    if (!d.imageSrc) return void d.notify("请先上传或选择图片/视频素材");
    const segments = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 0, d.getCurrentVisualAssetSnapshot())];
    const duration = getVisualSegmentsTotal(segments);
    if (duration < MIN_VISUAL_SEGMENT_SECONDS * 2) return void d.notify("当前视觉片段太短，不适合继续剪切");
    const time = Math.max(0, Math.min(duration, d.currentTime));
    if (time <= MIN_VISUAL_SEGMENT_SECONDS || time >= duration - MIN_VISUAL_SEGMENT_SECONDS) return void d.notify("请把播放头放在视觉片段中间再剪切");
    const timeline = getVisualSegmentTimeline(segments);
    const index = timeline.findIndex((range) => time > range.start && time < range.end);
    const range = timeline[index]; const source = segments[index];
    if (!source || !range) return void d.notify("请先选中要剪切的视觉片段");
    const firstDuration = time - range.start; const secondDuration = range.end - time;
    if (firstDuration < MIN_VISUAL_SEGMENT_SECONDS || secondDuration < MIN_VISUAL_SEGMENT_SECONDS) return void d.notify("切点离片段边缘太近，先把播放头移到片段中间");
    const playbackRate = source.type === "video" ? Math.max(0.25, Math.min(4, Number(source.playbackRate) || 1)) : 1;
    const first = { ...source, id: makeId("visual"), duration: firstDuration,
      sourceDuration: source.type === "video" ? firstDuration * playbackRate : source.sourceDuration };
    const second = { ...source, id: makeId("visual"), duration: secondDuration,
      sourceDuration: source.type === "video" ? secondDuration * playbackRate : source.sourceDuration,
      sourceStart: source.type === "video" ? Math.max(0, Number(source.sourceStart) || 0) + firstDuration * playbackRate : Math.max(0, Number(source.sourceStart) || 0) };
    const next = [...segments]; next.splice(index, 1, first, second);
    d.commitVisualSegments(next, "已在播放头位置切开视觉片段", index + 1);
  };
  const handleCutCaption = () => {
    if (d.trackLocks.caption) return void d.notify("字幕轨已锁定，无法剪切");
    const index = d.selectedSegmentId ? d.selectedSegmentIndex : d.focusedSegmentIndex;
    const source = d.captionSegments[index];
    if (!source || source.text.length < 6) return void d.notify("当前字幕太短，不适合继续拆分");
    const splitAt = Math.max(2, Math.ceil(source.text.length / 2));
    const splitTime = hasExplicitCaptionTiming(source) && source.end - source.start > 0.4 ? source.start + (source.end - source.start) / 2 : null;
    const next = [...d.captionSegments]; next.splice(index, 1,
      { ...source, id: makeId("caption"), text: source.text.slice(0, splitAt), weight: Math.max(0.7, (source.weight ?? 1) / 2), ...(splitTime ? { end: splitTime } : {}) },
      { ...source, id: makeId("caption"), text: source.text.slice(splitAt), weight: Math.max(0.7, (source.weight ?? 1) / 2), ...(splitTime ? { start: splitTime } : {}) });
    d.commitCaptionSegments(next, "已把当前字幕片段拆成两段", index + 1);
  };
  const handleCutTrack = () => {
    if (d.selectedTrack === "image") return void handleCutVisualSegment();
    if (d.selectedTrack === "caption") return void handleCutCaption();
    if (d.selectedTrack === "sticker") {
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
    d.notify("当前轨道暂不支持剪切片段");
  };
  return { handleCutTrack };
}
