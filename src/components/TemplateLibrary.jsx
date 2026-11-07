import { useId, useState } from "react";
import { ArrowRight, FilmStrip, ImageSquare, MusicNote, UploadSimple, X } from "@phosphor-icons/react";
import { beatEffectCopy } from "../i18nBeatEffects.js";
import { templateCopy } from "../i18nTemplates.js";
import { BEAT_MONTAGE_ID, getBeatTemplateDuration, MAX_TEMPLATE_BPM, MIN_TEMPLATE_BPM, TEMPLATE_SLOTS } from "../lib/beatMontage.js";
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
  const title = beatEffectCopy(language)[BEAT_MONTAGE_ID];
  return (
    <section className="template-library mobile-panel-scroll-body" aria-label={copy.title}>
      <button type="button" className="template-card" aria-pressed={selected} onClick={onSelect}>
        <span className="template-card-cover" aria-hidden="true">
          <img src="/assets/effects/vfx/halo.webp" alt="" />
          <img src="/assets/effects/vfx/glow.webp" alt="" />
          <img src="/assets/effects/vfx/shake.webp" alt="" />
        </span>
        <span className="template-card-title"><strong>{title}</strong><ArrowRight size={18} /></span>
      </button>
    </section>
  );
}

export function TemplateInspector({ language, closeLabel, onClose, draft, setDraft, visualSegments, userAssets, hasMusic, musicLocked, shouldAppend, blocked, onUpload, onApply }) {
  const copy = templateCopy(language);
  const title = beatEffectCopy(language)[BEAT_MONTAGE_ID];
  const fromTimeline = getTimelineVisualAssets(visualSegments);
  const assets = [...new Map([...fromTimeline, ...userAssets].map((item) => [item.id, item])).values()];
  const visuals = assets.filter((item) => item.type === "image" || item.type === "video");
  const audio = assets.filter((item) => item.type === "audio");
  const defaults = fromTimeline.find(isReady)?.id || "";
  const mainId = draft.main ?? defaults;
  const main = visuals.find((item) => item.id === mainId);
  const detail = visuals.find((item) => item.id === draft.detail) || main;
  const alternate = visuals.find((item) => item.id === draft.alternate) || main;
  const musicChoice = draft.music ?? BUILT_IN_MUSIC;
  const canAddMusic = !hasMusic && !musicLocked;
  const builtInMusic = canAddMusic && musicChoice === BUILT_IN_MUSIC;
  const music = canAddMusic ? audio.find((item) => item.id === musicChoice) : null;
  const bpm = Number(draft.bpm ?? 104);
  const duration = getBeatTemplateDuration(bpm);
  const validBpm = Number.isInteger(bpm) && bpm >= MIN_TEMPLATE_BPM && bpm <= MAX_TEMPLATE_BPM;
  const ready = [main, detail, alternate].every((item) => isReady(item) && (item.type !== "video" || (item.sourceDuration ?? item.duration) >= 1))
    && (!music || isReady(music));
  const change = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  return (
    <aside className="voice-panel template-inspector" aria-label={title}>
      <header className="template-inspector-heading">
        <h2>{title}</h2>
        <button type="button" aria-label={closeLabel} onClick={onClose}><X size={17} /></button>
      </header>
      <div className="voice-tab-body template-setup">
        <p>{copy.description}</p>
        {TEMPLATE_SLOTS.map((slot) => (
          <AssetSlot key={slot} copy={copy} title={copy[slot]} items={visuals}
            selected={slot === "main" ? mainId : draft[slot]} onChange={(id) => change(slot, id)} onUpload={onUpload}
            optional={slot === "main" ? "" : copy.reuseMain} />
        ))}
        {hasMusic ? <p>{copy.musicOccupied}</p> : musicLocked ? null : <AssetSlot copy={copy} title={copy.music} items={audio}
          selected={musicChoice} onChange={(id) => change("music", id)} onUpload={onUpload} audio optional={copy.noMusic} />}
        <label className="template-tempo">
          <span>BPM ♩</span>
          <input type="number" min={MIN_TEMPLATE_BPM} max={MAX_TEMPLATE_BPM} step="1" value={draft.bpm ?? 104}
            onChange={(event) => change("bpm", event.target.value)} />
          {validBpm ? <output>{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(duration)} s</output> : null}
        </label>
        {blocked ? <p role="status">{copy.locked}</p> : null}
        <button type="button" className="template-apply" disabled={blocked || !ready || !validBpm}
          onClick={() => onApply({ assets: { main, detail, alternate }, bpm, music, builtInMusic })}>
          {shouldAppend(main) ? copy.append : copy.apply}
        </button>
      </div>
    </aside>
  );
}
