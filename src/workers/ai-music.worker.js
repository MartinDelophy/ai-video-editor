import { GemmaTokenizer, env } from "@huggingface/transformers";
import * as ort from "onnxruntime-web/webgpu";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { buildPingPongSchedule, pingPongStep } from "../lib/aiMusicSampling.js";
import { fetchFirstAvailableModel, mirroredModelFileUrls } from "../lib/modelSources.js";
import { configureAnnaOnnxRuntime } from "../lib/annaWasmRuntime.js";

const MODEL_REVISION = "0b8a05e0bc3511e674b4cb3413d3ef6c48880cdb";
const LEGACY_BASE = "https://huggingface.co/lsb/stable-audio-3-small-music-onnx/resolve/main";
const SAMPLE_RATE = 44100;
const MODEL_CACHE_NAME = "timeline-studio-model-cache-v4";
const MODEL_CACHE_PREFIX = `${self.location.origin}/__model-cache__/haixin/stable-audio-3-small-music-onnx/${MODEL_REVISION}/`;
const MODEL_CACHE_READY_KEY = `${MODEL_CACHE_PREFIX}__complete__`;
const MODEL_CACHE_LOCK_PREFIX = `timeline-studio-ai-music-${MODEL_REVISION}`;
const MODEL_CACHE_WRITE_LOCK = `${MODEL_CACHE_LOCK_PREFIX}:write`;
let modelCacheWriteQueue = Promise.resolve();
const FIXED_ARTIFACT_BYTES = new Map([
  ["onnx/text_encoder_q4.onnx", 2232988],
  ["onnx/number_conditioner.onnx", 798844],
  ["onnx/dit_q4.onnx", 5929366],
  ["onnx/decoder_q4.onnx", 1653261],
  ["tokenizer/tokenizer.json", 34362428],
  ["tokenizer/tokenizer_config.json", 469],
]);

env.allowLocalModels = false;
env.allowRemoteModels = true;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 4) : 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = { mjs: ortWasmMjsUrl, wasm: ortWasmUrl };
configureAnnaOnnxRuntime(ort.env);
ort.env.webgpu.powerPreference = "high-performance";
ort.env.webgpu.forceFallbackAdapter = false;

function progress(phase, value) {
  self.postMessage({ type: "progress", phase, progress: value });
}

const GRAPH_SPECS = [
  ["text_encoder_q4", "text_encoder_q4.onnx"],
  ["number_conditioner", "number_conditioner.onnx"],
  ["dit_q4", "dit_q4.onnx"],
  ["decoder_q4", "decoder_q4.onnx"],
];

async function markModelCacheComplete(paths) {
  const cache = await caches.open(MODEL_CACHE_NAME);
  await cache.put(MODEL_CACHE_READY_KEY, new Response(JSON.stringify({
    revision: MODEL_REVISION,
    paths,
    completedAt: new Date().toISOString(),
  }), { headers: { "content-type": "application/json" } }));
}

async function removeObsoleteMusicCacheEntries(cache) {
  const keys = await cache.keys();
  const currentPrefix = `/__model-cache__/haixin/stable-audio-3-small-music-onnx/${MODEL_REVISION}/`;
  await Promise.all(keys.map(async (request) => {
    const url = new URL(request.url);
    const isMusic = url.pathname.includes("/stable-audio-3-small-music-onnx/");
    const isCurrentCanonical = url.pathname.startsWith(currentPrefix);
    if (!isMusic || isCurrentCanonical) return;
    const revisionMarker = `/resolve/${MODEL_REVISION}/`;
    const legacyMarker = "/resolve/main/";
    const marker = url.pathname.includes(revisionMarker) ? revisionMarker
      : url.hostname === "huggingface.co" && url.pathname.includes(legacyMarker) ? legacyMarker
        : "";
    if (!marker) {
      await cache.delete(request);
      return;
    }
    const path = url.pathname.split(marker).at(-1);
    const canonical = path && await cache.match(`${MODEL_CACHE_PREFIX}${path}`);
    // A current provider-specific child remains the only usable cached copy
    // until its canonical replacement has been committed successfully.
    if (canonical) await cache.delete(request);
  }));
}

async function matchCachedModelFile(path, modelSourcePreference) {
  const urls = mirroredModelFileUrls({
    repository: "stable-audio-3-small-music-onnx",
    revision: MODEL_REVISION,
    path,
    preference: modelSourcePreference,
  });
  const cache = await caches.open(MODEL_CACHE_NAME);
  const canonicalCacheRequest = new Request(`${MODEL_CACHE_PREFIX}${path}`);
  let cached = await cache.match(canonicalCacheRequest);
  if (cached) {
    return { cache, canonicalCacheRequest, cached, sourceSpecific: false, urls };
  }

  for (const url of [...urls, `${LEGACY_BASE}/${path}`]) {
    cached = await cache.match(url);
    if (cached) break;
  }
  return { cache, canonicalCacheRequest, cached, sourceSpecific: Boolean(cached), urls };
}

