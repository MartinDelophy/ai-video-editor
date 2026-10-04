import { useState } from "react";
import { getVisualSegmentsTotal } from "../lib/timeline.js";

export function useVisualTrackState() {
  const [imageSrc, setImageSrc] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageMeta, setImageMeta] = useState("");
  const [visualType, setVisualType] = useState("image");
  const [fitMode, setFitMode] = useState("contain");
  const [imageClipCount, setImageClipCount] = useState(0);
  const [imageDuration, setImageDuration] = useState(0);
  const [visualSegments, setVisualSegments] = useState([]);
  const [selectedVisualSegmentId, setSelectedVisualSegmentId] = useState("");
  const [visualOverlaySegments, setVisualOverlaySegments] = useState([]);
  const [selectedVisualOverlayId, setSelectedVisualOverlayId] = useState("");
  const [selectedFilterId, setSelectedFilterId] = useState("none");
  const [selectedTransitionId, setSelectedTransitionId] = useState("none");
  const [selectedStickerId, setSelectedStickerId] = useState("none");
  const [stickerSegments, setStickerSegments] = useState([]);
  const [selectedStickerSegmentId, setSelectedStickerSegmentId] = useState("");

  return {
    fitMode, imageClipCount,
    // The segment sequence is authoritative after insertion, deletion and
    // asynchronous preparation; legacy mirrors must not disable valid footage.
    imageDuration: visualSegments.length ? getVisualSegmentsTotal(visualSegments) : imageDuration,
    imageMeta, imageName,
    imageSrc: imageSrc || visualSegments.find((segment) => segment.src)?.src || "",
    selectedFilterId, selectedStickerId, selectedStickerSegmentId,
    selectedTransitionId, selectedVisualSegmentId, setFitMode, setImageClipCount,
    setImageDuration, setImageMeta, setImageName, setImageSrc, setSelectedFilterId,
    setSelectedStickerId, setSelectedStickerSegmentId, setSelectedTransitionId,
    setSelectedVisualSegmentId, setStickerSegments, setVisualSegments, setVisualType,
    stickerSegments, visualSegments, visualType, visualOverlaySegments,
    selectedVisualOverlayId, setVisualOverlaySegments, setSelectedVisualOverlayId,
  };
}
