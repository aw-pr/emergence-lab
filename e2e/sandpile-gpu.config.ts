import { defineConfig } from "@playwright/test";
import base from "../playwright.config.ts";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /sandpile-gpu\.contract\.spec\.ts/,
  workers: 1,
  timeout: 240_000,
  // A screen larger than the viewport keeps simView out of immersive mode, so
  // the sidebar controls stay readable.
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:5188",
    viewport: { width: 1440, height: 900 },
    contextOptions: { screen: { width: 1920, height: 1200 } },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5188 --strictPort",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
