import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{js,jsx}"],
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  worker: {
    format: "es",
  },
  server: {
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
  test: {
    coverage: {
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/**/__fixtures__/**"],
    },
  },
});
