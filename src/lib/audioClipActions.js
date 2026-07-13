import { reverseAudioBlob } from "./media.js";

export function createAudioClipActions(d) {
  const updateAudioSegment = (id, patch) => d.setAudioSegments((segments) => segments.map((segment) => {
    if (segment.id !== id) return segment;
    const next = { ...segment, ...patch };
    if (Number.isFinite(patch.start) && patch.start !== segment.start) {
      const delta = patch.start - segment.start;
      d.setCaptionSegments((captions) => captions.map((caption) => caption.audioSegmentId === id
        ? { ...caption, start: caption.start + delta, end: caption.end + delta } : caption));
    }
    d.setTimelineHorizon((value) => Math.max(value, Math.ceil((next.start + next.duration + 5) / 10) * 10));
    return next;
  }));
  const toggleAudioSegmentReverse = async (id) => {
    const segment = d.audioSegments.find((item) => item.id === id); if (!segment || segment.reversing) return;
    d.audioSegmentRefs.current.get(id)?.pause();
    d.setAudioSegments((items) => items.map((item) => item.id === id ? { ...item, reversing: true } : item));
    try {
      const originalBlob = segment.originalBlob || segment.blob; const originalPeaks = segment.originalPeaks || segment.peaks;
      const blob = segment.reversed ? originalBlob : await reverseAudioBlob(originalBlob);
      const peaks = segment.reversed ? originalPeaks : [...originalPeaks].reverse(); const url = URL.createObjectURL(blob);
      URL.revokeObjectURL(segment.url);
      d.setAudioSegments((items) => items.map((item) => item.id === id ? { ...item, blob, url, peaks,
        reversed: !segment.reversed, reversing: false, originalBlob, originalPeaks } : item));
      d.notify(segment.reversed ? d.t("audioReverseRestored") : d.t("audioReversed"));
    } catch (error) {
      d.setAudioSegments((items) => items.map((item) => item.id === id ? { ...item, reversing: false } : item));
      d.notify(`${d.t("audioReverseFailed")}：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const deleteAudioSegment = (id) => {
    const segment = d.audioSegments.find((item) => item.id === id); if (segment) URL.revokeObjectURL(segment.url);
    d.setAudioSegments((items) => items.filter((item) => item.id !== id));
    d.setCaptionSegments((items) => items.filter((item) => item.audioSegmentId !== id));
    d.setSelectedAudioSegmentId((current) => current === id ? "" : current); d.notify(d.t("audioClipDeleted"));
  };
  return { deleteAudioSegment, toggleAudioSegmentReverse, updateAudioSegment };
}
