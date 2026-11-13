import { openControls } from "./harness/controls.ts";
import { expect, test, type Page } from "@playwright/test";

/**
 * Gray-Scott steps GPU-resident in the WebGL2 backend when float render
 * targets exist, and on the CPU kernel otherwise. These tests prove which path
 * ran (a silent CPU fallback fails them), that the GPU field tracks the CPU
 * kernel, and, with GS_GPU_PERF=1, what a frame costs at the ultra grid.
 *
 * Run: npx playwright test --config e2e/gray-scott-gpu.config.ts e2e/gray-scott-gpu.spec.ts
 */

const PERF_DIR = "e2e/artifacts/gray-scott-gpu";

function readIterations(page: Page): Promise<number> {
  return page.evaluate(() => {
    const text = document.querySelector(".controls__iteration")?.textContent ?? "iter 0";
    return Number(text.replace(/[^0-9]/g, "")) || 0;
  });
}

async function expectStepping(page: Page): Promise<void> {
  const before = await readIterations(page);
  await expect.poll(() => readIterations(page), { timeout: 5_000 }).toBeGreaterThan(before);
}

function passCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector(".sim-view__canvas") as
      | (HTMLCanvasElement & { grayScottPassCount?: () => number })
      | null;
    return canvas?.grayScottPassCount?.() ?? -1;
  });
}

async function skipWithoutWebgl2(page: Page): Promise<void> {
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-renderer", /webgl2|canvas2d/);
  test.skip(
    (await canvas.getAttribute("data-renderer")) !== "webgl2",
    "the GPU path needs a WebGL2 backend",
  );
}

async function skipWithoutFloatTargets(page: Page): Promise<void> {
  test.skip(!(await floatTargetsAvailable(page)), "the GPU path needs WebGL2 float render targets");
}

async function floatTargetsAvailable(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      !!document
        .createElement("canvas")
        .getContext("webgl2")
        ?.getExtension("EXT_color_buffer_float"),
  );
}

async function expectGpuResident(page: Page): Promise<void> {
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-ping-pong");
  const before = await passCount(page);
  expect(before).toBeGreaterThanOrEqual(0);
  await expect.poll(() => passCount(page), { timeout: 5_000 }).toBeGreaterThan(before);
  await expectStepping(page);
}

test("gray-scott steps GPU-resident on webgl2", async ({ page }) => {
  await page.goto("/#/gray-scott");
  await skipWithoutWebgl2(page);
  expect(await floatTargetsAvailable(page), "EXT_color_buffer_float").toBe(true);
  const canvas = page.locator(".sim-view__canvas");
  await expectGpuResident(page);

  await openControls(page);
  await page.getByLabel("Kernel preset").selectOption("waves");
  await expectGpuResident(page);

  // The GPU path makes the ultra grid the desktop default.
  await expect(page.getByLabel("Grid quality")).toHaveValue("ultra");
  await page.getByLabel("Grid quality").selectOption("ultra");
  await expectGpuResident(page);
  const [width, height] = ((await canvas.getAttribute("data-render-size")) ?? "0x0")
    .split("x")
    .map(Number);
  expect(width * height).toBeGreaterThanOrEqual(1_500_000);

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expectGpuResident(page);

  await page.locator('[data-param-key="F"]').fill("0.03");
  await expectGpuResident(page);

  await page.goto("/#/kuramoto-oscillators");
  await expect(page.locator(".sim-view__canvas")).toHaveAttribute(
    "data-simulation-renderer",
    "gpu-ping-pong",
  );
  await page.goto("/#/gray-scott");
  await expectGpuResident(page);
});

test("CPU fallbacks keep stepping", async ({ page }) => {
  await page.goto("/?simulationRenderer=cpu#/gray-scott");
  await skipWithoutWebgl2(page);
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "cpu-kernel");
  await expectStepping(page);
  expect(await passCount(page)).toBe(-1);
  // Without GPU stepping the ultra default gives way to the CPU grid.
  await expect(page.getByLabel("Grid quality")).toHaveValue("high");

  await page.goto("/?simulationRenderer=cpu#/kuramoto-oscillators");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "cpu-kernel");
  await expectStepping(page);

  await page.addInitScript(() => {
    const getExtension = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (
      this: WebGL2RenderingContext,
      name: string,
    ) {
      return name === "EXT_color_buffer_float" ? null : getExtension.call(this, name);
    } as typeof getExtension;
  });
  await page.goto("/#/gray-scott");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "cpu-kernel");
  await expectStepping(page);
  await expect(page.getByLabel("Grid quality")).toHaveValue("high");
  const [width, height] = ((await canvas.getAttribute("data-render-size")) ?? "0x0")
    .split("x")
    .map(Number);
  expect(width * height).toBeGreaterThan(100_000);
});

