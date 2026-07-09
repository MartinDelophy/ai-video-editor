import { useEffect, useMemo, useRef, useState } from "react";

import {
  ASSET_DRAG_MIME,
  DEFAULT_SCRIPT,
  FILTER_OPTIONS,
  IMAGE_RESIZE_OVERFLOW_SECONDS_PER_PIXEL,
  IMAGE_SEGMENT_SECONDS,
  IMAGE_SNAP_THRESHOLD_PIXELS,
  MAX_TIMELINE_DURATION_SECONDS,
  MIN_VISUAL_SEGMENT_SECONDS,
  MODEL_ID,
  RATIO_OPTIONS,
  SAMPLE_IMAGE,
  STICKERS,
  SUPPORTED_MEDIA_TYPES,
  TOOL_RAIL,
  VISUAL_STYLE_OPTIONS,
  VOICES,
} from "./config/editor.js";
import { LanguageIntro, MediaPanel, ToolPanel } from "./components/panels.jsx";
import { PreviewStage } from "./components/PreviewStage.jsx";
import { VoicePanel } from "./components/VoicePanel.jsx";
import { Timeline } from "./components/Timeline.jsx";
import { Topbar } from "./components/Topbar.jsx";
import { createTranslator, getStoredLanguage, saveLanguagePreference, translateOptionName } from "./i18n.js";
import {
  createCaptionSegments,
  createVisualSegment,
  estimateDuration,
  formatClock,
  formatSavedTime,
  formatTime,
  getCaptionScript,
  getCaptionTimeline,
  getImageThumbnailCount,
  getScriptSegments,
  getSegmentIndexAtTime,
  getSegmentStartTime,
  getVisualAssetPayload,
  getVisualSegmentIndexAtTime,
  getVisualSegmentTimeline,
  getVisualSegmentsTotal,
  makeId,
  reorderTimelineItems,
} from "./lib/timeline.js";
import {
  decodeWaveform,
  downloadBlob,
  exportBrowserVideo,
  extractAudioFromVideo,
  getAudioRecordingFormat,
  transcodeWebmToMp4,
} from "./lib/media.js";

