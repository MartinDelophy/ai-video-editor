export function getCaptionVoiceSegment(audioSegments, captionSegment) {
  if (!captionSegment?.audioSegmentId) return null;
  return audioSegments.find((segment) => segment.id === captionSegment.audioSegmentId) ?? null;
}
