import { useCallback } from "react";
import { transcribeAudioToCaptionSegments } from "../lib/asr.js";

export function useAutoCaptions(d) {
  return useCallback(async () => {
    if (d.status === "generating" || d.status === "captioning") return;
    if (d.trackLocks.caption) return void d.notify("字幕轨已锁定，无法生成自动字幕");
    if (!d.sourceAudioBlob) return void d.notify("请先上传视频或把音频拖到原声轨");
    d.setStatus("captioning"); d.setStatusText("准备自动字幕模型"); d.setProgress(4); d.setActiveTool("audio");
    try {
      const result = await transcribeAudioToCaptionSegments(d.sourceAudioBlob, {
        preferredLanguage: d.uiLanguage, timelineOffset: d.sourceAudioStart,
        onProgress: ({ progress, phase }) => { d.setProgress((current) => Math.max(current, progress)); d.setStatusText(phase); },
      });
      d.setCaptionSegments(result.segments); d.setScript(result.text);
      d.setSelectedSegmentId(result.segments[0]?.id ?? ""); d.setSelectedTrack("caption"); d.setActiveTool("caption");
      d.setCaptionsEnabled(true); d.setTrackVisibility((visibility) => ({ ...visibility, caption: true }));
      d.setStatus("done"); d.setStatusText(`已生成 ${result.segments.length} 条自动字幕`); d.setProgress(100);
      d.seekTo(result.segments[0]?.start ?? 0); d.notify(`已生成 ${result.segments.length} 条自动字幕`);
    } catch (error) {
      console.error(error); d.setStatus("error"); d.setStatusText(error instanceof Error ? error.message : "自动字幕生成失败");
      d.setProgress(0); d.notify("自动字幕生成失败，请换一段有清晰人声的音频试试");
    }
  }, [d]);
}
