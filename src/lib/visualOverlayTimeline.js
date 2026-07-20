import { normalizeVisualKeyframes, upsertVisualKeyframe } from "./visualEffects.js";
import { createVisualSegment } from "./timeline.js";

export const DEFAULT_OVERLAY_SECONDS = 5;

function toAspectRatio(value, fallback = 1) {
  if (typeof value === "string") {
    const [width, height] = value.split("/").map(Number);
    if (width > 0 && height > 0) return width / height;
  }
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : fallback;
}

export function getVisualOverlayContainBox(overlay, frameAspectRatio) {
  const sourceAspectRatio = overlay?.width > 0 && overlay?.height > 0
    ? overlay.width / overlay.height
    : 1;
  const frameRatio = toAspectRatio(frameAspectRatio);
  if (sourceAspectRatio >= frameRatio) {
    return { widthPercent: 100, heightPercent: (frameRatio / sourceAspectRatio) * 100 };
  }
  return { widthPercent: (sourceAspectRatio / frameRatio) * 100, heightPercent: 100 };
}

export function getVisualOverlayPixelBox(overlay, frameSize) {
  const frameWidth = Math.max(1, Number(frameSize?.width) || 1);
  const frameHeight = Math.max(1, Number(frameSize?.height) || 1);
  const sourceAspectRatio = overlay?.width > 0 && overlay?.height > 0
    ? overlay.width / overlay.height
    : 1;
  if (sourceAspectRatio >= frameWidth / frameHeight) {
    return { width: frameWidth, height: frameWidth / sourceAspectRatio };
  }
  return { width: frameHeight * sourceAspectRatio, height: frameHeight };
}

export function createVisualOverlaySegment(asset, start = 0, options = {}) {
  const duration = Math.max(0.1, Number(options.duration ?? asset?.duration) || DEFAULT_OVERLAY_SECONDS);
  const baseTransform = {
    x: 27,
    y: -24,
    scale: 0.34,
    rotation: 0,
    opacity: 1,
    ...(options.baseTransform || {}),
  };
  return {
    id: options.id || `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    assetId: asset?.id || "",
    name: asset?.name || "画中画",
    type: asset?.type === "video" ? "video" : "image",
    src: asset?.src || "",
    blob: asset?.blob,
    width: Number(asset?.width) || 0,
    height: Number(asset?.height) || 0,
    trackFrames: Array.isArray(asset?.trackFrames) ? asset.trackFrames : [],
    sourceStart: Math.max(0, Number(asset?.sourceStart) || 0),
    sourceDuration: Math.max(0, Number(asset?.sourceDuration) || Number(asset?.duration) || 0),
    playbackRate: Math.max(0.25, Math.min(4, Number(asset?.playbackRate) || 1)),
    start: Math.max(0, Number(start) || 0),
    duration,
    muted: options.muted === true,
    layer: Math.max(1, Number(options.layer) || 1),
    baseTransform,
    keyframes: normalizeVisualKeyframes(options.keyframes || []),
  };
}

export function createMainVisualFromOverlay(overlay) {
  if (!overlay?.src) return null;
  return createVisualSegment(overlay.duration, {
    assetId: overlay.assetId,
    name: overlay.name,
    type: overlay.type,
    src: overlay.src,
    blob: overlay.blob,
    width: overlay.width,
    height: overlay.height,
    duration: overlay.duration,
    trackFrames: overlay.trackFrames,
  });
}

export function getActiveVisualOverlays(segments = [], time = 0) {
  return segments
    .filter((segment) => time >= segment.start && time < segment.start + segment.duration)
    .sort((left, right) => (left.layer || 1) - (right.layer || 1));
}

export function updateVisualOverlayTransform(segment, localTime, transform) {
  return {
    ...segment,
    keyframes: upsertVisualKeyframe(segment?.keyframes, Math.max(0, Number(localTime) || 0), transform),
  };
}

export function snapVisualOverlayTransform(transform, threshold = 1.6) {
  const scale = Math.max(0.08, Number(transform?.scale) || 1);
  const targetsX = [
    { value: 0, guide: "center-x" },
    { value: -50 + scale * 50, guide: "left" },
    { value: 50 - scale * 50, guide: "right" },
  ];
  const targetsY = [
    { value: 0, guide: "center-y" },
    { value: -50 + scale * 50, guide: "top" },
    { value: 50 - scale * 50, guide: "bottom" },
  ];
  const snapAxis = (value, targets) => targets.reduce((best, target) => {
    const distance = Math.abs(value - target.value);
    return distance <= threshold && distance < best.distance ? { ...target, distance } : best;
  }, { value, guide: "", distance: Infinity });
  const x = snapAxis(Number(transform?.x) || 0, targetsX);
  const y = snapAxis(Number(transform?.y) || 0, targetsY);
  return { transform: { ...transform, x: x.value, y: y.value }, guides: [x.guide, y.guide].filter(Boolean) };
}

export function getVisualOverlayPreset(id) {
  const presets = {
    "top-left": { x: -29, y: -27, scale: 0.32, rotation: 0, opacity: 1 },
    "top-right": { x: 29, y: -27, scale: 0.32, rotation: 0, opacity: 1 },
    "bottom-left": { x: -29, y: 27, scale: 0.32, rotation: 0, opacity: 1 },
    "bottom-right": { x: 29, y: 27, scale: 0.32, rotation: 0, opacity: 1 },
    center: { x: 0, y: 0, scale: 0.5, rotation: 0, opacity: 1 },
    full: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  };
  return presets[id] ? { ...presets[id] } : null;
}
