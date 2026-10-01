import {
  normalizeAnnaError, readAnnaCloudSessionPointer, writeAnnaCloudSessionPointer,
  readAnnaFile, storeAnnaFile, validateAnnaFileDescriptor,
} from "./annaRuntime.js";

const FORMAT = "timeline-studio-cloud-session";
const MAX_MANIFEST = 16 * 1024 * 1024;
const MAX_NODES = 200000;
const MAX_ENTRIES = 1000000;
const MAX_BINARIES = 20000;
const MAX_BINARY_BYTES = 64 * 1024 ** 3;
const SHA_PATTERN = /^[a-f0-9]{64}$/;
const ERROR_CODES = new Set(["auth", "network", "permission", "quota", "conflict", "read", "write", "invalid"]);
const VIEW_TYPES = new Map([
  ["Int8Array", Int8Array], ["Uint8Array", Uint8Array], ["Uint8ClampedArray", Uint8ClampedArray],
  ["Int16Array", Int16Array], ["Uint16Array", Uint16Array], ["Int32Array", Int32Array],
  ["Uint32Array", Uint32Array], ["Float32Array", Float32Array], ["Float64Array", Float64Array],
  ["BigInt64Array", BigInt64Array], ["BigUint64Array", BigUint64Array], ["DataView", DataView],
  ...(typeof globalThis.Float16Array === "function" ? [["Float16Array", globalThis.Float16Array]] : []),
]);

function failure(code, file) {
  const error = new Error(`Anna cloud session: ${code}`);
  error.sessionCode = code;
  // Retain the immutable snapshot handle even if its KV reference was not saved.
  if (file) error.savedFile = file;
  return error;
}
function classify(error, fallback) {
  if (ERROR_CODES.has(error?.sessionCode)) return error;
  const normalized = normalizeAnnaError(error);
  const code = {
    auth_required: "auth", permission_denied: "permission", conflict: "conflict",
    quota_exceeded: "quota", storage_full: "quota", rate_limited: "quota",
    network_error: "network", timeout: "network", file_transfer_failed: "network",
    invalid_file: "invalid", invalid_file_response: "invalid", invalid_storage_response: "invalid",
    file_changed: "invalid", concurrency_unavailable: "conflict",
  }[normalized.code] || fallback;
  return failure(code);
}
function assert(condition) { if (!condition) throw failure("invalid"); }
function integer(value, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && value >= 0 && value <= max; }
function iso(value) { return typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function plain(value) { return value !== null && typeof value === "object" && [null, Object.prototype].includes(Object.getPrototypeOf(value)); }
function sameFile(a, b) { return a?.path === b?.path && a?.etag === b?.etag && a?.size === b?.size; }
function fileDescriptor(value) {
  try { return validateAnnaFileDescriptor(value, { kind: "sessions" }); }
  catch { throw failure("invalid"); }
}
function previewFile(value) {
  if (!value) return null;
  try { const file = fileDescriptor(value); return file.size <= 32768 ? file : null; } catch { return null; }
}
function projectEntry(value) {
  assert(plain(value) && /^[a-zA-Z0-9_-]{1,100}$/.test(value.id) && typeof value.name === "string" && value.name.length <= 120);
  assert(integer(value.revision) && value.revision > 0 && iso(value.savedAt));
  const current = fileDescriptor(value.current);
  const previous = value.previous ? fileDescriptor(value.previous) : null;
  assert(current.size <= MAX_MANIFEST && (!previous || previous.size <= MAX_MANIFEST));
  return { id: value.id, name: value.name, revision: value.revision, savedAt: value.savedAt, current, previous, preview: previewFile(value.preview) };
}
function currentProject(value) {
  return projectEntry({ ...value, id: value.projectId || "legacy", name: value.projectName || "" });
}
function projectList(value) {
  return value ? [currentProject(value), ...value.projects.filter((p) => p.id !== value.projectId)].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : [];
}
function pointer(value) {
  assert(plain(value) && value.schemaVersion === 1 && integer(value.revision) && value.revision > 0 && iso(value.savedAt));
  const current = fileDescriptor(value.current);
  assert(current.size <= MAX_MANIFEST);
  const previous = value.previous === null ? null : fileDescriptor(value.previous);
  assert(!previous || previous.size <= MAX_MANIFEST);
  const projectId = value.projectId || "legacy", projectName = value.projectName || "";
  const projects = (value.projects || []).map(projectEntry);
  assert(projects.length <= 200 && new Set(projects.map((p) => p.id)).size === projects.length);
  projectEntry({ id: projectId, name: projectName, revision: value.revision, savedAt: value.savedAt, current, previous });
  return { schemaVersion: 1, revision: value.revision, savedAt: value.savedAt, current, previous, projectId, projectName, projects, preview: previewFile(value.preview) };
}
async function readPointer(signal) {
  // Isolate the catalog from older installed clients, whose single-session
  // writes must never erase the multi-project index. Migrate by reference only.
  const catalog = await readAnnaCloudSessionPointer({ projectCatalog: true, signal });
  const stored = catalog || await readAnnaCloudSessionPointer({ signal });
  return stored === null ? null : { etag: stored.etag, value: pointer(stored.value), legacy: !catalog };
}

// Incremental SHA-256 keeps large media hashing bounded to a stream chunk plus
// one 64-byte block. Blob.arrayBuffer() would duplicate the entire source video.
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotate = (value, bits) => (value >>> bits) | (value << (32 - bits));
class Sha256 {
  state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  block = new Uint8Array(64);
  words = new Uint32Array(64);
  length = 0;
  buffered = 0;
  compress(bytes, offset) {
    const words = this.words;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 64);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      words[i] = words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = this.state;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + words[i]) | 0;
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    const next = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) this.state[i] += next[i];
  }
  update(bytes) {
    this.length += bytes.byteLength;
    let offset = 0;
    if (this.buffered) {
      const count = Math.min(64 - this.buffered, bytes.length);
      this.block.set(bytes.subarray(0, count), this.buffered);
      this.buffered += count; offset += count;
      if (this.buffered === 64) { this.compress(this.block, 0); this.buffered = 0; }
    }
    while (offset + 64 <= bytes.length) { this.compress(bytes, offset); offset += 64; }
    if (offset < bytes.length) { this.block.set(bytes.subarray(offset)); this.buffered = bytes.length - offset; }
  }
  finish() {
    const length = this.length;
    const tail = new Uint8Array(this.buffered < 56 ? 64 - this.buffered : 128 - this.buffered);
    tail[0] = 128;
    const view = new DataView(tail.buffer);
    view.setUint32(tail.length - 8, Math.floor(length / 0x20000000));
    view.setUint32(tail.length - 4, (length * 8) >>> 0);
    this.update(tail);
    return Array.from(this.state, (word) => word.toString(16).padStart(8, "0")).join("");
  }
}
async function sha256(blob) {
  const hash = new Sha256();
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally { reader.releaseLock(); }
  return hash.finish();
}

