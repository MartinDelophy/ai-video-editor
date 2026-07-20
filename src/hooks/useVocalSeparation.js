import { useCallback, useState } from "react";
import { decodeWaveform, sliceAudioBlob } from "../lib/media.js";
import { separateVocals } from "../lib/vocalSeparation.js";

export function useVocalSeparation({ sourceAudioBlob, sourceAudioName, replaceAudio, replaceSourceAudio, replaceMusic, notify, t }) {
  const [job, setJob] = useState({ running: false, progress: 0, phase: "" });
  const run = useCallback(async () => {
    if (!sourceAudioBlob || job.running) return;
    setJob({ running: true, progress: 1, phase: t("vocalSeparationPreparing") });
    try {
      const result = await separateVocals(sourceAudioBlob, (progress, phase) => setJob({
        running: true,
        progress,
        phase: phase.key === "vocalSeparationProcessingChunk"
          ? t(phase.key).replace("{current}", phase.current).replace("{total}", phase.total)
          : t(phase.key),
      }));
      const [voiceMeta, musicMeta] = await Promise.all([decodeWaveform(result.vocals, 96), decodeWaveform(result.accompaniment, 96)]);
      const base = (sourceAudioName || "source-audio").replace(/\.[^.]+$/, "");
      replaceSourceAudio(result.vocals, voiceMeta.duration, voiceMeta.peaks, `${base}-${t("vocalStemFile")}.wav`, t("vocalStemPlaced"));
      replaceMusic(result.accompaniment, musicMeta.duration, musicMeta.peaks, `${base}-${t("instrumentalStemFile")}.wav`, t("instrumentalStemPlaced"));
      setJob({ running: false, progress: 100, phase: t("vocalSeparationComplete") }); notify(t("vocalSeparationComplete"));
    } catch (error) {
      console.error(error); setJob({ running: false, progress: 0, phase: "" });
      const reason = error.message === "VOCAL_RUNTIME_DOWNLOAD_FAILED"
        ? t("vocalSeparationRuntimeFailed")
        : error.message === "VOCAL_BACKEND_UNAVAILABLE"
          ? t("vocalSeparationBackendFailed")
          : t("vocalSeparationModelFailed");
      notify(`${t("vocalSeparationFailed")}：${reason}`);
    }
  }, [job.running, notify, replaceMusic, replaceSourceAudio, sourceAudioBlob, sourceAudioName, t]);
  const runClip = useCallback(async ({ blob, name, start = 0, sourceStart = 0, duration, segmentId = "", track }) => {
    if (!blob || job.running) return;
    setJob({ running: true, progress: 1, phase: t("vocalSeparationPreparing") });
    try {
      const clipBlob = Number.isFinite(duration) ? await sliceAudioBlob(blob, sourceStart, duration) : blob;
      const result = await separateVocals(clipBlob, (progress, phase) => setJob({
        running: true,
        progress,
        phase: phase.key === "vocalSeparationProcessingChunk"
          ? t(phase.key).replace("{current}", phase.current).replace("{total}", phase.total)
          : t(phase.key),
      }));
      const [voiceMeta, musicMeta] = await Promise.all([decodeWaveform(result.vocals, 96), decodeWaveform(result.accompaniment, 96)]);
      const base = (name || t("audioClipFile")).replace(/\.[^.]+$/, "");
      replaceAudio(result.vocals, voiceMeta.duration, voiceMeta.peaks, t("vocalStemPlaced"), {
        start,
        name: `${base}-${t("vocalStemFile")}.wav`,
        replaceSegmentId: track === "audio" ? segmentId : "",
      });
      replaceMusic(result.accompaniment, musicMeta.duration, musicMeta.peaks, `${base}-${t("instrumentalStemFile")}.wav`, t("instrumentalStemPlaced"), { start });
      setJob({ running: false, progress: 100, phase: t("vocalSeparationComplete") });
      notify(t("vocalSeparationComplete"));
    } catch (error) {
      console.error(error); setJob({ running: false, progress: 0, phase: "" });
      const reason = error.message === "VOCAL_RUNTIME_DOWNLOAD_FAILED"
        ? t("vocalSeparationRuntimeFailed")
        : error.message === "VOCAL_BACKEND_UNAVAILABLE"
          ? t("vocalSeparationBackendFailed")
          : t("vocalSeparationModelFailed");
      notify(`${t("vocalSeparationFailed")}：${reason}`);
    }
  }, [job.running, notify, replaceAudio, replaceMusic, t]);
  return { vocalSeparationJob: job, separateAudioClipVocals: runClip, separateSourceVocals: run };
}
