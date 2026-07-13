import { useEffect, useMemo, useRef, useState } from "react";

import {
  BoundingBox,
  CaretDown,
  Check,
  CloudArrowUp,
  ClosedCaptioning,
  Crop,
  DownloadSimple,
  MicrophoneStage,
  MusicNote,
  Pause,
  PersonSimpleRun,
  Scan,
  SelectionBackground,
  Target,
  Trash,
  Waveform,
} from "@phosphor-icons/react";

import {
  EFFECT_OPTIONS,
  FILTER_OPTIONS,
  SAMPLE_IMAGE,
  STICKERS,
  STICKER_CATEGORIES,
  STICKER_PAGE_SIZE,
  TRANSITIONS,
  VOICES,
} from "../config/editor.js";
import { APP_LANGUAGES } from "../i18n.js";
import { formatClock, formatTime, getSegmentStartTime } from "../lib/timeline.js";
import { Popover } from "./ui.jsx";

export function LanguageIntro({ t, closing, onChoose }) {
  return (
    <div className={`language-intro ${closing ? "is-closing" : ""}`} role="dialog" aria-modal="true">
      <div className="language-intro-card">
        <div className="language-intro-preview" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>{t("languageKicker")}</p>
        <h1>
          <span className="language-title-en">Choose interface language</span>
          <span className="language-title-local">{t("languageTitle")}</span>
        </h1>
        <span className="language-intro-copy">
          <strong>Pick a language. This choice will be saved for next time.</strong>
          <span>{t("languageSubtitle")}</span>
        </span>
        <div className="language-grid">
          {APP_LANGUAGES.map((language) => (
            <button type="button" key={language.id} onClick={() => onChoose(language.id)}>
              <strong>{language.nativeName}</strong>
              <span>{language.hint}</span>
            </button>
          ))}
        </div>
        <small>{t("languageSaved")}</small>
      </div>
    </div>
  );
}

