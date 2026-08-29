import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { COMPACT_WORKSPACE_QUERY, TOOL_RAIL } from "../config/editor.js";
import { MediaPanel, ToolPanel } from "./panels.jsx";
import { PluginCatalogPanel } from "./GenerationPlugins.jsx";

export function EditorSidebar({ model: d }) {
  const toolRailRef = useRef(null);
  const [toolRailOverflow, setToolRailOverflow] = useState({ hasOverflow: false, canScrollDown: false });

  const updateToolRailOverflow = useCallback(() => {
    const rail = toolRailRef.current;
    if (!rail) return;
    const hasOverflow = rail.scrollHeight > rail.clientHeight + 2;
    const canScrollDown = hasOverflow && rail.scrollTop + rail.clientHeight < rail.scrollHeight - 2;
    setToolRailOverflow((current) => (
      current.hasOverflow === hasOverflow && current.canScrollDown === canScrollDown
        ? current
        : { hasOverflow, canScrollDown }
    ));
  }, []);

  useEffect(() => {
    const rail = toolRailRef.current;
    if (!rail) return undefined;
    const frame = window.requestAnimationFrame(updateToolRailOverflow);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateToolRailOverflow);
    resizeObserver?.observe(rail);
    window.addEventListener("resize", updateToolRailOverflow);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateToolRailOverflow);
    };
  }, [d.compactRail, updateToolRailOverflow]);

  return (
    <>
      <div className="tool-rail-shell">
        <aside
          ref={toolRailRef}
          id="editor-tool-rail"
          className={`tool-rail ${d.compactRail ? "is-compact" : ""} ${toolRailOverflow.hasOverflow ? "has-overflow" : ""}`}
          aria-label={d.t("toolbar")}
          onScroll={updateToolRailOverflow}
        >
          {TOOL_RAIL.map(({ id, label, icon: Icon }) => (
            <button
              className={`rail-tool ${d.activeTool === id ? "is-active" : ""}`}
              type="button"
              key={id}
              onClick={() => {
                d.selectTool(id);
                if (window.matchMedia?.(COMPACT_WORKSPACE_QUERY).matches) {
                  const defaultPanel = id === "caption" ? "inspector" : "tools";
                  d.setMobilePanel?.(d.mobilePanel === defaultPanel && d.activeTool === id ? "" : defaultPanel);
                }
              }}
            >
              <Icon size={23} />
              <span>{d.t(id, label)}</span>
            </button>
          ))}
        </aside>
        {toolRailOverflow.canScrollDown ? (
          <button
            className="tool-rail-more"
            type="button"
            aria-label={d.t("moreTools", "More tools")}
            aria-controls="editor-tool-rail"
            onClick={() => {
              const rail = toolRailRef.current;
              rail?.scrollBy({
                top: Math.max(64, rail.clientHeight * 0.55),
                behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
              });
            }}
          >
            <CaretDown size={18} weight="bold" />
          </button>
        ) : null}
      </div>

      <aside className={`media-panel ${d.mobilePanel === "tools" && d.selectedLibraryAssetId ? "has-mobile-asset-actions" : ""} ${d.mobilePanel === "tools" && d.activeTool === "stickers" ? "has-mobile-sticker-actions" : ""}`}>
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
            libraryType={d.libraryType}
            libraryQuery={d.libraryQuery}
            setLibraryQuery={d.setLibraryQuery}
            selectLibraryType={d.selectLibraryType}
            libraryStatus={d.libraryStatus}
            libraryError={d.libraryError}
            libraryProvider={d.libraryProvider}
            assetDownloadStates={d.assetDownloadStates}
            prefetchLibraryAsset={d.prefetchLibraryAsset}
            userAssets={d.userAssets}
            selectedLibraryAssetId={d.selectedLibraryAssetId}
            deleteUserAsset={d.deleteUserAsset}
            draggedAssetId={d.draggedAssetId}
            handleAssetPointerDown={d.handleAssetPointerDown}
            handleAssetClick={d.handleAssetClick}
            applyAssetToTrack={d.applyAssetToTrack}
            closeMobilePanel={() => d.setMobilePanel?.("")}
            mobilePanelOpen={d.mobilePanel === "tools"}
            language={d.activeLanguage}
            onGeneratedVector={d.handleGeneratedVector}
            onOpenAiMusic={() => {
              d.setSmartMode("ai-music");
              d.selectTool("smart");
              if (window.matchMedia?.(COMPACT_WORKSPACE_QUERY).matches) d.setMobilePanel?.("inspector");
            }}
          />
        ) : d.activeTool === "plugins" ? (
          <PluginCatalogPanel
            language={d.activeLanguage}
            plugins={d.generationPlugins}
            onOpenInspector={() => {
              if (window.matchMedia?.(COMPACT_WORKSPACE_QUERY).matches) d.setMobilePanel?.("inspector");
            }}
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
            setSelectedAudioSegmentId={d.setSelectedAudioSegmentId}
            setSelectedTrack={d.setSelectedTrack}
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
            setCaptionSegments={d.setCaptionSegments}
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
            confirmStickerSelection={d.confirmStickerSelection}
            closeMobilePanel={() => d.setMobilePanel?.("")}
            mobilePanelOpen={d.mobilePanel === "tools"}
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
            selectedAudioToolTarget={d.selectedAudioToolTarget}
            separateSelectedAudioVocals={d.separateSelectedAudioVocals}
            vocalSeparationJob={d.vocalSeparationJob}
            hasVisual={Boolean(d.previewVisualSrc)}
            visualType={d.previewVisualType}
            smartFrame={d.smartFrame}
            analyzeCurrentVisual={d.analyzeCurrentVisual}
            analyzeEffectVisual={d.analyzeEffectVisual}
            openAvatarPanel={d.openAvatarPanel}
            smartMode={d.smartMode}
            setSmartMode={d.setSmartMode}
            openMobileInspector={() => d.setMobilePanel?.("inspector")}
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
            selectedEffectSegment={d.selectedEffectSegment}
            effectAnalysis={d.effectAnalysis}
            effectRunning={d.effectRunning}
            effectProgress={d.effectProgress}
            effectPhase={d.effectPhase}
            updateSelectedSubjectEffect={d.updateSelectedSubjectEffect}
            updateSelectedClickRipple={d.updateSelectedClickRipple}
            removeSelectedSubjectEffect={d.removeSelectedSubjectEffect}
            effectsPanelMode={d.effectsPanelMode}
            openEffectsInspector={() => {
              d.setEffectsPanelMode?.("outline");
              d.setMobilePanel?.("inspector");
            }}
            openFaceSwapInspector={() => {
              d.setEffectsPanelMode?.("face-swap");
              d.setMobilePanel?.("inspector");
            }}
            openOpticalFlowInspector={() => {
              d.setEffectsPanelMode?.("vector-tracking");
              d.setMobilePanel?.("inspector");
            }}
            openCinematicDepthInspector={() => {
              d.setEffectsPanelMode?.("cinematic-depth");
              d.setMobilePanel?.("inspector");
            }}
            openPhotoParallaxInspector={() => {
              d.setEffectsPanelMode?.("photo-parallax");
              d.setMobilePanel?.("inspector");
            }}
            openClickRippleInspector={() => {
              d.setEffectsPanelMode?.("click-ripple");
              d.setMobilePanel?.("inspector");
            }}
            cinematicDepth={d.cinematicDepth}
            photoParallaxDepth={d.photoParallaxDepth}
            visualLocalTime={d.visualLocalTime}
            updateSelectedVisualEffects={d.updateSelectedVisualEffects}
            miganRepair={d.miganRepair}
            hdRestoration={d.hdRestoration}
            smartDenoise={d.smartDenoise}
          />
        )}
      </aside>
    </>
  );
}
