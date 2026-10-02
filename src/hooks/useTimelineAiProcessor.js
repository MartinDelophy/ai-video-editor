import { useEffect, useRef } from "react";
import { supportsFileSpeech } from "../lib/browserFileSpeech.js";
import { processTimelineAi } from "../lib/timelineAiProcessing.js";

export function useTimelineAiProcessor({ imageUrlRefs }) {
  const audio = useRef(null);
  useEffect(() => () => { audio.current?.close(); audio.current = null; }, []);
  // Called synchronously by ChatCut's Send activation, before the LLM request.
  const prepare = () => {
    if (!supportsFileSpeech()) return;
    const context = audio.current?.state !== "closed" && audio.current || new (window.AudioContext || window.webkitAudioContext)();
    audio.current = context;
    void context.resume().catch(() => {});
  };
  const process = input => processTimelineAi({ ...input, audioContext: audio.current, retainUrl: src => imageUrlRefs.current.add(src) });
  const discard = asset => { if (asset?.src) { URL.revokeObjectURL(asset.src); imageUrlRefs.current.delete(asset.src); } };
  const release = () => { if (audio.current?.state === "running") void audio.current.suspend().catch(() => {}); };
  return { prepare, release, process, discard, supports: () => ({ pauses: typeof Worker !== "undefined" && typeof AudioDecoder !== "undefined", captions: supportsFileSpeech(), watermark: typeof VideoDecoder !== "undefined" && typeof OffscreenCanvas !== "undefined" && Boolean(navigator.gpu) }) };
}
