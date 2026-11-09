import { extractVideoTrackFrames, getVisualDimensions, loadImage } from "./media.js";
import { MEMORY_VORTEX_TEXTURE } from "./projectedBeatEffects.js";
import { MEMORY_VORTEX_ID } from "./projectedBeatTemplates.js";
import { getVisualSourceTime } from "./visualEffects.js";

export async function prepareMemoryVortexIntro(shots, { signal, onProgress, name }) {
  const { columns, rows, tileWidth, tileHeight } = MEMORY_VORTEX_TEXTURE;
  if (shots.length !== columns * rows) throw new Error("Incomplete vortex material.");
  const canvas = document.createElement("canvas");
  canvas.width = columns * tileWidth;
  canvas.height = rows * tileHeight;
  const context = canvas.getContext("2d", { alpha: false });
  const groups = new Map();
  shots.forEach((shot, index) => {
    const key = shot.blob instanceof Blob ? shot.blob : shot.src;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ shot, index });
  });

  let completed = 0;
  const draw = (visual, index) => {
    signal?.throwIfAborted();
    const { width, height } = getVisualDimensions(visual);
    const scale = Math.max(tileWidth / width, tileHeight / height);
    const sw = tileWidth / scale, sh = tileHeight / scale;
    context.drawImage(visual, (width - sw) / 2, (height - sh) / 2, sw, sh,
      index % columns * tileWidth, Math.floor(index / columns) * tileHeight, tileWidth, tileHeight);
    completed += 1;
    onProgress?.(Math.round(completed / shots.length * 97));
  };
  for (const [key, items] of groups) {
    signal?.throwIfAborted();
    const { shot: asset } = items[0];
    if (asset.type === "video") {
      const times = items.map(({ shot }) => Math.round(getVisualSourceTime(shot, shot.duration / 2) * 1000) / 1000);
      const unique = [...new Set(times)].sort((a, b) => a - b);
      const frames = await extractVideoTrackFrames(key, {
        width: asset.width, height: asset.height, duration: asset.trackFrameDuration,
        sampleTimes: unique, maxFrames: unique.length, yieldEveryFrames: 6, signal,
      });
      if (frames.length !== unique.length) throw new Error("Incomplete vortex video frames.");
      const byTime = new Map(unique.map((time, index) => [time, frames[index].src]));
      const bySource = new Map();
      items.forEach(({ index }, itemIndex) => {
        const src = byTime.get(times[itemIndex]);
        if (!bySource.has(src)) bySource.set(src, []);
        bySource.get(src).push(index);
      });
      for (const [src, indices] of bySource) {
        signal?.throwIfAborted();
        const image = await loadImage(src);
        indices.forEach((index) => draw(image, index));
      }
    } else {
      const image = key instanceof Blob ? await createImageBitmap(key) : await loadImage(key);
      try {
        items.forEach(({ index }) => draw(image, index));
      } finally {
        image.close?.();
      }
    }
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  signal?.throwIfAborted();
  if (!blob?.size) throw new Error("Could not encode vortex material.");
  onProgress?.(100);
  return {
    id: crypto.randomUUID(), type: "image", name, blob, width: canvas.width, height: canvas.height,
    generatedBy: MEMORY_VORTEX_ID, personalized: true,
  };
}