interface ParityReport {
  seedMaxAbs: number;
  ultraSeedMaxAbs: number;
  impulse: { changedCpu: number; changedGpu: number; changedMismatch: number; maxAbs: number };
  stepping: Array<{
    label: string;
    after1: { maxAbs: number; rms: number };
    after10: { maxAbs: number; rms: number };
  }>;
  longHorizon: { maxAbs: number; rms: number; meanVDelta: number; coverageDelta: number };
  passAccounting: { sevenHalf: number; sevenHalfMaxAbs: number; capped: number; zero: number; zeroReturned: boolean };
  releasedOnKuramoto: boolean;
}

// Measured on an Apple M-series GPU through ANGLE/Metal, 200x136, Waves and
// Mitosis, both stencils, dt 1 and 1/4: after 10 steps (200 to 800 passes)
// max |GPU - CPU| <= 1.5e-6 and RMS <= 2.1e-7; after 100 Waves steps (2,000
// passes) max 5.8e-5, RMS 6e-6, mean V within 1.2e-8, coverage identical.
// The bounds leave roughly a 5-20x margin. A wrong wrap, diagonal weight or
// row order shows up at 1e-3 or more within 20 passes. The reaction amplifies
// fp32 rounding, so field-level agreement is only claimed to 2,000 passes.
const STEP_MAX_ABS = 1e-5;
const STEP_RMS = 1e-6;
const LONG_MAX_ABS = 1e-3;
const LONG_MEAN_V = 1e-5;
const LONG_COVERAGE = 1e-3;

