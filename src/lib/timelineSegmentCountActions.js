import { DEFAULT_STICKER_SEGMENT_SECONDS, IMAGE_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";
import { createStickerSegment, createVisualSegment, getVisualSegmentTimeline, getVisualSegmentsTotal, makeId } from "./timeline.js";

export function createTimelineSegmentCountActions(d) {
  const stickerIndex = () => {
    const selected = d.selectedStickerSegmentId ? d.stickerSegments.findIndex((segment) => segment.id === d.selectedStickerSegmentId) : -1;
    return selected >= 0 ? selected : d.currentStickerSegmentIndex >= 0 ? d.currentStickerSegmentIndex : 0;
  };
  const deleteSticker = () => {
    if (!d.stickerSegments.length) return void d.notify("当前没有贴纸片段可删除");
    const index = stickerIndex(); const next = d.stickerSegments.filter((_, position) => position !== index);
    d.commitStickerSegments(next, next.length ? "已删除当前贴纸片段" : "已删除最后一个贴纸片段", next[Math.max(0, index - 1)]?.id ?? "");
  };
  const handleAddCaptionSegment = (requestedStart = null) => {
    if (d.trackLocks.caption) return void d.notify(d.t?.("captionTrackLocked") ?? "字幕轨已锁定，无法新增字幕片段");
    const insertionTime = Number.isFinite(requestedStart) ? requestedStart : d.currentTime;
    const start = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - 0.45, insertionTime));
    const segment = { id: makeId("caption"), text: d.t?.("newCaptionDefault") ?? "新的字幕片段", weight: 1, hidden: false,
      start, end: Math.min(MAX_TIMELINE_DURATION_SECONDS, start + 1.8) };
    const next = [...d.captionSegments, segment].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    d.commitCaptionSegments(next, Number.isFinite(requestedStart) ? "已在点击位置新增字幕片段" : "已在播放头位置新增字幕片段", next.findIndex((item) => item.id === segment.id));
  };
  const handleAddSegment = (requestedStart = null) => {
    if (d.selectedTrack === "sticker") {
      if (d.trackLocks.sticker) return void d.notify("贴纸轨已锁定，无法新增贴纸片段");
      const source = d.stickerSegments[stickerIndex()] ?? d.getStickerDragAsset(d.selectedSticker);
      if (!source?.src) return void d.notify("请先选择一个贴纸");
      const segment = createStickerSegment(source, d.currentTime, DEFAULT_STICKER_SEGMENT_SECONDS);
      return void d.commitStickerSegments([...d.stickerSegments, segment], "已新增贴纸片段", segment.id);
    }
    if (d.selectedTrack === "image") {
      if (d.trackLocks.image) return void d.notify("图片轨已锁定，无法新增片段");
      if (!d.imageSrc) return void d.notify("请先上传或选择图片/视频素材");
      const source = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 4, d.getCurrentVisualAssetSnapshot())];
      const available = MAX_TIMELINE_DURATION_SECONDS - getVisualSegmentsTotal(source);
      if (available < MIN_VISUAL_SEGMENT_SECONDS) return void d.notify("视觉轨道已经达到 30 分钟上限");
      const timeline = getVisualSegmentTimeline(source);
      const playhead = Math.max(0, Math.min(getVisualSegmentsTotal(source), d.currentTime));
      const activeIndex = timeline.findIndex((range) => playhead >= range.start && playhead < range.end);
      const selectedIndex = d.selectedVisualSegmentId && source.some((segment) => segment.id === d.selectedVisualSegmentId)
        ? d.selectedVisualSegmentIndex
        : activeIndex >= 0 ? activeIndex : source.length - 1;
      const asset = source[selectedIndex] ?? d.getCurrentVisualAssetSnapshot();
      const segment = createVisualSegment(Math.min(IMAGE_SEGMENT_SECONDS, available), asset);
      const boundaryIndex = timeline.findIndex((range) => Math.abs(range.start - playhead) < 0.001);
      if (boundaryIndex >= 0) {
        const next = [...source]; next.splice(boundaryIndex, 0, segment);
        return void d.commitVisualSegments(next, "已在播放头位置新增视觉片段", boundaryIndex);
      }
      const range = timeline[activeIndex]; const active = source[activeIndex];
      if (range && active && playhead > range.start && playhead < range.end) {
        const leftDuration = playhead - range.start; const rightDuration = range.end - playhead;
        if (leftDuration < MIN_VISUAL_SEGMENT_SECONDS || rightDuration < MIN_VISUAL_SEGMENT_SECONDS) {
          return void d.notify("播放头离片段边缘太近，请稍微移开后新增");
        }
        const playbackRate = active.type === "video" ? Math.max(0.25, Math.min(4, Number(active.playbackRate) || 1)) : 1;
        const left = { ...active, id: makeId("visual"), duration: leftDuration,
          sourceDuration: active.type === "video" ? leftDuration * playbackRate : active.sourceDuration };
        const right = { ...active, id: makeId("visual"), duration: rightDuration,
          sourceDuration: active.type === "video" ? rightDuration * playbackRate : active.sourceDuration,
          sourceStart: active.type === "video" ? Math.max(0, Number(active.sourceStart) || 0) + leftDuration * playbackRate : Math.max(0, Number(active.sourceStart) || 0) };
        const next = [...source]; next.splice(activeIndex, 1, left, segment, right);
        return void d.commitVisualSegments(next, "已在播放头位置新增视觉片段", activeIndex + 1);
      }
      return void d.commitVisualSegments([...source, segment], "已在播放头位置新增视觉片段", source.length);
    }
    if (["audio", "source", "music"].includes(d.selectedTrack)) return void d.notify(d.selectedTrack === "music" ? "背景音乐暂不支持切片，请删除后重新上传" : d.selectedTrack === "source" ? "视频原声暂不支持切片，可删除后重新上传视频" : "音频片段由生成结果决定，请重新生成或复制 WAV");
    return handleAddCaptionSegment(requestedStart);
  };
  const handleRemoveSegment = () => {
    if (d.selectedTrack === "sticker") return void deleteSticker();
    if (d.selectedTrack === "image") {
      if (d.trackLocks.image) return void d.notify("图片轨已锁定，无法减少片段");
      if (!d.imageSrc || d.imageClipCount === 0) return void d.notify("当前没有视觉片段可减少");
      const source = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 0, d.getCurrentVisualAssetSnapshot())];
      if (source.length > 1) {
        const index = d.selectedVisualSegmentId && source.some((segment) => segment.id === d.selectedVisualSegmentId) ? d.selectedVisualSegmentIndex : d.currentVisualSegmentIndex >= 0 ? d.currentVisualSegmentIndex : source.length - 1;
        return void d.commitVisualSegments(source.filter((_, position) => position !== index), "已删除当前视觉片段", Math.max(0, index - 1));
      }
      if (source[0].duration <= IMAGE_SEGMENT_SECONDS) return void d.clearImageTrack("已删除最后一个视觉片段");
      return void d.commitVisualSegments([{ ...source[0], duration: source[0].duration - IMAGE_SEGMENT_SECONDS }], "已缩短当前视觉片段", 0);
    }
    if (["audio", "source", "music"].includes(d.selectedTrack)) return void d.notify(d.selectedTrack === "music" ? "背景音乐可整轨删除，暂不支持局部减少" : d.selectedTrack === "source" ? "视频原声可整轨删除，暂不支持局部减少" : "音频片段不能单独减少；可以删除音频轨或重新生成");
    if (!d.captionSegments.length) return void d.notify("当前没有字幕片段可删除");
    d.deleteCaptionSegment(d.selectedSegmentId);
  };
  return { handleAddCaptionSegment, handleAddSegment, handleRemoveSegment };
}
