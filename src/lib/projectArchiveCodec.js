import { Unzip, UnzipInflate, zipSync } from "fflate";

const ARCHIVE_CHUNK_BYTES = 1024 * 1024;

export function readArchiveBlobBuffer(blob) {
  if (typeof blob?.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("无法读取工程文件"));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(blob);
  });
}

/** Keep only one compressed chunk and the current inflater on the JS heap. */
export async function unpackProjectArchive(file, { onProgress } = {}) {
  let lastProgressAt = 0;
  let lastProgressPercent = -1;
  const reportProgress = (loaded) => {
    if (!onProgress) return;
    const now = performance.now();
    const percent = file.size > 0 ? Math.floor(loaded / file.size * 100) : 0;
    if (loaded > 0 && loaded < file.size
      && (percent === lastProgressPercent || now - lastProgressAt < 100)) return;
    lastProgressAt = now;
    lastProgressPercent = percent;
    onProgress({ phase: "archive", loaded, total: file.size });
  };
  reportProgress(0);
  // Streaming readers can finish all local entries in a truncated archive.
  // Retain the old central-directory completeness check before accepting it.
  const tail = new DataView(await readArchiveBlobBuffer(file.slice(Math.max(0, file.size - 65558))));
  let directoryFound = false;
  for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
    if (tail.getUint32(offset, true) === 0x06054b50
      && offset + 22 + tail.getUint16(offset + 20, true) <= tail.byteLength) {
      directoryFound = true;
      break;
    }
  }
  if (!directoryFound) throw new Error("无效工程包");
  const files = new Map();
  let archiveError = null;
  let pendingFiles = 0;
  const unzip = new Unzip((entry) => {
    const parts = [];
    pendingFiles += 1;
    entry.ondata = (error, chunk, final) => {
      if (error) { archiveError = error; return; }
      // Blob parts release the inflater's typed arrays between input chunks;
      // assembling the completed file shares these immutable backing stores.
      if (chunk?.length) parts.push(new Blob([chunk]));
      if (final) {
        files.set(entry.name, new Blob(parts));
        parts.length = 0;
        pendingFiles -= 1;
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < file.size; offset += ARCHIVE_CHUNK_BYTES) {
    const end = Math.min(file.size, offset + ARCHIVE_CHUNK_BYTES);
    unzip.push(new Uint8Array(await readArchiveBlobBuffer(file.slice(offset, end))), end === file.size);
    if (archiveError) throw archiveError;
    // Report bytes only after they have actually been read and decompressed.
    reportProgress(end);
  }
  if (pendingFiles) throw new Error("无效工程包");
  const metadata = files.get("project.json");
  if (!metadata) throw new Error("缺少 project.json");
  const payload = JSON.parse(new TextDecoder().decode(await readArchiveBlobBuffer(metadata)));
  if (payload?.format !== "timeline-studio-archive" || !payload.project) throw new Error("无效工程包");
  const mediaBlobs = new Map();
  const getBlob = (entry) => {
    if (!entry?.path || !files.has(entry.path)) return null;
    const key = `${entry.path}\u0000${entry.type || "application/octet-stream"}`;
    if (!mediaBlobs.has(key)) {
      const blob = files.get(entry.path);
      mediaBlobs.set(key, blob.slice(0, blob.size, entry.type || "application/octet-stream"));
    }
    return mediaBlobs.get(key);
  };
  return {
    payload,
    visualMedia: new Map((payload.media?.visuals || []).map((entry) => [entry.id, { ...entry, blob: getBlob(entry) }])),
    audioSegmentMedia: new Map((payload.media?.audioSegments || []).map((entry) => [entry.id, { ...entry, blob: getBlob(entry) }])),
    audio: getBlob(payload.media?.audio),
    sourceAudio: getBlob(payload.media?.sourceAudio),
    music: getBlob(payload.media?.music),
  };
}

export async function packProjectArchive(files) {
  const buffers = {};
  for (const [path, blob] of Object.entries(files)) {
    buffers[path] = new Uint8Array(await readArchiveBlobBuffer(blob));
  }
  return new Blob([zipSync(buffers, { level: 6 })], { type: "application/zip" });
}
