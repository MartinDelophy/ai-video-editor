import { useEffect, useRef, useState } from "react";

export const CHATCUT_SPEECH_LANGUAGES = { zh: "zh-CN", en: "en-US", ja: "ja-JP", ko: "ko-KR", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR", th: "th-TH", vi: "vi-VN", ru: "ru-RU", it: "it-IT", id: "id-ID" };
export function getChatCutSpeechConstructor() {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (policy?.allowsFeature && !policy.allowsFeature("microphone")) return null;
  const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return typeof Constructor === "function" ? Constructor : null;
}

/** One user-initiated dictation session. Final words enter the draft, never send it. */
export function useChatCutSpeech({ language, input, setInput }) {
  const [supported, setSupported] = useState(() => Boolean(getChatCutSpeechConstructor()));
  const [status, setStatus] = useState("");
  const [interim, setInterim] = useState("");
  const recognition = useRef(null);
  const timer = useRef(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const active = ["starting", "listening", "stopping"].includes(status);
  useEffect(() => {
    const cancel = () => {
      const current = recognition.current;
      recognition.current = null;
      clearTimeout(timer.current);
      if (current) { current.onresult = current.onerror = current.onend = current.onstart = null; try { current.abort(); } catch { /* Already ended. */ } }
    };
    const hidden = () => { if (document.hidden) { cancel(); setStatus(""); setInterim(""); } };
    document.addEventListener("visibilitychange", hidden);
    return () => { cancel(); document.removeEventListener("visibilitychange", hidden); };
  }, [language]);
  // Language changes end the previous session before starting another one.
  useEffect(() => { setStatus(""); setInterim(""); }, [language]);
  const stop = () => {
    if (!recognition.current) return;
    setStatus("stopping");
    try { recognition.current.stop(); } catch { recognition.current.abort(); }
  };
  const start = () => {
    if (recognition.current) return;
    const Constructor = getChatCutSpeechConstructor();
    if (!Constructor) { setSupported(false); return; }
    const base = inputRef.current;
    let finalText = "";
    let current;
    try { current = new Constructor(); } catch { setSupported(false); return; }
    recognition.current = current;
    current.lang = CHATCUT_SPEECH_LANGUAGES[language] || "en-US";
    current.continuous = true;
    current.interimResults = true;
    current.maxAlternatives = 1;
    const valid = () => recognition.current === current;
    current.onstart = () => { if (valid()) setStatus("listening"); };
    current.onresult = event => {
      if (!valid()) return;
      let pending = "";
      // The result list is cumulative. Rebuild rather than duplicate updated hypotheses.
      finalText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0]?.transcript || "";
        else pending += result[0]?.transcript || "";
      }
      const separator = base && finalText && !/\s$/.test(base) ? " " : "";
      setInput((base + separator + finalText).slice(0, 4000));
      setInterim(pending.slice(0, 300));
    };
    current.onerror = event => {
      if (!valid()) return;
      setInterim("");
      const code = event.error;
      setStatus(["not-allowed", "service-not-allowed"].includes(code) ? "denied" : code === "no-speech" ? "empty" : code === "aborted" ? "" : "error");
    };
    current.onend = () => {
      if (!valid()) return;
      recognition.current = null;
      clearTimeout(timer.current);
      setInterim("");
      setStatus(previous => ["starting", "listening", "stopping"].includes(previous) ? (finalText.trim() ? "" : "empty") : previous);
    };
    setStatus("starting");
    setInterim("");
    try {
      // Keep start inside the user's click, before any asynchronous permission/probe work.
      current.start();
      timer.current = setTimeout(() => { if (valid()) stop(); }, 60000);
    } catch (error) {
      recognition.current = null;
      setStatus(error.name === "NotAllowedError" ? "denied" : "error");
    }
  };
  return { supported, active, status, interim, start, stop };
}
