import { useEffect, useRef, useState } from "react";
import {
  Folder,
  DownloadSimple,
  UploadSimple,
  CloudArrowUp,
  CloudArrowDown,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import { getWorkflowProjectsCopy } from "../i18nWorkflowProjects.js";
import { isAnnaEdition } from "../lib/annaRuntime.js";
import { createWorkflowArchive, readWorkflowArchive } from "../lib/workflowArchive.js";
import {
  storeWorkflowBackup,
  listWorkflowBackups,
  readWorkflowBackup,
} from "../lib/workflowCloud.js";
import "./WorkflowProjectMenu.css";
export function WorkflowProjectMenu({
  kind,
  language,
  disabled,
  getSnapshot,
  beforeSwitch,
  projects,
}) {
  const c = getWorkflowProjectsCopy(language),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [cloud, setCloud] = useState(null);
  const root = useRef(null),
    input = useRef(null),
    job = useRef(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      job.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !root.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", dismiss, true);
    };
  }, [open]);
  const run = async (fn) => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setMessage("");
    try {
      await fn(controller.signal);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted)
        setMessage(
          error.message === "MISSING_MEDIA"
            ? c.missing
            : error.message === "ARCHIVE_LIMIT"
              ? c.limit
              : error.message === "INVALID_WORKFLOW"
                ? c.invalid
                : c.failed,
        );
    } finally {
      if (job.current === controller) job.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const snapshot = async () => {
    const value = await getSnapshot();
    return createWorkflowArchive({ ...value, kind });
  };
  const download = (blob) => {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${kind}.workflow`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (file, signal) => {
    const archive = await readWorkflowArchive(file, kind);
    if (signal.aborted || !mounted.current) return;
    await beforeSwitch?.();
    if (signal.aborted || !mounted.current) return;
    await projects.import(archive);
  };
  const list = async (signal, more = false) => {
    const page = await listWorkflowBackups(kind, {
      cursor: more ? cloud?.nextCursor : undefined,
      signal,
    });
    if (!signal.aborted && mounted.current)
      setCloud({
        files: [
          ...(more ? cloud.files : []),
          ...page.files.filter((f) => !more || !cloud.files.some((p) => p.path === f.path)),
        ],
        nextCursor: page.nextCursor,
      });
  };
  return (
    <div className="workflow-project-menu" ref={root} onPointerDown={(e) => e.stopPropagation()}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <Folder size={17} />
        <span>{c.project}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".workflow,application/zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) run((signal) => importFile(file, signal));
        }}
      />
      {open && (
        <section role="dialog" aria-label={c.project}>
          <header>
            <strong>{c.project}</strong>
            <button aria-label={c.close} onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <p>{c.help}</p>
          <nav>
            <button
              disabled={busy || disabled}
              onClick={() => run(async () => download(await snapshot()))}
            >
              <DownloadSimple size={17} />
              {c.download}
            </button>
            <button disabled={busy || disabled || !projects} onClick={() => input.current.click()}>
              <UploadSimple size={17} />
              {c.import}
            </button>
            {isAnnaEdition && (
              <>
                <button
                  disabled={busy || disabled}
                  onClick={() =>
                    run(async (signal) => {
                      const blob = await snapshot();
                      if (signal.aborted) return;
                      await storeWorkflowBackup(blob, kind, { signal });
                      if (mounted.current && !signal.aborted) {
                        setMessage(c.done);
                        setCloud(null);
                      }
                    })
                  }
                >
                  <CloudArrowUp size={17} />
                  {c.backup}
                </button>
                <button disabled={busy || disabled} onClick={() => run((signal) => list(signal))}>
                  <CloudArrowDown size={17} />
                  {c.backups}
                </button>
              </>
            )}
          </nav>
          {busy && (
            <div role="status">
              <SpinnerGap className="chatcut-spinner" size={16} />
              {c.busy}
            </div>
          )}
          {message && <p role="status">{message}</p>}
          {cloud && (
            <div className="workflow-project-list">
              <strong>{c.backups}</strong>
              {!cloud.files.length && <p>{c.empty}</p>}
              {cloud.files.map((file) => (
                <article key={file.path}>
                  <span>
                    {file.name}
                    <small>
                      {file.savedAt ? new Date(file.savedAt).toLocaleString(language) : ""} ·{" "}
                      {(file.size / 1048576).toFixed(1)} MB
                    </small>
                  </span>
                  <button
                    disabled={busy || !projects}
                    onClick={() =>
                      run(async (signal) =>
                        importFile(await readWorkflowBackup(file, { signal }), signal),
                      )
                    }
                  >
                    {c.restore}
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`${c.download} · ${file.name}`}
                    onClick={() =>
                      run(async (signal) => download(await readWorkflowBackup(file, { signal })))
                    }
                  >
                    <DownloadSimple size={16} />
                  </button>
                </article>
              ))}
              {cloud.nextCursor && (
                <button disabled={busy} onClick={() => run((signal) => list(signal, true))}>
                  {c.more}
                </button>
              )}
            </div>
          )}
          {projects && (
            <div className="workflow-project-list">
              <strong>{c.local}</strong>
              {projects.items.map((item) => (
                <button
                  key={item.id}
                  aria-current={item.id === projects.current ? "true" : undefined}
                  disabled={busy || disabled}
                  onClick={() =>
                    run(async () => {
                      await beforeSwitch?.();
                      if (mounted.current) projects.open(item.id);
                    })
                  }
                >
                  {item.id === projects.original ? c.original : item.name || c.copy}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
