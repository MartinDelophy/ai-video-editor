import { useCallback } from "react";
import { downloadBlob, exportBrowserVideo, getSupportedRecordingFormat, transcodeWebmToMp4 } from "../lib/media.js";
import { exportOfflineVideo } from "../lib/offlineVideoExport.js";
import { estimateDuration } from "../lib/timeline.js";
import { getVisionKey } from "../lib/vision.js";
import { prepareEmbeddedVideoAudio } from "../lib/embeddedVideoAudioExport.js";

export function useVideoExport(d) {
  return useCallback(async () => {
    if (d.exporting) return;
    if (!d.imageSrc) return void d.notify("请先上传或选择图片/视频素材再导出");
    d.setExporting(true); d.exportStartRef.current = performance.now(); d.setExportProgress(1);
    const localize = (key, params = {}) => Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      d.t(key),
    );
    d.setExportPhase(localize("exportPreparing")); d.setStatus("generating");
    const format = getSupportedRecordingFormat();
    const recordingPhase = localize("exportRecordingStream", { format: format.label });
    d.setStatusText(recordingPhase); d.setExportPhase(recordingPhase);
    const progress = ({ progress, phase, phaseKey, phaseParams }) => {
      d.setExportProgress((current) => Math.max(current, Math.min(100, Math.max(0, Math.round(progress)))));
      const localizedPhase = phaseKey ? localize(phaseKey, phaseParams) : phase;
      if (localizedPhase) d.setExportPhase(localizedPhase);
    };
    const finish = async (phase) => { d.setExportPhase(phase); d.setExportProgress(100); await new Promise((resolve) => setTimeout(resolve, 450)); };
    try {
      const embeddedVideoAudio = !d.sourceAudioBlob && d.trackVisibility.source !== false
        ? await prepareEmbeddedVideoAudio(d.renderedVisualSegments, progress)
        : { blob: null, segments: [] };
      const exportSourceAudioBlob = d.trackVisibility.source !== false
        ? d.sourceAudioBlob || embeddedVideoAudio.blob
        : null;
      const exportSourceAudioSegments = d.sourceAudioBlob
        ? d.sourceAudioLinked ? d.linkedSourceAudioSegments : []
        : embeddedVideoAudio.segments;
      const exportOptions = {
        imageSrc: d.imageSrc, visualType: d.visualType,
        visualSegments: d.renderedVisualSegments.map((segment) => {
          const record = d.visionRecords[getVisionKey(segment)];
          return record ? { ...segment, vision: { ...record.analysis, options: record.options } } : segment;
        }),
        audioBlob: null, voiceAudioSegments: d.trackVisibility.audio ? d.audioSegments : [], voiceVolume: d.volume,
        sourceAudioBlob: exportSourceAudioBlob, sourceAudioVolume: d.sourceAudioBlob ? d.sourceAudioVolume : 1,
        sourceAudioSegments: exportSourceAudioSegments,
        sourceAudioStart: d.sourceAudioStart, musicBlob: d.trackVisibility.music ? d.musicBlob : null,
        musicVolume: d.musicVolume, musicStart: d.musicStart, text: d.script, captionSegments: d.captionSegments,
        duration: Math.max(d.trackVisibility.audio ? d.voiceTrackDuration : 0, d.captionDuration,
          d.trackVisibility.source && d.sourceAudioBlob ? d.sourceAudioTimelineEnd : 0,
          d.trackVisibility.music && d.musicBlob ? d.musicStart + d.musicDuration : 0,
          d.trackVisibility.sticker ? d.stickerDuration : 0, d.imageDuration, estimateDuration(d.script)),
        ratio: d.ratio, fitMode: d.fitMode, filter: d.selectedFilter.css,
        captionsEnabled: d.captionsEnabled && d.trackVisibility.caption,
        captionPosition: d.captionPosition, captionPlacement: d.captionPlacement,
        captionSize: d.captionSize, captionStyle: d.captionStyle,
        captionReferenceSize: d.previewFrameSize.width > 0 && d.previewFrameSize.height > 0 ? d.previewFrameSize
          : { width: (360 * d.ratio.width) / d.ratio.height, height: 360 },
        // Stickers are timeline clips; a selected library item is not export content.
        sticker: null,
        stickerSegments: d.trackVisibility.sticker ? d.stickerSegments : [],
        visualOverlaySegments: d.trackVisibility.overlay === false ? [] : d.visualOverlaySegments,
        transitionId: "none", exportSettings: d.exportSettings, onProgress: progress,
      };
      let video;
      try {
        video = await exportOfflineVideo(exportOptions);
      } catch (offlineError) {
        console.warn("Offline WebCodecs export unavailable; using compatibility recorder", offlineError);
        progress({ progress: 5, phaseKey: "exportCompatibility" });
        video = await exportBrowserVideo(exportOptions);
      }
      const name = `ai-voiceover-${d.ratio.id.replace(":", "x")}`;
      if (d.exportSettings.codec !== "h264") {
        progress({ progress: 99, phaseKey: "exportSaveFile", phaseParams: { format: video.label } });
        downloadBlob(video.blob, `${name}.${video.extension}`);
        d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete"));
        d.notify(`${video.label} 视频已导出`); return;
      }
      if (video.nativeMp4) {
        progress({ progress: 98, phaseKey: "exportSaveFile", phaseParams: { format: "MP4" } }); downloadBlob(video.blob, `${name}.mp4`);
        d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete")); d.notify(localize("exportComplete")); return;
      }
      d.setStatusText("当前浏览器不支持原生 MP4，加载 FFmpeg WASM"); progress({ progress: 95, phase: "加载 FFmpeg 转码器" });
      try {
        d.setStatusText("转码 MP4"); progress({ progress: 96, phase: "转码 MP4" });
        const mp4 = await transcodeWebmToMp4(video.blob); progress({ progress: 99, phaseKey: "exportSaveFile", phaseParams: { format: "MP4" } });
        downloadBlob(mp4, `${name}.mp4`); d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete")); d.notify(localize("exportComplete"));
      } catch (error) {
        console.error(error); progress({ progress: 99, phase: "保存 WebM 兜底文件" }); downloadBlob(video.blob, `${name}.webm`);
        d.setStatus("done"); d.setStatusText("WebM 兜底已导出"); await finish("WebM 兜底已导出"); d.notify("MP4 转码失败，已导出 WebM 兜底");
      }
    } catch (error) {
      console.error(error); d.setStatus("error"); d.setStatusText(error instanceof Error ? error.message : localize("exportFailed")); d.setExportPhase(localize("exportFailed"));
    } finally { d.setExporting(false); d.setExportProgress(0); }
  }, [d]);
}
