// Canvas contracts are independent of React and provider transport.
export const CANVAS_NODE_TYPES = Object.freeze({
  text: { output: "text", inputs: [] },
  media: { output: "media", inputs: [] },
  character: {
    output: "character",
    inputs: [{ id: "reference", types: ["image"], multiple: true }],
  },
  scene: { output: "scene", inputs: [{ id: "reference", types: ["image"], multiple: true }] },
  script: {
    output: "shots",
    inputs: [
      { id: "text", types: ["text"], required: true },
      { id: "character", types: ["character"], multiple: true },
      { id: "scene", types: ["scene"], multiple: true },
    ],
  },
  shot: {
    output: "shot",
    inputs: [
      { id: "script", types: ["shots", "text"] },
      { id: "character", types: ["character"], multiple: true },
      { id: "scene", types: ["scene"], multiple: true },
    ],
  },
  image: {
    output: "image",
    inputs: [
      { id: "text", types: ["text", "shot"] },
      { id: "reference", types: ["image"], multiple: true },
      { id: "character", types: ["character"], multiple: true },
      { id: "scene", types: ["scene"], multiple: true },
    ],
  },
  video: {
    output: "video",
    inputs: [
      { id: "text", types: ["text", "shot"] },
      { id: "frame", types: ["image"], required: true },
    ],
  },
  voice: { output: "audio", inputs: [{ id: "text", types: ["text", "shot"] }] },
  music: { output: "audio", inputs: [{ id: "text", types: ["text"] }] },
});
export const createCanvasGraph = () => ({
  schemaVersion: 1,
  nodes: [],
  edges: [],
  view: { x: 36, y: 40, scale: 1 },
  messages: [],
});
export const canvasOutputType = (node) =>
  node.kind === "media" ? node.mediaType || "image" : CANVAS_NODE_TYPES[node.kind]?.output;
