import { MEMORY_VORTEX_ID } from "../lib/projectedBeatTemplates.js";
import { prepareReferenceTemplate } from "../lib/referenceTemplates.js";
import { referenceTemplateCopy } from "../i18nReferenceTemplates.js";
import { useEffect, useId, useRef, useState } from "react";
import { CaretRight, FilmStrip, ImageSquare, MusicNote, UploadSimple, X } from "@phosphor-icons/react";
import { beatEffectCopy } from "../i18nBeatEffects.js";
import { templateCopy } from "../i18nTemplates.js";
import { BEAT_MONTAGE_ID, MAX_TEMPLATE_BPM, MIN_TEMPLATE_BPM } from "../lib/beatMontage.js";
import { CARD_ROTATION_ID, CARD_ROTATION_INTRO_URL, CARD_ROTATION_MEDIA } from "../lib/cardRotationTemplate.js";
import { TIMELINE_TEMPLATES } from "../lib/templateCatalog.js";
import { cardRotationCopy } from "../i18nCardRotationTemplate.js";
import { prepareTemplateCardIntro, resolveTemplateCardFaces, TEMPLATE_CARD_FACES as FACE_SLOTS } from "../lib/templateMedia.js";
import { getTimelineVisualAssets } from "../lib/visualReplacement.js";
import { getMediaFileKind } from "../lib/mediaCompatibility.js";
import "./TemplateLibrary.css";

const BUILT_IN_MUSIC = "built-in-beat-score";
function AssetSlot({ copy, title, items, selected, onChange, onUpload, optional, audio = false, allowShort = false }) {
  const id = useId();
  const asset = items.find((item) => item.id === selected);
  const choice = audio && selected === BUILT_IN_MUSIC ? BUILT_IN_MUSIC : asset?.id || "";
  const [invalid, setInvalid] = useState(false);
  const acceptFile = (file) => {
    const kind = getMediaFileKind(file);
    if (audio ? kind !== "audio" : !["image", "video"].includes(kind)) {
      setInvalid(true);
      return;
    }
    const uploaded = onUpload([file], { insertFirstVisual: false, quiet: true })?.[0];
    setInvalid(!uploaded);
    if (uploaded) onChange(uploaded.id);
  };
  const frame = asset?.trackFrames?.[0];
  const thumbnail = asset?.type === "image" ? asset.src : typeof frame === "string" ? frame : frame?.src || asset?.thumbnail;
  const Icon = audio ? MusicNote : asset?.type === "video" ? FilmStrip : ImageSquare;
  return (
    <div className="template-slot" onDragOver={(event) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault();
    }} onDrop={(event) => {
      if (!event.dataTransfer.files.length) return;
      event.preventDefault();
      event.stopPropagation();
      acceptFile(event.dataTransfer.files[0]);
    }}>
      <span className="template-slot-thumb">{thumbnail ? <img src={thumbnail} alt="" /> : <Icon size={18} />}</span>
      <div className="template-slot-fields">
        <label htmlFor={id}>{title}</label>
        <select id={id} value={choice} onChange={(event) => { setInvalid(false); onChange(event.target.value); }}>
          {audio ? <option value={BUILT_IN_MUSIC}>{copy.builtInMusic}</option> : null}
          <option value="">{optional || copy.choose}</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {invalid || asset?.mediaUnavailable ? <small role="status">{copy.failed}</small>
          : asset && !isReady(asset) ? <small role="status">{copy.reading}</small>
          : !allowShort && asset?.type === "video" && asset.duration < 1 ? <small role="status">{copy.tooShort}</small> : null}
      </div>
      <label className="template-upload">
        <UploadSimple size={16} />
        <span>{copy.upload}</span>
        <input type="file" aria-label={`${copy.upload} · ${title}`}
          accept={audio ? "audio/*,.m4a,.aac,.ogg,.flac" : "image/*,video/*,.mkv,.mov"}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) acceptFile(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
    </div>
  );
}

function isReady(asset) {
  if (!asset?.src || asset.mediaUnavailable || asset.preparing) return false;
  if (asset.type === "audio") return asset.duration > 0 && asset.blob instanceof Blob;
  return asset.width > 0 && asset.height > 0 && (asset.type === "image" || asset.duration > 0);
}

