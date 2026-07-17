import { useState } from "react";

import { DEFAULT_SCRIPT } from "../config/editor.js";
import { createCaptionSegments } from "../lib/timeline.js";

const DEFAULT_CAPTION_STYLE = {
  backgroundColor: "#05080d",
  backgroundOpacity: 0.62,
  textColor: "#f5fbff",
  borderColor: "#35f0dd",
  borderWidth: 0,
  radius: 7,
  paddingX: 22,
  paddingY: 12,
  shadowOpacity: 0.45,
  effect: "normal",
};

export function useCaptionState() {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [captionPosition, setCaptionPosition] = useState("bottom");
  const [captionPlacement, setCaptionPlacement] = useState({ x: 50, y: 78 });
  const [captionSize, setCaptionSize] = useState(14);
  const [captionStyle, setCaptionStyle] = useState(DEFAULT_CAPTION_STYLE);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionSegments, setCaptionSegments] = useState(() => createCaptionSegments(DEFAULT_SCRIPT));
  const [selectedSegmentId, setSelectedSegmentId] = useState("");

  return {
    captionPlacement, captionPosition, captionSegments, captionSize, captionStyle,
    captionsEnabled, script, selectedSegmentId, setCaptionPlacement,
    setCaptionPosition, setCaptionSegments, setCaptionSize, setCaptionStyle,
    setCaptionsEnabled, setScript, setSelectedSegmentId,
  };
}
