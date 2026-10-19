import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const historyFile = "anna-runtime-history.json";
const runtimeName = /^[\w.-]+-[\w-]{8}\.(?:js|css|wasm)$/;
const maxPreviousGenerations = 4;
async function currentGeneration(root) {
  const names = (await readdir(resolve(root, "assets"))).filter((name) => runtimeName.test(name)).sort();
  return { id: createHash("sha256").update(names.join("\n")).digest("hex"), files: names };
}

/** Keep hashed runtime dependencies for tabs open across mutable draft updates. */
export async function captureAnnaRuntimeHistory(root, compatibilityRoots = []) {
  const generations = [];
  const bytes = new Map();
  for (const source of [...compatibilityRoots, root]) {
    let current;
    try { current = await currentGeneration(source); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    let previous = [];
    try {
      const saved = JSON.parse(await readFile(resolve(source, historyFile), "utf8"));
      previous = Array.isArray(saved.generations) ? saved.generations.filter((item) => typeof item.id === "string" && Array.isArray(item.files) && item.files.every((name) => runtimeName.test(name))) : [];
      // Exclude retained files when identifying the previous build's own graph.
      if (previous.length) current = previous.at(-1);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const generation of [...previous, current]) {
      if (!generations.some((item) => item.id === generation.id)) generations.push(generation);
      for (const name of generation.files) {
        if (!bytes.has(name)) bytes.set(name, await readFile(resolve(source, "assets", name)));
      }
    }
  }
  const retained = generations.slice(-maxPreviousGenerations);
  const names = new Set(retained.flatMap((item) => item.files));
  return { generations: retained, bytes: new Map([...bytes].filter(([name]) => names.has(name))) };
}

export async function restoreAnnaRuntimeHistory(root, history) {
  const current = await currentGeneration(root);
  for (const [name, buffer] of history.bytes) {
    const path = resolve(root, "assets", name);
    try { await access(path); } catch (error) { if (error.code !== "ENOENT") throw error; await writeFile(path, buffer); }
  }
  const generations = [...history.generations.filter((item) => item.id !== current.id), current];
  await writeFile(resolve(root, historyFile), JSON.stringify({ version: 1, generations }));
}
