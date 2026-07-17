import { useCallback } from "react";
import { concatenateAudioBlobs, decodeWaveform, extractAudioFromVideo } from "../lib/media.js";

export function useSourceAudioExtraction(d) {
  return useCallback(async (asset, timelineStart = 0, options = {}) => {
    if (!asset?.blob) { d.clearSourceAudioTrack(null); d.notify("当前视频素材缺少原文件，无法分离原声"); return; }
    d.setStatus("generating"); d.setStatusText("加载 FFmpeg WASM 分离视频原声"); d.setProgress(12);
    try {
      const extractedBlob = await extractAudioFromVideo(asset.blob, asset.name); d.setStatusText("解析视频原声波形"); d.setProgress(78);
      const extracted = await decodeWaveform(extractedBlob, 96); if (!extracted.duration) throw new Error("视频没有可识别的音频轨");
      const shouldAppend = options.append === true && d.sourceAudioBlob instanceof Blob;
      const sourceAudioOffset = shouldAppend ? Math.max(0, Number(d.sourceAudioDuration) || 0) : 0;
      const blob = shouldAppend ? await concatenateAudioBlobs([d.sourceAudioBlob, extractedBlob]) : extractedBlob;
      const decoded = shouldAppend ? await decodeWaveform(blob, 192) : extracted;
      d.setVisualSegments((segments) => segments.map((segment) => segment.assetId === asset.id && segment.type === "video"
        ? { ...segment, sourceAudioOffset }
        : segment));
      const sourceName = shouldAppend ? "视频原声合集.wav" : `${asset.name.replace(/\.[^.]+$/, "")} 原声.wav`;
      d.replaceSourceAudio(blob, decoded.duration, decoded.peaks, sourceName, shouldAppend ? "视频原声已追加到时间线" : "视频原声已分离到时间线", timelineStart, shouldAppend ? "" : asset.id, { focusAudio: false });
    } catch (error) {
      console.warn(error); if (!(options.append === true && d.sourceAudioBlob)) d.clearSourceAudioTrack(null); d.setStatus("ready"); d.setStatusText("视频未检测到可分离原声");
      d.setProgress(0); d.notify("视频画面已添加，但没有可分离的原声音轨");
    }
  }, [d]);
}
