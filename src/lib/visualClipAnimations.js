export const VISUAL_CLIP_ANIMATION_OPTIONS = [
  { id: "none", labelKey: "visualAnimationNone" },
  { id: "fade", labelKey: "visualAnimationFade" },
  { id: "zoom", labelKey: "visualAnimationZoom" },
  { id: "slide-left", labelKey: "visualAnimationSlideLeft" },
  { id: "slide-up", labelKey: "visualAnimationSlideUp" },
];

export const DEFAULT_VISUAL_ANIMATION_DURATION = 0.6;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function easeOutCubic(value) {
  const inverse = 1 - clamp01(value);
  return 1 - inverse * inverse * inverse;
}

function animationTransform(id, amount) {
  const remaining = 1 - easeOutCubic(amount);
  if (id === "fade") return { x: 0, y: 0, scale: 1, opacity: 1 - remaining };
  if (id === "zoom") return { x: 0, y: 0, scale: 1 - remaining * 0.18, opacity: 1 };
  if (id === "slide-left") return { x: -18 * remaining, y: 0, scale: 1, opacity: 1 };
  if (id === "slide-up") return { x: 0, y: 18 * remaining, scale: 1, opacity: 1 };
  return { x: 0, y: 0, scale: 1, opacity: 1 };
}

export function normalizeVisualClipAnimation(animation = {}) {
  const normalizePhase = (phase) => ({
    id: phase?.id || "none",
    duration: Math.max(0.1, Math.min(3, Number(phase?.duration) || DEFAULT_VISUAL_ANIMATION_DURATION)),
  });
  return { in: normalizePhase(animation.in), out: normalizePhase(animation.out) };
}

export function resolveVisualClipAnimation(animation, localTime, clipDuration) {
  const normalized = normalizeVisualClipAnimation(animation);
  const safeDuration = Math.max(0.01, Number(clipDuration) || 0.01);
  const safeTime = Math.max(0, Math.min(safeDuration, Number(localTime) || 0));
  let result = { x: 0, y: 0, scale: 1, opacity: 1 };
  if (normalized.in.id !== "none" && safeTime < normalized.in.duration) {
    result = animationTransform(normalized.in.id, safeTime / normalized.in.duration);
  }
  if (normalized.out.id !== "none" && safeTime > safeDuration - normalized.out.duration) {
    const outProgress = (safeDuration - safeTime) / normalized.out.duration;
    const outgoing = animationTransform(normalized.out.id, outProgress);
    result = {
      x: result.x + outgoing.x,
      y: result.y + outgoing.y,
      scale: result.scale * outgoing.scale,
      opacity: result.opacity * outgoing.opacity,
    };
  }
  return result;
}

