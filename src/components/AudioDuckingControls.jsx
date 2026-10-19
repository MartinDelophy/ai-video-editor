import { CircleNotch, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { normalizeAutoDuck, getDuckingStatus, subscribeDucking } from "../lib/audioDucking.js";
import { getDuckingCopy, getDuckingPhaseCopy } from "../i18nAudioDucking.js";
export function AudioDuckingControls({ segment, language, disabled, onChange }) {
  const copy = getDuckingCopy(language),
    value = normalizeAutoDuck(segment.autoDuck);
  const job = useSyncExternalStore(subscribeDucking, () => getDuckingStatus(segment.id));
  const phaseCopy = getDuckingPhaseCopy(language);
  const busy = job.status === "idle" || job.status === "analyzing";
  const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
  const statusText = busy
    ? ["pauseDownloading", "pauseStarting"].includes(job.phase)
      ? phaseCopy.loading
      : job.phase === "pauseDecoding"
        ? phaseCopy.decoding
        : copy.analyzing
    : job.status === "ready" && job.points?.every(([, gain]) => gain >= 0.999)
      ? phaseCopy.noSpeech
      : copy[job.status];
  return (
    <section className="audio-ducking-controls">
      <label className="audio-ducking-toggle">
        <b>{copy.title}</b>
        <input
          type="checkbox"
          role="switch"
          checked={value.enabled}
          disabled={disabled}
          onChange={(event) => onChange({ autoDuck: { ...value, enabled: event.target.checked } })}
        />
      </label>
      <p>
        {language === "zh" && segment.track !== "music"
          ? "其他轨道说话时压低本段音量，停顿后恢复。"
          : copy.hint}
      </p>
      {value.enabled && (
        <>
          <label className="audio-property-row">
            <span>{copy.strength}</span>
            <select
              value={value.strength}
              disabled={disabled}
              onChange={(event) =>
                onChange({ autoDuck: { ...value, strength: event.target.value } })
              }
            >
              {["gentle", "natural", "strong"].map((key) => (
                <option key={key} value={key}>
                  {copy[key]}
                </option>
              ))}
            </select>
          </label>
          <div
            className={`audio-ducking-status ${busy ? "is-busy" : ""} is-${job.status}`}
            role="status"
            aria-live="polite"
            aria-busy={busy}
          >
            {busy ? (
              <CircleNotch size={18} className="spin" aria-hidden="true" />
            ) : job.status === "error" ? (
              <WarningCircle size={18} aria-hidden="true" />
            ) : (
              <CheckCircle size={18} aria-hidden="true" />
            )}
            <span>{statusText}</span>
            {busy ? <b>{progress}%</b> : null}
            {busy ? (
              <div
                className={`audio-ducking-progress ${progress === 0 ? "is-indeterminate" : ""}`}
                role="progressbar"
                aria-label={statusText}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <i style={{ width: progress > 0 ? `${progress}%` : "30%" }} />
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
