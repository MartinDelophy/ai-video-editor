import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowsHorizontal,
  BookOpen,
  CaretLeft,
  CaretRight,
  Check,
  CrosshairSimple,
  Flag,
  MagnifyingGlass,
  NotePencil,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import "./TimelineMarkerPanel.css";

const TYPES = [
  { value: "marker", key: "markersTypeMarker", icon: Flag },
  { value: "chapter", key: "markersTypeChapter", icon: BookOpen },
  { value: "range", key: "markersTypeRange", icon: ArrowsHorizontal },
  { value: "note", key: "markersTypeNote", icon: NotePencil },
];
const COLORS = [
  { value: "cyan", key: "markersColorCyan", hex: "#59eadf" },
  { value: "amber", key: "markersColorAmber", hex: "#f0ba62" },
  { value: "violet", key: "markersColorViolet", hex: "#b29bf3" },
  { value: "rose", key: "markersColorRose", hex: "#ef91ad" },
  { value: "green", key: "markersColorGreen", hex: "#83d8a5" },
];
const MAX_TIME = 24 * 60 * 60;

function formatTimestamp(value, compact = false) {
  const milliseconds = Math.round(Math.min(MAX_TIME, Math.max(0, Number(value) || 0)) * 1000);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const fraction = milliseconds % 1000;
  const clock = `${compact && !hours ? "" : `${String(hours).padStart(2, "0")}:`}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return compact && !fraction ? clock : `${clock}.${String(fraction).padStart(3, "0")}`;
}

function parseTimestamp(value) {
  const parts = String(value).trim().replace(",", ".").split(":");
  if (parts.length > 3 || !parts.length) return null;
  if (!parts.every((part, index) => (index === parts.length - 1 ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(part))) return null;
  const numbers = parts.map(Number);
  if (parts.length > 1 && numbers.slice(1).some((part) => part >= 60)) return null;
  const seconds = numbers.reduce((total, part) => total * 60 + part, 0);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_TIME) return null;
  return Math.round(seconds * 1000) / 1000;
}

function makeDraft(marker) {
  if (!marker) return null;
  return {
    id: marker.id,
    type: marker.type,
    title: marker.title || "",
    notes: marker.notes || "",
    time: formatTimestamp(marker.time),
    endTime: formatTimestamp(marker.endTime ?? Math.min(MAX_TIME, marker.time + 5)),
    color: marker.color || "cyan",
  };
}

export function TimelineMarkerPanel({
  t,
  markers = [],
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
  currentTime = 0,
  anchorRef,
}) {
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const timeRef = useRef(null);
  const endTimeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const id = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [position, setPosition] = useState({ left: 12, top: 64 });
  const selected = markers.find((marker) => marker.id === selectedId) || null;
  const selectedSnapshot = selected ? JSON.stringify(makeDraft(selected)) : null;
  const [draft, setDraft] = useState(() => makeDraft(selected));
  const [error, setError] = useState(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    setDraft(selectedSnapshot ? JSON.parse(selectedSnapshot) : null);
    setError(null);
  }, [selectedSnapshot]);

  useEffect(() => {
    const anchor = anchorRef?.current;
    const panel = panelRef.current;
    const updatePosition = () => {
      const rect = anchor?.getBoundingClientRect();
      const width = Math.min(660, window.innerWidth - 24);
      const height = Math.min(456, window.innerHeight - 100);
      setPosition({
        left: Math.max(12, Math.min(rect?.left ?? 24, window.innerWidth - width - 12)),
        top: Math.max(64, Math.min((rect?.top ?? window.innerHeight - 24) - height - 12, window.innerHeight - height - 12)),
      });
    };
    const onOutsidePointer = (event) => {
      if (panel?.contains(event.target) || anchor?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest(".timeline-marker-rail, .timeline-marker-trigger")) return;
      onCloseRef.current?.();
    };
    const onEscape = (event) => {
      const typing = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']");
      const toggleShortcut = event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "m" && !typing;
      if (event.key !== "Escape" && !toggleShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current?.();
    };
    updatePosition();
    searchRef.current?.focus({ preventScroll: true });
    window.addEventListener("resize", updatePosition);
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("pointerdown", onOutsidePointer, true);
      document.removeEventListener("keydown", onEscape, true);
      if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchorRef]);

  const visibleMarkers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return markers.filter((marker) => (filter === "all" || marker.type === filter)
      && (!needle || `${marker.title || ""} ${marker.notes || ""}`.toLocaleLowerCase().includes(needle)));
  }, [markers, query, filter]);
  const selectedIndex = markers.findIndex((marker) => marker.id === selectedId);
  const previousMarker = selectedIndex >= 0
    ? markers[selectedIndex - 1]
    : [...markers].reverse().find((marker) => marker.time < currentTime);
  const nextMarker = selectedIndex >= 0
    ? markers[selectedIndex + 1]
    : markers.find((marker) => marker.time > currentTime);
  const dirty = Boolean(draft && JSON.stringify(draft) !== selectedSnapshot);
  const changeDraft = (patch) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setError(null);
  };
  const save = (event) => {
    event.preventDefault();
    if (!selected || !draft || selected.id !== draft.id) return;
    const time = parseTimestamp(draft.time);
    const endTime = draft.type === "range" ? parseTimestamp(draft.endTime) : null;
    if (time === null || (draft.type === "range" && endTime === null)) {
      setError({ key: "markersInvalidTime", field: time === null ? "time" : "endTime" });
      (time === null ? timeRef : endTimeRef).current?.focus();
      return;
    }
    if (draft.type === "range" && endTime <= time) {
      setError({ key: "markersInvalidRange", field: "endTime" });
      endTimeRef.current?.focus();
      return;
    }
    onUpdate?.(selected.id, {
      type: draft.type,
      title: draft.title.trim(),
      time,
      endTime,
      notes: draft.notes.trim(),
      color: draft.color,
    });
    setDraft({ ...draft, title: draft.title.trim(), notes: draft.notes.trim(), time: formatTimestamp(time), endTime: formatTimestamp(endTime ?? Math.min(MAX_TIME, time + 5)) });
    setError(null);
  };
  const add = (type) => {
    setQuery("");
    setFilter("all");
    onAdd?.(type);
  };
  const select = (marker) => onSelect?.(marker);

  if (typeof document === "undefined") return null;

  return createPortal(
    <section
      ref={panelRef}
      className="timeline-marker-panel"
      style={position}
      role="dialog"
      aria-labelledby={`${id}-heading`}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="timeline-marker-panel-header">
        <div className="timeline-marker-panel-heading">
          <Flag size={20} weight="duotone" aria-hidden="true" />
          <h2 id={`${id}-heading`}>{t("markersTitle")}</h2>
          <span className="timeline-marker-panel-count">{markers.length}</span>
        </div>
        <div className="timeline-marker-panel-navigation">
          <button className="timeline-marker-panel-icon-button" type="button" aria-label={t("markersPrevious")} title={t("markersPrevious")} disabled={!previousMarker} onClick={() => select(previousMarker)}><CaretLeft size={16} /></button>
          <button className="timeline-marker-panel-icon-button" type="button" aria-label={t("markersNext")} title={t("markersNext")} disabled={!nextMarker} onClick={() => select(nextMarker)}><CaretRight size={16} /></button>
          <button className="timeline-marker-panel-icon-button timeline-marker-panel-close" type="button" aria-label={t("markersClose")} onClick={onClose}><X size={18} /></button>
        </div>
      </header>

      <div className="timeline-marker-panel-add" role="group" aria-label={t("markersAdd")}>
        {TYPES.map(({ value, key }) => (
          <button type="button" key={value} aria-label={`${t("markersAdd")} · ${t(key)}`} title={`${t("markersAdd")} · ${t(key)}`} onClick={() => add(value)}>
            <Plus size={14} aria-hidden="true" /><span>{t(key)}</span>
          </button>
        ))}
      </div>

      <div className={`timeline-marker-panel-body${!markers.length ? " is-empty" : ""}`}>
        <div className="timeline-marker-panel-list-column">
          <div className="timeline-marker-panel-list-tools">
            <label className="timeline-marker-panel-search">
              <MagnifyingGlass size={14} aria-hidden="true" />
              <span className="sr-only">{t("markersSearch")}</span>
              <input ref={searchRef} type="search" value={query} placeholder={t("markersSearch")} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("markersTypeLabel")}>
              <option value="all">{t("markersAll")}</option>
              {TYPES.map(({ value, key }) => <option key={value} value={value}>{t(key)}</option>)}
            </select>
          </div>
          <ul className="timeline-marker-panel-list" aria-label={t("markersTitle")}>
            {visibleMarkers.map((marker) => {
              const type = TYPES.find((item) => item.value === marker.type) || TYPES[0];
              const Icon = type.icon;
              const color = COLORS.find((item) => item.value === marker.color) || COLORS[0];
              return (
                <li key={marker.id}>
                  <button
                    className={`timeline-marker-panel-item${marker.id === selectedId ? " is-selected" : ""}`}
                    type="button"
                    style={{ "--marker-color": color.hex }}
                    aria-pressed={marker.id === selectedId}
                    aria-label={`${t("markersGoTo")} · ${marker.title || t(type.key)} · ${formatTimestamp(marker.time)}`}
                    onClick={() => select(marker)}
                  >
                    <Icon size={16} weight={marker.type === "marker" ? "fill" : "duotone"} aria-hidden="true" />
                    <span className="timeline-marker-panel-item-copy">
                      <strong>{marker.title || t(type.key)}</strong>
                      <small>{formatTimestamp(marker.time, true)}{marker.type === "range" ? ` — ${formatTimestamp(marker.endTime, true)}` : ""}</small>
                      {marker.notes ? <span>{marker.notes}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {!visibleMarkers.length ? (
              <li className="timeline-marker-panel-empty">
                <Flag size={27} weight="duotone" aria-hidden="true" />
                <strong>{t(markers.length ? "markersNoResults" : "markersEmpty")}</strong>
                {!markers.length ? <p>{t("markersEmptyHint")}</p> : null}
              </li>
            ) : null}
          </ul>
        </div>

        {selected && draft && draft.id === selected.id ? (
          <form className="timeline-marker-panel-form" onSubmit={save}>
            <div className="timeline-marker-panel-fields">
              <label className="timeline-marker-panel-field">
                <span>{t("markersTitleLabel")}</span>
                <input value={draft.title} maxLength={160} onChange={(event) => changeDraft({ title: event.target.value })} placeholder={t(TYPES.find((type) => type.value === draft.type)?.key || "markersTypeMarker")} />
              </label>
              <div className="timeline-marker-panel-field-row">
                <label className="timeline-marker-panel-field">
                  <span>{t("markersTypeLabel")}</span>
                  <select value={draft.type} onChange={(event) => changeDraft({ type: event.target.value })}>
                    {TYPES.map(({ value, key }) => <option key={value} value={value}>{t(key)}</option>)}
                  </select>
                </label>
                <fieldset className="timeline-marker-panel-field timeline-marker-panel-color-field">
                  <legend>{t("markersColorLabel")}</legend>
                  <div className="timeline-marker-panel-colors">
                    {COLORS.map((color) => (
                      <button
                        className={`timeline-marker-panel-color${draft.color === color.value ? " is-selected" : ""}`}
                        key={color.value}
                        type="button"
                        style={{ "--marker-color": color.hex }}
                        aria-label={t(color.key)}
                        title={t(color.key)}
                        aria-pressed={draft.color === color.value}
                        onClick={() => changeDraft({ color: color.value })}
                      ><span>{draft.color === color.value ? <Check size={12} weight="bold" aria-hidden="true" /> : null}</span></button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="timeline-marker-panel-field-row">
                <div className="timeline-marker-panel-field">
                  <div className="timeline-marker-panel-time-heading">
                    <label htmlFor={`${id}-time`}>{t(draft.type === "range" ? "markersStartLabel" : "markersTimeLabel")}</label>
                    <button className="timeline-marker-panel-playhead" type="button" aria-label={`${t("markersUsePlayhead")} · ${t("markersStartLabel")}`} title={t("markersUsePlayhead")} onClick={() => changeDraft({ time: formatTimestamp(currentTime) })}><CrosshairSimple size={14} /></button>
                  </div>
                  <input ref={timeRef} id={`${id}-time`} className="timeline-marker-panel-time" value={draft.time} inputMode="decimal" aria-describedby={`${id}-time-hint${error?.field === "time" ? ` ${id}-error` : ""}`} aria-invalid={error?.field === "time" || undefined} onChange={(event) => changeDraft({ time: event.target.value })} />
                </div>
                {draft.type === "range" ? (
                  <div className="timeline-marker-panel-field">
                    <div className="timeline-marker-panel-time-heading">
                      <label htmlFor={`${id}-end-time`}>{t("markersEndLabel")}</label>
                      <button className="timeline-marker-panel-playhead" type="button" aria-label={`${t("markersUsePlayhead")} · ${t("markersEndLabel")}`} title={t("markersUsePlayhead")} onClick={() => changeDraft({ endTime: formatTimestamp(currentTime) })}><CrosshairSimple size={14} /></button>
                    </div>
                    <input ref={endTimeRef} id={`${id}-end-time`} className="timeline-marker-panel-time" value={draft.endTime} inputMode="decimal" aria-describedby={`${id}-time-hint${error?.field === "endTime" ? ` ${id}-error` : ""}`} aria-invalid={error?.field === "endTime" || undefined} onChange={(event) => changeDraft({ endTime: event.target.value })} />
                  </div>
                ) : null}
              </div>
              <p id={`${id}-time-hint`} className="timeline-marker-panel-time-hint">{t("markersTimeHint")}</p>
              <label className="timeline-marker-panel-field">
                <span>{t("markersNotesLabel")}</span>
                <textarea rows={3} maxLength={4000} value={draft.notes} onChange={(event) => changeDraft({ notes: event.target.value })} />
              </label>
              {error ? <p id={`${id}-error`} className="timeline-marker-panel-error" role="alert">{t(error.key)}</p> : null}
            </div>
            <footer className="timeline-marker-panel-footer">
              <button className="timeline-marker-panel-delete" type="button" onClick={() => onDelete?.(selected.id)}><Trash size={14} aria-hidden="true" />{t("markersDelete")}</button>
              <button className="timeline-marker-panel-save" type="submit" disabled={!dirty}><Check size={15} weight="bold" aria-hidden="true" />{t("markersSave")}</button>
            </footer>
          </form>
        ) : (
          <div className="timeline-marker-panel-empty timeline-marker-panel-unselected"><NotePencil size={30} weight="duotone" aria-hidden="true" /><p>{t("markersSelectHint")}</p></div>
        )}
      </div>
    </section>,
    document.body,
  );
}
