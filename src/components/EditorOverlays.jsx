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

export function ExportProgressOverlay({ exporting, percent, phase, elapsedSeconds, t }) {
  if (!exporting) return null;
  return <div className="export-progress-overlay" role="status" aria-live="polite"><div className="export-progress-card">
    <div className="export-progress-header"><span>{t("exportInProgress")}</span><strong>{percent}%</strong></div>
    <div className="export-progress-bar" role="progressbar" aria-label={t("exportProgress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ width: `${percent}%` }} />
    </div>
    <div className="export-progress-meta"><span>{phase || t("preparingExport")}</span><span>{formatClock(elapsedSeconds)}</span></div>
  </div></div>;
}
