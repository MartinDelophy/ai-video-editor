import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentDiscoveryLinkHeader, agentDiscoveryPlugin } from "./scripts/agent-discovery.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);
const transformersRequire = createRequire(require.resolve("@huggingface/transformers"));
// Transformers owns a different ORT version from the editor's direct imports.
// Resolve its matching runtime assets through its dependency tree for both
// the main bundle and workers instead of relying on a node_modules layout.
const transformersOrtDist = dirname(transformersRequire.resolve("onnxruntime-web"));
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  Link: agentDiscoveryLinkHeader,
};

export default defineConfig({
  define: { "import.meta.env.VITE_ANNA_EDITION": JSON.stringify("false") },
  resolve: {
    alias: { "@timeline-studio/transformers-ort": transformersOrtDist },
  },
  build: {
    rollupOptions: {
      input: {
        editor: resolve(projectRoot, "index.html"),
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
