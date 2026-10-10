import { useRef, useState } from "react";
import { paypalCopy } from "./copy.js";
import { deliveryCopy } from "./delivery-copy.js";

const MAX_BYTES = 64 * 1024 * 1024;
async function validateVideo(file) {
  if (!file || !["video/mp4", "video/webm"].includes(file.type)) throw new Error("invalidVideo");
  if (file.size > MAX_BYTES) throw new Error("tooLarge");
  const video = document.createElement("video"); const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("invalidVideo")), 10000);
      video.onloadedmetadata = () => { clearTimeout(timer); video.videoWidth && video.videoHeight && Number.isFinite(video.duration) && video.duration > 0 ? resolve() : reject(new Error("invalidVideo")); };
      video.onerror = () => { clearTimeout(timer); reject(new Error("invalidVideo")); };
      video.preload = "metadata"; video.src = url;
    });
  } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}
export function Delivery({ record, language, setRecord, blocked, onBusy }) {
  const c = deliveryCopy(language);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  async function run(action) {
    if (active.current || blocked) return; active.current = true; setBusy(true); onBusy(true); setError("");
    try {
      if (action === "upload") await validateVideo(file);
      const response = await fetch(`/api/paypal/${action}`, { method: "POST", signal: AbortSignal.timeout(90000), headers: { Authorization: `Bearer ${record.token}`, ...(action === "upload" ? { "Content-Type": file.type, "X-Commission-Id": record.id, "X-File-Name": encodeURIComponent(file.name) } : { "Content-Type": "application/json" }) }, body: action === "upload" ? file : JSON.stringify({ id: record.id }) });
      if (!response.ok) throw new Error((await response.json()).error);
      if (action === "upload") { const data = await response.json(); setRecord({ ...data, token: record.token }); setFile(null); }
      else {
        const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
        link.href = url; link.download = record.delivery.name; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (failure) { setError(c[failure.message] || paypalCopy(language).error); } finally { active.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="paypal-delivery" aria-label={c.title}>
    <h2>{c.title}</h2><p>{c.privacy}</p>
    {record.delivery ? <><p role="status">{c.ready}</p><p>{record.delivery.name} · {Math.max(0.01, record.delivery.bytes / 1024 / 1024).toFixed(2)} MiB</p><button disabled={busy || blocked} onClick={() => run("download")}>{c.download}</button></> : <><label>{c.choose}<input type="file" accept="video/mp4,video/webm" disabled={busy || blocked} onChange={(e) => { setFile(e.target.files?.[0] || null); setError(""); }} /></label><button disabled={busy || blocked || !file} onClick={() => run("upload")}>{c.upload}</button></>}
    {error ? <p role="alert" className="competition-error">{error}</p> : null}
  </section>;
}
