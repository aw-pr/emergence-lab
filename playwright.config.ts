import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the emergence-lab e2e suite.
 *
 * Two kinds of test live under e2e/:
 *   - sweep.spec.ts  — the interestingness-sweep harness. It drives the kernels
 *     headlessly (no rendering): it imports the Vite-served registry in the page,
 *     steps a kernel deterministically, and scores the float field. No WebGL.
 *   - smoke.spec.ts  — live-browser smoke. It loads real sim routes and captures
 *     canvas screenshots, so it does exercise the renderer.
 *
 * The dev server is Vite. We pin the port so the page-context dynamic imports
 * (`import('/src/app/registry.ts')`) resolve against a known origin.
 */
export default defineConfig({
  testDir: "./e2e",
  // Sweeps are CPU-bound and deterministic regardless of wall-clock timing, so a
  // single worker keeps the machine responsive and the logs readable.
  workers: 1,
  fullyParallel: false,
  // A full Gray-Scott sweep steps many kernels; give each test room.
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
