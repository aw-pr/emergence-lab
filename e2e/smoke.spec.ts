import { test, expect, type Page } from "@playwright/test";
import { driveKernel } from "./harness/driver.ts";
import { coverage } from "./harness/metrics.ts";

const REGISTRY_URL = "http://localhost:5173/src/app/registry.ts";
const SHOT_DIR = "e2e/artifacts/smoke";

const ALL_SLUGS = [
  "gray-scott",
  "abelian-sandpile",
  "ising-model",
  "kuramoto-oscillators",
  "game-of-life",
  "belousov-zhabotinsky",
  "physarum",
  "boids",
  "particle-life",
  "lorenz-attractor",
  "diffusion-limited-aggregation",
  "elementary-cellular-automata",
  "brians-brain",
  "cyclic-ca",
  "mandelbrot",
  "julia-set",
  "burning-ship",
  "lenia",
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
      if (
        slug === "kuramoto-oscillators" &&
        (await canvas.getAttribute("data-renderer")) === "webgl2"
      ) {
        await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
      }
    } else {
      await page.waitForTimeout(800);
      if ((await canvas.getAttribute("data-renderer")) === "webgl2") {
        await expect(canvas).toHaveAttribute("data-fractal-renderer", "gpu-fragment");
        expect(Number(await canvas.getAttribute("data-fractal-supersample"))).toBeGreaterThanOrEqual(1);
      }
    }

    await canvas.screenshot({ path: `${SHOT_DIR}/${slug}.png` });
  });
}

test("Kuramoto local and global coupling stay GPU-resident", async ({ page }) => {
  await page.goto("/#/kuramoto-oscillators");
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-renderer", /webgl2|canvas2d/);
  if ((await canvas.getAttribute("data-renderer")) !== "webgl2") return;

  const couplingMode = page.locator('[data-param-key="couplingMode"]');
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
  await couplingMode.selectOption("global");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
  await couplingMode.selectOption("local");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
});

test("logistic-Mandelbrot reports and completes the GPU cloud path", async ({ page }) => {
  await page.goto("/#/logistic-mandelbrot");
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-orbit3d");
  await expect(canvas).toHaveAttribute("data-orbit3d-sampler", "gpu-sampled");
  await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", {
    timeout: 15_000,
  });
  expect(Number(await canvas.getAttribute("data-orbit3d-points"))).toBeGreaterThan(0);
  await canvas.screenshot({ path: `${SHOT_DIR}/logistic-mandelbrot-gpu-sampled.png` });
});

test("cyclic phase sampling does not draw a false midpoint seam", async ({ page }) => {
  const pixel = await page.evaluate(async () => {
    const { createWebGLRendererBackend } = await import("/src/app/webglRenderer.ts");
    const canvas = document.createElement("canvas");
    const backend = createWebGLRendererBackend(canvas);
    if (!backend) return null;

    const state = new Float32Array([0.99, 0.01]);
    const kernel = {
      name: "Circular phase fixture",
      channelCount: 1,
      channelLabels: ["Phase"],
      channelRanges: [[0, 1]],
      paramSchema: [],
      init() {},
      step() {},
      readState: () => state,
      destroy() {},
    };
    backend.resizeDisplay(200, 100);
    backend.setGrid(2, 1, kernel, "field", {});
    backend.draw({
      state,
      kernel,
      colourOptions: {
        preset: "twilight",
        invert: false,
        gamma: 1,
        contrast: 1,
        paletteCycleReverse: false,
        steps: 0,
      },
      displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 },
      mode: "field",
      params: {},
      elapsedTime: 0,
      speedScale: 1,
    });
    const gl = canvas.getContext("webgl2");
    if (!gl) return null;
    const rgba = new Uint8Array(4);
    gl.readPixels(100, 50, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    backend.destroy();
    return Array.from(rgba);
  });

  test.skip(pixel === null, "WebGL2 is unavailable");
  const [red, green, blue] = pixel ?? [0, 0, 0, 0];
  expect(0.299 * red + 0.587 * green + 0.114 * blue).toBeGreaterThan(150);
});

test("Kuramoto defaults to the softened cyclic phase palette", async ({ page }) => {
  await page.goto("/#/kuramoto-oscillators");
  await expect(page.locator(".controls__colour select")).toHaveValue("phase");
});