/** Snapshot mutable metadata/buffers synchronously before the first await.
 * Only immutable Blob/File objects retain their identity for cached hashing.
 * Numeric node references preserve cycles and shared Map keys/buffer views.
 */
function capture(data) {
  assert(plain(data));
  const nodes = [], objects = [], seen = new WeakMap(), binaries = [];
  let entries = 0, binaryBytes = 0;
  const token = (value) => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (value === undefined) return ["undefined"];
    if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0) ? value : ["number", String(Object.is(value, -0) ? "-0" : value)];
    if (typeof value === "bigint") return ["bigint", String(value)];
    assert(typeof value === "object");
    if (!seen.has(value)) {
      assert(nodes.length < MAX_NODES);
      seen.set(value, nodes.length); nodes.push(null); objects.push(value);
    }
    return ["ref", seen.get(value)];
  };
  const root = token(data);
  for (let index = 0; index < objects.length; index++) {
    const value = objects[index];
    if (value instanceof Blob || value instanceof ArrayBuffer) {
      assert(binaries.length < MAX_BINARIES);
      // The Blob constructor copies mutable ArrayBuffer bytes now. Blobs need
      // no copy, and their content hash may be reused across later snapshots.
      const blob = value instanceof Blob ? value : new Blob([value]);
      binaryBytes += blob.size;
      assert(integer(binaryBytes, MAX_BINARY_BYTES));
      const id = binaries.length;
      binaries.push(blob);
      if (value instanceof ArrayBuffer) nodes[index] = ["buffer", id];
      else if (typeof File === "function" && value instanceof File) nodes[index] = ["file", id, value.type, value.name, value.lastModified];
      else nodes[index] = ["blob", id, value.type];
    } else if (ArrayBuffer.isView(value)) {
      const name = value.constructor?.name;
      assert(VIEW_TYPES.has(name) && Object.getPrototypeOf(value) === VIEW_TYPES.get(name).prototype);
      nodes[index] = ["view", name, token(value.buffer), value.byteOffset, value instanceof DataView ? value.byteLength : value.length];
    } else if (value instanceof Date) {
      assert(Number.isFinite(value.getTime()));
      nodes[index] = ["date", value.toISOString()];
    } else if (value instanceof Map) {
      entries += value.size * 2;
      assert(entries <= MAX_ENTRIES);
      nodes[index] = ["map", Array.from(value, ([key, item]) => [token(key), token(item)])];
    } else if (value instanceof Set) {
      entries += value.size;
      assert(entries <= MAX_ENTRIES);
      nodes[index] = ["set", Array.from(value, token)];
    } else {
      assert(Array.isArray(value) || plain(value));
      if (Array.isArray(value)) assert(integer(value.length, MAX_ENTRIES));
      const saved = [];
      for (const key of Reflect.ownKeys(value)) {
        assert(typeof key === "string");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        assert(Object.hasOwn(descriptor, "value"));
        if (!descriptor.enumerable) continue;
        saved.push([key, token(descriptor.value)]);
        assert(++entries <= MAX_ENTRIES);
      }
      nodes[index] = Array.isArray(value) ? ["array", value.length, saved] : ["object", Object.getPrototypeOf(value) === null, saved];
    }
  }
  const graph = { root, nodes };
  assert(new Blob([JSON.stringify(graph)]).size <= MAX_MANIFEST);
  return { graph, binaries };
}

