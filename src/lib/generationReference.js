/** Decode a still locally; never pass an entire video as an image reference. */
export async function prepareGenerationReference(asset, time = 0, signal) {
  if (!(asset?.blob instanceof Blob)) throw new Error("reference_unavailable");
  if (asset.type === "image") return asset;
  if (asset.type !== "video" || !Number.isFinite(time) || time < 0) throw new Error("invalid_reference");
  const video = document.createElement("video");
  const url = URL.createObjectURL(asset.blob);
  video.muted = true; video.preload = "auto"; video.playsInline = true;
  const wait = event => new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener("error", failed); signal?.removeEventListener("abort", aborted); };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("reference_decode_failed")); };
    const aborted = () => { cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = setTimeout(failed, 20000);
    video.addEventListener(event, done, { once: true }); video.addEventListener("error", failed, { once: true }); signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
  try {
    const loaded = wait("loadeddata"); video.src = url; await loaded;
    const target = Math.min(time, Math.max(0, video.duration - 0.001));
    if (Math.abs(video.currentTime - target) > 0.0001) { const sought = wait("seeked"); video.currentTime = target; await sought; }
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    if (!canvas.width || !canvas.height) throw new Error("reference_decode_failed");
    canvas.getContext("2d").drawImage(video, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("reference_decode_failed");
    return { ...asset, type: "image", blob, width: canvas.width, height: canvas.height, referenceTime: target };
  } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}
