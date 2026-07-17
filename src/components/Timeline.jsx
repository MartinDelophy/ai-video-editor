import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  CopySimple,
  Crop,
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
  PlusCircle,
  Scissors,
  SlidersHorizontal,
  Trash,
  Waveform,
} from "@phosphor-icons/react";

import { IMAGE_SEGMENT_SECONDS } from "../config/editor.js";
import { formatClock, formatTime, getSegmentStartTime, packTimedSegmentsIntoLanes } from "../lib/timeline.js";
import { sliceSourceAudioPeaks } from "../lib/sourceAudioSync.js";
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
  ".caption-segment",
  ".sticker-segment",
  ".audio-clip",
].join(", ");

function packCaptionSegmentsIntoLanes(segments, timeline) {
  const lanes = [];
  segments
    .map((segment, index) => ({ segment, index, range: timeline[index] }))
    .sort((a, b) => (a.range?.start || 0) - (b.range?.start || 0))
    .forEach((item) => {
      const laneIndex = lanes.findIndex((lane) => {
        const last = lane.at(-1);
        return !last || (last.range?.end || 0) <= (item.range?.start || 0) + 0.001;
      });
      if (laneIndex >= 0) lanes[laneIndex].push(item);
      else lanes.push([item]);
    });
  return lanes.length ? lanes : [[]];
}

