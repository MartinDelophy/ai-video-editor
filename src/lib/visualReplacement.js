import { getVisualAssetPayload } from "./timeline.js";
import { getVisualOverlayPixelBox } from "./visualOverlayTimeline.js";
import { getVisualMaskGeometry, MAX_VISUAL_PLAYBACK_RATE, MIN_VISUAL_PLAYBACK_RATE, normalizeVisualTransform, resolveVisualTransform } from "./visualEffects.js";

export function getTimelineVisualAssets(segments) {
  const assets = new Map();
  for (const clip of segments) {
    if (!clip.src) continue;
    const id = clip.assetId || clip.id;
    const previous = assets.get(id);
    const duration = Math.max(previous?.duration || 0, clip.trackFrameDuration || 0,
      (clip.sourceStart || 0) + (clip.sourceDuration || clip.duration));
    assets.set(id, { ...(previous || clip), id, sourceStart: 0, sourceDuration: duration, duration });
  }
  return [...assets.values()];
}

export function getReplacementTiming(asset, duration, start, end) {
  if (!(Number.isFinite(duration) && duration > 0) || !asset?.src || asset.preparing || asset.mediaUnavailable || !asset.width || !asset.height) return null;
  if (asset.type === "image") return { sourceStart: 0, sourceDuration: 0, playbackRate: 1 };
  if (asset.type !== "video" || !Number.isFinite(start) || !Number.isFinite(end)
    || start < 0 || end > asset.duration || end <= start) return null;
  const sourceDuration = end - start;
  const playbackRate = sourceDuration / duration;
  if (playbackRate < MIN_VISUAL_PLAYBACK_RATE - 1e-8 || playbackRate > MAX_VISUAL_PLAYBACK_RATE + 1e-8) return null;
  return { sourceStart: start, sourceDuration, playbackRate };
}

function reframeOverlayMask(clip, asset, frame) {
  const mask = clip.mask;
  if (!mask || mask.type === "none" || mask.inverted) return {};
  const oldBox = getVisualOverlayPixelBox(clip, frame);
  const box = getVisualOverlayPixelBox(asset, frame);
  if (Math.abs(oldBox.width - box.width) < 1e-6 && Math.abs(oldBox.height - box.height) < 1e-6) return {};
  const geometry = getVisualMaskGeometry(mask, oldBox);
  const scale = Math.max(geometry.width / box.width, geometry.height / box.height);
  const width = Math.min(100, geometry.width / (box.width * scale) * 100);
  const height = Math.min(100, geometry.height / (box.height * scale) * 100);
  const center = (position, size) => Math.max(size / 2, Math.min(100 - size / 2, position));
  const centerX = center(mask.centerX ?? 50, width);
  const centerY = center(mask.centerY ?? 50, height);
  // Keep the on-canvas aperture and its anchor even when a portrait source
  // replaces a landscape one. Adjust the existing motion in the same space.
  const dx = geometry.centerX - oldBox.width / 2 - (centerX / 100 - 0.5) * box.width * scale;
  const dy = geometry.centerY - oldBox.height / 2 - (centerY / 100 - 0.5) * box.height * scale;
  const adjust = (transform) => {
    const angle = transform.rotation * Math.PI / 180;
    return {
      x: transform.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * transform.scale / frame.width * 100,
      y: transform.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * transform.scale / frame.height * 100,
      scale: transform.scale * scale,
    };
  };
  const base = normalizeVisualTransform(clip.baseTransform);
  const keyframes = clip.keyframes?.map((key) => ({
    ...key,
    ...adjust(resolveVisualTransform(clip.keyframes, key.time, base)),
  }));
  return {
    mask: { ...mask, centerX, centerY, ...(mask.type === "circle" ? { size: 100 } : { width, height }) },
    baseTransform: { ...base, ...adjust(base) },
    keyframes,
  };
}

export function replaceVisualClipMedia(clip, asset, timing, { frame, overlay = false, keepSourceAudio = false }) {
  const sourceAudioTiming = keepSourceAudio ? clip.sourceAudioTiming || {
    sourceStart: clip.sourceStart, sourceDuration: clip.sourceDuration,
    playbackRate: clip.playbackRate, speedCurve: clip.speedCurve,
  } : undefined;
  return {
    ...clip,
    ...getVisualAssetPayload(asset),
    ...timing,
    ...(overlay ? reframeOverlayMask(clip, asset, frame) : {}),
    id: clip.id,
    duration: clip.duration,
    nameKey: asset.nameKey || "",
    volume: clip.volume ?? 1,
    spatialEffect: clip.spatialEffect,
    spatialAmount: clip.spatialAmount,
    audioSeparated: clip.audioSeparated,
    sourceAudioOriginAssetId: keepSourceAudio ? clip.sourceAudioOriginAssetId || clip.assetId : undefined,
    sourceAudioOffset: keepSourceAudio ? clip.sourceAudioOffset : undefined,
    sourceAudioUnmapped: !overlay && !keepSourceAudio,
    sourceAudioTiming,
    speedCurve: undefined,
    smartFrame: undefined,
    cinematicDepth: undefined,
    photoParallax: undefined,
    repair: undefined,
    enhancement: undefined,
    archiveMediaId: undefined,
  };
}
