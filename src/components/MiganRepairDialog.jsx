import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BoundingBox,
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  Check,
  Diamond,
  MagicWand,
  Pause,
  Play,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function formatSeconds(value) {
  return `${Math.max(0, Number(value) || 0).toFixed(2)}s`;
}

export function MiganRepairDialog({ repair, segment, t, onApplied }) {
  const stageRef = useRef(null);
  const rangeTrackRef = useRef(null);
  const videoRef = useRef(null);
  const resultVideoRef = useRef(null);
  const dragRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [compare, setCompare] = useState(62);
  const [mode, setMode] = useState("move");
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [followProcessing, setFollowProcessing] = useState(true);
  const duration = Math.max(0.1, Number(segment?.duration) || 5);
  const isVideo = segment?.type === "video";
  const activeRegion = repair?.activeRegion;
  const mediaRatio = Math.max(0.2, Math.min(5, (Number(segment?.width) || 16) / (Number(segment?.height) || 9)));

  useEffect(() => {
    if (!repair?.dialogOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !repair.job.running) repair.closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [repair?.dialogOpen, repair?.job?.running]);

  useEffect(() => {
    if (!repair?.dialogOpen || !isVideo || !videoRef.current) return;
    const video = videoRef.current;
    const sourceStart = Math.max(0, Number(segment?.sourceStart) || 0);
    const playbackRate = Math.max(0.25, Number(segment?.playbackRate) || 1);
    const target = sourceStart + currentTime * playbackRate;
    // Native playback owns its clock. Do not seek it on React time updates.
    if (!video.paused) return;
    if (Number.isFinite(target) && Math.abs(video.currentTime - target) > 0.0005) video.currentTime = target;
    video.playbackRate = playbackRate;
    if (resultVideoRef.current) {
      const resultTarget = currentTime * playbackRate;
      if (Math.abs(resultVideoRef.current.currentTime - resultTarget) > 0.0005) resultVideoRef.current.currentTime = resultTarget;
      resultVideoRef.current.playbackRate = playbackRate;
    }
  }, [currentTime, isVideo, repair?.dialogOpen, repair?.clipPreview?.url, segment?.playbackRate, segment?.sourceStart]);

  useEffect(() => {
    const frame = repair?.preview;
    if (!followProcessing || isPreviewPlaying || !repair?.job?.running || frame?.type !== "video-progress" || !Number.isFinite(frame.time)) return;
    setCurrentTime(clamp(frame.time, 0, duration));
  }, [duration, followProcessing, isPreviewPlaying, repair?.job?.running, repair?.preview]);

  if (!repair?.dialogOpen || !segment) return null;

  const updateRegion = (id, patch) => repair.updateRegion(id, patch, currentTime);

  const pointFromEvent = (event) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height)),
    };
  };

  const beginRegionDrag = (event, action = mode, region = activeRegion) => {
    if (!region || repair.job.running) return;
    event.preventDefault();
    event.stopPropagation();
    repair.checkpoint();
    const point = pointFromEvent(event);
    if (!point) return;
    repair.setActiveRegionId(region.id);
    dragRef.current = { action, point, regionId: region.id, selection: { ...repair.resolveSelection(region, currentTime) } };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (action === "draw") {
      updateRegion(region.id, { selection: { x: point.x, y: point.y, width: 0.015, height: 0.015 } });
    }
  };

  const moveRegionDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    const dx = point.x - drag.point.x;
    const dy = point.y - drag.point.y;
    if (drag.action === "draw") {
      updateRegion(drag.regionId, {
        selection: {
          x: Math.min(drag.point.x, point.x),
          y: Math.min(drag.point.y, point.y),
          width: Math.max(0.015, Math.abs(point.x - drag.point.x)),
          height: Math.max(0.015, Math.abs(point.y - drag.point.y)),
        },
      });
      return;
    }
    if (drag.action === "resize") {
      updateRegion(drag.regionId, {
        selection: {
          ...drag.selection,
          width: clamp(drag.selection.width + dx, 0.015, 1 - drag.selection.x),
          height: clamp(drag.selection.height + dy, 0.015, 1 - drag.selection.y),
        },
      });
      return;
    }
    updateRegion(drag.regionId, {
      selection: {
        ...drag.selection,
        x: clamp(drag.selection.x + dx, 0, 1 - drag.selection.width),
        y: clamp(drag.selection.y + dy, 0, 1 - drag.selection.height),
      },
    });
  };

  const endRegionDrag = () => {
    dragRef.current = null;
  };

  const previewFrame = async (usePrevious = true) => {
    videoRef.current?.pause();
    resultVideoRef.current?.pause();
    const visibleRegions = isVideo
      ? repair.regions.filter((region) => currentTime >= region.start && currentTime <= region.end)
      : repair.regions;
    await repair.runFramePreview({
      videoElement: isVideo && resultVideoRef.current ? resultVideoRef.current : videoRef.current,
      selections: visibleRegions.map((region) => repair.resolveSelection(region, currentTime)),
      usePrevious,
    });
    setCompare(62);
  };

  const beginRangeDrag = (event, region, action) => {
    if (repair.job.running) return;
    event.preventDefault();
    event.stopPropagation();
    repair.checkpoint();
    const track = rangeTrackRef.current;
    if (!track) return;
    repair.setActiveRegionId(region.id);
    const rect = track.getBoundingClientRect();
    const startPointerTime = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1) * duration;
    const original = { start: region.start, end: region.end };
    const move = (moveEvent) => {
      const pointerTime = clamp((moveEvent.clientX - rect.left) / Math.max(1, rect.width), 0, 1) * duration;
      const delta = pointerTime - startPointerTime;
      if (action === "start") updateRegion(region.id, { start: clamp(pointerTime, 0, region.end - 0.04) });
      else if (action === "end") updateRegion(region.id, { end: clamp(pointerTime, region.start + 0.04, duration) });
      else {
        const length = original.end - original.start;
        const nextStart = clamp(original.start + delta, 0, duration - length);
        updateRegion(region.id, { start: nextStart, end: nextStart + length });
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const processRanges = async (usePrevious = true) => {
    setFollowProcessing(true);
    videoRef.current?.pause();
    resultVideoRef.current?.pause();
    const processed = await repair.processVideoRepair({ usePrevious });
    if (processed) setCompare(62);
  };

  const apply = async () => {
    const applied = isVideo
      ? repair.applyVideoPreview()
      : await repair.applyRepair({ videoElement: videoRef.current });
    if (applied) onApplied?.();
  };

  const toggleVideoPlayback = async () => {
    const source = videoRef.current;
    if (!source) return;
    if (!source.paused) {
      source.pause();
      resultVideoRef.current?.pause();
      setIsPreviewPlaying(false);
      return;
    }
    setFollowProcessing(false);
    const rate = Math.max(0.25, Number(segment?.playbackRate) || 1);
    const sourceStart = Math.max(0, Number(segment?.sourceStart) || 0);
    const playTime = currentTime >= duration - 0.04 ? 0 : currentTime;
    if (playTime !== currentTime) setCurrentTime(playTime);
    source.currentTime = sourceStart + playTime * rate;
    source.playbackRate = rate;
    if (resultVideoRef.current) {
      resultVideoRef.current.currentTime = Math.max(0, playTime * rate);
      resultVideoRef.current.playbackRate = rate;
    }
    const [played] = await Promise.allSettled([source.play(), resultVideoRef.current?.play()]);
    setIsPreviewPlaying(played.status === "fulfilled");
  };

  const showFramePreview = Boolean(repair.preview?.url) && (!isVideo || (!isPreviewPlaying
    && (repair.preview.type !== "video-progress" || followProcessing)));
  const hasComparison = Boolean(isVideo ? (repair.clipPreview?.url || showFramePreview) : showFramePreview);
  const seekPreview = (time) => {
    setFollowProcessing(false);
    videoRef.current?.pause();
    resultVideoRef.current?.pause();
    setIsPreviewPlaying(false);
    setCurrentTime(clamp(time, 0, duration));
    if (!repair.job.running) repair.clearPreview();
  };
  const showCompareControl = isVideo || hasComparison;

  const dialog = (
    <div className="repair-dialog-backdrop" role="presentation">
      <section className="repair-dialog" role="dialog" aria-modal="true" aria-labelledby="repair-dialog-title">
        <header className="repair-dialog-header">
          <div>
            <span className="repair-dialog-icon"><MagicWand size={20} weight="duotone" /></span>
            <span>
              <strong id="repair-dialog-title">{t("repairDialogTitle")}</strong>
              <small>{isVideo ? t("repairDialogVideoMode") : t("repairDialogImageMode")} · MI-GAN WebGPU</small>
            </span>
          </div>
          <button type="button" aria-label={t("close")} disabled={repair.job.running} onClick={repair.closeDialog}><X size={20} /></button>
        </header>

        <div className="repair-dialog-body">
          <main className="repair-dialog-workspace">
            <div className="repair-dialog-toolbar">
            <div>
              <button type="button" className={mode === "move" ? "is-active" : ""} onClick={() => setMode("move")}><BoundingBox size={15} />{t("repairMoveRegion")}</button>
              <button type="button" className={mode === "draw" ? "is-active" : ""} onClick={() => setMode("draw")}><Plus size={15} />{t("repairDrawRegion")}</button>
              <button type="button" onClick={() => {
                if (!activeRegion) return;
                repair.checkpoint();
                updateRegion(activeRegion.id, { selection: { x: 0.79, y: 0.9, width: 0.21, height: 0.1 } });
              }}>{t("repairPresetBottomRight")}</button>
              <span className="repair-history-actions">
                <button type="button" disabled={repair.job.running || !repair.canUndo} aria-label={t("undo")} onClick={repair.undo}><ArrowCounterClockwise size={15} /></button>
                <button type="button" disabled={repair.job.running || !repair.canRedo} aria-label={t("redo")} onClick={repair.redo}><ArrowClockwise size={15} /></button>
              </span>
              </div>
              <span>{t("repairLocalOnly")}</span>
            </div>

            <div
              ref={stageRef}
              className={`repair-dialog-stage ${mode === "draw" ? "is-drawing" : ""}`}
              style={{ "--repair-media-ratio": mediaRatio }}
              onPointerDown={(event) => mode === "draw" && beginRegionDrag(event, "draw")}
              onPointerMove={moveRegionDrag}
              onPointerUp={endRegionDrag}
              onPointerCancel={endRegionDrag}
            >
              {isVideo ? <video
                ref={videoRef}
                src={segment.src}
                muted
                playsInline
                preload="auto"
                onTimeUpdate={(event) => {
                  if (event.currentTarget.paused) return;
                  const sourceStart = Math.max(0, Number(segment?.sourceStart) || 0);
                  const rate = Math.max(0.25, Number(segment?.playbackRate) || 1);
                  const localTime = (event.currentTarget.currentTime - sourceStart) / rate;
                  if (localTime >= duration) {
                    event.currentTarget.pause();
                    resultVideoRef.current?.pause();
                  }
                  setCurrentTime(clamp(localTime, 0, duration));
                  const result = resultVideoRef.current;
                  if (result && Math.abs(result.currentTime - localTime * rate) > 0.06) result.currentTime = localTime * rate;
                }}
                onPause={() => { setIsPreviewPlaying(false); resultVideoRef.current?.pause(); }}
                onEnded={() => { setIsPreviewPlaying(false); resultVideoRef.current?.pause(); }}
              /> : <img src={segment.src} alt={segment.name || ""} />}
              {hasComparison ? (
                <div className="repair-compare-result" style={{ clipPath: `inset(0 0 0 ${compare}%)` }}>
                  {isVideo && repair.clipPreview?.url && !showFramePreview
                    ? <video ref={resultVideoRef} src={repair.clipPreview.url} muted playsInline preload="auto" onLoadedData={(event) => {
                      event.currentTarget.currentTime = Math.max(0, (videoRef.current?.currentTime || 0) - (Number(segment.sourceStart) || 0));
                      event.currentTarget.playbackRate = Math.max(0.25, Number(segment.playbackRate) || 1);
                      if (videoRef.current && !videoRef.current.paused) event.currentTarget.play().catch(() => {});
                    }} />
                    : <img src={repair.preview.url} alt={t("repairPreviewAlt")} />}
                </div>
              ) : null}
              {repair.regions.filter((region) => !isVideo || (currentTime >= region.start && currentTime <= region.end)).map((region) => {
                const selection = repair.resolveSelection(region, currentTime);
                const isActive = region.id === activeRegion?.id;
                return <div
                  className={`repair-dialog-region ${isActive ? "is-active" : "is-inactive"}`}
                  key={region.id}
                  style={{
                    left: `${selection.x * 100}%`,
                    top: `${selection.y * 100}%`,
                    width: `${selection.width * 100}%`,
                    height: `${selection.height * 100}%`,
                  }}
                  onPointerDown={(event) => beginRegionDrag(event, "move", region)}
                >
                  <span>{t("repairRegion")} {repair.regions.findIndex((item) => item.id === region.id) + 1}</span>
                  {isActive ? <button type="button" aria-label={t("repairResizeRegion")} onPointerDown={(event) => beginRegionDrag(event, "resize", region)} /> : null}
                </div>;
              })}
              {showCompareControl ? <div className={`repair-compare-control ${hasComparison ? "is-ready" : "is-pending"}`} style={{ left: `${compare}%` }}>
                <i />
                <button type="button" aria-label={t("repairCompare")} onPointerDown={(event) => {
                  event.preventDefault();
                  const move = (moveEvent) => {
                    const rect = stageRef.current?.getBoundingClientRect();
                    if (rect) setCompare(clamp((moveEvent.clientX - rect.left) / rect.width) * 100);
                  };
                  const stop = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", stop);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", stop, { once: true });
                }}><CaretLeft size={12} /><CaretRight size={12} /></button>
              </div> : null}
              <div className="repair-compare-labels"><span>{t("repairBefore")}</span>{showCompareControl ? <span>{t("repairAfter")}</span> : null}</div>
            </div>

            {isVideo ? <section className="repair-video-timeline">
              <div className="repair-video-time-row">
                <span><button type="button" aria-label={isPreviewPlaying ? t("pause") : t("play")} onClick={toggleVideoPlayback}>{isPreviewPlaying ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}</button><strong>{t("repairFrameTimeline")}</strong></span>
                <span>{formatSeconds(currentTime)} / {formatSeconds(duration)}</span>
              </div>
              <div className="repair-video-ruler" aria-hidden="true">
                {Array.from({ length: 7 }, (_, index) => <span key={index} style={{ left: `${index / 6 * 100}%` }}>{formatSeconds(duration * index / 6)}</span>)}
              </div>
              <div ref={rangeTrackRef} className="repair-video-range-track">
                {repair.regions.map((region, index) => <div
                  key={region.id}
                  className={region.id === activeRegion?.id ? "is-active" : ""}
                  style={{ left: `${region.start / duration * 100}%`, width: `${Math.max(1.5, (region.end - region.start) / duration * 100)}%` }}
                >
                  <button className="is-start" type="button" aria-label={t("repairRangeStart")} onPointerDown={(event) => beginRangeDrag(event, region, "start")} />
                  <button className="repair-range-body" type="button" onPointerDown={(event) => beginRangeDrag(event, region, "move")} onClick={() => {
                    repair.setActiveRegionId(region.id);
                    seekPreview(region.start);
                  }}>{index + 1}</button>
                  <button className="is-end" type="button" aria-label={t("repairRangeEnd")} onPointerDown={(event) => beginRangeDrag(event, region, "end")} />
                </div>)}
                <i className="repair-video-playhead" style={{ left: `${currentTime / duration * 100}%` }} />
              </div>
              <input aria-label={t("repairFrameTimeline")} type="range" min="0" max={duration} step="0.04" value={currentTime} onChange={(event) => {
                seekPreview(Number(event.target.value));
              }} />
            </section> : null}
          </main>

          <aside className="repair-dialog-inspector">
            <div className="repair-inspector-heading">
              <span><strong>{t("repairRegions")}</strong><small>{repair.regions.length}</small></span>
              <button type="button" onClick={() => repair.addRegion(isVideo ? currentTime : 0)}><Plus size={14} />{t("repairAddRegion")}</button>
            </div>
            <div className="repair-region-list">
              {repair.regions.map((region, index) => <article key={region.id} className={region.id === activeRegion?.id ? "is-active" : ""} onClick={() => {
                repair.setActiveRegionId(region.id);
              }}>
                <div><span>{t("repairRegion")} {index + 1}</span>{repair.regions.length > 1 ? <button type="button" aria-label={t("delete")} onClick={(event) => { event.stopPropagation(); repair.removeRegion(region.id); }}><Trash size={14} /></button> : null}</div>
                {isVideo ? <div className="repair-region-time-fields">
                  <label>{t("repairRangeStart")}<input type="number" min="0" max={region.end} step="0.1" value={region.start.toFixed(2)} onFocus={repair.checkpoint} onChange={(event) => updateRegion(region.id, { start: clamp(Number(event.target.value), 0, region.end - 0.04) })} /></label>
                  <label>{t("repairRangeEnd")}<input type="number" min={region.start} max={duration} step="0.1" value={region.end.toFixed(2)} onFocus={repair.checkpoint} onChange={(event) => updateRegion(region.id, { end: clamp(Number(event.target.value), region.start + 0.04, duration) })} /></label>
                </div> : null}
                <small>{Math.round(region.selection.width * 100)}% × {Math.round(region.selection.height * 100)}%</small>
                {isVideo ? <button type="button" className="repair-keyframe-action" disabled={repair.job.running || currentTime < region.start || currentTime > region.end} title={t("repairPositionHint")} onClick={(event) => {
                  event.stopPropagation();
                  repair.addRegionKeyframe(region.id, currentTime, repair.resolveSelection(region, currentTime));
                }}><Diamond size={13} weight="fill" />{t("repairRecordMotionPosition")} · {region.keyframes?.length || 0}</button> : null}
              </article>)}
            </div>
            {isVideo && repair.job.running ? <p className="repair-dialog-hint" role="status">{t("repairBackgroundHint")}</p> : null}
            {isVideo ? <p className="repair-dialog-hint">{t("repairTemporalHint")}</p> : null}
            <p className="repair-dialog-hint">{t("repairIterationHint")}</p>
            {repair.resultDirty && hasComparison ? <p className="repair-dialog-hint" role="status">{t("repairDraftChanged")}</p> : null}
            <p className="repair-dialog-hint">{isVideo ? t("repairPositionHint") : t("repairImageHint")}</p>
            {repair.preview && !isVideo ? <div className="repair-change-diagnostic">
              <span>{t("repairPixelChange")}</span>
              <strong>{Math.round((repair.preview.composedChangedRatio ?? repair.preview.changedRatio ?? 0) * 100)}%</strong>
              <small>{t("repairPixelChangeHint")}</small>
            </div> : null}
          </aside>
        </div>

        <footer className="repair-dialog-footer">
          <div className="repair-dialog-progress" aria-live="polite">
            {repair.job.progress > 0 ? <>
              <span>{t(repair.job.phaseKey, repair.job.phaseKey)}{repair.job.phaseKey !== "repairPhaseStopping" ? ` · ${Math.round(repair.job.progress)}%` : ""}</span>
              <i className={repair.job.phaseKey === "repairPhaseStopping" ? "is-stopping" : ""}><b style={{ width: `${repair.job.phaseKey === "repairPhaseStopping" ? 100 : clamp(repair.job.progress, 0, 100)}%` }} /></i>
            </> : <span>{t("repairSafeNote")}</span>}
          </div>
          <div>
            {repair.job.running ? <button type="button" className="panel-secondary is-danger" disabled={repair.job.phaseKey === "repairPhaseStopping"} onClick={repair.cancel}>{repair.job.phaseKey === "repairPhaseStopping" ? t("repairStopping") : t("repairCancel")}</button> : <>
              <button type="button" className="panel-secondary" onClick={repair.closeDialog}>{t("repairCancel")}</button>
              <button type="button" className="panel-secondary" onClick={() => previewFrame()}>{isVideo ? t("repairTestFrame") : t("repairPreviewFrame")}</button>
              {isVideo ? <>
                <button type="button" className="panel-secondary repair-process-ranges" onClick={() => processRanges()}>{t("repairProcessRanges")}</button>
                <button type="button" className="panel-primary" disabled={!repair.clipPreview || repair.resultDirty} onClick={apply}><Check size={16} />{t("repairApplyVideo")}</button>
              </> : <button type="button" className="panel-primary" onClick={apply}><Check size={16} />{t("repairApplyImage")}</button>}
            </>}
          </div>
        </footer>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}
