import { defineConfig } from "@playwright/test";
import base from "../playwright.config.ts";

/**
 * Runs the Gray-Scott GPU spec, and the smoke routes that navigate with
 * page.goto, against a second dev server on 5181 so the shared 5173 server is
 * never touched. smoke.spec.ts hard-codes a 5173 registry URL for its in-page
 * kernel tests, so select smoke tests with -g, for example
 * -g "live route loads and runs: (gray-scott|kuramoto-oscillators)$".
 *
 * In a worktree whose node_modules is a symlink to another checkout, start the
 * 5181 server yourself with a Vite cacheDir outside that node_modules first;
 * otherwise its dependency pre-bundling rewrites the other checkout's cache.
 * The webServer entry below is reused when a server is already listening.
 */
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /(gray-scott-gpu|smoke)\.spec\.ts/,
  workers: 1,
  timeout: 180_000,
  // A screen larger than the viewport keeps simView out of immersive mode, so
  // the sidebar controls stay clickable.
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:5181",
    viewport: { width: 1920, height: 1200 },
    contextOptions: { screen: { width: 2560, height: 1600 } },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5181 --strictPort",
    url: "http://127.0.0.1:5181",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
