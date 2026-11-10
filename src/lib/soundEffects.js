import { getRecordedSoundLabel, getSoundCategoryLabel, getSoundEffectsCopy } from "../i18nSoundEffects.js";
import { encodeAudioBufferAsWav, getAudioWaveformPeaks } from "./media.js";
import { RECORDED_SOUND_EFFECTS } from "./soundEffectsCatalog.js";
import { SOUND_EFFECTS, SOUND_EFFECT_SAMPLE_RATE, synthesizeSoundEffect } from "./synthesizeSoundEffect.js";
import { packTimedSegmentsIntoLanes } from "./timeline.js";
import { getMemoryVortexCuts, MEMORY_VORTEX_INTRO } from "./projectedBeatTemplates.js";

const audioCache = new Map();
const originalCategories = ["transition", "transition", "impact", "impact", "foley", "foley", "interface", "interface"];

function getPreviewPeaks(peaks) {
  return Array.from({ length: 24 }, (_, bar) => {
    const from = Math.floor(bar * peaks.length / 24);
    const to = Math.floor((bar + 1) * peaks.length / 24);
    return Math.max(...peaks.slice(from, to));
  });
}

function soundEffectAsset(index, copy) {
  const { id, duration } = SOUND_EFFECTS[index];
  if (!audioCache.has(id)) {
    const samples = synthesizeSoundEffect(index);
    const peaks = getAudioWaveformPeaks(samples, duration);
    const previewPeaks = getPreviewPeaks(peaks);
    const blob = encodeAudioBufferAsWav({
      length: samples.length, sampleRate: SOUND_EFFECT_SAMPLE_RATE, numberOfChannels: 1, getChannelData: () => samples,
    });
    audioCache.set(id, { id: `sfx-${id}`, type: "audio", kind: "sound-effect", duration, peaks, previewPeaks, blob });
  }
  return { ...audioCache.get(id), name: copy.names[index], category: originalCategories[index] };
}

export function getSoundEffectAssets(language) {
  const copy = getSoundEffectsCopy(language);
  const english = getSoundEffectsCopy("en");
  const originals = SOUND_EFFECTS.map((_, index) => ({
    ...soundEffectAsset(index, copy),
    keywords: `${english.names[index]} ${copy.categories[Math.floor(index / 2)]}`,
  }));
  const recordings = RECORDED_SOUND_EFFECTS.map(([id, category, key, variant, duration, waveform]) => {
    const label = getRecordedSoundLabel(language, key);
    const peaks = Array.from(waveform, (digit) => Number.parseInt(digit, 16) / 15);
    const spokenEnglish = category === "voice" && /^[AB]$/.test(variant);
    return {
      id: `sfx-${id}`, type: "audio", kind: "sound-effect", category, duration, peaks,
      name: variant ? `${label} · ${variant}` : label,
      src: `/assets/sound-effects/${id}.mp3`,
      previewPeaks: getPreviewPeaks(peaks),
      keywords: `${getRecordedSoundLabel("en", key)} ${spokenEnglish ? "English 英语" : ""}`,
    };
  });
  return [...originals, ...recordings].map((asset) => ({
    ...asset, categoryLabel: getSoundCategoryLabel(language, asset.category),
  }));
}

export function getSoundEffectLane(segments, { start, duration }, locks, visibility) {
  const lanes = packTimedSegmentsIntoLanes(segments, { preferredLaneKey: "lane" });
  const available = (index) => !locks?.[`audio-${index}`] && visibility?.[`audio-${index}`] !== false
    && (lanes[index] || []).every((clip) => clip.start + clip.duration <= start + 0.001 || start + duration <= clip.start + 0.001);
  let lane = 0;
  while (!available(lane)) lane++;
  return lane;
}

export function getMemoryVortexSoundEffects({ bpm, defaultBpm, start, duration, language }) {
  const factor = defaultBpm / bpm / 30;
  const copy = getSoundEffectsCopy(language);
  const cuts = getMemoryVortexCuts();
  const cues = [
    [4, 10, 0.24],
    [1, MEMORY_VORTEX_INTRO - Math.round(0.68 / factor), 0.46],
    [2, MEMORY_VORTEX_INTRO, 0.70],
    [3, cuts[4].from, 0.36],
    [0, cuts[8].from - Math.round(0.25 / factor), 0.32],
    [3, cuts[8].from, 0.43],
  ];
  return cues.map(([index, frame, volume]) => {
    const asset = soundEffectAsset(index, copy);
    const offset = Math.max(0, frame * factor);
    const clipDuration = Math.min(asset.duration, duration - offset);
    return {
      id: crypto.randomUUID(), blob: asset.blob, assetId: asset.id, name: asset.name,
      start: start + offset, duration: clipDuration, sourceStart: 0, sourceDuration: clipDuration,
      playbackRate: 1, volume, fadeIn: 0, fadeOut: 0, peaks: asset.peaks, sourceKind: "sound-effect",
    };
  });
}
