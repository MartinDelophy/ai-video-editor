import { useEffect, useRef, useState } from "react";
import { exportAudioClip } from "../lib/audioExport.js";
import { isExportAbortError, throwIfExportAborted } from "../lib/exportCancellation.js";
import { sanitizeExportFileName } from "../lib/exportSettings.js";
import { ExportSelect } from "./ExportSelect.jsx";

export function AudioClipExportControl({ segment, t, downloadBlob, children }) {
  const [format, setFormat] = useState("wav");
  const [bitrate, setBitrate] = useState(192_000);
  const [job, setJob] = useState(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    setJob(null);
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [segment.id]);

  const runExport = async () => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setJob({ state: "running", phaseKey: "audioExportMixing" });
    try {
      const result = await exportAudioClip({
        segment,
        format,
        audioBitsPerSecond: bitrate,
        signal: controller.signal,
        onProgress: ({ phaseKey }) => {
          if (controllerRef.current === controller && !controller.signal.aborted) {
            setJob({ state: "running", phaseKey });
          }
        },
      });
      throwIfExportAborted(controller.signal);
      downloadBlob(result.blob, `${sanitizeExportFileName(segment.name, "audio-clip")}.${result.extension}`);
      if (controllerRef.current === controller) setJob(null);
    } catch (error) {
      if (controllerRef.current === controller) {
        if (isExportAbortError(error)) setJob(null);
        else {
          console.error("Audio clip export failed", error);
          setJob({ state: "error", phaseKey: "audioExportFailed" });
        }
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };
  const running = job?.state === "running";

  return <div className="audio-clip-export">
    <ExportSelect label={t("audioExportFormat")} value={format} disabled={running} onChange={(event) => setFormat(event.target.value)}>
      <option value="wav">WAV</option>
      <option value="mp3">MP3</option>
    </ExportSelect>
    {format === "mp3" ? <ExportSelect label={t("exportAudioBitrate")} value={bitrate} disabled={running} onChange={(event) => setBitrate(Number(event.target.value))}>
      {[128_000, 192_000, 256_000, 320_000].map((value) => <option key={value} value={value}>{value / 1000} kbps</option>)}
    </ExportSelect> : null}
    <p className="audio-clip-export-hint">{t("audioExportClipHint")}</p>
    <div className="audio-context-actions">
      <button className="panel-secondary" type="button" disabled={!segment.blob || segment.reversing || !(segment.duration > 0)} onClick={running ? () => controllerRef.current?.abort() : runExport}>
        {t(running ? "audioExportCancel" : "downloadAudioClip")}
      </button>
      {children}
    </div>
    {running || job?.state === "error" ? <p className="audio-clip-export-status" role={job.state === "error" ? "alert" : "status"}>{t(job.phaseKey || "audioExportMixing")}</p> : null}
  </div>;
}
