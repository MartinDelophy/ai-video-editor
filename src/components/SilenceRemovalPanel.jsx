import { CircleNotch, Play, Scissors } from "@phosphor-icons/react";
import "./SilenceRemovalPanel.css";

const time = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;

export function SilenceRemovalPanel({ t, tool }) {
  const { segment, supported, locked, settings, draft, stale, job, error } = tool;
  const selected = draft?.candidates.filter((cut) => cut.enabled) || [];
  const savings = selected.reduce((sum, cut) => sum + cut.end - cut.start, 0);
  const setup = ["pauseDownloading", "pauseStarting"].includes(job.phase);
  return <section className="pause-panel" aria-label={t("pauseTitle")}>
    <p className="pause-intro">{t("pauseIntro")}</p>
    {segment?.type === "video" ? <strong className="pause-clip" title={segment.name}>{segment.name || t("video")}</strong> : <p>{t("pauseSelect")}</p>}
    {segment?.preparing ? <p role="status">{t("timelineMediaPreparing")}</p>
      : segment?.type === "video" && !supported ? <p className="pause-notice">{t("pauseUnsupported")}</p> : null}
    {locked ? <p className="pause-notice">{t("pauseLocked")}</p> : null}
    <div className="pause-settings">
      {[["minimum", "pauseMinimum", 0.5, 5, 0.1], ["keep", "pauseKeep", 0.2, 0.6, 0.05]].map(([key, label, min, max, step]) =>
        <label key={key}><span>{t(label)}</span><output>{settings[key].toFixed(2)} s</output>
          <input type="range" min={min} max={max} step={step} value={settings[key]} disabled={job.running}
            onChange={(event) => tool.updateSettings({ [key]: Number(event.target.value) })} />
        </label>)}
    </div>
    <label className="pause-ripple"><input type="checkbox" checked={tool.rippleEditing} onChange={(event) => tool.setRippleEditing(event.target.checked)} />{t("pauseRipple")}</label>
    <p className="pause-note">{t(tool.rippleEditing ? "pauseRippleOn" : "pauseRippleOff")}</p>
    <button type="button" className={job.running ? "panel-secondary" : "panel-primary"} disabled={!job.running && (!supported || locked)} onClick={job.running ? tool.cancel : tool.run}>
      {job.running ? <CircleNotch size={16} className="pause-spinner" /> : <Scissors size={16} />} {t(job.running ? "pauseCancel" : "pauseAnalyze")}
    </button>
    {job.running ? <div className="pause-progress" role="status"><span>{t(job.phase)}</span>{!setup ? <output>{Math.round(job.progress * 100)}%</output> : null}<progress max="1" {...(!setup ? { value: job.progress } : {})} /></div> : null}
    {stale ? <p className="pause-notice" role="status">{t("pauseStale")}</p> : null}
    {error ? <p className="pause-notice" role="alert">{t(error)}</p> : null}
    {draft && !stale ? <div className="pause-review">
      {draft.candidates.length ? <>
        <strong aria-live="polite">{t("pauseSummary").replace("{count}", selected.length).replace("{seconds}", savings.toFixed(2))}</strong>
        <div className="pause-ranges">{draft.candidates.map((cut) => <div className="pause-range" key={cut.id}>
          <label><input type="checkbox" checked={cut.enabled} onChange={() => tool.toggle(cut.id)} /><span>{time(draft.start + cut.start)} – {time(draft.start + cut.end)}<small>−{(cut.end - cut.start).toFixed(2)} s</small></span></label>
          <button type="button" aria-label={`${t("pausePreview")} ${time(draft.start + cut.start)}`} title={t("pausePreview")} onClick={() => tool.preview(cut)}><Play size={15} /></button>
        </div>)}</div>
        <button type="button" className="panel-primary" disabled={!selected.length || locked} onClick={tool.apply}><Scissors size={16} />{t("pauseApply")}</button>
      </> : <p role="status">{t("pauseEmpty")}</p>}
    </div> : null}
    <small className="pause-note">{t("pauseLocal")}</small>
  </section>;
}
