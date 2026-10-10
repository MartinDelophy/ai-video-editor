import "./AnnaVideoPanel.css";
import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getAnnaVideoCopy, getAnnaVideoResolutionCopy } from "../i18nAnnaVideo.js";
import { getAnnaVideoReferenceCopy } from "../i18nAnnaVideoReference.js";
import { prepareGenerationReference } from "../lib/generationReference.js";
export function AnnaVideoPanel({ language, plugins, assets = [] }) {
  const q = getAnnaVideoResolutionCopy(language);
  const [resolution, setResolution] = useState(plugins.annaVideoDraft?.resolution || plugins.annaVideoRequest?.resolution || "");
  const c = getAnnaVideoCopy(language), r = getAnnaVideoReferenceCopy(language);
  const [prompt, setPrompt] = useState(plugins.annaVideoDraft?.prompt || plugins.annaVideoRequest?.prompt || "");
  const [ratio, setRatio] = useState(plugins.annaVideoDraft?.ratio || plugins.annaVideoRequest?.aspectRatio || "16:9");
  const [durationSec, setDurationSec] = useState(plugins.annaVideoDraft?.durationSec || plugins.annaVideoRequest?.durationSec || 5);
  const mentionRange = useRef(null);
  const [activeOption, setActiveOption] = useState(0);
  const [selected, setSelected] = useState(plugins.annaVideoDraft?.selected || null), [frame, setFrame] = useState(plugins.annaVideoDraft?.frame || 0);
  const [reference, setReference] = useState(null), [referenceUrl, setReferenceUrl] = useState("");
  const [picker, setPicker] = useState(false), [search, setSearch] = useState("");
  const [frameOpen, setFrameOpen] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const referenceOffset = useRef(plugins.annaVideoDraft?.referenceOffset || 0);
  const [reading, setReading] = useState(false), [error, setError] = useState("");
  const textRef = useRef(null), videoRef = useRef(null);
  const jobId = plugins.annaVideoJobId || "";
  const pending = Boolean(jobId) && plugins?.job?.state !== "complete";
  const busy = ["running", "queued"].includes(plugins?.job?.state);
  const locked = busy || pending;
  const mounted = useRef(true);
  const setDraft = plugins.setAnnaVideoDraft;
  useEffect(() => { setDraft?.({ prompt, ratio, selected, frame, durationSec, resolution, referenceOffset: referenceOffset.current }); }, [prompt, ratio, selected, frame, durationSec, resolution, setDraft]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!selected) { setReference(null); setReferenceUrl(""); setReading(false); textRef.current?.querySelector("[data-anna-reference]")?.remove(); return; }
    const controller = new AbortController(); let url;
    setReading(true); setReference(null); setReferenceUrl(""); setError("");
    prepareGenerationReference(selected, frame, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(result.blob); setReference(result); setReferenceUrl(url);
    }).catch(e => { if (e.name !== "AbortError") setError(r.error); }).finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [selected, frame, r.error]);
  const editorText = () => {
    const clone = textRef.current?.cloneNode(true);
    clone?.querySelectorAll("[data-anna-reference]").forEach(node => node.remove());
    return clone?.textContent || "";
  };
  const buildEditor = (value, asset, offset = 0) => {
    const root = textRef.current;
    if (!root) return;
    root.replaceChildren(document.createTextNode(value.slice(0, offset)));
    if (asset) {
      const token = document.createElement("button");
      token.type = "button"; token.contentEditable = "false";
      token.dataset.annaReference = "true"; token.className = "anna-video-inline-reference";
      token.setAttribute("aria-label", `${r.preview}: ${asset.name}`);
      token.append(document.createTextNode("@"));
      const thumb = document.createElement("img"); thumb.alt = "";
      if (asset.type === "image") thumb.src = asset.src;
      token.append(thumb); root.append(token);
    }
    const tail = document.createTextNode(value.slice(offset)); root.append(tail);
    return tail;
  };
  useEffect(() => { buildEditor(prompt, selected, referenceOffset.current); }, []); // Uncontrolled rich text preserves the native caret.
  useEffect(() => {
    const image = textRef.current?.querySelector("[data-anna-reference] img");
    if (image && referenceUrl) image.src = referenceUrl;
  }, [referenceUrl]);
  const updateEditor = () => {
    const value = editorText(); setPrompt(value); setActiveOption(0);
    if (selected && !textRef.current?.querySelector("[data-anna-reference]")) { setSelected(null); setFrameOpen(false); setTooltip(null); }
    const selection = window.getSelection();
    if (!selection?.rangeCount || !textRef.current?.contains(selection.anchorNode)) return;
    const before = document.createRange(); before.selectNodeContents(textRef.current); before.setEnd(selection.anchorNode, selection.anchorOffset);
    const fragment = before.cloneContents(); fragment.querySelectorAll("[data-anna-reference]").forEach(node => node.remove());
    const caret = fragment.textContent.length, match = /@([^\s@]*)$/.exec(value.slice(0, caret));
    setPicker(Boolean(match)); mentionRange.current = match ? { start: caret - match[0].length, end: caret } : null;
    setSearch(match?.[1] || "");
    const token = textRef.current.querySelector("[data-anna-reference]");
    if (token) { const range = document.createRange(); range.selectNodeContents(textRef.current); range.setEndBefore(token); referenceOffset.current = range.toString().length; }
  };
  const showReference = target => {
    const token = target.closest?.("[data-anna-reference]");
    if (!token || !selected) return;
    const rect = token.getBoundingClientRect();
    setTooltip({ left: Math.max(8, Math.min(window.innerWidth - 264, rect.left)), top: Math.min(window.innerHeight - 230, rect.bottom + 8) });
  };
  const choose = asset => {
    const range = mentionRange.current;
    const value = range ? prompt.slice(0, range.start) + prompt.slice(range.end) : prompt;
    referenceOffset.current = range?.start ?? value.length;
    setSelected(asset); setFrame(0); setPicker(false); setFrameOpen(false); setPrompt(value); setTooltip(null);
    const tail = buildEditor(value, asset, referenceOffset.current);
    mentionRange.current = null; setSearch(""); textRef.current?.focus();
    if (tail) { const caret = document.createRange(); caret.setStart(tail, 0); caret.collapse(true); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(caret); }
  };
  const run = async resume => {
    try {
      setError("");
      const connection = await plugins.connectProvider("anna");
      if (mounted.current && connection?.state === "connected") await plugins.generateProvider("anna", { mode: "text-to-video", prompt, durationSec, resolution: resolution || undefined, aspectRatio: ratio, referenceAssets: reference ? [reference] : [], providerOptions: resume ? { jobId } : {} }, connection);
    } catch { if (mounted.current) setError(c.error); }
  };
  const media = assets.filter(a => ["image", "video"].includes(a.type) && a.blob instanceof Blob && (a.name || "").toLowerCase().includes(search.toLowerCase()));
  return <section className="tool-panel anna-video-panel">
    <p className="anna-video-quota">{c.quota}</p>
    <div className="anna-video-label"><label htmlFor="anna-video-prompt">{r.brief}</label></div>
    <div className="anna-video-composer">
      <div id="anna-video-prompt" ref={textRef} className="anna-video-rich-input" role="textbox" aria-label={r.brief} aria-multiline="true" contentEditable={!locked} suppressContentEditableWarning data-placeholder={`${c.prompt} · @ ${r.add}`} aria-autocomplete="list" aria-expanded={picker} aria-controls="anna-video-media-options" aria-activedescendant={picker && media[activeOption] ? `anna-video-option-${activeOption}` : undefined}
        onInput={updateEditor} onPaste={e => { e.preventDefault(); if (locked) return; const text = e.clipboardData.getData("text/plain"); const selection = window.getSelection(); if (!selection?.rangeCount) return; const range = selection.getRangeAt(0); if (!textRef.current?.contains(range.commonAncestorContainer)) return; range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); updateEditor(); }}
        onMouseOver={e => showReference(e.target)} onMouseOut={e => { const token = e.target.closest?.("[data-anna-reference]"); if (token && !token.contains(e.relatedTarget)) setTooltip(null); }} onFocus={e => showReference(e.target)} onBlur={() => setTooltip(null)}
        onClick={e => { if (!e.target.closest?.("[data-anna-reference]")) return; if (selected?.type === "video" && !locked) { setFrameOpen(!frameOpen); setTooltip(null); } else showReference(e.target); }}
        onKeyDown={e => {
          e.stopPropagation();
          let token = e.target.closest?.("[data-anna-reference]");
          if (!locked && ["Backspace", "Delete"].includes(e.key)) {
            const selection = window.getSelection();
            const caret = selection?.rangeCount ? selection.getRangeAt(0) : null;
            if (!token && caret?.collapsed && textRef.current?.contains(caret.startContainer)) {
              const adjacent = document.createRange();
              adjacent.selectNodeContents(textRef.current);
              if (e.key === "Backspace") adjacent.setEnd(caret.startContainer, caret.startOffset);
              else adjacent.setStart(caret.startContainer, caret.startOffset);
              const fragment = adjacent.cloneContents();
              const leaves = [];
              const collect = node => {
                if (node.nodeType === Node.ELEMENT_NODE && node.matches("[data-anna-reference]")) leaves.push(node);
                else if (node.nodeType === Node.TEXT_NODE) { if (node.textContent.length) leaves.push(node); }
                else if (node.nodeName === "BR") leaves.push(node);
                else node.childNodes.forEach(collect);
              };
              collect(fragment);
              const edge = e.key === "Backspace" ? leaves.at(-1) : leaves[0];
              if (edge?.nodeType === Node.ELEMENT_NODE && edge.matches("[data-anna-reference]")) token = textRef.current.querySelector("[data-anna-reference]");
            }
            if (token) {
              e.preventDefault();
              const nextCaret = document.createRange(); nextCaret.setStartBefore(token); nextCaret.collapse(true);
              token.remove(); selection?.removeAllRanges(); selection?.addRange(nextCaret);
              textRef.current?.focus(); setSelected(null); setFrameOpen(false); setTooltip(null); updateEditor(); return;
            }
          }
          if (e.key === "Escape") { setPicker(false); setTooltip(null); return; }
          if (e.key === "Enter" && !picker && !locked) { e.preventDefault(); const selection = window.getSelection(); if (!selection?.rangeCount) return; const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode("\n"); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); updateEditor(); return; }
          if (!picker || !media.length) return;
          if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); setActiveOption(value => (value + (e.key === "ArrowDown" ? 1 : -1) + media.length) % media.length); }
          if (e.key === "Enter") { e.preventDefault(); choose(media[activeOption] || media[0]); }
        }} />
    </div>
    {tooltip && selected && referenceUrl ? createPortal(<div className="anna-video-reference-tooltip" role="tooltip" style={tooltip}><img src={referenceUrl} alt={selected.name}/><strong>{selected.name}</strong><small>{selected.type === "video" ? `${r.frame} · ${frame.toFixed(2)}s · ${r.change}` : r.image}</small></div>, document.body) : null}
    {picker && !locked ? <div className="anna-video-picker"><div id="anna-video-media-options" role="listbox" aria-label={r.add}>{media.length ? media.map((asset, index) => <button id={`anna-video-option-${index}`} role="option" aria-selected={index === activeOption} key={asset.id} type="button" onClick={() => choose(asset)}>{asset.type === "image" || asset.thumbnail ? <img className="anna-video-option-thumbnail" src={asset.thumbnail || asset.src} alt="" draggable={false}/> : <video className="anna-video-option-thumbnail" src={asset.src} muted playsInline preload="metadata" aria-hidden="true"/>}<span>{asset.name}</span><small>{asset.type === "image" ? r.image : r.choose}</small></button>) : <p>{r.empty}</p>}</div></div> : null}
    {selected?.type === "video" && frameOpen ? <div className="anna-video-frame"><video ref={videoRef} src={selected.src} controls={!locked} preload="metadata" onSeeked={e => setFrame(e.currentTarget.currentTime)} /><input type="range" aria-label={r.choose} min="0" max={Math.max(0, (selected.sourceDuration || selected.duration || 1) - 0.001)} step="0.01" value={frame} disabled={locked} onChange={e => { const time = Number(e.target.value); setFrame(time); if (videoRef.current) videoRef.current.currentTime = time; }} /><button type="button" disabled={locked} onClick={() => { setFrame(videoRef.current?.currentTime || 0); setFrameOpen(false); }}>{r.choose}</button></div> : null}
    <label>{q.label}<select aria-label={q.label} value={resolution} disabled={locked} onChange={e => setResolution(e.target.value)}><option value="">{q.automatic}</option>{["480p", "720p", "768p", "1080p"].map(value => <option key={value} value={value}>{value}</option>)}</select><small className="anna-video-resolution-hint">{q.hint}</small></label>
    <div className="anna-video-options"><label>{c.ratio}<select value={selected ? "reference" : ratio} disabled={locked || Boolean(selected)} onChange={e => setRatio(e.target.value)}>{selected ? <option value="reference">{r.match}</option> : ["16:9","9:16","1:1"].map(value => <option key={value}>{value}</option>)}</select></label><label>{r.duration}<select aria-label={r.duration} value={durationSec} disabled={locked} onChange={e => setDurationSec(Number(e.target.value))}>{Array.from({length:11}, (_,i) => i + 5).map(seconds => <option key={seconds} value={seconds}>{new Intl.NumberFormat(language || "en", { style: "unit", unit: "second", unitDisplay: "short" }).format(seconds)}</option>)}</select></label></div>
    <button type="button" className="primary" disabled={busy || prompt.length > 4000 || !prompt.replace(/@[^\s@]*/g, "").trim() || pending || reading || Boolean(selected && !reference)} onClick={() => run(false)}>{c.generate}</button>
    {busy ? <button type="button" onClick={plugins.cancelGeneration}>{c.stop}</button> : jobId && plugins.job.state !== "complete" ? <button type="button" onClick={() => run(true)}>{c.resume}</button> : null}
    <p role="status">{error || (busy ? c.running : plugins?.job?.state === "complete" ? c.complete : plugins?.job?.state === "error" ? (/invalid_request|-32122/i.test(plugins.job.errorCode || plugins.job.message || "") ? r.unsupported : c.error) : "")}</p>
    {jobId ? <small>{jobId}</small> : null}
  </section>;
}
