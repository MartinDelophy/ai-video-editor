import { useId, useRef, useState } from "react";

function formatTimecode(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const ticks = Math.round(seconds * 100);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(Math.floor(ticks / 6000))}:${pad(Math.floor(ticks / 100) % 60)}.${pad(ticks % 100)}`;
}

function parseTimecode(text) {
  const parts = text.trim().replace(",", ".").split(":");
  if (parts.length > 3 || !parts.every((part) => /^\d+(?:\.\d*)?$/.test(part))) return NaN;
  if (parts.length > 1 && parts.slice(1).some((part) => Number(part) >= 60)) return NaN;
  if (parts.slice(0, -1).some((part) => part.includes("."))) return NaN;
  return parts.reduce((seconds, part) => seconds * 60 + Number(part), 0);
}

function TimecodeField({ label, value, onChange }) {
  const id = useId();
  const [draft, setDraft] = useState(null);
  return (
    <div className="replacement-time-field">
      <label htmlFor={id}>{label}</label>
      <input type="text" id={id} autoComplete="off" spellCheck={false}
        value={draft ?? formatTimecode(value)}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          onChange(parseTimecode(event.currentTarget.value));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.currentTarget.blur();
        }} />
    </div>
  );
}

export function ReplacementSourceRange({ start, end, max, onChange, copy, equation, valid }) {
  const active = useRef(null);
  const handles = useRef({});
  const fallbackStart = Number.isFinite(start) ? Math.max(0, Math.min(max, start)) : 0;
  const fallbackEnd = Number.isFinite(end) ? Math.max(0, Math.min(max, end)) : max;
  const fraction = (time) => max > 0 ? time / max : 0;
  const readPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return max * Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  };
  const moveHandle = (key, rawValue) => {
    const limit = key === "start" ? fallbackEnd : fallbackStart;
    const value = Math.max(0, Math.min(max, Math.round(rawValue * 100) / 100));
    onChange(key, key === "start" ? Math.min(value, limit) : Math.max(value, limit));
  };

  return (
    <fieldset className="replacement-range">
      <legend>{copy.range}</legend>
      <div className="replacement-trim"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          const time = readPointer(event);
          const handle = event.target.closest("[data-handle]")?.dataset.handle;
          const key = handle || (Math.abs(time - fallbackStart) < Math.abs(time - fallbackEnd) ? "start" : "end");
          active.current = { key, id: event.pointerId, offset: handle ? time - (key === "start" ? fallbackStart : fallbackEnd) : 0 };
          handles.current[key]?.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          if (!handle) moveHandle(key, time);
        }}
        onPointerMove={(event) => {
          if (active.current?.id === event.pointerId) {
            moveHandle(active.current.key, readPointer(event) - active.current.offset);
          }
        }}
        onLostPointerCapture={() => { active.current = null; }}>
        <span className="replacement-trim-rail" aria-hidden="true" />
        <span className="replacement-trim-selection" aria-hidden="true"
          style={{ left: `${fraction(fallbackStart) * 100}%`, right: `${(1 - fraction(Math.max(fallbackStart, fallbackEnd))) * 100}%` }} />
        {[["start", fallbackStart, 0, fallbackEnd], ["end", fallbackEnd, fallbackStart, max]].map(([key, value, min, upper]) => (
          <span key={key} className="replacement-trim-handle" data-handle={key} role="slider" tabIndex={0}
            ref={(element) => { handles.current[key] = element; }} aria-label={copy[key]}
            aria-valuemin={Math.min(min, value)} aria-valuemax={Math.max(upper, value)}
            aria-valuenow={value} aria-valuetext={formatTimecode(value)}
            style={{ left: `${fraction(value) * 100}%` }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.1 : 0.01;
              const targets = {
                ArrowLeft: value - step, ArrowDown: value - step, ArrowRight: value + step, ArrowUp: value + step,
                PageDown: value - 1, PageUp: value + 1, Home: min, End: upper,
              };
              if (!(event.key in targets)) return;
              event.preventDefault();
              moveHandle(key, targets[event.key]);
            }} />
        ))}
      </div>
      <div className="replacement-range-details">
        <TimecodeField label={copy.start} value={start} onChange={(value) => onChange("start", value)} />
        <TimecodeField label={copy.end} value={end} onChange={(value) => onChange("end", value)} />
        <div className="replacement-timing" role="status">
          <span>{copy.fixed}</span>
          {valid ? <b dir="ltr" title={copy.equation}>{equation}</b> : <b className="replacement-range-error">{copy.invalid}</b>}
        </div>
      </div>
    </fieldset>
  );
}
