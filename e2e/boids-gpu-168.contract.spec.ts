import { test, expect, type Page } from "@playwright/test";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/168-boids-gpu-stepping.md
const contract = process.env.BOIDS_GPU === "168" ? test : test.skip;
// The desktop tier caps the Boids grid at 1280 x 1280 cells in the canvas aspect
// (1733x945 under the lab bar at this viewport, 1707x960 without it).
const GRID_CELLS = [1_600_000, 1_640_000];
let GRID = { width: 0, height: 0 };
const COUNT = 28000;
const MAX_SPEED = 36;
const DT = 1 / 60;
// Opening defaults at 946357cbc; this card changes none of them.
const DEFAULTS = {
  obstacleLayout: "none", obstacleAmount: 0.5, boidCount: 28000, initialFlocks: 5, visualRadius: 14,
  separationRadius: 27, maxSpeed: 36, alignment: 0.09, cohesion: 0.011, separation: 0.22, pointSize: 4,
};
// CPU kernel at 946357cbc, the defaults above (five flocks), dt 1/60, six seeds
// (scripts/sweep-boids-flow.mjs, on 1707x960: the same cell count and density): median nearest-neighbour distance in cells
// 2.91-2.98 at step 300, 4.86-4.98 at 1200, 4.90-5.16 at 3600; share of one
// heading 0.02-0.05 at 300 and 0.05-0.40 at 1200. Bands are the CPU mean +-10%.
const PARITY = [
  { step: 300, nn: [2.65, 3.23], orderBelow: 0.15 },
  { step: 1200, nn: [4.45, 5.45], orderBelow: 0.5 },
  { step: 3600, nn: [4.5, 5.5], orderBelow: 1.01 },
];

// Readings computed from the engine's own positions and velocities, written
// from their definitions and not from the app's code.
const READINGS = `
window.__boids168 = {
  canvas() { return document.querySelector(".sim-view__canvas"); },
  engine() { return this.canvas().boidsGpu; },
  summary(W, H, maxSpeed) {
    const e = this.engine(), s = e.read(), n = s.length / 4;
    let outside = 0, bad = 0, fast = 0, slow = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i += 1) {
      const x = s[i * 4], y = s[i * 4 + 1], vx = s[i * 4 + 2], vy = s[i * 4 + 3];
      if (![x, y, vx, vy].every(Number.isFinite)) { bad += 1; continue; }
      if (x < 0 || x >= W || y < 0 || y >= H) outside += 1;
      const speed = Math.hypot(vx, vy);
      if (speed > maxSpeed * 1.001) fast += 1;
      if (speed < maxSpeed * 0.7 * 0.999) slow += 1;
      if (speed > 0) { sx += vx / speed; sy += vy / speed; }
    }
    const cell = 8, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    const heads = new Int32Array(cols * rows).fill(-1), next = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      const b = Math.min(rows - 1, Math.floor(s[i * 4 + 1] / cell)) * cols + Math.min(cols - 1, Math.floor(s[i * 4] / cell));
      next[i] = heads[b]; heads[b] = i;
    }
    const nearest = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = s[i * 4], y = s[i * 4 + 1];
      const cx = Math.min(cols - 1, Math.floor(x / cell)), cy = Math.min(rows - 1, Math.floor(y / cell));
      let best = Infinity;
      for (let ring = 1; ring <= 8 && best > (ring - 1) * cell; ring += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring && ring > 1) continue;
          const b = ((cy + dy + rows) % rows) * cols + ((cx + dx + cols) % cols);
          for (let j = heads[b]; j !== -1; j = next[j]) {
            if (j === i) continue;
            let ddx = Math.abs(s[j * 4] - x), ddy = Math.abs(s[j * 4 + 1] - y);
            if (ddx > W / 2) ddx = W - ddx;
            if (ddy > H / 2) ddy = H - ddy;
            const d = Math.hypot(ddx, ddy);
            if (d < best) best = d;
          }
        }
      }
      nearest[i] = best;
    }
    const sorted = Array.from(nearest).sort((a, b) => a - b);
    return { n, count: e.count, steps: e.steps, outside, bad, fast, slow, order: Math.hypot(sx, sy) / n, nn: sorted[Math.floor(n / 2)] };
  },
  displacement(W, H, steps, dt) {
    const e = this.engine(), before = e.read().slice();
    e.advance(steps, dt);
    const after = e.read(), n = before.length / 4, moved = [];
    for (let i = 0; i < n; i += 1) {
      let dx = Math.abs(after[i * 4] - before[i * 4]), dy = Math.abs(after[i * 4 + 1] - before[i * 4 + 1]);
      if (dx > W / 2) dx = W - dx;
      if (dy > H / 2) dy = H - dy;
      moved.push(Math.hypot(dx, dy));
    }
    moved.sort((a, b) => a - b);
    return moved[Math.floor(n / 2)];
  },
};
`;