async function readResponseBytes(response, onDownloadProgress) {
  if (!response.body) {
    const data = new Uint8Array(await response.arrayBuffer());
    onDownloadProgress?.(data.byteLength, data.byteLength, true);
    return data;
  }
  const reader = response.body.getReader();
  const total = Number(response.headers.get("content-length")) || 0;
  let loaded = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onDownloadProgress?.(loaded, total, false);
  }
  const data = new Uint8Array(loaded);
  let cursor = 0;
  for (const chunk of chunks) {
    data.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  onDownloadProgress?.(loaded, total, true);
  return data;
}

async function fetchAndCacheModelFile(path, modelSourcePreference, onDownloadProgress) {
  const { cache, canonicalCacheRequest, cached: matched, sourceSpecific, urls } = await matchCachedModelFile(path, modelSourcePreference);
  let cached = matched;
  if (cached) {
    if (sourceSpecific) {
      // Migrate source-specific entries written by older builds to the shared
      // key used by both Hugging Face and ModelScope.
      try {
        await cache.put(canonicalCacheRequest, cached.clone());
      } catch {
        // The source-specific entry remains usable for this load. A later run
        // can retry the optional canonical-key migration.
      }
    }
    const data = await readResponseBytes(cached, onDownloadProgress);
    return { data, fromCache: true, cacheWritten: true };
  }

  const { response } = await fetchFirstAvailableModel(urls);
  const cacheStatus = response.headers.get("X-Timeline-Model-Cache");
  if (cacheStatus === "hit") {
    const data = await readResponseBytes(response, onDownloadProgress);
    return { data, fromCache: true, cacheWritten: true };
  }

  if (!response.ok) throw new Error(`Model download failed (${response.status}): ${path}`);
  // Read the network stream directly so progress reflects real transferred
  // bytes. Cache Storage commit time is deliberately not presented as network
  // download time.
  const data = await readResponseBytes(response, onDownloadProgress);

  const commit = async () => {
    // Another tab may have completed this artifact while our network request
    // was in flight. Reuse it instead of reserving space for a replacement.
    const existing = await cache.match(canonicalCacheRequest);
    if (existing) return true;
    try {
      await cache.put(canonicalCacheRequest, new Response(data));
    } catch (error) {
      if (error?.name !== "QuotaExceededError") return false;
      // Older builds used provider-specific keys and could retain a second
      // complete copy. Remove only obsolete entries from this model family,
      // then retry the individual child file once.
      await removeObsoleteMusicCacheEntries(cache).catch(() => {});
      try {
        await cache.put(canonicalCacheRequest, new Response(data));
      } catch {
        return false;
      }
    }
    return Boolean(await cache.match(canonicalCacheRequest));
  };

  const lockManager = self.navigator?.locks;
  const queuedCommit = lockManager?.request
    ? lockManager.request(MODEL_CACHE_WRITE_LOCK, commit)
    : modelCacheWriteQueue.then(commit, commit);
  modelCacheWriteQueue = queuedCommit.catch(() => {});
  const cacheWritten = await queuedCommit;
  return { data, fromCache: false, cacheWritten };
}

async function fetchModelFile(path, modelSourcePreference, onDownloadProgress) {
  const lockManager = self.navigator?.locks;
  if (!lockManager?.request) {
    return fetchAndCacheModelFile(path, modelSourcePreference, onDownloadProgress);
  }

  // Cache Storage replaces entries atomically and may temporarily reserve
  // space for both copies. Serialize only identical artifacts across workers
  // and tabs, then check the cache again after acquiring the lock. Different
  // model shards still download in parallel.
  const lockName = `${MODEL_CACHE_LOCK_PREFIX}:${path}`;
  return lockManager.request(lockName, () => fetchAndCacheModelFile(path, modelSourcePreference, onDownloadProgress));
}

