import { referenceEffectsCopy } from "../i18nReferenceTemplates.js";
import { REFERENCE_FRAME_EFFECTS } from "../lib/referenceTemplateEffects.js";
import { beatEffectCopy } from "../i18nBeatEffects.js";
import { BEAT_SOURCES, FLASH_SHAPES, normalizeBeatSettings } from "../lib/beatEffects.js";
import { FaceAlignmentArcs } from "./FaceAlignmentArcs.jsx";
import { faceAppearanceCopy } from "../i18nFaceAppearance.js";
import { ensureFaceAttachmentAssets } from "../lib/faceAttachmentAssets.js";
import {
  resolveEffectParameters,
  effectKeyTime,
  effectPropertyFrames,
  toggleEffectKeyframe,
  updateEffectParameter,
} from "../lib/effectKeyframes.js";
import { faceEffectCopy } from "../i18nFaceEffects.js";
import { isFaceEffect, getFaceAttachmentPoseAtTime } from "../lib/faceAttachments.js";
import { drawEffectCardPreview } from "../lib/effectCardPreview.js";
import { useEffect, useRef, useState } from "react";
import {
  Sparkle,
  CopySimple,
  Trash,
  CaretRight,
  CheckCircle,
  CaretUp,
  CaretDown,
  ArrowCounterClockwise,
  Diamond,
} from "@phosphor-icons/react";
import {
  TIMELINE_EFFECT_IDS,
  EFFECT_DRAG_TYPE,
  createEffectClip,
  getDefaultEffectDuration,
  normalizeEffectClips,
  effectRangeFits,
  compactEffectLanes,
  EFFECT_ASSET_DRAG_EVENT,
} from "../lib/timelineEffects.js";
import { effectCopy, SPECIAL_EFFECTS_LABELS } from "../i18nEffectClips.js";
import {
  findClosestTimelineSnap,
  snapTimelineRange,
  createTimelineSnapGuide,
} from "../lib/timelineSnap.js";
import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";
import {
  createTimelineEdgeAutoScroller,
  createTimelineVerticalEdgeAutoScroller,
  settleTimelineDrag,
} from "../lib/timelineEdgeAutoScroll.js";
import { ClickRippleInspector } from "./SubjectEffectsPanel.jsx";
import "./TimelineEffects.css";

const EFFECT_PREVIEW_IMAGES = Object.freeze({
  ripple: "/assets/effects/vfx/ripple.webp",
  glitch: "/assets/effects/vfx/glitch.webp",
  shake: "/assets/effects/vfx/shake.webp",
  halo: "/assets/effects/vfx/halo.webp",
  glow: "/assets/effects/vfx/glow.webp",
  vignette: "/assets/effects/vfx/vignette.webp",
  grain: "/assets/effects/vfx/grain.webp",
  chromatic: "/assets/effects/vfx/chromatic.webp",
  "beat-backdrop": "/assets/effects/vfx/halo.webp",
  "beat-zoom": "/assets/effects/vfx/shake.webp",
  "ink-print": "/assets/effects/vfx/grain.webp",
  "shape-flash": "/assets/effects/vfx/chromatic.webp",
  "seven-slat-reveal": "/assets/effects/vfx/halo.webp",
  "film-orbit": "/assets/effects/vfx/glitch.webp",
  "cat-ears": "/assets/effects/vfx/cat-ears-base.webp",
  "devil-horns": "/assets/effects/vfx/devil-horns-base.webp",
  "cat-face": "/assets/effects/vfx/cat-face-base.webp",
});

