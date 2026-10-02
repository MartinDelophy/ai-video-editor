/** Browser-owned visual inspection. IDs resolve only against already imported assets. */
export const CHATCUT_FRAME_TOOL = {
  name: "timeline_media_frames",
  description: "Inspect an imported image or up to six video frames at absolute source seconds. Inspect assets first. Samples are sparse visual evidence, never speech or exhaustive video analysis. Use when visual evidence is needed for the editing request.",
  inputSchema: { type: "object", additionalProperties: false, required: ["assetId", "times"], properties: {
    assetId: { type: "string" }, times: { type: "array", minItems: 1, maxItems: 6, items: { type: "number", minimum: 0 } },
  } },
};
export async function sampleChatCutMedia(assets, input, { signal } = {}) {
  if (!input || Object.keys(input).some(key => !["assetId", "times"].includes(key)) || !Array.isArray(input.times) || !input.times.length || input.times.length > 6 || input.times.some(time => !Number.isFinite(time) || time < 0)) throw new Error("Invalid sample times");
  const asset = assets.find(item => (item.assetId || item.id) === input.assetId);
  if (!asset || !["video", "image"].includes(asset.type) || asset.preparing || !(asset.blob instanceof Blob)) throw new Error("Visual asset unavailable");
  const check = () => { if (signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };
  check();
  const url = URL.createObjectURL(asset.blob);
  const media = document.createElement(asset.type === "video" ? "video" : "img");
  const wait = (event, action) => new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); media.removeEventListener(event, ready); media.removeEventListener("error", failed); signal?.removeEventListener("abort", aborted); error ? reject(error) : resolve(); };
    const ready = () => finish();
    const failed = () => finish(new Error("Media decode failed"));
    const aborted = () => finish(new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("Media decode timed out")), 15000);
    media.addEventListener(event, ready, { once: true }); media.addEventListener("error", failed, { once: true }); signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted(); else action();
  });
  try {
    if (asset.type === "video") { media.muted = true; media.preload = "auto"; }
    await wait(asset.type === "video" ? "loadeddata" : "load", () => { media.src = url; });
    const times = asset.type === "image" ? [0] : [...new Set(input.times)];
    if (asset.type === "video" && times.some(time => time >= media.duration)) throw new Error("Time outside source duration");
    const width = media.videoWidth || media.naturalWidth;
    const height = media.videoHeight || media.naturalHeight;
    if (!width || !height) throw new Error("Empty media dimensions");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 768 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const frames = [];
    for (const time of times) {
      check();
      if (asset.type === "video" && Math.abs(media.currentTime - time) > 0.00001) await wait("seeked", () => { media.currentTime = time; });
      check();
      canvas.getContext("2d").drawImage(media, 0, 0, canvas.width, canvas.height);
      frames.push({ sourceTime: time, data: canvas.toDataURL("image/jpeg", 0.75) });
    }
    return { assetId: input.assetId, frames };
  } finally {
    if (asset.type === "video") media.pause();
    media.removeAttribute("src");
    if (asset.type === "video") media.load();
    URL.revokeObjectURL(url);
  }
}