test("GPU field matches the CPU kernel", async ({ page }) => {
  await page.goto("/");
  await skipWithoutFloatTargets(page);
  const report: ParityReport = await page.evaluate(async () => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const [{ WebGLRendererBackend }, { GrayScottKernel }, { KuramotoOscillatorsKernel }, { presetsFor }] =
      await Promise.all([
        load("/src/app/webglRenderer.ts"),
        load("/src/sims/gray-scott/kernel.ts"),
        load("/src/sims/kuramoto-oscillators/kernel.ts"),
        load("/src/app/presets.ts"),
      ]);
    type Diagnostic = HTMLCanvasElement & {
      grayScottReadState?: (x?: number, y?: number, w?: number, h?: number) => Float32Array | null;
      grayScottPassCount?: () => number;
    };
    const canvas = document.createElement("canvas") as Diagnostic;
    canvas.width = 64;
    canvas.height = 64;
    const backend = new WebGLRendererBackend(canvas);
    const gate = new GrayScottKernel();
    const width = 200;
    const height = 136;

    const compare = (gpu: Float32Array, cpu: Float32Array) => {
      let maxAbs = 0;
      let sumSq = 0;
      for (let i = 0; i < cpu.length; i += 1) {
        const d = Math.abs(gpu[i] - cpu[i]);
        if (!(d <= maxAbs)) maxAbs = d;
        sumSq += d * d;
      }
      return { maxAbs, rms: Math.sqrt(sumSq / cpu.length) };
    };
    const start = (params: Record<string, unknown>, w = width, h = height) => {
      backend.setGrid(w, h, gate, "field", params);
      const cpu = new GrayScottKernel();
      cpu.init(w, h, params);
      return cpu;
    };
    const gpuState = () => canvas.grayScottReadState!()!;
    const presetParams = (id: string) =>
      presetsFor("gray-scott").find((preset: { id: string }) => preset.id === id).params;

    const seedCpu = start({});
    const seedMaxAbs = compare(gpuState(), seedCpu.readState()).maxAbs;
    const ultraCpu = start({}, 1280, 1280);
    const ultraSeedMaxAbs = compare(gpuState(), ultraCpu.readState()).maxAbs;

    const impulses: Array<[number, number, number, number]> = [
      [0, 0, 6, 1],
      [199.4, 135.6, 9, 0.6],
      [100.5, 67.5, 5.4, 1],
      [-3, 70, 8, 1],
    ];
    const impulseCpu = start({});
    const seeded = Float32Array.from(impulseCpu.readState());
    for (const [x, y, r, s] of impulses) {
      impulseCpu.applyImpulse(x, y, r, s);
      backend.applyDirectImpulse(x, y, r, s);
    }
    const afterCpu = impulseCpu.readState();
    const afterGpu = gpuState();
    let changedCpu = 0;
    let changedGpu = 0;
    let changedMismatch = 0;
    for (let i = 0; i < seeded.length; i += 1) {
      const cpuChanged = afterCpu[i] !== seeded[i];
      const gpuChanged = afterGpu[i] !== seeded[i];
      if (cpuChanged) changedCpu += 1;
      if (gpuChanged) changedGpu += 1;
      if (cpuChanged !== gpuChanged && Math.abs(afterGpu[i] - afterCpu[i]) > 1e-6) {
        changedMismatch += 1;
      }
    }
    const impulse = {
      changedCpu,
      changedGpu,
      changedMismatch,
      maxAbs: compare(afterGpu, afterCpu).maxAbs,
    };

    const stepping = [];
    for (const preset of ["waves", "mitosis"]) {
      for (const stencil of ["nine-point", "five-point"]) {
        for (const dt of [1, 0.25]) {
          const params = { ...presetParams(preset), stencil, dt, stepsPerFrame: 20 };
          const cpu = start(params);
          for (const [x, y, r, s] of impulses) {
            cpu.applyImpulse(x, y, r, s);
            backend.applyDirectImpulse(x, y, r, s);
          }
          backend.advanceDirect(1, params);
          cpu.step(1);
          const after1 = compare(gpuState(), cpu.readState());
          for (let i = 0; i < 9; i += 1) {
            backend.advanceDirect(1, params);
            cpu.step(1);
          }
          const after10 = compare(gpuState(), cpu.readState());
          stepping.push({ label: `${preset}/${stencil}/dt=${dt}`, after1, after10 });
        }
      }
    }

    const longParams = { ...presetParams("waves"), stencil: "nine-point", dt: 1, stepsPerFrame: 20 };
    const longCpu = start(longParams);
    for (let i = 0; i < 100; i += 1) {
      backend.advanceDirect(1, longParams);
      longCpu.step(1);
    }
    const longGpuState = gpuState();
    const longCpuState = longCpu.readState();
    const stats = (state: Float32Array) => {
      let sumV = 0;
      let covered = 0;
      for (let i = 1; i < state.length; i += 2) {
        sumV += state[i];
        if (state[i] > 0.1) covered += 1;
      }
      const cells = state.length / 2;
      return { meanV: sumV / cells, coverage: covered / cells };
    };
    const longGpuStats = stats(longGpuState);
    const longCpuStats = stats(longCpuState);
    const longHorizon = {
      ...compare(longGpuState, longCpuState),
      meanVDelta: Math.abs(longGpuStats.meanV - longCpuStats.meanV),
      coverageDelta: Math.abs(longGpuStats.coverage - longCpuStats.coverage),
    };

    const sevenHalfParams = { stepsPerFrame: 7, dt: 0.5 };
    const sevenHalfCpu = start(sevenHalfParams);
    backend.advanceDirect(3, sevenHalfParams);
    for (let i = 0; i < 3; i += 1) sevenHalfCpu.step(1);
    const sevenHalf = canvas.grayScottPassCount!();
    const sevenHalfMaxAbs = compare(gpuState(), sevenHalfCpu.readState()).maxAbs;
    const cappedParams = { stepsPerFrame: 60, dt: 0.125 };
    start(cappedParams, 32, 32);
    backend.advanceDirect(5, cappedParams);
    const capped = canvas.grayScottPassCount!();
    start(sevenHalfParams, 32, 32);
    const zeroReturned = backend.advanceDirect(0, sevenHalfParams);
    const zero = canvas.grayScottPassCount!();

    backend.setGrid(32, 32, new KuramotoOscillatorsKernel(), "field", {});
    const releasedOnKuramoto = canvas.grayScottReadState === undefined;
    backend.destroy();
    return {
      seedMaxAbs,
      ultraSeedMaxAbs,
      impulse,
      stepping,
      longHorizon,
      passAccounting: { sevenHalf, sevenHalfMaxAbs, capped, zero, zeroReturned },
      releasedOnKuramoto,
    };
  });

  test.info().annotations.push({ type: "parity", description: JSON.stringify(report) });
  console.log(JSON.stringify(report, null, 2));

  expect(report.seedMaxAbs).toBe(0);
  expect(report.ultraSeedMaxAbs).toBe(0);
  expect(report.impulse.changedCpu).toBeGreaterThan(0);
  expect(report.impulse.changedMismatch).toBe(0);
  expect(report.impulse.maxAbs).toBeLessThanOrEqual(1e-6);
  for (const row of report.stepping) {
    expect(row.after1.maxAbs, `${row.label} after 1 step`).toBeLessThanOrEqual(STEP_MAX_ABS);
    expect(row.after1.rms, `${row.label} after 1 step`).toBeLessThanOrEqual(STEP_RMS);
    expect(row.after10.maxAbs, `${row.label} after 10 steps`).toBeLessThanOrEqual(STEP_MAX_ABS);
    expect(row.after10.rms, `${row.label} after 10 steps`).toBeLessThanOrEqual(STEP_RMS);
  }
  expect(report.longHorizon.maxAbs).toBeLessThanOrEqual(LONG_MAX_ABS);
  expect(report.longHorizon.meanVDelta).toBeLessThanOrEqual(LONG_MEAN_V);
  expect(report.longHorizon.coverageDelta).toBeLessThanOrEqual(LONG_COVERAGE);
  expect(report.passAccounting.sevenHalf).toBe(42);
  expect(report.passAccounting.sevenHalfMaxAbs).toBeLessThanOrEqual(STEP_MAX_ABS);
  expect(report.passAccounting.capped).toBe(960);
  expect(report.passAccounting.zero).toBe(0);
  expect(report.passAccounting.zeroReturned).toBe(true);
  expect(report.releasedOnKuramoto).toBe(true);
});

