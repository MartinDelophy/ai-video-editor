import {
  CheckCircle,
  ClosedCaptioning,
  Eye,
  EyeSlash,
  ImageSquare,
  ListBullets,
  PersonSimpleRun,
  Scissors,
  Sparkle,
  Trash,
  Waveform,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatTime, getSegmentStartTime } from "../lib/timeline.js";
import { LIVE_PORTRAIT_WEB_MODEL } from "../config/livePortrait.js";
import { probeLivePortraitWebEnvironment } from "../lib/livePortraitWeb.js";
import { getCaptionVoiceSegment } from "../lib/captionVoice.js";
import { normalizeVisualKeyframes } from "../lib/visualEffects.js";
import { HistoryPanel, MyVoicesPanel, SmartVisionPanel, VisualEffectsPanel, VoiceSynthesisPanel } from "./panels.jsx";

function AutoEditReviewDialog({ t, autoEdit }) {
  const { review, job } = autoEdit || {};
  if (!review?.open || typeof document === "undefined") return null;
  const complete = !job.running && review.captions.length > 0;
  return createPortal(
    <div className="auto-edit-review-backdrop" role="presentation">
      <section className="auto-edit-review-dialog" role="dialog" aria-modal="true" aria-label={t("autoEditReviewTitle")}>
        <header className="auto-edit-review-header">
          <div className="auto-edit-review-mark"><Sparkle size={19} weight="fill" /></div>
          <div><span>{t("smartAutoEdit")}</span><h2>{t("autoEditReviewTitle")}</h2></div>
          <div className={`auto-edit-review-status ${complete ? "is-complete" : review.error ? "is-error" : ""}`}><i />{review.error ? t("autoEditReviewFailed") : complete ? t("autoEditReviewReady") : job.phase}</div>
          <button type="button" className="auto-edit-review-close" aria-label={t("close")} onClick={autoEdit.closeReview}><X size={18} /></button>
        </header>

        <div className="auto-edit-review-progress"><span style={{ width: `${job.progress || 0}%` }} /></div>
        <div className="auto-edit-review-body">
          <section className="auto-edit-review-section">
            <div className="auto-edit-review-section-title"><div><span>01</span><strong>{t("autoEditCandidateTitle")}</strong></div><em>{review.candidates.length} {t("autoEditFramesUnit")}</em></div>
            <p>{t("autoEditCandidateHint")}</p>
            {review.candidates.length ? <div className="auto-edit-candidate-grid">{review.candidates.map((candidate, index) => (
              <article className="auto-edit-candidate-card" key={candidate.id}>
                <div><img src={candidate.url} alt={`${t("autoEditCandidateFrame")} ${index + 1}`} /><span>#{String(index + 1).padStart(2, "0")}</span><em>{candidate.aspectRatio}</em><time>{formatTime(candidate.time)}</time></div>
                <footer><span>{t("autoEditVisualChange")}</span><strong>{Math.round(candidate.difference * 100)}%</strong><i><b style={{ width: `${Math.min(100, Math.max(5, candidate.difference * 100))}%` }} /></i></footer>
              </article>
            ))}</div> : <div className="auto-edit-review-loading"><i /><span>{t("autoEditFindingScenes")}</span></div>}
          </section>

          <section className="auto-edit-review-section auto-edit-model-results">
            <div className="auto-edit-review-section-title"><div><span>02</span><strong>{t("autoEditModelResultTitle")}</strong></div><em>{review.captions.length} {t("captionSegmentsUnit")}</em></div>
            <p>{t("autoEditModelResultHint")}</p>
            {review.error ? <div className="auto-edit-review-error"><strong>{t("autoEditReviewFailed")}</strong><span>{review.error}</span></div> : review.segments.length ? <div className="auto-edit-clip-results">{review.segments.map((segment) => {
              const segmentCaptions = review.captions.filter((caption) => caption.visualSegmentId === segment.id);
              const preview = review.candidates.find((candidate) => candidate.segmentId === segment.id);
              return <article className={`auto-edit-clip-result is-${segment.status}`} key={segment.id}>
                <header>{preview ? <img src={preview.url} alt="" /> : null}<div><strong>{segment.name || `${t("autoEditClip")} ${(segment.index ?? 0) + 1}`}</strong><span>{review.candidates.filter((candidate) => candidate.segmentId === segment.id).length} {t("autoEditFramesUnit")}</span></div><em>{t(`autoEditSegmentStatus_${segment.status}`)}</em></header>
                {segment.error ? <p className="auto-edit-clip-error">{segment.error}</p> : segmentCaptions.length ? <><div className="auto-edit-result-list">{segmentCaptions.map((caption, index) => (
                  <article key={caption.id}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{caption.text}</p><time>{formatTime(caption.start)} → {formatTime(caption.end)}</time></div></article>
                ))}</div>{segment.status === "running" ? <div className="auto-edit-clip-pending"><i /><span>{t("autoEditWindowProgress").replace("{current}", segment.windowIndex || 0).replace("{total}", segment.totalWindows || 0)}</span></div> : null}</> : <div className="auto-edit-clip-pending">{segment.status === "running" ? <i /> : null}<span>{segment.status === "running" && segment.totalWindows ? t("autoEditWindowProgress").replace("{current}", segment.windowIndex || 0).replace("{total}", segment.totalWindows) : t(`autoEditSegmentHint_${segment.status}`)}</span></div>}
              </article>;
            })}</div> : <div className="auto-edit-review-loading"><i /><span>{job.running ? job.phase : t("autoEditWaitingForModel")}</span></div>}
          </section>
        </div>
        <footer className="auto-edit-review-actions">
          <div><strong>{complete ? t("autoEditReviewSummaryReady") : t("autoEditReviewSummaryRunning")}</strong><span>{t("autoEditReviewSummaryHint")}</span></div>
          <button type="button" className="panel-secondary" onClick={autoEdit.closeReview}>{job.running ? t("cancel") : t("close")}</button>
          <button type="button" className="auto-edit-apply" disabled={!complete} onClick={autoEdit.applyCaptions}><Sparkle size={16} weight="fill" />{t("autoEditApplyCaptions")}</button>
        </footer>
      </section>
    </div>, document.body,
  );
}

