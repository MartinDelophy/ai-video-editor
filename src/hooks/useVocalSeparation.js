import { useCallback, useState } from "react";
import { decodeWaveform, extractAudioFromVideo, sliceAudioBlob } from "../lib/media.js";
import { loadProjectMediaBlob } from "../lib/projectSnapshot.js";
import { separateVocals } from "../lib/vocalSeparation.js";

export function useVocalSeparation({ replaceAudio, replaceMusic, notify, t }) {
  const [job, setJob] = useState({ running: false, progress: 0, phase: "" });
  const runClip = useCallback(async (clip, onStemsPlaced) => {
    const { blob, name, start = 0, sourceStart = 0, duration, segmentId = "", track } = clip;
    const video = track === "image" || track === "overlay";
    const renderClip = video || track === "source";
    if ((!blob && !video) || job.running) return;
    setJob({ running: true, progress: 1, phase: t("vocalSeparationPreparing") });
    try {
      let clipBlob = blob;
      if (renderClip) {
        let audioBlob = blob;
        if (video) {
          audioBlob = clip.compatibilityAudioBlob || clip.projectMedia?.bindings?.compatibilityAudioBlob
            ? await loadProjectMediaBlob(clip, "compatibilityAudioBlob")
            : await extractAudioFromVideo(await loadProjectMediaBlob(clip), name);
        }
        const { exportAudioClip } = await import("../lib/audioExport.js");
        ({ blob: clipBlob } = await exportAudioClip({
          segment: { ...clip, sourceAudioDisabled: false, muted: false },
          blob: audioBlob,
          volume: 1,
        }));
      } else if (Number.isFinite(duration)) {
        clipBlob = await sliceAudioBlob(blob, sourceStart, duration);
      }
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
        sourceKind: "separated",
        replaceSegmentId: track === "audio" ? segmentId : "",
      });
      const instrumentalName = `${base}-${t("instrumentalStemFile")}.wav`;
      if (renderClip) {
        replaceAudio(result.accompaniment, musicMeta.duration, musicMeta.peaks, t("instrumentalStemPlaced"), {
          start, name: instrumentalName, sourceKind: "separated",
        });
        onStemsPlaced?.();
      } else {
        replaceMusic(result.accompaniment, musicMeta.duration, musicMeta.peaks, instrumentalName, t("instrumentalStemPlaced"), { start });
      }
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
  return { vocalSeparationJob: job, separateAudioClipVocals: runClip };
}
