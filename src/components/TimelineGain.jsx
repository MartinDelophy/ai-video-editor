import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./TimelineGain.css";

const MIN_DB = -60;
const MAX_DB = 20 * Math.log10(4);
const toDb = (gain) => gain > 0 ? Math.max(MIN_DB, Math.min(MAX_DB, 20 * Math.log10(gain))) : MIN_DB;
const toGain = (db) => db <= MIN_DB ? 0 : Math.min(4, 10 ** (db / 20));

// Edits the existing linear gain, shared by project persistence, preview and export.
export function TimelineGain({ volume = 1, disabled, onChange, t, compact = false }) {
  const drag = useRef(null);
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const locate = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchor({ x: Math.max(40, Math.min(window.innerWidth - 40, event.clientX ?? (rect.left + rect.right) / 2)), y: Math.max(8, rect.top - 25) });
  };
  const db = toDb(volume);
  // Reserve most of the rail above unity for boosting; keep attenuation below it.
  const unityPosition = 65;
  const linePosition = db >= 0
    ? unityPosition - (db / MAX_DB) * (unityPosition - (compact ? 8 : 18))
    : unityPosition + (db / MIN_DB) * ((compact ? 80 : 82) - unityPosition);
  const label = volume <= 0 ? "−∞ dB" : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
  const finish = (event, cancel = false) => {
    if (!drag.current || event.pointerId !== drag.current.id) return;
    const original = drag.current.volume;
    drag.current = null;
    setActive(false);
    if (cancel) onChange(original);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <><div
    className={`timeline-gain ${active ? "is-adjusting" : ""}`}
    style={{ top: `${linePosition}%` }}
    role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
    aria-label={t("timelineGain")} aria-valuemin={MIN_DB} aria-valuemax={MAX_DB}
    aria-valuenow={db} aria-valuetext={label} aria-orientation="vertical"
    aria-description={t("timelineGainHint")}
    onPointerEnter={(event) => { locate(event); setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onFocus={(event) => { locate(event); setFocused(true); }}
    onBlur={() => setFocused(false)}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => { event.stopPropagation(); if (!disabled) onChange(1); }}
    onPointerDown={(event) => {
      event.stopPropagation();
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, y: event.clientY, db, volume };
      setActive(true);
    }}
    onPointerMove={(event) => {
      locate(event);
      if (!drag.current || event.pointerId !== drag.current.id || disabled) return;
      event.stopPropagation();
      const next = Math.max(MIN_DB, Math.min(MAX_DB, drag.current.db + (drag.current.y - event.clientY) * 0.25));
      onChange(toGain(Math.abs(next) < 0.2 ? 0 : next));
    }}
    onPointerUp={(event) => finish(event)}
    onPointerCancel={(event) => finish(event, true)}
    onLostPointerCapture={(event) => finish(event, true)}
    onKeyDown={(event) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
      event.stopPropagation(); event.preventDefault();
      if (disabled) return;
      if (event.key === "Escape") {
        if (drag.current) { onChange(drag.current.volume); drag.current = null; setActive(false); }
        return;
      }
      const step = event.shiftKey ? 0.1 : 1;
      onChange(event.key === "Home" ? 1 : event.key === "End" ? 0 : toGain(Math.max(MIN_DB, Math.min(MAX_DB, db + (["ArrowUp", "ArrowRight"].includes(event.key) ? step : -step)))));
    }}
  />{!disabled && (hovered || focused || active) ? createPortal(
    <div className="timeline-gain-tooltip" style={{ left: anchor.x, top: anchor.y }}>{label}</div>, document.body,
  ) : null}</>;
}