async function downloadAllResources(modelSourcePreference) {
  let completedManifests = 0;
  let setupProgress = 0.02;
  let setupPhase = "checking";
  const reportSetup = (phase, value) => {
    setupPhase = phase;
    setupProgress = Math.max(setupProgress, value);
    progress(setupPhase, setupProgress);
  };
  const manifestResults = await Promise.all(GRAPH_SPECS.map(async ([name]) => {
    const resource = await fetchModelFile(`onnx/${name}_chunks.json`, modelSourcePreference);
    const bytes = resource.data;
    completedManifests += 1;
    reportSetup("checking", 0.02 + 0.05 * (completedManifests / GRAPH_SPECS.length));
    return { manifest: JSON.parse(new TextDecoder().decode(bytes)), resource };
  }));
  const manifests = manifestResults.map(({ manifest }) => manifest);
  const paths = [
    ...GRAPH_SPECS.flatMap(([, graph], index) => [
      `onnx/${graph}`,
      ...(manifests[index].chunks || manifests[index].files || []).map((item) => `onnx/${item.name || item.path}`),
    ]),
    "tokenizer/tokenizer.json",
    "tokenizer/tokenizer_config.json",
  ];
  const expectedBytesByPath = new Map(FIXED_ARTIFACT_BYTES);
  manifests.forEach((manifest) => {
    for (const item of manifest.chunks || manifest.files || []) {
      const itemPath = item.name || item.path;
      if (itemPath && Number(item.size) > 0) expectedBytesByPath.set(`onnx/${itemPath}`, Number(item.size));
    }
  });
  // Decide the setup mode before starting artifact reads so concurrent cache
  // checks cannot first report a high cache percentage and later reset to a
  // low download percentage when the final missing shard is discovered.
  const pathCacheStates = await Promise.all(paths.map(async (path) => Boolean((await matchCachedModelFile(path, modelSourcePreference)).cached)));
  const cachedCount = manifestResults.filter(({ resource }) => resource.fromCache).length
    + pathCacheStates.filter(Boolean).length;
  const totalCount = manifestResults.length + paths.length;
  setupPhase = cachedCount === totalCount ? "cache" : cachedCount === 0 ? "download" : "repairing";
  reportSetup(setupPhase, 0.07);

  // Start every request before consuming any response body. This lets Chrome
  // multiplex the model shards while keeping WebGPU session creation separate.
  const expectedDownloadBytes = paths.reduce((sum, path) => sum + (expectedBytesByPath.get(path) || 1), 0);
  const downloadedBytesByPath = new Map(paths.map((path, index) => [
    path,
    pathCacheStates[index] ? (expectedBytesByPath.get(path) || 1) : 0,
  ]));
  const reportDownload = (path, loaded, total, done) => {
    const expected = expectedBytesByPath.get(path) || total || 1;
    const bytes = done ? expected : Math.min(expected, loaded);
    downloadedBytesByPath.set(path, Math.max(downloadedBytesByPath.get(path) || 0, bytes));
    const downloadedBytes = [...downloadedBytesByPath.values()].reduce((sum, value) => sum + value, 0);
    const aggregate = downloadedBytes / expectedDownloadBytes;
    reportSetup(setupPhase, 0.07 + 0.40 * aggregate);
  };
  const responses = await Promise.all(paths.map(async (path) => {
    const resource = await fetchModelFile(
      path,
      modelSourcePreference,
      (loaded, total, done) => reportDownload(path, loaded, total, done),
    );
    reportDownload(path, 1, 1, true);
    return { path, ...resource };
  }));
  const allResources = [
    ...manifestResults.map(({ resource }) => resource),
    ...responses,
  ];
  const phase = allResources.every(({ fromCache }) => fromCache) ? "cache" : setupPhase;
  reportSetup(phase, 0.57);
  const artifacts = new Map(responses.map(({ path, data }) => [path, data]));
  const cacheComplete = allResources.every(({ cacheWritten }) => cacheWritten !== false);
  if (cacheComplete) try {
    await markModelCacheComplete([
      ...GRAPH_SPECS.map(([name]) => `onnx/${name}_chunks.json`),
      ...paths,
    ]);
  } catch {
    // The marker is only an optimization. Every child artifact remains
    // independently reusable even if this tiny final write cannot be stored.
  }
  return { artifacts, manifests };
}

async function createSession(index, resources) {
  const [, graph] = GRAPH_SPECS[index];
  const manifest = resources.manifests[index];
  const graphPath = `onnx/${graph}`;
  const graphBytes = resources.artifacts.get(graphPath);
  const pieces = manifest.chunks || manifest.files || [];
  const externalData = pieces.map((item) => {
    const path = item.name || item.path;
    return { path, data: resources.artifacts.get(`onnx/${path}`) };
  });
  if (!navigator.gpu) {
    throw new Error("This Q4 music model requires WebGPU. Enable WebGPU in a current Chrome or Edge browser.");
  }
  const session = await ort.InferenceSession.create(graphBytes, {
    executionProviders: ["webgpu"],
    externalData,
  });
  resources.artifacts.delete(graphPath);
  for (const item of pieces) resources.artifacts.delete(`onnx/${item.name || item.path}`);
  return session;
}

function createTokenizer(artifacts) {
  const decoder = new TextDecoder();
  const tokenizerJSON = JSON.parse(decoder.decode(artifacts.get("tokenizer/tokenizer.json")));
  const tokenizerConfig = JSON.parse(decoder.decode(artifacts.get("tokenizer/tokenizer_config.json")));
  artifacts.delete("tokenizer/tokenizer.json");
  artifacts.delete("tokenizer/tokenizer_config.json");
  return new GemmaTokenizer(tokenizerJSON, tokenizerConfig);
}