function TimelineEffectCard({ effect, label, onAdd, selected }) {
  const canvasRef = useRef(null),
    imageRef = useRef(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    const source = EFFECT_PREVIEW_IMAGES[effect];
    const image = imageRef.current?.getAttribute("src") === source ? imageRef.current : new Image();
    imageRef.current = image;
    const clip = createEffectClip(effect, 0, effect === "shape-flash" || REFERENCE_FRAME_EFFECTS.includes(effect) ? getDefaultEffectDuration(effect) : 60);
    if (!isFaceEffect(clip)) clip.intensity = 0.65;
    let canceled = false,
      frame = 0,
      lastPaint = -Infinity,
      ready = false;
    setPreviewReady(false);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const started = performance.now();
    const paint = (now = performance.now(), force = false) => {
      if (canceled) return;
      const box = canvas.getBoundingClientRect(),
        density = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(2, Math.round(box.width * density)),
        height = Math.max(2, Math.round(box.height * density));
      const resized = canvas.width !== width || canvas.height !== height;
      if (resized) {
        canvas.width = width;
        canvas.height = height;
      }
      if (image.complete && image.naturalWidth && (force || resized || now - lastPaint > 32)) {
        const painted = drawEffectCardPreview(canvas, image, clip, {
          live: previewing,
          time: reduced.matches ? 0 : (now - started) / 1000,
        });
        if (painted && !ready) {
          ready = true;
          setPreviewReady(true);
        }
        lastPaint = now;
      }
    };
    const draw = (now) => {
      paint(now);
      if (previewing && !reduced.matches && !canceled) frame = requestAnimationFrame(draw);
    };
    const refresh = () => paint(performance.now(), true);
    const observer = new ResizeObserver(refresh);
    observer.observe(canvas);
    const load = () => {
      refresh();
      if (previewing && !reduced.matches && !frame) frame = requestAnimationFrame(draw);
    };
    void ensureFaceAttachmentAssets([clip])
      .then(refresh)
      .catch(() => {});
    if (image.complete && image.naturalWidth) load();
    else {
      image.addEventListener("load", load);
      image.src = source;
    }
    return () => {
      canceled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      image.removeEventListener("load", load);
    };
  }, [effect, previewing]);
  return (
    <button
      type="button"
      draggable
      className={`subject-outline-entry timeline-effect-card ${previewing ? "is-previewing" : ""} ${selected ? "is-selected" : ""}`}
      onPointerEnter={() => setPreviewing(true)}
      onPointerLeave={() => setPreviewing(false)}
      onFocus={() => setPreviewing(true)}
      onBlur={() => setPreviewing(false)}
      onClick={() => onAdd(effect)}
      onDragEnd={() =>
        window.dispatchEvent(new CustomEvent(EFFECT_ASSET_DRAG_EVENT, { detail: null }))
      }
      onDragStart={(event) => {
        setPreviewing(false);
        event.dataTransfer.setData(EFFECT_DRAG_TYPE, effect);
        event.dataTransfer.effectAllowed = "copy";
        window.dispatchEvent(new CustomEvent(EFFECT_ASSET_DRAG_EVENT, { detail: effect }));
      }}
    >
      <span className="subject-outline-entry-preview">
        {isFaceEffect({ effect }) ? (
          <img
            className={`face-effect-cover ${previewing && previewReady ? "is-live-preview" : ""}`}
            src={`/assets/effects/vfx/${effect}-cover.webp`}
            alt=""
          />
        ) : null}
        <canvas ref={canvasRef} width={480} height={360} aria-hidden="true" />
      </span>
      <span className="subject-outline-entry-footer">
        <span className="subject-outline-entry-copy">
          <strong>{label}</strong>
        </span>
        <CaretRight size={17} />
      </span>
    </button>
  );
}
export function TimelineEffectCatalog({ language, onAdd, selectedEffect }) {
  const c = { ...effectCopy(language), ...faceEffectCopy(language), ...beatEffectCopy(language), ...referenceEffectsCopy(language) };
  const gridRef = useRef(null);
  const [category, setCategory] = useState(
    isFaceEffect({ effect: selectedEffect }) ? "person" : "frame",
  );
  useEffect(() => {
    if (selectedEffect) setCategory(isFaceEffect({ effect: selectedEffect }) ? "person" : "frame");
  }, [selectedEffect]);
  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
  }, [category]);
  return (
    <section
      className="timeline-effect-catalog mobile-panel-scroll-body"
      aria-label={SPECIAL_EFFECTS_LABELS[language] || SPECIAL_EFFECTS_LABELS.en}
    >
      <div className="tabs timeline-effect-categories" role="tablist" aria-label={c.title}>
        {["frame", "person"].map((id) => (
          <button
            type="button"
            role="tab"
            aria-selected={category === id}
            className={category === id ? "is-active" : ""}
            key={id}
            onClick={() => setCategory(id)}
          >
            {c[id]}
          </button>
        ))}
      </div>
      <div ref={gridRef} className="subject-effect-capability-grid timeline-effect-grid">
        {TIMELINE_EFFECT_IDS.filter(
          (id) => isFaceEffect({ effect: id }) === (category === "person"),
        ).map((id) => (
          <TimelineEffectCard
            key={id}
            effect={id}
            label={c[id]}
            onAdd={onAdd}
            selected={id === selectedEffect}
          />
        ))}
      </div>
    </section>
  );
}
function BeatTempoInput({ bpm, onChange }) {
  const [draft, setDraft] = useState(String(bpm));
  useEffect(() => setDraft(String(bpm)), [bpm]);
  return <input type="number" min="30" max="300" value={draft}
    onChange={(event) => setDraft(event.target.value)}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    onBlur={(event) => {
      const entered = event.currentTarget.valueAsNumber;
      const next = Number.isFinite(entered) ? Math.min(300, Math.max(30, Math.round(entered))) : bpm;
      setDraft(String(next));
      if (next !== bpm) onChange(next);
    }} />;
}

