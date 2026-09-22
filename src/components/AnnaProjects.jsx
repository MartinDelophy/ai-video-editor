import { readAnnaFile } from "../lib/annaRuntime.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleNotch, File, Trash, X } from "@phosphor-icons/react";
import { getAnnaProjectsCopy } from "../i18nAnnaProjects.js";
import "./AnnaProjects.css";
import { getAnnaSessionCopy } from "../i18nAnnaSession.js";

function ProjectCover({ preview }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true, objectUrl = "";
    setUrl("");
    if (preview) readAnnaFile({ path: preview.path, expectedFile: preview }).then(blob => {
      if (!alive || blob.size > 32768) return;
      objectUrl = URL.createObjectURL(new Blob([blob], { type: "image/jpeg" }));
      setUrl(objectUrl);
    }).catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [preview]);
  return <span className="anna-project-cover">{url ? <img src={url} alt="" onError={() => setUrl("")} /> : <File size={28} aria-hidden="true" />}</span>;
}

export function AnnaProjects({ session, language, initialMode = "list", onClose }) {
  const copy = getAnnaProjectsCopy(language);
  const dialog = useRef(null);
  const initialSession = useRef(session);
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState(null);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState(null);
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
    setBusy(true); setError(false); setOperation(options);
    try { if (await session.manageProject(options)) {
      if (options.remove) { setProjects(await session.listProjects()); setDeleting(null); }
      else onClose();
    } }
    catch { setError(true); }
    finally { setBusy(false); setOperation(null); }
  };
  const sessionCopy = getAnnaSessionCopy(language);
  const statusCopy = session.state.storage === "cloud" ? sessionCopy.cloud : sessionCopy;
  const loadingLabel = operation ? statusCopy[session.state.status] && ["checking", "saving", "restoring"].includes(session.state.status) ? statusCopy[session.state.status] : copy.loading : copy.loading;
  const spinner = <CircleNotch className="anna-projects-spinner" size={16} aria-hidden="true" />;
  const disabled = busy || !session.canManage;
  return createPortal(
    <dialog ref={dialog} className="anna-projects" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="anna-projects-title">
      <header><h2 id="anna-projects-title">{mode === "new" ? copy.new : mode === "rename" ? copy.rename : copy.title}</h2><button type="button" aria-label={copy.cancel} disabled={busy} onClick={onClose}><X size={20} /></button></header>
      <p>{deleting ? copy.deleteHint : recovery ? copy.restoreHint : copy.hint}</p>
      {error ? <p role="alert" className="anna-projects-error">{copy.error}</p> : null}
      {busy ? <div className="anna-projects-loading" role="status" aria-live="polite"><div>{spinner}<span>{loadingLabel}</span></div><span className="anna-projects-loading-track" aria-hidden="true"><i /></span></div> : null}
      {deleting ? <section><strong>{deleting.name || copy.untitled}</strong><footer><button disabled={busy} onClick={() => setDeleting(null)}>{copy.cancel}</button><button className="danger" disabled={disabled} onClick={() => run({ id: deleting.id, remove: true })}>{busy ? spinner : <Trash size={16} />}{busy ? copy.loading : copy.delete}</button></footer></section> : mode !== "list" ? <form onSubmit={(event) => { event.preventDefault(); run({ create: mode === "new", rename: mode === "rename", id: session.state.projectId, name: name.trim() }); }}>
        <label>{copy.name}<input autoFocus value={name} maxLength={120} required disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        <footer><button type="button" disabled={busy} onClick={() => { setMode("list"); setRecovery(null); }}>{copy.cancel}</button><button className="primary" disabled={disabled || !name.trim()}>{operation ? spinner : null}{operation ? copy.loading : mode === "new" ? copy.create : copy.save}</button></footer>
      </form> : recovery ? <section><strong>{recovery.name || copy.untitled}</strong><footer><button disabled={busy} onClick={() => setRecovery(null)}>{copy.cancel}</button><button className="primary" disabled={disabled} onClick={() => run({ id: recovery.id, previous: true })} aria-busy={Boolean(operation)}>{operation ? spinner : null}{operation ? statusCopy.restoring : copy.previous}</button></footer></section> : <>
        <div className="anna-projects-actions"><button className="primary" disabled={busy} onClick={() => { setMode("new"); setName(""); }}>{copy.new}</button><button disabled={busy} onClick={refresh}>{copy.refresh}</button></div>
        <div className="anna-projects-list" role="region" aria-label={copy.title} tabIndex={0}>{projects.map((project) => <article key={project.id}>
          <button className="anna-project-delete" disabled={disabled || project.id === session.state.projectId} title={project.id === session.state.projectId ? copy.deleteCurrent : copy.delete} aria-label={`${copy.delete}: ${project.name || copy.untitled}${project.id === session.state.projectId ? ` — ${copy.deleteCurrent}` : ""}`} onClick={() => setDeleting(project)}><Trash size={16} /></button>
          <ProjectCover preview={project.preview} /><div className="anna-projects-copy"><strong>{project.name || copy.untitled}</strong><time dateTime={project.savedAt}>{new Date(project.savedAt).toLocaleString(language)}</time>{project.id === session.state.projectId ? <small>{copy.current}</small> : null}</div>
          <div className="anna-projects-item-actions">{project.id === session.state.projectId ? <button disabled={disabled} onClick={() => { setMode("rename"); setName(project.name); }}>{copy.rename}</button> : <button disabled={disabled} onClick={() => run({ id: project.id })}>{operation?.id === project.id ? spinner : null}{operation?.id === project.id ? copy.loading : copy.open}</button>}{project.previous ? <button disabled={disabled} onClick={() => setRecovery(project)}>{copy.previous}</button> : null}</div>
        </article>)}{!projects.length && !busy && !error ? <p>{copy.empty}</p> : null}</div>
      </>}
    </dialog>, document.body,
  );
}
