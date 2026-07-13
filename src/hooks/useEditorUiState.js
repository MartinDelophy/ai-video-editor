import { useState } from "react";

const DEFAULT_TRACK_VISIBILITY = {
  image: true, caption: true, sticker: true, source: true, audio: true, music: true,
};

const DEFAULT_TRACK_LOCKS = {
  image: false, caption: false, sticker: false, source: false, audio: false, music: false,
};

export function useEditorUiState() {
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
  const [activeTool, setActiveTool] = useState("media");
  const [mediaTab, setMediaTab] = useState("upload");
  const [voiceTab, setVoiceTab] = useState("synthesis");
  const [voiceFilter, setVoiceFilter] = useState("all");
  const [showVoiceFilter, setShowVoiceFilter] = useState(false);
  const [ratioId, setRatioId] = useState("16:9");
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [compactRail, setCompactRail] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("image");
  const [timelineZoom, setTimelineZoom] = useState(0.25);
  const [trackVisibility, setTrackVisibility] = useState(DEFAULT_TRACK_VISIBILITY);
  const [trackLocks, setTrackLocks] = useState(DEFAULT_TRACK_LOCKS);
  const [timelineClipDrag, setTimelineClipDrag] = useState(null);
  const [snapGuide, setSnapGuide] = useState(null);

  return {
    activeTool, assetDragPreview, assetDropPosition, assetDropPulseTrack,
    assetDropTargetTrack, compactRail, currentTime, draggedAssetId, exporting,
    exportPhase, exportProgress, isDragging, isPlaying, mediaTab, progress, ratioId,
    selectedLibraryAssetId, selectedTrack, setActiveTool, setAssetDragPreview,
    setAssetDropPosition, setAssetDropPulseTrack, setAssetDropTargetTrack, setCompactRail,
    setCurrentTime, setDraggedAssetId, setExporting, setExportPhase, setExportProgress,
    setIsDragging, setIsPlaying, setMediaTab, setProgress, setRatioId,
    setSelectedLibraryAssetId, setSelectedTrack, setShowFileMenu, setShowRatioMenu,
    setShowSettings, setShowVoiceFilter, setSnapGuide, setStatus, setStatusText,
    setTimelineClipDrag, setTimelineZoom, setTrackLocks, setTrackVisibility, setVoiceFilter,
    setVoiceTab, showFileMenu, showRatioMenu, showSettings, showVoiceFilter, snapGuide,
    status, statusText, timelineClipDrag, timelineZoom, trackLocks, trackVisibility,
    voiceFilter, voiceTab,
  };
}
