import { loadAnnaTtsCatalog, synthesizeAnnaSpeech } from "./annaAudio.js";
import { decodeWaveform } from "./media.js";
const check = signal => signal?.throwIfAborted();
export async function generateAnnaAgentNarration({ segments, voiceId, language, timelineStart, signal, onProgress, retainUrl }) {
  const catalog = await loadAnnaTtsCatalog(signal);
  const model = catalog.find(item => item.preferred) || catalog[0];
  if (!model || voiceId && !model.voices.some(voice => voice.id === voiceId)) throw Object.assign(new Error("Unavailable narration voice"), { code: "AI_UNAVAILABLE" });
  const voice = voiceId || model.defaultVoice || model.voices[0]?.id || "";
  const name = model.voices.find(item => item.id === voice)?.name || model.name;
  const assets = [], captions = [];
  try {
    for (let index = 0; index < segments.length; index++) {
      check(signal); const segment = segments[index];
      if (segment.text.length > model.maxChars) throw Object.assign(new Error("Narration text exceeds model limit"), { code: "INVALID_ARGUMENT" });
      const { blob } = await synthesizeAnnaSpeech({ text: segment.text, model: model.id, voice, language, signal });
      const decoded = await decodeWaveform(blob, 118); check(signal);
      if (!(decoded.duration > 0) || decoded.duration > segment.end - segment.start + 0.02) throw Object.assign(new Error("Narration exceeds its time slot"), { code: "AI_NARRATION_TOO_LONG" });
      const src = URL.createObjectURL(blob); retainUrl?.(src);
      assets.push({ id: `anna-narration-${crypto.randomUUID()}`, type: "audio", kind: "voiceover", name: `${name} · ${segment.text.slice(0, 32)}`, blob, src, duration: decoded.duration, sourceDuration: decoded.duration, peaks: decoded.peaks, generated: true });
      captions.push({ text: segment.text, start: timelineStart + segment.start, end: timelineStart + segment.start + decoded.duration });
      onProgress?.({ progress: (index + 1) / segments.length * 100 });
    }
    check(signal); return { assets, segments: captions };
  } catch (error) { for (const asset of assets) URL.revokeObjectURL(asset.src); throw error; }
}
