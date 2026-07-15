import { useCallback } from "react";
import { downloadBlob, exportBrowserVideo, getSupportedRecordingFormat, transcodeWebmToMp4 } from "../lib/media.js";
import { estimateDuration } from "../lib/timeline.js";
import { getVisionKey } from "../lib/vision.js";

export function useVideoExport(d) {
  return useCallback(async () => {
    if (d.exporting) return;
    if (!d.imageSrc) return void d.notify("请先上传或选择图片/视频素材再导出");
    d.setExporting(true); d.exportStartRef.current = performance.now(); d.setExportProgress(1);
    d.setExportPhase("准备导出"); d.setStatus("generating");
    const format = getSupportedRecordingFormat(); d.setStatusText(`录制 ${format.label} 视频流`); d.setExportPhase(`录制 ${format.label} 视频流`);
    const progress = ({ progress, phase }) => {
      d.setExportProgress((current) => Math.max(current, Math.min(100, Math.max(0, Math.round(progress)))));
      if (phase) d.setExportPhase(phase);
    };
    const finish = async (phase) => { d.setExportPhase(phase); d.setExportProgress(100); await new Promise((resolve) => setTimeout(resolve, 450)); };
    try {
      const video = await exportBrowserVideo({
        imageSrc: d.imageSrc, visualType: d.visualType,
        visualSegments: d.renderedVisualSegments.map((segment) => {
          const record = d.visionRecords[getVisionKey(segment)];
          return record ? { ...segment, vision: { ...record.analysis, options: record.options } } : segment;
        }),
        audioBlob: null, voiceAudioSegments: d.trackVisibility.audio ? d.audioSegments : [], voiceVolume: d.volume,
        sourceAudioBlob: d.trackVisibility.source ? d.sourceAudioBlob : null, sourceAudioVolume: d.sourceAudioVolume,
        sourceAudioSegments: d.sourceAudioLinked ? d.linkedSourceAudioSegments : [],
        sourceAudioStart: d.sourceAudioStart, musicBlob: d.trackVisibility.music ? d.musicBlob : null,
        musicVolume: d.musicVolume, text: d.script, captionSegments: d.captionSegments,
        duration: Math.max(d.trackVisibility.audio ? d.voiceTrackDuration : 0, d.captionDuration,
          d.trackVisibility.source && d.sourceAudioBlob ? d.sourceAudioTimelineEnd : 0,
          d.trackVisibility.music && d.musicBlob ? d.musicDuration : 0,
          d.trackVisibility.sticker ? d.stickerDuration : 0, d.imageDuration, estimateDuration(d.script)),
        ratio: d.ratio, fitMode: d.fitMode, filter: d.selectedFilter.css,
        captionsEnabled: d.captionsEnabled && d.trackVisibility.caption,
        captionPosition: d.captionPosition, captionPlacement: d.captionPlacement,
        captionSize: d.captionSize, captionStyle: d.captionStyle,
        captionReferenceSize: d.previewFrameSize.width > 0 && d.previewFrameSize.height > 0 ? d.previewFrameSize
          : { width: (360 * d.ratio.width) / d.ratio.height, height: 360 },
        sticker: d.stickerSegments.length ? null : d.selectedSticker,
        stickerSegments: d.trackVisibility.sticker ? d.stickerSegments : [],
        transitionId: d.selectedTransitionId, exportSettings: d.exportSettings, onProgress: progress,
      });
      const name = `ai-voiceover-${d.ratio.id.replace(":", "x")}`;
      if (d.exportSettings.codec !== "h264") {
        progress({ progress: 99, phase: `保存 ${video.label} 文件` });
        downloadBlob(video.blob, `${name}.${video.extension}`);
        d.setStatus("done"); d.setStatusText(`${video.label} 已导出`); await finish("导出完成");
        d.notify(`${video.label} 视频已导出`); return;
      }
      if (video.nativeMp4) {
        progress({ progress: 98, phase: "保存 MP4 文件" }); downloadBlob(video.blob, `${name}.mp4`);
        d.setStatus("done"); d.setStatusText("MP4 已导出"); await finish("导出完成"); d.notify("已用浏览器原生 MP4 快速导出"); return;
      }
      d.setStatusText("当前浏览器不支持原生 MP4，加载 FFmpeg WASM"); progress({ progress: 95, phase: "加载 FFmpeg 转码器" });
      try {
        d.setStatusText("转码 MP4"); progress({ progress: 96, phase: "转码 MP4" });
        const mp4 = await transcodeWebmToMp4(video.blob); progress({ progress: 99, phase: "保存 MP4 文件" });
        downloadBlob(mp4, `${name}.mp4`); d.setStatus("done"); d.setStatusText("MP4 已导出"); await finish("导出完成"); d.notify("MP4 视频已导出");
      } catch (error) {
        console.error(error); progress({ progress: 99, phase: "保存 WebM 兜底文件" }); downloadBlob(video.blob, `${name}.webm`);
        d.setStatus("done"); d.setStatusText("WebM 兜底已导出"); await finish("WebM 兜底已导出"); d.notify("MP4 转码失败，已导出 WebM 兜底");
      }
    } catch (error) {
      console.error(error); d.setStatus("error"); d.setStatusText(error instanceof Error ? error.message : "视频导出失败"); d.setExportPhase("导出失败");
    } finally { d.setExporting(false); d.setExportProgress(0); }
  }, [d]);
}
