import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
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
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  SlidersHorizontal,
  Trash,
  Waveform,
} from "@phosphor-icons/react";

import { IMAGE_SEGMENT_SECONDS, MAX_IMAGE_THUMBNAILS, TRANSITIONS } from "../config/editor.js";
import { formatClock, formatTime, getSegmentStartTime, getVisualSegmentStartTime, packCaptionSegmentsIntoLanes, packTimedSegmentsIntoLanes } from "../lib/timeline.js";
import { sliceSourceAudioPeaks } from "../lib/sourceAudioSync.js";
import { createMainVisualFromOverlay } from "../lib/visualOverlayTimeline.js";
import {
  clampTimelineZoom,
  getTimelineRulerTicks,
  getTimelineAutoFitZoom,
  getTimelineTrackWidthPercent,
  getTimelineZoomLabel,
} from "../lib/timelineScale.js";
import { IconButton, WaveformStrip } from "./ui.jsx";

const TIMELINE_WHEEL_ZOOM_SENSITIVITY = 0.00056;
const TIMELINE_WHEEL_ZOOM_COMMIT_DELAY = 180;
const TIMELINE_BUTTON_ZOOM_RATIO = 1.25;
const TIMELINE_TRACK_ROW_HEIGHT = "48px";
const VIDEO_FRAME_MIN_COUNT = 1;
const IMAGE_THUMBNAIL_TARGET_WIDTH = 84;
const IMAGE_THUMBNAIL_MAX_COUNT = 240;
const TIMELINE_WHEEL_ZOOM_CONTENT_SELECTOR = [
  ".image-clip",
  ".visual-overlay-clip",
  ".caption-segment",
  ".sticker-segment",
  ".audio-clip",
].join(", ");

function getSampledVideoFrames(frames, count) {
  if (!Array.isArray(frames) || !frames.length) {
    return [];
  }

  const safeCount = Math.max(VIDEO_FRAME_MIN_COUNT, count);
  if (safeCount === frames.length) {
    return frames;
  }

  if (safeCount === 1) {
    return [frames[Math.floor(frames.length / 2)]];
  }

  return Array.from({ length: safeCount }, (_, index) => {
    const frameIndex = Math.round((index / (safeCount - 1)) * (frames.length - 1));
    return frames[frameIndex];
  });
}

