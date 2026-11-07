import { useMemo } from "react";

import {
  EMPTY_VISION_OPTIONS,
  getObjectPositionForCrop,
} from "../lib/editorRuntime.js";
import { resolveSmartFrameCropAtTime, smartFrameCropToPixels } from "../lib/smartFrame.js";
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
    const smartFrame = d.previewSmartFrameOverride === false
      ? null
      : d.previewSmartFrameOverride || d.previewVisualSegment?.smartFrame;
    const crop = resolveSmartFrameCropAtTime(smartFrame, d.previewVisualSourceTime);
    return crop ? smartFrameCropToPixels(crop, smartFrame.sourceSize) : null;
  }, [d.previewSmartFrameOverride, d.previewVisualSegment?.smartFrame, d.previewVisualSourceTime]);
  const effectiveCaptionPlacement = d.captionPlacement;
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
  const previewVisualObjectFit = previewSmartCropRect?.presentation === "safe-contain"
    ? "contain"
    : previewSmartCropRect ? "cover" : d.previewVisualSegment?.fitMode || d.fitMode;
  const previewVisualObjectPosition = previewSmartCropRect
    ? previewSmartCropRect.presentation === "safe-contain"
      ? "50% 50%"
      : getObjectPositionForCrop(previewSmartCropRect)
    : "50% 50%";
  const previewSmartBackgroundPosition = previewSmartCropRect
    ? getObjectPositionForCrop(previewSmartCropRect)
    : "50% 50%";

  return {
    effectiveCaptionPlacement, previewSmartCropRect, previewVisionAnalysis,
    previewVisionFrameSize, previewVisionMaskUrl, previewVisionOptions,
    previewSmartBackgroundPosition, previewVisualObjectFit, previewVisualObjectPosition,
    previewVisualRenderSrc,
  };
}
