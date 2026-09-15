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
  const StatusIcon = STATUS_ICONS[status];
  const busy = status === "checking" || status === "restoring" || status === "saving";
  const time = status === "saved" ? savedTime(state.savedAt) : "";
  const description = `${copy[status]}${time ? ` · ${time}` : ""}\n${copy.scope}`;

  return (
    <div
      className="anna-session-status"
      data-state={status}
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
        <span className="anna-session-status__label">{copy[status]}</span>
        {time ? <time className="anna-session-status__time" dateTime={state.savedAt}>{time}</time> : null}
      </span>
      <span className="anna-session-status__scope">{copy.scope}</span>
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
