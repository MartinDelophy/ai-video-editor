import { useId, useLayoutEffect, useRef } from "react";
import { PROJECT_IMPORT_COPY } from "../i18nProjectImport.js";
import "../styles/projectImport.css";

export default function ProjectImportOverlay({ progress, language = "en" }) {
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const id = useId();
  const active = Boolean(progress);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previousFocus = document.activeElement;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      // The full-screen surface and keyboard guard also work without native dialog support.
      dialog.setAttribute("open", "");
    }
    headingRef.current?.focus({ preventScroll: true });
    return () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    };
  }, [active]);

  if (!progress) return null;
  const copy = PROJECT_IMPORT_COPY[language] || PROJECT_IMPORT_COPY.en;
  const phase = ["archive", "visuals", "audio", "ready"].includes(progress.phase) ? progress.phase : "archive";
  const completed = Number.isFinite(progress.completed) ? Math.max(0, progress.completed) : null;
  const total = Number.isFinite(progress.total) && progress.total >= 0 ? progress.total : null;
  const percent = completed !== null && total > 0 ? Math.min(100, Math.max(0, Math.round(completed / total * 100))) : null;
  const isMediaPhase = phase === "visuals" || phase === "audio";
  const amount = phase === "archive" && percent !== null
    ? `${percent}%`
    : isMediaPhase && completed !== null
      ? total !== null ? `${completed} / ${total}` : String(completed)
      : "";
  const amountDescription = isMediaPhase && completed !== null
    ? (total === null ? copy.completed : copy.count).replace("{completed}", String(completed)).replace("{total}", String(total))
    : amount;

  return <dialog
    ref={dialogRef}
    className="project-import-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-hint`}
    onCancel={(event) => event.preventDefault()}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        headingRef.current?.focus({ preventScroll: true });
      }
    }}
    onKeyUp={(event) => event.stopPropagation()}
  >
    <div className="project-import-card">
      <h2 ref={headingRef} id={`${id}-title`} tabIndex={-1}>{copy.title}</h2>
      {progress.fileName ? <p className="project-import-filename" title={progress.fileName}>{progress.fileName}</p> : null}
      <div className="project-import-status" role="status" aria-live="polite" aria-atomic="true">
        <span className="project-import-spinner" aria-hidden="true" />
        <span className="project-import-phase">{copy[phase]}</span>
        {amount ? <strong className="project-import-amount" aria-label={amountDescription}>{amount}</strong> : null}
      </div>
      <div
        className={`project-import-progress${percent === null ? " is-indeterminate" : ""}`}
        role="progressbar"
        aria-label={copy[phase]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={amountDescription || undefined}
      >
        <span style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <p id={`${id}-hint`} className="project-import-hint">{copy.hint}</p>
    </div>
  </dialog>;
}
