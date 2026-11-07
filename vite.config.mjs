import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentDiscoveryLinkHeader, agentDiscoveryPlugin } from "./scripts/agent-discovery.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  Link: agentDiscoveryLinkHeader,
};

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        editor: resolve(projectRoot, "index.html"),
      },
      output: {
        // These are already startup dependencies. Keep them cacheable across
        // editor updates without pulling optional features into their chunks.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(id)) return "react-runtime";
          if (/\/src\/(?:i18n|i18nCompletion|i18nMessages|i18nMessageRuntime)\.js$/.test(id)) return "editor-copy";
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.{js,jsx}"],
    coverage: {
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/**/__fixtures__/**"],
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  worker: {
    format: "es",
  },
  server: {
    headers: isolationHeaders,
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  preview: {
    headers: isolationHeaders,
  },
  plugins: [agentDiscoveryPlugin(), react()],
});