// Validate the entire graph before downloading referenced media or allocating
// typed arrays. No constructor name or object key is ever executed/assigned.
function validateGraph(graph, binaries) {
  assert(plain(graph) && Array.isArray(graph.nodes) && graph.nodes.length > 0 && graph.nodes.length <= MAX_NODES);
  let entries = 0;
  const token = (value) => {
    if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
    assert(Array.isArray(value));
    if (value[0] === "undefined") assert(value.length === 1);
    else if (value[0] === "number") assert(value.length === 2 && ["NaN", "Infinity", "-Infinity", "-0"].includes(value[1]));
    else if (value[0] === "bigint") assert(value.length === 2 && typeof value[1] === "string" && /^-?(?:0|[1-9][0-9]{0,4095})$/.test(value[1]));
    else assert(value.length === 2 && value[0] === "ref" && integer(value[1], graph.nodes.length - 1));
  };
  const reference = (value) => Array.isArray(value) && value.length === 2 && value[0] === "ref" && integer(value[1], graph.nodes.length - 1);
  const properties = (values, arrayLength) => {
    assert(Array.isArray(values));
    const keys = new Set();
    for (const pair of values) {
      assert(Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && !keys.has(pair[0]));
      keys.add(pair[0]);
      if (arrayLength !== undefined) {
        assert(pair[0] !== "length");
        if (/^(?:0|[1-9]\d*)$/.test(pair[0]) && Number(pair[0]) < 4294967295) assert(Number(pair[0]) < arrayLength);
      }
      token(pair[1]);
    }
    entries += values.length;
  };
  token(graph.root);
  assert(reference(graph.root) && graph.nodes[graph.root[1]]?.[0] === "object");
  for (const node of graph.nodes) {
    assert(Array.isArray(node));
    const [kind, value] = node;
    if (["blob", "file", "buffer"].includes(kind)) {
      assert(integer(value, binaries.length - 1));
      if (kind === "buffer") assert(node.length === 2);
      else {
        assert(typeof node[2] === "string" && node[2].length <= 1024);
        assert(kind === "blob" ? node.length === 3 : node.length === 5 && typeof node[3] === "string" && node[3].length <= 4096 && Number.isSafeInteger(node[4]));
      }
    } else if (kind === "view") {
      assert(node.length === 5 && VIEW_TYPES.has(value) && reference(node[2]) && integer(node[3]) && integer(node[4]));
      const bufferNode = graph.nodes[node[2][1]];
      assert(bufferNode?.[0] === "buffer" && integer(bufferNode[1], binaries.length - 1));
      const width = VIEW_TYPES.get(value).BYTES_PER_ELEMENT || 1;
      assert(node[3] % width === 0 && node[3] + node[4] * width <= binaries[bufferNode[1]].size);
    } else if (kind === "date") assert(node.length === 2 && iso(value));
    else if (kind === "object") { assert(node.length === 3 && typeof value === "boolean"); properties(node[2]); }
    else if (kind === "array") { assert(node.length === 3 && integer(value, MAX_ENTRIES)); properties(node[2], value); }
    else if (kind === "map") {
      assert(node.length === 2 && Array.isArray(value));
      for (const pair of value) { assert(Array.isArray(pair) && pair.length === 2); token(pair[0]); token(pair[1]); }
      entries += value.length * 2;
    } else if (kind === "set") {
      assert(node.length === 2 && Array.isArray(value));
      for (const item of value) token(item);
      entries += value.length;
    } else throw failure("invalid");
    assert(entries <= MAX_ENTRIES);
  }
}

