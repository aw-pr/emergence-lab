import { defineConfig } from "@playwright/test";
import base from "../playwright.config.ts";

// The screen is larger than the viewport so the app's window-fills-the-screen
// heuristic (simView.ts updateImmersive) does not put the standalone page into
// immersive mode, which is what a default Playwright context would do.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /stage-screen-155\.contract\.spec\.ts/,
  workers: 1,
  timeout: 150_000,
  use: {
    ...base.use,
    baseURL: "http://localhost:5191",
    viewport: { width: 1440, height: 900 },
    contextOptions: { screen: { width: 1920, height: 1200 } },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5191 --strictPort",
    url: "http://localhost:5191",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
