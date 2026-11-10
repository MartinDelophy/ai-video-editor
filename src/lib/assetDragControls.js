import { ASSET_DRAG_MIME, STICKERS } from "../config/editor.js";
import { getVisualInsertionHover, resolveVisualInsertion } from "./visualDropInsertion.js";
import { collectTimelineSnapPoints, createTimelineSnapGuide, findClosestTimelineSnap } from "./timelineSnap.js";

export function resolveAssetDropTrack(asset, track) {
  if (asset?.type === "sticker") return "sticker";
  return asset?.kind === "sound-effect" && track === "image" ? "audio" : track;
}

export function resolveVisualDropIntent({ track = "image" } = {}) {
  return track === "overlay" ? "overlay" : "image";
}

export function resolveStickerSelectionIntent({ isMobile = false } = {}) {
  return isMobile ? "stage" : "add";
}

export function createAssetDragControls(deps) {
  const findAssetById = (id) => {
    if (!id) return null;
    return [...deps.userAssets, ...deps.builtInAssets].find((asset) => asset.id === id) ||
      deps.getStickerDragAsset(STICKERS.find((sticker) => sticker.id === id));
  };
  const getDraggedAsset = (event) => findAssetById(event.dataTransfer?.getData(ASSET_DRAG_MIME) || event.dataTransfer?.getData("text/plain") || deps.draggedAssetIdRef.current || deps.draggedAssetId);
  const getActiveDraggedAsset = () => findAssetById(deps.draggedAssetIdRef.current || deps.draggedAssetId);
  const getTimelineDropPercent = (clientX, rect) => rect?.width ? Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)) : 50;
  const canDropAssetOnTrack = (asset, track) => {
    if (!asset || deps.trackLocks[track]) return false;
    if (track === "image" || track === "overlay") return asset.type === "image" || asset.type === "video";
    if (track === "sticker") return asset.type === "sticker";
    if (track === "audio" || track === "music") {
      if (asset.type !== "audio") return false;
      if (asset.kind === "sound-effect") return track === "audio" && deps.trackVisibility.audio !== false;
      return asset.kind === "music" ? track === "music" : true;
    }
    return track === "source" && asset.type === "video";
  };
  const handleAssetDragStart = (event, asset) => {
    deps.draggedAssetIdRef.current = asset.id; deps.setDraggedAssetId(asset.id); deps.setAssetDropTargetTrack("");
    event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(ASSET_DRAG_MIME, asset.id); event.dataTransfer.setData("text/plain", asset.id);
  };
  const handleAssetDragEnd = () => {
    if (getActiveDraggedAsset()?.kind === "sound-effect") deps.setSnapGuide(null);
    deps.draggedAssetIdRef.current = ""; deps.setDraggedAssetId(""); deps.setAssetDropTargetTrack("");
    deps.setAssetDropPosition({ track: "", percent: 50 });
  };
  const resolveSoundEffectDrop = (event, rect) => {
    const percent = getTimelineDropPercent(event.clientX, rect);
    const duration = deps.timelineDuration;
    const startTime = percent / 100 * duration;
    const snap = event.altKey || !rect.width || !duration ? null : findClosestTimelineSnap(
      startTime, collectTimelineSnapPoints(deps), 9 / rect.width * duration,
    );
    return {
      percent: snap ? snap.time / duration * 100 : percent,
      startTime: snap?.time ?? startTime,
      guide: createTimelineSnapGuide(snap, "start"),
    };
  };
  const getDropTrackInfoFromPoint = (event) => {
    const { clientX, clientY } = event;
    const element = document.elementFromPoint(clientX, clientY);
    if (!(element instanceof Element)) return { track: "", percent: 50 };
    const timeline = element.closest(".track-scroll, .tracks");
    if (getActiveDraggedAsset()?.type === "sticker" && timeline instanceof HTMLElement) {
      const rect = deps.trackScrollRef.current?.getBoundingClientRect() ?? timeline.getBoundingClientRect();
      return { track: "sticker", percent: getTimelineDropPercent(clientX, rect) };
    }
    const trackElement = element.closest("[data-asset-drop-track]");
    const asset = getActiveDraggedAsset();
    const track = resolveAssetDropTrack(asset, trackElement?.dataset.assetDropTrack ?? "");
    if (asset?.kind === "sound-effect" && track === "audio" && trackElement instanceof HTMLElement) {
      return { track, ...resolveSoundEffectDrop(event, trackElement.getBoundingClientRect()) };
    }
    const laneEnd = trackElement instanceof HTMLElement && Number.isFinite(Number(trackElement.dataset.dropStartTime))
      ? Number(trackElement.dataset.dropStartTime)
      : undefined;
    const layer = trackElement instanceof HTMLElement && Number.isFinite(Number(trackElement.dataset.dropLayer))
      ? Number(trackElement.dataset.dropLayer)
      : undefined;
    const percent = !track || !(trackElement instanceof HTMLElement)
      ? 50
      : getTimelineDropPercent(clientX, trackElement.getBoundingClientRect());
    const startTime = track === "overlay"
      ? Math.max(0, percent / 100 * Math.max(0, Number(deps.timelineDuration) || 0))
      : laneEnd;
    const insertion = track === "image"
      ? resolveVisualInsertion({
          segments: deps.visualSegments,
          percent,
          timelineDuration: deps.timelineDuration,
          hover: getVisualInsertionHover(element, clientX),
        })
      : null;
    return { track, percent, startTime, layer, insertIndex: insertion?.index, insertTime: insertion?.time };
  };
  const triggerAssetDropPulse = (track) => {
    if (!track) return;
    clearTimeout(deps.assetDropPulseTimerRef.current); deps.setAssetDropPulseTrack("");
    requestAnimationFrame(() => { deps.setAssetDropPulseTrack(track); deps.assetDropPulseTimerRef.current = setTimeout(() => deps.setAssetDropPulseTrack(""), 620); });
  };
  const handleAssetPointerDown = (event, asset) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".asset-delete"))) return;
    void deps.prefetchAsset?.(asset);
    if (asset.kind !== "sound-effect") deps.setSelectedLibraryAssetId(asset.id);
    deps.pointerAssetDragRef.current = { assetId: asset.id, startX: event.clientX, startY: event.clientY, dragging: false };
    const move = (e) => {
      const state = deps.pointerAssetDragRef.current;
      if (!state || state.assetId !== asset.id || (!state.dragging && Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 7)) return;
      e.preventDefault();
      if (!state.dragging) { state.dragging = true; deps.draggedAssetIdRef.current = asset.id; deps.setDraggedAssetId(asset.id); }
      const info = getDropTrackInfoFromPoint(e); const dragged = findAssetById(state.assetId);
      const track = dragged?.type === "sticker" && info.track ? "sticker" : info.track;
      const accepted = canDropAssetOnTrack(dragged, track) ? track : "";
      if (asset.kind === "sound-effect") deps.setSnapGuide(accepted ? info.guide ?? null : null);
      deps.setAssetDropTargetTrack(accepted); deps.setAssetDropPosition(accepted ? { track: accepted, percent: info.percent, startTime: info.startTime, layer: info.layer, insertIndex: info.insertIndex, insertTime: info.insertTime } : { track: "", percent: 50 });
      deps.setAssetDragPreview({ id: asset.id, name: asset.name, type: asset.type, kind: asset.kind, src: asset.src, duration: asset.duration, x: e.clientX, y: e.clientY });
    };
    const cleanup = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cleanup);
      deps.pointerAssetDragRef.current = null; deps.setAssetDragPreview(null); deps.setAssetDropTargetTrack("");
      deps.setAssetDropPosition({ track: "", percent: 50 }); deps.draggedAssetIdRef.current = ""; deps.setDraggedAssetId("");
      if (asset.kind === "sound-effect") deps.setSnapGuide(null);
    };
    const up = (e) => {
      const state = deps.pointerAssetDragRef.current; const info = getDropTrackInfoFromPoint(e); cleanup();
      if (!state?.dragging) return;
      deps.suppressAssetClickRef.current = state.assetId; setTimeout(() => { if (deps.suppressAssetClickRef.current === state.assetId) deps.suppressAssetClickRef.current = ""; }, 300);
      const dragged = findAssetById(state.assetId); const track = dragged?.type === "sticker" && info.track ? "sticker" : info.track;
      if (canDropAssetOnTrack(dragged, track)) { triggerAssetDropPulse(track); void deps.applyAssetToTrack(dragged, track, { percent: info.percent, startTime: info.startTime, layer: info.layer, insertIndex: info.insertIndex }); }
    };
    addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cleanup);
  };
  const handleAssetClick = (event, asset) => {
    if (deps.suppressAssetClickRef.current === asset.id) { deps.suppressAssetClickRef.current = ""; event.preventDefault(); event.stopPropagation(); return; }
    deps.setSelectedLibraryAssetId(asset.id);
    deps.notify(window.matchMedia?.("(max-width: 760px)").matches
      ? deps.t?.("mobileAssetChooseDestination", "素材已选中，请选择添加位置")
      : deps.t?.("assetSelectedDragHint", "素材已选中，请拖到对应轨道使用"));
  };
  const handleStickerClick = (event, sticker) => {
    if (deps.suppressAssetClickRef.current === sticker.id) { deps.suppressAssetClickRef.current = ""; event.preventDefault(); event.stopPropagation(); return; }
    deps.setSelectedStickerId(sticker.id);
    if (resolveStickerSelectionIntent({ isMobile: window.matchMedia?.("(max-width: 760px)").matches }) === "stage") return;
    deps.addStickerAssetToTimeline(sticker, { startTime: deps.currentTime });
  };
  const confirmStickerSelection = (sticker) => {
    if (!sticker?.src) return;
    deps.setSelectedStickerId(sticker.id);
    deps.addStickerAssetToTimeline(sticker, { startTime: deps.currentTime });
  };
  const handleTrackAssetDragOver = (event, track) => {
    const asset = getDraggedAsset(event);
    const target = resolveAssetDropTrack(asset, track);
    if (!canDropAssetOnTrack(asset, target)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "copy";
    const rect = target === "sticker" ? deps.trackScrollRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect() : event.currentTarget.getBoundingClientRect();
    if (asset.kind === "sound-effect") {
      const { percent, startTime, guide } = resolveSoundEffectDrop(event, rect);
      deps.setSnapGuide(guide);
      deps.setAssetDropTargetTrack(target);
      deps.setAssetDropPosition({ track: target, percent, startTime });
      return;
    }
    const percent = getTimelineDropPercent(event.clientX, rect);
    const layer = target === "overlay" && Number.isFinite(Number(event.currentTarget.dataset.dropLayer))
      ? Number(event.currentTarget.dataset.dropLayer)
      : undefined;
    const startTime = target === "overlay"
      ? Math.max(0, percent / 100 * Math.max(0, Number(deps.timelineDuration) || 0))
      : undefined;
    const insertion = target === "image"
      ? resolveVisualInsertion({
          segments: deps.visualSegments,
          percent,
          timelineDuration: deps.timelineDuration,
          hover: getVisualInsertionHover(event.target, event.clientX),
        })
      : null;
    deps.setAssetDropTargetTrack(target); deps.setAssetDropPosition({ track: target, percent, startTime, layer, insertIndex: insertion?.index, insertTime: insertion?.time });
  };
  const handleTrackAssetDragLeave = (event, track) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    const asset = getActiveDraggedAsset();
    const target = resolveAssetDropTrack(asset, track);
    if (asset?.kind === "sound-effect") deps.setSnapGuide(null);
    deps.setAssetDropTargetTrack((current) => current === target ? "" : current);
    deps.setAssetDropPosition((current) => current.track === target ? { track: "", percent: 50 } : current);
  };
  return { canDropAssetOnTrack, findAssetById, getActiveDraggedAsset, getDraggedAsset, getTimelineDropPercent, resolveSoundEffectDrop,
    confirmStickerSelection, handleAssetClick, handleAssetDragEnd, handleAssetDragStart, handleAssetPointerDown, handleStickerClick,
    handleTrackAssetDragLeave, handleTrackAssetDragOver, triggerAssetDropPulse };
}
