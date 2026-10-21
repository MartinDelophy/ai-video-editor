// Adapted from Jason-zzr/Auto-cut (MIT), revision 3090593.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { SCENE_DETECT_TOOL_ID, SCENE_DETECT_TOOL_REVISION } from "../../src/config/sceneDetect.js";

export const sceneComponentId = "autocut.scene-detect-runtime";
export const sceneComponentRevision = "0.2.0";
export const sceneComponentManifestName = "component-manifest.json";

const execute = promisify(execFile);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const relativeFile = z.string().min(1).max(1024).refine(value => !value.includes("\\") && !value.includes("\0") &&
  !isAbsolute(value) && value.split("/").every(part => part && part !== "." && part !== ".."));
const sourceUrl = z.string().url().refine(value => {
  const source = new URL(value);
  return source.protocol === "https:" && !source.username && !source.password && !source.search && !source.hash;
});
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1), componentId: z.literal(sceneComponentId), componentRevision: z.literal(sceneComponentRevision),
  toolId: z.literal(SCENE_DETECT_TOOL_ID), toolRevision: z.literal(SCENE_DETECT_TOOL_REVISION),
  platform: z.enum(["darwin", "win32"]), arch: z.enum(["arm64", "x64"]),
  python: z.strictObject({ version: z.string().regex(/^3\.\d+\.\d+$/), executable: relativeFile }),
  packages: z.array(z.strictObject({ name: z.string().min(1).max(128), version: z.string().min(1).max(128), source: sourceUrl, sha256 })).min(2).max(64),
  licenses: z.array(relativeFile).min(1).max(256),
  files: z.array(z.strictObject({ path: relativeFile, sizeBytes: z.number().int().nonnegative().safe(), sha256 })).min(1).max(100_000),
});

export type SceneComponentManifest = z.infer<typeof manifestSchema>;

async function digest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function inventory(root: string, directory = root, files: { path: string; sizeBytes: number; sha256: string }[] = []) {
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error("SceneDetect component contains a symbolic link.");
    if (info.isDirectory()) await inventory(root, path, files);
    else if (info.isFile()) {
      const item = relative(root, path).split("\\").join("/");
      if (item !== sceneComponentManifestName) files.push({ path: item, sizeBytes: info.size, sha256: await digest(path) });
    } else throw new Error("SceneDetect component contains an unsupported file.");
  }
  return files;
}

export async function inspectSceneComponent(componentRoot: string, expectedPlatform = process.platform, expectedArch = process.arch) {
  if (!isAbsolute(componentRoot)) throw new Error("SceneDetect component root must be absolute.");
  const root = resolve(componentRoot), rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new Error("SceneDetect component root must be a real directory.");
  }
  const manifestPath = join(root, sceneComponentManifestName), manifestInfo = await lstat(manifestPath);
  if (manifestInfo.isSymbolicLink() || !manifestInfo.isFile() || manifestInfo.size > 8 * 1024 * 1024) {
    throw new Error("SceneDetect component manifest is unavailable or too large.");
  }
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.platform !== expectedPlatform || manifest.arch !== expectedArch) throw new Error("SceneDetect component platform does not match this host.");
  const packages = new Map(manifest.packages.map(item => [item.name, item.version]));
  if (packages.size !== manifest.packages.length || packages.get("scenedetect") !== "0.7.2" || packages.get("opencv-python") !== "4.14.0.94") {
    throw new Error("SceneDetect component packages do not match the reviewed runtime.");
  }
  const files = await inventory(root), expected = new Map(manifest.files.map(item => [item.path, item]));
  if (expected.size !== manifest.files.length || files.length !== manifest.files.length) throw new Error("SceneDetect component file inventory is incomplete.");
  for (const file of files) {
    const item = expected.get(file.path);
    if (!item || item.sizeBytes !== file.sizeBytes || item.sha256 !== file.sha256) throw new Error(`SceneDetect component file verification failed: ${file.path}`);
  }
  for (const license of new Set(manifest.licenses)) {
    if (!expected.has(license) || expected.get(license)!.sizeBytes === 0) throw new Error(`SceneDetect component license is missing: ${license}`);
  }
  if (new Set(manifest.licenses).size !== manifest.licenses.length || !expected.has(manifest.python.executable)) {
    throw new Error("SceneDetect component manifest contains duplicate licenses or a missing Python entry.");
  }
  const pythonExecutable = join(root, ...manifest.python.executable.split("/"));
  await access(pythonExecutable, process.platform === "win32" ? constants.R_OK : constants.X_OK);
  return { root, manifest, pythonExecutable };
}

const probeSource = String.raw`import json
import platform
import cv2
from importlib.metadata import version
import scenedetect
print(json.dumps({"python": platform.python_version(), "scenedetect": version("scenedetect"), "opencv-python": version("opencv-python"), "cv2": cv2.__version__}, separators=(",", ":")))
`;

export async function verifySceneComponentRuntime(pythonExecutable: string, manifest?: SceneComponentManifest) {
  const { stdout } = await execute(pythonExecutable, ["-I", "-c", probeSource], {
    env: { PATH: resolve(pythonExecutable, ".."), PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", LC_ALL: "C", LANG: "C" }, timeout: 30_000,
  });
  const identity = JSON.parse(stdout.trim());
  if (identity.scenedetect !== "0.7.2" || identity["opencv-python"] !== "4.14.0.94" || identity.cv2 !== "4.14.0" ||
      (manifest && identity.python !== manifest.python.version)) throw new Error("SceneDetect runtime imports or versions do not match the reviewed component.");
  return identity as { python: string; scenedetect: string; "opencv-python": string; cv2: string };
}
