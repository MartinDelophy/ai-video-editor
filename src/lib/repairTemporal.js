import { repairReferenceTimes, sameRepairScene, rankRepairReference } from "./repairReferences.js";
import { repairNeighborTimes, combineRepairNeighbors } from "./repairNeighbors.js";
// One bounded worker per repair job; reuse the existing pinned OpenCV runtime.
// Guides always come from original media, never from previously generated frames.
export function createTemporalRepair({ video, seek, frameSource, regions, resolveSelection, sourceStart, sourceDuration, playbackRate, signal }) {
  const scenes = new Map();
  const sceneCanvas = new OffscreenCanvas(48, 27), sceneContext = sceneCanvas.getContext("2d", { willReadFrequently: true });
  const signature = (source) => { sceneContext.drawImage(source, 0, 0, 48, 27); return sceneContext.getImageData(0, 0, 48, 27).data; };
  const saveScene = (time, data) => {
    scenes.set(Math.round(time * 1e6), data);
    if (scenes.size > 128) scenes.delete(scenes.keys().next().value);
    return data;
  };
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
  const readCrop = async (time, crop) => {
    const decoded = await frameSource?.bitmapAt(sourceStart + time);
    if (decoded) {
      try { return { bitmap: await createImageBitmap(decoded.bitmap, crop.x, crop.y, crop.width, crop.height),
        time: decoded.timestamp - sourceStart, scene: saveScene(decoded.timestamp - sourceStart, signature(decoded.bitmap)) }; }
      finally { decoded.bitmap.close(); }
    }
    await seek(video, sourceStart + time, signal);
    return { bitmap: await createImageBitmap(video, crop.x, crop.y, crop.width, crop.height), time, scene: saveScene(time, signature(video)) };
  };
  const sceneAt = async (time) => {
    const frames = frameSource?.frames || [];
    let lo = 0, hi = frames.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (frames[mid].timestamp <= sourceStart + time + 1e-7) lo = mid + 1; else hi = mid; }
    const actual = frames[lo - 1]?.timestamp - sourceStart;
    const cached = scenes.get(Math.round(actual * 1e6));
    if (cached) return cached;
    const decoded = await frameSource?.bitmapAt(sourceStart + time);
    if (decoded) {
      try { return saveScene(decoded.timestamp - sourceStart, signature(decoded.bitmap)); }
      finally { decoded.bitmap.close(); }
    }
    await seek(video, sourceStart + time, signal);
    return saveScene(time, signature(video));
  };
  const sameShot = async (targetFrame, referenceFrame) => {
    if (!sameRepairScene(targetFrame.scene, referenceFrame.scene)) return false;
    const direction = Math.sign(referenceFrame.time - targetFrame.time);
    let previous = targetFrame.scene;
    // Check intermediate original frames too: matching endpoints can hide A→B→A cuts.
    let tick = direction > 0 ? Math.floor(targetFrame.time * 4) + 1 : Math.ceil(targetFrame.time * 4) - 1;
    while (direction * (referenceFrame.time - tick / 4) > 0) {
      if (signal?.aborted) throw abortError();
      const next = await sceneAt(tick / 4);
      if (!sameRepairScene(previous, next)) return false;
      previous = next; tick += direction;
    }
    return sameRepairScene(previous, referenceFrame.scene);
  };
  return {
    async guide(selection, time) {
      if (disabled) return null;
      if (signal?.aborted) throw abortError();
      const width = video.videoWidth, height = video.videoHeight;
      const rect = { x: Math.floor(selection.x * width + 1e-7), y: Math.floor(selection.y * height + 1e-7),
        width: Math.ceil((selection.x + selection.width) * width - 1e-7) - Math.floor(selection.x * width + 1e-7),
        height: Math.ceil((selection.y + selection.height) * height - 1e-7) - Math.floor(selection.y * height + 1e-7) };
      const pad = Math.max(64, Math.round(Math.max(rect.width, rect.height) * 0.65));
      const crop = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad) };
      crop.width = Math.min(width, rect.x + rect.width + pad) - crop.x;
      crop.height = Math.min(height, rect.y + rect.height + pad) - crop.y;
      const box = { ...rect, x: rect.x - crop.x, y: rect.y - crop.y };
      let target;
      try {
        const targetFrame = await readCrop(time, crop);
        target = targetFrame.bitmap;
        const guides = [];
        const nearby = repairNeighborTimes(frameSource?.frames || [], targetFrame.time, sourceStart, sourceDuration);
        for (const referenceTime of nearby) {
          const referenceFrame = await readCrop(referenceTime, crop);
          const reference = referenceFrame.bitmap;
          if (Math.abs(referenceFrame.time - targetFrame.time) < 0.000002 || !sameRepairScene(targetFrame.scene, referenceFrame.scene)) { reference.close(); continue; }
          const result = await compare({ target: await createImageBitmap(target), reference,
            width: crop.width, height: crop.height, box,
            targetMasks: masksAt(targetFrame.time, crop), referenceMasks: masksAt(referenceFrame.time, crop) });
          if (result) guides.push({ rgba: new Uint8ClampedArray(result.rgba), coverage: new Uint8Array(result.coverage) });
        }
        const near = combineRepairNeighbors(guides, rect.width, rect.height);
        const covered = near.coverage.reduce((sum, value) => sum + (value ? 1 : 0), 0);
        if (covered / near.coverage.length >= 0.5) return near;
        const small = new OffscreenCanvas(48, 48), ctx = small.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(target, 0, 0, 48, 48);
        const targetPixels = ctx.getImageData(0, 0, 48, 48).data;
        const scaled = (r) => ({ x: r.x * 48 / crop.width, y: r.y * 48 / crop.height,
          width: r.width * 48 / crop.width, height: r.height * 48 / crop.height });
        const shortlist = [];
        const distant = [];
        try {
          for (const referenceTime of repairReferenceTimes(frameSource?.frames || [], targetFrame.time, sourceStart, sourceDuration, nearby)) {
            const frame = await readCrop(referenceTime, crop);
            let retained = false;
            try {
              if (!sameRepairScene(targetFrame.scene, frame.scene)) continue;
              ctx.drawImage(frame.bitmap, 0, 0, 48, 48);
              const rank = rankRepairReference(targetPixels, ctx.getImageData(0, 0, 48, 48).data, 48, scaled(box),
                masksAt(targetFrame.time, crop).map(scaled), masksAt(frame.time, crop).map(scaled));
              if (!rank) continue;
              const side = Math.sign(frame.time - targetFrame.time);
              const item = { frame, score: rank.score, side };
              shortlist.push(item); retained = true;
              const group = shortlist.filter((entry) => entry.side === side).sort((a, b) => a.score - b.score || Math.abs(a.frame.time - time) - Math.abs(b.frame.time - time));
              if (group.length > 2) {
                const removed = group.at(-1); shortlist.splice(shortlist.indexOf(removed), 1); removed.frame.bitmap.close();
              }
            } finally { if (!retained) frame.bitmap.close(); }
          }
          shortlist.sort((a, b) => a.score - b.score);
          for (const { frame } of shortlist) {
            if (!(await sameShot(targetFrame, frame))) continue;
            const result = await compare({ target: await createImageBitmap(target), reference: await createImageBitmap(frame.bitmap),
              width: crop.width, height: crop.height, box,
              targetMasks: masksAt(targetFrame.time, crop), referenceMasks: masksAt(frame.time, crop) });
            if (result) distant.push({ rgba: new Uint8ClampedArray(result.rgba), coverage: new Uint8Array(result.coverage) });
          }
        } finally { shortlist.forEach(({ frame }) => frame.bitmap.close()); }
        // Farther evidence must agree across two independently aligned originals.
        // Never let a far candidate veto already reliable immediate-neighbor pixels.
        const far = combineRepairNeighbors(distant, rect.width, rect.height, 2);
        for (let i = 0; i < near.coverage.length; i++) {
          if (near.coverage[i] || !far.coverage[i]) continue;
          near.coverage[i] = 255; near.rgba.set(far.rgba.subarray(i * 4, i * 4 + 4), i * 4);
        }
        return near;
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
