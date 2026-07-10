import { useEffect } from "react";
import {
  CaretDown,
  CloudArrowUp,
  FrameCorners,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "@phosphor-icons/react";

import { formatTime } from "../lib/timeline.js";
import { CaptionOverlay } from "./CaptionOverlay.jsx";
import { IconButton } from "./ui.jsx";

export function PreviewStage({
  t,
  previewShellRef,
  previewCanvasRef,
  previewVideoRef,
  onPreviewVideoTimeUpdate,
  previewVisualSrc,
  previewVisualRenderSrc,
  previewVisionMaskUrl = "",
  previewVisualType,
  previewRatio,
  previewFrameStyle,
  previewFrameSize,
  trackVisibility,
  fileInputRef,
  selectedFilter,
  fitMode,
  visualObjectFit,
  visualObjectPosition,
  visionOverlayBoxes = [],
  showVisionOverlays = false,
  backgroundRemoved = false,
  smartCropActive = false,
  captionAvoidanceActive = false,
  setFitMode,
  captionsEnabled,
  currentCaption,
  captionSize,
  captionStyle,
  captionPlacement,
  startCaptionDrag,
  setActiveTool,
  selectedSticker,
  isPlaying,
  canPreview,
  handlePlayToggle,
  estimatedDuration,
  currentTime,
  seekTo,
  notify,
}) {
  const hasStickerOverlay = Boolean(selectedSticker?.src || selectedSticker?.text);
  const hasPreviewContent = Boolean(previewVisualSrc || hasStickerOverlay);
  const renderedVisualSrc = previewVisualRenderSrc || previewVisualSrc;
  const activeObjectFit = visualObjectFit || fitMode;
  const activeObjectPosition = visualObjectPosition || "50% 50%";

  useEffect(() => {
    const video = previewVideoRef.current;
    if (
      previewVisualType !== "video" ||
      !video ||
      typeof video.requestVideoFrameCallback !== "function"
    ) {
      return undefined;
    }

    let callbackId = 0;
    const handleVideoFrame = (_now, metadata) => {
      onPreviewVideoTimeUpdate?.(
        Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime : video.currentTime,
      );
      callbackId = video.requestVideoFrameCallback(handleVideoFrame);
    };
    callbackId = video.requestVideoFrameCallback(handleVideoFrame);
    return () => video.cancelVideoFrameCallback?.(callbackId);
  }, [
    onPreviewVideoTimeUpdate,
    previewVideoRef,
    previewVisualSrc,
    previewVisualType,
  ]);

  return (
    <section className="preview-stage">
      <div
        ref={previewShellRef}
        className={`preview-canvas fit-${fitMode} ${hasPreviewContent ? "" : "is-empty"} ${
          previewVisualSrc && !trackVisibility.image ? "is-image-hidden" : ""
        }`}
        style={{ "--preview-ratio": previewRatio }}
      >
        {!hasPreviewContent ? (
          <button className="preview-empty" type="button" style={previewFrameStyle} onClick={() => fileInputRef.current?.click()}>
            <CloudArrowUp size={38} />
            <strong>{t("previewEmptyTitle")}</strong>
            <span>{t("previewEmptySubtitle")}</span>
          </button>
        ) : (
          <div
            ref={previewCanvasRef}
            className={`preview-frame ${previewVisualSrc && !trackVisibility.image ? "is-image-hidden" : ""} ${
              backgroundRemoved ? "has-background-removed" : ""
            } ${smartCropActive ? "has-smart-crop" : ""}`}
            data-hidden-label={t("imageHidden")}
            style={previewFrameStyle}
          >
            {renderedVisualSrc && trackVisibility.image && previewVisualType === "image" ? (
              <img
                src={renderedVisualSrc}
                alt={t("currentMediaAlt")}
                style={{
                  filter: selectedFilter.css,
                  objectFit: activeObjectFit,
                  objectPosition: activeObjectPosition,
                }}
              />
            ) : null}
            {previewVisualSrc && trackVisibility.image && previewVisualType === "video" ? (
              <video
                key={previewVisualSrc}
                ref={previewVideoRef}
                className="preview-video"
                src={previewVisualSrc}
                muted
                playsInline
                preload="metadata"
                onTimeUpdate={(event) =>
                  onPreviewVideoTimeUpdate?.(event.currentTarget.currentTime)
                }
                onSeeked={(event) =>
                  onPreviewVideoTimeUpdate?.(event.currentTarget.currentTime)
                }
                style={{
                  filter: selectedFilter.css,
                  objectFit: activeObjectFit,
                  objectPosition: activeObjectPosition,
                  WebkitMaskImage: previewVisionMaskUrl
                    ? `url("${previewVisionMaskUrl}")`
                    : undefined,
                  maskImage: previewVisionMaskUrl
                    ? `url("${previewVisionMaskUrl}")`
                    : undefined,
                  WebkitMaskSize: previewVisionMaskUrl ? activeObjectFit : undefined,
                  maskSize: previewVisionMaskUrl ? activeObjectFit : undefined,
                  WebkitMaskPosition: previewVisionMaskUrl ? activeObjectPosition : undefined,
                  maskPosition: previewVisionMaskUrl ? activeObjectPosition : undefined,
                  WebkitMaskRepeat: previewVisionMaskUrl ? "no-repeat" : undefined,
                  maskRepeat: previewVisionMaskUrl ? "no-repeat" : undefined,
                }}
              />
            ) : null}
            {showVisionOverlays
              ? visionOverlayBoxes.map((detection, index) => (
                  <div
                    className={`vision-detection-box ${detection.isSubject ? "is-subject" : ""}`}
                    key={`${detection.label || "object"}-${index}`}
                    style={{
                      left: `${detection.xMin * 100}%`,
                      top: `${detection.yMin * 100}%`,
                      width: `${Math.max(0, detection.xMax - detection.xMin) * 100}%`,
                      height: `${Math.max(0, detection.yMax - detection.yMin) * 100}%`,
                    }}
                  >
                    <span>
                      {detection.label || "subject"}
                      {Number.isFinite(detection.score) ? ` ${Math.round(detection.score * 100)}%` : ""}
                    </span>
                  </div>
                ))
              : null}
            {smartCropActive || captionAvoidanceActive || backgroundRemoved ? (
              <div className="preview-ai-badges" aria-hidden="true">
                {backgroundRemoved ? <span>MODNet</span> : null}
                {smartCropActive ? <span>{t("smartVisionCrop")}</span> : null}
                {captionAvoidanceActive ? <span>{t("smartVisionCaptionAvoidance")}</span> : null}
              </div>
            ) : null}
            {captionsEnabled && trackVisibility.caption && currentCaption ? (
              <CaptionOverlay
                text={currentCaption}
                captionSize={captionSize}
                captionStyle={captionStyle}
                placement={captionPlacement}
                frameSize={previewFrameSize}
                onPointerDown={startCaptionDrag}
                onDoubleClick={() => setActiveTool("caption")}
              />
            ) : null}
            {selectedSticker.src ? (
              <img className="sticker-overlay is-image" src={selectedSticker.src} alt="" draggable={false} />
            ) : selectedSticker.text ? (
              <div className="sticker-overlay is-label">{selectedSticker.text}</div>
            ) : null}
          </div>
        )}
      </div>
      <div className="transport">
        <input
          className="scrubber"
          type="range"
          min="0"
          max={Math.max(estimatedDuration, 1)}
          step="0.01"
          value={Math.min(currentTime, estimatedDuration)}
          onChange={(event) => seekTo(Number(event.target.value))}
        />
        <div className="transport-row">
          <span>
            {formatTime(currentTime)} <em>/ {formatTime(estimatedDuration)}</em>
          </span>
          <div className="playback-controls">
            <IconButton label={t("backTwoSeconds")} onClick={() => seekTo(currentTime - 2)}>
              <SkipBack size={18} weight="fill" />
            </IconButton>
            <IconButton label={t("play")} active onClick={handlePlayToggle}>
              {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
            </IconButton>
            <IconButton label={t("forwardTwoSeconds")} onClick={() => seekTo(currentTime + 2)}>
              <SkipForward size={18} weight="fill" />
            </IconButton>
          </div>
          <button
            className="fit-button"
            type="button"
            onClick={() => {
              setFitMode((mode) => (mode === "contain" ? "cover" : "contain"));
              notify(fitMode === "contain" ? "预览已切换为填充裁切" : "预览已切换为完整适配");
            }}
          >
            {fitMode === "contain" ? t("fit") : t("cover")} <CaretDown size={14} />
          </button>
          <IconButton label={t("fullscreenPreview")} onClick={() => document.documentElement.requestFullscreen?.()}>
            <FrameCorners size={19} />
          </IconButton>
        </div>
      </div>
    </section>
  );
}
