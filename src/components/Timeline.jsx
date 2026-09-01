import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowFatLinesLeft,
  ArrowLeft,
  ArrowLineLeft,
  ArrowLineRight,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  CaretDown,
  CopySimple,
  Crop,
  CircleNotch,
  ClosedCaptioning,
  Eye,
  EyeSlash,
  LockKey,
  LockKeyOpen,
  LinkBreak,
  LinkSimple,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  MinusCircle,
  MonitorPlay,
  Pause,
  Play,
  PictureInPicture,
  PlusCircle,
  Scissors,
  CursorClick,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  SlidersHorizontal,
  TextT,
  Trash,
  Waveform,
  X,
} from "@phosphor-icons/react";

import { IMAGE_SEGMENT_SECONDS, MAX_TIMELINE_DURATION_SECONDS, TRANSITIONS } from "../config/editor.js";
import { formatClock, formatCompactDuration, formatTime, getSegmentStartTime, getTimedSegmentLaneStateKey, getVisualSegmentStartTime, packCaptionSegmentsIntoLanes, packTimedSegmentsIntoLanes } from "../lib/timeline.js";
import { sliceSourceAudioPeaks } from "../lib/sourceAudioSync.js";
import {
  DEFAULT_OVERLAY_SECONDS,
  compactVisualOverlayLanes,
  createMainVisualFromOverlay,
  reorderSingleVisualOverlayLane,
} from "../lib/visualOverlayTimeline.js";
import { getSampledVideoTrackFrames, getVideoTrackFrameAtSourceTime, getVideoTrackFrameSource } from "../lib/videoTrackFrames.js";
import { captureVideoTrackFrame, extractVideoTrackFrames, getVideoTrackSampleCount } from "../lib/media.js";
import { getVisualSourceTime } from "../lib/visualEffects.js";
import { normalizeVisualSpeedCurve } from "../lib/visualSpeedCurve.js";
import { rollVisualBoundary, slideVisualSegment, slipVisualSegment } from "../lib/fineEdit.js";
import { collectTimelineSnapPoints, createTimelineSnapGuide, findClosestTimelineSnap, snapTimelineRange } from "../lib/timelineSnap.js";
import {
  createTimelineEdgeAutoScroller,
  createTimelineVerticalEdgeAutoScroller,
  getTimelineActiveDragHorizon,
  getTimelineDragTimeDelta,
  getTrimLockedTrackWidth,
  settleTimelineDrag,
  TIMELINE_TRIM_SCALE_END_EVENT,
  TIMELINE_TRIM_SCALE_START_EVENT,
} from "../lib/timelineEdgeAutoScroll.js";
import { getMobileClipActionIds, getMobileClipPanel, resolveMobileClipActionTrack, shouldActivateToolRailForClip } from "../lib/mobileClipActions.js";
import {
  getPrimaryShortcutModifier,
  isEditorInteractiveTarget,
  isEditorShortcutBlockedByModal,
  isEditorTextEntryTarget,
  releasePointerActivatedFocus,
} from "../lib/editorShortcuts.js";
import {
  clampTimelineZoom,
  getTimelineRulerTicks,
  getTimelineAutoFitZoom,
  getMobilePinchAnchorScrollLeft,
  getMobilePinchZoomState,
  getTimelineTrackWidthPercent,
  getTimelineVisibleDuration,
  getTimelineVisibleDurationForPixelScale,
  getTimelineZoomForVisibleDuration,
  getTimelineZoomLabel,
} from "../lib/timelineScale.js";
import { IconButton, WaveformStrip } from "./ui.jsx";

const TIMELINE_WHEEL_ZOOM_SENSITIVITY = 0.00056;
const TIMELINE_WHEEL_ZOOM_COMMIT_DELAY = 180;
const TIMELINE_WHEEL_GESTURE_RESET_DELAY = 180;
const TIMELINE_BUTTON_ZOOM_RATIO = 1.25;
const TIMELINE_TRACK_ROW_HEIGHT = "var(--timeline-track-row-height, 48px)";
const VIDEO_FRAME_MIN_COUNT = 1;
const VIDEO_THUMBNAIL_DISPLAY_MAX_COUNT = 480;
const PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS = 0.025;
const IMAGE_THUMBNAIL_TARGET_WIDTH = 84;
const IMAGE_THUMBNAIL_MAX_COUNT = 240;
const TIMELINE_WHEEL_ZOOM_CONTENT_SELECTOR = [
  ".image-clip",
  ".visual-overlay-clip",
  ".caption-segment",
  ".sticker-segment",
  ".audio-clip",
].join(", ");

function getTimelineThumbnailCount({ duration, timelineDuration, contentWidth, timelineZoom, maxThumbnails = VIDEO_THUMBNAIL_DISPLAY_MAX_COUNT }) {
  if (!maxThumbnails || timelineDuration <= 0 || contentWidth <= 0) {
    return VIDEO_FRAME_MIN_COUNT;
  }

  const clipPixelWidth = Math.max(68, (Math.max(0, duration || 0) / timelineDuration) * contentWidth);
  const targetCellWidth =
    timelineZoom >= 8
      ? 48
      : timelineZoom >= 3
        ? 56
        : timelineZoom >= 1
          ? 64
          : 76;
  return Math.max(
    VIDEO_FRAME_MIN_COUNT,
    Math.min(maxThumbnails, Math.ceil(clipPixelWidth / targetCellWidth)),
  );
}

function getBisectionCellOrder(startIndex, endIndex) {
  if (endIndex < startIndex) return [];
  const order = [];
  const ranges = [[startIndex, endIndex]];
  while (ranges.length) {
    const [start, end] = ranges.shift();
    if (end < start) continue;
    const middle = Math.floor((start + end) / 2);
    order.push(middle);
    if (start < middle) ranges.push([start, middle - 1]);
    if (middle < end) ranges.push([middle + 1, end]);
  }
  return order;
}

function mergeExactVideoTrackFrame(frames, incoming, tolerance = 0.06) {
  if (!incoming?.src) return Array.isArray(frames) ? frames : [];
  const next = Array.isArray(frames) ? frames.slice() : [];
  const sourceTime = Number(incoming.sourceTime) || 0;
  const matchingIndex = next.findIndex((frame) => Math.abs((Number(frame?.sourceTime) || 0) - sourceTime) <= tolerance);
  if (matchingIndex >= 0) next[matchingIndex] = incoming;
  else next.push(incoming);
  next.sort((a, b) => (Number(a?.sourceTime) || 0) - (Number(b?.sourceTime) || 0));
  return next;
}

function mergeExactVideoTrackFrames(frames, incomingFrames, tolerance = 0.06) {
  return (Array.isArray(incomingFrames) ? incomingFrames : []).reduce(
    (merged, frame) => mergeExactVideoTrackFrame(merged, frame, tolerance),
    Array.isArray(frames) ? frames : [],
  );
}

function waitForFilmstripIdle(signal, minimumDelay = 0) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
      return;
    }
    let idleId = 0;
    let timerId = 0;
    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      if (idleId) window.cancelIdleCallback?.(idleId);
      if (timerId) window.clearTimeout(timerId);
    };
    const handleAbort = () => {
      cleanup();
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    const requestIdle = () => {
      timerId = 0;
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(finish, { timeout: 600 });
      } else {
        timerId = window.setTimeout(finish, 260);
      }
    };
    if (minimumDelay > 0) timerId = window.setTimeout(requestIdle, minimumDelay);
    else requestIdle();
  });
}

function getImageTimelineThumbnailCount({ duration, timelineDuration, contentWidth }) {
  if (timelineDuration <= 0 || contentWidth <= 0) {
    return 1;
  }

  const clipPixelWidth = Math.max(0, (Math.max(0, duration || 0) / timelineDuration) * contentWidth);
  return Math.max(1, Math.min(IMAGE_THUMBNAIL_MAX_COUNT, Math.ceil(clipPixelWidth / IMAGE_THUMBNAIL_TARGET_WIDTH)));
}

