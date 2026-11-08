import { useEffect, useId, useState } from "react";
import { CaretRight, FilmStrip, ImageSquare, MusicNote, UploadSimple, X } from "@phosphor-icons/react";
import { beatEffectCopy } from "../i18nBeatEffects.js";
import { templateCopy } from "../i18nTemplates.js";
import { BEAT_MONTAGE_ID, MAX_TEMPLATE_BPM, MIN_TEMPLATE_BPM } from "../lib/beatMontage.js";
import { CARD_ROTATION_ID, CARD_ROTATION_INTRO_SECONDS, CARD_ROTATION_INTRO_URL, CARD_ROTATION_MEDIA } from "../lib/cardRotationTemplate.js";
import { TIMELINE_TEMPLATES } from "../lib/templateCatalog.js";
import { cardRotationCopy } from "../i18nCardRotationTemplate.js";
import { extractVideoTrackFrames } from "../lib/media.js";
import { getTimelineVisualAssets } from "../lib/visualReplacement.js";
import { getMediaFileKind } from "../lib/mediaCompatibility.js";
import "./TemplateLibrary.css";

const BUILT_IN_MUSIC = "built-in-beat-score";

function AssetSlot({ copy, title, items, selected, onChange, onUpload, optional, audio = false }) {
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
          : asset?.type === "video" && asset.duration < 1 ? <small role="status">{copy.tooShort}</small> : null}
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
  const [cardPreview, setCardPreview] = useState(false);
  const playCard = () => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setCardPreview(true);
  };
  return (
    <section className="subject-effect-capability-grid template-library mobile-panel-scroll-body" aria-label={copy.title}>
      {TIMELINE_TEMPLATES.map(({ id }) => {
        const isCard = id === CARD_ROTATION_ID;
        const title = isCard ? card.title : beatEffectCopy(language)[BEAT_MONTAGE_ID];
        const summary = isCard ? card.summary : copy.description;
        return (
          <button key={id} type="button" className={`subject-outline-entry template-card ${selected === id ? "is-active" : ""}`}
            aria-pressed={selected === id} onClick={() => onSelect(id)}
            onMouseEnter={isCard ? playCard : undefined}
            onMouseLeave={isCard ? () => setCardPreview(false) : undefined}
            onFocus={isCard ? playCard : undefined}
            onBlur={isCard ? () => setCardPreview(false) : undefined}>
            <span className="subject-outline-entry-preview" aria-hidden="true">
              {isCard
                ? cardPreview
                  ? <video src={CARD_ROTATION_INTRO_URL} poster={`${CARD_ROTATION_MEDIA}/cover.webp`} autoPlay muted loop playsInline />
                  : <img src={`${CARD_ROTATION_MEDIA}/cover.webp`} alt="" />
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
        const response = await fetch(CARD_ROTATION_INTRO_URL, { signal: controller.signal });
        if (!response.ok) throw Error("Intro unavailable");
        const blob = await response.blob();
        if (!blob.size || blob.type === "text/html") throw Error("Intro unavailable");
        const trackFrames = await extractVideoTrackFrames(blob, { duration: CARD_ROTATION_INTRO_SECONDS, width: 768, height: 768, maxFrames: 12, signal: controller.signal }).catch(() => []);
        if (!controller.signal.aborted) setIntro({ blob, trackFrames });
      } catch {
        if (!controller.signal.aborted) setIntro({ failed: true });
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled]);
  return intro;
}

export function TemplateInspector({ template, language, closeLabel, onClose, draft, setDraft, visualSegments, userAssets, hasMusic, musicLocked, shouldAppend, blocked, onUpload, onApply }) {
  const copy = templateCopy(language);
  const card = cardRotationCopy(language);
  const isCard = template.id === CARD_ROTATION_ID;
  const intro = useCardIntro(isCard);
  const title = isCard ? card.title : beatEffectCopy(language)[BEAT_MONTAGE_ID];
  const fromTimeline = getTimelineVisualAssets(visualSegments).filter((asset) => asset.generatedBy !== CARD_ROTATION_ID);
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
  const ready = (isCard ? Boolean(intro?.blob) : Boolean(main))
    && Object.values(chosenAssets).every((item) => !item || (isReady(item) && (item.type !== "video" || (item.sourceDuration ?? item.duration) >= 1)))
    && (!music || isReady(music));
  const change = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const renderSlot = (slot, index) => (
    <AssetSlot key={slot} copy={copy} title={isCard ? `${card.slot} ${String(index + 1).padStart(2, "0")}` : copy[slot]} items={visuals}
      selected={slot === "main" ? mainId : draft[slot]} onChange={(id) => change(slot, id)} onUpload={onUpload}
      optional={isCard ? (slot === "main" ? card.placeholder : card.reuse) : slot === "main" ? "" : copy.reuseMain} />
  );
  return (
    <aside className="voice-panel template-inspector" aria-label={title}>
      <header className="template-inspector-heading">
        <h2>{title}</h2>
        <button type="button" aria-label={closeLabel} onClick={onClose}><X size={17} /></button>
      </header>
      <div className="voice-tab-body template-setup">
        <p>{isCard ? card.description : copy.description}</p>
        {isCard ? <>
          {renderSlot("main", 0)}
          <details className="template-extra-slots">
            <summary>{card.slots}<span>{template.slots.length - 1}</span></summary>
            <div>{template.slots.slice(1).map((slot, index) => renderSlot(slot, index + 1))}</div>
          </details>
          {!intro?.blob ? <p role="status">{intro?.failed ? copy.failed : copy.reading}</p> : null}
        </> : template.slots.map(renderSlot)}
        {hasMusic ? <p>{copy.musicOccupied}</p> : musicLocked ? null : <AssetSlot copy={copy} title={copy.music} items={audio}
          selected={musicChoice} onChange={(id) => change("music", id)} onUpload={onUpload} audio optional={copy.noMusic} />}
        <label className="template-tempo">
          <span>BPM ♩</span>
          <input type="number" min={MIN_TEMPLATE_BPM} max={MAX_TEMPLATE_BPM} step="1" value={draft.bpm ?? template.defaultBpm}
            onChange={(event) => change("bpm", event.target.value)} />
          {validBpm ? <output>{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(duration)} s</output> : null}
        </label>
        {blocked ? <p role="status">{isCard ? card.locked : copy.locked}</p> : null}
        <button type="button" className="template-apply" disabled={blocked || !ready || !validBpm}
          onClick={() => onApply({ assets: chosenAssets, bpm, music, builtInMusic, intro })}>
          {shouldAppend(main) ? copy.append : copy.apply}
        </button>
      </div>
    </aside>
  );
}
