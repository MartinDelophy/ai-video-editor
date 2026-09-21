import {
  Aperture,
  CaretRight,
  Check,
  CircleNotch,
  Cube,
  CursorClick,
  ImageSquare,
  MagicWand,
  Pause,
  PersonSimpleRun,
  Play,
  SlidersHorizontal,
  Stack,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_SUBJECT_EFFECT,
  normalizeSubjectEffect,
  updateSubjectEffect,
} from "../lib/subjectEffects.js";
import { formatTime } from "../lib/timeline.js";
import { normalizeClickRippleEffect, updateClickRippleEffect } from "../lib/clickRippleEffect.js";
import {
  getSubjectMaterial,
  SUBJECT_MATERIALS,
  SubjectMaterialFilterDefs,
} from "./SubjectMaterialFilter.jsx";

function EffectRange({ label, value, min, max, step = 1, suffix = "", lowLabel = "", highLabel = "", onChange }) {
  return (
    <label className="subject-effect-range">
      <span>{label}<output>{suffix === "%" ? `${Math.round(value * 100)}%` : `${value}${suffix}`}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {lowLabel || highLabel ? <small><span>{lowLabel}</span><span>{highLabel}</span></small> : null}
    </label>
  );
}

function AnalysisStatus({ t, analysis, running, progress, phase, compact = false, targetKind = "person" }) {
  const samples = Array.isArray(analysis?.samples) ? analysis.samples : [];
  const complete = analysis?.complete === true;
  const isObject = targetKind === "object";
  const percent = running ? Math.round(progress || 0) : complete ? 100 : samples.length ? Math.round(progress || 0) : 0;
  const performance = analysis?.performance;
  const performanceLabel = performance
    ? t("effectAnalysisPerformance")
      .replace("{ms}", String(Math.round(performance.millisecondsPerFrame || 0)))
      .replace("{factor}", Number(performance.realtimeFactor || 0).toFixed(1))
      .replace("{anchors}", String(Math.round((performance.anchorMs || 0) / 100) / 10))
      .replace("{flow}", String(Math.round((performance.flowMs || 0) / 100) / 10))
      .replace("{decode}", String(Math.round(((performance.decodeMs || 0) + (performance.pixelReadMs || 0)) / 100) / 10))
      .replace("{compose}", String(Math.round(((performance.cutoutEncodeMs || 0) + (performance.callbackMs || 0)) / 100) / 10))
      .replace("{fallbacks}", String(performance.slimSamFallbacks || 0))
    : "";
  return (
    <section className={`subject-analysis-status ${running ? "is-running" : ""} ${complete ? "is-complete" : ""} ${compact ? "is-compact" : ""}`}>
      <header>
        <span className="subject-analysis-icon">
          {running ? <CircleNotch size={18} className="spin" /> : complete ? <Check size={17} weight="bold" /> : isObject ? <Cube size={18} /> : <PersonSimpleRun size={18} />}
        </span>
        <div>
          <strong>{running
            ? t("effectAnalysisRunning")
            : complete
              ? isObject ? t("effectObjectAnalysisComplete") : t("effectAnalysisComplete")
              : samples.length
                ? t("effectAnalysisPartial")
                : isObject ? t("effectObjectAnalysisNeeded") : t("effectAnalysisNeeded")}</strong>
          <span>{running
            ? phase || t("effectAnalysisRunning")
            : complete
              ? isObject ? t("effectObjectAnalysisReusable") : t("effectAnalysisReusable")
              : phase || t("effectAnalysisHint")}</span>
        </div>
        <b>{percent}%</b>
      </header>
      {(running || samples.length) ? <>
        <div className="subject-analysis-progress" aria-label={t(isObject ? "effectObjectAnalysisProgress" : "effectAnalysisProgress")} aria-valuenow={percent} role="progressbar"><span style={{ width: `${percent}%` }} /></div>
        <footer>
          <span>{samples.length} {t("effectFramesProcessed")}</span>
          {analysis?.coverage?.end != null ? <time>{formatTime(analysis.coverage.end)} / {formatTime(analysis.duration || analysis.coverage.end)}</time> : null}
        </footer>
        {performanceLabel ? (
          <small
            className="subject-analysis-performance"
            data-magic-touch-anchors={performance.magicTouchAnchors || 0}
            data-slim-sam-fallbacks={performance.slimSamFallbacks || 0}
          >
            {performanceLabel}
          </small>
        ) : null}
      </> : null}
    </section>
  );
}

function MaterialCard({ t, material, active, onClick }) {
  return (
    <button className={`subject-material-card ${active ? "is-active" : ""}`} type="button" onClick={onClick}>
      <img src={material.image} alt="" />
      <span>
        <strong>{t(material.titleKey)}</strong>
        <small>{t(material.hintKey)}</small>
      </span>
      <i>{active ? <Check size={13} weight="bold" /> : <CaretRight size={14} />}</i>
    </button>
  );
}

