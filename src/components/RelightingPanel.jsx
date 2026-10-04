import { useEffect, useState } from "react";
import { ArrowCounterClockwise, CheckCircle, CircleNotch, Eye, Sun } from "@phosphor-icons/react";
import { getDepthAnalysisSignature, normalizeCinematicDepth } from "../lib/depthOfField.js";
import { RelightSphere } from "./RelightSphere.jsx";
import { DEFAULT_RELIGHT, setRelightCompare } from "../lib/videoRelighting.js";

export function RelightingPanel({ t, segment, analysis, job, onAnalyze, onCancel, onChange }) {
  const effect = normalizeCinematicDepth(segment?.cinematicDepth);
  const light = effect.relight;
  const ready = analysis?.complete === true && (!analysis.signature || analysis.signature === getDepthAnalysisSignature(segment, effect.quality));
  const running = Boolean(job?.running);
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    const release = () => { setRelightCompare(null); setHolding(false); };
    window.addEventListener("blur", release);
    const visibility = () => { if (document.hidden) release(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", visibility); setRelightCompare(null); };
  }, [segment?.id]);
  const update = (patch) => onChange?.({ ...effect, output: "relight", enabled: ready && !running, relight: { ...light, ...patch } });
  const compare = (pressed) => { setHolding(pressed); setRelightCompare(pressed ? segment?.id : null); };
  return <div className="relight-panel"><div className="relight-scroll">
    <label className="relight-enable"><Sun size={19} /><strong>{t("relightEnable")}</strong><input type="checkbox" checked={effect.enabled && effect.output === "relight"} disabled={!ready || running} onChange={(event) => onChange?.({ ...effect, output: "relight", enabled: event.target.checked })} /></label>
    <div className="relight-status"><span>{ready ? <CheckCircle size={16} weight="fill" /> : <CircleNotch size={16} className={running ? "is-spinning" : ""} />}{t(ready ? "relightReady" : "depthAnalysisNeeded")}</span>{ready && !running ? <button type="button" onClick={() => onAnalyze?.({ output: "relight", reanalyze: true })}>{t("depthReanalyze")}</button> : null}</div>
    {!ready || running || job?.error ? <div className="relight-setup">
      {running || job?.error ? <div className={`cinematic-depth-progress ${job?.error ? "is-error" : ""}`} role="status"><div><span>{job.phase}</span><strong>{Math.round(job.progress || 0)}%</strong></div><i><b style={{ width: `${job.progress || 0}%` }} /></i>{job.error ? <small>{job.error}</small> : null}</div> : <p>{t("relightAnalyzeHint")}</p>}
      <button type="button" className={running ? "panel-secondary" : "panel-primary"} disabled={!segment} onClick={() => running ? onCancel?.() : onAnalyze?.({ output: "relight" })}>{t(running ? "cancel" : "depthAnalyze")}</button>
    </div> : null}
    <fieldset disabled={!ready || running} className="relight-surface">
      <div className="relight-position-heading"><strong>{t("relightPosition")}</strong><small>{t("relightDrag")}</small></div>
      <RelightSphere light={light} label={t("relightPosition")} hint={t("relightDrag")} disabled={!ready || running} onChange={update} />
      <div className="relight-coordinates">{["x", "y"].map((axis) => <label key={axis}>{t(axis === "x" ? "relightHorizontal" : "relightVertical")}<input type="number" min={axis === "x" ? -180 : -90} max={axis === "x" ? 180 : 90} step={1} value={Math.round(light[axis] * (axis === "x" ? 180 : -90))} onChange={(event) => update({ [axis]: Math.max(-1, Math.min(1, Number(event.target.value) / (axis === "x" ? 180 : -90))) })} /><span>°</span></label>)}</div>
      <label className="relight-range"><span><strong>{t("relightDistance")}</strong><output>{light.distance.toFixed(1)}×</output></span><input type="range" min={1} max={4} step={.1} value={light.distance} onChange={(event) => update({ distance: Number(event.target.value) })} /></label>
      <label className="relight-range"><span><strong>{t("relightStrength")}</strong><output>{Math.round(light.strength * 100)}%</output></span><input type="range" min={0} max={1} step={.01} value={light.strength} onChange={(event) => update({ strength: Number(event.target.value) })} /></label>
      <div className="relight-color"><strong>{t("relightColor")}</strong><input type="color" aria-label={t("relightColor")} value={light.color} onChange={(event) => update({ color: event.target.value })} /><div>{[["Warm","#ffe5bf"],["Neutral","#ffffff"],["Cool","#bfdcff"]].map(([label,color]) => <button key={label} type="button" className={light.color === color ? "is-active" : ""} onClick={() => update({ color })}>{t(`relight${label}`)}</button>)}</div></div>
      {["range", "softness"].map((key) => <label className="relight-range" key={key}><span><strong>{t(key === "range" ? "relightRange" : "relightSoftness")}</strong><output>{Math.round(light[key] * 100)}%</output></span><input type="range" min={key === "range" ? .1 : 0} max={1} step={.01} value={light[key]} onChange={(event) => update({ [key]: Number(event.target.value) })} /></label>)}
      <details className="relight-advanced"><summary>{t("relightAdvanced")}</summary><p>{t("relightQualityHint")}</p><div className="relight-quality">{["fast","balanced","quality"].map((quality) => <button key={quality} type="button" className={quality === effect.quality ? "is-active" : ""} onClick={() => onChange?.({ ...effect, quality, enabled: quality === effect.quality && effect.enabled })}>{t(`depthQuality_${quality}`)}</button>)}</div></details>
    </fieldset></div>
    <div className="relight-footer"><button className={`relight-compare ${holding ? "is-held" : ""}`} type="button" disabled={!ready || !effect.enabled || effect.output !== "relight"} aria-pressed={holding} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); compare(true); }} onPointerUp={() => compare(false)} onPointerCancel={() => compare(false)} onLostPointerCapture={() => compare(false)} onKeyDown={(event) => { if ([" ","Enter"].includes(event.key)) { event.preventDefault(); compare(true); } }} onKeyUp={(event) => { if ([" ","Enter"].includes(event.key)) { event.preventDefault(); compare(false); } }} onBlur={() => compare(false)}><Eye size={19} />{t(holding ? "relightOriginal" : "relightCompare")}</button><button type="button" className="relight-reset" disabled={!ready || running} onClick={() => update(DEFAULT_RELIGHT)}><ArrowCounterClockwise size={18} />{t("relightReset")}</button></div>
  </div>;
}
