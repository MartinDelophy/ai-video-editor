import { useEffect, useRef, useState } from "react";
import { BookOpen, CaretDown, CaretUp, Flag, NotePencil, Selection } from "@phosphor-icons/react";
import { TimelineMarkerPanel } from "./TimelineMarkerPanel.jsx";
import { createTimelineSnapGuide, findClosestTimelineSnap, snapTimelineRange } from "../lib/timelineSnap.js";
import { MAX_TIMELINE_DURATION_SECONDS } from "../config/editor.js";

const TYPE_ICONS = { marker: Flag, chapter: BookOpen, range: Selection, note: NotePencil };
const TYPE_KEYS = { marker: "markersTypeMarker", chapter: "markersTypeChapter", range: "markersTypeRange", note: "markersTypeNote" };

function markerClock(value) {
  const ms = Math.round(Math.max(0, value) * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

export function TimelineMarkerToolbar({ controller, t, currentTime }) {
  return <>
    <div className="timeline-marker-tools">
    <button
      ref={controller.anchorRef}
      className={`timeline-marker-trigger ${controller.open ? "is-active" : ""}`}
      type="button" aria-label={t("markersTitle")} aria-haspopup="dialog" aria-expanded={controller.open}
      data-tooltip={`${t("markersTitle")} · Shift+M`}
      onClick={() => controller.setOpen((value) => !value)}
    >
      <Flag size={17} weight={controller.open ? "fill" : "regular"} />
      <span>{t("markersTypeMarker")}</span>
      {controller.markers.length > 0 && <small>{controller.markers.length}</small>}
    </button>
    <button type="button" className="timeline-marker-expand icon-button"
      aria-label={t(controller.railExpanded ? "markersCollapseRail" : "markersExpandRail")}
      data-tooltip={t(controller.railExpanded ? "markersCollapseRail" : "markersExpandRail")}
      aria-expanded={controller.railExpanded}
      onClick={() => controller.setRailExpanded((value) => !value)}>
      {controller.railExpanded ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
    </button>
    </div>
    {controller.open && <TimelineMarkerPanel
      t={t} markers={controller.markers} selectedId={controller.selectedId}
      onSelect={controller.select} onAdd={controller.add} onUpdate={controller.update}
      onDelete={controller.remove} onClose={controller.close} currentTime={currentTime} anchorRef={controller.anchorRef}
    />}
  </>;
}

export function TimelineMarkerRail({ controller, t, timelineDuration, getSnapPoints, setSnapGuide, pausePlayback }) {
  const railRef = useRef(null);
  const cleanupRef = useRef(null);
  const suppressClickRef = useRef(false);
  const latestDragOptionsRef = useRef({ getSnapPoints, pausePlayback });
  latestDragOptionsRef.current = { getSnapPoints, pausePlayback };
  const [dragPreview, setDragPreview] = useState(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  const beginDrag = (event, marker, edge = "start") => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    cleanupRef.current?.();
    suppressClickRef.current = false;
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect?.width || !timelineDuration) return;
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let points = getSnapPoints(marker.id);
    let next = marker;
    let moved = false;
    const move = (e) => {
      if (e.pointerId !== pointerId) return;
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      if (!moved) {
        points = latestDragOptionsRef.current.getSnapPoints(marker.id);
        latestDragOptionsRef.current.pausePlayback();
      }
      moved = true;
      const delta = (e.clientX - startX) / rect.width * timelineDuration;
      const baseTime = edge === "end" ? marker.endTime : marker.time;
      const proposed = baseTime + delta;
      const threshold = 10 / rect.width * timelineDuration;
      const rangeDuration = marker.type === "range" ? marker.endTime - marker.time : 0;
      const snappedRange = !e.altKey && rangeDuration > 0 && edge === "start"
        ? snapTimelineRange(proposed, rangeDuration, points, threshold) : null;
      const snap = e.altKey || snappedRange ? null : findClosestTimelineSnap(proposed, points, threshold);
      const time = snappedRange?.start ?? snap?.time ?? proposed;
      if (edge === "end") next = { ...marker, endTime: Math.max(marker.time + .001, Math.min(MAX_TIMELINE_DURATION_SECONDS, time)) };
      else {
        const duration = marker.type === "range" ? marker.endTime - marker.time : 0;
        const start = Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS - duration, time));
        next = { ...marker, time: start, ...(duration ? { endTime: start + duration } : {}) };
      }
      const guide = snappedRange?.guide ?? createTimelineSnapGuide(snap, edge);
      const settledEdge = guide?.movingEdge === "end" ? next.endTime : next.time;
      setSnapGuide(guide && Math.abs(settledEdge - guide.time) < .0001 ? guide : null);
      setDragPreview(next);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      setSnapGuide(null);
      cleanupRef.current = null;
    };
    const end = (commit) => {
      cleanup();
      setDragPreview(null);
      suppressClickRef.current = moved;
      if (commit && moved) controller.update(marker.id, next);
    };
    const finish = (e) => { if (e.pointerId === pointerId) end(true); };
    const cancel = () => end(false);
    const escape = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); } };
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
  };
  return <div ref={railRef} className="timeline-marker-rail" aria-label={t("markersTitle")}
    onDoubleClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      controller.add("marker", Math.max(0, Math.min(timelineDuration, (event.clientX - rect.left) / rect.width * timelineDuration)));
    }}>
    {controller.markers.map((savedMarker, index) => {
      const marker = dragPreview?.id === savedMarker.id ? dragPreview : savedMarker;
      const Icon = TYPE_ICONS[marker.type] || Flag;
      const title = marker.title || t(TYPE_KEYS[marker.type]);
      const label = `${t(TYPE_KEYS[marker.type])} · ${markerClock(marker.time)}${marker.type === "range" ? ` – ${markerClock(marker.endTime)}` : ""} · ${title}${marker.notes ? `\n${marker.notes}` : ""}`;
      const nextTime = controller.markers[index + 1]?.time ?? timelineDuration;
      const handleKeyDown = (event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault(); event.stopPropagation(); controller.remove(marker.id);
        }
      };
      return <div key={marker.id} className={`timeline-marker-item is-${marker.type} ${marker.time >= timelineDuration ? "is-at-end" : ""} ${controller.selectedId === marker.id ? "is-selected" : ""}`}
        data-marker-color={marker.color} style={{ left: `${marker.time / timelineDuration * 100}%`, width: marker.type === "range" ? `${(marker.endTime - marker.time) / timelineDuration * 100}%` : 0 }}>
        {marker.type === "range" && <>
          <button type="button" className="timeline-marker-range" aria-label={label} title={label}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => beginDrag(event, marker)} onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) controller.select(marker); }} />
          <button type="button" className="timeline-marker-end" aria-label={`${t("markersEndLabel")} · ${title}`} title={`${t("markersEndLabel")} · ${markerClock(marker.endTime)}`}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => beginDrag(event, marker, "end")}
            onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) controller.select(marker); }} />
        </>}
        <button type="button" className="timeline-marker-flag" aria-label={label} title={`${label}\n${t("markersSnapHint")}`}
          style={{ "--marker-label-max": `${Math.max(0, Math.min(130, (nextTime - marker.time) / timelineDuration * (railRef.current?.clientWidth || 1000) - 19))}px` }}
          onPointerDown={(event) => beginDrag(event, marker)}
          onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) controller.select(marker); }}
          onKeyDown={handleKeyDown}>
          <Icon size={13} weight={marker.type === "marker" ? "fill" : "bold"} /><span>{title}</span>
        </button>
      </div>;
    })}
  </div>;
}
