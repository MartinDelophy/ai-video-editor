import { connectAudioSpatialEffect } from "./audioSpatialEffects.js";
import { throwIfExportAborted } from "./exportCancellation.js";
import { encodeAudioBufferAsWav, transcodeAudioToMp3 } from "./media.js";
import { createPitchPreservedAudioBuffer } from "./pitchPreservingTimeStretch.js";
import { getVisualSourceTime, normalizeVisualPlaybackRate } from "./visualEffects.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nonnegative = (value) => Math.max(0, Number(value) || 0);

function makeAudioInput(segment, defaults = {}) {
  const playbackRate = normalizeVisualPlaybackRate(segment.playbackRate);
  return {
    blob: segment.blob ?? defaults.blob,
    start: nonnegative(segment.start ?? defaults.start),
    volume: segment.muted === true ? 0 : clamp(Number(segment.volume ?? defaults.volume ?? 1), 0, 4),
    sourceStart: nonnegative(segment.sourceStart),
    sourceDuration: nonnegative(segment.sourceDuration || nonnegative(segment.duration) * playbackRate),
    duration: nonnegative(segment.duration),
    playbackRate,
    speedCurve: segment.speedCurve,
    fadeIn: nonnegative(segment.fadeIn),
    fadeOut: nonnegative(segment.fadeOut),
    spatialEffect: segment.spatialEffect ?? defaults.spatialEffect,
    spatialAmount: segment.spatialAmount ?? defaults.spatialAmount,
  };
}

// The minimum of the two fades also covers overlapping fades and ranges that
// begin or end midway through a fade, using the same envelope as preview.
function scheduleAudioEnvelope(gain, input, duration, localStart, localEnd, outputStart) {
  const fadeIn = Math.min(duration, input.fadeIn);
  const fadeOut = Math.min(duration, input.fadeOut);
  const levelAt = (time) => input.volume * Math.max(0, Math.min(
    1,
    fadeIn > 0 ? time / fadeIn : 1,
    fadeOut > 0 ? (duration - time) / fadeOut : 1,
  ));
  const corners = [localStart, localEnd];
  if (fadeIn > 0) corners.push(fadeIn);
  if (fadeOut > 0) corners.push(duration - fadeOut);
  if (fadeIn + fadeOut > duration) corners.push(duration * fadeIn / (fadeIn + fadeOut));
  const times = [...new Set(corners)].filter((time) => time >= localStart && time <= localEnd).sort((a, b) => a - b);
  gain.setValueAtTime(levelAt(localStart), outputStart);
  for (const time of times.slice(1)) gain.linearRampToValueAtTime(levelAt(time), outputStart + time - localStart);
}

async function decodeAudioInputs(inputs, signal) {
  throwIfExportAborted(signal);
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio decoding is not supported");
  const context = new AudioContextClass({ sampleRate: 48_000 });
  const cache = new Map();
  try {
    return await Promise.all(inputs.map(async (input) => {
      throwIfExportAborted(signal);
      if (!(input.blob instanceof Blob)) throw new Error("Audio media is missing");
      if (!cache.has(input.blob)) {
        cache.set(input.blob, input.blob.arrayBuffer().then((data) => {
          throwIfExportAborted(signal);
          return context.decodeAudioData(data);
        }));
      }
      const decoded = await cache.get(input.blob);
      throwIfExportAborted(signal);
      return { ...input, decoded };
    }));
  } finally {
    await context.close().catch(() => {});
  }
}

