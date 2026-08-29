import { useCallback, useEffect, useRef, useState } from "react";
import { puter } from "@heyputer/puter.js";

const PUTER_AUTH_TIMEOUT_MS = 45_000;

function createAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function waitForPuterAuth(authPromise, signal) {
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
      PUTER_AUTH_TIMEOUT_MS,
      createAuthError("auth_timeout", "Puter did not return the authorization result in time."),
    );
    const onAbort = finish(reject).bind(null, createAuthError("auth_cancelled", "Puter sign-in was cancelled."));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(authPromise).then(finish(resolve), finish(reject));
  });
}

function normalizeSpaceInput(value) {
  const input = String(value || "").trim().replace(/\/$/, "");
  if (!input) throw new Error("Enter a Hugging Face Space URL or owner/space ID.");
  if (/^https:\/\/[^/]+\.hf\.space$/i.test(input)) return { embedUrl: input, spaceId: input };
  const pageMatch = input.match(/huggingface\.co\/spaces\/([^/]+\/[^/?#]+)/i);
  const spaceId = pageMatch?.[1] || (/^[\w.-]+\/[\w.-]+$/.test(input) ? input : "");
  if (!spaceId) throw new Error("Use https://huggingface.co/spaces/owner/name or owner/name.");
  return { spaceId };
}

async function resolveSpace(value) {
  const normalized = normalizeSpaceInput(value);
  if (normalized.embedUrl) return normalized;
  const response = await fetch(`https://huggingface.co/api/spaces/${encodeURI(normalized.spaceId)}`);
  if (!response.ok) throw new Error(`Space connection failed (${response.status}).`);
  const metadata = await response.json();
  if (!metadata?.subdomain) throw new Error("This Space does not expose an embeddable app.");
  return {
    spaceId: normalized.spaceId,
    embedUrl: `https://${metadata.subdomain}.hf.space`,
  };
}

async function readMediaBlob(src) {
  if (!src) throw new Error("The provider did not return a media URL.");
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(String(response.status));
    return await response.blob();
  } catch {
    return null;
  }
}

function waitForVideoMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener("loadedmetadata", resolve, { once: true });
    window.setTimeout(resolve, 2500);
  });
}