function AutoEditPanel({ t, hasVisual, language, autoEdit }) {
  const availability = autoEdit?.support?.availability || "unknown";
  const languageFallback = autoEdit?.support?.language && autoEdit.support.language !== language;
  const ready = availability === "available" || availability === "downloadable" || availability === "downloading";
  return (<>
    <div className="auto-edit-panel">
      <section className="auto-edit-intro"><Scissors size={28} weight="duotone" /><div><strong>{t("autoEditCreateTitle")}</strong><span>{t("autoEditCreateDesc")}</span></div></section>
      <section className="auto-edit-status-card">
        <div><span>{t("autoEditBrowserModel")}</span><strong className={`auto-edit-availability is-${availability}`}>{t(`autoEditStatus_${availability}`)}</strong></div>
        <p>{t("autoEditPrivacyHint")}</p>
        {languageFallback ? <p className="auto-edit-warning">{t("autoEditLanguageFallback")}</p> : null}
        <button className="panel-secondary" type="button" disabled={autoEdit?.job?.running || availability === "checking"} onClick={autoEdit?.checkSupport}>{t("autoEditCheckSupport")}</button>
      </section>
      <div className="auto-edit-flow"><span>1</span><p><strong>{t("autoEditStepScenes")}</strong><small>{t("autoEditStepScenesHint")}</small></p><span>2</span><p><strong>{t("autoEditStepCaptions")}</strong><small>{t("autoEditStepCaptionsHint")}</small></p><span>3</span><p><strong>{t("autoEditStepTimeline")}</strong><small>{t("autoEditStepTimelineHint")}</small></p></div>
      {autoEdit?.job?.running ? <div className="auto-edit-progress"><div><span>{autoEdit.job.phase}</span><strong>{autoEdit.job.progress}%</strong></div><progress max="100" value={autoEdit.job.progress} /><button className="panel-secondary" type="button" onClick={autoEdit.cancel}>{t("cancel")}</button></div> : null}
      <button className="auto-edit-generate" type="button" disabled={!hasVisual || !ready || autoEdit?.job?.running} onClick={autoEdit?.run}>
        <span className="auto-edit-generate-icon"><Sparkle size={17} weight="fill" /></span>
        <span><strong>{hasVisual ? t("autoEditGenerate") : t("autoEditNeedsVisual")}</strong><small>{hasVisual ? t("autoEditGenerateHint") : t("autoEditNeedsVisualHint")}</small></span>
        <span className="auto-edit-generate-arrow">→</span>
      </button>
    </div>
    <AutoEditReviewDialog t={t} autoEdit={autoEdit} />
  </>);
}

