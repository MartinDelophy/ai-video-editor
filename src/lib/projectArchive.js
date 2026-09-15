import { normalizeTrackLocks, normalizeTrackVisibility } from "./projectTrackState.js";
import { normalizeTimelineMarkers } from "./timelineMarkers.js";
import { packProjectArchive, unpackProjectArchive } from "./projectArchiveCodec.js";

export const PROJECT_ARCHIVE_FORMAT = "timeline-studio-archive";
export const PROJECT_ARCHIVE_VERSION = 3;
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

function runArchiveOperation(operation, input, { onProgress } = {}) {
  const fallback = () => operation === "pack" ? packProjectArchive(input) : unpackProjectArchive(input, { onProgress });
  if (typeof Worker === "undefined") return fallback();
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("../workers/project-archive.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        if (data.type === "progress") {
          onProgress?.(data.progress);
          return;
        }
        worker.terminate();
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        worker.terminate();
        fallback().then(resolve, reject);
      };
      // Files/Blobs are immutable and structured-cloned without copying all
      // media bytes onto the UI thread before the worker can start.
      worker.postMessage({ operation, input });
    } catch {
      worker?.terminate();
      fallback().then(resolve, reject);
    }
  });
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
export async function createProjectArchive({ project, visualSegments = [], audioSegments = [], audio, sourceAudio, music }) {
  const files = {};
  const media = { visuals: [], audioSegments: [], audio: null, sourceAudio: null, music: null };

  for (let index = 0; index < visualSegments.length; index += 1) {
    const segment = visualSegments[index];
    if (!segment?.src && !segment?.blob) continue;
    const blob = await blobForSource(segment.src, segment.blob);
    if (!blob) continue;
    const path = `media/visuals/${String(index + 1).padStart(3, "0")}-${safeName(segment.name, "visual")}.${extensionFor(blob, segment.type === "video" ? "mp4" : "png")}`;
    files[path] = blob;
    media.visuals.push({ id: segment.id, path, name: segment.name || "素材", type: blob.type, size: blob.size });
  }

  for (let index = 0; index < audioSegments.length; index += 1) {
    const segment = audioSegments[index];
    const blob = await blobForSource(segment?.url, segment?.blob);
    if (!segment?.id || !blob) continue;
    const path = `media/audio/voice-${String(index + 1).padStart(3, "0")}-${safeName(segment.name, "voiceover")}.${extensionFor(blob, "wav")}`;
    files[path] = blob;
    media.audioSegments.push({ id: segment.id, path, name: segment.name || "配音", type: blob.type, size: blob.size });
  }

  for (const [key, track] of Object.entries({ audio, sourceAudio, music })) {
    if (key === "audio" && media.audioSegments.length) continue;
    if (!(track?.blob instanceof Blob)) continue;
    const path = `media/audio/${key}-${safeName(track.name, key)}.${extensionFor(track.blob, "webm")}`;
    files[path] = track.blob;
    media[key] = { path, name: track.name || key, type: track.blob.type, size: track.blob.size };
  }

  const normalizedProject = {
    ...project,
    timelineMarkers: normalizeTimelineMarkers(project?.timelineMarkers),
    trackVisibility: normalizeTrackVisibility(project?.trackVisibility),
    trackLocks: normalizeTrackLocks(project?.trackLocks),
  };
  const payload = {
    format: PROJECT_ARCHIVE_FORMAT,
    version: PROJECT_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    project: normalizedProject,
    media,
  };
  files[PROJECT_FILE] = new Blob([JSON.stringify(payload)], { type: "application/json" });
  return runArchiveOperation("pack", files);
}

/** Read and validate a portable project archive. Returns metadata plus media Blobs. */
export async function readProjectArchive(file, { onProgress } = {}) {
  const archive = await runArchiveOperation("unpack", file, { onProgress });
  const { payload } = archive;
  payload.project = { ...payload.project, timelineMarkers: normalizeTimelineMarkers(payload.project.timelineMarkers) };
  return archive;
}
