import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import editorConfig from "./vite.config.mjs";
import { annaPiperRuntimePlugin } from "./scripts/anna-piper-runtime.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const assetPath = /^\/(?:assets|icons|vendor|models)(?:\/|$)/;

/** Rebase editor-owned assets only in the Anna build, including worker imports. */
function annaAssetPaths({ types: t, template }, { command } = {}) {
  // Vite serves source workers from /src/workers/, while a built worker lives
  // in the bundle's /assets/ directory. Both must resolve its public root.
  const workerRoot = command === "serve" ? "../../" : "../";
  const makeUrl = template.expression(
    `new URL(ASSET, globalThis.document?.baseURI ?? new URL(${JSON.stringify(workerRoot)}, globalThis.location.href)).href`,
    { placeholderPattern: /^ASSET$/ },
  );
  const replace = (path, value) => {
    const url = makeUrl({ ASSET: value });
    path.replaceWith(path.parentPath.isJSXAttribute() ? t.jsxExpressionContainer(url) : url);
    path.skip();
  };
  return {
    name: "timeline-studio-anna-asset-paths",
    visitor: {
      Program(path, state) {
        const filename = state.filename?.replaceAll("\\", "/") ?? "";
        if (
          !filename.startsWith(`${projectRoot}src/`) ||
          filename.endsWith("/lib/serviceWorker.js")
        )
          path.skip();
      },
      StringLiteral(path) {
        if (assetPath.test(path.node.value))
          replace(path, t.stringLiteral(path.node.value.slice(1)));
      },
      TemplateLiteral(path) {
        if (!assetPath.test(path.node.quasis[0]?.value.raw ?? "")) return;
        const relative = t.cloneNode(path.node, true);
        relative.quasis[0].value.raw = relative.quasis[0].value.raw.slice(1);
        if (relative.quasis[0].value.cooked != null) {
          relative.quasis[0].value.cooked = relative.quasis[0].value.cooked.slice(1);
        }
        replace(path, relative);
      },
    },
  };
}

const annaReact = (command) =>
  react({
    exclude: [/node_modules/, /\/src\/vendor\//],
    babel: { plugins: [[annaAssetPaths, { command }]] },
  });

export default defineConfig(({ command }) => ({
  ...editorConfig,
  base: "./",
  resolve: {
    ...editorConfig.resolve,
    alias: [
      { find: /^\.\/providers\/puter\/adapter\.js$/, replacement: fileURLToPath(new URL("./src/plugins/generation/providers/anna/unavailablePuterAdapter.js", import.meta.url)) },
      ...(Array.isArray(editorConfig.resolve?.alias) ? editorConfig.resolve.alias : Object.entries(editorConfig.resolve?.alias || {}).map(([find, replacement]) => ({ find, replacement }))),
    ],
  },
  define: { "import.meta.env.VITE_ANNA_EDITION": JSON.stringify("true") },
  // Anna app iframes do not provide COOP/COEP or SharedArrayBuffer. Exercise
  // that single-threaded environment locally instead of inheriting the
  // independent editor's cross-origin-isolated development server.
  server: { ...editorConfig.server, headers: {} },
  preview: { ...editorConfig.preview, headers: {} },
  build: {
    ...editorConfig.build,
    outDir: "anna/bundle",
    emptyOutDir: true,
  },
  worker: {
    ...editorConfig.worker,
    plugins: () => [annaPiperRuntimePlugin(), annaReact(command)],
  },
  plugins: [
    annaPiperRuntimePlugin(),
    {
      name: "timeline-studio-anna-entry",
      transformIndexHtml: {
        order: "pre",
        handler: () => readFileSync(new URL("./anna/index.html", import.meta.url), "utf8"),
      },
    },
    annaReact(command),
  ],
}));
