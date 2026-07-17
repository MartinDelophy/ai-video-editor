import { useMemo } from "react";

import { getCaptionTextLayout } from "../lib/captionLayout.js";
import {
  EMPTY_VISION_OPTIONS,
  getObjectPositionForCrop,
  isSameVisionDetection,
} from "../lib/editorRuntime.js";
import {
  getCaptionAvoidancePlacement,
  getSmartCropRect,
  mapNormalizedBoxToFrame,
} from "../lib/visualGeometry.js";
import { resolveVisionAnalysisAtTime } from "../lib/vision.js";

export function usePreviewModel(d) {
  const previewVisionAnalysis = useMemo(
    () => resolveVisionAnalysisAtTime(
      d.previewVisionBaseAnalysis,
      d.previewVisualType === "video" ? d.previewVideoMediaTime : d.previewVisualSourceTime,
    ),
    [
      d.previewVideoMediaTime, d.previewVisionBaseAnalysis, d.previewVisualSourceTime,
      d.previewVisualType,
    ],
  );
  const previewVisionOptions = d.previewVisionRecord?.options ?? EMPTY_VISION_OPTIONS;
  const previewVisionFrameSize = useMemo(() => ({
    width: d.previewFrameSize.width || d.ratio.width,
    height: d.previewFrameSize.height || d.ratio.height,
  }), [d.previewFrameSize.height, d.previewFrameSize.width, d.ratio.height, d.ratio.width]);
  const previewSmartCropRect = useMemo(() => {
    if (
      d.fitMode !== "cover" ||
      !previewVisionOptions.smartCrop ||
      !previewVisionAnalysis?.subject?.box ||
      !previewVisionAnalysis?.sourceSize
    ) return null;
    return getSmartCropRect(
      previewVisionAnalysis.sourceSize,
      previewVisionFrameSize,
      previewVisionAnalysis.subject.box,
      { padding: 0.14 },
    );
  }, [d.fitMode, previewVisionAnalysis, previewVisionFrameSize, previewVisionOptions.smartCrop]);
  const previewVisionOverlayBoxes = useMemo(() => {
    if (!previewVisionOptions.showDetections || !previewVisionAnalysis?.sourceSize) return [];
    return (previewVisionAnalysis.detections ?? []).map((detection) => {
      const mapped = mapNormalizedBoxToFrame(
        detection.box,
        previewVisionAnalysis.sourceSize,
        previewVisionFrameSize,
        {
          fitMode: d.fitMode,
          smartCrop: previewSmartCropRect || false,
          outputSize: previewVisionFrameSize,
        },
      );
      if (!mapped?.normalized || mapped.width < 1 || mapped.height < 1) return null;
      return {
        ...mapped.normalized,
        label: detection.label,
        score: detection.score,
        isSubject: isSameVisionDetection(detection, previewVisionAnalysis.subject),
      };
    }).filter(Boolean);
  }, [
    d.fitMode, previewSmartCropRect, previewVisionAnalysis, previewVisionFrameSize,
    previewVisionOptions.showDetections,
  ]);
  const previewCaptionLayout = useMemo(() => getCaptionTextLayout({
    text: d.currentCaption,
    captionSize: d.captionSize,
    captionStyle: d.captionStyle,
    referenceFrame: previewVisionFrameSize,
    renderFrame: previewVisionFrameSize,
  }), [d.captionSize, d.captionStyle, d.currentCaption, previewVisionFrameSize]);
  const effectiveCaptionPlacement = useMemo(() => {
    if (
      !previewVisionOptions.avoidCaptions ||
      !previewVisionAnalysis?.subject?.box ||
      !previewVisionAnalysis?.sourceSize
    ) return d.captionPlacement;
    return getCaptionAvoidancePlacement(previewVisionAnalysis.subject.box, {
      sourceSize: previewVisionAnalysis.sourceSize,
      frameSize: previewVisionFrameSize,
      fitMode: d.fitMode,
      smartCrop: previewSmartCropRect || false,
      basePlacement: d.captionPlacement,
      previousPlacement: d.captionPlacement,
      captionSize: {
        width: previewCaptionLayout.width / Math.max(1, previewVisionFrameSize.width),
        height: previewCaptionLayout.height,
      },
      safeMargin: 0.045,
    });
  }, [
    d.captionPlacement, d.fitMode, previewCaptionLayout, previewSmartCropRect,
    previewVisionAnalysis, previewVisionFrameSize, previewVisionOptions.avoidCaptions,
  ]);
  const previewVisualRenderSrc =
    previewVisionOptions.removeBackground &&
    d.previewVisualType === "image" &&
    previewVisionAnalysis?.cutoutUrl
      ? previewVisionAnalysis.cutoutUrl
      : d.previewVisualSrc;
  const previewVisionMaskUrl =
    previewVisionOptions.removeBackground && d.previewVisualType === "video"
      ? previewVisionAnalysis?.cutoutUrl ?? ""
      : "";
  const previewVisualObjectFit = previewSmartCropRect ? "cover" : d.fitMode;
  const previewVisualObjectPosition = previewSmartCropRect
    ? getObjectPositionForCrop(previewSmartCropRect)
    : "50% 50%";

  return {
    effectiveCaptionPlacement, previewSmartCropRect, previewVisionAnalysis,
    previewVisionFrameSize, previewVisionMaskUrl, previewVisionOptions,
    previewVisionOverlayBoxes, previewVisualObjectFit, previewVisualObjectPosition,
    previewVisualRenderSrc,
  };
}