for (const slug of ["mandelbrot", "julia-set"]) {
  test(`colour cycle multiplier defaults to 1.8: ${slug}`, async ({ page }) => {
    await page.goto(`/#/${slug}`);
    const control = page
      .locator("label.control--number")
      .filter({ hasText: "Colour cycle multiplier" });

    await expect(control.locator('input[type="range"]')).toHaveValue("1.8");
    await expect(control.locator(".control__value")).toHaveText("1.80x");
  });

  test(`progressive pointer-centred zoom settles at full quality: ${slug}`, async ({ page }) => {
    await page.goto(`/#/${slug}`);
    const canvas = page.locator(".sim-view__canvas");
    const zoomInput = page.locator('[data-param-key="zoom"]');
    const centerXInput = page.locator('[data-param-key="centerX"]');
    const beforeZoom = Number(await zoomInput.inputValue());
    const beforeCenterX = Number(await centerXInput.inputValue());
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width * 0.78,
        clientY: rect.top + rect.height * 0.42,
        deltaY: -90,
      }));
    });

    await expect(canvas).toHaveAttribute("data-render-quality", "preview");
    expect(Number(await canvas.getAttribute("data-fractal-supersample"))).toBeLessThan(1);
    await expect(canvas).toHaveAttribute("data-render-quality", "full", { timeout: 10_000 });
    expect(Number(await canvas.getAttribute("data-fractal-supersample"))).toBeGreaterThanOrEqual(1);
    expect(Number(await zoomInput.inputValue())).toBeGreaterThan(beforeZoom);
    expect(Number(await centerXInput.inputValue())).not.toBe(beforeCenterX);
    await expect(page.locator(".fractal-hud__zoom")).toContainText("×");

    await page.getByRole("button", { name: "Reset fractal view" }).click();
    expect(Number(await zoomInput.inputValue())).toBe(beforeZoom);
    expect(Number(await centerXInput.inputValue())).toBe(beforeCenterX);
  });
}

test("shared fractal transforms preserve the pointer coordinate", async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const { complexAtPoint, zoomAroundPoint } = await import("/src/app/fractalView.ts");
    const point = { x: 777.25, y: 193.75 };
    const width = 1280;
    const height = 720;
    const view = { centerX: -0.43, centerY: 0.17, zoom: 37.5 };
    return (["mandelbrot", "julia-set", "burning-ship"] as const).map((slug) => {
      const before = complexAtPoint(slug, view, width, height, point);
      const zoomed = zoomAroundPoint(slug, view, width, height, point, 913.25);
      const after = complexAtPoint(slug, zoomed, width, height, point);
      return Math.max(Math.abs(before.x - after.x), Math.abs(before.y - after.y));
    });
  });
  for (const error of errors) expect(error).toBeLessThan(1e-10);
});

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

test("boids glyphs respond to the selected colour scheme", async ({ page }) => {
  const colours = await page.evaluate(async () => {
    const { createWebGLRendererBackend } = await import("/src/app/webglRenderer.ts");
    const canvas = document.createElement("canvas");
    const backend = createWebGLRendererBackend(canvas);
    if (!backend) return null;

    const state = new Float32Array([1, 1, 1, 0]);
    const kernel = {
      name: "Boids",
      channelCount: 4,
      channelLabels: ["Density", "Speed", "Velocity X", "Velocity Y"],
      channelRanges: [[0, 1], [0, 1], [-1, 1], [-1, 1]],
      paramSchema: [],
      init() {},
      step() {},
      readState: () => state,
      destroy() {},
    };
    const draw = (preset: "plasma" | "ice") => {
      backend.draw({
        state,
        kernel,
        colourOptions: {
          preset,
          invert: false,
          gamma: 1,
          contrast: 1,
          paletteCycleReverse: false,
          steps: 0,
        },
        displayOptions: { dotSize: 6, trailFade: 0, bloom: 0 },
        mode: "particle",
        params: { pointSize: 12 },
        elapsedTime: 0,
        speedScale: 1,
      });
      const gl = canvas.getContext("webgl2");
      if (!gl) return null;
      const rgba = new Uint8Array(4);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return Array.from(rgba);
    };

    backend.resizeDisplay(64, 64);
    backend.setGrid(1, 1, kernel, "particle", { pointSize: 12 });
    const plasma = draw("plasma");
    const ice = draw("ice");
    backend.destroy();
    return { plasma, ice };
  });

  test.skip(colours === null, "WebGL2 is unavailable");
  expect(colours?.plasma).not.toEqual(colours?.ice);
});

test("boids behaviour presets preserve the full flock population", async ({ page }) => {
  const counts = await page.evaluate(async () => {
    const { presetsFor } = await import("/src/app/presets.ts");
    return presetsFor("boids").map((preset) => preset.params.boidCount);
  });

  expect(counts).toHaveLength(3);
  expect(new Set(counts)).toEqual(new Set([17777]));
});
