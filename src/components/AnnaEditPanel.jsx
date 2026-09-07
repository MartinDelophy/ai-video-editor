import { useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  FloppyDisk,
  Sparkle,
} from "@phosphor-icons/react";
import "./AnnaEditPanel.css";

const CHECK_NAMES = {
  wasm: "WebAssembly",
  webgpu: "WebGPU",
  indexeddb: "IndexedDB",
  cache: "Cache Storage",
  worker: "Web Worker",
  videoEncoder: "MP4 / H.264",
  serviceWorker: "Service Worker",
  isolation: "SharedArrayBuffer",
};
const ERROR_COPY = {
  ANNA_STALE_PLAN: "stale",
  ANNA_TRACK_LOCKED: "locked",
  ANNA_COMPLEX_TIMING: "complex",
  ANNA_EXPORT_FAILED: "exportFailed",
  ANNA_SOURCE_AUDIO_UNAVAILABLE: "sourceAudioUnavailable",
  host_required: "hostHint",
  auth_required: "authError",
  permission_denied: "permissionError",
  quota_exceeded: "quotaError",
  rate_limited: "quotaError",
  network_error: "networkError",
  timeout: "timeoutError",
  cancelled: "stopHint",
  storage_blocked: "storageError",
  storage_full: "storageError",
  conflict: "conflictError",
  file_changed: "conflictError",
  concurrency_unavailable: "conflictError",
  invalid_file: "invalidFileError",
  invalid_file_response: "invalidFileError",
  invalid_storage_response: "invalidFileError",
  file_is_current_project: "currentFileError",
  file_transfer_failed: "cloudTransferError",
  cloud_unverified: "cloudPending",
  backup_failed: "backupError",
  project_changed: "changedError",
};
const seconds = (value) => `${Number(value).toFixed(2)}s`;
const safeCode = (value) => /^[a-zA-Z0-9_.-]{1,80}$/.test(String(value || "")) ? value : "";
const draftErrorCopy = (code) => ({ quota: "storageError", unsupported: "storageError", blocked: "storageError", changed: "changedError", invalid: "invalidFileError", import: "invalidFileError", missing: "noDraft" })[code] || "retryHint";
const draftStatusCopy = (status) => ({ clearing: "deleting", cleared: "cleared", downloading: "downloadStarted", downloaded: "downloadStarted", backingUp: "backingUp", backedUp: "backedUp" })[status] || status;
const safeDiagnosticCode = (value) => typeof value === "string" && /^[a-z0-9_.-]{1,80}$/i.test(value) ? value : "";

