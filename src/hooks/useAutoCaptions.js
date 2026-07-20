import { useCallback } from "react";
import { transcribeAudioToCaptionSegments } from "../lib/asr.js";
import { sliceAudioBlob } from "../lib/media.js";

export function localizeAutoCaptionPhase(phase, t) {
  const text = String(phase || "");
  const format = (key, fallback, values = {}) => Object.entries(values).reduce(
    (result, [name, value]) => result.replace(`{${name}}`, value),
    t(key, fallback),
  );
  if (text.includes("下载或读取") && text.includes("Whisper")) return t("asrDownloadingModel", text);
  if (text.includes("识别音频语言")) return t("asrDetectingLanguage", text);
  if (text.includes("初始化 WebGPU")) return t("asrInitializingWebGpu", text);
  if (text.includes("初始化 WASM")) return t("asrInitializingWasm", text);
  if (text.includes("WebGPU 初始化失败")) return t("asrFallingBackWasm", text);
  if (text.includes("解码原声音频")) return t("asrDecodingAudio", text);
  if (text.includes("Worker 不可用")) return t("asrWorkerFallback", text);
  if (text.includes("Worker 结果异常")) return t("asrRetryingWasm", text);
  if (text.includes("写入字幕轨道")) return t("asrWritingCaptions", text);
  const languageMatch = text.match(/(?:检测为|按)\s+(.+?)\s+转写字幕/);
  if (languageMatch) return format("asrTranscribingLanguage", text, { language: languageMatch[1] });
  return text;
}

export function useAutoCaptions(d) {
  return useCallback(async (options = {}) => {
    const inputBlob = options.blob ?? d.sourceAudioBlob;
    const timelineOffset = Number.isFinite(options.start) ? options.start : d.sourceAudioStart;
    if (d.status === "generating" || d.status === "captioning") return;
    if (d.trackLocks.caption) return void d.notify(d.t("captionTrackLocked"));
    if (!inputBlob) return void d.notify(d.t("autoCaptionsNeedsSource"));
    d.setStatus("captioning"); d.setStatusText(d.t("autoCaptionsPreparing")); d.setProgress(4); d.setActiveTool("audio");
    try {
      const clipBlob = Number.isFinite(options.duration)
        ? await sliceAudioBlob(inputBlob, options.sourceStart || 0, options.duration)
        : inputBlob;
      const result = await transcribeAudioToCaptionSegments(clipBlob, {
        preferredLanguage: d.uiLanguage, timelineOffset,
        onProgress: ({ progress, phase }) => { d.setProgress((current) => Math.max(current, progress)); d.setStatusText(localizeAutoCaptionPhase(phase, d.t)); },
      });
      d.setCaptionSegments((segments) => options.append
        ? [...segments, ...result.segments].sort((a, b) => (a.start || 0) - (b.start || 0))
        : result.segments);
      d.setScript((script) => options.append && script ? `${script}\n${result.text}` : result.text);
      d.setSelectedSegmentId(result.segments[0]?.id ?? ""); d.setSelectedTrack("caption"); d.setActiveTool("caption");
      d.setCaptionsEnabled(true); d.setTrackVisibility((visibility) => ({ ...visibility, caption: true }));
      const complete = d.t("autoCaptionsComplete").replace("{count}", result.segments.length);
      d.setStatus("done"); d.setStatusText(complete); d.setProgress(100);
      d.seekTo(result.segments[0]?.start ?? timelineOffset); d.notify(complete);
    } catch (error) {
      console.error(error); d.setStatus("error"); d.setStatusText(error instanceof Error ? error.message : d.t("autoCaptionsFailed"));
      d.setProgress(0); d.notify(d.t("autoCaptionsFailedHint"));
    }
  }, [d]);
}