function getTimelineThumbnailCount({ duration, timelineDuration, contentWidth, timelineZoom, availableFrames = MAX_IMAGE_THUMBNAILS }) {
  if (!availableFrames || timelineDuration <= 0 || contentWidth <= 0) {
    return VIDEO_FRAME_MIN_COUNT;
  }

  const clipPixelWidth = Math.max(68, (Math.max(0, duration || 0) / timelineDuration) * contentWidth);
  const targetCellWidth =
    timelineZoom >= 8
      ? 30
      : timelineZoom >= 3
        ? 38
        : timelineZoom >= 1
          ? 48
          : 68;
  return Math.max(
    VIDEO_FRAME_MIN_COUNT,
    Math.min(availableFrames, Math.ceil(clipPixelWidth / targetCellWidth)),
  );
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
  undo,
  redo,
  handleDeleteTrack,
  handleDuplicateTrack,
  handleCutTrack,
  fitMode,
  setFitMode,
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
  requestCaptionVoiceFocus,
  trackVisibility,
  toggleTrackVisibility,
  trackLocks,
  toggleTrackLock,
  trackScrollRef,
  startTimelineSeek,
  timelineDuration,
  currentTime,
  playheadPercent,
  snapGuide,
  assetDropTargetTrack,
  assetDropPosition,
  assetDropPulseTrack,
  assetDragPreview,
  draggedAssetType = "",
  handleTrackAssetDragOver,
  handleTrackAssetDragLeave,
  handleTrackAssetDrop,
  handleVisualStyleDrop,
  activeTimelineClipDrag,
  showStickerTrack,
  stickerSegments,
  currentStickerSegment,
  selectedStickerSegmentId,
  setSelectedStickerSegmentId,
  imageSrc,
  displayedVisualSegments,
  setVisualSegments,
  renderedVisualTimeline,
  visualType,
  currentVisualSegment,
  selectedVisualSegmentId,
  currentVisualSegmentIndex,
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
  displayedCaptionSegments,
  displayedCaptionTimeline,
  currentCaptionSegment,
  selectedSegmentId,
  setSelectedSegmentId,
  captionTargetDuration,
  sourceAudioLinked,
  setSourceAudioLinked,
  linkedSourceAudioSegments,
  sourceAudioBlob,
  sourceAudioPeaks,
  sourceAudioClipPercent,
  sourceAudioStartPercent,
  sourceAudioDuration,
  selectedSourceAudioSegmentId,
  setSelectedSourceAudioSegmentId,
  audioBlob,
  peaks,
  audioClipPercent,
  audioDuration,
  audioSegments,
  selectedAudioSegmentId,
  setSelectedAudioSegmentId,
  startAudioSegmentMove,
  startSourceAudioMove,
  musicBlob,
  musicSegments = [],
  musicPeaks,
  musicStartPercent,
  musicDuration,
  startMusicMove,
}) {
  const [transitionEditor, setTransitionEditor] = useState(null);
  const [musicClipSelected, setMusicClipSelected] = useState(false);
  const [overlayPromotionTarget, setOverlayPromotionTarget] = useState(null);
  const [sourceAudioExtractionPendingId, setSourceAudioExtractionPendingId] = useState("");

  const clearClipSelections = (except = "") => {
    if (except !== "overlay") setSelectedVisualOverlayId?.("");
    if (except !== "visual") setSelectedVisualSegmentId("");
    if (except !== "sticker") setSelectedStickerSegmentId("");
    if (except !== "caption") setSelectedSegmentId("");
    if (except !== "voice") setSelectedAudioSegmentId("");
    if (except !== "source") setSelectedSourceAudioSegmentId("");
    if (except !== "music") setMusicClipSelected(false);
  };

  const updateJunctionTransition = (index, patch) => {
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
  const packedAudioLanes = useMemo(() => packTimedSegmentsIntoLanes(audioSegments), [audioSegments]);
  const showVoiceTrack = audioSegments.length > 0 || draggedAssetType === "audio";
  const audioLanes = showVoiceTrack ? (audioSegments.length ? packedAudioLanes : [[]]) : [];
  const stickerLanes = useMemo(() => packTimedSegmentsIntoLanes(stickerSegments), [stickerSegments]);
  const showEmptyOverlayDropLane = !visualOverlaySegments.length && (
    draggedAssetType === "image" ||
    draggedAssetType === "video" ||
    (activeTimelineClipDrag?.track === "image" && activeTimelineClipDrag.mode === "overlay")
  );
  const overlayLanes = useMemo(
    () => visualOverlaySegments.length ? packTimedSegmentsIntoLanes(visualOverlaySegments) : showEmptyOverlayDropLane ? [[]] : [],
    [showEmptyOverlayDropLane, visualOverlaySegments],
  );
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
    ...overlayLanes.map((_, index) => ["overlay", `${t("overlayTrack", "Overlay")} ${index + 1}`, `overlay-${index}`]),
    ...(showStickerTrack ? stickerLanes.map((_, index) => ["sticker", `${t("stickerTrack")} ${index + 1}`, `sticker-${index}`]) : []),
    ...captionLanes.map((_, index) => ["caption", `${t("caption")} ${index + 1}`, `caption-${index}`, `caption-${index}`]),
    ...(showSourceTrack ? [["source", t("sourceTrack")]] : []),
    ...audioLanes.map((_, index) => ["audio", `${t("voiceTrack")} ${index + 1}`, `audio-${index}`]),
    ...(showMusicTrack ? [["music", t("musicTrack")]] : []),
  ];
  // Visibility is track-scoped even when overlapping clips are packed into
  // multiple visual rows. Preview, playback and export all read the track key.
  const isRowVisible = (track) => trackVisibility[track] ?? true;
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
  const contextMusicSegment = contextMenu?.track === "music" && contextMenu.segmentId
    ? (musicSegments.length ? musicSegments : [{ id: "music-audio", start: musicStartPercent / 100 * timelineDuration, duration: musicDuration, peaks: musicPeaks }])
      .find((segment) => segment.id === contextMenu.segmentId)
    : null;
  const trackTool = (track) => ({ image: "media", overlay: "media", sticker: "stickers", caption: "caption", source: "audio", audio: "audio", music: "audio" })[track] || "media";
  const openTrackPanel = (track) => {
    setSelectedTrack(track);
    setActiveTool(trackTool(track));
  };
  const selectContextTarget = (track, segmentId = "") => {
    openTrackPanel(track);
    const selectionType = { image: "visual", overlay: "overlay", sticker: "sticker", caption: "caption", audio: "voice", source: "source", music: "music" }[track];
    clearClipSelections(selectionType);
    if (track === "image" && segmentId) setSelectedVisualSegmentId(segmentId);
    if (track === "overlay" && segmentId) setSelectedVisualOverlayId?.(segmentId);
    if (track === "sticker" && segmentId) setSelectedStickerSegmentId(segmentId);
    if (track === "caption" && segmentId) setSelectedSegmentId(segmentId);
    if (track === "audio" && segmentId) setSelectedAudioSegmentId(segmentId);
    if (track === "source" && segmentId) setSelectedSourceAudioSegmentId(segmentId);
    if (track === "music" && segmentId) setMusicClipSelected(true);
  };
  const showTrackContextMenu = (event, track, segmentId = "", visibilityKey = track) => {
    event.preventDefault(); event.stopPropagation();
    selectContextTarget(track, segmentId);
    const trackRect = trackScrollRef.current?.getBoundingClientRect();
    const targetTime = trackRect && timelineDuration > 0
      ? Math.max(0, Math.min(timelineDuration, ((event.clientX - trackRect.left) / trackRect.width) * timelineDuration))
      : currentTime;
    setContextMenu({
      x: Math.max(10, Math.min(window.innerWidth - 234, event.clientX)),
      y: Math.max(10, Math.min(window.innerHeight - 258, event.clientY)),
      track, visibilityKey, segmentId, targetTime, kind: segmentId ? "clip" : "track",
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
  const runSourceAudioExtraction = async (segment) => {
    if (!segment || sourceAudioExtractionPendingId) return;
    const index = displayedVisualSegments.findIndex((item) => item.id === segment.id);
    const start = getVisualSegmentStartTime(displayedVisualSegments, index);
    setSourceAudioExtractionPendingId(segment.id);
    setContextMenu(null);
    try {
      await extractVideoSourceAudio?.(segment, start, { append: Boolean(sourceAudioBlob) });
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
  const timelineZoomRef = useRef(timelineZoom);
  const wheelZoomFrameRef = useRef(0);
  const commitZoomTimerRef = useRef(0);
  const rulerViewportFrameRef = useRef(0);
  const wheelZoomActiveRef = useRef(false);
  const rulerViewportSyncRef = useRef(null);
  const rulerCanvasRef = useRef(null);
  const zoomReadoutRef = useRef(null);
  const pendingWheelDeltaRef = useRef(0);
  const pendingWheelAnchorRef = useRef(null);
  const timelineWheelHandlerRef = useRef(null);
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
    const applyRulerViewportUpdate = () => {
      rulerViewportFrameRef.current = 0;
      syncRulerPosition();
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
      if (wheelZoomActiveRef.current) {
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
    const nextZoom = clampTimelineZoom(timelineZoom);
    if (Math.abs(nextZoom - timelineZoomRef.current) < 0.0008) {
      return;
    }
    timelineZoomRef.current = nextZoom;
    setLocalTimelineZoom(nextZoom);
  }, [timelineZoom]);
  useEffect(
    () => () => {
      if (wheelZoomFrameRef.current) {
        window.cancelAnimationFrame(wheelZoomFrameRef.current);
      }
      trackScrollRef.current?.classList.remove("is-wheel-zooming");
      wheelZoomActiveRef.current = false;
      window.clearTimeout(commitZoomTimerRef.current);
    },
    [trackScrollRef],
  );
  const secondsPerPixel =
    timelineDuration > 0 && rulerViewport.contentWidth > 0
      ? timelineDuration / rulerViewport.contentWidth
      : 0;
  const rulerVisibleStart = Math.max(0, rulerViewport.scrollLeft * secondsPerPixel);
  const rulerVisibleEnd = Math.min(
    timelineDuration,
    (rulerViewport.scrollLeft + rulerViewport.viewportWidth) * secondsPerPixel,
  );
  const rulerTicks = useMemo(
    () => getTimelineRulerTicks(timelineDuration, localTimelineZoom, rulerVisibleStart, rulerVisibleEnd),
    [timelineDuration, localTimelineZoom, rulerVisibleEnd, rulerVisibleStart],
  );
  const zoomReadout = getTimelineZoomLabel(localTimelineZoom);
  const fitTimelineZoom = getTimelineAutoFitZoom(timelineDuration, 0.9);
  const localTrackWidth = `${getTimelineTrackWidthPercent(timelineDuration, localTimelineZoom)}%`;
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
  const flushWheelZoom = () => {
    wheelZoomFrameRef.current = 0;

    const anchor = pendingWheelAnchorRef.current;
    const wheelDelta = Math.max(-640, Math.min(640, pendingWheelDeltaRef.current));
    pendingWheelDeltaRef.current = 0;
    if (!anchor) {
      return;
    }

    const currentZoom = clampTimelineZoom(timelineZoomRef.current);
    const nextZoom = clampTimelineZoom(
      currentZoom * Math.exp(-wheelDelta * TIMELINE_WHEEL_ZOOM_SENSITIVITY),
    );

    if (Math.abs(nextZoom - currentZoom) < 0.0008) {
      return;
    }

    const currentTrackWidthPercent = getTimelineTrackWidthPercent(timelineDuration, currentZoom);
    const nextTrackWidthPercent = getTimelineTrackWidthPercent(timelineDuration, nextZoom);
    const nextTrackWidth =
      anchor.trackWidth * (nextTrackWidthPercent / Math.max(currentTrackWidthPercent, 0.001));
    const nextScrollLeft =
      anchor.trackContentStart +
      anchor.pointerTrackRatio * nextTrackWidth -
      anchor.pointerViewportX;

    wheelZoomActiveRef.current = true;
    timelineZoomRef.current = nextZoom;
    anchor.trackElement.classList.add("is-wheel-zooming");
    anchor.trackElement.style.width = `${nextTrackWidthPercent}%`;
    anchor.trackElement.style.setProperty("--timeline-zoom", String(nextZoom));
    anchor.scrollElement.scrollLeft = Math.max(0, nextScrollLeft);
    if (zoomReadoutRef.current) {
      zoomReadoutRef.current.textContent = getTimelineZoomLabel(nextZoom);
    }

    window.clearTimeout(commitZoomTimerRef.current);
    commitZoomTimerRef.current = window.setTimeout(() => {
      wheelZoomActiveRef.current = false;
      setLocalTimelineZoom(nextZoom);
      setTimelineZoom(nextZoom);
      window.requestAnimationFrame(() => {
        anchor.trackElement.classList.remove("is-wheel-zooming");
        rulerViewportSyncRef.current?.();
      });
    }, TIMELINE_WHEEL_ZOOM_COMMIT_DELAY);
  };
  const handleTimelineWheel = (event) => {
    const isOverTimelineContent = Boolean(
      event.target instanceof Element && event.target.closest(TIMELINE_WHEEL_ZOOM_CONTENT_SELECTOR),
    );
    const hasZoomModifier = event.ctrlKey || event.metaKey;

    if (!hasZoomModifier && !isOverTimelineContent) {
      if (!event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        const board = event.currentTarget?.closest?.(".timeline")?.querySelector?.(".timeline-board");
        if (board && board.scrollHeight > board.clientHeight) {
          event.preventDefault();
          board.scrollTop += event.deltaY;
        }
      }
      return;
    }

    if (!hasZoomModifier && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      return;
    }

    const trackElement = trackScrollRef.current;
    const scrollElement = trackElement?.parentElement;
    if (!trackElement || !scrollElement) {
      return;
    }

    event.preventDefault();
    const trackRect = trackElement.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    const trackContentStart = trackRect.left - scrollRect.left + scrollElement.scrollLeft;
    const pointerTrackRatio = Math.max(
      0,
      Math.min(1, (event.clientX - trackRect.left) / Math.max(trackRect.width, 1)),
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
      pointerViewportX: event.clientX - scrollRect.left,
      scrollElement,
      trackElement,
      trackContentStart,
      trackWidth: trackRect.width,
    };

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
  const renderAssetDropSlot = (track) =>
    assetDropTargetTrack === track ? (
      <div
        className={`asset-drop-slot type-${assetDragPreview?.type || "asset"} mode-${track} ${
          assetDragPreview?.src ? "has-thumb" : ""
        }`}
        style={{ "--drop-x": `${assetDropPosition?.track === track ? assetDropPosition.percent : 50}%` }}
      >
        {assetDragPreview?.src ? (
          <div className="asset-drop-slot-thumb">
            {assetDragPreview.type === "video" ? (
              <video src={assetDragPreview.src} muted playsInline preload="metadata" draggable={false} />
            ) : assetDragPreview.type === "audio" ? (
              <span>{t("assetAudio")}</span>
            ) : (
              <img src={assetDragPreview.src} alt="" draggable={false} />
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
    ) : null;
  const renderStickerTrack = (lane, laneIndex) =>
    showStickerTrack ? (
      <div
        key={`sticker-lane-${laneIndex}`}
        className={`sticker-track ${selectedTrack === "sticker" ? "is-selected" : ""} ${
          !isRowVisible("sticker") ? "is-track-disabled" : ""
        } ${
          assetDropTargetTrack === "sticker" ? "is-drop-target" : ""
        } ${assetDropPulseTrack === "sticker" ? "is-drop-landing" : ""}`}
        onClick={() => {
          setSelectedTrack("sticker");
          setActiveTool("stickers");
        }}
        onDragOver={(event) => handleTrackAssetDragOver(event, "sticker")}
        onDragLeave={(event) => handleTrackAssetDragLeave(event, "sticker")}
        onDrop={(event) => handleTrackAssetDrop(event, "sticker")}
        data-asset-drop-track="sticker"
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
                  } ${segment.id === selectedStickerSegmentId ? "is-selected-segment" : ""}`}
                  type="button"
                  key={segment.id}
                  style={{
                    "--sticker-left": `${segmentLeft}%`,
                    "--sticker-width": `${segmentWidth}%`,
                  }}
                  onPointerDown={(event) => startStickerSegmentMove(event, segment.id)}
                  onContextMenu={(event) => showTrackContextMenu(event, "sticker", segment.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressTimelineClipClickRef.current === segment.id) {
                      return;
                    }
                    setSelectedTrack("sticker");
                    setActiveTool("stickers");
                    clearClipSelections("sticker");
                    setSelectedStickerSegmentId(segment.id);
                    seekTo(segment.start || 0);
                  }}
                >
                  <img src={segment.src} alt="" draggable={false} />
                  <span>{segment.name}</span>
                </button>
              );
            })}
        {renderAssetDropSlot("sticker")}
      </div>
    ) : null;
  const renderOverlayTrack = (lane, laneIndex) => {
    const laneEnd = lane.reduce((end, segment) => Math.max(end, segment.start + segment.duration), 0);
    return (
    <div
      className={`visual-overlay-track ${selectedTrack === "overlay" ? "is-selected" : ""} ${!isRowVisible("overlay") ? "is-track-disabled" : ""} ${assetDropTargetTrack === "overlay" ? "is-drop-target" : ""}`}
      key={`overlay-lane-${laneIndex}`}
      onClick={() => setSelectedTrack("overlay")}
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
          ? getSampledVideoFrames(segment.trackFrames, getTimelineThumbnailCount({ duration: segment.duration, timelineDuration, contentWidth: rulerViewport.contentWidth, timelineZoom: localTimelineZoom, availableFrames: MAX_IMAGE_THUMBNAILS }))
          : [];
        const overlayImageCount = segment.type !== "video"
          ? getImageTimelineThumbnailCount({ duration: segment.duration, timelineDuration, contentWidth: rulerViewport.contentWidth })
          : 1;
        const startOverlayEdit = (event, mode) => {
          if (trackLocks.overlay || !setVisualOverlaySegments) return;
          event.preventDefault(); event.stopPropagation();
          clearClipSelections("overlay"); setSelectedVisualOverlayId?.(segment.id); setSelectedTrack("overlay");
          const track = event.currentTarget.closest(".visual-overlay-track");
          if (!track) return;
          const rect = track.getBoundingClientRect();
          const startX = event.clientX; const initialStart = segment.start; const initialDuration = segment.duration;
          let dragging = false; let promoteToMain = false; let mainInsertIndex = displayedVisualSegments.length;
          const move = (moveEvent) => {
            if (!dragging && Math.abs(moveEvent.clientX - startX) < 4) return;
            if (!dragging) { dragging = true; if (isPlaying) handlePlayToggle(); }
            const mainTrack = mode === "move" ? document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.('[data-asset-drop-track="image"]') : null;
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
            if (promoteToMain) return;
            const delta = (moveEvent.clientX - startX) / Math.max(1, rect.width) * timelineDuration;
            setVisualOverlaySegments((items) => items.map((item) => {
              if (item.id !== segment.id) return item;
              if (mode === "move") return { ...item, start: Math.max(0, Math.min(timelineDuration - initialDuration, initialStart + delta)) };
              if (mode === "resize-start") {
                const start = Math.max(0, Math.min(initialStart + initialDuration - 0.1, initialStart + delta));
                return { ...item, start, duration: initialDuration + initialStart - start };
              }
              return { ...item, duration: Math.max(0.1, Math.min(timelineDuration - initialStart, initialDuration + delta)) };
            }));
          };
          const end = () => {
            window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
            setOverlayPromotionTarget(null);
            if (!dragging || !promoteToMain) return;
            const promoted = createMainVisualFromOverlay(segment);
            if (!promoted) return;
            setVisualOverlaySegments((items) => items.filter((item) => item.id !== segment.id));
            setVisualSegments((items) => {
              const next = [...items];
              next.splice(Math.max(0, Math.min(next.length, mainInsertIndex)), 0, promoted);
              return next;
            });
            clearClipSelections("visual");
            setSelectedVisualSegmentId(promoted.id);
            setSelectedTrack("image");
          };
          window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
        };
        return <div className={`visual-overlay-clip ${segment.type === "video" ? "is-video" : "is-image"} ${active ? "is-current" : ""} ${segment.id === selectedVisualOverlayId ? "is-selected-segment" : ""}`} role="button" tabIndex={0} key={segment.id} style={{ "--overlay-left": `${left}%`, "--overlay-width": `${width}%` }} onPointerDown={(event) => startOverlayEdit(event, "move")} onContextMenu={(event) => showTrackContextMenu(event, "overlay", segment.id)} onClick={(event) => {
          event.stopPropagation();
          clearClipSelections("overlay");
          setSelectedVisualOverlayId?.(segment.id);
          setSelectedTrack("overlay");
        }}>
          <div className="visual-overlay-thumbnails">
            {segment.type === "video"
              ? overlayFrames.length
                ? overlayFrames.map((frame, frameIndex) => <img src={frame} alt="" draggable={false} key={`${segment.id}-overlay-frame-${frameIndex}`} />)
                : <video src={segment.src} muted playsInline preload="metadata" />
              : Array.from({ length: overlayImageCount }, (_, thumbnailIndex) => <img src={segment.src} alt="" draggable={false} key={`${segment.id}-overlay-image-${thumbnailIndex}`} />)}
          </div>
          {segment.type === "video" ? <button className="clip-mute-toggle" type="button" aria-label={t(segment.muted ? "unmuteClip" : "muteClip", segment.muted ? "取消静音" : "静音")} title={t(segment.muted ? "unmuteClip" : "muteClip", segment.muted ? "取消静音" : "静音")} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setVisualOverlaySegments((items) => items.map((item) => item.id === segment.id ? { ...item, muted: !item.muted } : item)); }}>{segment.muted ? <SpeakerSlash size={13} /> : <SpeakerHigh size={13} />}</button> : null}
          <span>{segment.name || t("overlayTrack", "Overlay")}</span>
          <i className="visual-overlay-resize is-start" onPointerDown={(event) => startOverlayEdit(event, "resize-start")} />
          <i className="visual-overlay-resize is-end" onPointerDown={(event) => startOverlayEdit(event, "resize-end")} />
        </div>;
      })}
      {laneIndex === 0 && activeTimelineClipDrag?.track === "image" && activeTimelineClipDrag.mode === "overlay" && draggingVisualSegment ? (
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
      {renderAssetDropSlot("overlay")}
    </div>
  );
  };

  return (
    <section className="timeline">
      <div className="timeline-tools">
        <div className="timeline-icon-group">
          <IconButton label={t("undo")} onClick={undo}>
            <ArrowCounterClockwise size={17} />
          </IconButton>
          <IconButton label={t("redo")} onClick={redo}>
            <ArrowClockwise size={17} />
          </IconButton>
          <IconButton label={t("deleteTrack")} onClick={handleDeleteTrack}>
            <Trash size={17} />
          </IconButton>
          <IconButton label={t("duplicateTrack")} onClick={handleDuplicateTrack}>
            <CopySimple size={17} />
          </IconButton>
          <IconButton label={t("cutSegment")} onClick={handleCutTrack}>
            <Scissors size={17} />
          </IconButton>
          <IconButton
            label={t("cropCanvas")}
            active={fitMode === "cover"}
            onClick={() => setFitMode((mode) => (mode === "cover" ? "contain" : "cover"))}
          >
            <Crop size={17} />
          </IconButton>
          <IconButton
            label={t(sourceAudioLinked ? "unlinkSourceAudio" : "linkSourceAudio")}
            active={sourceAudioLinked}
            disabled={!sourceAudioBlob}
            onClick={() => setSourceAudioLinked((linked) => !linked)}
          >
            {sourceAudioLinked ? <LinkSimple size={17} weight="bold" /> : <LinkBreak size={17} />}
          </IconButton>
          {sourceAudioBlob ? <span className={`timeline-sync-readout ${sourceAudioLinked ? "is-linked" : ""}`}>
            {t(sourceAudioLinked ? "sourceAudioSynced" : "sourceAudioIndependent")}
          </span> : null}
        </div>
        <div className="timeline-segment-tools">
          <button className="timeline-play-button" type="button" disabled={!canPreview} onClick={handlePlayToggle}>
            {isPlaying ? <Pause size={17} weight="fill" /> : <Play size={17} weight="fill" />}
            {isPlaying ? t("pause") : t("play")}
          </button>
          <button type="button" onClick={handleAddSegment}>
            <PlusCircle size={17} />
            {t("addSegment")}
          </button>
          <button type="button" onClick={handleRemoveSegment}>
            <MinusCircle size={17} />
            {t("removeSegment")}
          </button>
          <IconButton label={t("shortenSegment")} onClick={() => adjustSelectedSegmentWeight(-0.5)}>
            <ArrowsInLineHorizontal size={18} />
          </IconButton>
          <IconButton label={t("lengthenSegment")} onClick={() => adjustSelectedSegmentWeight(0.5)}>
            <ArrowsOutLineHorizontal size={18} />
          </IconButton>
        </div>
        <div className="timeline-icon-group">
          <IconButton label={t("zoomOut")} onClick={() => adjustTimelineZoom((zoom) => zoom / TIMELINE_BUTTON_ZOOM_RATIO)}>
            <MagnifyingGlassMinus size={17} />
          </IconButton>
          <span ref={zoomReadoutRef} className="zoom-readout" data-testid="timeline-zoom-readout">{zoomReadout}</span>
          <IconButton
            label={t("fitTimeline")}
            active={Math.abs(localTimelineZoom - fitTimelineZoom) < 0.001}
            onClick={() => adjustTimelineZoom(fitTimelineZoom)}
          >
            <MonitorPlay size={17} />
          </IconButton>
          <IconButton label={t("zoomIn")} onClick={() => adjustTimelineZoom((zoom) => zoom * TIMELINE_BUTTON_ZOOM_RATIO)}>
            <MagnifyingGlassPlus size={17} />
          </IconButton>
        </div>
      </div>

      <div className="timeline-board">
        <div className="track-labels-ruler-spacer" aria-hidden="true" />
        <div className="timeline-ruler-viewport">
          <div
            ref={rulerCanvasRef}
            className="timeline-ruler-canvas"
            style={{ width: localTrackWidth, transform: `translateX(${-rulerViewport.scrollLeft}px)` }}
          >
            <div className="ruler" onPointerDown={startTimelineSeek}>
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
              onPointerDown={startTimelineSeek}
            />
          </div>
        </div>
        <div className="track-labels" style={{ gridTemplateRows: timelineLabelRows }}>
          {timelineTrackLabels.map(([track, label, rowId = track, visibilityKey = track]) => (
            <div
              className={`${selectedTrack === track ? "is-selected" : ""} ${
                !isRowVisible(visibilityKey) ? "is-track-disabled" : ""
              }`}
              key={rowId}
              onContextMenu={(event) => showTrackContextMenu(event, track, "", visibilityKey)}
            >
              <button
                type="button"
                aria-label={`${label} ${t("visible")}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTrackVisibility(visibilityKey);
                }}
              >
                {isRowVisible(visibilityKey) ? <Eye size={15} /> : <EyeSlash size={15} />}
              </button>
              <button
                type="button"
                aria-label={`${label} ${t("lock")}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTrackLock(track);
                }}
              >
                {trackLocks[track] ? <LockKey size={15} /> : <LockKeyOpen size={15} />}
              </button>
              <button className="track-name-button" type="button" onClick={() => setSelectedTrack(track)}>
                {label}
              </button>
            </div>
          ))}
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
              startTimelineSeek(event);
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
              onPointerDown={startTimelineSeek}
            />
            {snapGuide && timelineDuration > 0 ? (
              <div
                className="snap-guide"
                style={{
                  left: `${Math.max(0, Math.min(100, (snapGuide.time / timelineDuration) * 100))}%`,
                }}
              >
                <span>{snapGuide.label}</span>
              </div>
            ) : null}
            <div
              className={`image-track ${selectedTrack === "image" ? "is-selected" : ""} ${
                !trackVisibility.image ? "is-track-disabled" : ""
              } ${
                assetDropTargetTrack === "image" || assetDropTargetTrack === "overlay" || overlayPromotionTarget ? `is-drop-target is-drop-${overlayPromotionTarget ? "image" : assetDropTargetTrack}` : ""
              } ${assetDropPulseTrack === "image" ? "is-drop-landing" : ""} ${
                activeTimelineClipDrag?.track === "image" ? "is-reordering" : ""
              }`}
              onClick={() => setSelectedTrack("image")}
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
                    const isSelectedVisualSegment =
                      segment.id === selectedVisualSegmentId ||
                      (!selectedVisualSegmentId && index === currentVisualSegmentIndex);
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
                    const promotionOverlay = isOverlayPromotionInsertTarget
                      ? visualOverlaySegments.find((item) => item.id === overlayPromotionTarget.segmentId)
                      : null;
                    const promotionGapWidth = timelineDuration > 0
                      ? Math.max(0.01, Math.min(100, ((promotionOverlay?.duration || 0.5) / timelineDuration) * 100))
                      : 0;
                    const videoTrackFrames = Array.isArray(segment.trackFrames) ? segment.trackFrames : [];
                    const desiredVideoFrameCount = getTimelineThumbnailCount({
                      duration: segment.duration,
                      timelineDuration,
                      contentWidth: rulerViewport.contentWidth,
                      timelineZoom: localTimelineZoom,
                      availableFrames: videoTrackFrames.length || MAX_IMAGE_THUMBNAILS,
                    });
                    const visibleVideoFrames = segmentType === "video"
                      ? videoTrackFrames.length
                        ? getSampledVideoFrames(videoTrackFrames, desiredVideoFrameCount)
                        : segment.thumbnail
                          ? Array.from({ length: desiredVideoFrameCount }, () => segment.thumbnail)
                          : []
                      : [];
                    const isPortraitVideo = segmentType === "video" && (segment.height || 0) > (segment.width || 0);

                    return (
                      <div
                        key={segment.id}
                        role="button"
                        tabIndex={0}
                        data-timeline-segment-track="image"
                        data-timeline-segment-index={index}
                        data-timeline-segment-id={segment.id}
                        data-placeholder={t("dropSlot", "放置位置")}
                        style={{
                          "--image-clip-width": `${segmentWidth}%`,
                          "--promotion-gap-width": `${promotionGapWidth}%`,
                        }}
                        className={`image-clip ${segmentType === "video" ? "is-video" : ""} ${
                          isCurrentVisualSegment ? "is-current" : ""
                        } ${isSelectedVisualSegment ? "is-selected-segment" : ""} ${
                          isDraggingVisualSegment ? "is-reorder-dragging" : ""
                        } ${isReorderTarget ? "is-reorder-target" : ""} ${
                          isOverlayPromotionInsertTarget ? "is-overlay-promotion-insert-target" : ""
                        } ${segment.preparing ? "is-preparing" : ""}`}
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
                            <strong>{t("timelineMediaPreparing", "正在准备素材")}</strong>
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
                              visibleVideoFrames.map((frameSrc, frameIndex) => (
                                <img
                                  src={frameSrc}
                                  alt=""
                                  draggable={false}
                                  key={`${segment.id}-frame-${frameIndex}`}
                                />
                              ))
                            ) : (
                              <video src={segmentSrc} muted playsInline preload="metadata" draggable={false} />
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
                                <img src={segmentSrc} alt="" draggable={false} key={thumbnailIndex} />
                              ),
                            )
                          )}
                        </div> : null}
                        {!segment.preparing ? <span className="image-clip-duration">{formatClock(segment.duration)}</span> : null}
                        {!segment.preparing && !activeTimelineClipDrag ? (
                          <button
                            className="image-resize-handle"
                            type="button"
                            aria-label={t("dragImageDuration")}
                            onPointerDown={(event) => startImageResize(event, segment.id, index)}
                          />
                        ) : null}
                      </div>
                    );
                  })
                : null}
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
                return (
                  <button
                    className={`visual-junction ${transition.id !== "none" ? "has-transition" : ""}`}
                    key={`junction-${segment.id}`}
                    type="button"
                    aria-label={`${t("transition")}: ${trOption(TRANSITIONS.find((item) => item.id === transition.id)?.name || "无转场")}`}
                    title="设置转场"
                    style={{ left: `${((range?.end || 0) / Math.max(0.01, timelineDuration)) * 100}%` }}
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
                } ${
                  activeTimelineClipDrag?.track === "caption" ? "is-reordering" : ""
                }`}
                key={`caption-lane-${laneIndex}`}
                onClick={() => {
                  setSelectedTrack("caption");
                  setActiveTool("caption");
                }}
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
              } ${
                assetDropTargetTrack === "source" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "source" ? "is-drop-landing" : ""}`}
              type="button"
              onClick={() => {
                setSelectedTrack("source");
                setSelectedSourceAudioSegmentId("");
              }}
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
                  style={{
                    width: `${timelineDuration > 0 ? Math.max(0.01, Math.min(100, (segment.duration / timelineDuration) * 100)) : 0}%`,
                    left: `${timelineDuration > 0 ? Math.max(0, Math.min(100, (segment.start / timelineDuration) * 100)) : 0}%`,
                  }}
                  onContextMenu={(event) => showTrackContextMenu(event, "source", segment.id)}
                  onPointerDown={startSourceAudioMove}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressTimelineClipClickRef.current === "source") return void (suppressTimelineClipClickRef.current = "");
                    setSelectedTrack("source");
                    setActiveTool("audio");
                    clearClipSelections("source");
                    setSelectedSourceAudioSegmentId(segment.id);
                  }}
                >
                  <WaveformStrip peaks={sliceSourceAudioPeaks(sourceAudioPeaks, segment, sourceAudioDuration)} active />
                  <span className="audio-clip-duration">{formatTime(segment.duration)}</span>
                </div>
              )) : sourceAudioBlob ? (
                <div
                  className={`audio-clip is-source ${selectedSourceAudioSegmentId === "source-audio" ? "is-selected" : ""}`}
                  style={{
                    width: `${sourceAudioClipPercent}%`,
                    marginLeft: `${sourceAudioStartPercent}%`,
                  }}
                  onContextMenu={(event) => showTrackContextMenu(event, "source", "source-audio")}
                  onPointerDown={startSourceAudioMove}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressTimelineClipClickRef.current === "source") return void (suppressTimelineClipClickRef.current = "");
                    setSelectedTrack("source");
                    setActiveTool("audio");
                    clearClipSelections("source");
                    setSelectedSourceAudioSegmentId("source-audio");
                  }}
                >
                  <WaveformStrip peaks={sourceAudioPeaks} active />
                  <span className="audio-clip-duration">{formatTime(sourceAudioDuration)}</span>
                </div>
              ) : null}
            </button> : null}
            {audioLanes.map((lane, laneIndex) => (
              <button
                className={`audio-track ${selectedTrack === "audio" ? "is-selected" : ""} ${
                  !isRowVisible("audio") ? "is-track-disabled" : ""
                } ${
                  laneIndex === 0 && assetDropTargetTrack === "audio" ? "is-drop-target" : ""
                } ${laneIndex === 0 && assetDropPulseTrack === "audio" ? "is-drop-landing" : ""}`}
                type="button"
                key={`audio-lane-${laneIndex}`}
                onClick={() => setSelectedTrack("audio")}
                onDragOver={(event) => laneIndex === 0 && handleTrackAssetDragOver(event, "audio")}
                onDragLeave={(event) => laneIndex === 0 && handleTrackAssetDragLeave(event, "audio")}
                onDrop={(event) => laneIndex === 0 && handleTrackAssetDrop(event, "audio")}
                data-asset-drop-track={laneIndex === 0 ? "audio" : undefined}
                onContextMenu={(event) => showTrackContextMenu(event, "audio")}
              >
                {laneIndex === 0 && assetDropTargetTrack === "audio" ? (
                    <div className="track-drop-hint">{t("dropVoiceHere")}</div>
                  ) : null}
                {laneIndex === 0 ? renderAssetDropSlot("audio") : null}
                {lane.map((segment) => {
                    const left = timelineDuration > 0 ? (segment.start / timelineDuration) * 100 : 0;
                    const width = timelineDuration > 0 ? (segment.duration / timelineDuration) * 100 : 0;
                    return (
                      <div
                        className={`audio-clip ${selectedAudioSegmentId === segment.id ? "is-selected" : ""}`}
                        key={segment.id}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onPointerDown={(event) => startAudioSegmentMove(event, segment.id)}
                        onContextMenu={(event) => showTrackContextMenu(event, "audio", segment.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressTimelineClipClickRef.current === segment.id) return void (suppressTimelineClipClickRef.current = "");
                          setSelectedTrack("audio");
                          setActiveTool("audio");
                          clearClipSelections("voice");
                          setSelectedAudioSegmentId(segment.id);
                          seekTo(segment.start);
                        }}
                      >
                        <WaveformStrip peaks={segment.peaks} active />
                        <span className="audio-clip-duration">{formatTime(segment.duration)}</span>
                      </div>
                    );
                  })}
              </button>
            ))}
            {showMusicTrack ? <button
              className={`audio-track music-track ${selectedTrack === "music" ? "is-selected" : ""} ${
                !trackVisibility.music ? "is-track-disabled" : ""
              } ${
                assetDropTargetTrack === "music" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "music" ? "is-drop-landing" : ""}`}
              type="button"
              onClick={() => {
                setSelectedTrack("music");
                setMusicClipSelected(false);
              }}
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
                <div className={`audio-clip is-music ${musicClipSelected ? "is-selected" : ""}`} key={segment.id} style={{ width: `${timelineDuration > 0 ? segment.duration / timelineDuration * 100 : 0}%`, left: `${timelineDuration > 0 ? segment.start / timelineDuration * 100 : 0}%` }} onPointerDown={startMusicMove} onContextMenu={(event) => showTrackContextMenu(event, "music", segment.id)} onClick={(event) => { event.stopPropagation(); if (suppressTimelineClipClickRef.current === "music") return void (suppressTimelineClipClickRef.current = ""); setSelectedTrack("music"); setActiveTool("audio"); clearClipSelections("music"); setMusicClipSelected(true); }}>
                  <WaveformStrip peaks={segment.peaks?.length ? segment.peaks : musicPeaks} active />
                  <span className="audio-clip-duration">{formatTime(segment.duration)}</span>
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
              <video src={draggingVisualSegment.src || imageSrc} muted playsInline preload="metadata" draggable={false} />
            ) : (
              <img src={draggingVisualSegment.src || imageSrc} alt="" draggable={false} />
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
      {contextMenu ? (
        <div className="timeline-context-menu" role="menu" aria-label={t("timelineContextMenu")} style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <div className="timeline-context-heading">{contextMenu.kind === "clip" ? t("clipActions") : t("trackActions")}<span>{t({ image: "imageTrack", overlay: "overlayTrack", caption: "caption", sticker: "stickerTrack", source: "sourceTrack", audio: "voiceTrack", music: "musicTrack" }[contextMenu.track], contextMenu.track)}</span></div>
          <button type="button" role="menuitem" onClick={() => runContextAction(() => openTrackPanel(contextMenu.track))}><SlidersHorizontal size={16} />{t("openTrackPanel")}</button>
          {contextMenu.kind === "clip" ? (
            <>
              {contextMenu.track === "caption" ? (
                <button type="button" role="menuitem" onClick={() => runContextAction(() => {
                  openTrackPanel("caption");
                  requestCaptionVoiceFocus?.();
                })}><Waveform size={16} />{t("aiVoice")}</button>
              ) : null}
              {contextMenu.track === "image" && builtInImageCaptionAvailable && contextImageSegment && contextImageSegment.type !== "video" ? (
                <button className={imageCaptionPendingId === contextImageSegment.id ? "is-loading" : ""} type="button" role="menuitem" disabled={Boolean(imageCaptionPendingId)} onClick={() => runImageCaptionAction(contextImageSegment)}>
                  {imageCaptionPendingId === contextImageSegment.id ? <CircleNotch size={14} /> : <Sparkle size={14} />}
                  {t(imageCaptionPendingId === contextImageSegment.id ? "generatingImageAiCaption" : "generateImageAiCaption")}
                </button>
              ) : null}
              {contextMenu.track === "image" && contextImageSegment?.type === "video" ? <>
                <button type="button" role="menuitem" onClick={() => runContextAction(() => setVisualSegments((items) => items.map((item) => item.id === contextImageSegment.id ? { ...item, sourceAudioDisabled: !item.sourceAudioDisabled } : item)))}>{contextImageSegment.sourceAudioDisabled ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}{t(contextImageSegment.sourceAudioDisabled ? "unmuteClip" : "muteClip", contextImageSegment.sourceAudioDisabled ? "取消静音" : "静音")}</button>
                <button type="button" role="menuitem" disabled={Boolean(sourceAudioExtractionPendingId)} onClick={() => void runSourceAudioExtraction(contextImageSegment)}>
                  {sourceAudioExtractionPendingId === contextImageSegment.id ? <CircleNotch size={16} /> : <Waveform size={16} />}
                  {t(sourceAudioExtractionPendingId === contextImageSegment.id ? "separatingSourceAudio" : "separateSourceAudio", sourceAudioExtractionPendingId === contextImageSegment.id ? "正在分离音频…" : "分离音频")}
                </button>
              </> : null}
              {contextMenu.track === "overlay" && contextOverlaySegment?.type === "video" ? (
                <button type="button" role="menuitem" onClick={() => runContextAction(() => setVisualOverlaySegments((items) => items.map((item) => item.id === contextOverlaySegment.id ? { ...item, muted: !item.muted } : item)))}>{contextOverlaySegment.muted ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}{t(contextOverlaySegment.muted ? "unmuteClip" : "muteClip", contextOverlaySegment.muted ? "取消静音" : "静音")}</button>
              ) : null}
              {contextMenu.track === "audio" && contextAudioSegment ? <>
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
              <button type="button" role="menuitem" onClick={() => runContextAction(() => toggleTrackVisibility(contextMenu.visibilityKey || contextMenu.track))}>{isRowVisible(contextMenu.visibilityKey || contextMenu.track) ? <EyeSlash size={16} /> : <Eye size={16} />}{t(isRowVisible(contextMenu.visibilityKey || contextMenu.track) ? "hideTrack" : "showTrack")}</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => toggleTrackLock(contextMenu.track))}>{trackLocks[contextMenu.track] ? <LockKeyOpen size={16} /> : <LockKey size={16} />}{t(trackLocks[contextMenu.track] ? "unlockTrack" : "lockTrack")}</button>
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
            <div className="transition-popover-head"><strong>{t("transition")}</strong><button type="button" onClick={() => setTransitionEditor(null)} aria-label={t("close")}>×</button></div>
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
