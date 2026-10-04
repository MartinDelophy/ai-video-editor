export function getVisualPropertyTabIds({
  isVector = false,
  isVideo = false,
  isOverlay = false,
  hasVectorEditor = false,
  isMobile = false,
  includeRepair = import.meta.env?.VITE_ANNA_EDITION !== "true",
} = {}) {
  if (isVector) {
    return [
      "transform",
      ...(hasVectorEditor ? ["vector"] : []),
      "animation",
      ...(isOverlay ? ["timing"] : []),
    ];
  }
  return [
    "transform",
    "mask",
    "filters",
    "animation",
    ...(isMobile && isVideo ? ["speed"] : []),
    ...(!isMobile && !isOverlay && isVideo ? ["speedCurve"] : []),
    ...(!isMobile && !isOverlay ? ["colorWheels"] : []),
    ...(isOverlay ? ["timing"] : includeRepair ? ["repair"] : []),
  ];
}
