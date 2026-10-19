import { getAnnaVoiceSample } from "./annaVoiceSamples.js";
import { connectAnna } from "./annaRuntime.js";

const abortError = () => new DOMException("Cancelled", "AbortError");
const check = (signal) => {
  if (signal?.aborted) throw abortError();
};
export function normalizeAnnaTtsCatalog(response) {
  return (Array.isArray(response?.models) ? response.models : []).flatMap((model) => {
    if (typeof model.modelName !== "string") return [];
    const caps = model.capabilities || {};
    return [
      {
        id: model.modelName,
        name: model.displayName || model.modelName,
        preferred: model.isUserPreferred === true,
        voices: (Array.isArray(caps.voices) ? caps.voices : [])
          .filter((v) => typeof v.id === "string")
          .map((v) => ({ sampleUrl: getAnnaVoiceSample(model.modelName, v.id), id: v.id, name: v.displayName || v.name || v.id, language: typeof v.language === "string" ? v.language : "", languageCode: typeof v.languageCode === "string" ? v.languageCode : "" })),
        defaultVoice: caps.defaultVoice || "",
        maxChars:
          Number(caps.maxCharsPerCall) > 0 ? Math.min(10000, Number(caps.maxCharsPerCall)) : 1000,
      },
    ];
  });
}
export async function loadAnnaTtsCatalog(signal) {
  const runtime = await connectAnna({ signal });
  check(signal);
  const response = await runtime.llm.catalog({ serviceType: "tts" });
  check(signal);
  return normalizeAnnaTtsCatalog(response);
}
async function audioBytes(response, signal) {
  const mime = response.mimeType || "audio/mpeg";
  if (!/^audio\//.test(mime)) throw new Error("Invalid audio result");
  if (typeof response.audioBase64 === "string") {
    if (response.audioBase64.length > 40 * 1024 * 1024) throw new Error("Audio result too large");
    const binary = atob(response.audioBase64);
    return new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], { type: mime });
  }
  const url = new URL(response.url);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Invalid audio URL");
  const result = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
  });
  if (!result.ok || !result.body) throw new Error("Audio download failed");
  const reader = result.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 30 * 1024 * 1024) throw new Error("Audio result too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!size) throw new Error("Empty audio result");
  return new Blob(chunks, { type: mime });
}
export async function synthesizeAnnaSpeech({ text, model, voice, language, signal }) {
  const runtime = await connectAnna({ signal });
  check(signal);
  const result = await runtime.audio.speak(
    { text, model, ...(voice ? { voice } : {}), language, format: "mp3", delivery: "inline" },
    { timeoutMs: 120000 },
  );
  check(signal);
  const blob = await audioBytes(result, signal);
  check(signal);
  return { blob, model: result.model || model };
}

/** Opens ASR only. No LLM, TTS playback or automatic message submission. */
export async function openAnnaDictation({
  signal,
  language,
  onPartial,
  onFinal,
  onError,
  onEnded,
}) {
  const runtime = await connectAnna({ signal });
  check(signal);
  if (typeof runtime.audio?.session !== "function" || typeof runtime.audio?.mic !== "function")
    throw new Error("Voice session unavailable");
  let session,
    closed = false,
    sending = false,
    flushTimer;
  const mic = runtime.audio.mic({
    sampleRate: 16000,
    onChunk: (pcm) => {
      if (sending && !closed) session?.sendAudio(pcm);
    },
    onError,
  });
  const close = () => {
    if (closed) return;
    closed = true;
    sending = false;
    clearTimeout(flushTimer);
    mic.stop();
    signal?.removeEventListener("abort", close);
    session?.end().catch(() => {});
  };
  signal?.addEventListener("abort", close, { once: true });
  try {
    mic.setMuted(true);
    await mic.start();
    if (closed || signal?.aborted) {
      mic.stop();
      throw abortError();
    }
    session = await runtime.audio.session({ llm: "none", language, maxDurationSec: 75 });
    if (closed || signal?.aborted) {
      session.end().catch(() => {});
      throw abortError();
    }
    session.on("asr_partial", (event) => {
      if (!closed) onPartial(event.text || "");
    });
    session.on("asr_final", (event) => {
      if (!closed) onFinal(event.text || "");
    });
    session.on("asr_paused", () => {
      if (!sending && !closed) {
        close();
        onEnded();
      }
    });
    session.on("error", (event) => {
      if (!closed) {
        close();
        onError(event);
      }
    });
    session.on("ended", () => {
      if (!closed) {
        close();
        onEnded();
      }
    });
    sending = true;
    mic.setMuted(false);
    return {
      close,
      stop: () => {
        if (closed) return;
        sending = false;
        mic.setMuted(true);
        mic.stop();
        session.flushAudio();
        flushTimer = setTimeout(() => {
          if (!closed) {
            close();
            onError(new Error("Final transcript timed out"));
          }
        }, 12000);
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
