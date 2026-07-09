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
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  MinusCircle,
  MonitorPlay,
  Pause,
  Play,
  PlusCircle,
  Scissors,
  Trash,
} from "@phosphor-icons/react";

import { IMAGE_SEGMENT_SECONDS } from "../config/editor.js";
import { formatClock, formatTime, getImageThumbnailCount, getSegmentStartTime } from "../lib/timeline.js";
import { IconButton, WaveformStrip } from "./ui.jsx";

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
  trackVisibility,
  toggleTrackVisibility,
  trackLocks,
  toggleTrackLock,
  trackScrollRef,
  trackWidth,
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
  activeTimelineClipDrag,
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
  displayedCaptionSegments,
  displayedCaptionTimeline,
  currentCaptionSegment,
  selectedSegmentId,
  setSelectedSegmentId,
  captionTargetDuration,
  sourceAudioBlob,
  sourceAudioPeaks,
  sourceAudioClipPercent,
  sourceAudioDuration,
  audioBlob,
  peaks,
  audioClipPercent,
  audioDuration,
  musicBlob,
  musicPeaks,
  musicClipPercent,
  musicDuration,
}) {
  const draggingVisualSegment =
    activeTimelineClipDrag?.track === "image"
      ? displayedVisualSegments.find((segment) => segment.id === activeTimelineClipDrag.segmentId)
      : null;
  const draggingCaptionSegment =
    activeTimelineClipDrag?.track === "caption"
      ? displayedCaptionSegments.find((segment) => segment.id === activeTimelineClipDrag.segmentId)
      : null;
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
              : t("assetImage")}
        </strong>
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
          <IconButton label={t("zoomOut")} onClick={() => setTimelineZoom((zoom) => Math.max(0.25, zoom - 0.25))}>
            <MagnifyingGlassMinus size={17} />
          </IconButton>
          <span className="zoom-readout">{Math.round(timelineZoom * 100)}%</span>
          <IconButton label={t("fitTimeline")} active={timelineZoom === 1} onClick={() => setTimelineZoom(1)}>
            <MonitorPlay size={17} />
          </IconButton>
          <IconButton label={t("zoomIn")} onClick={() => setTimelineZoom((zoom) => Math.min(3, zoom + 0.25))}>
            <MagnifyingGlassPlus size={17} />
          </IconButton>
        </div>
      </div>

      <div className="timeline-board">
        <div className="track-labels">
          {[
            ["image", t("imageTrack")],
            ["caption", t("caption")],
            ["source", t("sourceTrack")],
            ["audio", t("voiceTrack")],
            ["music", t("musicTrack")],
          ].map(([track, label]) => (
            <div className={selectedTrack === track ? "is-selected" : ""} key={track}>
              <button
                type="button"
                aria-label={`${label} ${t("visible")}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTrackVisibility(track);
                }}
              >
                {trackVisibility[track] ? <Eye size={15} /> : <EyeSlash size={15} />}
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
            style={{ width: trackWidth, "--timeline-zoom": timelineZoom }}
            onPointerDown={(event) => {
              if (
                event.target.closest(
                  "button, .image-clip, .caption-segment, .audio-track, .waveform-strip",
                )
              ) {
                return;
              }
              startTimelineSeek(event);
            }}
          >
            <div className="ruler" onPointerDown={startTimelineSeek}>
              {Array.from({ length: 11 }, (_, index) => (
                <span key={index}>{formatClock((timelineDuration / 10) * index)}</span>
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
                assetDropTargetTrack === "image" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "image" ? "is-drop-landing" : ""} ${
                activeTimelineClipDrag?.track === "image" ? "is-reordering" : ""
              }`}
              onClick={() => setSelectedTrack("image")}
              onDragOver={(event) => handleTrackAssetDragOver(event, "image")}
              onDragLeave={(event) => handleTrackAssetDragLeave(event, "image")}
              onDrop={(event) => handleTrackAssetDrop(event, "image")}
              data-asset-drop-track="image"
              data-timeline-reorder-track="image"
            >
              {assetDropTargetTrack === "image" ? (
                <div className="track-drop-hint">{t("dropVisualHere")}</div>
              ) : null}
              {trackVisibility.image && imageSrc
                ? displayedVisualSegments.map((segment, index) => {
                    const segmentSrc = segment.src || imageSrc;
                    const segmentType = segment.type || visualType;
                    const segmentWidth =
                      timelineDuration > 0
                        ? Math.max(0.8, Math.min(100, (segment.duration / timelineDuration) * 100))
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
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressTimelineClipClickRef.current === segment.id) {
                            return;
                          }
                          setSelectedTrack("image");
                          setSelectedVisualSegmentId(segment.id);
                          seekTo(segmentRange?.start ?? 0);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedTrack("image");
                            setSelectedVisualSegmentId(segment.id);
                            seekTo(segmentRange?.start ?? 0);
                          }
                        }}
                      >
                        <div className={`image-thumbnails ${segmentType === "video" ? "is-video" : ""}`}>
                          {segmentType === "video" ? (
                            <video src={segmentSrc} muted playsInline preload="metadata" draggable={false} />
                          ) : (
                            Array.from(
                              {
                                length: Math.max(
                                  1,
                                  getImageThumbnailCount(segment.duration || IMAGE_SEGMENT_SECONDS),
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
            <div
              className={`caption-track ${selectedTrack === "caption" ? "is-selected" : ""} ${
                activeTimelineClipDrag?.track === "caption" ? "is-reordering" : ""
              }`}
              onClick={() => setSelectedTrack("caption")}
              data-timeline-reorder-track="caption"
            >
              {trackVisibility.caption
                ? displayedCaptionSegments.map((segment, index) => {
                    const segmentDuration = displayedCaptionTimeline[index]?.duration ?? 0;
                    const segmentWidth =
                      timelineDuration > 0
                        ? Math.max(0.6, Math.min(100, (segmentDuration / timelineDuration) * 100))
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
                        type="button"
                        className={`caption-segment ${
                          segment.id === currentCaptionSegment?.id ? "is-current" : ""
                        } ${segment.id === selectedSegmentId ? "is-selected-segment" : ""} ${
                          segment.hidden ? "is-hidden" : ""
                        } ${isDraggingCaptionSegment ? "is-reorder-dragging" : ""} ${
                          isReorderTarget ? "is-reorder-target" : ""
                        }`}
                        key={segment.id}
                        data-timeline-segment-track="caption"
                        data-timeline-segment-index={index}
                        data-timeline-segment-id={segment.id}
                        data-placeholder={t("dropSlot", "放置位置")}
                        style={{ "--caption-width": `${segmentWidth}%` }}
                        onPointerDown={(event) => startTimelineClipDrag(event, "caption", segment.id, index)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressTimelineClipClickRef.current === segment.id) {
                            return;
                          }
                          setSelectedTrack("caption");
                          setSelectedSegmentId(segment.id);
                          seekTo(getSegmentStartTime(displayedCaptionSegments, index, captionTargetDuration));
                        }}
                      >
                        {segment.text}
                      </button>
                    );
                  })
                : null}
            </div>
            <button
              className={`audio-track source-track ${selectedTrack === "source" ? "is-selected" : ""} ${
                assetDropTargetTrack === "source" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "source" ? "is-drop-landing" : ""}`}
              type="button"
              onClick={() => setSelectedTrack("source")}
              onDragOver={(event) => handleTrackAssetDragOver(event, "source")}
              onDragLeave={(event) => handleTrackAssetDragLeave(event, "source")}
              onDrop={(event) => handleTrackAssetDrop(event, "source")}
              data-asset-drop-track="source"
            >
                {assetDropTargetTrack === "source" ? (
                  <div className="track-drop-hint">{t("dropSourceHere")}</div>
                ) : null}
              {renderAssetDropSlot("source")}
                {trackVisibility.source && sourceAudioBlob ? (
                <div className="audio-clip is-source" style={{ width: `${sourceAudioClipPercent}%` }}>
                  <WaveformStrip peaks={sourceAudioPeaks} active />
                  <span className="audio-clip-duration">{formatTime(sourceAudioDuration)}</span>
                </div>
              ) : null}
            </button>
            <button
              className={`audio-track ${selectedTrack === "audio" ? "is-selected" : ""} ${
                assetDropTargetTrack === "audio" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "audio" ? "is-drop-landing" : ""}`}
              type="button"
              onClick={() => setSelectedTrack("audio")}
              onDragOver={(event) => handleTrackAssetDragOver(event, "audio")}
              onDragLeave={(event) => handleTrackAssetDragLeave(event, "audio")}
              onDrop={(event) => handleTrackAssetDrop(event, "audio")}
              data-asset-drop-track="audio"
            >
                {assetDropTargetTrack === "audio" ? (
                  <div className="track-drop-hint">{t("dropVoiceHere")}</div>
                ) : null}
              {renderAssetDropSlot("audio")}
                {trackVisibility.audio && audioBlob ? (
                <div className="audio-clip" style={{ width: `${audioClipPercent}%` }}>
                  <WaveformStrip peaks={peaks} active />
                  <span className="audio-clip-duration">{formatTime(audioDuration)}</span>
                </div>
              ) : null}
            </button>
            <button
              className={`audio-track music-track ${selectedTrack === "music" ? "is-selected" : ""} ${
                assetDropTargetTrack === "music" ? "is-drop-target" : ""
              } ${assetDropPulseTrack === "music" ? "is-drop-landing" : ""}`}
              type="button"
              onClick={() => setSelectedTrack("music")}
              onDragOver={(event) => handleTrackAssetDragOver(event, "music")}
              onDragLeave={(event) => handleTrackAssetDragLeave(event, "music")}
              onDrop={(event) => handleTrackAssetDrop(event, "music")}
              data-asset-drop-track="music"
            >
                {assetDropTargetTrack === "music" ? (
                  <div className="track-drop-hint">{t("dropMusicHere")}</div>
                ) : null}
              {renderAssetDropSlot("music")}
                {trackVisibility.music && musicBlob ? (
                <div className="audio-clip is-music" style={{ width: `${musicClipPercent}%` }}>
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
      {draggingCaptionSegment ? (
        <div
          className="timeline-drag-ghost type-caption"
          style={{ left: activeTimelineClipDrag.x, top: activeTimelineClipDrag.y }}
        >
          <strong>{draggingCaptionSegment.text}</strong>
        </div>
      ) : null}
    </section>
  );
}
