import { REFERENCE_FRAME_EFFECTS, drawReferenceFrameEffect } from "./referenceTemplateEffects.js";
import { BEAT_EFFECT_IDS, FLASH_SHAPES, normalizeBeatSettings, resolveBeatAge, isCompositionEffect, drawBeatEffect } from "./beatEffects.js";
import { resolveEffectParameters } from "./effectKeyframes.js";
import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import { normalizeClickRippleEffect } from "./clickRippleEffect.js";
import { isFaceEffect } from "./faceEffectKinds.js";

export const TIMELINE_EFFECT_IDS = Object.freeze([
  "ripple",
  "glitch",
  "shake",
  "halo",
  "glow",
  "vignette",
  "grain",
  "chromatic",
  ...BEAT_EFFECT_IDS,
  ...REFERENCE_FRAME_EFFECTS,
  "cat-ears",
  "devil-horns",
  "cat-face",
]);
export const EFFECT_DRAG_TYPE = "application/x-timeline-effect";
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
export function normalizeEffectClips(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && TIMELINE_EFFECT_IDS.includes(item.effect))
    .map((item) => ({
      ...item,
      id: String(item.id || crypto.randomUUID()),
      start: Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - 0.1, finite(item.start, 0))),
      duration: Math.max(
        0.1,
        Math.min(
          MAX_TIMELINE_DURATION_SECONDS - Math.max(0, finite(item.start, 0)),
          finite(item.duration, 3),
        ),
      ),
      sourceOffset: Math.max(0, finite(item.sourceOffset, 0)),
      alignmentYaw: Math.max(-45, Math.min(45, finite(item.alignmentYaw, 0))),
      alignmentPitch: Math.max(-30, Math.min(30, finite(item.alignmentPitch, 0))),
      alignmentRoll: Math.max(-45, Math.min(45, finite(item.alignmentRoll, 0))),
      intensity: Math.max(0, Math.min(1, finite(item.intensity, 0.5))),
      color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : "#35ead9",
      ...(["beat-zoom", "beat-backdrop"].includes(item.effect) || (item.effect === "shake" && item.beat)
        ? { beat: normalizeBeatSettings(item.beat) } : {}),
      ...(item.effect === "shape-flash" ? { shape: FLASH_SHAPES.includes(item.shape) ? item.shape : "circle" } : {}),
      ripple: normalizeClickRippleEffect({ ...item.ripple, enabled: true }),
    }));
}
export function activeEffectClips(clips, time) {
  return clips.filter(
    (clip) => !clip.hidden && time >= clip.start && time < clip.start + clip.duration,
  );
}
const EFFECT_DURATIONS = { "shape-flash": 0.62, "seven-slat-reveal": 6.13, "beat-strip": 2.4, "memory-vortex": 2.7 };
export const getDefaultEffectDuration = (effect) => EFFECT_DURATIONS[effect] ?? 3;
export function createEffectClip(effect, start, duration = getDefaultEffectDuration(effect)) {
  return normalizeEffectClips([
    {
      effect,
      start,
      duration,
      id: crypto.randomUUID(),
      intensity: effect !== "cat-face" && isFaceEffect({ effect }) ? (0.86 - 0.7) / 0.6 : 0.5,
      ...(effect === "seven-slat-reveal" ? { color: "#f3fbff", intensity: 0.9 }
      : effect === "film-orbit" ? { color: "#f463ca", intensity: 0.88 }
      : effect === "beat-strip" ? { color: "#83e8af", intensity: 0.72 }
      : effect === "memory-vortex" ? { color: "#e892ac", intensity: 0.82 }
      : effect === "cat-ears"
        ? { color: "#d4b3e7" }
        : effect === "cat-face"
          ? { color: "#df8e9f" }
          : effect === "devil-horns"
            ? { color: "#a51538" }
            : ["shape-flash", "beat-backdrop"].includes(effect)
              ? { color: "#ffffff" }
              : {}),
    },
  ])[0];
}
const scratch = new WeakMap();
function copyFrame(canvas) {
  let copy = scratch.get(canvas);
  if (!copy) {
    copy = document.createElement("canvas");
    scratch.set(canvas, copy);
  }
  if (copy.width !== canvas.width) copy.width = canvas.width;
  if (copy.height !== canvas.height) copy.height = canvas.height;
  const ctx = copy.getContext("2d");
  ctx.clearRect(0, 0, copy.width, copy.height);
  ctx.drawImage(canvas, 0, 0);
  return copy;
}
// All animation uses clip-local timeline seconds, never wall time or Math.random().
export function drawTimelineEffects(ctx, canvas, clips, time, drawRipple, { composition = false, markers = [], scrubbing = false } = {}) {
  const w = canvas.width,
    h = canvas.height;
  for (const rawClip of activeEffectClips(clips, time)) {
    const clip = resolveEffectParameters(rawClip, time);
    const t = time - clip.start + (clip.sourceOffset || 0),
      amount = clip.intensity;
    if (isFaceEffect(clip) || isCompositionEffect(clip) !== composition) continue;
    ctx.save();
    if (BEAT_EFFECT_IDS.includes(clip.effect))
      drawBeatEffect(ctx, canvas, clip, time, markers, copyFrame, scrubbing);
    else if (REFERENCE_FRAME_EFFECTS.includes(clip.effect))
      drawReferenceFrameEffect(ctx, canvas, clip, time, copyFrame, scrubbing);
    else if (clip.effect === "ripple")
      drawRipple(ctx, canvas, { ...clip.ripple, enabled: true, color: clip.color }, t);
    else if (clip.effect === "vignette") {
      const gradient = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.15,
        w / 2,
        h / 2,
        Math.hypot(w, h) / 2,
      );
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(1, `rgba(0,0,0,${amount})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    } else if (clip.effect === "halo") {
      const x = w * (0.5 + 0.32 * Math.sin(t * 0.8)),
        y = h * (0.5 + 0.28 * Math.cos(t * 0.65));
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.55);
      g.addColorStop(0, clip.color);
      g.addColorStop(1, "transparent");
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = amount * 0.55;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (clip.effect === "grain") {
      // Fixed normalized grid keeps grain scale and seeded animation identical at every render size.
      const frame = Math.floor(t * 24);
      let seed = (frame + 1) * 16807;
      ctx.globalAlpha = amount * 0.22;
      for (let y = 0; y < 90; y++)
        for (let x = 0; x < 160; x++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          ctx.fillStyle = seed & 1 ? "#fff" : "#000";
          ctx.fillRect((x * w) / 160, (y * h) / 90, Math.ceil(w / 160), Math.ceil(h / 90));
        }
    } else {
      const source = copyFrame(canvas);
      if (clip.effect === "glow") {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = amount * 0.45;
        ctx.filter = `blur(${Math.max(1, w * 0.012)}px)`;
        ctx.drawImage(source, 0, 0);
      } else if (clip.effect === "shake") {
        const envelope = Math.exp(-resolveBeatAge(clip, time, markers) * 12) * amount;
        ctx.clearRect(0, 0, w, h);
        ctx.translate(
          w / 2 + Math.sin(t * 85) * w * 0.012 * envelope,
          h / 2 + Math.cos(t * 71) * h * 0.012 * envelope,
        );
        ctx.scale(1 + 0.035 * amount, 1 + 0.035 * amount);
        ctx.drawImage(source, -w / 2, -h / 2);
      } else if (clip.effect === "chromatic") {
        const offset = w * 0.008 * amount;
        let channel = scratch.get(source);
        if (!channel) {
          channel = document.createElement("canvas");
          scratch.set(source, channel);
        }
        if (channel.width !== w) channel.width = w;
        if (channel.height !== h) channel.height = h;
        const cc = channel.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "screen";
        ["#ff0000", "#00ff00", "#0000ff"].forEach((color, index) => {
          cc.globalCompositeOperation = "source-over";
          cc.drawImage(source, 0, 0);
          cc.globalCompositeOperation = "multiply";
          cc.fillStyle = color;
          cc.fillRect(0, 0, w, h);
          ctx.drawImage(channel, (index - 1) * offset, 0);
        });
      } else if (clip.effect === "glitch") {
        const frame = Math.floor(t * 24),
          pulse = frame % 19 < 4;
        if (pulse)
          for (let i = 0; i < 8; i++) {
            const y = (((frame * 37 + i * 71) % 100) / 100) * h,
              height = h * (0.008 + (i % 3) * 0.012);
            const dx = Math.sin(frame * 17 + i * 9) * w * 0.045 * amount;
            ctx.drawImage(source, 0, y, w, height, dx, y, w, height);
            ctx.globalAlpha = amount * 0.16;
            ctx.fillStyle = clip.color;
            ctx.fillRect(0, y, w, height);
            ctx.globalAlpha = 1;
          }
      }
    }
    ctx.restore();
  }
}

export function effectRangeFits(clips, candidate, lane) {
  return !clips.some(
    (item) =>
      item.id !== candidate.id &&
      item.lane === lane &&
      candidate.start < item.start + item.duration - 0.00001 &&
      candidate.start + candidate.duration > item.start + 0.00001,
  );
}
export function packEffectLanes(clips) {
  const lanes = [];
  const occupied = [];
  [...clips]
    .sort(
      (a, b) =>
        (Number.isInteger(a.lane) ? 0 : 1) - (Number.isInteger(b.lane) ? 0 : 1) ||
        a.start - b.start,
    )
    .forEach((clip) => {
      let lane = Number.isInteger(clip.lane) ? Math.max(0, Math.min(clips.length, clip.lane)) : 0;
      while (!effectRangeFits(occupied, clip, lane)) lane++;
      lanes[lane] ??= [];
      const placed = { ...clip, lane };
      lanes[lane].push(placed);
      occupied.push(placed);
    });
  const rows = lanes
    .filter((row) => row?.length)
    .map((row, lane) => row.map((item) => ({ ...item, lane })));
  return rows;
}
export function compactEffectLanes(clips) {
  const placements = new Map(
    packEffectLanes(clips)
      .flat()
      .map((item) => [item.id, item.lane]),
  );
  return clips.map((item) => ({ ...item, lane: placements.get(item.id) || 0 }));
}
export const EFFECT_ASSET_DRAG_EVENT = "timeline-effect-asset-drag";