export function useGenerationPlugins({ imageUrlRefs, notify, setActiveTool, setMediaTab, setSelectedLibraryAssetId, setUserAssets }) {
  const mountedRef = useRef(true);
  const puterAuthAttemptRef = useRef(0);
  const puterAuthAbortRef = useRef(null);
  const [selectedPluginId, setSelectedPluginId] = useState("puter");
  const [connections, setConnections] = useState({
    puter: { state: "disconnected", user: null, error: "" },
    huggingface: { state: "disconnected", spaceId: "", embedUrl: "", error: "" },
  });
  const [job, setJob] = useState({ state: "idle", progress: 0, message: "", assetId: "" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      puterAuthAbortRef.current?.abort();
    };
  }, []);

  const connectPuter = useCallback(() => {
    const attempt = ++puterAuthAttemptRef.current;
    puterAuthAbortRef.current?.abort();
    const controller = new AbortController();
    puterAuthAbortRef.current = controller;

    // signIn must start synchronously inside the click activation. Awaiting even
    // a resolved loader first can make popup behavior browser-dependent.
    let authPromise;
    try {
      authPromise = puter.auth.isSignedIn()
        ? Promise.resolve()
        : puter.auth.signIn({ request_auth: true });
    } catch (error) {
      authPromise = Promise.reject(error);
    }
    setConnections((current) => ({ ...current, puter: { ...current.puter, state: "authorizing", error: "" } }));

    return (async () => {
      try {
        await waitForPuterAuth(authPromise, controller.signal);
        const user = await puter.auth.getUser();
        if (!mountedRef.current || attempt !== puterAuthAttemptRef.current) return;
        setConnections((current) => ({ ...current, puter: { state: "connected", user, error: "", errorCode: "" } }));
      } catch (error) {
        if (error?.code === "auth_cancelled" || !mountedRef.current || attempt !== puterAuthAttemptRef.current) return;
        const errorCode = error?.code || error?.error || "auth_failed";
        setConnections((current) => ({
          ...current,
          puter: {
            ...current.puter,
            state: "error",
            errorCode,
            error: error?.msg || error?.message || String(error),
          },
        }));
        throw error;
      } finally {
        if (puterAuthAbortRef.current === controller) puterAuthAbortRef.current = null;
      }
    })();
  }, []);

  const cancelPuterConnect = useCallback(() => {
    ++puterAuthAttemptRef.current;
    puterAuthAbortRef.current?.abort();
    puterAuthAbortRef.current = null;
    setConnections((current) => ({
      ...current,
      puter: { state: "disconnected", user: null, error: "", errorCode: "" },
    }));
  }, []);

  const disconnectPuter = useCallback(async () => {
    ++puterAuthAttemptRef.current;
    puterAuthAbortRef.current?.abort();
    puterAuthAbortRef.current = null;
    try {
      if (puter.auth.isSignedIn()) await puter.auth.signOut();
    } catch {
      // A local disconnect must still clear the editor connection state.
    }
    setConnections((current) => ({ ...current, puter: { state: "disconnected", user: null, error: "" } }));
    setJob({ state: "idle", progress: 0, message: "", assetId: "" });
  }, []);

  const connectSpace = useCallback(async (spaceInput) => {
    setConnections((current) => ({ ...current, huggingface: { ...current.huggingface, state: "connecting", error: "" } }));
    try {
      const space = await resolveSpace(spaceInput);
      if (!mountedRef.current) return;
      setConnections((current) => ({ ...current, huggingface: { state: "connected", error: "", ...space } }));
    } catch (error) {
      if (!mountedRef.current) return;
      setConnections((current) => ({ ...current, huggingface: { ...current.huggingface, state: "error", error: error?.message || String(error) } }));
      throw error;
    }
  }, []);

  const disconnectSpace = useCallback(() => {
    setConnections((current) => ({ ...current, huggingface: { state: "disconnected", spaceId: "", embedUrl: "", error: "" } }));
  }, []);

  const addVideoAsset = useCallback(async ({ src, blob, name, prompt, provider, duration, width, height }) => {
    const id = crypto.randomUUID();
    const localSrc = blob ? URL.createObjectURL(blob) : src;
    if (blob) imageUrlRefs.current.add(localSrc);
    const asset = {
      id,
      type: "video",
      kind: "generated-video",
      name,
      meta: `${width || 1280}×${height || 720}${duration ? ` · ${duration.toFixed(1)}s` : ""}`,
      src: localSrc,
      previewSrc: localSrc,
      blob: blob || undefined,
      duration: duration || 0,
      width: width || 1280,
      height: height || 720,
      provider,
      generated: true,
      prompt,
    };
    setUserAssets((items) => [asset, ...items]);
    setSelectedLibraryAssetId(id);
    setJob({ state: "complete", progress: 100, message: "saved", assetId: id });
    notify?.("生成结果已加入 My assets");
    return id;
  }, [imageUrlRefs, notify, setSelectedLibraryAssetId, setUserAssets]);

  const addImageAsset = useCallback(async ({ src, blob, name, prompt, provider, width, height }) => {
    const id = crypto.randomUUID();
    const localSrc = blob ? URL.createObjectURL(blob) : src;
    if (blob) imageUrlRefs.current.add(localSrc);
    const asset = {
      id,
      type: "image",
      kind: "generated-image",
      name,
      meta: `${width || 1024}×${height || 1024}`,
      src: localSrc,
      originalSrc: localSrc,
      blob: blob || undefined,
      width: width || 1024,
      height: height || 1024,
      provider,
      generated: true,
      prompt,
    };
    setUserAssets((items) => [asset, ...items]);
    setSelectedLibraryAssetId(id);
    setJob({ state: "complete", progress: 100, message: "saved", assetId: id });
    notify?.("生成结果已加入 My assets");
    return id;
  }, [imageUrlRefs, notify, setSelectedLibraryAssetId, setUserAssets]);

  const generateWithPuter = useCallback(async ({ mode, prompt, model, duration, ratio }) => {
    if (connections.puter.state !== "connected" || job.state === "running") return;
    setJob({ state: "running", progress: 12, message: "generating", assetId: "" });
    const timer = window.setInterval(() => {
      setJob((current) => current.state === "running" ? { ...current, progress: Math.min(88, current.progress + 2) } : current);
    }, 2400);
    try {
      if (mode === "text-to-image") {
        const image = await puter.ai.txt2img(prompt, { model });
        const source = image.currentSrc || image.src;
        const blob = await readMediaBlob(source);
        if (!mountedRef.current) return;
        await addImageAsset({
          src: source,
          blob,
          name: `${String(prompt).trim().slice(0, 34) || "Puter generation"}.png`,
          prompt: String(prompt).trim(),
          provider: `Puter.js · ${model}`,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        return;
      }
      const size = ratio === "9:16" ? "720x1280" : "1280x720";
      const video = await puter.ai.txt2vid(prompt, { model, seconds: Number(duration), size });
      await waitForVideoMetadata(video);
      const source = video.currentSrc || video.src;
      const blob = await readMediaBlob(source);
      if (!mountedRef.current) return;
      await addVideoAsset({
        src: source,
        blob,
        name: `${String(prompt).trim().slice(0, 34) || "Puter generation"}.mp4`,
        prompt: String(prompt).trim(),
        provider: `Puter.js · ${model}`,
        duration: Number.isFinite(video.duration) ? video.duration : Number(duration),
        width: video.videoWidth || (ratio === "9:16" ? 720 : 1280),
        height: video.videoHeight || (ratio === "9:16" ? 1280 : 720),
      });
    } catch (error) {
      if (mountedRef.current) setJob({ state: "error", progress: 0, message: error?.msg || error?.message || String(error), assetId: "" });
    } finally {
      window.clearInterval(timer);
    }
  }, [addImageAsset, addVideoAsset, connections.puter.state, job.state]);

  const importSpaceOutput = useCallback(async (url) => {
    setJob({ state: "running", progress: 30, message: "importing", assetId: "" });
    try {
      const blob = await readMediaBlob(url);
      if (!blob) throw new Error("The Space output URL could not be downloaded. Check its sharing permissions.");
      if (blob.type.startsWith("image/")) {
        await addImageAsset({ src: url, blob, name: "Hugging Face Space output.png", prompt: "", provider: `Hugging Face · ${connections.huggingface.spaceId}` });
      } else {
        await addVideoAsset({ src: url, blob, name: "Hugging Face Space output.mp4", prompt: "", provider: `Hugging Face · ${connections.huggingface.spaceId}` });
      }
    } catch (error) {
      setJob({ state: "error", progress: 0, message: error?.message || String(error), assetId: "" });
    }
  }, [addImageAsset, addVideoAsset, connections.huggingface.spaceId]);

  const openGeneratedAsset = useCallback(() => {
    if (!job.assetId) return;
    setSelectedLibraryAssetId(job.assetId);
    setActiveTool("media");
    setMediaTab("mine");
  }, [job.assetId, setActiveTool, setMediaTab, setSelectedLibraryAssetId]);

  return {
    selectedPluginId,
    setSelectedPluginId,
    connections,
    connectPuter,
    cancelPuterConnect,
    disconnectPuter,
    connectSpace,
    disconnectSpace,
    generateWithPuter,
    importSpaceOutput,
    job,
    openGeneratedAsset,
  };
}
