import { useCallback } from "react";
import { MODEL_ID } from "../config/editor.js";
import { clearPiperCacheIfStorageTight, isPiperSymbolError, isStorageQuotaError, prepareTextForVoice, TtsInputError } from "../lib/ttsText.js";

export function useVoiceGeneration(d) {
  return useCallback(async () => {
    const rawText = d.script.trim();
    if (!rawText || d.status === "generating" || d.status === "captioning") return;
    let prepared;
    try { prepared = prepareTextForVoice(rawText, d.selectedVoice); }
    catch (error) {
      const message = error instanceof TtsInputError ? d.t(error.code) : error instanceof Error ? error.message : d.t("ttsErrorVoiceMismatch");
      d.setStatus("error"); d.setStatusText(message); d.setProgress(0); d.notify(message); return;
    }
    d.setVoiceTab("synthesis"); d.setStatus("generating"); d.setStatusText(d.t("ttsStatusPreparingModel")); d.setProgress(6);
    if (prepared.warningKey) d.notify(d.t(prepared.warningKey));
    try {
      let blob;
      if (d.selectedVoice.engine === "piper") {
        const tts = await import("@diffusionstudio/vits-web");
        if (await clearPiperCacheIfStorageTight(tts)) d.notify(d.t("ttsNoticePiperCacheCleared"));
        d.setStatusText(d.t("ttsStatusLoadingChineseModel"));
        const progress = (event) => { if (event?.total) d.setProgress((current) => Math.max(current, Math.min(88, Math.max(12, Math.round((event.loaded / event.total) * 76))))); };
        const input = { text: prepared.text, voiceId: d.selectedVoice.id };
        try { blob = await tts.predict(input, progress); }
        catch (error) {
          if (!isStorageQuotaError(error)) throw error;
          d.setStatusText(d.t("ttsStatusClearingCache")); await tts.flush?.(); blob = await tts.predict(input, progress);
        }
      } else {
        const { KokoroTTS } = await import("kokoro-js"); d.setStatusText(d.t("ttsStatusLoadingKokoro"));
        const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "wasm",
          progress_callback: (event) => { if (event?.progress) d.setProgress((current) => Math.max(current, Math.min(86, Math.max(10, Math.round(event.progress))))); } });
        d.setStatusText(d.t("ttsStatusGeneratingEnglish"));
        blob = (await tts.generate(prepared.text, { voice: d.selectedVoice.id, speed: d.speed })).toBlob();
      }
      d.setStatusText(d.t("ttsStatusDecodingWaveform"));
      await d.commitAudio(blob, `${d.selectedVoice.name} · ${d.t("ttsGenerated")}`); d.notify(d.t("ttsNoticeGenerated"));
    } catch (error) {
      console.error(error);
      const message = error instanceof TtsInputError ? d.t(error.code)
        : d.selectedVoice.engine === "piper" && isPiperSymbolError(error) ? d.t("ttsErrorUnsupportedPiperSymbols")
          : isStorageQuotaError(error) ? d.t("ttsErrorStorageQuota") : error instanceof Error ? error.message : d.t("ttsErrorGenerationFailed");
      d.setStatus("error"); d.setStatusText(message); d.setProgress(0); d.notify(message);
    }
  }, [d]);
}
