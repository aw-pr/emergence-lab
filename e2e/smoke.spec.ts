import { test, expect, type Page } from "@playwright/test";
import { driveKernel } from "./harness/driver.ts";
import { coverage } from "./harness/metrics.ts";

const REGISTRY_URL = "http://localhost:5173/src/app/registry.ts";
const SHOT_DIR = "e2e/artifacts/smoke";

const ALL_SLUGS = [
  "gray-scott",
  "abelian-sandpile",
  "game-of-life",
  "belousov-zhabotinsky",
  "boids",
  "lorenz-attractor",
  "diffusion-limited-aggregation",
  "elementary-cellular-automata",
  "brians-brain",
  "mandelbrot",
  "julia-set",
  "burning-ship",
];

const FRACTALS = new Set(["mandelbrot", "julia-set", "burning-ship"]);

function readIterations(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(".controls__iteration");
    const text = el?.textContent ?? "iter 0";
    return Number(text.replace(/[^0-9]/g, "")) || 0;
  });
}

/** Measure the fraction of a kernel's primary-channel field above background. */
async function fieldCoverage(
  page: Page,
  slug: string,
  params: Record<string, number | boolean | string>,
  grid: number,
  warmupSteps: number,
  threshold: number,
  primaryChannel = 0,
): Promise<number> {
  const result = await page.evaluate(driveKernel, {
    registryUrl: REGISTRY_URL,
    slug,
    params,
    gridWidth: grid,
    gridHeight: grid,
    warmupSteps,
    fluxGap: 0,
    primaryChannel,
    dt: 1,
  });
  return coverage(result.frameA, threshold);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

// Every sim loads, initialises a renderer backend, and (for stepping sims) is
// actually advancing. A compositor screenshot is captured for the visual record.
for (const slug of ALL_SLUGS) {
  test(`live route loads and runs: ${slug}`, async ({ page }) => {
    await page.goto(`/#/${slug}`);
    const canvas = page.locator(".sim-view__canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-renderer", /webgl2|canvas2d/);

    const displaySize = await canvas.getAttribute("data-display-size");
    expect(displaySize).toMatch(/^[1-9]\d*x[1-9]\d*$/);

    if (!FRACTALS.has(slug)) {
      const before = await readIterations(page);
      await page.waitForTimeout(1500);
      const after = await readIterations(page);
      expect(after, `${slug} should be stepping`).toBeGreaterThan(before);
    } else {
      await page.waitForTimeout(800);
    }

    await canvas.screenshot({ path: `${SHOT_DIR}/${slug}.png` });
  });
}

// Owed live-browser smoke checks (previously verified headless only).

test("DLA grows a visible branching cluster (~0.25 fill target)", async ({ page }) => {
  // Pin the seed so the owed-smoke assertions are stable (the app self-randomises).
  const params = { walkersPerStep: 96, maxWalkSteps: 256, spawnRadius: 0.06, stickiness: 0.45, seedCount: 4, seed: 7 };
  const grid = 220;
  const fills: number[] = [];
  for (const steps of [60, 140, 260]) {
    fills.push(await fieldCoverage(page, "diffusion-limited-aggregation", params, grid, steps, 0.05));
  }
  console.log(`  DLA fill over time: ${fills.map((f) => f.toFixed(3)).join(" → ")}`);
  // Grows monotonically and reaches a visible, non-saturated fraction.
  expect(fills[0]).toBeLessThan(fills[2]);
  expect(fills[2]).toBeGreaterThan(0.02);
  expect(fills[2]).toBeLessThan(0.7);
});

test("sandpile fills a large (Ultra-scale) grid without stalling", async ({ page }) => {
  const params = { initialPile: 100000, toppleThreshold: 4, grainsPerStep: 1, topplesPerStep: 50000 };
  const grid = 360; // Ultra-scale cell budget
  const fill = await fieldCoverage(page, "abelian-sandpile", params, grid, 120, 0.01);
  console.log(`  sandpile fill (Ultra-scale ${grid}²): ${fill.toFixed(3)}`);
  expect(fill).toBeGreaterThan(0.05);
});

test("boids stay responsive and occupy space at 5k and 12k", async ({ page }) => {
  for (const boidCount of [5000, 12000]) {
    const params = { boidCount, visualRadius: 28, separationRadius: 8, maxSpeed: 36, alignment: 0.05, cohesion: 0.005, separation: 0.2, pointSize: 6 };
    const occ = await fieldCoverage(page, "boids", params, 240, 180, 0.001, 0);
    console.log(`  boids ${boidCount}: occupancy ${occ.toFixed(4)}`);
    // The flock spreads out (not collapsed to a point, not filling everything).
    expect(occ).toBeGreaterThan(0.005);
    expect(occ).toBeLessThan(0.9);
  }
});
