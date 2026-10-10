import { defineConfig, loadEnv } from "vite";
import { competitionDevPlugin } from "./server/competition-api.mjs";
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

export default defineConfig(({ mode }) => ({
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
  plugins: [competitionDevPlugin({ ...loadEnv(mode, projectRoot, ["COMPETITION_", "AWS_"]), ...process.env }), agentDiscoveryPlugin(), react()],
}));
