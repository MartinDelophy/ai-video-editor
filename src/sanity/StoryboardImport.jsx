import { useEffect, useRef, useState } from 'react';
import { ArrowSquareOut, FilmSlate, X } from '@phosphor-icons/react';
import { storyboardCopy } from './copy.js';
import { APPROVED_QUERY, contentOf, validateReady, connectionConfig, currentRelease, errorKey, publicQuery, readConnection, workbenchUrl } from './storyboard.js';
import { planStoryboardImport } from './importStoryboard.js';
import './storyboard.css';

export default function StoryboardImport({ language, assets, visuals, markers, locked, onClose, onImport }) {
  const c = storyboardCopy(language);
  const [config, setConfig] = useState(readConnection);
  const [loadedConfig, setLoadedConfig] = useState(null);
  const [boards, setBoards] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [assignments, setAssignments] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dialogRef = useRef(null);
  const abortRef = useRef(null);
  const busyRef = useRef(false);
  const board = boards.find((item) => item._id === selectedId);
  const release = board?.approvedRelease;
  const media = assets.filter((asset) => ['image', 'video'].includes(asset.type) && asset.src && !asset.preparing);
  const latest = useRef(null);
  latest.current = { visuals, markers, locked, assets, onImport };
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current.showModal();
    return () => { abortRef.current?.abort(); previous?.focus?.(); };
  }, []);
  const load = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const next = connectionConfig(config);
      const result = await publicQuery(next, APPROVED_QUERY, {}, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(result)) throw Object.assign(new Error(), { code: 'invalidBoard' });
      for (const item of result) if (item.approvedRelease) validateReady(item.approvedRelease);
      setBoards(result.filter((item) => item.approvedRelease)); setLoadedConfig(next); setSelectedId(''); setAssignments({});
      try { localStorage.setItem('ts-sanity-connection', JSON.stringify(next)); } catch { /* connection can remain session-only */ }
      if (!result.length) setMessage('empty');
    } catch (error) { if (!controller.signal.aborted) setMessage(errorKey(error)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const assign = (key, patch) => setAssignments((items) => ({ ...items, [key]: { ...items[key], ...patch } }));
  let plan = null;
  let invalid = '';
  if (release && loadedConfig) {
    try { plan = planStoryboardImport({ connection: loadedConfig, release, assignments, assets, visuals, markers, locked }); }
    catch (error) { invalid = errorKey(error); }
  }
  const append = async () => {
    if (!plan || busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const approved = await currentRelease(loadedConfig, board._id, release._id, controller.signal);
      if (controller.signal.aborted) return;
      // Rebuild against the live editor after network I/O. The parent checks the
      // reviewed timeline identity before applying the synchronous transaction.
      const current = latest.current;
      if (current.visuals !== visuals || current.markers !== markers || current.locked !== locked) {
        throw Object.assign(new Error(), { code: 'editorChanged' });
      }
      if (JSON.stringify(contentOf(approved)) !== JSON.stringify(contentOf(release))) throw Object.assign(new Error(), { code: 'staleRelease' });
      const verified = planStoryboardImport({ connection: loadedConfig, release: approved, assignments, ...current });
      current.onImport(verified);
      closeRef.current();
    } catch (error) { if (!controller.signal.aborted) setMessage(errorKey(error)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const setConnectionField = (field, value) => { setConfig((current) => ({ ...current, [field]: value })); setBoards([]); setLoadedConfig(null); setSelectedId(''); setMessage(''); };
  let studioLink;
  try { studioLink = workbenchUrl(config, language); } catch { /* invalid config */ }
  return <dialog className="sb-dialog sb-surface" ref={dialogRef} aria-labelledby="sb-import-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="sb-header"><div className="sb-brand"><FilmSlate size={24} /><div><h1 id="sb-import-title">{c.title}</h1><p>{c.subtitle}</p></div></div><button aria-label={c.close} onClick={onClose}><X size={18} /></button></header>
    <div className="sb-import-body">
      <p className="sb-notice">{c.publicNotice}</p>
      <fieldset disabled={busy} className="sb-fields"><legend>{c.connect}</legend><div className="sb-two-fields"><label>{c.project}<input value={config.projectId} onChange={(e) => setConnectionField('projectId', e.target.value)} /></label><label>{c.dataset}<input value={config.dataset} onChange={(e) => setConnectionField('dataset', e.target.value)} /></label></div>
        <div className="sb-actions"><button className="sb-primary" onClick={load}>{c.load}</button>{studioLink && <a href={studioLink} target="_blank" rel="noreferrer">{c.openStudio}<ArrowSquareOut size={16} /></a>}</div>
      </fieldset>
      {busy && <p role="status">{c.loading}</p>}
      {message && <p className="sb-message" role="status">{c[message]}</p>}
      {boards.length > 0 && <label>{c.selectBoard}<select disabled={busy} value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setAssignments({}); setMessage(''); }}><option value="">—</option>{boards.map((item) => <option key={item._id} value={item._id}>{item.approvedRelease.title}</option>)}</select></label>}
      {release && <><div className="sb-section-title"><h2>{release.title}</h2><span className="sb-status status-approved">{c.approved}</span></div><p className="sb-hint">{release.brief}</p>
        {release.shots.map((shot, index) => <article className="sb-shot" key={shot._key}><div className="sb-shot-top"><strong>{String(index + 1).padStart(2, '0')} · {shot.title}</strong><span>{shot.duration} s</span></div><p>{shot.visualBrief}</p>{shot.narration && <p className="sb-hint">{c.narration}: {shot.narration}</p>}{shot.assetHint && <p className="sb-hint">{c.assetHint}: {shot.assetHint}</p>}
          <div className="sb-two-fields"><label>{c.asset}<select disabled={busy} value={assignments[shot._key]?.assetId || ''} onChange={(e) => assign(shot._key, { assetId: e.target.value, sourceStart: 0 })}><option value="">—</option>{media.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
          {media.find((asset) => asset.id === assignments[shot._key]?.assetId)?.type === 'video' && <label>{c.sourceStart}<input disabled={busy} type="number" min="0" step="0.1" value={assignments[shot._key]?.sourceStart ?? 0} onChange={(e) => assign(shot._key, { sourceStart: e.target.value })} /></label>}</div>
        </article>)}
        <p className="sb-hint">{c.importHint}</p>{invalid && <p className="sb-message" role="status">{c[invalid]}</p>}
      </>}
    </div>
    <footer className="sb-footer"><span>{plan ? `${plan.start.toFixed(1)} → ${(plan.start + plan.duration).toFixed(1)} s` : ''}</span><button className="sb-primary" disabled={busy || !plan} onClick={append}>{c.append}</button></footer>
  </dialog>;
}
