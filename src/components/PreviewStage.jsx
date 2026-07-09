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
import { IconButton } from "./ui.jsx";

export function PreviewStage({
  t,
  previewShellRef,
  previewCanvasRef,
  previewVideoRef,
  previewVisualSrc,
  previewVisualType,
  previewRatio,
  previewFrameStyle,
  trackVisibility,
  fileInputRef,
  selectedFilter,
  fitMode,
  setFitMode,
  audioUrl,
  setIsPlaying,
  setCurrentTime,
  captionsEnabled,
  currentCaption,
  captionSize,
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
  return (
    <section className="preview-stage">
      <div
        ref={previewShellRef}
        className={`preview-canvas fit-${fitMode} ${previewVisualSrc ? "" : "is-empty"} ${
          previewVisualSrc && !trackVisibility.image ? "is-image-hidden" : ""
        }`}
        style={{ "--preview-ratio": previewRatio }}
      >
        {!previewVisualSrc ? (
          <button className="preview-empty" type="button" style={previewFrameStyle} onClick={() => fileInputRef.current?.click()}>
            <CloudArrowUp size={38} />
            <strong>{t("previewEmptyTitle")}</strong>
            <span>{t("previewEmptySubtitle")}</span>
          </button>
        ) : (
          <div
            ref={previewCanvasRef}
            className={`preview-frame ${previewVisualSrc && !trackVisibility.image ? "is-image-hidden" : ""}`}
            data-hidden-label={t("imageHidden")}
            style={previewFrameStyle}
          >
            {trackVisibility.image && previewVisualType === "image" ? (
              <img
                src={previewVisualSrc}
                alt={t("currentMediaAlt")}
                style={{
                  filter: selectedFilter.css,
                  objectFit: fitMode,
                }}
              />
            ) : null}
            {trackVisibility.image && previewVisualType === "video" ? (
              <video
                key={previewVisualSrc}
                ref={previewVideoRef}
                className="preview-video"
                src={previewVisualSrc}
                muted
                playsInline
                preload="metadata"
                style={{
                  filter: selectedFilter.css,
                  objectFit: fitMode,
                }}
                onPlay={() => {
                  if (!audioUrl) {
                    setIsPlaying(true);
                  }
                }}
                onPause={() => {
                  if (!audioUrl) {
                    setIsPlaying(false);
                  }
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  setCurrentTime(0);
                }}
                onTimeUpdate={(event) => {
                  if (!audioUrl) {
                    setCurrentTime(event.currentTarget.currentTime);
                  }
                }}
              />
            ) : null}
            {captionsEnabled && trackVisibility.caption && currentCaption ? (
              <button
                className="caption-overlay"
                type="button"
                style={{
                  fontSize: captionSize,
                  left: `${captionPlacement.x}%`,
                  top: `${captionPlacement.y}%`,
                }}
                onPointerDown={startCaptionDrag}
                onDoubleClick={() => setActiveTool("caption")}
              >
                {currentCaption}
              </button>
            ) : null}
            {selectedSticker.text ? <div className="sticker-overlay">{selectedSticker.text}</div> : null}
            <button
              className={`canvas-play-button ${isPlaying ? "is-playing" : ""}`}
              type="button"
              aria-label={isPlaying ? t("pause") : t("play")}
              title={isPlaying ? t("pause") : t("play")}
              disabled={!canPreview}
              onClick={handlePlayToggle}
            >
              {isPlaying ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
              <span>{isPlaying ? t("pause") : t("play")}</span>
            </button>
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
