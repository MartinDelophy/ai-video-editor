import { ASSET_DRAG_MIME, STICKERS } from "../config/editor.js";

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
  const getTimelineDropPercent = (clientX, rect) => rect?.width ? Math.max(8, Math.min(92, ((clientX - rect.left) / rect.width) * 100)) : 50;
  const canDropAssetOnTrack = (asset, track) => {
    if (!asset || deps.trackLocks[track]) return false;
    if (track === "image" || track === "overlay") return asset.type === "image" || asset.type === "video";
    if (track === "sticker") return asset.type === "sticker";
    if (track === "audio" || track === "music") return asset.type === "audio";
    return track === "source" && asset.type === "video";
  };
  const handleAssetDragStart = (event, asset) => {
    deps.draggedAssetIdRef.current = asset.id; deps.setDraggedAssetId(asset.id); deps.setAssetDropTargetTrack("");
    event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(ASSET_DRAG_MIME, asset.id); event.dataTransfer.setData("text/plain", asset.id);
  };
  const handleAssetDragEnd = () => {
    deps.draggedAssetIdRef.current = ""; deps.setDraggedAssetId(""); deps.setAssetDropTargetTrack("");
    deps.setAssetDropPosition({ track: "", percent: 50 });
  };
  const getDropTrackInfoFromPoint = (clientX, clientY) => {
    const element = document.elementFromPoint(clientX, clientY);
    if (!(element instanceof Element)) return { track: "", percent: 50 };
    const timeline = element.closest(".track-scroll, .tracks");
    if (getActiveDraggedAsset()?.type === "sticker" && timeline instanceof HTMLElement) {
      const rect = deps.trackScrollRef.current?.getBoundingClientRect() ?? timeline.getBoundingClientRect();
      return { track: "sticker", percent: getTimelineDropPercent(clientX, rect) };
    }
    const trackElement = element.closest("[data-asset-drop-track]");
    let track = trackElement?.dataset.assetDropTrack ?? "";
    const startTime = trackElement instanceof HTMLElement && Number.isFinite(Number(trackElement.dataset.dropStartTime))
      ? Number(trackElement.dataset.dropStartTime)
      : undefined;
    const layer = trackElement instanceof HTMLElement && Number.isFinite(Number(trackElement.dataset.dropLayer))
      ? Number(trackElement.dataset.dropLayer)
      : undefined;
    return !track || !(trackElement instanceof HTMLElement) ? { track, percent: 50, startTime, layer }
      : { track, percent: getTimelineDropPercent(clientX, trackElement.getBoundingClientRect()), startTime, layer };
  };
  const triggerAssetDropPulse = (track) => {
    if (!track) return;
    clearTimeout(deps.assetDropPulseTimerRef.current); deps.setAssetDropPulseTrack("");
    requestAnimationFrame(() => { deps.setAssetDropPulseTrack(track); deps.assetDropPulseTimerRef.current = setTimeout(() => deps.setAssetDropPulseTrack(""), 620); });
  };
  const handleAssetPointerDown = (event, asset) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".asset-delete"))) return;
    void deps.prefetchAsset?.(asset);
    deps.setSelectedLibraryAssetId(asset.id);
    deps.pointerAssetDragRef.current = { assetId: asset.id, startX: event.clientX, startY: event.clientY, dragging: false };
    const move = (e) => {
      const state = deps.pointerAssetDragRef.current;
      if (!state || state.assetId !== asset.id || (!state.dragging && Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < 7)) return;
      e.preventDefault();
      if (!state.dragging) { state.dragging = true; deps.draggedAssetIdRef.current = asset.id; deps.setDraggedAssetId(asset.id); }
      const info = getDropTrackInfoFromPoint(e.clientX, e.clientY); const dragged = findAssetById(state.assetId);
      const track = dragged?.type === "sticker" && info.track ? "sticker" : info.track;
      const accepted = canDropAssetOnTrack(dragged, track) ? track : "";
      deps.setAssetDropTargetTrack(accepted); deps.setAssetDropPosition(accepted ? { track: accepted, percent: info.percent } : { track: "", percent: 50 });
      deps.setAssetDragPreview({ id: asset.id, name: asset.name, type: asset.type, src: asset.src, x: e.clientX, y: e.clientY });
    };
    const cleanup = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cleanup);
      deps.pointerAssetDragRef.current = null; deps.setAssetDragPreview(null); deps.setAssetDropTargetTrack("");
      deps.setAssetDropPosition({ track: "", percent: 50 }); deps.draggedAssetIdRef.current = ""; deps.setDraggedAssetId("");
    };
    const up = (e) => {
      const state = deps.pointerAssetDragRef.current; const info = getDropTrackInfoFromPoint(e.clientX, e.clientY); cleanup();
      if (!state?.dragging) return;
      deps.suppressAssetClickRef.current = state.assetId; setTimeout(() => { if (deps.suppressAssetClickRef.current === state.assetId) deps.suppressAssetClickRef.current = ""; }, 300);
      const dragged = findAssetById(state.assetId); const track = dragged?.type === "sticker" && info.track ? "sticker" : info.track;
      if (canDropAssetOnTrack(dragged, track)) { triggerAssetDropPulse(track); void deps.applyAssetToTrack(dragged, track, { percent: info.percent, startTime: info.startTime, layer: info.layer }); }
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
    if (resolveStickerSelectionIntent({ isMobile: window.matchMedia?.("(max-width: 760px)").matches })) return;
    deps.addStickerAssetToTimeline(sticker, { startTime: deps.currentTime });
  };
  const confirmStickerSelection = (sticker) => {
    if (!sticker?.src) return;
    deps.setSelectedStickerId(sticker.id);
    deps.addStickerAssetToTimeline(sticker, { startTime: deps.currentTime });
  };
  const handleTrackAssetDragOver = (event, track) => {
    const asset = getDraggedAsset(event);
    let target = asset?.type === "sticker" ? "sticker" : track;
    if (!canDropAssetOnTrack(asset, target)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "copy";
    const rect = target === "sticker" ? deps.trackScrollRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect() : event.currentTarget.getBoundingClientRect();
    deps.setAssetDropTargetTrack(target); deps.setAssetDropPosition({ track: target, percent: getTimelineDropPercent(event.clientX, rect) });
  };
  const handleTrackAssetDragLeave = (event, track) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    const target = getActiveDraggedAsset()?.type === "sticker" ? "sticker" : track;
    deps.setAssetDropTargetTrack((current) => current === target ? "" : current);
    deps.setAssetDropPosition((current) => current.track === target ? { track: "", percent: 50 } : current);
  };
  return { canDropAssetOnTrack, findAssetById, getActiveDraggedAsset, getDraggedAsset, getTimelineDropPercent,
    confirmStickerSelection, handleAssetClick, handleAssetDragEnd, handleAssetDragStart, handleAssetPointerDown, handleStickerClick,
    handleTrackAssetDragLeave, handleTrackAssetDragOver, triggerAssetDropPulse };
}
