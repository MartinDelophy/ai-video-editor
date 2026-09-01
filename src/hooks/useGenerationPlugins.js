import { useCallback, useEffect, useRef, useState } from "react";
import { getGenerationAdapter } from "../plugins/generation/adapters.js";
import { createIdleGenerationJob, createInitialConnections } from "../plugins/generation/contract.js";
import { commitGenerationOutputs } from "../plugins/generation/host.js";
import { GENERATION_PROVIDERS, getGenerationProvider } from "../plugins/generation/registry.js";

export function useGenerationPlugins({ imageUrlRefs, notify, setActiveTool, setMediaTab, setSelectedLibraryAssetId, setUserAssets }) {
  const mountedRef = useRef(true);
  const connectionAttemptsRef = useRef({});
  const connectionControllersRef = useRef({});
  const activeJobRef = useRef(null);
  const [selectedPluginId, setSelectedPluginId] = useState(GENERATION_PROVIDERS[0].id);
  const [connections, setConnections] = useState(() => createInitialConnections(GENERATION_PROVIDERS));
  const [job, setJob] = useState(createIdleGenerationJob);

  useEffect(() => {
    mountedRef.current = true;
    const connectionControllers = connectionControllersRef.current;
    return () => {
      mountedRef.current = false;
      Object.values(connectionControllers).forEach((controller) => controller?.abort());
      activeJobRef.current?.controller.abort();
    };
  }, []);

  const cancelProviderConnect = useCallback((providerId) => {
    connectionAttemptsRef.current[providerId] = (connectionAttemptsRef.current[providerId] || 0) + 1;
    connectionControllersRef.current[providerId]?.abort();
    delete connectionControllersRef.current[providerId];
    setConnections((current) => ({
      ...current,
      [providerId]: {
        state: "disconnected",
        endpoint: current[providerId]?.endpoint || getGenerationProvider(providerId).defaultEndpoint || "",
        user: null,
        error: "",
        errorCode: "",
      },
    }));
  }, []);

  const connectProvider = useCallback((providerId, config = {}) => {
    const provider = getGenerationProvider(providerId);
    const adapter = getGenerationAdapter(providerId);
    const attempt = (connectionAttemptsRef.current[providerId] || 0) + 1;
    connectionAttemptsRef.current[providerId] = attempt;
    connectionControllersRef.current[providerId]?.abort();
    const controller = new AbortController();
    connectionControllersRef.current[providerId] = controller;
    setConnections((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        state: provider.connectingState,
        endpoint: config.endpoint || current[providerId]?.endpoint || provider.defaultEndpoint || "",
        error: "",
        errorCode: "",
      },
    }));

    // Adapter connect is invoked before any await so popup authentication keeps
    // the original click activation.
    let connectionPromise;
    try {
      connectionPromise = adapter.connect({ config, signal: controller.signal });
    } catch (error) {
      connectionPromise = Promise.reject(error);
    }

    return Promise.resolve(connectionPromise).then((result) => {
      if (!mountedRef.current || connectionAttemptsRef.current[providerId] !== attempt) return result;
      setConnections((current) => ({
        ...current,
        [providerId]: {
          ...current[providerId],
          ...result,
          state: "connected",
          error: "",
          errorCode: "",
        },
      }));
      return result;
    }).catch((error) => {
      if (error?.code === "auth_cancelled" || error?.name === "AbortError" || !mountedRef.current || connectionAttemptsRef.current[providerId] !== attempt) return;
      const errorCode = error?.code || error?.error || "connection_failed";
      setConnections((current) => ({
        ...current,
        [providerId]: {
          ...current[providerId],
          state: "error",
          errorCode,
          error: error?.msg || error?.message || String(error),
        },
      }));
      throw error;
    }).finally(() => {
      if (connectionControllersRef.current[providerId] === controller) delete connectionControllersRef.current[providerId];
    });
  }, []);

  const disconnectProvider = useCallback(async (providerId) => {
    cancelProviderConnect(providerId);
    if (activeJobRef.current?.providerId === providerId) {
      activeJobRef.current.controller.abort();
      activeJobRef.current = null;
    }
    await getGenerationAdapter(providerId).disconnect?.({ connection: connections[providerId] });
    setJob(createIdleGenerationJob());
  }, [cancelProviderConnect, connections]);

  const generateProvider = useCallback(async (providerId, request) => {
    if (connections[providerId]?.state !== "connected" || activeJobRef.current) return;
    const adapter = getGenerationAdapter(providerId);
    const controller = new AbortController();
    activeJobRef.current = { providerId, controller };
    setJob({ state: "running", providerId, progress: null, message: "generating", assetId: "" });
    try {
      const result = await adapter.generate({
        request,
        connection: connections[providerId],
        signal: controller.signal,
        onState: (state) => {
          if (mountedRef.current && activeJobRef.current?.controller === controller) {
            setJob((current) => ({ ...current, state, progress: null, message: state }));
          }
        },
        onProgress: (progress) => {
          if (mountedRef.current && activeJobRef.current?.controller === controller && Number.isFinite(progress)) {
            setJob((current) => ({ ...current, progress: Math.max(0, Math.min(100, progress)) }));
          }
        },
      });
      if (!mountedRef.current || activeJobRef.current?.controller !== controller) return;
      const committed = await commitGenerationOutputs(result.outputs, {
        imageUrlRefs,
        notify,
        setSelectedLibraryAssetId,
        setUserAssets,
      });
      if (!mountedRef.current || activeJobRef.current?.controller !== controller) return;
      setJob({ state: "complete", providerId, progress: 100, message: "saved", assetId: committed.selectedAssetId });
    } catch (error) {
      if (error?.name !== "AbortError" && mountedRef.current && activeJobRef.current?.controller === controller) {
        setJob({ state: "error", providerId, progress: null, message: error?.msg || error?.message || String(error), assetId: "" });
      }
    } finally {
      if (activeJobRef.current?.controller === controller) activeJobRef.current = null;
    }
  }, [connections, imageUrlRefs, notify, setSelectedLibraryAssetId, setUserAssets]);

  const cancelGeneration = useCallback(async () => {
    const active = activeJobRef.current;
    if (!active) return;
    await getGenerationAdapter(active.providerId).cancel?.({ connection: connections[active.providerId] });
    active.controller.abort();
    activeJobRef.current = null;
    setJob({ state: "cancelled", providerId: active.providerId, progress: null, message: "cancelled", assetId: "" });
  }, [connections]);

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
    connectProvider,
    disconnectProvider,
    cancelProviderConnect,
    generateProvider,
    cancelGeneration,
    connectPuter: () => connectProvider("puter"),
    cancelPuterConnect: () => cancelProviderConnect("puter"),
    disconnectPuter: () => disconnectProvider("puter"),
    generateWithPuter: (request) => generateProvider("puter", request),
    connectComfyUI: (endpoint) => connectProvider("comfyui", { endpoint }),
    connectWebUI: (endpoint) => connectProvider("webui", { endpoint }),
    disconnectLocal: disconnectProvider,
    cancelLocalJob: cancelGeneration,
    generateWithComfyUI: (request) => generateProvider("comfyui", request),
    generateWithWebUI: (request) => generateProvider("webui", request),
    job,
    openGeneratedAsset,
  };
}
