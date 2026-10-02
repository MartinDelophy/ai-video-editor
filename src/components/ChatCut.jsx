import { useEffect, useRef, useState } from "react";
import { ArrowLeft, PaperPlaneTilt, SpinnerGap, Stop, Trash } from "@phosphor-icons/react";
import { getChatCutCopy } from "../i18nChatCut.js";
import { runAnnaChatCut } from "../lib/annaChatCut.js";
import "./ChatCut.css";

export function ChatCut({ language, editor, captureFrame, hasMedia, onClose }) {
  const copy = getChatCutCopy(language);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [attach, setAttach] = useState(false);
  const [stage, setStage] = useState("");
  const controller = useRef(null);
  const mounted = useRef(true);
  const end = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, stage]);
  const send = async (event) => {
    event.preventDefault();
    if (controller.current || !input.trim() || editor.view?.status === "pending") return;
    const instruction = input.trim();
    const abort = new AbortController();
    controller.current = abort;
    setStage("inspecting");
    try {
      const image = attach ? captureFrame() : null;
      if (attach && !image) {
        setMessages(items => [...items, { role: "assistant", text: copy.frameError }]);
        return;
      }
      setMessages(items => [...items, { role: "user", text: instruction }]);
      setInput("");
      const result = await runAnnaChatCut({ instruction, history: messages, tools: editor.tools(), execute: editor.execute, image, language, signal: abort.signal, onStage: value => { if (mounted.current) setStage(value); } });
      if (mounted.current) setMessages(items => [...items, { role: "assistant", text: result.preview ? `${result.text}\n${copy.ready}` : result.text }]);
    } catch {
      if (mounted.current) setMessages(items => [...items, { role: "assistant", text: abort.signal.aborted ? copy.stopped : copy.error }]);
    } finally {
      controller.current = null;
      if (mounted.current) setStage("");
    }
  };
  return <aside className="chatcut" aria-label={copy.title}>
    <header><button type="button" onClick={onClose} aria-label={copy.back} title={copy.back}><ArrowLeft size={18} /></button><strong>{copy.title}</strong><button type="button" disabled={Boolean(stage)} onClick={() => setMessages([])} aria-label={copy.clear} title={copy.clear}><Trash size={17} /></button></header>
    <div className="chatcut-messages" role="log" aria-live="polite">
      {!messages.length && <div className="chatcut-welcome"><h2>{copy.hint}</h2><p>{hasMedia ? copy.placeholder : copy.empty}</p></div>}
      {messages.map((message, index) => <p key={index} className={`chatcut-message is-${message.role}`}>{message.text}</p>)}
      {stage && <p className="chatcut-status" role="status"><SpinnerGap size={18} className="chatcut-spinner" />{copy[stage]}</p>}
      <div ref={end} />
    </div>
    <form onSubmit={send}>
      <label className="chatcut-attach"><input type="checkbox" checked={attach} disabled={Boolean(stage)} onChange={event => setAttach(event.target.checked)} />{copy.attach}</label>
      <textarea aria-label={copy.title} placeholder={copy.placeholder} value={input} maxLength={4000} disabled={Boolean(stage)} onChange={event => setInput(event.target.value)} />
      <div className="chatcut-send">{stage ? <button type="button" onClick={() => controller.current?.abort()}><Stop size={16} />{copy.stop}</button> : <button type="button" onClick={send} disabled={!input.trim() || editor.view?.status === "pending"}><PaperPlaneTilt size={16} />{copy.send}</button>}</div>
      <small>{editor.view?.status === "pending" ? copy.ready : copy.privacy}</small>
    </form>
  </aside>;
}
