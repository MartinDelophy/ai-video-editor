// One bounded worker per repair job; reuse the existing pinned OpenCV runtime.
// Guides always come from original media, never from previously generated frames.
export function createTemporalRepair({ video, seek, regions, resolveSelection, sourceStart, sourceDuration, playbackRate, signal }) {
  let worker = null;
  let disabled = false;
  let pendingAbort = null;
  const stop = () => { worker?.terminate(); worker = null; };
  const abortError = () => new DOMException("Repair canceled", "AbortError");
  const compare = (payload) => new Promise((resolve, reject) => {
    if (signal?.aborted) { payload.target.close(); payload.reference.close(); reject(abortError()); return; }
    try { worker ||= new Worker(new URL("../workers/repairTemporal.worker.js", import.meta.url)); }
    catch (error) { payload.target.close(); payload.reference.close(); reject(error); return; }
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); pendingAbort = null; };
    const abort = () => { cleanup(); stop(); reject(abortError()); };
    pendingAbort = abort;
    const timer = setTimeout(() => { cleanup(); stop(); reject(new Error("Temporal repair timed out")); }, 15000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { cleanup(); data.error ? reject(new Error(data.error)) : resolve(data.result); };
    worker.onerror = () => { cleanup(); stop(); reject(new Error("Temporal repair unavailable")); };
    try { worker.postMessage(payload, [payload.target, payload.reference]); }
    catch (error) { cleanup(); payload.target.close(); payload.reference.close(); reject(error); }
  });
  const masksAt = (time, crop) => regions.map((region) => {
    // Conservatively exclude every marked region, even outside its active range:
    // an unselected time range is not evidence that the watermark has disappeared.
    const box = resolveSelection(region, Math.max(region.start, Math.min(region.end, time / playbackRate)));
    return { x: box.x * video.videoWidth - crop.x, y: box.y * video.videoHeight - crop.y,
      width: box.width * video.videoWidth, height: box.height * video.videoHeight };
  });
  return {
    async guide(selection, time) {
      if (disabled) return null;
      if (signal?.aborted) throw abortError();
      const width = video.videoWidth, height = video.videoHeight;
      const rect = { x: Math.floor(selection.x * width), y: Math.floor(selection.y * height),
        width: Math.ceil((selection.x + selection.width) * width) - Math.floor(selection.x * width),
        height: Math.ceil((selection.y + selection.height) * height) - Math.floor(selection.y * height) };
      const pad = Math.max(64, Math.round(Math.max(rect.width, rect.height) * 0.65));
      const crop = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad) };
      crop.width = Math.min(width, rect.x + rect.width + pad) - crop.x;
      crop.height = Math.min(height, rect.y + rect.height + pad) - crop.y;
      const box = { ...rect, x: rect.x - crop.x, y: rect.y - crop.y };
      let target;
      try {
        await seek(video, sourceStart + time, signal);
        target = await createImageBitmap(video, crop.x, crop.y, crop.width, crop.height);
        const guides = [];
        for (const offset of [-0.24, 0.24]) {
          const referenceTime = time + offset;
          if (referenceTime < 0 || referenceTime >= sourceDuration) continue;
          await seek(video, sourceStart + referenceTime, signal);
          const reference = await createImageBitmap(video, crop.x, crop.y, crop.width, crop.height);
          const result = await compare({ target: await createImageBitmap(target), reference,
            width: crop.width, height: crop.height, box,
            targetMasks: masksAt(time, crop), referenceMasks: masksAt(referenceTime, crop) });
          if (result) guides.push({ rgba: new Uint8ClampedArray(result.rgba), coverage: new Uint8Array(result.coverage) });
        }
        if (!guides.length) return null;
        const rgba = new Uint8ClampedArray(rect.width * rect.height * 4);
        const coverage = new Uint8Array(rect.width * rect.height);
        for (let i = 0; i < coverage.length; i++) {
          const candidates = guides.filter((guide) => guide.coverage[i]);
          if (!candidates.length) continue;
          if (candidates.length === 2 && [0, 1, 2].some((c) => Math.abs(candidates[0].rgba[i * 4 + c] - candidates[1].rgba[i * 4 + c]) > 24)) continue;
          for (let c = 0; c < 3; c++) rgba[i * 4 + c] = candidates.reduce((sum, guide) => sum + guide.rgba[i * 4 + c], 0) / candidates.length;
          rgba[i * 4 + 3] = 255; coverage[i] = 255;
        }
        return { rgba, coverage, width: rect.width, height: rect.height };
      } catch (error) {
        if (signal?.aborted || error.name === "AbortError") throw error;
        disabled = true; stop();
        console.info("Temporal guide unavailable; retaining model repair.", error);
        return null;
      } finally { target?.close(); }
    },
    dispose() { pendingAbort?.(); stop(); },
  };
}

export function blendTemporalGuide(pixels, guide, width, height) {
  if (!guide || guide.width !== width || guide.height !== height) return 0;
  let reused = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (!guide.coverage[index]) continue;
    // Feather only the guide boundary, never average unrelated neighboring frames.
    let distance = 3;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !guide.coverage[ny * width + nx]) distance = Math.min(distance, Math.max(Math.abs(dx), Math.abs(dy)));
    }
    const alpha = distance / 3;
    for (let channel = 0; channel < 3; channel++) pixels[index * 4 + channel] = pixels[index * 4 + channel] * (1 - alpha) + guide.rgba[index * 4 + channel] * alpha;
    reused++;
  }
  return reused;
}