export function MediaPanel({
  t,
  mediaTab,
  setMediaTab,
  isDragging,
  setIsDragging,
  fileInputRef,
  handleFiles,
  selectedLibraryAssetId,
  builtInAssets,
  userAssets,
  deleteUserAsset,
  draggedAssetId,
  handleAssetPointerDown,
  handleAssetClick,
}) {
  const assets = mediaTab === "library" ? builtInAssets : userAssets;
  const renderAssetList = (items, { deletable = false } = {}) => (
    <div className={`asset-list ${mediaTab === "upload" ? "upload-assets" : ""}`}>
      {items.length ? (
        items.map((asset) => (
          <div
            className={`asset-row-wrap ${draggedAssetId === asset.id ? "is-dragging" : ""}`}
            key={asset.id}
          >
            <button
              type="button"
              className="asset-row-button"
              onPointerDown={(event) => handleAssetPointerDown(event, asset)}
              onClick={(event) => handleAssetClick(event, asset)}
            >
              <AssetRow asset={asset} selected={asset.id === selectedLibraryAssetId} t={t} />
            </button>
            {deletable ? (
              <button
                className="asset-delete"
                type="button"
                aria-label={t("deleteAsset")}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteUserAsset(asset);
                }}
              >
                <Trash size={15} />
              </button>
            ) : null}
          </div>
        ))
      ) : (
        <div className="empty-state">{t("emptyAssets")}</div>
      )}
    </div>
  );

  return (
    <>
      <div className="tabs">
        {[
          ["upload", t("uploadTab")],
          ["library", t("libraryTab")],
          ["mine", t("mineTab")],
        ].map(([id, label]) => (
          <button className={mediaTab === id ? "is-active" : ""} type="button" key={id} onClick={() => setMediaTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {mediaTab === "upload" ? (
        <>
          <button
            className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <CloudArrowUp size={42} />
            <strong>{t("uploadDropTitle")}</strong>
            <span>{t("uploadSupport")}</span>
          </button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg"
            multiple
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />

          {renderAssetList(userAssets, { deletable: true })}
        </>
      ) : (
        renderAssetList(assets, { deletable: mediaTab === "mine" })
      )}
    </>
  );
}

function AssetRow({ asset, selected, t }) {
  return (
    <div className={`asset-card ${selected ? "is-selected" : ""}`}>
      <div className="asset-thumb">
        {asset.type === "video" ? (
          <video src={asset.src} muted playsInline preload="metadata" draggable={false} />
        ) : asset.type === "audio" ? (
          <div className="asset-audio-thumb">
            <MusicNote size={28} weight="duotone" />
          </div>
        ) : (
          <img src={asset.src} alt="" draggable={false} />
        )}
        <span>
          {asset.type === "audio"
            ? t("assetAudio")
            : asset.type === "video"
              ? t("assetVideo")
              : t("assetImage")}
        </span>
      </div>
      <div>
        <strong>{asset.name}</strong>
        <span>{asset.meta}</span>
      </div>
    </div>
  );
}

export function ToolPanel(props) {
  const {
    activeTool,
    uiLanguage,
    script,
    updateScript,
    segments,
    currentSegmentIndex,
    captionSegments,
    captionTargetDuration,
    selectedCaptionSegment,
    selectedSegmentId,
    setSelectedSegmentId,
    updateCaptionSegmentText,
    toggleCaptionSegmentHidden,
    deleteCaptionSegment,
    seekTo,
    estimatedDuration,
    captionPosition,
    setCaptionPosition,
    captionSize,
    setCaptionSize,
    captionStyle,
    setCaptionStyle,
    captionsEnabled,
    setCaptionsEnabled,
    selectedFilterId,
    setSelectedFilterId,
    selectedTransitionId,
    setSelectedTransitionId,
    selectedStickerId,
    setSelectedStickerId,
    handleStickerPointerDown,
    handleStickerClick,
    audioBlob,
    audioDuration,
    sourceAudioBlob,
    sourceAudioName,
    sourceAudioDuration,
    sourceAudioVolume,
    setSourceAudioVolume,
    clearSourceAudioTrack,
    generateCaptionsFromSourceAudio,
    isGeneratingCaptions,
    automaticCaptionProgress,
    separateSourceVocals,
    vocalSeparationJob,
    hasVisual,
    visualType,
    visionAnalysis,
    visionOptions,
    visionRunning,
    visionProgress,
    visionPhase,
    analyzeCurrentVisual,
    toggleVisionOption,
    clearVisionAnalysis,
    downloadVisionCutout,
    openAvatarPanel,
    musicBlob,
    musicName,
    musicDuration,
    musicVolume,
    setMusicVolume,
    clearMusicTrack,
    selectedVoice,
    setVoiceTab,
    downloadBlob,
    notify,
    t,
    trOption,
  } = props;

  if (activeTool === "text") {
    return (
      <div className="tool-panel">
        <h2>{t("text")}</h2>
        <textarea className="side-textarea" value={script} onChange={(event) => updateScript(event.target.value)} />
        <div className="quick-grid">
          {[
            ["openingHook", t("openingHook")],
            ["productPoint", t("productPoint")],
            ["actionGuide", t("actionGuide")],
          ].map(([id, item]) => (
            <button
              type="button"
              key={id}
              onClick={() => updateScript(`${script.trim()}\n${item}: ${t("templateSuffix")}`.trim())}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeTool === "caption") {
    return (
      <div className="tool-panel caption-tool-panel">
        <h2>{t("caption")}</h2>
        <label className="switch-row">
          <input type="checkbox" checked={captionsEnabled} onChange={(event) => setCaptionsEnabled(event.target.checked)} />
          {t("showCaptions")}
        </label>
        <div className="segmented">
          {["top", "middle", "bottom"].map((position) => (
            <button
              className={captionPosition === position ? "is-active" : ""}
              type="button"
              key={position}
              onClick={() => setCaptionPosition(position)}
            >
              {position === "top" ? t("top") : position === "middle" ? t("middle") : t("bottom")}
            </button>
          ))}
        </div>
        <div className="slider-field compact-slider">
          <div>
            <label htmlFor="caption-size">{t("fontSize")}</label>
            <span>{captionSize}px</span>
          </div>
          <input
            id="caption-size"
            type="range"
            min="12"
            max="42"
            step="1"
            value={captionSize}
            onChange={(event) => setCaptionSize(Number(event.target.value))}
          />
        </div>
        <div className="caption-style-panel">
          <div className="caption-style-heading"><strong>{t("captionStyle")}</strong><span>{t("captionStyleHint")}</span></div>
          <div className="caption-style-presets">
            {[['normal', t('captionPresetClassic')], ['neon', t('captionPresetNeon')], ['bubble', t('captionPresetBubble')]].map(([effect, label]) => (
              <button key={effect} type="button" className={captionStyle.effect === effect ? "is-active" : ""} onClick={() => setCaptionStyle((style) => ({ ...style, effect, ...(effect === 'neon' ? { backgroundOpacity: 0.18, borderWidth: 1, borderColor: '#35f0dd' } : effect === 'bubble' ? { backgroundOpacity: 0.88, borderWidth: 0, radius: 18 } : {}) }))}>{label}</button>
            ))}
          </div>
          <div className="caption-color-row">
            <label>{t("captionTextColor")}<input type="color" value={captionStyle.textColor} onChange={(event) => setCaptionStyle((style) => ({ ...style, textColor: event.target.value }))} /></label>
            <label>{t("captionBackground")}<input type="color" value={captionStyle.backgroundColor} onChange={(event) => setCaptionStyle((style) => ({ ...style, backgroundColor: event.target.value }))} /></label>
            <label>{t("captionBorderColor")}<input type="color" value={captionStyle.borderColor} onChange={(event) => setCaptionStyle((style) => ({ ...style, borderColor: event.target.value }))} /></label>
          </div>
          {[['backgroundOpacity', t('captionOpacity'), 0, 1, 0.05, '%'], ['borderWidth', t('captionBorderWidth'), 0, 8, 1, 'px'], ['radius', t('captionRadius'), 0, 28, 1, 'px'], ['paddingX', t('captionPaddingX'), 0, 52, 1, 'px'], ['paddingY', t('captionPaddingY'), 0, 32, 1, 'px'], ['shadowOpacity', t('captionShadow'), 0, 1, 0.05, '%']].map(([key, label, min, max, step, unit]) => (
            <div className="slider-field compact-slider" key={key}><div><label>{label}</label><span>{unit === '%' ? `${Math.round(captionStyle[key] * 100)}%` : `${captionStyle[key]}${unit}`}</span></div><input type="range" min={min} max={max} step={step} value={captionStyle[key]} onChange={(event) => setCaptionStyle((style) => ({ ...style, [key]: Number(event.target.value) }))} /></div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTool === "smart") {
    return (
      <SmartVisionPanel
        t={t}
        language={uiLanguage}
        hasVisual={hasVisual}
        visualType={visualType}
        analysis={visionAnalysis}
        options={visionOptions}
        running={visionRunning}
        progress={visionProgress}
        phase={visionPhase}
        onAnalyze={analyzeCurrentVisual}
        onToggle={toggleVisionOption}
        onClear={clearVisionAnalysis}
        onDownloadCutout={downloadVisionCutout}
        onOpenAvatarPanel={openAvatarPanel}
      />
    );
  }

  if (activeTool === "audio") {
    return (
      <div className="tool-panel">
        <h2>{t("audioPanel")}</h2>
        <button
          className="audio-entry-card"
          type="button"
          onClick={() => {
            setVoiceTab("synthesis");
            notify("已打开 AI 配音");
          }}
        >
          <MicrophoneStage size={24} weight="duotone" />
          <span>
            <strong>{t("aiVoiceEntryTitle")}</strong>
            <em>{t("aiVoiceEntryDesc")}</em>
          </span>
        </button>
        <button
          className="audio-entry-card separation-entry-card"
          type="button"
          disabled={!sourceAudioBlob || vocalSeparationJob.running}
          onClick={separateSourceVocals}
        >
          <Waveform size={24} weight="duotone" />
          <span>
            <strong>{vocalSeparationJob.running ? t("vocalSeparationRunning") : t("vocalSeparationTitle")}</strong>
            <em>{sourceAudioBlob ? (vocalSeparationJob.phase || t("vocalSeparationDesc")) : t("vocalSeparationNeedsSource")}</em>
          </span>
          {vocalSeparationJob.running ? <span className="inline-progress" aria-hidden="true"><span style={{ width: `${vocalSeparationJob.progress}%` }} /></span> : null}
        </button>
        <button
          className="audio-entry-card caption-entry-card"
          type="button"
          disabled={!sourceAudioBlob || isGeneratingCaptions}
          onClick={generateCaptionsFromSourceAudio}
        >
          <ClosedCaptioning size={24} weight="duotone" />
          <span>
            <strong>{isGeneratingCaptions ? t("autoCaptionsRunning") : t("autoCaptionsTitle")}</strong>
            <em>{sourceAudioBlob ? t("autoCaptionsDesc") : t("autoCaptionsNeedsSource")}</em>
          </span>
          {isGeneratingCaptions ? (
            <span className="inline-progress" aria-hidden="true">
              <span style={{ width: `${automaticCaptionProgress}%` }} />
            </span>
          ) : null}
        </button>
        <div className="metric-list">
          <div>
            <span>{t("currentVoice")}</span>
            <strong>{selectedVoice.name}</strong>
          </div>
          <div>
            <span>{t("voiceDuration")}</span>
            <strong>{formatTime(audioBlob ? audioDuration : 0)}</strong>
          </div>
          <div>
            <span>{t("sourceAudio")}</span>
            <strong>{sourceAudioBlob ? sourceAudioName : t("notSeparated")}</strong>
          </div>
          <div>
            <span>{t("sourceDuration")}</span>
            <strong>{formatTime(sourceAudioBlob ? sourceAudioDuration : 0)}</strong>
          </div>
          <div>
            <span>{t("bgm")}</span>
            <strong>{musicBlob ? musicName : t("notAdded")}</strong>
          </div>
          <div>
            <span>{t("musicDuration")}</span>
            <strong>{formatTime(musicBlob ? musicDuration : 0)}</strong>
          </div>
        </div>
        <div className="slider-field compact-slider">
          <div>
            <label htmlFor="source-audio-volume">{t("sourceAudio")} {t("volume")}</label>
            <span>{Math.round(sourceAudioVolume * 100)}%</span>
          </div>
          <input
            id="source-audio-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sourceAudioVolume}
            disabled={!sourceAudioBlob}
            onInput={(event) => setSourceAudioVolume(Number(event.currentTarget.value))}
            onChange={(event) => setSourceAudioVolume(Number(event.target.value))}
          />
        </div>
        <div className="slider-field compact-slider">
          <div>
            <label htmlFor="music-volume">{t("bgm")} {t("volume")}</label>
            <span>{Math.round(musicVolume * 100)}%</span>
          </div>
          <input
            id="music-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={musicVolume}
            onInput={(event) => setMusicVolume(Number(event.currentTarget.value))}
            onChange={(event) => setMusicVolume(Number(event.target.value))}
          />
        </div>
        <button
          className="panel-primary"
          type="button"
          disabled={!audioBlob}
          onClick={() => audioBlob && downloadBlob(audioBlob, "ai-voiceover.wav")}
        >
          {t("downloadCurrentWav")}
        </button>
        <button
          className="panel-secondary"
          type="button"
          disabled={!musicBlob}
          onClick={() => musicBlob && downloadBlob(musicBlob, musicName || "background-music.wav")}
        >
          {t("downloadBgm")}
        </button>
        <button
          className="panel-secondary"
          type="button"
          disabled={!sourceAudioBlob}
          onClick={() => sourceAudioBlob && downloadBlob(sourceAudioBlob, sourceAudioName || "source-audio.wav")}
        >
          {t("downloadSource")}
        </button>
        <button className="panel-secondary" type="button" disabled={!sourceAudioBlob} onClick={() => clearSourceAudioTrack()}>
          {t("deleteSource")}
        </button>
        <button className="panel-secondary" type="button" disabled={!musicBlob} onClick={() => clearMusicTrack()}>
          {t("deleteBgm")}
        </button>
      </div>
    );
  }

  if (activeTool === "transition") {
    return (
      <VisualChoicePanel
        title={t("transition")}
        kind="transition"
        options={TRANSITIONS}
        selectedId={selectedTransitionId}
        trOption={trOption}
        onSelect={(id) => {
          setSelectedTransitionId(id);
          notify(t("transitionApplied"));
        }}
      />
    );
  }

  if (activeTool === "effects") {
    return (
      <VisualChoicePanel
        title={t("effects")}
        kind="effect"
        options={EFFECT_OPTIONS}
        selectedId={selectedFilterId}
        trOption={trOption}
        onSelect={(id) => {
          setSelectedFilterId(id);
          notify(t("effectApplied"));
        }}
      />
    );
  }

  if (activeTool === "stickers") {
    return (
      <StickerPanel
        title={t("stickers")}
        options={STICKERS}
        selectedId={selectedStickerId}
        trOption={trOption}
        t={t}
        onStickerPointerDown={handleStickerPointerDown}
        onStickerClick={handleStickerClick}
        onSelect={(id) => {
          setSelectedStickerId(id);
          notify(t("stickerApplied"));
        }}
      />
    );
  }

  return (
    <VisualChoicePanel
      title={t("filters")}
      kind="effect"
      options={FILTER_OPTIONS}
      selectedId={selectedFilterId}
      trOption={trOption}
      onSelect={(id) => {
        setSelectedFilterId(id);
        notify(t("filterApplied"));
      }}
    />
  );
}

const SUBJECT_LABELS_ZH = {
  foreground: "前景主体",
  person: "人物",
  cat: "猫",
  dog: "狗",
  bird: "鸟",
  horse: "马",
  car: "汽车",
  motorcycle: "摩托车",
  bicycle: "自行车",
  bus: "公交车",
  truck: "卡车",
  bottle: "瓶子",
  cup: "杯子",
  chair: "椅子",
  laptop: "笔记本电脑",
  "cell phone": "手机",
  book: "书",
};

function getDisplaySubjectLabel(label, language) {
  const normalized = String(label ?? "").trim();
  if (!normalized) {
    return language === "zh" ? "前景主体" : "Foreground subject";
  }
  return language === "zh" ? SUBJECT_LABELS_ZH[normalized.toLowerCase()] ?? normalized : normalized;
}

function SmartVisionPanel({
  t,
  language = "zh",
  hasVisual,
  visualType,
  analysis,
  options = {},
  running,
  progress = 0,
  phase = "",
  onAnalyze,
  onToggle,
  onClear,
  onDownloadCutout,
  onOpenAvatarPanel,
}) {
  const subject = analysis?.subject ?? null;
  const detections = Array.isArray(analysis?.detections) ? analysis.detections : [];
  const canUseSubject = Boolean(subject?.box);
  const temporalSamples = Array.isArray(analysis?.samples) ? analysis.samples : [];
  const canUseMatting =
    Boolean(analysis?.cutoutUrl) || temporalSamples.some((sample) => sample.cutoutUrl);
  const canDownloadCutout = Boolean(analysis?.cutoutBlob) && visualType === "image";
  const statusText = running
    ? t("smartVisionRunning")
    : analysis
      ? t("smartVisionReady")
      : t("smartVisionIdle");
  const featureRows = [
    {
      id: "showDetections",
      icon: BoundingBox,
      title: t("smartVisionDetection"),
      description: t("smartVisionDetectionDesc"),
      disabled: !detections.length,
    },
    {
      id: "removeBackground",
      icon: SelectionBackground,
      title: t("smartVisionMatting"),
      description: t("smartVisionMattingDesc"),
      disabled: !canUseMatting,
    },
    {
      id: "avoidCaptions",
      icon: ClosedCaptioning,
      title: t("smartVisionCaptionAvoidance"),
      description: t("smartVisionCaptionAvoidanceDesc"),
      disabled: !canUseSubject,
    },
    {
      id: "smartCrop",
      icon: Crop,
      title: t("smartVisionCrop"),
      description: t("smartVisionCropDesc"),
      disabled: !canUseSubject,
    },
  ];

  return (
    <div className="tool-panel smart-vision-panel">
      <div className="smart-vision-heading">
        <div>
          <span>{t("smartVisionKicker")}</span>
          <h2>{t("smartVisionTitle")}</h2>
        </div>
        <span className={`smart-vision-status ${running ? "is-running" : analysis ? "is-ready" : ""}`}>
          <i />
          {statusText}
        </span>
      </div>

      <div className="vision-model-stack" aria-label={t("smartVisionModels")}>
        <div>
          <BoundingBox size={20} weight="duotone" />
          <span>
            <strong>YOLOS tiny</strong>
            <em>{t("smartVisionDetection")}</em>
          </span>
        </div>
        <div>
          <SelectionBackground size={20} weight="duotone" />
          <span>
            <strong>MODNet</strong>
            <em>{t("smartVisionMatting")}</em>
          </span>
        </div>
      </div>

      {!hasVisual ? <div className="vision-empty-state">{t("smartVisionNoMedia")}</div> : null}

      <button
        className="panel-primary vision-analyze-button"
        type="button"
        disabled={!hasVisual}
        onClick={onAnalyze}
      >
        <Scan size={18} weight="bold" />
        {running
          ? t("smartVisionCancel")
          : visualType === "video"
          ? analysis
            ? t("smartVisionAnalyzeAgainVideo")
            : t("smartVisionAnalyzeVideo")
          : analysis
            ? t("smartVisionAnalyzeAgain")
            : t("smartVisionAnalyze")}
      </button>

      {running ? (
        <div className="vision-progress" role="status" aria-live="polite">
          <div>
            <span>{phase || t("smartVisionRunning")}</span>
            <strong>{Math.max(0, Math.min(100, Math.round(progress)))}%</strong>
          </div>
          <span className="vision-progress-track">
            <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </span>
        </div>
      ) : null}

      {analysis ? (
        <div className="vision-result-card">
          {subject ? (
            <>
              <div className="vision-subject-icon">
                <Target size={22} weight="duotone" />
              </div>
              <div>
                <span>{t("smartVisionSubject")}</span>
                <strong>{getDisplaySubjectLabel(subject.label, language)}</strong>
              </div>
              <div className="vision-confidence">
                <span>{t("smartVisionConfidence")}</span>
                <strong>{Math.round((subject.score ?? 0) * 100)}%</strong>
              </div>
              <div className="vision-object-count">
                <span>{t("smartVisionObjects")}</span>
                <strong>{detections.length}</strong>
              </div>
            </>
          ) : (
            <p>{t("smartVisionNoSubject")}</p>
          )}
        </div>
      ) : null}

      {visualType === "video" && temporalSamples.length ? (
        <div className="vision-timeline-summary">
          <span>{t("smartVisionVideoCoverage")}</span>
          <strong>{temporalSamples.length}</strong>
          <em>{t("smartVisionTemporalFrames")}</em>
        </div>
      ) : null}

      <div className="vision-feature-list">
        {featureRows.map(({ id, icon: Icon, title, description, disabled }) => (
          <label className={`${disabled ? "is-disabled" : ""} ${options[id] ? "is-active" : ""}`} key={id}>
            <Icon size={19} weight="duotone" />
            <span>
              <strong>{title}</strong>
              <em>{description}</em>
            </span>
            <input
              type="checkbox"
              checked={Boolean(options[id])}
              disabled={disabled}
              onChange={() => onToggle?.(id)}
            />
          </label>
        ))}
      </div>

      <p className="vision-model-note">{t("smartVisionImageOnly")}</p>

      <section className="avatar-lab-card" aria-label={t("avatarTitle")}>
        <div className="avatar-lab-heading">
          <span className="avatar-lab-icon"><PersonSimpleRun size={18} weight="duotone" /></span>
          <div><span>{t("avatarKicker")}</span><strong>{t("avatarTitle")}</strong></div>
          <em className="is-ready">{t("avatarWebPort")}</em>
        </div>
        <p>{t("avatarDescription")}</p>
        <div className="avatar-lab-requirements">
          <span className={hasVisual && visualType === "image" ? "is-ready" : ""}>{t("avatarPortrait")}</span>
          <span className="is-ready">{t("avatarWebgpu")}</span>
          <span>{t("avatarAudio")}</span>
        </div>
        <button className="panel-primary avatar-open-button" type="button" onClick={onOpenAvatarPanel}>
          <PersonSimpleRun size={16} />{t("avatarOpen")}
        </button>
      </section>

      {analysis ? (
        <div className="vision-result-actions">
          <button className="panel-secondary" type="button" disabled={!canDownloadCutout} onClick={onDownloadCutout}>
            <DownloadSimple size={16} />
            {visualType === "video"
              ? t("smartVisionVideoCutoutExport")
              : t("smartVisionCutoutDownload")}
          </button>
          <button className="panel-secondary" type="button" onClick={onClear}>
            <Trash size={16} />
            {t("smartVisionClear")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VisualChoicePanel({ title, kind, options, selectedId, trOption = (name) => name, onSelect }) {
  return (
    <div className="tool-panel">
      <h2>{title}</h2>
      <div className="visual-choice-grid">
        {options.map((option) => (
          <button
            className={`visual-choice-card is-${kind} preview-${option.id} ${
              selectedId === option.id ? "is-selected" : ""
            }`}
            type="button"
            key={option.id}
            draggable={option.id !== "none"}
            style={{
              "--choice-image": `url(${SAMPLE_IMAGE})`,
              "--choice-filter": option.css ?? "none",
            }}
            onClick={() => onSelect(option.id)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("application/x-timeline-visual-style", `${kind}:${option.id}`);
              event.dataTransfer.setData("text/plain", `visual-style:${kind}:${option.id}`);
            }}
          >
            <span className="visual-choice-thumb" aria-hidden="true" />
            <span className="visual-choice-label">
              <span>{trOption(option.name, option)}</span>
              {selectedId === option.id ? <Check size={14} weight="bold" /> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoicePanel({ title, options, selectedId, trOption = (name) => name, onSelect }) {
  return (
    <div className="tool-panel">
      <h2>{title}</h2>
      <div className="choice-list">
        {options.map((option) => (
          <button className={selectedId === option.id ? "is-selected" : ""} type="button" key={option.id} onClick={() => onSelect(option.id)}>
            <span>{trOption(option.name, option)}</span>
            {selectedId === option.id ? <Check size={16} /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function StickerPanel({
  title,
  options,
  selectedId,
  trOption = (name) => name,
  onSelect,
  t,
  onStickerPointerDown,
  onStickerClick,
}) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [visibleCount, setVisibleCount] = useState(STICKER_PAGE_SIZE);
  const loadMoreRef = useRef(null);
  const emptySticker = options.find((option) => option.id === "none") ?? { id: "none", name: "无贴纸" };
  const stickerOptions = useMemo(() => options.filter((option) => option.id !== "none"), [options]);
  const filteredStickers = useMemo(
    () =>
      activeCategory === "all"
        ? stickerOptions
        : stickerOptions.filter((option) => option.category === activeCategory),
    [activeCategory, stickerOptions],
  );
  const visibleStickers = filteredStickers.slice(0, visibleCount);
  const hasMore = visibleCount < filteredStickers.length;

  useEffect(() => {
    setVisibleCount(STICKER_PAGE_SIZE);
  }, [activeCategory]);

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setVisibleCount((count) => Math.min(count + STICKER_PAGE_SIZE, filteredStickers.length));
      },
      { root: null, rootMargin: "120px 0px" },
    );
    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [filteredStickers.length, hasMore]);

  const loadMore = () => {
    setVisibleCount((count) => Math.min(count + STICKER_PAGE_SIZE, filteredStickers.length));
  };

  return (
    <div className="tool-panel sticker-panel">
      <h2>{title}</h2>
      <button
        className={`sticker-none-button ${selectedId === emptySticker.id ? "is-selected" : ""}`}
        type="button"
        onClick={() => onSelect(emptySticker.id)}
      >
        <span>{trOption(emptySticker.name, emptySticker)}</span>
        {selectedId === emptySticker.id ? <Check size={15} weight="bold" /> : null}
      </button>
      <div className="sticker-category-row" role="tablist" aria-label={t("stickerCategories")}>
        {STICKER_CATEGORIES.map((category) => (
          <button
            className={activeCategory === category.id ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeCategory === category.id}
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
          >
            {trOption(category.name, category)}
          </button>
        ))}
      </div>
      <div className="sticker-grid" aria-live="polite">
        {visibleStickers.map((option) => {
          const dragAsset = {
            ...option,
            type: "sticker",
            meta: "贴纸",
          };

          return (
          <button
            className={`sticker-tile ${selectedId === option.id ? "is-selected" : ""}`}
            type="button"
            key={option.id}
            onPointerDown={(event) => onStickerPointerDown?.(event, dragAsset)}
            onClick={(event) => {
              if (onStickerClick) {
                onStickerClick(event, option);
                return;
              }
              onSelect(option.id);
            }}
          >
            <span className="sticker-tile-thumb" aria-hidden="true">
              <img src={option.src} alt="" loading="lazy" draggable={false} />
            </span>
            <span className="sticker-tile-label">
              <span>{trOption(option.name, option)}</span>
              {selectedId === option.id ? <Check size={13} weight="bold" /> : null}
            </span>
          </button>
          );
        })}
      </div>
      {hasMore ? (
        <button className="sticker-load-more" type="button" ref={loadMoreRef} onClick={loadMore}>
          <span>{t("loadMoreStickers")}</span>
          <span>
            {visibleStickers.length}/{filteredStickers.length}
          </span>
        </button>
      ) : (
        <span className="sticker-load-sentinel" ref={loadMoreRef} aria-hidden="true" />
      )}
    </div>
  );
}

export function VoiceSynthesisPanel({
  script,
  updateScript,
  selectedVoiceId,
  setSelectedVoiceId,
  selectedVoice,
  filteredVoices,
  voiceFilter,
  setVoiceFilter,
  showVoiceFilter,
  setShowVoiceFilter,
  speed,
  setSpeed,
  volume,
  setVolume,
  status,
  progressPercent,
  audioBlob,
  generateVoiceover,
  downloadBlob,
  favoriteVoiceIds,
  setFavoriteVoiceIds,
  t,
}) {
  return (
    <>
      <label className="field-label" htmlFor="script-input">
        {t("inputScript")}
      </label>
      <div className="script-box">
        <textarea id="script-input" value={script} maxLength={5000} onChange={(event) => updateScript(event.target.value)} />
        <div className="script-meta">
          <button type="button" onClick={() => updateScript("")}>
            <Trash size={14} />
            {t("clear")}
          </button>
          <span>{script.length} / 5000</span>
        </div>
      </div>

      <div className="voice-header">
        <label className="field-label">{t("chooseVoice")}</label>
        <div className="menu-anchor">
          <button className="voice-filter" type="button" onClick={() => setShowVoiceFilter((open) => !open)}>
            {voiceFilter === "all" ? t("allVoices") : voiceFilter} <CaretDown size={14} />
          </button>
          {showVoiceFilter ? (
            <Popover onClose={() => setShowVoiceFilter(false)}>
              <div className="menu-list">
                {["all", "中文", "English", "piper", "kokoro"].map((filter) => (
                  <button
                    type="button"
                    className={voiceFilter === filter ? "is-selected" : ""}
                    key={filter}
                    onClick={() => {
                      setVoiceFilter(filter);
                      setShowVoiceFilter(false);
                    }}
                  >
                    {filter === "all" ? t("allVoices") : filter}
                  </button>
                ))}
              </div>
            </Popover>
          ) : null}
        </div>
      </div>

      <div className="voice-list">
        {filteredVoices.map((voice) => (
          <button
            className={`voice-card ${voice.id === selectedVoiceId ? "is-selected" : ""}`}
            type="button"
            key={voice.id}
            onClick={() => setSelectedVoiceId(voice.id)}
          >
            <span className="avatar">
              <MicrophoneStage size={17} weight="fill" />
            </span>
            <span>
              <strong>{voice.name}</strong>
              <em>
                {voice.language} · {voice.gender}
              </em>
            </span>
            <small>{voice.badge}</small>
          </button>
        ))}
      </div>

      <div className="model-row">
        <span>{selectedVoice.detail}</span>
        <button
          type="button"
          onClick={() =>
            setFavoriteVoiceIds((ids) =>
              ids.includes(selectedVoiceId) ? ids.filter((id) => id !== selectedVoiceId) : [...ids, selectedVoiceId],
            )
          }
        >
          {favoriteVoiceIds.includes(selectedVoiceId) ? t("saved") : t("favoriteVoice")}
        </button>
      </div>

      <div className="slider-field">
        <div>
          <label htmlFor="speed">{t("speed")}</label>
          <span>{speed.toFixed(2)} x</span>
        </div>
        <input id="speed" type="range" min="0.7" max="1.3" step="0.05" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
      </div>

      <div className="slider-field">
        <div>
          <label htmlFor="volume">{t("volume")}</label>
          <span>{Math.round(volume * 100)}%</span>
        </div>
        <input id="volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
      </div>

      {status === "generating" ? (
        <div className="progress-track" aria-label={t("generationProgress")}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      ) : null}

      <div className="voice-actions">
        <button className="generate-button" type="button" disabled={status === "generating" || !script.trim()} onClick={generateVoiceover}>
          <Waveform size={18} weight="bold" />
          {status === "generating" ? t("generating") : audioBlob ? t("regenerateVoice") : t("generateVoice")}
        </button>
        <button className="secondary-download" type="button" disabled={!audioBlob} onClick={() => audioBlob && downloadBlob(audioBlob, "ai-voiceover.wav")}>
          <DownloadSimple size={17} />
        </button>
      </div>
    </>
  );
}

export function MyVoicesPanel({
  favoriteVoiceIds,
  setFavoriteVoiceIds,
  setSelectedVoiceId,
  selectedVoiceId,
  notify,
  t,
  recordedVoices,
  recordingState,
  recordingElapsed,
  startVoiceRecording,
  stopVoiceRecording,
  useRecordedVoice: onUseRecordedVoice,
  downloadBlob,
}) {
  const favorites = VOICES.filter((voice) => favoriteVoiceIds.includes(voice.id));
  const isRecording = recordingState === "recording";
  const isProcessingRecording = recordingState === "processing";

  return (
    <div className="history-panel">
      <div className={`record-card ${isRecording ? "is-recording" : ""}`}>
        <div>
          <strong>{t("recordVoice")}</strong>
          <span>{isRecording ? `${t("recording")} · ${formatClock(recordingElapsed)}` : t("noRecordings")}</span>
        </div>
        <button
          type="button"
          disabled={isProcessingRecording}
          onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
        >
          {isRecording ? <Pause size={15} weight="fill" /> : <MicrophoneStage size={15} weight="fill" />}
          {isRecording ? t("stopRecording") : isProcessingRecording ? t("generating") : t("startRecording")}
        </button>
      </div>

      {recordedVoices.length ? (
        <>
          <div className="panel-subtitle">{t("recordedVoices")}</div>
          {recordedVoices.map((recording) => (
            <div className="history-item is-recording-item" key={recording.id}>
              <div>
                <strong>{recording.name}</strong>
                <span>
                  {recording.createdAt} · {formatTime(recording.duration)}
                </span>
              </div>
              <button type="button" onClick={() => onUseRecordedVoice(recording)}>
                {t("use")}
              </button>
              <button
                type="button"
                onClick={() => downloadBlob(recording.blob, `${recording.name}.${recording.extension}`)}
              >
                {t("download")}
              </button>
            </div>
          ))}
        </>
      ) : null}

      <div className="panel-subtitle">{t("favoriteVoice")}</div>
      {favorites.length ? (
        favorites.map((voice) => (
          <div className={`history-item ${selectedVoiceId === voice.id ? "is-selected" : ""}`} key={voice.id}>
            <div>
              <strong>{voice.name}</strong>
              <span>
                {voice.language} · {voice.detail}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedVoiceId(voice.id);
                notify("已切换到收藏声音");
              }}
            >
              {t("use")}
            </button>
            <button type="button" onClick={() => setFavoriteVoiceIds((ids) => ids.filter((id) => id !== voice.id))}>
              {t("remove")}
            </button>
          </div>
        ))
      ) : (
        <div className="empty-state">{t("noFavoriteVoices")}</div>
      )}
    </div>
  );
}

export function HistoryPanel({ historyItems, useHistoryItem: onUseHistoryItem, setHistoryItems, downloadBlob, t }) {
  return (
    <div className="history-panel">
      {historyItems.length ? (
        historyItems.map((item) => (
          <div className="history-item" key={item.id}>
            <div>
              <strong>{item.voiceName}</strong>
              <span>
                {item.createdAt} · {formatTime(item.duration)} · {item.script.slice(0, 18)}
              </span>
            </div>
            <button type="button" onClick={() => onUseHistoryItem(item)}>
              {t("use")}
            </button>
            <button type="button" onClick={() => downloadBlob(item.blob, `history-${item.voiceName}.wav`)}>
              {t("download")}
            </button>
            <button type="button" onClick={() => setHistoryItems((items) => items.filter((entry) => entry.id !== item.id))}>
              {t("delete")}
            </button>
          </div>
        ))
      ) : (
        <div className="empty-state">{t("noMediaHistory")}</div>
      )}
    </div>
  );
}
