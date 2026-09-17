import { throwIfExportAborted } from "./exportCancellation.js";
import { prepareEmbeddedVideoAudio } from "./embeddedVideoAudioExport.js";
import { shouldMuteEmbeddedVideoAudio } from "./sourceAudioSync.js";
import { getVisionKey } from "./vision.js";
import { createGeneratedExportMetadata } from "./generatedMediaMetadata.js";
import { filterTimedSegmentsByLaneVisibility } from "./timeline.js";

/** One composition description for exported files and explicitly requested agent samples. */
export async function prepareEditorComposition(d, { exportSettings, exportRange, exportAudio, burnCaptions, signal, onProgress }) {
  const progress = onProgress || (() => {});
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
  return {
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
}