export function createCanvasNode(kind, position = { x: 40, y: 60 }) {
  if (!Object.hasOwn(CANVAS_NODE_TYPES, kind)) throw new Error("INVALID_NODE");
  return {
    id: crypto.randomUUID(),
    kind,
    ...position,
    text: "",
    params: {
      provider: "anna",
      aspectRatio: "16:9",
      durationSec: 5,
      resolution: "720p",
      seconds: 30,
      bpm: 90,
      style: "cinematic",
      mood: "calm",
      instrument: "piano",
    },
    results: [],
    resultId: null,
  };
}
function assertGraph(graph) {
  if (
    !graph ||
    graph.schemaVersion !== 1 ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > 200 ||
    graph.edges.length > 1000
  )
    throw new Error("INVALID_GRAPH");
}
export function validateCanvasGraph(value) {
  assertGraph(value);
  const ids = new Set();
  for (const n of value.nodes) {
    if (
      typeof n.id !== "string" ||
      ids.has(n.id) ||
      !Object.hasOwn(CANVAS_NODE_TYPES, n.kind) ||
      !Number.isFinite(n.x) ||
      !Number.isFinite(n.y) ||
      Math.abs(n.x) > 1e6 ||
      Math.abs(n.y) > 1e6 ||
      typeof n.text !== "string" ||
      n.text.length > 16000 ||
      !Array.isArray(n.results) ||
      n.results.length > 200
    )
      throw new Error("INVALID_GRAPH");
    ids.add(n.id);
  }
  const next = { ...createCanvasGraph(), ...value, edges: [] };
  for (const e of value.edges) {
    validateCanvasEdge(next, e);
    next.edges.push(e);
  }
  if (
    !Number.isFinite(next.view?.scale) ||
    next.view.scale < 0.2 ||
    next.view.scale > 2 ||
    !Number.isFinite(next.view.x) ||
    !Number.isFinite(next.view.y)
  )
    next.view = { x: 36, y: 40, scale: 1 };
  return next;
}
export function validateCanvasEdge(graph, edge) {
  const from = graph.nodes.find((n) => n.id === edge.from),
    to = graph.nodes.find((n) => n.id === edge.to);
  const port = CANVAS_NODE_TYPES[to?.kind]?.inputs.find((p) => p.id === edge.port);
  if (!from || !to || !port || !port.types.includes(canvasOutputType(from)))
    throw new Error("TYPE_MISMATCH");
  if (graph.edges.some((e) => e.from === edge.from && e.to === edge.to && e.port === edge.port))
    throw new Error("DUPLICATE_EDGE");
  if (!port.multiple && graph.edges.some((e) => e.to === edge.to && e.port === edge.port))
    throw new Error("PORT_OCCUPIED");
  const seen = new Set(),
    visit = (id) => {
      if (id === edge.from) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return graph.edges.filter((e) => e.from === id).some((e) => visit(e.to));
    };
  if (visit(edge.to)) throw new Error("CYCLE");
}
export function applyCanvasOperations(graph, operations) {
  assertGraph(graph);
  if (!Array.isArray(operations) || operations.length > 32) throw new Error("INVALID_OPERATIONS");
  const next = structuredClone(graph);
  for (const op of operations) {
    if (op.type === "add") {
      const n = createCanvasNode(
        op.kind,
        op.position || {
          x: 40 + (next.nodes.length % 3) * 340,
          y: 80 + Math.floor(next.nodes.length / 3) * 300,
        },
      );
      if (
        typeof op.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(op.id) ||
        next.nodes.some((item) => item.id === op.id)
      )
        throw new Error("INVALID_NODE");
      n.id = op.id;
      if (op.text !== undefined) {
        if (typeof op.text !== "string" || op.text.length > 16000) throw new Error("INVALID_TEXT");
        n.text = op.text;
      }
      next.nodes.push(n);
    } else if (op.type === "update") {
      const n = next.nodes.find((n) => n.id === op.id);
      if (!n) throw new Error("MISSING_NODE");
      if (op.text !== undefined) {
        if (typeof op.text !== "string" || op.text.length > 16000) throw new Error("INVALID_TEXT");
        n.text = op.text;
      }
      if (op.params) {
        const allowed = [
          "aspectRatio",
          "durationSec",
          "resolution",
          "shotIndex",
          "speechLanguage",
          "voice",
          "ttsModel",
          "seconds",
          "bpm",
          "style",
          "mood",
          "instrument",
        ];
        for (const [key, value] of Object.entries(op.params)) {
          if (!allowed.includes(key) || !["string", "number"].includes(typeof value))
            throw new Error("INVALID_PARAMS");
          n.params[key] = value;
        }
      }
    } else if (op.type === "connect") {
      const e = { from: op.from, to: op.to, port: op.port };
      validateCanvasEdge(next, e);
      next.edges.push(e);
    } else if (op.type === "disconnect")
      next.edges = next.edges.filter(
        (e) => !(e.from === op.from && e.to === op.to && e.port === op.port),
      );
    else if (op.type === "remove") {
      if (!next.nodes.some((n) => n.id === op.id)) throw new Error("MISSING_NODE");
      next.nodes = next.nodes.filter((n) => n.id !== op.id);
      next.edges = next.edges.filter((e) => e.from !== op.id && e.to !== op.id);
    } else throw new Error("INVALID_OPERATION");
  }
  return validateCanvasGraph(next);
}
export function canvasNodeSignature(graph, id, seen = new Set()) {
  if (seen.has(id)) throw new Error("CYCLE");
  const n = graph.nodes.find((item) => item.id === id);
  if (!n) throw new Error("MISSING_NODE");
  const branch = new Set(seen);
  branch.add(id);
  return JSON.stringify({
    id: n.id,
    kind: n.kind,
    text: n.text,
    params: n.params,
    assetId: n.assetId,
    resultId: n.resultId,
    inputs: graph.edges
      .filter((e) => e.to === id)
      .map((e) => ({
        port: e.port,
        from: e.from,
        signature: canvasNodeSignature(graph, e.from, branch),
      }))
      .sort((a, b) => `${a.port}:${a.from}`.localeCompare(`${b.port}:${b.from}`)),
  });
}
export function inspectCanvas(graph) {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      text: n.text,
      params: n.params,
      assetId: n.assetId,
      outputType: canvasOutputType(n),
      resultId: n.resultId,
      results: n.results.map((r) => ({
        id: r.id,
        assetIds: r.assetIds,
        data: r.data,
        model: r.model,
      })),
    })),
    edges: graph.edges,
  };
}
export function resolveCanvasInput(graph, nodeId, assets) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error("MISSING_NODE");
  const getAsset = (id) => assets.find((a) => a.id === id),
    trail = new Set();
  const resolve = (id, parentPath = new Set()) => {
    const trail = new Set(parentPath);
    if (trail.has(id)) throw new Error("CYCLE");
    trail.add(id);
    const n = graph.nodes.find((n) => n.id === id);
    if (!n) throw new Error("MISSING_NODE");
    const selected = n.results.find((r) => r.id === n.resultId);
    if (selected?.signature !== undefined) {
      const withoutSelf = { ...n, resultId: selected.previousResultId || null };
      const before = {
        ...graph,
        nodes: graph.nodes.map((item) => (item.id === id ? withoutSelf : item)),
      };
      if (selected.signature !== canvasNodeSignature(before, id)) throw new Error("STALE_INPUT");
    }
    if (["image", "video", "voice", "music"].includes(n.kind)) {
      if (!selected?.assetIds?.length) throw new Error("INPUT_NOT_READY");
      const media = selected.assetIds.map(getAsset);
      if (media.some((a) => !(a?.blob instanceof Blob))) throw new Error("MISSING_ASSET");
      return { text: "", media };
    }
    if (n.kind === "media") {
      const asset = getAsset(n.assetId);
      if (!(asset?.blob instanceof Blob)) throw new Error("MISSING_ASSET");
      return { text: "", media: [asset] };
    }
    if (["script", "shot"].includes(n.kind)) {
      if (!selected?.data) throw new Error("INPUT_NOT_READY");
      return { text: JSON.stringify(selected.data), media: [] };
    }
    const media = graph.edges
      .filter((e) => e.to === id)
      .flatMap((e) => resolve(e.from, trail).media);
    return { text: n.text, media };
  };
  const text = [node.text],
    references = [],
    byPort = {};
  for (const edge of graph.edges.filter((e) => e.to === nodeId)) {
    trail.clear();
    const output = resolve(edge.from);
    (byPort[edge.port] ??= []).push(output);
    if (output.text) text.push(output.text);
    references.push(...output.media);
  }
  for (const p of CANVAS_NODE_TYPES[node.kind].inputs)
    if (p.required && !byPort[p.id]?.length) throw new Error("MISSING_INPUT");
  return {
    prompt: text.filter(Boolean).join("\n\n"),
    references: [...new Map(references.map((a) => [a.id, a])).values()],
    byPort,
  };
}
export function canvasResultIsStale(graph, node) {
  const r = node.results.find((x) => x.id === node.resultId);
  if (!r?.signature) return false;
  return (
    r.signature !==
    canvasNodeSignature(
      {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === node.id ? { ...n, resultId: r.previousResultId || null } : n,
        ),
      },
      node.id,
    )
  );
}
