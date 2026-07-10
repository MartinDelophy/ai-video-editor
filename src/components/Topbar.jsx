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
                文件 <CaretDown size={13} />
              </button>
              {showFileMenu ? (
                <Popover className="project-file-popover" onClose={() => setShowFileMenu(false)}>
                  <div className="file-menu-card">
                    <div className="file-menu-heading">
                      <span>工程</span>
                      <small>Timeline Studio</small>
                    </div>
                    <button className="file-menu-action file-menu-new" type="button" onClick={handleNewProject}>
                      <span className="file-menu-icon"><FilePlus size={17} /></span>
                      <span className="file-menu-copy"><strong>新建工程</strong><small>从空白时间线开始</small></span>
                    </button>
                    <div className="file-menu-divider" />
                    <button className="file-menu-action" type="button" onClick={() => handleImportProject()}>
                      <span className="file-menu-icon"><FileArrowUp size={17} /></span>
                      <span className="file-menu-copy"><strong>导入工程包</strong><small>恢复时间线与全部媒体</small></span>
                      <span className="file-menu-format">.timeline</span>
                    </button>
                    <button className="file-menu-action is-primary" type="button" onClick={handleExportProject}>
                      <span className="file-menu-icon"><FileArrowDown size={17} /></span>
                      <span className="file-menu-copy"><strong>导出工程包</strong><small>打包图片、视频和音频</small></span>
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
        <button className="export-button" type="button" disabled={!imageSrc || exporting} onClick={handleExportVideo}>
          <FileArrowDown size={17} weight="bold" />
          {exporting ? t("exporting") : t("exportMp4")}
        </button>
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
