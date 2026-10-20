import { ALL_FORMATS, CustomSource, Input } from "mediabunny";
import { Readable } from "node:stream";
import { HostError } from "../sessions.ts";
import { StorageIOError, type ProjectFiles } from "./files.ts";

export async function inspectMedia(files: ProjectFiles, path: string, sizeBytes: number, includeDuration = false) {
  const chunks: Buffer[] = [];
  for await (const chunk of files.stream(path, 0, Math.min(sizeBytes, 64))) chunks.push(chunk);
  const header = Buffer.concat(chunks);
  const image = (mimeType: string, extension: string) => ({ kind: "image" as const, mimeType, extension, durationSeconds: 0 });
  if (header.length >= 33 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && header.toString("ascii", 12, 16) === "IHDR") return image("image/png", "png");
  if (header.length >= 4 && header[0] === 255 && header[1] === 216 && header[2] === 255) return image("image/jpeg", "jpg");
  if (header.length >= 13 && ["GIF87a", "GIF89a"].includes(header.toString("ascii", 0, 6))) return image("image/gif", "gif");
  if (header.length >= 16 && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return image("image/webp", "webp");
  if (header.length >= 16 && header.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(header.toString("ascii", 8, 12))) return image("image/avif", "avif");
  const streams = new Set<Readable>();
  const source = new CustomSource({ getSize: () => sizeBytes, maxCacheSize: 4 * 1024 * 1024, prefetchProfile: "none",
    read(start, end) {
      const stream = files.stream(path, start, end - start);
      streams.add(stream);
      stream.once("close", () => streams.delete(stream));
      return Readable.toWeb(stream);
    },
    dispose() { for (const stream of streams) stream.destroy(); streams.clear(); },
  });
  const input = new Input({ source, formats: ALL_FORMATS });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; input.dispose(); }, 30_000);
  try {
    const video = await input.getPrimaryVideoTrack(), audio = await input.getPrimaryAudioTrack();
    if (!video && !audio) throw new Error("No audio or video track.");
    const mimeType = (await input.getMimeType()).split(";")[0];
    const extensions: Record<string, string> = { "video/mp4": "mp4", "audio/mp4": "m4a", "video/webm": "webm", "audio/webm": "webm",
      "video/x-matroska": "mkv", "audio/x-matroska": "mka", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
      "audio/ogg": "ogg", "video/ogg": "ogv", "audio/flac": "flac", "audio/aac": "aac", "video/quicktime": "mov" };
    const extension = extensions[mimeType];
    if (!extension) throw new Error("Unsupported media container.");
    const durationSeconds = includeDuration ? await input.computeDuration() : null;
    if (includeDuration && (!Number.isFinite(durationSeconds) || durationSeconds! <= 0)) throw new Error("Invalid media duration.");
    return { kind: video ? "video" as const : "audio" as const, mimeType, extension, durationSeconds };
  } catch (error) {
    if (error instanceof StorageIOError) throw error;
    if (timedOut) throw new HostError("MEDIA_PROBE_TIMEOUT", 503, "Media inspection timed out; retry the operation.");
    throw new HostError("UNSUPPORTED_MEDIA", 400, "The file does not contain a supported readable media container.");
  } finally { clearTimeout(timeout); input.dispose(); }
}

export function mediaRange(header: string | undefined, size: number) {
  if (!header) return { start: 0, length: size, partial: false };
  const invalid = () => new HostError("RANGE_NOT_SATISFIABLE", 416, "The requested media byte range is unavailable.");
  if (!header.startsWith("bytes=") || header.includes(",") || size <= 0) throw invalid();
  const parts = header.slice(6).split("-");
  if (parts.length !== 2 || parts.every(part => !part) || parts.some(part => [...part].some(char => char < "0" || char > "9"))) throw invalid();
  const [first, last] = parts;
  if (!first) {
    const suffix = Number(last);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw invalid();
    const length = Math.min(suffix, size);
    return { start: size - length, length, partial: true };
  }
  const start = Number(first), end = last ? Number(last) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) throw invalid();
  return { start, length: Math.min(end, size - 1) - start + 1, partial: true };
}
