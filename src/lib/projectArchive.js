import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const PROJECT_ARCHIVE_FORMAT = "timeline-studio-archive";
export const PROJECT_ARCHIVE_VERSION = 2;
const PROJECT_FILE = "project.json";

export function resolveProjectVisualMedia(visualMedia, segment) {
  return visualMedia.get(segment?.id) || visualMedia.get(segment?.archiveMediaId) || visualMedia.get(segment?.assetId) || null;
}

function readWithFileReader(file, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("无法读取工程文件"));
    reader.onload = () => resolve(reader.result);
    if (mode === "text") reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export async function readProjectFileAsText(file) {
  return typeof file?.text === "function" ? file.text() : readWithFileReader(file, "text");
}

async function readProjectFileAsArrayBuffer(file) {
  return typeof file?.arrayBuffer === "function" ? file.arrayBuffer() : readWithFileReader(file, "arrayBuffer");
}

function extensionFor(blob, fallback = "bin") {
  const type = blob?.type || "";
  const known = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm",
  };
  return known[type] || fallback;
}

function safeName(name, fallback) {
  return String(name || fallback).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 96) || fallback;
}

async function blobForSource(source, blob) {
  if (blob instanceof Blob) return blob;
  if (!source) return null;
  const response = await fetch(source);
  if (!response.ok) throw new Error("无法读取媒体素材");
  return response.blob();
}

/** Create a portable .timeline archive with media binaries and project metadata. */
export async function createProjectArchive({ project, visualSegments = [], audio, sourceAudio, music }) {
  const files = {};
  const media = { visuals: [], audio: null, sourceAudio: null, music: null };

  for (let index = 0; index < visualSegments.length; index += 1) {
    const segment = visualSegments[index];
    if (!segment?.src && !segment?.blob) continue;
    const blob = await blobForSource(segment.src, segment.blob);
    if (!blob) continue;
    const path = `media/visuals/${String(index + 1).padStart(3, "0")}-${safeName(segment.name, "visual")}.${extensionFor(blob, segment.type === "video" ? "mp4" : "png")}`;
    files[path] = new Uint8Array(await blob.arrayBuffer());
    media.visuals.push({ id: segment.id, path, name: segment.name || "素材", type: blob.type, size: blob.size });
  }

  for (const [key, track] of Object.entries({ audio, sourceAudio, music })) {
    if (!(track?.blob instanceof Blob)) continue;
    const path = `media/audio/${key}-${safeName(track.name, key)}.${extensionFor(track.blob, "webm")}`;
    files[path] = new Uint8Array(await track.blob.arrayBuffer());
    media[key] = { path, name: track.name || key, type: track.blob.type, size: track.blob.size };
  }

  const payload = {
    format: PROJECT_ARCHIVE_FORMAT,
    version: PROJECT_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    media,
  };
  files[PROJECT_FILE] = strToU8(JSON.stringify(payload));
  return new Blob([zipSync(files, { level: 6 })], { type: "application/zip" });
}

/** Read and validate a portable project archive. Returns metadata plus media Blobs. */
export async function readProjectArchive(file) {
  const files = unzipSync(new Uint8Array(await readProjectFileAsArrayBuffer(file)));
  if (!files[PROJECT_FILE]) throw new Error("缺少 project.json");
  const payload = JSON.parse(strFromU8(files[PROJECT_FILE]));
  if (payload?.format !== PROJECT_ARCHIVE_FORMAT || !payload.project) throw new Error("无效工程包");
  const getBlob = (entry) => entry?.path && files[entry.path]
    ? new Blob([files[entry.path]], { type: entry.type || "application/octet-stream" })
    : null;
  return {
    payload,
    visualMedia: new Map((payload.media?.visuals || []).map((entry) => [entry.id, { ...entry, blob: getBlob(entry) }])),
    audio: getBlob(payload.media?.audio),
    sourceAudio: getBlob(payload.media?.sourceAudio),
    music: getBlob(payload.media?.music),
  };
}
