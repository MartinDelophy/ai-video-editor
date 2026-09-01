import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { resolveCaptionStyleForSegment } from "../lib/captionFonts.js";
import { resolveCaptionSizeForSegment } from "../lib/captionStyles.js";
import { resolveCaptionSegmentPlacement } from "../lib/captionLayout.js";
import { CaptionOverlay } from "./CaptionOverlay.jsx";
import { IconButton } from "./ui.jsx";
import { getVisualOverlayPixelBox, resolveVisualOverlayTransform, snapVisualOverlayTransform } from "../lib/visualOverlayTimeline.js";
import { getAnchoredResize } from "../lib/anchoredResize.js";
import { getVisualFitRect } from "../lib/visualGeometry.js";
import { getOverlayToolbarPosition } from "../lib/overlayToolbarPlacement.js";
import { FILTER_OPTIONS, RATIO_OPTIONS } from "../config/editor.js";
import { getVectorDesignAppearance, getVectorRenderSource } from "../lib/vectorDesign.js";
import { hasSubjectEffect, normalizeSubjectEffect } from "../lib/subjectEffects.js";
import { normalizeClickRippleEffect, resolveClickRippleState } from "../lib/clickRippleEffect.js";
import { SubjectMaterialFilterDefs } from "./SubjectMaterialFilter.jsx";
import { drawCinematicDepthFrame, normalizeCinematicDepth } from "../lib/depthOfField.js";
import { drawPhotoParallaxFrame, normalizePhotoParallax } from "../lib/photoParallax.js";
import { composeColorGradeFilter, resolveColorGrade } from "../lib/colorGrade.js";

function ClickRippleOverlay({ effect: value, time }) {
  const effect = normalizeClickRippleEffect(value);
  if (!effect.enabled) return null;
  const state = resolveClickRippleState(effect, time);
  const revealRadius = effect.radius + (100 - effect.radius) * state.revealProgress;
  const ringRadius = effect.radius + (100 - effect.radius) * state.rippleProgress;
  const grayscale = effect.colorAmount;
  const mask = `radial-gradient(circle farthest-corner at ${state.revealX}% ${state.revealY}%, transparent 0 ${revealRadius}%, #000 ${Math.min(103, revealRadius + 2.5)}%)`;
  const style = {
    "--click-x": `${state.hitX}%`,
    "--click-y": `${state.hitY}%`,
    "--click-cursor-x": `${state.x}%`,
    "--click-cursor-y": `${state.y}%`,
    "--click-radius": `${ringRadius}%`,
    "--click-hit-radius": `${effect.radius}%`,
    "--click-ring-opacity": state.ringOpacity,
    "--click-press": state.press * state.hitScale,
    "--click-hit-opacity": state.hitOpacity,
    "--click-glow": state.effect.glow,
    "--click-color": state.effect.color,
  };
  return (
    <div className="click-ripple-preview" style={style} aria-hidden="true">
      {grayscale > 0.002 ? <span className="click-ripple-desaturate" style={{ backdropFilter: `grayscale(${grayscale})`, WebkitBackdropFilter: `grayscale(${grayscale})`, maskImage: mask, WebkitMaskImage: mask }} /> : null}
      <span className="click-ripple-water-wave" style={{ "--click-wave-radius": `${ringRadius}%`, "--click-wave-opacity": state.ringOpacity }} />
      <span className="click-ripple-hit-circle" />
    </div>
  );
}

