import { useEffect, useState } from "react";
import { FileArrowDown } from "@phosphor-icons/react";

import {
  formatEstimatedFileSize,
  getExportEstimate,
  getExportFormatProfile,
  getExportRuntimeCapabilities,
  getExportTechnicalSummary,
  probeExportRuntimeCapabilities,
} from "../lib/exportSettings.js";

const VIDEO_BITRATE_OPTIONS = [
  ["auto", 0],
  ["5", 5_000_000],
  ["8", 8_000_000],
  ["12", 12_000_000],
  ["20", 20_000_000],
  ["40", 40_000_000],
];

const SIMPLE_EXPORT_DEFAULTS = Object.freeze({
  frameRate: 30,
  quality: "high",
  pipeline: "auto",
  audio: "mix",
  captions: "burned",
  range: "full",
  keyFrameInterval: 2,
});

const withSimpleExportDefaults = (settings) => ({
  ...settings,
  ...SIMPLE_EXPORT_DEFAULTS,
});

export function ExportSettingsPanel({
  t,
  ratio,
  imageSrc,
  timelineDuration,
  exportSettings,
  setExportSettings,
  handleExportVideo,
  onClose,
}) {
  const summary = getExportTechnicalSummary(exportSettings, ratio);
  const estimate = getExportEstimate({ ...exportSettings, range: "full" }, ratio, timelineDuration);
  const format = getExportFormatProfile(exportSettings.codec);
  const selectedVideoBitrate = exportSettings.bitrateMode === "custom"
    ? String(Math.round((Number(exportSettings.customVideoBitsPerSecond) || 12_000_000) / 1_000_000))
    : "auto";
  const [capabilities, setCapabilities] = useState(() => getExportRuntimeCapabilities());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    setChecking(true);
    probeExportRuntimeCapabilities(withSimpleExportDefaults(exportSettings), ratio).then((next) => {
      if (!active) return;
      setCapabilities(next);
      setChecking(false);
    });
    return () => { active = false; };
  }, [exportSettings, ratio]);

  const runtimeAvailable = exportSettings.codec === "h264-mov"
    ? capabilities.deterministic
    : capabilities.deterministic || capabilities.compatible;
  const update = (patch) => setExportSettings((current) => withSimpleExportDefaults({ ...current, ...patch }));

  return (
    <>
      <div className="export-settings-card export-settings-card-simple">
        <div className="export-settings-heading">
          <div><strong>{t("videoExport")}</strong><small>{t("videoExportHint")}</small></div>
          <span>{format.container}</span>
        </div>

        <label className="export-setting-field">
          <span>{t("exportFileName")}</span>
          <input
            maxLength={96}
            value={exportSettings.fileName || ""}
            placeholder="ai-voiceover"
            onChange={(event) => update({ fileName: event.target.value })}
          />
        </label>

        <div className="export-setting-grid">
          <label className="export-setting-field">
            <span>{t("exportResolution")}</span>
            <select value={exportSettings.resolution} onChange={(event) => update({ resolution: event.target.value })}>
              <option value="720">720p</option>
              <option value="1080">1080p</option>
              <option value="1440">2K</option>
              <option value="2160">4K</option>
            </select>
          </label>
          <label className="export-setting-field">
            <span>{t("exportFormat")}</span>
            <select value={exportSettings.codec} onChange={(event) => update({ codec: event.target.value })}>
              <option value="h264">MP4 · H.264</option>
              <option value="h264-mov">MOV · H.264</option>
              <option value="vp9">WebM · VP9</option>
              <option value="vp8">WebM · VP8</option>
            </select>
          </label>
        </div>

        <div className="export-setting-grid">
          <label className="export-setting-field">
            <span>{t("exportVideoBitrate")}</span>
            <select value={selectedVideoBitrate} onChange={(event) => {
              const option = VIDEO_BITRATE_OPTIONS.find(([id]) => id === event.target.value);
              update(option?.[0] === "auto"
                ? { bitrateMode: "auto" }
                : { bitrateMode: "custom", customVideoBitsPerSecond: option?.[1] || 12_000_000 });
            }}>
              {VIDEO_BITRATE_OPTIONS.map(([id]) => (
                <option key={id} value={id}>{id === "auto" ? t("exportBitrateAuto") : `${id} Mbps`}</option>
              ))}
            </select>
          </label>
          <label className="export-setting-field">
            <span>{t("exportAudioBitrate")}</span>
            <select
              value={exportSettings.audioBitsPerSecond || 192_000}
              onChange={(event) => update({ audioBitsPerSecond: Number(event.target.value) })}
            >
              <option value="128000">128 kbps</option>
              <option value="192000">192 kbps</option>
              <option value="256000">256 kbps</option>
              <option value="320000">320 kbps</option>
            </select>
          </label>
        </div>

        <div className="export-technical-summary export-technical-summary-simple">
          <span>{summary.width} × {summary.height}</span>
          <span>30 fps</span>
          <span>{summary.bitrateMbps} Mbps</span>
          <span>{format.video} + {format.audio}</span>
          <span>≈ {formatEstimatedFileSize(estimate.estimatedBytes)}</span>
          <span>{timelineDuration.toFixed(1)}s</span>
        </div>
        <div className="export-settings-note">
          {t(exportSettings.codec === "h264-mov"
            ? runtimeAvailable ? "exportPipelineDeterministicHint" : "exportRuntimeUnavailable"
            : "exportPipelineAutoHint")}
        </div>
      </div>
      <div className="export-settings-footer">
        <button
          className="export-confirm-button"
          type="button"
          disabled={!imageSrc || checking || !runtimeAvailable || timelineDuration <= 0}
          onClick={() => {
            onClose();
            handleExportVideo({
              settings: withSimpleExportDefaults(exportSettings),
            });
          }}
        >
          <FileArrowDown size={17} weight="bold" />
          {imageSrc ? t("startExport") : t("addVisualBeforeExport")}
        </button>
      </div>
    </>
  );
}
