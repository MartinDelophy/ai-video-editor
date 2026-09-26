import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FilmSlate, Plus, Trash, ArrowLeft } from '@phosphor-icons/react';
import { errorKey, LANGUAGES, newBoard, newShot, STORYBOARD_TYPE } from './storyboard.js';
import { storyboardCopy } from './copy.js';
import { saveBoard, transitionBoard } from './workflow.js';
import './storyboard.css';

const LANGUAGE_NAMES = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', th: 'ไทย', vi: 'Tiếng Việt', ru: 'Русский', it: 'Italiano', id: 'Bahasa Indonesia' };

function mergeLocalDrafts(namespace, items) {
  try {
    const drafts = Object.keys(localStorage).filter((key) => key.startsWith(namespace) && !key.endsWith(':current'))
      .map((key) => JSON.parse(localStorage.getItem(key))).filter((item) => item?._type === STORYBOARD_TYPE);
    return [...drafts, ...items.filter((item) => !drafts.some((draft) => draft._id === item._id))];
  } catch { return items; }
}

export default function WorkbenchPanel({ client, user, connection, initialLanguage = 'en' }) {
  const [language, setLanguage] = useState(initialLanguage);
  const c = storyboardCopy(language);
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [storageFailure, setStorageFailure] = useState(false);
  const [note, setNote] = useState('');
  const busyRef = useRef(false);
  const namespace = `ts-storyboards:${connection.projectId}:${connection.dataset}:${user?.id}:`;
  const localDraft = (id) => {
    try { return JSON.parse(localStorage.getItem(namespace + id)); } catch { return null; }
  };
  const persist = (next) => {
    try {
      localStorage.setItem(namespace + next._id, JSON.stringify(next));
      localStorage.setItem(namespace + 'current', next._id);
      setBoards((items) => [next, ...items.filter((item) => item._id !== next._id)]);
    } catch { setStorageFailure(true); }
  };
  const forget = (id) => { try { localStorage.removeItem(namespace + id); } catch { setStorageFailure(true); } };
  const choose = (item) => {
    const recovered = localDraft(item._id);
    setBoard(recovered || item); setDirty(Boolean(recovered)); setNote('');
    setMessage(recovered ? 'localDraft' : '');
    try { localStorage.setItem(namespace + 'current', item._id); } catch { setStorageFailure(true); }
  };
  useEffect(() => {
    let active = true;
    client.fetch(`*[_type == "${STORYBOARD_TYPE}"] | order(_updatedAt desc)[0...100]`).then((items) => {
      if (!active) return;
      setBoards(mergeLocalDrafts(namespace, items));
      let recovered;
      let lastId;
      try {
        lastId = localStorage.getItem(namespace + 'current');
        recovered = JSON.parse(localStorage.getItem(namespace + lastId));
      } catch { /* cloud remains available */ }
      setBoard(recovered || items.find((item) => item._id === lastId) || items[0] || newBoard(initialLanguage));
      setDirty(Boolean(recovered));
      if (recovered) setMessage('localDraft');
    }).catch((error) => { if (active) setMessage(errorKey(error)); });
    return () => { active = false; };
  }, [client, namespace, initialLanguage]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const edit = (patch) => {
    if (busyRef.current) return;
    const next = { ...board, ...patch };
    setBoard(next); setDirty(true); setMessage(''); persist(next);
  };
  const editShot = (key, patch) => edit({ shots: board.shots.map((shot) => shot._key === key ? { ...shot, ...patch } : shot) });
  const move = (index, step) => {
    const shots = [...board.shots];
    [shots[index], shots[index + step]] = [shots[index + step], shots[index]];
    edit({ shots });
  };
  const run = async (operation) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage('');
    try { await operation(); } catch (error) { setMessage(errorKey(error)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const accept = (next) => {
    if (!next) throw new Error('Missing document');
    forget(board._id);
    try { localStorage.setItem(namespace + 'current', next._id); } catch { setStorageFailure(true); }
    setBoard(next); setDirty(false); setNote(''); setMessage('saved');
    setBoards((items) => [next, ...items.filter((item) => item._id !== next._id)]);
  };
  const save = () => run(async () => accept(await saveBoard(client, board)));
  const transition = (target) => run(async () => accept(await transitionBoard(client, board, target, user, note)));
  const refresh = () => run(async () => {
    const items = await client.fetch(`*[_type == "${STORYBOARD_TYPE}"] | order(_updatedAt desc)[0...100]`);
    setBoards(mergeLocalDrafts(namespace, items));
    if (!dirty && board?._rev) {
      const remote = items.find((item) => item._id === board._id) || await client.getDocument(board._id);
      if (remote) setBoard(remote);
    } else if (dirty) setMessage('localDraft');
  });
  const editable = board && ['draft', 'changesRequested'].includes(board.status);
  return <main className="sb-workbench sb-surface">
    <header className="sb-header"><div className="sb-brand"><FilmSlate size={26} /><div><h1>{c.title}</h1><p>{c.subtitle}</p></div></div>
      <div className="sb-actions"><select aria-label={c.language} value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGES.map((id) => <option key={id} value={id}>{LANGUAGE_NAMES[id]}</option>)}</select><a href="/" target="_blank" rel="noreferrer"><ArrowLeft size={16} />{c.back}</a></div>
    </header>
    <p className="sb-notice">{c.publicNotice}</p>
    <div className="sb-workspace">
      <aside className="sb-board-list"><button className="sb-primary" disabled={busy} onClick={() => { const next = newBoard(language); persist(next); setBoard(next); setDirty(true); setMessage(''); }}><Plus size={16} />{c.newBoard}</button>
        <button disabled={busy} onClick={refresh}>{c.refresh}</button>
        {boards.map((item) => <button className={`sb-board-link ${board?._id === item._id ? 'is-selected' : ''}`} key={item._id} disabled={busy} onClick={() => choose(item)}><strong>{item.title || c.newBoard}</strong><small>{c[item.status] || c.draft}</small></button>)}
        <small>{connection.projectId} / {connection.dataset}</small>
      </aside>
      <section className="sb-edit-region">
        {message && <div className={`sb-message ${['conflict', 'authError', 'networkError'].includes(message) ? 'is-error' : ''}`} role="status">{c[message]}</div>}
        {storageFailure && <p className="sb-message is-error" role="alert">{c.storageError}</p>}
        {message === 'conflict' && <div className="sb-actions">
          <button disabled={busy} onClick={() => run(async () => accept(await client.getDocument(board._id)))}>{c.discard}</button>
          <button disabled={busy} onClick={() => run(async () => accept(await saveBoard(client, { ...board, _id: newBoard()._id, _rev: undefined, status: 'draft' })))}>{c.copy}</button>
        </div>}
        {!board ? <p>{c.loading}</p> : <>
          <div className="sb-editor-heading"><span className={`sb-status status-${board.status}`}>{c[board.status]}</span><span role="status">{busy ? c.loading : dirty || !board._rev ? c.unsaved : c.saved}</span><span>{board.shots.length} · {board.shots.reduce((sum, shot) => sum + Number(shot.duration || 0), 0).toFixed(1)} s</span></div>
          <fieldset disabled={busy || !editable} className="sb-fields">
            <label>{c.titleLabel}<input maxLength={240} value={board.title} onChange={(e) => edit({ title: e.target.value })} /></label>
            <label>{c.brief}<textarea rows={2} maxLength={8000} value={board.brief} onChange={(e) => edit({ brief: e.target.value })} /></label>
            <label>{c.language}<select value={board.language} onChange={(e) => edit({ language: e.target.value })}>{LANGUAGES.map((id) => <option key={id} value={id}>{LANGUAGE_NAMES[id]}</option>)}</select></label>
            <div className="sb-section-title"><h2>{c.shots}</h2><button disabled={board.shots.length >= 100} onClick={() => edit({ shots: [...board.shots, newShot()] })}><Plus size={16} />{c.addShot}</button></div>
            {board.shots.map((shot, index) => <article className="sb-shot" key={shot._key}>
              <div className="sb-shot-top"><span className="sb-shot-index">{String(index + 1).padStart(2, '0')}</span><div className="sb-actions">
                <button aria-label={c.up} title={c.up} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
                <button aria-label={c.down} title={c.down} disabled={index === board.shots.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
                <button aria-label={c.remove} title={c.remove} disabled={board.shots.length === 1} onClick={() => edit({ shots: board.shots.filter((item) => item._key !== shot._key) })}><Trash size={16} /></button>
              </div></div>
              <div className="sb-two-fields"><label>{c.shotTitle}<input maxLength={240} value={shot.title} onChange={(e) => editShot(shot._key, { title: e.target.value })} /></label><label>{c.duration}<input type="number" min="0.2" max="1800" step="0.1" value={shot.duration} onChange={(e) => editShot(shot._key, { duration: e.target.value })} /></label></div>
              <label>{c.visualBrief}<textarea rows={2} maxLength={4000} value={shot.visualBrief} onChange={(e) => editShot(shot._key, { visualBrief: e.target.value })} /></label>
              <label>{c.narration}<textarea rows={2} maxLength={4000} value={shot.narration} onChange={(e) => editShot(shot._key, { narration: e.target.value })} /></label>
              <label>{c.assetHint}<input maxLength={240} value={shot.assetHint} onChange={(e) => editShot(shot._key, { assetHint: e.target.value })} /></label>
            </article>)}
          </fieldset>
          {board.reviewNote && <blockquote className="sb-review-note">{board.reviewNote}</blockquote>}
          {board.status === 'inReview' && <label>{c.note}<textarea disabled={busy} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
          {['inReview', 'approved'].includes(board.status) && <p className="sb-hint">{c.approveHint}</p>}
          {board.approvedRelease && <p className="sb-hint">{c.release}: {board.approvedRelease._ref}</p>}
          <footer className="sb-footer">
            {editable && <><button className="sb-primary" disabled={busy || (!dirty && Boolean(board._rev))} onClick={save}>{c.save}</button><button disabled={busy || dirty || !board._rev} onClick={() => transition('inReview')}>{c.submit}</button></>}
            {board.status === 'inReview' && <><button className="sb-primary" disabled={busy || dirty} onClick={() => transition('approved')}>{c.approve}</button><button disabled={busy || dirty || !note.trim()} onClick={() => transition('changesRequested')}>{c.requestChanges}</button></>}
            {board.status === 'approved' && <button disabled={busy} onClick={() => transition('draft')}>{c.revise}</button>}
          </footer>
        </>}
      </section>
    </div>
  </main>;
}
