import { useCallback } from "react";
import { decodeWaveform, extractAudioFromVideo } from "../lib/media.js";

export function useSourceAudioExtraction(d) {
  return useCallback(async (asset, timelineStart = 0) => {
    if (!asset?.blob) { d.clearSourceAudioTrack(null); d.notify("当前视频素材缺少原文件，无法分离原声"); return; }
    d.setStatus("generating"); d.setStatusText("加载 FFmpeg WASM 分离视频原声"); d.setProgress(12);
    try {
      const blob = await extractAudioFromVideo(asset.blob, asset.name); d.setStatusText("解析视频原声波形"); d.setProgress(78);
      const decoded = await decodeWaveform(blob, 96); if (!decoded.duration) throw new Error("视频没有可识别的音频轨");
      d.replaceSourceAudio(blob, decoded.duration, decoded.peaks, `${asset.name.replace(/\.[^.]+$/, "")} 原声.wav`, "视频原声已分离到时间线", timelineStart);
    } catch (error) {
      console.warn(error); d.clearSourceAudioTrack(null); d.setStatus("ready"); d.setStatusText("视频未检测到可分离原声");
      d.setProgress(0); d.notify("视频画面已添加，但没有可分离的原声音轨");
    }
  }, [d]);
}