interface FrameTiming {
  medianMs: number;
  p95Ms: number;
  fps: string;
  renderSize: string;
  simulationRenderer: string | null;
}

async function measureAppFrames(page: Page, url: string, frames: number): Promise<FrameTiming> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("el:resolution:gray-scott", "ultra");
    } catch {
      // Storage can be unavailable; the select below still sets ultra.
    }
  });
  await page.goto(url);
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-renderer", "webgl2");
  await openControls(page);
  await page.getByLabel("Grid quality").selectOption("ultra");
  await page.getByLabel("Kernel preset").selectOption("waves");
  const intervals: number[] = await page.evaluate(
    (count) =>
      new Promise<number[]>((resolve) => {
        const stamps: number[] = [];
        const warmup = Math.min(30, count);
        const tick = (now: number) => {
          stamps.push(now);
          if (stamps.length < warmup + count + 1) requestAnimationFrame(tick);
          else resolve(stamps.slice(warmup + 1).map((t, i) => t - stamps[warmup + i]));
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );
  const sorted = [...intervals].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    fps: (await page.locator(".controls__fps").textContent()) ?? "",
    renderSize: (await canvas.getAttribute("data-render-size")) ?? "",
    simulationRenderer: await canvas.getAttribute("data-simulation-renderer"),
  };
}

test("frame time at ultra", async ({ page }, testInfo) => {
  test.skip(process.env.GS_GPU_PERF !== "1", "set GS_GPU_PERF=1 to measure");
  await page.goto("/");
  await skipWithoutFloatTargets(page);
  const gpuStep = await page.evaluate(async () => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const [{ WebGLRendererBackend }, { GrayScottKernel }, { presetsFor }] = await Promise.all([
      load("/src/app/webglRenderer.ts"),
      load("/src/sims/gray-scott/kernel.ts"),
      load("/src/app/presets.ts"),
    ]);
    const params = {
      ...presetsFor("gray-scott").find((preset: { id: string }) => preset.id === "waves").params,
      stencil: "nine-point",
    };
    const canvas = document.createElement("canvas") as HTMLCanvasElement & {
      grayScottReadState?: (x?: number, y?: number, w?: number, h?: number) => Float32Array | null;
    };
    const backend = new WebGLRendererBackend(canvas);
    const gate = new GrayScottKernel();
    const msPerStep = (size: number) => {
      backend.setGrid(size, size, gate, "field", params);
      for (let i = 0; i < 10; i += 1) backend.advanceDirect(1, params);
      canvas.grayScottReadState!(0, 0, 1, 1);
      const started = performance.now();
      for (let i = 0; i < 30; i += 1) backend.advanceDirect(1, params);
      canvas.grayScottReadState!(0, 0, 1, 1);
      return (performance.now() - started) / 30;
    };
    const runs = [0, 1, 2].map(() => ({ ultra: msPerStep(1280), high: msPerStep(960) }));
    backend.destroy();
    const cpu = new GrayScottKernel();
    cpu.init(1280, 1280, params);
    cpu.step(1);
    const started = performance.now();
    for (let i = 0; i < 3; i += 1) cpu.step(1);
    const cpuUltra = (performance.now() - started) / 3;
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1];
    return {
      gpuUltraMs: median(runs.map((run) => run.ultra)),
      gpuHighMs: median(runs.map((run) => run.high)),
      cpuUltraMs: cpuUltra,
    };
  });

  const gpuFrames = await measureAppFrames(page, "/#/gray-scott", 120);
  const cpuFrames = await measureAppFrames(page, "/?simulationRenderer=cpu#/gray-scott", 10);
  const result = { gpuStep, gpuFrames, cpuFrames };
  console.log(JSON.stringify(result, null, 2));
  testInfo.annotations.push({ type: "perf", description: JSON.stringify(result) });
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(PERF_DIR, { recursive: true });
  writeFileSync(`${PERF_DIR}/perf.json`, `${JSON.stringify(result, null, 2)}\n`);

  expect(gpuFrames.simulationRenderer).toBe("gpu-ping-pong");
  expect(cpuFrames.simulationRenderer).toBe("cpu-kernel");
  expect(gpuStep.cpuUltraMs / gpuStep.gpuUltraMs).toBeGreaterThanOrEqual(20);
});
