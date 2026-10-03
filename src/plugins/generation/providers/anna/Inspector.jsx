import { useEffect, useRef, useState } from "react";
import { CheckCircle, Image, MagicWand, Rectangle, SpinnerGap, Square } from "@phosphor-icons/react";
import { getAnnaImageCopy } from "./copy.js";
export function AnnaImagePanel({ language, plugins, assets = [] }) {
  const attemptRef = useRef(0);
  useEffect(() => () => { attemptRef.current += 1; }, []);
  const copy = getAnnaImageCopy(language);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [connecting, setConnecting] = useState(false);
  const [failed, setFailed] = useState(false);
  const job = plugins.job.providerId === "anna" ? plugins.job : null;
  const running = connecting || ["running", "queued"].includes(job?.state);
  const result = job?.state === "complete" ? assets.find(asset => asset.id === job.assetId) : null;
  const [resultUrl, setResultUrl] = useState("");
  useEffect(() => {
    if (!result?.blob) { setResultUrl(result?.url || ""); return; }
    const url = URL.createObjectURL(result.blob);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);
  const generate = async event => {
    event.preventDefault(); const attempt = ++attemptRef.current; setFailed(false); setConnecting(true);
    try {
      const connection = await plugins.connectProvider("anna");
      if (attempt !== attemptRef.current) return;
      setConnecting(false);
      if (connection) await plugins.generateProvider("anna", { mode: "text-to-image", prompt, aspectRatio: ratio }, connection);
      else setFailed(true);
    } catch { if (attempt === attemptRef.current) setFailed(true); } finally { if (attempt === attemptRef.current) setConnecting(false); }
  };
  return <form className="anna-image-generator" onSubmit={generate}>
    <div className="anna-image-workspace">
      <div className="anna-image-inputs">
        <label className="anna-image-field-label" htmlFor="anna-image-prompt">{copy.prompt}</label>
        <div className="anna-image-prompt-box"><textarea id="anna-image-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={copy.example} maxLength={4000} disabled={running} /><span>{prompt.length}/4000</span></div>
        <fieldset className="anna-image-ratios"><legend>{copy.ratio}</legend><div>{["16:9", "9:16", "1:1"].map(value => { const Shape = value === "1:1" ? Square : Rectangle; return <button type="button" key={value} aria-pressed={ratio === value} disabled={running} onClick={() => setRatio(value)}><Shape size={20} className={value === "9:16" ? "portrait" : ""} />{value}</button>; })}</div></fieldset>
        {running ? <button className="anna-image-submit" type="button" onClick={() => { attemptRef.current += 1; plugins.cancelProviderConnect("anna"); void plugins.cancelGeneration(); setConnecting(false); }}><SpinnerGap className="spin" size={18} />{copy.cancel}</button> : <button className="anna-image-submit" type="submit" disabled={!prompt.trim()}><MagicWand size={18} />{copy.generate}</button>}
        <p className="anna-image-save-note"><CheckCircle size={17} />{copy.saveNote}</p>
        {(failed || job?.state === "error") && <p className="anna-image-error" role="alert">{copy.error}</p>}
      </div>
      <div className="anna-image-preview">
        <div className={`anna-image-preview-frame${resultUrl ? " has-result" : ""}${running ? " is-generating" : ""}`} data-ratio={ratio} aria-busy={running} style={{ aspectRatio: ratio.replace(":", "/") }}>
          {running ? <div className="anna-image-generation-status" role="status"><SpinnerGap size={32} className="spin" /><p>{copy.generating}</p></div> : resultUrl ? <img src={resultUrl} alt={result?.name || copy.saved} /> : <><Image size={42} weight="light" /><p>{copy.emptyPreview}</p></>}
          <span>{ratio}</span>
        </div>
        {job?.state === "complete" && <button className="anna-image-result-action" type="button" onClick={plugins.openGeneratedAsset}>{copy.saved}</button>}
      </div>
    </div>
  </form>;
}
