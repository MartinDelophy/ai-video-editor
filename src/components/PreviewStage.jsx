import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CaretDown,
  ArrowDown,
  ArrowUp,
  CloudArrowUp,
  FrameCorners,
  Pause,
  Play,
  Resize,
  SkipBack,
  SkipForward,
  X,
} from "@phosphor-icons/react";

import { formatTime } from "../lib/timeline.js";
import { getVisualMaskInsets, getVisualMaskSvgDataUrl, resolveVisualTransform, snapVisualScaleToFrameEdges } from "../lib/visualEffects.js";
import { resolveVisualClipAnimation } from "../lib/visualClipAnimations.js";
import { getStickerBaseSize } from "../lib/stickerGeometry.js";
import { CaptionOverlay } from "./CaptionOverlay.jsx";
import { IconButton } from "./ui.jsx";
import { getVisualOverlayPixelBox, snapVisualOverlayTransform } from "../lib/visualOverlayTimeline.js";
import { getAnchoredResize } from "../lib/anchoredResize.js";

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
  previewVisualMuted = true,
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
  currentCaptions = null,
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
  visualTransformEditable = false,
  onSelectVisual,
  onDeselectVisuals,
  onUpdateVisualTransform,
  getDraggedAsset,
  applyAssetToTrack,
  addVisualOverlay,
  visualOverlays = [],
  selectedVisualOverlayId = "",
  onSelectVisualOverlay,
  onUpdateVisualOverlay,
  onReorderVisualOverlay,
}) {
  const [overlaySnapGuides, setOverlaySnapGuides] = useState([]);
  const lastReportedVideoTimeRef = useRef(-Infinity);
  const [isFocusPreviewOpen, setIsFocusPreviewOpen] = useState(false);
  const [focusPreviewFrameSize, setFocusPreviewFrameSize] = useState({ width: 0, height: 0 });
  const visibleStickers = stickers;
  const hasStickerOverlay = visibleStickers.some((sticker) => sticker?.src || sticker?.text);
  const hasPreviewContent = Boolean(previewVisualSrc || hasStickerOverlay);
  const renderedVisualSrc = previewVisualRenderSrc || previewVisualSrc;
  const activeObjectFit = visualObjectFit || fitMode;
  const activeObjectPosition = visualObjectPosition || "50% 50%";
  const visualTransform = resolveVisualTransform(visualEffects?.keyframes, visualLocalTime, visualEffects?.baseTransform);
  const visualAnimation = resolveVisualClipAnimation(visualEffects?.animation, visualLocalTime, visualEffects?.duration);
  const visualMask = visualEffects?.mask ?? {};
  const enhancement = visualEffects?.enhancement ?? null;
  const showRemasterPreview = Boolean(
    enhancement?.enabled !== false && enhancement?.previewUrl &&
    (previewVisualType === "image" || (!isPlaying && Math.abs((enhancement.localTime ?? 0) - visualLocalTime) <= 0.08)),
  );
  const maskCenterX = Number.isFinite(visualMask.centerX) ? visualMask.centerX : 50;
  const maskCenterY = Number.isFinite(visualMask.centerY) ? visualMask.centerY : 50;
  const activePreviewFrameSize = isFocusPreviewOpen && focusPreviewFrameSize.width > 0 ? focusPreviewFrameSize : previewFrameSize;
  const activePreviewFrameStyle = isFocusPreviewOpen && focusPreviewFrameSize.width > 0
    ? { ...previewFrameStyle, width: `${focusPreviewFrameSize.width}px`, height: `${focusPreviewFrameSize.height}px` }
    : previewFrameStyle;
  const frameWidth = Math.max(1, activePreviewFrameSize.width || 1);
  const frameHeight = Math.max(1, activePreviewFrameSize.height || 1);
  const frameMinDimension = Math.min(frameWidth, frameHeight);
  const stickerBaseSize = getStickerBaseSize({ width: frameWidth, height: frameHeight });
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
  const startVisualTransform = (event, mode) => {
    if (!visualTransformEditable || !onUpdateVisualTransform) return;
    const frame = previewCanvasRef.current;
    if (!frame) return;
    event.preventDefault(); event.stopPropagation();
    onSelectVisual?.();
    const rect = frame.getBoundingClientRect();
    const startX = event.clientX; const startY = event.clientY;
    const initial = { ...visualTransform };
    const centerX = rect.left + rect.width * (0.5 + initial.x / 100);
    const centerY = rect.top + rect.height * (0.5 + initial.y / 100);
    const startAngle = Math.atan2(startY - centerY, startX - centerX) * 180 / Math.PI;
    const round = (value) => Math.round(value * 100) / 100;
    const move = (moveEvent) => {
      if (mode === "move") onUpdateVisualTransform({
        ...initial,
        x: round(initial.x + (moveEvent.clientX - startX) / Math.max(1, rect.width) * 100),
        y: round(initial.y + (moveEvent.clientY - startY) / Math.max(1, rect.height) * 100),
      });
      if (mode.startsWith("scale-")) {
        const handle = mode.slice(6);
        let candidate = getAnchoredResize({ handle, pointer: { x: moveEvent.clientX, y: moveEvent.clientY }, frame: rect, box: { width: rect.width, height: rect.height }, transform: initial });
        candidate = { ...candidate, scale: Math.max(0.1, Math.min(4, candidate.scale)) };
        const snapped = snapVisualScaleToFrameEdges(candidate, { width: rect.width, height: rect.height });
        candidate = getAnchoredResize({ handle, pointer: { x: moveEvent.clientX, y: moveEvent.clientY }, frame: rect, box: { width: rect.width, height: rect.height }, transform: initial, scale: snapped.transform.scale });
        setOverlaySnapGuides(snapped.guides);
        onUpdateVisualTransform({ ...candidate, x: round(candidate.x), y: round(candidate.y), scale: round(candidate.scale) });
      }
      if (mode === "rotate") {
        const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
        onUpdateVisualTransform({ ...initial, rotation: round(initial.rotation + angle - startAngle) });
      }
    };
    const end = () => { setOverlaySnapGuides([]); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };
  const startOverlayTransform = (event, mode, overlay) => {
    if (!overlay || !onUpdateVisualOverlay) return;
    const frame = previewCanvasRef.current;
    if (!frame) return;
    event.preventDefault(); event.stopPropagation();
    onSelectVisualOverlay?.(overlay.id);
    const rect = frame.getBoundingClientRect();
    const localTime = Math.max(0, currentTime - (overlay.start || 0));
    const initial = resolveVisualTransform(overlay.keyframes, localTime);
    const startX = event.clientX; const startY = event.clientY;
    const centerX = rect.left + rect.width * (0.5 + initial.x / 100);
    const centerY = rect.top + rect.height * (0.5 + initial.y / 100);
    const startAngle = Math.atan2(startY - centerY, startX - centerX) * 180 / Math.PI;
    const round = (value) => Math.round(value * 100) / 100;
    const move = (moveEvent) => {
      if (mode === "move") {
        const candidate = { ...initial, x: round(initial.x + (moveEvent.clientX - startX) / Math.max(1, rect.width) * 100), y: round(initial.y + (moveEvent.clientY - startY) / Math.max(1, rect.height) * 100) };
        const snapped = snapVisualOverlayTransform(candidate);
        setOverlaySnapGuides(snapped.guides);
        onUpdateVisualOverlay(snapped.transform);
      }
      if (mode.startsWith("scale")) {
        const handle = mode.slice(6);
        const box = getVisualOverlayPixelBox(overlay, activePreviewFrameSize);
        let candidate = getAnchoredResize({ handle, pointer: { x: moveEvent.clientX, y: moveEvent.clientY }, frame: rect, box, transform: initial });
        const clampedScale = Math.max(0.08, Math.min(4, candidate.scale));
        candidate = getAnchoredResize({ handle, pointer: { x: moveEvent.clientX, y: moveEvent.clientY }, frame: rect, box, transform: initial, scale: clampedScale });
        onUpdateVisualOverlay({ ...candidate, x: round(candidate.x), y: round(candidate.y), scale: round(candidate.scale) });
      }
      if (mode === "rotate") {
        const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
        onUpdateVisualOverlay({ ...initial, rotation: round(initial.rotation + angle - startAngle) });
      }
    };
    const end = () => { setOverlaySnapGuides([]); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
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
      const mediaTime = Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime : video.currentTime;
      if (Math.abs(mediaTime - lastReportedVideoTimeRef.current) >= 1 / 12) {
        lastReportedVideoTimeRef.current = mediaTime;
        onPreviewVideoTimeUpdate?.(mediaTime);
      }
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

  useEffect(() => {
    if (!isFocusPreviewOpen) return undefined;
    const shell = previewShellRef.current;
    if (!shell) return undefined;
    const updateFocusFrameSize = () => {
      const style = getComputedStyle(shell);
      const availableWidth = Math.max(1, shell.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0));
      const availableHeight = Math.max(1, shell.clientHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0));
      const [ratioWidth, ratioHeight] = String(previewRatio).split("/").map((value) => Number(value.trim()));
      const ratio = Math.max(0.01, ratioWidth > 0 && ratioHeight > 0 ? ratioWidth / ratioHeight : 16 / 9);
      const width = Math.max(1, Math.floor(Math.min(availableWidth, availableHeight * ratio)));
      const height = Math.max(1, Math.floor(width / ratio));
      setFocusPreviewFrameSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    updateFocusFrameSize();
    const observer = window.ResizeObserver ? new ResizeObserver(updateFocusFrameSize) : null;
    observer?.observe(shell);
    window.addEventListener("resize", updateFocusFrameSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateFocusFrameSize);
    };
  }, [isFocusPreviewOpen, previewRatio, previewShellRef]);

  useEffect(() => {
    if (!isFocusPreviewOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsFocusPreviewOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocusPreviewOpen]);

  useEffect(() => {
    if (!isFocusPreviewOpen) return undefined;
    const shell = previewShellRef.current;
    if (!shell) return undefined;
    const [ratioWidth, ratioHeight] = String(previewRatio).split("/").map(Number);
    const ratio = ratioWidth > 0 && ratioHeight > 0 ? ratioWidth / ratioHeight : 16 / 9;
    const update = () => {
      const style = getComputedStyle(shell);
      const availableWidth = Math.max(1, shell.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0));
      const availableHeight = Math.max(1, shell.clientHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0));
      const width = Math.max(1, Math.floor(Math.min(availableWidth, availableHeight * ratio)));
      const height = Math.max(1, Math.floor(width / ratio));
      setFocusPreviewFrameSize((old) => old.width === width && old.height === height ? old : { width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [isFocusPreviewOpen, previewRatio, previewShellRef]);

  const previewStage = (
    <section className={`preview-stage ${isFocusPreviewOpen ? "is-focus-preview" : ""}`} role={isFocusPreviewOpen ? "dialog" : undefined} aria-modal={isFocusPreviewOpen ? "true" : undefined} aria-label={isFocusPreviewOpen ? t("focusPreviewTitle", "大画布编辑") : undefined}>
      {isFocusPreviewOpen ? <header className="focus-preview-header">
        <div><strong>{t("focusPreviewTitle", "大画布编辑")}</strong><span>{t("focusPreviewHint", "点击画面元素进行移动、缩放和旋转")}</span></div>
        <IconButton label={t("closeFocusPreview", "关闭大画布预览")} onClick={() => setIsFocusPreviewOpen(false)}><X size={20} /></IconButton>
      </header> : null}
      <div
        ref={previewShellRef}
        className={`preview-canvas fit-${fitMode} ${hasPreviewContent ? "" : "is-empty"} ${
          previewVisualSrc && !trackVisibility.image ? "is-image-hidden" : ""
        }`}
        style={{ "--preview-ratio": previewRatio }}
        data-asset-drop-track={previewVisualSrc ? "overlay" : "image"}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onDeselectVisuals?.();
        }}
        onDragOver={(event) => {
          const asset = getDraggedAsset?.(event);
          if (asset?.type === "image" || asset?.type === "video") event.preventDefault();
        }}
        onDrop={(event) => {
          const asset = getDraggedAsset?.(event);
          if (asset?.type !== "image" && asset?.type !== "video") return;
          event.preventDefault(); event.stopPropagation();
          if (previewVisualSrc) addVisualOverlay?.(asset);
          else void applyAssetToTrack?.(asset, "image");
        }}
      >
        {!hasPreviewContent ? (
          <button className="preview-empty" type="button" style={activePreviewFrameStyle} onClick={() => fileInputRef.current?.click()}>
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
            style={activePreviewFrameStyle}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) onDeselectVisuals?.();
            }}
          >
            <div className="caption-canvas-guide is-vertical" aria-hidden="true" />
            <div className="caption-canvas-guide is-horizontal" aria-hidden="true" />
            {renderedVisualSrc && trackVisibility.image ? (
              <div className={`visual-media-layer ${visualTransformEditable ? "is-transform-editable" : ""}`} style={visualMaskStyle} onPointerDown={(event) => { event.stopPropagation(); onSelectVisual?.(); if (visualTransformEditable) startVisualTransform(event, "move"); }}>
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
                  muted={previewVisualMuted}
                  playsInline
                  preload="metadata"
                  onTimeUpdate={(event) => onPreviewVideoTimeUpdate?.(event.currentTarget.currentTime)}
                  onSeeked={(event) => {
                    lastReportedVideoTimeRef.current = event.currentTarget.currentTime;
                    onPreviewVideoTimeUpdate?.(event.currentTarget.currentTime);
                  }}
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
            {renderedVisualSrc && trackVisibility.image && visualTransformEditable && (!visualMask.type || visualMask.type === "none") ? (
              <div className="visual-transform-box" style={visualTransformStyle} onPointerDown={(event) => startVisualTransform(event, "move")}>
                <span className="visual-transform-label">{t("visualBasic", "画面")}</span>
                <button className="visual-transform-rotate" type="button" aria-label={t("visualRotation", "旋转")} onPointerDown={(event) => startVisualTransform(event, "rotate")} />
                {['nw', 'ne', 'sw', 'se'].map((corner) => <button key={corner} className={`visual-transform-handle is-${corner}`} type="button" aria-label={t("visualScale", "缩放")} onPointerDown={(event) => startVisualTransform(event, `scale-${corner}`)} />)}
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
            {visualOverlays.map((overlay) => {
              const localTime = Math.max(0, currentTime - (overlay.start || 0));
              const transform = resolveVisualTransform(overlay.keyframes, localTime);
              const containBox = getVisualOverlayPixelBox(overlay, activePreviewFrameSize);
              const style = {
                left: `${50 + transform.x}%`,
                top: `${50 + transform.y}%`,
                width: `${containBox.width * transform.scale}px`,
                height: `${containBox.height * transform.scale}px`,
                transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
                opacity: transform.opacity,
              };
              const selected = overlay.id === selectedVisualOverlayId;
              return <div className={`visual-overlay-layer ${selected ? "is-selected" : ""}`} key={overlay.id} style={{ ...style, zIndex: 3 + (overlay.layer || 1) }} onPointerDown={(event) => startOverlayTransform(event, "move", overlay)}>
                {overlay.type === "video" ? <video src={overlay.src} muted={overlay.muted === true} playsInline autoPlay={isPlaying} preload="metadata" /> : <img src={overlay.src} alt="" draggable={false} />}
                {selected && !isPlaying ? <>
                  <span className="visual-transform-label">{overlay.name || t("pictureInPicture", "画中画")}</span>
                  <div className="visual-overlay-order-actions">
                    <button type="button" aria-label={t("moveLayerUp", "上移一层")} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onReorderVisualOverlay?.(overlay.id, 1); }}><ArrowUp size={12} /></button>
                    <button type="button" aria-label={t("moveLayerDown", "下移一层")} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onReorderVisualOverlay?.(overlay.id, -1); }}><ArrowDown size={12} /></button>
                  </div>
                  <button className="visual-transform-rotate" type="button" aria-label={t("visualRotation", "旋转")} onPointerDown={(event) => startOverlayTransform(event, "rotate", overlay)} />
                  {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => <button key={handle} className={`visual-transform-handle is-${handle}`} type="button" aria-label={t("visualScale", "缩放")} onPointerDown={(event) => startOverlayTransform(event, `scale-${handle}`, overlay)} />)}
                </> : null}
              </div>;
            })}
            {overlaySnapGuides.map((guide) => <div className={`visual-snap-guide is-${guide}`} key={guide} />)}
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
            {captionsEnabled && trackVisibility.caption
              ? (Array.isArray(currentCaptions) ? currentCaptions : currentCaption ? [{ id: "current", text: currentCaption }] : [])
                .map((caption, index, visibleCaptions) => {
                  const basePlacement = caption.placement || captionPlacement;
                  return (
                    <CaptionOverlay
                      key={caption.id}
                      text={caption.text}
                      captionSize={captionSize}
                      captionStyle={captionStyle}
                      placement={{
                        ...basePlacement,
                        y: basePlacement.y + (caption.placement ? 0 : (index - (visibleCaptions.length - 1) / 2) * 12),
                      }}
                      frameSize={activePreviewFrameSize}
                      onPointerDown={(event) => startCaptionDrag(event, caption.id)}
                      onDoubleClick={() => setActiveTool("caption")}
                    />
                  );
                })
              : null}
            {visibleStickers.map((sticker, index) => {
              const isEditable = stickerEditable && sticker.id === selectedStickerId;
              return sticker.src ? (
                <div
                  key={sticker.id || `${sticker.src}-${index}`}
                  className={`sticker-overlay sticker-transform-box ${isEditable ? "is-editable" : ""}`}
                  onPointerDown={(event) => startStickerDrag(event, sticker)}
                  style={{
                    width: `${stickerBaseSize}px`,
                    height: `${stickerBaseSize}px`,
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
          <IconButton label={isFocusPreviewOpen ? t("closeFocusPreview", "关闭大画布预览") : t("fullscreenPreview")} onClick={() => setIsFocusPreviewOpen((open) => !open)}>
            <FrameCorners size={19} />
          </IconButton>
        </div>
      </div>
    </section>
  );
  if (isFocusPreviewOpen && typeof document !== "undefined") {
    return createPortal(<>
      <button className="focus-preview-backdrop" type="button" aria-label={t("closeFocusPreview", "关闭大画布预览")} onClick={() => setIsFocusPreviewOpen(false)} />
      {previewStage}
    </>, document.body);
  }
  return previewStage;
}