const OUTLINE_PREVIEW_STILL = "/assets/effects/previews/person-outline-paper.webp";
const OUTLINE_PREVIEW_GIF = "/assets/effects/previews/person-outline-paper-hover.webp";
const OBJECT_OUTLINE_PREVIEW_STILL = "/assets/effects/previews/object-outline-still.webp";
const OBJECT_OUTLINE_PREVIEW_GIF = "/assets/effects/previews/object-outline-hover.webp";
const FACE_SWAP_PREVIEW_STILL = "/assets/sample-portrait.png";
const FACE_SWAP_PREVIEW_GIF = "/assets/effects/previews/face-swap-hover.gif";
const CINEMATIC_DEPTH_PREVIEW_STILL = "/assets/effects/previews/cinematic-depth-still.png";
const CINEMATIC_DEPTH_PREVIEW_HOVER = "/assets/effects/previews/cinematic-depth-hover.png";
const PHOTO_PARALLAX_PREVIEW_STILL = "/assets/effects/previews/photo-parallax-still.png";
const PHOTO_PARALLAX_PREVIEW_HOVER = "/assets/effects/previews/photo-parallax-hover.png";

function ClickRippleEffectCard({ t, active, onClick }) {
  const [previewing, setPreviewing] = useState(false);
  return (
    <button
      className={`subject-outline-entry click-ripple-effect-entry ${active ? "is-active" : ""} ${previewing ? "is-previewing" : ""}`}
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") setPreviewing(true); }}
      onPointerLeave={() => setPreviewing(false)}
      onFocus={() => setPreviewing(true)}
      onBlur={() => setPreviewing(false)}
    >
      <span className="subject-outline-entry-preview click-ripple-card-preview">
        <img src="/assets/sample-portrait.png" alt="" />
        <span className="click-ripple-card-gray" />
        <span className="click-ripple-card-hit"><i /><b /></span>
        <span className="subject-outline-entry-preview-state"><CursorClick size={13} weight="fill" />{previewing ? t("effectPreviewPlaying") : t("clickRippleKicker")}</span>
      </span>
      <span className="subject-outline-entry-footer">
        <span className="subject-outline-entry-copy"><strong>{t("clickRippleTitle")}</strong><small>{t("clickRippleHint")}</small></span>
        <span className="subject-outline-entry-state">{active ? <Check size={16} weight="bold" /> : <CaretRight size={17} />}</span>
      </span>
    </button>
  );
}

function ClickRippleControls({ t, effect, onChange, showRemove = false }) {
  const patch = (next) => onChange?.(updateClickRippleEffect(effect, next));
  return (
    <section className="click-ripple-controls">
      <header>
        <div><CursorClick size={18} weight="duotone" /><span><strong>{t("clickRippleTitle")}</strong><small>{t("clickRippleControlsHint")}</small></span></div>
        <label className="mini-switch"><input type="checkbox" checked={effect.enabled} onChange={(event) => patch({ enabled: event.target.checked })} /><i /></label>
      </header>
      <label className="click-ripple-meter-row"><span>{t("clickRippleMeter")}</span><select value={effect.meter} onChange={(event) => patch({ meter: event.target.value })}>{["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8"].map((meter) => <option value={meter} key={meter}>{meter}</option>)}</select></label>
      <EffectRange label={t("clickRippleTempo")} value={effect.bpm} min={30} max={180} step={1} suffix=" BPM" onChange={(bpm) => patch({ bpm })} />
      <EffectRange label={t("clickRippleRadius")} value={effect.radius / 100} min={0.02} max={0.18} step={0.01} suffix="%" onChange={(radius) => patch({ radius: radius * 100 })} />
      <EffectRange label={t("clickRippleSpreadDuration")} value={effect.rippleDuration} min={Math.min(0.3, effect.interval * 0.92)} max={Math.min(1.4, effect.interval * 0.92)} step={0.01} suffix="s" onChange={(rippleDuration) => patch({ rippleDuration })} />
      <EffectRange label={t("clickRippleGlow")} value={effect.glow} min={0} max={1} step={0.01} suffix="%" onChange={(glow) => patch({ glow })} />
      <label className="click-ripple-color-row"><span>{t("clickRippleColor")}</span><input type="color" value={effect.color} onChange={(event) => patch({ color: event.target.value })} /></label>
      {showRemove ? <button className="subject-remove-effect" type="button" onClick={() => patch({ enabled: false })}><Trash size={16} />{t("effectRemove")}</button> : null}
    </section>
  );
}

export function ClickRippleInspector({ t, segment, onChange }) {
  if (!segment) return <div className="visual-context-empty"><ImageSquare size={30} weight="duotone" /><strong>{t("effectSelectClip")}</strong><span>{t("effectSelectClipHint")}</span></div>;
  return <div className="subject-effects-inspector"><ClickRippleControls t={t} effect={normalizeClickRippleEffect(segment.clickRipple)} onChange={onChange} showRemove /></div>;
}

