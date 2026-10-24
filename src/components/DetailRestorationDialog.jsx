import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, Check, Pause, Play, Scan, Sparkle, X } from "@phosphor-icons/react";

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function formatSeconds(value) {
  return `${Math.max(0, Number(value) || 0).toFixed(2)}s`;
}

export function DetailRestorationDialog({ restoration, segment, t, onApplied }) {
  const stageRef = useRef(null);
  const sourceVideoRef = useRef(null);
  const resultVideoRef = useRef(null);
  const restorationRef = useRef(restoration);
  const [compare, setCompare] = useState(50);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const isVideo = segment?.type === "video";
  const duration = Math.max(0.1, Number(segment?.duration) || restoration?.result?.sourceDuration || 5);
  const mediaRatio = Math.max(0.2, Math.min(5, (Number(segment?.width) || 16) / (Number(segment?.height) || 9)));
  const result = restoration?.result;
  restorationRef.current = restoration;
  const activeBackend = restoration?.job?.running ? restoration.job.backend : result?.backend;
  const phaseLabel = String(t(restoration?.job?.phaseKey || "", restoration?.job?.phaseKey || ""))
    .replace(/\{(\w+)\}/g, (match, key) => restoration?.job?.phaseParams?.[key] ?? match);

  useEffect(() => {
    if (!restoration?.dialogOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !restorationRef.current?.job?.running) restorationRef.current?.closeDialog?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [restoration?.dialogOpen, restoration?.job?.running]);

  useEffect(() => {
    if (!restoration?.dialogOpen || !isVideo) return;
    const source = sourceVideoRef.current;
    const restored = resultVideoRef.current;
    const sourceStart = Math.max(0, Number(segment?.sourceStart) || 0);
    const playbackRate = Math.max(0.25, Number(segment?.playbackRate) || 1);
    const sourceTarget = sourceStart + currentTime * playbackRate;
    if (source && Math.abs(source.currentTime - sourceTarget) > 0.04) source.currentTime = sourceTarget;
    if (restored && Math.abs(restored.currentTime - currentTime * playbackRate) > 0.04) {
      restored.currentTime = currentTime * playbackRate;
    }
  }, [currentTime, isVideo, restoration?.dialogOpen, result?.url, segment?.playbackRate, segment?.sourceStart]);

  useEffect(() => {
    if (!restoration?.dialogOpen) return undefined;
    setCurrentTime(0);
    setPlaying(false);
    const source = sourceVideoRef.current;
    const restored = resultVideoRef.current;
    return () => { source?.pause(); restored?.pause(); };
  }, [restoration?.dialogOpen, segment?.id]);

  if (!restoration?.dialogOpen || !segment) return null;

  const moveCompare = (event) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) setCompare(clamp((event.clientX - rect.left) / Math.max(1, rect.width)) * 100);
  };

  const beginCompare = (event) => {
    event.preventDefault();
    moveCompare(event);
    const stop = () => {
      window.removeEventListener("pointermove", moveCompare);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", moveCompare);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const togglePlayback = async () => {
    const source = sourceVideoRef.current;
    if (!source) return;
    if (!source.paused) {
      source.pause();
      resultVideoRef.current?.pause();
      setPlaying(false);
      return;
    }
    const rate = Math.max(0.25, Number(segment?.playbackRate) || 1);
    const sourceStart = Math.max(0, Number(segment?.sourceStart) || 0);
    const restart = currentTime >= duration - 0.04 || source.ended;
    const time = restart ? 0 : currentTime;
    if (restart) setCurrentTime(0);
    source.currentTime = sourceStart + time * rate;
    // Image-only processing: use exactly one original audio stream for both views.
    source.muted = false;
    source.volume = 1;
    source.playbackRate = rate;
    if (resultVideoRef.current) {
      resultVideoRef.current.currentTime = time * rate;
      resultVideoRef.current.playbackRate = rate;
    }
    await Promise.allSettled([source.play(), resultVideoRef.current?.play()]);
    setPlaying(!source.paused);
  };

  const apply = () => {
    if (restoration.apply()) onApplied?.();
  };

  return createPortal(
    <div className="repair-dialog-backdrop" role="presentation">
      <section className="repair-dialog hd-restoration-dialog" role="dialog" aria-modal="true" aria-labelledby="hd-restoration-title">
        <header className="repair-dialog-header">
          <div>
            <span className="repair-dialog-icon"><Scan size={20} weight="duotone" /></span>
            <span>
              <strong id="hd-restoration-title">{t("hdRestoreDialogTitle")}</strong>
              <small>{isVideo ? t("hdRestoreVideoMode") : t("hdRestoreImageMode")}</small>
            </span>
          </div>
          <button type="button" aria-label={t("close")} disabled={restoration.job.running} onClick={restoration.closeDialog}><X size={20} /></button>
        </header>

        <div className="repair-dialog-body">
          <main className="repair-dialog-workspace">
            <div className="repair-dialog-toolbar">
              <div className="hd-restoration-model-chip"><Sparkle size={14} weight="fill" /><span>{t("detailEnhancementTitle")}</span></div>
              <span>{t("hdRestoreLocalOnly")}{activeBackend === "webgpu" ? " · WebGPU" : activeBackend === "cpu" ? " · CPU" : ""}</span>
            </div>

            <div ref={stageRef} className="repair-dialog-stage hd-restoration-stage" style={{ "--repair-media-ratio": mediaRatio }}>
              {isVideo ? (
                <video
                  ref={sourceVideoRef}
                  src={segment.src}
                  playsInline
                  preload="auto"
                  onTimeUpdate={(event) => {
                    if (event.currentTarget.paused) return;
                    const sourceStart = Math.max(0, Number(segment?.sourceStart) || 0);
                    const rate = Math.max(0.25, Number(segment?.playbackRate) || 1);
                    const time = (event.currentTarget.currentTime - sourceStart) / rate;
                    setCurrentTime(clamp(time, 0, duration));
                    if (time >= duration) {
                      event.currentTarget.pause();
                      resultVideoRef.current?.pause();
                      setPlaying(false);
                      return;
                    }
                    const restored = resultVideoRef.current;
                    if (restored && Math.abs(restored.currentTime - (event.currentTarget.currentTime - sourceStart)) > 0.08) {
                      restored.currentTime = Math.max(0, event.currentTarget.currentTime - sourceStart);
                    }
                  }}
                  onPause={() => { resultVideoRef.current?.pause(); setPlaying(false); }}
                  onEnded={() => { resultVideoRef.current?.pause(); setPlaying(false); }}
                />
              ) : <img src={segment.src} alt={segment.name || ""} />}

              {result ? <div className="repair-compare-result" style={{ clipPath: `inset(0 0 0 ${compare}%)` }}>
                {isVideo
                  ? <video ref={resultVideoRef} src={result.url} muted playsInline preload="auto" />
                  : <img src={result.url} alt={t("hdRestorePreviewAlt")} />}
              </div> : null}

              {result ? <div className="repair-compare-control" style={{ left: `${compare}%` }}>
                <i />
                <button type="button" aria-label={t("repairCompare")} onPointerDown={beginCompare}><CaretLeft size={12} /><CaretRight size={12} /></button>
              </div> : null}
              <div className="repair-compare-labels"><span>{t("repairBefore")}</span>{result ? <span>{t("repairAfter")}</span> : null}</div>
              {!result && !restoration.job.running ? <div className="hd-restoration-empty">
                <Scan size={28} weight="duotone" />
                <strong>{t("hdRestoreReadyTitle")}</strong>
                <span>{t("hdRestoreReadyHint")}</span>
              </div> : null}
              {restoration.job.running ? <div className="hd-restoration-processing"><i /><strong>{phaseLabel}</strong><span>{restoration.job.totalFrames > 0
                ? t("hdRestoreFramesProgress").replace("{current}", String(restoration.job.frameIndex || 0)).replace("{total}", String(restoration.job.totalFrames))
                : `${Math.round(restoration.job.progress || 0)}%`}</span></div> : null}
            </div>

            {isVideo ? <section className="repair-video-timeline hd-restoration-timeline">
              <div className="repair-video-time-row">
                <span><button type="button" aria-label={playing ? t("pause") : t("play")} onClick={togglePlayback}>{playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}</button><strong>{t("hdRestoreVideoTimeline")}</strong></span>
                <span>{formatSeconds(currentTime)} / {formatSeconds(duration)}</span>
              </div>
              <input aria-label={t("hdRestoreVideoTimeline")} type="range" min="0" max={duration} step="0.04" value={currentTime} onChange={(event) => setCurrentTime(Number(event.target.value))} />
            </section> : <div className="hd-restoration-image-meta">{segment.width}×{segment.height}<span>→</span>{result ? `${result.width}×${result.height}` : t("hdRestoreOutputPending")}</div>}
          </main>

          <aside className="repair-dialog-inspector hd-restoration-inspector">
            <section>
              <span className="hd-restoration-section-label">{t("hdRestoreCapability")}</span>
              <h3>{t("detailEnhancementTitle")}</h3>
              <p>{t("detailEnhancementHint")}</p>
            </section>
            <section className="detail-enhancement-controls">
              {["depth", "edges"].map((key) => <label key={key}>
                <span>{t(key === "depth" ? "detailDepth" : "detailEdges")}<output>{restoration.settings[key]}%</output></span>
                <input type="range" min="0" max="100" step="1" value={restoration.settings[key]} disabled={restoration.job.running} onChange={(event) => restoration.setSettings((current) => ({ ...current, [key]: Number(event.target.value) }))} />
              </label>)}
              <button type="button" className="panel-secondary" disabled={restoration.job.running} onClick={() => restoration.setSettings({ depth: 0, edges: 0 })}>{t("detailReset")}</button>
              <p aria-live="polite">{t(restoration.settingsDirty ? "detailSettingsChanged" : "detailRegenerateHint")}</p>
            </section>
            <div className="hd-restoration-privacy"><Check size={14} weight="bold" /><span>{t("hdRestorePrivacy")}</span></div>
            <p className="repair-dialog-hint">{isVideo ? t("hdRestoreVideoHint") : t("hdRestoreImageHint")}</p>
          </aside>
        </div>

        <footer className="repair-dialog-footer">
          <div className="repair-dialog-progress" aria-live="polite">
            {restoration.job.progress > 0 ? <>
              <span>{phaseLabel} · {Math.round(restoration.job.progress)}%{restoration.job.totalFrames > 0
                ? ` · ${t("hdRestoreFramesProgress").replace("{current}", String(restoration.job.frameIndex || 0)).replace("{total}", String(restoration.job.totalFrames))}`
                : ""}</span>
              <i><b style={{ width: `${clamp(restoration.job.progress, 0, 100)}%` }} /></i>
            </> : <span>{t("hdRestoreSafeNote")}</span>}
          </div>
          <div>
            {restoration.job.running
              ? <button type="button" className="panel-secondary is-danger" onClick={restoration.cancel}>{t("hdRestoreCancel")}</button>
              : <>
                <button type="button" className="panel-secondary" onClick={restoration.closeDialog}>{t("repairCancel")}</button>
                <button type="button" className="panel-secondary" onClick={restoration.run}>{result ? t("hdRestoreRunAgain") : t("hdRestoreStart")}</button>
                <button type="button" className="panel-primary" disabled={!result || restoration.settingsDirty} onClick={apply}><Check size={16} />{t("hdRestoreApply")}</button>
              </>}
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
