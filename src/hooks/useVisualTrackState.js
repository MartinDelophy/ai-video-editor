import { useState } from "react";

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
  const [selectedFilterId, setSelectedFilterId] = useState("none");
  const [selectedTransitionId, setSelectedTransitionId] = useState("none");
  const [selectedStickerId, setSelectedStickerId] = useState("none");
  const [stickerSegments, setStickerSegments] = useState([]);
  const [selectedStickerSegmentId, setSelectedStickerSegmentId] = useState("");

  return {
    fitMode, imageClipCount, imageDuration, imageMeta, imageName, imageSrc,
    selectedFilterId, selectedStickerId, selectedStickerSegmentId,
    selectedTransitionId, selectedVisualSegmentId, setFitMode, setImageClipCount,
    setImageDuration, setImageMeta, setImageName, setImageSrc, setSelectedFilterId,
    setSelectedStickerId, setSelectedStickerSegmentId, setSelectedTransitionId,
    setSelectedVisualSegmentId, setStickerSegments, setVisualSegments, setVisualType,
    stickerSegments, visualSegments, visualType,
  };
}