export function App() {
  const [uiLanguage, setUiLanguage] = useState(() => getStoredLanguage());
  const [introClosing, setIntroClosing] = useState(false);
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [selectedVoiceId, setSelectedVoiceId] = useState(VOICES[0].id);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [imageSrc, setImageSrc] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageMeta, setImageMeta] = useState("");
  const [visualType, setVisualType] = useState("image");
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioDuration, setAudioDuration] = useState(estimateDuration(DEFAULT_SCRIPT));
  const [peaks, setPeaks] = useState([]);
  const [musicBlob, setMusicBlob] = useState(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicName, setMusicName] = useState("");
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicPeaks, setMusicPeaks] = useState([]);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [sourceAudioBlob, setSourceAudioBlob] = useState(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState("");
  const [sourceAudioName, setSourceAudioName] = useState("");
  const [sourceAudioDuration, setSourceAudioDuration] = useState(0);
  const [sourceAudioPeaks, setSourceAudioPeaks] = useState([]);
  const [sourceAudioVolume, setSourceAudioVolume] = useState(1);
  const [status, setStatus] = useState("ready");
  const [statusText, setStatusText] = useState("模型待命");
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedAssetId, setDraggedAssetId] = useState("");
  const [assetDropTargetTrack, setAssetDropTargetTrack] = useState("");
  const [assetDropPosition, setAssetDropPosition] = useState({ track: "", percent: 50 });
  const [assetDropPulseTrack, setAssetDropPulseTrack] = useState("");
  const [assetDragPreview, setAssetDragPreview] = useState(null);
  const [selectedLibraryAssetId, setSelectedLibraryAssetId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportPhase, setExportPhase] = useState("");
  const [exportElapsedSeconds, setExportElapsedSeconds] = useState(0);
  const [activeTool, setActiveTool] = useState("media");
  const [mediaTab, setMediaTab] = useState("upload");
  const [voiceTab, setVoiceTab] = useState("synthesis");
  const [voiceFilter, setVoiceFilter] = useState("all");
  const [showVoiceFilter, setShowVoiceFilter] = useState(false);
  const [ratioId, setRatioId] = useState("16:9");
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [fitMode, setFitMode] = useState("contain");
  const [showSettings, setShowSettings] = useState(false);
  const [compactRail, setCompactRail] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("image");
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [trackVisibility, setTrackVisibility] = useState({
    image: true,
    caption: true,
    source: true,
    audio: true,
    music: true,
  });
  const [trackLocks, setTrackLocks] = useState({
    image: false,
    caption: false,
    source: false,
    audio: false,
    music: false,
  });
  const [captionPosition, setCaptionPosition] = useState("bottom");
  const [captionPlacement, setCaptionPlacement] = useState({ x: 50, y: 78 });
  const [captionSize, setCaptionSize] = useState(28);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionSegments, setCaptionSegments] = useState(() => createCaptionSegments(DEFAULT_SCRIPT));
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [imageClipCount, setImageClipCount] = useState(0);
  const [imageDuration, setImageDuration] = useState(0);
  const [visualSegments, setVisualSegments] = useState([]);
  const [selectedVisualSegmentId, setSelectedVisualSegmentId] = useState("");
  const [timelineClipDrag, setTimelineClipDrag] = useState(null);
  const [snapGuide, setSnapGuide] = useState(null);
  const [selectedFilterId, setSelectedFilterId] = useState("none");
  const [selectedTransitionId, setSelectedTransitionId] = useState("none");
  const [selectedStickerId, setSelectedStickerId] = useState("none");
  const [userAssets, setUserAssets] = useState([]);
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState(["zh_CN-huayan-medium"]);
  const [historyItems, setHistoryItems] = useState([]);
  const [recordedVoices, setRecordedVoices] = useState([]);
  const [recordingState, setRecordingState] = useState("idle");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [toast, setToast] = useState("");
  const [lastSaved, setLastSaved] = useState(formatSavedTime());
  const [previewFrameSize, setPreviewFrameSize] = useState({ width: 0, height: 0 });

  const fileInputRef = useRef(null);
  const previewShellRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const audioRef = useRef(null);
  const sourceAudioRef = useRef(null);
  const musicRef = useRef(null);
  const previewVideoRef = useRef(null);
  const trackScrollRef = useRef(null);
  const timelineDurationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const visualPlaybackFrameRef = useRef(0);
  const visualPlaybackStartedAtRef = useRef(0);
  const visualPlaybackStartTimeRef = useRef(0);
  const audioUrlRef = useRef("");
  const sourceAudioUrlRef = useRef("");
  const musicUrlRef = useRef("");
  const imageUrlRefs = useRef(new Set());
  const toastTimerRef = useRef(0);
  const exportStartRef = useRef(0);
  const voiceRecorderRef = useRef(null);
  const voiceRecorderChunksRef = useRef([]);
  const voiceRecorderStreamRef = useRef(null);
  const voiceRecorderStartedAtRef = useRef(0);
  const voiceRecorderTimerRef = useRef(0);
  const draggedAssetIdRef = useRef("");
  const pointerAssetDragRef = useRef(null);
  const suppressAssetClickRef = useRef("");
  const assetDropPulseTimerRef = useRef(0);
  const timelineClipDragRef = useRef(null);
  const suppressTimelineClipClickRef = useRef("");
  const activeLanguage = uiLanguage || "zh";
  const t = useMemo(() => createTranslator(activeLanguage), [activeLanguage]);
  const trOption = (name) => translateOptionName(activeLanguage, name);
  const shouldShowLanguageIntro = !uiLanguage;

  const selectedVoice = useMemo(
    () => VOICES.find((voice) => voice.id === selectedVoiceId) ?? VOICES[0],
    [selectedVoiceId],
  );

  const ratio = useMemo(
    () => RATIO_OPTIONS.find((option) => option.id === ratioId) ?? RATIO_OPTIONS[0],
    [ratioId],
  );

  const selectedFilter = useMemo(
    () => VISUAL_STYLE_OPTIONS.find((filter) => filter.id === selectedFilterId) ?? FILTER_OPTIONS[0],
    [selectedFilterId],
  );

  const selectedSticker = useMemo(
    () => STICKERS.find((sticker) => sticker.id === selectedStickerId) ?? STICKERS[0],
    [selectedStickerId],
  );

  const segments = useMemo(() => captionSegments.map((segment) => segment.text), [captionSegments]);
  const captionTargetDuration = audioBlob ? audioDuration : 0;
  const captionTimeline = useMemo(
    () => getCaptionTimeline(captionSegments, captionTargetDuration),
    [captionSegments, captionTargetDuration],
  );
  const visualTimeline = useMemo(() => getVisualSegmentTimeline(visualSegments), [visualSegments]);
  const estimatedDuration = useMemo(
    () =>
      Math.max(
        audioBlob ? audioDuration : 0,
        sourceAudioBlob ? sourceAudioDuration : 0,
        musicBlob ? musicDuration : 0,
        estimateDuration(script),
        imageSrc ? imageDuration : 0,
      ),
    [
      audioBlob,
      audioDuration,
      imageDuration,
      imageSrc,
      musicBlob,
      musicDuration,
      script,
      sourceAudioBlob,
      sourceAudioDuration,
    ],
  );
  const timelineDuration = useMemo(
    () =>
      estimatedDuration > 0
        ? Math.min(MAX_TIMELINE_DURATION_SECONDS, Math.max(10, estimatedDuration))
        : 0,
    [estimatedDuration],
  );
  timelineDurationRef.current = timelineDuration;
  const currentSegmentIndex = getSegmentIndexAtTime(
    captionSegments,
    currentTime,
    captionTargetDuration,
  );
  const selectedSegmentIndex = Math.max(
    0,
    captionSegments.findIndex((segment) => segment.id === selectedSegmentId),
  );
  const focusedSegmentIndex =
    currentSegmentIndex >= 0 ? currentSegmentIndex : Math.max(0, selectedSegmentIndex);
  const currentCaptionSegment =
    currentSegmentIndex >= 0 ? captionSegments[currentSegmentIndex] ?? null : null;
  const selectedCaptionSegment =
    captionSegments.find((segment) => segment.id === selectedSegmentId) ??
    currentCaptionSegment;
  const currentCaption = currentCaptionSegment && !currentCaptionSegment.hidden ? currentCaptionSegment.text : "";
  const currentVisualSegmentIndex = getVisualSegmentIndexAtTime(visualSegments, currentTime);
  const currentVisualSegment =
    currentVisualSegmentIndex >= 0 ? visualSegments[currentVisualSegmentIndex] ?? null : null;
  const currentVisualRange =
    currentVisualSegmentIndex >= 0 ? visualTimeline[currentVisualSegmentIndex] ?? null : null;
  const previewVisualSegment = currentVisualSegment ?? visualSegments[0] ?? null;
  const previewVisualSrc = previewVisualSegment?.src || imageSrc;
  const previewVisualType = previewVisualSegment?.type || visualType;
  const previewVisualLocalTime = currentVisualRange
    ? Math.max(0, currentTime - currentVisualRange.start)
    : currentTime;
  const selectedVisualSegmentIndex = Math.max(
    0,
    visualSegments.findIndex((segment) => segment.id === selectedVisualSegmentId),
  );
  const hasPlayableVisualTimeline = Boolean(
    previewVisualSrc && trackVisibility.image && imageDuration > 0,
  );
  const hasPlayableAudioTimeline = Boolean(
    (trackVisibility.audio && audioBlob && audioUrl) ||
      (trackVisibility.source && sourceAudioBlob && sourceAudioUrl) ||
      (trackVisibility.music && musicBlob && musicUrl),
  );
  const canPreview = hasPlayableVisualTimeline || hasPlayableAudioTimeline;

  const filteredVoices = useMemo(() => {
    return VOICES.filter((voice) => {
      if (voiceFilter === "all") return true;
      if (voiceFilter === "中文") return voice.language === "中文";
      if (voiceFilter === "English") return voice.language === "English";
      return voice.engine === voiceFilter;
    });
  }, [voiceFilter]);

  const builtInAssets = useMemo(
    () => [
      {
        id: "sample",
        type: "image",
        src: SAMPLE_IMAGE,
        name: "sample-portrait.png",
        meta: "1920 x 1080",
      },
    ],
    [],
  );

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = speed;
    }
  }, [volume, speed, audioUrl]);

  useEffect(() => {
    if (sourceAudioRef.current) {
      sourceAudioRef.current.volume = sourceAudioVolume;
    }
  }, [sourceAudioVolume, sourceAudioUrl]);

  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.volume = musicVolume;
    }
  }, [musicVolume, musicUrl]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const shell = previewShellRef.current;
    if (!shell) {
      return undefined;
    }

    const updatePreviewFrameSize = () => {
      const style = window.getComputedStyle(shell);
      const availableWidth = Math.max(
        1,
        shell.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0"),
      );
      const availableHeight = Math.max(
        1,
        shell.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0"),
      );
      const ratioValue = ratio.width / ratio.height;
      const widthFromHeight = availableHeight * ratioValue;
      const nextWidth = Math.max(1, Math.floor(Math.min(availableWidth, widthFromHeight)));
      const nextHeight = Math.max(1, Math.floor(nextWidth / ratioValue));

      setPreviewFrameSize((size) =>
        size.width === nextWidth && size.height === nextHeight
          ? size
          : { width: nextWidth, height: nextHeight },
      );
    };

    updatePreviewFrameSize();

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(updatePreviewFrameSize);
      observer.observe(shell);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updatePreviewFrameSize);
    return () => window.removeEventListener("resize", updatePreviewFrameSize);
  }, [ratio.width, ratio.height, compactRail]);

  useEffect(() => {
    if (!exporting) {
      return undefined;
    }

    const updateElapsed = () => {
      const startedAt = exportStartRef.current || performance.now();
      setExportElapsedSeconds((performance.now() - startedAt) / 1000);
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(timer);
  }, [exporting]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || previewVisualType !== "video") {
      return;
    }

    const boundedTime = Math.min(Math.max(0, previewVisualLocalTime), video.duration || previewVisualLocalTime);
    if (Number.isFinite(boundedTime) && Math.abs(video.currentTime - boundedTime) > 0.2) {
      video.currentTime = boundedTime;
    }
  }, [previewVisualLocalTime, previewVisualSrc, previewVisualType]);

  useEffect(() => {
    if (!isPlaying || hasPlayableAudioTimeline || !hasPlayableVisualTimeline || imageDuration <= 0) {
      return undefined;
    }

    const startTime =
      currentTimeRef.current >= imageDuration - 0.02 ? 0 : Math.max(0, currentTimeRef.current);
    if (startTime !== currentTimeRef.current) {
      setCurrentTime(startTime);
      currentTimeRef.current = startTime;
    }

    visualPlaybackStartTimeRef.current = startTime;
    visualPlaybackStartedAtRef.current = performance.now();

    const tick = (now) => {
      const elapsedSeconds = (now - visualPlaybackStartedAtRef.current) / 1000;
      const nextTime = Math.min(
        imageDuration,
        visualPlaybackStartTimeRef.current + elapsedSeconds,
      );
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);

      if (nextTime >= imageDuration) {
        previewVideoRef.current?.pause();
        setIsPlaying(false);
        visualPlaybackFrameRef.current = 0;
        return;
      }

      visualPlaybackFrameRef.current = window.requestAnimationFrame(tick);
    };

    visualPlaybackFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (visualPlaybackFrameRef.current) {
        window.cancelAnimationFrame(visualPlaybackFrameRef.current);
        visualPlaybackFrameRef.current = 0;
      }
    };
  }, [hasPlayableAudioTimeline, hasPlayableVisualTimeline, imageDuration, isPlaying]);

  useEffect(() => {
    setCurrentTime((time) => {
      const clamped = Math.min(time, estimatedDuration);
      if (audioRef.current && clamped !== time) {
        audioRef.current.currentTime = clamped;
      }
      if (sourceAudioRef.current && clamped !== time) {
        sourceAudioRef.current.currentTime = clamped;
      }
      if (musicRef.current && clamped !== time) {
        musicRef.current.currentTime = clamped;
      }
      return clamped;
    });
  }, [estimatedDuration]);

  useEffect(() => {
    if (!captionSegments.length) {
      setSelectedSegmentId("");
      return;
    }

    if (!captionSegments.some((segment) => segment.id === selectedSegmentId)) {
      setSelectedSegmentId(captionSegments[0].id);
    }
  }, [captionSegments, selectedSegmentId]);

  useEffect(() => {
    if (!visualSegments.length) {
      setSelectedVisualSegmentId("");
      return;
    }

    if (!visualSegments.some((segment) => segment.id === selectedVisualSegmentId)) {
      setSelectedVisualSegmentId(visualSegments[0].id);
    }
  }, [selectedVisualSegmentId, visualSegments]);

  useEffect(() => {
    if (currentVisualSegment?.src) {
      setCurrentVisualAsset(currentVisualSegment);
    }
  }, [currentVisualSegment?.id]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (
        isTyping ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (event.key !== "Delete" && event.key !== "Backspace")
      ) {
        return;
      }

      const hasSelectedTimelineItem =
        (selectedTrack === "caption" && captionSegments.length > 0) ||
        (selectedTrack === "image" && imageSrc && imageClipCount > 0) ||
        (selectedTrack === "audio" && audioBlob) ||
        (selectedTrack === "source" && sourceAudioBlob) ||
        (selectedTrack === "music" && musicBlob);

      if (hasSelectedTimelineItem) {
        event.preventDefault();
        handleDeleteTrack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setLastSaved(formatSavedTime()), 450);
    return () => window.clearTimeout(timer);
  }, [
    script,
    imageSrc,
    visualType,
    imageDuration,
    captionPlacement,
    selectedVoiceId,
    speed,
    volume,
    musicName,
    musicDuration,
    musicVolume,
    sourceAudioName,
    sourceAudioDuration,
    sourceAudioVolume,
    ratioId,
    fitMode,
    selectedFilterId,
    selectedStickerId,
    captionSegments,
    visualSegments,
    timelineZoom,
  ]);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      if (sourceAudioUrlRef.current) {
        URL.revokeObjectURL(sourceAudioUrlRef.current);
      }
      if (musicUrlRef.current) {
        URL.revokeObjectURL(musicUrlRef.current);
      }
      imageUrlRefs.current.forEach((url) => URL.revokeObjectURL(url));
      imageUrlRefs.current.clear();
      voiceRecorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.clearInterval(voiceRecorderTimerRef.current);
      window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  function notify(message) {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }

  function selectTool(toolId) {
    setActiveTool(toolId);
    if (toolId === "audio") {
      setVoiceTab("synthesis");
    }
  }

  function chooseInterfaceLanguage(languageId) {
    saveLanguagePreference(languageId);
    setIntroClosing(true);
    window.setTimeout(() => {
      setUiLanguage(languageId);
      setIntroClosing(false);
    }, 520);
  }

  function pushScriptHistory(previousScript) {
    setUndoStack((stack) => {
      if (stack.at(-1) === previousScript) {
        return stack;
      }
      return [...stack.slice(-30), previousScript];
    });
    setRedoStack([]);
  }

  function updateScript(nextScript) {
    pushScriptHistory(script);
    setScript(nextScript);
    const nextSegments = createCaptionSegments(nextScript);
    setCaptionSegments(nextSegments);
    setSelectedSegmentId(nextSegments[0]?.id ?? "");
    if (!audioBlob) {
      setAudioDuration(estimateDuration(nextScript));
    }
  }

  function updateCaptionSegmentText(segmentId, text) {
    if (trackLocks.caption) {
      notify("字幕轨已锁定，无法编辑");
      return;
    }

    setCaptionSegments((items) => {
      const nextSegments = items.map((segment) =>
        segment.id === segmentId ? { ...segment, text } : segment,
      );
      const nextScript = getCaptionScript(nextSegments);
      setScript(nextScript);
      if (!audioBlob) {
        setAudioDuration(estimateDuration(nextScript));
      }
      return nextSegments;
    });
  }

  function toggleCaptionSegmentHidden(segmentId) {
    if (trackLocks.caption) {
      notify("字幕轨已锁定，无法隐藏");
      return;
    }

    setCaptionSegments((items) =>
      items.map((segment) =>
        segment.id === segmentId ? { ...segment, hidden: !segment.hidden } : segment,
      ),
    );
    notify("字幕显示状态已更新");
  }

  function handleCaptionPositionChange(position) {
    const placementMap = {
      top: { x: 50, y: 18 },
      middle: { x: 50, y: 50 },
      bottom: { x: 50, y: 78 },
    };
    setCaptionPosition(position);
    setCaptionPlacement(placementMap[position] ?? placementMap.bottom);
  }

  function startCaptionDrag(event) {
    if (event.button !== 0) {
      return;
    }

    if (trackLocks.caption) {
      notify("字幕轨已锁定，无法拖动");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectedTrack("caption");
    if (currentCaptionSegment) {
      setSelectedSegmentId(currentCaptionSegment.id);
    }

    const applyPlacement = (clientX, clientY) => {
      const rect = previewCanvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const x = Math.max(10, Math.min(90, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.max(10, Math.min(90, ((clientY - rect.top) / rect.height) * 100));
      setCaptionPlacement({ x, y });
      setCaptionPosition("custom");
    };

    applyPlacement(event.clientX, event.clientY);

    const handlePointerMove = (moveEvent) => {
      applyPlacement(moveEvent.clientX, moveEvent.clientY);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      notify("字幕位置已调整");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function commitCaptionSegments(nextSegments, message, nextSelectedIndex = 0) {
    if (trackLocks.caption) {
      notify("字幕轨已锁定，无法修改片段");
      return;
    }

    const normalized = nextSegments;
    const nextScript = getCaptionScript(normalized);
    pushScriptHistory(script);
    setRedoStack([]);
    setCaptionSegments(normalized);
    setScript(nextScript);
    setSelectedTrack("caption");
    setSelectedSegmentId(
      normalized.length
        ? normalized[Math.min(nextSelectedIndex, normalized.length - 1)]?.id ?? ""
        : "",
    );
    if (!audioBlob) {
      setAudioDuration(estimateDuration(nextScript));
    }
    notify(message);
  }

  function deleteCaptionSegment(segmentId = selectedSegmentId) {
    if (trackLocks.caption) {
      notify("字幕轨已锁定，无法删除");
      return;
    }

    if (!captionSegments.length) {
      notify("当前没有字幕片段可删除");
      return;
    }

    const fallbackIndex = focusedSegmentIndex >= 0 ? focusedSegmentIndex : 0;
    const segmentIndex = captionSegments.findIndex((segment) => segment.id === segmentId);
    const index = segmentIndex >= 0 ? segmentIndex : fallbackIndex;
    const nextSegments = captionSegments.filter((_, currentIndex) => currentIndex !== index);
    commitCaptionSegments(nextSegments, "已删除当前字幕片段", Math.max(0, index - 1));
  }

  function getTimelineReorderIndex(track, clientX, clientY) {
    const trackElement = document.querySelector(`[data-timeline-reorder-track="${track}"]`);
    if (!trackElement) {
      return timelineClipDragRef.current?.overIndex ?? 0;
    }

    const trackRect = trackElement.getBoundingClientRect();
    if (clientY < trackRect.top - 28 || clientY > trackRect.bottom + 28) {
      return timelineClipDragRef.current?.overIndex ?? 0;
    }

    const segmentElements = Array.from(
      trackElement.querySelectorAll(`[data-timeline-segment-track="${track}"]`),
    );
    if (!segmentElements.length) {
      return 0;
    }

    for (let index = 0; index < segmentElements.length; index += 1) {
      const rect = segmentElements[index].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        return index;
      }
    }

    return segmentElements.length - 1;
  }

  function commitTimelineClipReorder(track, fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return;
    }

    if (track === "image") {
      const sourceSegments = visualSegments.length
        ? visualSegments
        : renderedVisualSegments;
      if (sourceSegments.length < 2) {
        return;
      }

      const nextSegments = reorderTimelineItems(sourceSegments, fromIndex, toIndex);
      commitVisualSegments(nextSegments, "已调整视觉片段顺序", toIndex);
      seekTo(getVisualSegmentTimeline(nextSegments)[toIndex]?.start ?? 0);
      return;
    }

    if (track === "caption") {
      if (captionSegments.length < 2) {
        return;
      }

      const nextSegments = reorderTimelineItems(captionSegments, fromIndex, toIndex);
      commitCaptionSegments(nextSegments, "已调整字幕片段顺序", toIndex);
      seekTo(getSegmentStartTime(nextSegments, toIndex, captionTargetDuration));
    }
  }

  function startTimelineClipDrag(event, track, segmentId, index) {
    if (
      event.button !== 0 ||
      event.target.closest(".image-resize-handle")
    ) {
      return;
    }

    if (trackLocks[track]) {
      notify(track === "image" ? "图片轨已锁定，无法拖动片段" : "字幕轨已锁定，无法拖动片段");
      return;
    }

    if (track === "image") {
      setSelectedTrack("image");
      setSelectedVisualSegmentId(segmentId);
    } else {
      setSelectedTrack("caption");
      setSelectedSegmentId(segmentId);
    }

    const segmentCount = track === "image" ? renderedVisualSegments.length : captionSegments.length;
    if (segmentCount < 2) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dragState = {
      track,
      segmentId,
      fromIndex: index,
      overIndex: index,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    timelineClipDragRef.current = dragState;
    setTimelineClipDrag(dragState);

    const handlePointerMove = (moveEvent) => {
      const state = timelineClipDragRef.current;
      if (!state || state.segmentId !== segmentId) {
        return;
      }

      const distance = Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY);
      if (!state.dragging && distance < 6) {
        return;
      }

      const overIndex = Math.max(
        0,
        Math.min(segmentCount - 1, getTimelineReorderIndex(track, moveEvent.clientX, moveEvent.clientY)),
      );
      const nextState = {
        ...state,
        overIndex,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        dragging: true,
      };
      timelineClipDragRef.current = nextState;
      setTimelineClipDrag(nextState);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      const state = timelineClipDragRef.current;
      timelineClipDragRef.current = null;
      setTimelineClipDrag(null);
      if (!state?.dragging) {
        return;
      }

      suppressTimelineClipClickRef.current = segmentId;
      window.setTimeout(() => {
        if (suppressTimelineClipClickRef.current === segmentId) {
          suppressTimelineClipClickRef.current = "";
        }
      }, 120);

      commitTimelineClipReorder(track, state.fromIndex, state.overIndex);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function undo() {
    setUndoStack((stack) => {
      const previous = stack.at(-1);
      if (!previous) {
        notify("没有可撤销的文本操作");
        return stack;
      }
      setRedoStack((redo) => [...redo, script]);
      setScript(previous);
      const previousSegments = createCaptionSegments(previous);
      setCaptionSegments(previousSegments);
      setSelectedSegmentId(previousSegments[0]?.id ?? "");
      setAudioDuration(estimateDuration(previous));
      notify("已撤销文本修改");
      return stack.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((stack) => {
      const next = stack.at(-1);
      if (!next) {
        notify("没有可重做的文本操作");
        return stack;
      }
      setUndoStack((undoHistory) => [...undoHistory, script]);
      setScript(next);
      const nextSegments = createCaptionSegments(next);
      setCaptionSegments(nextSegments);
      setSelectedSegmentId(nextSegments[0]?.id ?? "");
      setAudioDuration(estimateDuration(next));
      notify("已重做文本修改");
      return stack.slice(0, -1);
    });
  }

  function replaceAudio(blob, duration, nextPeaks, nextStatusText) {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(blob);
    audioUrlRef.current = nextUrl;
    setAudioBlob(blob);
    setAudioUrl(nextUrl);
    setAudioDuration(duration || estimateDuration(script));
    setPeaks(nextPeaks);
    setCurrentTime(0);
    setStatus("done");
    setStatusText(nextStatusText);
    setProgress(100);
  }

  function clearAudioTrack(message = "配音音频已从时间线移除") {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = "";
    }
    setAudioBlob(null);
    setAudioUrl("");
    setPeaks([]);
    setAudioDuration(estimateDuration(script));
    setCurrentTime(0);
    setIsPlaying(false);
    setStatus("ready");
    setStatusText("音频轨已清空");
    notify(message);
  }

  function replaceMusic(blob, duration, nextPeaks, nextName, message = "背景音乐已添加到时间线") {
    if (musicUrlRef.current) {
      URL.revokeObjectURL(musicUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(blob);
    musicUrlRef.current = nextUrl;
    setMusicBlob(blob);
    setMusicUrl(nextUrl);
    setMusicName(nextName);
    setMusicDuration(duration || 0);
    setMusicPeaks(nextPeaks);
    setSelectedTrack("music");
    setActiveTool("audio");
    notify(message);
  }

  function replaceSourceAudio(blob, duration, nextPeaks, nextName, message = "视频原声已分离到时间线") {
    if (sourceAudioUrlRef.current) {
      URL.revokeObjectURL(sourceAudioUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(blob);
    sourceAudioUrlRef.current = nextUrl;
    setSourceAudioBlob(blob);
    setSourceAudioUrl(nextUrl);
    setSourceAudioName(nextName);
    setSourceAudioDuration(duration || 0);
    setSourceAudioPeaks(nextPeaks);
    setSourceAudioVolume(1);
    setSelectedTrack("source");
    setActiveTool("audio");
    setStatus("done");
    setStatusText("视频原声已分离");
    setProgress(100);
    notify(message);
  }

  function clearSourceAudioTrack(message = "视频原声已从时间线移除") {
    if (sourceAudioRef.current) {
      sourceAudioRef.current.pause();
    }
    if (sourceAudioUrlRef.current) {
      URL.revokeObjectURL(sourceAudioUrlRef.current);
      sourceAudioUrlRef.current = "";
    }
    setSourceAudioBlob(null);
    setSourceAudioUrl("");
    setSourceAudioName("");
    setSourceAudioDuration(0);
    setSourceAudioPeaks([]);
    setCurrentTime((time) =>
      Math.min(
        time,
        Math.max(
          audioBlob ? audioDuration : 0,
          musicBlob ? musicDuration : 0,
          imageSrc ? imageDuration : 0,
          estimateDuration(script),
        ),
      ),
    );
    setIsPlaying(false);
    setSelectedTrack("source");
    if (message) {
      notify(message);
    }
  }

  function clearMusicTrack(message = "背景音乐已从时间线移除") {
    if (musicRef.current) {
      musicRef.current.pause();
    }
    if (musicUrlRef.current) {
      URL.revokeObjectURL(musicUrlRef.current);
      musicUrlRef.current = "";
    }
    setMusicBlob(null);
    setMusicUrl("");
    setMusicName("");
    setMusicDuration(0);
    setMusicPeaks([]);
    setCurrentTime((time) =>
      Math.min(
        time,
        Math.max(
          audioBlob ? audioDuration : 0,
          sourceAudioBlob ? sourceAudioDuration : 0,
          imageSrc ? imageDuration : 0,
          estimateDuration(script),
        ),
      ),
    );
    setIsPlaying(false);
    setSelectedTrack("music");
    notify(message);
  }

  function getVisualDurationForAsset(asset, fallbackDuration = 4) {
    if (asset?.type === "video" && asset.duration) {
      return Math.min(MAX_TIMELINE_DURATION_SECONDS, Math.max(MIN_VISUAL_SEGMENT_SECONDS, asset.duration));
    }

    return Math.min(
      MAX_TIMELINE_DURATION_SECONDS,
      Math.max(MIN_VISUAL_SEGMENT_SECONDS, asset?.duration || fallbackDuration),
    );
  }

  function getCurrentVisualAssetSnapshot() {
    return {
      id: previewVisualSegment?.assetId || "",
      assetId: previewVisualSegment?.assetId || "",
      type: previewVisualSegment?.type || visualType,
      src: previewVisualSegment?.src || imageSrc,
      name: previewVisualSegment?.name || imageName,
      meta: previewVisualSegment?.meta || imageMeta,
      blob: previewVisualSegment?.blob || null,
    };
  }

  function setCurrentVisualAsset(asset) {
    setImageSrc(asset?.src ?? "");
    setImageName(asset?.name ?? "");
    setImageMeta(asset?.meta ?? "");
    setVisualType(asset?.type ?? "image");
  }

  function commitVisualSegments(nextSegments, message, selectedIndex = 0) {
    const normalizedSegments = nextSegments
      .filter((segment) => segment.duration > 0.05)
      .map((segment) => ({
        ...segment,
        duration: Math.max(
          MIN_VISUAL_SEGMENT_SECONDS,
          Math.min(MAX_TIMELINE_DURATION_SECONDS, segment.duration),
        ),
      }));
    const nextDuration = Math.min(
      MAX_TIMELINE_DURATION_SECONDS,
      getVisualSegmentsTotal(normalizedSegments),
    );

    setVisualSegments(normalizedSegments);
    setImageDuration(nextDuration);
    setImageClipCount(getImageThumbnailCount(nextDuration));
    setSelectedTrack("image");
    const selectedSegment = normalizedSegments.length
      ? normalizedSegments[Math.min(Math.max(0, selectedIndex), normalizedSegments.length - 1)]
      : null;
    setSelectedVisualSegmentId(selectedSegment?.id ?? "");
    if (selectedSegment?.src) {
      setCurrentVisualAsset(selectedSegment);
    }
    setCurrentTime((time) => Math.min(time, Math.max(nextDuration, estimateDuration(script))));
    notify(message);
  }

  function replaceVisualTimeline(asset, duration = getVisualDurationForAsset(asset)) {
    const segment = createVisualSegment(duration, asset);
    setCurrentVisualAsset(asset);
    setVisualSegments([segment]);
    setSelectedVisualSegmentId(segment.id);
    setImageDuration(segment.duration);
    setImageClipCount(getImageThumbnailCount(segment.duration));
  }

  function appendVisualAssetToTimeline(asset) {
    if (trackLocks.image) {
      notify("图片轨已锁定，无法添加素材");
      return;
    }

    const sourceSegments = visualSegments.length
      ? visualSegments
      : imageSrc
        ? [createVisualSegment(imageDuration || 4, getCurrentVisualAssetSnapshot())]
        : [];
    const totalDuration = getVisualSegmentsTotal(sourceSegments);
    const availableDuration = MAX_TIMELINE_DURATION_SECONDS - totalDuration;
    if (availableDuration < MIN_VISUAL_SEGMENT_SECONDS) {
      notify("视觉轨道已经达到 30 分钟上限");
      return;
    }

    const segmentDuration = Math.min(getVisualDurationForAsset(asset), availableDuration);
    const nextSegment = createVisualSegment(segmentDuration, asset);
    setCurrentVisualAsset(asset);
    commitVisualSegments(
      [...sourceSegments, nextSegment],
      `${asset.type === "video" ? "视频" : "图片"}素材已追加到图片轨`,
      sourceSegments.length,
    );
    seekTo(totalDuration);
    if (asset.type === "video") {
      extractVideoSourceAudio(asset);
    }
  }

  function updateVisualAssetInTimeline(assetId, updates) {
    if (!assetId) {
      return;
    }

    setVisualSegments((segments) => {
      const nextSegments = segments.map((segment) =>
        segment.assetId === assetId
          ? {
              ...segment,
              ...updates,
              duration: updates.duration
                ? Math.max(MIN_VISUAL_SEGMENT_SECONDS, Math.min(MAX_TIMELINE_DURATION_SECONDS, updates.duration))
                : segment.duration,
            }
          : segment,
      );
      const nextDuration = getVisualSegmentsTotal(nextSegments);
      setImageDuration(nextDuration);
      setImageClipCount(getImageThumbnailCount(nextDuration));
      return nextSegments;
    });

    if (previewVisualSegment?.assetId === assetId || previewVisualSegment?.src === updates.src) {
      setImageMeta(updates.meta ?? imageMeta);
      if (updates.type) {
        setVisualType(updates.type);
      }
    }
  }

  function clearImageTrack(message = "图片素材已从时间线移除") {
    const remainingDuration = Math.max(
      audioBlob ? audioDuration : 0,
      sourceAudioBlob ? sourceAudioDuration : 0,
      musicBlob ? musicDuration : 0,
      estimateDuration(script),
    );
    setImageSrc("");
    setImageName("");
    setImageMeta("");
    setVisualType("image");
    setImageClipCount(0);
    setImageDuration(0);
    setVisualSegments([]);
    setSelectedVisualSegmentId("");
    setCurrentTime((time) => Math.min(time, remainingDuration));
    setSelectedTrack("image");
    notify(message);
  }

  async function commitAudio(blob, nextStatusText) {
    const decoded = await decodeWaveform(blob);
    replaceAudio(blob, decoded.duration, decoded.peaks, nextStatusText);
    setHistoryItems((items) => [
      {
        id: crypto.randomUUID(),
        blob,
        voiceId: selectedVoiceId,
        voiceName: selectedVoice.name,
        script,
        duration: decoded.duration || estimateDuration(script),
        peaks: decoded.peaks,
        createdAt: formatSavedTime(),
      },
      ...items.slice(0, 8),
    ]);
  }

  async function commitRecordedVoice(blob, extension = "webm") {
    setRecordingState("processing");
    setStatus("generating");
    setStatusText(t("recording"));
    setProgress(72);

    try {
      const decoded = await decodeWaveform(blob);
      const createdAt = formatSavedTime();
      const recording = {
        id: crypto.randomUUID(),
        blob,
        name: `${t("recordVoice")} ${createdAt}`,
        duration: decoded.duration,
        peaks: decoded.peaks,
        createdAt,
        extension,
      };

      replaceAudio(blob, decoded.duration, decoded.peaks, t("recordingReady"));
      setRecordedVoices((items) => [recording, ...items.slice(0, 8)]);
      setSelectedTrack("audio");
      setActiveTool("audio");
      setVoiceTab("mine");
      notify(t("recordingReady"));
    } catch (error) {
      console.error(error);
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : t("recordingPermissionDenied"));
      notify(t("recordingPermissionDenied"));
    } finally {
      setRecordingState("idle");
      setProgress(0);
    }
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      notify(t("recordingUnsupported"));
      return;
    }

    if (recordingState === "recording") {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const format = getAudioRecordingFormat();
      const recorder = format?.mimeType
        ? new MediaRecorder(stream, { mimeType: format.mimeType })
        : new MediaRecorder(stream);

      voiceRecorderStreamRef.current = stream;
      voiceRecorderChunksRef.current = [];
      voiceRecorderRef.current = recorder;
      voiceRecorderStartedAtRef.current = performance.now();
      setRecordingElapsed(0);
      setRecordingState("recording");
      setStatus("generating");
      setStatusText(t("recording"));
      setProgress(0);
      setSelectedTrack("audio");
      setActiveTool("audio");
      setVoiceTab("mine");

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          voiceRecorderChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = voiceRecorderChunksRef.current;
        const blob = new Blob(chunks, { type: recorder.mimeType || format?.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        voiceRecorderStreamRef.current = null;
        voiceRecorderRef.current = null;
        window.clearInterval(voiceRecorderTimerRef.current);
        voiceRecorderTimerRef.current = 0;
        setRecordingElapsed((performance.now() - voiceRecorderStartedAtRef.current) / 1000);

        if (blob.size > 0) {
          commitRecordedVoice(blob, format?.extension ?? "webm");
        } else {
          setRecordingState("idle");
          notify(t("recordingPermissionDenied"));
        }
      };

      recorder.start(250);
      voiceRecorderTimerRef.current = window.setInterval(() => {
        setRecordingElapsed((performance.now() - voiceRecorderStartedAtRef.current) / 1000);
      }, 250);
    } catch (error) {
      console.error(error);
      setRecordingState("idle");
      setStatus("error");
      setStatusText(t("recordingPermissionDenied"));
      notify(t("recordingPermissionDenied"));
      voiceRecorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceRecorderStreamRef.current = null;
    }
  }

  function stopVoiceRecording() {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    setRecordingState("processing");
    recorder.stop();
  }

  function useRecordedVoice(recording) {
    replaceAudio(recording.blob, recording.duration, recording.peaks, recording.name);
    setSelectedTrack("audio");
    setActiveTool("audio");
    setVoiceTab("mine");
    notify(t("recordingReady"));
  }

  async function generateVoiceover() {
    const text = script.trim();
    if (!text || status === "generating") {
      return;
    }

    setVoiceTab("synthesis");
    setStatus("generating");
    setStatusText("准备本地模型");
    setProgress(6);

    try {
      let blob;

      if (selectedVoice.engine === "piper") {
        const tts = await import("@diffusionstudio/vits-web");
        setStatusText("下载或读取中文 ONNX 模型");
        blob = await tts.predict(
          {
            text,
            voiceId: selectedVoice.id,
          },
          (event) => {
            if (event?.total) {
              const nextProgress = Math.round((event.loaded / event.total) * 76);
              setProgress(Math.min(88, Math.max(12, nextProgress)));
            }
          },
        );
      } else {
        const { KokoroTTS } = await import("kokoro-js");
        setStatusText("加载 Kokoro 82M q8");
        const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: "q8",
          device: "wasm",
          progress_callback: (event) => {
            if (event?.progress) {
              setProgress(Math.min(86, Math.max(10, Math.round(event.progress))));
            }
          },
        });
        setStatusText("生成英文配音");
        const audio = await tts.generate(text, {
          voice: selectedVoice.id,
          speed,
        });
        blob = audio.toBlob();
      }

      setStatusText("解析音频波形");
      await commitAudio(blob, `${selectedVoice.name} 已生成`);
      notify("配音已生成并写入时间线");
    } catch (error) {
      console.error(error);
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "生成失败，请重试");
      setProgress(0);
    }
  }

  async function extractVideoSourceAudio(asset) {
    if (!asset?.blob) {
      clearSourceAudioTrack(null);
      notify("当前视频素材缺少原文件，无法分离原声");
      return;
    }

    setStatus("generating");
    setStatusText("加载 FFmpeg WASM 分离视频原声");
    setProgress(12);

    try {
      const extractedBlob = await extractAudioFromVideo(asset.blob, asset.name);
      setStatusText("解析视频原声波形");
      setProgress(78);
      const decoded = await decodeWaveform(extractedBlob, 96);

      if (!decoded.duration) {
        throw new Error("视频没有可识别的音频轨");
      }

      replaceSourceAudio(
        extractedBlob,
        decoded.duration,
        decoded.peaks,
        `${asset.name.replace(/\.[^.]+$/, "")} 原声.wav`,
      );
    } catch (error) {
      console.warn(error);
      clearSourceAudioTrack(null);
      setStatus("ready");
      setStatusText("视频未检测到可分离原声");
      setProgress(0);
      notify("视频画面已添加，但没有可分离的原声音轨");
    }
  }

  function findAssetById(assetId) {
    if (!assetId) {
      return null;
    }

    return [...userAssets, ...builtInAssets].find((asset) => asset.id === assetId) ?? null;
  }

  function getDraggedAsset(event) {
    const assetId =
      event.dataTransfer?.getData(ASSET_DRAG_MIME) ||
      event.dataTransfer?.getData("text/plain") ||
      draggedAssetIdRef.current ||
      draggedAssetId;
    return findAssetById(assetId);
  }

  function canDropAssetOnTrack(asset, track) {
    if (!asset || trackLocks[track]) {
      return false;
    }

    if (track === "image") {
      return asset.type === "image" || asset.type === "video";
    }

    if (track === "audio" || track === "music") {
      return asset.type === "audio";
    }

    if (track === "source") {
      return asset.type === "video";
    }

    return false;
  }

  function handleAssetDragStart(event, asset) {
    draggedAssetIdRef.current = asset.id;
    setDraggedAssetId(asset.id);
    setAssetDropTargetTrack("");
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(ASSET_DRAG_MIME, asset.id);
    event.dataTransfer.setData("text/plain", asset.id);
  }

  function handleAssetDragEnd() {
    draggedAssetIdRef.current = "";
    setDraggedAssetId("");
    setAssetDropTargetTrack("");
    setAssetDropPosition({ track: "", percent: 50 });
  }

  function getDropTrackInfoFromPoint(clientX, clientY) {
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    if (!(elementAtPoint instanceof Element)) {
      return { track: "", percent: 50 };
    }

    const trackElement = elementAtPoint.closest("[data-asset-drop-track]");
    const track = trackElement?.dataset.assetDropTrack ?? "";
    if (!track || !(trackElement instanceof HTMLElement)) {
      return { track, percent: 50 };
    }

    const rect = trackElement.getBoundingClientRect();
    const percent = rect.width
      ? Math.max(8, Math.min(92, ((clientX - rect.left) / rect.width) * 100))
      : 50;
    return { track, percent };
  }

  function getDropTrackFromPoint(clientX, clientY) {
    return getDropTrackInfoFromPoint(clientX, clientY).track;
  }

  function triggerAssetDropPulse(track) {
    if (!track) {
      return;
    }

    window.clearTimeout(assetDropPulseTimerRef.current);
    setAssetDropPulseTrack("");
    window.requestAnimationFrame(() => {
      setAssetDropPulseTrack(track);
      assetDropPulseTimerRef.current = window.setTimeout(() => {
        setAssetDropPulseTrack("");
      }, 620);
    });
  }

  function handleAssetPointerDown(event, asset) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest(".asset-delete")) {
      return;
    }

    setSelectedLibraryAssetId(asset.id);
    pointerAssetDragRef.current = {
      assetId: asset.id,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };

    const handlePointerMove = (moveEvent) => {
      const dragState = pointerAssetDragRef.current;
      if (!dragState || dragState.assetId !== asset.id) {
        return;
      }

      const distance = Math.hypot(
        moveEvent.clientX - dragState.startX,
        moveEvent.clientY - dragState.startY,
      );
      if (!dragState.dragging && distance < 7) {
        return;
      }

      moveEvent.preventDefault();

      if (!dragState.dragging) {
        dragState.dragging = true;
        draggedAssetIdRef.current = asset.id;
        setDraggedAssetId(asset.id);
      }

      const dropInfo = getDropTrackInfoFromPoint(moveEvent.clientX, moveEvent.clientY);
      const draggedAsset = findAssetById(dragState.assetId);
      const nextTargetTrack = canDropAssetOnTrack(draggedAsset, dropInfo.track) ? dropInfo.track : "";
      setAssetDropTargetTrack(nextTargetTrack);
      setAssetDropPosition(
        nextTargetTrack
          ? { track: nextTargetTrack, percent: dropInfo.percent }
          : { track: "", percent: 50 },
      );
      setAssetDragPreview({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        src: asset.src,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      });
    };

    const cleanupPointerDrag = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      pointerAssetDragRef.current = null;
      setAssetDragPreview(null);
      setAssetDropTargetTrack("");
      setAssetDropPosition({ track: "", percent: 50 });
      draggedAssetIdRef.current = "";
      setDraggedAssetId("");
    };

    const handlePointerCancel = () => {
      cleanupPointerDrag();
    };

    const handlePointerUp = (upEvent) => {
      const dragState = pointerAssetDragRef.current;
      cleanupPointerDrag();

      if (!dragState?.dragging) {
        return;
      }

      suppressAssetClickRef.current = dragState.assetId;
      window.setTimeout(() => {
        if (suppressAssetClickRef.current === dragState.assetId) {
          suppressAssetClickRef.current = "";
        }
      }, 300);

      const dropTrack = getDropTrackFromPoint(upEvent.clientX, upEvent.clientY);
      const draggedAsset = findAssetById(dragState.assetId);
      if (canDropAssetOnTrack(draggedAsset, dropTrack)) {
        triggerAssetDropPulse(dropTrack);
        void applyAssetToTrack(draggedAsset, dropTrack);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function handleAssetClick(event, asset) {
    if (suppressAssetClickRef.current === asset.id) {
      suppressAssetClickRef.current = "";
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    setSelectedLibraryAssetId(asset.id);
    notify("素材已选中，请拖到对应轨道使用");
  }

  function handleTrackAssetDragOver(event, track) {
    const asset = getDraggedAsset(event);
    if (!canDropAssetOnTrack(asset, track)) {
      if (assetDropTargetTrack === track) {
        setAssetDropTargetTrack("");
        setAssetDropPosition({ track: "", percent: 50 });
      }
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = rect.width
      ? Math.max(8, Math.min(92, ((event.clientX - rect.left) / rect.width) * 100))
      : 50;
    if (assetDropTargetTrack !== track) {
      setAssetDropTargetTrack(track);
    }
    setAssetDropPosition({ track, percent });
  }

  function handleTrackAssetDragLeave(event, track) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    setAssetDropTargetTrack((currentTrack) => (currentTrack === track ? "" : currentTrack));
    setAssetDropPosition((currentPosition) =>
      currentPosition.track === track ? { track: "", percent: 50 } : currentPosition,
    );
  }

  async function applyAssetToTrack(asset, track) {
    if (!canDropAssetOnTrack(asset, track)) {
      notify("请把素材拖到匹配的轨道");
      return;
    }

    setSelectedLibraryAssetId(asset.id);

    if (track === "image") {
      appendVisualAssetToTimeline(asset);
      return;
    }

    if (track === "music") {
      await selectAsset(asset);
      return;
    }

    if (track === "audio") {
      if (!asset.blob) {
        notify("当前音频素材不可用，请重新上传");
        return;
      }

      const decoded = asset.peaks?.length
        ? { duration: asset.duration, peaks: asset.peaks }
        : await decodeWaveform(asset.blob, 96);
      replaceAudio(asset.blob, decoded.duration, decoded.peaks, "音频已写入配音轨");
      setSelectedTrack("audio");
      setActiveTool("audio");
      notify("音频已拖入配音音频轨");
      return;
    }

    if (track === "source") {
      setSelectedTrack("source");
      setActiveTool("audio");
      await extractVideoSourceAudio(asset);
    }
  }

  function handleTrackAssetDrop(event, track) {
    const asset = getDraggedAsset(event);
    if (!canDropAssetOnTrack(asset, track)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    draggedAssetIdRef.current = "";
    setDraggedAssetId("");
    setAssetDropTargetTrack("");
    setAssetDropPosition({ track: "", percent: 50 });
    triggerAssetDropPulse(track);
    void applyAssetToTrack(asset, track);
  }

  async function selectAsset(asset) {
    if (asset.type === "audio") {
      if (!asset.blob) {
        notify("当前音频素材不可用，请重新上传");
        return;
      }
      const decoded = asset.peaks?.length
        ? { duration: asset.duration, peaks: asset.peaks }
        : await decodeWaveform(asset.blob, 96);
      replaceMusic(asset.blob, decoded.duration, decoded.peaks, asset.name);
      return;
    }

    const nextDuration = getVisualDurationForAsset(asset);
    replaceVisualTimeline(asset, nextDuration);
    notify(`${asset.type === "video" ? "视频" : "图片"}素材已应用到预览和时间线`);
    if (asset.type === "video") {
      extractVideoSourceAudio(asset);
    }
  }

  function deleteUserAsset(asset) {
    const hasOtherAssetUsingUrl = userAssets.some(
      (item) => item.id !== asset.id && item.src === asset.src,
    );
    if (selectedLibraryAssetId === asset.id) {
      setSelectedLibraryAssetId("");
    }
    setUserAssets((items) => items.filter((item) => item.id !== asset.id));
    if (!hasOtherAssetUsingUrl && imageUrlRefs.current.has(asset.src)) {
      URL.revokeObjectURL(asset.src);
      imageUrlRefs.current.delete(asset.src);
    }
    if (asset.type === "audio" && asset.blob === musicBlob) {
      clearMusicTrack("背景音乐素材已删除，时间线已同步清空");
    } else if (
      asset.type !== "audio" &&
      (asset.src === imageSrc || visualSegments.some((segment) => segment.assetId === asset.id || segment.src === asset.src))
    ) {
      const nextSegments = visualSegments.filter(
        (segment) => segment.assetId !== asset.id && segment.src !== asset.src,
      );
      if (asset.type === "video" && sourceAudioBlob && asset.src === imageSrc) {
        clearSourceAudioTrack(null);
      }
      if (nextSegments.length) {
        commitVisualSegments(nextSegments, "素材已删除，对应视觉片段已移除");
      } else {
        clearImageTrack("视觉素材已删除，时间线已同步清空");
      }
    } else {
      notify("素材已删除");
    }
  }

  function handleFiles(files) {
    const mediaFiles = Array.from(files ?? []).filter((item) =>
      SUPPORTED_MEDIA_TYPES.some((typePrefix) => item.type.startsWith(typePrefix)),
    );
    if (!mediaFiles.length) {
      notify("请选择图片、视频或音频素材");
      return;
    }

    const uploadedAssets = mediaFiles.map((file) => {
      const url = URL.createObjectURL(file);
      imageUrlRefs.current.add(url);
      const type = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "image";
      return {
        id: crypto.randomUUID(),
        type,
        src: url,
        name: file.name,
        meta: "读取中",
        blob: file,
        duration: type === "video" ? 0 : 4,
      };
    });

    const primaryAsset = uploadedAssets[0];
    setSelectedLibraryAssetId(primaryAsset.id);
    setUserAssets((assets) => [...uploadedAssets, ...assets]);

    uploadedAssets.forEach((asset) => {
      if (asset.type === "audio") {
        decodeWaveform(asset.blob, 96)
          .then((decoded) => {
            const meta = `音频 · ${formatTime(decoded.duration)}`;
            setUserAssets((assets) =>
              assets.map((item) =>
                item.id === asset.id
                  ? { ...item, meta, duration: decoded.duration, peaks: decoded.peaks }
                  : item,
              ),
            );
          })
          .catch(() => {
            setUserAssets((assets) =>
              assets.map((item) => (item.id === asset.id ? { ...item, meta: "音频读取失败" } : item)),
            );
          });
        return;
      }

      if (asset.type === "video") {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          const duration = Math.min(
            MAX_TIMELINE_DURATION_SECONDS,
            Math.max(0.5, video.duration || 1),
          );
          const meta = `${video.videoWidth || "?"} x ${video.videoHeight || "?"} · ${formatClock(duration)}`;
          setUserAssets((assets) =>
            assets.map((item) =>
              item.id === asset.id ? { ...item, meta, duration } : item,
            ),
          );
        };
        video.onerror = () => {
          setUserAssets((assets) =>
            assets.map((item) => (item.id === asset.id ? { ...item, meta: "视频读取失败" } : item)),
          );
        };
        video.src = asset.src;
        return;
      }

      const image = new Image();
      image.onload = () => {
        const meta = `${image.naturalWidth} x ${image.naturalHeight}`;
        setUserAssets((assets) =>
          assets.map((item) => (item.id === asset.id ? { ...item, meta } : item)),
        );
      };
      image.onerror = () => {
        setUserAssets((assets) =>
          assets.map((item) => (item.id === asset.id ? { ...item, meta: "读取失败" } : item)),
        );
      };
      image.src = asset.src;
    });

    notify(
      mediaFiles.length > 1
        ? `已上传 ${mediaFiles.length} 个素材，拖到对应轨道后使用`
        : `${primaryAsset.type === "audio" ? "音频" : primaryAsset.type === "video" ? "视频" : "图片"}已上传到素材库，请拖到轨道使用`,
    );
  }

  function handlePlayToggle() {
    const previewVideo = previewVideoRef.current;
    const voiceAudio = trackVisibility.audio ? audioRef.current : null;
    const sourceAudio = trackVisibility.source ? sourceAudioRef.current : null;
    const musicAudio = trackVisibility.music ? musicRef.current : null;
    const sourceReady = sourceAudio && sourceAudioUrl;
    const musicReady = musicAudio && musicUrl;
    const secondaryAudios = [sourceReady ? sourceAudio : null, musicReady ? musicAudio : null].filter(Boolean);
    const syncMediaTime = (media) => {
      media.currentTime = Math.min(currentTime, media.duration || currentTime);
    };
    const syncPreviewVideoTime = (media) => {
      media.currentTime = Math.min(previewVisualLocalTime, media.duration || previewVisualLocalTime);
    };
    const playPreviewVideo = () => {
      if (previewVisualType === "video" && previewVideo) {
        syncPreviewVideoTime(previewVideo);
        previewVideo.play().catch(() => {});
      }
    };
    const pausePreviewAndAudio = () => {
      secondaryAudios.forEach((audio) => audio.pause());
      previewVideo?.pause();
    };

    if (!voiceAudio || !audioUrl) {
      const masterAudio = sourceReady ? sourceAudio : musicReady ? musicAudio : null;

      if (masterAudio) {
        if (masterAudio.paused) {
          playPreviewVideo();
          secondaryAudios.forEach((audio) => {
            syncMediaTime(audio);
            audio.play().catch(() => {});
          });
        } else {
          pausePreviewAndAudio();
        }
        return;
      }

      if (previewVisualType === "video" && previewVideo) {
        if (previewVideo.paused) {
          playPreviewVideo();
        } else {
          previewVideo.pause();
        }
        return;
      }

      if (hasPlayableVisualTimeline) {
        if (isPlaying) {
          setIsPlaying(false);
          pausePreviewAndAudio();
        } else {
          if (currentTimeRef.current >= imageDuration - 0.02) {
            seekTo(0);
            currentTimeRef.current = 0;
          }
          setIsPlaying(true);
        }
        return;
      }

      notify("请先上传图片/视频素材、生成配音或上传背景音乐");
      return;
    }

    if (voiceAudio.paused) {
      if (currentTimeRef.current >= estimatedDuration - 0.02) {
        seekTo(0);
      }
      syncMediaTime(voiceAudio);
      playPreviewVideo();
      secondaryAudios.forEach((audio) => {
        syncMediaTime(audio);
        audio.play().catch(() => {});
      });
      voiceAudio.play();
    } else {
      voiceAudio.pause();
      pausePreviewAndAudio();
    }
  }

  function seekTo(nextTime) {
    const clamped = Math.max(0, Math.min(estimatedDuration, nextTime));
    currentTimeRef.current = clamped;
    setCurrentTime(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
    if (sourceAudioRef.current) {
      sourceAudioRef.current.currentTime = clamped;
    }
    if (musicRef.current) {
      musicRef.current.currentTime = clamped;
    }
  }

  function getTimelineTimeFromClientX(clientX) {
    const rect = trackScrollRef.current?.getBoundingClientRect();
    const duration = timelineDurationRef.current;
    if (!rect || duration <= 0) {
      return 0;
    }
    const ratioAtPointer = (clientX - rect.left) / Math.max(rect.width, 1);
    return Math.max(0, Math.min(duration, ratioAtPointer * duration));
  }

  function startTimelineSeek(event) {
    if (event.button !== 0 || timelineDuration <= 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    seekTo(getTimelineTimeFromClientX(event.clientX));

    const handlePointerMove = (moveEvent) => {
      seekTo(getTimelineTimeFromClientX(moveEvent.clientX));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function startImageResize(event, segmentId = "", segmentIndex = -1) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (trackLocks.image) {
      notify("图片轨已锁定，无法拉长片段");
      return;
    }

    if (!imageSrc || timelineDuration <= 0) {
      notify("请先上传或选择图片/视频素材");
      return;
    }

    setSelectedTrack("image");

    const rect = trackScrollRef.current?.getBoundingClientRect();
    const startSegments = visualSegments.length
      ? visualSegments
      : [createVisualSegment(imageDuration || 4, getCurrentVisualAssetSnapshot())];
    const segmentIdIndex = startSegments.findIndex((segment) => segment.id === segmentId);
    const resizeSegmentIndex =
      segmentIdIndex >= 0
        ? segmentIdIndex
        : segmentIndex >= 0 && segmentIndex < startSegments.length
          ? segmentIndex
          : Math.max(0, startSegments.length - 1);
    const resizeSegmentId = startSegments[resizeSegmentIndex]?.id ?? "";
    const durationBeforeResizeSegment = getVisualSegmentsTotal(
      startSegments.slice(0, resizeSegmentIndex),
    );
    const durationAfterResizeSegment = getVisualSegmentsTotal(
      startSegments.slice(resizeSegmentIndex + 1),
    );
    const startDuration = Math.max(MIN_VISUAL_SEGMENT_SECONDS, imageDuration);
    const startTimelineDuration = Math.max(
      10,
      startDuration,
      timelineDurationRef.current || timelineDuration,
    );
    setSelectedVisualSegmentId(resizeSegmentId);
    const secondsPerPixel = rect
      ? startTimelineDuration / Math.max(rect.width, 1)
      : IMAGE_RESIZE_OVERFLOW_SECONDS_PER_PIXEL;
    const overflowSecondsPerPixel = Math.max(
      secondsPerPixel,
      IMAGE_RESIZE_OVERFLOW_SECONDS_PER_PIXEL,
    );
    const audioSnapPoint =
      audioBlob && audioDuration > 0
        ? {
            time: Math.min(MAX_TIMELINE_DURATION_SECONDS, audioDuration),
            label: "配音结尾",
          }
        : null;
    const sourceSnapPoint =
      sourceAudioBlob && sourceAudioDuration > 0
        ? {
            time: Math.min(MAX_TIMELINE_DURATION_SECONDS, sourceAudioDuration),
            label: "原声结尾",
          }
        : null;
    const musicSnapPoint =
      musicBlob && musicDuration > 0
        ? {
            time: Math.min(MAX_TIMELINE_DURATION_SECONDS, musicDuration),
            label: "音乐结尾",
          }
        : null;
    let snappedToAudio = false;
    let snappedToSource = false;
    let snappedToMusic = false;

    const applyDurationFromPointer = (clientX) => {
      if (!rect) {
        return;
      }

      const pointerX = clientX - rect.left;
      const inTrackX = Math.max(0, Math.min(rect.width, pointerX));
      const overflowX = Math.max(0, pointerX - rect.width);
      const nextDuration =
        (inTrackX / Math.max(rect.width, 1)) * startTimelineDuration +
        overflowX * overflowSecondsPerPixel;
      const clampedDuration = Math.max(
        0.5,
        Math.min(MAX_TIMELINE_DURATION_SECONDS, nextDuration),
      );
      const snapCandidates = [audioSnapPoint, sourceSnapPoint, musicSnapPoint]
        .filter(Boolean)
        .map((point) => ({
          ...point,
          distance: Math.abs(pointerX - (point.time / startTimelineDuration) * rect.width),
        }))
        .filter((point) => point.distance <= IMAGE_SNAP_THRESHOLD_PIXELS)
        .sort((a, b) => a.distance - b.distance);
      const activeSnapPoint = snapCandidates[0] ?? null;
      const snappedDuration = activeSnapPoint ? activeSnapPoint.time : clampedDuration;
      const maxResizeSegmentDuration = Math.max(
        MIN_VISUAL_SEGMENT_SECONDS,
        MAX_TIMELINE_DURATION_SECONDS - durationBeforeResizeSegment - durationAfterResizeSegment,
      );
      const resizeSegmentDuration = Math.min(
        maxResizeSegmentDuration,
        Math.max(MIN_VISUAL_SEGMENT_SECONDS, snappedDuration - durationBeforeResizeSegment),
      );
      const nextSegments = startSegments.map((segment, index) =>
        index === resizeSegmentIndex ? { ...segment, duration: resizeSegmentDuration } : segment,
      );
      const nextVisualDuration = getVisualSegmentsTotal(nextSegments);
      const nextProjectDuration = Math.max(
        audioBlob ? audioDuration : 0,
        sourceAudioBlob ? sourceAudioDuration : 0,
        musicBlob ? musicDuration : 0,
        estimateDuration(script),
        nextVisualDuration,
      );
      snappedToAudio = activeSnapPoint?.label === "配音结尾";
      snappedToSource = activeSnapPoint?.label === "原声结尾";
      snappedToMusic = activeSnapPoint?.label === "音乐结尾";
      setSnapGuide(activeSnapPoint);
      setVisualSegments(nextSegments);
      setImageDuration(nextVisualDuration);
      setImageClipCount(getImageThumbnailCount(nextVisualDuration));
      setCurrentTime((time) => Math.min(time, nextProjectDuration));
    };

    applyDurationFromPointer(event.clientX);

    const handlePointerMove = (moveEvent) => {
      applyDurationFromPointer(moveEvent.clientX);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setSnapGuide(null);
      notify(
        snappedToAudio
          ? "图片已吸附到配音结尾"
          : snappedToSource
            ? "图片已吸附到视频原声结尾"
          : snappedToMusic
            ? "图片已吸附到音乐结尾"
            : "图片片段时长已调整",
      );
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  async function handleExportVideo() {
    if (exporting) {
      return;
    }

    if (!imageSrc) {
      notify("请先上传或选择图片/视频素材再导出");
      return;
    }

    setExporting(true);
    exportStartRef.current = performance.now();
    setExportElapsedSeconds(0);
    setExportProgress(1);
    setExportPhase("准备导出");
    setStatus("generating");
    const preferredFormat = getSupportedRecordingFormat();
    setStatusText(`录制 ${preferredFormat.label} 视频流`);
    setExportPhase(`录制 ${preferredFormat.label} 视频流`);
    const updateExportProgress = ({ progress: nextProgress, phase }) => {
      setExportProgress((currentProgress) =>
        Math.max(currentProgress, Math.min(100, Math.max(0, Math.round(nextProgress)))),
      );
      if (phase) {
        setExportPhase(phase);
      }
    };
    const finishExportProgress = async (phase) => {
      setExportPhase(phase);
      setExportProgress(100);
      await new Promise((resolve) => {
        window.setTimeout(resolve, 450);
      });
    };

    try {
      const video = await exportBrowserVideo({
        imageSrc,
        visualType,
        visualSegments: renderedVisualSegments,
        audioBlob: trackVisibility.audio ? audioBlob : null,
        voiceVolume: volume,
        sourceAudioBlob: trackVisibility.source ? sourceAudioBlob : null,
        sourceAudioVolume,
        musicBlob: trackVisibility.music ? musicBlob : null,
        musicVolume,
        text: script,
        captionSegments,
        duration: Math.max(
          trackVisibility.audio && audioBlob ? audioDuration : 0,
          trackVisibility.source && sourceAudioBlob ? sourceAudioDuration : 0,
          trackVisibility.music && musicBlob ? musicDuration : 0,
          imageDuration,
          estimateDuration(script),
        ),
        ratio,
        fitMode,
        filter: selectedFilter.css,
        captionsEnabled: captionsEnabled && trackVisibility.caption,
        captionPosition,
        captionPlacement,
        captionSize,
        sticker: selectedSticker,
        transitionId: selectedTransitionId,
        onProgress: updateExportProgress,
      });

      if (video.nativeMp4) {
        updateExportProgress({ progress: 98, phase: "保存 MP4 文件" });
        downloadBlob(video.blob, `ai-voiceover-${ratio.id.replace(":", "x")}.mp4`);
        setStatus("done");
        setStatusText("MP4 已导出");
        await finishExportProgress("导出完成");
        notify("已用浏览器原生 MP4 快速导出");
        return;
      }

      setStatusText("当前浏览器不支持原生 MP4，加载 FFmpeg WASM");
      updateExportProgress({ progress: 95, phase: "加载 FFmpeg 转码器" });

      try {
        setStatusText("转码 MP4");
        updateExportProgress({ progress: 96, phase: "转码 MP4" });
        const mp4 = await transcodeWebmToMp4(video.blob);
        updateExportProgress({ progress: 99, phase: "保存 MP4 文件" });
        downloadBlob(mp4, `ai-voiceover-${ratio.id.replace(":", "x")}.mp4`);
        setStatus("done");
        setStatusText("MP4 已导出");
        await finishExportProgress("导出完成");
        notify("MP4 视频已导出");
      } catch (ffmpegError) {
        console.error(ffmpegError);
        updateExportProgress({ progress: 99, phase: "保存 WebM 兜底文件" });
        downloadBlob(video.blob, `ai-voiceover-${ratio.id.replace(":", "x")}.webm`);
        setStatus("done");
        setStatusText("WebM 兜底已导出");
        await finishExportProgress("WebM 兜底已导出");
        notify("MP4 转码失败，已导出 WebM 兜底");
      }
    } catch (error) {
      console.error(error);
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "视频导出失败");
      setExportPhase("导出失败");
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }

  function handleDeleteTrack() {
    if (trackLocks[selectedTrack]) {
      notify("当前轨道已锁定，无法删除");
      return;
    }

    if (selectedTrack === "caption") {
      handleRemoveSegment();
      return;
    }

    if (selectedTrack === "image") {
      if (!imageSrc || imageClipCount === 0) {
        notify("当前没有视觉片段可删除");
        return;
      }

      const sourceSegments = visualSegments.length
        ? visualSegments
        : [createVisualSegment(imageDuration || 0, getCurrentVisualAssetSnapshot())];
      const index =
        selectedVisualSegmentId && sourceSegments.some((segment) => segment.id === selectedVisualSegmentId)
          ? selectedVisualSegmentIndex
          : currentVisualSegmentIndex >= 0
            ? currentVisualSegmentIndex
            : 0;
      const nextSegments = sourceSegments.filter((_, segmentIndex) => segmentIndex !== index);
      if (nextSegments.length) {
        commitVisualSegments(nextSegments, "已删除当前视觉片段", Math.max(0, index - 1));
      } else {
        clearImageTrack("已删除当前视觉片段");
      }
      return;
    }

    if (selectedTrack === "audio") {
      clearAudioTrack();
      return;
    }

    if (selectedTrack === "source") {
      clearSourceAudioTrack();
      return;
    }

    if (selectedTrack === "music") {
      clearMusicTrack();
      return;
    }

    clearImageTrack();
  }

  function handleDuplicateTrack() {
    if (selectedTrack === "caption") {
      if (!captionSegments.length) {
        notify("当前没有可复制的字幕片段");
        return;
      }
      const index = selectedSegmentId ? selectedSegmentIndex : focusedSegmentIndex;
      const source = captionSegments[index] ?? captionSegments[focusedSegmentIndex];
      const nextSegments = [...captionSegments];
      nextSegments.splice(index + 1, 0, {
        ...source,
        id: makeId("caption"),
        text: `${source.text} 副本`,
      });
      commitCaptionSegments(nextSegments, "已复制当前字幕片段", index + 1);
      return;
    }

    if (selectedTrack === "image") {
      if (!imageSrc) {
        notify("当前没有可复制的图片素材");
        return;
      }
      const sourceSegments = visualSegments.length
        ? visualSegments
        : [createVisualSegment(imageDuration || 4, getCurrentVisualAssetSnapshot())];
      const selectedSegment = sourceSegments[
        selectedVisualSegmentId && sourceSegments.some((segment) => segment.id === selectedVisualSegmentId)
          ? selectedVisualSegmentIndex
          : Math.max(0, currentVisualSegmentIndex)
      ] ?? getCurrentVisualAssetSnapshot();
      setUserAssets((assets) => [
        {
          id: crypto.randomUUID(),
          type: selectedSegment.type || visualType,
          src: selectedSegment.src || imageSrc,
          name: `${(selectedSegment.name || imageName).replace(/\.[^.]+$/, "")}-copy.${
            (selectedSegment.type || visualType) === "video" ? "mp4" : "png"
          }`,
          meta: selectedSegment.meta || imageMeta,
          duration: selectedSegment.duration || imageDuration,
          blob: selectedSegment.blob || null,
        },
        ...assets,
      ]);
      notify("当前图片已复制到我的素材");
      return;
    }

    if (selectedTrack === "music") {
      if (musicBlob) {
        downloadBlob(musicBlob, musicName || "background-music.wav");
        notify("背景音乐副本已下载");
      } else {
        notify("当前没有背景音乐");
      }
      return;
    }

    if (selectedTrack === "source") {
      if (sourceAudioBlob) {
        downloadBlob(sourceAudioBlob, sourceAudioName || "source-audio.wav");
        notify("视频原声副本已下载");
      } else {
        notify("当前没有视频原声");
      }
      return;
    }

    if (audioBlob) {
      downloadBlob(audioBlob, "ai-voiceover-copy.wav");
      notify("当前音频副本已下载");
    } else {
      notify("当前没有可复制的音频");
    }
  }

  function handleCutVisualSegment() {
    if (trackLocks.image) {
      notify("图片轨已锁定，无法剪切");
      return;
    }

    if (!imageSrc) {
      notify("请先上传或选择图片/视频素材");
      return;
    }

    const sourceSegments = visualSegments.length
      ? visualSegments
      : [createVisualSegment(imageDuration || 0, getCurrentVisualAssetSnapshot())];
    const totalDuration = getVisualSegmentsTotal(sourceSegments);
    if (totalDuration < MIN_VISUAL_SEGMENT_SECONDS * 2) {
      notify("当前视觉片段太短，不适合继续剪切");
      return;
    }

    const splitTime = Math.max(0, Math.min(totalDuration, currentTime));
    if (
      splitTime <= MIN_VISUAL_SEGMENT_SECONDS ||
      splitTime >= totalDuration - MIN_VISUAL_SEGMENT_SECONDS
    ) {
      notify("请把播放头放在视觉片段中间再剪切");
      return;
    }

    const timeline = getVisualSegmentTimeline(sourceSegments);
    const segmentIndex = timeline.findIndex(
      (segment) => splitTime > segment.start && splitTime < segment.end,
    );
    const segmentRange = timeline[segmentIndex];
    const source = sourceSegments[segmentIndex];
    if (!source || !segmentRange) {
      notify("请先选中要剪切的视觉片段");
      return;
    }

    const firstDuration = splitTime - segmentRange.start;
    const secondDuration = segmentRange.end - splitTime;
    if (
      firstDuration < MIN_VISUAL_SEGMENT_SECONDS ||
      secondDuration < MIN_VISUAL_SEGMENT_SECONDS
    ) {
      notify("切点离片段边缘太近，先把播放头移到片段中间");
      return;
    }

    const firstSegment = {
      ...source,
      id: makeId("visual"),
      duration: firstDuration,
    };
    const secondSegment = {
      ...source,
      id: makeId("visual"),
      duration: secondDuration,
    };
    const nextSegments = [...sourceSegments];
    nextSegments.splice(segmentIndex, 1, firstSegment, secondSegment);
    commitVisualSegments(nextSegments, "已在播放头位置切开视觉片段", segmentIndex + 1);
  }

  function handleCutCaption() {
    if (trackLocks.caption) {
      notify("字幕轨已锁定，无法剪切");
      return;
    }
    const index = selectedSegmentId ? selectedSegmentIndex : focusedSegmentIndex;
    const source = captionSegments[index];

    if (!source || source.text.length < 6) {
      notify("当前字幕太短，不适合继续拆分");
      return;
    }

    const splitAt = Math.max(2, Math.ceil(source.text.length / 2));
    const nextSegments = [...captionSegments];
    nextSegments.splice(
      index,
      1,
      { ...source, id: makeId("caption"), text: source.text.slice(0, splitAt), weight: Math.max(0.7, source.weight / 2) },
      { ...source, id: makeId("caption"), text: source.text.slice(splitAt), weight: Math.max(0.7, source.weight / 2) },
    );
    commitCaptionSegments(nextSegments, "已把当前字幕片段拆成两段", index + 1);
  }

  function handleCutTrack() {
    if (selectedTrack === "image") {
      handleCutVisualSegment();
      return;
    }

    if (selectedTrack === "caption") {
      handleCutCaption();
      return;
    }

    notify("当前轨道暂不支持剪切片段");
  }

  function handleAddSegment() {
    if (selectedTrack === "image") {
      if (trackLocks.image) {
        notify("图片轨已锁定，无法新增片段");
        return;
      }
      if (!imageSrc) {
        notify("请先上传或选择图片/视频素材");
        return;
      }
      const sourceSegments = visualSegments.length
        ? visualSegments
        : [createVisualSegment(imageDuration || 4, getCurrentVisualAssetSnapshot())];
      const totalDuration = getVisualSegmentsTotal(sourceSegments);
      const availableDuration = MAX_TIMELINE_DURATION_SECONDS - totalDuration;
      if (availableDuration < MIN_VISUAL_SEGMENT_SECONDS) {
        notify("视觉轨道已经达到 30 分钟上限");
        return;
      }
      const sourceAsset =
        sourceSegments[
          selectedVisualSegmentId && sourceSegments.some((segment) => segment.id === selectedVisualSegmentId)
            ? selectedVisualSegmentIndex
            : Math.max(0, sourceSegments.length - 1)
        ] ?? getCurrentVisualAssetSnapshot();
      const nextSegment = createVisualSegment(Math.min(IMAGE_SEGMENT_SECONDS, availableDuration), sourceAsset);
      commitVisualSegments(
        [...sourceSegments, nextSegment],
        "已新增一个视觉片段",
        sourceSegments.length,
      );
      return;
    }

    if (selectedTrack === "audio" || selectedTrack === "source" || selectedTrack === "music") {
      notify(
        selectedTrack === "music"
          ? "背景音乐暂不支持切片，请删除后重新上传"
          : selectedTrack === "source"
            ? "视频原声暂不支持切片，可删除后重新上传视频"
            : "音频片段由生成结果决定，请重新生成或复制 WAV",
      );
      return;
    }

    const index = selectedSegmentId ? selectedSegmentIndex : focusedSegmentIndex;
    const nextSegments = [...captionSegments];
    nextSegments.splice(captionSegments.length ? index + 1 : 0, 0, {
      id: makeId("caption"),
      text: "新的字幕片段",
      weight: captionSegments[index]?.weight ?? 1,
      hidden: false,
    });
    commitCaptionSegments(nextSegments, "已新增字幕片段", index + 1);
  }

  function handleRemoveSegment() {
    if (selectedTrack === "image") {
      if (trackLocks.image) {
        notify("图片轨已锁定，无法减少片段");
        return;
      }
      if (!imageSrc || imageClipCount === 0) {
        notify("当前没有视觉片段可减少");
        return;
      }
      const sourceSegments = visualSegments.length
        ? visualSegments
        : [createVisualSegment(imageDuration || 0, getCurrentVisualAssetSnapshot())];
      if (sourceSegments.length > 1) {
        const index =
          selectedVisualSegmentId && sourceSegments.some((segment) => segment.id === selectedVisualSegmentId)
            ? selectedVisualSegmentIndex
            : currentVisualSegmentIndex >= 0
              ? currentVisualSegmentIndex
              : sourceSegments.length - 1;
        const nextSegments = sourceSegments.filter((_, segmentIndex) => segmentIndex !== index);
        commitVisualSegments(nextSegments, "已删除当前视觉片段", Math.max(0, index - 1));
        return;
      }

      if (sourceSegments[0].duration <= IMAGE_SEGMENT_SECONDS) {
        clearImageTrack("已删除最后一个视觉片段");
        return;
      }
      commitVisualSegments(
        [{ ...sourceSegments[0], duration: sourceSegments[0].duration - IMAGE_SEGMENT_SECONDS }],
        "已缩短当前视觉片段",
        0,
      );
      return;
    }

    if (selectedTrack === "audio" || selectedTrack === "source" || selectedTrack === "music") {
      notify(
        selectedTrack === "music"
          ? "背景音乐可整轨删除，暂不支持局部减少"
          : selectedTrack === "source"
            ? "视频原声可整轨删除，暂不支持局部减少"
            : "音频片段不能单独减少；可以删除音频轨或重新生成",
      );
      return;
    }

    if (!captionSegments.length) {
      notify("当前没有字幕片段可删除");
      return;
    }

    deleteCaptionSegment(selectedSegmentId);
  }

  function adjustSelectedSegmentWeight(delta) {
    if (selectedTrack === "image") {
      if (trackLocks.image) {
        notify("图片轨已锁定，无法调整片段长度");
        return;
      }

      if (!imageSrc) {
        notify("请先上传或选择图片/视频素材");
        return;
      }

      const secondsDelta = delta > 0 ? 1 : -1;
      const sourceSegments = visualSegments.length
        ? visualSegments
        : [createVisualSegment(imageDuration || 4, getCurrentVisualAssetSnapshot())];
      const index =
        selectedVisualSegmentId && sourceSegments.some((segment) => segment.id === selectedVisualSegmentId)
          ? selectedVisualSegmentIndex
          : currentVisualSegmentIndex >= 0
            ? currentVisualSegmentIndex
            : sourceSegments.length - 1;
      const targetSegment = sourceSegments[index];
      const durationWithoutTarget = getVisualSegmentsTotal(sourceSegments) - targetSegment.duration;
      const maxTargetDuration = Math.max(
        MIN_VISUAL_SEGMENT_SECONDS,
        MAX_TIMELINE_DURATION_SECONDS - durationWithoutTarget,
      );
      const nextTargetDuration = Math.min(
        maxTargetDuration,
        Math.max(MIN_VISUAL_SEGMENT_SECONDS, targetSegment.duration + secondsDelta),
      );
      if (nextTargetDuration === targetSegment.duration) {
        notify(delta > 0 ? "视觉轨道已经达到 30 分钟上限" : "当前视觉片段已到最短时长");
        return;
      }
      const nextSegments = sourceSegments.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, duration: nextTargetDuration } : segment,
      );
      commitVisualSegments(nextSegments, delta > 0 ? "当前视觉片段已加长" : "当前视觉片段已缩短", index);
      return;
    }

    if (selectedTrack === "music") {
      notify("背景音乐长度由素材决定，下一版会支持裁剪和淡入淡出");
      return;
    }

    if (selectedTrack === "source") {
      notify("视频原声长度由视频决定，下一版会支持分段裁剪");
      return;
    }

    if (selectedTrack !== "caption") {
      notify("请先选择字幕片段，再调整片段长短");
      return;
    }

    if (!captionSegments.length) {
      notify("当前没有字幕片段可调整");
      return;
    }

    if (trackLocks.caption) {
      notify("字幕轨已锁定，无法调整片段长度");
      return;
    }

    const index = selectedSegmentId ? selectedSegmentIndex : focusedSegmentIndex;
    const nextSegments = captionSegments.map((segment, segmentIndex) =>
      segmentIndex === index
        ? { ...segment, weight: Math.max(0.5, Math.min(5, segment.weight + delta)) }
        : segment,
    );
    commitCaptionSegments(nextSegments, delta > 0 ? "当前字幕片段已加长" : "当前字幕片段已缩短", index);
  }

  function toggleTrackVisibility(track) {
    setTrackVisibility((visibility) => ({
      ...visibility,
      [track]: !visibility[track],
    }));
  }

  function toggleTrackLock(track) {
    setTrackLocks((locks) => ({
      ...locks,
      [track]: !locks[track],
    }));
  }

  function useHistoryItem(item) {
    replaceAudio(item.blob, item.duration, item.peaks, `${item.voiceName} 已恢复`);
    setScript(item.script);
    const nextSegments = createCaptionSegments(item.script);
    setCaptionSegments(nextSegments);
    setSelectedSegmentId(nextSegments[0]?.id ?? "");
    setSelectedVoiceId(item.voiceId);
    notify("历史配音已恢复到时间线");
  }

  const progressPercent = Math.max(0, Math.min(100, progress));
  const playheadPercent = Math.max(
    0,
    Math.min(100, ((currentTime || 0) / Math.max(timelineDuration, 1)) * 100),
  );
  const previewRatio = `${ratio.width} / ${ratio.height}`;
  const trackWidth = `${Math.round(100 * timelineZoom)}%`;
  const renderedVisualSegments = imageSrc
    ? visualSegments.length
      ? visualSegments
      : [{ id: "visual-fallback", duration: imageDuration, ...getVisualAssetPayload(getCurrentVisualAssetSnapshot()) }]
    : [];
  const activeTimelineClipDrag = timelineClipDrag?.dragging ? timelineClipDrag : null;
  const displayedVisualSegments =
    activeTimelineClipDrag?.track === "image"
      ? reorderTimelineItems(
          renderedVisualSegments,
          activeTimelineClipDrag.fromIndex,
          activeTimelineClipDrag.overIndex,
        )
      : renderedVisualSegments;
  const renderedVisualTimeline = getVisualSegmentTimeline(displayedVisualSegments);
  const displayedCaptionSegments =
    activeTimelineClipDrag?.track === "caption"
      ? reorderTimelineItems(
          captionSegments,
          activeTimelineClipDrag.fromIndex,
          activeTimelineClipDrag.overIndex,
        )
      : captionSegments;
  const displayedCaptionTimeline =
    activeTimelineClipDrag?.track === "caption"
      ? getCaptionTimeline(displayedCaptionSegments, captionTargetDuration)
      : captionTimeline;
  const audioClipPercent =
    audioBlob && timelineDuration > 0
      ? Math.max(0.6, Math.min(100, (audioDuration / timelineDuration) * 100))
      : 0;
  const sourceAudioClipPercent =
    sourceAudioBlob && timelineDuration > 0
      ? Math.max(0.6, Math.min(100, (sourceAudioDuration / timelineDuration) * 100))
      : 0;
  const musicClipPercent =
    musicBlob && timelineDuration > 0
      ? Math.max(0.6, Math.min(100, (musicDuration / timelineDuration) * 100))
      : 0;
  const exportPercent = Math.max(0, Math.min(100, Math.round(exportProgress)));
  const previewFrameStyle =
    previewFrameSize.width > 0 && previewFrameSize.height > 0
      ? {
          "--preview-ratio": previewRatio,
          width: `${previewFrameSize.width}px`,
          height: `${previewFrameSize.height}px`,
        }
      : { "--preview-ratio": previewRatio };

  return (
    <main className="app-shell" lang={activeLanguage}>
      <Topbar
        t={t}
        compactRail={compactRail}
        setCompactRail={setCompactRail}
        lastSaved={lastSaved}
        undo={undo}
        redo={redo}
        ratio={ratio}
        ratioId={ratioId}
        showRatioMenu={showRatioMenu}
        setShowRatioMenu={setShowRatioMenu}
        setRatioId={setRatioId}
        notify={notify}
        isPlaying={isPlaying}
        handlePlayToggle={handlePlayToggle}
        imageSrc={imageSrc}
        exporting={exporting}
        handleExportVideo={handleExportVideo}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        activeLanguage={activeLanguage}
        setUiLanguage={setUiLanguage}
        captionsEnabled={captionsEnabled}
        setCaptionsEnabled={setCaptionsEnabled}
        trackVisibility={trackVisibility}
        toggleTrackVisibility={toggleTrackVisibility}
      />

      <section className={`editor-grid ${compactRail ? "is-compact-rail" : ""}`}>
        <aside className={`tool-rail ${compactRail ? "is-compact" : ""}`} aria-label={t("toolbar")}>
          {TOOL_RAIL.map(({ id, label, icon: Icon }) => (
            <button
              className={`rail-tool ${activeTool === id ? "is-active" : ""}`}
              type="button"
              key={id}
              onClick={() => selectTool(id)}
            >
              <Icon size={23} />
              <span>{t(id, label)}</span>
            </button>
          ))}
        </aside>

        <aside className="media-panel">
          {activeTool === "media" ? (
            <MediaPanel
              t={t}
              mediaTab={mediaTab}
              setMediaTab={setMediaTab}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              fileInputRef={fileInputRef}
              handleFiles={handleFiles}
              imageSrc={imageSrc}
              builtInAssets={builtInAssets}
              userAssets={userAssets}
              selectedLibraryAssetId={selectedLibraryAssetId}
              deleteUserAsset={deleteUserAsset}
              draggedAssetId={draggedAssetId}
              handleAssetPointerDown={handleAssetPointerDown}
              handleAssetClick={handleAssetClick}
            />
          ) : (
            <ToolPanel
              activeTool={activeTool}
              script={script}
              updateScript={updateScript}
              segments={segments}
              currentSegmentIndex={currentSegmentIndex}
              captionSegments={captionSegments}
              captionTargetDuration={captionTargetDuration}
              selectedCaptionSegment={selectedCaptionSegment}
              selectedSegmentId={selectedSegmentId}
              setSelectedSegmentId={setSelectedSegmentId}
              updateCaptionSegmentText={updateCaptionSegmentText}
              toggleCaptionSegmentHidden={toggleCaptionSegmentHidden}
              deleteCaptionSegment={deleteCaptionSegment}
              seekTo={seekTo}
              estimatedDuration={estimatedDuration}
              captionPosition={captionPosition}
              setCaptionPosition={handleCaptionPositionChange}
              captionSize={captionSize}
              setCaptionSize={setCaptionSize}
              captionsEnabled={captionsEnabled}
              setCaptionsEnabled={setCaptionsEnabled}
              selectedFilterId={selectedFilterId}
              setSelectedFilterId={setSelectedFilterId}
              selectedTransitionId={selectedTransitionId}
              setSelectedTransitionId={setSelectedTransitionId}
              selectedStickerId={selectedStickerId}
              setSelectedStickerId={setSelectedStickerId}
              audioBlob={audioBlob}
              audioDuration={audioDuration}
              sourceAudioBlob={sourceAudioBlob}
              sourceAudioName={sourceAudioName}
              sourceAudioDuration={sourceAudioDuration}
              sourceAudioVolume={sourceAudioVolume}
              setSourceAudioVolume={setSourceAudioVolume}
              clearSourceAudioTrack={clearSourceAudioTrack}
              musicBlob={musicBlob}
              musicName={musicName}
              musicDuration={musicDuration}
              musicVolume={musicVolume}
              setMusicVolume={setMusicVolume}
              clearMusicTrack={clearMusicTrack}
              selectedVoice={selectedVoice}
              setVoiceTab={setVoiceTab}
              downloadBlob={downloadBlob}
              notify={notify}
              t={t}
              trOption={trOption}
            />
          )}
        </aside>

        <PreviewStage
          t={t}
          previewShellRef={previewShellRef}
          previewCanvasRef={previewCanvasRef}
          previewVideoRef={previewVideoRef}
          previewVisualSrc={previewVisualSrc}
          previewVisualType={previewVisualType}
          previewRatio={previewRatio}
          previewFrameStyle={previewFrameStyle}
          trackVisibility={trackVisibility}
          fileInputRef={fileInputRef}
          selectedFilter={selectedFilter}
          fitMode={fitMode}
          setFitMode={setFitMode}
          audioUrl={audioUrl}
          setIsPlaying={setIsPlaying}
          setCurrentTime={setCurrentTime}
          captionsEnabled={captionsEnabled}
          currentCaption={currentCaption}
          captionSize={captionSize}
          captionPlacement={captionPlacement}
          startCaptionDrag={startCaptionDrag}
          setActiveTool={setActiveTool}
          selectedSticker={selectedSticker}
          isPlaying={isPlaying}
          canPreview={canPreview}
          handlePlayToggle={handlePlayToggle}
          estimatedDuration={estimatedDuration}
          currentTime={currentTime}
          seekTo={seekTo}
          notify={notify}
        />

        <VoicePanel
          t={t}
          status={status}
          statusText={statusText}
          voiceTab={voiceTab}
          setVoiceTab={setVoiceTab}
          script={script}
          updateScript={updateScript}
          selectedVoiceId={selectedVoiceId}
          setSelectedVoiceId={setSelectedVoiceId}
          selectedVoice={selectedVoice}
          filteredVoices={filteredVoices}
          voiceFilter={voiceFilter}
          setVoiceFilter={setVoiceFilter}
          showVoiceFilter={showVoiceFilter}
          setShowVoiceFilter={setShowVoiceFilter}
          speed={speed}
          setSpeed={setSpeed}
          volume={volume}
          setVolume={setVolume}
          progressPercent={progressPercent}
          audioBlob={audioBlob}
          generateVoiceover={generateVoiceover}
          downloadBlob={downloadBlob}
          favoriteVoiceIds={favoriteVoiceIds}
          setFavoriteVoiceIds={setFavoriteVoiceIds}
          recordedVoices={recordedVoices}
          recordingState={recordingState}
          recordingElapsed={recordingElapsed}
          startVoiceRecording={startVoiceRecording}
          stopVoiceRecording={stopVoiceRecording}
          useRecordedVoice={useRecordedVoice}
          historyItems={historyItems}
          useHistoryItem={useHistoryItem}
          setHistoryItems={setHistoryItems}
          notify={notify}
          audioUrl={audioUrl}
          audioRef={audioRef}
          setIsPlaying={setIsPlaying}
          sourceAudioRef={sourceAudioRef}
          musicRef={musicRef}
          previewVideoRef={previewVideoRef}
          sourceAudioUrl={sourceAudioUrl}
          trackVisibility={trackVisibility}
          musicUrl={musicUrl}
          setCurrentTime={setCurrentTime}
        />
      </section>

      <Timeline
        t={t}
        undo={undo}
        redo={redo}
        handleDeleteTrack={handleDeleteTrack}
        handleDuplicateTrack={handleDuplicateTrack}
        handleCutTrack={handleCutTrack}
        fitMode={fitMode}
        setFitMode={setFitMode}
        canPreview={canPreview}
        handlePlayToggle={handlePlayToggle}
        isPlaying={isPlaying}
        handleAddSegment={handleAddSegment}
        handleRemoveSegment={handleRemoveSegment}
        adjustSelectedSegmentWeight={adjustSelectedSegmentWeight}
        timelineZoom={timelineZoom}
        setTimelineZoom={setTimelineZoom}
        selectedTrack={selectedTrack}
        setSelectedTrack={setSelectedTrack}
        trackVisibility={trackVisibility}
        toggleTrackVisibility={toggleTrackVisibility}
        trackLocks={trackLocks}
        toggleTrackLock={toggleTrackLock}
        trackScrollRef={trackScrollRef}
        trackWidth={trackWidth}
        startTimelineSeek={startTimelineSeek}
        timelineDuration={timelineDuration}
        currentTime={currentTime}
        playheadPercent={playheadPercent}
        snapGuide={snapGuide}
        assetDropTargetTrack={assetDropTargetTrack}
        assetDropPosition={assetDropPosition}
        assetDropPulseTrack={assetDropPulseTrack}
        assetDragPreview={assetDragPreview}
        handleTrackAssetDragOver={handleTrackAssetDragOver}
        handleTrackAssetDragLeave={handleTrackAssetDragLeave}
        handleTrackAssetDrop={handleTrackAssetDrop}
        activeTimelineClipDrag={activeTimelineClipDrag}
        imageSrc={imageSrc}
        displayedVisualSegments={displayedVisualSegments}
        renderedVisualTimeline={renderedVisualTimeline}
        visualType={visualType}
        currentVisualSegment={currentVisualSegment}
        selectedVisualSegmentId={selectedVisualSegmentId}
        currentVisualSegmentIndex={currentVisualSegmentIndex}
        setSelectedVisualSegmentId={setSelectedVisualSegmentId}
        seekTo={seekTo}
        suppressTimelineClipClickRef={suppressTimelineClipClickRef}
        startTimelineClipDrag={startTimelineClipDrag}
        startImageResize={startImageResize}
        displayedCaptionSegments={displayedCaptionSegments}
        displayedCaptionTimeline={displayedCaptionTimeline}
        currentCaptionSegment={currentCaptionSegment}
        selectedSegmentId={selectedSegmentId}
        setSelectedSegmentId={setSelectedSegmentId}
        captionTargetDuration={captionTargetDuration}
        sourceAudioBlob={sourceAudioBlob}
        sourceAudioPeaks={sourceAudioPeaks}
        sourceAudioClipPercent={sourceAudioClipPercent}
        sourceAudioDuration={sourceAudioDuration}
        audioBlob={audioBlob}
        peaks={peaks}
        audioClipPercent={audioClipPercent}
        audioDuration={audioDuration}
        musicBlob={musicBlob}
        musicPeaks={musicPeaks}
        musicClipPercent={musicClipPercent}
        musicDuration={musicDuration}
      />

      {assetDragPreview ? (
        <div
          className={`asset-drag-preview type-${assetDragPreview.type}`}
          style={{ left: assetDragPreview.x, top: assetDragPreview.y }}
        >
          {assetDragPreview.src ? (
            <div className="asset-drag-thumb">
              {assetDragPreview.type === "video" ? (
                <video src={assetDragPreview.src} muted playsInline preload="metadata" draggable={false} />
              ) : assetDragPreview.type === "audio" ? (
                <span>{t("assetAudio")}</span>
              ) : (
                <img src={assetDragPreview.src} alt="" draggable={false} />
              )}
            </div>
          ) : null}
          <span>
            {assetDragPreview.type === "audio"
              ? t("assetAudio")
              : assetDragPreview.type === "video"
                ? t("assetVideo")
                : t("assetImage")}
          </span>
          <strong>{assetDragPreview.name}</strong>
        </div>
      ) : null}

      {exporting ? (
        <div className="export-progress-overlay" role="status" aria-live="polite">
          <div className="export-progress-card">
            <div className="export-progress-header">
              <span>{t("exportInProgress")}</span>
              <strong>{exportPercent}%</strong>
            </div>
            <div
              className="export-progress-bar"
              role="progressbar"
              aria-label={t("exportProgress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={exportPercent}
            >
              <span style={{ width: `${exportPercent}%` }} />
            </div>
            <div className="export-progress-meta">
              <span>{exportPhase || t("preparingExport")}</span>
              <span>{formatClock(exportElapsedSeconds)}</span>
            </div>
          </div>
        </div>
      ) : null}
      {shouldShowLanguageIntro ? (
        <LanguageIntro t={t} closing={introClosing} onChoose={chooseInterfaceLanguage} />
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
