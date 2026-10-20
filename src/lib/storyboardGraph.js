// One dependency contract for direct manipulation and agent tools.
export const STORYBOARD_INPUTS = {
  reference: [],
  character: ["reference", "character"],
  environment: ["reference", "environment"],
  board: ["reference", "character", "environment", "board", "image", "panel"],
  image: ["reference", "character", "environment", "board", "image", "panel"],
  panel: ["board"],
  video: ["reference", "character", "environment", "image", "panel"],
};
export const STORYBOARD_GENERATORS = ["character", "environment", "board", "image", "video"];
export function storyboardCanLink(nodes, from, to, assets) {
  const source = nodes.find((n) => n.id === from),
    target = nodes.find((n) => n.id === to);
  if (!source || !target || from === to || !STORYBOARD_INPUTS[target.kind]?.includes(source.kind))
    return false;
  if (assets && source.assetId && assets.find((a) => a.id === source.assetId)?.type !== "image")
    return false;
  if (["video", "panel"].includes(target.kind) && target.parentIds.some((id) => id !== from))
    return false;
  if (!target.parentIds.includes(from) && target.parentIds.length >= 8) return false;
  const seen = new Set();
  const reaches = (id) => {
    if (id === to) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (nodes.find((n) => n.id === id)?.parentIds || []).some(reaches);
  };
  return !reaches(from);
}
export function storyboardLink(nodes, from, to, assets) {
  if (!storyboardCanLink(nodes, from, to, assets)) throw new Error("INVALID_DEPENDENCY");
  return nodes.map((n) =>
    n.id === to ? { ...n, parentIds: [...new Set([...n.parentIds, from])] } : n,
  );
}
export function storyboardActiveMentions(node) {
  return (node.mentions || []).filter(
    (m) =>
      typeof m.nodeId === "string" &&
      typeof m.token === "string" &&
      m.token &&
      (node.prompt || "").includes(m.token),
  );
}
export function storyboardMention(node, sourceId, name) {
  const existing = (node.mentions || []).find((m) => m.nodeId === sourceId);
  if (existing) return existing;
  const label = name
    .replace(/[{}\r\n]/g, " ")
    .trim()
    .slice(0, 160);
  const tokens = new Set((node.mentions || []).map((m) => m.token));
  let suffix = 1,
    token = `@{${label}}`;
  while (tokens.has(token)) token = `@{${label} · ${++suffix}}`;
  return { nodeId: sourceId, token };
}
export function storyboardSignature(node, nodes) {
  const input = [
    node.prompt || "",
    node.parentIds.map((id) => [id, nodes.find((n) => n.id === id)?.assetId || null]),
  ];
  if (node.kind === "panel") input.push(node.panelIndex);
  const mentions = storyboardActiveMentions(node);
  if (mentions.length) input.push(mentions.map((m) => [m.nodeId, m.token]));
  return JSON.stringify(input);
}
export function storyboardInputsReady(node, nodes, assets) {
  if (!node.prompt?.trim()) return false;
  if (node.kind === "video" && node.parentIds.length !== 1) return false;
  if (storyboardActiveMentions(node).some((m) => !node.parentIds.includes(m.nodeId))) return false;
  const ready = (parent, seen) => {
    if (!parent || seen.has(parent.id)) return false;
    const asset = assets.find((a) => a.id === parent.assetId);
    if (
      asset?.type !== "image" ||
      !(asset.blob instanceof Blob) ||
      (parent.resultSignature && parent.resultSignature !== storyboardSignature(parent, nodes))
    )
      return false;
    const visited = new Set([...seen, parent.id]);
    return parent.parentIds.every((id) =>
      ready(
        nodes.find((n) => n.id === id),
        visited,
      ),
    );
  };
  return node.parentIds.every((id) => {
    const parent = nodes.find((n) => n.id === id);
    return (
      parent &&
      STORYBOARD_INPUTS[node.kind]?.includes(parent.kind) &&
      ready(parent, new Set([node.id]))
    );
  });
}
export function storyboardDraft(nodes, kind, parentIds, position, prompt = "", assets) {
  if (
    !STORYBOARD_GENERATORS.includes(kind) ||
    !Array.isArray(parentIds) ||
    parentIds.length > 8 ||
    typeof prompt !== "string" ||
    prompt.length > 2000
  )
    throw new Error("INVALID_ARGUMENT");
  const node = { id: crypto.randomUUID(), kind, assetId: null, parentIds: [], prompt, ...position };
  let next = [...nodes, node];
  for (const id of parentIds) next = storyboardLink(next, id, node.id, assets);
  return { node: next.find((n) => n.id === node.id), nodes: next };
}
export function storyboardEdit(nodes, id, prompt, parentIds, assets) {
  const node = nodes.find((n) => n.id === id);
  if (
    !node ||
    !STORYBOARD_GENERATORS.includes(node.kind) ||
    typeof prompt !== "string" ||
    prompt.length > 2000 ||
    !Array.isArray(parentIds) ||
    parentIds.length > 8
  )
    throw new Error("INVALID_ARGUMENT");
  let next = nodes.map((n) => (n.id === id ? { ...n, prompt, parentIds: [] } : n));
  for (const parent of parentIds) next = storyboardLink(next, parent, id, assets);
  return next;
}
export function storyboardReferenceBindings(node, nodes, assets, guideCount = 2) {
  const mentions = storyboardActiveMentions(node);
  return node.parentIds.map((id, index) => {
    const parent = nodes.find((n) => n.id === id),
      asset = assets.find((a) => a.id === parent?.assetId);
    return {
      attachment: guideCount + index + 1,
      name: asset?.name || "",
      tokens: mentions.filter((m) => m.nodeId === id).map((m) => m.token),
    };
  });
}
