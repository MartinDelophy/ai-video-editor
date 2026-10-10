import { useEffect, useRef, useState } from "react";
import { ChatCircleText, PaperPlaneTilt, X, Stop } from "@phosphor-icons/react";
import { competitionCopy } from "./copy.js";
import { captureCompetitionContext, planLocalCommand, validateCompetitionPlan } from "./planner.js";
import "./competition.css";

export function CompetitionAssistant({ agent, language, initialPrompt = "", initialMode = "local", onClose }) {
  const c = competitionCopy(language);
  if (["/nebius", "/paypal"].includes(window.location.pathname.replace(/\/$/, ""))) c.badge = c.cloud;
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState(initialMode);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [consent, setConsent] = useState(false);
  const controller = useRef(null);
  const log = useRef(null);
  const input = useRef(null);
  const appliedReceipt = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages, error, pending]);
  useEffect(() => {
    if (agent.view?.status === "applied" && appliedReceipt.current !== agent.view.transactionId) {
      appliedReceipt.current = agent.view.transactionId;
      setMessages((current) => [...current, { role: "assistant", content: c.applied }].slice(-40));
    }
    // The actual transaction status is the receipt, not the planner's response.
  }, [agent.view?.transactionId, agent.view?.status, c.applied]);

  const submit = async (event) => {
    event.preventDefault();
    if (controller.current || !prompt.trim() || (mode === "cloud" && !consent) || agent.view?.status === "pending") return;
    const abort = new AbortController();
    controller.current = abort;
    const content = prompt.trim();
    const conversation = [...messages, { role: "user", content }].slice(-12);
    setMessages(conversation); setPrompt(""); setPending(true); setError("");
    try {
      const context = await captureCompetitionContext(agent.execute, abort.signal);
      let plan;
      if (mode === "local") plan = planLocalCommand(content, context);
      else {
        const response = await fetch("/api/competition/plan", {
          method: "POST", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(135000)]),
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ messages: conversation, context, experience: window.location.pathname.replace(/\/$/, "") === "/paypal" ? "paypal" : undefined }),
        });
        if (!response.ok) throw new Error("cloudError");
        plan = validateCompetitionPlan(await response.json());
      }
      if (abort.signal.aborted) return;
      if (plan.operations.length) {
        const preview = await agent.execute("timeline_edit_preview", { stateToken: context.stateToken, operations: plan.operations, summary: content }, { signal: abort.signal });
        if (!preview?.ok) throw new Error(preview?.error?.message || "failed");
        setMessages((current) => [...current, { role: "assistant", content: c.review }].slice(-40));
      } else setMessages((current) => [...current, { role: "assistant", content: plan.reply }].slice(-40));
    } catch (failure) {
      if (!abort.signal.aborted) setError(c[failure.message] || (mode === "local" && ["unsupported", "missingMusic", "cannotTrim", "needClips"].includes(failure.message) ? c.help : agent.t("failed")));
    } finally { controller.current = null; setPending(false); }
  };
  const blocked = pending || agent.working || agent.view?.status === "pending";
  if (!open) return <button className="competition-launch" onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}><ChatCircleText size={18} />{c.title}</button>;
  return <aside className="competition-assistant" aria-label={c.title}>
    <header><ChatCircleText size={20} /><div><strong>{c.title}</strong><small>{c.badge}</small></div><button type="button" aria-label={agent.t("close")} onClick={() => { if (onClose) onClose(); else setOpen(false); }}><X size={18} /></button></header>
    <div className="competition-modes">{["local", "cloud"].map((value) => <button type="button" key={value} aria-pressed={mode === value} disabled={blocked} onClick={() => { setMode(value); setError(""); }}>{c[value]}</button>)}</div>
    <div className="competition-log" role="log" aria-live="polite" ref={log}>
      <p className="competition-intro">{c.intro}</p>
      {messages.map((message, index) => <p key={index} className={`competition-message is-${message.role}`}>{message.content}</p>)}
      {pending ? <p role="status">{agent.t("aiPreparing")}</p> : null}
      {error ? <p className="competition-error" role="alert">{error}</p> : null}
    </div>
    <form onSubmit={submit}>
      {mode === "local" ? <p className="competition-help">{c.help}</p> : <><p className="competition-help">{c.privacy}</p><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={c.token} aria-label={c.token} autoComplete="off" disabled={pending} /><label className="competition-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={pending} />{c.consent}</label></>}
      <textarea ref={input} aria-label={c.prompt} placeholder={c.prompt} maxLength={2000} rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={blocked} />
      <div className="competition-actions">{pending ? <button type="button" onClick={() => controller.current?.abort()}><Stop size={15} />{agent.t("aiCancel")}</button> : <button type="submit" disabled={blocked || !prompt.trim() || mode === "cloud" && !consent}><PaperPlaneTilt size={16} />{c.send}</button>}</div>
    </form>
  </aside>;
}