async function open(page: Page, query: string) {
  await page.addInitScript(READINGS);
  // A goto to the URL the page is already on, fragment included, is a
  // same-document navigation in Chromium and keeps the running engine.
  await page.goto("about:blank");
  await page.goto(`/${query}#/boids`);
  await expect(page.locator(".sim-view__canvas")).toBeVisible();
  await expect(page.locator(".sim-view")).not.toHaveClass(/sim-view--immersive/);
  await expect.poll(() => page.locator(".sim-view__canvas").getAttribute("data-render-size")).toMatch(/^\d+x\d+$/);
  const [width, height] = (await page.locator(".sim-view__canvas").getAttribute("data-render-size"))!.split("x").map(Number);
  expect(width * height, "desktop Boids grid, cells").toBeGreaterThanOrEqual(GRID_CELLS[0]);
  expect(width * height, "desktop Boids grid, cells").toBeLessThanOrEqual(GRID_CELLS[1]);
  GRID = { width, height };
}

function renderer(page: Page) {
  return page.locator(".sim-view__canvas").getAttribute("data-simulation-renderer");
}

async function openGpu(page: Page) {
  await open(page, "?simulationRenderer=gpu");
  await expect.poll(() => renderer(page), { message: "GPU stepping engages" }).toBe("gpu-boids");
  // Hold the page's own stepping so the test owns the step count from here.
  const held = await page.evaluate(() => { const e = (window as any).__boids168.engine(); e.hold(true); return e.steps; });
  expect(held, "engine steps since seeding when the test takes over").toBeLessThanOrEqual(250);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__boids168.engine().steps), "hold(true) stops the page stepping the engine").toBe(held);
}

contract("168 switch absent: Boids steps on the CPU and opens on the unchanged defaults", async ({ page }) => {
  await open(page, "");
  await page.waitForTimeout(1500);
  expect(await renderer(page)).not.toBe("gpu-boids");
  expect(await page.evaluate(() => "boidsGpu" in (document.querySelector(".sim-view__canvas") as object))).toBe(false);
  const defaults = await page.evaluate(async () => {
    const { BoidsKernel } = await import("/src/sims/boids/kernel.ts" as string);
    const kernel = new BoidsKernel();
    return Object.fromEntries(kernel.paramSchema.map((p: { key: string; default: unknown }) => [p.key, p.default]));
  });
  expect(defaults).toEqual(DEFAULTS);
  const tiers = await page.evaluate(async () => {
    const { tierParamOverridesFor } = await import("/src/app/qualityProfiles.ts" as string);
    return [tierParamOverridesFor("boids", "desktop"), tierParamOverridesFor("boids", "tablet"), tierParamOverridesFor("boids", "phone")];
  });
  expect(tiers).toEqual([{}, { boidCount: 7000 }, { boidCount: 5000 }]);
});

