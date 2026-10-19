import { isAnnaEdition } from "./annaRuntime.js";
import { normalizeAudioProcessing } from "./audioProcessingDsp.js";
import { supportsFileSpeech } from "./browserFileSpeech.js";
import { CHATCUT_SPEECH_LANGUAGES } from "../hooks/useChatCutSpeech.js";

export async function processTimelineAi({ kind, clip, timelineStart, language, targetLanguage, regions, minimum, keep, segments, voiceId, settings, signal, onProgress, audioContext, retainUrl }) {
    if (kind === "audio-processing") {
      const { processAudioClip } = await import("./audioProcessing.js");
      const previous = normalizeAudioProcessing(clip.audioProcessing);
      const merged = { ...previous, ...settings };
      for (const key of ["eq", "compressor", "loudness", "limiter"]) merged[key] = { ...previous[key], ...settings[key] };
      const result = await processAudioClip(clip, merged, { language, signal, onProgress: value => onProgress?.({ ...value, progress: (value.progress || 0) * 100 }) });
      signal?.throwIfAborted();
      const src = URL.createObjectURL(result.blob); retainUrl?.(src);
      return { asset: { id: `processed-audio-${crypto.randomUUID()}`, type: "audio", name: clip.name || "audio", blob: result.blob, src, duration: clip.duration, sourceDuration: result.sourceDuration, peaks: result.peaks, audioProcessing: result.settings, processingOriginal: { sourceStart: result.originalSourceStart, sourceDuration: result.sourceDuration } } };
    }
    if (kind === "narration") {
      if (isAnnaEdition) {
        const { generateAnnaAgentNarration } = await import("./annaAgentNarration.js");
        return generateAnnaAgentNarration({ segments, voiceId, language, timelineStart, signal, onProgress, retainUrl });
      }
      const { generateAgentNarration } = await import("./agentNarration.js");
      return generateAgentNarration({ segments, voiceId, clip, timelineStart, signal, onProgress, retainUrl });
    }
    if (kind === "pauses") {
      const [{ analyzeVideoPauses }, { findPauseCandidates }] = await Promise.all([import("./sileroVad.js"), import("./silenceRemoval.js")]);
      const probabilities = await analyzeVideoPauses(clip, { language, signal, onProgress: (progress, phase) => onProgress({ progress: progress * 100, phase }) });
      return { candidates: findPauseCandidates(probabilities, clip, { minimum, keep }) };
    }
    if (kind === "captions") {
      if (!supportsFileSpeech() || audioContext?.state !== "running") throw Object.assign(new Error("Browser file speech unavailable"), { code: "AI_UNAVAILABLE" });
      let translator;
      try {
        if (targetLanguage) {
          if (!window.Translator || await window.Translator.availability({ sourceLanguage: language, targetLanguage }) !== "available") throw Object.assign(new Error("Translation model is not ready"), { code: "AI_UNAVAILABLE" });
          translator = await window.Translator.create({ sourceLanguage: language, targetLanguage });
        }
        const { generateBrowserCaptionSegments } = await import("./browserCaptionGeneration.js");
        const segments = await generateBrowserCaptionSegments(clip.blob, { clip, language: CHATCUT_SPEECH_LANGUAGES[language], offset: timelineStart, signal, context: audioContext, translator, onProgress: value => onProgress({ progress: value * 100 }) });
        return { segments };
      } finally { translator?.destroy(); }
    }
    const { repairMiganClip } = await import("./miganClipRepair.js");
    const result = await repairMiganClip({ segment: clip, regions, minimum, keep, signal, onProgress });
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const src = URL.createObjectURL(result.blob); retainUrl?.(src);
    return { asset: { id: `agent-repair-${crypto.randomUUID()}`, type: "video", name: `${clip.name || "video"}-repaired.mp4`, blob: result.blob, src, width: result.width, height: result.height, duration: result.sourceDuration, sourceDuration: result.sourceDuration, trackFrames: [] } };
  }
