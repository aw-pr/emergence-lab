import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { presetsFor } from "../src/app/presets.ts";
import { qualityProfileFor } from "../src/app/qualityProfiles.ts";
import { AbelianSandpileKernel } from "../src/sims/abelian-sandpile/kernel.ts";

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/165-sandpile-device-pixel-fit.md
const contract = process.env.SANDPILE_DEFINITION === "165" ? test : test.skip;
// Grains that settle to a pile about 85% of the grid's short side.
const fit = (width: number, height: number) => Math.floor((0.85 * Math.min(width, height) / 0.73) ** 2);
const FIT: Array<[number, number, number]> = [[2880, 1800, 4392756], [810, 506, 347130], [640, 400, 216926], [96, 80, 8677], [64, 64, 5553]];
const ROUNDS: Array<[number, number]> = [[1, 1], [2001, 2], [50000, 25], [500000, 250], [2000000, 500]];
const PRESETS = [
  { id: "classic-critical", label: "Classic critical", params: { initialPile: 100000, toppleThreshold: 4, grainsPerStep: 1, topplesPerStep: 50000, fitPile: false } },
  { id: "fast-avalanches", label: "Fast avalanches", params: { initialPile: 250000, toppleThreshold: 4, grainsPerStep: 16, topplesPerStep: 150000, fitPile: false } },
  { id: "high-threshold", label: "High threshold", params: { initialPile: 350000, toppleThreshold: 8, grainsPerStep: 8, topplesPerStep: 120000, fitPile: false } },
  { id: "sandstorm", label: "Sandstorm", params: { initialPile: 15650000, toppleThreshold: 12, grainsPerStep: 1000, topplesPerStep: 2000000, fitPile: false } },
  { id: "mandala", label: "Mandala", params: { initialPile: 262144, toppleThreshold: 4, grainsPerStep: 0, topplesPerStep: 500000, fitPile: false } },
];
// First 16 hex digits of each thumbnail's sha256 on the planning base.
const THUMBNAILS: Record<string, string> = {"abelian-sandpile.png":"9d18412bc4247f41","belousov-zhabotinsky.png":"72ee5160cf55e88d","boids.png":"f905c00274111e29","brians-brain.png":"731806f656c8cfd0","burning-ship.png":"1afd0d07be39fa05","clifford-dejong__clifford.png":"b72c402c4f7a6870","clifford-dejong__dejong.png":"587f87fa36410bb5","clifford-dejong__svensson.png":"727193e8c3d2fe69","cyclic-ca.png":"08ccbdc5e06279b4","diffusion-limited-aggregation.png":"b122c5b04522035e","elementary-cellular-automata.png":"55c3f34686b810cb","game-of-life.png":"e56b26ab33989c32","gray-scott.png":"91f6312243d8f637","ising-model.png":"66ea592b8a17ff35","julia-set.png":"2e58e28bb16301c1","kuramoto-oscillators.png":"339b13ee7b93d3b1","lenia.png":"ba16d3d7c35401b1","logistic-mandelbrot.png":"4c636ef95c6d7e91","lorenz-attractor__aizawa.png":"d949ac5b29c79b42","lorenz-attractor__halvorsen.png":"e17a06c1ebda38a1","lorenz-attractor__lorenz.png":"b54cbc1211462d89","lorenz-attractor__rossler.png":"a569c25df744b822","lorenz-attractor__thomas.png":"218bf5ef1b20ec2b","mandelbrot.png":"d10d21d9bd4420bb","particle-life.png":"a91382f4b72ea49e","physarum.png":"9098919cc04310ac"};

function grainSummary(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".sim-view__canvas") as any;
    const grains: Float32Array | null = canvas?.sandpileReadGrains?.() ?? null;
    const [W, H] = (canvas?.dataset.renderSize ?? "0x0").split("x").map(Number);
    if (!grains || grains.length !== W * H) return { W, H, max: -1, sum: -1, across: -1, asymmetric: -1 };
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    let max = 0, sum = 0, minX = W, maxX = -1, asymmetric = 0;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const v = grains[y * W + x];
      if (v === 0) continue;
      max = Math.max(max, v); sum += v; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      const dx = x - cx, dy = y - cy;
      if (grains[(cy - dy) * W + (cx - dx)] !== v || grains[(cy + dx) * W + (cx + dy)] !== v) asymmetric += 1;
    }
    return { W, H, max, sum, across: maxX - minX + 1, asymmetric };
  });
}
const settle = (page: Page, timeout: number) =>
  expect.poll(async () => { const s = await grainSummary(page); return s.max >= 0 && s.max < 4; }, { timeout, intervals: [3_000] }).toBe(true);

contract("165 the fit rule and the round mapping are the published ones", async ({ page }) => {
  await page.goto("/");
  const got = await page.evaluate(async ([fits, rounds]) => {
    const model = await import(/* @vite-ignore */ "/src/sims/abelian-sandpile/model.ts");
    return [fits.map(([w, h]) => model.sandpileFitPile(w, h)), rounds.map(([t]) => model.sandpileRoundsPerStep(t))];
  }, [FIT, ROUNDS] as const);
  expect(got[0]).toEqual(FIT.map(([, , grains]) => grains));
  expect(got[1]).toEqual(ROUNDS.map(([, rounds]) => rounds));
  for (const [w, h, grains] of FIT) expect(fit(w, h)).toBe(grains);
});

