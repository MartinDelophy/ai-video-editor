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

function keyTarget(event, value, min, max) {
  const step = event.shiftKey ? 0.1 : 0.01;
  const targets = {
    ArrowLeft: value - step, ArrowDown: value - step, ArrowRight: value + step, ArrowUp: value + step,
    PageDown: value - 1, PageUp: value + 1, Home: min, End: max,
  };
  if (!Object.hasOwn(targets, event.key)) return undefined;
  event.preventDefault();
  return targets[event.key];
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
  const canMoveRange = start >= 0 && end <= max && end > start;
  const latestStart = max - (fallbackEnd - fallbackStart);
  const fraction = (time) => max > 0 ? time / max : 0;
  const readPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return max * (event.clientX - rect.left) / rect.width;
  };
  const changeEdge = (key, value) => onChange({ start, end, [key]: value }, value);
  const moveRange = (originStart, originEnd, distance) => {
    const delta = Math.max(-originStart, Math.min(max - originEnd, distance));
    const nextStart = originStart + delta;
    onChange({ start: nextStart, end: Math.min(max, originEnd + delta) }, nextStart);
  };
  const moveHandle = (key, rawValue) => {
    const min = key === "start" ? 0 : fallbackStart;
    const upper = key === "start" ? fallbackEnd : max;
    const value = rawValue <= min ? min : rawValue >= upper ? upper : Math.round(rawValue * 100) / 100;
    changeEdge(key, Math.max(min, Math.min(upper, value)));
  };

  return (
    <fieldset className="replacement-range">
      <legend>{copy.range}</legend>
      <div className="replacement-trim"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          const time = readPointer(event);
          const hitHandle = Boolean(event.target.closest("[data-handle]"));
          const inside = canMoveRange && time > start && time < end;
          // Keep the center reachable when the handles' hit areas overlap.
          const inCenter = inside && Math.min(time - start, end - time) >= (end - start) / 3;
          const moveSelection = inside && (!hitHandle || inCenter);
          const key = moveSelection ? "range"
            : Math.abs(time - fallbackStart) < Math.abs(time - fallbackEnd) ? "start" : "end";
          if (moveSelection) {
            active.current = { key, id: event.pointerId, anchor: time, start, end };
          } else {
            const edge = key === "start" ? fallbackStart : fallbackEnd;
            active.current = { key, id: event.pointerId, offset: hitHandle ? time - edge : 0 };
          }
          handles.current[key]?.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          if (!moveSelection && !hitHandle) moveHandle(key, time);
        }}
        onPointerMove={(event) => {
          const drag = active.current;
          if (drag?.id !== event.pointerId) return;
          const time = readPointer(event);
          if (drag.key === "range") {
            moveRange(drag.start, drag.end, Math.round((time - drag.anchor) * 100) / 100);
          } else {
            moveHandle(drag.key, time - drag.offset);
          }
        }}
        onLostPointerCapture={() => { active.current = null; }}>
        <span className="replacement-trim-rail" aria-hidden="true" />
        <span className="replacement-trim-selection" ref={(element) => { handles.current.range = element; }}
          role={canMoveRange ? "slider" : undefined} tabIndex={canMoveRange ? 0 : undefined}
          aria-label={canMoveRange ? copy.range : undefined} aria-hidden={!canMoveRange || undefined}
          aria-valuemin={canMoveRange ? 0 : undefined} aria-valuemax={canMoveRange ? latestStart : undefined}
          aria-valuenow={canMoveRange ? start : undefined}
          aria-valuetext={canMoveRange ? `${formatTimecode(start)} – ${formatTimecode(end)}` : undefined}
          style={{ left: `${fraction(fallbackStart) * 100}%`, right: `${(1 - fraction(Math.max(fallbackStart, fallbackEnd))) * 100}%` }}
          onKeyDown={(event) => {
            if (!canMoveRange) return;
            const target = keyTarget(event, start, 0, latestStart);
            if (target !== undefined) moveRange(start, end, target - start);
          }} />
        {[["start", fallbackStart, 0, fallbackEnd], ["end", fallbackEnd, fallbackStart, max]].map(([key, value, min, upper]) => (
          <span key={key} className="replacement-trim-handle" data-handle={key} role="slider" tabIndex={0}
            ref={(element) => { handles.current[key] = element; }} aria-label={copy[key]}
            aria-valuemin={Math.min(min, value)} aria-valuemax={Math.max(upper, value)}
            aria-valuenow={value} aria-valuetext={formatTimecode(value)}
            style={{ left: `${fraction(value) * 100}%` }}
            onKeyDown={(event) => {
              const target = keyTarget(event, value, min, upper);
              if (target !== undefined) moveHandle(key, target);
            }} />
        ))}
      </div>
      <div className="replacement-range-details">
        <TimecodeField label={copy.start} value={start} onChange={(value) => changeEdge("start", value)} />
        <TimecodeField label={copy.end} value={end} onChange={(value) => changeEdge("end", value)} />
        <div className="replacement-timing" role="status">
          <span>{copy.fixed}</span>
          {valid ? <b dir="ltr" title={copy.equation}>{equation}</b> : <b className="replacement-range-error">{copy.invalid}</b>}
        </div>
      </div>
    </fieldset>
  );
}
