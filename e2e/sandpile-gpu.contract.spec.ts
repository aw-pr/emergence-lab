import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { presetsFor } from "../src/app/presets.ts";
import { qualityProfileFor } from "../src/app/qualityProfiles.ts";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/164-sandpile-gpu-stepping.md
const contract = process.env.SANDPILE_GPU === "164" ? test : test.skip;
const KERNEL_FILE = "src/sims/abelian-sandpile/kernel.ts";
const KERNEL_SHA256 = "311d9f192ecee11e4f5e0fabaebbbcbe7b4d653f49b39e3e3ecb179acffb380c";
const PRESETS = [
  { id: "classic-critical", label: "Classic critical", params: { initialPile: 100000, toppleThreshold: 4, grainsPerStep: 1, topplesPerStep: 50000 } },
  { id: "fast-avalanches", label: "Fast avalanches", params: { initialPile: 250000, toppleThreshold: 4, grainsPerStep: 16, topplesPerStep: 150000 } },
  { id: "high-threshold", label: "High threshold", params: { initialPile: 350000, toppleThreshold: 8, grainsPerStep: 8, topplesPerStep: 120000 } },
  { id: "sandstorm", label: "Sandstorm", params: { initialPile: 15650000, toppleThreshold: 12, grainsPerStep: 1000, topplesPerStep: 2000000 } },
  { id: "mandala", label: "Mandala", params: { initialPile: 262144, toppleThreshold: 4, grainsPerStep: 0, topplesPerStep: 500000 } },
];
// Topples per step -> synchronous rounds per kernel step on the GPU path.
const ROUNDS: Array<[number, number]> = [[1, 1], [1000, 1], [2000, 1], [2001, 2], [50000, 25], [120000, 60], [150000, 75], [500000, 250], [1000000, 500], [2000000, 500]];

// Independent references, written from the rule and not from the app's code.
// fifo: sequential bulk toppling off a queue; the settled pile is order
// independent only when the threshold is a multiple of 4. sync: every unstable
// cell topples at once, the order a GPU pass has, exact at any threshold.
const REFERENCE = `
window.__sandpileRef = {
  fifo(W, H, N, T) {
    const g = new Float64Array(W * H), queued = new Uint8Array(W * H), queue = [];
    const c = Math.floor(H / 2) * W + Math.floor(W / 2);
    const push = (i) => { if (g[i] >= T && !queued[i]) { queued[i] = 1; queue.push(i); } };
    g[c] = N; push(c);
    for (let head = 0; head < queue.length; head += 1) {
      const i = queue[head]; queued[i] = 0;
      const share = Math.floor(g[i] / T) * (T / 4);
      if (share === 0) continue;
      g[i] -= share * 4;
      const x = i % W, y = (i - x) / W;
      if (x > 0) { g[i - 1] += share; push(i - 1); }
      if (x < W - 1) { g[i + 1] += share; push(i + 1); }
      if (y > 0) { g[i - W] += share; push(i - W); }
      if (y < H - 1) { g[i + W] += share; push(i + W); }
      push(i);
    }
    return g;
  },
  sync(W, H, T) {
    const min = T * Math.ceil(4 / T);
    const shed = (v) => (v >= min ? Math.floor((Math.floor(v / T) * T) / 4) : 0);
    let g = new Float64Array(W * H), next = new Float64Array(W * H);
    const c = Math.floor(H / 2) * W + Math.floor(W / 2);
    return {
      add(n) { g[c] += n; },
      rounds(count) {
        for (let r = 0; r < count; r += 1) {
          for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
            const i = y * W + x;
            let v = g[i] - 4 * shed(g[i]);
            if (x > 0) v += shed(g[i - 1]);
            if (x < W - 1) v += shed(g[i + 1]);
            if (y > 0) v += shed(g[i - W]);
            if (y < H - 1) v += shed(g[i + W]);
            next[i] = v;
          }
          const swap = g; g = next; next = swap;
        }
      },
      get grains() { return g; },
    };
  },
  differing(a, b) {
    if (!a || a.length !== b.length) return -1;
    let n = 0;
    for (let i = 0; i < b.length; i += 1) if (a[i] !== b[i]) n += 1;
    return n;
  },
  sum(a) { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i]; return s; },
  max(a) { let m = 0; for (let i = 0; i < a.length; i += 1) if (a[i] > m) m = a[i]; return m; },
};
`;