function getSampledVideoFrames(frames, count) {
  if (!Array.isArray(frames) || !frames.length) {
    return [];
  }

  const safeCount = Math.max(VIDEO_FRAME_MIN_COUNT, Math.min(frames.length, count));
  if (safeCount >= frames.length) {
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

function getVideoTimelineFrameCount({ duration, timelineDuration, contentWidth, timelineZoom, availableFrames }) {
  if (!availableFrames || timelineDuration <= 0 || contentWidth <= 0) {
    return VIDEO_FRAME_MIN_COUNT;
  }

  const clipPixelWidth = Math.max(68, (Math.max(0, duration || 0) / timelineDuration) * contentWidth);
  const targetCellWidth =
    timelineZoom >= 8
      ? 34
      : timelineZoom >= 3
        ? 42
        : timelineZoom >= 1
          ? 54
          : 82;
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
  renderedVisualTimeline,
  visualType,
  currentVisualSegment,
  selectedVisualSegmentId,
  currentVisualSegmentIndex,
  setSelectedVisualSegmentId,
  seekTo,
  suppressTimelineClipClickRef,
  startTimelineClipDrag,
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
  musicPeaks,
  musicClipPercent,
  musicStartPercent,
  musicDuration,
  startMusicMove,
}) {
  const draggingVisualSegment =
    activeTimelineClipDrag?.track === "image"
      ? displayedVisualSegments.find((segment) => segment.id === activeTimelineClipDrag.segmentId)
      : null;
  const draggingCaptionSegment =
    activeTimelineClipDrag?.track === "caption"
      ? displayedCaptionSegments.find((segment) => segment.id === activeTimelineClipDrag.segmentId)
      : null;
  const audioLanes = useMemo(() => packTimedSegmentsIntoLanes(audioSegments), [audioSegments]);
  const stickerLanes = useMemo(() => packTimedSegmentsIntoLanes(stickerSegments), [stickerSegments]);
  const captionLanes = useMemo(
    () => packCaptionSegmentsIntoLanes(displayedCaptionSegments, displayedCaptionTimeline),
    [displayedCaptionSegments, displayedCaptionTimeline],
  );
  const contentRows = [
    TIMELINE_TRACK_ROW_HEIGHT,
    ...(showStickerTrack ? stickerLanes.map(() => TIMELINE_TRACK_ROW_HEIGHT) : []),
    ...captionLanes.map(() => TIMELINE_TRACK_ROW_HEIGHT),
    TIMELINE_TRACK_ROW_HEIGHT,
    ...audioLanes.map(() => TIMELINE_TRACK_ROW_HEIGHT),
    TIMELINE_TRACK_ROW_HEIGHT,
  ];
  const timelineTrackRows = ["28px", ...contentRows].join(" ");
  const timelineLabelRows = contentRows.join(" ");
  const timelineTrackLabels = [
    ["image", t("imageTrack")],
    ...(showStickerTrack ? stickerLanes.map((_, index) => ["sticker", `${t("stickerTrack")} ${index + 1}`, `sticker-${index}`]) : []),
    ...captionLanes.map((_, index) => ["caption", `${t("caption")} ${index + 1}`, `caption-${index}`]),
    ["source", t("sourceTrack")],
    ...audioLanes.map((_, index) => ["audio", `${t("voiceTrack")} ${index + 1}`, `audio-${index}`]),
    ["music", t("musicTrack")],
  ];
  const isRowVisible = (track, rowId = track) =>
    trackVisibility[rowId] ?? trackVisibility[track] ?? true;
  const [rulerViewport, setRulerViewport] = useState({
    scrollLeft: 0,
    viewportWidth: 0,
    contentWidth: 0,
  });
  const [contextMenu, setContextMenu] = useState(null);
  const trackTool = (track) => ({ image: "media", sticker: "stickers", caption: "caption", source: "audio", audio: "audio", music: "audio" })[track] || "media";
  const openTrackPanel = (track) => {
    setSelectedTrack(track);
    setActiveTool(trackTool(track));
  };
  const selectContextTarget = (track, segmentId = "") => {
    openTrackPanel(track);
    if (track === "image" && segmentId) setSelectedVisualSegmentId(segmentId);
    if (track === "sticker" && segmentId) setSelectedStickerSegmentId(segmentId);
    if (track === "caption" && segmentId) setSelectedSegmentId(segmentId);
    if (track === "audio" && segmentId) setSelectedAudioSegmentId(segmentId);
  };
  const showTrackContextMenu = (event, track, segmentId = "") => {
    event.preventDefault(); event.stopPropagation();
    selectContextTarget(track, segmentId);
    const trackRect = trackScrollRef.current?.getBoundingClientRect();
    const targetTime = trackRect && timelineDuration > 0
      ? Math.max(0, Math.min(timelineDuration, ((event.clientX - trackRect.left) / trackRect.width) * timelineDuration))
      : currentTime;
    setContextMenu({
      x: Math.max(10, Math.min(window.innerWidth - 234, event.clientX)),
      y: Math.max(10, Math.min(window.innerHeight - 258, event.clientY)),
      track, segmentId, targetTime, kind: segmentId ? "clip" : "track",
    });
  };
  const runContextAction = (action) => {
    setContextMenu(null);
    window.requestAnimationFrame(action);
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

    const applyRulerViewportUpdate = () => {
      rulerViewportFrameRef.current = 0;
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
        className={`asset-drop-slot type-${assetDragPreview?.type || "asset"} ${
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
        <span>{t("dropSlot", "释放到这里")}</span>
        <strong>
          {assetDragPreview?.type === "audio"
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
          !isRowVisible("sticker", `sticker-${laneIndex}`) ? "is-track-disabled" : ""
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
        <div className="track-labels" style={{ gridTemplateRows: timelineLabelRows }}>
          {timelineTrackLabels.map(([track, label, rowId = track]) => (
            <div
              className={`${selectedTrack === track ? "is-selected" : ""} ${
                !isRowVisible(track, rowId) ? "is-track-disabled" : ""
              }`}
              key={rowId}
              onContextMenu={(event) => showTrackContextMenu(event, track)}
            >
              <button
                type="button"
                aria-label={`${label} ${t("visible")}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTrackVisibility(rowId);
                }}
              >
                {isRowVisible(track, rowId) ? <Eye size={15} /> : <EyeSlash size={15} />}
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
                assetDropTargetTrack === "image" ? "is-drop-target" : ""
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
              {assetDropTargetTrack === "image" ? (
                <div className="track-drop-hint">{t("dropVisualHere")}</div>
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
                    const videoTrackFrames = Array.isArray(segment.trackFrames) ? segment.trackFrames : [];
                    const visibleVideoFrames =
                      segmentType === "video" && videoTrackFrames.length
                        ? getSampledVideoFrames(
                            videoTrackFrames,
                            getVideoTimelineFrameCount({
                              duration: segment.duration,
                              timelineDuration,
                              contentWidth: rulerViewport.contentWidth,
                              timelineZoom: localTimelineZoom,
                              availableFrames: videoTrackFrames.length,
                            }),
                          )
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
                        style={{ "--image-clip-width": `${segmentWidth}%` }}
                        className={`image-clip ${segmentType === "video" ? "is-video" : ""} ${
                          isCurrentVisualSegment ? "is-current" : ""
                        } ${isSelectedVisualSegment ? "is-selected-segment" : ""} ${
                          isDraggingVisualSegment ? "is-reorder-dragging" : ""
                        } ${isReorderTarget ? "is-reorder-target" : ""}`}
                        onPointerDown={(event) => startTimelineClipDrag(event, "image", segment.id, index)}
                        onContextMenu={(event) => showTrackContextMenu(event, "image", segment.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressTimelineClipClickRef.current === segment.id) {
                            return;
                          }
                          setSelectedTrack("image");
                          setSelectedVisualSegmentId(segment.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedTrack("image");
                            setSelectedVisualSegmentId(segment.id);
                          }
                        }}
                      >
                        <div
                          className={`image-thumbnails ${segmentType === "video" ? "is-video" : ""} ${
                            isPortraitVideo ? "is-portrait-video" : ""
                          }`}
                          style={{ "--thumbnail-cell-width": `${IMAGE_THUMBNAIL_TARGET_WIDTH}px` }}
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
                        </div>
                        <span className="image-clip-duration">{formatClock(segment.duration)}</span>
                        {!activeTimelineClipDrag ? (
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
              {renderAssetDropSlot("image")}
            </div>
            {showStickerTrack ? stickerLanes.map((lane, laneIndex) => renderStickerTrack(lane, laneIndex)) : null}
            {captionLanes.map((lane, laneIndex) => (
              <div
                className={`caption-track ${selectedTrack === "caption" ? "is-selected" : ""} ${
                  !isRowVisible("caption", `caption-${laneIndex}`) ? "is-track-disabled" : ""
                } ${
                  activeTimelineClipDrag?.track === "caption" ? "is-reordering" : ""
                }`}
                key={`caption-lane-${laneIndex}`}
                onClick={() => {
                  setSelectedTrack("caption");
                  setActiveTool("caption");
                }}
                data-timeline-reorder-track="caption"
                onContextMenu={(event) => showTrackContextMenu(event, "caption")}
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
                        onContextMenu={(event) => showTrackContextMenu(event, "caption", segment.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressTimelineClipClickRef.current === segment.id) {
                            return;
                          }
                          setSelectedTrack("caption");
                          setActiveTool("caption");
                          setSelectedSegmentId(segment.id);
                          seekTo(segmentRange?.start ?? getSegmentStartTime(displayedCaptionSegments, index, captionTargetDuration));
                        }}
                      >
                        {segment.text}
                      </button>
                    );
                    })}
              </div>
            ))}
            <button
              className={`audio-track source-track ${selectedTrack === "source" ? "is-selected" : ""} ${
                !trackVisibility.source ? "is-track-disabled" : ""
              } ${
                assetDropTargetTrack === "source" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "source" ? "is-drop-landing" : ""}`}
              type="button"
              onClick={() => setSelectedTrack("source")}
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
              {sourceAudioBlob && sourceAudioLinked && linkedSourceAudioSegments.length ? linkedSourceAudioSegments.map((segment) => (
                <div
                  className="audio-clip is-source is-linked"
                  key={segment.id}
                  style={{
                    width: `${timelineDuration > 0 ? Math.max(0.01, Math.min(100, (segment.duration / timelineDuration) * 100)) : 0}%`,
                    left: `${timelineDuration > 0 ? Math.max(0, Math.min(100, (segment.start / timelineDuration) * 100)) : 0}%`,
                  }}
                  onContextMenu={(event) => showTrackContextMenu(event, "source", segment.id)}
                  onPointerDown={startSourceAudioMove}
                >
                  <WaveformStrip peaks={sliceSourceAudioPeaks(sourceAudioPeaks, segment, sourceAudioDuration)} active />
                  <span className="audio-clip-duration">{formatTime(segment.duration)}</span>
                </div>
              )) : sourceAudioBlob ? (
                <div
                  className="audio-clip is-source"
                  style={{
                    width: `${sourceAudioClipPercent}%`,
                    marginLeft: `${sourceAudioStartPercent}%`,
                  }}
                  onContextMenu={(event) => showTrackContextMenu(event, "source", "source-audio")}
                  onPointerDown={startSourceAudioMove}
                >
                  <WaveformStrip peaks={sourceAudioPeaks} active />
                  <span className="audio-clip-duration">{formatTime(sourceAudioDuration)}</span>
                </div>
              ) : null}
            </button>
            {audioLanes.map((lane, laneIndex) => (
              <button
                className={`audio-track ${selectedTrack === "audio" ? "is-selected" : ""} ${
                  !isRowVisible("audio", `audio-${laneIndex}`) ? "is-track-disabled" : ""
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
                          setSelectedTrack("audio");
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
            <button
              className={`audio-track music-track ${selectedTrack === "music" ? "is-selected" : ""} ${
                !trackVisibility.music ? "is-track-disabled" : ""
              } ${
                assetDropTargetTrack === "music" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "music" ? "is-drop-landing" : ""}`}
              type="button"
              onClick={() => setSelectedTrack("music")}
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
                {musicBlob ? (
                <div className="audio-clip is-music" style={{ width: `${musicClipPercent}%`, left: `${musicStartPercent}%` }} onPointerDown={startMusicMove} onContextMenu={(event) => showTrackContextMenu(event, "music", "music-audio")}>
                  <WaveformStrip peaks={musicPeaks} active />
                  <span className="audio-clip-duration">{formatTime(musicDuration)}</span>
                </div>
              ) : null}
            </button>
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
      {draggingCaptionSegment && activeTimelineClipDrag.mode !== "move" ? (
        <div
          className="timeline-drag-ghost type-caption"
          style={{ left: activeTimelineClipDrag.x, top: activeTimelineClipDrag.y }}
        >
          <strong>{draggingCaptionSegment.text}</strong>
        </div>
      ) : null}
      {contextMenu ? (
        <div className="timeline-context-menu" role="menu" aria-label={t("timelineContextMenu")} style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <div className="timeline-context-heading">{contextMenu.kind === "clip" ? t("clipActions") : t("trackActions")}<span>{t({ image: "imageTrack", caption: "caption", sticker: "stickerTrack", source: "sourceTrack", voice: "voiceTrack", music: "musicTrack" }[contextMenu.track], contextMenu.track)}</span></div>
          <button type="button" role="menuitem" onClick={() => runContextAction(() => openTrackPanel(contextMenu.track))}><SlidersHorizontal size={16} />{t("openTrackPanel")}</button>
          {contextMenu.kind === "clip" ? (
            <>
              {contextMenu.track === "caption" ? (
                <button type="button" role="menuitem" onClick={() => runContextAction(() => {
                  openTrackPanel("caption");
                  requestCaptionVoiceFocus?.();
                })}><Waveform size={16} />{t("aiVoice")}</button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => runContextAction(handleCutTrack)}><Scissors size={16} />{t("splitAtPlayhead")}</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(handleDuplicateTrack)}><CopySimple size={16} />{t("duplicateClip")}</button>
              <div className="timeline-context-divider" />
              <button className="is-danger" type="button" role="menuitem" onClick={() => runContextAction(handleDeleteTrack)}><Trash size={16} />{t("deleteClip")}</button>
            </>
          ) : (
            <>
              {["image", "caption"].includes(contextMenu.track) ? <button type="button" role="menuitem" onClick={() => runContextAction(() => handleAddSegment(contextMenu.targetTime))}><PlusCircle size={16} />{t("addClip")}</button> : null}
              <button type="button" role="menuitem" onClick={() => runContextAction(() => toggleTrackVisibility(contextMenu.track))}>{trackVisibility[contextMenu.track] ? <EyeSlash size={16} /> : <Eye size={16} />}{t(trackVisibility[contextMenu.track] ? "hideTrack" : "showTrack")}</button>
              <button type="button" role="menuitem" onClick={() => runContextAction(() => toggleTrackLock(contextMenu.track))}>{trackLocks[contextMenu.track] ? <LockKeyOpen size={16} /> : <LockKey size={16} />}{t(trackLocks[contextMenu.track] ? "unlockTrack" : "lockTrack")}</button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
