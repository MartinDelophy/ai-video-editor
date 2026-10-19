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
import { runStoryboardAgent, loadStoryboardModels } from "../lib/storyboardAgent.js";
import { readStoryboard, writeStoryboard } from "../lib/storyboardStorage.js";
import "./StoryboardWorkspace.css";
const icons = {
  reference: ImageSquare,
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
  height: node.kind === "board" ? 350 : node.kind === "reference" ? 290 : 250,
});
export function StoryboardWorkspace({
  language,
  projectId,
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
    [modelMode, setModelMode] = useState("");
  const latest = useRef(state),
    library = useRef(assets),
    callbacks = useRef({ onCommitAssets }),
    revision = useRef(0),
    generation = useRef(0),
    dirty = useRef(0),
    stored = useRef(0),
    drag = useRef(null),
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
                  ["reference", "character", "environment", "board", "video"].includes(node.kind) &&
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
      .filter((asset) => snapshot.nodes.some((node) => node.assetId === asset.id))
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
      name: `${c[kind]}.png`,
      type: output.type || "image",
      kind: "generated-image",
      blob: output.blob,
      src: URL.createObjectURL(output.blob),
      width: output.width,
      height: output.height,
      generation: output.provenance,
      generated: true,
    };
    asset.originalSrc = asset.src;
    owned.current.set(asset.id, asset);
    library.current = [asset, ...library.current];
    callbacks.current.onCommitAssets([asset]);
    return asset;
  };
  const add = (asset, kind, parentIds, dropPosition) => {
    const existing = latest.current.nodes.find((node) => node.assetId === asset.id);
    if (existing) {
      if (dropPosition) update((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === existing.id ? { ...node, ...dropPosition } : node) }));
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
      parentIds: [...new Set(parentIds)],
      ...(dropPosition || position),
    };
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
    for (const asset of imported) if (asset.type === "image") add(asset, "reference", []);
    return imported;
  };
  const runConversation = async (input) => {
    if (!ready) throw new Error("STORAGE_NOT_READY");
    return runStoryboardAgent(input, {
      inspect: () => latest.current.nodes,
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
    });
  };
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
  const start = (event, node) => {
    if (!ready || event.button !== 0 || event.target.closest("button,video")) return;
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
      onKeyDown={(event) => event.stopPropagation()}
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
            if (!ready) { event.preventDefault(); return; }
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
          onChange={(event) => {
            importFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div
          className="storyboard-canvas"
          ref={canvas}
          onDragOver={(event) => {
            if (!ready || !event.dataTransfer.types.includes("application/x-timeline-storyboard-asset")) return;
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
          onWheel={(event) => {
            if (!ready) return;
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              const rect = canvas.current.getBoundingClientRect();
              zoom(Math.exp(-event.deltaY * 0.002), {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            } else
              update({
                view: {
                  ...latest.current.view,
                  x: latest.current.view.x - event.deltaX,
                  y: latest.current.view.y - event.deltaY,
                },
              });
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
                  <span className="storyboard-port is-input" />
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
                    <div className="storyboard-missing">{c.loading}</div>
                  )}
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
                  <span className="storyboard-port is-output" />
                </article>
              );
            })}
          </div>
          <div className="storyboard-zoom" onPointerDown={(event) => event.stopPropagation()}>
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
