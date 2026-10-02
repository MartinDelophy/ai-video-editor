import { useChatCutSpeech } from "../hooks/useChatCutSpeech.js";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, PaperPlaneTilt, SpinnerGap, Stop, Plus, CaretDown, Check, ChatCircleDots, Paperclip, Info, X, Waveform, Microphone } from "@phosphor-icons/react";
import { getChatCutCopy } from "../i18nChatCut.js";
import { runAnnaChatCut } from "../lib/annaChatCut.js";
import { resolveAnnaSessionScope } from "../lib/annaRuntime.js";
import "./ChatCut.css";

const EMPTY_MESSAGES = [];
function sessionDate(value, language) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const date = new Date(value); date.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);
  return days >= -1 && days <= 0 ? new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(days, "day") : new Date(value).toLocaleDateString(language);
}

export function ChatCut({ language, editor, captureFrame, hasMedia, assets = [], onImport, onAssetPointerDown, inspectMedia, projectId, closing = false, onClose }) {
  const copy = getChatCutCopy(language);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [storageKey, setStorageKey] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const menu = useRef(null);
  const active = sessions.find(item => item.id === activeId);
  const messages = active?.messages || EMPTY_MESSAGES;
  const setMessages = update => setSessions(items => items.map(item => item.id === activeId ? { ...item, messages: update(item.messages), updatedAt: Date.now() } : item));
  const makeSession = () => ({ id: crypto.randomUUID(), title: "", messages: [], draft: "", excluded: [], updatedAt: Date.now() });
  useEffect(() => {
    let live = true;
    resolveAnnaSessionScope().then(scope => {
      if (!live) return;
      const key = `timeline-chatcut-v1:${scope}:${projectId || "startup"}`;
      let saved;
      try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* unavailable storage */ }
      const valid = Array.isArray(saved?.sessions) ? saved.sessions.filter(item => typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.messages) && item.messages.every(message => ["user", "assistant"].includes(message.role) && typeof message.text === "string") && Array.isArray(item.excluded) && typeof item.draft === "string" && Number.isFinite(item.updatedAt) && item.excluded.every(id => typeof id === "string")) : [];
      const initial = valid.length ? valid : [makeSession()];
      const id = initial.some(item => item.id === saved?.activeId) ? saved.activeId : initial[0].id;
      setSessions(initial); setActiveId(id); setInput(initial.find(item => item.id === id).draft); setStorageKey(key);
    }).catch(() => { if (live) { const item = makeSession(); setSessions([item]); setActiveId(item.id); setHistoryError(true); } });
    return () => { live = false; };
  }, [projectId]);
  useEffect(() => {
    if (!storageKey || !activeId) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ activeId, sessions: sessions.map(item => item.id === activeId ? { ...item, draft: input } : item) })); setHistoryError(false); } catch { setHistoryError(true); }
  }, [storageKey, sessions, activeId, input]);
  useEffect(() => {
    if (!historyOpen) return;
    const close = event => { if (event.key === "Escape" || (event.type === "pointerdown" && !menu.current?.contains(event.target))) setHistoryOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [historyOpen]);
  const switchSession = item => {
    if (controller.current || speech.active || editor.working) return;
    setSessions(items => items.map(session => session.id === activeId ? { ...session, draft: input } : session));
    if (editor.view?.status === "pending") editor.dismiss?.();
    setActiveId(item.id); setInput(item.draft); setHistoryOpen(false);
  };
  const newSession = () => { const item = makeSession(); switchSession(item); setSessions(items => [item, ...items]); };
  const visibleAssets = assets.filter(asset => !active?.excluded.includes(asset.id));
  const [stage, setStage] = useState("");
  const speech = useChatCutSpeech({ language, input, setInput });
  const composing = useRef(false);
  const controller = useRef(null);
  const mounted = useRef(true);
  const end = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (closing) controller.current?.abort(); }, [closing]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, stage]);
  const send = async (event) => {
    event.preventDefault();
    if (!activeId || controller.current || speech.active || !input.trim() || editor.view?.status === "pending") return;
    const instruction = input.trim();
    const abort = new AbortController();
    controller.current = abort;
    setStage("inspecting");
    try {
      setSessions(items => items.map(item => item.id === activeId && !item.title ? { ...item, title: instruction.slice(0, 36) } : item));
      setMessages(items => [...items, { role: "user", text: instruction }]);
      setInput("");
      const result = await runAnnaChatCut({ instruction, history: messages, tools: editor.tools(), execute: editor.execute, captureFrame, inspectMedia: (args, options) => { if (!visibleAssets.some(asset => (asset.assetId || asset.id) === args.assetId)) throw new Error("Asset not in this conversation"); return inspectMedia(args, options); }, language, signal: abort.signal, onStage: value => { if (mounted.current) setStage(value); } });
      if (mounted.current) setMessages(items => [...items, { role: "assistant", text: result.preview ? `${result.text}\n${copy.ready}` : result.text }]);
    } catch {
      if (mounted.current) setMessages(items => [...items, { role: "assistant", text: abort.signal.aborted ? copy.stopped : copy.error }]);
    } finally {
      controller.current = null;
      if (mounted.current) setStage("");
    }
  };
  return <aside className="chatcut" inert={closing} aria-hidden={closing || undefined} aria-label={copy.title}>
    <header className="chatcut-header" ref={menu}>
      <button type="button" className="chatcut-back" onClick={onClose} aria-label={copy.back} title={copy.back}><ArrowLeft size={20} /></button>
      <button type="button" className="chatcut-session-trigger" disabled={Boolean(stage) || speech.active} onClick={() => setHistoryOpen(value => !value)} aria-expanded={historyOpen} aria-label={copy.history}>
        <span>{copy.title}</span><strong><span>{active?.title || copy.newSession}</span><CaretDown size={16} /></strong>
      </button>
      <button type="button" className="chatcut-new" disabled={!activeId || Boolean(stage) || speech.active} onClick={newSession} aria-label={copy.newSession} title={copy.newSession}><Plus size={20} /></button>
      {historyOpen && <div className="chatcut-history"><div className="chatcut-history-label">{copy.history}</div>{[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map(item => <button type="button" key={item.id} aria-current={item.id === activeId ? "true" : undefined} className={item.id === activeId ? "is-current" : ""} onClick={() => switchSession(item)}><ChatCircleDots size={18} /><span>{item.title || copy.newSession}</span><time>{sessionDate(item.updatedAt, language)}</time>{item.id === activeId && <Check size={17} />}</button>)}</div>}
    </header>
    <div className="chatcut-messages" role="log" aria-live="polite">
      {!messages.length && <div className="chatcut-welcome"><h2>{copy.hint}</h2><p>{hasMedia ? copy.welcome : copy.empty}</p></div>}
      {messages.map((message, index) => <p key={index} className={`chatcut-message is-${message.role}`}>{message.text}</p>)}
      {stage && <p className="chatcut-status" role="status"><SpinnerGap size={18} className="chatcut-spinner" />{copy[stage]}</p>}
      <div ref={end} />
    </div>
    {historyError && <p className="chatcut-history-error" role="status">{copy.historyError}</p>}
    <form onSubmit={send} className="chatcut-composer">
      {visibleAssets.length > 0 && <div className="chatcut-assets" tabIndex={0} role="region" aria-label={copy.importMedia}>{visibleAssets.map(asset => <div key={asset.id} className="chatcut-asset" title={asset.name} onPointerDown={event => { if (!asset.preparing && !closing && !(event.target instanceof Element && event.target.closest("button"))) onAssetPointerDown?.(event, asset); }} onDragStart={event => event.preventDefault()}>
        {asset.thumbnail || asset.type === "image" ? <img src={asset.thumbnail || asset.src} alt="" draggable={false} /> : asset.type === "video" ? <video src={asset.src} muted playsInline preload="metadata" draggable={false} aria-hidden="true" /> : <Waveform size={24} />}
        <span>{asset.name}</span>{asset.preparing && <SpinnerGap className="chatcut-spinner" size={14} />}
        <button type="button" aria-label={`${copy.removeAttachment}: ${asset.name}`} disabled={Boolean(stage)} onClick={() => setSessions(items => items.map(item => item.id === activeId ? { ...item, excluded: [...item.excluded, asset.id] } : item))}><X size={14} /></button>
      </div>)}</div>}
      <textarea aria-label={copy.title} placeholder={copy.placeholder} value={input} maxLength={4000} disabled={Boolean(stage) || speech.active || !activeId} onChange={event => setInput(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
        event.preventDefault();
        if (!event.repeat) void send(event);
      }} />
      {speech.supported && speech.status && <p className={`chatcut-speech-status${["denied", "error", "empty"].includes(speech.status) ? " is-error" : ""}`} role="status" aria-live="polite">{speech.active && <Microphone size={14} />}{speech.interim || copy[`speech_${speech.status}`]}</p>}
      <div className="chatcut-composer-toolbar">
        <button type="button" className="chatcut-import" disabled={Boolean(stage)} onClick={onImport}><Paperclip size={19} />{copy.importMedia}</button>
        <button type="button" className="chatcut-info" aria-label={copy.info} aria-expanded={infoOpen} onClick={() => setInfoOpen(value => !value)}><Info size={18} /></button>
        <div className="chatcut-send">{speech.supported && <button type="button" className={`chatcut-microphone${speech.active ? " is-listening" : ""}`} disabled={Boolean(stage) || speech.status === "stopping"} onClick={speech.active ? speech.stop : speech.start} aria-label={speech.active ? copy.voiceStop : copy.voiceInput} title={speech.active ? copy.voiceStop : copy.voiceInput} aria-pressed={speech.active}>{speech.active ? <Stop size={19} /> : <Microphone size={19} />}</button>}{stage ? <button type="button" onClick={() => controller.current?.abort()} aria-label={copy.stop} title={copy.stop}><Stop size={20} /></button> : <button type="submit" disabled={speech.active || !activeId || !input.trim() || editor.view?.status === "pending"} aria-label={copy.send} title={copy.send}><PaperPlaneTilt size={21} /></button>}</div>
      </div>
      {infoOpen && <div className="chatcut-info-copy"><small>{copy.visualPrivacy}</small>{speech.supported && <small>{copy.voiceHint}</small>}</div>}
    </form>
  </aside>;
}
