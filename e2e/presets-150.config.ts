import { defineConfig } from "@playwright/test";
import base from "../playwright.config.ts";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /presets-150(?:\.contract)?\.spec\.ts/,
  workers: 1,
  timeout: 180_000,
  // A screen larger than the viewport keeps simView's window-fills-the-screen
  // heuristic from opening the page in immersive mode, where the sidebar is an
  // off-screen drawer and its controls cannot be clicked.
  use: {
    ...base.use,
    baseURL: "http://localhost:5186",
    viewport: { width: 1440, height: 900 },
    contextOptions: { screen: { width: 1920, height: 1200 } },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5186 --strictPort",
    url: "http://localhost:5186",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