function CaptionContextPanel({
  t,
  captionSegments,
  selectedCaptionSegment,
  selectedSegmentId,
  setSelectedSegmentId,
  currentSegmentIndex,
  captionTargetDuration,
  updateCaptionSegmentText,
  toggleCaptionSegmentHidden,
  deleteCaptionSegment,
  seekTo,
  sourceAudioBlob,
  generateCaptionsFromSourceAudio,
  isGeneratingCaptions,
  automaticCaptionProgress,
}) {
  const selectedIndex = Math.max(
    0,
    captionSegments.findIndex((segment) => segment.id === selectedCaptionSegment?.id),
  );
  const selectedStart = captionSegments.length
    ? getSegmentStartTime(captionSegments, selectedIndex, captionTargetDuration)
    : 0;

  return (
    <div className="caption-context-panel">
      <label className="field-label" htmlFor="caption-context-input">
        {t("captionScriptLabel", "字幕文案")}
      </label>
      {selectedCaptionSegment ? (
        <div className="script-box caption-sync-box">
          <textarea
            id="caption-context-input"
            value={selectedCaptionSegment.text}
            onChange={(event) => updateCaptionSegmentText(selectedCaptionSegment.id, event.target.value)}
          />
          <div className="script-meta">
            <button type="button" onClick={() => seekTo(selectedStart)}>
              <ClosedCaptioning size={14} />
              {formatTime(selectedStart)}
            </button>
            <span>{selectedCaptionSegment.text.length} / 500</span>
          </div>
        </div>
      ) : (
        <div className="caption-context-empty">
          <ClosedCaptioning size={28} weight="duotone" />
          <strong>{t("noCaptionSegments")}</strong>
          <span>{t("captionEmptyHint", "字幕片段可拖动到字幕轨道，并在这里同步编辑。")}</span>
        </div>
      )}

      <div className="caption-context-actions">
        <button
          className="panel-secondary"
          type="button"
          disabled={!selectedCaptionSegment}
          onClick={() => selectedCaptionSegment && toggleCaptionSegmentHidden(selectedCaptionSegment.id)}
        >
          {selectedCaptionSegment?.hidden ? <Eye size={15} /> : <EyeSlash size={15} />}
          {selectedCaptionSegment?.hidden ? t("showCurrentCaption") : t("hideCurrentCaption", "隐藏当前字幕")}
        </button>
        <button
          className="panel-danger"
          type="button"
          disabled={!selectedCaptionSegment}
          onClick={() => selectedCaptionSegment && deleteCaptionSegment(selectedCaptionSegment.id)}
        >
          <Trash size={15} />
          {t("deleteCurrentCaption")}
        </button>
      </div>

      {!captionSegments.length ? (
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
      ) : null}

      <div className="caption-context-heading">
        <ListBullets size={16} />
        <span>{t("captionList", "字幕列表")}</span>
      </div>
      <div className="caption-context-list">
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
              <span>{segment.text}</span>
              <em>{formatTime(getSegmentStartTime(captionSegments, index, captionTargetDuration))}</em>
            </button>
          ))
        ) : (
          <div className="empty-state">{t("noCaptionSegments")}</div>
        )}
      </div>
    </div>
  );
}

