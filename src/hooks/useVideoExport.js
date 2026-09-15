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
import { exportAudioMix } from "../lib/audioExport.js";
import { serializeSrt } from "../lib/subtitles.js";
import { getVisionKey } from "../lib/vision.js";
import { prepareEmbeddedVideoAudio } from "../lib/embeddedVideoAudioExport.js";
import { shouldMuteEmbeddedVideoAudio } from "../lib/sourceAudioSync.js";
import {
  createGeneratedExportMetadata,
  embedGeneratedMediaMetadata,
} from "../lib/generatedMediaMetadata.js";
import { filterTimedSegmentsByLaneVisibility } from "../lib/timeline.js";
import { EXPORT_FAILURE_COPY } from "../i18nExportFailure.js";

function getExportFailureMessage(error, copy, localize) {
  const messages = [];
  for (let cause = error, depth = 0; cause && depth < 5; cause = cause.cause, depth += 1) {
    messages.push(`${cause.name || ""} ${cause.message || ""}`);
  }
  const detail = messages.join(" ");
  if (/out of memory|memory allocation|insufficient memory|array buffer allocation|allocation failed|内存/i.test(detail)) return copy.memory;
  if (/failed to fetch|networkerror|err_network|load failed|network request|网络/i.test(detail)) return copy.network;
  if (/NotReadableError|NotFoundError|MEDIA_ERR|media.*(?:missing|not found|unavailable)|音频媒体已丢失|素材.*(?:失效|丢失)/i.test(detail)) return copy.media;
  if (/音轨|audio track|audio encoder|AudioEncoder/i.test(detail)) return copy.audio;
  if (/NotSupportedError|not supported|unsupported|不支持/i.test(detail)) return copy.unsupported;
  if (error?.message === localize("exportRangeInvalid")) return error.message;
  return copy.generic;
}