// fitPile: false keeps these fixed piles fixed once card 165 adds pile fitting.
// Opens a bare page, builds a WebGL backend on a detached canvas and exposes
// window.__sp: start(W, H, params), step(n), grains(), state(), rounds().
const HARNESS = `
window.__sandpileHarness = async () => {
  const load = (url) => import(/* @vite-ignore */ url);
  const [{ WebGLRendererBackend }, { AbelianSandpileKernel }, model] = await Promise.all([
    load("/src/app/webglRenderer.ts"),
    load("/src/sims/abelian-sandpile/kernel.ts"),
    load("/src/sims/abelian-sandpile/model.ts"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 64;
  const backend = new WebGLRendererBackend(canvas);
  const kernel = new AbelianSandpileKernel();
  let params = {};
  window.__sp = {
    canvas, backend, model, AbelianSandpileKernel,
    start(W, H, p) { params = p; backend.setGrid(W, H, kernel, "grid", p); return backend.supportsDirectRendering("grid", kernel, p); },
    step(n) { let ok = true; for (let i = 0; i < n; i += 1) ok = backend.advanceDirect(1, params) && ok; return ok; },
    grains() { return canvas.sandpileReadGrains ? canvas.sandpileReadGrains() : null; },
    state() { return canvas.sandpileReadState ? canvas.sandpileReadState() : null; },
    rounds() { return canvas.sandpileRoundCount ? canvas.sandpileRoundCount() : -1; },
  };
};
`;

async function harness(page: Page): Promise<void> {
  await page.goto("/");
  await page.addScriptTag({ content: REFERENCE });
  await page.addScriptTag({ content: HARNESS });
  await page.evaluate(() => (window as unknown as { __sandpileHarness: () => Promise<void> }).__sandpileHarness());
}

contract("164 topples per step maps to a fixed number of rounds per step", async ({ page }) => {
  await harness(page);
  const got = await page.evaluate((rows) => {
    const sp = (window as any).__sp;
    return rows.map(([topples]: [number, number]) => sp.model.sandpileRoundsPerStep(topples));
  }, ROUNDS);
  expect(got).toEqual(ROUNDS.map(([, rounds]) => rounds));
});

contract("164 the settled GPU pile is bit-identical to the reference and to the CPU kernel at thresholds 4, 8 and 12", async ({ page }) => {
  await harness(page);
  const report = await page.evaluate(() => {
    const sp = (window as any).__sp, ref = (window as any).__sandpileRef;
    // [width, height, grains, threshold]; the second case spills over the open boundary.
    const cases = [[257, 201, 65536, 4], [150, 120, 65536, 4], [200, 160, 40000, 8], [180, 180, 60000, 12]];
    return cases.map(([W, H, N, T]) => {
      const params = { initialPile: N, toppleThreshold: T, grainsPerStep: 0, topplesPerStep: 500000, fitPile: false };
      const direct = sp.start(W, H, params);
      let steps = 0, grains = sp.grains(), stepped = true;
      while (grains && ref.max(grains) >= T && steps < 4000) { stepped = sp.step(20) && stepped; steps += 20; grains = sp.grains(); }
      const expected = ref.fifo(W, H, N, T);
      const cpu = new sp.AbelianSandpileKernel();
      cpu.init(W, H, { ...params, topplesPerStep: 2000000 });
      let previous = new Float32Array(0), settled = false;
      for (let i = 0; i < 4000 && !settled; i += 1) {
        cpu.step(1);
        const now = cpu.readState();
        settled = previous.length === now.length && now.every((v: number, k: number) => v === previous[k]);
        previous = Float32Array.from(now);
      }
      const state = sp.state();
      let kernelDiff = state && state.length === previous.length ? 0 : -1, heightDiff = 0;
      if (kernelDiff === 0) for (let i = 0; i < previous.length; i += 2) {
        if (state[i] !== previous[i]) kernelDiff += 1;
        if (state[i] !== Math.fround((expected[i / 2] % T) / (T - 1))) heightDiff += 1;
      }
      return {
        label: `${W}x${H} N${N} T${T}`, direct, stepped, steps, length: grains ? grains.length : 0, cells: W * H,
        max: grains ? ref.max(grains) : -1, sum: grains ? ref.sum(grains) : -1, expectedSum: ref.sum(expected),
        differing: ref.differing(grains, expected), cpuSettled: settled, kernelDiff, heightDiff,
      };
    });
  });
  for (const row of report) {
    expect(row.direct, `${row.label} steps on the GPU`).toBe(true);
    expect(row.stepped, `${row.label} advanceDirect`).toBe(true);
    expect(row.steps, `${row.label} needed stepping`).toBeGreaterThan(0);
    expect(row.length, `${row.label} grain count length`).toBe(row.cells);
    expect(row.max, `${row.label} settled`).toBeLessThan(Number(row.label.split("T")[1]));
    expect(row.sum, `${row.label} grains`).toBe(row.expectedSum);
    expect(row.differing, `${row.label} cells differing from the reference`).toBe(0);
    expect(row.cpuSettled, `${row.label} CPU kernel settled`).toBe(true);
    expect(row.kernelDiff, `${row.label} heights differing from the CPU kernel`).toBe(0);
    expect(row.heightDiff, `${row.label} presented heights`).toBe(0);
  }
  expect(report[0].sum).toBe(65536);
  expect(report[1].sum).toBeLessThan(65536);
});