function AudioClipContextPanel({ t, segment, updateAudioSegment, toggleAudioSegmentReverse, deleteAudioSegment, downloadBlob }) {
  return (
    <div className="audio-clip-context-panel">
      <div className="avatar-context-hero">
        <span><Waveform size={22} weight="duotone" /></span>
        <div><small>{t("voiceTrack")}</small><strong>{segment.name || t("audioClip")}</strong><em>{formatTime(segment.duration)}</em></div>
      </div>
      <label className="audio-property-row">
        <span>{t("audioClipStart")}</span>
        <input type="number" min="0" step="0.1" value={Number(segment.start.toFixed(1))} onChange={(event) => updateAudioSegment(segment.id, { start: Math.max(0, Number(event.target.value) || 0) })} />
      </label>
      <label className="audio-property-slider">
        <span><b>{t("volume")}</b><em>{Math.round((segment.volume ?? 1) * 100)}%</em></span>
        <input type="range" min="0" max="1" step="0.01" value={segment.volume ?? 1} onChange={(event) => updateAudioSegment(segment.id, { volume: Number(event.target.value) })} />
      </label>
      <label className="audio-property-slider">
        <span><b>{t("fadeIn")}</b><em>{(segment.fadeIn ?? 0).toFixed(1)}s</em></span>
        <input type="range" min="0" max={Math.min(3, segment.duration / 2)} step="0.1" value={segment.fadeIn ?? 0} onChange={(event) => updateAudioSegment(segment.id, { fadeIn: Number(event.target.value) })} />
      </label>
      <label className="audio-property-slider">
        <span><b>{t("fadeOut")}</b><em>{(segment.fadeOut ?? 0).toFixed(1)}s</em></span>
        <input type="range" min="0" max={Math.min(3, segment.duration / 2)} step="0.1" value={segment.fadeOut ?? 0} onChange={(event) => updateAudioSegment(segment.id, { fadeOut: Number(event.target.value) })} />
      </label>
      <div className="audio-context-actions">
        <button className={`panel-secondary ${segment.reversed ? "is-active" : ""}`} type="button" disabled={segment.reversing} onClick={() => toggleAudioSegmentReverse(segment.id)}>
          {segment.reversing ? t("audioReversing") : segment.reversed ? t("audioReverseRestore") : t("audioReverse")}
        </button>
        <button className="panel-secondary" type="button" onClick={() => downloadBlob(segment.blob, `${segment.name || "voiceover"}.wav`)}>{t("downloadAudioClip")}</button>
        <button className="panel-secondary is-danger" type="button" onClick={() => deleteAudioSegment(segment.id)}><Trash size={15} />{t("deleteAudioClip")}</button>
      </div>
    </div>
  );
}

function StickerContextPanel({ t, segment, updateStickerSegment, deleteStickerSegment }) {
  if (!segment) return null;
  const round = (value) => Math.round(value * 100) / 100;
  const updateNumber = (key, value, min, max) => updateStickerSegment({
    [key]: round(Math.max(min, Math.min(max, Number(value) || 0))),
  });
  const fields = [
    ["x", t("stickerHorizontalPosition"), 0, 100, "%"],
    ["y", t("stickerVerticalPosition"), 0, 100, "%"],
    ["scale", t("stickerScale"), 0.2, 3, "x"],
    ["rotation", t("stickerRotation"), -180, 180, "°"],
  ];
  return (
    <div className="sticker-properties-panel">
      <div className="sticker-properties-preview"><img src={segment.src} alt="" /></div>
      <div className="sticker-property-grid">
        {fields.map(([key, label, min, max, unit]) => (
          <label key={key}>{label}<input type="number" min={min} max={max} step="0.01" value={round(Number.isFinite(segment[key]) ? segment[key] : key === "scale" ? 1 : key === "x" ? 82 : key === "y" ? 20 : 0)} onChange={(event) => updateNumber(key, event.target.value, min, max)} />{unit ? null : null}</label>
        ))}
      </div>
      <label className="sticker-property-field">
        <div><span>{t("stickerOpacity")}</span><strong>{Math.round((Number.isFinite(segment.opacity) ? segment.opacity : 1) * 100)}%</strong></div>
        <input type="range" min="0" max="1" step="0.01" value={Number.isFinite(segment.opacity) ? segment.opacity : 1} onChange={(event) => updateNumber("opacity", event.target.value, 0, 1)} />
      </label>
      <button className="sticker-delete-button" type="button" onClick={deleteStickerSegment}><Trash size={14} />{t("deleteSticker")}</button>
    </div>
  );
}

