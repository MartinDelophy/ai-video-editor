import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUUpLeft,
  ArrowUUpRight,
  Plus,
  Cursor,
  Hand,
  FrameCorners,
  ImageSquare,
  VideoCamera,
  User,
  MapPin,
  FileText,
  MusicNotes,
  Microphone,
  FilmStrip,
  Play,
  X,
  PaperPlaneTilt,
  Paperclip,
  SidebarSimple,
  Trash,
  LinkBreak,
  MagnifyingGlass,
  DownloadSimple,
  DotsThree,
  Minus,
  SpinnerGap,
  Stop,
  Plug,
} from "@phosphor-icons/react";
import { getCanvasCopy } from "../i18nCanvas.js";
import {
  CANVAS_NODE_TYPES,
  createCanvasGraph,
  createCanvasNode,
  canvasOutputType,
  validateCanvasGraph,
  validateCanvasEdge,
  canvasNodeSignature,
  canvasResultIsStale,
  resolveCanvasInput,
  inspectCanvas,
  applyCanvasOperations,
} from "../lib/canvasGraph.js";
import { readCanvasProject, writeCanvasProject } from "../lib/canvasProjectStore.js";
import { requestCanvasEdits, generateCanvasShotData } from "../lib/canvasAgent.js";
import { isAnnaEdition, resolveAnnaSessionScope, connectAnna } from "../lib/annaRuntime.js";
import { GENERATION_PROVIDERS } from "../plugins/generation/registry.js";
import { loadAnnaTtsCatalog, synthesizeAnnaSpeech } from "../lib/annaAudio.js";
import { decodeWaveform } from "../lib/media.js";
import { useAiMusicGeneration } from "../hooks/useAiMusicGeneration.js";
import { getChatCutTrigger } from "../lib/chatCutComposer.js";
import { ChatCutMarkdown } from "./ChatCutMarkdown.jsx";
import "./ChatCut.css";
import "./CanvasWorkspace.css";
const ICONS = {
  text: FileText,
  media: ImageSquare,
  character: User,
  scene: MapPin,
  script: FileText,
  shot: FilmStrip,
  image: ImageSquare,
  video: VideoCamera,
  voice: Microphone,
  music: MusicNotes,
};
const size = (n) => ({
  width: ["image", "video"].includes(n.kind) ? 300 : 230,
  height: (["image", "video"].includes(n.kind) ? 300 : 245) +
    CANVAS_NODE_TYPES[n.kind].inputs.length * 34,
});
const noOp = () => {};
const isAbort = (e) => e?.name === "AbortError" || e?.code === "cancelled";
const resultOf = (n) => n?.results?.find((r) => r.id === n.resultId);
const persistedAsset = ({
  id,
  name,
  type,
  blob,
  width,
  height,
  duration,
  peaks,
  kind,
  generation,
  generated,
  prompt,
}) => ({
  id,
  name,
  type,
  blob,
  width,
  height,
  duration,
  peaks,
  kind,
  generation,
  generated,
  prompt,
});
export function CanvasWorkspace({
  language,
  projectId,
  assets,
  generationPlugins,
  onCommitAssets,
  onClose,
}) {
  const c = getCanvasCopy(language),
    [graph, setGraph] = useState(createCanvasGraph),
    [selected, setSelected] = useState(null),
    [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState("loading"),
    [recovery, setRecovery] = useState(null),
    [picker, setPicker] = useState(false),
    [nodeMenu, setNodeMenu] = useState(null),
    [search, setSearch] = useState(""),
    [chatOpen, setChatOpen] = useState(true),
    [inspector, setInspector] = useState(true),
    [tool, setTool] = useState("select"),
    [connecting, setConnecting] = useState(null),
    [linkPreview, setLinkPreview] = useState(null),
    [notice, setNotice] = useState(""),
    [draft, setDraft] = useState(""),
    [mention, setMention] = useState(null),
    [mentionIndex, setMentionIndex] = useState(0),
    [nodeReferences, setNodeReferences] = useState([]),
    [proposal, setProposal] = useState(null),
    [chatBusy, setChatBusy] = useState(false),
    [task, setTask] = useState(null),
    [preview, setPreview] = useState(null),
    [inputChoice, setInputChoice] = useState(null),
    [models, setModels] = useState([]),
    [tts, setTts] = useState([]),
    [history, setHistory] = useState([]),
    [future, setFuture] = useState([]),
    [storageKey, setStorageKey] = useState(null),
    [assetEpoch, setAssetEpoch] = useState(0);
  const latest = useRef(graph),
    library = useRef([]),
    owned = useRef(new Map()),
    callbacks = useRef({ onCommitAssets }),
    area = useRef(null),
    root = useRef(null),
    fileInput = useRef(null),
    chatInput = useRef(null),
    chatComposing = useRef(false),
    drag = useRef(null),
    linkDrag = useRef(null),
    revision = useRef(0),
    dirty = useRef(0),
    stored = useRef(0),
    loadToken = useRef(0),
    activeKey = useRef(null),
    saveQueue = useRef(Promise.resolve()),
    editorId = useRef(crypto.randomUUID()),
    resolvedRecovery = useRef(null),
    running = useRef(null),
    chatController = useRef(null),
    mounted = useRef(true),
    urlRefs = useRef(new Set()),
    snapshotVersion = useRef(0);
  latest.current = graph;
  callbacks.current = { onCommitAssets };
  library.current = [
    ...assets,
    ...[...owned.current.values()].filter((a) => !assets.some((b) => a.id === b.id)),
  ];
  const node = graph.nodes.find((n) => n.id === selected),
    result = resultOf(node),
    selectedAssets =
      result?.assetIds?.map((id) => library.current.find((a) => a.id === id)).filter(Boolean) || [],
    busy = Boolean(task),
    provider = node?.params.provider || (isAnnaEdition ? "anna" : GENERATION_PROVIDERS[0]?.id),
    connection = generationPlugins.connections[provider];
  const update = useCallback((fn, checkpoint = true) => {
    const before = latest.current,
      next = typeof fn === "function" ? fn(before) : fn;
    if (checkpoint) {
      setHistory((h) => [...h.slice(-39), before]);
      setFuture([]);
    }
    latest.current = next;
    dirty.current++;
    snapshotVersion.current++;
    setGraph(next);
    setSaveStatus("saving");
  }, []);
  const patch = useCallback(
    (id, values) =>
      update((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...values } : n)) })),
    [update],
  );
  const patchParams = (id, p) => {
    const n = latest.current.nodes.find((x) => x.id === id);
    if (n) patch(id, { params: { ...n.params, ...p } });
  };
  const commitAssets = useCallback((list) => {
    for (const a of list) {
      owned.current.set(a.id, a);
      urlRefs.current.add(a.src);
    }
    callbacks.current.onCommitAssets(list);
    setAssetEpoch((v) => v + 1);
  }, []);
  const errorCopy = (e) =>
    e?.message === "TYPE_MISMATCH" ||
    e?.message === "PORT_OCCUPIED" ||
    e?.message === "DUPLICATE_EDGE"
      ? c.typeMismatch
      : e?.message === "CYCLE"
        ? c.cycle
        : e?.message === "MISSING_INPUT"
          ? c.missingInput
          : ["INPUT_NOT_READY", "MISSING_ASSET", "STALE_INPUT"].includes(e?.message)
            ? c.inputNotReady
            : c.failed;
  const finishTask = useCallback(
    (receipt) => {
      const job = running.current;
      if (!job || !mounted.current) return;
      update(
        (g) => ({
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === job.nodeId
              ? {
                  ...n,
                  remoteJob: null,
                  lastState: "complete",
                  results: [
                    ...n.results,
                    ...(receipt.assetIds?.length
                      ? receipt.assetIds.map((id) => ({ ...receipt, assetIds: [id] }))
                      : [receipt]
                    ).map((output) => ({
                      id: crypto.randomUUID(),
                      ...output,
                      signature: job.signature,
                      previousResultId: job.previousResultId,
                      createdAt: Date.now(),
                    })),
                  ],
                  resultId: null,
                }
              : n,
          ),
        }),
        false,
      );
      // Select the receipt only; parameters edited while running remain untouched.
      const n = latest.current.nodes.find((n) => n.id === job.nodeId);
      if (n) {
        const id = n.results.at(-1).id;
        update(
          (g) => ({
            ...g,
            nodes: g.nodes.map((item) => (item.id === n.id ? { ...item, resultId: id } : item)),
          }),
          false,
        );
      }
      running.current = null;
      setTask(null);
    },
    [update],
  );
  const music = useAiMusicGeneration({
    activeLanguage: language,
    imageUrlRefs: urlRefs,
    setActiveTool: noOp,
    setMediaTab: noOp,
    setSelectedLibraryAssetId: noOp,
    setUserAssets: useCallback(
      (fn) => {
        const list = typeof fn === "function" ? fn([]) : fn;
        if (running.current?.kind !== "music") return;
        commitAssets(list);
        finishTask({ assetIds: list.map((a) => a.id), model: "Stable Audio 3 Small" });
      },
      [commitAssets, finishTask],
    ),
  });
  useEffect(() => {
    if (music.job.state === "error" && running.current?.kind === "music") {
      running.current = null;
      setTask(null);
      setNotice(/translation/i.test(music.job.error || "") ? c.translationUnavailable : c.failed);
    }
  }, [music.job.state, music.job.error, c.failed, c.translationUnavailable]);
  useEffect(() => {
    mounted.current = true;
    const siblings = [...(root.current?.parentElement?.children || [])].filter(
        (e) => e !== root.current,
      ),
      prior = siblings.map((e) => e.inert);
    siblings.forEach((e) => {
      e.inert = true;
    });
    return () => {
      mounted.current = false;
      activeKey.current = null;
      running.current?.controller.abort();
      chatController.current?.abort();
      siblings.forEach((e, i) => {
        e.inert = prior[i];
      });
    };
  }, []);
  const restore = useCallback((record, key, baseRevision) => {
    const value = record?.graph ? validateCanvasGraph(record.graph) : createCanvasGraph();
    value.nodes = value.nodes.map((n) =>
      n.lastState === "running" ? { ...n, lastState: "interrupted" } : n,
    );
    for (const saved of record?.assets || []) {
      if (!(saved.blob instanceof Blob)) continue;
      const a = { ...saved, src: URL.createObjectURL(saved.blob) };
      a.originalSrc = a.src;
      owned.current.set(a.id, a);
      urlRefs.current.add(a.src);
    }
    if (owned.current.size) callbacks.current.onCommitAssets([...owned.current.values()]);
    latest.current = value;
    setGraph(value);
    revision.current = baseRevision;
    dirty.current++;
    stored.current = dirty.current;
    activeKey.current = key;
    setStorageKey(key);
    setReady(true);
    setRecovery(null);
    setSaveStatus(record ? "saved" : "ready");
    setAssetEpoch((v) => v + 1);
  }, []);
  useEffect(() => {
    const token = ++loadToken.current;
    setReady(false);
    setSaveStatus("loading");
    activeKey.current = null;
    setStorageKey(null);
    const read = async () => {
      const scope = isAnnaEdition ? await resolveAnnaSessionScope() : "local";
      const key = `canvas-v1:${scope}:${projectId}`;
      const found = await readCanvasProject(key);
      if (loadToken.current !== token) return;
      if (found.recovery) {
        setRecovery({ ...found, key });
        revision.current = found.record?.revision || 0;
      } else restore(found.record, key, found.record?.revision || 0);
    };
    read().catch((error) => {
      if (loadToken.current === token)
        setSaveStatus(error?.code === "host_required" ? "hostRequired" : "saveError");
    });
    return () => {
      loadToken.current = token + 1;
    };
  }, [projectId, restore]);
  useEffect(() => {
    if (!ready || !storageKey || dirty.current === stored.current) return;
    const tick = dirty.current,
      snapshot = graph,
      key = storageKey;
    const ids = new Set(
      snapshot.nodes
        .flatMap((n) => [n.assetId, ...n.results.flatMap((r) => r.assetIds || [])])
        .filter(Boolean),
    );
    const records = library.current
      .filter((a) => ids.has(a.id) && a.blob instanceof Blob)
      .map(persistedAsset);
    if ([...ids].some((id) => !records.some((a) => a.id === id))) return;
    const write = () => {
      setSaveStatus("saving");
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(async () => {
          if (tick !== dirty.current) return;
          const receipt = await writeCanvasProject(
            key,
            { graph: snapshot, assets: records },
            revision.current,
            editorId.current,
            resolvedRecovery.current,
          );
          if (!receipt.conflict) {
            revision.current = receipt.revision;
            resolvedRecovery.current = null;
          }
          if (activeKey.current !== key) return;
          if (receipt.conflict) {
            if (tick === dirty.current) setSaveStatus("conflict");
            return;
          }
          revision.current = receipt.revision;
          stored.current = tick;
          if (dirty.current === tick) setSaveStatus("saved");
        })
        .catch(() => {
          if (activeKey.current === key) setSaveStatus("saveError");
        });
    };
    write();
  }, [graph, storageKey, ready, assetEpoch, assets]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const listener = (e) => {
      if (e.key === "Escape") {
        setNodeMenu(null);
        setMention(null);
        setPicker(false);
        setConnecting(null);
        setLinkPreview(null);
        linkDrag.current = null;
        setInputChoice(null);
        setPreview(null);
      }
    };
    window.addEventListener("keydown", listener);
    const el = area.current;
    const wheel = (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", listener);
      el?.removeEventListener("wheel", wheel);
    };
  }, []);
  useEffect(() => {
    if (!picker && !linkPreview?.menu) return;
    const dismiss = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".nc-picker")) return;
      if (picker && !target.closest(".nc-add")) setPicker(false);
      if (linkPreview?.menu && !target.closest(".nc-port")) {
        setLinkPreview(null);
        setConnecting(null);
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [picker, linkPreview?.menu]);
  useEffect(() => {
    if (!nodeMenu) return;
    const dismiss = (event) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".nc-node-menu, .nc-node-menu-trigger")
      )
        setNodeMenu(null);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [nodeMenu]);
  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [latest.current, ...f]);
    const previous = history.at(-1);
    setHistory((h) => h.slice(0, -1));
    update(previous, false);
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, latest.current]);
    const next = future[0];
    setFuture((f) => f.slice(1));
    update(next, false);
  };
  const add = (kind) => {
    if (!ready) return;
    const count = latest.current.nodes.length;
    const anchor = latest.current.nodes.find((item) => item.id === selected);
    const n = createCanvasNode(
      kind,
      anchor
        ? { x: anchor.x + size(anchor).width + 100, y: anchor.y }
        : { x: 40 + (count % 3) * 340, y: 180 + Math.floor(count / 3) * 310 },
    );
    n.params.provider = isAnnaEdition ? "anna" : GENERATION_PROVIDERS[0]?.id;
    update((g) => ({ ...g, nodes: [...g.nodes, n] }));
    setSelected(n.id);
    setInspector(true);
    setPicker(false);
    requestAnimationFrame(fit);
  };
  const importFiles = async (files) => {
    if (!ready) return;
    const added = [];
    for (const file of Array.from(files || []).slice(0, 20)) {
      if (!/^(image|video|audio)\//.test(file.type)) continue;
      const a = {
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type.split("/")[0],
        blob: file,
        src: URL.createObjectURL(file),
      };
      added.push(a);
    }
    commitAssets(added);
    update((g) => ({
      ...g,
      nodes: [
        ...g.nodes,
        ...added.map((a, i) => ({
          ...createCanvasNode("media", { x: 70 + i * 260, y: 70 }),
          assetId: a.id,
          mediaType: a.type,
          text: a.name,
        })),
      ],
    }));
    if (added[0]) setSelected(latest.current.nodes.at(-added.length).id);
  };
  const connect = (from, to, port) => {
    try {
      const e = { from, to, port };
      validateCanvasEdge(latest.current, e);
      update((g) => ({ ...g, edges: [...g.edges, e] }));
      setConnecting(null);
      setInputChoice(null);
    } catch (e) {
      setNotice(errorCopy(e));
    }
  };
  const canConnect = (from, to, port) => {
    try {
      validateCanvasEdge(graph, { from, to, port });
      return true;
    } catch {
      return false;
    }
  };
  const nextOptions = linkPreview
    ? Object.entries(CANVAS_NODE_TYPES).flatMap(([kind, definition]) =>
        definition.inputs
          .filter((p) =>
            p.types.includes(
              canvasOutputType(graph.nodes.find((n) => n.id === linkPreview.from) || {}),
            ),
          )
          .map((p) => ({ kind, port: p.id })),
      )
    : [];
  const addNext = ({ kind, port }) => {
    const n = createCanvasNode(kind, { x: linkPreview.x, y: linkPreview.y - 70 });
    n.params.provider = isAnnaEdition ? "anna" : GENERATION_PROVIDERS[0]?.id;
    try {
      const next = { ...latest.current, nodes: [...latest.current.nodes, n] };
      const edge = { from: linkPreview.from, to: n.id, port };
      validateCanvasEdge(next, edge);
      update({ ...next, edges: [...next.edges, edge] });
      setSelected(n.id);
      setInspector(true);
      setConnecting(null);
      setLinkPreview(null);
      requestAnimationFrame(fit);
    } catch (e) {
      setNotice(errorCopy(e));
    }
  };
  const loadCatalog = async () => {
    try {
      const runtime = await connectAnna();
      const response = await runtime.llm.catalog({});
      if (mounted.current) setModels(response.models || []);
      const voices = await loadAnnaTtsCatalog();
      if (mounted.current) setTts(voices);
    } catch {
      if (mounted.current) setNotice(c.hostRequired);
    }
  };
  const connectProvider = () =>
    generationPlugins
      .connectProvider(provider, { endpoint: node.params.endpoint || connection?.endpoint })
      .then(() => {
        if (isAnnaEdition) loadCatalog();
      })
      .catch(() => setNotice(c.failed));
  const download = (a) => {
    const link = document.createElement("a");
    link.href = a.src;
    link.download = a.name || c.output;
    link.click();
  };
  const sourceAsset = (n) =>
    n.kind === "media"
      ? library.current.find((a) => a.id === n.assetId)
      : library.current.find((a) => a.id === resultOf(n)?.assetIds?.[0]);
  const availableInputs = (port) =>
    graph.nodes.filter((n) => n.id !== node?.id && port.types.includes(canvasOutputType(n)));
  const run = async (resume = false) => {
    if (
      !ready ||
      running.current ||
      generationPlugins.job.state === "running" ||
      generationPlugins.job.state === "queued"
    )
      return;
    const current = latest.current.nodes.find((n) => n.id === selected);
    if (!current) return;
    const controller = new AbortController(),
      signature = canvasNodeSignature(latest.current, current.id),
      previousResultId = current.resultId || null;
    const job = { nodeId: current.id, kind: current.kind, controller, signature, previousResultId };
    try {
      const inputs =
        resume && current.remoteJob
          ? { prompt: current.remoteJob.request.prompt, references: [], byPort: {} }
          : resolveCanvasInput(latest.current, current.id, library.current);
      if (!inputs.prompt.trim()) throw new Error("MISSING_INPUT");
      running.current = job;
      setTask({ nodeId: current.id, kind: current.kind, state: "running" });
      update(
        (g) => ({
          ...g,
          nodes: g.nodes.map((n) => (n.id === current.id ? { ...n, lastState: "running" } : n)),
        }),
        false,
      );
      if (["script", "shot"].includes(current.kind)) {
        const output = await generateCanvasShotData({
          prompt: inputs.prompt,
          language,
          signal: controller.signal,
          kind: current.kind,
          model: current.params.model,
        });
        controller.signal.throwIfAborted();
        finishTask(output);
      } else if (current.kind === "voice") {
        const catalog = tts.length ? tts : await loadAnnaTtsCatalog(controller.signal),
          model =
            catalog.find((m) => m.id === current.params.ttsModel) ||
            catalog.find((m) => m.preferred) ||
            catalog[0];
        if (!model) throw new Error("VOICE_UNAVAILABLE");
        const { blob, model: usedModel } = await synthesizeAnnaSpeech({
          text: inputs.prompt,
          model: model.id,
          voice: current.params.voice || model.defaultVoice,
          language: current.params.speechLanguage || language,
          signal: controller.signal,
        });
        const decoded = await decodeWaveform(blob, 96);
        controller.signal.throwIfAborted();
        const a = {
          id: crypto.randomUUID(),
          name: `${c.voice}.mp3`,
          type: "audio",
          kind: "voiceover",
          blob,
          src: URL.createObjectURL(blob),
          duration: decoded.duration,
          peaks: decoded.peaks,
          generated: true,
        };
        commitAssets([a]);
        finishTask({ assetIds: [a.id], model: usedModel });
      } else if (current.kind === "music") {
        await music.generate({ ...current.params, description: inputs.prompt });
      } else if (["image", "video"].includes(current.kind)) {
        const p = resume ? current.remoteJob.provider : current.params.provider || provider,
          conn = generationPlugins.connections[p];
        if (conn?.state !== "connected") throw new Error("DISCONNECTED");
        const refs = inputs.references.filter((a) => a.type === "image"),
          request = resume
            ? { ...current.remoteJob.request, providerOptions: { jobId: current.remoteJob.id } }
            : {
                prompt: inputs.prompt,
                aspectRatio: current.params.aspectRatio,
                durationSec: Number(current.params.durationSec),
                resolution: current.params.resolution,
                referenceAssets: refs,
                providerOptions: { model: current.params.model },
              };
        if (!resume && p === "anna") {
          request.mode = current.kind === "video" ? "text-to-video" : "text-to-image";
          if (current.kind === "video")
            request.referenceAssets = inputs.byPort.frame?.[0]?.media || [];
        } else if (!resume && p === "puter") {
          if (refs.length) throw new Error("UNSUPPORTED_REFERENCE");
          request.mode = current.kind === "video" ? "text-to-video" : "text-to-image";
        } else if (!resume && p === "comfyui") {
          if (refs.length) throw new Error("UNSUPPORTED_REFERENCE");
          request.mode = "workflow";
          request.workflowTemplate = current.params.workflowTemplate || "";
          request.seed = 0;
        } else if (!resume && p === "webui") {
          if (current.kind !== "image" || refs.length > 1) throw new Error("UNSUPPORTED_REFERENCE");
          request.mode = refs.length ? "img2img" : "txt2img";
          request.width = current.params.aspectRatio === "9:16" ? 576 : 1024;
          request.height = current.params.aspectRatio === "16:9" ? 576 : 1024;
          request.steps = 20;
          request.seed = -1;
          if (refs.length)
            request.initImage = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result);
              r.onerror = reject;
              r.readAsDataURL(refs[0].blob);
            });
        }
        if (resume) {
          request.mode = "text-to-video";
          job.signature = current.remoteJob.signature;
          job.previousResultId = current.remoteJob.previousResultId;
        }
        request.onJob = (id) => {
          const { prompt, aspectRatio, durationSec, resolution } = request;
          update(
            (g) => ({
              ...g,
              nodes: g.nodes.map((n) =>
                n.id === current.id
                  ? {
                      ...n,
                      remoteJob: {
                        id,
                        provider: p,
                        request: { prompt, aspectRatio, durationSec, resolution },
                        signature: job.signature,
                        previousResultId: job.previousResultId,
                      },
                    }
                  : n,
              ),
            }),
            false,
          );
        };
        const receipt = await generationPlugins.generateProvider(p, request);
        controller.signal.throwIfAborted();
        if (!receipt?.assetIds?.length) throw new Error("GENERATION_FAILED");
        finishTask({ assetIds: receipt.assetIds, provider: p });
      } else throw new Error("INVALID_NODE");
    } catch (e) {
      if (running.current === job) {
        running.current = null;
        update(
          (g) => ({
            ...g,
            nodes: g.nodes.map((n) =>
              n.id === job.nodeId ? { ...n, lastState: isAbort(e) ? "interrupted" : "error" } : n,
            ),
          }),
          false,
        );
        setTask(null);
        setNotice(
          isAbort(e)
            ? c.stopped
            : e.message === "UNSUPPORTED_REFERENCE"
              ? c.unsupportedReference
              : e.message === "DISCONNECTED"
                ? c.disconnected
                : errorCopy(e),
        );
      }
    }
  };
  const cancel = () => {
    const job = running.current;
    if (!job) return;
    job.controller.abort();
    if (job.kind === "music") music.cancel();
    else if (["image", "video"].includes(job.kind)) generationPlugins.cancelGeneration();
    running.current = null;
    update(
      (g) => ({
        ...g,
        nodes: g.nodes.map((n) => (n.id === job.nodeId ? { ...n, lastState: "interrupted" } : n)),
      }),
      false,
    );
    setTask(null);
    setNotice(c.stopped);
  };
  const nodeName = (n) => `${c[n.kind]} · ${n.text.trim().slice(0, 24) || n.id.slice(0, 6)}`;
  const referencedNodes = nodeReferences
    .map((id) => graph.nodes.find((n) => n.id === id))
    .filter(Boolean);
  const mentionOptions = mention
    ? graph.nodes
        .filter(
          (n) =>
            !nodeReferences.includes(n.id) &&
            `${nodeName(n)} ${n.id}`.toLowerCase().includes(mention.query.toLowerCase()),
        )
        .slice(0, 30)
    : [];
  const updateMention = (input) => {
    const next = getChatCutTrigger(input.value, input.selectionStart);
    setMention(next?.kind === "asset" ? next : null);
    setMentionIndex(0);
  };
  const chooseMention = (n) => {
    if (!mention) return;
    const caret = mention.start;
    setDraft((value) => value.slice(0, mention.start) + value.slice(mention.end));
    setNodeReferences((ids) => [...new Set([...ids, n.id])]);
    setMention(null);
    requestAnimationFrame(() => {
      chatInput.current?.focus();
      chatInput.current?.setSelectionRange(caret, caret);
    });
  };
  const send = async () => {
    if (!ready || chatBusy || proposal || !draft.trim()) return;
    const instruction = draft.trim(),
      snapshot = latest.current,
      controller = new AbortController();
    chatController.current = controller;
    setDraft("");
    setNodeReferences([]);
    setMention(null);
    setChatBusy(true);
    update(
      (g) => ({
        ...g,
        messages: [
          ...g.messages,
          {
            role: "user",
            text:
              instruction +
              (referencedNodes.length
                ? "\n" + referencedNodes.map((n) => `@${nodeName(n)}`).join(" · ")
                : ""),
            nodeIds: referencedNodes.map((n) => n.id),
          },
        ],
      }),
      false,
    );
    try {
      const reply = await requestCanvasEdits({
        graph: snapshot,
        instruction,
        history: snapshot.messages,
        language,
        signal: controller.signal,
        selectedId: selected,
        referencedNodeIds: referencedNodes.map((n) => n.id),
        model: node?.params.model,
        assetIds: [
          ...new Set(
            [...referencedNodes, ...(node ? [node] : [])]
              .map((n) => sourceAsset(n)?.id)
              .filter(Boolean),
          ),
        ],
      });
      if (!mounted.current) return;
      update(
        (g) => ({
          ...g,
          messages: [...g.messages, { role: "assistant", text: reply.text, model: reply.model }],
        }),
        false,
      );
      setProposal(reply.proposal || null);
    } catch (e) {
      if (!isAbort(e) && mounted.current) setNotice(c.failed);
    } finally {
      if (mounted.current) setChatBusy(false);
      chatController.current = null;
    }
  };
  const apply = () => {
    try {
      if (JSON.stringify(inspectCanvas(latest.current)) !== proposal.before)
        throw new Error("CHANGED");
      const next = applyCanvasOperations(latest.current, proposal.operations);
      update(next);
      setProposal(null);
    } catch {
      setNotice(c.changed);
    }
  };
  const zoom = (f) => {
    const rect = area.current.getBoundingClientRect();
    update((g) => {
      const s = Math.max(0.2, Math.min(2, g.view.scale * f)),
        ratio = s / g.view.scale;
      return {
        ...g,
        view: {
          scale: s,
          x: rect.width / 2 - (rect.width / 2 - g.view.x) * ratio,
          y: rect.height / 2 - (rect.height / 2 - g.view.y) * ratio,
        },
      };
    }, false);
  };
  const fit = () => {
    const graph = latest.current;
    if (!graph.nodes.length) return;
    const r = area.current.getBoundingClientRect(),
      l = Math.min(...graph.nodes.map((n) => n.x)),
      t = Math.min(...graph.nodes.map((n) => n.y)),
      w = Math.max(...graph.nodes.map((n) => n.x + size(n).width)) - l,
      h = Math.max(...graph.nodes.map((n) => n.y + size(n).height)) - t,
      s = Math.min(1, (r.width - 80) / w, (r.height - 100) / h);
    update(
      (g) => ({
        ...g,
        view: {
          scale: Math.max(0.2, s),
          x: (r.width - w * s) / 2 - l * s,
          y: (r.height - h * s) / 2 - t * s,
        },
      }),
      false,
    );
  };
  const start = (e, n) => {
    if (!ready || e.button !== 0 || e.target.closest("button,input,textarea,select,video,audio"))
      return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (n) {
      setSelected(n.id);
      setInspector(true);
    }
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      node: n,
      view: latest.current.view,
      before: latest.current,
    };
  };
  const move = (e) => {
    if (linkDrag.current) {
      const r = area.current.getBoundingClientRect(),
        v = latest.current.view;
      setLinkPreview({
        from: linkDrag.current.from,
        x: (e.clientX - r.left - v.x) / v.scale,
        y: (e.clientY - r.top - v.y) / v.scale,
        menu: false,
      });
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    update(
      (g) =>
        d.node
          ? {
              ...g,
              nodes: g.nodes.map((n) =>
                n.id === d.node.id
                  ? { ...n, x: d.node.x + dx / d.view.scale, y: d.node.y + dy / d.view.scale }
                  : n,
              ),
            }
          : { ...g, view: { ...d.view, x: d.view.x + dx, y: d.view.y + dy } },
      false,
    );
  };
  const end = (event) => {
    const wire = linkDrag.current;
    if (wire) {
      linkDrag.current = null;
      const hit = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-input-node]");
      if (hit) {
        connect(wire.from, hit.dataset.inputNode, hit.dataset.inputPort);
        setLinkPreview(null);
        return;
      }
      const r = area.current.getBoundingClientRect(),
        v = latest.current.view;
      const source = latest.current.nodes.find((n) => n.id === wire.from);
      const clicked = Math.hypot(event.clientX - wire.clientX, event.clientY - wire.clientY) < 5;
      setLinkPreview({
        from: wire.from,
        x: clicked ? source.x + size(source).width + 100 : (event.clientX - r.left - v.x) / v.scale,
        y: clicked ? source.y + 70 : (event.clientY - r.top - v.y) / v.scale,
        menu: true,
      });
      return;
    }
    const completed = drag.current;
    if (completed?.node) {
      setHistory((h) => [...h.slice(-39), completed.before]);
      setFuture([]);
    }
    drag.current = null;
  };
  const removeNode = (id) => {
    if (!ready || !id || !latest.current.nodes.some((n) => n.id === id)) return;
    if (running.current?.nodeId === id) cancel();
    update((g) => ({
      ...g,
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.from !== id && e.to !== id),
    }));
    setSelected(null);
    setNodeMenu(null);
    setConnecting(null);
    setLinkPreview(null);
    setInputChoice(null);
  };
  const removeSelected = () => removeNode(selected);
  useEffect(() => {
    const handleDelete = (event) => {
      if (
        !["Delete", "Backspace"].includes(event.key) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, select, [role='textbox'], [role='combobox']") ||
          target.isContentEditable)
      )
        return;
      // The open canvas owns deletion; never let it reach the underlying timeline.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat && !preview && !inputChoice) removeSelected();
    };
    window.addEventListener("keydown", handleDelete, true);
    return () => window.removeEventListener("keydown", handleDelete, true);
  });
  const btn = (Icon, label, action, disabled = false) => (
    <button
      className="nc-icon"
      aria-label={label}
      title={label}
      onClick={action}
      disabled={disabled}
    >
      <Icon size={19} />
    </button>
  );
  const labelPort = (id) =>
    ({
      frame: c.firstFrame,
      reference: c.reference,
      character: c.character,
      scene: c.scene,
      script: c.script,
      text: c.text,
    })[id] || c.output;
  const mediaView = (a) =>
    a?.type === "image" ? (
      <img src={a.src} alt={a.name} draggable={false} onDoubleClick={() => setPreview(a)} />
    ) : a?.type === "video" ? (
      <video src={a.src} controls preload="metadata" />
    ) : a?.type === "audio" ? (
      <audio src={a.src} controls preload="metadata" />
    ) : null;
  const nodeStale = (n) => {
    try {
      return canvasResultIsStale(graph, n);
    } catch {
      return true;
    }
  };
  const incoming = node && CANVAS_NODE_TYPES[node.kind].inputs;
  const executable =
    node && ["image", "video", "voice", "music", "script", "shot"].includes(node.kind);
  const canRun = () => {
    if (
      !executable ||
      !ready ||
      busy ||
      (!isAnnaEdition && ["script", "shot", "voice", "video"].includes(node.kind))
    )
      return false;
    try {
      return (
        Boolean(resolveCanvasInput(graph, node.id, library.current).prompt.trim()) &&
        (!["image", "video"].includes(node.kind) || connection?.state === "connected")
      );
    } catch {
      return false;
    }
  };
  return (
    <section
      ref={root}
      className={`canvas-workspace ${!chatOpen ? "nc-chat-closed" : ""} ${!inspector ? "nc-inspector-closed" : ""}`}
      aria-label={c.title}
      lang={language}
    >
      <header className="nc-topbar">
        {btn(ArrowLeft, c.close, () => {
          cancel();
          onClose();
        })}
        <strong>{c.title}</strong>
        <span className={`nc-save is-${saveStatus}`} role="status">
          {c[saveStatus] || c.ready}
        </span>
        <div className="nc-spacer" />
        {btn(ArrowUUpLeft, c.undo, undo, !history.length || !ready)}
        {btn(ArrowUUpRight, c.redo, redo, !future.length || !ready)}
        {btn(SidebarSimple, c.chat, () => setChatOpen((v) => !v))}
        {btn(Plug, c.parameters, () => setInspector((v) => !v))}
      </header>
      {chatOpen && (
        <aside className="nc-chat chatcut">
          <header className="chatcut-header">
            <div className="chatcut-session-heading">
              <span>{c.title}</span>
              <strong>Anna</strong>
            </div>
            {btn(SidebarSimple, c.close, () => setChatOpen(false))}
          </header>
          <div className="chatcut-messages" role="log" aria-live="polite">
            {graph.messages.length ? (
              graph.messages.map((m, i) => (
                <div className="chatcut-turn" key={i}>
                  {m.role === "assistant" ? (
                    <ChatCutMarkdown text={m.text} />
                  ) : (
                    <p className="chatcut-message is-user">{m.text}</p>
                  )}
                  {m.model && (
                    <small>
                      {c.model}: {m.model}
                    </small>
                  )}
                </div>
              ))
            ) : (
              <div className="chatcut-welcome">
                <h2>{c.empty}</h2>
                <p>{c.emptyHint}</p>
              </div>
            )}
            {proposal && (
              <div className="nc-proposal">
                <strong>{c.changes}</strong>
                <p>{proposal.summary}</p>
                <ul>
                  {proposal.operations.map((op, i) => (
                    <li key={i}>
                      {op.type === "add"
                        ? `${c.add} · ${c[op.kind]}`
                        : op.type === "remove"
                          ? `${c.remove} · ${op.id}`
                          : op.type === "update"
                            ? `${c.parameters} · ${op.id}`
                            : `${op.type === "connect" ? c.connect : c.disconnect} · ${op.from} → ${op.to} · ${labelPort(op.port)}`}
                    </li>
                  ))}
                </ul>
                <button className="nc-primary" onClick={apply}>
                  {c.apply}
                </button>
                <button onClick={() => setProposal(null)}>{c.cancel}</button>
              </div>
            )}
          </div>
          <form
            className="chatcut-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {referencedNodes.length > 0 && (
              <div className="chatcut-references" aria-label={c.mentionNodes}>
                {referencedNodes.map((n) => {
                  const Icon = ICONS[n.kind];
                  return (
                    <div className="chatcut-reference" key={n.id}>
                      <span className="chatcut-reference-at">@</span>
                      <Icon size={16} />
                      <span className="chatcut-reference-name">{nodeName(n)}</span>
                      <button
                        type="button"
                        aria-label={`${c.remove}: ${nodeName(n)}`}
                        disabled={chatBusy}
                        onClick={() => setNodeReferences((ids) => ids.filter((id) => id !== n.id))}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <textarea
              ref={chatInput}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(mention)}
              aria-controls={mention ? "canvas-node-mentions" : undefined}
              aria-activedescendant={
                mention && mentionOptions.length
                  ? `canvas-mention-${Math.min(mentionIndex, mentionOptions.length - 1)}`
                  : undefined
              }
              onSelect={(e) => {
                if (!chatComposing.current) updateMention(e.target);
              }}
              onBlur={() => setMention(null)}
              onCompositionStart={() => {
                chatComposing.current = true;
                setMention(null);
              }}
              onCompositionEnd={(e) => {
                chatComposing.current = false;
                updateMention(e.target);
              }}
              aria-label={c.chat}
              placeholder={c.placeholder}
              value={draft}
              disabled={!ready || chatBusy}
              onChange={(e) => {
                setDraft(e.target.value);
                if (!chatComposing.current) updateMention(e.target);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || chatComposing.current || e.keyCode === 229) return;
                if (mention) {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setMention(null);
                    return;
                  }
                  if (mentionOptions.length && ["ArrowDown", "ArrowUp"].includes(e.key)) {
                    e.preventDefault();
                    setMentionIndex(
                      (i) =>
                        (i + (e.key === "ArrowDown" ? 1 : mentionOptions.length - 1)) %
                        mentionOptions.length,
                    );
                    return;
                  }
                  if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                    e.preventDefault();
                    if (mentionOptions.length)
                      chooseMention(
                        mentionOptions[Math.min(mentionIndex, mentionOptions.length - 1)],
                      );
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!e.repeat) void send();
                }
              }}
            />
            {mention && (
              <div
                className="chatcut-completions"
                id="canvas-node-mentions"
                role="listbox"
                aria-label={c.mentionNodes}
              >
                <div className="chatcut-completions-heading">{c.mentionNodes}</div>
                {mentionOptions.length ? (
                  mentionOptions.map((n, i) => {
                    const Icon = ICONS[n.kind];
                    return (
                      <button
                        type="button"
                        role="option"
                        id={`canvas-mention-${i}`}
                        aria-selected={i === Math.min(mentionIndex, mentionOptions.length - 1)}
                        key={n.id}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => chooseMention(n)}
                      >
                        <Icon size={18} />
                        <span>{nodeName(n)}</span>
                      </button>
                    );
                  })
                ) : (
                  <p>{c.noResults}</p>
                )}
              </div>
            )}

            <div className="chatcut-composer-toolbar">
              <button
                type="button"
                className="chatcut-import"
                disabled={!ready || chatBusy}
                onClick={() => fileInput.current.click()}
              >
                <Paperclip size={19} />
                {c.import}
              </button>
              <div className="chatcut-send">
                {chatBusy ? (
                  <button
                    type="button"
                    aria-label={c.stop}
                    onClick={() => chatController.current?.abort()}
                  >
                    <Stop size={20} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    aria-label={c.send}
                    disabled={!ready || !draft.trim() || Boolean(proposal)}
                  >
                    <PaperPlaneTilt size={21} />
                  </button>
                )}
              </div>
            </div>
          </form>
        </aside>
      )}
      <main
        ref={area}
        className="nc-canvas"
        onPointerDown={(e) => start(e, null)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          linkDrag.current = null;
          setLinkPreview(null);
          setConnecting(null);
          drag.current = null;
        }}
        onWheel={(e) => {
          // Floating controls keep their native scrolling, including at the ends.
          if (
            e.target instanceof Element &&
            e.target.closest(".nc-picker, .nc-node-menu, .nc-modal")
          ) return;
          if (!ready) return;
          if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.002));
          else
            update(
              (g) => ({
                ...g,
                view: { ...g.view, x: g.view.x - e.deltaX, y: g.view.y - e.deltaY },
              }),
              false,
            );
        }}
      >
        <div className="nc-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          <button
            className="nc-add"
            aria-label={c.add}
            onClick={() => setPicker((v) => !v)}
            disabled={!ready}
          >
            <Plus size={23} />
          </button>
          {btn(Cursor, c.parameters, () => setTool("select"))}
          {btn(Hand, c.fit, () => setTool("hand"))}
          {btn(FrameCorners, c.fit, fit)}
        </div>
        {picker && (
          <div className="nc-picker" onPointerDown={(e) => e.stopPropagation()}>
            <label>
              <MagnifyingGlass size={17} />
              <input
                autoFocus
                aria-label={c.search}
                placeholder={c.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {Object.keys(CANVAS_NODE_TYPES)
              .filter((k) => c[k].toLowerCase().includes(search.toLowerCase()))
              .map((k) => {
                const Icon = ICONS[k];
                return (
                  <button key={k} onClick={() => add(k)}>
                    <Icon size={19} />
                    {c[k]}
                  </button>
                );
              })}
            <button onClick={() => fileInput.current.click()}>
              <Paperclip size={19} />
              {c.import}
            </button>
          </div>
        )}
        {linkPreview?.menu && (
          <div
            className="nc-picker nc-next-picker"
            style={{
              left: Math.max(
                65,
                Math.min(
                  area.current.clientWidth - 250,
                  linkPreview.x * graph.view.scale + graph.view.x,
                ),
              ),
              top: Math.max(
                12,
                Math.min(
                  area.current.clientHeight - 330,
                  linkPreview.y * graph.view.scale + graph.view.y,
                ),
              ),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="nc-next-heading">
              <strong>{c.nextNode}</strong>
              {btn(X, c.cancel, () => {
                setLinkPreview(null);
                setConnecting(null);
              })}
            </div>
            {nextOptions.map((option) => {
              const Icon = ICONS[option.kind];
              return (
                <button key={`${option.kind}-${option.port}`} onClick={() => addNext(option)}>
                  <Icon size={19} />
                  {c[option.kind]}
                  <small>{labelPort(option.port)}</small>
                </button>
              );
            })}
            {!nextOptions.length && <p>{c.noNext}</p>}
          </div>
        )}
        {!ready && (
          <div className="nc-empty">
            <SpinnerGap className="nc-spin" size={28} />
            <p>{c[saveStatus] || c.loading}</p>
            {["saveError", "hostRequired"].includes(saveStatus) && (
              <button
                onClick={() => {
                  onClose();
                }}
              >
                {c.close}
              </button>
            )}
          </div>
        )}
        {ready && !graph.nodes.length && (
          <div className="nc-empty">
            <FrameCorners size={40} />
            <h2>{c.empty}</h2>
            <p>{c.emptyHint}</p>
            <div>
              <button className="nc-primary" onClick={() => add("text")}>
                <Plus size={17} />
                {c.text}
              </button>
              <button onClick={() => fileInput.current.click()}>
                <Paperclip size={17} />
                {c.import}
              </button>
            </div>
          </div>
        )}
        {connecting && !linkPreview?.menu && (
          <div className="nc-connect-hint" onPointerDown={(e) => e.stopPropagation()}>
            {c.selectInput}
            {btn(X, c.cancel, () => {
              setConnecting(null);
              setLinkPreview(null);
            })}
          </div>
        )}
        <div
          className="nc-world"
          style={{
            transform: `translate(${graph.view.x}px,${graph.view.y}px) scale(${graph.view.scale})`,
          }}
        >
          <svg className="nc-edges" width="1" height="1" aria-hidden="true">
            <defs>
              <marker
                id="nc-direction"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path className="nc-arrowhead" d="M 1 1 L 9 5 L 1 9 Z" />
              </marker>
            </defs>
            {linkPreview &&
              (() => {
                const a = graph.nodes.find((n) => n.id === linkPreview.from);
                if (!a) return null;
                const x = a.x + size(a).width,
                  y = a.y + size(a).height - 20;
                return (
                  <path
                    className="nc-live-edge"
                    markerEnd="url(#nc-direction)"
                    d={`M${x},${y} C${x + 80},${y} ${linkPreview.x - 80},${linkPreview.y} ${linkPreview.x},${linkPreview.y}`}
                  />
                );
              })()}
            {graph.edges.map((e, i) => {
              const a = graph.nodes.find((n) => n.id === e.from),
                b = graph.nodes.find((n) => n.id === e.to);
              if (!a || !b) return null;
              const y = a.y + size(a).height - 20,
                z =
                  b.y +
                  70 +
                  CANVAS_NODE_TYPES[b.kind].inputs.findIndex((p) => p.id === e.port) * 34;
              return (
                <path
                  key={i}
                  markerEnd="url(#nc-direction)"
                  d={`M${a.x + size(a).width},${y} C${a.x + size(a).width + 60},${y} ${b.x - 60},${z} ${b.x},${z}`}
                />
              );
            })}
          </svg>
          {graph.nodes.map((n) => {
            const Icon = ICONS[n.kind],
              s = size(n),
              out = resultOf(n),
              asset = sourceAsset(n),
              stale = nodeStale(n),
              runningHere = task?.nodeId === n.id;
            return (
              <article
                key={n.id}
                className={`nc-node nc-node-${n.kind} ${selected === n.id ? "is-selected" : ""}`}
                style={{ left: n.x, top: n.y, width: s.width, minHeight: s.height }}
                onPointerDown={(e) => {
                  if (tool === "select") start(e, n);
                }}
                onClick={() => {
                  setSelected(n.id);
                  setInspector(true);
                }}
              >
                <header>
                  <Icon size={19} />
                  <strong>{c[n.kind]}</strong>
                  {runningHere ? (
                    <SpinnerGap size={16} className="nc-spin" />
                  ) : out ? (
                    <small className={stale ? "is-stale" : ""}>
                      {stale ? c.stale : c.complete}
                    </small>
                  ) : n.lastState && ["error", "interrupted"].includes(n.lastState) ? (
                    <small className="is-stale">{c[n.lastState]}</small>
                  ) : null}
                  <button
                    type="button"
                    className="nc-icon nc-node-menu-trigger"
                    aria-label={`${c[n.kind]} · ${c.nodeActions}`}
                    title={c.nodeActions}
                    aria-haspopup="menu"
                    aria-expanded={nodeMenu?.id === n.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setSelected(n.id);
                      setNodeMenu((current) =>
                        current?.id === n.id
                          ? null
                          : {
                              id: n.id,
                              x: Math.max(8, Math.min(window.innerWidth - 220, r.right - 210)),
                              y: Math.max(8, Math.min(window.innerHeight - 185, r.bottom + 6)),
                            },
                      );
                    }}
                  >
                    <DotsThree size={19} />
                  </button>
                </header>
                <div
                  className="nc-node-content"
                  style={{ marginTop: CANVAS_NODE_TYPES[n.kind].inputs.length * 34 }}
                >
                  {asset ? (
                    mediaView(asset)
                  ) : out?.data ? (
                    <div className="nc-shot-summary">
                      {(Array.isArray(out.data) ? out.data : [out.data]).map((shot, index) => (
                        <div key={index}>
                          <strong>{shot.title}</strong>
                          <p>{shot.description}</p>
                          <small>
                            {c.duration}: {shot.duration}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`nc-node-placeholder ${n.text ? "has-text" : "is-empty"}`}>
                      <Icon size={27} />
                      <p>{n.text || c.noResults}</p>
                      {n.kind === "video" &&
                        !graph.edges.some((e) => e.to === n.id && e.port === "frame") && (
                          <small>
                            {c.missingInput} · {c.firstFrame}
                          </small>
                        )}
                    </div>
                  )}
                </div>
                {n.results.length > 0 && (
                  <footer>
                    <select
                      aria-label={c.results}
                      value={n.resultId || ""}
                      onChange={(e) => patch(n.id, { resultId: e.target.value })}
                    >
                      {n.results.map((r, i) => (
                        <option key={r.id} value={r.id}>
                          {c.output} {i + 1}
                        </option>
                      ))}
                    </select>
                    {asset && btn(DownloadSimple, c.download, () => download(asset))}
                  </footer>
                )}
                {CANVAS_NODE_TYPES[n.kind].inputs.map((p, i) => (
                  <button
                    className={`nc-port is-input ${connecting && canConnect(connecting, n.id, p.id) ? "is-available" : ""}`}
                    data-input-node={n.id}
                    data-input-port={p.id}
                    key={p.id}
                    style={{ top: 70 + i * 34 }}
                    aria-label={`${c[n.kind]} · ${labelPort(p.id)}`}
                    title={labelPort(p.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connecting) {
                        connect(connecting, n.id, p.id);
                        setLinkPreview(null);
                      } else {
                        setSelected(n.id);
                        setInputChoice(p);
                      }
                    }}
                  >
                    <span>{labelPort(p.id)}</span>
                  </button>
                ))}
                <button
                  className={`nc-port is-output ${connecting === n.id ? "is-armed" : ""}`}
                  style={{ top: s.height - 20 }}
                  aria-label={`${c[n.kind]} · ${c.output}`}
                  onPointerDown={(e) => {
                    if (!ready || e.button !== 0) return;
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    linkDrag.current = { from: n.id, clientX: e.clientX, clientY: e.clientY };
                    setConnecting(n.id);
                    setPicker(false);
                    setLinkPreview({
                      from: n.id,
                      x: n.x + s.width + 50,
                      y: n.y + s.height - 20,
                      menu: false,
                    });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.detail === 0) {
                      setConnecting(n.id);
                      setLinkPreview({
                        from: n.id,
                        x: n.x + s.width + 100,
                        y: n.y + 70,
                        menu: true,
                      });
                    }
                  }}
                >
                  <span>{c.output}</span>
                </button>
              </article>
            );
          })}
        </div>
        <div className="nc-navigation" onPointerDown={(e) => e.stopPropagation()}>
          <button className="nc-minimap" aria-label={c.fit} onClick={fit}>
            {graph.nodes.map((n) => (
              <i
                key={n.id}
                className={selected === n.id ? "is-selected" : ""}
                style={{
                  left: 8 + Math.max(0, n.x) * 0.06,
                  top: 8 + Math.max(0, n.y) * 0.04,
                  width: size(n).width * 0.06,
                  height: 15,
                }}
              />
            ))}
          </button>
          <div>
            {btn(Minus, c.zoomOut, () => zoom(1 / 1.15))}
            <span>{Math.round(graph.view.scale * 100)}%</span>
            {btn(Plus, c.zoomIn, () => zoom(1.15))}
            {btn(FrameCorners, c.fit, fit)}
          </div>
        </div>
      </main>
      {inspector && (
        <aside className="nc-inspector">
          <div className="nc-heading">
            <strong>{node ? c[node.kind] : c.parameters}</strong>
            {btn(X, c.close, () => setInspector(false))}
          </div>
          {node ? (
            <>
              <div className="nc-tabs">
                <span>{c.parameters}</span>
                <button
                  onClick={() =>
                    selectedAssets[0] ? setPreview(selectedAssets[0]) : setNotice(c.noResults)
                  }
                >
                  {c.results}
                </button>
              </div>
              <div className="nc-inspector-body">
                <label className="nc-field">
                  {c.prompt}
                  <textarea
                    value={node.text}
                    maxLength={16000}
                    onChange={(e) => patch(node.id, { text: e.target.value })}
                  />
                </label>
                {incoming?.length > 0 && (
                  <section className="nc-inputs">
                    <h4>{c.dependencies}</h4>
                    {incoming.map((p) => {
                      const edges = graph.edges.filter((e) => e.to === node.id && e.port === p.id);
                      return (
                        <div key={p.id}>
                          <strong>
                            {labelPort(p.id)}
                            {p.required ? " *" : ""}
                          </strong>
                          {edges.map((e, i) => (
                            <div className="nc-input-row" key={i}>
                              <span>{c[graph.nodes.find((n) => n.id === e.from)?.kind]}</span>
                              {btn(LinkBreak, c.disconnect, () =>
                                update((g) => ({ ...g, edges: g.edges.filter((x) => x !== e) })),
                              )}
                            </div>
                          ))}
                          <button className="nc-outline" onClick={() => setInputChoice(p)}>
                            <Plus size={15} />
                            {edges.length && p.multiple
                              ? c.add
                              : edges.length
                                ? c.connected
                                : c.disconnected}
                          </button>
                        </div>
                      );
                    })}
                  </section>
                )}
                {["image", "video"].includes(node.kind) && (
                  <>
                    <label className="nc-field">
                      {c.provider}
                      <select
                        value={provider}
                        disabled={busy}
                        onChange={(e) => patchParams(node.id, { provider: e.target.value })}
                      >
                        {GENERATION_PROVIDERS.filter((p) =>
                          node.kind === "image" ? p.outputTypes.includes("image") : p.id === "anna",
                        ).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    {["comfyui", "webui"].includes(provider) && (
                      <label className="nc-field">
                        URL
                        <input
                          value={node.params.endpoint || connection?.endpoint || ""}
                          onChange={(e) => patchParams(node.id, { endpoint: e.target.value })}
                        />
                      </label>
                    )}
                    <div className="nc-connection">
                      <span>
                        {c[connection?.state] ||
                          (connection?.state === "authorizing" ? c.connecting : c.disconnected)}
                      </span>
                      {connection?.state !== "connected" && (
                        <button
                          onClick={connectProvider}
                          disabled={
                            connection?.state === "connecting" ||
                            connection?.state === "authorizing"
                          }
                        >
                          <Plug size={15} />
                          {c.connect}
                        </button>
                      )}
                    </div>
                    {provider === "comfyui" && (
                      <label className="nc-field">
                        {c.workflow}
                        <textarea
                          value={node.params.workflowTemplate || ""}
                          onChange={(e) =>
                            patchParams(node.id, { workflowTemplate: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <label className="nc-field">
                      {c.ratio}
                      <select
                        value={node.params.aspectRatio}
                        onChange={(e) => patchParams(node.id, { aspectRatio: e.target.value })}
                      >
                        {["16:9", "9:16", "1:1"].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    {node.kind === "video" && (
                      <>
                        <label className="nc-field">
                          {c.duration}
                          <select
                            value={node.params.durationSec}
                            onChange={(e) =>
                              patchParams(node.id, { durationSec: Number(e.target.value) })
                            }
                          >
                            {[5, 10, 15].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                        <label className="nc-field">
                          {c.resolution}
                          <select
                            value={node.params.resolution}
                            onChange={(e) => patchParams(node.id, { resolution: e.target.value })}
                          >
                            {["480p", "720p", "1080p"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </>
                )}
                {["image", "script", "shot"].includes(node.kind) && isAnnaEdition && (
                  <label className="nc-field">
                    {c.model}
                    <div className="nc-model-row">
                      <select
                        value={node.params.model || ""}
                        onChange={(e) => patchParams(node.id, { model: e.target.value })}
                      >
                        <option value="">Anna</option>
                        {models
                          .filter((m) =>
                            (m.serviceTypes || []).some((t) =>
                              node.kind === "image"
                                ? /image/.test(t)
                                : /llm|chat|text|completion/.test(t),
                            ),
                          )
                          .map((m) => (
                            <option key={m.modelName} value={m.modelName}>
                              {m.displayName || m.modelName}
                            </option>
                          ))}
                      </select>
                      {btn(Plug, c.connect, loadCatalog)}
                    </div>
                  </label>
                )}
                {node.kind === "voice" && (
                  <>
                    <label className="nc-field">
                      {c.model}
                      <div className="nc-model-row">
                        <select
                          value={node.params.ttsModel || ""}
                          onChange={(e) =>
                            patchParams(node.id, { ttsModel: e.target.value, voice: "" })
                          }
                        >
                          <option value="">Anna</option>
                          {tts.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        {btn(Plug, c.connect, loadCatalog)}
                      </div>
                    </label>
                    <label className="nc-field">
                      {c.voiceChoice}
                      <select
                        value={node.params.voice || ""}
                        onChange={(e) => patchParams(node.id, { voice: e.target.value })}
                      >
                        <option value="">Anna</option>
                        {(
                          tts.find((m) => m.id === node.params.ttsModel) ||
                          tts.find((m) => m.preferred) ||
                          tts[0]
                        )?.voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="nc-field">
                      {c.speechLanguage}
                      <select
                        value={node.params.speechLanguage || language}
                        onChange={(e) => patchParams(node.id, { speechLanguage: e.target.value })}
                      >
                        {[
                          "zh",
                          "en",
                          "ja",
                          "ko",
                          "es",
                          "fr",
                          "de",
                          "pt",
                          "th",
                          "vi",
                          "ru",
                          "it",
                          "id",
                        ].map((l) => (
                          <option key={l} value={l}>
                            {new Intl.DisplayNames([language], { type: "language" }).of(l)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {node.kind === "music" && (
                  <>
                    <label className="nc-field">
                      {c.duration}
                      <select
                        value={node.params.seconds}
                        onChange={(e) => patchParams(node.id, { seconds: Number(e.target.value) })}
                      >
                        {[15, 30, 60].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label className="nc-field">
                      BPM
                      <input
                        type="number"
                        min="60"
                        max="180"
                        value={node.params.bpm}
                        onChange={(e) => patchParams(node.id, { bpm: Number(e.target.value) })}
                      />
                    </label>
                  </>
                )}
                {executable && (
                  <>
                    <button
                      className="nc-primary nc-run"
                      disabled={task?.nodeId !== node.id && !canRun()}
                      onClick={() => (task?.nodeId === node.id ? cancel() : run())}
                    >
                      {task?.nodeId === node.id ? <Stop size={18} /> : <Play size={18} />}{" "}
                      {task?.nodeId === node.id ? c.stop : c.run}
                    </button>
                    {node.remoteJob && (
                      <button
                        className="nc-outline"
                        disabled={busy || connection?.state !== "connected"}
                        onClick={() => run(true)}
                      >
                        {c.resume}
                      </button>
                    )}
                    <p className="nc-help">{node.kind === "music" ? c.localMusic : c.quota}</p>
                    {result && <p className="nc-help">{c.preserveResult}</p>}
                  </>
                )}
                {node.kind === "media" && (
                  <button
                    className="nc-outline"
                    onClick={() => setInputChoice({ assetPicker: true })}
                  >
                    <ImageSquare size={16} />
                    {c.assets}
                  </button>
                )}
                {node.kind === "media" && (
                  <button className="nc-outline" onClick={() => fileInput.current.click()}>
                    <Paperclip size={16} />
                    {c.import}
                  </button>
                )}
                {result?.model && (
                  <p className="nc-help">
                    {c.model}: {result.model}
                  </p>
                )}
                {selectedAssets.map((a) => (
                  <button className="nc-result-download" key={a.id} onClick={() => download(a)}>
                    <DownloadSimple size={15} />
                    {a.name}
                  </button>
                ))}
                <button className="nc-delete" onClick={removeSelected}>
                  <Trash size={16} />
                  {c.remove}
                </button>
              </div>
            </>
          ) : (
            <p className="nc-help">{c.emptyHint}</p>
          )}
        </aside>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        hidden
        onChange={(e) => {
          importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {notice && (
        <div className="nc-toast" role="status">
          {notice}
        </div>
      )}
      {nodeMenu &&
        (() => {
          const current = graph.nodes.find((n) => n.id === nodeMenu.id);
          if (!current) return null;
          const media = sourceAsset(current);
          return (
            <div
              className="nc-node-menu"
              role="menu"
              aria-label={c.nodeActions}
              style={{ left: nodeMenu.x, top: nodeMenu.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSelected(current.id);
                  setInspector(true);
                  setNodeMenu(null);
                }}
              >
                <Plug size={17} />
                {c.parameters}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!media}
                onClick={() => {
                  setPreview(media);
                  setNodeMenu(null);
                }}
              >
                <FrameCorners size={17} />
                {c.results}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!media}
                onClick={() => {
                  download(media);
                  setNodeMenu(null);
                }}
              >
                <DownloadSimple size={17} />
                {c.download}
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => removeNode(current.id)}
              >
                <Trash size={17} />
                {c.remove}
              </button>
            </div>
          );
        })()}
      {inputChoice && node && (
        <div className="nc-modal-backdrop" onClick={() => setInputChoice(null)}>
          <section className="nc-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>{inputChoice.assetPicker ? c.assets : labelPort(inputChoice.id)}</strong>
              {btn(X, c.close, () => setInputChoice(null))}
            </header>
            <div className="nc-input-options">
              {inputChoice.assetPicker
                ? library.current
                    .filter((a) => a.blob instanceof Blob)
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          update((g) => {
                            const next = {
                              ...g,
                              nodes: g.nodes.map((n) =>
                                n.id === node.id
                                  ? { ...n, assetId: a.id, mediaType: a.type, text: a.name }
                                  : n,
                              ),
                            };
                            next.edges = next.edges.filter(
                              (e) =>
                                e.from !== node.id ||
                                CANVAS_NODE_TYPES[
                                  next.nodes.find((n) => n.id === e.to)?.kind
                                ]?.inputs
                                  .find((p) => p.id === e.port)
                                  ?.types.includes(a.type),
                            );
                            return next;
                          });
                          setInputChoice(null);
                        }}
                      >
                        {a.type === "image" ? (
                          <img src={a.src} alt={a.name} />
                        ) : (
                          <span>{a.name}</span>
                        )}
                        <small>{a.name}</small>
                      </button>
                    ))
                : availableInputs(inputChoice).map((n) => {
                    const a = sourceAsset(n);
                    return (
                      <button key={n.id} onClick={() => connect(n.id, node.id, inputChoice.id)}>
                        {a?.type === "image" ? (
                          <img src={a.src} alt={a.name} />
                        ) : (
                          <span>{c[n.kind]}</span>
                        )}
                        <small>{n.text.slice(0, 70) || c[n.kind]}</small>
                      </button>
                    );
                  })}
              {!(inputChoice.assetPicker
                ? library.current.length
                : availableInputs(inputChoice).length) && <p>{c.inputNotReady}</p>}
            </div>
          </section>
        </div>
      )}
      {preview && (
        <div className="nc-modal-backdrop" onClick={() => setPreview(null)}>
          <section className="nc-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>{preview.name}</strong>
              {btn(X, c.close, () => setPreview(null))}
            </header>
            {mediaView(preview)}
            <button onClick={() => download(preview)}>
              <DownloadSimple size={17} />
              {c.download}
            </button>
          </section>
        </div>
      )}
      {recovery && (
        <div className="nc-modal-backdrop">
          <section className="nc-modal">
            <h3>{c.restored}</h3>
            <p>{c.conflict}</p>
            <button
              className="nc-primary"
              onClick={() => {
                resolvedRecovery.current = recovery.recovery.recoveryKey;
                restore(recovery.recovery, recovery.key, recovery.record?.revision || 0);
                update((g) => ({ ...g }), false);
              }}
            >
              {c.recover}
            </button>
            <button
              onClick={() => {
                resolvedRecovery.current = recovery.recovery.recoveryKey;
                restore(recovery.record, recovery.key, recovery.record?.revision || 0);
                update((g) => ({ ...g }), false);
              }}
            >
              {c.useLatest}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
