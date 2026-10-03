import { VOICES } from "../config/editor.js";
import { synthesizeBaseVoice } from "./baseVoiceSynthesis.js";
import { cancelHojoVoiceGeneration } from "./hojoTtsRuntime.js";
import { decodeWaveform } from "./media.js";

const check = signal => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
// Generate receipt-owned media; the shared edit reducer alone inserts it.
export async function generateAgentNarration({ segments, voiceId, timelineStart, signal, onProgress, retainUrl }) {
  const voice = VOICES.find(item => item.id === (voiceId || "zh_f_qinglan") && item.engine === "hojo");
  if (!voice) throw Object.assign(new Error("Unsupported narration voice"), { code: "INVALID_ARGUMENT" });
  const assets = [], captions = [];
  const abort = () => cancelHojoVoiceGeneration();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (let index = 0; index < segments.length; index++) {
      check(signal);
      const segment = segments[index];
      const { blob } = await synthesizeBaseVoice({ voice, text: segment.text, speed: 1,
        onProgress: progress => onProgress?.({ progress: (index + progress / 100) / segments.length * 95 }) });
      check(signal);
      const decoded = await decodeWaveform(blob, 118);
      check(signal);
      // Never truncate speech or silently extend the selected picture.
      if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > segment.end - segment.start + 0.02) {
        throw Object.assign(new Error("Narration exceeds its time slot; shorten the text and retry"), { code: "AI_NARRATION_TOO_LONG" });
      }
      const src = URL.createObjectURL(blob); retainUrl?.(src);
      const id = `agent-narration-${crypto.randomUUID()}`;
      assets.push({ id, type: "audio", name: `${voice.name} · ${segment.text.slice(0, 32)}`, blob, src,
        duration: decoded.duration, sourceDuration: decoded.duration, peaks: decoded.peaks,
        start: timelineStart + segment.start, generated: true });
      captions.push({ text: segment.text, start: timelineStart + segment.start, end: timelineStart + segment.start + decoded.duration });
    }
    check(signal); onProgress?.({ progress: 100 });
    return { assets, segments: captions };
  } catch (error) {
    for (const asset of assets) URL.revokeObjectURL(asset.src);
    throw error;
  } finally { signal?.removeEventListener("abort", abort); }
}
