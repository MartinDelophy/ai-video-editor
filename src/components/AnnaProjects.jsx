import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { File, X } from "@phosphor-icons/react";
import { getAnnaProjectsCopy } from "../i18nAnnaProjects.js";
import "./AnnaProjects.css";

export function AnnaProjects({ session, language, initialMode = "list", onClose }) {
  const copy = getAnnaProjectsCopy(language);
  const dialog = useRef(null);
  const initialSession = useRef(session);
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const refresh = async () => {
    setBusy(true); setError(false);
    try { setProjects(await session.listProjects()); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    let alive = true;
    setBusy(true);
    initialSession.current.listProjects().then((items) => { if (alive) setProjects(items); }, () => { if (alive) setError(true); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; element.close(); };
  }, []); // One read per dialog opening; callbacks use the live session below.
  const run = async (options) => {
    if (busy || !session.canManage) return;
    setBusy(true); setError(false);
    try { if (await session.manageProject(options)) onClose(); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  const disabled = busy || !session.canManage;
  return createPortal(
    <dialog ref={dialog} className="anna-projects" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="anna-projects-title">
      <header><h2 id="anna-projects-title">{mode === "new" ? copy.new : mode === "rename" ? copy.rename : copy.title}</h2><button type="button" aria-label={copy.cancel} disabled={busy} onClick={onClose}><X size={20} /></button></header>
      <p>{recovery ? copy.restoreHint : copy.hint}</p>
      {error ? <p role="alert" className="anna-projects-error">{copy.error}</p> : null}
      {busy ? <p role="status">{copy.loading}</p> : null}
      {mode !== "list" ? <form onSubmit={(event) => { event.preventDefault(); run({ create: mode === "new", rename: mode === "rename", id: session.state.projectId, name: name.trim() }); }}>
        <label>{copy.name}<input autoFocus value={name} maxLength={120} required disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <footer><button type="button" disabled={busy} onClick={() => { setMode("list"); setRecovery(null); }}>{copy.cancel}</button><button className="primary" disabled={disabled || !name.trim()}>{mode === "new" ? copy.create : copy.save}</button></footer>
      </form> : recovery ? <section><strong>{recovery.name || copy.untitled}</strong><footer><button disabled={busy} onClick={() => setRecovery(null)}>{copy.cancel}</button><button className="primary" disabled={disabled} onClick={() => run({ id: recovery.id, previous: true })}>{copy.previous}</button></footer></section> : <>
        <div className="anna-projects-actions"><button className="primary" disabled={busy} onClick={() => { setMode("new"); setName(""); }}>{copy.new}</button><button disabled={busy} onClick={refresh}>{copy.refresh}</button></div>
        <div className="anna-projects-list">{projects.map((project) => <article key={project.id}>
          <File size={25} aria-hidden="true" /><div className="anna-projects-copy"><strong>{project.name || copy.untitled}</strong><time dateTime={project.savedAt}>{new Date(project.savedAt).toLocaleString(language)}</time>{project.id === session.state.projectId ? <small>{copy.current}</small> : null}</div>
          <div className="anna-projects-item-actions">{project.id === session.state.projectId ? <button disabled={disabled} onClick={() => { setMode("rename"); setName(project.name); }}>{copy.rename}</button> : <button disabled={disabled} onClick={() => run({ id: project.id })}>{copy.open}</button>}{project.previous ? <button disabled={disabled} onClick={() => setRecovery(project)}>{copy.previous}</button> : null}</div>
        </article>)}{!projects.length && !busy && !error ? <p>{copy.empty}</p> : null}</div>
      </>}
    </dialog>, document.body,
  );
}