export function useVideoExport(d) {
  return useCallback(async (options = {}) => {
    // The ref closes the gap before React has committed the exporting state.
    if (d.exporting || d.exportAbortControllerRef.current) return { status: "busy" };
    if (options.signal?.aborted) return { status: "canceled" };
    const requestedSettings = normalizeExportSettings(options.settings || d.exportSettings);
    const audioOnly = requestedSettings.mediaType === "audio";
    if (!audioOnly && !d.imageSrc) {
      d.notify(d.t("exportVisualRequired"));
      return { status: "blocked", error: d.t("exportVisualRequired") };
    }
    const exportSettings = {
      ...requestedSettings,
      ...(audioOnly ? { range: "full", audio: "mix", captions: "none" } : {}),
      ...getExportDimensions(d.ratio, Number(requestedSettings.resolution)),
      videoBitsPerSecond: getEffectiveExportBitrate(requestedSettings),
    };
    const notify = (message) => {
      if (!options.suppressNotification) d.notify(message);
    };
    const controller = new AbortController();
    d.exportAbortControllerRef.current = controller;
    const { signal } = controller;
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const reportProgress = (value) => {
      // An observer must not interrupt encoding or turn a saved file into a failure.
      try { options.onProgress?.(value); } catch { /* The export remains authoritative. */ }
    };
    d.setExportError(null);
    d.setExporting(true); d.exportStartRef.current = performance.now(); d.setExportProgress(1);
    const localize = (key, params = {}) => Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      d.t(key),
    );
    const preparingPhase = localize("exportPreparing");
    let lastProgress = 1;
    let lastPhase = preparingPhase;
    d.setExportPhase(preparingPhase); d.setStatus("generating"); d.setStatusText(preparingPhase);
    reportProgress({ progress: 1, phase: preparingPhase, phaseKey: "exportPreparing" });
    const progress = ({ progress, phase, phaseKey, phaseParams }) => {
      lastProgress = Math.max(lastProgress, Math.min(100, Math.max(0, Math.round(progress))));
      d.setExportProgress((current) => Math.max(current, Math.min(100, Math.max(0, Math.round(progress)))));
      const localizedPhase = phaseKey ? localize(phaseKey, phaseParams) : phase;
      if (localizedPhase) { lastPhase = localizedPhase; d.setExportPhase(localizedPhase); }
      reportProgress({ progress, phase: localizedPhase || "", phaseKey: phaseKey || "" });
    };
    const finish = async (phase) => {
      d.setExportPhase(phase); d.setExportProgress(100);
      reportProgress({ progress: 100, phase, phaseKey: "exportComplete" });
      await new Promise((resolve) => setTimeout(resolve, 450));
    };
    let actualPipeline = "";
    try {
      const exportAudio = exportSettings.audio !== "none";
      const captionDelivery = exportSettings.captions || "burned";
      const burnCaptions = !audioOnly && captionDelivery !== "none" && d.captionsEnabled && d.trackVisibility.caption;
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
        throwIfExportAborted(signal);
        if (!(blob instanceof Blob) || blob.size < 12) throw new Error(localize("exportFailed"));
        const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
        const box = String.fromCharCode(...header.slice(4, 8));
        const validContainer = extension === "webm"
          ? header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3
          : extension === "mp4" ? box === "ftyp"
            : extension === "mov" && ["ftyp", "moov", "mdat", "wide"].includes(box);
        if (!validContainer) throw new Error(localize("exportFailed"));
        throwIfExportAborted(signal);
        const fileName = `${exportBaseName}.${extension}`;
        downloadBlob(blob, fileName);
        const sidecars = [];
        if (srt) {
          progress({ progress: 99, phaseKey: "exportSaveSrt" });
          const subtitle = new Blob(["\uFEFF", srt], { type: "application/x-subrip;charset=utf-8" });
          downloadBlob(subtitle, `${exportBaseName}.srt`);
          sidecars.push({ fileName: `${exportBaseName}.srt`, extension: "srt", byteSize: subtitle.size });
        }
        return { fileName, extension, byteSize: blob.size, mimeType: blob.type, sidecars };
      };
      // Preserve the full visual sequence when selecting embedded audio so
      // source segments retain their actual timeline positions after edits.
      const embeddedVisuals = d.sourceAudioBlob ? d.renderedVisualSegments.map((segment) => ({
        ...segment,
        sourceAudioDisabled: shouldMuteEmbeddedVideoAudio(segment, {
          sourceAudioBlob: d.sourceAudioBlob, sourceAudioAssetId: d.sourceAudioAssetId,
          sourceAudioLinked: d.sourceAudioLinked,
          linkedSegments: d.linkedSourceAudioSegments,
        }),
      })) : d.renderedVisualSegments;
      const embeddedVideoAudio = exportAudio && d.trackVisibility.source !== false
        ? await prepareEmbeddedVideoAudio(embeddedVisuals, progress, signal)
        : { blob: null, segments: [] };
      throwIfExportAborted(signal);
      const exportSourceAudioBlob = exportAudio && d.trackVisibility.source !== false
        ? d.sourceAudioBlob
          ? d.sourceAudioLinked && !d.linkedSourceAudioSegments?.length ? null : d.sourceAudioBlob
          : embeddedVideoAudio.blob
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
      const overlayAudio = exportAudio
        ? await prepareEmbeddedVideoAudio(
            exportedOverlaySegments.map((segment) => ({
              ...segment,
              sourceAudioDisabled: segment.muted === true || segment.sourceAudioDisabled === true,
            })),
            progress,
            signal,
            { preserveTimelineStarts: true },
          )
        : { blob: null, segments: [] };
      throwIfExportAborted(signal);
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
        audioBlob: null,
        voiceAudioSegments: [
          ...voiceAudioSegments,
          ...(d.sourceAudioBlob && embeddedVideoAudio.blob
            ? embeddedVideoAudio.segments.map((segment) => ({ ...segment, blob: embeddedVideoAudio.blob, volume: 1, sourceKind: "embedded-source" }))
            : []),
          ...overlayAudio.segments.map((segment) => ({ ...segment, blob: overlayAudio.blob, volume: 1, sourceKind: "embedded-overlay" })),
        ],
        voiceVolume: d.volume,
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
      if (audioOnly) {
        actualPipeline = "offline-audio";
        const audio = await exportAudioMix({
          ...exportOptions,
          format: exportSettings.audioFormat,
          audioBitsPerSecond: exportSettings.audioBitsPerSecond,
        });
        throwIfExportAborted(signal);
        const fileName = `${exportBaseName}.${audio.extension}`;
        progress({ progress: 99, phaseKey: "exportSaveFile", phaseParams: { format: audio.extension.toUpperCase() } });
        downloadBlob(audio.blob, fileName);
        d.setStatus("done"); d.setStatusText(localize("exportComplete"));
        await finish(localize("exportComplete")); notify(localize("exportComplete"));
        return { status: "success", fileName, extension: audio.extension, byteSize: audio.blob.size, mimeType: audio.blob.type, sidecars: [], actualPipeline };
      }
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
        const artifact = await downloadArtifacts(video.blob, video.extension);
        d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete"));
        notify(localize(srt ? "exportVideoAndSrtComplete" : "exportVideoComplete", { format: video.label }));
        return { status: "success", ...artifact, actualPipeline };
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
        progress({ progress: 98, phaseKey: "exportSaveFile", phaseParams: { format: "MP4" } });
        const artifact = await downloadArtifacts(video.blob, "mp4");
        d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete")); notify(localize(srt ? "exportVideoAndSrtComplete" : "exportComplete", { format: "MP4" }));
        return { status: "success", ...artifact, actualPipeline };
      }
      d.setStatusText(localize("exportFfmpegLoading")); progress({ progress: 95, phaseKey: "exportFfmpegLoading" });
      try {
        d.setStatusText(localize("exportFfmpegTranscoding")); progress({ progress: 96, phaseKey: "exportFfmpegTranscoding" });
        const mp4 = await transcodeWebmToMp4(video.blob, { signal, generationMetadata }); progress({ progress: 99, phaseKey: "exportSaveFile", phaseParams: { format: "MP4" } });
        const artifact = await downloadArtifacts(mp4, "mp4");
        d.setStatus("done"); d.setStatusText(localize("exportComplete")); await finish(localize("exportComplete")); notify(localize(srt ? "exportVideoAndSrtComplete" : "exportComplete", { format: "MP4" }));
        return { status: "success", ...artifact, actualPipeline };
      } catch (error) {
        if (isExportAbortError(error)) throw error;
        console.error(error); progress({ progress: 99, phaseKey: "exportWebmFallbackSaving" });
        const artifact = await downloadArtifacts(video.blob, "webm");
        const fallbackComplete = localize("exportWebmFallbackComplete");
        d.setStatus("done"); d.setStatusText(fallbackComplete); await finish(fallbackComplete); notify(localize("exportWebmFallbackNotice"));
        return { status: "success", ...artifact, actualPipeline };
      }
    } catch (error) {
      if (isExportAbortError(error)) {
        const canceled = localize("exportCanceled");
        d.setStatus("ready"); d.setStatusText(canceled); d.setExportPhase(canceled); notify(canceled);
        return { status: "canceled", actualPipeline };
      } else {
        const message = error instanceof Error ? error.message : localize("exportFailed");
        const copy = EXPORT_FAILURE_COPY[d.language] || EXPORT_FAILURE_COPY.en;
        const displayMessage = getExportFailureMessage(error, audioOnly ? { ...copy, generic: localize("audioExportFailed") } : copy, localize);
        d.setExportError({ message: displayMessage, settings: requestedSettings, phase: lastPhase, percent: lastProgress });
        console.error(error); d.setStatus("error"); d.setStatusText(displayMessage); d.setExportPhase(localize("exportFailed"));
        return { status: "failed", actualPipeline, error: message };
      }
    } finally {
      options.signal?.removeEventListener("abort", abortFromCaller);
      if (d.exportAbortControllerRef.current === controller) d.exportAbortControllerRef.current = null;
      d.setExporting(false); d.setExportProgress(0);
    }
  }, [d]);
}
