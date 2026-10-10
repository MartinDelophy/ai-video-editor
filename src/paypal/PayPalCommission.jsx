import { useState } from "react";
import { X, CreditCard } from "@phosphor-icons/react";
import { CompetitionAssistant } from "../competition/CompetitionAssistant.jsx";
import { paypalCopy } from "./copy.js";
import "./paypal.css";
const SESSION = "timeline-paypal-sandbox-session";
function restore() { try { const r = JSON.parse(sessionStorage.getItem(SESSION)); return r?.id && r?.token ? r : null; } catch { return null; } }
export function PayPalCommission({ agent, language }) {
  const c = paypalCopy(language);
  const [record, setRecord] = useState(restore);
  const [brief, setBrief] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [ratio, setRatio] = useState("9:16");
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function request(action, event) {
    event?.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/paypal/${action}`, { method: "POST", headers: { "Content-Type": "application/json", ...(record ? { Authorization: `Bearer ${record.token}` } : {}) }, body: JSON.stringify(action === "quote" ? { brief, seconds: Number(seconds), ratio } : { id: record.id }), signal: AbortSignal.timeout(55000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const next = { ...data, token: data.token || record?.token };
      // Payment state is always refreshed from the server before enabling the assistant.
      sessionStorage.setItem(SESSION, JSON.stringify({ id: next.id, token: next.token })); setRecord(next);
      if (action === "create" && next.approvalUrl && next.status !== "paid") window.location.assign(next.approvalUrl);
    } catch (failure) { setError(c[failure.message] || c.error); } finally { setBusy(false); }
  }
  if (editing) return <CompetitionAssistant agent={agent} language={language} initialPrompt={`${record.ratio}\n${record.brief}`} />;
  if (!open) return <button className="competition-launch" onClick={() => setOpen(true)}><CreditCard size={18} />{c.title}</button>;
  return <aside className="competition-assistant paypal-commission" aria-label={c.title}>
    <header><CreditCard size={20} /><div><strong>{c.title}</strong><small>{c.sandbox}</small></div><button aria-label={c.close} onClick={() => setOpen(false)}><X size={18} /></button></header>
    <div className="paypal-body">
      <p>{c.privacy}</p>
      {!record ? <form onSubmit={(event) => request("quote", event)}>
        <label>{c.brief}<textarea required maxLength={2000} rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} disabled={busy} /></label>
        <label>{c.seconds}<input type="number" min="5" max="180" step="1" required value={seconds} onChange={(e) => setSeconds(e.target.value)} disabled={busy} /></label>
        <label>{c.ratio}<select value={ratio} onChange={(e) => setRatio(e.target.value)} disabled={busy}>{["16:9","9:16","1:1","4:5"].map((r) => <option key={r}>{r}</option>)}</select></label>
        <p>{c.pricing}</p><button disabled={busy || !brief.trim()}>{c.quote}</button>
      </form> : <>
        {record.amount ? <><p className="paypal-price">{c.price}: {record.amount} USD</p><p>{record.brief}</p><p>{record.seconds}s · {record.ratio}</p><p role="status">{c[record.status]}</p><small>{record.orderId || record.id}</small></> : null}
        <div className="paypal-actions">
          {record.status === "paid" ? <button disabled={busy} onClick={() => setEditing(true)}>{c.edit}</button> : <>
            <button disabled={busy} onClick={() => request(record.orderId ? "capture" : record.amount ? "create" : "status")}>{record.orderId ? c.confirm : record.amount ? c.pay : c.confirm}</button>
            {record.approvalUrl ? <button disabled={busy} onClick={() => window.location.assign(record.approvalUrl)}>{c.pay}</button> : null}
          </>}
          <button disabled={busy} onClick={() => { sessionStorage.removeItem(SESSION); setRecord(null); setError(""); }}>{c.newOrder}</button>
        </div>
      </>}
      {error ? <p className="competition-error" role="alert">{error}</p> : null}
    </div>
  </aside>;
}
