const remoteAssetCache = new Map();

export function clearRemoteAssetCache() {
  remoteAssetCache.clear();
}

export async function getRemoteAssetBlob(asset, onProgress) {
  if (asset?.blob) return asset.blob;
  if (!asset?.src || !/^https?:/i.test(asset.src)) return null;
  const key = asset.src;
  const cached = remoteAssetCache.get(key);
  if (cached?.blob) { onProgress?.(1); return cached.blob; }
  if (cached?.promise) { cached.listeners.add(onProgress); return cached.promise; }

  const listeners = new Set(onProgress ? [onProgress] : []);
  const entry = { blob: null, listeners, promise: null };
  entry.promise = (async () => {
    const response = await fetch(key, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error(String(response.status));
    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body) return response.blob();
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.byteLength;
      const progress = total ? Math.min(0.98, received / total) : 0.45;
      entry.listeners.forEach((listener) => listener?.(progress));
    }
    return new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
  })().then((blob) => {
    entry.blob = blob; entry.listeners.forEach((listener) => listener?.(1)); return blob;
  }).catch((error) => { remoteAssetCache.delete(key); throw error; });
  remoteAssetCache.set(key, entry);
  return entry.promise;
}
