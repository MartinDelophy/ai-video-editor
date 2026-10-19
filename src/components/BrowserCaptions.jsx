import { ALL_CAPTION_VISUALS, buildCaptionTargets, captionTargetUnchanged } from "../lib/browserCaptionTargets.js";
import { getAllCaptionTargetsLabel } from "../i18nCaptionTargets.js";
import { isAnnaEdition } from "../lib/annaRuntime.js";
import { getAnnaTranscriptionError } from "../i18nAnnaTranscription.js";
import { useEffect, useRef, useState } from "react";
import { ClosedCaptioning, SpinnerGap } from "@phosphor-icons/react";
import { supportsFileSpeech } from "../lib/browserFileSpeech.js";
import { generateBrowserCaptionSegments } from "../lib/browserCaptionGeneration.js";
import { CHATCUT_SPEECH_LANGUAGES } from "../hooks/useChatCutSpeech.js";
import { getBrowserCaptionCopy } from "../i18nBrowserCaptions.js";
import "./BrowserCaptions.css";

export function BrowserCaptions({ language, assets, timelineMedia = [], preferredClipId, projectId, locked, onCommit }) {
  const copy = getBrowserCaptionCopy(language);
  const { clips, media } = buildCaptionTargets(timelineMedia, assets);
  const [assetId, setAssetId] = useState("");
  const asset = media.find(item => item.id === assetId) || clips.find(item => item.clipId === preferredClipId) || media[0];
  const visualTargets = clips.filter(item => item.type === "video");
  const allVisuals = assetId === ALL_CAPTION_VISUALS || (!media.some(item => item.id === assetId) && visualTargets.length > 0);
  const [speechLanguage, setSpeechLanguage] = useState(language); const [target, setTarget] = useState(language === "en" ? "zh" : "en");
  const [offset, setOffset] = useState(null); const [bilingual, setBilingual] = useState(false);
  const [translationReady, setTranslationReady] = useState(false); const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0); const [message, setMessage] = useState("");
  const latest = useRef({ locked, onCommit, media }); latest.current = { locked, onCommit, media };
  const controller = useRef(null); const mounted = useRef(true); const currentProject = useRef(projectId); currentProject.current = projectId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { controller.current?.abort(); setMessage(""); setAssetId(""); setOffset(null); }, [projectId]);
  useEffect(() => {
    let valid = true; setTranslationReady(false); setBilingual(false);
    if (window.Translator?.availability && speechLanguage !== target) {
      window.Translator.availability({ sourceLanguage: speechLanguage, targetLanguage: target }).then(value => { if (valid) setTranslationReady(value === "available"); }).catch(() => {});
    }
    return () => { valid = false; };
  }, [speechLanguage, target]);
  const names = new Intl.DisplayNames([language], { type: "language" });
  const options = Object.keys(CHATCUT_SPEECH_LANGUAGES).map(code => <option value={code} key={code}>{names.of(code)}</option>);
  const generate = async () => {
    const targets = allVisuals ? visualTargets : asset ? [asset] : [];
    if (!targets.length || running || locked || !supportsFileSpeech()) return;
    const abort = new AbortController(); controller.current = abort; const startedProject = projectId;
    setRunning(true); setMessage(""); setProgress(0);
    // Resume inside user activation; recognition receives a live file track only.
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const resumed = context.resume();
    let translator;
    try {
      const translation = bilingual && translationReady ? window.Translator.create({ sourceLanguage: speechLanguage, targetLanguage: target }) : null;
      await resumed;
      translator = translation ? await translation : null;
      const segments = [];
      for (let index = 0; index < targets.length; index++) {
        const source = targets[index];
        if (abort.signal.aborted) return;
        try {
          const result = await generateBrowserCaptionSegments(source.blob, {
            clip: source.clipId ? source : undefined, language: CHATCUT_SPEECH_LANGUAGES[speechLanguage],
            offset: Number(allVisuals ? source.timelineStart : offset ?? source.timelineStart) || 0,
            signal: abort.signal, context, translator,
            onProgress: value => { if (mounted.current && !abort.signal.aborted) setProgress((index + value) / targets.length * 100); },
          });
          segments.push(...result);
        } catch (error) {
          if (!allVisuals || error.code !== "empty") throw error;
        }
      }
      if (abort.signal.aborted || currentProject.current !== startedProject || !mounted.current) return;
      if (latest.current.locked || targets.some(source => !captionTargetUnchanged(source, latest.current.media.find(item => item.id === source.id)))) return;
      if (!segments.length) throw Object.assign(new Error("No speech"), { code: "empty" });
      latest.current.onCommit(segments); setMessage(copy.done); setProgress(100);
    } catch (error) {
      if (mounted.current && !abort.signal.aborted) setMessage(error.code === "too-long" ? copy.long : error.code === "empty" ? copy.noSpeech : isAnnaEdition ? getAnnaTranscriptionError(language) : copy.error);
    } finally {
      translator?.destroy(); await context.close().catch(() => {});
      if (mounted.current) setRunning(false); if (controller.current === abort) controller.current = null;
    }
  };
  return <aside className="voice-panel browser-captions" aria-label={copy.title}>
    <div className="browser-caption-header"><div className="panel-title-row"><h1><ClosedCaptioning size={20} />{copy.title}</h1></div><p>{copy.hint}</p></div>
    <div className="browser-captions-body">
      <fieldset disabled={running}>
        <label>{copy.source}<select value={allVisuals ? ALL_CAPTION_VISUALS : asset?.id || ""} onChange={event => { setAssetId(event.target.value); setOffset(null); }}>{visualTargets.length > 0 && <option value={ALL_CAPTION_VISUALS}>{getAllCaptionTargetsLabel(language)}</option>}{media.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {!asset && <p>{copy.empty}</p>}
        <label>{copy.language}<select value={speechLanguage} onChange={event => setSpeechLanguage(event.target.value)}>{options}</select></label>
        <label>{copy.offset}<input disabled={allVisuals} type="number" min="0" max="86400" step="0.1" value={allVisuals ? 0 : offset ?? asset?.timelineStart ?? 0} onChange={event => setOffset(Math.max(0, Math.min(86400, Number(event.target.value))))} /></label>
        {window.Translator && <label>{copy.target}<select value={target} onChange={event => setTarget(event.target.value)}>{options}</select></label>}
        {translationReady && <label className="browser-caption-check"><input type="checkbox" checked={bilingual} onChange={event => setBilingual(event.target.checked)} />{copy.bilingual}</label>}
      </fieldset>
      {!isAnnaEdition && <small>{copy.privacy}</small>}<small>{copy.review}</small>
      {running && <div className="browser-caption-progress" role="status"><SpinnerGap className="chatcut-spinner" size={18} /><span>{copy.title}</span><span>{Math.floor(progress)}%</span><progress max="100" value={progress} /></div>}
      {message && <p role="status">{message}</p>}
      <button className={running ? "panel-secondary" : "panel-primary"} disabled={!running && (!asset || locked)} type="button" onClick={running ? () => controller.current?.abort() : generate}>{running ? copy.cancel : copy.generate}</button>
    </div>
  </aside>;
}
