import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 5 * 60 * 1000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    launchOptions: process.env.PLAYWRIGHT_BUILT_IN_AI ? {
      ignoreDefaultArgs: ["--disable-background-networking", "--disable-component-update"],
    } : undefined,
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});
