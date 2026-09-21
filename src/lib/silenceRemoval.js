import { browserProjectFingerprint, supportsBrowserTrim } from "./browserEditPlan.js";
import { materializeProjectCaptionTimings } from "./projectCommandEngine.js";
import { isTimedSegmentLaneLocked } from "./timeline.js";
import { MIN_VISUAL_SEGMENT_SECONDS } from "../config/editor.js";

const EPS = 0.000001;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function canRemovePauses(clip, previous) {
  return supportsBrowserTrim({ ...clip, playbackRate: 1 })
    && !(previous?.transition?.id && previous.transition.id !== "none")
    && !Number(clip?.sourceAudioTimelineOffset);
}

// VAD probabilities describe the original source clock. Convert to the clip's
// constant-speed timeline only once; curves are explicitly excluded by the gate.
export function findPauseCandidates(probabilities, clip, { minimum = 0.8, keep = 0.5 } = {}) {
  const step = 512 / 16000 / (Number(clip.playbackRate) || 1);
  const duration = Number(clip.duration);
  const speech = [];
  let start = null;
  let quietStart = null;
  for (let i = 0; i < probabilities.length; i++) {
    const time = Math.min(duration, i * step);
    if (probabilities[i] >= 0.5) { start ??= time; quietStart = null; }
    else if (start !== null && probabilities[i] < 0.35) {
      quietStart ??= time;
      if (time - quietStart >= 0.16) {
        speech.push({ start, end: quietStart }); start = null; quietStart = null;
      }
    }
  }
  if (start !== null) speech.push({ start, end: quietStart ?? duration });
  // Entirely non-speech footage is not evidence of a removable speaking pause.
  if (!speech.some((range) => range.end - range.start >= 0.1)) return [];
  const gaps = [];
  let end = 0;
  for (const range of [...speech, { start: duration, end: duration }]) {
    if (range.start - end >= minimum) {
      const from = end + (end > 0 ? keep / 2 : 0);
      const to = range.start - (range.start < duration ? keep / 2 : 0);
      if (to - from >= MIN_VISUAL_SEGMENT_SECONDS) gaps.push({ start: from, end: to });
    }
    end = range.end;
  }
  // Omit a candidate rather than extending it into a short spoken word to meet
  // the editor's minimum clip length. Any subset remains safe to apply.
  const safe = [];
  let cursor = 0;
  for (const gap of gaps) {
    if (gap.start > cursor + EPS && gap.start - cursor < MIN_VISUAL_SEGMENT_SECONDS) continue;
    if (gap.end < duration - EPS && duration - gap.end < MIN_VISUAL_SEGMENT_SECONDS) continue;
    if (gap.end - gap.start > duration - MIN_VISUAL_SEGMENT_SECONDS) continue;
    safe.push({ ...gap, id: `pause-${safe.length}`, enabled: true }); cursor = gap.end;
  }
  return safe;
}

export function retainedRanges(start, end, cuts) {
  const ranges = [];
  let cursor = start;
  for (const cut of cuts) {
    if (cut.end <= cursor || cut.start >= end) continue;
    if (cut.start > cursor + EPS) ranges.push({ start: cursor, end: Math.min(end, cut.start) });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < end - EPS) ranges.push({ start: cursor, end });
  return ranges;
}

export function collapseTime(time, cuts) {
  return time - cuts.reduce((sum, cut) => sum + Math.max(0, Math.min(time, cut.end) - cut.start), 0);
}

