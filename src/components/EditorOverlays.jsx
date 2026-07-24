import { useEffect, useState } from "react";
import { translateRemasterPhase } from "../lib/remasterProgress.js";
import { formatClock } from "../lib/timeline.js";

export function AssetDragPreview({ preview, t }) {
  if (!preview) return null;
  const label = preview.type === "audio" ? t("assetAudio") : preview.type === "video" ? t("assetVideo") : preview.type === "sticker" ? t("assetSticker") : t("assetImage");
  return <div className={`asset-drag-preview type-${preview.type}`} style={{ left: preview.x, top: preview.y }}>
    {preview.src ? <div className="asset-drag-thumb">
      {preview.type === "video" ? <video src={preview.src} muted playsInline preload="metadata" draggable={false} />
        : preview.type === "audio" ? <span>{label}</span> : <img src={preview.src} alt="" draggable={false} />}
    </div> : null}
    <span>{label}</span><strong>{preview.name}</strong>
  </div>;
}

export function ExportProgressOverlay({ exporting, percent, phase, elapsedSeconds, onCancel, canceling, t }) {
  if (!exporting) return null;
  return <div className="export-progress-overlay" role="dialog" aria-modal="true" aria-labelledby="export-progress-title"><div className="export-progress-card">
    <div className="export-progress-header"><span id="export-progress-title">{t("exportInProgress")}</span><strong>{percent}%</strong></div>
    <div className="export-progress-bar" role="progressbar" aria-label={t("exportProgress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ width: `${percent}%` }} />
    </div>
    <div className="export-progress-meta"><span>{phase || t("preparingExport")}</span><span>{formatClock(elapsedSeconds)}</span></div>
    {percent < 100 ? (
      <button className="export-progress-cancel" type="button" disabled={canceling} onClick={onCancel}>
        {canceling ? t("exportCanceling") : t("exportCancel")}
      </button>
    ) : null}
  </div></div>;
}

export function RemasterProgressOverlay({ job, onCancel, t }) {
  const active = Boolean(job?.running && job?.mode === "clip");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!active) return null;
  const percent = Math.max(0, Math.min(100, Math.round(job.progress || 0)));
  const elapsedSeconds = Math.max(0, Math.floor((now - (job.startedAt || now)) / 1000));
  const frameText = job.totalFrames > 0
    ? t("remasterClipProgressFrames").replace("{current}", String(job.frameIndex || 0)).replace("{total}", String(job.totalFrames))
    : job.phase || t("remasterClipPreparing");
  const backendText = job.backend === "webgpu" ? t("remasterGpuActive") : job.backend === "wasm" ? t("remasterCpuFallback") : t("remasterGpuAuto");
  const phaseText = translateRemasterPhase(job, t);
  return <div className="remaster-progress-overlay" role="dialog" aria-modal="true" aria-labelledby="remaster-progress-title">
    <div className="remaster-progress-card">
      <div className="remaster-progress-orbit" aria-hidden="true"><span /></div>
      <div className="remaster-progress-copy">
        <div className="remaster-progress-header"><span id="remaster-progress-title">{t("remasterClipProgressTitle")}</span><strong>{percent}%</strong></div>
        <div className="remaster-progress-bar" role="progressbar" aria-label={t("remasterClipProgressTitle")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
        <div className="remaster-progress-detail"><strong>{phaseText}</strong><span>{backendText} · {frameText} · {formatClock(elapsedSeconds)}</span></div>
        <p>{t("remasterClipProgressSafe")}</p>
        <button type="button" onClick={onCancel}>{job.phaseKey === "remasterCanceling" || job.phase === t("remasterCanceling") ? t("remasterCanceling") : t("remasterCancel")}</button>
      </div>
    </div>
  </div>;
}