export function TemplateLibrary({ language, selected, onSelect }) {
  const copy = templateCopy(language);
  const card = cardRotationCopy(language);
  const [hovered, setHovered] = useState("");
  const startPreview = (id) => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setHovered(id);
  };
  return (
    <section className="subject-effect-capability-grid template-library mobile-panel-scroll-body" aria-label={copy.title}>
      {TIMELINE_TEMPLATES.map(({ id }) => {
        const isCard = id === CARD_ROTATION_ID;
        const reference = referenceTemplateCopy(id, language);
        const title = reference?.title ?? (isCard ? card.title : beatEffectCopy(language)[BEAT_MONTAGE_ID]);
        const summary = reference?.description ?? (isCard ? card.summary : copy.description);
        const media = isCard ? CARD_ROTATION_MEDIA : reference ? `/assets/templates/${id}` : "";
        // The service worker caches preview videos by URL.
        const revision = id === MEMORY_VORTEX_ID ? "?v=2" : "";
        const cover = `${media}/cover.webp${revision}`;
        const preview = isCard ? CARD_ROTATION_INTRO_URL : `${media}/preview.mp4${revision}`;
        return (
          <button key={id} type="button" className={`subject-outline-entry template-card ${selected === id ? "is-active" : ""}`}
            aria-pressed={selected === id} onClick={() => onSelect(id)}
            onMouseEnter={media ? () => startPreview(id) : undefined}
            onMouseLeave={media ? () => setHovered("") : undefined}
            onFocus={media ? () => startPreview(id) : undefined}
            onBlur={media ? () => setHovered("") : undefined}>
            <span className="subject-outline-entry-preview" aria-hidden="true">
              {media
                ? hovered === id
                  ? <video src={preview} poster={cover} autoPlay muted loop playsInline />
                  : <img src={cover} alt="" />
                : <span className="template-card-cover">
                    <img src="/assets/effects/vfx/halo.webp" alt="" />
                    <img src="/assets/effects/vfx/glow.webp" alt="" />
                    <img src="/assets/effects/vfx/shake.webp" alt="" />
                  </span>}
            </span>
            <span className="subject-outline-entry-footer">
              <span className="subject-outline-entry-copy"><strong>{title}</strong><small>{summary}</small></span>
              <span className="subject-outline-entry-state" aria-hidden="true"><CaretRight size={16} /></span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

function useCardIntro(enabled) {
  const [intro, setIntro] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const value = await prepareTemplateCardIntro([], { signal: controller.signal });
        if (!controller.signal.aborted) setIntro(value);
      } catch {
        if (!controller.signal.aborted) setIntro({ failed: true });
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled]);
  return intro;
}

export function TemplateInspector({ template, language, closeLabel, cancelLabel, onClose, draft, setDraft, visualSegments, userAssets, hasMusic, musicLocked, shouldAppend, blocked, onUpload, onApply }) {
  const copy = templateCopy(language);
  const card = cardRotationCopy(language);
  const isCard = template.id === CARD_ROTATION_ID;
  const isVortex = template.id === MEMORY_VORTEX_ID;
  const intro = useCardIntro(isCard);
  const job = useRef(null);
  const apply = useRef(onApply);
  const [progress, setProgress] = useState(null);
  const [renderFailed, setRenderFailed] = useState(false);
  useEffect(() => { apply.current = onApply; }, [onApply]);
  useEffect(() => () => job.current?.abort(), []);
  const reference = referenceTemplateCopy(template.id, language);
  const manySlots = isCard || Boolean(reference);
  const title = reference?.title ?? (isCard ? card.title : beatEffectCopy(language)[BEAT_MONTAGE_ID]);
  const fromTimeline = getTimelineVisualAssets(visualSegments).filter((asset) => ![CARD_ROTATION_ID, MEMORY_VORTEX_ID, "template-demo"].includes(asset.generatedBy));
  const assets = [...new Map([...fromTimeline, ...userAssets].map((item) => [item.id, item])).values()];
  const visuals = assets.filter((item) => item.type === "image" || item.type === "video");
  const audio = assets.filter((item) => item.type === "audio");
  const defaults = fromTimeline.find(isReady)?.id || "";
  const mainId = draft.main ?? defaults;
  const main = visuals.find((item) => item.id === mainId);
  const chosenAssets = Object.fromEntries(template.slots.map((slot) => [
    slot, slot === "main" ? main : visuals.find((item) => item.id === draft[slot]) || main,
  ]));
  const musicChoice = draft.music ?? BUILT_IN_MUSIC;
  const canAddMusic = !hasMusic && !musicLocked;
  const builtInMusic = canAddMusic && musicChoice === BUILT_IN_MUSIC;
  const music = canAddMusic ? audio.find((item) => item.id === musicChoice) : null;
  const bpm = Number(draft.bpm ?? template.defaultBpm);
  const duration = template.getDuration(bpm);
  const validBpm = Number.isInteger(bpm) && bpm >= MIN_TEMPLATE_BPM && bpm <= MAX_TEMPLATE_BPM;
  const faceOverrides = Object.fromEntries(FACE_SLOTS.map(([key]) => [key, visuals.find((asset) => asset.id === draft[key])]));
  const faces = resolveTemplateCardFaces(template, chosenAssets, faceOverrides);
  const ready = (isCard ? faces.length > 0 || Boolean(intro?.blob) : Boolean(reference || main))
    && Object.values(chosenAssets).every((item) => !item || (isReady(item) && (item.type !== "video" || (item.sourceDuration ?? item.duration) >= 1)))
    && faces.every(isReady) && (!music || isReady(music));
  const change = (key, value) => {
    job.current?.abort();
    setRenderFailed(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };
  const submit = async () => {
    if (job.current) return;
    const options = { assets: chosenAssets, bpm, music, builtInMusic, intro };
    if (!faces.length && !reference) {
      onApply(options);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    job.current = controller;
    setProgress(0);
    setRenderFailed(false);
    try {
      if (reference) {
        const prepared = await prepareReferenceTemplate(template, chosenAssets, {
          bpm, language, label: card.slot, signal, onProgress: setProgress,
        });
        if (!signal.aborted) apply.current({ ...options, ...prepared });
        return;
      }
      const intro = await prepareTemplateCardIntro(faces, { signal, onProgress: setProgress });
      if (!signal.aborted) apply.current({ ...options, intro });
    } catch {
      if (!signal.aborted) setRenderFailed(true);
    } finally {
      if (job.current === controller) {
        job.current = null;
        setProgress(null);
      }
    }
  };
  const renderSlot = (slot, index) => (
    <AssetSlot key={slot} copy={copy} title={manySlots ? `${card.slot} ${String(index + 1).padStart(2, "0")}` : copy[slot]} items={visuals}
      selected={slot === "main" ? mainId : draft[slot]} onChange={(id) => change(slot, id)} onUpload={onUpload}
      optional={reference ? (slot === "main" ? reference.demo : copy.reuseMain)
        : isCard ? (slot === "main" ? card.placeholder : card.reuse) : slot === "main" ? "" : copy.reuseMain} />
  );
  return (
    <aside className="voice-panel template-inspector" aria-label={title}>
      <header className="template-inspector-heading">
        <h2>{title}</h2>
        <button type="button" aria-label={closeLabel} onClick={onClose}><X size={17} /></button>
      </header>
      <div className="voice-tab-body template-setup">
        <p>{reference?.description ?? (isCard ? card.description : copy.description)}</p>
        {manySlots ? <>
          {renderSlot("main", 0)}
          {template.slots.length > 1 ? <details className="template-extra-slots">
            <summary>{card.slots}<span>{template.slots.length - 1}</span></summary>
            <div>{template.slots.slice(1).map((slot, index) => renderSlot(slot, index + 1))}</div>
          </details> : null}
          {isCard ? <details className="template-extra-slots template-card-faces">
            <summary>{card.faces}<span>{FACE_SLOTS.length}</span></summary>
            <div>{FACE_SLOTS.map(([key, symbol]) => (
              <AssetSlot key={key} copy={copy} title={`${symbol} ${card[key]}`} items={visuals}
                selected={draft[key]} onChange={(id) => change(key, id)} onUpload={onUpload} optional={card.followCuts} allowShort />
            ))}</div>
          </details> : null}
          {isCard && !faces.length && !intro?.blob ? <p role="status">{intro?.failed ? copy.failed : copy.reading}</p> : null}
        </> : template.slots.map(renderSlot)}
        {hasMusic ? <p>{copy.musicOccupied}</p> : musicLocked ? null : <AssetSlot copy={copy} title={copy.music} items={audio}
          selected={musicChoice} onChange={(id) => change("music", id)} onUpload={onUpload} audio optional={copy.noMusic} />}
        <label className="template-tempo">
          <span>BPM ♩</span>
          <input type="number" min={MIN_TEMPLATE_BPM} max={MAX_TEMPLATE_BPM} step="1" value={draft.bpm ?? template.defaultBpm}
            onChange={(event) => change("bpm", event.target.value)} />
          {validBpm ? <output>{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(duration)} s</output> : null}
        </label>
        {blocked ? <p role="status">{reference?.locked ?? (isCard ? card.locked : copy.locked)}</p> : null}
        {renderFailed ? <p role="alert">{reference ? copy.failed : card.renderFailed}</p> : null}
        {progress === null ? (
          <button type="button" className="template-apply" disabled={blocked || !ready || !validBpm} onClick={submit}>
            {shouldAppend(main) ? copy.append : copy.apply}
          </button>
        ) : (
          <div className="template-render">
            <span role="status">{reference ? copy.reading : card.rendering}</span>
            <button type="button" onClick={() => job.current?.abort()}>{cancelLabel}</button>
            <progress value={reference && !isVortex ? undefined : progress} max={100} aria-label={reference ? copy.reading : card.rendering} />
          </div>
        )}
      </div>
    </aside>
  );
}
