import { useEffect, useRef, useState } from "react";
import { loadAnnaTtsCatalog, synthesizeAnnaSpeech } from "../lib/annaAudio.js";
import { decodeWaveform } from "../lib/media.js";

export function useAnnaSpeech({ enabled, language, script, gain, onAssetReady }) {
  const [models, setModels] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const active = useRef(null);
  const resultUrl = useRef("");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setStatus("loading");
    loadAnnaTtsCatalog(controller.signal).then(items => {
      if (controller.signal.aborted) return;
      setModels([...items].sort((a, b) => Number(b.preferred) - Number(a.preferred)));
      setStatus(items.length ? "" : "empty");
    }).catch(error => {
      if (!controller.signal.aborted) setStatus(/grant|permission/i.test(`${error.code || ""} ${error.message || ""}`) ? "grant" : "catalogFailed");
    });
    return () => controller.abort();
  }, [enabled, retry]);
  useEffect(() => () => { active.current?.abort(); if (resultUrl.current) URL.revokeObjectURL(resultUrl.current); }, []);
  const configuredModels = models.some(model => model.preferred) ? models.filter(model => model.preferred) : models.slice(0, 1);
  const voices = configuredModels.flatMap(model => (model.voices.length ? model.voices : [{ id: model.defaultVoice, name: model.name }]).map(voice => ({
    ...voice, key: JSON.stringify([model.id, voice.id]), model,
    avatar: ["jade", "amber", "violet"][[...`${model.id}/${voice.id}`].reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) >>> 0, 0) % 3],
  })));
  const selected = voices.find(voice => voice.key === selectedKey);
  const select = setSelectedKey;
  const generate = async () => {
    if (active.current || !selected || !script.trim()) return;
    if (script.trim().length > selected.model.maxChars) return setStatus("tooLong");
    const controller = new AbortController(); active.current = controller; setStatus("running");
    const timeout = setTimeout(() => controller.abort(), 135000);
    try {
      const output = await synthesizeAnnaSpeech({ text: script.trim(), model: selected.model.id, voice: selected.id, language, signal: controller.signal });
      const { applyVoiceOutputGain } = await import("../lib/openVoiceRuntime.js");
      output.blob = await applyVoiceOutputGain(output.blob, gain);
      if (controller.signal.aborted) return;
      const decoded = await decodeWaveform(output.blob, 118);
      if (controller.signal.aborted) return;
      await onAssetReady({ ...output, decoded, name: `Anna · ${selected.name}` });
      if (controller.signal.aborted) return;
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      resultUrl.current = URL.createObjectURL(output.blob);
      setResult({ blob: output.blob, url: resultUrl.current }); setStatus("saved");
    } catch (error) {
      if (!controller.signal.aborted) setStatus(/grant|permission/i.test(`${error.code || ""} ${error.message || ""}`) ? "grant" : "failed");
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) { active.current = null; setStatus(value => value === "running" ? "" : value); }
    }
  };
  return { voices, selected, select, sampleUrl: selected?.sampleUrl || "", status, result, generate, busy: status === "running", retry: () => setRetry(value => value + 1), cancel: () => active.current?.abort() };
}