function AvatarContextPanel({ t, hasVisual, visualType, audioBlob, audioDuration, captionSegments, selectedVoice, avatarJob, generateAvatarAcceptanceFrame }) {
  const hasPortrait = hasVisual && visualType === "image";
  const [probeState, setProbeState] = useState("idle");
  const [probeResult, setProbeResult] = useState(null);
  const [avatarQuality, setAvatarQuality] = useState("preview");

  const runProbe = async () => {
    setProbeState("running");
    try {
      setProbeResult(await probeLivePortraitWebEnvironment());
      setProbeState("done");
    } catch (error) {
      setProbeResult({ readyForPorting: false, checks: [{ id: "runtime", state: "failed", detail: error instanceof Error ? error.message : String(error) }] });
      setProbeState("done");
    }
  };

  return (
    <div className="avatar-context-panel">
      <div className="avatar-context-hero">
        <span><Waveform size={21} weight="duotone" /></span>
        <div><small>{t("avatarKicker")}</small><strong>{t("avatarLipSyncTitle")}</strong><em>{t("avatarLipSyncDescription")}</em></div>
      </div>
      <div className="avatar-input-list">
        <div className={hasPortrait ? "is-ready" : ""}><CheckCircle size={17} weight="fill" /><span><strong>{t("avatarPortrait")}</strong><em>{hasPortrait ? t("avatarCurrentPortrait") : t("avatarNeedsPortrait")}</em></span></div>
        <div className={audioBlob ? "is-ready" : ""}><Waveform size={17} weight="duotone" /><span><strong>{t("avatarAudio")}</strong><em>{audioBlob ? `${selectedVoice?.name ?? "AI"} · ${audioDuration.toFixed(1)}s` : t("avatarNeedsAudio")}</em></span></div>
        <div className={captionSegments.length ? "is-ready" : ""}><ClosedCaptioning size={17} weight="duotone" /><span><strong>{t("avatarLipSyncSource")}</strong><em>{captionSegments.length ? `${captionSegments.length} ${t("captionSegmentsUnit")} · ${t("avatarCaptionSync")}` : t("avatarNeedsCaptions")}</em></span></div>
      </div>
      <div className="avatar-sync-mode"><span>{t("avatarModelSource")}</span><strong>{LIVE_PORTRAIT_WEB_MODEL.id}</strong></div>
      <div className="avatar-quality-picker" aria-label={t("avatarQuality")}>
        <button type="button" className={avatarQuality === "preview" ? "is-active" : ""} onClick={() => setAvatarQuality("preview")}>
          <strong>{t("avatarQualityPreview")}</strong><em>{t("avatarQualityPreviewHint")}</em>
        </button>
        <button type="button" className={avatarQuality === "quality" ? "is-active" : ""} onClick={() => setAvatarQuality("quality")}>
          <strong>{t("avatarQualityFull")}</strong><em>{t("avatarQualityFullHint")}</em>
        </button>
      </div>
      <p className="avatar-context-note">{t("avatarGenerationNote")}</p>
      <div className="avatar-porting-stages" aria-label={t("avatarPortingStatus")}>
        <div className="is-done"><span>1</span><strong>{t("avatarStagePinned")}</strong></div>
        <div className="is-done"><span>2</span><strong>{t("avatarStageGrid")}</strong></div>
        <div className="is-done"><span>3</span><strong>{t("avatarStageAudio")}</strong></div>
      </div>
      {probeResult ? (
        <div className="avatar-probe-results">
          {probeResult.checks.map((check) => <div className={`is-${check.state}`} key={check.id}><span />{check.detail}</div>)}
        </div>
      ) : null}
      <button className="panel-secondary avatar-probe-button" type="button" disabled={probeState === "running"} onClick={runProbe}>
        {probeState === "running" ? t("avatarChecking") : t("avatarCheck")}
      </button>
      {avatarJob?.running || avatarJob?.progress > 0 || avatarJob?.phase ? (
        <div className="avatar-generation-progress" aria-live="polite">
          <div><span>{avatarJob.phase || t("avatarGenerating")}</span><strong>{avatarJob.progress}%</strong></div>
          <i><b style={{ width: `${avatarJob.progress}%` }} /></i>
        </div>
      ) : null}
      <button
        className="panel-primary avatar-generate-button"
        type="button"
        disabled={!hasPortrait || avatarJob?.running}
        onClick={() => generateAvatarAcceptanceFrame(avatarQuality)}
      >
        <PersonSimpleRun size={17} weight="duotone" />
        {avatarJob?.running ? t("avatarGenerating") : t("avatarGenerate")}
      </button>
    </div>
  );
}