export function TimelineEffectInspector({
  clips,
  setClips,
  selectedId,
  language,
  t,
  locked,
  onClose,
  faceAttachments,
  hasVisual = true,
  currentTime = 0,
  visualSegments = [],
  onSeek,
  onAlignmentStart,
}) {
  const c = {
      ...effectCopy(language),
      ...faceEffectCopy(language),
      ...faceAppearanceCopy(language),
      ...beatEffectCopy(language), ...referenceEffectsCopy(language),
    },
    clip = clips.find((item) => item.id === selectedId);
  const panelRef = useRef(null);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);
  if (!clip)
    return (
      <aside
        ref={panelRef}
        className="voice-panel timeline-effect-inspector is-special-effect-inspector"
      >
        <div className="visual-context-empty">
          <Sparkle size={30} />
          <strong>{c.title}</strong>
          <span>{c.hint}</span>
        </div>
      </aside>
    );
  const patch = (change) => {
    if (!locked)
      setClips((items) =>
        normalizeEffectClips(
          items.map((item) => (item.id === clip.id ? { ...item, ...change } : item)),
        ),
      );
  };
  const resolved = resolveEffectParameters(clip, currentTime);
  const usesBeat = ["beat-backdrop", "beat-zoom", "shake"].includes(clip.effect);
  const beat = usesBeat ? normalizeBeatSettings(clip.beat || { bpm: 60 }) : null;
  const patchBeat = (change) => patch({ beat: { ...beat, ...change } });
  const keyTime = effectKeyTime(clip, currentTime);
  const pose = getFaceAttachmentPoseAtTime(
    faceAttachments?.previewClips?.find((item) => item.id === clip.id) || clip,
    visualSegments,
    currentTime,
  );
  const trackedYaw = ((pose?.yawRadians || 0) * 180) / Math.PI,
    trackedPitch = ((pose?.pitchRadians || 0) * 180) / Math.PI;
  const keyButton = (key, label) => {
    const keyed = effectPropertyFrames(clip, key).some(
      (frame) => Math.abs(frame.time - keyTime) < 0.025,
    );
    return (
      <button
        type="button"
        className={`effect-keyframe-button ${keyed ? "is-active" : ""}`}
        aria-label={`${t(keyed ? "visualRemovePropertyKeyframe" : "visualAddPropertyKeyframe")} · ${label}`}
        onClick={() =>
          patch({ parameterKeyframes: toggleEffectKeyframe(clip, key, keyTime, resolved[key]) })
        }
      >
        <Diamond size={14} weight={keyed ? "fill" : "regular"} />
      </button>
    );
  };
  const updateParameter = (key, value) => {
    if (!locked)
      setClips((items) =>
        normalizeEffectClips(
          items.map((item) =>
            item.id === clip.id
              ? { ...item, ...updateEffectParameter(item, key, keyTime, value) }
              : item,
          ),
        ),
      );
  };
  const frameTimes = [...new Set((clip.parameterKeyframes || []).map((frame) => frame.time))]
    .filter(
      (time) =>
        time >= (clip.sourceOffset || 0) && time <= (clip.sourceOffset || 0) + clip.duration,
    )
    .sort((a, b) => a - b);
  return (
    <aside
      ref={panelRef}
      className={`voice-panel timeline-effect-inspector is-special-effect-inspector ${isFaceEffect(clip) ? "is-face-effect-inspector" : ""}`}
    >
      {isFaceEffect(clip) ? (
        <div className="face-attachment-status" role="status">
          <CheckCircle size={18} />
          <span>
            {!hasVisual
              ? c.needMedia
              : c[
                  faceAttachments?.jobs[clip.id]?.state ||
                    (clip.faceAnalysis
                      ? clip.faceAnalysis.found
                        ? "ready"
                        : "noFace"
                      : "analyzing")
                ]}
          </span>
          {faceAttachments?.jobs[clip.id]?.state === "analyzing" ? (
            <>
              <progress max="100" value={faceAttachments.jobs[clip.id].progress} />
              <span>{faceAttachments.jobs[clip.id].progress}%</span>
              <button type="button" onClick={() => faceAttachments.cancel(clip.id)}>
                {c.cancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={locked || !hasVisual}
              onClick={() => faceAttachments?.retry(clip.id)}
            >
              {c.retry}
            </button>
          )}
        </div>
      ) : null}
      <fieldset disabled={locked}>
        <details className="effect-timing-details">
          <summary>{c.timing}</summary>
          <label>
            {c.start}
            <input
              type="number"
              min="0"
              max={MAX_TIMELINE_DURATION_SECONDS}
              step="0.1"
              value={Number(clip.start.toFixed(2))}
              onChange={(event) => patch({ start: Number(event.target.value) })}
            />
          </label>
          <label>
            {c.duration}
            <input
              type="number"
              min="0.1"
              max={MAX_TIMELINE_DURATION_SECONDS}
              step="0.1"
              value={Number(clip.duration.toFixed(2))}
              onChange={(event) => patch({ duration: Number(event.target.value) })}
            />
          </label>
        </details>
        {isFaceEffect(clip) ? (
          <details className="face-alignment-section" open>
            <summary>
              {c.alignment}
              <CaretUp size={14} />
            </summary>
            <FaceAlignmentArcs
              locked={locked}
              onStart={onAlignmentStart}
              yaw={{
                label: c.yaw,
                tracked: trackedYaw,
                value: resolved.alignmentYaw || 0,
                limit: 45,
                onChange: (value) => updateParameter("alignmentYaw", value),
                keyframe: keyButton("alignmentYaw", c.yaw),
              }}
              pitch={{
                label: c.pitch,
                tracked: trackedPitch,
                value: resolved.alignmentPitch || 0,
                limit: 30,
                onChange: (value) => updateParameter("alignmentPitch", value),
                keyframe: keyButton("alignmentPitch", c.pitch),
              }}
            />
          </details>
        ) : null}
        {usesBeat || clip.effect === "shape-flash" ? <div className="beat-effect-fields">
          {usesBeat ? <>
            <label>{c.beatSource}
              <select value={beat.source} onChange={(event) => patchBeat({ source: event.target.value })}>
                {BEAT_SOURCES.map((source) => <option key={source} value={source}>{c[source]}</option>)}
              </select>
            </label>
            {beat.source === "tempo" ? <>
              <label>BPM
                <BeatTempoInput key={clip.id} bpm={beat.bpm} onChange={(bpm) => patchBeat({ bpm })} />
              </label>
              <label>{c.beatDivision}
                <select value={beat.subdivision} onChange={(event) => patchBeat({ subdivision: Number(event.target.value) })}>
                  <option value="1">{c.quarter}</option><option value="2">{c.eighth}</option>
                </select>
              </label>
            </> : null}
          </> : <label>{c.shape}
            <select value={clip.shape} onChange={(event) => patch({ shape: event.target.value })}>
              {FLASH_SHAPES.map((shape) => <option key={shape} value={shape}>{c[shape]}</option>)}
            </select>
          </label>}
        </div> : null}
        {clip.effect !== "ripple" ? (
          <label className="effect-intensity-field">
            {isFaceEffect(clip) ? c.size : c.intensity}
            {keyButton("intensity", isFaceEffect(clip) ? c.size : c.intensity)}
            <output>
              {isFaceEffect(clip)
                ? (0.7 + resolved.intensity * 0.6).toFixed(2)
                : `${Math.round(resolved.intensity * 100)}%`}
            </output>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={resolved.intensity}
              style={{
                background: `linear-gradient(to right, #6be7df 0%, #6be7df ${resolved.intensity * 100}%, #303940 ${resolved.intensity * 100}%, #303940 100%)`,
              }}
              onChange={(event) => updateParameter("intensity", Number(event.target.value))}
            />
          </label>
        ) : null}
        {["glitch", "halo", "beat-backdrop", "shape-flash", ...REFERENCE_FRAME_EFFECTS].includes(clip.effect) || isFaceEffect(clip) ? (
          <label className="effect-color-field">
            {c.color}
            {keyButton("color", c.color)}
            <span className="face-color-picker">
              <input
                type="color"
                value={resolved.color}
                onChange={(event) => updateParameter("color", event.target.value)}
              />
              <CaretDown size={13} />
            </span>
          </label>
        ) : null}
        <section className="effect-keyframe-section">
          <span>{t("visualKeyframes")}</span>
          <button
            type="button"
            className="effect-keyframe-add"
            aria-label={t("visualAddAllKeyframes")}
            onClick={() => {
              let next = { ...clip };
              for (const key of isFaceEffect(clip)
                ? ["intensity", "color", "alignmentYaw", "alignmentPitch", "alignmentRoll"]
                : clip.effect === "ripple"
                  ? ["ripple", "color"]
                  : ["intensity", "color"]) {
                if (
                  !effectPropertyFrames(next, key).some(
                    (frame) => Math.abs(frame.time - keyTime) < 0.025,
                  )
                )
                  next.parameterKeyframes = toggleEffectKeyframe(next, key, keyTime, resolved[key]);
              }
              patch({ parameterKeyframes: next.parameterKeyframes });
            }}
          >
            <Diamond size={14} />
          </button>
          <div className="effect-keyframe-rail" aria-label={t("visualKeyframes")}>
            <input
              type="range"
              min="0"
              max={clip.duration}
              step="0.01"
              aria-label={t("visualKeyframes")}
              value={Math.max(0, Math.min(clip.duration, currentTime - clip.start))}
              onChange={(event) => onSeek?.(clip.start + Number(event.target.value))}
            />
            {frameTimes.map((time) => (
              <button
                type="button"
                key={time}
                aria-label={`${(time - (clip.sourceOffset || 0)).toFixed(2)}s · ${t("visualKeyframes")}`}
                onClick={() => onSeek?.(clip.start + time - (clip.sourceOffset || 0))}
                style={{ left: `${(100 * (time - (clip.sourceOffset || 0))) / clip.duration}%` }}
              >
                <Diamond size={13} weight="fill" />
              </button>
            ))}
          </div>
        </section>
        {clip.effect === "ripple" ? (
          <div>
            <ClickRippleInspector
              bare
              t={t}
              segment={{
                clickRipple: { ...resolved.ripple, enabled: true, color: resolved.color },
              }}
              onChange={(ripple) => {
                if (ripple.enabled === false) {
                  setClips((items) => items.filter((item) => item.id !== clip.id));
                  onClose();
                } else {
                  const change = updateEffectParameter(clip, "ripple", keyTime, ripple);
                  patch({
                    ...change,
                    ...updateEffectParameter(
                      { ...clip, ...change },
                      "color",
                      keyTime,
                      ripple.color || resolved.color,
                    ),
                  });
                }
              }}
            />
          </div>
        ) : null}
        <div className="timeline-effect-actions">
          {isFaceEffect(clip) ? (
            <button
              type="button"
              aria-label={c.reset}
              onClick={() =>
                patch({
                  alignmentYaw: 0,
                  alignmentPitch: 0,
                  alignmentRoll: 0,
                  parameterKeyframes: (clip.parameterKeyframes || [])
                    .map((frame) => ({
                      ...frame,
                      values: Object.fromEntries(
                        Object.entries(frame.values).filter(
                          ([key]) => !key.startsWith("alignment"),
                        ),
                      ),
                    }))
                    .filter((frame) => Object.keys(frame.values).length),
                })
              }
            >
              <ArrowCounterClockwise size={16} />
              {c.reset}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const next = {
                ...structuredClone(clip),
                id: crypto.randomUUID(),
                start: clip.start + clip.duration,
              };
              setClips((items) => [...items, next]);
            }}
          >
            <CopySimple size={16} />
            {t("duplicateClip")}
          </button>
          <button
            type="button"
            onClick={() => {
              setClips((items) => items.filter((item) => item.id !== clip.id));
              onClose();
            }}
          >
            <Trash size={16} />
            {t("delete")}
          </button>
        </div>
      </fieldset>
    </aside>
  );
}