contract("165 the CPU kernel fits the pile by default and keeps a fixed pile when told to", async () => {
  const kernel = new AbelianSandpileKernel();
  const defaults = Object.fromEntries(kernel.paramSchema.map((p) => [p.key, p.default]));
  expect(defaults).toEqual({ initialPile: 262144, toppleThreshold: 4, grainsPerStep: 0, topplesPerStep: 500000, fitPile: true });
  expect(kernel.paramSchema.find((p) => p.key === "fitPile")?.type).toBe("boolean");
  const across = (params: Record<string, number | boolean>) => {
    kernel.init(96, 80, { ...params, topplesPerStep: 2000000 });
    for (let i = 0; i < 400; i += 1) kernel.step(1);
    const state = kernel.readState();
    let cells = 0, minX = 96, maxX = -1;
    for (let cell = 0; cell < 96 * 80; cell += 1) if (state[cell * 2] > 0) { cells += 1; minX = Math.min(minX, cell % 96); maxX = Math.max(maxX, cell % 96); }
    return { cells, across: maxX - minX + 1 };
  };
  // 8,677 grains settle 71 cells across; 2,000 grains about 35.
  expect(across({}).across).toBe(71);
  expect(across({ fitPile: true, initialPile: 2000 }).across).toBe(71);
  const fixed = across({ fitPile: false, initialPile: 2000 });
  expect(fixed.cells).toBeGreaterThan(100);
  expect(fixed.across).toBeLessThan(45);
});

contract("165 the five presets keep their piles and switch fitting off; only the sandpile's desktop grid changes", async () => {
  expect(presetsFor("abelian-sandpile")).toEqual(PRESETS);
  const desktop = qualityProfileFor("abelian-sandpile", "grid", "desktop");
  expect(desktop.defaultPreset).toBe("extreme");
  expect(desktop.cpuFallbackPreset).toBe("balanced");
  for (const tier of ["tablet", "phone"] as const) {
    const profile = qualityProfileFor("abelian-sandpile", "grid", tier);
    expect(profile.defaultPreset, tier).toBe("balanced");
    expect(profile.cpuFallbackPreset, tier).toBeUndefined();
  }
  const others: Array<[string, "grid" | "field" | "orbit3d", string, string | undefined]> = [
    ["gray-scott", "field", "ultra", "high"], ["game-of-life", "grid", "ultra", undefined], ["cyclic-ca", "grid", "ultra", undefined],
    ["lenia", "field", "performance", undefined], ["physarum", "field", "high", undefined], ["logistic-mandelbrot", "orbit3d", "extreme", undefined],
  ];
  for (const [slug, mode, preset, fallback] of others) {
    const profile = qualityProfileFor(slug, mode, "desktop");
    expect(profile.defaultPreset, slug).toBe(preset);
    expect(profile.cpuFallbackPreset, slug).toBe(fallback);
  }
});

contract("165 a fresh load opens one cell per device pixel with the pile fitted to the screen, and it settles", async ({ page }) => {
  await page.goto("/#/abelian-sandpile");
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
  await expect(page.getByLabel("Grid quality")).toHaveValue("extreme");
  await expect(page.locator('[data-param-key="fitPile"]')).toBeChecked();
  const [renderSize, displaySize, ratio] = await canvas.evaluate((el: HTMLCanvasElement) => [el.dataset.renderSize, el.dataset.displaySize, window.devicePixelRatio]);
  expect(ratio).toBe(2);
  expect(renderSize).toBe(displaySize);
  const first = await grainSummary(page);
  expect(first.W * first.H).toBeGreaterThanOrEqual(3_000_000);
  await settle(page, 150_000);
  const settled = await grainSummary(page);
  expect(settled.sum).toBe(fit(settled.W, settled.H));
  expect(settled.across / Math.min(settled.W, settled.H)).toBeGreaterThan(0.8);
  expect(settled.across / Math.min(settled.W, settled.H)).toBeLessThan(0.9);
  expect(settled.asymmetric).toBe(0);
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
  }, (await canvas.screenshot()).toString("base64"));
  expect(colours).toBeGreaterThanOrEqual(4);

  await page.getByLabel("Kernel preset").selectOption("mandala");
  await expect(page.locator('[data-param-key="fitPile"]')).not.toBeChecked();
  await expect(page.locator('[data-param-key="initialPile"]')).toHaveValue("262144");
  await settle(page, 60_000);
  const mandala = await grainSummary(page);
  expect(mandala.sum).toBe(262144);
  expect(mandala.across).toBe(375);

  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.locator('[data-param-key="fitPile"]')).toBeChecked();
  await expect(page.getByLabel("Grid quality")).toHaveValue("extreme");
  await expect(page.getByLabel("Kernel preset")).toHaveValue("__default__");
});

contract("165 the CPU fallback opens at the Balanced grid and steps", async ({ page }) => {
  await page.goto("/?simulationRenderer=cpu#/abelian-sandpile");
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "cpu-kernel");
  await expect(page.getByLabel("Grid quality")).toHaveValue("balanced");
  await expect(page.locator('[data-param-key="fitPile"]')).toBeChecked();
  const iteration = () => page.evaluate(() => Number((document.querySelector(".controls__iteration")?.textContent ?? "0").replace(/[^0-9]/g, "")) || 0);
  const before = await iteration();
  await expect.poll(iteration, { timeout: 5_000 }).toBeGreaterThan(before);
});

contract("165 only the sandpile thumbnail is regenerated", async () => {
  const files = readdirSync("public/thumbnails").sort();
  expect(files).toEqual(Object.keys(THUMBNAILS).sort());
  for (const file of files) {
    const digest = createHash("sha256").update(readFileSync(`public/thumbnails/${file}`)).digest("hex").slice(0, 16);
    if (file === "abelian-sandpile.png") expect(digest, file).not.toBe(THUMBNAILS[file]);
    else expect(digest, file).toBe(THUMBNAILS[file]);
  }
});
// AUTOMETTA-CONTRACT-END
