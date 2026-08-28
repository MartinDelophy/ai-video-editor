import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, Check, Pause, Play, Waveform, X } from "@phosphor-icons/react";
import { translateRemasterPhase } from "../lib/remasterProgress.js";

const PRESETS = ["auto", "light", "balanced", "strong"];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const formatSeconds = (value) => `${Math.max(0, Number(value) || 0).toFixed(2)}s`;

export function SmartDenoiseDialog({ denoise, segment, t, onApplied }) {
  const stageRef = useRef(null);
  const sourceVideoRef = useRef(null);
  const resultVideoRef = useRef(null);
  const denoiseRef = useRef(denoise);
  const [compare, setCompare] = useState(50);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const duration = Math.max(0.1, Number(segment?.duration) || denoise?.result?.sourceDuration || 5);
  const mediaRatio = Math.max(0.2, Math.min(5, (Number(segment?.width) || 16) / (Number(segment?.height) || 9)));
  const preview = denoise?.result || denoise?.framePreview;
  const localizedPhase = translateRemasterPhase(denoise?.job, t, "denoiseFooterHint");
  denoiseRef.current = denoise;

  useEffect(() => {
    if (!denoise?.dialogOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape" && !denoiseRef.current?.job?.running) denoiseRef.current?.closeDialog?.(); };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [denoise?.dialogOpen, denoise?.job?.running]);

  useEffect(() => {
    if (!denoise?.dialogOpen) return;
    const source = sourceVideoRef.current;
    const result = resultVideoRef.current;
    const rate = Math.max(0.25, Number(segment?.playbackRate) || 1);
    const sourceTime = Math.max(0, Number(segment?.sourceStart) || 0) + currentTime * rate;
    if (source && Math.abs(source.currentTime - sourceTime) > 0.04) source.currentTime = sourceTime;
    if (result && Math.abs(result.currentTime - currentTime * rate) > 0.04) result.currentTime = currentTime * rate;
  }, [currentTime, denoise?.dialogOpen, denoise?.result?.url, segment?.playbackRate, segment?.sourceStart]);

  if (!denoise?.dialogOpen || !segment) return null;
  const moveCompare = (event) => { const rect = stageRef.current?.getBoundingClientRect(); if (rect) setCompare(clamp((event.clientX - rect.left) / Math.max(1, rect.width)) * 100); };
  const beginCompare = (event) => {
    event.preventDefault(); moveCompare(event);
    const stop = () => { window.removeEventListener("pointermove", moveCompare); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", moveCompare); window.addEventListener("pointerup", stop, { once: true });
  };
  const togglePlayback = async () => {
    const source = sourceVideoRef.current;
    if (!source) return;
    if (!source.paused) { source.pause(); resultVideoRef.current?.pause(); setPlaying(false); return; }
    const rate = Math.max(0.25, Number(segment?.playbackRate) || 1);
    source.playbackRate = rate;
    if (resultVideoRef.current) { resultVideoRef.current.currentTime = currentTime * rate; resultVideoRef.current.playbackRate = rate; }
    await Promise.allSettled([source.play(), resultVideoRef.current?.play()]); setPlaying(true);
  };
  const apply = () => { if (denoise.apply()) onApplied?.(); };

  return createPortal(
    <div className="repair-dialog-backdrop" role="presentation">
      <section className="repair-dialog hd-restoration-dialog smart-denoise-dialog" role="dialog" aria-modal="true" aria-labelledby="smart-denoise-title">
        <header className="repair-dialog-header">
          <div><span className="repair-dialog-icon"><Waveform size={20} weight="duotone" /></span><span><strong id="smart-denoise-title">{t("denoiseTitle")}</strong><small>DRUNet · WebGPU / WASM · {t("denoiseBrowserLocal")}</small></span></div>
          <button type="button" aria-label={t("close")} disabled={denoise.job.running} onClick={denoise.closeDialog}><X size={20} /></button>
        </header>
        <div className="repair-dialog-body">
          <main className="repair-dialog-workspace">
            <div className="repair-dialog-toolbar"><div className="hd-restoration-model-chip"><Waveform size={14} weight="fill" /><span>{t("denoiseDetailAware")}</span></div><span>{t("denoisePrivacy")}</span></div>
            <div ref={stageRef} className="repair-dialog-stage hd-restoration-stage" style={{ "--repair-media-ratio": mediaRatio }}>
              <video ref={sourceVideoRef} src={segment.src} muted playsInline preload="auto" onTimeUpdate={(event) => { if (event.currentTarget.paused) return; const start = Math.max(0, Number(segment?.sourceStart) || 0); const rate = Math.max(0.25, Number(segment?.playbackRate) || 1); setCurrentTime(clamp((event.currentTarget.currentTime - start) / rate, 0, duration)); const result = resultVideoRef.current; if (result && Math.abs(result.currentTime - (event.currentTarget.currentTime - start)) > 0.08) result.currentTime = Math.max(0, event.currentTarget.currentTime - start); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
              {preview ? <div className="repair-compare-result" style={{ clipPath: `inset(0 0 0 ${compare}%)` }}>{denoise.result ? <video ref={resultVideoRef} src={denoise.result.url} muted playsInline preload="auto" /> : <img src={denoise.framePreview.url} alt={t("denoisePreviewAlt")} />}</div> : null}
              {preview ? <div className="repair-compare-control" style={{ left: `${compare}%` }}><i /><button type="button" aria-label={t("repairCompare")} onPointerDown={beginCompare}><CaretLeft size={12} /><CaretRight size={12} /></button></div> : null}
              <div className="repair-compare-labels"><span>{t("repairBefore")}</span>{preview ? <span>{t("repairAfter")}</span> : null}</div>
              {!preview && !denoise.job.running ? <div className="hd-restoration-empty"><Waveform size={28} weight="duotone" /><strong>{t("denoiseReadyTitle")}</strong><span>{t("denoiseReadyHint")}</span></div> : null}
              {denoise.job.running ? <div className="hd-restoration-processing"><i /><strong>{localizedPhase}</strong><span>{denoise.job.totalFrames > 0 ? `${denoise.job.frameIndex || 0} / ${denoise.job.totalFrames}` : `${Math.round(denoise.job.progress || 0)}%`}</span></div> : null}
            </div>
            <section className="repair-video-timeline hd-restoration-timeline"><div className="repair-video-time-row"><span><button type="button" aria-label={playing ? t("pause") : t("play")} onClick={togglePlayback}>{playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}</button><strong>{t("denoiseTimeline")}</strong></span><span>{formatSeconds(currentTime)} / {formatSeconds(duration)}</span></div><input aria-label={t("denoiseTimeline")} type="range" min="0" max={duration} step="0.04" value={currentTime} onChange={(event) => setCurrentTime(Number(event.target.value))} /></section>
          </main>
          <aside className="repair-dialog-inspector hd-restoration-inspector smart-denoise-inspector">
            <section><span className="hd-restoration-section-label">{t("denoiseStrength")}</span><h3>{t("denoiseChoosePreset")}</h3><p>{t("denoisePresetHint")}</p></section>
            <div className="smart-denoise-presets">{PRESETS.map((preset) => <button type="button" className={denoise.mode === preset ? "is-active" : ""} key={preset} disabled={denoise.job.running} onClick={() => denoise.setMode(preset)}><strong>{t(`denoisePreset_${preset}`)}</strong><small>{t(`denoisePresetHint_${preset}`)}</small></button>)}</div>
            {denoise.analysis ? <div className="smart-denoise-analysis"><span>{t("denoiseNoiseEstimate")}</span><strong>{Math.round(denoise.analysis.score * 100)}%</strong><small>{t("denoiseAutoStrength").replace("{strength}", `${Math.round(denoise.analysis.strength * 100)}%`)}</small></div> : null}
            <div className="hd-restoration-privacy"><Check size={14} weight="bold" /><span>{t("denoiseSafeNote")}</span></div>
          </aside>
        </div>
        <footer className="repair-dialog-footer">
          <div className="repair-dialog-progress" aria-live="polite">{denoise.job.progress > 0 ? <><span>{localizedPhase} · {Math.round(denoise.job.progress)}%</span><i><b style={{ width: `${clamp(denoise.job.progress, 0, 100)}%` }} /></i></> : <span>{t("denoiseFooterHint")}</span>}</div>
          <div>{denoise.job.running ? <button type="button" className="panel-secondary is-danger" onClick={denoise.cancel}>{t("denoiseCancel")}</button> : <><button type="button" className="panel-secondary" onClick={() => denoise.runFrame(sourceVideoRef.current)}>{t("denoisePreviewFrame")}</button><button type="button" className="panel-secondary" onClick={() => denoise.runClip(sourceVideoRef.current)}>{denoise.result ? t("denoiseRunAgain") : t("denoiseRunClip")}</button><button type="button" className="panel-primary" disabled={!denoise.result} onClick={apply}><Check size={16} />{t("denoiseApply")}</button></>}</div>
        </footer>
      </section>
    </div>, document.body,
  );
}
