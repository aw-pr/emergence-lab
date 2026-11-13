import { defineConfig } from "@playwright/test";
import base from "../playwright.config.ts";

// 2560x1440 at device pixel ratio 1 gives the desktop tier's capped 1707x960
// Boids grid; the larger screen keeps the standalone page out of immersive mode.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /boids-gpu-default-169\.contract\.spec\.ts/,
  workers: 1,
  timeout: 240_000,
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:5194",
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    contextOptions: { screen: { width: 3200, height: 1800 } },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5194 --strictPort",
    url: "http://127.0.0.1:5194",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
