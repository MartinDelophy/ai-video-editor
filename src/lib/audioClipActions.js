import { isTimedSegmentLaneLocked } from "./timeline.js";
import { reverseAudioBlob } from "./media.js";

export function normalizeAudioPlaybackRate(value) {
  return Math.max(0.25, Math.min(4, Number(value) || 1));
}

export function normalizeAudioVolume(value) {
  const volume = Number(value);
  return Number.isFinite(volume) ? Math.max(0, Math.min(4, volume)) : 1;
}

export function updateAudioSegmentPlaybackRate(segment, value) {
  const previousRate = normalizeAudioPlaybackRate(segment?.playbackRate);
  const playbackRate = normalizeAudioPlaybackRate(value);
  const sourceDuration = Math.max(0.01, Number(segment?.sourceDuration) || (Number(segment?.duration) || 0.01) * previousRate);
  return {
    ...segment,
    playbackRate,
    sourceDuration,
    duration: sourceDuration / playbackRate,
    fadeIn: Math.min(Number(segment?.fadeIn) || 0, sourceDuration / playbackRate / 2),
    fadeOut: Math.min(Number(segment?.fadeOut) || 0, sourceDuration / playbackRate / 2),
  };
}

export function createAudioClipActions(d) {
  const updateAudioSegment = (id, patch) => d.setAudioSegments((segments) => segments.map((segment) => {
    if (segment.id !== id || isTimedSegmentLaneLocked(segments, id, d.trackLocks || {})) return segment;
    const normalizedPatch = Number.isFinite(patch.volume)
      ? { ...patch, volume: normalizeAudioVolume(patch.volume) }
      : patch;
    const next = Number.isFinite(normalizedPatch.playbackRate)
      ? { ...updateAudioSegmentPlaybackRate(segment, normalizedPatch.playbackRate), ...normalizedPatch, playbackRate: normalizeAudioPlaybackRate(normalizedPatch.playbackRate) }
      : { ...segment, ...normalizedPatch };
    if (Number.isFinite(patch.start) && patch.start !== segment.start) {
      const delta = patch.start - segment.start;
      d.setCaptionSegments((captions) => captions.map((caption) => caption.audioSegmentId === id
        ? { ...caption, start: caption.start + delta, end: caption.end + delta } : caption));
    }
    if (Number.isFinite(patch.playbackRate) && next.duration !== segment.duration) {
      d.setCaptionSegments((captions) => captions.map((caption) => caption.audioSegmentId === id
        ? { ...caption, end: next.start + next.duration } : caption));
    }
    d.setTimelineHorizon((value) => Math.max(value, Math.ceil((next.start + next.duration + 5) / 10) * 10));
    return next;
  }));
  const toggleAudioSegmentReverse = async (id) => {
    const segment = d.audioSegments.find((item) => item.id === id); if (!segment || segment.reversing || isTimedSegmentLaneLocked(d.audioSegments, id, d.trackLocks || {})) return;
    d.audioSegmentRefs.current.get(id)?.pause();
    d.setAudioSegments((items) => items.map((item) => item.id === id ? { ...item, reversing: true } : item));
    try {
      const originalBlob = segment.originalBlob || segment.blob; const originalPeaks = segment.originalPeaks || segment.peaks;
      const blob = segment.reversed ? originalBlob : await reverseAudioBlob(originalBlob);
      const peaks = segment.reversed ? originalPeaks : [...originalPeaks].reverse();
      let processingPatch = {};
      if (segment.processingOriginalBlob instanceof Blob) {
        // Keep the restorable raw source in the same orientation as the baked file.
        const raw = await reverseAudioBlob(segment.processingOriginalBlob);
        const header = new DataView(await raw.slice(0, 44).arrayBuffer());
        const rawDuration = header.getUint32(40, true) / header.getUint32(28, true);
        const processedHeader = new DataView(await segment.blob.slice(0, 44).arrayBuffer());
        const processedDuration = segment.processingOriginal?.sourceDuration
          || processedHeader.getUint32(40, true) / processedHeader.getUint32(28, true);
        processingPatch = { processingOriginalBlob: raw,
          processingOriginalPeaks: [...(segment.processingOriginalPeaks || [])].reverse(),
          processingOriginal: { sourceStart: Math.max(0, rawDuration - (segment.processingOriginal?.sourceStart || 0) - processedDuration), sourceDuration: processedDuration } };
      }
      const url = URL.createObjectURL(blob);
      URL.revokeObjectURL(segment.url);
      d.setAudioSegments((items) => items.map((item) => item.id === id ? { ...item, blob, url, peaks,
        reversed: !segment.reversed, reversing: false, originalBlob, originalPeaks, ...processingPatch } : item));
      d.notify(segment.reversed ? d.t("audioReverseRestored") : d.t("audioReversed"));
    } catch (error) {
      d.setAudioSegments((items) => items.map((item) => item.id === id ? { ...item, reversing: false } : item));
      d.notify(`${d.t("audioReverseFailed")}：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const deleteAudioSegment = (id) => {
    const segment = d.audioSegments.find((item) => item.id === id); if (segment) URL.revokeObjectURL(segment.url);
    d.setAudioSegments((items) => items.filter((item) => item.id !== id));
    d.setCaptionSegments((items) => items.map((item) => (
      item.audioSegmentId === id || item.detachedAudioSegmentId === id
        ? { ...item, audioSegmentId: "", detachedAudioSegmentId: "" }
        : item
    )));
    d.setSelectedAudioSegmentId((current) => current === id ? "" : current); d.notify(d.t("audioClipDeleted"));
  };
  return { deleteAudioSegment, toggleAudioSegmentReverse, updateAudioSegment };
}
