import { useId, useState } from "react";
import { ArrowRight, FilmStrip, ImageSquare, MusicNote, UploadSimple } from "@phosphor-icons/react";
import { beatEffectCopy } from "../i18nBeatEffects.js";
import { templateCopy } from "../i18nTemplates.js";
import { BEAT_MONTAGE_ID, getBeatTemplateDuration, MAX_TEMPLATE_BPM, MIN_TEMPLATE_BPM, TEMPLATE_SLOTS } from "../lib/beatMontage.js";
import { getMediaFileKind } from "../lib/mediaCompatibility.js";
import "./TemplateLibrary.css";

function AssetSlot({ copy, title, items, selected, onChange, onUpload, optional, audio = false }) {
  const id = useId();
  const asset = items.find((item) => item.id === selected);
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
        <select id={id} value={asset?.id || ""} onChange={(event) => { setInvalid(false); onChange(event.target.value); }}>
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

export function TemplateLibrary({ language, draft, setDraft, visualSegments, userAssets, hasMusic, musicLocked, hasVisuals, blocked, onUpload, onApply }) {
  const copy = templateCopy(language);
  const title = beatEffectCopy(language)[BEAT_MONTAGE_ID];
  const timelineAssets = new Map();
  for (const segment of visualSegments) {
    if (!segment.src) continue;
    const id = segment.assetId || segment.id;
    const current = timelineAssets.get(id);
    const end = Math.max(current?.duration || 0, segment.trackFrameDuration || 0,
      (segment.sourceStart || 0) + (segment.sourceDuration || segment.duration));
    timelineAssets.set(id, { ...(current || segment), id, sourceStart: 0, sourceDuration: end, duration: end });
  }
  const fromTimeline = [...timelineAssets.values()];
  const assets = [...new Map([...fromTimeline, ...userAssets].map((item) => [item.id, item])).values()];
  const visuals = assets.filter((item) => item.type === "image" || item.type === "video");
  const audio = assets.filter((item) => item.type === "audio");
  const defaults = fromTimeline.find(isReady)?.id || "";
  const mainId = draft.main ?? defaults;
  const main = visuals.find((item) => item.id === mainId);
  const detail = visuals.find((item) => item.id === draft.detail) || main;
  const alternate = visuals.find((item) => item.id === draft.alternate) || main;
  const music = hasMusic || musicLocked ? null : audio.find((item) => item.id === draft.music);
  const bpm = Number(draft.bpm ?? 104);
  const duration = getBeatTemplateDuration(bpm);
  const validBpm = Number.isInteger(bpm) && bpm >= MIN_TEMPLATE_BPM && bpm <= MAX_TEMPLATE_BPM;
  const ready = [main, detail, alternate].every((item) => isReady(item) && (item.type !== "video" || (item.sourceDuration ?? item.duration) >= 1))
    && (!music || isReady(music));
  const change = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  return (
    <section className="template-library mobile-panel-scroll-body" aria-label={copy.title}>
      <button type="button" className="template-card" aria-expanded={Boolean(draft.open)} onClick={() => change("open", !draft.open)}>
        <span className="template-card-cover" aria-hidden="true">
          <img src="/assets/effects/vfx/halo.webp" alt="" />
          <img src="/assets/effects/vfx/glow.webp" alt="" />
          <img src="/assets/effects/vfx/shake.webp" alt="" />
        </span>
        <span className="template-card-title"><strong>{title}</strong><ArrowRight size={18} /></span>
      </button>
      {draft.open ? <div className="template-setup">
        <p>{copy.description}</p>
        {TEMPLATE_SLOTS.map((slot) => (
          <AssetSlot key={slot} copy={copy} title={copy[slot]} items={visuals}
            selected={slot === "main" ? mainId : draft[slot]} onChange={(id) => change(slot, id)} onUpload={onUpload}
            optional={slot === "main" ? "" : copy.reuseMain} />
        ))}
        {hasMusic ? <p>{copy.musicOccupied}</p> : musicLocked ? null : <AssetSlot copy={copy} title={copy.music} items={audio}
          selected={draft.music} onChange={(id) => change("music", id)} onUpload={onUpload} audio optional="—" />}
        <label className="template-tempo">
          <span>BPM ♩</span>
          <input type="number" min={MIN_TEMPLATE_BPM} max={MAX_TEMPLATE_BPM} step="1" value={draft.bpm ?? 104}
            onChange={(event) => change("bpm", event.target.value)} />
          {validBpm ? <output>{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(duration)} s</output> : null}
        </label>
        {blocked ? <p role="status">{copy.locked}</p> : null}
        <button type="button" className="template-apply" disabled={blocked || !ready || !validBpm}
          onClick={() => onApply({ assets: { main, detail, alternate }, bpm, music })}>
          {hasVisuals ? copy.append : copy.apply}
        </button>
      </div> : null}
    </section>
  );
}