function randomNormal(length, seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return (state + 1) / 4294967297;
  };
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 2) {
    const radius = Math.sqrt(-2 * Math.log(random()));
    const angle = 2 * Math.PI * random();
    output[index] = radius * Math.cos(angle);
    if (index + 1 < length) output[index + 1] = radius * Math.sin(angle);
  }
  return output;
}

function wavFromAudio(audio, seconds) {
  const frames = Math.min(Math.floor(seconds * SAMPLE_RATE), audio.dims.at(-1));
  const bytes = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(bytes);
  const text = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + frames * 4, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 2, true); view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, frames * 4, true);
  const channelLength = audio.dims.at(-1);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < 2; channel += 1) {
      const sample = Math.max(-1, Math.min(1, audio.data[channel * channelLength + frame] || 0));
      view.setInt16(44 + (frame * 2 + channel) * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
  }
  return bytes;
}

let runtimePromise = null;

async function initializeRuntime(modelSourcePreference) {
  progress("checking", 0.02);
  const resources = await downloadAllResources(modelSourcePreference);
  const tokenizer = createTokenizer(resources.artifacts);
  // WebGPU permits only one EP session to be initialized at a time. Keeping
  // these sequential also avoids holding every graph's temporary upload
  // buffers at once on integrated-memory Macs.
  progress("initializing", 0.58);
  const textSession = await createSession(0, resources);
  progress("initializing", 0.595);
  const numberSession = await createSession(1, resources);
  progress("initializing", 0.61);
  const ditSession = await createSession(2, resources);
  progress("initializing", 0.625);
  const decoderSession = await createSession(3, resources);
  return { tokenizer, textSession, numberSession, ditSession, decoderSession };
}

async function generate({ prompt, seconds, steps, seed, modelSourcePreference }) {
  runtimePromise ??= initializeRuntime(modelSourcePreference).catch((error) => {
    runtimePromise = null;
    throw error;
  });
  const { tokenizer, textSession, numberSession, ditSession, decoderSession } = await runtimePromise;
  progress("conditioning", 0.64);
  const tokens = await tokenizer(prompt, { padding: "max_length", truncation: true, max_length: 256 });
  const ids = BigInt64Array.from(tokens.input_ids.data, BigInt);
  const mask = BigInt64Array.from(tokens.attention_mask.data, BigInt);
  const text = (await textSession.run({
    [textSession.inputNames[0]]: new ort.Tensor("int64", ids, [1, 256]),
    [textSession.inputNames[1]]: new ort.Tensor("int64", mask, [1, 256]),
  }))[textSession.outputNames[0]];
  const duration = (await numberSession.run({
    seconds: new ort.Tensor("float32", Float32Array.of(seconds), [1]),
  }))[numberSession.outputNames[0]];
  const cross = new Float32Array(257 * 768);
  cross.set(text.data.subarray(0, 256 * 768));
  cross.set(duration.data.subarray(0, 768), 256 * 768);
  const latentLength = Math.ceil((seconds + 6) * SAMPLE_RATE / 8192) * 2;
  let latent = randomNormal(256 * latentLength, seed);
  const times = buildPingPongSchedule(steps);
  for (let step = 0; step < steps; step += 1) {
    progress("generating", 0.65 + step / steps * 0.27);
    const current = times[step];
    const next = times[step + 1];
    const result = await ditSession.run({
      x: new ort.Tensor("float32", latent, [1, 256, latentLength]),
      t: new ort.Tensor("float32", Float32Array.of(current), [1]),
      cross_attn_cond: new ort.Tensor("float32", cross, [1, 257, 768]),
      global_embed: new ort.Tensor("float32", duration.data, [1, 768]),
      local_add_cond: new ort.Tensor("float32", new Float32Array(257 * latentLength), [1, 257, latentLength]),
      padding_mask: new ort.Tensor("bool", new Uint8Array(latentLength).fill(1), [1, latentLength]),
    });
    const velocity = result[ditSession.outputNames[0]].data;
    const noise = next > 0 ? randomNormal(latent.length, seed + step + 1) : null;
    latent = pingPongStep(latent, velocity, current, next, noise);
  }
  progress("decoding", 0.94);
  const decoded = await decoderSession.run({
    [decoderSession.inputNames[0]]: new ort.Tensor("float32", latent, [1, 256, latentLength]),
  });
  const wav = wavFromAudio(decoded[decoderSession.outputNames[0]], seconds);
  progress("complete", 1);
  self.postMessage({ type: "complete", wav }, [wav]);
}

self.onmessage = ({ data }) => {
  if (data.type !== "generate") return;
  generate(data).catch((error) => self.postMessage({ type: "error", message: error?.message || String(error) }));
};