/** Shared rendering for video export, timeline audio export, and individual clips. */
export async function mixOfflineAudio({
  duration,
  voiceAudioSegments = [],
  sourceAudioBlob = null,
  sourceAudioSegments = [],
  sourceAudioVolume = 1,
  sourceAudioSpatialEffect = "original",
  sourceAudioSpatialAmount = 1,
  sourceAudioStart = 0,
  musicBlob = null,
  musicVolume = 0.35,
  musicStart = 0,
  musicSegments = [],
  timelineOffset = 0,
  signal,
}) {
  throwIfExportAborted(signal);
  const rangeStart = nonnegative(timelineOffset);
  const outputDuration = nonnegative(duration);
  if (!(outputDuration > 0)) throw new Error("Audio export duration must be positive");
  const rangeEnd = rangeStart + outputDuration;
  const inputs = [
    ...voiceAudioSegments.map((segment) => makeAudioInput(segment)),
    ...(sourceAudioBlob ? (sourceAudioSegments.length ? sourceAudioSegments : [{ start: sourceAudioStart }]).map((segment) => makeAudioInput(segment, {
      blob: sourceAudioBlob,
      volume: sourceAudioVolume,
      spatialEffect: sourceAudioSpatialEffect,
      spatialAmount: sourceAudioSpatialAmount,
    })) : []),
    ...(musicBlob ? (musicSegments.length ? musicSegments : [{ start: musicStart }]).map((segment) => makeAudioInput(segment, {
      blob: musicBlob,
      volume: musicVolume,
    })) : []),
  ].filter((input) => input.start < rangeEnd && (!input.duration || input.start + input.duration > rangeStart));
  if (!inputs.length) return null;
  const decoded = await decodeAudioInputs(inputs, signal);
  throwIfExportAborted(signal);
  const sampleRate = 48_000;
  const OfflineContextClass = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OfflineContextClass) throw new Error("Offline audio rendering is not supported");
  const context = new OfflineContextClass(2, Math.max(1, Math.round(outputDuration * sampleRate)), sampleRate);
  const sources = [];
  const stopSources = () => {
    for (const source of sources) {
      try { source.stop(); source.disconnect(); } catch { /* A source may already be stopped. */ }
    }
  };
  signal?.addEventListener("abort", stopSources, { once: true });
  try {
    for (const input of decoded) {
      throwIfExportAborted(signal);
      const sourceStart = Math.min(input.decoded.duration, input.sourceStart);
      const available = Math.max(0, input.decoded.duration - sourceStart);
      const sourceDuration = Math.min(available, input.sourceDuration || available);
      if (!(sourceDuration > 0)) continue;
      // A split/trim may retain the original blob and source duration. The
      // timeline clip's explicit duration is always the output boundary.
      const clipDuration = input.duration || sourceDuration / input.playbackRate;
      const mapping = { ...input, sourceStart, duration: clipDuration, sourceDuration: input.sourceDuration || sourceDuration };
      const visibleStart = Math.max(input.start, rangeStart);
      const visibleEnd = Math.min(input.start + clipDuration, rangeEnd);
      if (visibleEnd <= visibleStart) continue;
      const localStart = visibleStart - input.start;
      const localEnd = visibleEnd - input.start;
      const offset = getVisualSourceTime(mapping, localStart);
      const endOffset = Math.min(sourceStart + sourceDuration, getVisualSourceTime(mapping, localEnd));
      const trimmedSourceDuration = endOffset - offset;
      if (!(trimmedSourceDuration > 0)) continue;
      const hasCurve = input.speedCurve?.enabled === true && Array.isArray(input.speedCurve.points);
      const preservePitch = hasCurve || Math.abs(input.playbackRate - 1) > 0.0001;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = preservePitch ? createPitchPreservedAudioBuffer(context, input.decoded, {
        sourceOffset: offset,
        sourceDuration: trimmedSourceDuration,
        playbackRate: input.playbackRate,
        outputDuration: localEnd - localStart,
        sourceTimeAtOutputTime: hasCurve ? (time) => getVisualSourceTime(mapping, localStart + time) : null,
      }) : input.decoded;
      source.playbackRate.value = 1;
      const outputStart = visibleStart - rangeStart;
      scheduleAudioEnvelope(gain.gain, input, clipDuration, localStart, localEnd, outputStart);
      source.connect(gain);
      connectAudioSpatialEffect(context, gain, context.destination, input.spatialEffect, input.spatialAmount, { smooth: false });
      sources.push(source);
      source.start(outputStart, preservePitch ? 0 : offset, preservePitch ? localEnd - localStart : trimmedSourceDuration);
    }
    const rendered = await context.startRendering();
    throwIfExportAborted(signal);
    return rendered;
  } finally {
    signal?.removeEventListener("abort", stopSources);
    stopSources();
  }
}

export async function exportAudioMix({ format = "wav", audioBitsPerSecond = 192_000, onProgress, signal, ...options }) {
  throwIfExportAborted(signal);
  if (format !== "wav" && format !== "mp3") throw new Error("Unsupported audio export format");
  onProgress?.({ progress: 10, phaseKey: "audioExportMixing" });
  let rendered = await mixOfflineAudio({ ...options, signal });
  throwIfExportAborted(signal);
  // A silent selected range (or a visual-only project) is still a valid audio
  // export. Preserve its full duration rather than inventing an audible clip.
  if (!rendered) {
    const OfflineContextClass = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OfflineContextClass) throw new Error("Offline audio rendering is not supported");
    const context = new OfflineContextClass(2, Math.max(1, Math.round(nonnegative(options.duration) * 48_000)), 48_000);
    rendered = await context.startRendering();
    throwIfExportAborted(signal);
  }
  onProgress?.({ progress: 60, phaseKey: "audioExportEncoding" });
  const wav = encodeAudioBufferAsWav(rendered);
  throwIfExportAborted(signal);
  const blob = format === "mp3" ? await transcodeAudioToMp3(wav, {
    signal,
    audioBitsPerSecond,
    onProgress: (progress) => onProgress?.({ progress: 60 + Math.round(progress * 38), phaseKey: "audioExportEncoding" }),
  }) : wav;
  throwIfExportAborted(signal);
  onProgress?.({ progress: 99, phaseKey: "audioExportEncoding" });
  return { blob, extension: format, mimeType: blob.type };
}

export async function exportAudioClip({
  segment,
  blob = segment?.blob,
  volume = segment?.volume,
  spatialEffect = segment?.spatialEffect,
  spatialAmount = segment?.spatialAmount,
  format = "wav",
  audioBitsPerSecond = 192_000,
  signal,
  onProgress,
}) {
  if (!segment || !(nonnegative(segment.duration) > 0)) throw new Error("Audio clip duration must be positive");
  return exportAudioMix({
    duration: segment.duration,
    voiceAudioSegments: [{ ...segment, blob, start: 0, volume, spatialEffect, spatialAmount }],
    format,
    audioBitsPerSecond,
    signal,
    onProgress,
  });
}