contract("164 a fed pile tracks the synchronous reference step for step at any threshold, and activity decays to zero", async ({ page }) => {
  await harness(page);
  const report = await page.evaluate(() => {
    const sp = (window as any).__sp, ref = (window as any).__sandpileRef;
    // [grains, threshold, grains per step, topples per step, rounds per step]
    const cases = [[5000, 4, 16, 50000, 25], [6000, 5, 0, 50000, 25], [9000, 3, 4, 120000, 60], [20000, 10, 7, 2000, 1]];
    const W = 96, H = 80;
    return cases.map(([N, T, feed, topples, rounds]) => {
      sp.start(W, H, { initialPile: N, toppleThreshold: T, grainsPerStep: feed, topplesPerStep: topples, fitPile: false });
      const expected = ref.sync(W, H, T);
      expected.add(N);
      const seedDiff = ref.differing(sp.grains(), expected.grains);
      const checkpoints = [];
      let done = 0, activityRange = true, activityPeak = 0;
      for (const target of [1, 10, 60]) {
        while (done < target) { sp.step(1); expected.add(feed); expected.rounds(rounds); done += 1; }
        const state = sp.state();
        if (state) for (let i = 1; i < state.length; i += 2) {
          if (!(state[i] >= 0 && state[i] <= 1)) activityRange = false;
          if (state[i] > activityPeak) activityPeak = state[i];
        }
        checkpoints.push({ step: target, differing: ref.differing(sp.grains(), expected.grains), rounds: sp.rounds(), sum: ref.sum(sp.grains() ?? []) });
      }
      return { label: `N${N} T${T} feed${feed}`, feed, N, rounds, seedDiff, checkpoints, activityRange, activityPeak };
    });
  });
  for (const row of report) {
    expect(row.seedDiff, `${row.label} seed`).toBe(0);
    expect(row.activityRange, `${row.label} activity within 0..1`).toBe(true);
    expect(row.activityPeak, `${row.label} activity seen`).toBeGreaterThan(0);
    for (const point of row.checkpoints) {
      expect(point.differing, `${row.label} step ${point.step}`).toBe(0);
      expect(point.rounds, `${row.label} round count at step ${point.step}`).toBe(point.step * row.rounds);
      expect(point.sum, `${row.label} grains at step ${point.step}`).toBe(row.N + row.feed * point.step);
    }
  }
  const quiet = await page.evaluate(() => {
    const sp = (window as any).__sp, ref = (window as any).__sandpileRef;
    sp.start(96, 80, { initialPile: 2000, toppleThreshold: 4, grainsPerStep: 0, topplesPerStep: 500000, fitPile: false });
    sp.step(10);
    const settledMax = ref.max(sp.grains() ?? [9]);
    sp.step(40);
    const state = sp.state();
    let active = state ? 0 : -1;
    if (state) for (let i = 1; i < state.length; i += 2) if (state[i] !== 0) active += 1;
    return { settledMax, active };
  });
  expect(quiet.settledMax).toBeLessThan(4);
  expect(quiet.active).toBe(0);
});

contract("164 a pointer impulse pours grains inside its disc only", async ({ page }) => {
  await harness(page);
  const report = await page.evaluate(() => {
    const sp = (window as any).__sp, ref = (window as any).__sandpileRef;
    const W = 96, H = 80, T = 4, X = 30, Y = 22, R = 6;
    sp.start(W, H, { initialPile: 0, toppleThreshold: T, grainsPerStep: 0, topplesPerStep: 2000, fitPile: false });
    const before = Float64Array.from(sp.grains() ?? []);
    const applied = sp.backend.applyDirectImpulse(X, Y, R, 1);
    const after = sp.grains();
    let outside = 0, wrong = 0, centre = -1;
    if (after) for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const d = Math.hypot(x - X, y - Y), delta = after[y * W + x] - before[y * W + x];
      if (d > R && delta !== 0) outside += 1;
      if (d <= R && Math.abs(delta - Math.round((T + 4) * (1 - d / R))) > 1) wrong += 1;
      if (x === X && y === Y) centre = delta;
    }
    return { applied, cells: before.length, outside, wrong, centre, poured: after ? ref.sum(after) - ref.sum(before) : 0 };
  });
  expect(report.applied).toBe(true);
  expect(report.cells).toBe(96 * 80);
  expect(report.outside).toBe(0);
  expect(report.wrong).toBe(0);
  expect(report.centre).toBe(8);
  expect(report.poured).toBeGreaterThan(100);
});