async function hydrate(graph, blobs, cacheIdentity) {
  const values = new Array(graph.nodes.length);
  for (let i = 0; i < graph.nodes.length; i++) {
    const [kind, value, extra, name, modified] = graph.nodes[i];
    if (kind === "buffer") values[i] = await blobs[value].arrayBuffer();
    else if (kind === "blob" || kind === "file") {
      assert(kind !== "file" || typeof File === "function");
      values[i] = kind === "file" ? new File([blobs[value]], name, { type: extra, lastModified: modified }) : blobs[value].slice(0, blobs[value].size, extra);
      cacheIdentity?.(values[i], value);
    } else if (kind === "date") values[i] = new Date(value);
    else if (kind === "object") values[i] = value ? Object.create(null) : {};
    else if (kind === "array") values[i] = new Array(value);
    else if (kind === "map") values[i] = new Map();
    else if (kind === "set") values[i] = new Set();
  }
  const token = (value) => {
    if (!Array.isArray(value)) return value;
    if (value[0] === "ref") return values[value[1]];
    if (value[0] === "undefined") return undefined;
    if (value[0] === "bigint") return BigInt(value[1]);
    return Number(value[1]);
  };
  // Views are allocated before populating containers so forward references and
  // shared backing buffers are restored identically, including Map keys.
  graph.nodes.forEach((node, index) => {
    if (node[0] === "view") values[index] = new (VIEW_TYPES.get(node[1]))(token(node[2]), node[3], node[4]);
  });
  graph.nodes.forEach((node, index) => {
    if (node[0] === "object" || node[0] === "array") {
      for (const [key, value] of node[2]) Object.defineProperty(values[index], key, { value: token(value), enumerable: true, writable: true, configurable: true });
    } else if (node[0] === "map") for (const [key, value] of node[1]) values[index].set(token(key), token(value));
    else if (node[0] === "set") for (const value of node[1]) values[index].add(token(value));
  });
  return token(graph.root);
}

function manifest(value, expected) {
  assert(plain(value) && value.format === FORMAT && value.schemaVersion === 1
    && value.revision === expected.revision && value.savedAt === expected.savedAt
    && Array.isArray(value.binaries) && value.binaries.length <= MAX_BINARIES);
  let bytes = 0;
  const binaries = value.binaries.map((item) => {
    assert(plain(item) && SHA_PATTERN.test(item.sha256) && integer(item.size, MAX_BINARY_BYTES));
    bytes += item.size;
    assert(bytes <= MAX_BINARY_BYTES);
    const file = item.size === 0 ? null : fileDescriptor(item.file);
    assert(item.size === 0 ? item.file === null : file.size === item.size);
    return { sha256: item.sha256, size: item.size, file };
  });
  validateGraph(value.graph, binaries);
  return { graph: value.graph, binaries };
}

/** The loaded etag is a per-window CAS baseline. Only read() or a confirmed
 * save advances it; a failed save must never adopt another window's revision.
 * No file is automatically deleted, including failed/competing first writes.
 */