function VisualOverlayMedia({ overlay, src, style, isPlaying, localTime }) {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const depthEffect = useMemo(() => normalizeCinematicDepth(overlay.cinematicDepth), [overlay.cinematicDepth]);
  const parallaxEffect = useMemo(() => normalizePhotoParallax(overlay.photoParallax), [overlay.photoParallax]);
  const depthUrl = overlay.depthAnalysis?.depthUrl || "";
  const depthActive = depthEffect.enabled && Boolean(depthUrl);
  const parallaxActive = overlay.type === "image" && parallaxEffect.enabled && Boolean(depthUrl);
  const depthRenderActive = parallaxActive || depthActive;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || overlay.type !== "video") return;
    const playbackRate = Math.max(0.25, Math.min(4, Number(overlay.playbackRate) || 1));
    const sourceTime = Math.max(0, Number(overlay.sourceStart) || 0) + Math.max(0, localTime) * playbackRate;
    video.playbackRate = playbackRate;
    if (Number.isFinite(video.duration) && Math.abs(video.currentTime - sourceTime) > 0.12) video.currentTime = Math.min(sourceTime, Math.max(0, video.duration - 0.01));
    if (isPlaying) video.play().catch(() => {});
    else video.pause();
  }, [isPlaying, localTime, overlay.playbackRate, overlay.sourceStart, overlay.type]);
  useEffect(() => {
    if (!depthRenderActive || !canvasRef.current) return undefined;
    let canceled = false;
    const depthImage = new Image();
    depthImage.onload = () => {
      if (canceled) return;
      const canvas = canvasRef.current;
      const source = overlay.type === "video" ? videoRef.current : imageRef.current;
      if (!canvas || !source) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.round(rect.width * Math.max(1, window.devicePixelRatio || 1)));
      canvas.height = Math.max(2, Math.round(rect.height * Math.max(1, window.devicePixelRatio || 1)));
      const context = canvas.getContext("2d", { alpha: true });
      if (parallaxActive) drawPhotoParallaxFrame(context, source, canvas, { effect: parallaxEffect, depthVisual: depthImage, fitMode: "contain", filter: style?.filter, time: localTime });
      else drawCinematicDepthFrame(context, source, canvas, { effect: depthEffect, depthVisual: depthImage, fitMode: "contain", filter: style?.filter });
    };
    depthImage.src = depthUrl;
    return () => { canceled = true; };
  }, [depthEffect, depthRenderActive, depthUrl, localTime, overlay.type, parallaxActive, parallaxEffect, style?.filter]);
  return <>
    {overlay.type === "video"
      ? <video ref={videoRef} src={src} crossOrigin="anonymous" muted={overlay.muted === true} playsInline preload="metadata" style={{ ...style, opacity: depthRenderActive ? 0 : style?.opacity }} />
      : <img ref={imageRef} src={src} alt="" crossOrigin="anonymous" draggable={false} style={{ ...style, opacity: depthRenderActive ? 0 : style?.opacity }} />}
    {depthRenderActive ? <canvas ref={canvasRef} className="cinematic-depth-preview-canvas photo-parallax-preview-canvas" /> : null}
  </>;
}

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
  ratioId,
  setRatioId,
  visualObjectFit,
  visualObjectPosition,
  visionOverlayBoxes = [],
  showVisionOverlays = false,
  backgroundRemoved = false,
  smartCropActive = false,
  smartFramePresentation = "crop",
  smartFrameBackgroundPosition = "50% 50%",
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
  subjectEffect,
  subjectCutoutUrl = "",
  cinematicDepth,
  photoParallax,
  depthAnalysis = null,
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
  visualOverlayMaskEditable = false,
  onUpdateVisualOverlayMask,
  onReorderVisualOverlay,
}) {
  const [overlaySnapGuides, setOverlaySnapGuides] = useState([]);
  const previewImageRef = useRef(null);
  const smartBackgroundVideoRef = useRef(null);
  const depthCanvasRef = useRef(null);
  const lastReportedVideoTimeRef = useRef(-Infinity);
  const [isFocusPreviewOpen, setIsFocusPreviewOpen] = useState(false);
  const [focusPreviewFrameSize, setFocusPreviewFrameSize] = useState({ width: 0, height: 0 });
  const [previewRatioWidth, previewRatioHeight] = String(previewRatio).split("/").map((value) => Number(value.trim()));
  const previewRatioValue = previewRatioWidth > 0 && previewRatioHeight > 0 ? previewRatioWidth / previewRatioHeight : 16 / 9;
  const focusPreviewOrientation = previewRatioValue > 1.1 ? "landscape" : previewRatioValue < 0.9 ? "portrait" : "square";
  const visibleStickers = stickers;
  const hasStickerOverlay = visibleStickers.some((sticker) => sticker?.src || sticker?.text);
  const hasPreviewContent = Boolean(previewVisualSrc || hasStickerOverlay || visualOverlays.length);
  const baseRenderedVisualSrc = previewVisualRenderSrc || previewVisualSrc;
  const activeObjectFit = visualObjectFit || fitMode;
  const activeObjectPosition = visualObjectPosition || "50% 50%";
  const smartContainActive = smartCropActive && smartFramePresentation === "safe-contain";

  const syncSmartBackgroundVideo = (sourceVideo) => {
    const backgroundVideo = smartBackgroundVideoRef.current;
    if (!backgroundVideo || !sourceVideo) return;
    if (Math.abs(backgroundVideo.currentTime - sourceVideo.currentTime) > 0.04) {
      backgroundVideo.currentTime = sourceVideo.currentTime;
    }
    if (sourceVideo.paused) backgroundVideo.pause();
    else void backgroundVideo.play().catch(() => {});
  };
  const visualTransform = resolveVisualTransform(visualEffects?.keyframes, visualLocalTime, visualEffects?.baseTransform);
  const visualAnimation = resolveVisualClipAnimation(visualEffects?.animation, visualLocalTime, visualEffects?.duration);
  const visualMask = visualEffects?.mask ?? {};
  const resolvedColorGrade = useMemo(
    () => resolveColorGrade(visualEffects?.keyframes, visualLocalTime, visualEffects?.colorGrade),
    [visualEffects?.colorGrade, visualEffects?.keyframes, visualLocalTime],
  );
  const selectedFilterCss = useMemo(
    () => composeColorGradeFilter(selectedFilter.css, resolvedColorGrade),
    [resolvedColorGrade, selectedFilter.css],
  );
  const normalizedSubjectEffect = normalizeSubjectEffect(subjectEffect);
  const normalizedCinematicDepth = useMemo(() => normalizeCinematicDepth(cinematicDepth), [cinematicDepth]);
  const cinematicDepthActive = normalizedCinematicDepth.enabled && Boolean(depthAnalysis?.depthUrl);
  const normalizedPhotoParallax = useMemo(() => normalizePhotoParallax(photoParallax), [photoParallax]);
  const photoParallaxActive = previewVisualType === "image" && normalizedPhotoParallax.enabled && Boolean(depthAnalysis?.depthUrl);
  const depthRenderActive = photoParallaxActive || cinematicDepthActive;
  const subjectEffectActive = hasSubjectEffect(normalizedSubjectEffect) && Boolean(subjectCutoutUrl);
  const replacesBackground = subjectEffectActive && (
    normalizedSubjectEffect.background.visible === false
    || normalizedSubjectEffect.background.mode !== "original"
  );
  const outline = normalizedSubjectEffect.outline;
  const outlineFilter = outline.enabled ? "url(#subject-outline-filter)" : "none";
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
  const previewPixelRatio = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
  const renderedVisualSrc = visualEffects?.kind === "vector" || visualEffects?.vectorBody
    ? getVectorRenderSource(visualEffects, {
        targetWidth: frameWidth,
        targetHeight: frameHeight,
        pixelRatio: previewPixelRatio,
        scale: Math.max(1, visualTransform.scale * visualAnimation.scale),
      })
    : baseRenderedVisualSrc;
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
  const visualContentBox = activeObjectFit === "contain"
    ? getVisualFitRect(
        { width: visualEffects?.width, height: visualEffects?.height },
        { width: frameWidth, height: frameHeight },
        "contain",
      )
    : { x: 0, y: 0, width: frameWidth, height: frameHeight };
  const hasVisualContentBox = visualContentBox.width > 0 && visualContentBox.height > 0;
  const transformBox = hasVisualContentBox
    ? visualContentBox
    : { x: 0, y: 0, width: frameWidth, height: frameHeight };
  const visualTransformBoxStyle = {
    left: `${transformBox.x + transformBox.width / 2 + (visualTransform.x + visualAnimation.x) / 100 * frameWidth}px`,
    top: `${transformBox.y + transformBox.height / 2 + (visualTransform.y + visualAnimation.y) / 100 * frameHeight}px`,
    width: `${transformBox.width}px`,
    height: `${transformBox.height}px`,
    transform: `translate(-50%, -50%) scale(${visualTransform.scale * visualAnimation.scale}) rotate(${visualTransform.rotation}deg)`,
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
  useEffect(() => {
    if (!depthRenderActive || !depthCanvasRef.current) return undefined;
    let canceled = false;
    const depthImage = new Image();
    depthImage.onload = () => {
      if (canceled) return;
      const canvas = depthCanvasRef.current;
      const source = previewVisualType === "video" ? previewVideoRef.current : previewImageRef.current;
      if (!canvas || !source) return;
      canvas.width = Math.max(2, Math.round(frameWidth * previewPixelRatio));
      canvas.height = Math.max(2, Math.round(frameHeight * previewPixelRatio));
      const context = canvas.getContext("2d", { alpha: true });
      if (photoParallaxActive) drawPhotoParallaxFrame(context, source, canvas, {
        effect: normalizedPhotoParallax,
        depthVisual: depthImage,
        fitMode: activeObjectFit,
        filter: selectedFilterCss,
        time: visualLocalTime,
      });
      else drawCinematicDepthFrame(context, source, canvas, {
        effect: normalizedCinematicDepth,
        depthVisual: depthImage,
        fitMode: activeObjectFit,
        filter: selectedFilterCss,
      });
    };
    depthImage.src = depthAnalysis.depthUrl;
    return () => { canceled = true; };
  }, [activeObjectFit, depthAnalysis?.depthUrl, depthRenderActive, frameHeight, frameWidth, normalizedCinematicDepth, normalizedPhotoParallax, photoParallaxActive, previewPixelRatio, previewVideoRef, previewVisualType, selectedFilterCss, visualLocalTime]);
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
        let candidate = getAnchoredResize({ handle, pointer: { x: moveEvent.clientX, y: moveEvent.clientY }, frame: rect, box: { width: transformBox.width, height: transformBox.height }, transform: initial });
        candidate = { ...candidate, scale: Math.max(0.1, Math.min(4, candidate.scale)) };
        const snapped = snapVisualScaleToFrameEdges(candidate, { width: rect.width, height: rect.height }, 8, transformBox);
        candidate = getAnchoredResize({ handle, pointer: { x: moveEvent.clientX, y: moveEvent.clientY }, frame: rect, box: { width: transformBox.width, height: transformBox.height }, transform: initial, scale: snapped.transform.scale });
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
    const initial = resolveVisualOverlayTransform(overlay, localTime);
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
        onUpdateVisualOverlay(overlay.id, snapped.transform);
      }
      if (mode.startsWith("scale")) {
        const handle = mode.slice(6);
        const box = getVisualOverlayPixelBox(overlay, activePreviewFrameSize);
        let candidate = getAnchoredResize({ handle, pointer: { x: moveEvent.clientX, y: moveEvent.clientY }, frame: rect, box, transform: initial });
        const clampedScale = Math.max(0.08, Math.min(4, candidate.scale));
        candidate = getAnchoredResize({ handle, pointer: { x: moveEvent.clientX, y: moveEvent.clientY }, frame: rect, box, transform: initial, scale: clampedScale });
        onUpdateVisualOverlay(overlay.id, { ...candidate, x: round(candidate.x), y: round(candidate.y), scale: round(candidate.scale) });
      }
      if (mode === "rotate") {
        const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
        onUpdateVisualOverlay(overlay.id, { ...initial, rotation: round(initial.rotation + angle - startAngle) });
      }
    };
    const end = () => { setOverlaySnapGuides([]); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  };
  const startOverlayMaskEdit = (event, mode, overlay) => {
    if (!overlay || !onUpdateVisualOverlayMask) return;
    const layer = event.currentTarget.closest(".visual-overlay-layer");
    if (!layer) return;
    event.preventDefault(); event.stopPropagation();
    const mask = overlay.mask ?? {};
    const centerX = Number.isFinite(mask.centerX) ? mask.centerX : 50;
    const centerY = Number.isFinite(mask.centerY) ? mask.centerY : 50;
    const isCircle = mask.type === "circle";
    const width = isCircle ? (Number.isFinite(mask.size) ? mask.size : 72) : (Number.isFinite(mask.width) ? mask.width : 80);
    const height = isCircle ? width : (Number.isFinite(mask.height) ? mask.height : 80);
    const startX = event.clientX;
    const startY = event.clientY;
    const radians = -(Number(overlay.baseTransform?.rotation) || 0) * Math.PI / 180;
    const move = (moveEvent) => {
      const clientDx = moveEvent.clientX - startX;
      const clientDy = moveEvent.clientY - startY;
      const localDx = clientDx * Math.cos(radians) - clientDy * Math.sin(radians);
      const localDy = clientDx * Math.sin(radians) + clientDy * Math.cos(radians);
      const dx = localDx / Math.max(1, layer.offsetWidth) * 100;
      const dy = localDy / Math.max(1, layer.offsetHeight) * 100;
      if (mode === "move") {
        onUpdateVisualOverlayMask({
          ...mask,
          centerX: Math.max(width / 2, Math.min(100 - width / 2, centerX + dx)),
          centerY: Math.max(height / 2, Math.min(100 - height / 2, centerY + dy)),
        });
      } else if (isCircle) {
        onUpdateVisualOverlayMask({ ...mask, size: Math.max(8, Math.min(100, width + Math.max(dx, dy) * 2)) });
      } else {
        onUpdateVisualOverlayMask({
          ...mask,
          width: Math.max(8, Math.min(100, width + dx * 2)),
          height: Math.max(8, Math.min(100, height + dy * 2)),
        });
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
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

  const previewStage = (
    <section
      className={`preview-stage ${isFocusPreviewOpen ? `is-focus-preview is-focus-${focusPreviewOrientation}` : ""}`}
      style={isFocusPreviewOpen ? { "--focus-preview-ratio": previewRatioValue } : undefined}
      role={isFocusPreviewOpen ? "dialog" : undefined}
      aria-modal={isFocusPreviewOpen ? "true" : undefined}
      aria-label={isFocusPreviewOpen ? t("focusPreviewTitle", "大画布编辑") : undefined}
    >
      <SubjectMaterialFilterDefs effect={normalizedSubjectEffect} />
      {isFocusPreviewOpen ? <header className="focus-preview-header">
        <div><strong>{t("focusPreviewTitle", "大画布编辑")}</strong><span>{t("focusPreviewHint", "点击画面元素进行移动、缩放和旋转")}</span></div>
        <button
          className="focus-preview-close"
          type="button"
          aria-label={t("closeFocusPreview", "关闭大画布预览")}
          title={t("closeFocusPreview", "关闭大画布预览")}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsFocusPreviewOpen(false);
          }}
        >
          <X size={22} />
        </button>
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
          <button className="preview-empty" type="button" onClick={() => fileInputRef.current?.click()}>
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
            {renderedVisualSrc && trackVisibility.image && subjectEffectActive ? (
              <div className={`subject-effect-preview is-background-${normalizedSubjectEffect.background.mode}`} aria-hidden="true">
                {replacesBackground ? <div
                  className="subject-effect-background"
                  style={normalizedSubjectEffect.background.visible === false
                    ? { background: "#0b1116" }
                    : normalizedSubjectEffect.background.mode === "color"
                    ? { background: normalizedSubjectEffect.background.color, opacity: normalizedSubjectEffect.background.opacity }
                    : undefined}
                >
                  {normalizedSubjectEffect.background.visible !== false && normalizedSubjectEffect.background.mode === "blur" ? (
                    previewVisualType === "video"
                      ? <video src={previewVisualSrc} muted playsInline autoPlay={isPlaying} style={{ objectFit: "cover", filter: `blur(${normalizedSubjectEffect.background.blur}px) brightness(${1 - normalizedSubjectEffect.background.darken})`, transform: "scale(1.1)" }} />
                      : <img src={previewVisualSrc} alt="" style={{ objectFit: "cover", filter: `blur(${normalizedSubjectEffect.background.blur}px) brightness(${1 - normalizedSubjectEffect.background.darken})`, transform: "scale(1.1)" }} />
                  ) : null}
                </div> : null}
                <img
                  className="subject-effect-cutout"
                  src={subjectCutoutUrl}
                  alt=""
                  style={{
                    ...visualTransformStyle,
                    objectFit: activeObjectFit,
                    objectPosition: activeObjectPosition,
                    filter: `${selectedFilterCss === "none" ? "" : selectedFilterCss} ${outlineFilter}`.trim() || "none",
                  }}
                />
              </div>
            ) : null}
            {renderedVisualSrc && trackVisibility.image ? (
              <div
                className={`visual-media-layer ${visualTransformEditable ? "is-transform-editable" : ""} ${replacesBackground ? "is-subject-sync-source" : ""}`}
                style={visualMaskStyle}
                aria-hidden={replacesBackground ? "true" : undefined}
                onPointerDown={(event) => {
                  if (replacesBackground) return;
                  event.stopPropagation();
                  onSelectVisual?.();
                  if (visualTransformEditable) startVisualTransform(event, "move");
                }}
              >
                {smartContainActive && previewVisualType === "image" ? <img
                  className="smart-frame-fill-background"
                  src={renderedVisualSrc}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ objectPosition: smartFrameBackgroundPosition }}
                /> : null}
                {smartContainActive && previewVisualType === "video" ? <video
                  ref={smartBackgroundVideoRef}
                  className="smart-frame-fill-background"
                  src={previewVisualSrc}
                  crossOrigin="anonymous"
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                  style={{ objectPosition: smartFrameBackgroundPosition }}
                /> : null}
                {previewVisualType === "image" ? <img
                  ref={previewImageRef}
                  src={renderedVisualSrc}
                  alt={t("currentMediaAlt")}
                  crossOrigin="anonymous"
                  style={{ ...visualTransformStyle, opacity: depthRenderActive ? 0 : visualTransformStyle.opacity, filter: selectedFilterCss, objectFit: activeObjectFit, objectPosition: activeObjectPosition, background: smartContainActive ? "transparent" : undefined }}
                /> : null}
                {previewVisualType === "video" ? <video
                  key={previewVisualSrc}
                  ref={previewVideoRef}
                  className="preview-video"
                  src={previewVisualSrc}
                  crossOrigin="anonymous"
                  muted={previewVisualMuted}
                  playsInline
                  preload="metadata"
                  onTimeUpdate={(event) => {
                    syncSmartBackgroundVideo(event.currentTarget);
                    onPreviewVideoTimeUpdate?.(event.currentTarget.currentTime);
                  }}
                  onSeeked={(event) => {
                    syncSmartBackgroundVideo(event.currentTarget);
                    lastReportedVideoTimeRef.current = event.currentTarget.currentTime;
                    onPreviewVideoTimeUpdate?.(event.currentTarget.currentTime);
                  }}
                  style={{
                    ...visualTransformStyle, opacity: depthRenderActive ? 0 : visualTransformStyle.opacity, filter: selectedFilterCss, objectFit: activeObjectFit, objectPosition: activeObjectPosition, background: smartContainActive ? "transparent" : undefined,
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
                {depthRenderActive ? <canvas ref={depthCanvasRef} className="cinematic-depth-preview-canvas photo-parallax-preview-canvas" style={visualTransformStyle} /> : null}
                {showRemasterPreview ? <img
                  className="remaster-preview-frame"
                  src={enhancement.previewUrl}
                  alt={t("remasterPreviewAlt")}
                  style={{ ...visualTransformStyle, filter: selectedFilterCss, objectFit: activeObjectFit, objectPosition: activeObjectPosition }}
                /> : null}
              </div>
            ) : null}
            {renderedVisualSrc && trackVisibility.image ? <ClickRippleOverlay effect={visualEffects?.clickRipple} time={visualLocalTime} /> : null}
            {renderedVisualSrc && trackVisibility.image && visualTransformEditable && !visualMaskEditable ? (
              <div className="visual-transform-box" style={visualTransformBoxStyle} onPointerDown={(event) => startVisualTransform(event, "move")}>
                <button className="visual-transform-rotate" type="button" aria-label={t("visualRotation", "旋转")} onPointerDown={(event) => startVisualTransform(event, "rotate")} />
                {['nw', 'ne', 'sw', 'se'].map((corner) => <button key={corner} className={`visual-transform-handle is-${corner}`} type="button" aria-label={t("visualScale", "缩放")} onPointerDown={(event) => startVisualTransform(event, `scale-${corner}`)} />)}
              </div>
            ) : null}
            {previewTransition?.next?.src && trackVisibility.image ? (
              <div className={`preview-transition-layer type-${previewTransition.id}`} style={{ "--transition-progress": previewTransition.progress }}>
                {previewTransition.next.type === "video" ? (
                  <video src={previewTransition.next.src} crossOrigin="anonymous" muted playsInline autoPlay preload="auto" style={{ objectFit: activeObjectFit, objectPosition: activeObjectPosition }} />
                ) : (
                  <img src={previewTransition.next.src} alt="" crossOrigin="anonymous" style={{ objectFit: activeObjectFit, objectPosition: activeObjectPosition }} />
                )}
                {previewTransition.id === "flash" ? <i /> : null}
              </div>
            ) : null}
            {visualOverlays.map((overlay) => {
              const localTime = Math.max(0, currentTime - (overlay.start || 0));
              const transform = resolveVisualOverlayTransform(overlay, localTime);
              const animation = resolveVisualClipAnimation(overlay.animation, localTime, overlay.duration);
              const animatedTransform = {
                ...transform,
                x: transform.x + animation.x,
                y: transform.y + animation.y,
                scale: transform.scale * animation.scale,
                opacity: transform.opacity * animation.opacity,
              };
              const vectorAppearance = getVectorDesignAppearance(overlay.vectorDesign);
              const isVector = overlay.kind === "vector" || Boolean(overlay.vectorBody);
              const containBox = getVisualOverlayPixelBox(overlay, activePreviewFrameSize);
              const overlayFilter = FILTER_OPTIONS.find((option) => option.id === overlay.filterId)?.css || "none";
              const overlaySubjectEffect = normalizeSubjectEffect(overlay.subjectEffect);
              const overlayCutoutUrl = overlay.visionAnalysis?.cutoutUrl || "";
              const overlaySubjectActive = hasSubjectEffect(overlaySubjectEffect) && Boolean(overlayCutoutUrl);
              const overlaySubjectFilterId = `overlay-subject-${String(overlay.id).replace(/[^a-z0-9_-]/gi, "-")}`;
              const showOverlayOriginal = !overlaySubjectActive || (
                overlaySubjectEffect.background.visible !== false
                && overlaySubjectEffect.background.mode === "original"
              );
              const overlayMask = overlay.mask ?? { type: "none" };
              const hasOverlayMask = overlayMask.type && overlayMask.type !== "none";
              const overlayMaskUrl = hasOverlayMask
                ? getVisualMaskSvgDataUrl(overlayMask, {
                    width: Math.max(1, containBox.width * animatedTransform.scale),
                    height: Math.max(1, containBox.height * animatedTransform.scale),
                  })
                : "";
              const style = {
                left: `${50 + animatedTransform.x}%`,
                top: `${50 + animatedTransform.y}%`,
                width: `${containBox.width * animatedTransform.scale}px`,
                height: `${containBox.height * animatedTransform.scale}px`,
                transform: `translate(-50%, -50%) rotate(${animatedTransform.rotation}deg)`,
                opacity: animatedTransform.opacity * (isVector ? vectorAppearance.opacity : 1),
                mixBlendMode: isVector ? vectorAppearance.cssBlendMode : undefined,
                WebkitMaskImage: overlayMaskUrl ? `url("${overlayMaskUrl}")` : undefined,
                maskImage: overlayMaskUrl ? `url("${overlayMaskUrl}")` : undefined,
                WebkitMaskSize: overlayMaskUrl ? "100% 100%" : undefined,
                maskSize: overlayMaskUrl ? "100% 100%" : undefined,
                WebkitMaskRepeat: overlayMaskUrl ? "no-repeat" : undefined,
                maskRepeat: overlayMaskUrl ? "no-repeat" : undefined,
              };
              const mediaStyle = { filter: isVector ? vectorAppearance.filter : overlayFilter };
              const cutoutFilter = `${overlayFilter === "none" ? "" : overlayFilter} url(#${overlaySubjectFilterId})`.trim();
              const overlayRenderSrc = isVector
                ? getVectorRenderSource(overlay, {
                    targetWidth: containBox.width * animatedTransform.scale,
                    targetHeight: containBox.height * animatedTransform.scale,
                    pixelRatio: previewPixelRatio,
                    scale: 1,
                  })
                : overlay.src;
              const selected = overlay.id === selectedVisualOverlayId;
              const overlayCenterX = frameWidth * (0.5 + animatedTransform.x / 100);
              const overlayCenterY = frameHeight * (0.5 + animatedTransform.y / 100);
              const overlayToolbar = getOverlayToolbarPosition({
                frameWidth,
                frameHeight,
                centerX: overlayCenterX,
                centerY: overlayCenterY,
                width: containBox.width * animatedTransform.scale,
                height: containBox.height * animatedTransform.scale,
                rotation: animatedTransform.rotation,
              });
              return <Fragment key={overlay.id}>
                <div className={`visual-overlay-layer ${selected ? "is-selected" : ""}`} style={{ ...style, zIndex: 3 + (overlay.layer || 1) }} onPointerDown={(event) => startOverlayTransform(event, "move", overlay)}>
                  {overlaySubjectActive ? <SubjectMaterialFilterDefs effect={overlaySubjectEffect} filterId={overlaySubjectFilterId} /> : null}
                  {overlaySubjectActive
                    && overlaySubjectEffect.background.visible !== false
                    && overlaySubjectEffect.background.mode === "color"
                    ? <span
                        className="visual-overlay-subject-background"
                        style={{
                          background: overlaySubjectEffect.background.color,
                          opacity: overlaySubjectEffect.background.opacity,
                        }}
                      />
                    : null}
                  {showOverlayOriginal ? <VisualOverlayMedia overlay={overlay} src={overlayRenderSrc} style={mediaStyle} isPlaying={isPlaying} localTime={localTime} /> : null}
                  {overlaySubjectActive
                    && overlaySubjectEffect.background.visible !== false
                    && overlaySubjectEffect.background.mode === "blur"
                    ? <span className="visual-overlay-subject-background">
                        <VisualOverlayMedia
                          overlay={overlay}
                          src={overlayRenderSrc}
                          style={{
                            filter: `blur(${overlaySubjectEffect.background.blur}px) brightness(${1 - overlaySubjectEffect.background.darken})`,
                            opacity: overlaySubjectEffect.background.opacity,
                            transform: "scale(1.08)",
                          }}
                          isPlaying={isPlaying}
                          localTime={localTime}
                        />
                      </span>
                    : null}
                  {overlaySubjectActive ? <img
                    className="visual-overlay-subject-cutout"
                    src={overlayCutoutUrl}
                    alt=""
                    style={{ filter: cutoutFilter }}
                  /> : null}
                  <ClickRippleOverlay effect={overlay.clickRipple} time={localTime} />
                  {selected && !isPlaying && hasOverlayMask && visualOverlayMaskEditable ? <div
                    className={`visual-mask-editor is-${overlayMask.type}`}
                    style={{
                      left: `${(Number.isFinite(overlayMask.centerX) ? overlayMask.centerX : 50) - (overlayMask.type === "circle" ? (Number.isFinite(overlayMask.size) ? overlayMask.size : 72) : (Number.isFinite(overlayMask.width) ? overlayMask.width : 80)) / 2}%`,
                      top: `${(Number.isFinite(overlayMask.centerY) ? overlayMask.centerY : 50) - (overlayMask.type === "circle" ? (Number.isFinite(overlayMask.size) ? overlayMask.size : 72) : (Number.isFinite(overlayMask.height) ? overlayMask.height : 80)) / 2}%`,
                      width: `${overlayMask.type === "circle" ? (Number.isFinite(overlayMask.size) ? overlayMask.size : 72) : (Number.isFinite(overlayMask.width) ? overlayMask.width : 80)}%`,
                      height: `${overlayMask.type === "circle" ? (Number.isFinite(overlayMask.size) ? overlayMask.size : 72) : (Number.isFinite(overlayMask.height) ? overlayMask.height : 80)}%`,
                    }}
                    onPointerDown={(event) => startOverlayMaskEdit(event, "move", overlay)}
                  ><span>{t("visualMask")}</span><button type="button" aria-label={t("visualMaskResize")} onPointerDown={(event) => startOverlayMaskEdit(event, "resize", overlay)} /></div> : null}
                  {selected && !isPlaying && !visualOverlayMaskEditable ? <>
                    <button className="visual-transform-rotate" type="button" aria-label={t("visualRotation", "旋转")} onPointerDown={(event) => startOverlayTransform(event, "rotate", overlay)} />
                    {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => <button key={handle} className={`visual-transform-handle is-${handle}`} type="button" aria-label={t("visualScale", "缩放")} onPointerDown={(event) => startOverlayTransform(event, `scale-${handle}`, overlay)} />)}
                  </> : null}
                </div>
                {selected && !isPlaying ? (
                  <div
                    className={`visual-overlay-order-actions is-${overlayToolbar.placement}`}
                    style={{ left: `${overlayToolbar.left}px`, top: `${overlayToolbar.top}px` }}
                    role="toolbar"
                    aria-label={t("pictureInPicture", "画中画")}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <button type="button" title={t("moveLayerUp", "上移一层")} aria-label={t("moveLayerUp", "上移一层")} onClick={(event) => { event.stopPropagation(); onReorderVisualOverlay?.(overlay.id, 1); }}><ArrowUp size={15} /></button>
                    <button type="button" title={t("moveLayerDown", "下移一层")} aria-label={t("moveLayerDown", "下移一层")} onClick={(event) => { event.stopPropagation(); onReorderVisualOverlay?.(overlay.id, -1); }}><ArrowDown size={15} /></button>
                  </div>
                ) : null}
              </Fragment>;
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
                  const basePlacement = resolveCaptionSegmentPlacement(caption, captionPlacement);
                  return (
                    <CaptionOverlay
                      key={caption.id}
                      text={caption.text}
                      captionSize={resolveCaptionSizeForSegment(captionSize, caption)}
                      captionStyle={resolveCaptionStyleForSegment(captionStyle, caption)}
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
            className="fit-button desktop-fit-button"
            type="button"
            onClick={() => {
              setFitMode((mode) => (mode === "contain" ? "cover" : "contain"));
              notify(fitMode === "contain" ? "预览已切换为填充裁切" : "预览已切换为完整适配");
            }}
          >
            {fitMode === "contain" ? t("fit") : t("cover")} <CaretDown size={14} />
          </button>
          <label className="mobile-ratio-select" aria-label={t("canvasRatio", "画布比例")}>
            <select value={ratioId} onChange={(event) => setRatioId?.(event.target.value)}>
              {RATIO_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
            </select>
            <CaretDown size={14} />
          </label>
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
