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
  host_required: "hostHint",
};
const seconds = (value) => `${Number(value).toFixed(2)}s`;
const safeDiagnosticCode = (value) => typeof value === "string" && /^[a-z0-9_.-]{1,80}$/i.test(value) ? value : "";

export function AnnaEditPanel({ anna }) {
  const { t, connection, job, review, exported, draft } = anna;
  const busy = Boolean(
    job || anna.exporting || ["saving", "restoring", "checking"].includes(draft.state.status),
  );
  const connected = connection.status === "connected";
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
                        : "connect",
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
        <p className="anna-error" role="alert">
          {t(ERROR_COPY[anna.error.code] || "failed")} <code>{anna.error.code}</code>
        </p>
      ) : null}
      {anna.notice ? (
        <p className="anna-notice" role="status">
          {t(anna.notice)}
        </p>
      ) : null}
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
        </div>
        <p role="status">
          {t(
            draft.state.status === "error"
              ? "failed"
              : ["saving", "saved", "restoring", "restored"].includes(draft.state.status)
                ? draft.state.status
                : draft.available
                  ? "saved"
                  : "noDraft",
          )}
          {draft.state.savedAt ? ` · ${new Date(draft.state.savedAt).toLocaleString()}` : ""}
          {draft.state.errorCode ? <code> {draft.state.errorCode}</code> : null}
        </p>
        <details>
          <summary>{t("cloudSave")}</summary>
          <p>{t("cloudHint")}</p>
          <div className="anna-actions">
            <button
              type="button"
              className="panel-secondary"
              disabled={busy || !connected || !anna.hasVisual}
              onClick={anna.saveCloud}
            >
              {t("cloudSave")}
            </button>
            <button
              type="button"
              className="panel-secondary"
              disabled={busy || !connected}
              onClick={anna.restoreCloud}
            >
              {t("cloudRestore")}
            </button>
          </div>
        </details>
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
              <button
                type="button"
                className="panel-secondary"
                disabled={busy || !connected}
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
