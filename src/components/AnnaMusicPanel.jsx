import { getAnnaCatalogText } from "../lib/annaCatalogText.js";
import { useEffect } from "react";
import { getAnnaMusicCopy, getAnnaMusicError } from "../i18nAnnaMusic.js";
import "./AnnaVideoPanel.css";
import "./AnnaMusicPanel.css";

export function AnnaMusicPanel({ language, music }) {
  const c = getAnnaMusicCopy(language), { draft, setDraft } = music;
  useEffect(() => { if (music.status === "idle" && !music.models.length) void music.load();
    // Read discovery once per inspector mount; editing form state must not reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Discovery only; never submits a job.
  const model = music.models.find(m => m.modelName === draft.model), caps = model?.capabilities || {};
  const formats = Array.isArray(caps.formats) ? caps.formats.filter(value => typeof value === "string") : [];
  const licenseNote = getAnnaCatalogText(model?.licenseNote, language);
  const busy = ["loading", "queued", "running", "saving"].includes(music.status);
  const pending = Boolean(music.pending && !music.pending.finished);
  const change = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  return <section className="tool-panel anna-video-panel anna-music-panel">
    <p>{c.billing}</p>
    <label>{c.model}<select disabled={busy || pending} value={draft.model} onChange={e => setDraft(d => ({ ...d, model: e.target.value, durationSec: "", format: "" }))}>{music.models.map(m => <option key={m.modelName} value={m.modelName}>{getAnnaCatalogText(m.displayName, language, m.modelName)}</option>)}</select></label>
    <label>{c.prompt}<textarea rows={4} maxLength={caps.promptMaxChars || 4000} placeholder={c.hint} disabled={busy || pending} value={draft.prompt} onChange={e => change("prompt", e.target.value)} /></label>
    {caps.lyrics && !caps.instrumentalOnly ? <><label className="anna-music-toggle"><input type="checkbox" checked={draft.instrumental} disabled={busy || pending} onChange={e => change("instrumental", e.target.checked)}/>{c.instrumental}</label>{!draft.instrumental ? <label>{c.lyrics}<textarea rows={5} maxLength={caps.lyricsMaxChars || 10000} value={draft.lyrics} disabled={busy || pending} onChange={e => change("lyrics", e.target.value)}/></label> : null}</> : null}
    <div className="anna-video-options">
      {caps.duration?.type === "range" ? <label>{c.duration}<input type="number" min={caps.duration.min} max={caps.duration.max} step="1" value={draft.durationSec || caps.duration.default || caps.duration.min} disabled={busy || pending} onChange={e => change("durationSec", e.target.value)}/></label> : null}
      {formats.length ? <label>{c.format}<select value={draft.format || caps.defaultFormat || formats[0]} disabled={busy || pending} onChange={e => change("format", e.target.value)}>{formats.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select></label> : null}
    </div>
    {licenseNote ? <small>{licenseNote}</small> : null}
    <button type="button" className="primary" disabled={busy || pending || !model || draft.prompt.trim().length < (caps.promptMinChars || 1)} onClick={() => music.run()}>{c.generate}</button>
    {pending && !busy ? <button type="button" onClick={() => music.run(true)}>{c.recover}</button> : null}
    {pending && music.pending.jobId ? <button type="button" onClick={music.cancel} disabled={music.status === "saving"}>{c.cancel}</button> : null}
    {pending && !busy && music.pending.jobId ? <button type="button" onClick={music.dismiss}>{c.check}</button> : null}
    {!busy ? <button type="button" onClick={music.load}>{c.refresh}</button> : null}
    <p role="status">{music.error ? getAnnaMusicError(music.error, c) : music.status === "loading" ? c.loading : music.status === "saving" ? c.saving : busy ? c.running : music.status === "complete" ? c.complete : !music.models.length ? c.unavailable : ""}</p>
    {music.preview ? <audio controls preload="metadata" src={music.preview.src} aria-label={c.title}/> : null}
  </section>;
}
