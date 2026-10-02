import { useEffect, useRef, useState } from "react";
import { ClosedCaptioning, SpinnerGap } from "@phosphor-icons/react";
import { supportsFileSpeech, transcribeBrowserFile } from "../lib/browserFileSpeech.js";
import { CHATCUT_SPEECH_LANGUAGES } from "../hooks/useChatCutSpeech.js";
import { getBrowserCaptionCopy } from "../i18nBrowserCaptions.js";
import "./BrowserCaptions.css";

export function BrowserCaptions({ language, assets, projectId, locked, onCommit, captionSize, setCaptionSize, captionStyle, setCaptionStyle }) {
  const copy = getBrowserCaptionCopy(language);
  const media = assets.filter(asset => ["video", "audio"].includes(asset.type) && !asset.preparing && asset.blob instanceof Blob);
  const [assetId, setAssetId] = useState(""); const asset = media.find(item => item.id === assetId) || media[0];
  const [speechLanguage, setSpeechLanguage] = useState(language); const [target, setTarget] = useState(language === "en" ? "zh" : "en");
  const [offset, setOffset] = useState(0); const [bilingual, setBilingual] = useState(false);
  const [translationReady, setTranslationReady] = useState(false); const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0); const [message, setMessage] = useState("");
  const latest = useRef({ locked, onCommit, assets }); latest.current = { locked, onCommit, assets };
  const controller = useRef(null); const mounted = useRef(true); const currentProject = useRef(projectId); currentProject.current = projectId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { controller.current?.abort(); setMessage(""); }, [projectId]);
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
    if (!asset || running || locked || !supportsFileSpeech()) return;
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
      const segments = await transcribeBrowserFile(asset.blob, { language: CHATCUT_SPEECH_LANGUAGES[speechLanguage], offset: Number(offset) || 0, signal: abort.signal, context, onProgress: value => { if (mounted.current) setProgress(value * (translator ? 85 : 100)); } });
      if (translator) for (let i = 0; i < segments.length; i++) {
        if (abort.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const translated = await translator.translate(segments[i].text, { signal: abort.signal });
        segments[i].text += `\n${translated}`; if (mounted.current) setProgress(85 + (i + 1) / segments.length * 15);
      }
      if (abort.signal.aborted || currentProject.current !== startedProject || !mounted.current) return;
      if (latest.current.locked || !latest.current.assets.some(item => item.id === asset.id)) return;
      latest.current.onCommit(segments); setMessage(copy.done); setProgress(100);
    } catch (error) {
      if (mounted.current && !abort.signal.aborted) setMessage(error.code === "too-long" ? copy.long : copy.error);
    } finally {
      translator?.destroy(); await context.close().catch(() => {});
      if (mounted.current) setRunning(false); if (controller.current === abort) controller.current = null;
    }
  };
  return <aside className="voice-panel browser-captions" aria-label={copy.title}>
    <div className="panel-title-row"><h1><ClosedCaptioning size={20} />{copy.title}</h1></div>
    <div className="browser-captions-body">
      <p>{copy.hint}</p>
      <fieldset disabled={running}>
        <label>{copy.source}<select value={asset?.id || ""} onChange={event => setAssetId(event.target.value)}>{media.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {!asset && <p>{copy.empty}</p>}
        <label>{copy.language}<select value={speechLanguage} onChange={event => setSpeechLanguage(event.target.value)}>{options}</select></label>
        <label>{copy.offset}<input type="number" min="0" max="86400" step="0.1" value={offset} onChange={event => setOffset(Math.max(0, Math.min(86400, Number(event.target.value))))} /></label>
        {window.Translator && <label>{copy.target}<select value={target} onChange={event => setTarget(event.target.value)}>{options}</select></label>}
        {translationReady && <label className="browser-caption-check"><input type="checkbox" checked={bilingual} onChange={event => setBilingual(event.target.checked)} />{copy.bilingual}</label>}
      </fieldset>
      <small>{copy.privacy}</small><small>{copy.review}</small>
      {running && <div className="browser-caption-progress" role="status"><SpinnerGap className="chatcut-spinner" size={18} /><span>{copy.title}</span><span>{Math.floor(progress)}%</span><progress max="100" value={progress} /></div>}
      {message && <p role="status">{message}</p>}
      <button className={running ? "panel-secondary" : "panel-primary"} disabled={!running && (!asset || locked)} type="button" onClick={running ? () => controller.current?.abort() : generate}>{running ? copy.cancel : copy.generate}</button>
      <section className="browser-caption-style"><h2>{copy.style}</h2><label>{copy.size}<input type="range" min="12" max="42" value={captionSize} onChange={event => setCaptionSize(Number(event.target.value))} /></label><label>{copy.color}<input type="color" value={captionStyle.textColor || "#ffffff"} onChange={event => { const textColor = event.target.value; setCaptionStyle(style => ({ ...style, textColor })); }} /></label></section>
    </div>
  </aside>;
}
