import { isAnnaEdition } from "../lib/annaRuntime.js";
import { getGenerationAdapter } from "../plugins/generation/adapters.js";
import { useEffect, useRef } from "react";
import { supportsFileSpeech } from "../lib/browserFileSpeech.js";
import { processTimelineAi } from "../lib/timelineAiProcessing.js";

export function useTimelineAiProcessor({ imageUrlRefs, voiceBusy = false }) {
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
  const generateImage = async ({ prompt, aspectRatio, sourceAsset, signal }) => {
    const result = await getGenerationAdapter("anna").generate({ request: { mode: sourceAsset ? "image-to-image" : "text-to-image", referenceAssets: sourceAsset ? [sourceAsset] : [], prompt, aspectRatio: aspectRatio || "16:9" }, signal });
    const assets = result.outputs.map(output => { const src = URL.createObjectURL(output.blob); imageUrlRefs.current.add(src); return { id: crypto.randomUUID(), type: "image", kind: "generated-image", name: output.fileName, blob: output.blob, src, originalSrc: src, width: output.width, height: output.height, generated: true, prompt, generation: output.provenance }; });
    return { assets };
  };
  const generateAnimation = async input => {
    const { generateAnimationAssets } = await import("../lib/renderAnimation.js");
    return generateAnimationAssets(input, src => imageUrlRefs.current.add(src));
  };
  const discard = asset => { if (asset?.src) { URL.revokeObjectURL(asset.src); imageUrlRefs.current.delete(asset.src); } };
  const release = () => { if (audio.current?.state === "running") void audio.current.suspend().catch(() => {}); };
  return { generateAnimation, generateImage, prepare, release, process, discard, supports: () => ({ animation: typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined", image: isAnnaEdition, narration: Boolean(navigator.gpu) && !voiceBusy, pauses: typeof Worker !== "undefined" && typeof AudioDecoder !== "undefined", captions: supportsFileSpeech(), watermark: typeof VideoDecoder !== "undefined" && typeof OffscreenCanvas !== "undefined" && Boolean(navigator.gpu) }) };
}