function grainSummary(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".sim-view__canvas") as any;
    const grains: Float32Array | null = canvas?.sandpileReadGrains?.() ?? null;
    const [W, H] = (canvas?.dataset.renderSize ?? "0x0").split("x").map(Number);
    if (!grains || grains.length !== W * H) return { max: -1, sum: -1, across: -1, asymmetric: -1, rounds: -1 };
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    let max = 0, sum = 0, minX = W, maxX = -1, asymmetric = 0;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const v = grains[y * W + x];
      if (v === 0) continue;
      max = Math.max(max, v); sum += v; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      const dx = x - cx, dy = y - cy;
      if (grains[(cy - dy) * W + (cx - dx)] !== v || grains[(cy + dx) * W + (cx + dy)] !== v) asymmetric += 1;
    }
    return { max, sum, across: maxX - minX + 1, asymmetric, rounds: canvas.sandpileRoundCount?.() ?? -1 };
  });
}

contract("164 the app steps the sandpile on the GPU, settles Mandala at the unchanged defaults and draws it", async ({ page }) => {
  await page.goto("/#/abelian-sandpile");
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-renderer", "webgl2");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
  await expect(page.getByLabel("Grid quality")).toHaveValue("balanced");
  for (const [key, value] of [["initialPile", "262144"], ["toppleThreshold", "4"], ["grainsPerStep", "0"], ["topplesPerStep", "500000"]]) {
    await expect(page.locator(`[data-param-key="${key}"]`)).toHaveValue(value);
  }
  // 2^18 grains settle to a pile 375 cells across (measured independently, 2026-11-11).
  await expect.poll(async () => (await grainSummary(page)).max, { timeout: 30_000 }).toBeLessThan(4);
  const settled = await grainSummary(page);
  expect(settled.max).toBeGreaterThan(0);
  expect(settled.sum).toBe(262144);
  expect(settled.across).toBe(375);
  expect(settled.asymmetric).toBe(0);
  expect(settled.rounds).toBeGreaterThanOrEqual(49000);
  const shot = (await canvas.screenshot()).toString("base64");
  const colours = await page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width; c.height = image.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const side = Math.floor(Math.min(image.width, image.height) / 3);
    const data = ctx.getImageData(Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2), side, side).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  }, shot);
  expect(colours).toBeGreaterThanOrEqual(4);

  await page.getByLabel("Kernel preset").selectOption("classic-critical");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
  const before = (await grainSummary(page)).rounds;
  await expect.poll(async () => (await grainSummary(page)).rounds, { timeout: 5_000 }).toBeGreaterThan(Math.max(0, before));

  await page.goto("/#/gray-scott");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
  expect(await page.evaluate(() => typeof (document.querySelector(".sim-view__canvas") as any).sandpileReadGrains)).toBe("undefined");
});

contract("164 the CPU kernel still steps the sandpile when the GPU path is switched off", async ({ page }) => {
  await page.goto("/?simulationRenderer=cpu#/abelian-sandpile");
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-renderer", "webgl2");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "cpu-kernel");
  await expect(page.getByLabel("Grid quality")).toHaveValue("balanced");
  const iteration = () => page.evaluate(() => Number((document.querySelector(".controls__iteration")?.textContent ?? "0").replace(/[^0-9]/g, "")) || 0);
  const before = await iteration();
  await expect.poll(iteration, { timeout: 5_000 }).toBeGreaterThan(before);
  expect(await page.evaluate(() => typeof (document.querySelector(".sim-view__canvas") as any).sandpileReadGrains)).toBe("undefined");
});

contract("164 the CPU kernel file, the five presets and the default grid are unchanged", async () => {
  expect(createHash("sha256").update(readFileSync(KERNEL_FILE)).digest("hex")).toBe(KERNEL_SHA256);
  expect(presetsFor("abelian-sandpile")).toEqual(PRESETS);
  for (const tier of ["desktop", "tablet", "phone"] as const) {
    const profile = qualityProfileFor("abelian-sandpile", "grid", tier);
    expect(profile.defaultPreset, tier).toBe("balanced");
    expect(profile.cpuFallbackPreset, tier).toBeUndefined();
  }
});
// AUTOMETTA-CONTRACT-END
