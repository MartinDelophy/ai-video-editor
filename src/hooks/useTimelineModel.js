import { useMemo } from "react";

import {
  DEFAULT_STICKER_SEGMENT_SECONDS,
  DEFAULT_TIMELINE_DURATION_SECONDS,
  FILTER_OPTIONS,
  MAX_TIMELINE_DURATION_SECONDS,
  RATIO_OPTIONS,
  STICKERS,
  VISUAL_STYLE_OPTIONS,
  VOICES,
} from "../config/editor.js";
import {
  getCaptionTimeline,
  getSegmentIndexAtTime,
  getTimedSegmentIndexAtTime,
  getTimedSegmentsEnd,
  getVisualSegmentIndexAtTime,
  getVisualSegmentTimeline,
} from "../lib/timeline.js";
import { getVisionKey } from "../lib/vision.js";
import { getVisualSourceTime } from "../lib/visualEffects.js";
import { getTimelineProjectDuration } from "../lib/timelineScale.js";

export function useTimelineModel(d) {
  const selectedVoice = useMemo(
    () => VOICES.find((voice) => voice.id === d.selectedVoiceId) ?? VOICES[0],
    [d.selectedVoiceId],
  );
  const selectedAudioSegment =
    d.audioSegments.find((segment) => segment.id === d.selectedAudioSegmentId) ??
    d.audioSegments.at(-1) ??
    null;
  const audioBlob = selectedAudioSegment?.blob ?? null;
  const audioUrl = selectedAudioSegment?.url ?? "";
  const audioDuration = selectedAudioSegment?.duration ?? 0;
  const peaks = selectedAudioSegment?.peaks ?? [];
  const ratio = useMemo(
    () => RATIO_OPTIONS.find((option) => option.id === d.ratioId) ?? RATIO_OPTIONS[0],
    [d.ratioId],
  );
  const selectedFilter = useMemo(
    () => VISUAL_STYLE_OPTIONS.find((filter) => filter.id === d.selectedFilterId) ?? FILTER_OPTIONS[0],
    [d.selectedFilterId],
  );
  const selectedSticker = useMemo(
    () => STICKERS.find((sticker) => sticker.id === d.selectedStickerId) ?? STICKERS[0],
    [d.selectedStickerId],
  );
  const getStickerDragAsset = (sticker) => sticker?.id && sticker.id !== "none"
    ? {
        ...sticker,
        type: "sticker",
        meta: "贴纸",
        duration: DEFAULT_STICKER_SEGMENT_SECONDS,
      }
    : null;
  const segments = useMemo(
    () => d.captionSegments.map((segment) => segment.text),
    [d.captionSegments],
  );
  const voiceTrackDuration = useMemo(
    () => getTimedSegmentsEnd(d.audioSegments),
    [d.audioSegments],
  );
  const captionTargetDuration = voiceTrackDuration;
  const captionTimeline = useMemo(
    () => getCaptionTimeline(d.captionSegments, captionTargetDuration),
    [d.captionSegments, captionTargetDuration],
  );
  const captionDuration = captionTimeline.at(-1)?.end ?? 0;
  const visualTimeline = useMemo(
    () => getVisualSegmentTimeline(d.visualSegments),
    [d.visualSegments],
  );
  const stickerDuration = useMemo(
    () => getTimedSegmentsEnd(d.stickerSegments),
    [d.stickerSegments],
  );
  const estimatedDuration = useMemo(() => Math.max(
    voiceTrackDuration,
    captionDuration,
    d.sourceAudioBlob ? (d.sourceAudioTimelineEnd ?? d.sourceAudioStart + d.sourceAudioDuration) : 0,
    d.musicBlob ? d.musicStart + d.musicDuration : 0,
    stickerDuration,
    d.imageSrc ? d.imageDuration : 0,
  ), [
    voiceTrackDuration, captionDuration, d.imageDuration, d.imageSrc, d.musicBlob,
    d.musicDuration, d.musicStart, d.sourceAudioBlob, d.sourceAudioDuration,
    d.sourceAudioStart, d.sourceAudioTimelineEnd, stickerDuration,
  ]);
  const timelineDuration = useMemo(() => estimatedDuration <= 0
    ? DEFAULT_TIMELINE_DURATION_SECONDS
    : Math.min(
        MAX_TIMELINE_DURATION_SECONDS,
        Math.max(d.timelineHorizon, getTimelineProjectDuration(estimatedDuration)),
      ), [estimatedDuration, d.timelineHorizon]);
  d.timelineDurationRef.current = timelineDuration;

  const currentSegmentIndex = getSegmentIndexAtTime(
    d.captionSegments,
    d.currentTime,
    captionTargetDuration,
  );
  const selectedSegmentIndex = Math.max(
    0,
    d.captionSegments.findIndex((segment) => segment.id === d.selectedSegmentId),
  );
  const focusedSegmentIndex = currentSegmentIndex >= 0
    ? currentSegmentIndex
    : Math.max(0, selectedSegmentIndex);
  const currentCaptionSegment = currentSegmentIndex >= 0
    ? d.captionSegments[currentSegmentIndex] ?? null
    : null;
  const selectedCaptionSegment =
    d.captionSegments.find((segment) => segment.id === d.selectedSegmentId) ??
    currentCaptionSegment;
  const currentCaption = currentCaptionSegment && !currentCaptionSegment.hidden
    ? currentCaptionSegment.text
    : "";
  const currentStickerSegmentIndex = getTimedSegmentIndexAtTime(d.stickerSegments, d.currentTime);
  const currentStickerSegment = currentStickerSegmentIndex >= 0
    ? d.stickerSegments[currentStickerSegmentIndex] ?? null
    : null;
  const selectedStickerSegmentIndex = Math.max(
    0,
    d.stickerSegments.findIndex((segment) => segment.id === d.selectedStickerSegmentId),
  );
  const currentStickerSegments = d.trackVisibility.sticker
    ? d.stickerSegments.filter((segment) => {
        const start = Math.max(0, Number(segment.start) || 0);
        const end = start + Math.max(0, Number(segment.duration) || 0);
        return d.currentTime >= start && d.currentTime < end;
      })
    : [];
  // The preview is timeline-driven. A library selection is only a source for
  // creating a clip; it must not survive after the final sticker clip is deleted.
  const previewSticker = d.trackVisibility.sticker ? currentStickerSegment : null;
  const previewStickers = currentStickerSegments;
  const currentVisualSegmentIndex = getVisualSegmentIndexAtTime(d.visualSegments, d.currentTime);
  const currentVisualSegment = currentVisualSegmentIndex >= 0
    ? d.visualSegments[currentVisualSegmentIndex] ?? null
    : null;
  const currentVisualRange = currentVisualSegmentIndex >= 0
    ? visualTimeline[currentVisualSegmentIndex] ?? null
    : null;
  const previewVisualSegmentIndex = currentVisualSegmentIndex >= 0
    ? currentVisualSegmentIndex
    : d.visualSegments.length
      ? d.currentTime >= d.imageDuration ? d.visualSegments.length - 1 : 0
      : -1;
  const previewVisualSegment = previewVisualSegmentIndex >= 0
    ? d.visualSegments[previewVisualSegmentIndex] ?? null
    : null;
  const previewVisualRange = previewVisualSegmentIndex >= 0
    ? visualTimeline[previewVisualSegmentIndex] ?? null
    : null;
  const previewVisualSrc = previewVisualSegment?.src || d.imageSrc;
  const previewVisualType = previewVisualSegment?.type || d.visualType;
  const activePreviewFilter = useMemo(
    () => VISUAL_STYLE_OPTIONS.find(
      (filter) => filter.id === (previewVisualSegment?.filterId || d.selectedFilterId),
    ) ?? FILTER_OPTIONS[0],
    [previewVisualSegment?.filterId, d.selectedFilterId],
  );
  const previewVisualLocalTime = previewVisualRange
    ? Math.max(0, d.currentTime - previewVisualRange.start)
    : d.currentTime;
  const previewVisualSourceTime = previewVisualType === "video"
    ? getVisualSourceTime(previewVisualSegment, previewVisualLocalTime)
    : previewVisualLocalTime;
  const previewTransition = (() => {
    const junction = previewVisualSegment?.transition;
    const next = d.visualSegments[previewVisualSegmentIndex + 1];
    if (!next || !junction?.id || junction.id === "none" || !previewVisualRange) return null;
    const duration = Math.max(0.1, Math.min(Number(junction.duration) || 0.5, previewVisualSegment.duration || 0.5, next.duration || 0.5));
    const start = previewVisualRange.end - duration;
    if (d.currentTime < start || d.currentTime >= previewVisualRange.end) return null;
    return { id: junction.id, duration, progress: (d.currentTime - start) / duration, next };
  })();
  const previewVisionKey = getVisionKey(previewVisualSegment ?? (previewVisualSrc ? {
    id: "visual-fallback",
    src: previewVisualSrc,
    type: previewVisualType,
    width: previewVisualSegment?.width ?? 0,
    height: previewVisualSegment?.height ?? 0,
  } : null));
  const previewVisionRecord = previewVisionKey ? d.visionRecords[previewVisionKey] ?? null : null;
  const previewVisionBaseAnalysis = previewVisionRecord?.analysis ?? null;
  const selectedVisualSegmentIndex = Math.max(
    0,
    d.visualSegments.findIndex((segment) => segment.id === d.selectedVisualSegmentId),
  );
  const hasPlayableVisualTimeline = Boolean(
    previewVisualSrc && d.trackVisibility.image && d.imageDuration > 0,
  );
  const hasPlayableAudioTimeline = Boolean(
    (d.trackVisibility.audio && audioBlob && audioUrl) ||
    (d.trackVisibility.source && d.sourceAudioBlob && d.sourceAudioUrl) ||
    (d.trackVisibility.music && d.musicBlob && d.musicUrl),
  );

  return {
    activePreviewFilter, audioBlob, audioDuration, audioUrl, canPreview:
      hasPlayableVisualTimeline || hasPlayableAudioTimeline,
    captionDuration, captionTargetDuration, captionTimeline, currentCaption,
    currentCaptionSegment, currentSegmentIndex, currentStickerSegment,
    currentStickerSegmentIndex, currentVisualRange, currentVisualSegment,
    currentVisualSegmentIndex, estimatedDuration, focusedSegmentIndex, getStickerDragAsset,
    peaks, previewSticker, previewStickers, previewVisionBaseAnalysis, previewVisionKey,
    previewTransition, previewVisionRecord, previewVisualLocalTime, previewVisualRange, previewVisualSegment,
    previewVisualSegmentIndex, previewVisualSourceTime, previewVisualSrc, previewVisualType,
    ratio, segments, selectedAudioSegment, selectedCaptionSegment, selectedFilter,
    selectedSegmentIndex, selectedSticker, selectedStickerSegmentIndex,
    selectedVisualSegmentIndex, selectedVoice, stickerDuration, timelineDuration, visualTimeline,
    voiceTrackDuration,
  };
}
