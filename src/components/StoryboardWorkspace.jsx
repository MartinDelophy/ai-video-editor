import { WorkflowProjectMenu } from "./WorkflowProjectMenu.jsx";
import { useCanvasGestures } from "../hooks/useCanvasGestures.js";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  FilmStrip,
  ImageSquare,
  User,
  MapPin,
  Minus,
  Plus,
  CornersOut,
  ArrowSquareOut,
  X,
  SpinnerGap,
  Check,
  Robot,
} from "@phosphor-icons/react";
import { ChatCut } from "./ChatCut.jsx";
import { ChatCutMediaPreview } from "./ChatCutMediaPreview.jsx";
import { getStoryboardCopy } from "../i18nStoryboard.js";
import { resolveAnnaSessionScope, isAnnaEdition } from "../lib/annaRuntime.js";
import {
  runStoryboardAgent,
  loadStoryboardModels,
  generateStoryboardImage,
} from "../lib/storyboardAgent.js";
import { readStoryboard, writeStoryboard } from "../lib/storyboardStorage.js";
import {
  STORYBOARD_GENERATORS,
  STORYBOARD_INPUTS,
  storyboardCanLink,
  storyboardLink,
  storyboardDraft,
  storyboardEdit,
  storyboardSignature,
  storyboardInputsReady,
  storyboardActiveMentions,
  storyboardMention,
} from "../lib/storyboardGraph.js";
import "./StoryboardWorkspace.css";
const icons = {
  reference: ImageSquare,
  image: ImageSquare,
  panel: FilmStrip,
  character: User,
  environment: MapPin,
  board: FilmStrip,
  video: FilmStrip,
};
const initial = () => ({
  nodes: [],
  model: "",
  imageModel: "",
  actualModel: "",
  view: { x: 40, y: 48, scale: 0.75 },
});
const dimensions = (node) => ({
  width: node.kind === "board" ? 440 : 270,
  height: node.kind === "board" ? 760 : ["reference", "panel"].includes(node.kind) ? 290 : 440,
});
const freePosition = (nodes, kind, position) => {
  const result = { ...position },
    size = dimensions({ kind });
  for (let i = 0; i <= nodes.length; i++) {
    const collision = nodes.find((n) => {
      const other = dimensions(n);
      return (
        result.x < n.x + other.width + 30 &&
        result.x + size.width + 30 > n.x &&
        result.y < n.y + other.height + 30 &&
        result.y + size.height + 30 > n.y
      );
    });
    if (!collision) break;
    result.y = collision.y + dimensions(collision).height + 60;
  }
  return result;
};
export function StoryboardWorkspace({
  language,
  projectId,
  workflowProject,
  assets,
  editor,
  generationPlugins,
  onCommitAssets,
  onClose,
}) {
  const c = getStoryboardCopy(language);
  const [state, setState] = useState(initial),
    [sessionId, setSessionId] = useState(null),
    [key, setKey] = useState(null),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("draft"),
    [models, setModels] = useState([]),
    [preview, setPreview] = useState(null),
    [selected, setSelected] = useState(null),
    [connection, setConnection] = useState(null),
    [runningNode, setRunningNode] = useState(null),
    [agentBusy, setAgentBusy] = useState(false),
    [nodeError, setNodeError] = useState(null),
    [mention, setMention] = useState(null),
    [modelMode, setModelMode] = useState("");
  const latest = useRef(state),
    library = useRef(assets),
    callbacks = useRef({ onCommitAssets }),
    revision = useRef(0),
    generation = useRef(0),
    dirty = useRef(0),
    stored = useRef(0),
    drag = useRef(null),
    nodeRun = useRef(null),
    connectionDrag = useRef(null),
    promptInputs = useRef(new Map()),
    importTarget = useRef(null),
    canvas = useRef(null),
    root = useRef(null),
    owned = useRef(new Map()),
    loadedKey = useRef(null),
    saveChain = useRef(Promise.resolve()),
    revisions = useRef(new Map()),
    latestSaves = useRef(new Map());
  latest.current = state;
  callbacks.current = { onCommitAssets };
  library.current = [
    ...assets.filter((asset) => asset.kind !== "storyboard-default-reference"),
    ...[...owned.current.values()].filter((asset) => !assets.some((item) => item.id === asset.id)),
  ];
  const update = (patch) => {
    const next =
      typeof patch === "function" ? patch(latest.current) : { ...latest.current, ...patch };
    latest.current = next;
    dirty.current++;
    setState(next);
    setStatus("draft");
  };
  useEffect(() => {
    const controller = new AbortController();
    loadStoryboardModels(controller.signal)
      .then(setModels)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    const token = ++generation.current;
    setReady(false);
    setStatus("loading");
    setKey(null);
    loadedKey.current = null;
    connectionDrag.current = null;
    setConnection(null);
    setMention(null);
    setRunningNode(null);
    importTarget.current = null;
    latest.current = initial();
    setState(latest.current);
    const editAtStart = dirty.current;
    (isAnnaEdition ? resolveAnnaSessionScope() : Promise.resolve("local"))
      .then(async (scope) => {
        const storageKey = `storyboard-v1:${scope}:${projectId}:${sessionId}`;
        const saved = await readStoryboard(storageKey);
        if (generation.current !== token) return;
        revision.current = saved?.revision || 0;
        revisions.current.set(storageKey, revision.current);
        if (dirty.current === editAtStart) {
          const hiddenIds = new Set(
            (saved?.assets || [])
              .filter((asset) => asset.kind === "storyboard-default-reference")
              .map((asset) => asset.id),
          );
          const nodes = Array.isArray(saved?.state?.nodes)
            ? saved.state.nodes.filter(
                (node) =>
                  !hiddenIds.has(node.assetId) &&
                  typeof node.id === "string" &&
                  [
                    "reference",
                    "character",
                    "environment",
                    "board",
                    "image",
                    "panel",
                    "video",
                  ].includes(node.kind) &&
                  Number.isFinite(node.x) &&
                  Number.isFinite(node.y) &&
                  Array.isArray(node.parentIds),
              )
            : [];
          for (const asset of saved?.assets || [])
            if (
              asset.kind !== "storyboard-default-reference" &&
              asset.blob instanceof Blob &&
              !library.current.some((item) => item.id === asset.id)
            ) {
              const restored = { ...asset, src: URL.createObjectURL(asset.blob) };
              restored.originalSrc = restored.src;
              owned.current.set(restored.id, restored);
            }
          if (owned.current.size) callbacks.current.onCommitAssets([...owned.current.values()]);
          const next = { ...initial(), ...(saved?.state || {}), nodes };
          latest.current = next;
          setState(next);
          setModelMode(next.model ? "custom" : "");
          stored.current = dirty.current;
          setStatus(saved ? "saved" : "draft");
        }
        loadedKey.current = storageKey;
        setKey(storageKey);
        setReady(true);
      })
      .catch(() => {
        if (generation.current === token) setStatus("saveError");
      });
    return () => {
      generation.current = token + 1;
    };
  }, [projectId, sessionId]);
  useEffect(() => {
    if (!ready || !key || dirty.current === stored.current) return;
    const tick = dirty.current,
      snapshot = state,
      storageKey = key;
    const assetRecords = library.current
      .filter(
        (asset) =>
          snapshot.nodes.some((node) => node.assetId === asset.id) ||
          snapshot.attachmentIds?.includes(asset.id),
      )
      .map(({ id, name, type, blob, width, height, duration, kind, generation }) => ({
        id,
        name,
        type,
        blob,
        width,
        height,
        duration,
        kind,
        generation,
      }));
    setStatus("saving");
    latestSaves.current.set(storageKey, tick);
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(async () => {
        if (latestSaves.current.get(storageKey) !== tick) return;
        const saved = await writeStoryboard(
          storageKey,
          { state: snapshot, assets: assetRecords },
          revisions.current.get(storageKey) || 0,
        );
        if (!saved.conflict) revisions.current.set(storageKey, saved.revision);
        if (loadedKey.current !== storageKey) return;
        if (saved.conflict) {
          setStatus("conflict");
          setReady(false);
          return;
        }
        revision.current = saved.revision;
        stored.current = tick;
        if (dirty.current === tick) setStatus("saved");
      })
      .catch(() => {
        if (loadedKey.current === storageKey) setStatus("saveError");
      });
  }, [state, ready, key]);
  useEffect(() => {
    const siblings = [...(root.current?.parentElement?.children || [])].filter(
      (element) => element !== root.current,
    );
    const previous = siblings.map((element) => element.inert);
    siblings.forEach((element) => {
      element.inert = true;
    });
    return () =>
      siblings.forEach((element, index) => {
        element.inert = previous[index];
      });
  }, []);
  const getAsset = (id) =>
    library.current.find((asset) => asset.id === id) || owned.current.get(id);
  const commit = (output, kind) => {
    const asset = {
      id: crypto.randomUUID(),
      name: output.fileName || `${c[kind]}.${output.type === "video" ? "mp4" : "png"}`,
      type: output.type || "image",
      kind: output.type === "video" ? "generated-video" : "generated-image",
      blob: output.blob,
      src: URL.createObjectURL(output.blob),
      width: output.width,
      height: output.height,
      duration: output.durationSeconds,
      generation: output.provenance,
      generated: true,
    };
    asset.originalSrc = asset.src;
    if (asset.type === "video") asset.previewSrc = asset.src;
    owned.current.set(asset.id, asset);
    library.current = [asset, ...library.current];
    callbacks.current.onCommitAssets([asset]);
    return asset;
  };
  const add = (asset, kind, parentIds, dropPosition, prompt = "") => {
    const existing = latest.current.nodes.find((node) => node.assetId === asset.id);
    if (existing) {
      if (dropPosition)
        update((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === existing.id ? { ...node, ...dropPosition } : node,
          ),
        }));
      return existing;
    }
    const nodes = latest.current.nodes;
    const peers = nodes.filter((node) => node.kind === kind).length;
    const position =
      kind === "reference"
        ? { x: 0, y: 0 }
        : kind === "character"
          ? { x: 0, y: 340 + peers * 300 }
          : kind === "environment"
            ? { x: 0, y: 650 + peers * 300 }
            : kind === "board"
              ? { x: 350 + peers * 500, y: 190 }
              : { x: 880 + peers * 310, y: 300 };
    const node = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      kind,
      prompt,
      parentIds: [...new Set(parentIds)],
      ...(dropPosition || freePosition(nodes, kind, position)),
    };
    if (STORYBOARD_GENERATORS.includes(kind) && prompt)
      node.resultSignature = storyboardSignature(node, latest.current.nodes);
    update((current) => ({ ...current, nodes: [...current.nodes, node] }));
    return node;
  };
  const importFiles = (files) => {
    if (!ready) return [];
    const imported = Array.from(files || [])
      .filter((file) => /^(image|video|audio)\//.test(file.type))
      .map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type.split("/")[0],
        blob: file,
        src: URL.createObjectURL(file),
      }));
    if (!imported.length) return [];
    for (const asset of imported) {
      owned.current.set(asset.id, asset);
      library.current = [asset, ...library.current];
    }
    callbacks.current.onCommitAssets(imported);
    for (const asset of imported)
      if (asset.type === "image") {
        const source = add(asset, "reference", [], importTarget.current?.position);
        if (
          importTarget.current &&
          storyboardCanLink(
            latest.current.nodes,
            source.id,
            importTarget.current.id,
            library.current,
          )
        )
          update({
            nodes: storyboardLink(
              latest.current.nodes,
              source.id,
              importTarget.current.id,
              library.current,
            ),
          });
      }
    importTarget.current = null;
    return imported;
  };
  const createNode = (kind, parents, position, prompt = "") => {
    const source = latest.current.nodes.find((n) => n.id === parents?.[0]);
    const location = position || {
      x: source ? source.x + dimensions(source).width + 90 : 100,
      y: source?.y || 100,
    };
    const result = storyboardDraft(
      latest.current.nodes,
      kind,
      parents,
      position ? location : freePosition(latest.current.nodes, kind, location),
      prompt,
      library.current,
    );
    update({ nodes: result.nodes });
    setSelected(result.node.id);
    setConnection(null);
    return result.node;
  };
  const completeNode = (id, asset, args) => {
    const node = latest.current.nodes.find((n) => n.id === id);
    if (
      !node ||
      node.kind !== args.kind ||
      !storyboardInputsReady(node, latest.current.nodes, library.current) ||
      storyboardSignature(node, latest.current.nodes) !== args.inputSignature
    )
      throw new Error("STALE_NODE");
    const result = { ...node, assetId: asset.id, resultSignature: args.inputSignature };
    update({ nodes: latest.current.nodes.map((n) => (n.id === id ? result : n)) });
    return result;
  };
  const recordVideoJob = (id, jobId, inputSignature) => {
    update({
      nodes: latest.current.nodes.map((n) =>
        n.id === id ? { ...n, videoJob: { id: jobId, inputSignature } } : n,
      ),
    });
  };
  const extractPanel = async (id, panelIndex) => {
    const scope = loadedKey.current;
    const source = latest.current.nodes.find((n) => n.id === id);
    const asset = library.current.find((a) => a.id === source?.assetId);
    if (
      !ready ||
      source?.kind !== "board" ||
      !asset?.blob ||
      !Number.isInteger(panelIndex) ||
      panelIndex < 0 ||
      panelIndex > 15
    )
      throw new Error("INVALID_ARGUMENT");
    if (
      source.resultSignature &&
      source.resultSignature !== storyboardSignature(source, latest.current.nodes)
    )
      throw new Error("STALE_NODE");
    const sourceSignature = storyboardSignature(source, latest.current.nodes);
    const bitmap = await createImageBitmap(asset.blob);
    let blob, width, height;
    try {
      const crop = document.createElement("canvas");
      const x = Math.round(((panelIndex % 4) * bitmap.width) / 4),
        y = Math.round((Math.floor(panelIndex / 4) * bitmap.height) / 4);
      crop.width = Math.round((((panelIndex % 4) + 1) * bitmap.width) / 4) - x;
      crop.height = Math.round(((Math.floor(panelIndex / 4) + 1) * bitmap.height) / 4) - y;
      crop
        .getContext("2d")
        .drawImage(bitmap, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      width = crop.width;
      height = crop.height;
      blob = await new Promise((resolve) => crop.toBlob(resolve, "image/png"));
    } finally {
      bitmap.close();
    }
    if (!blob || loadedKey.current !== scope) return;
    const current = latest.current.nodes.find((n) => n.id === id);
    if (
      current?.assetId !== asset.id ||
      storyboardSignature(current, latest.current.nodes) !== sourceSignature
    )
      throw new Error("STALE_NODE");
    const output = commit(
      { type: "image", blob, width, height, fileName: `${c.panel} ${panelIndex + 1}.png` },
      "panel",
    );
    const node = {
      id: crypto.randomUUID(),
      kind: "panel",
      parentIds: [id],
      panelIndex,
      assetId: output.id,
      prompt: "",
      ...freePosition(latest.current.nodes, "panel", { x: source.x + 490, y: source.y }),
    };
    node.resultSignature = storyboardSignature(node, latest.current.nodes);
    update({ nodes: [...latest.current.nodes, node] });
    return node;
  };
  const makeHost = () => ({
    recordVideoJob,
    panel: extractPanel,
    inspect: () => latest.current.nodes,
    generationKey: () => loadedKey.current,
    assets: () => library.current,
    model: () => latest.current.model,
    models: () => models,
    imageModel: () =>
      latest.current.imageModel ||
      models.find((model) => model.modelName === "openai/gpt-image-2")?.modelName ||
      "",
    actualModel: (model) => {
      if (model && model !== latest.current.actualModel) update({ actualModel: model });
    },
    add,
    commit,
    create: createNode,
    complete: completeNode,
    edit: (id, prompt, parents) => {
      const nodes = storyboardEdit(latest.current.nodes, id, prompt, parents, library.current);
      update({ nodes });
      return nodes.find((node) => node.id === id);
    },
    link: (from, to, action) => {
      if (action === "connect")
        update({ nodes: storyboardLink(latest.current.nodes, from, to, library.current) });
      else
        update({
          nodes: latest.current.nodes.map((n) =>
            n.id === to ? { ...n, parentIds: n.parentIds.filter((id) => id !== from) } : n,
          ),
        });
      return { from, to, action };
    },
  });
  const runConversation = async (input) => {
    if (!ready) throw new Error("STORAGE_NOT_READY");
    setAgentBusy(true);
    try {
      return await runStoryboardAgent(input, makeHost());
    } finally {
      setAgentBusy(false);
    }
  };
  const mentionOptions = (node, query = "") =>
    node.parentIds
      .map((id) => {
        const parent = latest.current.nodes.find((n) => n.id === id),
          asset = getAsset(parent?.assetId);
        return asset?.type === "image" && asset.src ? { nodeId: id, asset } : null;
      })
      .filter((item) => item && item.asset.name.toLowerCase().includes(query.toLowerCase()));
  const detectMention = (nodeId, element) => {
    const end = element.selectionStart ?? element.value.length;
    const match = element.value.slice(0, end).match(/@([^@{}\n]{0,160})$/u);
    setMention(
      match
        ? {
            nodeId,
            start: end - match[0].length,
            end,
            query: match[1],
            index: 0,
            text: element.value,
          }
        : null,
    );
  };
  const chooseMention = (nodeId, source, range) => {
    const node = latest.current.nodes.find((n) => n.id === nodeId);
    if (!node || !range || node.prompt !== range.text || !node.parentIds.includes(source.nodeId)) {
      setMention(null);
      return;
    }
    const binding = storyboardMention(node, source.nodeId, source.asset.name);
    const prompt =
      (node.prompt || "").slice(0, range.start) +
      binding.token +
      " " +
      (node.prompt || "").slice(range.end);
    if (prompt.length > 2000) return;
    const mentions = [...(node.mentions || []).filter((m) => m.nodeId !== source.nodeId), binding];
    update({
      nodes: latest.current.nodes.map((n) => (n.id === nodeId ? { ...n, prompt, mentions } : n)),
    });
    setMention(null);
    requestAnimationFrame(() => {
      const input = promptInputs.current.get(nodeId),
        caret = range.start + binding.token.length + 1;
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  };
  const runNode = async (id) => {
    if (!ready || nodeRun.current) return;
    const node = latest.current.nodes.find((n) => n.id === id);
    if (!node || !storyboardInputsReady(node, latest.current.nodes, library.current)) return;
    const controller = new AbortController(),
      scope = loadedKey.current;
    nodeRun.current = controller;
    setRunningNode(id);
    setNodeError(null);
    const args = {
      kind: node.kind,
      prompt: node.prompt,
      parentIds: [...node.parentIds],
      inputSignature: storyboardSignature(node, latest.current.nodes),
      mentions: [...(node.mentions || [])],
      nodeId: id,
      jobId: node.videoJob?.id,
    };
    try {
      if (node.videoJob && node.videoJob.inputSignature !== args.inputSignature)
        throw new Error("STALE_NODE");
      const output = await generateStoryboardImage(args, makeHost(), {
        signal: controller.signal,
        language,
      });
      if (output.outputs.length !== 1) throw new Error("INVALID_IMAGE_COUNT");
      const asset = commit(output.outputs[0], node.kind);
      if (loadedKey.current === scope) completeNode(id, asset, args);
    } catch (error) {
      if (!controller.signal.aborted && loadedKey.current === scope)
        setNodeError({
          id,
          text:
            error.message === "STALE_NODE"
              ? c.stale
              : error.message === "STORYBOARD_IMAGE_UNAVAILABLE"
                ? c.imageUnavailable
                : c.failed,
        });
    } finally {
      if (nodeRun.current === controller) {
        nodeRun.current = null;
        setRunningNode(null);
      }
    }
  };
  useEffect(
    () => () => {
      nodeRun.current?.abort();
      nodeRun.current = null;
    },
    [sessionId],
  );
  const formatConversationError = (error) =>
    !isAnnaEdition
      ? c.unavailable
      : error.message === "STORYBOARD_MODEL_NOT_USED"
        ? c.modelMismatch
        : error.message === "STORYBOARD_IMAGE_UNAVAILABLE"
          ? c.imageUnavailable
          : c.failed;

  const chatModels = models.filter((model) =>
    (model.serviceTypes || []).some((type) =>
      ["llm", "chat", "text", "text_gen", "chat_completion", "completion"].includes(type),
    ),
  );
  const imageModels = models.filter((model) => (model.serviceTypes || []).includes("image_gen"));
  const selectedImageModel =
    state.imageModel ||
    imageModels.find((model) => model.modelName === "openai/gpt-image-2")?.modelName ||
    "";
  const headerExtra = (
    <div className="storyboard-model">
      <label>
        <Robot size={16} />
        <span>{c.model}</span>
        <select
          aria-label={c.model}
          disabled={!ready}
          value={modelMode}
          onChange={(event) => {
            setModelMode(event.target.value);
            update({ model: event.target.value === "custom" ? "" : event.target.value });
          }}
        >
          <option value="">{c.auto}</option>
          {chatModels.map((model) => (
            <option key={model.modelName} value={model.modelName}>
              {model.displayName || model.modelName}
            </option>
          ))}
          <option value="custom">{c.custom}</option>
        </select>
      </label>
      <label className="storyboard-image-model">
        <ImageSquare size={16} />
        <span>{c.imageModel}</span>
        <select
          aria-label={c.imageModel}
          disabled={!ready || !imageModels.length}
          value={selectedImageModel}
          onChange={(event) => update({ imageModel: event.target.value })}
        >
          <option value="" disabled>
            {c.custom}
          </option>
          {imageModels.map((model) => (
            <option key={model.modelName} value={model.modelName}>
              {model.displayName || model.modelName}
            </option>
          ))}
        </select>
      </label>
      {modelMode === "custom" && (
        <input
          value={state.model}
          aria-label={c.modelName}
          placeholder={c.modelName}
          onChange={(event) => update({ model: event.target.value.slice(0, 256) })}
        />
      )}{" "}
      {state.actualModel && (
        <small>
          {c.actual}: {state.actualModel}
        </small>
      )}
    </div>
  );
  const fit = () => {
    if (!canvas.current || !state.nodes.length) {
      update({ view: initial().view });
      return;
    }
    const rect = canvas.current.getBoundingClientRect();
    const minX = Math.min(...state.nodes.map((n) => n.x)),
      minY = Math.min(...state.nodes.map((n) => n.y));
    const maxX = Math.max(...state.nodes.map((n) => n.x + dimensions(n).width)),
      maxY = Math.max(...state.nodes.map((n) => n.y + dimensions(n).height));
    const scale = Math.max(
      0.2,
      Math.min(1, (rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY)),
    );
    update({
      view: {
        scale,
        x: (rect.width - (maxX - minX) * scale) / 2 - minX * scale,
        y: (rect.height - (maxY - minY) * scale) / 2 - minY * scale,
      },
    });
  };
  const zoom = (factor, point) => {
    if (!ready) return;
    const view = latest.current.view;
    const scale = Math.max(0.2, Math.min(2, view.scale * factor));
    const anchor = point || {
      x: canvas.current.clientWidth / 2,
      y: canvas.current.clientHeight / 2,
    };
    update({
      view: {
        scale,
        x: anchor.x - ((anchor.x - view.x) * scale) / view.scale,
        y: anchor.y - ((anchor.y - view.y) * scale) / view.scale,
      },
    });
  };
  useCanvasGestures(canvas, {
    enabled: ready,
    controls:
      ".storyboard-next, .storyboard-mentions, .storyboard-dependencies, textarea, input, select, video, audio",
    onZoom: zoom,
    onPan: (x, y) =>
      update({
        view: {
          ...latest.current.view,
          x: latest.current.view.x - x,
          y: latest.current.view.y - y,
        },
      }),
  });
  const canLink = (from, to) => storyboardCanLink(latest.current.nodes, from, to, library.current);
  const link = (from, to) => {
    if (!canLink(from, to)) return;
    update({ nodes: storyboardLink(latest.current.nodes, from, to, library.current) });
    setConnection(null);
  };
  useEffect(() => {
    const point = (event) => {
      const rect = canvas.current?.getBoundingClientRect(),
        view = latest.current.view;
      return rect
        ? {
            x: (event.clientX - rect.left - view.x) / view.scale,
            y: (event.clientY - rect.top - view.y) / view.scale,
          }
        : null;
    };
    const moveConnection = (event) => {
      const active = connectionDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const location = point(event);
      if (location) setConnection({ ...active, ...location });
    };
    const finishConnection = (event) => {
      const active = connectionDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      connectionDrag.current = null;
      const location = point(event);
      if (!location) {
        setConnection(null);
        return;
      }
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const target = active.from
        ? hit?.closest("[data-storyboard-input]")?.dataset.storyboardInput
        : hit?.closest("[data-storyboard-output]")?.dataset.storyboardOutput;
      const from = active.from || target,
        to = active.to || target;
      if (target && storyboardCanLink(latest.current.nodes, from, to, library.current)) {
        update({ nodes: storyboardLink(latest.current.nodes, from, to, library.current) });
        setConnection(null);
      } else if (canvas.current.contains(hit)) {
        setConnection({ ...active, ...location, menu: true });
      } else setConnection(null);
    };
    const cancelConnection = () => {
      if (!connectionDrag.current) return;
      connectionDrag.current = null;
      setConnection(null);
    };
    document.addEventListener("pointermove", moveConnection, true);
    document.addEventListener("pointerup", finishConnection, true);
    document.addEventListener("pointercancel", cancelConnection, true);
    window.addEventListener("blur", cancelConnection);
    return () => {
      connectionDrag.current = null;
      document.removeEventListener("pointermove", moveConnection, true);
      document.removeEventListener("pointerup", finishConnection, true);
      document.removeEventListener("pointercancel", cancelConnection, true);
      window.removeEventListener("blur", cancelConnection);
    };
  }, []);
  const start = (event, node) => {
    if (!ready || event.button !== 0 || event.target.closest("button,video")) return;
    setConnection(null);
    if (node) setSelected(node.id);
    else setSelected(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId,
      nodeId: node?.id,
      x: event.clientX,
      y: event.clientY,
      view: { ...latest.current.view },
      position: node ? { x: node.x, y: node.y } : null,
    };
  };
  return (
    <section
      ref={root}
      role="dialog"
      aria-modal="true"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        importFiles(event.dataTransfer.files);
      }}
      className="storyboard-workspace"
      aria-label={c.title}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          connectionDrag.current = null;
          setConnection(null);
        }
      }}
    >
      <header className="storyboard-topbar">
        <button onClick={onClose} aria-label={c.close}>
          <ArrowLeft size={20} />
        </button>
        <strong>{c.title}</strong>
        <div className={`storyboard-save is-${status}`} role="status">
          {status === "saving" ? (
            <SpinnerGap className="chatcut-spinner" />
          ) : status === "saved" ? (
            <Check />
          ) : null}
          {c[status] || c.draft}
        </div>
        <WorkflowProjectMenu
          kind="storyboard"
          language={language}
          projects={workflowProject}
          disabled={!ready || Boolean(runningNode) || agentBusy}
          beforeSwitch={async () => {
            await saveChain.current;
            if (dirty.current !== stored.current) throw new Error("UNSAVED_PROJECT");
          }}
          getSnapshot={async () => {
            await saveChain.current;
            const scope = isAnnaEdition ? await resolveAnnaSessionScope() : "local";
            let chat;
            try {
              const saved = JSON.parse(
                localStorage.getItem(`timeline-storyboard-chat-v1:${scope}:${projectId}`),
              );
              chat = saved?.sessions?.find((s) => s.id === sessionId);
            } catch {
              /* Graph and media remain exportable. */
            }
            const snapshot = structuredClone(latest.current);
            snapshot.attachmentIds = [
              ...new Set([
                ...(snapshot.attachmentIds || []),
                ...[...owned.current.keys()].filter((id) => !chat?.excluded?.includes(id)),
              ]),
            ];
            return {
              name: chat?.title || c.title,
              state: snapshot,
              assets: [...library.current],
              chat,
            };
          }}
        />
      </header>
      <div className="storyboard-layout">
        <ChatCut
          language={language}
          projectId={projectId}
          editor={editor}
          assets={library.current}
          generationPlugins={generationPlugins}
          onSessionChange={setSessionId}
          sessionNamespace="timeline-storyboard-chat-v1"
          runConversation={runConversation}
          formatConversationError={formatConversationError}
          conversationReady={ready}
          onClose={onClose}
          showBack={false}
          headerExtra={headerExtra}
          welcome={{ title: c.welcome, description: c.hint }}
          hasMedia={state.nodes.length > 0}
          onAssetDragStart={(event, asset) => {
            if (!ready) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("application/x-timeline-storyboard-asset", asset.id);
          }}
          onPasteFiles={importFiles}
          onImport={() => document.getElementById("storyboard-import").click()}
        />
        <input
          id="storyboard-import"
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          hidden
          onCancel={() => {
            importTarget.current = null;
          }}
          onChange={(event) => {
            importFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div
          className="storyboard-canvas"
          ref={canvas}
          onDragOver={(event) => {
            if (
              !ready ||
              !event.dataTransfer.types.includes("application/x-timeline-storyboard-asset")
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            const id = event.dataTransfer.getData("application/x-timeline-storyboard-asset");
            if (!id) return;
            event.preventDefault();
            event.stopPropagation();
            if (!ready) return;
            const asset = getAsset(id);
            if (!asset || asset.preparing) return;
            const rect = canvas.current.getBoundingClientRect();
            const view = latest.current.view;
            add(asset, "reference", [], {
              x: (event.clientX - rect.left - view.x) / view.scale,
              y: (event.clientY - rect.top - view.y) / view.scale,
            });
          }}
          style={{
            backgroundPosition: `${state.view.x}px ${state.view.y}px`,
            backgroundSize: `${24 * state.view.scale}px ${24 * state.view.scale}px`,
          }}
          onPointerDown={(event) => start(event, null)}
          onPointerMove={(event) => {
            if (!ready) return;
            const d = drag.current;
            if (!d || d.id !== event.pointerId) return;
            const dx = event.clientX - d.x,
              dy = event.clientY - d.y;
            if (d.nodeId)
              update((current) => ({
                ...current,
                nodes: current.nodes.map((node) =>
                  node.id === d.nodeId
                    ? {
                        ...node,
                        x: d.position.x + dx / d.view.scale,
                        y: d.position.y + dy / d.view.scale,
                      }
                    : node,
                ),
              }));
            else update({ view: { ...d.view, x: d.view.x + dx, y: d.view.y + dy } });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <div
            className="storyboard-world"
            style={{
              transform: `translate(${state.view.x}px,${state.view.y}px) scale(${state.view.scale})`,
            }}
          >
            <svg className="storyboard-connections" width="1" height="1" aria-hidden="true">
              <defs>
                <marker
                  id="storyboard-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {connection &&
                (() => {
                  const source = state.nodes.find(
                    (node) => node.id === (connection.from || connection.to),
                  );
                  if (!source) return null;
                  const size = dimensions(source),
                    x = source.x + (connection.from ? size.width : 0),
                    y = source.y + size.height / 2;
                  return (
                    <path
                      className="is-draft"
                      d={`M${x},${y} C${x + 60},${y} ${connection.x - 60},${connection.y} ${connection.x},${connection.y}`}
                    />
                  );
                })()}
              {state.nodes.flatMap((node) =>
                node.parentIds.map((parentId) => {
                  const parent = state.nodes.find((item) => item.id === parentId);
                  if (!parent) return null;
                  const a = dimensions(parent),
                    b = dimensions(node),
                    x = parent.x + a.width,
                    y = parent.y + a.height / 2,
                    ex = node.x,
                    ey = node.y + b.height / 2,
                    bend = Math.max(50, Math.abs(ex - x) * 0.5);
                  return (
                    <path
                      key={`${parentId}:${node.id}`}
                      d={`M${x},${y} C${x + bend},${y} ${ex - bend},${ey} ${ex},${ey}`}
                      markerEnd="url(#storyboard-arrow)"
                    />
                  );
                }),
              )}
            </svg>
            {state.nodes.map((node) => {
              const asset = getAsset(node.assetId),
                Icon = icons[node.kind],
                size = dimensions(node);
              return (
                <article
                  className={`storyboard-node is-${node.kind}${selected === node.id ? " is-selected" : ""}`}
                  key={node.id}
                  style={{ left: node.x, top: node.y, width: size.width, height: size.height }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    start(event, node);
                  }}
                >
                  {STORYBOARD_INPUTS[node.kind]?.length > 0 && (
                    <button
                      className={`storyboard-port is-input${connection && canLink(connection.from, node.id) ? " is-available" : ""}`}
                      data-storyboard-input={node.id}
                      aria-label={`${c[node.kind]} · ${c.connectInput}`}
                      title={c.connectInput}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        if (!ready || event.button !== 0) return;
                        if (connection?.from) {
                          link(connection.from, node.id);
                          return;
                        }
                        connectionDrag.current = { pointerId: event.pointerId, to: node.id };
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setConnection({ to: node.id, x: node.x - 45, y: node.y + size.height / 2 });
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (event.detail === 0) {
                          if (connection?.from) link(connection.from, node.id);
                          else
                            setConnection({ to: node.id, x: node.x - 300, y: node.y, menu: true });
                        }
                      }}
                    />
                  )}
                  <header>
                    <Icon size={20} />
                    <strong>{c[node.kind]}</strong>
                    <button
                      aria-label={c.remove}
                      onClick={() =>
                        update((current) => ({
                          ...current,
                          nodes: current.nodes
                            .filter((item) => item.id !== node.id)
                            .map((item) => ({
                              ...item,
                              parentIds: item.parentIds.filter((id) => id !== node.id),
                            })),
                        }))
                      }
                    >
                      <X size={15} />
                    </button>
                  </header>
                  {node.kind === "board" && asset?.generation?.model && (
                    <small>{asset.generation.model}</small>
                  )}
                  {asset?.type === "video" ? (
                    <video src={asset.src} controls preload="metadata" />
                  ) : asset?.type === "audio" ? (
                    <audio src={asset.src} controls preload="metadata" />
                  ) : asset?.src ? (
                    <img
                      src={asset.src}
                      alt={asset.name}
                      draggable={false}
                      onDoubleClick={() => setPreview(asset)}
                    />
                  ) : (
                    <div className="storyboard-draft">
                      <Icon size={28} />
                      <span>{c.draftNode}</span>
                    </div>
                  )}
                  {node.kind === "board" && asset?.type === "image" && (
                    <div
                      className="storyboard-panel-picker"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <small>{c.selectPanel}</small>
                      <div>
                        {Array.from({ length: 16 }, (_, index) => (
                          <button
                            key={index}
                            aria-label={`${c.panel} ${index + 1}`}
                            title={`${c.panel} ${index + 1}`}
                            disabled={!ready}
                            style={{
                              backgroundImage: `url("${asset.src}")`,
                              backgroundSize: "400% 400%",
                              backgroundPosition: `${((index % 4) * 100) / 3}% ${(Math.floor(index / 4) * 100) / 3}%`,
                            }}
                            onClick={() =>
                              extractPanel(node.id, index).catch(() =>
                                setNodeError({ id: node.id, text: c.failed }),
                              )
                            }
                          >
                            <span>{index + 1}</span>
                          </button>
                        ))}
                      </div>
                      {nodeError?.id === node.id && <small role="alert">{nodeError.text}</small>}
                    </div>
                  )}
                  {STORYBOARD_GENERATORS.includes(node.kind) && (
                    <div
                      className="storyboard-node-edit"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {node.kind === "video" && <small>{c.videoDefaults}</small>}
                      <div className="storyboard-prompt-field">
                        <textarea
                          ref={(element) => {
                            if (element) promptInputs.current.set(node.id, element);
                            else promptInputs.current.delete(node.id);
                          }}
                          role="combobox"
                          aria-autocomplete="list"
                          aria-haspopup="listbox"
                          aria-label={c.nodePrompt}
                          placeholder={c.nodePrompt}
                          aria-expanded={mention?.nodeId === node.id}
                          aria-activedescendant={
                            mention?.nodeId === node.id &&
                            mentionOptions(node, mention.query)[mention.index]
                              ? `storyboard-option-${node.id}-${mentionOptions(node, mention.query)[mention.index].nodeId}`
                              : undefined
                          }
                          aria-controls={
                            mention?.nodeId === node.id
                              ? `storyboard-mentions-${node.id}`
                              : undefined
                          }
                          maxLength={2000}
                          value={node.prompt || ""}
                          onChange={(event) => {
                            update({
                              nodes: latest.current.nodes.map((n) =>
                                n.id === node.id ? { ...n, prompt: event.target.value } : n,
                              ),
                            });
                            detectMention(node.id, event.target);
                          }}
                          onClick={(event) => detectMention(node.id, event.target)}
                          onBlur={() => setMention(null)}
                          onKeyDown={(event) => {
                            if (event.nativeEvent.isComposing || mention?.nodeId !== node.id)
                              return;
                            const options = mentionOptions(node, mention.query);
                            if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                              event.preventDefault();
                              setMention((current) => ({
                                ...current,
                                index: options.length
                                  ? (current.index +
                                      (event.key === "ArrowDown" ? 1 : -1) +
                                      options.length) %
                                    options.length
                                  : 0,
                              }));
                            } else if (["Enter", "Tab"].includes(event.key) && options.length) {
                              event.preventDefault();
                              chooseMention(
                                node.id,
                                options[mention.index % options.length],
                                mention,
                              );
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              event.stopPropagation();
                              setMention(null);
                            }
                          }}
                        />
                        {mention?.nodeId === node.id && (
                          <div
                            className="storyboard-mentions"
                            id={`storyboard-mentions-${node.id}`}
                            role="listbox"
                            aria-label={c.mentionImages}
                          >
                            {mentionOptions(node, mention.query).map((option, index) => (
                              <button
                                key={option.nodeId}
                                role="option"
                                id={`storyboard-option-${node.id}-${option.nodeId}`}
                                aria-selected={index === mention.index}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => chooseMention(node.id, option, mention)}
                              >
                                <img
                                  src={option.asset.thumbnail || option.asset.src}
                                  alt=""
                                  draggable={false}
                                />
                                <span>{option.asset.name}</span>
                              </button>
                            ))}
                            {!mentionOptions(node, mention.query).length && (
                              <small>{c.noMatches}</small>
                            )}
                          </div>
                        )}
                      </div>
                      {node.parentIds.length > 0 && (
                        <>
                          <small className="storyboard-reference-hint">{c.mentionImages}</small>
                          <div className="storyboard-dependencies">
                            {node.parentIds.map((id) => {
                              const parent = state.nodes.find((n) => n.id === id),
                                source = getAsset(parent?.assetId),
                                name = source?.name || c[parent?.kind] || c.draftNode;
                              const Icon = icons[parent?.kind] || ImageSquare;
                              return (
                                <div className="storyboard-reference-chip" key={id}>
                                  <button
                                    className="storyboard-reference-preview"
                                    title={name}
                                    aria-label={`${c.view} · ${name}`}
                                    disabled={!source}
                                    onClick={() => source && setPreview(source)}
                                  >
                                    {source?.type === "image" && source.src ? (
                                      <img
                                        src={source.thumbnail || source.src}
                                        alt=""
                                        draggable={false}
                                      />
                                    ) : (
                                      <Icon size={18} />
                                    )}
                                    <span>{name}</span>
                                  </button>
                                  <button
                                    className="storyboard-reference-remove"
                                    title={c.disconnect}
                                    aria-label={`${c.disconnect} · ${name}`}
                                    onClick={() => makeHost().link(id, node.id, "disconnect")}
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                      {storyboardActiveMentions(node).some(
                        (m) => !node.parentIds.includes(m.nodeId),
                      ) && <small role="alert">{c.invalidMention}</small>}
                      {node.resultSignature &&
                        node.resultSignature !== storyboardSignature(node, state.nodes) && (
                          <small>{c.stale}</small>
                        )}
                      {nodeError?.id === node.id && <small role="alert">{nodeError.text}</small>}
                      <button
                        className="storyboard-run"
                        disabled={
                          !ready ||
                          !isAnnaEdition ||
                          (node.kind !== "video" && !selectedImageModel) ||
                          Boolean(runningNode) ||
                          !storyboardInputsReady(node, state.nodes, library.current)
                        }
                        onClick={() => runNode(node.id)}
                      >
                        {runningNode === node.id ? (
                          <>
                            <SpinnerGap className="chatcut-spinner" size={14} />
                            {c.running}
                          </>
                        ) : node.videoJob ? (
                          c.resumeVideo
                        ) : (
                          c.runNode
                        )}
                      </button>
                      <small>
                        {!storyboardInputsReady(node, state.nodes, library.current)
                          ? node.prompt?.trim()
                            ? c.waitInputs
                            : c.nodePrompt
                          : c.quota}
                      </small>
                    </div>
                  )}
                  {asset && (
                    <footer>
                      <span>
                        {asset?.width > 0 ? `${asset.width} × ${asset.height} · ` : ""}
                        {asset?.blob ? `${(asset.blob.size / 1024 / 1024).toFixed(1)} MB` : c.draft}
                      </span>
                      <button aria-label={c.view} onClick={() => asset && setPreview(asset)}>
                        <ArrowSquareOut size={16} />
                        <span>{c.view}</span>
                      </button>
                    </footer>
                  )}
                  {STORYBOARD_GENERATORS.some((kind) =>
                    STORYBOARD_INPUTS[kind].includes(node.kind),
                  ) &&
                    getAsset(node.assetId)?.type !== "audio" &&
                    getAsset(node.assetId)?.type !== "video" && (
                      <button
                        className={`storyboard-port is-output${connection?.from === node.id || (connection?.to && canLink(node.id, connection.to)) ? " is-available" : ""}`}
                        data-storyboard-output={node.id}
                        aria-label={`${c[node.kind]} · ${c.connectOutput}`}
                        title={c.connectOutput}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (!ready || event.button !== 0) return;
                          if (connection?.to) {
                            link(node.id, connection.to);
                            return;
                          }
                          connectionDrag.current = { pointerId: event.pointerId, from: node.id };
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setConnection({
                            from: node.id,
                            x: node.x + size.width + 45,
                            y: node.y + size.height / 2,
                          });
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (event.detail === 0) {
                            if (connection?.to) link(node.id, connection.to);
                            else
                              setConnection({
                                from: node.id,
                                x: node.x + size.width + 45,
                                y: node.y + size.height / 2,
                                menu: true,
                              });
                          }
                        }}
                      />
                    )}
                </article>
              );
            })}
          </div>
          {connection?.menu && (
            <div
              className="storyboard-next"
              role="dialog"
              aria-label={connection.to ? c.previousNode : c.nextNode}
              style={{
                left: Math.max(
                  12,
                  Math.min(
                    canvas.current.clientWidth - 250,
                    connection.x * state.view.scale + state.view.x,
                  ),
                ),
                top: Math.max(
                  12,
                  Math.min(
                    canvas.current.clientHeight - 240,
                    connection.y * state.view.scale + state.view.y,
                  ),
                ),
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <header>
                <strong>{connection.to ? c.previousNode : c.nextNode}</strong>
                <button aria-label={c.close} onClick={() => setConnection(null)}>
                  <X size={16} />
                </button>
              </header>
              {connection.to &&
                STORYBOARD_INPUTS[state.nodes.find((n) => n.id === connection.to)?.kind]?.includes(
                  "reference",
                ) && (
                  <button
                    onClick={() => {
                      importTarget.current = {
                        id: connection.to,
                        position: { x: connection.x, y: connection.y },
                      };
                      setConnection(null);
                      document.getElementById("storyboard-import").click();
                    }}
                  >
                    <ImageSquare size={18} />
                    <span>{c.reference}</span>
                    <Plus size={16} />
                  </button>
                )}
              {STORYBOARD_GENERATORS.filter((kind) =>
                connection.to
                  ? STORYBOARD_INPUTS[
                      state.nodes.find((n) => n.id === connection.to)?.kind
                    ]?.includes(kind)
                  : !connection.from ||
                    STORYBOARD_INPUTS[kind].includes(
                      state.nodes.find((n) => n.id === connection.from)?.kind,
                    ),
              ).map((kind) => {
                const Icon = icons[kind];
                return (
                  <button
                    key={kind}
                    onClick={() => {
                      const created = createNode(kind, connection.from ? [connection.from] : [], {
                        x: connection.x,
                        y: connection.y,
                      });
                      if (connection.to) link(created.id, connection.to);
                    }}
                  >
                    <Icon size={18} />
                    <span>{c[kind]}</span>
                    <Plus size={16} />
                  </button>
                );
              })}
              <small>{c.createHint}</small>
            </div>
          )}
          <div className="storyboard-zoom" onPointerDown={(event) => event.stopPropagation()}>
            <button
              aria-label={c.nextNode}
              disabled={!ready}
              onClick={() => {
                const view = latest.current.view;
                setConnection({
                  x: (canvas.current.clientWidth / 2 - view.x) / view.scale,
                  y: (canvas.current.clientHeight / 3 - view.y) / view.scale,
                  menu: true,
                });
              }}
            >
              <Plus />
            </button>
            <button aria-label={c.zoomOut} onClick={() => zoom(1 / 1.15)}>
              <Minus />
            </button>
            <span>{Math.round(state.view.scale * 100)}%</span>
            <button aria-label={c.zoomIn} onClick={() => zoom(1.15)}>
              <Plus />
            </button>
            <i />
            <button aria-label={c.fit} disabled={!ready} onClick={fit}>
              <CornersOut />
            </button>
          </div>
        </div>
      </div>
      {preview && (
        <ChatCutMediaPreview asset={preview} language={language} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}
