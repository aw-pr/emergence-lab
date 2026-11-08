import { defineConfig } from "@playwright/test";
import base from "../playwright.config.ts";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /lab-chrome-154\.contract\.spec\.ts/,
  workers: 1,
  timeout: 120_000,
  use: { ...base.use, baseURL: "http://localhost:5187", viewport: { width: 1440, height: 900 } },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5187 --strictPort",
    url: "http://localhost:5187",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
