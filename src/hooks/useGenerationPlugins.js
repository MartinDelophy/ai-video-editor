import { useCallback, useEffect, useRef, useState } from "react";
import { puter } from "@heyputer/puter.js";

const PUTER_AUTH_TIMEOUT_MS = 45_000;
const LOCAL_JOB_TIMEOUT_MS = 15 * 60_000;

function normalizeLoopbackEndpoint(value, fallbackPort) {
  const raw = String(value || "").trim() || `http://127.0.0.1:${fallbackPort}`;
  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `http://${raw}`);
  } catch {
    throw new Error("请输入有效的本地服务地址。");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!(["localhost", "127.0.0.1", "::1"].includes(hostname)) || !(["http:", "https:"].includes(url.protocol))) {
    throw new Error("为保护本地生成服务，只允许连接 localhost、127.0.0.1 或 ::1。");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function fetchLocalJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("无法访问本地服务。请确认服务已启动，并允许当前编辑器地址跨域访问（CORS）。", { cause: error });
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.error || body?.detail || body?.message || "";
    } catch {
      // The status code is enough when the response is not JSON.
    }
    throw new Error(`本地服务返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }
  return response.json();
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function applyWorkflowVariables(value, variables) {
  if (Array.isArray(value)) return value.map((item) => applyWorkflowVariables(item, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, applyWorkflowVariables(item, variables)]));
  }
  if (typeof value !== "string") return value;
  const exact = value.match(/^\{\{(prompt|negative_prompt|seed)\}\}$/);
  if (exact) return variables[exact[1]];
  return value.replace(/\{\{(prompt|negative_prompt|seed)\}\}/g, (_, key) => String(variables[key]));
}

function parseComfyWorkflow(template, variables) {
  let parsed;
  try {
    parsed = JSON.parse(template);
  } catch {
    throw new Error("工作流 JSON 无法解析。请从 ComfyUI 导出 API Format 工作流后再粘贴。");
  }
  const workflow = parsed?.prompt && typeof parsed.prompt === "object" ? parsed.prompt : parsed;
  if (!workflow || Array.isArray(workflow) || typeof workflow !== "object") {
    throw new Error("工作流必须是 ComfyUI API Format 的对象。");
  }
  return applyWorkflowVariables(workflow, variables);
}

function collectComfyOutputs(historyItem) {
  const outputs = historyItem?.outputs || {};
  const descriptors = [];
  Object.values(outputs).forEach((node) => {
    ["images", "gifs", "videos"].forEach((key) => {
      (node?.[key] || []).forEach((file) => {
        if (file?.filename) descriptors.push({ ...file, outputType: key === "images" ? "image" : "video" });
      });
    });
  });
  return descriptors;
}

function dataUrlToBlob(value) {
  const normalized = String(value || "").trim();
  const payload = normalized.includes(",") ? normalized.slice(normalized.indexOf(",") + 1) : normalized;
  const mime = normalized.match(/^data:([^;,]+)/)?.[1] || "image/png";
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function getImageSize(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  } catch {
    return { width: 1024, height: 1024 };
  }
}

async function getVideoInfo(blob) {
  const src = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = src;
  await waitForVideoMetadata(video);
  const result = {
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    width: video.videoWidth || 1280,
    height: video.videoHeight || 720,
  };
  URL.revokeObjectURL(src);
  return result;
}

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

const VIDEO_SOURCE_KEYS = ["src", "currentSrc", "url", "asset_url", "assetUrl", "href", "download_url", "downloadUrl"];
const VIDEO_CONTAINER_KEYS = ["result", "output", "data", "video", "file", "media"];

function isVideoElement(value) {
  return Boolean(value && typeof value.addEventListener === "function" && ("src" in value || "currentSrc" in value));
}

async function extractVideoSource(value, seen = new Set(), depth = 0) {
  if (!value || depth > 4) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof Blob !== "undefined" && value instanceof Blob) return value;
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (typeof value.blob === "function") {
    try {
      const blob = await value.blob();
      if (blob instanceof Blob) return blob;
    } catch {
      // Some provider response wrappers expose blob() before the body is ready.
    }
  }

  for (const key of VIDEO_SOURCE_KEYS) {
    const source = value[key];
    if (typeof source === "string" && source.trim()) return source.trim();
    if (typeof Blob !== "undefined" && source instanceof Blob) return source;
  }
  for (const key of VIDEO_CONTAINER_KEYS) {
    const source = await extractVideoSource(value[key], seen, depth + 1);
    if (source) return source;
  }
  return null;
}

async function normalizePuterVideo(result) {
  if (isVideoElement(result)) {
    return { video: result, source: result.currentSrc || result.src, blob: null, revoke: null };
  }

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

function waitForVideoMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", finish);
      video.removeEventListener("error", finish);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 2500);
    video.addEventListener("loadedmetadata", finish, { once: true });
    video.addEventListener("error", finish, { once: true });
  });
}

export function useGenerationPlugins({ imageUrlRefs, notify, setActiveTool, setMediaTab, setSelectedLibraryAssetId, setUserAssets }) {
  const mountedRef = useRef(true);
  const puterAuthAttemptRef = useRef(0);
  const puterAuthAbortRef = useRef(null);
  const localJobAbortRef = useRef(null);
  const [selectedPluginId, setSelectedPluginId] = useState("puter");
  const [connections, setConnections] = useState({
    puter: { state: "disconnected", user: null, error: "" },
    comfyui: { state: "disconnected", endpoint: "", error: "" },
    webui: { state: "disconnected", endpoint: "", error: "" },
  });
  const [job, setJob] = useState({ state: "idle", progress: 0, message: "", assetId: "" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      puterAuthAbortRef.current?.abort();
      localJobAbortRef.current?.abort();
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
      const result = await puter.ai.txt2vid(prompt, { model, seconds: Number(duration), size });
      const normalized = await normalizePuterVideo(result);
      try {
        await waitForVideoMetadata(normalized.video);
        const blob = normalized.blob || await readMediaBlob(normalized.source);
        if (!mountedRef.current) return;
        await addVideoAsset({
          src: normalized.source,
          blob,
          name: `${String(prompt).trim().slice(0, 34) || "Puter generation"}.mp4`,
          prompt: String(prompt).trim(),
          provider: `Puter.js · ${model}`,
          duration: Number.isFinite(normalized.video.duration) ? normalized.video.duration : Number(duration),
          width: normalized.video.videoWidth || (ratio === "9:16" ? 720 : 1280),
          height: normalized.video.videoHeight || (ratio === "9:16" ? 1280 : 720),
        });
      } finally {
        normalized.revoke?.();
      }
    } catch (error) {
      if (mountedRef.current) setJob({ state: "error", progress: 0, message: error?.msg || error?.message || String(error), assetId: "" });
    } finally {
      window.clearInterval(timer);
    }
  }, [addImageAsset, addVideoAsset, connections.puter.state, job.state]);

  const connectLocal = useCallback(async (pluginId, endpointValue) => {
    const isComfy = pluginId === "comfyui";
    let endpoint;
    try {
      endpoint = normalizeLoopbackEndpoint(endpointValue, isComfy ? 8188 : 7860);
    } catch (error) {
      setConnections((current) => ({
        ...current,
        [pluginId]: { ...current[pluginId], state: "error", endpoint: String(endpointValue || ""), error: error?.message || String(error) },
      }));
      throw error;
    }
    setConnections((current) => ({
      ...current,
      [pluginId]: { ...current[pluginId], state: "connecting", endpoint, error: "" },
    }));
    try {
      await fetchLocalJson(`${endpoint}${isComfy ? "/system_stats" : "/sdapi/v1/samplers"}`);
      if (!mountedRef.current) return endpoint;
      setConnections((current) => ({ ...current, [pluginId]: { state: "connected", endpoint, error: "" } }));
      return endpoint;
    } catch (error) {
      if (mountedRef.current) {
        setConnections((current) => ({
          ...current,
          [pluginId]: { state: "error", endpoint, error: error?.message || String(error) },
        }));
      }
      throw error;
    }
  }, []);

  const connectComfyUI = useCallback((endpoint) => connectLocal("comfyui", endpoint), [connectLocal]);
  const connectWebUI = useCallback((endpoint) => connectLocal("webui", endpoint), [connectLocal]);

  const disconnectLocal = useCallback((pluginId) => {
    localJobAbortRef.current?.abort();
    localJobAbortRef.current = null;
    setConnections((current) => ({
      ...current,
      [pluginId]: { state: "disconnected", endpoint: current[pluginId]?.endpoint || "", error: "" },
    }));
    setJob({ state: "idle", progress: 0, message: "", assetId: "" });
  }, []);

  const cancelLocalJob = useCallback(async () => {
    const controller = localJobAbortRef.current;
    if (!controller) return;
    const connection = connections[selectedPluginId];
    if (selectedPluginId === "comfyui" && connection?.endpoint) {
      fetch(`${connection.endpoint}/interrupt`, { method: "POST" }).catch(() => {});
    }
    controller.abort();
    localJobAbortRef.current = null;
    setJob({ state: "idle", progress: 0, message: "", assetId: "" });
  }, [connections, selectedPluginId]);

  const generateWithComfyUI = useCallback(async ({ workflowTemplate, prompt, negativePrompt, seed }) => {
    if (connections.comfyui.state !== "connected" || job.state === "running") return;
    const endpoint = connections.comfyui.endpoint;
    const controller = new AbortController();
    localJobAbortRef.current?.abort();
    localJobAbortRef.current = controller;
    setJob({ state: "running", progress: 5, message: "queueing", assetId: "" });
    try {
      const resolvedSeed = Number(seed) === -1 ? Math.floor(Math.random() * 2_147_483_647) : Number(seed);
      const workflow = parseComfyWorkflow(workflowTemplate, {
        prompt: String(prompt || "").trim(),
        negative_prompt: String(negativePrompt || "").trim(),
        seed: Number.isFinite(resolvedSeed) ? resolvedSeed : 0,
      });
      const queued = await fetchLocalJson(`${endpoint}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
        signal: controller.signal,
      });
      if (!queued?.prompt_id) throw new Error("ComfyUI 没有返回 prompt_id。");
      const startedAt = Date.now();
      let historyItem;
      while (!historyItem) {
        if (Date.now() - startedAt > LOCAL_JOB_TIMEOUT_MS) throw new Error("ComfyUI 任务等待超过 15 分钟。");
        await sleep(900, controller.signal);
        const history = await fetchLocalJson(`${endpoint}/history/${encodeURIComponent(queued.prompt_id)}`, { signal: controller.signal });
        historyItem = history?.[queued.prompt_id];
        const status = historyItem?.status;
        if (status?.status_str === "error" || status?.completed === false && status?.messages?.some?.((item) => item?.[0] === "execution_error")) {
          throw new Error("ComfyUI 工作流执行失败，请在 ComfyUI 控制台查看出错节点。");
        }
        setJob((current) => current.state === "running" ? { ...current, progress: Math.min(88, current.progress + 3), message: "generating" } : current);
      }
      const files = collectComfyOutputs(historyItem);
      if (!files.length) throw new Error("工作流已完成，但没有找到可导入的图片或视频输出。");
      let lastAssetId = "";
      for (const file of files) {
        const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || "", type: file.type || "output" });
        const response = await fetch(`${endpoint}/view?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`无法读取 ComfyUI 输出：HTTP ${response.status}`);
        const blob = await response.blob();
        const extension = file.filename.split(".").pop()?.toLowerCase();
        const isVideo = ["mp4", "webm", "mov", "mkv"].includes(extension);
        if (isVideo) {
          const info = await getVideoInfo(blob);
          lastAssetId = await addVideoAsset({ blob, name: file.filename, prompt, provider: "ComfyUI", ...info });
        } else {
          const size = await getImageSize(blob);
          lastAssetId = await addImageAsset({ blob, name: file.filename, prompt, provider: "ComfyUI", ...size });
        }
      }
      if (mountedRef.current) setJob({ state: "complete", progress: 100, message: "saved", assetId: lastAssetId });
    } catch (error) {
      if (error?.name !== "AbortError" && mountedRef.current) {
        setJob({ state: "error", progress: 0, message: error?.message || String(error), assetId: "" });
      }
    } finally {
      if (localJobAbortRef.current === controller) localJobAbortRef.current = null;
    }
  }, [addImageAsset, addVideoAsset, connections.comfyui, job.state]);

  const generateWithWebUI = useCallback(async ({ mode, prompt, negativePrompt, width, height, steps, seed, initImage }) => {
    if (connections.webui.state !== "connected" || job.state === "running") return;
    const controller = new AbortController();
    localJobAbortRef.current?.abort();
    localJobAbortRef.current = controller;
    setJob({ state: "running", progress: 8, message: "generating", assetId: "" });
    const timer = window.setInterval(() => {
      setJob((current) => current.state === "running" ? { ...current, progress: Math.min(90, current.progress + 2) } : current);
    }, 1100);
    try {
      const body = {
        prompt: String(prompt || "").trim(),
        negative_prompt: String(negativePrompt || "").trim(),
        width: Number(width),
        height: Number(height),
        steps: Number(steps),
        seed: Number(seed),
      };
      if (mode === "img2img") {
        if (!initImage) throw new Error("图生图需要先选择一张参考图片。");
        body.init_images = [initImage];
      }
      const result = await fetchLocalJson(`${connections.webui.endpoint}/sdapi/v1/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!Array.isArray(result?.images) || !result.images.length) throw new Error("WebUI 没有返回图片。");
      let lastAssetId = "";
      for (const [index, encoded] of result.images.entries()) {
        const blob = dataUrlToBlob(encoded);
        const size = await getImageSize(blob);
        lastAssetId = await addImageAsset({
          blob,
          name: `${String(prompt).trim().slice(0, 34) || "WebUI generation"}${result.images.length > 1 ? `-${index + 1}` : ""}.png`,
          prompt,
          provider: "Stable Diffusion WebUI",
          ...size,
        });
      }
      if (mountedRef.current) setJob({ state: "complete", progress: 100, message: "saved", assetId: lastAssetId });
    } catch (error) {
      if (error?.name !== "AbortError" && mountedRef.current) {
        setJob({ state: "error", progress: 0, message: error?.message || String(error), assetId: "" });
      }
    } finally {
      window.clearInterval(timer);
      if (localJobAbortRef.current === controller) localJobAbortRef.current = null;
    }
  }, [addImageAsset, connections.webui, job.state]);

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
    generateWithPuter,
    connectComfyUI,
    connectWebUI,
    disconnectLocal,
    cancelLocalJob,
    generateWithComfyUI,
    generateWithWebUI,
    job,
    openGeneratedAsset,
  };
}
