import { ChatCutActivity } from "./ChatCutActivity.jsx";
import { ChatCutMediaPreview } from "./ChatCutMediaPreview.jsx";
import { getChatCutTrigger, getChatCutCommand, getChatCutMentions, getChatCutClipboardFiles } from "../lib/chatCutComposer.js";
import { getChatCutComposerCopy } from "../i18nChatCutComposer.js";
import { ImageEditDialog } from "./ImageEditDialog.jsx";
import { ChatCutMarkdown } from "./ChatCutMarkdown.jsx";
import { getAnnaImageCopy } from "../plugins/generation/providers/anna/copy.js";
import { useChatCutSpeech } from "../hooks/useChatCutSpeech.js";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, PaperPlaneTilt, SpinnerGap, Stop, Plus, CaretDown, Check, ChatCircleDots, Paperclip, Info, X, Waveform, Microphone, ArrowCounterClockwise, GitDiff } from "@phosphor-icons/react";
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

export function ChatCut({ language, editor, captureFrame, hasMedia, assets = [], onImport, onPasteFiles, onAssetPointerDown, inspectMedia, projectId, generationPlugins, closing = false, onClose }) {
  const copy = getChatCutCopy(language);
  const composerCopy = getChatCutComposerCopy(language);
  const inputRef = useRef(null);
  const composerRef = useRef(null);
  const [trigger, setTrigger] = useState(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const imageCopy = getAnnaImageCopy(language);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [editImageAsset, setEditImageAsset] = useState(null);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [storageKey, setStorageKey] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const menu = useRef(null);
  const menuTrigger = useRef(null);
  useEffect(() => {
    if (!infoOpen) return;
    const dismiss = event => { if (event.key === "Escape" || event.type === "pointerdown" && !composerRef.current?.contains(event.target)) setInfoOpen(false); };
    document.addEventListener("pointerdown", dismiss, true); document.addEventListener("keydown", dismiss);
    return () => { document.removeEventListener("pointerdown", dismiss, true); document.removeEventListener("keydown", dismiss); };
  }, [infoOpen]);
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
      const valid = Array.isArray(saved?.sessions) ? saved.sessions.filter(item => typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.messages) && item.messages.every(message => ["user", "assistant"].includes(message.role) && typeof message.text === "string" && (message.assetIds === undefined || Array.isArray(message.assetIds) && message.assetIds.length <= 32 && message.assetIds.every(id => typeof id === "string" && id.length <= 256))) && Array.isArray(item.excluded) && typeof item.draft === "string" && (item.mentions === undefined || Array.isArray(item.mentions) && item.mentions.length <= 64 && item.mentions.every(mention => typeof mention.token === "string" && mention.token.length <= 4000 && typeof mention.assetId === "string" && mention.assetId.length <= 256)) && Number.isFinite(item.updatedAt) && item.excluded.every(id => typeof id === "string")) : [];
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
    const close = event => { if (event.key === "Escape" || (event.type === "pointerdown" && !menu.current?.contains(event.target) && !menuTrigger.current?.contains(event.target))) setHistoryOpen(false); };
    document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", close); };
  }, [historyOpen]);
  useEffect(() => {
    const view = editor.view;
    if (!view?.preview?.previewId) return;
    setSessions(items => items.map(item => item.id !== activeId ? item : { ...item, messages: item.messages.map(message =>
      message.edit?.preview?.previewId === view.preview.previewId
        ? { ...message, edit: { ...message.edit, status: view.status, transactionId: view.transactionId } } : message) }));
  }, [editor.view, activeId]);
  const undoEdit = async edit => {
    const result = await editor.undo();
    if (result?.ok) setSessions(items => items.map(item => item.id !== activeId ? item : { ...item, messages: item.messages.map(message =>
      message.edit?.preview?.previewId === edit.preview.previewId ? { ...message, edit: { ...message.edit, status: "undone" } } : message) }));
  };
  const switchSession = item => {
    if (controller.current || speech.active || editor.working) return;
    setSessions(items => items.map(session => session.id === activeId ? { ...session, draft: input } : session));
    if (editor.view?.status === "pending") editor.dismiss?.();
    editor.hideReview?.();
    editor.resetAi?.();
    setActiveId(item.id); setInput(item.draft); setHistoryOpen(false); setTrigger(null); setInfoOpen(false);
  };
  const newSession = () => { const item = makeSession(); switchSession(item); setSessions(items => [item, ...items]); };
  const visibleAssets = assets.filter(asset => !active?.excluded.includes(asset.id));
  const [stage, setStage] = useState("");
  const [activity, setActivity] = useState([]);
  const speech = useChatCutSpeech({ language, input, setInput });
  const composing = useRef(false);
  const controller = useRef(null);
  const mounted = useRef(true);
  const end = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (closing) controller.current?.abort(); }, [closing]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, stage]);
  // Convert older plain-text references into the same compact reference pills.
  useEffect(() => {
    const legacy = (active?.mentions || []).filter(mention => !mention.selected && input.includes(mention.token));
    if (!legacy.length) return;
    setInput(value => legacy.reduce((text, mention) => text.split(mention.token).join(""), value));
    setSessions(items => items.map(item => item.id !== activeId ? item : { ...item, mentions: (item.mentions || []).map(mention => legacy.some(old => old.assetId === mention.assetId) ? { ...mention, selected: true } : mention) }));
    setTrigger(null);
  }, [active?.mentions, activeId, input]);
  const references = getChatCutMentions(input, active?.mentions, visibleAssets);
  const updateTrigger = element => {
    const next = getChatCutTrigger(element.value, element.selectionStart);
    if (next?.kind === trigger?.kind && next?.start === trigger?.start && next?.end === trigger?.end && next?.query === trigger?.query) return;
    setTrigger(next); setOptionIndex(0);
  };
  const options = trigger?.kind === "asset"
    ? assets.filter(asset => !asset.preparing && asset.name.toLocaleLowerCase().includes(trigger.query.toLocaleLowerCase())).map(asset => ({ id: asset.assetId || asset.id, asset, label: asset.name }))
    : ["image", "remotion"].filter(command => command.startsWith((trigger?.query || "").toLowerCase())).map(command => ({ id: command, label: `/${command}`, description: composerCopy[command] }));
  const chooseOption = option => {
    if (!trigger || !option) return;
    let token = option.label;
    if (option.asset) {
      const base = option.label.replace(/[「」\n\r]/g, " ");
      const duplicates = assets.filter(asset => asset.name.replace(/[「」\n\r]/g, " ") === base);
      token = `@「${base}${duplicates.length > 1 ? ` (${duplicates.findIndex(asset => asset.id === option.asset.id) + 1})` : ""}」`;
      setSessions(items => items.map(item => item.id !== activeId ? item : { ...item, excluded: item.excluded.filter(id => id !== option.asset.id), mentions: [...(item.mentions || []).filter(mention => mention.assetId !== option.id).slice(-63), { token, assetId: option.id, selected: true }] }));
    }
    const next = option.asset ? input.slice(0, trigger.start) + input.slice(trigger.end) : `/${option.id} ${getChatCutCommand(input.slice(0, trigger.start) + input.slice(trigger.end)).instruction}`;
    if (next.length > 4000) return;
    const caret = option.asset ? trigger.start : next.length;
    setInput(next); setTrigger(null);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(caret, caret); });
  };
  const startShortcut = value => {
    setInfoOpen(false);
    if (value === "@") {
      const next = input + (input && !/\s$/.test(input) ? " " : "") + "@";
      if (next.length > 4000) return;
      setInput(next); setTrigger(getChatCutTrigger(next, next.length)); setOptionIndex(0);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(next.length, next.length); });
    } else {
      const next = `/${value} ${getChatCutCommand(input).instruction}`;
      if (next.length > 4000) return;
      setInput(next); setTrigger(null);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(next.length, next.length); });
    }
  };
  const send = async (event) => {
    event.preventDefault();
    if (!activeId || controller.current || speech.active || !input.trim() || editor.view?.status === "pending") return;
    const parsed = getChatCutCommand(input);
    if (!parsed.instruction) { inputRef.current?.focus(); return; }
    const referencedAssets = getChatCutMentions(input, active?.mentions, visibleAssets);
    editor.prepareAi?.();
    const instruction = input.trim();
    setTrigger(null); setInfoOpen(false);
    const abort = new AbortController();
    controller.current = abort;
    setStage("inspecting");
    let completedAssetIds = [];
    let events = [];
    setActivity([]);
    try {
      setSessions(items => items.map(item => item.id === activeId && !item.title ? { ...item, title: instruction.slice(0, 36) } : item));
      setMessages(items => [...items, { role: "user", text: instruction + (referencedAssets.length ? `\n${referencedAssets.map(asset => `@${asset.name}`).join(" ")}` : "") }]);
      setSessions(items => items.map(item => item.id !== activeId ? item : { ...item, mentions: [] }));
      setInput("");
      const result = await runAnnaChatCut({ instruction: parsed.instruction, generationCommand: parsed.command, referencedAssets, autoApply: true, history: messages, tools: editor.tools(), execute: editor.execute, captureFrame, inspectMedia: (args, options) => { if (!visibleAssets.some(asset => (asset.assetId || asset.id) === args.assetId)) throw new Error("Asset not in this conversation"); return inspectMedia(args, options); }, language, signal: abort.signal, onActivity: event => { events = [...events.filter(item => item.id !== event.id), event]; if (mounted.current) setActivity(events); }, onAssets: ids => { completedAssetIds = ids; }, onStage: value => { if (mounted.current) setStage(value); } });
      if (mounted.current) editor.commitAiAssets?.(result.assetIds || []);
      if (mounted.current) setMessages(items => [...items, { role: "assistant", text: result.text, activity: events, assetIds: result.assetIds || [], ...(result.review ? { edit: result.review } : {}) }]);
    } catch (error) {
      console.warn("ChatCut request failed", typeof error?.code === "string" && /^[a-zA-Z0-9_]{1,64}$/.test(error.code) ? error.code : "REQUEST_FAILED");
      if (mounted.current) {
        editor.commitAiAssets?.(completedAssetIds);
        setMessages(items => [...items, { role: "assistant", text: abort.signal.aborted ? copy.stopped : copy.error, activity: events.map(item => item.status === "running" ? { ...item, status: abort.signal.aborted ? "stopped" : "error" } : item), assetIds: completedAssetIds }]);
      }
    } finally {
      editor.releaseAi?.();
      controller.current = null;
      if (mounted.current) setStage("");
    }
  };
  return <aside className="chatcut" inert={closing} aria-hidden={closing || undefined} aria-label={copy.title}>
    <header className="chatcut-header">
      <button type="button" className="chatcut-back" onClick={onClose} aria-label={copy.back} title={copy.back}><ArrowLeft size={20} /></button>
      <div className="chatcut-session-heading">
        <span>{copy.title}</span>
      <button ref={menuTrigger} type="button" className="chatcut-session-trigger" disabled={Boolean(stage) || speech.active} onClick={() => setHistoryOpen(value => !value)} aria-expanded={historyOpen} aria-label={copy.history}>
        <strong><span>{active?.title || copy.newSession}</span><CaretDown size={16} /></strong>
      </button>
      </div>
      <button type="button" className="chatcut-new" disabled={!activeId || Boolean(stage) || speech.active} onClick={newSession} aria-label={copy.newSession} title={copy.newSession}><Plus size={20} /></button>
      {historyOpen && <div ref={menu} className="chatcut-history"><div className="chatcut-history-label">{copy.history}</div><div className="chatcut-history-list">{[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map(item => <button type="button" key={item.id} aria-current={item.id === activeId ? "true" : undefined} className={item.id === activeId ? "is-current" : ""} onClick={() => switchSession(item)}><ChatCircleDots size={18} /><span>{item.title || copy.newSession}</span><time>{sessionDate(item.updatedAt, language)}</time>{item.id === activeId && <Check size={17} />}</button>)}</div></div>}
    </header>
    <div className="chatcut-messages" role="log" aria-live="polite">
      {!messages.length && <div className="chatcut-welcome"><h2>{copy.hint}</h2><p>{hasMedia ? copy.welcome : copy.empty}</p></div>}
      {messages.map((message, index) => {
        const edit = message.edit;
        const current = edit && edit.preview?.previewId === editor.view?.preview?.previewId;
        const status = current ? editor.view.status : edit?.status;
        const diff = edit?.preview?.diff;
        const counts = Object.values(diff?.tracks || {}).reduce((sum, track) => ({ added: sum.added + (track.added?.length || 0), removed: sum.removed + (track.removed?.length || 0), modified: sum.modified + (track.modified?.length || 0) }), { added: 0, removed: 0, modified: 0 });
        return <div key={index} className="chatcut-turn">
          {message.activity?.length > 0 && <ChatCutActivity events={message.activity} language={language} />}
          {message.text && (message.role === "assistant" ? <ChatCutMarkdown text={message.text} /> : <p className="chatcut-message is-user">{message.text}</p>)}
          {message.assetIds?.map(id => {
            const asset = assets.find(item => item.id === id) || editor.aiAssets?.().find(item => item.id === id);
            if (!asset || !["image", "video"].includes(asset.type)) return null;
            return <div className="chatcut-result-media" key={id} onPointerDown={event => { if (!stage && (!event.target.closest("button") || event.target.closest(".chatcut-media-preview-trigger"))) onAssetPointerDown?.(event, asset); }} onDragStart={event => event.preventDefault()}>
              <button className="chatcut-media-preview-trigger" type="button" onClick={event => { if (!event.defaultPrevented) setPreviewAsset(asset); }} aria-label={asset.name}>{asset.type === "image" ? <img src={asset.src} alt={asset.name} draggable={false} /> : <video src={asset.src} poster={asset.thumbnail} muted playsInline preload="metadata" />}</button>
              <div><span>{asset.name}</span><button type="button" disabled={Boolean(stage)} onClick={() => { if (asset.type === "image") setEditImageAsset(asset); else setInput(`${imageCopy.editVideo} [assetId=${asset.id}]: `); }}>{asset.type === "image" ? imageCopy.edit : imageCopy.editVideo}</button></div>
            </div>;
          })}
          {edit && <div className="chatcut-change-card">
            <GitDiff size={21} aria-hidden="true" />
            <div className="chatcut-change-summary"><strong>{copy[status === "applied" ? "changeApplied" : status === "undone" ? "changeUndone" : "changeReady"]}</strong><span><b className="is-added">+{counts.added}</b><b className="is-removed">−{counts.removed}</b><span>{copy.changeModified.replace("{count}", counts.modified)}</span></span></div>
            <div className="chatcut-change-actions">
              {current && status === "pending" && <button type="button" disabled={editor.working || editor.stale} onClick={editor.apply}>{editor.t("apply")}</button>}
              {status === "applied" && <button type="button" disabled={!current || editor.working || !editor.canUndo} onClick={() => undoEdit(edit)}><ArrowCounterClockwise size={14} />{copy.changeUndo}</button>}
              <button type="button" onClick={() => editor.showReview(edit)}>{copy.changeView}</button>
            </div>
          </div>}
        </div>;
      })}
      {editor.error && <p className="chatcut-history-error" role="alert">{editor.error}</p>}
      {stage && activity.length > 0 && <ChatCutActivity events={activity} language={language} live />}
      {stage && <p className="chatcut-status" role="status"><SpinnerGap size={18} className="chatcut-spinner" />{copy[stage]}{stage === "processing" && Number.isFinite(editor.aiJob?.progress) && ` ${Math.round(editor.aiJob.progress)}%`}</p>}
      <div ref={end} />
    </div>
    {historyError && <p className="chatcut-history-error" role="status">{copy.historyError}</p>}
    {previewAsset && <ChatCutMediaPreview asset={previewAsset} language={language} editLabel={previewAsset.type === "image" ? imageCopy.edit : imageCopy.editVideo} onClose={() => setPreviewAsset(null)} onEdit={() => { if (previewAsset.type === "image") setEditImageAsset(previewAsset); else setInput(`${imageCopy.editVideo} [assetId=${previewAsset.id}]: `); setPreviewAsset(null); }} />}
    {editImageAsset && generationPlugins && <ImageEditDialog asset={editImageAsset} assets={assets} language={language} plugins={generationPlugins} closeLabel={copy.back} onClose={() => setEditImageAsset(null)} onGenerated={assetIds => setMessages(items => [...items, { role: "assistant", text: imageCopy.saved, assetIds }])} />}
    <form ref={composerRef} onSubmit={send} className="chatcut-composer">
      {visibleAssets.length > 0 && <div className="chatcut-assets" tabIndex={0} role="region" aria-label={copy.importMedia}>{visibleAssets.map(asset => <div key={asset.id} className="chatcut-asset" title={asset.name} onPointerDown={event => { if (!asset.preparing && !closing && !(event.target instanceof Element && event.target.closest("button"))) onAssetPointerDown?.(event, asset); }} onDragStart={event => event.preventDefault()}>
        {asset.thumbnail || asset.type === "image" ? <img src={asset.thumbnail || asset.src} alt="" draggable={false} /> : asset.type === "video" ? <video src={asset.src} muted playsInline preload="metadata" draggable={false} aria-hidden="true" /> : <Waveform size={24} />}
        <span>{asset.name}</span>{asset.preparing && <SpinnerGap className="chatcut-spinner" size={14} />}
        <button type="button" aria-label={`${copy.removeAttachment}: ${asset.name}`} disabled={Boolean(stage)} onClick={() => setSessions(items => items.map(item => item.id === activeId ? { ...item, excluded: [...item.excluded, asset.id] } : item))}><X size={14} /></button>
      </div>)}</div>}
      {references.length > 0 && <div className="chatcut-references" aria-label={composerCopy.mention}>{references.map(reference => {
        const asset = visibleAssets.find(item => (item.assetId || item.id) === reference.assetId);
        return <div className="chatcut-reference" key={reference.assetId} title={reference.name}>
          <span className="chatcut-reference-at">@</span>
          {asset?.thumbnail || asset?.type === "image" ? <img src={asset.thumbnail || asset.src} alt="" /> : <Waveform size={16} />}
          <span className="chatcut-reference-name">{reference.name}</span>
          <button type="button" disabled={Boolean(stage)} aria-label={`${copy.removeAttachment}: ${reference.name}`} onClick={() => setSessions(items => items.map(item => item.id !== activeId ? item : { ...item, mentions: (item.mentions || []).filter(mention => mention.assetId !== reference.assetId) }))}><X size={12} /></button>
        </div>;
      })}</div>}
      <textarea onPaste={event => {
        if (!onPasteFiles || stage || speech.active || !activeId) return;
        const files = getChatCutClipboardFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        const imported = onPasteFiles(files) || [];
        if (imported.length) setSessions(items => items.map(item => item.id !== activeId ? item : { ...item, mentions: [...(item.mentions || []), ...imported.map(asset => ({ token: `@「${asset.name.replace(/[「」\n\r]/g, " ")}」`, assetId: asset.assetId || asset.id, selected: true }))].slice(-64) }));
        const text = event.clipboardData.getData("text/plain");
        if (text) {
          const start = event.target.selectionStart, end = event.target.selectionEnd;
          const next = input.slice(0, start) + text.slice(0, Math.max(0, 4000 - input.length + end - start)) + input.slice(end);
          setInput(next);
        }
        setTrigger(null);
      }} ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={Boolean(trigger) && !stage} aria-controls={trigger && !stage ? "chatcut-completions" : undefined} aria-activedescendant={trigger && !stage && options.length ? `chatcut-option-${Math.min(optionIndex, options.length - 1)}` : undefined} aria-label={copy.title} placeholder={composerCopy.placeholder} value={input} maxLength={4000} disabled={Boolean(stage) || speech.active || !activeId} onChange={event => { setInput(event.target.value); if (!composing.current) updateTrigger(event.target); }} onSelect={event => { if (!composing.current) updateTrigger(event.target); }} onBlur={() => setTrigger(null)} onCompositionStart={() => { composing.current = true; setTrigger(null); }} onCompositionEnd={event => { composing.current = false; updateTrigger(event.target); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
        if (trigger) {
          if (event.key === "Escape") { event.preventDefault(); setTrigger(null); return; }
          if (options.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOptionIndex(index => (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length); return; }
          if (options.length && (event.key === "Tab" || event.key === "Enter" && !event.shiftKey)) { event.preventDefault(); chooseOption(options[Math.min(optionIndex, options.length - 1)]); return; }
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); setTrigger(null); return; }
        }
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
        event.preventDefault();
        if (!event.repeat) void send(event);
      }} />
      {trigger && !stage && <div className="chatcut-completions" id="chatcut-completions" role="listbox" aria-label={trigger.kind === "asset" ? composerCopy.mention : composerCopy.info}>
        <div className="chatcut-completions-heading">{trigger.kind === "asset" ? composerCopy.mention : composerCopy.info}</div>
        {options.length ? options.map((option, index) => <button type="button" role="option" aria-selected={index === Math.min(optionIndex, options.length - 1)} id={`chatcut-option-${index}`} key={option.id} onPointerDown={event => event.preventDefault()} onClick={() => chooseOption(option)}>
          {option.asset ? <>{option.asset.thumbnail || option.asset.type === "image" ? <img src={option.asset.thumbnail || option.asset.src} alt="" /> : <Waveform size={20} />}<span>{option.label}</span></> : <><code>{option.label}</code><span>{option.description}</span></>}
        </button>) : <p>{trigger.kind === "asset" ? composerCopy.noAssets : composerCopy.noCommands}</p>}
      </div>}
      {speech.supported && speech.status && <p className={`chatcut-speech-status${["denied", "error", "empty"].includes(speech.status) ? " is-error" : ""}`} role="status" aria-live="polite">{speech.active && <Microphone size={14} />}{speech.interim || copy[`speech_${speech.status}`]}</p>}
      <div className="chatcut-composer-toolbar">
        <button type="button" className="chatcut-import" disabled={Boolean(stage)} onClick={onImport}><Paperclip size={19} />{copy.importMedia}</button>
        <button type="button" className="chatcut-info" aria-label={composerCopy.info} aria-expanded={infoOpen} onClick={() => { setTrigger(null); setInfoOpen(value => !value); }}><Info size={18} /></button>
        <div className="chatcut-send">{speech.supported && <button type="button" className={`chatcut-microphone${speech.active ? " is-listening" : ""}`} disabled={Boolean(stage) || speech.status === "stopping"} onClick={speech.active ? speech.stop : speech.start} aria-label={speech.active ? copy.voiceStop : copy.voiceInput} title={speech.active ? copy.voiceStop : copy.voiceInput} aria-pressed={speech.active}>{speech.active ? <Stop size={19} /> : <Microphone size={19} />}</button>}{stage ? <button type="button" onClick={() => controller.current?.abort()} aria-label={copy.stop} title={copy.stop}><Stop size={20} /></button> : <button type="submit" disabled={speech.active || !activeId || !getChatCutCommand(input).instruction || editor.view?.status === "pending"} aria-label={copy.send} title={copy.send}><PaperPlaneTilt size={21} /></button>}</div>
      </div>
      {infoOpen && <div className="chatcut-info-copy">{["@", "image", "remotion"].map(value => <button type="button" key={value} disabled={Boolean(stage) || speech.active || !activeId} onClick={() => startShortcut(value)}><code>{value === "@" ? "@" : `/${value}`}</code><span>{composerCopy[value === "@" ? "mention" : value]}</span></button>)}</div>}
    </form>
  </aside>;
}
