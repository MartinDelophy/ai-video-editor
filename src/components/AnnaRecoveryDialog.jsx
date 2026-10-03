import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CircleNotch, Info, X } from "@phosphor-icons/react";
import { AnnaProjectCover } from "./AnnaProjectCover.jsx";
import { getAnnaProjectsCopy } from "../i18nAnnaProjects.js";
import { getAnnaRecoveryCopy } from "../i18nAnnaRecovery.js";
import "./AnnaRecoveryDialog.css";

export function AnnaRecoveryDialog({ session, language }) {
  const dialog = useRef(null);
  const restoreButton = useRef(null);
  const id = useId();
  const { state } = session;
  const project = state.recovery;
  const copy = getAnnaRecoveryCopy(language);
  const failed = ["error", "conflict"].includes(state.status);
  const busy = Boolean(state.action) || (!failed && ["download", "prepare"].includes(state.recoveryPhase));
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    restoreButton.current?.focus({ preventScroll: true });
    return () => { element.close(); if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, []);
  const transfer = state.recoveryTransfer;
  const preparing = state.recoveryPhase === "prepare";
  const progress = preparing ? state.recoveryImport : transfer;
  const loaded = preparing ? progress?.completed : progress?.loaded;
  const total = progress?.total;
  const percent = total > 0 && Number.isFinite(loaded) ? Math.min(100, Math.max(0, Math.floor(100 * loaded / total))) : null;
  const label = preparing ? copy.prepare : transfer ? copy.download : copy.checking;
  const byteUnit = transfer?.total < 1048576 ? { divisor: 1024, label: "KB" } : { divisor: 1048576, label: "MB" };
  const amount = !preparing && transfer?.total > 0 ? `${(transfer.loaded / byteUnit.divisor).toFixed(1)} / ${(transfer.total / byteUnit.divisor).toFixed(1)} ${byteUnit.label}` : "";
  const locale = language === "zh" ? "zh-CN" : language;
  const date = new Date(project.savedAt);
  const savedAt = Number.isFinite(date.getTime()) ? date.toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return createPortal(<dialog ref={dialog} className="anna-recovery" lang={language} aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`}
    onCancel={event => { event.preventDefault(); if (!busy) session.startNew(); else if (state.canCancelRecovery) session.cancelRecovery(); }}
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <button className="anna-recovery-close" type="button" aria-label={copy.new} title={copy.new} disabled={busy} onClick={() => session.startNew()}><X size={22} /></button>
    <div className="anna-recovery-layout">
      <section className="anna-recovery-project" aria-label={project.name || getAnnaProjectsCopy(language).untitled}>
        <AnnaProjectCover preview={project.preview} className="anna-recovery-cover" />
        <h3 title={project.name}>{project.name || getAnnaProjectsCopy(language).untitled}</h3>
        {savedAt ? <p>{copy.saved}<span aria-hidden="true"> · </span><time dateTime={project.savedAt}>{savedAt}</time></p> : null}
      </section>
      <section className="anna-recovery-decision">
        <h2 id={`${id}-title`}>{copy.title}</h2>
        <p id={`${id}-hint`}>{copy.hint}</p>
        {busy ? <div className="anna-recovery-progress" aria-live="polite" aria-busy="true">
          <div className="anna-recovery-progress-heading"><CircleNotch size={18} className="anna-recovery-spinner" aria-hidden="true" /><span>{label}</span>{percent !== null ? <strong>{percent}%</strong> : null}</div>
          <div className={`anna-recovery-rail${percent === null ? " is-indeterminate" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}><span style={percent !== null ? { width: `${percent}%` } : undefined} /></div>
          {amount ? <small>{amount}</small> : null}
          {state.canCancelRecovery ? <button type="button" className="anna-recovery-cancel" onClick={() => session.cancelRecovery()}>{copy.cancel}</button> : null}
        </div> : <>
          {failed ? <p className="anna-recovery-error" role="alert">{state.status === "conflict" ? copy.conflict : copy.error}</p> : null}
          <div className="anna-recovery-actions">
            <button ref={restoreButton} type="button" className="anna-recovery-primary" onClick={() => session.recoverStartup()}>{failed ? copy.retry : copy.restore}</button>
            <button type="button" className="anna-recovery-secondary" onClick={() => session.startNew()}>{copy.new}</button>
          </div>
        </>}
        <p className="anna-recovery-kept"><Info size={17} aria-hidden="true" /><span>{copy.kept}</span></p>
      </section>
    </div>
  </dialog>, document.body);
}
