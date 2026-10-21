import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { HostError, type PageSession } from "./sessions.ts";
import type { createProjects } from "./storage/projects.ts";
import { verifyObject } from "./storage/objects.ts";
import { listScriptSources } from "./storage/scripts.ts";
import { normalizedBytes, referenceKey, sha256 } from "./storage/records.ts";
import {
  visualSearchBasis, visualSearchBasisDigest, visualSearchCacheManifest, visualSearchQuery, visualSearchSource,
  type VisualSearchBasis, type VisualSearchCacheManifest, type VisualSearchSource,
} from "./visual-search-records.ts";
import type { VisualSearchRunner } from "./visual-search-runner.ts";
import { VISUAL_SEARCH_EMBEDDING_DIMENSION, VISUAL_SEARCH_SAMPLES_PER_INTERVAL } from "../../src/config/visualSearch.js";

type Projects = ReturnType<typeof createProjects>;
type Project = ReturnType<Projects["get"]>;
type Active = { controller: AbortController; done: Promise<unknown> };

async function fileDigest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function componentIdentity(runtime: Awaited<ReturnType<VisualSearchRunner["requireFiles"]>>) {
  const model = runtime.manifest.model;
  return {
    componentId: runtime.manifest.componentId,
    componentRevision: runtime.manifest.componentRevision,
    manifestDigest: runtime.manifestDigest,
    toolId: runtime.manifest.toolId,
    toolRevision: runtime.manifest.toolRevision,
    model: { id: model.id, revision: model.revision, processorRevision: model.processorRevision,
      filesDigest: model.filesDigest, precision: model.precision, embeddingDimension: model.embeddingDimension },
  };
}