export function createAnnaCloudSessionStore() {
  let loaded = false, base = null, pending = null, busy = false;
  const contentFiles = new Map();
  const identityHashes = new WeakMap();
  async function exclusively(operation, fallback) {
    if (busy) throw failure("conflict");
    busy = true;
    try { return await operation(); }
    catch (error) { throw classify(error, fallback); }
    finally { busy = false; }
  }
  const hashBlob = async (blob) => {
    if (!identityHashes.has(blob)) identityHashes.set(blob, sha256(blob));
    try { return await identityHashes.get(blob); }
    catch (error) { identityHashes.delete(blob); throw error; }
  };
  const remember = (blob, hash) => identityHashes.set(blob, Promise.resolve(hash));
  async function readEntry(entry, { signal, onProgress } = {}) {
    const file = entry.current;
    const blob = await readAnnaFile({ path: file.path, expectedFile: file, signal });
    assert(blob.size === file.size && blob.size <= MAX_MANIFEST);
    let parsed;
    try { parsed = JSON.parse(await blob.text()); } catch { throw failure("invalid"); }
    const saved = manifest(parsed, entry);
    const blobs = [], downloaded = new Map();
    const totalBytes = saved.binaries.reduce((sum, item) => sum + item.size, 0);
    let completedBytes = 0;
    onProgress?.({ loaded: 0, total: totalBytes });
    for (const item of saved.binaries) {
      let media = downloaded.get(item.sha256);
      if (media) assert(media.size === item.size && sameFile(media.file, item.file));
      else {
        const bytes = item.file ? await readAnnaFile({ path: item.file.path, expectedFile: item.file, signal, onProgress: (loaded) => onProgress?.({ loaded: completedBytes + loaded, total: totalBytes }) }) : new Blob([]);
        assert(bytes.size === item.size && await hashBlob(bytes) === item.sha256);
        media = { blob: bytes, file: item.file, size: item.size };
        downloaded.set(item.sha256, media);
      }
      blobs.push(media.blob);
      completedBytes += item.size;
      onProgress?.({ loaded: completedBytes, total: totalBytes });
    }
    const data = await hydrate(saved.graph, blobs, (value, id) => remember(value, saved.binaries[id].sha256));
    // Restore dedup references only after all files and the graph passed.
    for (const item of saved.binaries) if (item.file) contentFiles.set(item.sha256, item.file);
    return { revision: entry.revision, savedAt: entry.savedAt, data, projectId: entry.id, projectName: entry.name };
  }
  const head = () => ({ anchor: base ? `${base.legacy ? 'legacy:' : ''}${base.etag}` : null,
    revision: base?.value.revision || 0, projects: projectList(base?.value), current: base?.value.projectId, files: [...contentFiles] });
  return {
    head,
    initialize(files = []) {
      return exclusively(async () => {
        for (const [hash, file] of files) if (SHA_PATTERN.test(hash)) contentFiles.set(hash, fileDescriptor(file));
        base = await readPointer(); loaded = true; pending = null;
        return head();
      }, "read");
    },
    read() {
      return exclusively(async () => {
        const next = await readPointer();
        if (!next) { base = null; loaded = true; pending = null; return null; }
        const record = await readEntry(currentProject(next.value));
        base = next; loaded = true; pending = null;
        return record;
      }, "read");
    },
    listProjects() {
      return readPointer().then((stored) => projectList(stored?.value)).catch((error) => { throw classify(error, "read"); });
    },
    deleteProject(id, { expectedRevision } = {}) {
      return exclusively(async () => {
        if (!loaded || !base || base.legacy || expectedRevision !== base.value.revision) throw failure("conflict");
        if (id === base.value.projectId) throw failure("conflict");
        const observed = await readPointer();
        if (!observed || observed.etag !== base.etag) throw failure("conflict");
        if (!projectList(base.value).some(item => item.id === id)) throw failure("read");
        const value = pointer({ ...base.value, projects: base.value.projects.filter(item => item.id !== id) });
        // Remove catalog references only: media may be shared by other projects.
        const updated = await writeAnnaCloudSessionPointer({ value, projectCatalog: true, ifMatch: base.etag });
        base = { value, etag: updated.etag }; pending = null;
        return true;
      }, "write");
    },
    readProject(id, previous = false, options = {}) {
      return exclusively(async () => {
        const entry = projectList((await readPointer(options.signal))?.value).find((p) => p.id === id);
        if (!entry) throw failure("read");
        if (!previous) return readEntry(entry, options);
        if (!entry.previous) throw failure("read");
        const blob = await readAnnaFile({ path: entry.previous.path, expectedFile: entry.previous, signal: options.signal });
        assert(blob.size <= MAX_MANIFEST);
        const parsed = JSON.parse(await blob.text());
        return readEntry({ ...entry, current: entry.previous, revision: parsed.revision, savedAt: parsed.savedAt }, options);
      }, "read");
    },
    save(data, { expectedRevision = 0, project } = {}) {
      return exclusively(async () => {
        assert(integer(expectedRevision));
        if (!loaded) throw failure("read");
        if (expectedRevision !== (base?.value.revision || 0)) throw failure("conflict");
        assert(expectedRevision < Number.MAX_SAFE_INTEGER);
        const { projectPreview, ...sessionData } = data;
        const captured = capture(sessionData);
        const hashes = [];
        for (const blob of captured.binaries) hashes.push(await hashBlob(blob));
        const identity = JSON.stringify({ project, graph: captured.graph, binaries: hashes.map((hash, i) => [hash, captured.binaries[i].size]) });
        const signature = await sha256(new Blob([identity]));
        if (!pending || pending.signature !== signature || pending.expectedRevision !== expectedRevision) {
          // Reject unsupported/oversized metadata before any cloud upload.
          validateGraph(captured.graph, captured.binaries);
          const binaries = [];
          for (let i = 0; i < captured.binaries.length; i++) {
            const blob = captured.binaries[i], hash = hashes[i];
            let file = contentFiles.get(hash) || null;
            if (file) assert(file.size === blob.size);
            else if (blob.size) {
              file = fileDescriptor(await storeAnnaFile({ blob, name: `${hash}.bin`, kind: "sessions" }));
              assert(file.size === blob.size);
              contentFiles.set(hash, file);
            }
            binaries.push({ sha256: hash, size: blob.size, file });
          }
          const revision = expectedRevision + 1, savedAt = new Date().toISOString();
          const document = { format: FORMAT, schemaVersion: 1, revision, savedAt, graph: captured.graph, binaries };
          const blob = new Blob([JSON.stringify(document)], { type: "application/json" });
          assert(blob.size <= MAX_MANIFEST);
          const current = fileDescriptor(await storeAnnaFile({ blob, name: "session.json", kind: "sessions" }));
          assert(current.size === blob.size);
          const projectId = project?.id || base?.value.projectId || "legacy";
          const projectName = project?.name ?? base?.value.projectName ?? "";
          const projects = projectList(base?.value).filter((p) => p.id !== projectId);
          assert(projects.length <= 200);
          const oldProject = projectList(base?.value).find((p) => p.id === projectId);
          let preview = null;
          if (projectPreview instanceof Blob && projectPreview.size <= 32768 && projectPreview.type === "image/jpeg") {
            try {
              const hash = await hashBlob(projectPreview);
              preview = contentFiles.get(hash) || fileDescriptor(await storeAnnaFile({ blob: projectPreview, name: `${hash}.jpg`, kind: "sessions" }));
              contentFiles.set(hash, preview);
            } catch { /* Covers are optional; a failed upload cannot block the project commit. */ }
          }
          const value = pointer({ preview, schemaVersion: 1, revision, savedAt, current, previous: oldProject?.current || null, projectId, projectName, projects });
          pending = { signature, expectedRevision, value };
        }
        const candidate = pending;
        // Materialize the promised snapshot before its pointer is committed:
        // an allocation/unsupported-type failure must not look like a failed
        // save after the remote revision has already advanced.
        const savedData = await hydrate(captured.graph, captured.binaries, (value, id) => remember(value, hashes[id]));
        let committed;
        try {
          // A prior timeout may actually have committed this exact immutable
          // snapshot. Read-back can acknowledge only our own file/revision;
          // it never refreshes the baseline to an unrelated newer project.
          const observed = await readPointer();
          if (observed && observed.value.revision === candidate.value.revision && sameFile(observed.value.current, candidate.value.current)) committed = observed;
          else {
            if (base ? (observed?.etag !== base.etag || Boolean(observed?.legacy) !== Boolean(base.legacy)) : observed !== null) throw failure("conflict");
            const updated = await writeAnnaCloudSessionPointer({ value: candidate.value, projectCatalog: true, ...(base && !base.legacy ? { ifMatch: base.etag } : {}) });
            committed = { value: candidate.value, etag: updated.etag };
            if (!base || base.legacy) {
              // Anna has no atomic create-if-absent. The pre-read/read-back
              // detects visible races, but a later unguarded first writer may
              // still replace the pointer. Both immutable snapshots survive.
              const confirmed = await readPointer();
              if (!confirmed || confirmed.etag !== updated.etag || confirmed.value.revision !== candidate.value.revision || !sameFile(confirmed.value.current, candidate.value.current)) throw failure("conflict");
              committed = confirmed;
            }
          }
        } catch (error) {
          const normalized = classify(error, "write");
          normalized.savedFile = candidate.value.current;
          throw normalized;
        }
        base = committed; pending = null;
        return { revision: committed.value.revision, savedAt: committed.value.savedAt, data: savedData, projectId: committed.value.projectId, projectName: committed.value.projectName };
      }, "write");
    },
  };
}