contract("168 switch on: after 3600 steps every boid is kept, finite, inside the torus and under the speed limit", async ({ page }) => {
  await openGpu(page);
  const start = await page.evaluate(([w, h, v]) => (window as any).__boids168.summary(w, h, v), [GRID.width, GRID.height, MAX_SPEED]);
  expect(start.n, "boids read back").toBe(COUNT);
  expect(start.count).toBe(COUNT);
  for (let done = 0; done < 3600; done += 600) {
    await page.evaluate((dt) => (window as any).__boids168.engine().advance(600, dt), DT);
  }
  const end = await page.evaluate(([w, h, v]) => (window as any).__boids168.summary(w, h, v), [GRID.width, GRID.height, MAX_SPEED]);
  expect(end.n).toBe(COUNT);
  expect(end.steps - start.steps, "advance() counts its steps").toBe(3600);
  expect(end.bad, "non-finite boids").toBe(0);
  expect(end.outside, "boids outside the torus").toBe(0);
  expect(end.fast, "boids over the speed limit").toBe(0);
  expect(end.slow / COUNT, "share of boids under the speed floor").toBeLessThanOrEqual(0.01);
});

contract("168 parity: spacing and heading spread stay inside the CPU kernel's bands on three loads", async ({ page }) => {
  for (let load = 0; load < 3; load += 1) {
    await openGpu(page);
    for (const { step, nn, orderBelow } of PARITY) {
      // Steps are counted from seeding, as the CPU bands are.
      await page.evaluate(([target, dt]) => {
        const engine = (window as any).__boids168.engine();
        while (engine.steps < target) engine.advance(Math.min(300, target - engine.steps), dt);
      }, [step, DT]);
      const s = await page.evaluate(([w, h, v]) => (window as any).__boids168.summary(w, h, v), [GRID.width, GRID.height, MAX_SPEED]);
      expect(s.steps, `load ${load}: steps since seeding`).toBe(step);
      expect(s.nn, `load ${load} step ${step}: median nearest-neighbour distance, cells`).toBeGreaterThanOrEqual(nn[0]);
      expect(s.nn, `load ${load} step ${step}: median nearest-neighbour distance, cells`).toBeLessThanOrEqual(nn[1]);
      expect(s.order, `load ${load} step ${step}: share of one heading`).toBeLessThan(orderBelow);
    }
  }
});

contract("168 the flock really moves, and a step costs at most 10 ms", async ({ page }) => {
  await openGpu(page);
  await page.evaluate((dt) => (window as any).__boids168.engine().advance(300, dt), DT);
  const moved = await page.evaluate(([w, h, dt]) => (window as any).__boids168.displacement(w, h, 60, dt), [GRID.width, GRID.height, DT]);
  // One second at 0.7 to 1.0 of max speed 36, less whatever turning shortens.
  expect(moved, "median distance moved in 60 steps, cells").toBeGreaterThanOrEqual(15);
  expect(moved, "median distance moved in 60 steps, cells").toBeLessThanOrEqual(36.5);
  const ms = await page.evaluate((dt) => {
    const engine = (window as any).__boids168.engine();
    engine.advance(30, dt); engine.read();
    const t0 = performance.now();
    engine.advance(300, dt); engine.read();
    return (performance.now() - t0) / 300;
  }, DT);
  expect(ms, "ms per GPU step, read back included").toBeLessThanOrEqual(10);
});

contract("168 a dropped boulder hands the flock to the CPU and clearing it hands it back", async ({ page }) => {
  await open(page, "?simulationRenderer=gpu");
  await expect.poll(() => renderer(page)).toBe("gpu-boids");
  const canvas = page.locator(".sim-view__canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await expect.poll(() => renderer(page), { message: "CPU takes over once a boulder exists" }).not.toBe("gpu-boids");
  expect(await page.evaluate(() => "boidsGpu" in (document.querySelector(".sim-view__canvas") as object))).toBe(false);
  await page.getByRole("button", { name: "Clear dropped boulders", exact: true }).click();
  await expect.poll(() => renderer(page), { message: "GPU resumes on a clear field" }).toBe("gpu-boids");
  expect(await page.evaluate(() => (window as any).__boids168.engine().count)).toBe(COUNT);
});
// AUTOMETTA-CONTRACT-END
