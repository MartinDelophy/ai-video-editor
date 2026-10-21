import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { materialText } from "../i18nMaterial.js";
import { AUTOMATIC_CAPTION_MODEL_ID, AUTOMATIC_CAPTION_MODEL_REVISION } from "../config/models.js";
import { SCENE_DETECT_TOOL_ID, SCENE_DETECT_TOOL_REVISION } from "../config/sceneDetect.js";
import { SILERO_SPEECH_SEGMENTATION } from "../config/sileroVad.js";
import "../styles/materialWorkspace.css";

export function MaterialWorkspace({ project, execution, language, onClose }) {
  const dialog = useRef(null), latest = useRef(project), player = useRef(null);
  latest.current = project;
  const [assets, setAssets] = useState([]), [results, setResults] = useState([]), [semantics, setSemantics] = useState([]);
  const [assetId, setAssetId] = useState(""), [capability, setCapability] = useState("scene");
  const [start, setStart] = useState(0), [end, setEnd] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState(false), [dirtyScopes, setDirtyScopes] = useState({});
  const dirty = Object.values(dirtyScopes).some(Boolean);
  const markDirty = (scope, value) => setDirtyScopes(previous => ({ ...previous, [scope]: value }));
  const [preview, setPreview] = useState(null), [component, setComponent] = useState(null), [tab, setTab] = useState("analysis");
  const text = key => materialText(language, key);
  const analysis = project.analysis;
  const busy = pending || analysis.running || execution.busy;
  const refresh = async () => {
    const all = []; let cursor;
    do { const page = await latest.current.execution.request(`assets${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`); all.push(...page.items); cursor = page.cursor; } while (cursor);
    const next = [], summaries = [];
    for (const asset of all) {
      cursor = undefined;
      do { const page = await latest.current.analysis.list(asset.assetId, cursor); next.push(...page.items); cursor = page.cursor; } while (cursor);
      cursor = undefined;
      do { const page = await latest.current.analysis.semanticList(asset.assetId, cursor); summaries.push(...page.items); cursor = page.cursor; } while (cursor);
    }
    setAssets(all); setResults(next); setSemantics(summaries);
    setAssetId(previous => all.some(asset => asset.assetId === previous) ? previous : all[0]?.assetId || "");
    const [scene, speech, vad] = await Promise.all([latest.current.analysis.component("scene-detect"), latest.current.analysis.component(), latest.current.analysis.component("silero-vad")]);
    setComponent({ scene, speech, vad }); await latest.current.analysis.refresh();
  };
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => {
    if (player.current?.readyState >= 1) {
      player.current.pause(); player.current.currentTime = preview?.range?.sourceStartSeconds ?? 0;
    }
  }, [preview]);
  useEffect(() => {
    const element = dialog.current; element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => { if (!analysis.running) void refreshRef.current().catch(() => setError(true)); }, [analysis.running]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  const act = async action => {
    setPending(true); setError(false);
    try { await action(); return true; } catch { setError(true); return false; }
    finally { setPending(false); }
  };
  const play = async (asset, range = null) => {
    const src = await analysis.source(asset); setPreview({ asset, range, src });
  };
  const asset = assets.find(item => item.assetId === assetId);
  return <dialog ref={dialog} className="material-workspace" aria-labelledby="material-workspace-title"
    onCancel={event => { event.preventDefault(); if (!busy && !dirty) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><h2 id="material-workspace-title">{text("workspace")}</h2><button type="button" aria-label={text("close")} disabled={busy || dirty} onClick={onClose}><X size={18} /></button></header>
    <p>{text("help")}</p>
    <nav>{["analysis", "scripts", "plans", "search"].map(key => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{text(key)}</button>)}</nav>
    {error || analysis.error ? <p role="alert">{text("error")}</p> : null}
    {dirty ? <p role="status">{text("dirty")}</p> : null}
    {analysis.running ? <p role="status">{text("running")}</p> : null}
    <section hidden={tab !== "analysis"}>
      <div className="material-actions"><button type="button" disabled={busy} onClick={() => act(refresh)}>{text("refresh")}</button>
        {analysis.pendingSave || analysis.unresolved ? <button type="button" disabled={busy} onClick={event => act(() => analysis.retrySave(event))}>{text("resume")}</button> : null}
        {capability === "speech" && component?.speech.state === "missing" ? <button type="button" disabled={busy} onClick={event => act(() => analysis.prepareComponent(event))}>{text("prepareSpeech")}</button> : null}
        {capability === "speech" && component?.vad.state === "missing" ? <button type="button" disabled={busy} onClick={event => act(() => analysis.prepareComponent(event, "silero-vad"))}>{text("prepareVad")}</button> : null}
      </div>
      <label>{text("source")}<select value={assetId} disabled={busy} onChange={event => { setAssetId(event.target.value); setStart(0); setEnd(""); setPreview(null); }}>
        <option value="" disabled>{text("select")}</option>{assets.map(item => <option key={item.assetId} value={item.assetId}>{item.name}</option>)}
      </select></label>
      <label>{text("analysis")}<select value={capability} disabled={busy} onChange={event => setCapability(event.target.value)}>
        <option value="scene">{text("scene")}</option><option value="speech">{text("speech")}</option>
      </select></label>
      <div className="material-columns"><label>{text("start")}<input type="number" min="0" step="any" value={start} disabled={busy} onChange={event => setStart(event.target.value)} /></label>
        <label>{text("end")}<input type="number" min="0" step="any" value={end} disabled={busy} onChange={event => setEnd(event.target.value)} /></label></div>
      {capability === "scene" ? <p role="status">{text(component?.scene.state === "verified" ? "ready" : "missing")}</p> : null}
      {capability === "scene" ? <p>{text("settings")}</p> : null}
      <div className="material-actions"><button type="button" disabled={!asset} onClick={() => act(() => play(asset))}>{text("preview")}</button>
        <button type="button" disabled={busy || !asset || (capability === "scene" && (asset.kind !== "video" || component?.scene.state !== "verified")) || asset.kind === "image" || !end || analysis.unresolved || Boolean(analysis.pendingSave)} onClick={event => act(async () => {
          const range = { sourceStartSeconds: Number(start), sourceEndSeconds: Number(end) };
          if (!Number.isFinite(range.sourceStartSeconds) || !Number.isFinite(range.sourceEndSeconds) || range.sourceEndSeconds <= range.sourceStartSeconds) throw new Error("range");
          const scene = capability === "scene";
          await analysis.start(event, { force: false, inputs: [{ assetRef: { kind: "asset", entityId: asset.assetId, revision: asset.revision }, mediaRef: asset.mediaRef,
            contentSha256: asset.sha256, range, capability, model: scene ? { id: SCENE_DETECT_TOOL_ID, revision: SCENE_DETECT_TOOL_REVISION, precision: "cpu", runtime: "host-python-pyscenedetect" }
              : { id: AUTOMATIC_CAPTION_MODEL_ID, revision: AUTOMATIC_CAPTION_MODEL_REVISION, precision: "q8", runtime: "transformers.js-3.8.1-wasm" },
            settings: { language, sampleIntervalSeconds: 1, ...(scene ? { sceneDetection: { backend: "pyscenedetect", method: "content", threshold: 27, minSceneLengthSeconds: 1, toolRevision: SCENE_DETECT_TOOL_REVISION } }
              : { speechSegmentation: { ...SILERO_SPEECH_SEGMENTATION } }) } }] }); await refresh();
        })}>{text("analyze")}</button>
        {analysis.running ? <button type="button" onClick={event => act(() => analysis.cancel(event))}>{text("cancel")}</button> : null}
      </div>
      <ul>{analysis.tasks.flatMap(task => task.steps.map(step => <li key={step.stepId}>
        {assets.find(asset => asset.assetId === step.basis.assetRef.entityId)?.name} · {text(step.status === "succeeded" ? "succeeded" : step.status === "queued" ? "partial" : step.status === "cancel_requested" ? "cancelled" : step.status)}
        {["queued", "interrupted", "failed", "cancelled"].includes(step.status) ? <button type="button" disabled={busy || analysis.unresolved || Boolean(analysis.pendingSave)} onClick={event => act(async () => { await analysis.continueTask(event, task.taskId, step.status === "queued" ? null : step.stepId); await refresh(); })}>{text("resume")}</button> : null}
      </li>))}</ul>
      <h3>{text("results")}</h3>
      <AnalysisReview results={results} language={language} busy={busy} onDirty={value => markDirty("analysis", value)} onSave={(event, item, correction) => act(async () => {
        await analysis.correct(event, item.raw.analysisId, item.correction?.revision ?? 1, correction); markDirty("analysis", false); await refresh();
      })} onPlay={(item, range) => act(() => play(assets.find(asset => asset.assetId === item.raw.basis.assetRef.entityId), range))} />
      <h3>{text("summary")}</h3><p>{text("agent")}</p>
      {semantics.map(item => <SemanticReview key={item.raw.analysisId} item={item} language={language} busy={busy} onDirty={value => markDirty(item.raw.analysisId, value)} onSave={(event, content, revision) => act(async () => {
        await analysis.correctSemantic(event, item.raw.analysisId, revision, content); markDirty(item.raw.analysisId, false); await refresh();
      })} onPlay={range => act(() => play(assets.find(asset => asset.assetId === item.raw.basis.assetRef.entityId), range))} />)}
    </section>
    <section hidden={tab !== "scripts"}><ScriptReview review={project.scriptReview} language={language} onDirty={value => markDirty("script", value)} /></section>
    <section hidden={tab !== "plans"}><PlanReview execution={execution} language={language} /></section>
    <section hidden={tab !== "search"}><VisualSearch analysis={analysis} language={language} onPlay={(source) => act(() => play(assets.find(asset => asset.assetId === source.assetRef.entityId), source.range))} /></section>
    {preview ? <div className="material-preview"><strong>{preview.asset.name}</strong><video key={preview.src} ref={player} src={preview.src} controls preload="metadata" onLoadedMetadata={event => {
      if (preview.asset.assetId === assetId && !end && Number.isFinite(event.currentTarget.duration)) setEnd(event.currentTarget.duration);
      if (preview.range) event.currentTarget.currentTime = preview.range.sourceStartSeconds;
    }} onTimeUpdate={event => { if (preview.range && event.currentTarget.currentTime >= preview.range.sourceEndSeconds) event.currentTarget.pause(); }} /></div> : null}
  </dialog>;
}

function AnalysisReview({ results, language, busy, onDirty, onSave, onPlay }) {
  const [chosen, setChosen] = useState(null), [draft, setDraft] = useState(null), [dirty, setDirty] = useState(false);
  const text = key => materialText(language, key);
  const change = value => { setDraft(value); setDirty(true); onDirty(true); };
  return <>
    <select disabled={dirty || busy} aria-label={text("results")} value={chosen?.raw.analysisId || ""} onChange={event => {
      const item = results.find(item => item.raw.analysisId === event.target.value); setChosen(item);
      setDraft(structuredClone(item.correction?.correction || { text: item.raw.output.text, intervals: item.raw.basis.capability === "scene"
        ? item.raw.output.scenes.map(scene => ({ range: scene.range, text: "", labels: [], visualNotes: "" }))
        : [{ range: item.raw.basis.range, text: item.raw.output.text, labels: [], visualNotes: "" }] })); onDirty(false);
    }}><option value="" disabled>{text("select")}</option>{results.map(item => <option key={item.raw.analysisId} value={item.raw.analysisId}>{item.raw.basis.capability === "scene" ? text("scene") : text("speech")} · {item.raw.basis.range.sourceStartSeconds}–{item.raw.basis.range.sourceEndSeconds}</option>)}</select>
    {draft ? <>
      <p>{text("automatic")}: {chosen.raw.output.scenes.map(scene => `${scene.range.sourceStartSeconds}–${scene.range.sourceEndSeconds}`).join(", ") || chosen.raw.output.text}</p>
      {chosen.raw.basis.capability === "speech" ? <label>{text("sourceText")}<textarea value={draft.text} onChange={event => change({ ...draft, text: event.target.value })} /></label> : null}
      {draft.intervals.map((interval, index) => <fieldset key={index} disabled={busy}>
        <legend>{index + 1}</legend><div className="material-columns">{["sourceStartSeconds", "sourceEndSeconds"].map((field, position) => <label key={field}>{text(position ? "end" : "start")}<input type="number" step="any" min={chosen.raw.basis.range.sourceStartSeconds} max={chosen.raw.basis.range.sourceEndSeconds} value={interval.range[field]} onChange={event => {
          const value = Number(event.target.value); const intervals = structuredClone(draft.intervals); intervals[index].range[field] = value;
          if (chosen.raw.basis.capability === "scene") {
            if (position && intervals[index + 1]) intervals[index + 1].range.sourceStartSeconds = value;
            if (!position && intervals[index - 1]) intervals[index - 1].range.sourceEndSeconds = value;
          }
          change({ ...draft, intervals });
        }} /></label>)}</div>
        <div className="material-actions"><button type="button" onClick={() => onPlay(chosen, interval.range)}>{text("preview")}</button>
          {index < draft.intervals.length - 1 ? <button type="button" onClick={() => change({ ...draft, intervals: draft.intervals.flatMap((item, i) => i === index ? [{ ...item, range: { ...item.range, sourceEndSeconds: draft.intervals[index + 1].range.sourceEndSeconds } }] : i === index + 1 ? [] : [item]) })}>{text("merge")}</button> : null}</div>
      </fieldset>)}
      <div className="material-actions"><button type="button" disabled={busy} onClick={async event => { if (await onSave(event, chosen, draft)) { setDirty(false); setChosen(null); setDraft(null); } }}>{text("save")}</button>
        <button type="button" disabled={busy} onClick={() => { setChosen(null); setDraft(null); setDirty(false); onDirty(false); }}>{text("cancelled")}</button></div>
    </> : null}
  </>;
}

function SemanticReview({ item, language, busy, onDirty, onSave, onPlay }) {
  const initial = item.correction?.output || item.raw.output;
  const [revision, setRevision] = useState(item.correction?.revision ?? 1);
  const [content, setContent] = useState(() => ({ ...initial, segments: initial.segments.map(({ range: _range, originalText: _original, ...segment }) => segment) }));
  const text = key => materialText(language, key);
  return <details><summary>{initial.centralIdea?.summary || text("noCentral")}</summary>
    {!item.sourceCurrent ? <p>{text("stale")}</p> : null}
    {content.segments.map((segment, index) => {
      const units = item.raw.units.slice(segment.unitStart, segment.unitEnd);
      return <fieldset key={segment.segmentId} disabled={busy}><legend>{index + 1}</legend><p>{units.map(unit => unit.text).join(" ")}</p>
        <label>{text("summary")}<textarea value={segment.summary} onChange={event => { onDirty(true); setContent(value => ({ ...value, segments: value.segments.map((item, i) => i === index ? { ...item, summary: event.target.value } : item) })); }} /></label>
        <button type="button" onClick={() => onPlay({ sourceStartSeconds: units[0].range.sourceStartSeconds, sourceEndSeconds: units.at(-1).range.sourceEndSeconds })}>{text("preview")}</button></fieldset>;
    })}
    <h4>{text("themes")}</h4>{content.themes.map(theme => <p key={theme.themeId}>{theme.title}: {theme.summary}</p>)}
    <p>{text("central")}: {content.centralIdea?.summary || text("noCentral")}</p>
    <button type="button" disabled={busy} onClick={() => { setContent({ ...initial, segments: initial.segments.map(({ range: _range, originalText: _original, ...segment }) => segment) }); setRevision(item.correction?.revision ?? 1); onDirty(false); }}>{text("reset")}</button>
    <button type="button" disabled={busy || !item.sourceCurrent} onClick={async event => { if (await onSave(event, { segments: content.segments, themes: content.themes, centralIdea: content.centralIdea, complete: content.complete, limitations: content.limitations }, revision)) setRevision(revision + 1); }}>{text("saveSemantic")}</button>
  </details>;
}

function ScriptReview({ review, language, onDirty }) {
  const [records, setRecords] = useState([]), [record, setRecord] = useState(null), [draft, setDraft] = useState(null), [dirty, setDirty] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(false);
  const latest = useRef(review); latest.current = review;
  const text = key => materialText(language, key);
  useEffect(() => { void latest.current.list().then(value => setRecords(value.items)).catch(() => setError(true)); }, []);
  const act = async action => { setPending(true); setError(false); try { await action(); } catch { setError(true); } finally { setPending(false); } };
  const select = record => { setRecord(record); setDraft(structuredClone(record.draft)); setDirty(false); onDirty(false); };
  return <><p>{text("agent")}</p>{error ? <p role="alert">{text("error")}</p> : null}
    <div className="material-actions"><button type="button" disabled={pending || dirty} onClick={() => act(async () => setRecords((await review.list()).items))}>{text("refresh")}</button>
      <button type="button" disabled={pending || dirty} onClick={() => act(async () => {
        const { items: sources } = await review.sources(); if (!sources.length) throw new Error("sources");
        const next = { goals: { theme: "", style: "", durationSeconds: null }, sources, provider: null, feedback: "", content: { title: text("scripts"), theme: "", rationale: "", suggestions: [], candidates: [], gaps: [],
          classifications: sources.map(source => ({ sourceId: source.sourceId, themes: [], tags: source.labels, included: true, note: "" })),
          segments: sources.map(source => ({ segmentId: crypto.randomUUID(), kind: source.capability === "speech" ? "sourceSpeech" : source.kind === "audio" ? "narration" : "visual", sourceIds: [source.sourceId], originalText: source.originalText,
            editedText: source.originalText, visualSuggestion: source.visualNotes, estimatedDurationSeconds: source.range.sourceEndSeconds - source.range.sourceStartSeconds, included: true })) } };
        const saved = await review.save({ scriptId: crypto.randomUUID(), revision: 0 }, next); setRecords(value => [...value, saved]); select(saved);
      })}>{text("create")}</button></div>
    <select value={record?.scriptId || ""} aria-label={text("scripts")} disabled={pending || dirty} onChange={event => select(records.find(item => item.scriptId === event.target.value))}>
      <option value="" disabled>{text("select")}</option>{records.map(item => <option key={item.scriptId} value={item.scriptId}>{item.draft.content.title} · {text("revision")} {item.revision}</option>)}</select>
    {draft ? <><label>{text("title")}<input value={draft.content.title} disabled={pending} onChange={event => { setDraft(value => ({ ...value, content: { ...value.content, title: event.target.value } })); setDirty(true); onDirty(true); }} /></label>
      {draft.content.segments.map((segment, index) => <fieldset key={segment.segmentId} disabled={pending}><legend>{index + 1}</legend>
        <p>{segment.originalText}</p><label>{text("text")}<textarea value={segment.editedText} onChange={event => { setDraft(value => ({ ...value, content: { ...value.content, segments: value.content.segments.map((item, i) => i === index ? { ...item, editedText: event.target.value } : item) } })); setDirty(true); onDirty(true); }} /></label></fieldset>)}
      <div className="material-actions"><button type="button" disabled={pending} onClick={() => act(async () => { const saved = await review.save(record, draft); select(saved); setRecords(value => [...value.filter(item => item.scriptId !== saved.scriptId), saved]); })}>{text("save")}</button>
        <button type="button" disabled={pending || dirty || record.sourcesCurrent === false || Boolean(record.confirmed)} onClick={event => act(async () => { const saved = await review.save(record, draft, event); select(saved); setRecords(value => [...value.filter(item => item.scriptId !== saved.scriptId), saved]); })}>{text(record.confirmed ? "succeeded" : "confirm")}</button>
        <button type="button" disabled={pending} onClick={() => select(record)}>{text("reset")}</button></div>
    </> : null}
  </>;
}

function PlanReview({ execution, language }) {
  const text = key => materialText(language, key), plan = execution.record;
  const authorized = Boolean(plan?.authorization && Date.parse(plan.authorization.expiresAt) > Date.now());
  const call = action => { void action().catch(() => {}); };
  return <><p>{text("agent")}</p>{execution.error ? <p role="alert">{text("error")}</p> : null}
    <button type="button" disabled={execution.busy} onClick={() => call(execution.refresh)}>{text("refresh")}</button>
    <select aria-label={text("plans")} disabled={execution.busy} value={plan?.planId || ""} onChange={event => execution.select(execution.items.find(item => item.planId === event.target.value))}>
      <option value="" disabled>{text("select")}</option>{execution.items.map(item => <option key={item.planId} value={item.planId}>{item.content.intent}</option>)}</select>
    {execution.scripts.map(script => <button type="button" key={script.scriptId} disabled={execution.busy} onClick={() => call(() => execution.fromScript(script))}>{text("create")}: {script.draft.content.title}</button>)}
    {plan ? <><h3>{plan.content.intent}</h3><p>{text("revision")} {plan.revision} · {plan.content.steps.length}</p>
      <label><input type="checkbox" checked={plan.content.allowModelDownload} readOnly />{text("allowDownload")}</label>
      <ol>{plan.content.steps.map(step => <li key={step.stepId}>{step.stepId}<details><summary>{text("analysis")}</summary><pre>{JSON.stringify({ dependsOn: step.dependsOn, request: step.request, operations: step.operations }, null, 2)}</pre></details> · {text(plan.attempts.findLast(attempt => attempt.stepId === step.stepId)?.status === "succeeded" ? "succeeded" : "partial")}</li>)}</ol>
      <div className="material-actions"><button type="button" disabled={execution.busy || Boolean(plan.application)} onClick={event => call(() => (execution.hasPending || authorized) ? execution.retry(event) : execution.authorize(event))}>{text(execution.hasPending || authorized ? "resume" : "authorize")}</button>
        <button type="button" disabled={!execution.busy} onClick={execution.cancel}>{text("cancel")}</button>
        <button type="button" disabled={execution.busy || Boolean(plan.application)} onClick={event => call(() => execution.previewResults(event))}>{text("previewApply")}</button></div>
    </> : null}
  </>;
}

function VisualSearch({ analysis, language, onPlay }) {
  const [status, setStatus] = useState(null), [query, setQuery] = useState(""), [items, setItems] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const latest = useRef(analysis); latest.current = analysis;
  const text = key => materialText(language, key);
  const refresh = async () => setStatus(await latest.current.visualStatus());
  useEffect(() => { void latest.current.visualStatus().then(setStatus).catch(() => setError(true)); }, []);
  const call = async action => { setBusy(true); setError(false); try { await action(); await refresh(); } catch { setError(true); } finally { setBusy(false); } };
  return <>{error ? <p role="alert">{text("error")}</p> : null}
    <p role="status">{text(status?.component.state === "verified" ? "ready" : "missing")}</p>
    <button type="button" disabled={busy} onClick={() => call(refresh)}>{text("refresh")}</button>
    <button type="button" disabled={busy || status?.component.state !== "verified" || !status.sceneCount} onClick={event => call(() => analysis.buildVisualIndex(event))}>{text("build")}</button>
    {busy || status?.running ? <button type="button" onClick={event => { void analysis.cancelVisualIndex(event).catch(() => setError(true)); }}>{text("cancelIndex")}</button> : null}
    <label>{text("query")}<input value={query} maxLength={2000} onChange={event => setQuery(event.target.value)} /></label>
    <button type="button" disabled={busy || status?.cache.state !== "ready" || !query.trim()} onClick={() => call(async () => setItems((await analysis.visualQuery({ query, k: 10, diversity: 0.2 })).items))}>{text("search")}</button>
    <ul>{items.map(item => <li key={item.sourceId}>{item.source.range.sourceStartSeconds}–{item.source.range.sourceEndSeconds} · {text("score")} {item.score.toFixed(3)}
      <button type="button" onClick={() => onPlay(item.source)}>{text("preview")}</button></li>)}</ul>
  </>;
}
