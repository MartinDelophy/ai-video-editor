import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  FloppyDisk,
  WarningCircle,
} from "@phosphor-icons/react";
import { getAnnaSessionCopy } from "../i18nAnnaSession.js";
import "./AnnaAutosaveStatus.css";

const STATUS_ICONS = {
  waiting: Clock,
  checking: CircleNotch,
  restoring: CircleNotch,
  idle: FloppyDisk,
  saving: CircleNotch,
  saved: CheckCircle,
  error: WarningCircle,
  conflict: WarningCircle,
};

function savedTime(savedAt) {
  if (typeof savedAt !== "string" || !savedAt) return "";
  const date = new Date(savedAt);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function AnnaAutosaveStatus({ session, language }) {
  if (!session?.state) return null;
  const { state } = session;
  const status = Object.hasOwn(STATUS_ICONS, state.status) ? state.status : "waiting";
  const copy = getAnnaSessionCopy(language);
  const storage = state.storage === "cloud" ? "cloud" : "local";
  const statusCopy = storage === "cloud" ? copy.cloud : copy;
  const StatusIcon = STATUS_ICONS[status];
  const busy = status === "checking" || status === "restoring" || status === "saving";
  const time = status === "saved" ? savedTime(state.savedAt) : "";
  const errorReason = status === "error" && Object.hasOwn(statusCopy.errorReasons, state.errorCode)
    ? statusCopy.errorReasons[state.errorCode]
    : "";
  const label = errorReason || statusCopy[status];
  const migrationWarning = state.migrationErrorCode ? copy.cloud.migrationWarning : "";
  const description = `${statusCopy[status]}${time ? ` · ${time}` : ""}${errorReason ? `\n${errorReason}` : ""}\n${statusCopy.scope}${migrationWarning ? `\n${migrationWarning}` : ""}`;

  return (
    <div
      className="anna-session-status"
      data-state={status}
      data-storage={storage}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      title={description}
    >
      <span className="anna-session-status__summary">
        <StatusIcon
          className={`anna-session-status__icon${busy ? " is-spinning" : ""}`}
          size={14}
          weight={status === "saved" ? "fill" : "regular"}
          aria-hidden="true"
        />
        <span className="anna-session-status__label">{label}</span>
        {time ? <time className="anna-session-status__time" dateTime={state.savedAt}>{time}</time> : null}
      </span>
      <span className="anna-session-status__scope">{statusCopy.scope}</span>
      {migrationWarning ? (
        <span className="anna-session-status__migration" style={{ flexBasis: "100%" }} role="note">
          {migrationWarning}
        </span>
      ) : null}
      {status === "error" ? (
        <button
          type="button"
          className="anna-session-status__action"
          disabled={typeof session.retry !== "function"}
          onClick={() => session.retry()}
          title={copy.retry}
        >
          <ArrowClockwise size={13} aria-hidden="true" />
          {copy.retry}
        </button>
      ) : null}
      {status === "conflict" ? (
        <span className="anna-session-status__actions">
          <button
            type="button"
            className="anna-session-status__action"
            disabled={typeof session.restore !== "function"}
            onClick={() => session.restore()}
            title={copy.restore}
          >
            <ArrowCounterClockwise size={13} aria-hidden="true" />
            {copy.restore}
          </button>
          <button
            type="button"
            className="anna-session-status__action"
            disabled={typeof session.keepCurrent !== "function"}
            onClick={() => session.keepCurrent()}
            title={copy.keepCurrent}
          >
            <Check size={13} aria-hidden="true" />
            {copy.keepCurrent}
          </button>
        </span>
      ) : null}
    </div>
  );
}