export function Timeline({
  t,
  trOption,
  notify,
  undo,
  redo,
  handleDeleteTrack,
  handleDuplicateTrack,
  handleCutTrack,
  rippleEditing,
  setRippleEditing,
  canPreview,
  handlePlayToggle,
  isPlaying,
  handleAddSegment,
  handleRemoveSegment,
  adjustSelectedSegmentWeight,
  timelineZoom,
  setTimelineZoom,
  selectedTrack,
  setSelectedTrack,
  setActiveTool,
  openMobileInspector,
  openMobileTools,
  openMobileFilePicker,
  requestCaptionVoiceFocus,
  alignCaptionToAudio,
  linkCaptionAudio,
  unlinkCaptionAudio,
  linkAllCaptionAudio,
  unlinkAllCaptionAudio,
  alignAudioCaptions,
  linkAudioToCaption,
  unlinkAudioCaptions,
  trackVisibility,
  toggleTrackVisibility,
  trackLocks,
  toggleTrackLock,
  trackScrollRef,
  startTimelineSeek,
  timelineDuration,
  timelineContentDuration = timelineDuration,
  setTimelineHorizon,
  currentTime,
  previewVideoMediaTime = 0,
  playheadPercent,
  snapGuide,
  setSnapGuide,
  assetDropTargetTrack,
  assetDropPosition,
  assetDropPulseTrack,
  assetDragPreview,
  draggedAssetType = "",
  draggedAssetDuration = 0,
  handleTrackAssetDragOver,
  handleTrackAssetDragLeave,
  handleTrackAssetDrop,
  handleVisualStyleDrop,
  activeTimelineClipDrag,
  showStickerTrack,
  stickerSegments,
  setStickerSegments,
  currentStickerSegment,
  selectedStickerSegmentId,
  setSelectedStickerSegmentId,
  stickerTimelineDrag,
  imageSrc,
  displayedVisualSegments,
  setVisualSegments,
  renderedVisualTimeline,
  visualType,
  currentVisualSegment,
  selectedVisualSegmentId,
  visualOverlaySegments = [],
  selectedVisualOverlayId = "",
  setSelectedVisualOverlayId,
  setVisualOverlaySegments,
  builtInImageCaptionAvailable = false,
  generateImageCaption,
  extractVideoSourceAudio,
  generateCaptionsFromAudioClip,
  separateAudioClipVocals,
  audioProcessingBusy = false,
  setSelectedVisualSegmentId,
  seekTo,
  suppressTimelineClipClickRef,
  startTimelineClipDrag,
  startCaptionResize,
  startImageResize,
  startStickerSegmentMove,
  startStickerSegmentResize,
  displayedCaptionSegments,
  displayedCaptionTimeline,
  setCaptionSegments,
  currentCaptionSegment,
  selectedSegmentId,
  setSelectedSegmentId,
  captionTargetDuration,
  sourceAudioLinked,
  linkedSourceAudioSegments,
  sourceAudioBlob,
  sourceAudioPeaks,
  sourceAudioClipPercent,
  sourceAudioStartPercent,
  sourceAudioDuration,
  sourceAudioDragTargetLane,
  setSourceAudioStart,
  selectedSourceAudioSegmentId,
  setSelectedSourceAudioSegmentId,
  audioBlob,
  peaks,
  audioClipPercent,
  audioDuration,
  audioSegments,
  setAudioSegments,
  selectedAudioSegmentId,
  setSelectedAudioSegmentId,
  startAudioSegmentMove,
  startSourceAudioMove,
  musicBlob,
  musicSegments = [],
  setMusicSegments,
  setMusicStart,
  selectedMusicSegmentId,
  setSelectedMusicSegmentId,
  musicPeaks,
  musicStartPercent,
  musicDuration,
  startMusicMove,
}) {
  const [transitionEditor, setTransitionEditor] = useState(null);
  const [overlayPromotionTarget, setOverlayPromotionTarget] = useState(null);
  const [overlayDragLaneCount, setOverlayDragLaneCount] = useState(0);
  const [sourceAudioExtractionPendingId, setSourceAudioExtractionPendingId] = useState("");
  const [mobileClipActionsVisible, setMobileClipActionsVisible] = useState(false);
  const [mobileClipActionTrack, setMobileClipActionTrack] = useState("");
  const [timelineSelectionMode, setTimelineSelectionMode] = useState("select");
  const [timelineSelectionMenuOpen, setTimelineSelectionMenuOpen] = useState(false);
  const [timelineRangeSelection, setTimelineRangeSelection] = useState(() => new Set());
  const [timelineRangeDrag, setTimelineRangeDrag] = useState(null);
  const [timelineMarquee, setTimelineMarquee] = useState(null);
  const [selectedEditPointIndex, setSelectedEditPointIndex] = useState(-1);
  const [activeFineEdit, setActiveFineEdit] = useState(null);
  const [playheadTrackFrame, setPlayheadTrackFrame] = useState(null);
  const [timelineSeekActive, setTimelineSeekActive] = useState(false);
  const timelineSelectionTriggerRef = useRef(null);
  const timelineRangeDragClickGuardRef = useRef("");
  const timelineMarqueeClickGuardRef = useRef(false);

  useEffect(() => {
    const handleTimelineSeekState = (event) => {
      const active = Boolean(event.detail?.active);
      if (active) {
        progressiveFilmstripAbortRef.current?.abort();
        progressiveFilmstripAbortRef.current = null;
      }
      setTimelineSeekActive(active);
    };
    window.addEventListener("timeline-seek-state", handleTimelineSeekState);
    return () => window.removeEventListener("timeline-seek-state", handleTimelineSeekState);
  }, []);

  const getVisualStart = useCallback((index) => displayedVisualSegments
    .slice(0, Math.max(0, index))
    .reduce((total, segment) => total + (Number(segment.duration) || 0), 0), [displayedVisualSegments]);

  const selectVisualEditPoint = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    if (trackLocks.image) return void notify(t("fineEditTrackLocked", "主画面轨已锁定，无法选择编辑点"));
    if (displayedVisualSegments.length < 2) return void notify(t("fineEditNeedsCuts", "至少需要两个主画面片段"));
    const rect = event.target?.closest?.("[data-timeline-segment-track='image']")?.getBoundingClientRect?.()
      || event.currentTarget?.getBoundingClientRect?.();
    const preferRight = rect ? event.clientX >= rect.left + rect.width / 2 : false;
    const boundaryIndex = Math.max(1, Math.min(displayedVisualSegments.length - 1, index + (preferRight ? 1 : 0)));
    setSelectedEditPointIndex(boundaryIndex);
    setSelectedTrack("image");
    setSelectedVisualSegmentId(displayedVisualSegments[boundaryIndex]?.id || displayedVisualSegments[boundaryIndex - 1]?.id || "");
    seekTo(getVisualStart(boundaryIndex));
  };

  const startVisualFineEdit = (event, index, mode) => {
    event.preventDefault();
    event.stopPropagation();
    if (trackLocks.image) return void notify(t("fineEditTrackLocked", "主画面轨已锁定，无法精剪"));
    const original = displayedVisualSegments.map((segment) => ({ ...segment }));
    const segment = original[index];
    if (!segment) return;
    if (mode === "slip" && segment.type !== "video") return void notify(t("slipVideoOnly", "滑移仅支持视频片段"));
    if (mode === "slide" && (index <= 0 || index >= original.length - 1)) return void notify(t("slideNeedsNeighbors", "滑动需要左右各有一个相邻片段"));
    const rect = trackScrollRef.current?.getBoundingClientRect();
    if (!rect || timelineDuration <= 0) return;
    if (isPlaying) handlePlayToggle();
    setSelectedTrack("image");
    setSelectedVisualSegmentId(segment.id);
    setSelectedEditPointIndex(-1);
    const startX = event.clientX;
    const pointerId = event.pointerId;
    const previewTime = getVisualStart(index) + Math.max(0, Number(segment.duration) || 0) / 2;
    seekTo(previewTime);
    let latest = { delta: 0, moved: false, segments: original };
    setActiveFineEdit({ mode, index, delta: 0 });
    const apply = (moveEvent) => {
      if (moveEvent.pointerId !== undefined && pointerId !== undefined && moveEvent.pointerId !== pointerId) return;
      const requestedDelta = ((moveEvent.clientX - startX) / Math.max(1, rect.width)) * timelineDuration;
      if (!latest.moved && Math.abs(moveEvent.clientX - startX) < 3) return;
      moveEvent.preventDefault();
      const result = mode === "slip"
        ? slipVisualSegment(original, index, requestedDelta)
        : slideVisualSegment(original, index, requestedDelta);
      latest = { delta: result.delta, moved: true, segments: result.segments };
      setVisualSegments(result.segments);
      setActiveFineEdit({ mode, index, delta: result.delta });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", apply, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", cancel, true);
    };
    const finish = (upEvent) => {
      if (upEvent?.pointerId !== undefined && pointerId !== undefined && upEvent.pointerId !== pointerId) return;
      cleanup();
      setActiveFineEdit(null);
      if (!latest.moved || Math.abs(latest.delta) < 0.0001) return;
      notify(t(mode === "slip" ? "visualSlipAdjusted" : "visualSlideAdjusted", mode === "slip" ? "视频源区间已滑移" : "片段已滑动，左右编辑点已同步调整"));
    };
    const cancel = () => {
      cleanup();
      setVisualSegments(original);
      setActiveFineEdit(null);
    };
    window.addEventListener("pointermove", apply, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, { capture: true, once: true });
    window.addEventListener("pointercancel", cancel, { capture: true, once: true });
  };

  const timelineSelectableClips = useMemo(() => {
    const clips = [];
    displayedVisualSegments.forEach((segment, index) => {
      const range = renderedVisualTimeline[index];
      clips.push({
        track: "image",
        id: segment.id,
        start: range?.start ?? getVisualSegmentStartTime(displayedVisualSegments, index),
        end: range?.end ?? (getVisualSegmentStartTime(displayedVisualSegments, index) + (segment.duration || 0)),
      });
    });
    visualOverlaySegments.forEach((segment) => clips.push({ track: "overlay", id: segment.id, start: segment.start || 0, end: (segment.start || 0) + (segment.duration || 0) }));
    stickerSegments.forEach((segment) => clips.push({ track: "sticker", id: segment.id, start: segment.start || 0, end: (segment.start || 0) + (segment.duration || 0) }));
    displayedCaptionSegments.forEach((segment, index) => clips.push({
      track: "caption",
      id: segment.id,
      start: displayedCaptionTimeline[index]?.start ?? getSegmentStartTime(displayedCaptionSegments, index, captionTargetDuration),
      end: displayedCaptionTimeline[index]?.end ?? (
        getSegmentStartTime(displayedCaptionSegments, index, captionTargetDuration)
        + (displayedCaptionTimeline[index]?.duration || captionTargetDuration)
      ),
    }));
    if (sourceAudioBlob) {
      if (sourceAudioLinked && linkedSourceAudioSegments.length) {
        linkedSourceAudioSegments.forEach((segment) => clips.push({ track: "source", id: segment.id, start: segment.start || 0, end: (segment.start || 0) + (segment.duration || 0) }));
      } else {
        const sourceStart = sourceAudioStartPercent / 100 * timelineDuration;
        clips.push({ track: "source", id: "source-audio", start: sourceStart, end: sourceStart + sourceAudioDuration });
      }
    }
    audioSegments.forEach((segment) => clips.push({ track: "audio", id: segment.id, start: segment.start || 0, end: (segment.start || 0) + (segment.duration || 0) }));
    if (musicBlob) {
      (musicSegments.length
        ? musicSegments
        : [{ id: "music-audio", start: musicStartPercent / 100 * timelineDuration, duration: musicDuration }]
      ).forEach((segment) => clips.push({ track: "music", id: segment.id, start: segment.start || 0, end: (segment.start || 0) + (segment.duration || 0) }));
    }
    return clips;
  }, [
    audioSegments,
    captionTargetDuration,
    displayedCaptionSegments,
    displayedCaptionTimeline,
    displayedVisualSegments,
    linkedSourceAudioSegments,
    musicBlob,
    musicSegments,
    musicStartPercent,
    musicDuration,
    renderedVisualTimeline,
    sourceAudioBlob,
    sourceAudioLinked,
    sourceAudioStartPercent,
    sourceAudioDuration,
    stickerSegments,
    timelineDuration,
    visualOverlaySegments,
  ]);
  const timelineSelectionKey = (track, id) => `${track}:${id}`;
  const isRangeSelected = (track, id) => timelineRangeSelection.has(timelineSelectionKey(track, id));
  const isTimelineClipVisible = (track, id) => {
    if (typeof document === "undefined") return true;
    const clip = Array.from(document.querySelectorAll(`[data-timeline-segment-track="${track}"]`))
      .find((element) => element.dataset.timelineSegmentId === String(id));
    return Boolean(clip && !clip.closest(".is-track-disabled"));
  };
  const selectTimelineRangeFromClip = (track, id) => {
    if (!isTimelineClipVisible(track, id)) return;
    if (isTimelineClipLocked(track, id)) return;
    const anchor = timelineSelectableClips.find((clip) => clip.track === track && clip.id === id);
    if (!anchor) return;
    const next = new Set(
      timelineSelectableClips
        .filter((clip) => !isTimelineClipLocked(clip.track, clip.id))
        .filter((clip) => isTimelineClipVisible(clip.track, clip.id))
        .filter((clip) => timelineSelectionMode === "left" ? clip.start <= anchor.start : clip.start >= anchor.start)
        .map((clip) => timelineSelectionKey(clip.track, clip.id)),
    );
    clearClipSelections();
    setSelectedTrack(track);
    setTimelineRangeSelection(next);
    // Left/right range selection is a one-shot gesture. Return to the normal
    // select tool immediately so the next pointer-down on any highlighted
    // clip is routed through the group-drag path instead of reselecting a
    // range and letting the clip's single-drag handler take over.
    setTimelineSelectionMode("select");
    notify(t(
      timelineSelectionMode === "left" ? "timelineSelectedLeft" : "timelineSelectedRight",
      timelineSelectionMode === "left"
        ? `已向左选择 ${next.size} 个片段`
        : `已向右选择 ${next.size} 个片段`,
    ).replace("{count}", next.size));
  };
  const toggleTimelineClipInSelection = (track, id) => {
    if (!isTimelineClipVisible(track, id)) return;
    if (isTimelineClipLocked(track, id)) {
      notify(t("timelineLockedSelectionSkipped", "锁定轨道中的片段不能加入多选"));
      return;
    }
    const key = timelineSelectionKey(track, id);
    const focusedKeys = [
      selectedVisualSegmentId && timelineSelectionKey("image", selectedVisualSegmentId),
      selectedVisualOverlayId && timelineSelectionKey("overlay", selectedVisualOverlayId),
      selectedStickerSegmentId && timelineSelectionKey("sticker", selectedStickerSegmentId),
      selectedSegmentId && timelineSelectionKey("caption", selectedSegmentId),
      selectedAudioSegmentId && timelineSelectionKey("audio", selectedAudioSegmentId),
      selectedSourceAudioSegmentId && timelineSelectionKey("source", selectedSourceAudioSegmentId),
      selectedMusicSegmentId && timelineSelectionKey("music", selectedMusicSegmentId),
    ].filter(Boolean);
    setTimelineRangeSelection((current) => {
      const next = new Set(current);
      focusedKeys.forEach((focusedKey) => next.add(focusedKey));
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    clearClipSelections();
    setSelectedTrack(track);
  };
  const startTimelineRangeDrag = (event, track, id, { toggleOnClick = false } = {}) => {
    if (!isTimelineClipVisible(track, id)) return false;
    if (isTimelineClipLocked(track, id)) return false;
    if (event.button !== 0 || timelineSelectionMode !== "select" || timelineRangeSelection.size < 2) return false;
    const pressedKey = timelineSelectionKey(track, id);
    if (!timelineRangeSelection.has(pressedKey)) return false;
    const selectedClips = timelineSelectableClips.filter((clip) =>
      timelineRangeSelection.has(timelineSelectionKey(clip.track, clip.id))
      && !isTimelineClipLocked(clip.track, clip.id)
      && isTimelineClipVisible(clip.track, clip.id));
    if (selectedClips.length < 2) return false;
    event.preventDefault();
    event.stopPropagation();
    const trackCanvas = event.target.closest(".track-scroll") || document.querySelector(".track-scroll");
    const contentWidth = Math.max(1, trackCanvas?.getBoundingClientRect().width || 1);
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const minimumStart = Math.min(...selectedClips.map((clip) => clip.start));
    const maximumEnd = Math.max(...selectedClips.map((clip) => clip.end));
    const selectedKeys = new Set(
      selectedClips.map((clip) => timelineSelectionKey(clip.track, clip.id)),
    );
    const anchor = selectedClips.find((clip) => clip.track === track && clip.id === id) || selectedClips[0];
    let latest = { delta: 0, dragging: false, x: startX, y: startY };
    const autoScroller = createTimelineEdgeAutoScroller({
      trackElement: trackCanvas,
      pointerType: event.pointerType,
      timelineDuration,
      onScrollFrame: (clientX, scrollOffset) => move({
        clientX,
        clientY: latest.y,
        pointerId,
        preventDefault() {},
      }, scrollOffset),
    });
    const move = (moveEvent, scrollOffset = autoScroller.getScrollOffset()) => {
      if (moveEvent.pointerId !== undefined && pointerId !== undefined && moveEvent.pointerId !== pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!latest.dragging && distance < 5) return;
      if (!latest.dragging && isPlaying) handlePlayToggle();
      moveEvent.preventDefault();
      autoScroller.update(moveEvent.clientX);
      const dragClientX = autoScroller.getDragClientX(moveEvent.clientX);
      const rawDelta = getTimelineDragTimeDelta({
        clientX: dragClientX,
        startX,
        scrollOffset,
        contentWidth,
        timelineDuration,
      });
      const delta = Math.max(
        -minimumStart,
        Math.min(MAX_TIMELINE_DURATION_SECONDS - maximumEnd, rawDelta),
      );
      latest = { delta, dragging: true, x: moveEvent.clientX, y: moveEvent.clientY };
      setTimelineHorizon?.((value) => getTimelineActiveDragHorizon(value, timelineDuration, maximumEnd + delta));
      setTimelineRangeDrag(latest);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", cancel, true);
    };
    const cancel = () => {
      settleTimelineDrag(autoScroller, {
        active: latest.dragging,
        setTimelineHorizon,
        settle: () => setTimelineRangeDrag(null),
      });
      cleanup();
    };
    const finish = (upEvent) => {
      if (upEvent?.pointerId !== undefined && pointerId !== undefined && upEvent.pointerId !== pointerId) return;
      cleanup();
      if (!latest.dragging) {
        autoScroller.stop();
        if (toggleOnClick) {
          timelineRangeDragClickGuardRef.current = pressedKey;
          toggleTimelineClipInSelection(track, id);
          window.setTimeout(() => {
            if (timelineRangeDragClickGuardRef.current === pressedKey) timelineRangeDragClickGuardRef.current = "";
          }, 240);
        }
        return;
      }
      const delta = latest.delta;
      settleTimelineDrag(autoScroller, {
        active: true,
        setTimelineHorizon,
        settle: () => {
          setTimelineRangeDrag(null);
          if (Math.abs(delta) < 0.001) return;
          timelineRangeDragClickGuardRef.current = pressedKey;
          setTimelineRangeSelection(new Set(selectedKeys));
          const selectedVisualIds = new Set(
            selectedClips.filter((clip) => clip.track === "image").map((clip) => clip.id),
          );
          if (selectedVisualIds.size) {
            setVisualSegments((items) => {
              const moving = items.filter((segment) => selectedVisualIds.has(segment.id));
              const remaining = items.filter((segment) => !selectedVisualIds.has(segment.id));
              if (!moving.length || !remaining.length) return items;
              const targetTime = Math.max(0, anchor.start + delta);
              let elapsed = 0;
              let insertIndex = remaining.length;
              for (let index = 0; index < remaining.length; index += 1) {
                const midpoint = elapsed + (remaining[index].duration || 0) / 2;
                if (targetTime < midpoint) {
                  insertIndex = index;
                  break;
                }
                elapsed += remaining[index].duration || 0;
              }
              const next = [...remaining];
              next.splice(insertIndex, 0, ...moving);
              return next;
            });
          }
          setVisualOverlaySegments?.((items) => items.map((segment) => selectedKeys.has(timelineSelectionKey("overlay", segment.id))
            ? { ...segment, start: Math.max(0, segment.start + delta) }
            : segment));
          setStickerSegments?.((items) => items.map((segment) => selectedKeys.has(timelineSelectionKey("sticker", segment.id))
            ? { ...segment, start: Math.max(0, segment.start + delta) }
            : segment));
          setCaptionSegments?.((items) => items.map((segment) => {
            if (!selectedKeys.has(timelineSelectionKey("caption", segment.id))) return segment;
            const range = selectedClips.find((clip) => clip.track === "caption" && clip.id === segment.id);
            return {
              ...segment,
              start: Math.max(0, (range?.start ?? segment.start ?? 0) + delta),
              end: Math.max(0.2, (range?.end ?? segment.end ?? 0.2) + delta),
            };
          }));
          setAudioSegments?.((items) => items.map((segment) => selectedKeys.has(timelineSelectionKey("audio", segment.id))
            ? { ...segment, start: Math.max(0, segment.start + delta) }
            : segment));
          if (!sourceAudioLinked && selectedKeys.has(timelineSelectionKey("source", "source-audio"))) {
            setSourceAudioStart?.((start) => Math.max(0, start + delta));
          }
          if (musicSegments.length) {
            setMusicSegments?.((items) => items.map((segment) => selectedKeys.has(timelineSelectionKey("music", segment.id))
              ? { ...segment, start: Math.max(0, segment.start + delta) }
              : segment));
          } else if (selectedKeys.has(timelineSelectionKey("music", "music-audio"))) {
            setMusicStart?.((start) => Math.max(0, start + delta));
          }
          suppressTimelineClipClickRef.current = id;
          window.setTimeout(() => {
            if (suppressTimelineClipClickRef.current === id) suppressTimelineClipClickRef.current = "";
            if (timelineRangeDragClickGuardRef.current === pressedKey) timelineRangeDragClickGuardRef.current = "";
          }, 240);
          notify(t("timelineRangeMoved", "已移动 {count} 个片段").replace("{count}", selectedClips.length));
        },
      });
    };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, { capture: true, once: true });
    window.addEventListener("pointercancel", cancel, { capture: true, once: true });
    return true;
  };

  const startTimelineMarqueeSelection = (event) => {
    if (event.button !== 0 || timelineSelectionMode !== "select") return false;
    if (!(event.target instanceof Element) || event.target.closest("[data-timeline-segment-track]")) return false;
    const trackCanvas = event.target.closest(".track-scroll");
    if (!trackCanvas) return false;

    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const canvasRect = trackCanvas.getBoundingClientRect();
    const initialSelection = event.shiftKey ? new Set(timelineRangeSelection) : new Set();
    let dragging = false;

    const getSelectionRect = (clientX, clientY) => {
      const boundedX = Math.max(canvasRect.left, Math.min(canvasRect.right, clientX));
      const boundedY = Math.max(canvasRect.top, Math.min(canvasRect.bottom, clientY));
      const left = Math.min(startX, boundedX);
      const top = Math.min(startY, boundedY);
      return {
        left,
        top,
        right: Math.max(startX, boundedX),
        bottom: Math.max(startY, boundedY),
        x: left,
        y: top,
        width: Math.abs(boundedX - startX),
        height: Math.abs(boundedY - startY),
      };
    };

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== undefined && pointerId !== undefined && moveEvent.pointerId !== pointerId) return;
      if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return;
      moveEvent.preventDefault();
      if (!dragging) {
        dragging = true;
        clearClipSelections();
        setContextMenu(null);
      }
      const selectionRect = getSelectionRect(moveEvent.clientX, moveEvent.clientY);
      const next = new Set(initialSelection);
      trackCanvas.querySelectorAll("[data-timeline-segment-track]").forEach((element) => {
        const elementRect = element.getBoundingClientRect();
        const intersects = elementRect.width > 0 && elementRect.height > 0
          && elementRect.right >= selectionRect.left
          && elementRect.left <= selectionRect.right
          && elementRect.bottom >= selectionRect.top
          && elementRect.top <= selectionRect.bottom;
        if (!intersects || element.closest(".is-track-disabled")) return;
        const track = element.dataset.timelineSegmentTrack;
        const id = element.dataset.timelineSegmentId;
        if (!track || !id || isTimelineClipLocked(track, id)) return;
        next.add(timelineSelectionKey(track, id));
      });
      setTimelineRangeSelection(next);
      setTimelineMarquee(selectionRect);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", cancel, true);
      setTimelineMarquee(null);
    };
    const cancel = () => cleanup();
    const finish = (upEvent) => {
      if (upEvent?.pointerId !== undefined && pointerId !== undefined && upEvent.pointerId !== pointerId) return;
      if (!dragging) {
        if (!event.shiftKey) clearTimelineClipFocus();
        const position = Math.max(0, Math.min(1, (upEvent.clientX - canvasRect.left) / Math.max(1, canvasRect.width)));
        seekTo(position * timelineDuration);
      } else {
        upEvent.preventDefault();
        timelineMarqueeClickGuardRef.current = true;
        window.setTimeout(() => {
          timelineMarqueeClickGuardRef.current = false;
        }, 240);
      }
      cleanup();
    };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, { capture: true, once: true });
    window.addEventListener("pointercancel", cancel, { capture: true, once: true });
    return true;
  };

  const clearClipSelections = (except = "") => {
    if (except !== "overlay") setSelectedVisualOverlayId?.("");
    if (except !== "visual") setSelectedVisualSegmentId("");
    if (except !== "sticker") setSelectedStickerSegmentId("");
    if (except !== "caption") setSelectedSegmentId("");
    if (except !== "voice") setSelectedAudioSegmentId("");
    if (except !== "source") setSelectedSourceAudioSegmentId("");
    if (except !== "music") setSelectedMusicSegmentId?.("");
  };
  const clearTimelineClipFocus = () => {
    clearClipSelections();
    setTimelineRangeSelection(new Set());
    setContextMenu(null);
    setMobileClipActionsVisible(false);
    setMobileClipActionTrack("");
  };
  const selectTimelineTrackBackground = (event, track, tool = "") => {
    if (timelineMarqueeClickGuardRef.current) return;
    if (event.target instanceof Element && event.target.closest("[data-timeline-segment-track]")) return;
    clearTimelineClipFocus();
    setSelectedTrack(track);
    if (tool) setActiveTool(tool);
  };
  const selectedMobileClipTrack = resolveMobileClipActionTrack(mobileClipActionTrack, {
    visual: Boolean(selectedVisualSegmentId),
    overlay: Boolean(selectedVisualOverlayId),
    sticker: Boolean(selectedStickerSegmentId),
    caption: Boolean(selectedSegmentId),
    source: Boolean(selectedSourceAudioSegmentId),
    audio: Boolean(selectedAudioSegmentId),
    music: Boolean(selectedMusicSegmentId),
  });
  const openSelectedClipInspector = (section = "") => {
    if (!selectedMobileClipTrack) return;
    const panel = getMobileClipPanel(selectedMobileClipTrack);
    if (panel === "tools") {
      closeMobileClipActions();
      openTrackPanel(selectedMobileClipTrack);
      openMobileTools?.();
      return;
    }
    setSelectedTrack(selectedMobileClipTrack);
    openMobileInspector?.(selectedMobileClipTrack, section);
  };
  const selectedMobileAudioSegment = selectedMobileClipTrack === "audio"
    ? audioSegments.find((segment) => segment.id === selectedAudioSegmentId) ?? null
    : selectedMobileClipTrack === "source"
      ? linkedSourceAudioSegments.find((segment) => segment.id === selectedSourceAudioSegmentId) ?? null
      : selectedMobileClipTrack === "music" && selectedMusicSegmentId
        ? (musicSegments.find((segment) => segment.id === selectedMusicSegmentId) ?? { id: "music-audio", start: musicStartPercent / 100 * timelineDuration, sourceStart: 0, duration: musicDuration, peaks: musicPeaks })
        : null;
  const selectedMobileVisualSegment = selectedMobileClipTrack === "image"
    ? displayedVisualSegments.find((segment) => segment.id === selectedVisualSegmentId) ?? null
    : null;
  const selectedMobileOverlaySegment = selectedMobileClipTrack === "overlay"
    ? visualOverlaySegments.find((segment) => segment.id === selectedVisualOverlayId) ?? null
    : null;
  const selectedMobileCaptionSegment = selectedMobileClipTrack === "caption"
    ? displayedCaptionSegments.find((segment) => segment.id === selectedSegmentId) ?? null
    : null;
  const selectedMobileAudioHasLinkedCaption = selectedMobileClipTrack === "audio" && selectedMobileAudioSegment
    ? displayedCaptionSegments.some((caption) => caption.audioSegmentId === selectedMobileAudioSegment.id)
    : false;
  const selectedMobileHasLinkedCaption = selectedMobileClipTrack === "caption"
    ? Boolean(selectedMobileCaptionSegment?.audioSegmentId)
    : selectedMobileAudioHasLinkedCaption;
  const availableAudioIds = useMemo(() => new Set(audioSegments.map((segment) => segment.id)), [audioSegments]);
  const batchLinkableCaptions = displayedCaptionSegments.filter((caption) => (
    availableAudioIds.has(caption.audioSegmentId) || availableAudioIds.has(caption.detachedAudioSegmentId)
  ));
  const allBatchCaptionsLinked = batchLinkableCaptions.length > 0
    && batchLinkableCaptions.every((caption) => availableAudioIds.has(caption.audioSegmentId));
  const selectedMobileExtractableVideo = selectedMobileVisualSegment || selectedMobileOverlaySegment;
  const canExtractSelectedMobileSourceAudio = selectedMobileExtractableVideo?.type === "video"
    && (selectedMobileClipTrack === "overlay" || !Number.isFinite(selectedMobileExtractableVideo.sourceAudioOffset));
  const mobileClipActionIds = getMobileClipActionIds(selectedMobileClipTrack, {
    canExtractSourceAudio: canExtractSelectedMobileSourceAudio,
    hasLinkedCaption: selectedMobileHasLinkedCaption,
    isVideo: (selectedMobileVisualSegment || selectedMobileOverlaySegment)?.type === "video",
    isVector: (selectedMobileVisualSegment || selectedMobileOverlaySegment)?.kind === "vector"
      || Boolean((selectedMobileVisualSegment || selectedMobileOverlaySegment)?.vectorBody)
      || String((selectedMobileVisualSegment || selectedMobileOverlaySegment)?.assetId || "").startsWith("vector-"),
  });
  const toggleSelectedMobileCaptionAudioLink = () => {
    if (selectedMobileClipTrack === "caption" && selectedMobileCaptionSegment) {
      return selectedMobileCaptionSegment.audioSegmentId
        ? unlinkCaptionAudio?.(selectedMobileCaptionSegment.id)
        : linkCaptionAudio?.(selectedMobileCaptionSegment.id);
    }
    if (selectedMobileClipTrack === "audio" && selectedMobileAudioSegment) {
      return selectedMobileAudioHasLinkedCaption
        ? unlinkAudioCaptions?.(selectedMobileAudioSegment.id)
        : linkAudioToCaption?.(selectedMobileAudioSegment.id);
    }
  };
  const alignSelectedMobileCaptionAudio = () => {
    if (selectedMobileClipTrack === "caption" && selectedMobileCaptionSegment) alignCaptionToAudio?.(selectedMobileCaptionSegment.id);
    if (selectedMobileClipTrack === "audio" && selectedMobileAudioSegment) alignAudioCaptions?.(selectedMobileAudioSegment.id);
  };
  const closeMobileClipActions = () => {
    setMobileClipActionsVisible(false);
    setMobileClipActionTrack("");
  };
  const runMobileClipAction = (action) => {
    closeMobileClipActions();
    action?.();
  };
  const revealMobileClipActions = (track) => {
    if (!window.matchMedia?.("(max-width: 760px)").matches) return;
    if (track) setMobileClipActionTrack(track);
    setMobileClipActionsVisible(true);
  };
  const activateAudioToolForClipSelection = () => {
    const isMobile = window.matchMedia?.("(max-width: 760px)").matches ?? false;
    if (shouldActivateToolRailForClip(isMobile)) setActiveTool("audio");
  };
  const activateStickerToolForClipSelection = () => {
    const isMobile = window.matchMedia?.("(max-width: 760px)").matches ?? false;
    if (shouldActivateToolRailForClip(isMobile)) setActiveTool("stickers");
  };
  const ensureMobileTimedClipVisible = (segmentId) => {
    if (!segmentId || !window.matchMedia?.("(max-width: 760px)").matches) return;
    window.requestAnimationFrame(() => {
      const trackElement = trackScrollRef.current;
      const scrollElement = trackElement?.parentElement;
      if (!trackElement || !scrollElement) return;
      const clipElement = Array.from(trackElement.querySelectorAll("[data-timeline-segment-id]"))
        .find((element) => element.dataset.timelineSegmentId === String(segmentId));
      if (!clipElement) return;
      const viewportRect = scrollElement.getBoundingClientRect();
      const clipRect = clipElement.getBoundingClientRect();
      const padding = 10;
      if (clipRect.width <= viewportRect.width - padding * 2) {
        if (clipRect.right > viewportRect.right - padding) {
          scrollElement.scrollLeft += clipRect.right - viewportRect.right + padding;
        } else if (clipRect.left < viewportRect.left + padding) {
          scrollElement.scrollLeft -= viewportRect.left + padding - clipRect.left;
        }
      }
    });
  };
  const revealTimelineClip = (track, segmentId) => {
    if (!segmentId) return;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const trackElement = trackScrollRef.current;
      const horizontalScroller = trackElement?.parentElement;
      const board = trackElement?.closest?.(".timeline-board");
      if (!trackElement || !horizontalScroller || !board) return;
      const clipElement = Array.from(trackElement.querySelectorAll("[data-timeline-segment-track][data-timeline-segment-id]"))
        .find((element) => element.dataset.timelineSegmentTrack === track
          && element.dataset.timelineSegmentId === String(segmentId));
      if (!clipElement) return;
      const horizontalRect = horizontalScroller.getBoundingClientRect();
      const clipRect = clipElement.getBoundingClientRect();
      const horizontalPadding = 18;
      if (clipRect.right > horizontalRect.right - horizontalPadding) {
        horizontalScroller.scrollTo({ left: horizontalScroller.scrollLeft + clipRect.right - horizontalRect.right + horizontalPadding, behavior: "smooth" });
      } else if (clipRect.left < horizontalRect.left + horizontalPadding) {
        horizontalScroller.scrollTo({ left: Math.max(0, horizontalScroller.scrollLeft - (horizontalRect.left + horizontalPadding - clipRect.left)), behavior: "smooth" });
      }
      const boardRect = board.getBoundingClientRect();
      const stickyRulerHeight = 28;
      const verticalPadding = 10;
      if (clipRect.bottom > boardRect.bottom - verticalPadding) {
        board.scrollTo({ top: board.scrollTop + clipRect.bottom - boardRect.bottom + verticalPadding, behavior: "smooth" });
      } else if (clipRect.top < boardRect.top + stickyRulerHeight + verticalPadding) {
        board.scrollTo({ top: Math.max(0, board.scrollTop - (boardRect.top + stickyRulerHeight + verticalPadding - clipRect.top)), behavior: "smooth" });
      }
    }));
  };
  const generateSelectedMobileAudioCaptions = () => {
    if (!selectedMobileAudioSegment || !generateCaptionsFromAudioClip) return;
    const blob = selectedMobileClipTrack === "music" ? musicBlob : selectedMobileClipTrack === "source" ? sourceAudioBlob : selectedMobileAudioSegment.blob;
    if (!blob) return;
    runMobileClipAction(() => generateCaptionsFromAudioClip({
      blob,
      start: selectedMobileAudioSegment.start || 0,
      sourceStart: selectedMobileAudioSegment.sourceStart || 0,
      duration: selectedMobileAudioSegment.duration,
      append: selectedMobileClipTrack !== "source",
    }));
  };
  const separateSelectedMobileAudio = () => {
    if (!selectedMobileAudioSegment || !separateAudioClipVocals || !["audio", "music"].includes(selectedMobileClipTrack)) return;
    const blob = selectedMobileClipTrack === "music" ? musicBlob : selectedMobileAudioSegment.blob;
    if (!blob) return;
    runMobileClipAction(() => separateAudioClipVocals({
      blob,
      name: selectedMobileClipTrack === "music" ? t("musicTrack") : selectedMobileAudioSegment.name,
      start: selectedMobileAudioSegment.start || 0,
      sourceStart: selectedMobileAudioSegment.sourceStart || 0,
      duration: selectedMobileAudioSegment.duration,
      segmentId: selectedMobileAudioSegment.id,
      track: selectedMobileClipTrack,
    }));
  };

  const updateJunctionTransition = (index, patch) => {
    if (trackLocks.image) return void notify("图片轨已锁定，无法修改转场");
    setVisualSegments((items) => items.map((item, itemIndex) => itemIndex === index
      ? { ...item, transition: { id: item.transition?.id || "none", duration: item.transition?.duration || 0.5, ...patch } }
      : item));
  };
  const draggingVisualSegment =
    activeTimelineClipDrag?.track === "image"
      ? displayedVisualSegments.find((segment) => segment.id === activeTimelineClipDrag.segmentId)
      : null;
  const draggingCaptionSegment =
    activeTimelineClipDrag?.track === "caption"
      ? displayedCaptionSegments.find((segment) => segment.id === activeTimelineClipDrag.segmentId)
      : null;
  const packedAudioLanes = useMemo(
    () => packTimedSegmentsIntoLanes(audioSegments, { preferredLaneKey: "lane" }),
    [audioSegments],
  );
  const getTimelineClipLockKey = (track, id) => track === "audio"
    ? getTimedSegmentLaneStateKey(audioSegments, id)
    : track;
  const isTimelineRowLocked = (track, lockKey = track) => Boolean(
    trackLocks[track] || (lockKey !== track && trackLocks[lockKey]),
  );
  const isTimelineClipLocked = (track, id) => isTimelineRowLocked(
    track,
    getTimelineClipLockKey(track, id),
  );
  const sourceAudioLaneDropActive = Number.isInteger(sourceAudioDragTargetLane) && sourceAudioDragTargetLane >= 0;
  const showVoiceTrack = audioSegments.length > 0 || draggedAssetType === "audio" || sourceAudioLaneDropActive;
  const audioLanes = useMemo(() => {
    if (!showVoiceTrack) return [];
    const lanes = audioSegments.length ? packedAudioLanes.map((lane) => [...lane]) : [[]];
    while (sourceAudioLaneDropActive && lanes.length <= sourceAudioDragTargetLane) lanes.push([]);
    return lanes;
  }, [audioSegments.length, packedAudioLanes, showVoiceTrack, sourceAudioDragTargetLane, sourceAudioLaneDropActive]);
  const stickerLanes = useMemo(
    () => packTimedSegmentsIntoLanes(stickerSegments, { preferredLaneKey: "lane" }),
    [stickerSegments],
  );
  const mainVisualOverlayDropActive = activeTimelineClipDrag?.track === "image" && activeTimelineClipDrag.mode === "overlay";
  const showEmptyOverlayDropLane = (
    draggedAssetType === "image" ||
    draggedAssetType === "video" ||
    mainVisualOverlayDropActive
  );
  const overlayLanes = useMemo(
    () => {
      const lanes = visualOverlaySegments.length
        ? packTimedSegmentsIntoLanes(visualOverlaySegments, { preferredLaneKey: "lane" })
        : showEmptyOverlayDropLane ? [[]] : [];
      // Keep one real hit target below the current overlay stack while a visual
      // asset is being dragged. Previously the area below the final overlay row
      // was only empty timeline chrome, so elementFromPoint could never resolve
      // it as a new picture-in-picture lane.
      if (showEmptyOverlayDropLane && visualOverlaySegments.length) lanes.push([]);
      while (lanes.length < overlayDragLaneCount) lanes.push([]);
      return lanes;
    },
    [overlayDragLaneCount, showEmptyOverlayDropLane, visualOverlaySegments],
  );
  const isOverlayLaneVisible = (lane = []) => !lane.length || lane.some((segment) => segment.hidden !== true);
  const toggleOverlayLaneVisibility = (laneIndex) => {
    const lane = overlayLanes[laneIndex] || [];
    const segmentIds = new Set(lane.map((segment) => segment.id));
    if (!segmentIds.size || !setVisualOverlaySegments) return;
    const hideLane = isOverlayLaneVisible(lane);
    setVisualOverlaySegments((items) => items.map((item) => segmentIds.has(item.id)
      ? { ...item, hidden: hideLane }
      : item));
  };
  const showSourceTrack = Boolean(sourceAudioBlob || sourceAudioExtractionPendingId);
  const showMusicTrack = Boolean(musicBlob) || draggedAssetType === "audio";
  const captionLanes = useMemo(
    () => packCaptionSegmentsIntoLanes(displayedCaptionSegments, displayedCaptionTimeline),
    [displayedCaptionSegments, displayedCaptionTimeline],
  );
  const contentRows = [
    TIMELINE_TRACK_ROW_HEIGHT,
    ...overlayLanes.map(() => TIMELINE_TRACK_ROW_HEIGHT),
    ...(showStickerTrack ? stickerLanes.map(() => TIMELINE_TRACK_ROW_HEIGHT) : []),
    ...captionLanes.map(() => TIMELINE_TRACK_ROW_HEIGHT),
    ...(showSourceTrack ? [TIMELINE_TRACK_ROW_HEIGHT] : []),
    ...audioLanes.map(() => TIMELINE_TRACK_ROW_HEIGHT),
    ...(showMusicTrack ? [TIMELINE_TRACK_ROW_HEIGHT] : []),
  ];
  const timelineTrackRows = contentRows.join(" ");
  const timelineLabelRows = contentRows.join(" ");
  const timelineTrackLabels = [
    ["image", t("imageTrack")],
    ...overlayLanes.map((_, index) => ["overlay", `${t("overlayTrack", "Overlay")} ${index + 1}`, `overlay-${index}`, `overlay-${index}`]),
    ...(showStickerTrack ? stickerLanes.map((_, index) => ["sticker", `${t("stickerTrack")} ${index + 1}`, `sticker-${index}`]) : []),
    ...captionLanes.map((_, index) => ["caption", `${t("caption")} ${index + 1}`, `caption-${index}`, `caption-${index}`]),
    ...(showSourceTrack ? [["source", t("sourceTrack")]] : []),
    ...audioLanes.map((_, index) => ["audio", `${t("voiceTrack")} ${index + 1}`, `audio-${index}`, `audio-${index}`, `audio-${index}`]),
    ...(showMusicTrack ? [["music", t("musicTrack")]] : []),
  ];
  const isRowVisible = (track) => {
    const baseTrack = track.replace(/-\d+$/, "");
    return trackVisibility[baseTrack] !== false && trackVisibility[track] !== false;
  };
  const getTimelineRowVisibility = (track, visibilityKey = track) => {
    if (track !== "overlay") return isRowVisible(visibilityKey);
    const laneIndex = Number(String(visibilityKey).replace(/^overlay-/, ""));
    return Number.isInteger(laneIndex) ? isOverlayLaneVisible(overlayLanes[laneIndex]) : isRowVisible("overlay");
  };
  const toggleTimelineRowVisibility = (track, visibilityKey = track) => {
    const willHide = getTimelineRowVisibility(track, visibilityKey);
    if (willHide) {
      if (selectedTrack === track) {
        clearTimelineClipFocus();
        setSelectedTrack("");
      }
      setTimelineRangeSelection((current) => new Set(
        [...current].filter((key) => !key.startsWith(`${track}:`)),
      ));
      setContextMenu(null);
    }
    if (track === "overlay") {
      const laneIndex = Number(String(visibilityKey).replace(/^overlay-/, ""));
      if (Number.isInteger(laneIndex)) return toggleOverlayLaneVisibility(laneIndex);
    }
    toggleTrackVisibility(visibilityKey);
  };
  const toggleTimelineRowLock = (track, lockKey = track) => {
    if (!isTimelineRowLocked(track, lockKey)) {
      setTimelineRangeSelection((current) => new Set(
        [...current].filter((key) => !key.startsWith(`${track}:`)),
      ));
    }
    toggleTrackLock(lockKey);
  };
  const [rulerViewport, setRulerViewport] = useState({
    scrollLeft: 0,
    viewportWidth: 0,
    contentWidth: 0,
  });
  const [contextMenu, setContextMenu] = useState(null);
  const [imageCaptionPendingId, setImageCaptionPendingId] = useState("");
  const contextImageSegment = contextMenu?.track === "image" && contextMenu.segmentId
    ? displayedVisualSegments.find((segment) => segment.id === contextMenu.segmentId)
    : null;
  const contextOverlaySegment = contextMenu?.track === "overlay" && contextMenu.segmentId
    ? visualOverlaySegments.find((segment) => segment.id === contextMenu.segmentId)
    : null;
  const contextAudioSegment = contextMenu?.track === "audio" && contextMenu.segmentId
    ? audioSegments.find((segment) => segment.id === contextMenu.segmentId)
    : null;
  const contextCaptionSegment = contextMenu?.track === "caption" && contextMenu.segmentId
    ? displayedCaptionSegments.find((segment) => segment.id === contextMenu.segmentId)
    : null;
  const contextAudioHasLinkedCaption = contextAudioSegment
    ? displayedCaptionSegments.some((caption) => caption.audioSegmentId === contextAudioSegment.id)
    : false;
  const contextMusicSegment = contextMenu?.track === "music" && contextMenu.segmentId
    ? (musicSegments.length ? musicSegments : [{ id: "music-audio", start: musicStartPercent / 100 * timelineDuration, duration: musicDuration, peaks: musicPeaks }])
      .find((segment) => segment.id === contextMenu.segmentId)
    : null;
  const trackTool = (track) => ({ image: "media", overlay: "media", sticker: "stickers", caption: "caption", source: "audio", audio: "audio", music: "audio" })[track] || "media";
  const openTrackPanel = (track) => {
    setSelectedTrack(track);
    setActiveTool(trackTool(track));
  };
  const handlePlayheadPointerDown = (event) => {
    if (window.matchMedia?.("(max-width: 760px)").matches) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    startTimelineSeek(event);
  };
  const handleTimelineSurfacePointerDown = (event) => {
    if (window.matchMedia?.("(max-width: 760px)").matches) return;
    if (startTimelineMarqueeSelection(event)) return;
    clearTimelineClipFocus();
    startTimelineSeek(event);
  };
  useEffect(() => {
    const closeSelectionMenu = (event) => {
      if (event.target?.closest?.(".timeline-selection-tool, .timeline-selection-menu")) return;
      setTimelineSelectionMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeSelectionMenu);
    return () => window.removeEventListener("pointerdown", closeSelectionMenu);
  }, []);
  useEffect(() => {
    const handleSelectionShortcut = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "[") {
        event.preventDefault();
        setTimelineSelectionMode("left");
        setTimelineSelectionMenuOpen(false);
      }
      if (event.key === "]") {
        event.preventDefault();
        setTimelineSelectionMode("right");
        setTimelineSelectionMenuOpen(false);
      }
      if (event.key === "Escape" && timelineSelectionMode !== "select") {
        setTimelineSelectionMode("select");
        setTimelineRangeSelection(new Set());
        setSelectedEditPointIndex(-1);
      }
      if (
        timelineSelectionMode === "edit-point"
        && selectedEditPointIndex > 0
        && (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        if (trackLocks.image) return void notify(t("fineEditTrackLocked", "主画面轨已锁定，无法调整编辑点"));
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const step = event.shiftKey ? 0.25 : 1 / 30;
        const result = rollVisualBoundary(displayedVisualSegments, selectedEditPointIndex, direction * step);
        if (Math.abs(result.delta) < 0.0001) return void notify(t("fineEditSourceLimit", "已到达片段或源素材边界"));
        setVisualSegments(result.segments);
        seekTo(getVisualStart(selectedEditPointIndex) + result.delta);
      }
    };
    window.addEventListener("keydown", handleSelectionShortcut);
    return () => window.removeEventListener("keydown", handleSelectionShortcut);
  }, [displayedVisualSegments, getVisualStart, notify, seekTo, selectedEditPointIndex, setVisualSegments, t, timelineSelectionMode, trackLocks.image]);
  const selectContextTarget = (track, segmentId = "") => {
    const isMobileDirectClip = ["audio", "source", "music", "sticker"].includes(track)
      && !shouldActivateToolRailForClip(window.matchMedia?.("(max-width: 760px)").matches ?? false);
    if (isMobileDirectClip) setSelectedTrack(track);
    else openTrackPanel(track);
    const selectionType = { image: "visual", overlay: "overlay", sticker: "sticker", caption: "caption", audio: "voice", source: "source", music: "music" }[track];
    clearClipSelections(selectionType);
    if (track === "image" && segmentId) setSelectedVisualSegmentId(segmentId);
    if (track === "overlay" && segmentId) setSelectedVisualOverlayId?.(segmentId);
    if (track === "sticker" && segmentId) setSelectedStickerSegmentId(segmentId);
    if (track === "caption" && segmentId) setSelectedSegmentId(segmentId);
    if (track === "audio" && segmentId) setSelectedAudioSegmentId(segmentId);
    if (track === "source" && segmentId) setSelectedSourceAudioSegmentId(segmentId);
    if (track === "music" && segmentId) setSelectedMusicSegmentId?.(segmentId);
  };
  const showTrackContextMenu = (event, track, segmentId = "", visibilityKey = track, lockKey = track) => {
    event.preventDefault(); event.stopPropagation();
    selectContextTarget(track, segmentId);
    if (segmentId && window.matchMedia?.("(max-width: 760px)").matches) {
      setContextMenu(null);
      setMobileClipActionTrack(track);
      setMobileClipActionsVisible(true);
      return;
    }
    const trackRect = trackScrollRef.current?.getBoundingClientRect();
    const targetTime = trackRect && timelineDuration > 0
      ? Math.max(0, Math.min(timelineDuration, ((event.clientX - trackRect.left) / trackRect.width) * timelineDuration))
      : currentTime;
    setContextMenu({
      x: Math.max(10, Math.min(window.innerWidth - 234, event.clientX)),
      y: Math.max(10, Math.min(window.innerHeight - 258, event.clientY)),
      track, visibilityKey, lockKey, segmentId, targetTime, kind: segmentId ? "clip" : "track",
    });
  };
  const runContextAction = (action) => {
    setContextMenu(null);
    window.requestAnimationFrame(action);
  };
  const runImageCaptionAction = async (segment) => {
    if (!segment || imageCaptionPendingId) return;
    setImageCaptionPendingId(segment.id);
    try {
      await generateImageCaption?.(segment);
      setContextMenu(null);
    } finally {
      setImageCaptionPendingId("");
    }
  };
  const runSourceAudioExtraction = async (segment, track = "image") => {
    if (!segment || sourceAudioExtractionPendingId) return;
    const index = track === "image" ? displayedVisualSegments.findIndex((item) => item.id === segment.id) : -1;
    const start = track === "overlay"
      ? Math.max(0, Number(segment.start) || 0)
      : getVisualSegmentStartTime(displayedVisualSegments, index);
    setSourceAudioExtractionPendingId(segment.id);
    setContextMenu(null);
    try {
      const result = await extractVideoSourceAudio?.(segment, start, track === "overlay"
        ? { destination: "audio" }
        : { append: Boolean(sourceAudioBlob) });
      if (result?.track && result?.segmentId) {
        setSelectedTrack(result.track);
        if (result.track === "audio") setSelectedAudioSegmentId(result.segmentId);
        if (result.track === "source") setSelectedSourceAudioSegmentId(result.segmentId);
        revealTimelineClip(result.track, result.segmentId);
      }
    } finally {
      setSourceAudioExtractionPendingId("");
    }
  };
  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const closeOnOutsidePointer = (event) => {
      if (event.target?.closest?.(".timeline-context-menu")) return;
      close();
    };
    const closeOnKey = (event) => event.key === "Escape" && close();
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnKey);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);
  const [localTimelineZoom, setLocalTimelineZoom] = useState(() => clampTimelineZoom(timelineZoom));
  const filmstripUpgradeInFlightRef = useRef(new Set());
  const progressiveFilmstripAbortRef = useRef(null);
  const progressiveFilmstripStateRef = useRef(null);
  progressiveFilmstripStateRef.current = { currentTime, displayedVisualSegments, renderedVisualTimeline };
  const [trimScaleLock, setTrimScaleLock] = useState(null);
  const trimScaleLockRef = useRef(null);
  const trimScrollSeekGuardUntilRef = useRef(0);
  const mobileRulerSchemeRef = useRef(null);
  const timelineZoomRef = useRef(timelineZoom);
  const wheelZoomFrameRef = useRef(0);
  const wheelZoomPreviewRef = useRef(null);
  const commitZoomTimerRef = useRef(0);
  const rulerViewportFrameRef = useRef(0);
  const wheelZoomActiveRef = useRef(false);
  const rulerViewportSyncRef = useRef(null);
  const rulerViewportRef = useRef(null);
  const rulerCanvasRef = useRef(null);
  const playheadFrameCaptureRef = useRef(0);
  const zoomReadoutRef = useRef(null);
  const pendingWheelDeltaRef = useRef(0);
  const pendingWheelAnchorRef = useRef(null);
  const timelineWheelHandlerRef = useRef(null);
  const timelineWheelGestureRef = useRef({ mode: "", lastEventTime: 0 });
  const mobilePinchPointersRef = useRef(new Map());
  const mobilePinchGestureRef = useRef(null);
  const mobilePinchActiveRef = useRef(false);
  const mobilePinchFrameRef = useRef(0);
  const mobilePinchReleaseFrameRef = useRef(0);
  const mobilePinchPendingDistanceRef = useRef(0);
  const mobileTimelineStateRef = useRef(null);
  mobileTimelineStateRef.current = { currentTime, isPlaying, seekTo, timelineDuration };
  useEffect(() => {
    const startTrimScaleLock = (event) => {
      const pixelsPerSecond = Number(event.detail?.pixelsPerSecond) || 0;
      const isMobileTrimViewport = window.matchMedia?.("(max-width: 760px)").matches;
      const mobileScaleBasisWidth = window.matchMedia?.("(max-width: 390px)").matches ? 480 : 520;
      const visibleDuration = isMobileTrimViewport
        ? getTimelineVisibleDurationForPixelScale(pixelsPerSecond, mobileScaleBasisWidth)
        : Number(event.detail?.visibleDuration) || 0;
      if (!(pixelsPerSecond > 0) || !(visibleDuration > 0)) return;
      const lock = { pixelsPerSecond, visibleDuration };
      trimScaleLockRef.current = lock;
      trimScrollSeekGuardUntilRef.current = Number.POSITIVE_INFINITY;
      mobileRulerSchemeRef.current = null;
      setTrimScaleLock(lock);
    };
    const endTrimScaleLock = () => {
      trimScaleLockRef.current = null;
      trimScrollSeekGuardUntilRef.current = performance.now() + 80;
      setTrimScaleLock(null);
    };
    window.addEventListener(TIMELINE_TRIM_SCALE_START_EVENT, startTrimScaleLock);
    window.addEventListener(TIMELINE_TRIM_SCALE_END_EVENT, endTrimScaleLock);
    return () => {
      window.removeEventListener(TIMELINE_TRIM_SCALE_START_EVENT, startTrimScaleLock);
      window.removeEventListener(TIMELINE_TRIM_SCALE_END_EVENT, endTrimScaleLock);
    };
  }, [setTimelineZoom]);
  useEffect(() => {
    const trackElement = trackScrollRef.current;
    const scrollElement = trackElement?.parentElement;
    if (!trackElement || !scrollElement) {
      return undefined;
    }

    const syncRulerPosition = () => {
      if (rulerCanvasRef.current) {
        rulerCanvasRef.current.style.transform = `translateX(${-scrollElement.scrollLeft}px)`;
      }
    };
    const syncMobileTimelineTime = () => {
      const state = mobileTimelineStateRef.current;
      if (
        trimScaleLockRef.current
        || performance.now() < trimScrollSeekGuardUntilRef.current
        || !window.matchMedia?.("(max-width: 760px)").matches
        || state?.isPlaying
        || state?.timelineDuration <= 0
      ) {
        return;
      }
      const trackRect = trackElement.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      const fixedPlayheadX = scrollRect.left + scrollRect.width / 2;
      const nextTime = Math.max(
        0,
        Math.min(state.timelineDuration, ((fixedPlayheadX - trackRect.left) / Math.max(trackRect.width, 1)) * state.timelineDuration),
      );
      if (Math.abs(nextTime - state.currentTime) > 0.01) state.seekTo(nextTime);
    };
    const applyRulerViewportUpdate = () => {
      rulerViewportFrameRef.current = 0;
      syncRulerPosition();
      syncMobileTimelineTime();
      const nextViewport = {
        scrollLeft: scrollElement.scrollLeft,
        viewportWidth: scrollElement.clientWidth,
        contentWidth: trackElement.clientWidth,
      };
      setRulerViewport((viewport) =>
        Math.abs(viewport.scrollLeft - nextViewport.scrollLeft) < 0.5 &&
        Math.abs(viewport.viewportWidth - nextViewport.viewportWidth) < 0.5 &&
        Math.abs(viewport.contentWidth - nextViewport.contentWidth) < 0.5
          ? viewport
          : nextViewport,
      );
    };
    const scheduleRulerViewportUpdate = () => {
      syncRulerPosition();
      if (wheelZoomActiveRef.current || mobilePinchActiveRef.current) {
        return;
      }
      if (rulerViewportFrameRef.current) {
        return;
      }
      rulerViewportFrameRef.current = window.requestAnimationFrame(applyRulerViewportUpdate);
    };
    rulerViewportSyncRef.current = scheduleRulerViewportUpdate;
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleRulerViewportUpdate);

    applyRulerViewportUpdate();
    scrollElement.addEventListener("scroll", scheduleRulerViewportUpdate, { passive: true });
    resizeObserver?.observe(scrollElement);
    resizeObserver?.observe(trackElement);

    return () => {
      scrollElement.removeEventListener("scroll", scheduleRulerViewportUpdate);
      if (rulerViewportFrameRef.current) {
        window.cancelAnimationFrame(rulerViewportFrameRef.current);
        rulerViewportFrameRef.current = 0;
      }
      resizeObserver?.disconnect();
      if (rulerViewportSyncRef.current === scheduleRulerViewportUpdate) {
        rulerViewportSyncRef.current = null;
      }
    };
  }, [trackScrollRef]);
  useEffect(() => {
    if (!isPlaying || !window.matchMedia?.("(max-width: 760px)").matches || timelineDuration <= 0) return;
    const trackElement = trackScrollRef.current;
    const scrollElement = trackElement?.parentElement;
    if (!trackElement || !scrollElement) return;
    scrollElement.scrollLeft = (Math.max(0, Math.min(timelineDuration, currentTime)) / timelineDuration) * trackElement.clientWidth;
  }, [currentTime, isPlaying, timelineDuration, trackScrollRef]);
  useEffect(() => {
    const nextZoom = clampTimelineZoom(timelineZoom);
    if (Math.abs(nextZoom - timelineZoomRef.current) < 0.0008) {
      return;
    }
    timelineZoomRef.current = nextZoom;
    setLocalTimelineZoom(nextZoom);
  }, [timelineZoom]);
  useEffect(() => {
    const filmstripState = progressiveFilmstripStateRef.current;
    const segmentIndex = filmstripState.displayedVisualSegments.findIndex((item) => item.id === currentVisualSegment?.id);
    const segment = filmstripState.displayedVisualSegments[segmentIndex];
    const segmentRange = filmstripState.renderedVisualTimeline[segmentIndex];
    if (
      !segment
      || (segment.type || visualType) !== "video"
      || segment.preparing
      || timelineSeekActive
      || !segment.blob
      || !segmentRange
      || rulerViewport.contentWidth <= 0
      || rulerViewport.viewportWidth <= 0
    ) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      progressiveFilmstripAbortRef.current?.abort();
      progressiveFilmstripAbortRef.current = controller;
      const frameCount = getTimelineThumbnailCount({
        duration: segment.duration,
        timelineDuration,
        contentWidth: rulerViewport.contentWidth,
        timelineZoom: localTimelineZoom,
        maxThumbnails: VIDEO_THUMBNAIL_DISPLAY_MAX_COUNT,
      });
      const viewportStart = rulerViewport.scrollLeft / rulerViewport.contentWidth * timelineDuration;
      const viewportEnd = (rulerViewport.scrollLeft + rulerViewport.viewportWidth) / rulerViewport.contentWidth * timelineDuration;
      const visibleLocalStart = Math.max(0, viewportStart - segmentRange.start);
      const visibleLocalEnd = Math.min(Number(segment.duration) || 0, viewportEnd - segmentRange.start);
      if (visibleLocalEnd <= visibleLocalStart || frameCount <= 0) return;
      const duration = Math.max(0.001, Number(segment.duration) || 0.001);
      const firstVisibleCell = Math.max(0, Math.min(frameCount - 1, Math.floor(visibleLocalStart / duration * frameCount)));
      const lastVisibleCell = Math.max(firstVisibleCell, Math.min(frameCount - 1, Math.ceil(visibleLocalEnd / duration * frameCount) - 1));
      const playheadCell = filmstripState.currentTime >= segmentRange.start && filmstripState.currentTime < segmentRange.end
        ? Math.max(0, Math.min(frameCount - 1, Math.floor((filmstripState.currentTime - segmentRange.start) / duration * frameCount)))
        : -1;
      const visibleOrder = getBisectionCellOrder(firstVisibleCell, lastVisibleCell);
      const offscreenLeft = getBisectionCellOrder(0, firstVisibleCell - 1);
      const offscreenRight = getBisectionCellOrder(lastVisibleCell + 1, frameCount - 1);
      const offscreenOrder = [];
      for (let index = 0; index < Math.max(offscreenLeft.length, offscreenRight.length); index += 1) {
        if (index < offscreenLeft.length) offscreenOrder.push(offscreenLeft[index]);
        if (index < offscreenRight.length) offscreenOrder.push(offscreenRight[index]);
      }
      const visiblePriorityCells = [...new Set([
        ...(playheadCell >= firstVisibleCell && playheadCell <= lastVisibleCell ? [playheadCell] : []),
        ...visibleOrder,
      ])];
      const offscreenPriorityCells = [...new Set([
        // Continue the same midpoint-bisection refinement through offscreen
        // cells after the visible region has been committed atomically. A
        // viewport move aborts this work and restarts with the new region.
        ...offscreenOrder,
      ])];
      const sourceDuration = Math.max(
        Number(segment.trackFrameDuration) || 0,
        (Number(segment.sourceStart) || 0) + (Number(segment.sourceDuration) || Number(segment.duration) || 0),
      );
      const existingFrames = Array.isArray(segment.trackFrames) ? segment.trackFrames : [];
      const sourceCellSpan = sourceDuration / Math.max(1, frameCount);
      const getMissingSampleTimes = (cellIndices) => cellIndices
        .map((cellIndex) => getVisualSourceTime(segment, cellIndex / frameCount * duration))
        .filter((sourceTime) => !existingFrames.some((frame) => (
          Math.abs((Number(frame?.sourceTime) || 0) - sourceTime) <= Math.max(0.04, sourceCellSpan * 0.08)
        )));
      const visibleSampleTimes = getMissingSampleTimes(visiblePriorityCells);
      const offscreenSampleTimes = getMissingSampleTimes(offscreenPriorityCells);
      const fullFrameBudget = getVideoTrackSampleCount(sourceDuration);
      const shouldBuildExactBackgroundIndex = Boolean(
        !segment.remoteSrc
        && fullFrameBudget > existingFrames.length
        && fullFrameBudget < VIDEO_THUMBNAIL_DISPLAY_MAX_COUNT,
      );
      if (!visibleSampleTimes.length && !offscreenSampleTimes.length && !shouldBuildExactBackgroundIndex) return;
      const commitRefinedFrames = (framesToCommit) => {
        if (controller.signal.aborted || !framesToCommit?.length) return;
        setVisualSegments((items) => items.map((item) => item.id === segment.id
          ? {
              ...item,
              trackFrames: mergeExactVideoTrackFrames(item.trackFrames, framesToCommit),
              trackFrameDuration: sourceDuration,
              trackFrameSampling: "exact-pts-hq-v5-progressive",
            }
          : item));
      };
      const refineCells = (sampleTimes) => {
        if (!sampleTimes.length) return Promise.resolve([]);
        return extractVideoTrackFrames(segment.blob, {
          duration: sourceDuration,
          width: segment.width,
          height: segment.height,
          sampleTimes,
          preferNativeSeek: Boolean(segment.remoteSrc),
          signal: controller.signal,
        });
      };
      refineCells(visibleSampleTimes).then(async (visibleFrames) => {
        // Keep the initial filmstrip stable while a region is decoding. Each
        // completed region swaps in once, so shot changes become clearer
        // without a stream of thumbnail resampling flashes.
        commitRefinedFrames(visibleFrames);
        if (offscreenSampleTimes.length) {
          await waitForFilmstripIdle(controller.signal);
          commitRefinedFrames(await refineCells(offscreenSampleTimes));
        }
        if (!shouldBuildExactBackgroundIndex || controller.signal.aborted) return;
        await waitForFilmstripIdle(controller.signal, 420);
        const exactFrames = await extractVideoTrackFrames(segment.blob, {
          duration: sourceDuration,
          width: segment.width,
          height: segment.height,
          maxFrames: fullFrameBudget,
          signal: controller.signal,
          yieldEveryFrames: 8,
        });
        commitRefinedFrames(exactFrames);
      }).catch((error) => {
        if (error?.name !== "AbortError") console.warn("Progressive visible filmstrip extraction failed", error);
      }).finally(() => {
        if (progressiveFilmstripAbortRef.current === controller) progressiveFilmstripAbortRef.current = null;
      });
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (progressiveFilmstripAbortRef.current === controller) progressiveFilmstripAbortRef.current = null;
    };
  }, [
    currentVisualSegment?.id,
    currentVisualSegment?.src,
    currentVisualSegment?.preparing,
    localTimelineZoom,
    rulerViewport.contentWidth,
    rulerViewport.scrollLeft,
    rulerViewport.viewportWidth,
    setVisualSegments,
    timelineDuration,
    timelineSeekActive,
    visualType,
  ]);
  useEffect(() => {
    if (localTimelineZoom < 3 || typeof setVisualSegments !== "function") return undefined;
    const segment = displayedVisualSegments.find((item) => {
      if ((item.type || visualType) !== "video" || item.remoteSrc || !item.src || filmstripUpgradeInFlightRef.current.has(item.src)) return false;
      const sourceDuration = Math.max(
        Number(item.trackFrameDuration) || 0,
        (Number(item.sourceStart) || 0) + (Number(item.sourceDuration) || Number(item.duration) || 0),
      );
      const storedFrames = Array.isArray(item.trackFrames) ? item.trackFrames : [];
      if (String(item.trackFrameSampling || "").startsWith("exact-pts-hq-v5")) return false;
      const expectedCount = getVideoTrackSampleCount(sourceDuration);
      const usesLegacyCenteredSamples = storedFrames.length > 0
        && item.trackFrameSampling !== "exact-pts-hq-v4";
      return sourceDuration > 0 && (storedFrames.length < expectedCount * 0.9 || usesLegacyCenteredSamples);
    });
    if (!segment) return undefined;
    const sourceDuration = Math.max(
      Number(segment.trackFrameDuration) || 0,
      (Number(segment.sourceStart) || 0) + (Number(segment.sourceDuration) || Number(segment.duration) || 0),
    );
    const sourceKey = segment.src;
    filmstripUpgradeInFlightRef.current.add(sourceKey);
    extractVideoTrackFrames(segment.blob || sourceKey, {
      duration: sourceDuration,
      width: segment.width,
      height: segment.height,
      maxFrames: getVideoTrackSampleCount(sourceDuration),
      preferNativeSeek: Boolean(segment.remoteSrc),
    }).then((trackFrames) => {
      if (!trackFrames.length) return;
      setVisualSegments((items) => items.map((item) => item.src === sourceKey
        ? { ...item, trackFrames, trackFrameDuration: sourceDuration, trackFrameSampling: "exact-pts-hq-v4" }
        : item));
    }).catch((error) => {
      console.warn("High-density timeline frame extraction failed", error);
    }).finally(() => {
      filmstripUpgradeInFlightRef.current.delete(sourceKey);
    });
    return undefined;
  }, [displayedVisualSegments, localTimelineZoom, setVisualSegments, visualType]);
  useEffect(() => {
    if (playheadFrameCaptureRef.current) {
      window.cancelAnimationFrame(playheadFrameCaptureRef.current);
      playheadFrameCaptureRef.current = 0;
    }
    if (timelineSeekActive) return undefined;
    const segmentIndex = displayedVisualSegments.findIndex((item) => item.id === currentVisualSegment?.id);
    const segment = displayedVisualSegments[segmentIndex];
    const segmentRange = renderedVisualTimeline[segmentIndex];
    if (!segment || (segment.type || visualType) !== "video" || !segmentRange) {
      setPlayheadTrackFrame(null);
      return undefined;
    }
    const localTime = Math.max(0, Math.min(Number(segment.duration) || 0, currentTime - segmentRange.start));
    // At the exact origin, retain the prepared opening representative. Some
    // WebM decoders expose a synthetic black canvas before their first PTS.
    if (localTime < 0.2) return undefined;
    const expectedSourceTime = getVisualSourceTime(segment, localTime);
    let attempts = 0;
    const capturePresentedFrame = () => {
      playheadFrameCaptureRef.current = 0;
      const previewVideo = document.querySelector(".preview-video");
      if (!(previewVideo instanceof HTMLVideoElement) || previewVideo.readyState < 2) {
        if (attempts++ < 48) playheadFrameCaptureRef.current = window.requestAnimationFrame(capturePresentedFrame);
        return;
      }
      // currentTime advances as soon as a seek is requested, before the new
      // pixels necessarily reach the compositor. Capture only after the
      // preview's requestVideoFrameCallback-backed media time confirms that
      // the decoder actually presented the frame for this playhead position.
      if (Math.abs(previewVideoMediaTime - expectedSourceTime) > PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS) {
        if (attempts++ < 48) playheadFrameCaptureRef.current = window.requestAnimationFrame(capturePresentedFrame);
        return;
      }
      const frame = captureVideoTrackFrame(previewVideo, { sourceTime: previewVideo.currentTime });
      if (!frame) return;
      setPlayheadTrackFrame({
        segmentId: segment.id,
        timelineTime: currentTime,
        sourceTime: previewVideoMediaTime,
        frame,
      });
    };
    playheadFrameCaptureRef.current = window.requestAnimationFrame(capturePresentedFrame);
    return () => {
      if (!playheadFrameCaptureRef.current) return;
      window.cancelAnimationFrame(playheadFrameCaptureRef.current);
      playheadFrameCaptureRef.current = 0;
    };
  }, [
    currentTime,
    currentVisualSegment?.id,
    displayedVisualSegments,
    previewVideoMediaTime,
    renderedVisualTimeline,
    timelineSeekActive,
    visualType,
  ]);
  useEffect(() => {
    if (!window.matchMedia?.("(max-width: 760px)").matches || timelineDuration <= 0) return;
    const minimumZoom = getTimelineZoomForVisibleDuration(timelineDuration);
    if (timelineZoomRef.current >= minimumZoom - 0.0008) return;
    timelineZoomRef.current = minimumZoom;
    setLocalTimelineZoom(minimumZoom);
    setTimelineZoom(minimumZoom);
  }, [setTimelineZoom, timelineDuration]);
  useEffect(
    () => () => {
      if (wheelZoomFrameRef.current) {
        window.cancelAnimationFrame(wheelZoomFrameRef.current);
      }
      trackScrollRef.current?.classList.remove("is-wheel-zooming");
      rulerCanvasRef.current?.classList.remove("is-wheel-zooming");
      if (trackScrollRef.current) trackScrollRef.current.style.transform = "";
      if (rulerCanvasRef.current) rulerCanvasRef.current.style.transform = "";
      wheelZoomPreviewRef.current = null;
      wheelZoomActiveRef.current = false;
      window.clearTimeout(commitZoomTimerRef.current);
    },
    [trackScrollRef],
  );
  const isMobileTimelineViewport = window.matchMedia?.("(max-width: 760px)").matches;
  const mobileTrackBaseWidth = window.matchMedia?.("(max-width: 390px)").matches ? 480 : 520;
  if (
    isMobileTimelineViewport
    && timelineDuration > 0
    && (!mobileRulerSchemeRef.current || Math.abs(mobileRulerSchemeRef.current.timelineDuration - timelineDuration) > 0.001)
  ) {
    const stableVisibleDuration = getTimelineVisibleDuration(localTimelineZoom);
    mobileRulerSchemeRef.current = {
      timelineDuration,
      scaleZoom: getTimelineZoomForVisibleDuration(stableVisibleDuration),
      minimumMajorStep: (stableVisibleDuration * 88) / mobileTrackBaseWidth,
    };
  }
  // A clip drag can extend the project and resize the track before the
  // ResizeObserver publishes the new content width. Keep the ruler on the
  // drag-start pixel scale during that gap so ticks pan instead of stretching
  // for a frame and snapping back.
  const secondsPerPixel = trimScaleLock?.pixelsPerSecond > 0
    ? 1 / trimScaleLock.pixelsPerSecond
    : timelineDuration > 0 && rulerViewport.contentWidth > 0
      ? timelineDuration / rulerViewport.contentWidth
      : 0;
  const rulerVisibleStart = Math.max(0, rulerViewport.scrollLeft * secondsPerPixel);
  const rulerVisibleEnd = Math.min(
    timelineDuration,
    (rulerViewport.scrollLeft + rulerViewport.viewportWidth) * secondsPerPixel,
  );
  const rulerScaleZoom = isMobileTimelineViewport
    ? mobileRulerSchemeRef.current?.scaleZoom ?? getTimelineZoomForVisibleDuration(timelineDuration)
    : localTimelineZoom;
  const mobileRulerMinimumMajorStep = isMobileTimelineViewport
    ? mobileRulerSchemeRef.current?.minimumMajorStep ?? (timelineDuration * 88) / mobileTrackBaseWidth
    : 0;
  const rulerTicks = useMemo(
    () => getTimelineRulerTicks(
      timelineDuration,
      rulerScaleZoom,
      rulerVisibleStart,
      rulerVisibleEnd,
      { minimumMajorStep: mobileRulerMinimumMajorStep },
    ),
    [timelineDuration, rulerScaleZoom, mobileRulerMinimumMajorStep, rulerVisibleEnd, rulerVisibleStart],
  );
  const zoomReadout = getTimelineZoomLabel(localTimelineZoom);
  const fitTimelineZoom = getTimelineAutoFitZoom(timelineDuration, 0.9);
  const shortcutModifier = getPrimaryShortcutModifier();
  const localTrackWidthPercent = getTimelineTrackWidthPercent(timelineDuration, localTimelineZoom);
  const localTrackWidth = trimScaleLock?.pixelsPerSecond > 0
    ? `${getTrimLockedTrackWidth(timelineDuration, trimScaleLock.pixelsPerSecond)}px`
    : isMobileTimelineViewport
      ? `${mobileTrackBaseWidth * (localTrackWidthPercent / 100)}px`
      : `${localTrackWidthPercent}%`;
  const mainAssetInsertIndex = assetDropTargetTrack === "image"
    ? Math.max(0, Math.min(
        displayedVisualSegments.length,
        Number.isInteger(assetDropPosition?.insertIndex)
          ? assetDropPosition.insertIndex
          : displayedVisualSegments.length,
      ))
    : -1;
  const mainAssetInsertTime = mainAssetInsertIndex >= 0
    ? Number.isFinite(Number(assetDropPosition?.insertTime))
      ? Number(assetDropPosition.insertTime)
      : displayedVisualSegments.slice(0, mainAssetInsertIndex).reduce((sum, segment) => sum + (Number(segment.duration) || 0), 0)
    : 0;
  const mainAssetInsertDuration = Math.max(
    0.5,
    Math.min(
      MAX_TIMELINE_DURATION_SECONDS,
      Number(assetDragPreview?.duration ?? draggedAssetDuration) || IMAGE_SEGMENT_SECONDS,
    ),
  );
  const mainAssetInsertWidth = timelineDuration > 0
    ? Math.max(0.01, Math.min(100, (mainAssetInsertDuration / timelineDuration) * 100))
    : 0;
  const overlayAssetDropDuration = Math.max(
    0.1,
    Math.min(
      MAX_TIMELINE_DURATION_SECONDS,
      Number(assetDragPreview?.duration ?? draggedAssetDuration) || DEFAULT_OVERLAY_SECONDS,
    ),
  );
  const overlayAssetDropStart = Number.isFinite(Number(assetDropPosition?.startTime))
    ? Math.max(0, Number(assetDropPosition.startTime))
    : Math.max(0, Number(assetDropPosition?.percent) || 0) / 100 * Math.max(0, timelineDuration);
  const overlayAssetDropLeft = timelineDuration > 0
    ? Math.max(0, Math.min(100, overlayAssetDropStart / timelineDuration * 100))
    : 0;
  const overlayAssetDropWidth = timelineDuration > 0
    ? Math.max(0.4, Math.min(100, overlayAssetDropDuration / timelineDuration * 100))
    : 0;
  const commitTimelineZoom = (nextZoom, delay = 0) => {
    window.clearTimeout(commitZoomTimerRef.current);
    if (delay <= 0) {
      wheelZoomActiveRef.current = false;
    }
    if (delay <= 0) {
      setTimelineZoom(nextZoom);
      return;
    }
    commitZoomTimerRef.current = window.setTimeout(() => {
      setTimelineZoom(nextZoom);
    }, delay);
  };
  const adjustTimelineZoom = (nextZoomOrUpdater, { commitDelay = 0 } = {}) => {
    const currentZoom = clampTimelineZoom(timelineZoomRef.current);
    const rawNextZoom =
      typeof nextZoomOrUpdater === "function"
        ? nextZoomOrUpdater(currentZoom)
        : nextZoomOrUpdater;
    const nextZoom = clampTimelineZoom(rawNextZoom);
    if (Math.abs(nextZoom - currentZoom) < 0.0008) {
      return;
    }

    timelineZoomRef.current = nextZoom;
    setLocalTimelineZoom(nextZoom);
    commitTimelineZoom(nextZoom, commitDelay);
  };
  const hasSelectedShortcutTarget = timelineRangeSelection.size > 0 || Boolean(
    (selectedTrack === "image" && selectedVisualSegmentId) ||
    (selectedTrack === "overlay" && selectedVisualOverlayId) ||
    (selectedTrack === "sticker" && selectedStickerSegmentId) ||
    (selectedTrack === "caption" && selectedSegmentId) ||
    (selectedTrack === "audio" && selectedAudioSegmentId) ||
    (selectedTrack === "source" && (selectedSourceAudioSegmentId || sourceAudioBlob)) ||
    (selectedTrack === "music" && (selectedMusicSegmentId || musicBlob))
  );
  useEffect(() => {
    const handleTimelineShortcut = (event) => {
      if (event.isComposing || event.repeat || event.altKey) return;
      const target = event.target;
      if (
        isEditorTextEntryTarget(target) ||
        isEditorInteractiveTarget(target) ||
        isEditorShortcutBlockedByModal(target)
      ) return;

      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      if (!hasPrimaryModifier && !event.shiftKey && event.code === "Space") {
        event.preventDefault();
        handlePlayToggle();
        return;
      }
      if (hasPrimaryModifier && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        handleCutTrack();
        return;
      }
      if (hasPrimaryModifier && !event.shiftKey && event.key.toLowerCase() === "d" && hasSelectedShortcutTarget) {
        event.preventDefault();
        handleDuplicateTrack();
        return;
      }
      if (hasPrimaryModifier) return;
      if (event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        adjustTimelineZoom(fitTimelineZoom);
        return;
      }
      if (event.shiftKey && event.key !== "+") return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        adjustTimelineZoom((zoom) => zoom * TIMELINE_BUTTON_ZOOM_RATIO);
      } else if (event.key === "-") {
        event.preventDefault();
        adjustTimelineZoom((zoom) => zoom / TIMELINE_BUTTON_ZOOM_RATIO);
      }
    };
    window.addEventListener("keydown", handleTimelineShortcut);
    return () => window.removeEventListener("keydown", handleTimelineShortcut);
  });
  const flushWheelZoom = () => {
    wheelZoomFrameRef.current = 0;

    const anchor = pendingWheelAnchorRef.current;
    const wheelDelta = Math.max(-640, Math.min(640, pendingWheelDeltaRef.current));
    pendingWheelDeltaRef.current = 0;
    if (!anchor) {
      return;
    }

    const currentZoom = clampTimelineZoom(timelineZoomRef.current);
    let nextZoom;
    let nextTrackWidth;
    let nextTrackWidthPercent;
    let nextScrollLeft;

    if (anchor.isMobile) {
      const renderedVisibleDuration = timelineDuration > 0
        ? (timelineDuration * mobileTrackBaseWidth) / Math.max(anchor.trackWidth, 1)
        : timelineDuration;
      const renderedStartZoom = getTimelineZoomForVisibleDuration(renderedVisibleDuration);
      const widthScale = Math.exp(-wheelDelta * TIMELINE_WHEEL_ZOOM_SENSITIVITY);
      const mobileState = getMobilePinchZoomState({
        timelineDuration,
        minimumZoom: getTimelineZoomForVisibleDuration(timelineDuration),
        startZoom: renderedStartZoom,
        startDistance: 1,
        distance: widthScale,
        startTrackWidth: anchor.trackWidth,
        baseTrackWidth: mobileTrackBaseWidth,
      });
      nextZoom = mobileState.nextZoom;
      nextTrackWidth = mobileState.nextTrackWidth;
      if (Math.abs(nextTrackWidth - anchor.trackWidth) < 0.01) return;
    } else {
      const fittedMinimumZoom = getTimelineAutoFitZoom(
        Math.max(0.5, timelineContentDuration),
        0.9,
      );
      nextZoom = Math.max(
        fittedMinimumZoom,
        clampTimelineZoom(currentZoom * Math.exp(-wheelDelta * TIMELINE_WHEEL_ZOOM_SENSITIVITY)),
      );
      if (Math.abs(nextZoom - currentZoom) < 0.0008) return;
      const currentTrackWidthPercent = getTimelineTrackWidthPercent(timelineDuration, currentZoom);
      nextTrackWidthPercent = getTimelineTrackWidthPercent(timelineDuration, nextZoom);
      const preview = wheelZoomPreviewRef.current;
      const baseTrackWidth = preview?.baseTrackWidth || anchor.trackWidth;
      const baseTrackWidthPercent = preview?.baseTrackWidthPercent || currentTrackWidthPercent;
      nextTrackWidth =
        baseTrackWidth * (nextTrackWidthPercent / Math.max(baseTrackWidthPercent, 0.001));
      nextScrollLeft =
        (preview?.trackContentStart ?? anchor.trackContentStart) +
        anchor.pointerTrackRatio * nextTrackWidth -
        anchor.pointerViewportX;
    }

    wheelZoomActiveRef.current = true;
    timelineZoomRef.current = nextZoom;
    anchor.trackElement.classList.add("is-wheel-zooming");
    rulerCanvasRef.current?.classList.add("is-wheel-zooming");
    if (anchor.isMobile) {
      anchor.trackElement.style.width = `${nextTrackWidth}px`;
      if (rulerCanvasRef.current) rulerCanvasRef.current.style.width = `${nextTrackWidth}px`;
    } else {
      const preview = wheelZoomPreviewRef.current || {
        baseTrackWidth: anchor.trackWidth,
        baseTrackWidthPercent: getTimelineTrackWidthPercent(timelineDuration, currentZoom),
        trackContentStart: anchor.trackContentStart,
        viewportLeft: anchor.viewportLeft,
        viewportWidth: anchor.viewportWidth,
      };
      const viewportTrackWidth = preview.baseTrackWidth / Math.max(preview.baseTrackWidthPercent / 100, 0.001);
      const maxScrollLeft = Math.max(0, nextTrackWidth - viewportTrackWidth);
      // Resolve the new scroll boundary ourselves. Letting the browser clamp an
      // out-of-range scrollLeft after the width write makes the native thumb
      // visibly jump when the track approaches the fitted 100% width.
      nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
      preview.scale = nextTrackWidthPercent / Math.max(preview.baseTrackWidthPercent, 0.001);
      preview.nextTrackWidthPercent = nextTrackWidthPercent;
      preview.nextScrollLeft = nextScrollLeft;
      wheelZoomPreviewRef.current = preview;
      // Keep clip geometry and text undistorted. Geometry reads are cached for
      // the gesture, so this layout write is not followed by a synchronous
      // getBoundingClientRect() on every wheel event.
      anchor.trackElement.style.width = `${nextTrackWidthPercent}%`;
      if (rulerCanvasRef.current) {
        rulerCanvasRef.current.style.width = `${nextTrackWidthPercent}%`;
        rulerCanvasRef.current.style.transform = `translateX(${-anchor.scrollElement.scrollLeft}px)`;
      }
    }
    anchor.trackElement.style.setProperty("--timeline-zoom", String(nextZoom));
    if (anchor.isMobile) {
      const nextTrackRect = anchor.trackElement.getBoundingClientRect();
      const viewportRect = anchor.scrollElement.getBoundingClientRect();
      nextScrollLeft = getMobilePinchAnchorScrollLeft({
        currentScrollLeft: anchor.scrollElement.scrollLeft,
        trackLeft: nextTrackRect.left,
        trackWidth: nextTrackRect.width,
        viewportLeft: viewportRect.left,
        viewportWidth: viewportRect.width,
        anchorTimeRatio: anchor.anchorTimeRatio,
      });
    }
    anchor.scrollElement.scrollLeft = Math.max(0, nextScrollLeft);
    if (zoomReadoutRef.current) {
      zoomReadoutRef.current.textContent = getTimelineZoomLabel(nextZoom);
    }

    window.clearTimeout(commitZoomTimerRef.current);
    commitZoomTimerRef.current = window.setTimeout(() => {
      wheelZoomActiveRef.current = false;
      const preview = wheelZoomPreviewRef.current;
      if (preview && !anchor.isMobile) {
        anchor.trackElement.style.width = `${preview.nextTrackWidthPercent}%`;
        if (rulerCanvasRef.current) rulerCanvasRef.current.style.width = `${preview.nextTrackWidthPercent}%`;
        anchor.trackElement.style.transform = "";
        wheelZoomPreviewRef.current = null;
        anchor.scrollElement.scrollLeft = preview.nextScrollLeft;
        if (rulerCanvasRef.current) {
          rulerCanvasRef.current.style.transform = `translateX(${-anchor.scrollElement.scrollLeft}px)`;
        }
      }
      setLocalTimelineZoom(nextZoom);
      setTimelineZoom(nextZoom);
      window.requestAnimationFrame(() => {
        anchor.trackElement.classList.remove("is-wheel-zooming");
        rulerCanvasRef.current?.classList.remove("is-wheel-zooming");
        rulerViewportSyncRef.current?.();
      });
    }, TIMELINE_WHEEL_ZOOM_COMMIT_DELAY);
  };
  const handleTimelineWheel = (event) => {
    const isOverTimelineContent = Boolean(
      event.target instanceof Element && event.target.closest(TIMELINE_WHEEL_ZOOM_CONTENT_SELECTOR),
    );
    const hasZoomModifier = event.ctrlKey || event.metaKey;
    const trackElement = trackScrollRef.current;
    const scrollElement = trackElement?.parentElement;
    const eventTime = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const previousWheelGesture = timelineWheelGestureRef.current;
    const continuesWheelGesture = previousWheelGesture.mode
      && eventTime - previousWheelGesture.lastEventTime <= TIMELINE_WHEEL_GESTURE_RESET_DELAY;
    const wheelMode = continuesWheelGesture
      ? previousWheelGesture.mode
      : hasZoomModifier
        ? "zoom"
        : Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey
          ? "horizontal"
          : isOverTimelineContent
            ? "zoom"
            : "vertical";
    timelineWheelGestureRef.current = { mode: wheelMode, lastEventTime: eventTime };

    if (wheelMode !== "zoom") {
      if (!scrollElement) return;
      const deltaModeMultiplier =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scrollElement.clientWidth : 1;
      const horizontalDelta = wheelMode === "horizontal" && Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : wheelMode === "horizontal"
          ? event.deltaY
          : 0;

      // Keep desktop trackpad momentum on the main thread so the independently
      // rendered ruler and the scrolling clips advance in the same frame. Native
      // compositor scrolling can otherwise move the track layer one or more
      // frames ahead of the sticky ruler during a fast two-finger swipe.
      if (horizontalDelta) {
        event.preventDefault();
        scrollElement.scrollLeft += horizontalDelta * deltaModeMultiplier;
        rulerViewportSyncRef.current?.();
      } else if (wheelMode === "vertical") {
        const board = event.currentTarget?.closest?.(".timeline")?.querySelector?.(".timeline-board");
        if (board && board.scrollHeight > board.clientHeight) {
          event.preventDefault();
          board.scrollTop += event.deltaY * deltaModeMultiplier;
        }
      }
      return;
    }

    if (!trackElement || !scrollElement) {
      return;
    }

    event.preventDefault();
    const activePreview = wheelZoomPreviewRef.current;
    const trackRect = activePreview ? null : trackElement.getBoundingClientRect();
    const scrollRect = activePreview ? null : scrollElement.getBoundingClientRect();
    const viewportLeft = scrollRect?.left ?? activePreview.viewportLeft;
    const viewportWidth = scrollRect?.width ?? activePreview.viewportWidth;
    const renderedTrackWidth = activePreview
      ? activePreview.baseTrackWidth * activePreview.scale
      : trackRect.width;
    const renderedTrackLeft = activePreview
      ? viewportLeft + activePreview.trackContentStart - scrollElement.scrollLeft
      : trackRect.left;
    const trackContentStart = activePreview?.trackContentStart
      ?? trackRect.left - scrollRect.left + scrollElement.scrollLeft;
    const isMobile = window.matchMedia?.("(max-width: 760px)").matches ?? false;
    const fixedPlayheadX = viewportLeft + viewportWidth / 2;
    const pointerTrackRatio = Math.max(
      0,
      Math.min(1, (event.clientX - renderedTrackLeft) / Math.max(renderedTrackWidth, 1)),
    );
    const deltaModeMultiplier =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scrollElement.clientHeight : 1;
    const normalizedDelta = Math.max(
      -280,
      Math.min(280, event.deltaY * deltaModeMultiplier),
    );

    pendingWheelDeltaRef.current = Math.max(
      -720,
      Math.min(720, pendingWheelDeltaRef.current + normalizedDelta),
    );
    pendingWheelAnchorRef.current = {
      pointerTrackRatio,
      pointerViewportX: event.clientX - viewportLeft,
      scrollElement,
      trackElement,
      trackContentStart,
      trackWidth: renderedTrackWidth,
      isMobile,
      anchorTimeRatio: Math.max(
        0,
        Math.min(1, (fixedPlayheadX - renderedTrackLeft) / Math.max(renderedTrackWidth, 1)),
      ),
    };
    if (!activePreview) {
      pendingWheelAnchorRef.current.viewportLeft = scrollRect.left;
      pendingWheelAnchorRef.current.viewportWidth = scrollRect.width;
    } else {
      pendingWheelAnchorRef.current.viewportLeft = activePreview.viewportLeft;
      pendingWheelAnchorRef.current.viewportWidth = activePreview.viewportWidth;
    }

    if (!wheelZoomFrameRef.current) {
      wheelZoomFrameRef.current = window.requestAnimationFrame(flushWheelZoom);
    }
  };
  timelineWheelHandlerRef.current = handleTimelineWheel;
  useEffect(() => {
    const scrollElement = trackScrollRef.current?.parentElement;
    if (!scrollElement) {
      return undefined;
    }

    const handleWheel = (event) => timelineWheelHandlerRef.current?.(event);
    scrollElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => scrollElement.removeEventListener("wheel", handleWheel);
  }, [trackScrollRef]);
  useEffect(() => {
    const trackElement = trackScrollRef.current;
    const scrollElement = trackElement?.parentElement;
    if (!trackElement || !scrollElement) return undefined;
    const pinchPointers = mobilePinchPointersRef.current;
    let singleTouchPan = null;

    const getPinchDistance = () => {
      const points = Array.from(pinchPointers.values());
      if (points.length < 2) return 0;
      return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    };
    const alignPinchAnchor = (anchorTimeRatio) => {
      const trackRect = trackElement.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      scrollElement.scrollLeft = getMobilePinchAnchorScrollLeft({
        currentScrollLeft: scrollElement.scrollLeft,
        trackLeft: trackRect.left,
        trackWidth: trackRect.width,
        viewportLeft: scrollRect.left,
        viewportWidth: scrollRect.width,
        anchorTimeRatio,
      });
    };
    const applyPinchZoom = () => {
      mobilePinchFrameRef.current = 0;
      const gesture = mobilePinchGestureRef.current;
      const distance = mobilePinchPendingDistanceRef.current;
      if (!gesture || distance <= 0) return;
      const { nextZoom, nextTrackWidth: nextWidth } = getMobilePinchZoomState({
        timelineDuration,
        minimumZoom: getTimelineZoomForVisibleDuration(timelineDuration),
        startZoom: gesture.startZoom,
        startDistance: gesture.startDistance,
        distance,
        startTrackWidth: gesture.startTrackWidth,
        baseTrackWidth: mobileTrackBaseWidth,
      });

      gesture.nextZoom = nextZoom;
      trackElement.style.width = `${nextWidth}px`;
      trackElement.classList.add("is-pinching");
      rulerCanvasRef.current?.classList.add("is-pinching");
      if (rulerCanvasRef.current) rulerCanvasRef.current.style.width = `${nextWidth}px`;
      alignPinchAnchor(gesture.anchorTimeRatio);
      if (zoomReadoutRef.current) zoomReadoutRef.current.textContent = getTimelineZoomLabel(nextZoom);
      rulerViewportSyncRef.current?.();
    };
    const finishPinch = () => {
      const gesture = mobilePinchGestureRef.current;
      if (!gesture) return;
      if (mobilePinchFrameRef.current) {
        window.cancelAnimationFrame(mobilePinchFrameRef.current);
        mobilePinchFrameRef.current = 0;
      }
      const nextZoom = gesture.nextZoom ?? gesture.startZoom;
      mobilePinchGestureRef.current = null;
      timelineZoomRef.current = nextZoom;
      setLocalTimelineZoom(nextZoom);
      setTimelineZoom(nextZoom);
      if (mobilePinchReleaseFrameRef.current) window.cancelAnimationFrame(mobilePinchReleaseFrameRef.current);
      mobilePinchReleaseFrameRef.current = window.requestAnimationFrame(() => {
        mobilePinchReleaseFrameRef.current = window.requestAnimationFrame(() => {
          mobilePinchReleaseFrameRef.current = 0;
          trackElement.classList.remove("is-pinching");
          rulerCanvasRef.current?.classList.remove("is-pinching");
          alignPinchAnchor(gesture.anchorTimeRatio);
          const state = mobileTimelineStateRef.current;
          if (Math.abs((state?.currentTime ?? gesture.anchorTime) - gesture.anchorTime) > 0.001) {
            state?.seekTo(gesture.anchorTime);
          }
          mobilePinchActiveRef.current = false;
          rulerViewportSyncRef.current?.();
        });
      });
    };
    const handlePointerDown = (event) => {
      if (!window.matchMedia?.("(max-width: 760px)").matches || event.pointerType !== "touch") return;
      pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchPointers.size === 1) {
        singleTouchPan = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startScrollLeft: scrollElement.scrollLeft,
          interactive: Boolean(event.target?.closest?.(TIMELINE_WHEEL_ZOOM_CONTENT_SELECTOR)),
        };
      }
      if (pinchPointers.size !== 2) return;
      singleTouchPan = null;
      if (mobilePinchReleaseFrameRef.current) {
        window.cancelAnimationFrame(mobilePinchReleaseFrameRef.current);
        mobilePinchReleaseFrameRef.current = 0;
      }
      window.dispatchEvent(new CustomEvent("timeline-mobile-pinch-start"));
      const state = mobileTimelineStateRef.current;
      const startDistance = getPinchDistance();
      // Freeze the exact rendered width before disabling transitions. A second
      // pinch can begin while a button/release zoom transition is still in
      // flight; using the stored zoom in that case makes the gesture start from
      // a different scale than the pixels under the user's fingers.
      const renderedTrackWidth = trackElement.getBoundingClientRect().width;
      const renderedTrackRect = trackElement.getBoundingClientRect();
      const renderedViewportRect = scrollElement.getBoundingClientRect();
      const fixedPlayheadX = renderedViewportRect.left + renderedViewportRect.width / 2;
      const renderedAnchorTimeRatio = Math.max(
        0,
        Math.min(1, (fixedPlayheadX - renderedTrackRect.left) / Math.max(renderedTrackWidth, 1)),
      );
      const renderedAnchorTime = renderedAnchorTimeRatio * Math.max(0, state?.timelineDuration || 0);
      trackElement.style.width = `${renderedTrackWidth}px`;
      trackElement.classList.add("is-pinching");
      rulerCanvasRef.current?.classList.add("is-pinching");
      if (rulerCanvasRef.current) rulerCanvasRef.current.style.width = `${renderedTrackWidth}px`;
      const renderedVisibleDuration = timelineDuration > 0
        ? (timelineDuration * mobileTrackBaseWidth) / Math.max(renderedTrackWidth, 1)
        : timelineDuration;
      const renderedStartZoom = getTimelineZoomForVisibleDuration(renderedVisibleDuration);
      mobilePinchPendingDistanceRef.current = startDistance;
      mobilePinchGestureRef.current = {
        startDistance,
        startZoom: renderedStartZoom,
        startTrackWidth: renderedTrackWidth,
        // Geometry is authoritative here. React time can be one animation frame
        // behind a just-finished one-finger pan when the second finger lands.
        anchorTime: renderedAnchorTime,
        anchorTimeRatio: renderedAnchorTimeRatio,
        nextZoom: renderedStartZoom,
      };
      if (Math.abs((state?.currentTime ?? renderedAnchorTime) - renderedAnchorTime) > 0.001) {
        state?.seekTo(renderedAnchorTime);
      }
      mobilePinchActiveRef.current = true;
      event.preventDefault();
      event.stopPropagation();
    };
    const handlePointerMove = (event) => {
      if (!pinchPointers.has(event.pointerId)) return;
      pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!mobilePinchGestureRef.current) {
        if (!singleTouchPan || singleTouchPan.pointerId !== event.pointerId || singleTouchPan.interactive) return;
        const deltaX = event.clientX - singleTouchPan.startX;
        const deltaY = event.clientY - singleTouchPan.startY;
        if (Math.abs(deltaX) < 3 || Math.abs(deltaX) < Math.abs(deltaY)) return;
        event.preventDefault();
        event.stopPropagation();
        scrollElement.scrollLeft = singleTouchPan.startScrollLeft - deltaX;
        rulerViewportSyncRef.current?.();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      mobilePinchPendingDistanceRef.current = getPinchDistance();
      if (!mobilePinchFrameRef.current) mobilePinchFrameRef.current = window.requestAnimationFrame(applyPinchZoom);
    };
    const handlePointerEnd = (event) => {
      if (!pinchPointers.has(event.pointerId)) return;
      const wasPinching = Boolean(mobilePinchGestureRef.current);
      if (wasPinching) {
        event.preventDefault();
        event.stopPropagation();
      }
      pinchPointers.delete(event.pointerId);
      if (!wasPinching && singleTouchPan?.pointerId === event.pointerId) singleTouchPan = null;
      if (wasPinching && pinchPointers.size === 0) finishPinch();
    };

    scrollElement.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", handlePointerEnd, { capture: true });
    window.addEventListener("pointercancel", handlePointerEnd, { capture: true });
    return () => {
      scrollElement.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("pointerup", handlePointerEnd, { capture: true });
      window.removeEventListener("pointercancel", handlePointerEnd, { capture: true });
      if (mobilePinchFrameRef.current) window.cancelAnimationFrame(mobilePinchFrameRef.current);
      if (mobilePinchReleaseFrameRef.current) window.cancelAnimationFrame(mobilePinchReleaseFrameRef.current);
      pinchPointers.clear();
      mobilePinchGestureRef.current = null;
      mobilePinchActiveRef.current = false;
    };
  }, [mobileTrackBaseWidth, setTimelineZoom, timelineDuration, trackScrollRef]);
  useEffect(() => {
    const rulerViewport = rulerViewportRef.current;
    const scrollElement = trackScrollRef.current?.parentElement;
    if (!rulerViewport || !scrollElement) return undefined;

    let gesture = null;
    const handlePointerDown = (event) => {
      if (!window.matchMedia?.("(max-width: 760px)").matches || event.pointerType !== "touch") return;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: scrollElement.scrollLeft,
        scrolling: false,
      };
    };
    const handlePointerMove = (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (!gesture.scrolling) {
        if (Math.abs(deltaX) < 3 || Math.abs(deltaX) < Math.abs(deltaY)) return;
        gesture.scrolling = true;
      }
      event.preventDefault();
      event.stopPropagation();
      scrollElement.scrollLeft = gesture.startScrollLeft - deltaX;
      rulerViewportSyncRef.current?.();
    };
    const handlePointerEnd = (event) => {
      if (gesture?.pointerId !== event.pointerId) return;
      if (gesture.scrolling) {
        event.preventDefault();
        event.stopPropagation();
      }
      gesture = null;
    };

    rulerViewport.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", handlePointerEnd, { capture: true });
    window.addEventListener("pointercancel", handlePointerEnd, { capture: true });
    return () => {
      rulerViewport.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("pointerup", handlePointerEnd, { capture: true });
      window.removeEventListener("pointercancel", handlePointerEnd, { capture: true });
    };
  }, [trackScrollRef]);
  const renderAssetDropSlot = (track, laneIndex = -1) => {
    if (track === "image") return null;
    if (track === "overlay") {
      const targetLane = Math.max(0, (Number(assetDropPosition?.layer) || 1) - 1);
      if (assetDropTargetTrack !== "overlay" || laneIndex !== targetLane) return null;
      return (
        <div
          className="visual-overlay-drop-preview is-asset-drop-preview"
          style={{
            "--overlay-left": `${overlayAssetDropLeft}%`,
            "--overlay-width": `${overlayAssetDropWidth}%`,
          }}
        >
          <span><PictureInPicture size={12} />{assetDragPreview?.name || t("dropAsOverlay", "作为画中画")}</span>
        </div>
      );
    }
    const dropPercent = assetDropPosition?.track === track ? assetDropPosition.percent : 50;
    return assetDropTargetTrack === track ? <>
      {track !== "image" ? <i className="asset-drop-position-marker" style={{ "--drop-x": `${dropPercent}%` }} /> : null}
      <div
        className={`asset-drop-slot type-${assetDragPreview?.type || "asset"} mode-${track} ${
          assetDragPreview?.src ? "has-thumb" : ""
        }`}
        style={{ "--drop-x": `${dropPercent}%` }}
      >
        {assetDragPreview?.src ? (
          <div className="asset-drop-slot-thumb">
            {assetDragPreview.type === "video" ? (
              <video src={assetDragPreview.src} crossOrigin="anonymous" muted playsInline preload="metadata" draggable={false} />
            ) : assetDragPreview.type === "audio" ? (
              <span>{t("assetAudio")}</span>
            ) : (
              <img src={assetDragPreview.src} alt="" crossOrigin="anonymous" draggable={false} />
            )}
          </div>
        ) : null}
        <span>{track === "overlay" ? <><PictureInPicture size={12} />{t("dropAsOverlay", "作为画中画")}</> : track === "image" ? <><PlusCircle size={12} />{t("appendAfter", "添加到后面")}</> : t("dropSlot", "释放到这里")}</span>
        <strong>
          {track === "overlay" || track === "image"
            ? assetDragPreview?.name || (assetDragPreview?.type === "video" ? t("assetVideo") : t("assetImage"))
            : assetDragPreview?.type === "audio"
            ? t("assetAudio")
            : assetDragPreview?.type === "video"
              ? t("assetVideo")
              : assetDragPreview?.type === "sticker"
                ? t("assetSticker")
              : t("assetImage")}
        </strong>
      </div>
    </> : null;
  };
  const renderStickerTrack = (lane, laneIndex) =>
    showStickerTrack ? (
      <div
        key={`sticker-lane-${laneIndex}`}
        className={`sticker-track ${selectedTrack === "sticker" ? "is-selected" : ""} ${
          !isRowVisible("sticker") ? "is-track-disabled" : ""
        } ${trackLocks.sticker ? "is-track-locked" : ""} ${
          assetDropTargetTrack === "sticker" ? "is-drop-target" : ""
        } ${assetDropPulseTrack === "sticker" ? "is-drop-landing" : ""}`}
        onClick={(event) => selectTimelineTrackBackground(event, "sticker", "stickers")}
        onDragOver={(event) => handleTrackAssetDragOver(event, "sticker")}
        onDragLeave={(event) => handleTrackAssetDragLeave(event, "sticker")}
        onDrop={(event) => handleTrackAssetDrop(event, "sticker")}
        data-asset-drop-track="sticker"
        data-sticker-lane-index={laneIndex}
        aria-disabled={!isRowVisible("sticker")}
        inert={!isRowVisible("sticker") ? true : undefined}
        onContextMenu={(event) => showTrackContextMenu(event, "sticker")}
      >
        {assetDropTargetTrack === "sticker" ? (
          <div className="track-drop-hint">{t("dropStickerHere")}</div>
        ) : null}
        {lane.map((segment) => {
              const segmentLeft =
                timelineDuration > 0
                  ? Math.max(0, Math.min(100, ((segment.start || 0) / timelineDuration) * 100))
                  : 0;
              const segmentWidth =
                timelineDuration > 0
                  ? Math.max(0.4, Math.min(100 - segmentLeft, ((segment.duration || 0) / timelineDuration) * 100))
                  : 0;
              return (
                <button
                  className={`sticker-segment ${
                    segment.id === currentStickerSegment?.id ? "is-current" : ""
                  } ${segment.id === selectedStickerSegmentId ? "is-selected-segment" : ""} ${
                    stickerTimelineDrag?.segmentId === segment.id ? "is-timeline-dragging" : ""
                  }`}
                  type="button"
                  key={segment.id}
                  data-timeline-segment-track="sticker"
                  data-timeline-segment-id={segment.id}
                  data-range-selected={isRangeSelected("sticker", segment.id) || undefined}
                  style={{
                    "--sticker-left": `${segmentLeft}%`,
                    "--sticker-width": `${segmentWidth}%`,
                  }}
                  onPointerDown={(event) => startStickerSegmentMove(event, segment.id, laneIndex)}
                  onContextMenu={(event) => showTrackContextMenu(event, "sticker", segment.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressTimelineClipClickRef.current === segment.id) {
                      return;
                    }
                    setSelectedTrack("sticker");
                    activateStickerToolForClipSelection();
                    clearClipSelections("sticker");
                    setSelectedStickerSegmentId(segment.id);
                    seekTo(segment.start || 0);
                    ensureMobileTimedClipVisible(segment.id);
                    revealMobileClipActions("sticker");
                  }}
                >
                  <img src={segment.src} alt="" draggable={false} />
                  <span>{segment.name}</span>
                  <i className="sticker-resize-handle is-start" onPointerDown={(event) => startStickerSegmentResize(event, segment.id, "start")} />
                  <i className="sticker-resize-handle is-end" onPointerDown={(event) => startStickerSegmentResize(event, segment.id, "end")} />
                </button>
              );
            })}
        {stickerTimelineDrag?.lane === laneIndex && timelineDuration > 0 ? (
          <div
            className="sticker-drop-preview"
            data-testid="sticker-drop-preview"
            style={{
              "--sticker-drop-left": `${Math.max(0, Math.min(100, (stickerTimelineDrag.start / timelineDuration) * 100))}%`,
              "--sticker-drop-width": `${Math.max(0.4, Math.min(100, (stickerTimelineDrag.duration / timelineDuration) * 100))}%`,
            }}
          >
            {stickerTimelineDrag.src ? <img src={stickerTimelineDrag.src} alt="" /> : null}
            <span>{stickerTimelineDrag.name || t("assetSticker")}</span>
          </div>
        ) : null}
        {renderAssetDropSlot("sticker")}
      </div>
    ) : null;
  const renderOverlayTrack = (lane, laneIndex) => {
    const laneEnd = lane.reduce((end, segment) => Math.max(end, segment.start + segment.duration), 0);
    return (
    <div
      className={`visual-overlay-track ${selectedTrack === "overlay" ? "is-selected" : ""} ${!isOverlayLaneVisible(lane) ? "is-track-disabled" : ""} ${trackLocks.overlay ? "is-track-locked" : ""} ${assetDropTargetTrack === "overlay" ? "is-drop-target" : ""}`}
      key={`overlay-lane-${laneIndex}`}
      aria-disabled={!isOverlayLaneVisible(lane)}
      inert={!isOverlayLaneVisible(lane) ? true : undefined}
      onClick={(event) => selectTimelineTrackBackground(event, "overlay")}
      data-asset-drop-track="overlay"
      data-drop-start-time={laneEnd}
      data-drop-layer={laneIndex + 1}
      onDragLeave={(event) => handleTrackAssetDragLeave(event, "overlay")}
      onDragOver={(event) => handleTrackAssetDragOver(event, "overlay")}
      onDrop={(event) => handleTrackAssetDrop(event, "overlay")}
    >
      {lane.map((segment) => {
        const left = timelineDuration > 0 ? Math.max(0, Math.min(100, segment.start / timelineDuration * 100)) : 0;
        const width = timelineDuration > 0 ? Math.max(0.01, Math.min(100 - left, segment.duration / timelineDuration * 100)) : 0;
        const active = currentTime >= segment.start && currentTime < segment.start + segment.duration;
        const overlayFrames = segment.type === "video" && segment.trackFrames?.length
          ? getSampledVideoTrackFrames(segment.trackFrames, getTimelineThumbnailCount({ duration: segment.duration, timelineDuration, contentWidth: rulerViewport.contentWidth, timelineZoom: localTimelineZoom }), segment)
          : [];
        const overlayImageCount = segment.type !== "video"
          ? getImageTimelineThumbnailCount({ duration: segment.duration, timelineDuration, contentWidth: rulerViewport.contentWidth })
          : 1;
        const startOverlayEdit = (event, mode) => {
          if (trackLocks.overlay || !setVisualOverlaySegments) return;
          const isMobileTouch = event.pointerType === "touch" && window.matchMedia?.("(max-width: 760px)").matches;
          if (!isMobileTouch) event.preventDefault();
          event.stopPropagation();
          clearClipSelections("overlay"); setSelectedVisualOverlayId?.(segment.id); setSelectedTrack("overlay");
          // Keep horizontal timeline edits on the row where the gesture began.
          // Without a persisted preference, repacking moves a clip to the first
          // available row as soon as its overlap with another clip changes.
          if (!Number.isInteger(segment.lane) || segment.lane !== laneIndex) {
            setVisualOverlaySegments((items) => items.map((item) => item.id === segment.id
              ? { ...item, lane: laneIndex }
              : item));
          }
          const track = event.currentTarget.closest(".visual-overlay-track");
          if (!track) return;
          const startX = event.clientX; const startY = event.clientY; const initialStart = segment.start; const initialDuration = segment.duration; const initialLane = segment.lane; const initialLayer = segment.layer;
          const initialOverlayLaneState = new Map(visualOverlaySegments.map((item) => [item.id, { lane: item.lane, layer: item.layer }]));
          const sourceLaneHasOnlyDraggedClip = overlayLanes[laneIndex]?.length === 1;
          let latestClientX = startX; let latestClientY = startY;
          const autoScroller = createTimelineEdgeAutoScroller({
            trackElement: trackScrollRef.current,
            pointerType: event.pointerType,
            timelineDuration,
            onScrollFrame: (clientX, scrollOffset) => move({ clientX, clientY: latestClientY, preventDefault() {} }, scrollOffset),
          });
          const verticalAutoScroller = createTimelineVerticalEdgeAutoScroller({
            scrollElement: track.closest(".timeline-board"),
            pointerType: event.pointerType,
            onScrollFrame: (clientY) => move({ clientX: latestClientX, clientY, preventDefault() {} }),
          });
          const contentWidth = Math.max(1, track.getBoundingClientRect().width);
          const snapPoints = collectTimelineSnapPoints({
            timelineDuration,
            currentTime,
            visualSegments: displayedVisualSegments,
            visualOverlaySegments,
            captionSegments: displayedCaptionSegments,
            captionTargetDuration,
            stickerSegments,
            audioSegments,
            sourceAudioDuration,
            sourceAudioStart: sourceAudioStartPercent / 100 * timelineDuration,
            musicDuration,
            musicStart: musicStartPercent / 100 * timelineDuration,
            musicSegments,
          }, { track: "overlay", id: segment.id });
          let dragging = false; let promoteToMain = false; let mainInsertIndex = displayedVisualSegments.length; let dragLane = laneIndex;
          const move = (moveEvent, scrollOffset = autoScroller?.getScrollOffset() || 0) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            latestClientX = moveEvent.clientX;
            latestClientY = moveEvent.clientY;
            if (!dragging && isMobileTouch && Math.abs(deltaY) > Math.abs(deltaX)) return;
            if (!dragging && (mode === "move" ? Math.max(Math.abs(deltaX), Math.abs(deltaY)) : Math.abs(deltaX)) < 4) return;
            if (!dragging) {
              dragging = true;
              // A click must remain selection-only. Materialize the next empty
              // overlay row only after the pointer crosses the drag threshold.
              // Moving the sole clip in a lane reorders the existing lanes, so
              // its vacated lane already provides all required capacity.
              setOverlayDragLaneCount(overlayLanes.length + (sourceLaneHasOnlyDraggedClip ? 0 : 1));
              setTimelineHorizon?.((value) => Math.max(value, timelineDuration));
              if (isPlaying) handlePlayToggle();
            }
            moveEvent.preventDefault();
            autoScroller?.update(moveEvent.clientX);
            verticalAutoScroller?.update(moveEvent.clientY);
            const mainTrack = mode === "move" && !trackLocks.image
              ? document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.('[data-asset-drop-track="image"]')
              : null;
            promoteToMain = Boolean(mainTrack);
            if (promoteToMain) {
              const clips = Array.from(mainTrack.querySelectorAll('[data-timeline-segment-track="image"]'));
              mainInsertIndex = clips.findIndex((clip) => {
                const clipRect = clip.getBoundingClientRect();
                return moveEvent.clientX < clipRect.left + clipRect.width / 2;
              });
              if (mainInsertIndex < 0) mainInsertIndex = clips.length;
              setOverlayPromotionTarget({ segmentId: segment.id, insertIndex: mainInsertIndex });
            } else {
              setOverlayPromotionTarget(null);
            }
            if (promoteToMain) {
              setSnapGuide?.(null);
              return;
            }
            const dragClientX = autoScroller?.getDragClientX(moveEvent.clientX) ?? moveEvent.clientX;
            const delta = getTimelineDragTimeDelta({ clientX: dragClientX, startX, scrollOffset, contentWidth, timelineDuration });
            let nextStart = Math.max(0, Math.min(timelineDuration - initialDuration, initialStart + delta));
            let activeSnapGuide = null;
            if (mode === "move") {
              const snapped = snapTimelineRange(nextStart, initialDuration, snapPoints, (10 / contentWidth) * timelineDuration);
              nextStart = Math.max(0, Math.min(timelineDuration - initialDuration, snapped.start));
              activeSnapGuide = snapped.guide;
            } else {
              const movingValue = mode === "resize-start" ? nextStart : initialStart + initialDuration + delta;
              const snap = findClosestTimelineSnap(movingValue, snapPoints, (10 / contentWidth) * timelineDuration);
              activeSnapGuide = createTimelineSnapGuide(snap, mode === "resize-start" ? "start" : "end");
            }
            setSnapGuide?.(activeSnapGuide);
            if (mode === "move") {
              const targetTrack = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.(".visual-overlay-track");
              const targetLane = Number(targetTrack?.dataset.dropLayer) - 1;
              // This pointer handler closes over the lane list from the render
              // where the drag began. The trailing drop lane is mounted by the
              // state update above, so it is intentionally one index beyond
              // that snapshot and must be treated as an empty valid lane.
              const targetLaneSegments = targetLane === overlayLanes.length
                ? []
                : overlayLanes[targetLane];
              const nextEnd = nextStart + initialDuration;
              const targetHasRoom = Array.isArray(targetLaneSegments) && targetLaneSegments.every((item) => (
                item.id === segment.id
                || item.start + item.duration <= nextStart + 0.001
                || nextEnd <= item.start + 0.001
              ));
              if (sourceLaneHasOnlyDraggedClip && Number.isInteger(targetLane) && targetLane >= 0 && targetLane < overlayLanes.length) {
                const previousLane = dragLane;
                dragLane = targetLane;
                setVisualOverlaySegments((items) => reorderSingleVisualOverlayLane(items, segment.id, previousLane, targetLane)
                  .map((item) => item.id === segment.id ? { ...item, start: nextStart } : item));
                return;
              }
              if (targetHasRoom) dragLane = targetLane;
            }
            setVisualOverlaySegments((items) => items.map((item) => {
              if (item.id !== segment.id) return item;
              if (mode === "move") return { ...item, start: nextStart, lane: dragLane, layer: dragLane + 1 };
              if (mode === "resize-start") {
                const start = Math.max(0, Math.min(
                  initialStart + initialDuration - 0.1,
                  activeSnapGuide?.time ?? initialStart + delta,
                ));
                return { ...item, start, duration: initialDuration + initialStart - start };
              }
              const end = activeSnapGuide?.time ?? initialStart + initialDuration + delta;
              return { ...item, duration: Math.max(0.1, Math.min(timelineDuration - initialStart, end - initialStart)) };
            }));
          };
          const cleanup = (settle) => {
            verticalAutoScroller?.stop();
            setSnapGuide?.(null);
            if (!dragging) {
              autoScroller?.stop();
              setOverlayPromotionTarget(null);
              setOverlayDragLaneCount(0);
              settle?.();
            } else {
              settleTimelineDrag(autoScroller, {
                active: dragging,
                setTimelineHorizon,
                settle: () => {
                  setOverlayPromotionTarget(null);
                  setOverlayDragLaneCount(0);
                  settle?.();
                },
              });
            }
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", cancel);
          };
          const cancel = () => {
            cleanup(() => {
              setVisualOverlaySegments((items) => items.map((item) => {
                const initialLaneState = initialOverlayLaneState.get(item.id);
                if (item.id === segment.id) {
                  return { ...item, start: initialStart, duration: initialDuration, lane: initialLane, layer: initialLayer };
                }
                return initialLaneState ? { ...item, ...initialLaneState } : item;
              }));
            });
          };
          const end = () => {
            const didDrag = dragging;
            cleanup(() => {
              if (!didDrag) return;
              if (!promoteToMain) {
                setVisualOverlaySegments((items) => compactVisualOverlayLanes(items));
                return;
              }
              const promoted = createMainVisualFromOverlay(segment);
              if (!promoted) return;
              setVisualOverlaySegments((items) => compactVisualOverlayLanes(items.filter((item) => item.id !== segment.id)));
              setVisualSegments((items) => {
                const next = [...items];
                next.splice(Math.max(0, Math.min(next.length, mainInsertIndex)), 0, promoted);
                return next;
              });
              clearClipSelections("visual");
              setSelectedVisualSegmentId(promoted.id);
              setSelectedTrack("image");
            });
          };
          window.addEventListener("pointermove", move, { passive: false });
          window.addEventListener("pointerup", end, { once: true });
          window.addEventListener("pointercancel", cancel, { once: true });
        };
        return <div className={`visual-overlay-clip ${segment.type === "video" ? "is-video" : "is-image"} ${active ? "is-current" : ""} ${segment.id === selectedVisualOverlayId ? "is-selected-segment" : ""}`} role="button" tabIndex={0} key={segment.id} data-timeline-segment-track="overlay" data-timeline-segment-id={segment.id} data-range-selected={isRangeSelected("overlay", segment.id) || undefined} style={{ "--overlay-left": `${left}%`, "--overlay-width": `${width}%` }} onPointerDown={(event) => startOverlayEdit(event, "move")} onContextMenu={(event) => showTrackContextMenu(event, "overlay", segment.id)} onClick={(event) => {
          event.stopPropagation();
          clearClipSelections("overlay");
          setSelectedVisualOverlayId?.(segment.id);
          setSelectedTrack("overlay");
          ensureMobileTimedClipVisible(segment.id);
          revealMobileClipActions("overlay");
        }} onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          clearClipSelections("overlay");
          setSelectedVisualOverlayId?.(segment.id);
          setSelectedTrack("overlay");
          ensureMobileTimedClipVisible(segment.id);
          revealMobileClipActions("overlay");
        }}>
          <div className="visual-overlay-thumbnails">
            {segment.type === "video"
              ? overlayFrames.length
                ? overlayFrames.map((frame, frameIndex) => <img src={getVideoTrackFrameSource(frame)} alt="" crossOrigin="anonymous" draggable={false} key={`${segment.id}-overlay-frame-${frameIndex}`} />)
                : <video src={segment.src} crossOrigin="anonymous" muted playsInline preload="metadata" />
              : Array.from({ length: overlayImageCount }, (_, thumbnailIndex) => <img src={segment.src} alt="" crossOrigin="anonymous" draggable={false} key={`${segment.id}-overlay-image-${thumbnailIndex}`} />)}
          </div>
          {segment.type === "video" ? <button className="clip-mute-toggle" type="button" aria-label={t(segment.muted ? "unmuteClip" : "muteClip", segment.muted ? "取消静音" : "静音")} title={t(segment.muted ? "unmuteClip" : "muteClip", segment.muted ? "取消静音" : "静音")} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (trackLocks.overlay) return void notify("画中画轨已锁定，无法切换静音"); setVisualOverlaySegments((items) => items.map((item) => item.id === segment.id ? { ...item, muted: !item.muted } : item)); }}>{segment.muted ? <SpeakerSlash size={13} /> : <SpeakerHigh size={13} />}</button> : null}
          <span>{segment.name || t("overlayTrack", "Overlay")}</span>
          <i className="visual-overlay-resize is-start" onPointerDown={(event) => startOverlayEdit(event, "resize-start")} />
          <i className="visual-overlay-resize is-end" onPointerDown={(event) => startOverlayEdit(event, "resize-end")} />
        </div>;
      })}
      {laneIndex === activeTimelineClipDrag?.overlayLane && activeTimelineClipDrag.overlayDropAllowed && draggingVisualSegment ? (
        <div
          className="visual-overlay-drop-preview"
          style={{
            "--overlay-left": `${timelineDuration > 0 ? Math.max(0, Math.min(100, (activeTimelineClipDrag.overlayStart / timelineDuration) * 100)) : 0}%`,
            "--overlay-width": `${timelineDuration > 0 ? Math.max(0.01, Math.min(100, (draggingVisualSegment.duration / timelineDuration) * 100)) : 0}%`,
          }}
        >
          <span>{t("dropAsOverlay", "作为画中画")}</span>
        </div>
      ) : null}
      {!lane.length ? <div className="track-drop-hint">{t("dropAsOverlay", "作为画中画")}</div> : null}
      {renderAssetDropSlot("overlay", laneIndex)}
    </div>
  );
  };

  return (
    <section
      className={`timeline is-selection-mode-${timelineSelectionMode} ${timelineRangeDrag?.dragging ? "is-range-dragging" : ""}`}
      style={{ "--range-drag-x": `${timelineRangeDrag?.dragging ? timelineRangeDrag.delta / Math.max(0.001, timelineDuration) * Math.max(1, rulerViewport.contentWidth) : 0}px` }}
      onClickCapture={(event) => {
        if (!timelineRangeDragClickGuardRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        timelineRangeDragClickGuardRef.current = "";
      }}
      onPointerDownCapture={(event) => {
      if (!(event.target instanceof Element)) return;
      // A real follow-up pointer gesture is intentional user input, so it
      // ends the one-shot guard reserved for the synthetic click after drag.
      if (timelineRangeDragClickGuardRef.current && !timelineRangeDrag) {
        timelineRangeDragClickGuardRef.current = "";
      }
      const isMobileTimeline = window.matchMedia?.("(max-width: 760px)").matches;
      const fineEditModeActive = ["edit-point", "slip", "slide"].includes(timelineSelectionMode);
      const desktopPressedSegment = (!isMobileTimeline || fineEditModeActive)
        ? event.target.closest("[data-timeline-segment-track]")
        : null;
      if (
        desktopPressedSegment?.dataset.timelineSegmentTrack === "image"
        && fineEditModeActive
      ) {
        const index = Number(desktopPressedSegment.dataset.timelineSegmentIndex);
        if (timelineSelectionMode === "edit-point") selectVisualEditPoint(event, index);
        else startVisualFineEdit(event, index, timelineSelectionMode);
        return;
      }
      if (desktopPressedSegment && fineEditModeActive) {
        event.preventDefault();
        event.stopPropagation();
        notify(t("fineEditMainTrackOnly", "精剪工具仅作用于主画面轨"));
        return;
      }
      if (
        desktopPressedSegment
        && timelineSelectionMode === "select"
        && startTimelineRangeDrag(
          event,
          desktopPressedSegment.dataset.timelineSegmentTrack,
          desktopPressedSegment.dataset.timelineSegmentId,
          { toggleOnClick: event.shiftKey },
        )
      ) return;
      if (desktopPressedSegment && timelineSelectionMode === "select" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleTimelineClipInSelection(
          desktopPressedSegment.dataset.timelineSegmentTrack,
          desktopPressedSegment.dataset.timelineSegmentId,
        );
        return;
      }
      if (desktopPressedSegment && ["left", "right"].includes(timelineSelectionMode)) {
        event.preventDefault();
        event.stopPropagation();
        selectTimelineRangeFromClip(
          desktopPressedSegment.dataset.timelineSegmentTrack,
          desktopPressedSegment.dataset.timelineSegmentId,
        );
        return;
      }
      if (desktopPressedSegment && timelineRangeSelection.size) setTimelineRangeSelection(new Set());
      if (!isMobileTimeline) return;
      const pressedSegment = event.target.closest("[data-timeline-segment-track]");
      if (pressedSegment?.dataset.timelineSegmentTrack) {
        setMobileClipActionTrack(pressedSegment.dataset.timelineSegmentTrack);
        setMobileClipActionsVisible(true);
      } else if (event.target.closest(".track-scroll, .track-labels, .timeline-ruler-viewport")) {
        setMobileClipActionsVisible(false);
        setMobileClipActionTrack("");
        if (
          event.target.closest(".track-scroll, .timeline-ruler-viewport")
          && !event.target.closest("[data-timeline-segment-track], button, [role='slider']")
        ) {
          clearTimelineClipFocus();
        }
      }
    }}>
      <div className="timeline-tools">
        <div className="timeline-icon-group">
          <IconButton label={t("undo")} shortcut={`${shortcutModifier}+Z`} tooltip releaseFocusOnPointer onClick={undo}>
            <ArrowCounterClockwise size={17} />
          </IconButton>
          <IconButton label={t("redo")} shortcut={`${shortcutModifier}+Shift+Z`} tooltip releaseFocusOnPointer onClick={redo}>
            <ArrowClockwise size={17} />
          </IconButton>
          <IconButton label={t("deleteTrack")} shortcut="Delete / Backspace" tooltip releaseFocusOnPointer onClick={handleDeleteTrack}>
            <Trash size={17} />
          </IconButton>
          <IconButton label={t("duplicateTrack")} shortcut={`${shortcutModifier}+D`} tooltip releaseFocusOnPointer onClick={handleDuplicateTrack}>
            <CopySimple size={17} />
          </IconButton>
          <IconButton label={t("cutSegment")} shortcut={`${shortcutModifier}+B`} tooltip releaseFocusOnPointer onClick={handleCutTrack}>
            <Scissors size={17} />
          </IconButton>
          <IconButton
            label={t(rippleEditing ? "rippleEditingOn" : "rippleEditingOff")}
            tooltip
            releaseFocusOnPointer
            active={rippleEditing}
            onClick={() => {
              const next = !rippleEditing;
              setRippleEditing(next);
              notify(t(next ? "rippleEditingEnabled" : "rippleEditingDisabled"));
            }}
          >
            <ArrowFatLinesLeft size={17} weight={rippleEditing ? "fill" : "regular"} />
          </IconButton>
          <div className={`timeline-selection-tool ${timelineSelectionMenuOpen ? "is-open" : ""}`}>
            <button
              ref={timelineSelectionTriggerRef}
              type="button"
              className={`timeline-selection-trigger ${timelineSelectionMode !== "select" ? "is-active" : ""}`}
              aria-label={t("timelineSelectionTools", "选择工具")}
              data-tooltip={`${t("timelineSelectionTools", "选择工具")} · [ / ]`}
              aria-haspopup="menu"
              aria-expanded={timelineSelectionMenuOpen}
              onClick={(event) => {
                setTimelineSelectionMenuOpen((open) => !open);
                releasePointerActivatedFocus(event);
              }}
            >
              {timelineSelectionMode === "left"
                ? <ArrowLineLeft size={17} weight="bold" />
                : timelineSelectionMode === "right"
                  ? <ArrowLineRight size={17} weight="bold" />
                  : timelineSelectionMode === "edit-point"
                    ? <ArrowsInLineHorizontal size={17} weight="bold" />
                    : timelineSelectionMode === "slip"
                      ? <Crop size={17} weight="bold" />
                      : timelineSelectionMode === "slide"
                        ? <ArrowsOutLineHorizontal size={17} weight="bold" />
                        : <CursorClick size={17} />}
              <CaretDown size={11} weight="bold" />
            </button>
            {timelineSelectionMenuOpen && typeof document !== "undefined" ? createPortal((
              <div
                className="timeline-selection-menu"
                role="menu"
                style={{
                  left: timelineSelectionTriggerRef.current?.getBoundingClientRect().left ?? 0,
                  top: (timelineSelectionTriggerRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
                }}
              >
                {[
                  ["select", CursorClick, t("timelineSelect", "选择")],
                  ["edit-point", ArrowsInLineHorizontal, t("timelineEditPoint", "编辑点选择")],
                  ["slip", Crop, t("timelineSlip", "滑移")],
                  ["slide", ArrowsOutLineHorizontal, t("timelineSlide", "滑动")],
                  ["left", ArrowLineLeft, t("timelineSelectLeft", "向左全选")],
                  ["right", ArrowLineRight, t("timelineSelectRight", "向右全选")],
                ].map(([mode, Icon, label]) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={timelineSelectionMode === mode}
                    className={timelineSelectionMode === mode ? "is-selected" : ""}
                    key={mode}
                    onClick={() => {
                      setTimelineSelectionMode(mode);
                      if (mode !== "edit-point") setSelectedEditPointIndex(-1);
                      setTimelineRangeSelection(new Set());
                      setTimelineSelectionMenuOpen(false);
                    }}
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            ), document.body) : null}
          </div>
          <IconButton
            label={t(allBatchCaptionsLinked ? "captionUnlinkAudio" : "captionLinkAudio")}
            tooltip
            releaseFocusOnPointer
            active={allBatchCaptionsLinked}
            disabled={!batchLinkableCaptions.length}
            onClick={allBatchCaptionsLinked ? unlinkAllCaptionAudio : linkAllCaptionAudio}
          >
            {allBatchCaptionsLinked ? <LinkBreak size={17} weight="bold" /> : <LinkSimple size={17} weight="bold" />}
          </IconButton>
        </div>
        <div className="timeline-segment-tools">
          <button className="timeline-play-button" type="button" disabled={!canPreview} onClick={(event) => { handlePlayToggle(); releasePointerActivatedFocus(event); }}>
            {isPlaying ? <Pause size={17} weight="fill" /> : <Play size={17} weight="fill" />}
            {isPlaying ? t("pause") : t("play")}
            <kbd>Space</kbd>
          </button>
          <button type="button" onClick={handleAddSegment}>
            <PlusCircle size={17} />
            {t("addSegment")}
          </button>
          <button type="button" onClick={handleRemoveSegment}>
            <MinusCircle size={17} />
            {t("removeSegment")}
          </button>
          <IconButton label={t("shortenSegment")} tooltip releaseFocusOnPointer onClick={() => adjustSelectedSegmentWeight(-0.5)}>
            <ArrowsInLineHorizontal size={18} />
          </IconButton>
          <IconButton label={t("lengthenSegment")} tooltip releaseFocusOnPointer onClick={() => adjustSelectedSegmentWeight(0.5)}>
            <ArrowsOutLineHorizontal size={18} />
          </IconButton>
        </div>
        <div className="timeline-icon-group">
          <IconButton label={t("zoomOut")} shortcut="−" tooltip releaseFocusOnPointer onClick={() => adjustTimelineZoom((zoom) => zoom / TIMELINE_BUTTON_ZOOM_RATIO)}>
            <MagnifyingGlassMinus size={17} />
          </IconButton>
          <span ref={zoomReadoutRef} className="zoom-readout" data-testid="timeline-zoom-readout">{zoomReadout}</span>
          <IconButton
            label={t("fitTimeline")}
            shortcut="Shift+Z"
            tooltip
            releaseFocusOnPointer
            active={Math.abs(localTimelineZoom - fitTimelineZoom) < 0.001}
            onClick={() => adjustTimelineZoom(fitTimelineZoom)}
          >
            <MonitorPlay size={17} />
          </IconButton>
          <IconButton label={t("zoomIn")} shortcut="+" tooltip releaseFocusOnPointer onClick={() => adjustTimelineZoom((zoom) => zoom * TIMELINE_BUTTON_ZOOM_RATIO)}>
            <MagnifyingGlassPlus size={17} />
          </IconButton>
        </div>
      </div>

      <div className="mobile-fixed-playhead" aria-hidden="true" />

      <div className="timeline-board">
        <div className="track-labels-ruler-spacer" aria-hidden="true" />
        <div ref={rulerViewportRef} className="timeline-ruler-viewport">
          <div
            ref={rulerCanvasRef}
            className="timeline-ruler-canvas"
            style={{ width: localTrackWidth }}
          >
            <div className="ruler" onPointerDown={(event) => {
              if (window.matchMedia?.("(max-width: 760px)").matches && event.pointerType === "touch") return;
              handleTimelineSurfacePointerDown(event);
            }}>
              {rulerTicks.map((tick) => (
                <span
                  className={`ruler-tick ${tick.isMajor ? "is-major" : "is-minor"}`}
                  key={tick.id}
                  style={{ left: `${tick.left}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
            <div
              className="playhead-ruler"
              style={{ left: `${playheadPercent}%` }}
              onPointerDown={handlePlayheadPointerDown}
            />
            {snapGuide && timelineDuration > 0 ? (
              <div
                className={`snap-guide-ruler ${snapGuide.time / timelineDuration > 0.82 ? "is-near-end" : ""}`}
                aria-hidden="true"
                style={{
                  left: `${Math.max(0, Math.min(100, (snapGuide.time / timelineDuration) * 100))}%`,
                }}
              >
                <span>{snapGuide.label}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="track-labels" style={{ gridTemplateRows: timelineLabelRows }}>
          {timelineTrackLabels.map(([track, label, rowId = track, visibilityKey = track, lockKey = track]) => {
            const rowVisible = getTimelineRowVisibility(track, visibilityKey);
            const rowLocked = isTimelineRowLocked(track, lockKey);
            return (
              <div
                className={`${selectedTrack === track && rowVisible ? "is-selected" : ""} ${
                  !rowVisible ? "is-track-disabled" : ""
                } ${rowLocked ? "is-track-locked" : ""}`}
                key={rowId}
                onContextMenu={rowVisible ? (event) => showTrackContextMenu(event, track, "", visibilityKey, lockKey) : undefined}
              >
              <button
                type="button"
                aria-label={`${label} ${t("visible")}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTimelineRowVisibility(track, visibilityKey);
                }}
              >
                {getTimelineRowVisibility(track, visibilityKey) ? <Eye size={15} /> : <EyeSlash size={15} />}
              </button>
              <button
                type="button"
                aria-label={`${label} ${t("lock")}`}
                aria-pressed={rowLocked}
                disabled={!rowVisible}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTimelineRowLock(track, lockKey);
                }}
              >
                {rowLocked ? <LockKey size={15} /> : <LockKeyOpen size={15} />}
              </button>
              <button className="track-name-button" type="button" disabled={!rowVisible} onClick={() => setSelectedTrack(track)}>
                {label}
              </button>
              </div>
            );
          })}
        </div>

        <div className="tracks">
          <div
            ref={trackScrollRef}
            className="track-scroll"
            style={{ width: localTrackWidth, "--timeline-zoom": localTimelineZoom, gridTemplateRows: timelineTrackRows }}
            onPointerDown={(event) => {
              if (
                event.target.closest(
                  "button, .image-clip, .caption-segment, .sticker-track, .sticker-segment, .audio-track, .waveform-strip",
                )
              ) {
                return;
              }
              handleTimelineSurfacePointerDown(event);
            }}
          >
            <div
              className="playhead"
              role="slider"
              aria-label={t("dragPlayhead")}
              aria-valuemin={0}
              aria-valuemax={Math.round(timelineDuration)}
              aria-valuenow={Math.round(currentTime)}
              style={{ left: `${playheadPercent}%` }}
              onPointerDown={handlePlayheadPointerDown}
            />
            {snapGuide && timelineDuration > 0 ? (
              <div
                className="snap-guide"
                data-target-track={snapGuide.targetTrack || undefined}
                data-target-edge={snapGuide.targetEdge || undefined}
                data-moving-edge={snapGuide.movingEdge || undefined}
                style={{
                  left: `${Math.max(0, Math.min(100, (snapGuide.time / timelineDuration) * 100))}%`,
                }}
              />
            ) : null}
            <div
              className={`image-track ${selectedTrack === "image" ? "is-selected" : ""} ${
                !trackVisibility.image ? "is-track-disabled" : ""
              } ${trackLocks.image ? "is-track-locked" : ""} ${
                assetDropTargetTrack === "image" || assetDropTargetTrack === "overlay" || overlayPromotionTarget ? `is-drop-target is-drop-${overlayPromotionTarget ? "image" : assetDropTargetTrack}` : ""
              } ${assetDropPulseTrack === "image" ? "is-drop-landing" : ""} ${
                activeTimelineClipDrag?.track === "image" ? "is-reordering" : ""
              }`}
              aria-disabled={!trackVisibility.image}
              inert={!trackVisibility.image ? true : undefined}
              onClick={(event) => selectTimelineTrackBackground(event, "image")}
              onDragLeave={(event) => handleTrackAssetDragLeave(event, "image")}
              onDragOver={(event) => {
                if (event.dataTransfer?.types.includes("application/x-timeline-visual-style")) event.preventDefault();
                else handleTrackAssetDragOver(event, "image");
              }}
              onDrop={(event) => handleVisualStyleDrop(event)}
              data-asset-drop-track="image"
              data-timeline-reorder-track="image"
              onContextMenu={(event) => showTrackContextMenu(event, "image")}
            >
              {assetDropTargetTrack === "image" || assetDropTargetTrack === "overlay" ? (
                <div className="track-drop-hint">{assetDropTargetTrack === "overlay" ? t("dropAsOverlay", "作为画中画") : t("appendAfter", "添加到后面")}</div>
              ) : null}
              {!imageSrc ? (
                <button
                  className="mobile-empty-visual-entry"
                  type="button"
                  aria-label={t("mobileAddMedia", "添加素材")}
                  onClick={(event) => {
                    event.stopPropagation();
                    openMobileFilePicker?.();
                  }}
                >
                  <PlusCircle size={20} weight="bold" />
                  <span>{t("mobileAddMedia", "添加素材")}</span>
                </button>
              ) : null}
              {imageSrc
                ? displayedVisualSegments.map((segment, index) => {
                    const segmentSrc = segment.src || imageSrc;
                    const segmentType = segment.type || visualType;
                    const segmentWidth =
                      timelineDuration > 0
                        ? Math.max(0.01, Math.min(100, (segment.duration / timelineDuration) * 100))
                        : 0;
                    const segmentRange = renderedVisualTimeline[index];
                    const isCurrentVisualSegment =
                      segment.id === currentVisualSegment?.id ||
                      (currentTime >= (segmentRange?.start ?? 0) && currentTime < (segmentRange?.end ?? 0));
                    const isSelectedVisualSegment = segment.id === selectedVisualSegmentId;
                    const isDraggingVisualSegment =
                      activeTimelineClipDrag?.track === "image" &&
                      activeTimelineClipDrag.segmentId === segment.id;
                    const isReorderTarget =
                      activeTimelineClipDrag?.track === "image" &&
                      activeTimelineClipDrag.overIndex === index &&
                      !isDraggingVisualSegment;
                    const isOverlayPromotionInsertTarget = Boolean(
                      overlayPromotionTarget && overlayPromotionTarget.insertIndex === index,
                    );
                    const isAssetInsertTarget = mainAssetInsertIndex === index;
                    const promotionOverlay = isOverlayPromotionInsertTarget
                      ? visualOverlaySegments.find((item) => item.id === overlayPromotionTarget.segmentId)
                      : null;
                    const promotionGapWidth = timelineDuration > 0
                      ? Math.max(0.01, Math.min(100, ((promotionOverlay?.duration || 0.5) / timelineDuration) * 100))
                      : 0;
                    const videoTrackFrames = Array.isArray(segment.trackFrames) ? segment.trackFrames : [];
                    const isPortraitVideo = segmentType === "video" && (segment.height || 0) > (segment.width || 0);
                    const desiredVideoFrameCount = getTimelineThumbnailCount({
                      duration: segment.duration,
                      timelineDuration,
                      contentWidth: rulerViewport.contentWidth,
                      timelineZoom: localTimelineZoom,
                      maxThumbnails: VIDEO_THUMBNAIL_DISPLAY_MAX_COUNT,
                    });
                    const sampledVideoFrames = segmentType === "video"
                      ? videoTrackFrames.length
                        ? getSampledVideoTrackFrames(videoTrackFrames, desiredVideoFrameCount, segment)
                        : segment.thumbnail
                          ? Array.from({ length: desiredVideoFrameCount }, () => segment.thumbnail)
                          : []
                      : [];
                    const visibleVideoFrames = sampledVideoFrames.slice();
                    if (segmentType === "video" && isCurrentVisualSegment && visibleVideoFrames.length && segmentRange) {
                      const localTime = Math.max(0, Math.min(Number(segment.duration) || 0, currentTime - segmentRange.start));
                      const activeFrameIndex = Math.min(
                        visibleVideoFrames.length - 1,
                        Math.floor(localTime / Math.max(0.001, Number(segment.duration) || 0.001) * visibleVideoFrames.length),
                      );
                      const expectedSourceTime = getVisualSourceTime(segment, localTime);
                      const exactFrame = getVideoTrackFrameAtSourceTime(
                        videoTrackFrames,
                        expectedSourceTime,
                        Number(segment.trackFrameDuration) || Number(segment.sourceDuration) || Number(segment.duration) || 0,
                      );
                      const livePlayheadFrame = playheadTrackFrame?.segmentId === segment.id
                        && Math.abs(playheadTrackFrame.timelineTime - currentTime) <= PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS
                        && Math.abs(playheadTrackFrame.sourceTime - expectedSourceTime) <= PLAYHEAD_FRAME_SYNC_TOLERANCE_SECONDS
                        ? playheadTrackFrame.frame
                        : null;
                      if (livePlayheadFrame || exactFrame) visibleVideoFrames[activeFrameIndex] = livePlayheadFrame || exactFrame;
                    }
                    return (
                      <div
                        key={segment.id}
                        role="button"
                        tabIndex={0}
                        data-timeline-segment-track="image"
                        data-timeline-segment-index={index}
                        data-timeline-segment-id={segment.id}
                        data-range-selected={isRangeSelected("image", segment.id) || undefined}
                        data-placeholder={t("dropSlot", "放置位置")}
                        style={{
                          "--image-clip-width": `${segmentWidth}%`,
                          "--promotion-gap-width": `${promotionGapWidth}%`,
                          "--asset-insert-gap-width": `${mainAssetInsertWidth}%`,
                        }}
                        className={`image-clip ${segmentType === "video" ? "is-video" : ""} ${
                          isCurrentVisualSegment ? "is-current" : ""
                        } ${isSelectedVisualSegment ? "is-selected-segment" : ""} ${
                          isDraggingVisualSegment ? "is-reorder-dragging" : ""
                        } ${isReorderTarget ? "is-reorder-target" : ""} ${
                          isOverlayPromotionInsertTarget ? "is-overlay-promotion-insert-target" : ""
                        } ${isAssetInsertTarget ? "is-asset-insert-target" : ""
                        } ${segment.preparing ? "is-preparing" : ""} ${
                          activeFineEdit?.index === index ? `is-fine-editing is-fine-editing-${activeFineEdit.mode}` : ""
                        } ${selectedEditPointIndex === index ? "has-selected-edit-point" : ""}`}
                        onPointerDown={(event) => {
                          if (!segment.preparing) startTimelineClipDrag(event, "image", segment.id, index);
                        }}
                        onContextMenu={(event) => showTrackContextMenu(event, "image", segment.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressTimelineClipClickRef.current === segment.id) {
                            return;
                          }
                          setSelectedTrack("image");
                          clearClipSelections("visual");
                          setSelectedVisualSegmentId(segment.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedTrack("image");
                            clearClipSelections("visual");
                            setSelectedVisualSegmentId(segment.id);
                          }
                        }}
                      >
                        {segment.preparing ? (
                          <div className="timeline-media-preparing" aria-live="polite">
                            <i className="timeline-media-spinner" />
                            <strong>{segment.prepareStage === "download"
                              ? t("remoteAssetDownloading", "正在下载在线素材…")
                              : t("timelineMediaPreparing", "正在准备素材")}</strong>
                            <em>{Math.round((segment.prepareProgress || 0) * 100)}%</em>
                          </div>
                        ) : segmentType === "video" ? (
                          <button
                            className="clip-mute-toggle"
                            type="button"
                            aria-label={t(segment.sourceAudioDisabled ? "unmuteClip" : "muteClip", segment.sourceAudioDisabled ? "取消静音" : "静音")}
                            title={t(segment.sourceAudioDisabled ? "unmuteClip" : "muteClip", segment.sourceAudioDisabled ? "取消静音" : "静音")}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (trackLocks.image) return void notify("图片轨已锁定，无法切换静音");
                              setVisualSegments((items) => items.map((item) => item.id === segment.id ? { ...item, sourceAudioDisabled: !item.sourceAudioDisabled } : item));
                            }}
                          >
                            {segment.sourceAudioDisabled ? <SpeakerSlash size={13} /> : <SpeakerHigh size={13} />}
                          </button>
                        ) : null}
                        {!segment.preparing ? <div
                          className={`image-thumbnails ${segmentType === "video" ? "is-video" : ""} ${
                            isPortraitVideo ? "is-portrait-video" : ""
                          }`}
                          style={{
                            "--thumbnail-cell-width": `${IMAGE_THUMBNAIL_TARGET_WIDTH}px`,
                            "--video-thumbnail-count": Math.max(1, visibleVideoFrames.length),
                          }}
                        >
                          {segmentType === "video" ? (
                            visibleVideoFrames.length ? (
                              visibleVideoFrames.map((frame, frameIndex) => (
                                <img
                                  src={getVideoTrackFrameSource(frame)}
                                  alt=""
                                  crossOrigin="anonymous"
                                  draggable={false}
                                  key={`${segment.id}-frame-${frameIndex}`}
                                />
                              ))
                            ) : (
                              <video src={segmentSrc} crossOrigin="anonymous" muted playsInline preload="metadata" draggable={false} />
                            )
                          ) : (
                            Array.from(
                              {
                                length: Math.max(
                                  1,
                                  getImageTimelineThumbnailCount({
                                    duration: segment.duration || IMAGE_SEGMENT_SECONDS,
                                    timelineDuration,
                                    contentWidth: rulerViewport.contentWidth,
                                  }),
                                ),
                              },
                              (_, thumbnailIndex) => (
                                <img src={segmentSrc} alt="" crossOrigin="anonymous" draggable={false} key={thumbnailIndex} />
                              ),
                            )
                          )}
                        </div> : null}
                        {!segment.preparing && segment.speedCurve?.enabled ? (
                          <span className="image-clip-speed-markers" aria-label={t("visualSpeedCurveTitle", "速度曲线")}>
                            {normalizeVisualSpeedCurve(segment.speedCurve).points.slice(1, -1).map((point) => (
                              <i key={point.id} style={{ left: `${point.progress * 100}%` }} />
                            ))}
                          </span>
                        ) : null}
                        {!segment.preparing ? <span className="image-clip-duration">{formatClock(segment.duration)}</span> : null}
                        {!segment.preparing && activeFineEdit?.index === index ? (
                          <span className="fine-edit-readout">
                            {t(activeFineEdit.mode === "slip" ? "timelineSlip" : "timelineSlide", activeFineEdit.mode === "slip" ? "滑移" : "滑动")}
                            {activeFineEdit.delta >= 0 ? "+" : ""}{activeFineEdit.delta.toFixed(2)}s
                          </span>
                        ) : null}
                        {!segment.preparing && !activeTimelineClipDrag ? <>
                          {index > 0 ? (
                            <button
                              className="image-resize-handle is-start"
                              type="button"
                              aria-label={t("dragImageStart", "调整画面片段起点")}
                              aria-pressed={selectedEditPointIndex === index}
                              onPointerDown={(event) => startImageResize(event, segment.id, index, "start")}
                            />
                          ) : null}
                          <button
                            className="image-resize-handle is-end"
                            type="button"
                            aria-label={t("dragImageDuration")}
                            onPointerDown={(event) => startImageResize(event, segment.id, index, "end")}
                          />
                        </> : null}
                      </div>
                    );
                  })
                : null}
              {mainAssetInsertIndex >= 0 ? (
                <div
                  className="main-track-drop-preview is-asset-insert-preview"
                  style={{
                    "--main-drop-left": `${timelineDuration > 0 ? Math.max(0, Math.min(100, mainAssetInsertTime / timelineDuration * 100)) : 0}%`,
                    "--main-drop-width": `${mainAssetInsertWidth}%`,
                  }}
                >
                  <span><PlusCircle size={12} />{t("insertHere", "插入到此处")}</span>
                </div>
              ) : null}
              {overlayPromotionTarget ? (() => {
                const insertIndex = Math.max(0, Math.min(displayedVisualSegments.length, overlayPromotionTarget.insertIndex));
                const insertTime = insertIndex < renderedVisualTimeline.length
                  ? renderedVisualTimeline[insertIndex]?.start || 0
                  : renderedVisualTimeline.at(-1)?.end || 0;
                const overlay = visualOverlaySegments.find((item) => item.id === overlayPromotionTarget.segmentId);
                return (
                  <div
                    className="main-track-drop-preview"
                    style={{
                      "--main-drop-left": `${timelineDuration > 0 ? Math.max(0, Math.min(100, insertTime / timelineDuration * 100)) : 0}%`,
                      "--main-drop-width": `${timelineDuration > 0 ? Math.max(0.01, Math.min(100, (overlay?.duration || 0.5) / timelineDuration * 100)) : 0}%`,
                    }}
                  >
                    <span>{t("dropSlot", "放置位置")}</span>
                  </div>
                );
              })() : null}
              {displayedVisualSegments.slice(0, -1).map((segment, index) => {
                const range = renderedVisualTimeline[index];
                const transition = segment.transition || { id: "none", duration: 0.5 };
                const insertionPreviewOffset = mainAssetInsertIndex >= 0 && index >= mainAssetInsertIndex
                  ? mainAssetInsertDuration
                  : 0;
                return (
                  <button
                    className={`visual-junction ${transition.id !== "none" ? "has-transition" : ""}`}
                    key={`junction-${segment.id}`}
                    type="button"
                    aria-label={`${t("transition")}: ${trOption(TRANSITIONS.find((item) => item.id === transition.id)?.name || "无转场")}`}
                    title={t("transitionSettings")}
                    style={{ left: `${(((range?.end || 0) + insertionPreviewOffset) / Math.max(0.01, timelineDuration)) * 100}%` }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setTransitionEditor({ index, x: rect.left + rect.width / 2, y: rect.top });
                    }}
                  ><span>◇</span></button>
                );
              })}
              {renderAssetDropSlot("image")}
              {renderAssetDropSlot("overlay")}
            </div>
            {overlayLanes.map((lane, laneIndex) => renderOverlayTrack(lane, laneIndex))}
            {showStickerTrack ? stickerLanes.map((lane, laneIndex) => renderStickerTrack(lane, laneIndex)) : null}
            {captionLanes.map((lane, laneIndex) => (
              <div
                className={`caption-track ${selectedTrack === "caption" ? "is-selected" : ""} ${
                  !isRowVisible(`caption-${laneIndex}`) ? "is-track-disabled" : ""
                } ${trackLocks.caption ? "is-track-locked" : ""} ${
                  activeTimelineClipDrag?.track === "caption" ? "is-reordering" : ""
                }`}
                key={`caption-lane-${laneIndex}`}
                aria-disabled={!isRowVisible(`caption-${laneIndex}`)}
                inert={!isRowVisible(`caption-${laneIndex}`) ? true : undefined}
                onClick={(event) => selectTimelineTrackBackground(event, "caption", "caption")}
                data-timeline-reorder-track="caption"
                onContextMenu={(event) => showTrackContextMenu(event, "caption", "", `caption-${laneIndex}`)}
              >
                {lane.map(({ segment, index, range: segmentRange }) => {
                    const segmentDuration = segmentRange?.duration ?? 0;
                    const segmentLeft =
                      segmentRange && timelineDuration > 0
                        ? Math.max(0, Math.min(100, (segmentRange.start / timelineDuration) * 100))
                        : 0;
                    const segmentWidth =
                      timelineDuration > 0
                        ? Math.max(0.01, Math.min(100, (segmentDuration / timelineDuration) * 100))
                        : 0;
                    const isDraggingCaptionSegment =
                      activeTimelineClipDrag?.track === "caption" &&
                      activeTimelineClipDrag.segmentId === segment.id;
                    const isReorderTarget =
                      activeTimelineClipDrag?.track === "caption" &&
                      activeTimelineClipDrag.overIndex === index &&
                      !isDraggingCaptionSegment;
                    return (
                      <button
                        key={segment.id}
                        type="button"
                        className={`caption-segment ${
                          segment.id === currentCaptionSegment?.id ? "is-current" : ""
                        } ${segment.id === selectedSegmentId ? "is-selected-segment" : ""} ${
                          segment.hidden ? "is-hidden" : ""
                        } ${isDraggingCaptionSegment ? "is-reorder-dragging" : ""} ${
                          isReorderTarget ? "is-reorder-target" : ""
                        }`}
                        data-timeline-segment-track="caption"
                        data-timeline-segment-index={index}
                        data-timeline-segment-id={segment.id}
                        data-range-selected={isRangeSelected("caption", segment.id) || undefined}
                        data-placeholder={t("dropSlot", "放置位置")}
                        style={{
                          "--caption-left": `${segmentLeft}%`,
                          "--caption-width": `${segmentWidth}%`,
                        }}
                        onPointerDown={(event) => startTimelineClipDrag(event, "caption", segment.id, index)}
                        onContextMenu={(event) => showTrackContextMenu(event, "caption", segment.id, `caption-${laneIndex}`)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressTimelineClipClickRef.current === segment.id) {
                            return;
                          }
                          setSelectedTrack("caption");
                          setActiveTool("caption");
                          clearClipSelections("caption");
                          setSelectedSegmentId(segment.id);
                          seekTo(segmentRange?.start ?? getSegmentStartTime(displayedCaptionSegments, index, captionTargetDuration));
                        }}
                      >
                        <span
                          className="caption-resize-handle is-start"
                          aria-hidden="true"
                          onPointerDown={(event) => startCaptionResize(event, segment.id, index, "start")}
                        />
                        <span className="caption-segment-label">{segment.text}</span>
                        <span
                          className="caption-resize-handle is-end"
                          aria-hidden="true"
                          onPointerDown={(event) => startCaptionResize(event, segment.id, index, "end")}
                        />
                      </button>
                    );
                    })}
              </div>
            ))}
            {showSourceTrack ? <button
              className={`audio-track source-track ${selectedTrack === "source" ? "is-selected" : ""} ${
                !trackVisibility.source ? "is-track-disabled" : ""
              } ${trackLocks.source ? "is-track-locked" : ""} ${
                assetDropTargetTrack === "source" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "source" ? "is-drop-landing" : ""}`}
              type="button"
              disabled={!trackVisibility.source}
              onClick={(event) => selectTimelineTrackBackground(event, "source")}
              onDragOver={(event) => handleTrackAssetDragOver(event, "source")}
              onDragLeave={(event) => handleTrackAssetDragLeave(event, "source")}
              onDrop={(event) => handleTrackAssetDrop(event, "source")}
              data-asset-drop-track="source"
              onContextMenu={(event) => showTrackContextMenu(event, "source")}
            >
                {assetDropTargetTrack === "source" ? (
                  <div className="track-drop-hint">{t("dropSourceHere")}</div>
                ) : null}
              {renderAssetDropSlot("source")}
              {sourceAudioExtractionPendingId && !sourceAudioBlob ? (
                <div className="source-audio-extraction-state" role="status" aria-live="polite">
                  <CircleNotch size={16} />
                  <span>{t("separatingSourceAudio", "正在分离音频…")}</span>
                </div>
              ) : null}
              {sourceAudioBlob && sourceAudioLinked && linkedSourceAudioSegments.length ? linkedSourceAudioSegments.map((segment) => (
                <div
                  className={`audio-clip is-source is-linked ${selectedSourceAudioSegmentId === segment.id ? "is-selected" : ""}`}
                  key={segment.id}
                  data-timeline-segment-track="source"
                  data-timeline-segment-id={segment.id}
                  data-range-selected={isRangeSelected("source", segment.id) || undefined}
                  style={{
                    width: `${timelineDuration > 0 ? Math.max(0.01, Math.min(100, (segment.duration / timelineDuration) * 100)) : 0}%`,
                    left: `${timelineDuration > 0 ? Math.max(0, Math.min(100, (segment.start / timelineDuration) * 100)) : 0}%`,
                  }}
                  onContextMenu={(event) => showTrackContextMenu(event, "source", segment.id)}
                  onPointerDown={(event) => startSourceAudioMove(event, segment.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressTimelineClipClickRef.current === "source") return void (suppressTimelineClipClickRef.current = "");
                    setSelectedTrack("source");
                    activateAudioToolForClipSelection();
                    clearClipSelections("source");
                    setSelectedSourceAudioSegmentId(segment.id);
                    ensureMobileTimedClipVisible(segment.id);
                    revealMobileClipActions("source");
                  }}
                >
                  <WaveformStrip peaks={sliceSourceAudioPeaks(sourceAudioPeaks, segment, sourceAudioDuration)} active />
                  <span className="audio-clip-duration" data-compact-duration={formatCompactDuration(segment.duration)}>{formatTime(segment.duration)}</span>
                </div>
              )) : sourceAudioBlob ? (
                <div
                  className={`audio-clip is-source ${selectedSourceAudioSegmentId === "source-audio" ? "is-selected" : ""}`}
                  data-timeline-segment-track="source"
                  data-timeline-segment-id="source-audio"
                  data-range-selected={isRangeSelected("source", "source-audio") || undefined}
                  style={{
                    width: `${sourceAudioClipPercent}%`,
                    marginLeft: `${sourceAudioStartPercent}%`,
                  }}
                  onContextMenu={(event) => showTrackContextMenu(event, "source", "source-audio")}
                  onPointerDown={(event) => startSourceAudioMove(event, "source-audio")}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressTimelineClipClickRef.current === "source") return void (suppressTimelineClipClickRef.current = "");
                    setSelectedTrack("source");
                    activateAudioToolForClipSelection();
                    clearClipSelections("source");
                    setSelectedSourceAudioSegmentId("source-audio");
                    ensureMobileTimedClipVisible("source-audio");
                    revealMobileClipActions("source");
                  }}
                >
                  <WaveformStrip peaks={sourceAudioPeaks} active />
                  <span className="audio-clip-duration" data-compact-duration={formatCompactDuration(sourceAudioDuration)}>{formatTime(sourceAudioDuration)}</span>
                </div>
              ) : null}
            </button> : null}
            {audioLanes.map((lane, laneIndex) => {
              const rowKey = `audio-${laneIndex}`;
              const rowVisible = isRowVisible(rowKey);
              const rowLocked = isTimelineRowLocked("audio", rowKey);
              return (
              <button
                className={`audio-track ${selectedTrack === "audio" ? "is-selected" : ""} ${
                  !rowVisible ? "is-track-disabled" : ""
                } ${rowLocked ? "is-track-locked" : ""} ${
                  laneIndex === 0 && assetDropTargetTrack === "audio" ? "is-drop-target" : ""
                } ${sourceAudioDragTargetLane === laneIndex ? "is-source-audio-drop-target" : ""
                } ${laneIndex === 0 && assetDropPulseTrack === "audio" ? "is-drop-landing" : ""}`}
                type="button"
                disabled={!rowVisible}
                key={`audio-lane-${laneIndex}`}
                onClick={(event) => selectTimelineTrackBackground(event, "audio")}
                onDragOver={(event) => laneIndex === 0 && handleTrackAssetDragOver(event, "audio")}
                onDragLeave={(event) => laneIndex === 0 && handleTrackAssetDragLeave(event, "audio")}
                onDrop={(event) => laneIndex === 0 && handleTrackAssetDrop(event, "audio")}
                data-asset-drop-track={laneIndex === 0 ? "audio" : undefined}
                data-audio-lane-index={laneIndex}
                onContextMenu={(event) => showTrackContextMenu(event, "audio", "", rowKey, rowKey)}
              >
                {laneIndex === 0 && assetDropTargetTrack === "audio" ? (
                    <div className="track-drop-hint">{t("dropVoiceHere")}</div>
                  ) : null}
                {sourceAudioDragTargetLane === laneIndex ? (
                  <div className="source-audio-lane-drop-hint">
                    {t(laneIndex >= (audioSegments.length ? packedAudioLanes.length : 0) ? "sourceAudioCreateTrackDrop" : "sourceAudioTrackDrop")}
                  </div>
                ) : null}
                {laneIndex === 0 ? renderAssetDropSlot("audio") : null}
                {lane.map((segment) => {
                    const left = timelineDuration > 0 ? (segment.start / timelineDuration) * 100 : 0;
                    const width = timelineDuration > 0 ? (segment.duration / timelineDuration) * 100 : 0;
                    return (
                      <div
                        className={`audio-clip ${segment.sourceKind === "video-source" ? "is-video-source" : ""} ${selectedAudioSegmentId === segment.id ? "is-selected" : ""}`}
                        key={segment.id}
                        data-timeline-segment-track="audio"
                        data-timeline-segment-id={segment.id}
                        data-range-selected={isRangeSelected("audio", segment.id) || undefined}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onPointerDown={(event) => startAudioSegmentMove(event, segment.id, laneIndex)}
                        onContextMenu={(event) => showTrackContextMenu(event, "audio", segment.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressTimelineClipClickRef.current === segment.id) return void (suppressTimelineClipClickRef.current = "");
                          setSelectedTrack("audio");
                          activateAudioToolForClipSelection();
                          clearClipSelections("voice");
                          setSelectedAudioSegmentId(segment.id);
                          ensureMobileTimedClipVisible(segment.id);
                          revealMobileClipActions("audio");
                        }}
                      >
                        <WaveformStrip peaks={segment.peaks} active />
                        <span className="audio-clip-duration" data-compact-duration={formatCompactDuration(segment.duration)}>{formatTime(segment.duration)}</span>
                      </div>
                    );
                  })}
              </button>
              );
            })}
            {showMusicTrack ? <button
              className={`audio-track music-track ${selectedTrack === "music" ? "is-selected" : ""} ${
                !trackVisibility.music ? "is-track-disabled" : ""
              } ${trackLocks.music ? "is-track-locked" : ""} ${
                assetDropTargetTrack === "music" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "music" ? "is-drop-landing" : ""}`}
              type="button"
              disabled={!trackVisibility.music}
              onClick={(event) => selectTimelineTrackBackground(event, "music")}
              onDragOver={(event) => handleTrackAssetDragOver(event, "music")}
              onDragLeave={(event) => handleTrackAssetDragLeave(event, "music")}
              onDrop={(event) => handleTrackAssetDrop(event, "music")}
              data-asset-drop-track="music"
              onContextMenu={(event) => showTrackContextMenu(event, "music")}
            >
                {assetDropTargetTrack === "music" ? (
                  <div className="track-drop-hint">{t("dropMusicHere")}</div>
                ) : null}
              {renderAssetDropSlot("music")}
              {musicBlob ? (musicSegments.length ? musicSegments : [{ id: "music-audio", start: musicStartPercent / 100 * timelineDuration, duration: musicDuration, peaks: musicPeaks }]).map((segment) => (
                <div className={`audio-clip is-music ${selectedMusicSegmentId === segment.id ? "is-selected" : ""}`} key={segment.id} data-timeline-segment-track="music" data-timeline-segment-id={segment.id} data-range-selected={isRangeSelected("music", segment.id) || undefined} style={{ width: `${timelineDuration > 0 ? segment.duration / timelineDuration * 100 : 0}%`, left: `${timelineDuration > 0 ? segment.start / timelineDuration * 100 : 0}%` }} onPointerDown={(event) => startMusicMove(event, segment.id)} onContextMenu={(event) => showTrackContextMenu(event, "music", segment.id)} onClick={(event) => { event.stopPropagation(); if (suppressTimelineClipClickRef.current === "music") return void (suppressTimelineClipClickRef.current = ""); setSelectedTrack("music"); activateAudioToolForClipSelection(); clearClipSelections("music"); setSelectedMusicSegmentId?.(segment.id); ensureMobileTimedClipVisible(segment.id); revealMobileClipActions("music"); }}>
                  <WaveformStrip peaks={segment.peaks?.length ? segment.peaks : musicPeaks} active />
                  <span className="audio-clip-duration" data-compact-duration={formatCompactDuration(segment.duration)}>{formatTime(segment.duration)}</span>
                </div>
              )) : null}
            </button> : null}
          </div>
        </div>
      </div>

      {draggingVisualSegment ? (
        <div
          className={`timeline-drag-ghost type-${draggingVisualSegment.type || visualType}`}
          style={{ left: activeTimelineClipDrag.x, top: activeTimelineClipDrag.y }}
        >
          <div className="timeline-drag-ghost-thumb">
            {(draggingVisualSegment.type || visualType) === "video" ? (
              <video src={draggingVisualSegment.src || imageSrc} crossOrigin="anonymous" muted playsInline preload="metadata" draggable={false} />
            ) : (
              <img src={draggingVisualSegment.src || imageSrc} alt="" crossOrigin="anonymous" draggable={false} />
            )}
          </div>
          <span>{formatClock(draggingVisualSegment.duration)}</span>
        </div>
      ) : null}
      {draggingCaptionSegment && !["move", "resize-start", "resize-end"].includes(activeTimelineClipDrag.mode) ? (
        <div
          className="timeline-drag-ghost type-caption"
          style={{ left: activeTimelineClipDrag.x, top: activeTimelineClipDrag.y }}
        >
          <strong>{draggingCaptionSegment.text}</strong>
        </div>
      ) : null}
      {timelineRangeDrag?.dragging && typeof document !== "undefined" ? createPortal((
        <div
          className="timeline-range-drag-preview"
          style={{ left: timelineRangeDrag.x + 14, top: timelineRangeDrag.y + 14 }}
        >
          <span>{timelineRangeSelection.size}</span>
          <strong>{t("timelineMovingSelection", "移动选中片段")}</strong>
          <em>{timelineRangeDrag.delta >= 0 ? "+" : ""}{timelineRangeDrag.delta.toFixed(2)}s</em>
        </div>
      ), document.body) : null}
      {timelineMarquee && typeof document !== "undefined" ? createPortal((
        <div
          className="timeline-marquee-selection"
          aria-hidden="true"
          style={{
            left: timelineMarquee.x,
            top: timelineMarquee.y,
            width: timelineMarquee.width,
            height: timelineMarquee.height,
          }}
        />
      ), document.body) : null}
      {mobileClipActionsVisible && selectedMobileClipTrack && typeof document !== "undefined" ? createPortal((
        <nav className={`timeline-mobile-clip-actions ${mobileClipActionIds.length > 5 ? "is-scroll-actions" : ""}`} aria-label={t("clipActions")}>
          <button className="is-back" type="button" onClick={() => { closeMobileClipActions(); clearClipSelections(); }}><ArrowLeft size={21} /><span>{t("mobileClipDismiss")}</span></button>
          <div className="timeline-mobile-clip-action-scroller">
          {mobileClipActionIds.filter((actionId) => actionId !== "dismiss").map((actionId) => {
            if (actionId === "visual-transform") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("transform")}><SlidersHorizontal size={20} /><span>{t("visualTabTransform")}</span></button>;
            if (actionId === "visual-mask") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("mask")}><Crop size={20} /><span>{t("visualTabMask")}</span></button>;
            if (actionId === "visual-filter") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("filters")}><Sparkle size={20} /><span>{t("visualTabEffects")}</span></button>;
            if (actionId === "visual-effects") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("effects")}><Sparkle size={20} weight="fill" /><span>{t("effects")}</span></button>;
            if (actionId === "visual-animation") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("animation")}><MonitorPlay size={20} /><span>{t("visualTabAnimation")}</span></button>;
            if (actionId === "visual-speed") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("speed")}><ArrowsOutLineHorizontal size={20} /><span>{t("visualTabSpeed")}</span></button>;
            if (actionId === "visual-repair") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("repair")}><Sparkle size={20} /><span>{t("repairTab")}</span></button>;
            if (actionId === "visual-vector") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("vector")}><Sparkle size={20} /><span>{t("vectorProperties", "矢量")}</span></button>;
            if (actionId === "overlay-timing") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("timing")}><PictureInPicture size={20} /><span>{t("overlayTiming", "层级")}</span></button>;
            if (actionId === "caption-properties") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("caption")}><ClosedCaptioning size={20} /><span>{t("caption")}</span></button>;
            if (actionId === "caption-font") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("font")}><TextT size={20} /><span>{t("captionFont")}</span></button>;
            if (actionId === "caption-voice") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("voice")}><Waveform size={20} /><span>{t("aiVoice")}</span></button>;
            if (actionId === "sticker-properties") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("sticker")}><SlidersHorizontal size={20} /><span>{t("properties")}</span></button>;
            if (actionId === "audio-properties") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("audio")}><Waveform size={20} /><span>{t("mobileClipAudio")}</span></button>;
            if (actionId === "audio-fade") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("fade")}><ArrowsInLineHorizontal size={20} /><span>{t("mobileClipFade")}</span></button>;
            if (actionId === "audio-spatial") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("spatial")}><Waveform size={20} /><span>{t("audioSpaceTab")}</span></button>;
            if (actionId === "audio-voice-color") return <button type="button" key={actionId} onClick={() => openSelectedClipInspector("voice-color")}><Sparkle size={20} weight="fill" /><span>{t("voiceColorTab", "音色")}</span></button>;
            if (actionId === "split") return <button type="button" key={actionId} onClick={() => runMobileClipAction(handleCutTrack)}><Scissors size={20} /><span>{t("mobileClipSplit")}</span></button>;
            if (actionId === "copy") return <button type="button" key={actionId} onClick={() => runMobileClipAction(handleDuplicateTrack)}><CopySimple size={20} /><span>{t("mobileClipCopy")}</span></button>;
            if (actionId === "captions") return <button type="button" key={actionId} disabled={audioProcessingBusy || !selectedMobileAudioSegment} onClick={generateSelectedMobileAudioCaptions}><ClosedCaptioning size={20} /><span>{t("mobileClipCaptions")}</span></button>;
            if (actionId === "caption-link") return <button type="button" key={actionId} onClick={toggleSelectedMobileCaptionAudioLink}>{selectedMobileHasLinkedCaption ? <LinkBreak size={20} /> : <LinkSimple size={20} />}<span>{t(selectedMobileHasLinkedCaption ? "captionUnlinkAudio" : "captionLinkAudio")}</span></button>;
            if (actionId === "caption-align") return <button type="button" key={actionId} onClick={alignSelectedMobileCaptionAudio}><ArrowsInLineHorizontal size={20} /><span>{t("captionAlignToAudio")}</span></button>;
            if (actionId === "separate") return <button type="button" key={actionId} disabled={audioProcessingBusy || !selectedMobileAudioSegment} onClick={separateSelectedMobileAudio}><Waveform size={20} /><span>{t("mobileClipSeparate")}</span></button>;
            if (actionId === "extract-source-audio") return <button type="button" key={actionId} disabled={Boolean(sourceAudioExtractionPendingId) || !selectedMobileExtractableVideo} onClick={() => void runSourceAudioExtraction(selectedMobileExtractableVideo, selectedMobileClipTrack)}>{sourceAudioExtractionPendingId === selectedMobileExtractableVideo?.id ? <CircleNotch className="spin" size={20} /> : <Waveform size={20} />}<span>{t(sourceAudioExtractionPendingId === selectedMobileExtractableVideo?.id ? "separatingSourceAudio" : "separateSourceAudio", sourceAudioExtractionPendingId === selectedMobileExtractableVideo?.id ? "正在分离音频…" : "分离音频")}</span></button>;
            return <button className="is-danger" type="button" key={actionId} onClick={() => runMobileClipAction(handleDeleteTrack)}><Trash size={20} /><span>{t("mobileClipDelete")}</span></button>;
          })}
          </div>
        </nav>
      ), document.body) : null}
      {contextMenu ? (
        <div className="timeline-context-menu" role="menu" aria-label={t("timelineContextMenu")} style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <div className="timeline-context-heading">{contextMenu.kind === "clip" ? t("clipActions") : t("trackActions")}<span>{t({ image: "imageTrack", overlay: "overlayTrack", caption: "caption", sticker: "stickerTrack", source: "sourceTrack", audio: "voiceTrack", music: "musicTrack" }[contextMenu.track], contextMenu.track)}</span></div>
          <button type="button" role="menuitem" onClick={() => runContextAction(() => openTrackPanel(contextMenu.track))}><SlidersHorizontal size={16} />{t("openTrackPanel")}</button>
          {contextMenu.kind === "clip" ? (
            <>
              {contextMenu.track === "caption" ? (
                <><button type="button" role="menuitem" onClick={() => runContextAction(() => {
                  openTrackPanel("caption");
                  requestCaptionVoiceFocus?.();
                })}><Waveform size={16} />{t("aiVoice")}</button>
                {contextCaptionSegment ? <>
                  <button type="button" role="menuitem" onClick={() => runContextAction(() => contextCaptionSegment.audioSegmentId ? unlinkCaptionAudio?.(contextCaptionSegment.id) : linkCaptionAudio?.(contextCaptionSegment.id))}>{contextCaptionSegment.audioSegmentId ? <LinkBreak size={16} /> : <LinkSimple size={16} />}{t(contextCaptionSegment.audioSegmentId ? "captionUnlinkAudio" : "captionLinkAudio")}</button>
                  {contextCaptionSegment.audioSegmentId ? <button type="button" role="menuitem" onClick={() => runContextAction(() => alignCaptionToAudio?.(contextCaptionSegment.id))}><ArrowsInLineHorizontal size={16} />{t("captionAlignToAudio")}</button> : null}
                </> : null}</>
              ) : null}
              {contextMenu.track === "image" && builtInImageCaptionAvailable && contextImageSegment && contextImageSegment.type !== "video" ? (
                <button className={imageCaptionPendingId === contextImageSegment.id ? "is-loading" : ""} type="button" role="menuitem" disabled={Boolean(imageCaptionPendingId)} onClick={() => runImageCaptionAction(contextImageSegment)}>
                  {imageCaptionPendingId === contextImageSegment.id ? <CircleNotch size={14} /> : <Sparkle size={14} />}
                  {t(imageCaptionPendingId === contextImageSegment.id ? "generatingImageAiCaption" : "generateImageAiCaption")}
                </button>
              ) : null}
              {contextMenu.track === "image" && contextImageSegment?.type === "video" ? <>
                <button type="button" role="menuitem" disabled={Boolean(trackLocks.image)} onClick={() => runContextAction(() => setVisualSegments((items) => items.map((item) => item.id === contextImageSegment.id ? { ...item, sourceAudioDisabled: !item.sourceAudioDisabled } : item)))}>{contextImageSegment.sourceAudioDisabled ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}{t(contextImageSegment.sourceAudioDisabled ? "unmuteClip" : "muteClip", contextImageSegment.sourceAudioDisabled ? "取消静音" : "静音")}</button>
                <button type="button" role="menuitem" disabled={Boolean(sourceAudioExtractionPendingId)} onClick={() => void runSourceAudioExtraction(contextImageSegment)}>
                  {sourceAudioExtractionPendingId === contextImageSegment.id ? <CircleNotch size={16} /> : <Waveform size={16} />}
                  {t(sourceAudioExtractionPendingId === contextImageSegment.id ? "separatingSourceAudio" : "separateSourceAudio", sourceAudioExtractionPendingId === contextImageSegment.id ? "正在分离音频…" : "分离音频")}
                </button>
              </> : null}
              {contextMenu.track === "overlay" && contextOverlaySegment?.type === "video" ? (
                <>
                  <button type="button" role="menuitem" disabled={Boolean(trackLocks.overlay)} onClick={() => runContextAction(() => setVisualOverlaySegments((items) => items.map((item) => item.id === contextOverlaySegment.id ? { ...item, muted: !item.muted } : item)))}>{contextOverlaySegment.muted ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}{t(contextOverlaySegment.muted ? "unmuteClip" : "muteClip", contextOverlaySegment.muted ? "取消静音" : "静音")}</button>
                  <button type="button" role="menuitem" disabled={Boolean(sourceAudioExtractionPendingId)} onClick={() => void runSourceAudioExtraction(contextOverlaySegment, "overlay")}>
                    {sourceAudioExtractionPendingId === contextOverlaySegment.id ? <CircleNotch size={16} /> : <Waveform size={16} />}
                    {t(sourceAudioExtractionPendingId === contextOverlaySegment.id ? "separatingSourceAudio" : "separateSourceAudio", sourceAudioExtractionPendingId === contextOverlaySegment.id ? "正在分离音频…" : "分离音频")}
                  </button>
                </>
              ) : null}
              {contextMenu.track === "audio" && contextAudioSegment ? <>
                <button type="button" role="menuitem" onClick={() => runContextAction(() => contextAudioHasLinkedCaption ? unlinkAudioCaptions?.(contextAudioSegment.id) : linkAudioToCaption?.(contextAudioSegment.id))}>{contextAudioHasLinkedCaption ? <LinkBreak size={16} /> : <LinkSimple size={16} />}{t(contextAudioHasLinkedCaption ? "captionUnlinkAudio" : "captionLinkAudio")}</button>
                {contextAudioHasLinkedCaption ? <button type="button" role="menuitem" onClick={() => runContextAction(() => alignAudioCaptions?.(contextAudioSegment.id))}><ArrowsInLineHorizontal size={16} />{t("captionAlignToAudio")}</button> : null}
                <button type="button" role="menuitem" disabled={audioProcessingBusy} onClick={() => runContextAction(() => separateAudioClipVocals?.({ blob: contextAudioSegment.blob, name: contextAudioSegment.name, start: contextAudioSegment.start, sourceStart: contextAudioSegment.sourceStart || 0, duration: contextAudioSegment.duration, segmentId: contextAudioSegment.id, track: "audio" }))}><Waveform size={16} />{t("separateVocalsFromClip")}</button>
                <button type="button" role="menuitem" disabled={audioProcessingBusy} onClick={() => runContextAction(() => generateCaptionsFromAudioClip?.({ blob: contextAudioSegment.blob, start: contextAudioSegment.start, sourceStart: contextAudioSegment.sourceStart || 0, duration: contextAudioSegment.duration, append: true }))}><ClosedCaptioning size={16} />{t("generateCaptionsFromClip")}</button>
              </> : null}
              {contextMenu.track === "music" && contextMusicSegment && musicBlob ? <>
                <button type="button" role="menuitem" disabled={audioProcessingBusy} onClick={() => runContextAction(() => separateAudioClipVocals?.({ blob: musicBlob, name: t("musicTrack"), start: contextMusicSegment.start, sourceStart: contextMusicSegment.sourceStart || 0, duration: contextMusicSegment.duration, segmentId: contextMusicSegment.id, track: "music" }))}><Waveform size={16} />{t("separateVocalsFromClip")}</button>
                <button type="button" role="menuitem" disabled={audioProcessingBusy} onClick={() => runContextAction(() => generateCaptionsFromAudioClip?.({ blob: musicBlob, start: contextMusicSegment.start, sourceStart: contextMusicSegment.sourceStart || 0, duration: contextMusicSegment.duration, append: true }))}><ClosedCaptioning size={16} />{t("generateCaptionsFromClip")}</button>
              </> : null}
              <button type="button" role="menuitem" onClick={() => runContextAction(handleCutTrack)}><Scissors size={16} />{t("splitAtPlayhead")}</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(handleDuplicateTrack)}><CopySimple size={16} />{t("duplicateClip")}</button>
              <div className="timeline-context-divider" />
              <button className="is-danger" type="button" role="menuitem" onClick={() => runContextAction(handleDeleteTrack)}><Trash size={16} />{t("deleteClip")}</button>
            </>
          ) : (
            <>
              {["image", "caption"].includes(contextMenu.track) ? <button type="button" role="menuitem" onClick={() => runContextAction(() => handleAddSegment(contextMenu.targetTime))}><PlusCircle size={16} />{t("addClip")}</button> : null}
              <button type="button" role="menuitem" onClick={() => runContextAction(() => toggleTimelineRowVisibility(contextMenu.track, contextMenu.visibilityKey || contextMenu.track))}>{getTimelineRowVisibility(contextMenu.track, contextMenu.visibilityKey || contextMenu.track) ? <EyeSlash size={16} /> : <Eye size={16} />}{t(getTimelineRowVisibility(contextMenu.track, contextMenu.visibilityKey || contextMenu.track) ? "hideTrack" : "showTrack")}</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => toggleTimelineRowLock(contextMenu.track, contextMenu.lockKey || contextMenu.track))}>{isTimelineRowLocked(contextMenu.track, contextMenu.lockKey || contextMenu.track) ? <LockKeyOpen size={16} /> : <LockKey size={16} />}{t(isTimelineRowLocked(contextMenu.track, contextMenu.lockKey || contextMenu.track) ? "unlockTrack" : "lockTrack")}</button>
            </>
          )}
        </div>
      ) : null}
      {transitionEditor ? (() => {
        const segment = displayedVisualSegments[transitionEditor.index];
        const transition = segment?.transition || { id: "none", duration: 0.5 };
        const maxDuration = Math.max(0.1, Math.min(2, (segment?.duration || 0.5) / 2, (displayedVisualSegments[transitionEditor.index + 1]?.duration || 0.5) / 2));
        return (
          <div className="transition-popover" role="dialog" aria-label={t("transitionSettings")} style={{ left: transitionEditor.x, top: transitionEditor.y }} onPointerDown={(event) => event.stopPropagation()}>
            <div className="transition-popover-head"><strong>{t("transition")}</strong><button type="button" onClick={() => setTransitionEditor(null)} aria-label={t("close")}><X size={17} /></button></div>
            <div className="transition-presets">
              {TRANSITIONS.map((option) => (
                <button type="button" className={transition.id === option.id ? "is-selected" : ""} key={option.id} onClick={() => updateJunctionTransition(transitionEditor.index, { id: option.id })}>
                  <i className={`transition-preview preview-${option.id}`} /><span>{trOption(option.name, option)}</span>
                </button>
              ))}
            </div>
            <label className="transition-duration-control">
              <span><b>{t("duration")}</b><em>{Math.min(maxDuration, transition.duration || 0.5).toFixed(1)}{t("secondsShort")}</em></span>
              <input type="range" min="0.1" max={maxDuration} step="0.1" value={Math.min(maxDuration, transition.duration || 0.5)} disabled={transition.id === "none"} onChange={(event) => updateJunctionTransition(transitionEditor.index, { duration: Number(event.target.value) })} />
            </label>
          </div>
        );
      })() : null}
    </section>
  );
}
