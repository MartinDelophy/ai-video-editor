import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const bundleRoot = resolve(projectRoot, "anna/bundle");
const limits = { files: 2000, singleFile: 50 * 1024 ** 2, total: 1024 ** 3 };

await build({ root: projectRoot, configFile: resolve(projectRoot, "vite.anna.config.mjs") });

// The Anna package contains the editor, not the independent site's peripheral pages
// or ignored local model downloads. Keep all shipped browser runtime dependencies.
const runtimeEntries = new Set(["assets", "icons", "vendor", "model-cache-sw.js"]);
for (const entry of await readdir(resolve(projectRoot, "public"))) {
  if (!runtimeEntries.has(entry)) {
    await rm(resolve(bundleRoot, entry), { recursive: true, force: true });
  }
}

// Reuse the editor's model identity and eviction logic without installing its
// origin-wide PWA shell or touching caches belonging to the host or other apps.
const workerPath = resolve(bundleRoot, "model-cache-sw.js");
const originalWorker = await readFile(workerPath, "utf8");
const lifecycleStart = originalWorker.indexOf("async function networkFirst(request) {");
const modelStart = originalWorker.indexOf("const CACHEABLE_EXTENSIONS = [");
if (lifecycleStart < 0 || modelStart < 0) {
  throw new Error("Model cache worker structure changed; review the Anna worker adapter");
}
let worker = `const ANNA_CACHE_PREFIX = \`timeline-studio-anna:\${encodeURIComponent(self.registration.scope)}:\`;
const MODEL_CACHE_NAME = \`\${ANNA_CACHE_PREFIX}model-cache-v5\`;
${originalWorker.slice(modelStart, lifecycleStart)}`;
worker = worker
  .replaceAll(
    'url.pathname.startsWith("/models/")',
    'url.pathname.startsWith(new URL("models/", self.registration.scope).pathname)',
  )
  .replaceAll(
    'url.pathname.startsWith("/assets/")',
    'url.pathname.startsWith(new URL("assets/", self.registration.scope).pathname)',
  )
  .replace(
    /\s*await caches\.delete\("(?:kokoro-voices|timeline-studio-voice-models-v2)"\)\.catch\(\(\) => false\);/g,
    "",
  );
worker += `
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(ANNA_CACHE_PREFIX) && key !== MODEL_CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).catch(() => {}).then(() => self.clients.claim()),
  );
  event.waitUntil(removeLegacyPiperDuplicates().catch(() => {}));
  event.waitUntil(removeLegacyKokoroFp32Model().catch(() => {}));
  event.waitUntil(migratePreviousVoiceRevision().catch(() => {}));
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate" || !shouldCacheRequest(event.request)) return;
  event.respondWith(cacheFirst(event.request, event).catch(() => fetch(event.request)));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_MODEL_CACHE") event.waitUntil(caches.delete(MODEL_CACHE_NAME));
});
`;
if (/APP_CACHE_NAME|APP_SHELL_URLS|caches\.delete\("/.test(worker)) {
  throw new Error("Anna model worker must not manage an app shell or unscoped caches");
}
await writeFile(workerPath, worker);

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...(await listFiles(path, `${relative}/`)));
    else if (entry.isFile()) files.push({ path: relative, bytes: (await stat(path)).size });
    else throw new Error(`Anna bundle contains a non-regular file: ${relative}`);
  }
  return files;
}

const files = await listFiles(bundleRoot);
const bytes = files.reduce((total, file) => total + file.bytes, 0);
const oversized = files.filter((file) => file.bytes > limits.singleFile);
if (files.length > limits.files || bytes > limits.total || oversized.length) {
  throw new Error(
    `Anna bundle exceeds upload limits: ${files.length} files, ${bytes} bytes; oversized: ${oversized.map((file) => file.path).join(", ") || "none"}`,
  );
}
const manifest = JSON.parse(await readFile(resolve(projectRoot, "anna/manifest.json"), "utf8"));
if (!files.some((file) => file.path === manifest.ui.bundle.entry))
  throw new Error("Anna bundle entry is missing");
const html = await readFile(resolve(bundleRoot, manifest.ui.bundle.entry), "utf8");
if (/\b(?:src|href)=["']\/(?!\/)/.test(html))
  throw new Error("Anna entry contains an origin-root asset URL");
console.log(
  `Anna bundle ready: ${files.length} files, ${(bytes / 1024 ** 2).toFixed(1)} MiB (${bundleRoot})`,
);
console.log(
  "Next local check: npm run anna:validate (optional strict scan: npm run anna:validate:strict)",
);
