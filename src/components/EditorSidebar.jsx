import { TOOL_RAIL } from "../config/editor.js";
import { MediaPanel, ToolPanel } from "./panels.jsx";

export function EditorSidebar({ model: d }) {
  return (
    <>
      <aside className={`tool-rail ${d.compactRail ? "is-compact" : ""}`} aria-label={d.t("toolbar")}>
        {TOOL_RAIL.map(({ id, label, icon: Icon }) => (
          <button
            className={`rail-tool ${d.activeTool === id ? "is-active" : ""}`}
            type="button"
            key={id}
            onClick={() => d.selectTool(id)}
          >
            <Icon size={23} />
            <span>{d.t(id, label)}</span>
          </button>
        ))}
      </aside>

      <aside className="media-panel">
        {d.activeTool === "media" ? (
          <MediaPanel
            t={d.t}
            mediaTab={d.mediaTab}
            setMediaTab={d.setMediaTab}
            isDragging={d.isDragging}
            setIsDragging={d.setIsDragging}
            fileInputRef={d.fileInputRef}
            handleFiles={d.handleFiles}
            imageSrc={d.imageSrc}
            builtInAssets={d.builtInAssets}
            userAssets={d.userAssets}
            selectedLibraryAssetId={d.selectedLibraryAssetId}
            deleteUserAsset={d.deleteUserAsset}
            draggedAssetId={d.draggedAssetId}
            handleAssetPointerDown={d.handleAssetPointerDown}
            handleAssetClick={d.handleAssetClick}
          />
        ) : (
          <ToolPanel
            activeTool={d.activeTool}
            uiLanguage={d.activeLanguage}
            script={d.script}
            updateScript={d.updateScript}
            segments={d.segments}
            currentSegmentIndex={d.currentSegmentIndex}
            captionSegments={d.captionSegments}
            captionTargetDuration={d.captionTargetDuration}
            selectedCaptionSegment={d.selectedCaptionSegment}
            selectedSegmentId={d.selectedSegmentId}
            setSelectedSegmentId={d.setSelectedSegmentId}
            updateCaptionSegmentText={d.updateCaptionSegmentText}
            toggleCaptionSegmentHidden={d.toggleCaptionSegmentHidden}
            deleteCaptionSegment={d.deleteCaptionSegment}
            seekTo={d.seekTo}
            estimatedDuration={d.estimatedDuration}
            captionPosition={d.captionPosition}
            setCaptionPosition={d.handleCaptionPositionChange}
            captionSize={d.captionSize}
            setCaptionSize={d.setCaptionSize}
            captionStyle={d.captionStyle}
            setCaptionStyle={d.setCaptionStyle}
            captionsEnabled={d.captionsEnabled}
            setCaptionsEnabled={d.setCaptionsEnabled}
            selectedFilterId={d.selectedFilterId}
            setSelectedFilterId={d.setSelectedFilterId}
            selectedTransitionId={d.selectedTransitionId}
            setSelectedTransitionId={d.setSelectedTransitionId}
            selectedStickerId={d.selectedStickerId}
            setSelectedStickerId={d.setSelectedStickerId}
            handleStickerPointerDown={d.handleAssetPointerDown}
            handleStickerClick={d.handleStickerClick}
            audioBlob={d.audioBlob}
            audioDuration={d.audioDuration}
            sourceAudioBlob={d.sourceAudioBlob}
            sourceAudioName={d.sourceAudioName}
            sourceAudioDuration={d.sourceAudioDuration}
            sourceAudioVolume={d.sourceAudioVolume}
            sourceAudioLinked={d.sourceAudioLinked}
            setSourceAudioVolume={d.setSourceAudioVolume}
            clearSourceAudioTrack={d.clearSourceAudioTrack}
            generateCaptionsFromSourceAudio={d.generateCaptionsFromSourceAudio}
            isGeneratingCaptions={d.status === "captioning"}
            automaticCaptionProgress={d.status === "captioning" ? d.progress : 0}
            separateSourceVocals={d.separateSourceVocals}
            vocalSeparationJob={d.vocalSeparationJob}
            hasVisual={Boolean(d.previewVisualSrc)}
            visualType={d.previewVisualType}
            visionAnalysis={d.previewVisionAnalysis}
            visionOptions={d.previewVisionOptions}
            visionRunning={d.visionJob.running && d.visionJob.key === d.previewVisionKey}
            visionProgress={d.visionJob.key === d.previewVisionKey ? d.visionJob.progress : 0}
            visionPhase={d.visionJob.key === d.previewVisionKey ? d.visionJob.phase : ""}
            analyzeCurrentVisual={d.analyzeCurrentVisual}
            toggleVisionOption={d.toggleVisionOption}
            clearVisionAnalysis={d.clearVisionAnalysis}
            downloadVisionCutout={d.downloadVisionCutout}
            openAvatarPanel={d.openAvatarPanel}
            smartMode={d.smartMode}
            setSmartMode={d.setSmartMode}
            musicBlob={d.musicBlob}
            musicName={d.musicName}
            musicDuration={d.musicDuration}
            musicVolume={d.musicVolume}
            setMusicVolume={d.setMusicVolume}
            clearMusicTrack={d.clearMusicTrack}
            selectedVoice={d.selectedVoice}
            setVoiceTab={d.setVoiceTab}
            downloadBlob={d.downloadBlob}
            notify={d.notify}
            t={d.t}
            trOption={d.trOption}
            selectedVisualSegment={d.selectedVisualSegment}
            visualLocalTime={d.visualLocalTime}
            updateSelectedVisualEffects={d.updateSelectedVisualEffects}
          />
        )}
      </aside>
    </>
  );
}