export function createVisualSearchService(projects: Projects, runner: VisualSearchRunner, machineDirectory?: string) {
  const active = new Map<string, Active>(), queries = new Set<AbortController>();
  const replays = new Map<string, { digest: string; result: Promise<unknown> }>();
  let closing = false;
  const writable = (page: PageSession, projectId: string, editorSessionId: string) => {
    if (closing) throw new HostError("TASKS_DRAINING", 409, "Visual search is stopping.");
    projects.editors.requireWrite(page, editorSessionId, projectId);
    return projects.get(page, projectId);
  };
  const directory = (projectId: string, basisDigest?: string) => {
    if (!machineDirectory) throw new HostError("COMPONENT_NOT_READY", 503, "A machine data directory is required for visual-search cache.");
    const root = join(machineDirectory, "cache", "visual-search", sha256(Buffer.from(projectId)));
    return basisDigest ? join(root, basisDigest) : root;
  };
  const currentSources = async (project: Project) => {
    const sources = await listScriptSources(project.files, project.commits.current());
    return sources.filter(source => source.kind === "video" && source.capability === "scene" && source.analysisRef && source.analysisRef.revision > 1)
      .map(source => visualSearchSource.parse({ sourceId: source.sourceId, assetRef: source.assetRef, mediaRef: source.mediaRef,
        analysisRef: source.analysisRef, range: source.range }))
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  };
  const basis = async (project: Project, sources?: VisualSearchSource[]) => {
    const runtime = await runner.requireFiles(), selected = sources ?? await currentSources(project);
    if (!selected.length) throw new HostError("DEPENDENCY_FAILED", 409, "Create and save scene intervals before building visual search.");
    return visualSearchBasis.parse({ schemaVersion: 1, projectId: project.projectId, component: componentIdentity(runtime),
      settings: { samplesPerInterval: VISUAL_SEARCH_SAMPLES_PER_INTERVAL, pooling: "mean-l2", similarity: "cosine" }, sources: selected });
  };
  const validateCache = async (cacheDirectory: string, expected: VisualSearchBasis) => {
    let names: string[];
    try {
      const info = await lstat(cacheDirectory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
      names = (await readdir(cacheDirectory)).sort();
    } catch { throw new HostError("COMPONENT_NOT_READY", 503, "The current visual-search cache is missing or incomplete."); }
    if (JSON.stringify(names) !== JSON.stringify(["embeddings.f32", "index.json"])) {
      throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "Visual-search cache contains an incomplete or unexpected file set.");
    }
    const manifestPath = join(cacheDirectory, "index.json"), info = await lstat(manifestPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024 * 1024) throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "Visual-search cache manifest is invalid.");
    let manifest: VisualSearchCacheManifest;
    try { manifest = visualSearchCacheManifest.parse(JSON.parse((await readFile(manifestPath)).toString("utf8"))); }
    catch { throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "Visual-search cache manifest is invalid."); }
    const expectedDigest = visualSearchBasisDigest(expected);
    if (manifest.basisDigest !== expectedDigest || !normalizedBytes(manifest.basis).equals(normalizedBytes(expected)) ||
        manifest.rows.length !== expected.sources.length || manifest.vectors.rows !== expected.sources.length ||
        manifest.vectors.path !== "embeddings.f32" || manifest.vectors.sizeBytes !== expected.sources.length * VISUAL_SEARCH_EMBEDDING_DIMENSION * 4) {
      throw new HostError("REFERENCE_STALE", 409, "The visual-search cache does not match the current scene sources or component.");
    }
    for (let index = 0; index < expected.sources.length; index++) {
      const row = manifest.rows[index], source = expected.sources[index];
      if (row.row !== index || row.sourceId !== source.sourceId || row.sampleTimesSeconds.some((time, position) =>
        time < source.range.sourceStartSeconds || time >= source.range.sourceEndSeconds || position > 0 && time < row.sampleTimesSeconds[position - 1])) {
        throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "Visual-search cache rows do not match their source intervals.");
      }
    }
    const vectorPath = join(cacheDirectory, manifest.vectors.path), vector = await lstat(vectorPath);
    if (!vector.isFile() || vector.isSymbolicLink() || vector.size !== manifest.vectors.sizeBytes || await fileDigest(vectorPath) !== manifest.vectors.sha256) {
      throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "Visual-search vector matrix failed integrity validation.");
    }
    return manifest;
  };
  const describe = async (project: Project) => {
    const sources = await currentSources(project), component = await runner.status();
    if (component.state !== "verified" || !sources.length || !machineDirectory) {
      return { component, sceneCount: sources.length, cache: { state: "missing" as const, basisDigest: null, rows: 0 }, running: active.has(project.projectId) };
    }
    const currentBasis = await basis(project, sources), digest = visualSearchBasisDigest(currentBasis);
    try {
      const manifest = await validateCache(directory(project.projectId, digest), currentBasis);
      return { component, sceneCount: sources.length, cache: { state: "ready" as const, basisDigest: digest, rows: manifest.rows.length }, running: active.has(project.projectId) };
    } catch {
      return { component, sceneCount: sources.length, cache: { state: "missing" as const, basisDigest: digest, rows: 0 }, running: active.has(project.projectId) };
    }
  };
  const build = async (project: Project) => {
    if (active.has(project.projectId)) throw new HostError("RESOURCE_BUSY", 409, "A visual-search index is already being built for this project.");
    const controller = new AbortController();
    // Defer preparation until this operation is registered for exclusion and cancellation.
    const operation = Promise.resolve().then(async () => {
      const sources = await currentSources(project), currentBasis = await basis(project, sources), digest = visualSearchBasisDigest(currentBasis);
      if (controller.signal.aborted) throw new HostError("TASK_CANCELLED", 409, "Visual search was cancelled.");
      const finalDirectory = directory(project.projectId, digest);
      let invalidExisting = false;
      try {
        const manifest = await validateCache(finalDirectory, currentBasis);
        if (controller.signal.aborted) throw new HostError("TASK_CANCELLED", 409, "Visual search was cancelled.");
        return { status: "ready" as const, basisDigest: digest, rows: manifest.rows.length, replayed: true };
      } catch (error) {
        if (!(error instanceof HostError) || !["COMPONENT_NOT_READY", "REFERENCE_STALE", "OUTPUT_VALIDATION_FAILED"].includes(error.code)) throw error;
        try { invalidExisting = (await lstat(finalDirectory)).isDirectory(); }
        catch { invalidExisting = false; }
      }
      const attemptId = randomUUID(), root = directory(project.projectId);
      const temporary = join(root, `.tmp-${attemptId}`);
      await mkdir(root, { recursive: true, mode: 0o700 });
      await mkdir(temporary, { mode: 0o700 });
      try {
        const items = sources.map(source => {
          const media = project.commits.current()?.objects.find(item => referenceKey(item) === referenceKey(source.mediaRef));
          if (!media || media.kind !== "media") throw new HostError("REFERENCE_STALE", 409, "A scene source media revision is no longer current.");
          return { ...source, inputPath: join(project.files.directory, media.path) };
        });
        const verifiedMedia = new Set<string>();
        for (const item of items) {
          const key = referenceKey(item.mediaRef);
          if (verifiedMedia.has(key)) continue;
          const media = project.commits.current()?.objects.find(object => referenceKey(object) === key);
          if (!media) throw new HostError("REFERENCE_STALE", 409, "Scene media is no longer registered.");
          await verifyObject(project.files, media); verifiedMedia.add(key);
        }
        await runner.index({ attemptId, outputDir: temporary, basis: currentBasis, basisDigest: digest, items,
          deadline: Date.now() + 30 * 60_000, signal: controller.signal });
        const manifest = await validateCache(temporary, currentBasis);
        const latestBasis = await basis(project);
        if (visualSearchBasisDigest(latestBasis) !== digest) {
          throw new HostError("REFERENCE_STALE", 409, "Scene sources changed while the visual-search index was being built.");
        }
        const quarantine = `${finalDirectory}.invalid-${attemptId}`;
        if (invalidExisting) await rename(finalDirectory, quarantine);
        try { await rename(temporary, finalDirectory); }
        catch (error) {
          if (!(["EEXIST", "ENOTEMPTY"] as (string | undefined)[]).includes((error as NodeJS.ErrnoException).code)) throw error;
          await validateCache(finalDirectory, currentBasis);
        }
        return { status: "ready" as const, basisDigest: digest, rows: manifest.rows.length, replayed: false };
      } finally { await rm(temporary, { recursive: true, force: true }).catch(() => {}); }
    });
    const entry = { controller, done: operation };
    active.set(project.projectId, entry);
    try { return await operation; }
    finally { if (active.get(project.projectId) === entry) active.delete(project.projectId); }
  };
  return {
    status: async (page: PageSession, projectId: string) => describe(projects.get(page, projectId)),
    build(page: PageSession, projectId: string, editorSessionId: string, key: string) {
      if (!key || key.length > 128) throw new HostError("INVALID_ARGUMENT", 400, "Idempotency-Key is required.");
      const project = writable(page, projectId, editorSessionId), replayKey = `${projectId}:${key}`;
      const requestDigest = sha256(normalizedBytes({ projectId, savePointId: project.commits.current()?.savePointId ?? null,
        action: "build-current-visual-index" }));
      const previous = replays.get(replayKey);
      if (previous) {
        if (previous.digest !== requestDigest) throw new HostError("IDEMPOTENCY_KEY_REUSED", 409, "This visual-search key was used for a different request.");
        return previous.result;
      }
      const result = build(project);
      replays.set(replayKey, { digest: requestDigest, result });
      if (replays.size > 128) replays.delete(replays.keys().next().value!);
      return result;
    },
    async cancel(page: PageSession, projectId: string, editorSessionId: string) {
      writable(page, projectId, editorSessionId);
      const current = active.get(projectId);
      if (!current) return { cancelRequested: false };
      current.controller.abort();
      return { cancelRequested: true };
    },
    async query(page: PageSession, projectId: string, input: unknown) {
      if (closing) throw new HostError("TASKS_DRAINING", 409, "Visual search is stopping.");
      const project = projects.get(page, projectId), request = visualSearchQuery.parse(input), sources = await currentSources(project);
      const currentBasis = await basis(project, sources), digest = visualSearchBasisDigest(currentBasis), cacheDirectory = directory(projectId, digest);
      await validateCache(cacheDirectory, currentBasis);
      const controller = new AbortController(); queries.add(controller);
      try {
        const output = await runner.query({ attemptId: randomUUID(), indexDir: cacheDirectory, query: request.query,
          k: request.k, diversity: request.diversity, deadline: Date.now() + 5 * 60_000, signal: controller.signal });
        const latestBasis = await basis(project);
        if (visualSearchBasisDigest(latestBasis) !== digest) {
          throw new HostError("REFERENCE_STALE", 409, "Scene sources changed while the visual-search query was running.");
        }
        const byId = new Map(sources.map(source => [source.sourceId, source])), seen = new Set<string>();
        const items = output.results.map(result => {
          const source = byId.get(result.sourceId);
          if (!source || seen.has(result.sourceId)) throw new HostError("OUTPUT_VALIDATION_FAILED", 422, "Visual search returned a stale or duplicate source.");
          seen.add(result.sourceId);
          const midpoint = source.range.sourceStartSeconds + (source.range.sourceEndSeconds - source.range.sourceStartSeconds) / 2;
          return { sourceId: source.sourceId, score: result.score, source, preview: { sourceTimeSeconds: midpoint } };
        });
        return { query: request.query, basisDigest: digest, model: currentBasis.component.model, items };
      } finally { queries.delete(controller); }
    },
    busy: () => active.size > 0 || queries.size > 0,
    async close() {
      closing = true;
      for (const value of active.values()) value.controller.abort();
      for (const value of queries) value.abort();
      await Promise.allSettled([...active.values()].map(value => value.done));
    },
  };
}
