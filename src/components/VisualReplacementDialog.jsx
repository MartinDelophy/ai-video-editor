import { useEffect, useId, useRef, useState } from "react";
import { UploadSimple, X } from "@phosphor-icons/react";
import { replacementCopy } from "../i18nVisualReplacement.js";
import { templateCopy } from "../i18nTemplates.js";
import { getMediaFileKind } from "../lib/mediaCompatibility.js";
import { getReplacementTiming } from "../lib/visualReplacement.js";
import "./VisualReplacementDialog.css";

function SourceRangeField({ label, value, max, onChange }) {
  const id = useId();
  return (
    <div className="replacement-range-field">
      <label htmlFor={id}>{label}</label>
      <input type="number" id={id} min={0} max={max} step="any" value={value}
        onChange={(event) => onChange(event.currentTarget.value)} />
      <input type="range" aria-label={label} min={0} max={max} step={0.01}
        value={Number(value) || 0} onChange={(event) => onChange(event.currentTarget.value)} />
    </div>
  );
}

export function VisualReplacementDialog({ language, t, clip, assets, onUpload, onClose, onReplace }) {
  const copy = replacementCopy(language);
  const shared = templateCopy(language);
  const titleId = useId(), assetId = useId();
  const dialog = useRef(null), video = useRef(null);
  const [selected, setSelected] = useState("");
  const [sourceRange, setSourceRange] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const asset = assets.find((item) => item.id === selected);
  const sourceLength = asset?.type === "video" ? Number(asset.duration) || 0 : 0;
  const sameSource = asset?.src === clip.src;
  const defaultStart = sameSource ? clip.sourceStart || 0 : 0;
  const defaultEnd = Math.min(sourceLength, defaultStart + (sameSource ? clip.sourceDuration || clip.duration : clip.duration));
  const from = sourceRange?.from ?? String(defaultStart);
  const to = sourceRange?.to ?? String(defaultEnd);
  const start = from === "" ? NaN : Number(from);
  const end = to === "" ? NaN : Number(to);
  const timing = getReplacementTiming(asset, clip.duration, start, end);
  const assetReady = asset && !asset.preparing && !asset.mediaUnavailable && asset.width > 0 && asset.height > 0;
  const format = (seconds) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(seconds);
  const previewAt = (value) => {
    const player = video.current;
    if (!player || player.readyState < 1 || value === "" || !Number.isFinite(Number(value))) return;
    player.pause();
    player.currentTime = Math.max(0, Math.min(player.duration - 0.001, Number(value)));
  };
  const changeAsset = (id) => {
    setSelected(id);
    setSourceRange(null);
    setInvalid(false);
  };
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog ref={dialog} className="visual-replacement-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
      <form onSubmit={(event) => { event.preventDefault(); if (timing) onReplace(asset, timing); }}>
        <header>
          <div><h2 id={titleId}>{copy.title}</h2><small title={clip.name}>{clip.name} · {format(clip.duration)} s</small></div>
          <button className="replacement-close" type="button" aria-label={t("close")} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="replacement-source-picker">
          <label htmlFor={assetId}>{shared.choose}</label>
          <select id={assetId} value={selected} onChange={(event) => changeAsset(event.currentTarget.value)}>
            <option value="">{shared.choose}</option>
            {assets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <label className="template-upload">
            <UploadSimple size={16} /><span>{shared.upload}</span>
            <input type="file" aria-label={shared.upload} accept="image/*,video/*,.mkv,.mov"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                if (["image", "video"].includes(getMediaFileKind(file))) {
                  const uploaded = onUpload([file], { insertFirstVisual: false, quiet: true })?.[0];
                  if (uploaded) changeAsset(uploaded.id);
                  else setInvalid(true);
                } else setInvalid(true);
                event.currentTarget.value = "";
              }} />
          </label>
        </div>
        {invalid || asset?.mediaUnavailable ? <p role="status">{shared.failed}</p> : asset && !assetReady ? <p role="status">{shared.reading}</p> : null}
        {assetReady ? <div className="replacement-preview">
          {asset.type === "video"
            ? <video key={asset.src} ref={video} src={asset.src} controls playsInline preload="metadata"
              onLoadedMetadata={() => previewAt(start)}
              onPlay={(event) => {
                const player = event.currentTarget;
                if (timing && (player.currentTime < start || player.currentTime >= end)) player.currentTime = start;
              }}
              onTimeUpdate={(event) => { if (timing && event.currentTarget.currentTime >= end) event.currentTarget.pause(); }} />
            : <img src={asset.src} alt={asset.name} />}
        </div> : null}
        {assetReady && asset.type === "video" ? <fieldset>
          <legend>{copy.range}</legend>
          <SourceRangeField label={copy.start} value={from} max={sourceLength} onChange={(value) => {
            setSourceRange({ from: value, to }); previewAt(value);
          }} />
          <SourceRangeField label={copy.end} value={to} max={sourceLength} onChange={(value) => {
            setSourceRange({ from, to: value }); previewAt(value);
          }} />
          <p role="status">{timing ? `${copy.fixed} · ${format(timing.playbackRate)}×` : copy.invalid}</p>
        </fieldset> : assetReady ? <p>{copy.fixed}</p> : null}
        <footer>
          <button type="button" onClick={onClose}>{t("cancel")}</button>
          <button className="replacement-confirm" type="submit" disabled={!timing}>{copy.title}</button>
        </footer>
      </form>
    </dialog>
  );
}