function ObjectOutlineCard({ t, active, running, progress, analysis, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [hoverless, setHoverless] = useState(false);
  const previewing = hovered || hoverless;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(hover: none)");
    const update = () => setHoverless(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return (
    <button
      className={`subject-outline-entry subject-object-outline-entry ${active ? "is-active" : ""} ${previewing ? "is-previewing" : ""}`}
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span className="subject-outline-entry-preview">
        <img
          key={previewing ? "animated" : "still"}
          src={previewing ? OBJECT_OUTLINE_PREVIEW_GIF : OBJECT_OUTLINE_PREVIEW_STILL}
          alt=""
        />
        <span className="subject-outline-entry-preview-state">
          <Cube size={13} weight="fill" />
          {previewing ? t("effectPreviewPlaying") : t("effectPreviewHover")}
        </span>
        {running ? <span className="subject-outline-entry-progress"><i style={{ width: `${Math.round(progress || 0)}%` }} /></span> : null}
      </span>
      <span className="subject-outline-entry-footer">
        <span className="subject-outline-entry-copy">
          <strong>{t("effectObjectOutline")}</strong>
          <small>{t("effectObjectOutlineHint")}</small>
        </span>
        <span className="subject-outline-entry-state">
          {running ? `${Math.round(progress || 0)}%` : analysis?.complete ? <Check size={16} weight="bold" /> : <CaretRight size={17} />}
        </span>
      </span>
    </button>
  );
}

function OutlinePreviewCard({ t, active, running, progress, analysis, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [hoverless, setHoverless] = useState(false);
  const previewing = hovered || hoverless;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(hover: none)");
    const update = () => setHoverless(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return (
    <button
      className={`subject-outline-entry ${active ? "is-active" : ""} ${previewing ? "is-previewing" : ""}`}
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span className="subject-outline-entry-preview">
        <img
          key={previewing ? "animated" : "still"}
          src={previewing ? OUTLINE_PREVIEW_GIF : OUTLINE_PREVIEW_STILL}
          alt=""
        />
        <span className="subject-outline-entry-preview-state">
          <i />
          {previewing ? t("effectPreviewPlaying") : t("effectPreviewHover")}
        </span>
        {running ? <span className="subject-outline-entry-progress"><i style={{ width: `${Math.round(progress || 0)}%` }} /></span> : null}
      </span>
      <span className="subject-outline-entry-footer">
        <span className="subject-outline-entry-copy">
          <strong>{t("effectOutline")}</strong>
          <small>{t("effectOutlineCardHint")}</small>
        </span>
        <span className="subject-outline-entry-state">
          {running ? `${Math.round(progress || 0)}%` : analysis?.complete ? <Check size={16} weight="bold" /> : <CaretRight size={17} />}
        </span>
      </span>
    </button>
  );
}

function OpticalFlowEffectCard({ t, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [hoverless, setHoverless] = useState(false);
  const previewing = hovered || hoverless;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(hover: none)");
    const update = () => setHoverless(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return (
    <button
      className={`subject-outline-entry subject-optical-flow-entry ${active ? "is-active" : ""} ${previewing ? "is-previewing" : ""}`}
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span className="subject-outline-entry-preview">
        <img
          key={previewing ? "animated" : "still"}
          src={previewing
            ? "/assets/effects/previews/vector-tracking-hover.webp"
            : "/assets/effects/previews/vector-tracking-coming-soon.webp"}
          alt=""
        />
        <em className="subject-optical-flow-badge">{t("effectFlowExperimental")}</em>
        <span className="subject-outline-entry-preview-state">
          <i />
          {previewing ? t("effectPreviewPlaying") : t("effectFlowVectorLab")}
        </span>
      </span>
      <span className="subject-outline-entry-footer">
        <span className="subject-outline-entry-copy">
          <strong>{t("effectVectorTracking")}</strong>
          <small>{t("effectVectorTrackingHint")}</small>
        </span>
        <span className="subject-outline-entry-state"><CaretRight size={17} /></span>
      </span>
    </button>
  );
}

function FaceSwapEffectCard({ t, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [hoverless, setHoverless] = useState(false);
  const previewing = hovered || hoverless;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(hover: none)");
    const update = () => setHoverless(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return (
    <button
      className={`subject-outline-entry subject-face-swap-entry ${active ? "is-active" : ""} ${previewing ? "is-previewing" : ""}`}
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span className="subject-outline-entry-preview">
        <img
          key={previewing ? "animated" : "still"}
          src={previewing ? FACE_SWAP_PREVIEW_GIF : FACE_SWAP_PREVIEW_STILL}
          alt=""
        />
        <span className="subject-outline-entry-preview-state">
          <PersonSimpleRun size={13} weight="fill" />
          {previewing ? t("effectPreviewPlaying") : "MobileFaceSwap"}
        </span>
      </span>
      <span className="subject-outline-entry-footer">
        <span className="subject-outline-entry-copy">
          <strong>{t("faceSwapTitle")}</strong>
          <small>{t("faceSwapDescription")}</small>
        </span>
        <span className="subject-outline-entry-state"><CaretRight size={17} /></span>
      </span>
    </button>
  );
}

function CinematicDepthEffectCard({ t, active, analysis, running, progress, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [hoverless, setHoverless] = useState(false);
  const previewing = hovered || hoverless;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(hover: none)");
    const update = () => setHoverless(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return (
    <button
      className={`subject-outline-entry subject-cinematic-depth-entry ${active ? "is-active" : ""} ${previewing ? "is-previewing" : ""}`}
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span className="subject-outline-entry-preview">
        <img
          key={previewing ? "depth" : "source"}
          src={previewing ? CINEMATIC_DEPTH_PREVIEW_HOVER : CINEMATIC_DEPTH_PREVIEW_STILL}
          alt=""
        />
        <span className="subject-outline-entry-preview-state">
          <Aperture size={13} weight="fill" />
          {previewing ? t("depthPreviewApplied") : t("effectPreviewHover")}
        </span>
        {running ? <span className="subject-outline-entry-progress"><i style={{ width: `${Math.round(progress || 0)}%` }} /></span> : null}
      </span>
      <span className="subject-outline-entry-footer">
        <span className="subject-outline-entry-copy">
          <strong>{t("depthTitle")}</strong>
          <small>{t("depthDescription")}</small>
        </span>
        <span className="subject-outline-entry-state">
          {running ? `${Math.round(progress || 0)}%` : analysis?.complete ? <Check size={16} weight="bold" /> : <CaretRight size={17} />}
        </span>
      </span>
    </button>
  );
}

function PhotoParallaxEffectCard({ t, active, analysis, running, progress, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [hoverless, setHoverless] = useState(false);
  const previewing = hovered || hoverless;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(hover: none)");
    const update = () => setHoverless(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return (
    <button
      className={`subject-outline-entry subject-photo-parallax-entry ${active ? "is-active" : ""} ${previewing ? "is-previewing" : ""}`}
      type="button"
      onClick={onClick}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span className="subject-outline-entry-preview">
        <img key={previewing ? "layers" : "source"} src={previewing ? PHOTO_PARALLAX_PREVIEW_HOVER : PHOTO_PARALLAX_PREVIEW_STILL} alt="" />
        <span className="subject-outline-entry-preview-state">
          <Stack size={13} weight="fill" />
          {previewing ? t("parallaxPreviewApplied") : t("effectPreviewHover")}
        </span>
        {running ? <span className="subject-outline-entry-progress"><i style={{ width: `${Math.round(progress || 0)}%` }} /></span> : null}
      </span>
      <span className="subject-outline-entry-footer">
        <span className="subject-outline-entry-copy">
          <strong>{t("parallaxTitle")}</strong>
          <small>{t("parallaxDescription")}</small>
        </span>
        <span className="subject-outline-entry-state">
          {running ? `${Math.round(progress || 0)}%` : analysis?.complete ? <Check size={16} weight="bold" /> : <CaretRight size={17} />}
        </span>
      </span>
    </button>
  );
}

function MaterialEditorDialog({ t, segment, analysis, effect, materialId, onCancel, onApply }) {
  const material = getSubjectMaterial(materialId);
  const initialDraft = useMemo(() => updateSubjectEffect(effect, {
    enabled: true,
    ...material.patch,
    outline: { ...material.patch.outline, enabled: true },
    material: { ...material.patch.material, id: material.id },
  }), [effect, material]);
  const [draft, setDraft] = useState(initialDraft);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const backgroundVideoRef = useRef(null);
  const playbackOriginRef = useRef({ index: 0, time: 0 });
  const samples = useMemo(
    () => (Array.isArray(analysis?.samples) ? analysis.samples.filter((sample) => sample?.cutoutUrl) : []),
    [analysis],
  );
  const sample = samples[Math.min(sampleIndex, Math.max(0, samples.length - 1))];
  const updateDraft = (patch) => setDraft((current) => updateSubjectEffect(current, patch));
  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    const lastIndex = Math.max(0, samples.length - 1);
    const nextIndex = sampleIndex >= lastIndex ? 0 : sampleIndex;
    playbackOriginRef.current = {
      index: nextIndex,
      time: Math.max(0, Number(samples[nextIndex]?.time) || 0),
    };
    setSampleIndex(nextIndex);
    setPlaying(true);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (!playing || samples.length < 2) return undefined;
    const origin = playbackOriginRef.current;
    const lastIndex = samples.length - 1;
    const lastTime = Math.max(origin.time, Number(samples[lastIndex]?.time) || lastIndex / 8);
    const startedAt = performance.now();
    let frameId = 0;
    let renderedIndex = origin.index;
    const tick = (now) => {
      const previewTime = origin.time + (now - startedAt) / 1000;
      let nextIndex = renderedIndex;
      while (
        nextIndex < lastIndex
        && (Number(samples[nextIndex + 1]?.time) || (nextIndex + 1) / 8) <= previewTime
      ) nextIndex += 1;
      if (nextIndex !== renderedIndex) {
        renderedIndex = nextIndex;
        setSampleIndex(nextIndex);
      }
      if (previewTime >= lastTime || nextIndex >= lastIndex) {
        setSampleIndex(lastIndex);
        setPlaying(false);
        return;
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [playing, samples]);

  useEffect(() => {
    const video = backgroundVideoRef.current;
    if (!video || playing || draft.background.visible === false || !Number.isFinite(sample?.time)) return;
    const nextTime = Math.max(0, Number(sample.time) || 0);
    if (Math.abs(video.currentTime - nextTime) > 0.035) video.currentTime = nextTime;
  }, [draft.background.visible, playing, sample?.time]);

  useEffect(() => {
    const video = backgroundVideoRef.current;
    if (!video || draft.background.visible === false) return undefined;
    if (!playing) {
      video.pause();
      return undefined;
    }
    const startTime = Math.max(0, Number(samples[playbackOriginRef.current.index]?.time) || 0);
    if (Math.abs(video.currentTime - startTime) > 0.035) video.currentTime = startTime;
    video.play().catch(() => {});
    return () => video.pause();
  }, [draft.background.visible, playing, samples]);

  useEffect(() => {
    if (typeof Image === "undefined") return undefined;
    const preloaded = samples.map((item) => {
      const image = new Image();
      image.src = item.cutoutUrl;
      image.decode?.().catch(() => {});
      return image;
    });
    return () => preloaded.forEach((image) => { image.src = ""; });
  }, [samples]);

  if (typeof document === "undefined") return null;
  const dialog = (
    <div className="subject-material-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="subject-material-dialog" role="dialog" aria-modal="true" aria-label={t("effectMaterialEditorTitle")}>
        <header>
          <div>
            <span>{t("effectOutline")}</span>
            <h2>{t("effectMaterialEditorTitle")}</h2>
          </div>
          <button type="button" aria-label={t("close")} onClick={onCancel}><X size={18} /></button>
        </header>
        <div className="subject-material-dialog-body">
          <section className="subject-material-live-preview">
            <div className="subject-material-preview-toolbar">
              <span><i />{t("effectLivePreview")}</span>
              <em>{samples.length ? `${sampleIndex + 1} / ${samples.length}` : t("effectAnalysisNeeded")}</em>
            </div>
            <div className={`subject-material-preview-frame is-${material.id}`}>
              <SubjectMaterialFilterDefs effect={draft} filterId="subject-material-dialog-filter" />
              {draft.background.visible !== false && segment?.src ? (
                segment.type === "video" ? <video
                  ref={backgroundVideoRef}
                  className="subject-material-preview-source"
                  src={segment.src}
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(event) => {
                    event.currentTarget.currentTime = Math.max(0, Number(sample?.time) || 0);
                  }}
                /> : <img className="subject-material-preview-source" src={segment.src} alt="" />
              ) : null}
              {sample?.cutoutUrl ? <img
                className="subject-material-preview-cutout"
                src={sample.cutoutUrl}
                alt={t("effectLivePreview")}
                style={{ filter: "url(#subject-material-dialog-filter)" }}
              /> : <div className="subject-material-preview-empty">
                <PersonSimpleRun size={42} weight="duotone" />
                <strong>{t("effectAnalysisNeeded")}</strong>
                <span>{t("effectAnalysisHint")}</span>
              </div>}
            </div>
            <div className="subject-material-frame-control">
              <button type="button" disabled={samples.length < 2} onClick={togglePlayback}>
                {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
              </button>
              <input
                type="range"
                min="0"
                max={Math.max(0, samples.length - 1)}
                step="1"
                value={Math.min(sampleIndex, Math.max(0, samples.length - 1))}
                disabled={samples.length < 2}
                onChange={(event) => {
                  setPlaying(false);
                  setSampleIndex(Number(event.target.value));
                }}
              />
              <time>{formatTime(sample?.time || 0)}</time>
            </div>
          </section>
          <aside className="subject-material-controls">
            <div className="subject-material-control-heading">
              <span><SlidersHorizontal size={17} /></span>
              <div><strong>{t(material.titleKey)}</strong><small>{t(material.hintKey)}</small></div>
            </div>
            <section>
              <h3>{t("effectMaterialBasic")}</h3>
              <label className="subject-background-toggle">
                <span>
                  <strong>{t("effectShowVideoBackground")}</strong>
                  <small>{t("effectShowVideoBackgroundHint")}</small>
                </span>
                <span className="mini-switch">
                  <input
                    type="checkbox"
                    checked={draft.background.visible !== false}
                    onChange={(event) => updateDraft({ background: { visible: event.target.checked } })}
                  />
                  <i />
                </span>
              </label>
              <div className="subject-color-field"><label>{t("effectOutlineColor")}</label><input type="color" value={draft.outline.color} onChange={(event) => updateDraft({ outline: { color: event.target.value } })} /><code>{draft.outline.color.toUpperCase()}</code></div>
              <EffectRange label={t("effectOutlineWidth")} value={draft.outline.width} min={1} max={32} suffix="px" onChange={(width) => updateDraft({ outline: { width } })} />
              <EffectRange label={t("effectOutlineOpacity")} value={draft.outline.opacity} min={0} max={1} step={0.01} suffix="%" onChange={(opacity) => updateDraft({ outline: { opacity } })} />
              <EffectRange label={t("effectOutlineShadow")} value={draft.material.shadowDepth} min={0} max={1} step={0.01} suffix="%" onChange={(shadowDepth) => updateDraft({ material: { shadowDepth } })} />
              <EffectRange
                label={t("effectEdgeDensity")}
                value={draft.material.edgeDensity}
                min={0}
                max={1}
                step={0.01}
                suffix="%"
                lowLabel={t("effectEdgeDensityLoose")}
                highLabel={t("effectEdgeDensityDense")}
                onChange={(edgeDensity) => updateDraft({ material: { edgeDensity } })}
              />
              <EffectRange label={t("effectTextureStrength")} value={draft.material.textureStrength} min={0} max={1} step={0.01} suffix="%" onChange={(textureStrength) => updateDraft({ material: { textureStrength } })} />
            </section>
            <section>
              <h3>{t("effectMaterialDetail")}</h3>
              {material.id === "paper" ? <>
                <EffectRange label={t("effectTextureScale")} value={draft.material.textureScale} min={0.35} max={3} step={0.05} suffix="×" onChange={(textureScale) => updateDraft({ material: { textureScale } })} />
                <EffectRange label={t("effectIrregularity")} value={draft.material.irregularity} min={0} max={1} step={0.01} suffix="%" onChange={(irregularity) => updateDraft({ material: { irregularity } })} />
              </> : null}
              {material.id === "frosted" ? <>
                <EffectRange label={t("effectGrain")} value={draft.material.grain} min={0} max={1} step={0.01} suffix="%" onChange={(grain) => updateDraft({ material: { grain } })} />
                <EffectRange label={t("effectDiffusion")} value={draft.material.diffusion} min={0} max={1} step={0.01} suffix="%" onChange={(diffusion) => updateDraft({ material: { diffusion } })} />
                <EffectRange label={t("effectEdgeFeather")} value={draft.outline.softness} min={0} max={12} step={0.1} suffix="px" onChange={(softness) => updateDraft({ outline: { softness } })} />
              </> : null}
              {material.id === "halo" ? <>
                <EffectRange label={t("effectRingCount")} value={draft.material.rings} min={1} max={3} step={1} onChange={(rings) => updateDraft({ material: { rings } })} />
                <EffectRange label={t("effectRingGap")} value={draft.material.ringGap} min={2} max={24} suffix="px" onChange={(ringGap) => updateDraft({ material: { ringGap } })} />
                <EffectRange label={t("effectGlow")} value={draft.outline.glow} min={0} max={1} step={0.01} suffix="%" onChange={(glow) => updateDraft({ outline: { glow } })} />
                <EffectRange label={t("effectGlowRadius")} value={draft.outline.glowRadius} min={0} max={60} suffix="px" onChange={(glowRadius) => updateDraft({ outline: { glowRadius } })} />
              </> : null}
              {material.id === "chrome" ? <>
                <EffectRange label={t("effectTextureScale")} value={draft.material.textureScale} min={0.35} max={3} step={0.05} suffix="×" onChange={(textureScale) => updateDraft({ material: { textureScale } })} />
                <EffectRange label={t("effectMaterialContrast")} value={draft.material.contrast} min={0} max={1} step={0.01} suffix="%" onChange={(contrast) => updateDraft({ material: { contrast } })} />
                <EffectRange label={t("effectEdgeFeather")} value={draft.outline.softness} min={0} max={8} step={0.1} suffix="px" onChange={(softness) => updateDraft({ outline: { softness } })} />
              </> : null}
              {material.id === "impasto" ? <>
                <EffectRange label={t("effectTextureScale")} value={draft.material.textureScale} min={0.35} max={3} step={0.05} suffix="×" onChange={(textureScale) => updateDraft({ material: { textureScale } })} />
                <EffectRange label={t("effectRelief")} value={draft.material.relief} min={0} max={1} step={0.01} suffix="%" onChange={(relief) => updateDraft({ material: { relief } })} />
                <EffectRange label={t("effectIrregularity")} value={draft.material.irregularity} min={0} max={1} step={0.01} suffix="%" onChange={(irregularity) => updateDraft({ material: { irregularity } })} />
              </> : null}
              {material.id === "ink" ? <>
                <EffectRange label={t("effectTextureScale")} value={draft.material.textureScale} min={0.35} max={3} step={0.05} suffix="×" onChange={(textureScale) => updateDraft({ material: { textureScale } })} />
                <EffectRange label={t("effectBleed")} value={draft.material.bleed} min={0} max={1} step={0.01} suffix="%" onChange={(bleed) => updateDraft({ material: { bleed } })} />
                <EffectRange label={t("effectIrregularity")} value={draft.material.irregularity} min={0} max={1} step={0.01} suffix="%" onChange={(irregularity) => updateDraft({ material: { irregularity } })} />
                <EffectRange label={t("effectDiffusion")} value={draft.material.diffusion} min={0} max={1} step={0.01} suffix="%" onChange={(diffusion) => updateDraft({ material: { diffusion } })} />
              </> : null}
            </section>
          </aside>
        </div>
        <footer>
          <span>{t("effectDraftHint")}</span>
          <button className="panel-secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
          <button className="subject-material-apply" type="button" onClick={() => onApply(draft)}>{t("effectApply")}</button>
        </footer>
      </section>
    </div>
  );
  return createPortal(dialog, document.body);
}

export function SubjectEffectsWorkspace({
  onlyClickRipple = false,
  t,
  segment,
  analysis,
  running,
  progress,
  phase,
  onChange,
  onOpenInspector,
  onOpenFaceSwap,
  onOpenOpticalFlow,
  onOpenCinematicDepth,
  onOpenPhotoParallax,
  onOpenClickRipple,
  onChangeClickRipple,
  faceSwapActive = false,
  opticalFlowActive = false,
  cinematicDepthActive = false,
  cinematicDepthAnalysis = null,
  cinematicDepthRunning = false,
  cinematicDepthProgress = 0,
  photoParallaxActive = false,
  photoParallaxAnalysis = null,
  photoParallaxRunning = false,
  photoParallaxProgress = 0,
  onRemove,
}) {
  const effect = normalizeSubjectEffect(segment?.subjectEffect);
  const clickRipple = normalizeClickRippleEffect(segment?.clickRipple);
  const hasVideo = segment?.type === "video";
  const analysisTargetKind = analysis?.targetKind
    || (String(analysis?.pipeline || "").startsWith("object-") ? "object" : "person");
  const personAnalysis = analysisTargetKind === "person" ? analysis : null;
  const objectAnalysis = analysisTargetKind === "object" ? analysis : null;
  const selectOutline = () => {
    onChange?.(updateSubjectEffect(effect, {
      enabled: true,
      presetId: "",
      targetKind: "person",
      outline: { enabled: true, color: "#f3efe4", width: 14 },
      material: { id: "paper" },
    }));
    onOpenInspector?.();
  };
  const selectObjectOutline = () => {
    onChange?.(updateSubjectEffect(effect, {
      enabled: true,
      presetId: "",
      targetKind: "object",
      outline: { enabled: true, color: "#f3efe4", width: 14 },
      material: { id: "paper" },
    }));
    onOpenInspector?.();
  };
  if (!segment) {
    return (
      <div className="tool-panel subject-effects-workspace mobile-panel-scroll-body">
        <header className="subject-effects-heading"><div><MagicWand size={22} /><span><strong>{t("effects")}</strong><small>{t(onlyClickRipple ? "clickRippleTitle" : "effectWorkspaceHint")}</small></span></div></header>
        <div className="subject-effects-empty"><ImageSquare size={34} weight="duotone" /><strong>{t("effectSelectClip")}</strong><span>{t("effectSelectClipHint")}</span></div>
      </div>
    );
  }
  return (
    <div className="tool-panel subject-effects-workspace mobile-panel-scroll-body">
      <header className="subject-effects-heading">
        <div><MagicWand size={22} /><span><strong>{t("effects")}</strong><small>{segment.name || (hasVideo ? t("effectVideoClip") : t("effectImageClip"))}</small></span></div>
        {(effect.enabled && analysis?.complete) || clickRipple.enabled ? <em>{t("effectApplied")}</em> : null}
      </header>

      <div className="subject-effect-capability-grid">
        {!onlyClickRipple ? <>
        <OutlinePreviewCard
          t={t}
          active={effect.enabled && effect.outline.enabled && effect.targetKind === "person"}
          running={running && effect.targetKind === "person"}
          progress={progress}
          analysis={personAnalysis}
          onClick={selectOutline}
        />
        <ObjectOutlineCard
          t={t}
          active={effect.enabled && effect.outline.enabled && effect.targetKind === "object"}
          running={running && effect.targetKind === "object"}
          progress={progress}
          analysis={objectAnalysis}
          onClick={selectObjectOutline}
        />
        <FaceSwapEffectCard t={t} active={faceSwapActive} onClick={onOpenFaceSwap} />
        <OpticalFlowEffectCard t={t} active={opticalFlowActive} onClick={onOpenOpticalFlow} />
        <CinematicDepthEffectCard
          t={t}
          active={cinematicDepthActive}
          analysis={cinematicDepthAnalysis}
          running={cinematicDepthRunning}
          progress={cinematicDepthProgress}
          onClick={onOpenCinematicDepth}
        />
        <PhotoParallaxEffectCard
          t={t}
          active={photoParallaxActive}
          analysis={photoParallaxAnalysis}
          running={photoParallaxRunning}
          progress={photoParallaxProgress}
          onClick={onOpenPhotoParallax}
        />
        </> : null}
        <ClickRippleEffectCard
          t={t}
          active={clickRipple.enabled}
          onClick={() => {
            if (!clickRipple.enabled) onChangeClickRipple?.(updateClickRippleEffect(clickRipple, { enabled: true }));
            onOpenClickRipple?.();
          }}
        />
      </div>
    </div>
  );
}

export function SubjectEffectsInspector({
  t,
  segment,
  analysis,
  running,
  progress,
  phase,
  onChange,
  onAnalyze,
  onRemove,
  singleSection = "",
}) {
  const [materialEditor, setMaterialEditor] = useState("");
  if (!segment) {
    return <div className="visual-context-empty"><ImageSquare size={30} weight="duotone" /><strong>{t("effectSelectClip")}</strong><span>{t("effectSelectClipHint")}</span></div>;
  }
  const effect = normalizeSubjectEffect(segment.subjectEffect);
  const isObject = effect.targetKind === "object";
  const matchingAnalysis = analysis && (
    (analysis.targetKind || (String(analysis.pipeline || "").startsWith("object-") ? "object" : "person"))
    === effect.targetKind
  ) ? analysis : null;
  const patch = (next) => onChange?.(updateSubjectEffect(effect, next));
  const show = (section) => !singleSection || singleSection === "effects" || singleSection === section;
  return (
    <div className="subject-effects-inspector">
      {show("effects") ? <AnalysisStatus t={t} analysis={matchingAnalysis} running={running} progress={progress} phase={phase} compact targetKind={effect.targetKind} /> : null}

      {show("effects") ? <section className="subject-inspector-actions">
        <label className="switch-row"><input type="checkbox" checked={effect.enabled && effect.outline.enabled} onChange={(event) => patch({ enabled: event.target.checked, outline: { enabled: event.target.checked } })} />{isObject ? t("effectObjectOutlineEnabled") : t("effectOutlineEnabled")}</label>
        <button className={running ? "panel-secondary" : "panel-primary"} type="button" onClick={() => onAnalyze?.({ targetKind: effect.targetKind })}>{running ? t("effectCancelAnalysis") : matchingAnalysis ? t("effectReanalyze") : isObject ? t("effectAnalyzeObject") : t("effectAnalyzePerson")}</button>
      </section> : null}

      {show("outline") || show("effects") ? <section className="subject-material-section">
        <header><div><span>01</span><div><strong>{t("effectMaterialTitle")}</strong><small>{t("effectMaterialHint")}</small></div></div><label className="mini-switch"><input type="checkbox" checked={effect.outline.enabled} onChange={(event) => patch({ enabled: event.target.checked || effect.enabled, outline: { enabled: event.target.checked } })} /><i /></label></header>
        <div className="subject-material-list">
          {SUBJECT_MATERIALS.map((material) => <MaterialCard
            key={material.id}
            t={t}
            material={material}
            active={effect.outline.enabled && effect.material.id === material.id}
            onClick={() => setMaterialEditor(material.id)}
          />)}
        </div>
      </section> : null}

      {show("effects") ? <button className="subject-remove-effect" type="button" disabled={!effect.enabled} onClick={onRemove}><Trash size={16} />{t("effectRemove")}</button> : null}
      {materialEditor ? <MaterialEditorDialog
        t={t}
        segment={segment}
        analysis={matchingAnalysis}
        effect={effect}
        materialId={materialEditor}
        onCancel={() => setMaterialEditor("")}
        onApply={(nextEffect) => {
          onChange?.(nextEffect);
          setMaterialEditor("");
        }}
      /> : null}
    </div>
  );
}

export function removeSubjectEffect() {
  return { ...DEFAULT_SUBJECT_EFFECT };
}
