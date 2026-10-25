import { annaMusicCall } from "../../../../lib/annaRuntime.js";

const terminal = new Set(["failed", "cancelled", "expired"]);
export function buildAnnaMusicRequest(model, draft, idempotencyKey) {
  const c = model?.capabilities;
  if (!c || !model.modelName) throw new Error("unavailable");
  const prompt = draft.prompt.trim();
  if (prompt.length < (c.promptMinChars || 1) || prompt.length > (c.promptMaxChars || 4000)) throw new Error("invalid");
  const request = { model: model.modelName, prompt, idempotencyKey, clientTag: "timeline-studio-music" };
  if (c.instrumentalOnly) request.instrumental = true;
  else if (c.lyrics) {
    request.instrumental = Boolean(draft.instrumental);
    if (!draft.instrumental && draft.lyrics.trim()) {
      if (draft.lyrics.length > (c.lyricsMaxChars || 10000)) throw new Error("invalid");
      request.lyrics = draft.lyrics.trim(); // The official host embeds lyrics for prompt_embedded providers.
    }
  }
  if (request.prompt.length > (c.promptMaxChars || 4000)) throw new Error("invalid");
  if (c.duration?.type === "range") {
    const seconds = Number(draft.durationSec || c.duration.default || c.duration.min);
    if (!Number.isInteger(seconds) || seconds < c.duration.min || seconds > c.duration.max) throw new Error("invalid");
    request.durationSec = seconds;
  }
  if (c.formats?.includes(draft.format)) request.format = draft.format;
  return request;
}
export async function generateAnnaMusicOutput(request, signal) {
  const { submission, jobId, onJob, onState } = request;
  const created = jobId ? { jobId } : await annaMusicCall("generate", submission, { signal });
  if (!created.jobId) throw new Error("invalid_result");
  await onJob?.(created.jobId);
  const deadline = Date.now() + 20 * 60 * 1000;
  while (!signal?.aborted && Date.now() < deadline) {
    const job = await annaMusicCall("getJob", { jobId: created.jobId }, { signal });
    onState?.(job);
    if (terminal.has(job.state)) throw Object.assign(new Error(job.state), { code: job.error?.code || job.state });
    if (job.state === "succeeded") {
      const download = async view => {
        const url = new URL(view.result?.url);
        if (url.protocol !== "https:") throw new Error("invalid_result");
        return fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
      };
      let response = await download(job);
      if (response.status === 403) response = await download(await annaMusicCall("getJob", { jobId: job.jobId }, { signal }));
      if (!response.ok) throw new Error("download_failed");
      const bytes = await response.blob();
      const mime = job.result?.mimeType;
      if (!bytes.size || !["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/mp4"].includes(mime)) throw new Error("invalid_result");
      const blob = new Blob([bytes], { type: mime });
      const extension = mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : mime.includes("flac") ? "flac" : mime.includes("mp4") ? "m4a" : "mp3";
      return { outputs: [{ type: "audio", blob, fileName: `Anna-${job.jobId}.${extension}`, providerLabel: "Anna", prompt: submission.prompt,
        provenance: { provider: "Anna", model: submission.model, jobId: job.jobId, billedCostCU: job.billedCostCU } }] };
    }
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
      const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 2500);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  throw new Error("timeout");
}