/** Pure, staged edit. Shared browser commit restores media and records one undo. */
export function buildSilenceRemovalReview(snapshot, runtime, clipId, candidates, rippleEditing) {
  const project = materializeProjectCaptionTimings(snapshot);
  const index = runtime.visualSegments.findIndex((clip) => clip.id === clipId);
  const live = runtime.visualSegments[index];
  if (!live || !canRemovePauses(live, runtime.visualSegments[index - 1])) fail("pauseUnsupported");
  if (project.trackLocks?.image) fail("pauseLocked");
  const start = runtime.visualSegments.slice(0, index).reduce((sum, clip) => sum + clip.duration, 0);
  const cuts = candidates.filter((cut) => cut.enabled).map((cut) => ({ start: start + cut.start, end: start + cut.end })).sort((a, b) => a.start - b.start);
  if (!cuts.length) fail("pauseNoSelection");
  if (cuts.some((cut, i) => !Number.isFinite(cut.start) || !Number.isFinite(cut.end)
    || cut.start < start - EPS || cut.end > start + live.duration + EPS || cut.end <= cut.start
    || i > 0 && cut.start < cuts[i - 1].end)) fail("pauseFailed");
  if (runtime.sourceAudioBlob && project.sourceAudioLinked !== false && project.trackLocks?.source) fail("pauseLocked");
  const next = structuredClone(project);
  const origins = Object.create(null);
  const newId = (clip, position) => {
    if (!position) return clip.id;
    const id = crypto.randomUUID(); origins[id] = { kind: "clip", id: clip.id }; return id;
  };
  const slice = (clip, offset, duration) => {
    const rate = Number(clip.playbackRate) || 1;
    return { ...clip, duration, sourceStart: (Number(clip.sourceStart) || 0) + offset * rate, sourceDuration: duration * rate };
  };
  const original = next.visualSegments[index];
  const ranges = retainedRanges(start, start + live.duration, cuts);
  if (!ranges.length || ranges.some((range) => range.end - range.start < MIN_VISUAL_SEGMENT_SECONDS - EPS)) fail("pauseTooShort");
  const pieces = ranges.map((range, i) => ({ ...slice(original, range.start - start, range.end - range.start), id: newId(original, i) }));
  next.visualSegments.splice(index, 1, ...pieces);

  if (rippleEditing) {
    const locks = project.trackLocks || {};
    // A locked member protects its actively linked audio/caption pair as a unit.
    const fixedAudio = new Set((project.audioSegments || []).filter((clip) =>
      isTimedSegmentLaneLocked(project.audioSegments, clip.id, locks)
      || locks.caption && project.captionSegments.some((caption) => caption.audioSegmentId === clip.id)).map((clip) => clip.id));
    const audioPieces = new Map();
    for (const [key, locked] of [["audioSegments", false], ["visualOverlaySegments", locks.overlay], ["stickerSegments", locks.sticker], ["musicSegments", locks.music]]) {
      next[key] = (project[key] || []).flatMap((clip) => {
        if (locked || key === "audioSegments" && fixedAudio.has(clip.id)) return [clip];
        const from = Number(clip.start) || 0;
        const end = from + Number(clip.duration);
        const parts = retainedRanges(from, end, cuts);
        const trimmed = parts.length !== 1 || Math.abs((parts[0]?.end - parts[0]?.start) - clip.duration) > EPS;
        if (trimmed && (clip.speedCurve?.enabled || clip.reverse || clip.reversed
          || key === "visualOverlaySegments" && !supportsBrowserTrim({ ...clip, type: "video", playbackRate: 1 })
          || key === "stickerSegments" && (clip.keyframes?.length
            || [clip.animation?.in, clip.animation?.out].some((phase) => phase?.id && phase.id !== "none")))) fail("pauseComplexOverlap");
        const items = parts.map((range, i) => {
          const duration = range.end - range.start;
          const item = trimmed ? slice(clip, range.start - from, duration) : { ...clip };
          return { ...item, id: newId(clip, i), start: collapseTime(range.start, cuts),
            ...(Number.isFinite(clip.end) ? { end: collapseTime(range.end, cuts) } : {}),
            ...(trimmed && (key === "audioSegments" || key === "musicSegments") ? {
              fadeIn: range.start === from ? Math.min(Number(clip.fadeIn) || 0, duration) : Math.min(0.005, duration / 2),
              fadeOut: range.end === end ? Math.min(Number(clip.fadeOut) || 0, duration) : Math.min(0.005, duration / 2),
            } : {}),
          };
        });
        if (key === "audioSegments") audioPieces.set(clip.id, items);
        return items;
      });
    }
    next.captionSegments = project.captionSegments.flatMap((caption) => {
      if (locks.caption || fixedAudio.has(caption.audioSegmentId)) return [caption];
      const parts = retainedRanges(caption.start, caption.end, cuts);
      return parts.map((range, i) => {
        const item = { ...caption, id: i ? crypto.randomUUID() : caption.id,
          start: collapseTime(range.start, cuts), end: collapseTime(range.end, cuts) };
        for (const field of ["audioSegmentId", "detachedAudioSegmentId"]) {
          if (!audioPieces.has(caption[field])) continue;
          const source = audioPieces.get(caption[field]).find((audio) => audio.start < item.end - EPS && audio.start + audio.duration > item.start + EPS);
          if (source) item[field] = source.id;
          else delete item[field];
        }
        return item;
      });
    });
    next.script = next.captionSegments.map((caption) => caption.text).join("\n");
    if (!locks.music) {
      // Legacy unsegmented music/source tracks cannot represent holes: refuse
      // to silently desynchronize them. Segmented music is handled above.
      if (runtime.musicBlob && !project.musicSegments?.length && cuts.some((cut) => cut.start < project.musicStart + project.musicDuration && cut.end > project.musicStart)) fail("pauseLegacyOverlap");
      next.musicStart = next.musicSegments.length ? Math.min(...next.musicSegments.map((clip) => clip.start)) : collapseTime(project.musicStart || 0, cuts);
      if (project.musicSegments?.length && !next.musicSegments.length) next.musicDuration = 0;
    }
    if (runtime.sourceAudioBlob && project.sourceAudioLinked === false && !locks.source) {
      if (cuts.some((cut) => cut.start < project.sourceAudioStart + project.sourceAudioDuration && cut.end > project.sourceAudioStart)) fail("pauseLegacyOverlap");
      next.sourceAudioStart = collapseTime(project.sourceAudioStart || 0, cuts);
    }
  }
  return {
    project: next, mediaOrigins: origins, hasChanges: true,
    fingerprint: browserProjectFingerprint(snapshot, rippleEditing, runtime.visualSegments, runtime),
    duration: next.visualSegments.reduce((sum, clip) => sum + clip.duration, 0),
    focusTime: collapseTime(cuts[0].start, cuts), rows: [{ changed: true, index, start }],
  };
}
