import {
  CaretDown,
  Check,
  CloudArrowUp,
  DownloadSimple,
  MicrophoneStage,
  MusicNote,
  Pause,
  Trash,
  Waveform,
} from "@phosphor-icons/react";

import { EFFECT_OPTIONS, FILTER_OPTIONS, SAMPLE_IMAGE, STICKERS, TRANSITIONS, VOICES } from "../config/editor.js";
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
    captionsEnabled,
    setCaptionsEnabled,
    selectedFilterId,
    setSelectedFilterId,
    selectedTransitionId,
    setSelectedTransitionId,
    selectedStickerId,
    setSelectedStickerId,
    audioBlob,
    audioDuration,
    sourceAudioBlob,
    sourceAudioName,
    sourceAudioDuration,
    sourceAudioVolume,
    setSourceAudioVolume,
    clearSourceAudioTrack,
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
      <div className="tool-panel">
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
            min="20"
            max="42"
            step="1"
            value={captionSize}
            onChange={(event) => setCaptionSize(Number(event.target.value))}
          />
        </div>
        {selectedCaptionSegment ? (
          <div className="caption-editor">
            <label htmlFor="caption-editor">{t("currentCaption")}</label>
            <textarea
              id="caption-editor"
              value={selectedCaptionSegment.text}
              onChange={(event) => updateCaptionSegmentText(selectedCaptionSegment.id, event.target.value)}
            />
            <label className="switch-row">
              <input
                type="checkbox"
                checked={!selectedCaptionSegment.hidden}
                onChange={() => toggleCaptionSegmentHidden(selectedCaptionSegment.id)}
              />
              {t("showCurrentCaption")}
            </label>
            <button
              className="panel-danger"
              type="button"
              onClick={() => deleteCaptionSegment(selectedCaptionSegment.id)}
            >
              <Trash size={15} />
              {t("deleteCurrentCaption")}
            </button>
          </div>
        ) : null}
        <div className="segment-list">
          {captionSegments.length ? (
            captionSegments.map((segment, index) => (
              <button
                type="button"
                className={`${index === currentSegmentIndex ? "is-current" : ""} ${
                  segment.id === selectedSegmentId ? "is-selected" : ""
                } ${segment.hidden ? "is-hidden" : ""}`}
                key={segment.id}
                onClick={() => {
                  setSelectedSegmentId(segment.id);
                  seekTo(getSegmentStartTime(captionSegments, index, captionTargetDuration));
                }}
              >
                {segment.text}
              </button>
            ))
          ) : (
            <div className="empty-state">{t("noCaptionSegments")}</div>
          )}
        </div>
      </div>
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
      <ChoicePanel
        title={t("stickers")}
        options={STICKERS}
        selectedId={selectedStickerId}
        trOption={trOption}
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
            style={{
              "--choice-image": `url(${SAMPLE_IMAGE})`,
              "--choice-filter": option.css ?? "none",
            }}
            onClick={() => onSelect(option.id)}
          >
            <span className="visual-choice-thumb" aria-hidden="true" />
            <span className="visual-choice-label">
              <span>{trOption(option.name)}</span>
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
            <span>{trOption(option.name)}</span>
            {selectedId === option.id ? <Check size={16} /> : null}
          </button>
        ))}
      </div>
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
  useRecordedVoice,
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
              <button type="button" onClick={() => useRecordedVoice(recording)}>
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

export function HistoryPanel({ historyItems, useHistoryItem, setHistoryItems, downloadBlob, t }) {
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
            <button type="button" onClick={() => useHistoryItem(item)}>
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
