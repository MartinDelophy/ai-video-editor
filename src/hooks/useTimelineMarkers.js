import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeTimelineMarkers } from "../lib/timelineMarkers.js";
import { isEditorInteractiveTarget, isEditorShortcutBlockedByModal, isEditorTextEntryTarget } from "../lib/editorShortcuts.js";

const TYPE_TITLE_KEYS = { marker: "markersNewTitle", chapter: "markersNewChapter", range: "markersNewRange", note: "markersNewNote" };
const TYPE_COLORS = { marker: "cyan", chapter: "amber", range: "violet", note: "rose" };

export function useTimelineMarkers({ timelineMarkers, setTimelineMarkers, currentTime, seekTo, t, notify, trackScrollRef, timelineDuration }) {
  const [open, setOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const anchorRef = useRef(null);
  const markers = useMemo(() => [...timelineMarkers].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)), [timelineMarkers]);
  const add = useCallback((type = "marker", atTime = currentTime, edit = true) => {
    const marker = normalizeTimelineMarkers([{
      id: `marker-${crypto.randomUUID()}`, type, time: atTime,
      endTime: atTime + 5, title: t(TYPE_TITLE_KEYS[type] || TYPE_TITLE_KEYS.marker),
      notes: "", color: TYPE_COLORS[type] || "cyan",
    }])[0];
    setTimelineMarkers((items) => [...items, marker]);
    setSelectedId(marker.id);
    if (edit) setOpen(true);
    else notify(t("markersAdded"));
  }, [currentTime, notify, setTimelineMarkers, t]);
  const update = useCallback((id, patch) => {
    setTimelineMarkers((items) => normalizeTimelineMarkers(items.map((item) => item.id === id ? { ...item, ...patch, id } : item)));
  }, [setTimelineMarkers]);
  const remove = useCallback((id) => {
    setTimelineMarkers((items) => items.filter((item) => item.id !== id));
  }, [setTimelineMarkers]);
  const select = useCallback((marker, edit = true) => {
    setSelectedId(marker.id);
    seekTo(marker.time);
    const track = trackScrollRef.current;
    const viewport = track?.parentElement;
    if (viewport && timelineDuration > 0) {
      const x = marker.time / timelineDuration * track.getBoundingClientRect().width;
      if (window.matchMedia?.("(max-width: 760px)").matches) viewport.scrollLeft = x;
      else if (x < viewport.scrollLeft + 24 || x > viewport.scrollLeft + viewport.clientWidth - 24) {
        viewport.scrollLeft = Math.max(0, x - viewport.clientWidth * .35);
      }
    }
    if (edit) setOpen(true);
  }, [seekTo, timelineDuration, trackScrollRef]);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const markerTriggerFocused = event.target?.closest?.(".timeline-marker-trigger");
      if (isEditorTextEntryTarget(event.target) || (isEditorInteractiveTarget(event.target) && !markerTriggerFocused) || isEditorShortcutBlockedByModal()) return;
      if (event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      if (event.shiftKey) setOpen((value) => !value);
      else add("marker", currentTime, false);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [add, currentTime]);
  return { markers, open, setOpen, railExpanded, setRailExpanded, selectedId, anchorRef, add, update, remove, select, close };
}