export function AnnaEditPanel({ anna }) {
  const { t, connection, job, review, exported, draft } = anna;
  const [confirm, setConfirm] = useState(null);
  const busy = Boolean(job || anna.exporting || draft.busy);
  const connected = connection.status === "connected";
  const confirmDelete = async () => {
    const done = confirm?.kind === "cloud" ? await anna.removeCloudFile(confirm.file)
      : confirm?.kind === "backups" ? await draft.clearBackup() : await draft.clear();
    if (done) setConfirm(null);
  };
  return (
    <div className="auto-edit-panel anna-edit-panel">
      <section className="auto-edit-intro">
        <Sparkle size={28} weight="duotone" />
        <div>
          <strong>{t("title")}</strong>
          <span>{t("hint")}</span>
        </div>
      </section>
      <section className="anna-connection">
        <span className={connected ? "is-ready" : ""}>
          {connected ? <CheckCircle size={15} /> : null}
          {t(connected ? "connected" : "disconnected")}
        </span>
        {!connected ? (
          <button className="panel-secondary" type="button" disabled={busy} onClick={anna.connect}>
            {t("connect")}
          </button>
        ) : null}
        {!connected ? <p>{t("hostHint")}</p> : null}
      </section>
      <label className="anna-prompt">
        <span>{t("instruction")}</span>
        <textarea
          maxLength={4000}
          rows={4}
          value={anna.instruction}
          onChange={(event) => anna.setInstruction(event.target.value)}
          placeholder={t("placeholder")}
          disabled={job === "planning"}
        />
      </label>
      <p className="anna-hint">{t("privacy")}</p>
      <p className="anna-hint">{t("scope")}</p>
      <button
        className="auto-edit-generate"
        type="button"
        disabled={busy || !connected || !anna.hasVisual || !anna.instruction.trim()}
        onClick={anna.generate}
      >
        <Sparkle size={17} weight="fill" />
        <strong>{t(anna.hasVisual ? "generate" : "needsMedia")}</strong>
      </button>
      {job ? (
        <div className="anna-job" role="status">
          <CircleNotch size={16} className="anna-spinner" />
          <span>
            {t(
              job === "planning"
                ? "waiting"
                : job === "checking"
                  ? "checking"
                  : job === "restoring"
                    ? "restoring"
                    : job === "saving"
                      ? "saving"
                      : job === "rendering"
                        ? "render"
                        : job === "listing-files" ? "listingFiles"
                          : job === "deleting-file" ? "deleting"
                            : job === "repair-reference" ? "saving" : "connect",
            )}
          </span>
          {job === "planning" ? (
            <button type="button" className="panel-secondary" onClick={anna.stop}>
              {t("stop")}
            </button>
          ) : null}
        </div>
      ) : null}
      {anna.error ? (
        <div className="anna-error" role="alert">
          <p>{t(ERROR_COPY[anna.error.code] || "retryHint")} <code>{safeCode(anna.error.code)}</code></p>
          {anna.error.details?.fileState === "unconfirmed" && anna.error.details?.stage?.startsWith("delete") ? <p>{t("deleteUnconfirmed")}</p> : null}
          <div className="anna-actions">
            {["auth_required", "host_closed", "host_required"].includes(anna.error.code) ? <button type="button" className="panel-secondary" disabled={busy} onClick={anna.connect}>{t("connect")}</button> : null}
            {anna.retry && !["cloud_unverified", "quota_exceeded", "permission_denied", "file_is_current_project"].includes(anna.error.code) ? <button type="button" className="panel-secondary" disabled={busy} onClick={anna.retry}>{t("retry")}</button> : null}
          </div>
        </div>
      ) : null}
      {anna.notice ? (
        <p className="anna-notice" role="status">
          {t(anna.notice)}
        </p>
      ) : null}
      {anna.savedFile?.kind === "projects" ? <section className="anna-section anna-recovery" role="status">
        <p>{t("referenceRecoveryHint")}</p><strong>{anna.savedFile.name}</strong>
        <button type="button" className="panel-secondary" disabled={busy || !connected} onClick={() => anna.recoverReference()}>{t("recoverReference")}</button>
      </section> : null}
      {review ? (
        <section className="anna-review">
          <h3>{t("review")}</h3>
          <strong>{review.title}</strong>
          <p>{review.summary}</p>
          <div className="anna-duration">
            <span>
              {t("before")} {seconds(review.beforeDuration)}
            </span>
            <span>
              {t("after")} {seconds(review.duration)}
            </span>
          </div>
          <ol>
            {review.rows.map((row) => (
              <li key={row.id} className={row.changed ? "is-changed" : ""}>
                <strong>{row.name}</strong>
                <span>
                  {row.beforeIndex + 1} → {row.index + 1} · {seconds(row.beforeDuration)} →{" "}
                  {seconds(row.duration)}
                </span>
                <small>
                  {seconds(row.start)} — {seconds(row.start + row.duration)}
                </small>
              </li>
            ))}
          </ol>
          {anna.stale ? <p className="anna-error">{t("stale")}</p> : null}
          <button
            type="button"
            className="auto-edit-generate"
            disabled={busy || anna.stale}
            onClick={anna.apply}
          >
            <CheckCircle size={17} />
            <strong>{t("apply")}</strong>
          </button>
        </section>
      ) : null}
      <section className="anna-section">
        <h3>{t("localDraft")}</h3>
        <p>{t("draftHint")}</p>
        <div className="anna-actions">
          <button
            type="button"
            className="panel-secondary"
            disabled={busy || !draft.canSave}
            onClick={draft.save}
          >
            <FloppyDisk size={15} />
            {t("save")}
          </button>
          <button
            type="button"
            className="panel-secondary"
            disabled={busy || !draft.canRestore}
            onClick={draft.restore}
          >
            <ArrowClockwise size={15} />
            {t("restore")}
          </button>
          <button type="button" className="panel-secondary" disabled={busy || !draft.canDownload} onClick={draft.download}>{t("downloadDraft")}</button>
          <button type="button" className="panel-secondary" disabled={busy || !draft.canClear} onClick={() => setConfirm({ kind: "draft" })}>{t("clearDraft")}</button>
        </div>
        <p role="status">
          {t(
            draft.state.status === "error"
              ? draftErrorCopy(draft.state.errorCode)
              : ["checking", "saving", "saved", "restoring", "restored", "clearing", "cleared", "downloading", "downloaded", "backingUp", "backedUp"].includes(draft.state.status)
                ? draftStatusCopy(draft.state.status)
                : draft.available
                  ? "saved"
                  : "noDraft",
          )}
          {draft.state.savedAt ? ` · ${new Date(draft.state.savedAt).toLocaleString()}` : ""}
          {draft.state.errorCode ? <code> {safeCode(draft.state.errorCode)}</code> : null}
        </p>
        <p>{t("backupHint")}</p>
        {draft.backups?.map((backup) => <div className="anna-file-row" key={backup.id}>
          <small>{new Date(backup.savedAt).toLocaleString()} · {(backup.bytes / 1048576).toFixed(2)} MiB</small>
          <div className="anna-actions">
            <button type="button" className="panel-secondary" disabled={busy || !draft.canRecover} onClick={() => draft.recoverPrevious(backup.id)}>{t("recoverPrevious")}</button>
            <button type="button" className="panel-secondary" disabled={busy} onClick={() => draft.downloadBackup(backup.id)}>{t("downloadBackup")}</button>
          </div>
        </div>)}
        {draft.backupAvailable ? <button type="button" className="panel-secondary" disabled={busy || !draft.canClearBackup} onClick={() => setConfirm({ kind: "backups" })}>{t("clearBackups")}</button> : null}
        <details>
          <summary>{t("cloudSave")}</summary>
          <p>{t("cloudHint")}</p>
          {!anna.cloudTransfersAvailable ? <p className="anna-capability-notice" role="status">{t("cloudPending")}</p> : null}
          <div className="anna-actions">
            <button
              type="button"
              className="panel-secondary"
              disabled={busy || !connected || !anna.hasVisual || !anna.cloudTransfersAvailable}
              onClick={anna.saveCloud}
            >
              {t("cloudSave")}
            </button>
            <button
              type="button"
              className="panel-secondary"
              disabled={busy || !connected || !anna.cloudTransfersAvailable}
              onClick={anna.restoreCloud}
            >
              {t("cloudRestore")}
            </button>
          </div>
        </details>
        <details>
          <summary>{t("cloudFiles")}</summary>
          <p>{t("cloudFilesHint")}</p>
          <button type="button" className="panel-secondary" disabled={busy || !connected} onClick={() => anna.refreshFiles()}>{t("refreshFiles")}</button>
          {anna.cloudFiles.loaded && !anna.cloudFiles.files.length ? <p>{t("noCloudFiles")}</p> : null}
          {anna.cloudFiles.files.map((file) => <div className="anna-file-row" key={file.path}>
            <strong>{file.name}</strong>
            <small>{t(file.kind === "projects" ? "projectFile" : "exportFile")} · {(file.size / 1048576).toFixed(2)} MiB{file.savedAt ? ` · ${new Date(file.savedAt).toLocaleString()}` : ""}</small>
            <div className="anna-actions">
              {file.kind === "projects" ? <button type="button" className="panel-secondary" disabled={busy || !connected} onClick={() => anna.recoverReference(file)}>{t("recoverReference")}</button> : null}
              <button type="button" className="panel-secondary" disabled={busy || !connected} onClick={() => setConfirm({ kind: "cloud", file })}>{t("delete")}</button>
            </div>
          </div>)}
          {anna.cloudFiles.nextCursor ? <button type="button" className="panel-secondary" disabled={busy || !connected} onClick={() => anna.refreshFiles(true)}>{t("loadMore")}</button> : null}
        </details>
        {confirm ? <section className="anna-delete-confirm" role="group" aria-label={t("confirmDelete")}>
          <strong>{t("confirmDelete")}{confirm.file ? ` · ${confirm.file.name}` : ""}</strong>
          <p>{t(confirm.kind === "cloud" ? "cloudDeleteHint" : confirm.kind === "backups" ? "backupDeleteHint" : "draftDeleteHint")}</p>
          <div className="anna-actions"><button type="button" className="panel-secondary" disabled={busy} onClick={() => setConfirm(null)}>{t("cancel")}</button><button type="button" className="panel-secondary" disabled={busy} onClick={confirmDelete}>{t("delete")}</button></div>
        </section> : null}
      </section>
      <section className="anna-section">
        <h3>{t("render")}</h3>
        <p>{t("exportHint")}</p>
        <button
          type="button"
          className="panel-secondary"
          disabled={busy || !anna.hasVisual}
          onClick={() => anna.render()}
        >
          {t("render")}
        </button>
        {exported ? (
          <div className="anna-export">
            <video src={exported.url} controls playsInline preload="metadata" />
            <a href={exported.url} download={exported.name}>
              {t("localDownload")}
            </a>
            {exported.attachments?.map((item) => (
              <a key={item.name} href={item.url} download={item.name}>
                {item.name}
              </a>
            ))}
            <details>
              <summary>{t("hostDownload")}</summary>
              <p>{t("hostDownloadHint")}</p>
              {!anna.cloudTransfersAvailable ? <p role="status">{t("cloudPending")}</p> : null}
              <button
                type="button"
                className="panel-secondary"
                disabled={busy || !connected || !anna.cloudTransfersAvailable}
                onClick={anna.downloadThroughHost}
              >
                {t("hostDownload")}
              </button>
            </details>
          </div>
        ) : null}
      </section>
      <details className="anna-section anna-compatibility">
        <summary>{t("compatibility")}</summary>
        <button type="button" className="panel-secondary" disabled={busy} onClick={anna.check}>
          {t("check")}
        </button>
        {anna.report ? (
          <ul>
            {anna.report.checks.map((check) => (
              <li key={check.id}>
                <span>{CHECK_NAMES[check.id] || check.id}</span>
                <strong className={`is-${check.status}`}>
                  {t(check.status)}
                  {safeDiagnosticCode(check.code) ? <> <code>{safeDiagnosticCode(check.code)}</code></> : null}
                </strong>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  );
}
