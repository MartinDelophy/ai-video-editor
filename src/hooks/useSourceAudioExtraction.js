import { useCallback } from "react";
import { concatenateAudioBlobs, decodeWaveform, extractAudioFromVideo } from "../lib/media.js";
import { attachSourceAudioOffset, getSourceAudioAssetId } from "../lib/sourceAudioSync.js";

export function useSourceAudioExtraction(d) {
  return useCallback(async (asset, timelineStart = 0, options = {}) => {
    if (!asset?.blob) { d.notify("当前视频素材缺少原文件，无法分离原声"); return false; }
    d.setStatus("generating"); d.setStatusText(asset.compatibilityAudioBlob ? d.t("mediaCompatibilityProcessing") : "加载 FFmpeg WASM 分离视频原声"); d.setProgress(12);
    try {
      const extractedBlob = asset.compatibilityAudioBlob instanceof Blob ? asset.compatibilityAudioBlob : await extractAudioFromVideo(asset.blob, asset.name);
      d.setStatusText("解析视频原声波形"); d.setProgress(78);
      const extracted = await decodeWaveform(extractedBlob, 96); if (!extracted.duration) throw new Error("视频没有可识别的音频轨");
      if (options.destination === "audio") {
        const playbackRate = Math.max(0.25, Math.min(4, Number(asset.playbackRate) || 1));
        const sourceStart = Math.max(0, Number(asset.sourceStart) || 0);
        const timelineDuration = Math.min(
          Math.max(0, Number(asset.duration) || 0),
          asset.speedCurve?.enabled ? asset.duration : Math.max(0, (extracted.duration - sourceStart) / playbackRate),
        );
        if (!(timelineDuration > 0)) throw new Error("画中画片段没有可分离的音频区间");
        const sourceName = `${asset.name.replace(/\.[^.]+$/, "")} 原声.wav`;
        const audioSegment = d.replaceAudio(extractedBlob, extracted.duration, extracted.peaks, "画中画原声已分离", {
          assetId: getSourceAudioAssetId(asset),
          name: sourceName,
          playbackRate,
          volume: asset.volume ?? 1,
          speedCurve: asset.speedCurve,
          sourceDuration: asset.sourceDuration,
          sourceKind: "overlay-video-audio",
          sourceStart,
          start: timelineStart,
          timelineDuration,
        });
        d.setVisualOverlaySegments?.((segments) => segments.map((segment) => (
          segment.id === asset.id ? { ...segment, muted: true, audioSeparated: true } : segment
        )));
        d.notify("画中画原声已分离到音频轨");
        return { track: "audio", segmentId: audioSegment.id };
      }
      const shouldAppend = options.append === true && d.sourceAudioBlob instanceof Blob;
      const sourceAudioOffset = shouldAppend ? Math.max(0, Number(d.sourceAudioDuration) || 0) : 0;
      const sourceAudioAssetId = getSourceAudioAssetId(asset);
      const blob = shouldAppend ? await concatenateAudioBlobs([d.sourceAudioBlob, extractedBlob]) : extractedBlob;
      const decoded = shouldAppend ? await decodeWaveform(blob, 192) : extracted;
      d.setVisualSegments((segments) => attachSourceAudioOffset(segments, asset, sourceAudioOffset));
      const sourceName = shouldAppend ? "视频原声合集.wav" : `${asset.name.replace(/\.[^.]+$/, "")} 原声.wav`;
      d.replaceSourceAudio(blob, decoded.duration, decoded.peaks, sourceName, shouldAppend ? "视频原声已追加到时间线" : "视频原声已分离到时间线", timelineStart, shouldAppend ? "" : sourceAudioAssetId, { focusAudio: false });
      return { track: "source", segmentId: asset.id };
    } catch (error) {
      console.warn(error); d.setStatus("ready"); d.setStatusText("视频未检测到可分离原声");
      d.setProgress(0); d.notify("视频画面已添加，但没有可分离的原声音轨");
      return false;
    }
  }, [d]);
}
