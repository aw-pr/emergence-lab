import { defineConfig } from "@playwright/test";
import base from "../playwright.config.ts";

// The screen is larger than the viewport so the standalone page does not enter
// immersive mode, as in stage-screen-155.config.ts.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /panel-minimised-167\.contract\.spec\.ts/,
  workers: 1,
  timeout: 120_000,
  use: {
    ...base.use,
    baseURL: "http://localhost:5192",
    viewport: { width: 1440, height: 900 },
    contextOptions: { screen: { width: 1920, height: 1200 } },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5192 --strictPort",
    url: "http://localhost:5192",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
