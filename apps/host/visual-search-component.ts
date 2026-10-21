import { createReadStream } from "node:fs";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { normalizedBytes, sha256 as bytesSha256 } from "./storage/records.ts";
import { visualSearchModelFilesDigest } from "./visual-search-records.ts";
import {
  VISUAL_SEARCH_COMPONENT_ID, VISUAL_SEARCH_COMPONENT_REVISION, VISUAL_SEARCH_EMBEDDING_DIMENSION,
  VISUAL_SEARCH_MODEL_ID, VISUAL_SEARCH_TOOL_ID, VISUAL_SEARCH_TOOL_REVISION,
} from "../../src/config/visualSearch.js";

export const visualSearchComponentManifestName = "component-manifest.json";
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const commit = z.string().regex(/^[0-9a-f]{40}$/);
const relativeFile = z.string().min(1).max(1024).refine(value => !value.includes("\\") && !value.includes("\0") &&
  !isAbsolute(value) && value.split("/").every(part => part && part !== "." && part !== ".."));
const sourceUrl = z.string().url().refine(value => {
  const source = new URL(value);
  return source.protocol === "https:" && !source.username && !source.password && !source.search && !source.hash;
});

export const visualSearchComponentManifest = z.strictObject({
  schemaVersion: z.literal(1),
  componentId: z.literal(VISUAL_SEARCH_COMPONENT_ID),
  componentRevision: z.literal(VISUAL_SEARCH_COMPONENT_REVISION),
  toolId: z.literal(VISUAL_SEARCH_TOOL_ID),
  toolRevision: z.literal(VISUAL_SEARCH_TOOL_REVISION),
  platform: z.enum(["darwin", "win32"]),
  arch: z.enum(["arm64", "x64"]),
  python: z.strictObject({ version: z.string().regex(/^3\.\d+\.\d+$/), executable: relativeFile }),
  entrypoint: relativeFile,
  packages: z.array(z.strictObject({ name: z.string().min(1).max(128), version: z.string().min(1).max(128), source: sourceUrl, sha256 })).min(5).max(128),
  model: z.strictObject({
    id: z.literal(VISUAL_SEARCH_MODEL_ID),
    revision: commit,
    processorRevision: commit,
    precision: z.literal("float32"),
    embeddingDimension: z.literal(VISUAL_SEARCH_EMBEDDING_DIMENSION),
    files: z.array(relativeFile).min(1).max(10_000),
    filesDigest: sha256,
  }),
  licenses: z.array(relativeFile).min(1).max(512),
  files: z.array(z.strictObject({ path: relativeFile, sizeBytes: z.number().int().nonnegative().safe(), sha256 })).min(1).max(200_000),
});

export type VisualSearchComponentManifest = z.infer<typeof visualSearchComponentManifest>;

async function digest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function inventory(root: string, directory = root, files: { path: string; sizeBytes: number; sha256: string }[] = []) {
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error("Visual-search component contains a symbolic link.");
    if (info.isDirectory()) await inventory(root, path, files);
    else if (info.isFile()) {
      const item = relative(root, path).split("\\").join("/");
      if (item !== visualSearchComponentManifestName) files.push({ path: item, sizeBytes: info.size, sha256: await digest(path) });
    } else throw new Error("Visual-search component contains an unsupported file.");
  }
  return files;
}

export async function inspectVisualSearchComponent(directory: string) {
  const root = await realpath(directory), rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("Visual-search component root is unsafe.");
  const manifestPath = join(root, visualSearchComponentManifestName), manifestInfo = await lstat(manifestPath);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 16 * 1024 * 1024) throw new Error("Visual-search component manifest is unavailable.");
  const manifestBytes = await readFile(manifestPath);
  const manifest = visualSearchComponentManifest.parse(JSON.parse(manifestBytes.toString("utf8")));
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error("Visual-search component target does not match this host.");
  const expected = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(expected.map(file => file.path)).size !== expected.length || JSON.stringify(expected) !== JSON.stringify(manifest.files)) {
    throw new Error("Visual-search component inventory must be unique and path-sorted.");
  }
  const actual = (await inventory(root)).sort((a, b) => a.path.localeCompare(b.path));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Visual-search component inventory or file digests changed.");
  const files = new Map(expected.map(file => [file.path, file]));
  const requiredPackages = new Set(["numpy", "torch", "transformers", "Pillow", "opencv-python"]);
  if ([...requiredPackages].some(name => !manifest.packages.some(item => item.name === name)) ||
      new Set(manifest.model.files).size !== manifest.model.files.length ||
      manifest.model.files.some(path => !files.has(path)) ||
      manifest.licenses.some(path => !files.has(path))) throw new Error("Visual-search component model, package or license inventory is incomplete.");
  const modelFiles = manifest.model.files.map(path => files.get(path)!).sort((a, b) => a.path.localeCompare(b.path));
  if (visualSearchModelFilesDigest(modelFiles) !== manifest.model.filesDigest) throw new Error("Visual-search model files digest changed.");
  const pythonExecutable = resolve(root, manifest.python.executable), entrypoint = resolve(root, manifest.entrypoint);
  for (const target of [pythonExecutable, entrypoint]) {
    const relativeTarget = relative(root, target);
    if (!relativeTarget || relativeTarget.startsWith("..") || isAbsolute(relativeTarget) || (await realpath(target)) !== target) {
      throw new Error("Visual-search component executable path escapes its root.");
    }
  }
  await access(pythonExecutable, process.platform === "win32" ? constants.R_OK : constants.X_OK);
  await access(entrypoint, constants.R_OK);
  return { root, manifest, manifestDigest: bytesSha256(normalizedBytes(manifest)), pythonExecutable, entrypoint };
}
