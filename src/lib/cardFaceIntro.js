import { CARD_ROTATION_INTRO_SECONDS, CARD_ROTATION_MEDIA } from "./cardRotationTemplate.js";

async function getBlob(src, signal) {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error("Could not load card intro media.");
  const blob = await response.blob();
  if (!blob.size || blob.type === "text/html") throw new Error("Missing card intro media.");
  return blob;
}

export async function renderCardFaceIntro(faceAssets, { signal, onProgress } = {}) {
  const sources = new Map();
  const faces = faceAssets.map((asset) => {
    const key = asset.blob instanceof Blob ? asset.blob : asset.src;
    if (!sources.has(key)) sources.set(key, { index: sources.size, asset });
    return sources.get(key).index;
  });
  const [stage, ...media] = await Promise.all([
    getBlob(`${CARD_ROTATION_MEDIA}/stage.mp4`, signal),
    ...Array.from(sources.values(), async ({ asset }) => ({
      type: asset.type,
      blob: asset.blob instanceof Blob ? asset.blob : await getBlob(asset.src, signal),
    })),
  ]);

  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/cardFaceIntro.worker.js", import.meta.url), { type: "module" });
    const finish = (callback, value) => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      callback(value);
    };
    const abort = () => finish(reject, signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.blob) finish(resolve, data.blob);
      else if (data.error) finish(reject, new Error(data.error));
      else if (typeof data.progress === "number") onProgress?.(data.progress);
    };
    worker.onerror = (event) => finish(reject, new Error(event.message || "Card intro worker failed."));
    worker.onmessageerror = () => finish(reject, new Error("Card intro worker result could not be read."));
    const fps = 30;
    try {
      worker.postMessage({ stage, media, faces, fps, frameCount: Math.round(CARD_ROTATION_INTRO_SECONDS * fps) });
    } catch (error) {
      finish(reject, error);
    }
  });
}
