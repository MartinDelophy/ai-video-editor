import { puter } from "@heyputer/puter.js";
import {
  extensionForImageMime,
  normalizeImageBlob,
  readMediaBlob,
  waitForVideoMetadata,
} from "../../host.js";

const AUTH_TIMEOUT_MS = 45_000;
const VIDEO_SOURCE_KEYS = ["src", "currentSrc", "url", "asset_url", "assetUrl", "href", "download_url", "downloadUrl"];
const VIDEO_CONTAINER_KEYS = ["result", "output", "data", "video", "file", "media"];

function createAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function waitForAuth(authPromise, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => (value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    const timeoutId = window.setTimeout(
      finish(reject),
      AUTH_TIMEOUT_MS,
      createAuthError("auth_timeout", "Puter did not return the authorization result in time."),
    );
    const onAbort = finish(reject).bind(null, createAuthError("auth_cancelled", "Puter sign-in was cancelled."));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(authPromise).then(finish(resolve), finish(reject));
  });
}

function isVideoElement(value) {
  return Boolean(value && typeof value.addEventListener === "function" && ("src" in value || "currentSrc" in value));
}

async function extractVideoSource(value, seen = new Set(), depth = 0) {
  if (!value || depth > 4) return null;
  if (typeof value === "string") return value.trim() || null;
  if (value instanceof Blob) return value;
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (typeof value.blob === "function") {
    try {
      const blob = await value.blob();
      if (blob instanceof Blob) return blob;
    } catch {
      // Some provider wrappers expose blob() before their body is ready.
    }
  }
  for (const key of VIDEO_SOURCE_KEYS) {
    const source = value[key];
    if (typeof source === "string" && source.trim()) return source.trim();
    if (source instanceof Blob) return source;
  }
  for (const key of VIDEO_CONTAINER_KEYS) {
    const source = await extractVideoSource(value[key], seen, depth + 1);
    if (source) return source;
  }
  return null;
}

async function normalizeVideoResult(result) {
  if (isVideoElement(result)) return { video: result, source: result.currentSrc || result.src, blob: null, revoke: null };
  const extracted = await extractVideoSource(result);
  if (!extracted) {
    const shape = result && typeof result === "object" ? Object.keys(result).slice(0, 8).join(", ") : typeof result;
    throw new Error(`Puter returned an unsupported video response${shape ? ` (${shape})` : ""}.`);
  }
  const blob = extracted instanceof Blob ? extracted : null;
  const source = blob ? URL.createObjectURL(blob) : extracted;
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = source;
  return { video, source, blob, revoke: blob ? () => URL.revokeObjectURL(source) : null };
}

export function createPuterAdapter() {
  return {
    connect({ signal }) {
      let authPromise;
      try {
        authPromise = puter.auth.isSignedIn() ? Promise.resolve() : puter.auth.signIn({ request_auth: true });
      } catch (error) {
        authPromise = Promise.reject(error);
      }
      return (async () => {
        await waitForAuth(authPromise, signal);
        return { state: "connected", user: await puter.auth.getUser(), endpoint: "" };
      })();
    },

    async disconnect() {
      try {
        if (puter.auth.isSignedIn()) await puter.auth.signOut();
      } catch {
        // Clearing the editor state must not depend on remote sign-out.
      }
    },

    async generate({ request }) {
      const prompt = String(request.prompt || "").trim();
      if (request.mode === "text-to-image") {
        const isXai = String(request.model).startsWith("grok-");
        const outputPath = isXai ? `generated-images/${crypto.randomUUID()}.jpg` : "";
        let storedBlob = null;
        try {
          const image = await puter.ai.txt2img(prompt, {
            model: request.model,
            ...(isXai ? { provider: "xai", puter_output_path: outputPath } : {}),
          });
          const source = image.currentSrc || image.src;
          if (outputPath) {
            try { storedBlob = await puter.fs.read(outputPath); } catch { /* Use the direct output while it is alive. */ }
          }
          storedBlob ||= await readMediaBlob(source);
          if (!storedBlob) throw new Error("The generated image could not be downloaded before its temporary URL expired.");
          const decoded = await normalizeImageBlob(storedBlob);
          return { outputs: [{
            type: "image",
            blob: decoded.blob,
            mimeType: decoded.mimeType,
            fileName: `${prompt.slice(0, 34) || "Puter generation"}.${extensionForImageMime(decoded.mimeType)}`,
            width: decoded.width,
            height: decoded.height,
            prompt,
            providerLabel: `Puter.js · ${request.model}`,
            provenance: { provider: "Puter.js", model: request.model, generatedAt: new Date().toISOString() },
          }] };
        } finally {
          if (outputPath) puter.fs.delete(outputPath).catch(() => {});
        }
      }
      const ratio = request.ratio || "16:9";
      const duration = Number(request.duration);
      const size = ratio === "9:16" ? "720x1280" : "1280x720";
      const result = await puter.ai.txt2vid(prompt, { model: request.model, seconds: duration, size });
      const normalized = await normalizeVideoResult(result);
      try {
        await waitForVideoMetadata(normalized.video);
        const blob = normalized.blob || await readMediaBlob(normalized.source);
        if (!blob) throw new Error("The generated video could not be downloaded before its temporary URL expired.");
        return { outputs: [{
          type: "video",
          blob,
          mimeType: blob.type || "video/mp4",
          fileName: `${prompt.slice(0, 34) || "Puter generation"}.mp4`,
          durationSeconds: Number.isFinite(normalized.video.duration) ? normalized.video.duration : duration,
          width: normalized.video.videoWidth || (ratio === "9:16" ? 720 : 1280),
          height: normalized.video.videoHeight || (ratio === "9:16" ? 1280 : 720),
          prompt,
          providerLabel: `Puter.js · ${request.model}`,
          provenance: { provider: "Puter.js", model: request.model, generatedAt: new Date().toISOString() },
        }] };
      } finally {
        normalized.revoke?.();
      }
    },
  };
}
