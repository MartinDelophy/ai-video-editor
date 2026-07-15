import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  FileArrowDown,
  FileArrowUp,
  FilePlus,
  GearSix,
  Pause,
  Play,
  ShieldCheck,
  SlidersHorizontal,
} from "@phosphor-icons/react";

import { RATIO_OPTIONS } from "../config/editor.js";
import { APP_LANGUAGES, saveLanguagePreference } from "../i18n.js";
import { IconButton, Popover } from "./ui.jsx";

export function Topbar({
  t,
  compactRail,
  setCompactRail,
  lastSaved,
  undo,
  redo,
  ratio,
  ratioId,
  showRatioMenu,
  setShowRatioMenu,
  setRatioId,
  notify,
  isPlaying,
  handlePlayToggle,
  imageSrc,
  exporting,
  handleExportVideo,
  showExportMenu,
  setShowExportMenu,
  exportSettings,
  setExportSettings,
  showSettings,
  setShowSettings,
  activeLanguage,
  setUiLanguage,
  captionsEnabled,
  setCaptionsEnabled,
  trackVisibility,
  toggleTrackVisibility,
  showFileMenu,
  setShowFileMenu,
  handleNewProject,
  handleExportProject,
  handleImportProject,
  projectFileInputRef,
}) {
  return (
    <header className="topbar">
      <div className="project-cluster">
        <IconButton label={t("collapseSidebar")} active={compactRail} onClick={() => setCompactRail((v) => !v)}>
          <SlidersHorizontal size={19} />
        </IconButton>
        <div>
          <div className="project-title-row">
            <div className="project-title">{t("projectTitle")}</div>
            <div className="menu-anchor">
              <button className="project-file-button" type="button" onClick={() => setShowFileMenu((open) => !open)}>
                {t("fileMenu")} <CaretDown size={13} />
              </button>
              {showFileMenu ? (
                <Popover className="project-file-popover" onClose={() => setShowFileMenu(false)}>
                  <div className="file-menu-card">
                    <div className="file-menu-heading">
                      <span>{t("projectMenuHeading")}</span>
                      <small>Timeline Studio</small>
                    </div>
                    <button className="file-menu-action file-menu-new" type="button" onClick={handleNewProject}>
                      <span className="file-menu-icon"><FilePlus size={17} /></span>
                      <span className="file-menu-copy"><strong>{t("newProject")}</strong><small>{t("newProjectHint")}</small></span>
                    </button>
                    <div className="file-menu-divider" />
                    <button className="file-menu-action" type="button" onClick={() => handleImportProject()}>
                      <span className="file-menu-icon"><FileArrowUp size={17} /></span>
                      <span className="file-menu-copy"><strong>{t("importProject")}</strong><small>{t("importProjectHint")}</small></span>
                      <span className="file-menu-format">.timeline</span>
                    </button>
                    <button className="file-menu-action is-primary" type="button" onClick={handleExportProject}>
                      <span className="file-menu-icon"><FileArrowDown size={17} /></span>
                      <span className="file-menu-copy"><strong>{t("exportProject")}</strong><small>{t("exportProjectHint")}</small></span>
                      <span className="file-menu-format">.timeline</span>
                    </button>
                  </div>
                </Popover>
              ) : null}
              <input ref={projectFileInputRef} className="project-file-input" type="file" accept="application/zip,.timeline" onChange={(event) => event.target.files?.[0] && handleImportProject(event.target.files[0])} />
            </div>
          </div>
          <div className="autosave">
            <ShieldCheck size={13} weight="fill" />
            {t("autosave")} · {lastSaved}
          </div>
        </div>
      </div>

      <div className="topbar-center">
        <button className="ghost-action" type="button" onClick={undo}>
          <ArrowCounterClockwise size={16} />
          {t("undo")}
        </button>
        <button className="ghost-action" type="button" onClick={redo}>
          <ArrowClockwise size={16} />
          {t("redo")}
        </button>
        <span className="divider" />
        <div className="menu-anchor">
          <button
            className="ratio-select"
            type="button"
            onClick={() => setShowRatioMenu((open) => !open)}
          >
            {ratio.label} <CaretDown size={14} />
          </button>
          {showRatioMenu ? (
            <Popover onClose={() => setShowRatioMenu(false)}>
              <div className="menu-list">
                {RATIO_OPTIONS.map((option) => (
                  <button
                    type="button"
                    className={option.id === ratioId ? "is-selected" : ""}
                    key={option.id}
                    onClick={() => {
                      setRatioId(option.id);
                      setShowRatioMenu(false);
                      notify(`画布比例已切换为 ${option.label}`);
                    }}
                  >
                    {option.label}
                    <span>
                      {option.width} x {option.height}
                    </span>
                  </button>
                ))}
              </div>
            </Popover>
          ) : null}
        </div>
      </div>

      <div className="topbar-actions">
        <button className="preview-button" type="button" onClick={handlePlayToggle}>
          {isPlaying ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
          {t("preview")}
        </button>
        <div className="menu-anchor">
          <button className="export-button" type="button" disabled={exporting} onClick={() => setShowExportMenu((open) => !open)}>
            <FileArrowDown size={17} weight="bold" />
            {exporting ? t("exporting") : t("exportVideo")}
            {!exporting ? <CaretDown size={13} weight="bold" /> : null}
          </button>
          {showExportMenu ? (
            <Popover className="export-settings-popover" onClose={() => setShowExportMenu(false)}>
              <div className="export-settings-card">
                <div className="export-settings-heading"><div><strong>{t("videoExport")}</strong><small>{t("videoExportHint")}</small></div><span>{exportSettings.codec === "h264" ? "MP4" : "WebM"}</span></div>
                <div className="export-setting-field">
                  <span>{t("exportResolution")}</span>
                  <select value={exportSettings.resolution} onChange={(event) => setExportSettings((value) => ({ ...value, resolution: event.target.value }))}>
                    <option value="720">720p · {t("resolutionHd")}</option><option value="1080">1080p · {t("resolutionFullHd")}</option><option value="1440">2K · {t("resolutionQhd")}</option><option value="2160">4K · {t("resolutionUhd")}</option>
                  </select>
                </div>
                <div className="export-setting-grid">
                  <label className="export-setting-field"><span>{t("exportFrameRate")}</span><select value={exportSettings.frameRate} onChange={(event) => setExportSettings((value) => ({ ...value, frameRate: Number(event.target.value) }))}><option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
                  <label className="export-setting-field"><span>{t("exportCodec")}</span><select value={exportSettings.codec} onChange={(event) => setExportSettings((value) => ({ ...value, codec: event.target.value }))}><option value="h264">H.264 · MP4</option><option value="vp9">VP9 · WebM</option><option value="vp8">VP8 · WebM</option></select></label>
                </div>
                <div className="export-setting-field"><span>{t("exportQuality")}</span><div className="export-quality-options">{[["standard", "exportQualityStandard"], ["high", "exportQualityHigh"], ["ultra", "exportQualityUltra"]].map(([id, labelKey]) => <button className={exportSettings.quality === id ? "is-selected" : ""} type="button" key={id} onClick={() => setExportSettings((value) => ({ ...value, quality: id }))}>{t(labelKey)}</button>)}</div></div>
                <div className="export-settings-note">{t("exportQualityHint")}</div>
                <button className="export-confirm-button" type="button" disabled={!imageSrc} onClick={() => { setShowExportMenu(false); handleExportVideo(); }}><FileArrowDown size={17} weight="bold" />{imageSrc ? t("startExport") : t("addVisualBeforeExport")}</button>
              </div>
            </Popover>
          ) : null}
        </div>
        <div className="menu-anchor">
          <IconButton label={t("settings")} active={showSettings} onClick={() => setShowSettings((open) => !open)}>
            <GearSix size={19} />
          </IconButton>
          {showSettings ? (
            <Popover onClose={() => setShowSettings(false)}>
              <div className="settings-panel">
                <strong>{t("exportSettings")}</strong>
                <label>
                  <span>{t("language")}</span>
                  <select
                    value={activeLanguage}
                    onChange={(event) => {
                      const nextLanguage = event.target.value;
                      saveLanguagePreference(nextLanguage);
                      setUiLanguage(nextLanguage);
                    }}
                  >
                    {APP_LANGUAGES.map((language) => (
                      <option value={language.id} key={language.id}>
                        {language.nativeName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={captionsEnabled}
                    onChange={(event) => setCaptionsEnabled(event.target.checked)}
                  />
                  {t("exportCaptions")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={trackVisibility.audio}
                    onChange={() => toggleTrackVisibility("audio")}
                  />
                  {t("enableAudioTrack")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={trackVisibility.source}
                    onChange={() => toggleTrackVisibility("source")}
                  />
                  {t("enableSourceTrack")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={trackVisibility.music}
                    onChange={() => toggleTrackVisibility("music")}
                  />
                  {t("enableMusicTrack")}
                </label>
                <button type="button" onClick={() => notify("模型会由浏览器自动缓存到本地存储")}>
                  {t("checkModelCache")}
                </button>
              </div>
            </Popover>
          ) : null}
        </div>
      </div>
    </header>
  );
}
