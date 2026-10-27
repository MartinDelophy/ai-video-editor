import { createDetailProcessor } from "./detailEnhancementProcessor.js";
import { enhanceRemasterClip } from "./remasterClipEnhancement.js";

function abortError() { return new DOMException("Detail enhancement canceled", "AbortError"); }

export async function restoreDetailImage({ segment, settings, signal, onProgress }) {
  const processor = createDetailProcessor(signal, onProgress);
  try {
    const response = await fetch(segment.src, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await processor.frame({ bitmap: await createImageBitmap(await response.blob()), settings });
  } finally { processor.dispose(); }
}

export async function restoreDetailVideo({ segment, settings, signal, onProgress }) {
  const processor = createDetailProcessor(signal, onProgress);
  try {
    const response = segment.blob instanceof Blob ? null : await fetch(segment.src, { signal });
    if (response && !response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = segment.blob instanceof Blob ? segment.blob : await response.blob();
    const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    let frameRate = 30;
    try {
      const track = await input.getPrimaryVideoTrack();
      if (track) frameRate = Math.max(1, Math.min(60, Number((await track.computePacketStats(120)).averagePacketRate) || 30));
    } finally { input.dispose(); }
    if (signal?.aborted) throw abortError();
    return await enhanceRemasterClip({
      segment: { ...segment, blob }, frameRate, signal, onProgress, preserveResolution: true, requireSourceAudio: true,
      frameEnhancer: async ({ bitmap, outputType }) => {
        const result = await processor.frame({ bitmap, settings, outputType });
        if (signal?.aborted) { result.bitmap?.close(); throw abortError(); }
        return result;
      },
    });
  } finally { processor.dispose(); }
}