export function TimelineEffectLane({
  clips,
  allClips,
  laneIndex,
  laneCount,
  assetEffect,
  sharedPreview,
  onDragPreview,
  setClips,
  duration,
  language,
  selectedId,
  onSelect,
  locked,
  hidden,
  snapPoints,
  setSnapGuide,
  setTimelineHorizon,
  pauseForEdit,
}) {
  const c = { ...effectCopy(language), ...faceEffectCopy(language), ...beatEffectCopy(language), ...referenceEffectsCopy(language) },
    ref = useRef(null),
    gesture = useRef(null);
  const preview = sharedPreview;
  const setPreview = onDragPreview;
  useEffect(() => () => gesture.current?.cancel?.(), []);
  const at = (event) =>
    Math.max(
      0,
      Math.min(
        duration - 0.1,
        ((event.clientX - ref.current.getBoundingClientRect().left) /
          ref.current.getBoundingClientRect().width) *
          duration,
      ),
    );
  const snap = (start, length, event, id) => {
    const points = [
      ...snapPoints,
      ...allClips
        .filter((item) => item.id !== id)
        .flatMap((item) => [
          { time: item.start, track: "effects", id: item.id },
          { time: item.start + item.duration, track: "effects", id: item.id },
        ]),
    ];
    if (event.altKey) {
      setSnapGuide(null);
      return { start, guide: null };
    }
    const result = snapTimelineRange(
      start,
      length,
      points,
      (8 / ref.current.getBoundingClientRect().width) * duration,
    );
    result.start = Math.max(0, result.start);
    setSnapGuide(result.guide);
    return result;
  };
  const begin = (event, clip, edge) => {
    if (locked || hidden || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(clip.id);
    const target = event.currentTarget,
      originY = event.clientY,
      origin = event.clientX,
      width = ref.current.getBoundingClientRect().width;
    const initial = { ...clip };
    let autoScroller, verticalScroller;
    let pointer = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey };
    const points = [
      ...snapPoints,
      ...allClips
        .filter((item) => item.id !== clip.id)
        .flatMap((item) => [
          { time: item.start, track: "effects", id: item.id },
          { time: item.start + item.duration, track: "effects", id: item.id },
        ]),
    ];
    let latest = initial,
      moved = false;
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - origin, e.clientY - originY) < 4) return;
      if (!moved) {
        pauseForEdit?.();
        autoScroller = createTimelineEdgeAutoScroller({
          trackElement: ref.current.closest(".track-scroll"),
          pointerType: event.pointerType,
          timelineDuration: duration,
          onScrollFrame: (clientX) => move({ ...pointer, clientX, fromScroll: true }),
        });
      }
      if (!moved && !edge)
        verticalScroller = createTimelineVerticalEdgeAutoScroller({
          scrollElement: ref.current.closest(".timeline-board"),
          pointerType: event.pointerType,
          onScrollFrame: (clientY) => move({ ...pointer, clientY, fromScroll: true }),
        });
      moved = true;
      pointer = { clientX: e.clientX, clientY: e.clientY, altKey: e.altKey };
      if (!e.fromScroll) {
        autoScroller?.update(e.clientX);
        verticalScroller?.update(e.clientY);
      }
      const dragX = autoScroller?.getDragClientX(e.clientX) ?? e.clientX;
      const delta = ((dragX - origin + (autoScroller?.getScrollOffset() || 0)) / width) * duration;
      if (!edge)
        latest = {
          ...initial,
          start: snap(Math.max(0, initial.start + delta), initial.duration, e, clip.id).start,
        };
      else {
        let boundary =
          edge === "start"
            ? Math.max(0, Math.min(initial.start + initial.duration - 0.1, initial.start + delta))
            : Math.max(initial.start + 0.1, initial.start + initial.duration + delta);
        const point = e.altKey
          ? null
          : findClosestTimelineSnap(boundary, points, (8 / width) * duration);
        if (point) boundary = point.time;
        boundary =
          edge === "start"
            ? Math.max(0, Math.min(initial.start + initial.duration - 0.1, boundary))
            : Math.max(initial.start + 0.1, boundary);
        setSnapGuide(point ? createTimelineSnapGuide(point, edge) : null);
        latest =
          edge === "start"
            ? { ...initial, start: boundary, duration: initial.start + initial.duration - boundary }
            : { ...initial, duration: boundary - initial.start };
      }
      let targetLane = laneIndex;
      if (!edge) {
        const targetRow = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest("[data-effect-lane-index]");
        if (targetRow) targetLane = Number(targetRow.dataset.effectLaneIndex);
        else {
          const rows = ref.current
            .closest(".track-scroll")
            .querySelectorAll("[data-effect-lane-index]");
          if (rows.length && e.clientY >= rows[rows.length - 1].getBoundingClientRect().top)
            targetLane = laneCount;
        }
      }
      latest = { ...normalizeEffectClips([latest])[0], lane: targetLane };
      latest.valid = effectRangeFits(allClips, latest, targetLane);
      setTimelineHorizon?.((previous) =>
        Math.max(previous, duration, latest.start + latest.duration + 0.5),
      );
      setPreview(latest);
    };
    const finish = (e) => {
      settleTimelineDrag(autoScroller, {
        active: moved,
        setTimelineHorizon,
        settle: () => {
          if (e.type !== "pointercancel" && latest.valid !== false)
            setClips((items) =>
              compactEffectLanes(
                normalizeEffectClips(
                  items.map((item) =>
                    item.id === clip.id
                      ? {
                          ...item,
                          start: latest.start,
                          duration: latest.duration,
                          lane: latest.lane,
                        }
                      : {
                          ...item,
                          lane: allClips.find((candidate) => candidate.id === item.id)?.lane ?? 0,
                        },
                  ),
                ),
              ),
            );
        },
      });
      cleanup();
    };
    const cleanup = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
      setPreview(null);
      setSnapGuide(null);
      autoScroller?.stop();
      verticalScroller?.stop();
      gesture.current = null;
    };
    gesture.current = { cancel: cleanup };
    target.setPointerCapture(event.pointerId);
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
  };
  const nudge = (event, clip, edge) => {
    if (locked || hidden || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : 0.1);
    let next = { ...clip };
    if (edge === "start") {
      next.start = Math.max(0, Math.min(clip.start + clip.duration - 0.1, clip.start + delta));
      next.duration = clip.start + clip.duration - next.start;
    } else if (edge === "end") next.duration = Math.max(0.1, clip.duration + delta);
    else next.start = Math.max(0, clip.start + delta);
    setClips((items) =>
      normalizeEffectClips(items.map((item) => (item.id === clip.id ? next : item))),
    );
  };
  return (
    <div
      ref={ref}
      data-effect-lane-index={laneIndex}
      inert={hidden ? true : undefined}
      className={`timeline-effect-lane ${locked ? "is-track-locked" : ""} ${hidden ? "is-track-disabled" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onDragOver={(event) => {
        if (locked || hidden || !event.dataTransfer.types.includes(EFFECT_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        const duration = getDefaultEffectDuration(assetEffect);
        const candidate = {
          start: snap(at(event), duration, event).start,
          duration,
          lane: laneIndex,
          effect: assetEffect,
        };
        setPreview({ ...candidate, valid: effectRangeFits(allClips, candidate, laneIndex) });
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !preview?.id) {
          setPreview(null);
          setSnapGuide(null);
        }
      }}
      onDrop={(event) => {
        const effect = event.dataTransfer.getData(EFFECT_DRAG_TYPE);
        if (locked || hidden || !TIMELINE_EFFECT_IDS.includes(effect) || preview?.valid === false)
          return;
        event.preventDefault();
        event.stopPropagation();
        const clip = { ...createEffectClip(effect, preview?.start ?? at(event)), lane: laneIndex };
        setClips((items) =>
          compactEffectLanes([
            ...allClips.filter((item) => items.some((current) => current.id === item.id)),
            clip,
          ]),
        );
        onSelect(clip.id);
        setPreview(null);
        setSnapGuide(null);
      }}
    >
      {!clips.length && !preview ? <span className="timeline-effect-empty">{c.empty}</span> : null}
      {clips.map((item) => {
        const clip = preview?.id === item.id && preview.lane === laneIndex ? preview : item;
        return (
          <button
            type="button"
            key={clip.id}
            className={`timeline-effect-clip ${preview?.id === clip.id && preview.valid === false ? "is-invalid" : ""} ${selectedId === clip.id && !locked ? "is-selected" : ""}`}
            style={{
              opacity: preview?.id === item.id && preview.lane !== laneIndex ? 0.25 : 1,
              left: `${(clip.start / duration) * 100}%`,
              width: `${(clip.duration / duration) * 100}%`,
            }}
            onKeyDown={(e) => nudge(e, clip)}
            onPointerDown={(e) => begin(e, clip)}
            onClick={() => onSelect(clip.id)}
          >
            <span
              role="slider"
              tabIndex={locked ? -1 : 0}
              aria-label={c.trimStart}
              aria-valuenow={clip.start}
              aria-valuemin={0}
              aria-valuemax={clip.start + clip.duration - 0.1}
              onKeyDown={(e) => nudge(e, clip, "start")}
              className="effect-trim is-start"
              onPointerDown={(e) => begin(e, clip, "start")}
            />
            <Sparkle size={13} />
            <span>{c[clip.effect]}</span>
            <span className="effect-keyframe-markers" aria-hidden="true">
              {[...new Set((clip.parameterKeyframes || []).map((frame) => frame.time))]
                .filter(
                  (time) =>
                    time >= (clip.sourceOffset || 0) &&
                    time <= (clip.sourceOffset || 0) + clip.duration,
                )
                .map((time) => (
                  <Diamond
                    key={time}
                    size={9}
                    weight="fill"
                    style={{
                      position: "absolute",
                      left: `${((time - (clip.sourceOffset || 0)) / clip.duration) * 100}%`,
                    }}
                  />
                ))}
            </span>
            <span
              role="slider"
              tabIndex={locked ? -1 : 0}
              aria-label={c.trimEnd}
              aria-valuenow={clip.start + clip.duration}
              aria-valuemin={clip.start + 0.1}
              aria-valuemax={MAX_TIMELINE_DURATION_SECONDS}
              onKeyDown={(e) => nudge(e, clip, "end")}
              className="effect-trim is-end"
              onPointerDown={(e) => begin(e, clip, "end")}
            />
          </button>
        );
      })}
      {preview &&
      preview.lane === laneIndex &&
      (!preview.id || !clips.some((item) => item.id === preview.id)) ? (
        <div
          className={`timeline-effect-drop ${preview.valid === false ? "is-invalid" : ""}`}
          style={{
            left: `${(preview.start / duration) * 100}%`,
            width: `${(preview.duration / duration) * 100}%`,
          }}
        >
          <Sparkle size={13} />
          <span>{c[preview.effect] || c.title}</span>
          <small>{preview.duration.toFixed(1)}s</small>
        </div>
      ) : null}
    </div>
  );
}
