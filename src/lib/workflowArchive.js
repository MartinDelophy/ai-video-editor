import { runArchiveOperation } from "./projectArchive.js";
import { validateCanvasGraph } from "./canvasGraph.js";
import { STORYBOARD_INPUTS, storyboardCanLink } from "./storyboardGraph.js";
import { readCanvasProject, writeCanvasProject } from "./canvasProjectStore.js";
import { writeStoryboard } from "./storyboardStorage.js";
const MAX_BYTES = 512 * 1024 * 1024;
const FORMAT = "timeline-studio-workflow";
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, item]) =>
          (key === "token" &&
            typeof item === "string" &&
            item.startsWith("@") &&
            (typeof value.nodeId === "string" || typeof value.assetId === "string")) ||
          !/^(?:src|originalSrc|previewSrc|remoteJob|videoJob|jobId|workflowTemplate|endpoint|headers|apiKey|token|accessToken|authorization|password|secret|connection)$/i.test(
            key,
          ),
      )
      .map(([key, item]) => {
        if (/signature$/i.test(key) && typeof item === "string") {
          try {
            return [key, JSON.stringify(clean(JSON.parse(item)))];
          } catch {
            /* opaque signature */
          }
        }
        return [key, clean(item)];
      }),
  );
};
export function workflowAssetIds(kind, state, chat) {
  const ids = new Set(state.attachmentIds || []);
  for (const n of state.nodes) {
    if (n.assetId) ids.add(n.assetId);
    if (kind === "canvas")
      for (const r of n.results || []) for (const id of r.assetIds || []) ids.add(id);
  }
  for (const m of chat?.messages || []) for (const id of m.assetIds || []) ids.add(id);
  for (const m of chat?.mentions || []) if (m.assetId) ids.add(m.assetId);
  return ids;
}
function validate(kind, state) {
  if (kind === "canvas") {
    const graph = validateCanvasGraph(state);
    if (
      !Array.isArray(graph.messages) ||
      graph.messages.length > 2000 ||
      graph.messages.some(
        (m) =>
          !m ||
          typeof m.text !== "string" ||
          m.text.length > 100000 ||
          !["user", "assistant"].includes(m.role),
      ) ||
      graph.nodes.some(
        (n) =>
          !n.params ||
          typeof n.params !== "object" ||
          Array.isArray(n.params) ||
          n.results.some(
            (r) =>
              !r ||
              typeof r !== "object" ||
              (r.assetIds &&
                (!Array.isArray(r.assetIds) || r.assetIds.some((id) => typeof id !== "string"))),
          ),
      )
    )
      throw new Error("INVALID_WORKFLOW");
    return graph;
  }
  if (kind !== "storyboard" || !state || !Array.isArray(state.nodes) || state.nodes.length > 200)
    throw new Error("INVALID_WORKFLOW");
  const ids = new Set();
  for (const n of state.nodes) {
    if (
      typeof n.id !== "string" ||
      ids.has(n.id) ||
      !Object.hasOwn(STORYBOARD_INPUTS, n.kind) ||
      !Number.isFinite(n.x) ||
      !Number.isFinite(n.y) ||
      Math.abs(n.x) > 1e6 ||
      Math.abs(n.y) > 1e6 ||
      !Array.isArray(n.parentIds) ||
      n.parentIds.length > 8 ||
      typeof (n.prompt || "") !== "string" ||
      (n.prompt || "").length > 2000 ||
      (n.mentions &&
        (!Array.isArray(n.mentions) ||
          n.mentions.length > 64 ||
          n.mentions.some((m) => typeof m.nodeId !== "string" || typeof m.token !== "string"))) ||
      (n.kind === "panel" &&
        (!Number.isInteger(n.panelIndex) || n.panelIndex < 0 || n.panelIndex > 15))
    )
      throw new Error("INVALID_WORKFLOW");
    ids.add(n.id);
  }
  for (const n of state.nodes) {
    for (const from of n.parentIds) {
      // Early Storyboard drafts allowed reference-to-reference provenance links.
      // Retain them in backups without reopening that port in the current UI.
      const legacy =
        n.kind === "reference" && state.nodes.find((p) => p.id === from)?.kind === "reference";
      const nodes = legacy
        ? state.nodes.map((p) => (p.id === n.id ? { ...p, kind: "image" } : p))
        : state.nodes;
      if (!storyboardCanLink(nodes, from, n.id)) throw new Error("INVALID_WORKFLOW");
    }
  }
  if (
    !Number.isFinite(state.view?.x) ||
    !Number.isFinite(state.view?.y) ||
    !Number.isFinite(state.view?.scale) ||
    state.view.scale < 0.2 ||
    state.view.scale > 2
  )
    throw new Error("INVALID_WORKFLOW");
  return state;
}
function chatCopy(chat) {
  if (!chat) return null;
  return {
    title: String(chat.title || "").slice(0, 256),
    draft: String(chat.draft || "").slice(0, 16000),
    messages: (chat.messages || []).map((m) => ({
      role: m.role,
      text: m.text,
      assetIds: m.assetIds || [],
      ...(m.model ? { model: m.model } : {}),
    })),
    mentions: (chat.mentions || []).map((m) => ({
      token: m.token,
      assetId: m.assetId,
      selected: m.selected,
    })),
    excluded: [],
    updatedAt: Date.now(),
  };
}
export async function createWorkflowArchive({ kind, state, assets, chat, name }) {
  validate(kind, state);
  const selected = workflowAssetIds(kind, state, chat),
    files = {},
    entries = [];
  let bytes = 0;
  if (selected.size > 400) throw new Error("ARCHIVE_LIMIT");
  for (const id of selected) {
    const a = assets.find((a) => a.id === id);
    if (!a || !(a.blob instanceof Blob) || !a.blob.size) throw new Error("MISSING_MEDIA");
    bytes += a.blob.size;
    if (bytes > MAX_BYTES) throw new Error("ARCHIVE_LIMIT");
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", await a.blob.arrayBuffer())),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    const path = `media/${entries.length}.bin`;
    files[path] = a.blob;
    const {
      name: assetName,
      type,
      kind: assetKind,
      width,
      height,
      duration,
      peaks,
      generation,
      generated,
      prompt,
    } = a;
    entries.push({
      id,
      path,
      sha256,
      type: a.blob.type || "application/octet-stream",
      assetType: type,
      name: assetName,
      kind: assetKind,
      width,
      height,
      duration,
      peaks: ArrayBuffer.isView(peaks) ? Array.from(peaks) : peaks,
      generation: clean(generation),
      generated,
      prompt,
    });
  }
  files["project.json"] = new Blob(
    [
      JSON.stringify({
        format: "timeline-studio-archive",
        version: 3,
        project: {
          workflow: {
            format: FORMAT,
            version: 1,
            kind,
            name,
            createdAt: new Date().toISOString(),
            state: clean(state),
            chat: chatCopy(chat),
          },
        },
        media: { visuals: entries },
      }),
    ],
    { type: "application/json" },
  );
  if (bytes + files["project.json"].size > MAX_BYTES) throw new Error("ARCHIVE_LIMIT");
  const archive = await runArchiveOperation("pack", files);
  if (archive.size > MAX_BYTES) throw new Error("ARCHIVE_LIMIT");
  return archive;
}
export async function readWorkflowArchive(file, kind) {
  if (!(file instanceof Blob) || !file.size || file.size > MAX_BYTES)
    throw new Error("ARCHIVE_LIMIT");
  const result = await runArchiveOperation("unpack", file, {
    limits: { maxBytes: MAX_BYTES, maxFiles: 402 },
  });
  const workflow = result.payload.project?.workflow;
  if (workflow?.format !== FORMAT || workflow.version !== 1 || workflow.kind !== kind)
    throw new Error("INVALID_WORKFLOW");
  const state = validate(kind, clean(workflow.state));
  const chat = chatCopy(workflow.chat);
  if (
    chat &&
    (chat.messages.length > 2000 ||
      chat.messages.some(
        (m) =>
          !["user", "assistant"].includes(m.role) ||
          typeof m.text !== "string" ||
          m.text.length > 100000 ||
          !Array.isArray(m.assetIds),
      ))
  )
    throw new Error("INVALID_WORKFLOW");
  for (const a of result.visualMedia.values()) {
    if (!a.blob || typeof a.sha256 !== "string") throw new Error("MISSING_MEDIA");
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", await a.blob.arrayBuffer())),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== a.sha256) throw new Error("MISSING_MEDIA");
  }
  const assets = [...result.visualMedia.values()].map((a) => {
    if (
      !a.blob?.size ||
      !["image", "video", "audio"].includes(a.assetType) ||
      typeof a.id !== "string"
    )
      throw new Error("MISSING_MEDIA");
    return {
      id: a.id,
      name: String(a.name || a.id),
      type: a.assetType,
      kind: a.kind,
      blob: a.blob,
      width: a.width,
      height: a.height,
      duration: a.duration,
      peaks: a.peaks,
      generation: a.generation,
      generated: a.generated,
      prompt: a.prompt,
    };
  });
  if (assets.length > 400 || new Set(assets.map((a) => a.id)).size !== assets.length)
    throw new Error("INVALID_WORKFLOW");
  for (const id of workflowAssetIds(kind, state, chat))
    if (!assets.some((a) => a.id === id)) throw new Error("MISSING_MEDIA");
  const mapping = new Map(assets.map((a) => [a.id, crypto.randomUUID()]));
  const remap = (value, field = "", signature = false) => {
    if (Array.isArray(value)) return value.map((v) => remap(v, signature ? "" : field, signature));
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, k, signature)]));
    if (typeof value === "string") {
      if ((signature || /(?:assetIds?|attachmentIds)$/i.test(field)) && mapping.has(value))
        return mapping.get(value);
      if (/signature$/i.test(field) && (value.startsWith("{") || value.startsWith("["))) {
        try {
          return JSON.stringify(remap(JSON.parse(value), field, true));
        } catch {
          /* ordinary prose */
        }
      }
    }
    return value;
  };
  return {
    kind,
    name: String(workflow.name || kind).slice(0, 160),
    state: remap(state),
    chat: remap(chat),
    assets: assets.map((a) => ({ ...a, id: mapping.get(a.id) })),
  };
}
export async function storeWorkflowCopy(archive, scope) {
  const id = crypto.randomUUID(),
    sessionId = crypto.randomUUID();
  if (archive.kind === "canvas") {
    const key = `canvas-v1:${scope}:${id}`;
    const prior = await readCanvasProject(key);
    if (prior.record) throw new Error("CONFLICT");
    const saved = await writeCanvasProject(
      key,
      { graph: archive.state, assets: archive.assets },
      0,
      crypto.randomUUID(),
    );
    if (saved.conflict) throw new Error("CONFLICT");
  } else {
    const saved = await writeStoryboard(
      `storyboard-v1:${scope}:${id}:${sessionId}`,
      { state: archive.state, assets: archive.assets },
      0,
    );
    if (saved.conflict) throw new Error("CONFLICT");
    const chat = {
      ...(archive.chat || {
        title: archive.name,
        draft: "",
        messages: [],
        excluded: [],
        updatedAt: Date.now(),
      }),
      id: sessionId,
    };
    localStorage.setItem(
      `timeline-storyboard-chat-v1:${scope}:${id}`,
      JSON.stringify({ activeId: sessionId, sessions: [chat] }),
    );
  }
  return { id, name: archive.name, savedAt: new Date().toISOString() };
}
