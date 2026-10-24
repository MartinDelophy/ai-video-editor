import { enhanceRemasterClip } from "./remasterClipEnhancement.js";

function abortError() { return new DOMException("Detail enhancement canceled", "AbortError"); }

// One worker per restoration job. Termination cancels pixel work immediately.
function createProcessor(signal) {
  const worker = new Worker(new URL("../workers/detailEnhancement.worker.js", import.meta.url), { type: "module" });
  let rejectActive = null;
  const abort = () => { worker.terminate(); rejectActive?.(abortError()); };
  signal?.addEventListener("abort", abort, { once: true });
  return {
    async frame({ bitmap, settings, outputType = "blob" }) {
      if (signal?.aborted) { bitmap.close(); throw abortError(); }
      return new Promise((resolve, reject) => {
        rejectActive = reject;
        const requestId = crypto.randomUUID();
        worker.onmessage = ({ data }) => {
          if (data.requestId !== requestId) return;
          rejectActive = null;
          if (data.error) reject(new Error(data.error));
          else resolve(data.result);
        };
        worker.onerror = (event) => { rejectActive = null; reject(new Error(event.message)); };
        worker.postMessage({ requestId, bitmap, settings, outputType }, [bitmap]);
      });
    },
    dispose() { signal?.removeEventListener("abort", abort); worker.terminate(); },
  };
}

export async function restoreDetailImage({ segment, settings, signal }) {
  const processor = createProcessor(signal);
  try {
    const response = await fetch(segment.src, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await processor.frame({ bitmap: await createImageBitmap(await response.blob()), settings });
  } finally { processor.dispose(); }
}

export async function restoreDetailVideo({ segment, settings, signal, onProgress }) {
  const processor = createProcessor(signal);
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
