import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { downloadBlob } from "./media.js";
import { createVisualSegment, makeId } from "./timeline.js";

export function createTimelineClipboardActions(d) {
  const focusedStickerIndex = () => {
    if (!d.stickerSegments.length) return -1;
    const selected = d.selectedStickerSegmentId && d.stickerSegments.findIndex((segment) => segment.id === d.selectedStickerSegmentId);
    return selected >= 0 ? selected : d.currentStickerSegmentIndex >= 0 ? d.currentStickerSegmentIndex : 0;
  };
  const deleteSticker = () => {
    if (d.trackLocks.sticker) return void d.notify("贴纸轨已锁定，无法删除");
    const index = focusedStickerIndex(); if (index < 0) return void d.notify("当前没有贴纸片段可删除");
    const next = d.stickerSegments.filter((_, position) => position !== index);
    d.commitStickerSegments(next, next.length ? "已删除当前贴纸片段" : "已删除最后一个贴纸片段", next[Math.max(0, index - 1)]?.id ?? "");
  };
  const handleDeleteTrack = () => {
    if (d.trackLocks[d.selectedTrack]) return void d.notify("当前轨道已锁定，无法删除");
    if (d.selectedTrack === "caption") return void d.handleRemoveSegment();
    if (d.selectedTrack === "overlay") {
      if (!d.selectedVisualOverlayId) return void d.notify("请先选择一个画中画片段");
      const next = d.visualOverlaySegments.filter((segment) => segment.id !== d.selectedVisualOverlayId);
      d.setVisualOverlaySegments(next);
      d.setSelectedVisualOverlayId("");
      return void d.notify("已删除画中画片段");
    }
    if (d.selectedTrack === "sticker") return void deleteSticker();
    if (d.selectedTrack === "image") {
      if (!d.imageSrc || d.imageClipCount === 0) return void d.notify("当前没有视觉片段可删除");
      const source = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 0, d.getCurrentVisualAssetSnapshot())];
      const index = d.selectedVisualSegmentId && source.some((segment) => segment.id === d.selectedVisualSegmentId)
        ? d.selectedVisualSegmentIndex : d.currentVisualSegmentIndex >= 0 ? d.currentVisualSegmentIndex : 0;
      const next = source.filter((_, position) => position !== index);
      return void (next.length ? d.commitVisualSegments(next, "已删除当前视觉片段", Math.max(0, index - 1)) : d.clearImageTrack("已删除当前视觉片段"));
    }
    if (d.selectedTrack === "audio") {
      const id = d.selectedAudioSegmentId || d.selectedAudioSegment?.id;
      return id ? void d.deleteAudioSegment(id) : void d.notify("当前没有选中的配音片段");
    }
    if (d.selectedTrack === "source") {
      if (d.sourceAudioLinked && d.selectedSourceAudioSegmentId && d.selectedSourceAudioSegmentId !== "source-audio") {
        const index = d.visualSegments.findIndex((segment) => segment.id === d.selectedSourceAudioSegmentId);
        if (index < 0) return void d.notify("当前没有选中的原声音频片段");
        const next = d.visualSegments.map((segment, position) => {
          if (position !== index) return segment;
          const detached = { ...segment, sourceAudioDisabled: false };
          delete detached.sourceAudioOffset;
          return detached;
        });
        const hasRemainingLinkedAudio = (d.linkedSourceAudioSegments ?? [])
          .some((segment) => segment.id !== d.selectedSourceAudioSegmentId);
        d.commitVisualSegments(next, "已删除当前原声音频片段", Math.max(0, index));
        if (!hasRemainingLinkedAudio) d.clearSourceAudioTrack("");
        d.setSelectedSourceAudioSegmentId("");
        return;
      }
      if (!d.selectedSourceAudioSegmentId) return void d.notify("当前没有选中的原声音频片段");
      d.setSelectedSourceAudioSegmentId("");
      return void d.clearSourceAudioTrack("已删除当前原声音频片段");
    }
    if (d.selectedTrack === "music") return void d.clearMusicTrack();
    d.clearImageTrack();
  };
  const handleDuplicateTrack = () => {
    if (d.trackLocks[d.selectedTrack]) return void d.notify("当前轨道已锁定，无法复制");
    if (d.selectedTrack === "overlay") {
      const source = d.visualOverlaySegments.find((segment) => segment.id === d.selectedVisualOverlayId);
      if (!source) return void d.notify("请先选择一个画中画片段");
      const copy = { ...source, id: makeId("overlay"), name: `${source.name || "画中画"} 副本`, start: Math.min(MAX_TIMELINE_DURATION_SECONDS - source.duration, source.start + 0.2), layer: d.visualOverlaySegments.length + 1 };
      d.setVisualOverlaySegments((items) => [...items, copy]);
      d.setSelectedVisualOverlayId(copy.id);
      return void d.notify("已复制画中画片段");
    }
    if (d.selectedTrack === "sticker") {
      const source = d.stickerSegments[focusedStickerIndex()]; if (!source) return void d.notify("请先选择一个贴纸片段");
      const copy = { ...source, id: makeId("sticker"), start: Math.min(MAX_TIMELINE_DURATION_SECONDS - source.duration, source.start + source.duration + 0.2) };
      return void d.commitStickerSegments([...d.stickerSegments, copy], "已复制当前贴纸片段", copy.id);
    }
    if (d.selectedTrack === "caption") {
      if (!d.captionSegments.length) return void d.notify("当前没有可复制的字幕片段");
      const index = d.selectedSegmentId ? d.selectedSegmentIndex : d.focusedSegmentIndex;
      const source = d.captionSegments[index] ?? d.captionSegments[d.focusedSegmentIndex];
      const next = [...d.captionSegments]; next.splice(index + 1, 0, { ...source, id: makeId("caption"), text: `${source.text} 副本` });
      return void d.commitCaptionSegments(next, "已复制当前字幕片段", index + 1);
    }
    if (d.selectedTrack === "image") {
      if (!d.imageSrc) return void d.notify("当前没有可复制的图片素材");
      const source = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 4, d.getCurrentVisualAssetSnapshot())];
      const segment = source[d.selectedVisualSegmentId && source.some((item) => item.id === d.selectedVisualSegmentId) ? d.selectedVisualSegmentIndex : Math.max(0, d.currentVisualSegmentIndex)] ?? d.getCurrentVisualAssetSnapshot();
      d.setUserAssets((assets) => [{ id: crypto.randomUUID(), type: segment.type || d.visualType, src: segment.src || d.imageSrc,
        name: `${(segment.name || d.imageName).replace(/\.[^.]+$/, "")}-copy.${(segment.type || d.visualType) === "video" ? "mp4" : "png"}`,
        meta: segment.meta || d.imageMeta, duration: segment.duration || d.imageDuration, blob: segment.blob || null }, ...assets]);
      return void d.notify("当前图片已复制到我的素材");
    }
    if (d.selectedTrack === "audio") {
      const source = d.selectedAudioSegment; if (!source) return void d.notify(d.t("audioClipMissing"));
      const id = crypto.randomUUID(); const start = Math.min(MAX_TIMELINE_DURATION_SECONDS - source.duration, source.start + 0.2);
      const copy = { ...source, id, url: URL.createObjectURL(source.blob), start, name: `${source.name || d.t("audioClip")} ${d.t("copySuffix")}` };
      const delta = start - source.start;
      const captions = d.captionSegments.filter((caption) => caption.audioSegmentId === source.id)
        .map((caption) => ({ ...caption, id: makeId("caption"), audioSegmentId: id, start: caption.start + delta, end: caption.end + delta }));
      d.setAudioSegments((items) => [...items, copy]); d.setCaptionSegments((items) => [...items, ...captions].sort((a, b) => (a.start || 0) - (b.start || 0)));
      d.setSelectedAudioSegmentId(id); return void d.notify(d.t("audioClipDuplicated"));
    }
    const blob = d.selectedTrack === "music" ? d.musicBlob : d.selectedTrack === "source" ? d.sourceAudioBlob : d.audioBlob;
    const name = d.selectedTrack === "music" ? d.musicName || "background-music.wav" : d.selectedTrack === "source" ? d.sourceAudioName || "source-audio.wav" : "ai-voiceover-copy.wav";
    if (blob) { downloadBlob(blob, name); d.notify("当前音频副本已下载"); } else d.notify("当前没有可复制的音频");
  };
  return { handleDeleteTrack, handleDuplicateTrack };
}
