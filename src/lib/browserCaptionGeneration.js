import { transcribeBrowserFile } from "./browserFileSpeech.js";
import { getVisualSpeedCurveTimelineProgress } from "./visualSpeedCurve.js";

// Shared by the inspector and Agent; recognition times are source-relative.
export async function generateBrowserCaptionSegments(blob, { clip, language, offset = 0, signal, context, translator, onProgress } = {}) {
  const segments = await transcribeBrowserFile(blob, {
    language, offset: 0, sourceStart: clip ? clip.sourceStart || 0 : 0,
    sourceDuration: clip ? clip.sourceDuration || clip.duration * (clip.playbackRate || 1) : undefined,
    signal, context, onProgress: value => onProgress?.(value * (translator ? 0.85 : 1)),
  });
  const mapTime = time => !clip ? time : clip.speedCurve?.enabled
    ? getVisualSpeedCurveTimelineProgress(clip.speedCurve, time / (clip.sourceDuration || clip.duration * (clip.playbackRate || 1))) * clip.duration
    : time / (clip.playbackRate || 1);
  for (const segment of segments) {
    segment.start = offset + Math.max(0, mapTime(segment.start));
    segment.end = offset + Math.min(clip?.duration ?? Infinity, mapTime(segment.end));
  }
  const valid = segments.filter(segment => segment.end > segment.start && segment.text?.trim());
  if (translator) for (let index = 0; index < valid.length; index++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    valid[index].text += `\n${await translator.translate(valid[index].text, { signal })}`;
    onProgress?.(0.85 + (index + 1) / valid.length * 0.15);
  }
  return valid;
}
