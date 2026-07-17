import { useEffect } from "react";
import {
  CaretDown,
  CloudArrowUp,
  FrameCorners,
  Pause,
  Play,
  Resize,
  SkipBack,
  SkipForward,
} from "@phosphor-icons/react";

import { formatTime } from "../lib/timeline.js";
import { getVisualMaskInsets, getVisualMaskSvgDataUrl, resolveVisualTransform } from "../lib/visualEffects.js";
import { resolveVisualClipAnimation } from "../lib/visualClipAnimations.js";
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
  previewTransition = null,
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
  stickers = [],
  selectedStickerId = "",
  stickerEditable = false,
  onSelectSticker,
  onUpdateSticker,
  isPlaying,
  canPreview,
  handlePlayToggle,
  estimatedDuration,
  currentTime,
  seekTo,
  notify,
  visualEffects,
  visualLocalTime = 0,
  visualMaskEditable = false,
  onUpdateVisualMask,
  getDraggedAsset,
  applyAssetToTrack,
}) {
  const visibleStickers = stickers.length ? stickers : selectedSticker?.src || selectedSticker?.text ? [selectedSticker] : [];
  const hasStickerOverlay = visibleStickers.some((sticker) => sticker?.src || sticker?.text);
  const hasPreviewContent = Boolean(previewVisualSrc || hasStickerOverlay);
  const renderedVisualSrc = previewVisualRenderSrc || previewVisualSrc;
  const activeObjectFit = visualObjectFit || fitMode;
  const activeObjectPosition = visualObjectPosition || "50% 50%";
  const visualTransform = resolveVisualTransform(visualEffects?.keyframes, visualLocalTime);
  const visualAnimation = resolveVisualClipAnimation(visualEffects?.animation, visualLocalTime, visualEffects?.duration);
  const visualMask = visualEffects?.mask ?? {};
  const enhancement = visualEffects?.enhancement ?? null;
  const showRemasterPreview = Boolean(
    enhancement?.enabled !== false && enhancement?.previewUrl &&
    (previewVisualType === "image" || (!isPlaying && Math.abs((enhancement.localTime ?? 0) - visualLocalTime) <= 0.08)),
  );
  const maskCenterX = Number.isFinite(visualMask.centerX) ? visualMask.centerX : 50;
  const maskCenterY = Number.isFinite(visualMask.centerY) ? visualMask.centerY : 50;
  const frameWidth = Math.max(1, previewFrameSize.width || 1);
  const frameHeight = Math.max(1, previewFrameSize.height || 1);
  const frameMinDimension = Math.min(frameWidth, frameHeight);
  const circleSize = Number.isFinite(visualMask.size) ? visualMask.size : 72;
  const maskWidth = visualMask.type === "circle" ? (circleSize * frameMinDimension) / frameWidth : Number.isFinite(visualMask.width) ? visualMask.width : 80;
  const maskHeight = visualMask.type === "circle" ? (circleSize * frameMinDimension) / frameHeight : Number.isFinite(visualMask.height) ? visualMask.height : 80;
  const shapeMaskUrl = getVisualMaskSvgDataUrl(visualMask, { width: frameWidth, height: frameHeight });
  const usesAlphaMask = Boolean(shapeMaskUrl);
  const maskInsets = getVisualMaskInsets(visualMask);
  const roundedRadius = Math.min(maskWidth / 100 * frameWidth, maskHeight / 100 * frameHeight) * (Number.isFinite(visualMask.cornerRadius) ? visualMask.cornerRadius : 12) / 100;
  const visualTransformStyle = {
    transform: `translate(${visualTransform.x + visualAnimation.x}%, ${visualTransform.y + visualAnimation.y}%) scale(${visualTransform.scale * visualAnimation.scale}) rotate(${visualTransform.rotation}deg)`,
    opacity: visualTransform.opacity * visualAnimation.opacity,
  };
  const visualMaskStyle = {
    clipPath: ["rectangle", "rounded"].includes(visualMask.type) && !usesAlphaMask
      ? `inset(${maskInsets.top}% ${maskInsets.right}% ${maskInsets.bottom}% ${maskInsets.left}%${visualMask.type === "rounded" ? ` round ${roundedRadius}px` : ""})`
      : visualMask.type === "circle" && !usesAlphaMask
        ? `ellipse(${maskWidth / 2}% ${maskHeight / 2}% at ${maskCenterX}% ${maskCenterY}%)`
        : undefined,
    WebkitMaskImage: shapeMaskUrl ? `url("${shapeMaskUrl}")` : undefined,
    maskImage: shapeMaskUrl ? `url("${shapeMaskUrl}")` : undefined,
    WebkitMaskSize: shapeMaskUrl ? "100% 100%" : undefined,
    maskSize: shapeMaskUrl ? "100% 100%" : undefined,
    WebkitMaskRepeat: shapeMaskUrl ? "no-repeat" : undefined,
    maskRepeat: shapeMaskUrl ? "no-repeat" : undefined,
  };
  const startMaskEdit = (event, mode) => {
    const frame = previewCanvasRef.current;
    if (!frame || !onUpdateVisualMask) return;
    event.preventDefault(); event.stopPropagation();
    const rect = frame.getBoundingClientRect();
    const startX = event.clientX; const startY = event.clientY;
    const initial = { centerX: maskCenterX, centerY: maskCenterY, width: maskWidth, height: maskHeight, size: circleSize };
    const move = (moveEvent) => {
      const dx = ((moveEvent.clientX - startX) / Math.max(1, rect.width)) * 100;
      const dy = ((moveEvent.clientY - startY) / Math.max(1, rect.height)) * 100;
      if (mode === "move") onUpdateVisualMask({ ...visualMask, centerX: Math.max(initial.width / 2, Math.min(100 - initial.width / 2, initial.centerX + dx)), centerY: Math.max(initial.height / 2, Math.min(100 - initial.height / 2, initial.centerY + dy)) });
      else if (visualMask.type === "circle") {
        const deltaPixels = Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY);
        const maxSizePixels = 2 * Math.min(initial.centerX / 100 * frameWidth, (100 - initial.centerX) / 100 * frameWidth, initial.centerY / 100 * frameHeight, (100 - initial.centerY) / 100 * frameHeight);
        onUpdateVisualMask({ ...visualMask, size: Math.max(8, Math.min(maxSizePixels / frameMinDimension * 100, initial.size + deltaPixels / frameMinDimension * 100)) });
      } else onUpdateVisualMask({ ...visualMask, width: Math.max(8, Math.min(2 * Math.min(initial.centerX, 100 - initial.centerX), initial.width + dx * 2)), height: Math.max(8, Math.min(2 * Math.min(initial.centerY, 100 - initial.centerY), initial.height + dy * 2)) });
    };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };
  const startStickerDrag = (event, selectedSticker) => {
    if (!stickerEditable || !onUpdateSticker || !selectedSticker) return;
    const frame = previewCanvasRef.current;
    if (!frame) return;
    event.preventDefault(); event.stopPropagation();
    const rect = frame.getBoundingClientRect();
    const startX = event.clientX; const startY = event.clientY;
    const initialX = Number.isFinite(selectedSticker.x) ? selectedSticker.x : 82;
    const initialY = Number.isFinite(selectedSticker.y) ? selectedSticker.y : 20;
    onSelectSticker?.(selectedSticker.id);
    const round = (value) => Math.round(value * 100) / 100;
    const move = (moveEvent) => onUpdateSticker(selectedSticker.id, {
      x: round(Math.max(4, Math.min(96, initialX + ((moveEvent.clientX - startX) / Math.max(1, rect.width)) * 100))),
      y: round(Math.max(4, Math.min(96, initialY + ((moveEvent.clientY - startY) / Math.max(1, rect.height)) * 100))),
    });
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };
  const startStickerTransform = (event, mode, selectedSticker) => {
    if (!stickerEditable || !onUpdateSticker || !selectedSticker) return;
    const sticker = event.currentTarget.closest(".sticker-transform-box");
    if (!sticker) return;
    event.preventDefault(); event.stopPropagation();
    const stickerRect = sticker.getBoundingClientRect();
    const centerX = stickerRect.left + stickerRect.width / 2;
    const centerY = stickerRect.top + stickerRect.height / 2;
    const startX = event.clientX; const startY = event.clientY;
    const initialScale = Number.isFinite(selectedSticker.scale) ? selectedSticker.scale : 1;
    const initialRotation = Number.isFinite(selectedSticker.rotation) ? selectedSticker.rotation : 0;
    const initialAngle = Math.atan2(startY - centerY, startX - centerX) * 180 / Math.PI;
    const round = (value) => Math.round(value * 100) / 100;
    const move = (moveEvent) => {
      if (mode === "scale") {
        const delta = ((moveEvent.clientX - startX) + (moveEvent.clientY - startY)) / Math.max(60, stickerRect.width + stickerRect.height);
        onUpdateSticker(selectedSticker.id, { scale: round(Math.max(0.2, Math.min(3, initialScale + delta * 2))) });
      } else {
        const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
        let rotation = initialRotation + angle - initialAngle;
        while (rotation > 180) rotation -= 360;
        while (rotation < -180) rotation += 360;
        onUpdateSticker(selectedSticker.id, { rotation: round(rotation) });
      }
    };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };

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
        data-asset-drop-track="image"
        onDragOver={(event) => {
          const asset = getDraggedAsset?.(event);
          if (asset?.type === "image" || asset?.type === "video") event.preventDefault();
        }}
        onDrop={(event) => {
          const asset = getDraggedAsset?.(event);
          if (asset?.type !== "image" && asset?.type !== "video") return;
          event.preventDefault(); event.stopPropagation();
          void applyAssetToTrack?.(asset, "image");
        }}
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
            {renderedVisualSrc && trackVisibility.image ? (
              <div className="visual-media-layer" style={visualMaskStyle}>
                {previewVisualType === "image" ? <img
                  src={renderedVisualSrc}
                  alt={t("currentMediaAlt")}
                  style={{ ...visualTransformStyle, filter: selectedFilter.css, objectFit: activeObjectFit, objectPosition: activeObjectPosition }}
                /> : null}
                {previewVisualType === "video" ? <video
                  key={previewVisualSrc}
                  ref={previewVideoRef}
                  className="preview-video"
                  src={previewVisualSrc}
                  muted
                  playsInline
                  preload="metadata"
                  onTimeUpdate={(event) => onPreviewVideoTimeUpdate?.(event.currentTarget.currentTime)}
                  onSeeked={(event) => onPreviewVideoTimeUpdate?.(event.currentTarget.currentTime)}
                  style={{
                    ...visualTransformStyle, filter: selectedFilter.css, objectFit: activeObjectFit, objectPosition: activeObjectPosition,
                    WebkitMaskImage: previewVisionMaskUrl ? `url("${previewVisionMaskUrl}")` : undefined,
                    maskImage: previewVisionMaskUrl ? `url("${previewVisionMaskUrl}")` : undefined,
                    WebkitMaskSize: previewVisionMaskUrl ? activeObjectFit : undefined,
                    maskSize: previewVisionMaskUrl ? activeObjectFit : undefined,
                    WebkitMaskPosition: previewVisionMaskUrl ? activeObjectPosition : undefined,
                    maskPosition: previewVisionMaskUrl ? activeObjectPosition : undefined,
                    WebkitMaskRepeat: previewVisionMaskUrl ? "no-repeat" : undefined,
                    maskRepeat: previewVisionMaskUrl ? "no-repeat" : undefined,
                  }}
                /> : null}
                {showRemasterPreview ? <img
                  className="remaster-preview-frame"
                  src={enhancement.previewUrl}
                  alt={t("remasterPreviewAlt")}
                  style={{ ...visualTransformStyle, filter: selectedFilter.css, objectFit: activeObjectFit, objectPosition: activeObjectPosition }}
                /> : null}
              </div>
            ) : null}
            {previewTransition?.next?.src && trackVisibility.image ? (
              <div className={`preview-transition-layer type-${previewTransition.id}`} style={{ "--transition-progress": previewTransition.progress }}>
                {previewTransition.next.type === "video" ? (
                  <video src={previewTransition.next.src} muted playsInline autoPlay preload="auto" style={{ objectFit: activeObjectFit, objectPosition: activeObjectPosition }} />
                ) : (
                  <img src={previewTransition.next.src} alt="" style={{ objectFit: activeObjectFit, objectPosition: activeObjectPosition }} />
                )}
                {previewTransition.id === "flash" ? <i /> : null}
              </div>
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
            {visualMaskEditable && visualMask.type && visualMask.type !== "none" ? (
              <div className={`visual-mask-editor is-${visualMask.type}`} style={{ left: `${maskCenterX - maskWidth / 2}%`, top: `${maskCenterY - maskHeight / 2}%`, width: `${maskWidth}%`, height: `${maskHeight}%`, borderRadius: visualMask.type === "rounded" ? `${roundedRadius}px` : undefined }} onPointerDown={(event) => startMaskEdit(event, "move")}>
                <span>{t("visualMask")}</span><button type="button" aria-label={t("visualMaskResize")} onPointerDown={(event) => startMaskEdit(event, "resize")} />
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
            {visibleStickers.map((sticker, index) => {
              const isEditable = stickerEditable && sticker.id === selectedStickerId;
              return sticker.src ? (
                <div
                  key={sticker.id || `${sticker.src}-${index}`}
                  className={`sticker-overlay sticker-transform-box ${isEditable ? "is-editable" : ""}`}
                  onPointerDown={(event) => startStickerDrag(event, sticker)}
                  style={{
                    left: `${Number.isFinite(sticker.x) ? sticker.x : 82}%`,
                    top: `${Number.isFinite(sticker.y) ? sticker.y : 20}%`,
                    transform: `translate(-50%, -50%) scale(${Number.isFinite(sticker.scale) ? sticker.scale : 1}) rotate(${Number.isFinite(sticker.rotation) ? sticker.rotation : 0}deg)`,
                    opacity: Number.isFinite(sticker.opacity) ? sticker.opacity : 1,
                  }}
                >
                  <img className="sticker-overlay-image" src={sticker.src} alt="" draggable={false} />
                  {isEditable ? <>
                    <button className="sticker-rotate-handle" type="button" aria-label={t("visualRotation", "旋转")} onPointerDown={(event) => startStickerTransform(event, "rotate", sticker)} />
                    <button className="sticker-scale-handle" type="button" aria-label={t("visualScale", "缩放")} onPointerDown={(event) => startStickerTransform(event, "scale", sticker)}>
                      <Resize size={12} weight="bold" aria-hidden="true" />
                    </button>
                  </> : null}
                </div>
              ) : sticker.text ? (
                <div key={sticker.id || `${sticker.text}-${index}`} className="sticker-overlay is-label">{sticker.text}</div>
              ) : null;
            })}
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
