import {
  IMAGE_RESIZE_OVERFLOW_SECONDS_PER_PIXEL, IMAGE_SNAP_THRESHOLD_PIXELS,
  MAX_TIMELINE_DURATION_SECONDS, MIN_VISUAL_SEGMENT_SECONDS,
} from "../config/editor.js";
import { createVisualSegment, estimateDuration, getImageThumbnailCount, getVisualSegmentsTotal } from "./timeline.js";

export function createImageResizeControl(d) {
  return function startImageResize(event, segmentId = "", segmentIndex = -1) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    if (d.trackLocks.image) return void d.notify("图片轨已锁定，无法拉长片段");
    if (!d.imageSrc || d.timelineDuration <= 0) return void d.notify("请先上传或选择图片/视频素材");
    d.setSelectedTrack("image");
    const rect = d.trackScrollRef.current?.getBoundingClientRect();
    const segments = d.visualSegments.length ? d.visualSegments : [createVisualSegment(d.imageDuration || 4, d.getCurrentVisualAssetSnapshot())];
    const idIndex = segments.findIndex((segment) => segment.id === segmentId);
    const index = idIndex >= 0 ? idIndex : segmentIndex >= 0 && segmentIndex < segments.length ? segmentIndex : Math.max(0, segments.length - 1);
    const resizeId = segments[index]?.id ?? "";
    const before = getVisualSegmentsTotal(segments.slice(0, index));
    const after = getVisualSegmentsTotal(segments.slice(index + 1));
    const startDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, d.imageDuration);
    const timelineDuration = Math.max(10, startDuration, d.timelineDurationRef.current || d.timelineDuration);
    d.setSelectedVisualSegmentId(resizeId);
    const secondsPerPixel = rect ? timelineDuration / Math.max(rect.width, 1) : IMAGE_RESIZE_OVERFLOW_SECONDS_PER_PIXEL;
    const overflowRate = Math.max(secondsPerPixel, IMAGE_RESIZE_OVERFLOW_SECONDS_PER_PIXEL);
    const snapPoints = [
      d.audioBlob && d.audioDuration > 0 ? { time: Math.min(MAX_TIMELINE_DURATION_SECONDS, d.audioDuration), label: "配音结尾" } : null,
      d.sourceAudioBlob && d.sourceAudioDuration > 0 ? { time: Math.min(MAX_TIMELINE_DURATION_SECONDS, d.sourceAudioStart + d.sourceAudioDuration), label: "原声结尾" } : null,
      d.musicBlob && d.musicDuration > 0 ? { time: Math.min(MAX_TIMELINE_DURATION_SECONDS, d.musicDuration), label: "音乐结尾" } : null,
    ].filter(Boolean);
    let activeLabel = "";
    const apply = (clientX) => {
      if (!rect) return;
      const pointerX = clientX - rect.left;
      const inTrackX = Math.max(0, Math.min(rect.width, pointerX));
      const raw = (inTrackX / Math.max(rect.width, 1)) * timelineDuration + Math.max(0, pointerX - rect.width) * overflowRate;
      const clamped = Math.max(0.5, Math.min(MAX_TIMELINE_DURATION_SECONDS, raw));
      const snap = snapPoints.map((point) => ({ ...point, distance: Math.abs(pointerX - (point.time / timelineDuration) * rect.width) }))
        .filter((point) => point.distance <= IMAGE_SNAP_THRESHOLD_PIXELS).sort((a, b) => a.distance - b.distance)[0] ?? null;
      const target = snap?.time ?? clamped;
      const maxDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS - before - after);
      const resized = Math.min(maxDuration, Math.max(MIN_VISUAL_SEGMENT_SECONDS, target - before));
      const next = segments.map((segment, position) => position === index ? { ...segment, duration: resized } : segment);
      const visualDuration = getVisualSegmentsTotal(next);
      const projectDuration = Math.max(d.audioBlob ? d.audioDuration : 0, d.captionDuration,
        d.sourceAudioBlob ? d.sourceAudioStart + d.sourceAudioDuration : 0,
        d.musicBlob ? d.musicDuration : 0, estimateDuration(d.script), visualDuration);
      activeLabel = snap?.label ?? ""; d.setSnapGuide(snap); d.setVisualSegments(next);
      d.setImageDuration(visualDuration); d.setImageClipCount(getImageThumbnailCount(visualDuration));
      d.setCurrentTime((time) => Math.min(time, projectDuration));
    };
    apply(event.clientX);
    const move = (e) => apply(e.clientX);
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); d.setSnapGuide(null);
      d.notify(activeLabel === "配音结尾" ? "图片已吸附到配音结尾" : activeLabel === "原声结尾" ? "图片已吸附到视频原声结尾" : activeLabel === "音乐结尾" ? "图片已吸附到音乐结尾" : "图片片段时长已调整");
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true });
  };
}
