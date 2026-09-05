import { useCallback } from "react";
import { ensureCaptionFontLoaded } from "../lib/captionFonts.js";
import { isExportAbortError, throwIfExportAborted } from "../lib/exportCancellation.js";
import {
  getEffectiveExportBitrate,
  getExportContentDuration,
  getExportDimensions,
  getExportRange,
  normalizeExportSettings,
  sanitizeExportFileName,
} from "../lib/exportSettings.js";
import { downloadBlob, exportBrowserVideo, transcodeWebmToMp4 } from "../lib/media.js";
import { exportOfflineVideo } from "../lib/offlineVideoExport.js";
import { serializeSrt } from "../lib/subtitles.js";
import { getVisionKey } from "../lib/vision.js";
import { prepareEmbeddedVideoAudio } from "../lib/embeddedVideoAudioExport.js";
import {
  createGeneratedExportMetadata,
  embedGeneratedMediaMetadata,
} from "../lib/generatedMediaMetadata.js";
import { filterTimedSegmentsByLaneVisibility } from "../lib/timeline.js";

export function useVideoExport(d) {
  return useCallback(async (options = {}) => {
    if (d.exporting) return { status: "busy" };
    if (!d.imageSrc) {
      d.notify(d.t("exportVisualRequired"));
      return { status: "blocked", error: d.t("exportVisualRequired") };
    }
    const requestedSettings = normalizeExportSettings(options.settings || d.exportSettings);
    const exportSettings = {
      ...requestedSettings,
      ...getExportDimensions(d.ratio, Number(requestedSettings.resolution)),
      videoBitsPerSecond: getEffectiveExportBitrate(requestedSettings),
    };
    const notify = (message) => {
      if (!options.suppressNotification) d.notify(message);
    };
    const controller = new AbortController();
    d.exportAbortControllerRef.current = controller;
    const { signal } = controller;
    d.setExporting(true); d.exportStartRef.current = performance.now(); d.setExportProgress(1);
    const localize = (key, params = {}) => Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      d.t(key),
    );
    const preparingPhase = localize("exportPreparing");
    d.setExportPhase(preparingPhase); d.setStatus("generating"); d.setStatusText(preparingPhase);
    const progress = ({ progress, phase, phaseKey, phaseParams }) => {
      d.setExportProgress((current) => Math.max(current, Math.min(100, Math.max(0, Math.round(progress)))));
      const localizedPhase = phaseKey ? localize(phaseKey, phaseParams) : phase;
      if (localizedPhase) d.setExportPhase(localizedPhase);
    };
    const finish = async (phase) => { d.setExportPhase(phase); d.setExportProgress(100); await new Promise((resolve) => setTimeout(resolve, 450)); };
    let actualPipeline = "";
    try {
      if (options.onArtifact != null && typeof options.onArtifact !== "function") {
        throw new Error(localize("exportFailed"));
      }
      const exportAudio = exportSettings.audio !== "none";
      const captionDelivery = exportSettings.captions || "burned";
      const burnCaptions = captionDelivery !== "none" && d.captionsEnabled && d.trackVisibility.caption;
      if (burnCaptions) {
        const captionsByFont = new Map();
        d.captionSegments.forEach((segment) => {
          const fontId = segment.fontId || d.captionStyle?.fontId || "default";
          captionsByFont.set(fontId, `${captionsByFont.get(fontId) || ""} ${segment.text || ""}`.trim());
        });
        await Promise.all([...captionsByFont].map(([fontId, text]) => (
          ensureCaptionFontLoaded(fontId, text)
        )));
        throwIfExportAborted(signal);
      }
      const fullDuration = getExportContentDuration({
        visualDuration: d.imageDuration,
        voiceDuration: d.voiceTrackDuration,
        captionDuration: d.captionDuration,
        sourceAudioDuration: d.sourceAudioBlob ? d.sourceAudioTimelineEnd : 0,
        musicDuration: d.musicBlob ? d.musicTimelineEnd : 0,
        stickerDuration: d.stickerDuration,
        overlaySegments: d.visualOverlaySegments,
      });
      const exportRange = getExportRange(exportSettings, fullDuration);
      if (exportRange.duration < 1 / Math.max(24, Number(exportSettings.frameRate) || 30)) {
        throw new Error(localize("exportRangeInvalid"));
      }
      const exportBaseName = sanitizeExportFileName(
        exportSettings.fileName,
        `ai-voiceover-${d.ratio.id.replace(":", "x")}`,
      );
      const srt = captionDelivery === "burned-srt" && d.captionsEnabled && d.trackVisibility.caption
        ? serializeSrt(d.captionSegments, d.captionTargetDuration || d.captionDuration, {
            start: exportRange.start,
            end: exportRange.end,
          })
        : "";
      const downloadArtifacts = async (blob, extension) => {
        const deliver = options.onArtifact || downloadBlob;
        throwIfExportAborted(signal);
        await deliver(blob, `${exportBaseName}.${extension}`);
        throwIfExportAborted(signal);
        if (srt) {
          progress({ progress: 99, phaseKey: "exportSaveSrt" });
          await deliver(new Blob(["\uFEFF", srt], { type: "application/x-subrip;charset=utf-8" }), `${exportBaseName}.srt`);
          throwIfExportAborted(signal);
        }
      };
      const embeddedVideoAudio = exportAudio && !d.sourceAudioBlob && d.trackVisibility.source !== false
        ? await prepareEmbeddedVideoAudio(d.renderedVisualSegments, progress, signal)
        : { blob: null, segments: [] };
      throwIfExportAborted(signal);
      const exportSourceAudioBlob = exportAudio && d.trackVisibility.source !== false
        ? d.sourceAudioBlob || embeddedVideoAudio.blob
        : null;
      const exportSourceAudioSegments = d.sourceAudioBlob
        ? d.sourceAudioLinked ? d.linkedSourceAudioSegments : []
        : embeddedVideoAudio.segments;
      const exportedVisualSegments = d.renderedVisualSegments.map((segment) => {
        const record = d.visionRecords[getVisionKey(segment)];
        const depth = d.depthRecords?.[getVisionKey(segment)];
        return {
          ...segment,
          ...(record ? { vision: { ...record.analysis, options: record.options } } : {}),
          ...(depth ? { depth } : {}),
        };
      });
      const exportedOverlaySegments = d.trackVisibility.overlay === false
        ? []
        : d.visualOverlaySegments
            .filter((segment) => segment.hidden !== true)
            .map((segment) => {
              const record = d.visionRecords[getVisionKey(segment)];
              const depth = d.depthRecords?.[getVisionKey(segment)];
              return {
                ...segment,
                ...(record ? { vision: { ...record.analysis, options: record.options } } : {}),
                ...(depth ? { depth } : {}),
              };
            });
      const generationMetadata = createGeneratedExportMetadata({
        visualSegments: exportedVisualSegments,
        visualOverlaySegments: exportedOverlaySegments,
      });
      const voiceAudioSegments = exportAudio
        ? filterTimedSegmentsByLaneVisibility(d.audioSegments, d.trackVisibility)
        : [];
      const visibleVoiceSegments = voiceAudioSegments.filter((segment) => (
        Math.max(0, Number(segment.start) || 0) < exportRange.end
        && Math.max(0, Number(segment.start) || 0) + Math.max(0, Number(segment.duration) || 0) > exportRange.start
      ));
      if (visibleVoiceSegments.some((segment) => !(segment.blob instanceof Blob))) {
        throw new Error("配音片段的音频媒体已丢失，请重新生成或重新添加后再导出。");
      }
      const exportOptions = {
        imageSrc: d.imageSrc, visualType: d.visualType,
        visualSegments: exportedVisualSegments,
        audioBlob: null, voiceAudioSegments, voiceVolume: d.volume,
        sourceAudioBlob: exportSourceAudioBlob, sourceAudioVolume: d.sourceAudioBlob ? d.sourceAudioVolume : 1,
        sourceAudioSpatialEffect: d.sourceAudioSpatialEffect, sourceAudioSpatialAmount: d.sourceAudioSpatialAmount,
        sourceAudioSegments: exportSourceAudioSegments,
        sourceAudioStart: d.sourceAudioStart, musicBlob: exportAudio && d.trackVisibility.music ? d.musicBlob : null,
        musicVolume: d.musicVolume, musicStart: d.musicStart, musicSegments: d.musicSegments, text: d.script, captionSegments: d.captionSegments,
        duration: exportRange.duration,
        timelineOffset: exportRange.start,
        captionTargetDuration: d.captionTargetDuration || d.captionDuration,
        ratio: d.ratio, fitMode: d.fitMode, filter: d.selectedFilter.css,
        captionsEnabled: burnCaptions,
        captionPosition: d.captionPosition, captionPlacement: d.captionPlacement,
        captionSize: d.captionSize, captionStyle: d.captionStyle,
        captionReferenceSize: d.previewFrameSize.width > 0 && d.previewFrameSize.height > 0 ? d.previewFrameSize
          : { width: (360 * d.ratio.width) / d.ratio.height, height: 360 },
        // Stickers are timeline clips; a selected library item is not export content.
        sticker: null,
        stickerSegments: d.trackVisibility.sticker ? d.stickerSegments : [],
        visualOverlaySegments: exportedOverlaySegments,
        generationMetadata,
        transitionId: "none", exportSettings, onProgress: progress, signal,
      };
      let video;
      // MediaRecorder cannot produce a trustworthy MOV file. MOV therefore
      // stays on the native H.264/AAC WebCodecs path instead of changing format.
      const pipeline = exportSettings.codec === "h264-mov"
        ? "deterministic"
        : exportSettings.pipeline || "auto";
      if (pipeline === "compatible") {
        progress({ progress: 5, phaseKey: "exportCompatibility" });
        video = await exportBrowserVideo(exportOptions);
        actualPipeline = "compatible";
      } else try {
        video = await exportOfflineVideo(exportOptions);
        actualPipeline = "deterministic";
      } catch (offlineError) {
        if (isExportAbortError(offlineError)) throw offlineError;
        if (pipeline === "deterministic") {
          console.error("Deterministic WebCodecs export failed", offlineError);
          throw new Error(localize("exportDeterministicFailed"), { cause: offlineError });
        }
        console.warn("Offline WebCodecs export unavailable; using compatibility recorder", offlineError);
        progress({ progress: 5, phaseKey: "exportCompatibility" });
        video = await exportBrowserVideo(exportOptions);
        actualPipeline = "compatible";
      }
      if (
        visibleVoiceSegments.length
        && (
          (actualPipeline === "deterministic" && !video.diagnostics?.audioBitrate)
          || (actualPipeline === "compatible" && !video.diagnostics?.audioTrackCount)
        )
      ) {
        throw new Error("导出器未能创建配音音轨，已停止保存无声视频，请重试或切换导出管线。");
      }
      if (exportSettings.codec !== "h264") {
        if (generationMetadata && video.extension === "webm" && actualPipeline === "compatible") {
          video = {
            ...video,
            blob: await embedGeneratedMediaMetadata(video.blob, generationMetadata),
          };
        }
        progress({ progress: 99, phaseKey: "exportSaveFile", phaseParams: { format: video.label } });
        await downloadArtifacts(video.blob, video.extension);
        d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete"));
        notify(localize(srt ? "exportVideoAndSrtComplete" : "exportVideoComplete", { format: video.label }));
        return { status: "success", extension: video.extension, byteSize: video.blob.size, actualPipeline };
      }
      if (video.nativeMp4) {
        if (generationMetadata && actualPipeline === "compatible") {
          video = {
            ...video,
            blob: await transcodeWebmToMp4(video.blob, {
              signal,
              generationMetadata,
              copyStreams: true,
            }),
          };
        }
        progress({ progress: 98, phaseKey: "exportSaveFile", phaseParams: { format: "MP4" } }); await downloadArtifacts(video.blob, "mp4");
        d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete")); notify(localize(srt ? "exportVideoAndSrtComplete" : "exportComplete", { format: "MP4" }));
        return { status: "success", extension: "mp4", byteSize: video.blob.size, actualPipeline };
      }
      d.setStatusText(localize("exportFfmpegLoading")); progress({ progress: 95, phaseKey: "exportFfmpegLoading" });
      let mp4;
      try {
        d.setStatusText(localize("exportFfmpegTranscoding")); progress({ progress: 96, phaseKey: "exportFfmpegTranscoding" });
        mp4 = await transcodeWebmToMp4(video.blob, { signal, generationMetadata });
      } catch (error) {
        if (isExportAbortError(error)) throw error;
        // A caller collecting an MP4 artifact has requested that exact
        // container. Never report an undelivered WebM as a successful MP4 run.
        // Ordinary browser exports retain their existing WebM rescue path.
        if (options.onArtifact) throw error;
        console.error(error); progress({ progress: 99, phaseKey: "exportWebmFallbackSaving" }); await downloadArtifacts(video.blob, "webm");
        const fallbackComplete = localize("exportWebmFallbackComplete");
        d.setStatus("done"); d.setStatusText(fallbackComplete); await finish(fallbackComplete); notify(localize("exportWebmFallbackNotice"));
        return { status: "success", extension: "webm", byteSize: video.blob.size, actualPipeline };
      }
      // Delivery is outside the transcoder's catch. A rejected sink (including
      // its SRT attachment) must fail once, without re-encoding or delivering
      // another video after the first file may already have been accepted.
      progress({ progress: 99, phaseKey: "exportSaveFile", phaseParams: { format: "MP4" } });
      await downloadArtifacts(mp4, "mp4"); d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete")); notify(localize(srt ? "exportVideoAndSrtComplete" : "exportComplete", { format: "MP4" }));
      return { status: "success", extension: "mp4", byteSize: mp4.size, actualPipeline };
    } catch (error) {
      if (isExportAbortError(error)) {
        const canceled = localize("exportCanceled");
        d.setStatus("ready"); d.setStatusText(canceled); d.setExportPhase(canceled); notify(canceled);
        return { status: "canceled", actualPipeline };
      } else {
        const message = error instanceof Error ? error.message : localize("exportFailed");
        console.error(error); d.setStatus("error"); d.setStatusText(message); d.setExportPhase(localize("exportFailed"));
        return { status: "failed", actualPipeline, error: message };
      }
    } finally {
      if (d.exportAbortControllerRef.current === controller) d.exportAbortControllerRef.current = null;
      d.setExporting(false); d.setExportProgress(0);
    }
  }, [d]);
}
