import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";

import {
  BoundingBox,
  CaretDown,
  Check,
  CloudArrowUp,
  ClosedCaptioning,
  Crop,
  Diamond,
  DownloadSimple,
  FrameCorners,
  MicrophoneStage,
  MusicNote,
  Pause,
  PlayCircle,
  PersonSimpleRun,
  Scan,
  Scissors,
  SelectionBackground,
  Target,
  Trash,
  Waveform,
  X,
} from "@phosphor-icons/react";

import {
  EFFECT_OPTIONS,
  FILTER_OPTIONS,
  SAMPLE_IMAGE,
  STICKERS,
  STICKER_CATEGORIES,
  STICKER_PAGE_SIZE,
  VOICES,
} from "../config/editor.js";
import { APP_LANGUAGES } from "../i18n.js";
import { getRemoteAssetBlob } from "../lib/remoteAssetCache.js";
import { formatClock, formatTime, getSegmentStartTime } from "../lib/timeline.js";
import { hasVisualPropertyKeyframe, normalizeVisualKeyframes, resolveVisualTransform } from "../lib/visualEffects.js";
import { DEFAULT_VISUAL_ANIMATION_DURATION, normalizeVisualClipAnimation, VISUAL_CLIP_ANIMATION_OPTIONS } from "../lib/visualClipAnimations.js";
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
  libraryType,
  libraryQuery,
  setLibraryQuery,
  selectLibraryType,
  libraryStatus,
  libraryError,
  libraryProvider,
  assetDownloadStates,
  prefetchLibraryAsset,
  userAssets,
  deleteUserAsset,
  draggedAssetId,
  handleAssetPointerDown,
  handleAssetClick,
  applyAssetToTrack,
  closeMobilePanel,
  mobilePanelOpen,
}) {
  const assets = mediaTab === "library" ? builtInAssets : userAssets;
  const selectedAsset = [...userAssets, ...builtInAssets].find((asset) => asset.id === selectedLibraryAssetId) ?? null;
  const assetIntentTimerRef = useRef(null);
  const [previewAsset, setPreviewAsset] = useState(null);

  useEffect(() => {
    if (!previewAsset) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setPreviewAsset(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewAsset]);

  const openAssetPreview = (event, asset) => {
    handleAssetClick(event, asset);
    if (window.matchMedia?.("(max-width: 760px)").matches) return;
    if (!event.defaultPrevented) setPreviewAsset(asset);
  };
  const addSelectedAsset = async (track) => {
    if (!selectedAsset) return;
    await applyAssetToTrack?.(selectedAsset, track);
    closeMobilePanel?.();
  };
  const renderAssetList = (items, { deletable = false } = {}) => (
    <div className={`asset-list ${mediaTab === "upload" ? "upload-assets" : ""}`}>
      {libraryStatus === "loading" && mediaTab === "library" ? (
        <LibraryLoadingGrid label={t("libraryLoading")} />
      ) : items.length ? (
        items.map((asset) => (
          <div
            className={`asset-row-wrap ${draggedAssetId === asset.id ? "is-dragging" : ""}`}
            key={asset.id}
          >
            <button
              type="button"
              className="asset-row-button"
              onPointerDown={(event) => handleAssetPointerDown(event, asset)}
              onPointerEnter={() => {
                if (mediaTab !== "library") return;
                clearTimeout(assetIntentTimerRef.current);
                assetIntentTimerRef.current = setTimeout(() => void prefetchLibraryAsset?.(asset), 180);
              }}
              onPointerLeave={() => clearTimeout(assetIntentTimerRef.current)}
              onClick={(event) => openAssetPreview(event, asset)}
            >
              <AssetRow asset={asset} selected={asset.id === selectedLibraryAssetId} t={t} downloadState={assetDownloadStates?.[asset.id]} />
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
        <div className="empty-state">{mediaTab === "library" ? (libraryError || t("libraryEmpty")) : t("emptyAssets")}</div>
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
      ) : mediaTab === "library" ? (
        <>
          <div className="library-type-tabs" role="tablist" aria-label={t("libraryMediaType")}>
            {["image", "video", "audio"].map((type) => (
              <button type="button" role="tab" aria-selected={libraryType === type} className={libraryType === type ? "is-active" : ""} key={type} onClick={() => selectLibraryType(type)}>
                {t(`library${type[0].toUpperCase()}${type.slice(1)}`)}
              </button>
            ))}
          </div>
          <form className="library-search" onSubmit={(event) => event.preventDefault()}>
            <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder={t(libraryType === "audio" ? "librarySearchMusicPlaceholder" : "librarySearchPlaceholder")} aria-label={t(libraryType === "audio" ? "librarySearchMusicPlaceholder" : "librarySearchPlaceholder")} />
          </form>
          <div className="library-provider">{t("libraryProvidedBy")} <strong>{libraryProvider}</strong></div>
          {renderAssetList(assets)}
        </>
      ) : (
        renderAssetList(assets, { deletable: mediaTab === "mine" })
      )}

      {selectedAsset && mobilePanelOpen ? createPortal((
        <div className="mobile-asset-actions" aria-label={t("mobileAssetActions")}>
          <span><strong>{selectedAsset.name}</strong><small>{t("mobileAssetSelected")}</small></span>
          {selectedAsset.type === "audio" ? (
            <div>
              <button type="button" className="is-secondary" onClick={() => void addSelectedAsset("music")}>{t("mobileAddToMusic")}</button>
              <button type="button" onClick={() => void addSelectedAsset("audio")}>{t("mobileAddToVoice")}</button>
            </div>
          ) : (
            <div>
              <button type="button" className="is-secondary" onClick={() => void addSelectedAsset("overlay")}>{t("dropAsOverlay")}</button>
              <button type="button" onClick={() => void addSelectedAsset("image")}>{t("mobileAddToMainTrack")}</button>
            </div>
          )}
        </div>
      ), document.body) : null}

      {previewAsset ? createPortal(
        <AssetPreviewDialog asset={previewAsset} t={t} onClose={() => setPreviewAsset(null)} />,
        document.body,
      ) : null}
    </>
  );
}

function AssetPreviewDialog({ asset, t, onClose }) {
  const mediaSrc = asset.type === "image" ? (asset.originalSrc || asset.src) : (asset.previewSrc || asset.src);
  const [audioPreviewStatus, setAudioPreviewStatus] = useState(asset.type === "audio" ? "loading" : "ready");
  const [audioPreviewProgress, setAudioPreviewProgress] = useState(0);
  const [audioPreviewSrc, setAudioPreviewSrc] = useState(asset.type === "audio" && !/^https?:/i.test(mediaSrc) ? mediaSrc : "");
  const audioFallbacksRef = useRef([]);
  const audioFallbackIndexRef = useRef(-1);
  const tryNextAudioFallback = () => {
    const nextIndex = audioFallbackIndexRef.current + 1;
    const nextSrc = audioFallbacksRef.current[nextIndex];
    if (!nextSrc) {
      setAudioPreviewStatus("error");
      return;
    }
    audioFallbackIndexRef.current = nextIndex;
    setAudioPreviewStatus("loading");
    setAudioPreviewProgress(0.03);
    setAudioPreviewSrc(nextSrc);
  };
  useEffect(() => {
    if (asset.type !== "audio" || !/^https?:/i.test(mediaSrc)) return undefined;
    let canceled = false;
    let objectUrl = "";
    setAudioPreviewStatus("loading");
    setAudioPreviewProgress(0);
    setAudioPreviewSrc("");
    audioFallbacksRef.current = [];
    audioFallbackIndexRef.current = -1;
    try {
      const sourceUrl = new URL(mediaSrc);
      const trackId = sourceUrl.searchParams.get("trackid");
      if (trackId && sourceUrl.hostname.endsWith("storage.jamendo.com")) {
        audioFallbacksRef.current = ["mp31", "ogg", "mp32"].map((format) => {
          const fallbackUrl = new URL(sourceUrl);
          fallbackUrl.searchParams.set("format", format);
          return fallbackUrl.toString();
        });
      } else {
        audioFallbacksRef.current = [mediaSrc];
      }
    } catch {
      audioFallbacksRef.current = [mediaSrc];
    }
    getRemoteAssetBlob({ ...asset, src: mediaSrc }, (progress) => {
      if (!canceled) setAudioPreviewProgress(Math.min(0.96, Math.max(0.01, progress || 0)));
    }).then((blob) => {
      if (canceled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setAudioPreviewProgress(0.98);
      setAudioPreviewSrc(objectUrl);
    }).catch((error) => {
      console.warn("Music preview download failed", error);
      if (!canceled) tryNextAudioFallback();
    });
    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, mediaSrc]);
  return (
    <div className="asset-preview-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="asset-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-preview-title">
        <header>
          <div>
            <span>{t("assetPreview", "素材预览")}</span>
            <strong id="asset-preview-title">{asset.name}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label={t("closeAssetPreview", "关闭预览")}>
            <X size={20} />
          </button>
        </header>
        <div className={`asset-preview-media type-${asset.type}`}>
          {asset.type === "video" ? (
            <video key={mediaSrc} src={mediaSrc} poster={asset.thumbnail} controls autoPlay playsInline />
          ) : asset.type === "audio" ? (
            <div className="asset-preview-audio">
              <MusicNote size={58} weight="duotone" />
              <strong>{asset.name}</strong>
              {audioPreviewStatus === "loading" ? (
                <div className="asset-preview-audio-loading" role="status" aria-live="polite">
                  <i style={{ "--audio-preview-progress": `${Math.round(audioPreviewProgress * 100)}%` }}>
                    <b>{Math.round(audioPreviewProgress * 100)}%</b>
                  </i>
                  <span>{t("audioPreviewLoading", "正在加载音乐预览…")}</span>
                </div>
              ) : null}
              {audioPreviewStatus === "error" ? (
                <div className="asset-preview-audio-error" role="alert">{t("audioPreviewFailed", "音乐预览加载失败，请稍后重试")}</div>
              ) : null}
              {audioPreviewSrc ? <audio
                className={audioPreviewStatus === "ready" ? "is-ready" : "is-waiting"}
                key={audioPreviewSrc}
                src={audioPreviewSrc}
                controls
                autoPlay
                preload="metadata"
                onLoadedMetadata={() => setAudioPreviewProgress((progress) => Math.max(progress, 0.99))}
                onCanPlay={() => { setAudioPreviewProgress(1); setAudioPreviewStatus("ready"); }}
                onError={tryNextAudioFallback}
              /> : null}
            </div>
          ) : (
            <img src={mediaSrc} alt={asset.name} />
          )}
        </div>
        {asset.meta ? <footer>{asset.meta}</footer> : null}
      </section>
    </div>
  );
}

function LibraryLoadingGrid({ label }) {
  return (
    <div className="library-loading-grid" aria-label={label} aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="library-skeleton-card" key={index}>
          <div className="library-skeleton-thumb"><i /></div>
          <span /><small />
        </div>
      ))}
    </div>
  );
}

function AssetRow({ asset, selected, t, downloadState }) {
  const [mediaLoaded, setMediaLoaded] = useState(asset.type === "audio");
  const [previewSrc, setPreviewSrc] = useState(asset.thumbnail || asset.src);
  useEffect(() => {
    setPreviewSrc(asset.thumbnail || asset.src);
    setMediaLoaded(asset.type === "audio");
  }, [asset.id, asset.src, asset.thumbnail, asset.type]);
  const handlePreviewError = () => {
    if (previewSrc !== asset.src) {
      setPreviewSrc(asset.src);
      return;
    }
    if (asset.originalSrc && previewSrc !== asset.originalSrc) {
      setPreviewSrc(asset.originalSrc);
      return;
    }
    setMediaLoaded(true);
  };
  return (
    <div className={`asset-card ${selected ? "is-selected" : ""}`}>
      <div className="asset-thumb">
        {!mediaLoaded ? <div className="asset-media-loading" aria-hidden="true"><i /></div> : null}
        {asset.type === "video" ? (
          asset.thumbnail ? <img src={previewSrc} alt="" draggable={false} onLoad={() => setMediaLoaded(true)} onError={handlePreviewError} /> : <video src={asset.src} muted playsInline preload="metadata" draggable={false} onLoadedData={() => setMediaLoaded(true)} onError={() => setMediaLoaded(true)} />
        ) : asset.type === "audio" ? (
          <div className="asset-audio-thumb">
            <MusicNote size={28} weight="duotone" />
          </div>
        ) : (
          <img src={previewSrc} alt="" draggable={false} onLoad={() => setMediaLoaded(true)} onError={handlePreviewError} />
        )}
        <span>
          {asset.type === "audio"
            ? t(asset.kind === "music" ? "libraryAudio" : "assetAudio")
            : asset.type === "video"
              ? t("assetVideo")
              : t("assetImage")}
        </span>
        {downloadState?.status === "loading" ? (
          <div className="asset-download-progress" aria-label={t("libraryPreparingAsset")}>
            <i style={{ "--asset-progress": `${Math.max(8, Math.round((downloadState.progress || 0) * 100))}%` }} />
          </div>
        ) : downloadState?.status === "ready" ? <i className="asset-ready-dot" title={t("libraryAssetReady")} /> : null}
        <span className="asset-preview-hover" aria-hidden="true">
          <PlayCircle size={30} weight="fill" />
          <em>{t("assetPreview", "素材预览")}</em>
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
    setSelectedAudioSegmentId,
    setSelectedTrack,
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
    confirmStickerSelection,
    closeMobilePanel,
    mobilePanelOpen,
    audioBlob,
    audioDuration,
    sourceAudioBlob,
    sourceAudioName,
    sourceAudioDuration,
    sourceAudioVolume,
    sourceAudioLinked,
    setSourceAudioVolume,
    clearSourceAudioTrack,
    generateCaptionsFromSourceAudio,
    isGeneratingCaptions,
    automaticCaptionProgress,
    separateSourceVocals,
    selectedAudioToolTarget,
    separateSelectedAudioVocals,
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
    smartMode,
    setSmartMode,
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
    selectedVisualSegment,
    visualLocalTime,
    updateSelectedVisualEffects,
  } = props;

  if (activeTool === "caption") {
    return (
      <div className="tool-panel caption-tool-panel">
        <h2>{t("caption")}</h2>
        <p className="tool-helper-copy">{t("captionCanvasHint")}</p>
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
            <button type="button" className={captionStyle.backgroundOpacity === 0 && captionStyle.borderWidth === 0 ? "is-active" : ""} onClick={() => setCaptionStyle((style) => ({ ...style, effect: "normal", backgroundOpacity: 0, borderWidth: 0, shadowOpacity: 0 }))}>{t("captionPresetNone")}</button>
            {[['normal', t('captionPresetClassic')], ['neon', t('captionPresetNeon')]].map(([effect, label]) => (
              <button key={effect} type="button" className={captionStyle.effect === effect ? "is-active" : ""} onClick={() => setCaptionStyle((style) => ({ ...style, effect, ...(effect === 'neon' ? { backgroundOpacity: 0.18, borderWidth: 1, borderColor: '#35f0dd' } : {}) }))}>{label}</button>
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
      <div className="tool-panel smart-hub-panel">
        <div className="smart-hub-grid" role="tablist" aria-label={t("smartTools")}>
          {[
            ["auto-edit", Scissors, t("smartAutoEdit"), t("smartAutoEditHint")],
            ["smart-frame", FrameCorners, t("smartFrame"), t("smartFrameHint")],
            ["avatar", PersonSimpleRun, t("smartAvatar"), t("smartAvatarHint")],
          ].map(([id, Icon, title, hint]) => (
            <button className={smartMode === id ? "is-active" : ""} type="button" role="tab" aria-selected={smartMode === id} key={id} onClick={() => {
              setSmartMode(id);
              if (id === "avatar") openAvatarPanel();
            }}>
              <Icon size={24} weight="duotone" /><strong>{title}</strong><span>{hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeTool === "audio") {
    return (
      <div className="tool-panel audio-tool-panel">
        <h2>{t("audioPanel")}</h2>
        <button
          className="audio-entry-card"
          type="button"
          onClick={() => {
            setSelectedAudioSegmentId?.("");
            setSelectedTrack?.("");
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
          disabled={!selectedAudioToolTarget || vocalSeparationJob.running}
          onClick={separateSelectedAudioVocals || separateSourceVocals}
        >
          <Waveform size={24} weight="duotone" />
          <span>
            <strong>{vocalSeparationJob.running ? t("vocalSeparationRunning") : t("vocalSeparationTitle")}</strong>
            <em>{selectedAudioToolTarget ? (vocalSeparationJob.phase || t("vocalSeparationDesc")) : t("vocalSeparationNeedsSource")}</em>
          </span>
          {vocalSeparationJob.running ? <span className="inline-progress" aria-hidden="true"><span style={{ width: `${vocalSeparationJob.progress}%` }} /></span> : null}
        </button>
        <button
          className="audio-entry-card caption-entry-card"
          type="button"
          disabled={!selectedAudioToolTarget || isGeneratingCaptions}
          onClick={() => selectedAudioToolTarget && generateCaptionsFromSourceAudio({
            blob: selectedAudioToolTarget.blob,
            start: selectedAudioToolTarget.start,
            sourceStart: selectedAudioToolTarget.sourceStart,
            duration: selectedAudioToolTarget.duration,
            append: selectedAudioToolTarget.track !== "source",
          })}
        >
          <ClosedCaptioning size={24} weight="duotone" />
          <span>
            <strong>{isGeneratingCaptions ? t("autoCaptionsRunning") : t("autoCaptionsTitle")}</strong>
            <em>{selectedAudioToolTarget ? t("autoCaptionsDesc") : t("autoCaptionsNeedsSource")}</em>
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
        <div className="audio-download-actions">
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
        </div>
        <div className="audio-delete-actions">
          <button className="panel-secondary is-danger" type="button" disabled={!sourceAudioBlob} onClick={() => clearSourceAudioTrack()}>
            {t("deleteSource")}
          </button>
          <button className="panel-secondary is-danger" type="button" disabled={!musicBlob} onClick={() => clearMusicTrack()}>
            {t("deleteBgm")}
          </button>
        </div>
      </div>
    );
  }

  if (activeTool === "effects") {
    return (
      <VisualEffectsPanel
        t={t}
        segment={selectedVisualSegment}
        localTime={visualLocalTime}
        onChange={updateSelectedVisualEffects}
        selectedFilterId={selectedFilterId}
        trOption={trOption}
        onSelectFilter={(id) => { setSelectedFilterId(id); notify(t("effectApplied")); }}
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
        onStickerConfirm={confirmStickerSelection}
        closeMobilePanel={closeMobilePanel}
        mobilePanelOpen={mobilePanelOpen}
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

export function VisualEffectsPanel({ t, segment, localTime, onChange, onSeek, onPreviewAnimation, selectedFilterId, trOption, onSelectFilter, contextMode = false, sourceAudioLinked = false }) {
  const [activeTab, setActiveTab] = useState("transform");
  const [animationSection, setAnimationSection] = useState("in");
  const [hoveredAnimation, setHoveredAnimation] = useState(null);
  const keyframes = normalizeVisualKeyframes(segment?.keyframes ?? []);
  const transform = resolveVisualTransform(keyframes, localTime, segment?.baseTransform);
  const mask = segment?.mask ?? { type: "none", feather: 0, inverted: false };
  const hasMask = mask.type && mask.type !== "none";
  const isCircleMask = mask.type === "circle";
  const isVideo = segment?.type === "video";
  const playbackRate = Math.max(0.25, Math.min(4, Number(segment?.playbackRate) || 1));
  const clipAnimation = normalizeVisualClipAnimation(segment?.animation);
  const activeAnimation = clipAnimation[animationSection];
  const sourceDuration = Math.max(0, Number(segment?.sourceDuration) || (Number(segment?.duration) || 0) * playbackRate);
  const updateTransform = (key, value) => onChange?.(
    hasVisualPropertyKeyframe(keyframes, localTime, key)
      ? { propertyKeyframe: { time: localTime, key, value } }
      : { baseTransform: { [key]: value } },
  );
  const tabs = [
    ["transform", t("visualTabTransform")],
    ["mask", t("visualTabMask")],
    ["speed", t("visualTabSpeed")],
    ["effects", t("visualTabEffects")],
    ["animation", t("visualTabAnimation")],
  ];
  useEffect(() => {
    if (!hoveredAnimation || !segment || !onPreviewAnimation) return undefined;
    let frame = 0;
    let lastPaint = 0;
    const startedAt = performance.now();
    const paint = (now) => {
      if (now - lastPaint >= 32) {
        const phaseProgress = ((now - startedAt) % 1100) / 900;
        const progress = Math.min(1, phaseProgress);
        const previewAnimation = {
          ...clipAnimation,
          [hoveredAnimation.phase]: {
            id: hoveredAnimation.id,
            duration: DEFAULT_VISUAL_ANIMATION_DURATION,
          },
        };
        const previewLocalTime = hoveredAnimation.phase === "in"
          ? progress * DEFAULT_VISUAL_ANIMATION_DURATION
          : Math.max(0, Number(segment.duration) - DEFAULT_VISUAL_ANIMATION_DURATION + progress * DEFAULT_VISUAL_ANIMATION_DURATION);
        onPreviewAnimation({ segmentId: segment.id, animation: previewAnimation, localTime: previewLocalTime });
        lastPaint = now;
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      onPreviewAnimation(null);
    };
  }, [hoveredAnimation, onPreviewAnimation, segment?.id, segment?.duration]);
  return (
    <div className={`tool-panel visual-effects-panel ${contextMode ? "is-context-mode" : ""}`}>
      {!contextMode ? <h2>{t("imageTrack")}</h2> : null}
      {!segment ? <div className="empty-state">{t("visualSelectClip")}</div> : <>
        <div className="visual-context-tabs" role="tablist" aria-label={t("imageTrack")}>{tabs.map(([id, label]) => <button type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} key={id} onClick={() => setActiveTab(id)}>{label}</button>)}</div>
        {activeTab === "transform" ?
        <section className="visual-editor-card">
          <div className="visual-editor-heading"><span><Diamond size={16} weight="fill" />{t("visualKeyframes")}</span><em>{localTime.toFixed(2)}s · {keyframes.length} {t("visualFrames")}</em></div>
          <button className="panel-secondary visual-add-all-keyframes" type="button" onClick={() => onChange?.({ keyframe: { time: localTime, ...transform } })}><Diamond size={14} weight="fill" />{t("visualAddAllKeyframes")}</button>
          {keyframes.length ? <div className="visual-keyframe-times" aria-label={t("visualKeyframes")}>{keyframes.map((frame) => <button type="button" aria-label={`${frame.time.toFixed(2)}s · ${t("visualKeyframes")}`} className={Math.abs(frame.time - localTime) <= 0.04 ? "is-current" : ""} key={frame.time} onClick={() => onSeek?.(frame.time)}>{frame.time.toFixed(2)}s</button>)}</div> : null}
          {[['scale', t('visualScale'), 0.2, 3, 0.01, 100], ['x', t('visualPositionX'), -100, 100, 1, 1], ['y', t('visualPositionY'), -100, 100, 1, 1], ['rotation', t('visualRotation'), -180, 180, 1, 1], ['opacity', t('visualOpacity'), 0, 1, 0.01, 100]].map(([key, label, min, max, step, displayScale]) => {
            const keyed = hasVisualPropertyKeyframe(keyframes, localTime, key);
            const displayValue = Math.round(transform[key] * displayScale * 100) / 100;
            return <div className="slider-field compact-slider visual-keyframe-property" key={key}><div><label>{label}</label><span className="visual-property-value"><label className="visual-number-field"><input aria-label={`${label} · ${t("visualKeyframes")}`} type="number" min={min * displayScale} max={max * displayScale} step={step * displayScale} value={displayValue} onChange={(event) => updateTransform(key, Number(event.target.value) / displayScale)} /><i>{key === 'rotation' ? '°' : '%'}</i></label><button className={keyed ? "is-active" : ""} type="button" aria-label={`${keyed ? t("visualRemovePropertyKeyframe") : t("visualAddPropertyKeyframe")} · ${label}`} onClick={() => keyed ? onChange?.({ removePropertyKeyframe: { time: localTime, key } }) : onChange?.({ propertyKeyframe: { time: localTime, key, value: transform[key] } })}><Diamond size={13} weight={keyed ? "fill" : "regular"} /></button></span></div><input aria-label={`${label} · slider`} type="range" min={min} max={max} step={step} value={transform[key]} onChange={(event) => updateTransform(key, Number(event.target.value))} /></div>;
          })}
          <button className="panel-secondary" type="button" onClick={() => onChange?.({ removeKeyframeAt: localTime })}>{t("visualDeleteKeyframe")}</button>
        </section> : null}
        {activeTab === "mask" ?
        <section className="visual-editor-card">
          <div className="visual-editor-heading"><strong>{t("visualMask")}</strong><em>{t("visualClipScoped")}</em></div>
          <div className="mask-choice-grid">{[['none',t('visualMaskNone')],['rectangle',t('visualMaskRectangle')],['rounded',t('visualMaskRounded')],['circle',t('visualMaskCircle')]].map(([id,label]) => <button type="button" key={id} className={mask.type === id ? 'is-active' : ''} onClick={() => onChange?.({ mask: { ...mask, type: id, ...(id === 'circle' && !Number.isFinite(mask.size) ? { size: 72 } : {}), ...(id === 'rounded' && !Number.isFinite(mask.cornerRadius) ? { cornerRadius: 12 } : {}) } })}>{label}</button>)}</div>
          {hasMask ? <>
            <div className="slider-field compact-slider"><div><label>{t("visualFeather")}</label><span>{mask.feather || 0}%</span></div><input type="range" min="0" max="40" value={mask.feather || 0} onChange={(event) => onChange?.({ mask: { ...mask, feather: Number(event.target.value) } })} /></div>
            {[['centerX',t('visualHorizontal'),0,100,50],['centerY',t('visualVertical'),0,100,50]].map(([key,label,min,max,fallback]) => <div className="slider-field compact-slider" key={key}><div><label>{label}</label><span>{Number.isFinite(mask[key]) ? Math.round(mask[key]) : fallback}%</span></div><input type="range" min={min} max={max} value={Number.isFinite(mask[key]) ? mask[key] : fallback} onChange={(event) => onChange?.({ mask: { ...mask, [key]: Number(event.target.value) } })} /></div>)}
            {isCircleMask ? <div className="slider-field compact-slider"><div><label>{t("visualDiameter")}</label><span>{Number.isFinite(mask.size) ? Math.round(mask.size) : 72}%</span></div><input type="range" min="8" max="100" value={Number.isFinite(mask.size) ? mask.size : 72} onChange={(event) => onChange?.({ mask: { ...mask, size: Number(event.target.value) } })} /></div> : [['width',t('visualWidth'),8,100,80],['height',t('visualHeight'),8,100,80]].map(([key,label,min,max,fallback]) => <div className="slider-field compact-slider" key={key}><div><label>{label}</label><span>{Number.isFinite(mask[key]) ? Math.round(mask[key]) : fallback}%</span></div><input type="range" min={min} max={max} value={Number.isFinite(mask[key]) ? mask[key] : fallback} onChange={(event) => onChange?.({ mask: { ...mask, [key]: Number(event.target.value) } })} /></div>)}
            {mask.type === "rounded" ? <div className="slider-field compact-slider"><div><label>{t("visualCornerRadius")}</label><span>{Number.isFinite(mask.cornerRadius) ? Math.round(mask.cornerRadius) : 12}%</span></div><input type="range" min="0" max="50" value={Number.isFinite(mask.cornerRadius) ? mask.cornerRadius : 12} onChange={(event) => onChange?.({ mask: { ...mask, cornerRadius: Number(event.target.value) } })} /></div> : null}
            <label className="switch-row"><input type="checkbox" checked={Boolean(mask.inverted)} onChange={(event) => onChange?.({ mask: { ...mask, inverted: event.target.checked } })} />{t("visualInvertMask")}</label>
          </> : <p className="mask-empty-hint">{t("visualMaskNoneHint")}</p>}
        </section> : null}
        {activeTab === "speed" ? <section className="visual-editor-card visual-speed-card">
          <div className="visual-editor-heading"><strong>{t("visualSpeed")}</strong><em>{t("visualClipScoped")}</em></div>
          {isVideo ? <>
            <div className="visual-speed-presets" aria-label={t("visualSpeed")}>{[0.25, 0.5, 1, 1.5, 2, 3, 4].map((rate) => <button type="button" className={Math.abs(playbackRate - rate) < 0.001 ? "is-active" : ""} key={rate} onClick={() => onChange?.({ playbackRate: rate })}>{rate}×</button>)}</div>
            <div className="slider-field compact-slider"><div><label>{t("visualSpeed")}</label><strong>{playbackRate.toFixed(playbackRate % 1 ? 2 : 0)}×</strong></div><input aria-label={t("visualSpeed")} type="range" min="0.25" max="4" step="0.05" value={playbackRate} onChange={(event) => onChange?.({ playbackRate: Number(event.target.value) })} /></div>
            <div className="visual-speed-summary"><span><em>{t("visualSourceDuration")}</em><strong>{sourceDuration.toFixed(2)}s</strong></span><span><em>{t("visualTimelineDuration")}</em><strong>{Number(segment.duration).toFixed(2)}s</strong></span></div>
            <p className="visual-speed-hint">{sourceAudioLinked ? t("sourceAudioSynced") : t("visualSpeedVisualOnlyHint")}</p>
          </> : <div className="empty-state visual-speed-empty">{t("visualSpeedImageHint")}</div>}
        </section> : null}
        {activeTab === "effects" ? <VisualChoicePanel title={t("visualEffects")} kind="effect" options={EFFECT_OPTIONS} selectedId={selectedFilterId} trOption={trOption} onSelect={onSelectFilter} /> : null}
        {activeTab === "animation" ? <section className="visual-editor-card visual-animation-card">
          <div className="visual-editor-heading"><strong>{t("visualAnimation")}</strong><em>{t("visualAnimationHoverHint")}</em></div>
          <div className="visual-animation-sections" role="tablist" aria-label={t("visualAnimation")}>
            {[['in', t('visualAnimationIn')], ['out', t('visualAnimationOut')]].map(([id, label]) => <button type="button" role="tab" aria-selected={animationSection === id} className={animationSection === id ? 'is-active' : ''} key={id} onClick={() => setAnimationSection(id)}>{label}</button>)}
          </div>
          <div className="visual-animation-grid">
            {VISUAL_CLIP_ANIMATION_OPTIONS.map((option) => <button
              type="button"
              className={activeAnimation.id === option.id ? "is-active" : ""}
              key={option.id}
              onPointerEnter={() => option.id !== "none" && setHoveredAnimation({ phase: animationSection, id: option.id })}
              onPointerLeave={() => setHoveredAnimation(null)}
              onFocus={() => option.id !== "none" && setHoveredAnimation({ phase: animationSection, id: option.id })}
              onBlur={() => setHoveredAnimation(null)}
              onClick={() => onChange?.({ animation: { ...clipAnimation, [animationSection]: { ...activeAnimation, id: option.id } } })}
            ><span className={`visual-animation-swatch is-${option.id}`} aria-hidden="true"><i /></span><strong>{t(option.labelKey)}</strong></button>)}
          </div>
          {activeAnimation.id !== "none" ? <div className="slider-field compact-slider visual-animation-duration"><div><label>{t("visualAnimationDuration")}</label><strong>{activeAnimation.duration.toFixed(1)}s</strong></div><input aria-label={t("visualAnimationDuration")} type="range" min="0.1" max={Math.min(3, Math.max(0.1, Number(segment.duration) || 0.1))} step="0.1" value={activeAnimation.duration} onChange={(event) => onChange?.({ animation: { ...clipAnimation, [animationSection]: { ...activeAnimation, duration: Number(event.target.value) } } })} /></div> : null}
        </section> : null}
      </>}
    </div>
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

export function SmartVisionPanel({
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
  onStickerConfirm,
  closeMobilePanel,
  mobilePanelOpen,
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
  const selectedSticker = stickerOptions.find((option) => option.id === selectedId) ?? null;

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
      {selectedSticker && mobilePanelOpen ? createPortal((
        <div className="mobile-sticker-actions" aria-label={t("mobileStickerActions")}>
          <button type="button" className="is-secondary" onClick={() => {
            onSelect(emptySticker.id);
            closeMobilePanel?.();
          }}>{t("mobileStickerCancel")}</button>
          <button type="button" onClick={() => {
            onStickerConfirm?.(selectedSticker);
            closeMobilePanel?.();
          }}>{t("addSticker")}</button>
        </div>
      ), document.body) : null}
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
  statusText,
  progressPercent,
  audioBlob,
  audioUrl,
  generateVoiceover,
  downloadBlob,
  favoriteVoiceIds,
  setFavoriteVoiceIds,
  t,
}) {
  const voiceLanguages = useMemo(() => [...new Set(VOICES.map((voice) => voice.language))], []);
  const voiceSampleRef = useRef(null);
  const previousVoiceSampleIdRef = useRef(selectedVoiceId);

  const selectAndPlayVoiceSample = (voice) => {
    previousVoiceSampleIdRef.current = voice.id;
    flushSync(() => setSelectedVoiceId(voice.id));
    const player = voiceSampleRef.current;
    if (!player) return;
    player.pause();
    player.load();
    delete player.dataset.autoplayStarted;
    delete player.dataset.autoplayError;
    player.play()
      .then(() => { player.dataset.autoplayStarted = "true"; })
      .catch((error) => { player.dataset.autoplayError = error.name || "PlaybackError"; });
  };

  useEffect(() => {
    const player = voiceSampleRef.current;
    if (!player) return;
    if (previousVoiceSampleIdRef.current === selectedVoiceId) return;
    previousVoiceSampleIdRef.current = selectedVoiceId;
    player.pause();
    player.load();
  }, [selectedVoiceId]);

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
                {["all", ...voiceLanguages].map((filter) => (
                  <button
                    type="button"
                    className={voiceFilter === filter ? "is-selected" : ""}
                    key={filter}
                    onClick={() => {
                      setVoiceFilter(filter);
                      if (filter !== "all") {
                        const firstVoiceForLanguage = VOICES.find((voice) => voice.language === filter);
                        if (firstVoiceForLanguage) selectAndPlayVoiceSample(firstVoiceForLanguage);
                      }
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
            onClick={() => selectAndPlayVoiceSample(voice)}
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
        <span title={selectedVoice.detail}>{selectedVoice.detail}</span>
        <button
          type="button"
          onClick={() =>
            setFavoriteVoiceIds((ids) =>
              ids.includes(selectedVoiceId) ? ids.filter((id) => id !== selectedVoiceId) : [...ids, selectedVoiceId],
            )
          }
        >
          {favoriteVoiceIds.includes(selectedVoiceId) ? t("saved") : t("favorite")}
        </button>
      </div>

      <div className="voice-sample-preview">
        <div>
          <strong>{t("voiceSampleTitle", "音色样音")}</strong>
          <span>{selectedVoice.name} · {t("voiceSampleHint", "切换音色后试听对应的预生成样音")}</span>
        </div>
        <audio
          ref={voiceSampleRef}
          data-testid="voice-sample-player"
          data-voice-id={selectedVoice.id}
          controls
          preload="metadata"
          src={selectedVoice.sampleUrl}
        />
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
        <div className="voice-generation-loading" role="status" aria-live="polite">
          <i className="voice-generation-spinner" aria-hidden="true" />
          <div>
            <strong>{statusText || t("generating")}</strong>
            <span>{t("ttsFirstRunHint")}</span>
          </div>
          <em>{Math.round(progressPercent)}%</em>
          <div className="progress-track" aria-label={t("generationProgress")}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      <div className="voice-actions">
        <button className="generate-button" type="button" disabled={status === "generating" || !script.trim()} onClick={generateVoiceover}>
          {status === "generating" ? <i className="generate-button-spinner" aria-hidden="true" /> : <Waveform size={18} weight="bold" />}
          {status === "generating" ? t("generating") : audioBlob ? t("regenerateVoice") : t("generateVoice")}
        </button>
        <button className="secondary-download" type="button" disabled={!audioBlob} onClick={() => audioBlob && downloadBlob(audioBlob, "ai-voiceover.wav")}>
          <DownloadSimple size={17} />
        </button>
      </div>
      {audioBlob && audioUrl ? (
        <div className="generated-voice-result" aria-live="polite">
          <div><Check size={18} weight="bold" /><span><strong>{t("voiceAddedToTimeline", "已加入配音时间线")}</strong><em>{t("voicePreviewHint", "试听本次已生成的时间线配音")}</em></span></div>
          <audio controls preload="metadata" src={audioUrl} />
        </div>
      ) : null}
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