export function VoicePanel({
  t,
  activeTool,
  captionVoiceFocusRequest = 0,
  status,
  statusText,
  voiceTab,
  setVoiceTab,
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
  progressPercent,
  audioBlob,
  generateVoiceover,
  downloadBlob,
  favoriteVoiceIds,
  setFavoriteVoiceIds,
  recordedVoices,
  recordingState,
  recordingElapsed,
  startVoiceRecording,
  stopVoiceRecording,
  useRecordedVoice,
  historyItems,
  useHistoryItem,
  setHistoryItems,
  notify,
  audioUrl,
  audioRef,
  audioSegments,
  audioSegmentRefs,
  sourceAudioRef,
  musicRef,
  sourceAudioUrl,
  musicUrl,
  captionSegments,
  selectedCaptionSegment,
  selectedSegmentId,
  setSelectedSegmentId,
  currentSegmentIndex,
  captionTargetDuration,
  updateCaptionSegmentText,
  toggleCaptionSegmentHidden,
  deleteCaptionSegment,
  seekTo,
  sourceAudioBlob,
  sourceAudioLinked,
  generateCaptionsFromSourceAudio,
  isGeneratingCaptions,
  automaticCaptionProgress,
  avatarPanelOpen,
  smartMode = "auto-edit",
  autoEdit,
  uiLanguage,
  visionAnalysis,
  visionOptions,
  visionRunning,
  visionProgress,
  visionPhase,
  analyzeCurrentVisual,
  toggleVisionOption,
  clearVisionAnalysis,
  downloadVisionCutout,
  hasVisual,
  visualType,
  audioDuration,
  avatarJob,
  generateAvatarAcceptanceFrame,
  selectedTrack,
  selectedAudioSegment,
  updateAudioSegment,
  toggleAudioSegmentReverse,
  deleteAudioSegment,
  selectedVisualSegment,
  selectedStickerSegment,
  updateStickerSegment,
  deleteStickerSegment,
  visualLocalTime,
  visualTimelineStart = 0,
  updateSelectedVisualEffects,
  onPreviewAnimation,
  selectedFilterId,
  setSelectedFilterId,
  trOption,
}) {
  const [captionPanelTab, setCaptionPanelTab] = useState("caption");
  const panelRef = useRef(null);
  const isCaptionContext = activeTool === "caption";
  const isSmartContext = activeTool === "smart";
  const isAvatarContext = isSmartContext && smartMode === "avatar" && avatarPanelOpen;
  const isSmartAutoContext = isSmartContext && smartMode === "auto-edit";
  const isSmartFrameContext = isSmartContext && smartMode === "smart-frame";
  const isAudioClipContext = selectedTrack === "audio" && Boolean(selectedAudioSegment);
  const isVisualContext = !isSmartContext && selectedTrack === "image";
  const isStickerContext = selectedTrack === "sticker" && Boolean(selectedStickerSegment);
  const selectedCaptionAudioSegment = getCaptionVoiceSegment(audioSegments, selectedCaptionSegment);
  const title = isSmartAutoContext ? t("smartAutoEdit") : isSmartFrameContext ? t("smartFrame") : isAvatarContext ? t("avatarTitle") : isStickerContext ? t("stickerProperties") : isVisualContext ? t("visualPanelTitle") : isCaptionContext ? t("caption") : isAudioClipContext ? t("audioClipProperties") : t("aiVoice");
  const panelStatusText = isSmartAutoContext ? t(`autoEditStatus_${autoEdit?.support?.availability || "unknown"}`) : isSmartFrameContext ? (hasVisual ? t("smartVisualReady") : t("smartWaitingVisual")) : isCaptionContext
    ? captionSegments.length
      ? `${captionSegments.length} ${t("captionSegmentsUnit", "条字幕")}`
      : t("noCaptionSegments")
    : isStickerContext
      ? `${selectedStickerSegment.start.toFixed(2)}s · ${selectedStickerSegment.duration.toFixed(2)}s`
    : isVisualContext
      ? selectedVisualSegment
        ? `${visualLocalTime.toFixed(2)}s · ${normalizeVisualKeyframes(selectedVisualSegment.keyframes).length} ${t("visualFrames")}`
        : t("visualSelectClip")
    : isAvatarContext
      ? t("avatarPortingStatus")
    : isAudioClipContext
      ? `${formatTime(selectedAudioSegment.duration)} · ${selectedAudioSegment.start.toFixed(1)}s`
    : statusText === "模型待命"
      ? t("modelReady")
    : statusText;

  useEffect(() => {
    if (!captionVoiceFocusRequest || !isCaptionContext) return;
    setCaptionPanelTab("voice");
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panelRef.current?.querySelector(".voice-header")?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [captionVoiceFocusRequest, isCaptionContext]);

  useEffect(() => {
    panelRef.current?.querySelector(".voice-tab-body")?.scrollTo({ top: 0 });
  }, [activeTool, smartMode]);

  return (
    <aside ref={panelRef} className={`voice-panel ${isCaptionContext ? "is-caption-context" : ""} ${isAvatarContext ? "is-avatar-context" : ""} ${isAudioClipContext ? "is-audio-clip-context" : ""} ${isVisualContext ? "is-visual-context" : ""}`}>
      <div className="panel-title-row">
        <h1>{title}</h1>
        <span className={`status-pill ${isCaptionContext ? "done" : status}`}>
          {panelStatusText}
        </span>
      </div>

      {!isSmartContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext ? (
        <div className="tabs compact">
          {[
            ["synthesis", t("voiceSynthesis")],
            ["mine", t("myVoices")],
            ["history", t("history")],
          ].map(([id, label]) => (
            <button
              className={voiceTab === id ? "is-active" : ""}
              type="button"
              key={id}
              onClick={() => setVoiceTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {isCaptionContext ? (
        <div className="tabs compact caption-context-tabs" role="tablist" aria-label={t("captionTools", "字幕工具")}>
          <button
            className={captionPanelTab === "caption" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={captionPanelTab === "caption"}
            onClick={() => setCaptionPanelTab("caption")}
          >
            {t("caption", "字幕")}
          </button>
          <button
            className={captionPanelTab === "voice" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={captionPanelTab === "voice"}
            onClick={() => setCaptionPanelTab("voice")}
          >
            {t("aiVoice", "AI 配音")}
          </button>
        </div>
      ) : null}

      <div className="voice-tab-body">
        {isSmartAutoContext ? <AutoEditPanel t={t} hasVisual={hasVisual} language={uiLanguage} autoEdit={autoEdit} /> : null}
        {isSmartFrameContext ? <SmartVisionPanel t={t} language={uiLanguage} hasVisual={hasVisual} visualType={visualType} analysis={visionAnalysis} options={visionOptions} running={visionRunning} progress={visionProgress} phase={visionPhase} onAnalyze={analyzeCurrentVisual} onToggle={toggleVisionOption} onClear={clearVisionAnalysis} onDownloadCutout={downloadVisionCutout} /> : null}
        {isStickerContext ? <StickerContextPanel t={t} segment={selectedStickerSegment} updateStickerSegment={updateStickerSegment} deleteStickerSegment={deleteStickerSegment} /> : null}
        {isVisualContext && selectedVisualSegment ? (
          <VisualEffectsPanel
            contextMode
            t={t}
            segment={selectedVisualSegment}
            localTime={visualLocalTime}
            onChange={updateSelectedVisualEffects}
            onPreviewAnimation={onPreviewAnimation}
            onSeek={(time) => seekTo(visualTimelineStart + time)}
            selectedFilterId={selectedFilterId}
            trOption={trOption}
            onSelectFilter={(id) => { setSelectedFilterId(id); notify(t("effectApplied")); }}
            sourceAudioLinked={sourceAudioLinked}
          />
        ) : null}
        {isVisualContext && !selectedVisualSegment ? (
          <div className="visual-context-empty">
            <ImageSquare size={30} weight="duotone" />
            <strong>{t("visualSelectClip")}</strong>
            <span>{t("previewEmptyTitle")}</span>
          </div>
        ) : null}
        {isCaptionContext && captionPanelTab === "caption" ? (
          <CaptionContextPanel
            t={t}
            captionSegments={captionSegments}
            selectedCaptionSegment={selectedCaptionSegment}
            selectedSegmentId={selectedSegmentId}
            setSelectedSegmentId={setSelectedSegmentId}
            currentSegmentIndex={currentSegmentIndex}
            captionTargetDuration={captionTargetDuration}
            updateCaptionSegmentText={updateCaptionSegmentText}
            toggleCaptionSegmentHidden={toggleCaptionSegmentHidden}
            deleteCaptionSegment={deleteCaptionSegment}
            seekTo={seekTo}
            sourceAudioBlob={sourceAudioBlob}
            generateCaptionsFromSourceAudio={generateCaptionsFromSourceAudio}
            isGeneratingCaptions={isGeneratingCaptions}
            automaticCaptionProgress={automaticCaptionProgress}
          />
        ) : null}

        {isCaptionContext && captionPanelTab === "voice" ? (
          <div className="caption-voice-panel">
            <p className="caption-voice-hint">
              {selectedCaptionSegment
                ? t("captionVoiceHint", "仅为当前选中的字幕片段生成配音，并自动对齐到片段起点。")
                : t("captionVoiceEmptyHint", "请先在时间线中选择一个字幕片段。")}
            </p>
            <VoiceSynthesisPanel
              script={selectedCaptionSegment?.text ?? ""}
              updateScript={(text) => selectedCaptionSegment && updateCaptionSegmentText(selectedCaptionSegment.id, text)}
              selectedVoiceId={selectedVoiceId}
              setSelectedVoiceId={setSelectedVoiceId}
              selectedVoice={selectedVoice}
              filteredVoices={filteredVoices}
              voiceFilter={voiceFilter}
              setVoiceFilter={setVoiceFilter}
              showVoiceFilter={showVoiceFilter}
              setShowVoiceFilter={setShowVoiceFilter}
              speed={speed}
              setSpeed={setSpeed}
              volume={volume}
              setVolume={setVolume}
              status={status}
              progressPercent={progressPercent}
              audioBlob={selectedCaptionAudioSegment?.blob ?? null}
              audioUrl={selectedCaptionAudioSegment?.url ?? ""}
              generateVoiceover={() => selectedCaptionSegment && generateVoiceover(selectedCaptionSegment)}
              downloadBlob={downloadBlob}
              favoriteVoiceIds={favoriteVoiceIds}
              setFavoriteVoiceIds={setFavoriteVoiceIds}
              t={t}
            />
          </div>
        ) : null}

        {isAvatarContext ? <AvatarContextPanel t={t} hasVisual={hasVisual} visualType={visualType} audioBlob={audioBlob} audioDuration={audioDuration} captionSegments={captionSegments} selectedVoice={selectedVoice} avatarJob={avatarJob} generateAvatarAcceptanceFrame={generateAvatarAcceptanceFrame} /> : null}

        {isAudioClipContext ? <AudioClipContextPanel t={t} segment={selectedAudioSegment} updateAudioSegment={updateAudioSegment} toggleAudioSegmentReverse={toggleAudioSegmentReverse} deleteAudioSegment={deleteAudioSegment} downloadBlob={downloadBlob} /> : null}

        {!isSmartContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext && voiceTab === "synthesis" ? (
          <VoiceSynthesisPanel
            script={script}
            updateScript={updateScript}
            selectedVoiceId={selectedVoiceId}
            setSelectedVoiceId={setSelectedVoiceId}
            selectedVoice={selectedVoice}
            filteredVoices={filteredVoices}
            voiceFilter={voiceFilter}
            setVoiceFilter={setVoiceFilter}
            showVoiceFilter={showVoiceFilter}
            setShowVoiceFilter={setShowVoiceFilter}
            speed={speed}
            setSpeed={setSpeed}
            volume={volume}
            setVolume={setVolume}
            status={status}
            progressPercent={progressPercent}
            audioBlob={audioBlob}
            audioUrl={audioUrl}
            generateVoiceover={generateVoiceover}
            downloadBlob={downloadBlob}
            favoriteVoiceIds={favoriteVoiceIds}
            setFavoriteVoiceIds={setFavoriteVoiceIds}
            t={t}
          />
        ) : null}

        {!isSmartContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext && voiceTab === "mine" ? (
          <MyVoicesPanel
            favoriteVoiceIds={favoriteVoiceIds}
            setFavoriteVoiceIds={setFavoriteVoiceIds}
            setSelectedVoiceId={setSelectedVoiceId}
            selectedVoiceId={selectedVoiceId}
            notify={notify}
            t={t}
            recordedVoices={recordedVoices}
            recordingState={recordingState}
            recordingElapsed={recordingElapsed}
            startVoiceRecording={startVoiceRecording}
            stopVoiceRecording={stopVoiceRecording}
            useRecordedVoice={useRecordedVoice}
            downloadBlob={downloadBlob}
          />
        ) : null}

        {!isSmartContext && !isCaptionContext && !isAvatarContext && !isAudioClipContext && !isVisualContext && !isStickerContext && voiceTab === "history" ? (
          <HistoryPanel
            historyItems={historyItems}
            useHistoryItem={useHistoryItem}
            setHistoryItems={setHistoryItems}
            downloadBlob={downloadBlob}
            t={t}
          />
        ) : null}
      </div>

      {audioSegments.map((segment) => (
        <audio
          key={segment.id}
          ref={(node) => {
            if (node) audioSegmentRefs.current.set(segment.id, node);
            else audioSegmentRefs.current.delete(segment.id);
            if (segment.id === audioSegments.at(-1)?.id) audioRef.current = node;
          }}
          src={segment.url}
        />
      ))}
      {sourceAudioUrl ? (
        <audio
          data-track="source-audio"
          ref={sourceAudioRef}
          src={sourceAudioUrl}
        />
      ) : null}
      {musicUrl ? (
        <audio
          ref={musicRef}
          src={musicUrl}
        />
      ) : null}
    </aside>
  );
}
