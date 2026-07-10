import {
  CheckCircle,
  ClosedCaptioning,
  Eye,
  EyeSlash,
  ListBullets,
  PersonSimpleRun,
  Trash,
  Waveform,
} from "@phosphor-icons/react";
import { useState } from "react";

import { formatTime, getSegmentStartTime } from "../lib/timeline.js";
import { LIVE_PORTRAIT_WEB_MODEL } from "../config/livePortrait.js";
import { probeLivePortraitWebEnvironment } from "../lib/livePortraitWeb.js";
import { HistoryPanel, MyVoicesPanel, VoiceSynthesisPanel } from "./panels.jsx";

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
          <span>{t("captionEmptyHint", "选择时间线字幕片段后，这里会同步编辑。")}</span>
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

function AvatarContextPanel({ t, hasVisual, visualType, audioBlob, audioDuration, captionSegments, selectedVoice, avatarJob, generateAvatarAcceptanceFrame }) {
  const hasPortrait = hasVisual && visualType === "image";
  const [probeState, setProbeState] = useState("idle");
  const [probeResult, setProbeResult] = useState(null);

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
      <p className="avatar-context-note">{t("avatarGenerationNote")}</p>
      <div className="avatar-porting-stages" aria-label={t("avatarPortingStatus")}>
        <div className="is-done"><span>1</span><strong>{t("avatarStagePinned")}</strong></div>
        <div className="is-done"><span>2</span><strong>{t("avatarStageGrid")}</strong></div>
        <div className="is-active"><span>3</span><strong>{t("avatarStageAudio")}</strong></div>
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
        onClick={generateAvatarAcceptanceFrame}
      >
        <PersonSimpleRun size={17} weight="duotone" />
        {avatarJob?.running ? t("avatarGenerating") : t("avatarGenerate")}
      </button>
      <div className="avatar-official-notice"><PersonSimpleRun size={17} weight="duotone" /><span><strong>{t("avatarPortingStatus")}</strong><em>{t("avatarServiceHint")}</em></span></div>
    </div>
  );
}

export function VoicePanel({
  t,
  activeTool,
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
  generateCaptionsFromSourceAudio,
  isGeneratingCaptions,
  automaticCaptionProgress,
  avatarPanelOpen,
  hasVisual,
  visualType,
  audioDuration,
  avatarJob,
  generateAvatarAcceptanceFrame,
}) {
  const isCaptionContext = activeTool === "caption";
  const isAvatarContext = activeTool === "smart" && avatarPanelOpen;
  const title = isAvatarContext ? t("avatarTitle") : isCaptionContext ? t("caption") : t("aiVoice");
  const panelStatusText = isCaptionContext
    ? captionSegments.length
      ? `${captionSegments.length} ${t("captionSegmentsUnit", "条字幕")}`
      : t("noCaptionSegments")
    : isAvatarContext
      ? t("avatarPortingStatus")
    : statusText === "模型待命"
      ? t("modelReady")
      : statusText;

  return (
    <aside className={`voice-panel ${isCaptionContext ? "is-caption-context" : ""} ${isAvatarContext ? "is-avatar-context" : ""}`}>
      <div className="panel-title-row">
        <h1>{title}</h1>
        <span className={`status-pill ${isCaptionContext ? "done" : status}`}>
          {panelStatusText}
        </span>
      </div>

      {!isCaptionContext && !isAvatarContext ? (
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

      <div className="voice-tab-body">
        {isCaptionContext ? (
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

        {isAvatarContext ? <AvatarContextPanel t={t} hasVisual={hasVisual} visualType={visualType} audioBlob={audioBlob} audioDuration={audioDuration} captionSegments={captionSegments} selectedVoice={selectedVoice} avatarJob={avatarJob} generateAvatarAcceptanceFrame={generateAvatarAcceptanceFrame} /> : null}

        {!isCaptionContext && !isAvatarContext && voiceTab === "synthesis" ? (
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
            generateVoiceover={generateVoiceover}
            downloadBlob={downloadBlob}
            favoriteVoiceIds={favoriteVoiceIds}
            setFavoriteVoiceIds={setFavoriteVoiceIds}
            t={t}
          />
        ) : null}

        {!isCaptionContext && !isAvatarContext && voiceTab === "mine" ? (
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

        {!isCaptionContext && !isAvatarContext && voiceTab === "history" ? (
          <HistoryPanel
            historyItems={historyItems}
            useHistoryItem={useHistoryItem}
            setHistoryItems={setHistoryItems}
            downloadBlob={downloadBlob}
            t={t}
          />
        ) : null}
      </div>

      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
        />
      ) : null}
      {sourceAudioUrl ? (
        <audio
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
