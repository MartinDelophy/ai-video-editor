import { HistoryPanel, MyVoicesPanel, VoiceSynthesisPanel } from "./panels.jsx";

export function VoicePanel({
  t,
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
  setIsPlaying,
  sourceAudioRef,
  musicRef,
  previewVideoRef,
  sourceAudioUrl,
  trackVisibility,
  musicUrl,
  setCurrentTime,
}) {
  return (
    <aside className="voice-panel">
      <div className="panel-title-row">
        <h1>{t("aiVoice")}</h1>
        <span className={`status-pill ${status}`}>
          {statusText === "模型待命" ? t("modelReady") : statusText}
        </span>
      </div>

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

      <div className="voice-tab-body">
        {voiceTab === "synthesis" ? (
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

        {voiceTab === "mine" ? (
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

        {voiceTab === "history" ? (
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
          onPlay={() => setIsPlaying(true)}
          onPause={() => {
            setIsPlaying(false);
            sourceAudioRef.current?.pause();
            musicRef.current?.pause();
            previewVideoRef.current?.pause();
          }}
          onEnded={() => {
            setIsPlaying(false);
            sourceAudioRef.current?.pause();
            musicRef.current?.pause();
            previewVideoRef.current?.pause();
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        />
      ) : null}
      {sourceAudioUrl ? (
        <audio
          ref={sourceAudioRef}
          src={sourceAudioUrl}
          onPlay={() => {
            if (!audioUrl || !trackVisibility.audio) {
              setIsPlaying(true);
            }
          }}
          onPause={() => {
            if (!audioUrl || !trackVisibility.audio) {
              setIsPlaying(false);
              musicRef.current?.pause();
              previewVideoRef.current?.pause();
            }
          }}
          onEnded={() => {
            if (!audioUrl || !trackVisibility.audio) {
              setIsPlaying(false);
              musicRef.current?.pause();
              previewVideoRef.current?.pause();
            }
          }}
          onTimeUpdate={(event) => {
            if (!audioUrl || !trackVisibility.audio) {
              setCurrentTime(event.currentTarget.currentTime);
            }
          }}
        />
      ) : null}
      {musicUrl ? (
        <audio
          ref={musicRef}
          src={musicUrl}
          onPlay={() => {
            if ((!audioUrl || !trackVisibility.audio) && (!sourceAudioUrl || !trackVisibility.source)) {
              setIsPlaying(true);
            }
          }}
          onPause={() => {
            if ((!audioUrl || !trackVisibility.audio) && (!sourceAudioUrl || !trackVisibility.source)) {
              setIsPlaying(false);
              previewVideoRef.current?.pause();
            }
          }}
          onEnded={() => {
            if ((!audioUrl || !trackVisibility.audio) && (!sourceAudioUrl || !trackVisibility.source)) {
              setIsPlaying(false);
              previewVideoRef.current?.pause();
            }
          }}
          onTimeUpdate={(event) => {
            if ((!audioUrl || !trackVisibility.audio) && (!sourceAudioUrl || !trackVisibility.source)) {
              setCurrentTime(event.currentTarget.currentTime);
            }
          }}
        />
      ) : null}
    </aside>
  );
}
