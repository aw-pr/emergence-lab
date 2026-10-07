/**
 * Logistic-Mandelbrot packed orbit cloud: integration evidence for stage 103
 * criteria 2-9 (docs/stages/103-logistic-mandelbrot-packed-cells.md).
 *
 *   npx playwright test e2e/packed-cells.spec.ts --workers=1
 *
 * Describe titles match the card's --grep keys: base grid, plane coverage,
 * refinement capacity, plotted, shader contract, brightness, prebaked, cost,
 * evidence. Criteria that name the served baseline read the unchanged tree
 * on port 5174 (docs/audits/100-inside-out-spread-colouring.md, "Serving the
 * baseline"); a missing baseline fails them. Artefacts land under
 * e2e/artifacts/packed-cells/ (git-ignored).
 */
import { chromium, test, expect, type Page } from "@playwright/test";
import playwrightConfig from "../playwright.config.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  complexSqrt,
  frameTiming,
  frozenParams,
  probeShaderColours,
  projectToCanvas,
  setParam,
  type FrameTiming,
  type ShaderProbeCase,
  type SimParams,
} from "./harness/insideOut.ts";
import {
  BASELINE_ORIGIN,
  CURRENT_ORIGIN,
  PACKED_ARTIFACT_DIR,
  PRESET_TARGETS,
  cloudStats,
  dollyAt,
  elpcHeader,
  litFraction,
  mainThreadLoad,
  meanLuma,
  median,
  openPacked,
  screenshot,
  topDown,
  type CloudStats,
  type MainThreadLoad,
  type PixelRect,
  type ResolutionPreset,
} from "./harness/packedCells.ts";

const VIEWPORT = { width: 1280, height: 720 };
const SAMPLES = 8;
/**
 * The cardioid pose: the camera tilted to its top-down clamp, then dollied
 * at the viewport centre, which the default orbit target puts over the
 * cardioid interior at c = (-0.5, 0), deep enough that the sample lattice
 * resolves at splat growth 0 (a 240 px square spans about 0.1 c-units
 * there). The lit fraction is measured in that square around the centre.
 */
const CARDIOID_C = { re: -0.5, im: 0 };
const CARDIOID_DOLLY_STEPS = Number(process.env.PACKED_CELLS_POSE_STEPS ?? 40);
const CARDIOID_RECT_SIZE = 240;
/**
 * 8-bit luma above which a pixel counts as lit. Splats are about 2 px at a
 * 1280 px viewport and the extreme lattice pitch is about 3 px at the zoom
 * clamp, so the haze between splats stays under this and only splat cores
 * count; thinning the grid then removes cores in proportion.
 */
const LIT_THRESHOLD = Number(process.env.PACKED_CELLS_LIT_THRESHOLD ?? 40);
/** A patch of the chaotic band near the real axis, in the default pose. */
const CHAOTIC_C = { re: -1.78, im: 0 };
const CHAOTIC_RECT = { width: 60, height: 160 };

test.use({ viewport: VIEWPORT });

function artifact(name: string): string {
  mkdirSync(PACKED_ARTIFACT_DIR, { recursive: true });
  return `${PACKED_ARTIFACT_DIR}/${name}`;
}

function saveJson(name: string, value: unknown): void {
  writeFileSync(artifact(name), JSON.stringify(value, null, 2));
}

/** Re(z*) of the attracting fixed point: the period-1 sheet height at c. */
function period1Height(re: number, im: number): number {
  const [sr] = complexSqrt(1 - 4 * re, -4 * im);
  return (1 - sr) / 2;
}

const cloudParams = (overrides: SimParams = {}): SimParams =>
  frozenParams({ boundaryDetail: 0, tailRefinement: 0, ...overrides });

async function requireBaseline(page: Page): Promise<void> {
  const response = await page.request.get(`${BASELINE_ORIGIN}/`, { timeout: 5000 }).catch(() => null);
  expect(
    response?.ok() ?? false,
    `no unchanged baseline served at ${BASELINE_ORIGIN} (see docs/audits/100-inside-out-spread-colouring.md, "Serving the baseline")`,
  ).toBe(true);
}

/** Dolly into the cardioid pose and return the measurement rectangle. */
async function cardioidPose(
  page: Page,
  canvas: ReturnType<Page["locator"]>,
): Promise<{ rect: PixelRect; distance: number; azimuth: number; pointer: { x: number; y: number } }> {
  const box = (await canvas.boundingBox())!;
  await topDown(page, canvas);
  const target = { x: box.width / 2, y: box.height / 2 };
  const pose = await dollyAt(page, canvas, target.x, target.y, CARDIOID_DOLLY_STEPS);
  return {
    rect: {
      x: target.x - CARDIOID_RECT_SIZE / 2,
      y: target.y - CARDIOID_RECT_SIZE / 2,
      width: CARDIOID_RECT_SIZE,
      height: CARDIOID_RECT_SIZE,
    },
    ...pose,
    pointer: target,
  };
}

test.describe("base grid", () => {
  const CASES: Array<{ path: "gpu" | "cpu"; preset: ResolutionPreset }> = [
    { path: "gpu", preset: "extreme" },
    { path: "gpu", preset: "ultra" },
    { path: "cpu", preset: "balanced" },
    { path: "cpu", preset: "ultra" },
  ];
  for (const { path, preset } of CASES) {
    test(`${path} ${preset}: the base grid covers the candidate pool at every tail refinement`, async ({ page }) => {
      test.setTimeout(1_500_000);
      const rows: Array<{ tailRefinement: number; buildMs: number } & CloudStats> = [];
      for (const tailRefinement of [0, 0.3, 0.6]) {
        const { canvas, buildMs } = await openPacked(page, {
          params: cloudParams({ tailRefinement }),
          preset,
          cpu: path === "cpu",
          timeoutMs: 1_200_000,
        });
        const stats = await cloudStats(canvas);
        rows.push({ tailRefinement, buildMs, ...stats });
        expect(stats.sampler).toBe(path === "cpu" ? "cpu-sampled" : "gpu-sampled");
        expect(stats.layout).toBe("packed");
        expect(stats.points).toBeLessThanOrEqual(stats.pointBudget);
        expect(stats.baseCells).toBe(stats.boundedCandidates);
        expect(Math.abs(stats.candidateCells / PRESET_TARGETS[preset] - 1)).toBeLessThanOrEqual(0.02);
        expect(stats.points).toBe(stats.slots * SAMPLES);
      }
      saveJson(`base-grid-${path}-${preset}.json`, rows);
      console.log(`base grid ${path} ${preset}: ${JSON.stringify(rows.map((r) => ({ t: r.tailRefinement, base: r.baseCells, refined: r.refinedSubCells, points: r.points, ms: r.buildMs })))}`);
      const [at0, at3, at6] = rows;
      expect(Math.abs(at3.baseCells / at0.baseCells - 1)).toBeLessThanOrEqual(0.005);
      expect(Math.abs(at6.baseCells / at0.baseCells - 1)).toBeLessThanOrEqual(0.005);
      // Re-brief 1 withdrew "larger at 0.6 than at 0.3": both trees refine
      // every candidate cell at every preset, so freed budget cannot raise
      // the count. Non-decreasing from 0 to 0.3 to 0.6 stands.
      expect(at3.refinedSubCells).toBeGreaterThanOrEqual(at0.refinedSubCells);
      expect(at6.refinedSubCells).toBeGreaterThanOrEqual(at3.refinedSubCells);
    });
  }
});

test.describe("plane coverage", () => {
  test("the cardioid lattice keeps its density at tail refinement 0.6 on both live paths, and thins on the baseline", async ({ page }) => {
    test.setTimeout(1_500_000);
    await requireBaseline(page);
    const measure = async (
      origin: string,
      label: string,
      preset: ResolutionPreset,
      cpu: boolean,
      tailRefinement: number,
    ) => {
      const { canvas } = await openPacked(page, {
        origin,
        params: cloudParams({ tailRefinement }),
        preset,
        cpu,
        timeoutMs: 1_200_000,
      });
      const pose = await cardioidPose(page, canvas);
      const image = await screenshot(canvas, artifact(`plane-${label}-tail${tailRefinement}.png`));
      const fraction = litFraction(image, pose.rect, LIT_THRESHOLD);
      const stats = await cloudStats(canvas);
      return { label, tailRefinement, fraction, pose: { distance: pose.distance, azimuth: pose.azimuth, rect: pose.rect }, points: stats.points, baseCells: stats.baseCells, candidateCells: stats.candidateCells };
    };
    const gpu0 = await measure(CURRENT_ORIGIN, "current-gpu-extreme", "extreme", false, 0);
    const gpu6 = await measure(CURRENT_ORIGIN, "current-gpu-extreme", "extreme", false, 0.6);
    const base0 = await measure(BASELINE_ORIGIN, "baseline-gpu-extreme", "extreme", false, 0);
    const base6 = await measure(BASELINE_ORIGIN, "baseline-gpu-extreme", "extreme", false, 0.6);
    const cpu3 = await measure(CURRENT_ORIGIN, "current-cpu-ultra", "ultra", true, 0.3);
    const cpu6 = await measure(CURRENT_ORIGIN, "current-cpu-ultra", "ultra", true, 0.6);
    const report = { steps: CARDIOID_DOLLY_STEPS, litThreshold: LIT_THRESHOLD, target: CARDIOID_C, gpu0, gpu6, base0, base6, cpu3, cpu6 };
    saveJson("plane-coverage.json", report);
    console.log(`plane coverage: ${JSON.stringify(report)}`);
    for (const lower of [gpu0, base0, cpu3]) {
      expect(lower.fraction, `${lower.label} lattice resolved`).toBeGreaterThanOrEqual(0.15);
      expect(lower.fraction, `${lower.label} lattice resolved`).toBeLessThanOrEqual(0.6);
    }
    expect(Math.abs(gpu6.fraction / gpu0.fraction - 1), "GPU extreme 0.6 vs 0").toBeLessThanOrEqual(0.02);
    expect(Math.abs(cpu6.fraction / cpu3.fraction - 1), "CPU ultra 0.6 vs 0.3").toBeLessThanOrEqual(0.02);
    expect(base6.fraction / base0.fraction, "baseline thins at 0.6").toBeLessThan(0.8);
  });
});

test.describe("refinement capacity", () => {
  test("boundary detail holds at least the baseline's refined sub-cells at every preset; all presets tabulated", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const presets: ResolutionPreset[] = ["performance", "balanced", "high", "ultra", "extreme"];
    const rows: Array<Record<string, number | string>> = [];
    for (const preset of presets) {
      const current = await openPacked(page, { params: cloudParams({ boundaryDetail: 1 }), preset, timeoutMs: 600_000 });
      const stats = await cloudStats(current.canvas);
      const baseline1 = await openPacked(page, { origin: BASELINE_ORIGIN, params: cloudParams({ boundaryDetail: 1 }), preset, timeoutMs: 600_000 });
      const baselineDetail = await cloudStats(baseline1.canvas);
      const baseline0 = await openPacked(page, { origin: BASELINE_ORIGIN, params: cloudParams({ boundaryDetail: 0 }), preset, timeoutMs: 600_000 });
      const baselinePlain = await cloudStats(baseline0.canvas);
      const baselineRefined = baselineDetail.points / SAMPLES - baselinePlain.points / SAMPLES;
      rows.push({
        preset,
        currentRefinedSubCells: stats.refinedSubCells,
        currentPoints: stats.points,
        currentBuildMs: current.buildMs,
        baselineRefinedSubCells: baselineRefined,
        baselinePointsDetail1: baselineDetail.points,
        baselinePointsDetail0: baselinePlain.points,
        baselineBuildMs: baseline1.buildMs,
        ratio: stats.refinedSubCells / Math.max(1, baselineRefined),
      });
      console.log(`refinement capacity ${preset}: ${JSON.stringify(rows[rows.length - 1])}`);
    }
    saveJson("refinement-capacity.json", rows);
    // Re-brief 1: the baseline already refines every candidate (it was never
    // capacity-bound), so the bar is a ratio of at least 1.00 at every preset.
    for (const row of rows) {
      expect(Number(row.ratio), `${row.preset} refined sub-cells vs baseline`).toBeGreaterThanOrEqual(1.0);
    }
  });
});

test.describe("plotted", () => {
  test("Plotted iterations hides rows in the shader and density leaves the visible count alone", async ({ page }) => {
    test.setTimeout(600_000);
    const { canvas } = await openPacked(page, { params: cloudParams({ tailRefinement: 0.3, plottedIterations: 8 }), preset: "extreme" });
    const at8 = await cloudStats(canvas);
    expect(at8.layout).toBe("packed");
    expect(at8.visiblePoints).toBe(at8.baseRows + at8.refinedRows);
    expect(at8.points).toBe(at8.slots * SAMPLES);
    await setParam(page, "plottedIterations", 1);
    await expect(page.locator('[data-param-key="plottedIterations"]')).toHaveValue("1");
    await page.waitForTimeout(500);
    const at1 = await cloudStats(canvas);
    expect(at1.points).toBe(at8.points);
    expect(at1.visiblePoints).toBe(at1.baseCells + at1.refinedSubCells);
    expect(at1.visiblePoints).toBeLessThan(at8.visiblePoints);

    // Chaotic band in the default pose: one point per cell at plotted 1.
    const box = (await canvas.boundingBox())!;
    const chaotic = await projectToCanvas(page, CHAOTIC_C.re, CHAOTIC_C.im, 0, box.width, box.height);
    const chaoticRect: PixelRect = {
      x: chaotic.x - CHAOTIC_RECT.width / 2,
      y: chaotic.y - CHAOTIC_RECT.height / 2,
      width: CHAOTIC_RECT.width,
      height: CHAOTIC_RECT.height,
    };
    const chaotic1 = litFraction(await screenshot(canvas, artifact("plotted-chaotic-plotted1.png")), chaoticRect);
    await setParam(page, "plottedIterations", 8);
    await page.waitForTimeout(500);
    const chaotic8 = litFraction(await screenshot(canvas, artifact("plotted-chaotic-plotted8.png")), chaoticRect);

    // Cardioid in the criterion-3 pose: the same points at plotted 1 and 8.
    const pose = await cardioidPose(page, canvas);
    const cardioid8 = litFraction(await screenshot(canvas, artifact("plotted-cardioid-plotted8.png")), pose.rect, LIT_THRESHOLD);
    await setParam(page, "plottedIterations", 1);
    await page.waitForTimeout(500);
    const cardioid1 = litFraction(await screenshot(canvas, artifact("plotted-cardioid-plotted1.png")), pose.rect, LIT_THRESHOLD);
    const visibleAt1 = (await cloudStats(canvas)).visiblePoints;
    await setParam(page, "pointDensity", 0.5);
    await expect(page.locator('[data-param-key="pointDensity"]')).toHaveValue("0.5");
    await page.waitForTimeout(500);
    const dense = await cloudStats(canvas);
    const report = { at8, at1, chaoticRect, chaotic1, chaotic8, cardioidRect: pose.rect, pose: { distance: pose.distance, azimuth: pose.azimuth }, cardioid1, cardioid8, visibleAtDensityHalf: dense.visiblePoints };
    saveJson("plotted.json", report);
    console.log(`plotted: ${JSON.stringify({ chaotic1, chaotic8, cardioid1, cardioid8, visible1: at1.visiblePoints, visible8: at8.visiblePoints })}`);
    expect(cardioid8).toBeGreaterThan(0.05);
    expect(Math.abs(cardioid1 / cardioid8 - 1)).toBeLessThanOrEqual(0.01);
    expect(chaotic8).toBeGreaterThan(0.05);
    expect(chaotic1).toBeLessThanOrEqual(chaotic8 * 0.7);
    expect(dense.visiblePoints).toBe(visibleAt1);
    expect(dense.points).toBe(at8.points);
  });
});

test.describe("shader contract", () => {
  test("the production point shader hides by sample index, selects stacked energy by uniform, and a packed build's sample-index buffer is well formed", async ({ page }) => {
    test.setTimeout(600_000);
    const { canvas } = await openPacked(page, { params: cloudParams(), preset: "balanced" });
    const energy = (overrides: Partial<ShaderProbeCase>): ShaderProbeCase => ({
      stage: "point",
      colourMode: "period",
      period: 1,
      centre: 0,
      height: 0,
      boundary: 0.5,
      phase: 0,
      bands: 1.5,
      reverse: false,
      read: "energy",
      ...overrides,
    });
    const cases = [
      energy({ sampleIndex: 8, visibleIterations: 8 }),
      energy({ sampleIndex: 7, visibleIterations: 8 }),
      energy({ sampleIndex: 3, visibleIterations: 3 }),
      energy({ sampleIndex: 2, visibleIterations: 3 }),
      energy({ period: 1, stackedEnergy: false }),
      energy({ period: 4, stackedEnergy: false }),
      energy({ period: 1, stackedEnergy: true }),
      energy({ period: 4, stackedEnergy: true }),
    ];
    const colours = await probeShaderColours(page, cases);
    const lum = colours.map((rgb) => rgb[0]);
    const report = { cases, lum };
    console.log(`shader contract: ${JSON.stringify(lum)}`);
    expect(lum[0], "sample index 8 at 8 visible draws nothing").toBe(0);
    expect(lum[1], "sample index 7 at 8 visible draws").toBe(255);
    expect(lum[2], "sample index 3 at 3 visible draws nothing").toBe(0);
    expect(lum[3], "sample index 2 at 3 visible draws").toBe(255);
    expect(lum[4], "packed period 1").toBe(255);
    expect(lum[5], "packed period 4 equals period 1").toBe(lum[4]);
    // Stacked energy keeps the period/sampleCount factor: period 4 reads 4/8
    // of the full value and period 1 reads 1/8, so the period-4 point reads
    // half of full and four times the period-1 point.
    expect(Math.abs(lum[7] / 255 - 0.5), "stacked period 4 reads half of full").toBeLessThanOrEqual(0.025);
    expect(Math.abs(lum[6] / 255 - 0.125), "stacked period 1 reads an eighth of full").toBeLessThanOrEqual(0.00625 + 1 / 255);
    expect(Math.abs(lum[7] / lum[6] - 4), "stacked period 4 over period 1").toBeLessThanOrEqual(0.2 + 4 / lum[6]);

    const stats = await cloudStats(canvas);
    expect(stats.layout).toBe("packed");
    const PER_ROW = 4096;
    const readback = await canvas.evaluate(
      (element, count) => {
        const reader = (element as HTMLCanvasElement & { orbit3dReadSampleIndices?: (count: number) => Float32Array }).orbit3dReadSampleIndices;
        if (!reader) throw new Error("no sample-index readback on the canvas");
        return Array.from(reader(count));
      },
      PER_ROW,
    );
    const perRow = Math.min(PER_ROW, stats.slots);
    expect(readback.length).toBe(perRow * SAMPLES);
    let occupied = 0;
    let hidden = 0;
    let cellStarts = 0;
    const violations: string[] = [];
    for (let slot = 0; slot < perRow; slot += 1) {
      let seenHidden = false;
      let previous = -1;
      if (readback[slot] >= SAMPLES) violations.push(`slot ${slot}: row 0 hidden`);
      for (let row = 0; row < SAMPLES; row += 1) {
        const value = readback[row * perRow + slot];
        if (!(value >= 0 && value <= SAMPLES)) violations.push(`slot ${slot} row ${row}: value ${value} outside 0..8`);
        if (value === SAMPLES) {
          seenHidden = true;
          hidden += 1;
          continue;
        }
        if (seenHidden) violations.push(`slot ${slot}: occupied row ${row} after a hidden row`);
        if (!(value === previous + 1 || value === 0)) violations.push(`slot ${slot} row ${row}: sample index ${value} after ${previous}`);
        if (value === 0) cellStarts += 1;
        previous = value;
        occupied += 1;
      }
    }
    saveJson("shader-contract.json", { ...report, perRow, occupied, hidden, cellStarts, slots: stats.slots, violations: violations.slice(0, 50) });
    console.log(`sample-index readback: ${perRow} slots, ${occupied} occupied rows, ${hidden} hidden, ${cellStarts} cells, ${violations.length} violations`);
    expect(violations, violations.slice(0, 5).join("; ")).toEqual([]);
    expect(occupied).toBeGreaterThan(perRow);
    expect(cellStarts).toBeGreaterThan(perRow);
  });
});

test.describe("brightness", () => {
  test("frame mean luminance matches the served baseline in cloud and hybrid geometry, Inside-out and Period", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const SAMPLE_COUNT = 3;
    const rows: Array<Record<string, unknown>> = [];
    for (const geometryMode of ["cloud", "hybrid"] as const) {
      for (const colourMode of ["inside-out", "period"] as const) {
        const params = cloudParams({ geometryMode, colourMode, plottedIterations: 8 });
        const measure = async (origin: string, label: string) => {
          const lumas: number[] = [];
          let stats: CloudStats | null = null;
          for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
            const context = await page.context().browser()!.newContext({ viewport: VIEWPORT });
            const target = await context.newPage();
            const { canvas } = await openPacked(target, { origin, params, preset: "extreme", timeoutMs: 600_000 });
            await target.waitForTimeout(800);
            const image = await screenshot(canvas, sample === 0 ? artifact(`brightness-${label}-${geometryMode}-${colourMode}.png`) : undefined);
            lumas.push(meanLuma(image));
            stats = await cloudStats(canvas);
            await context.close();
          }
          return { lumas, stats: stats! };
        };
        const current = await measure(CURRENT_ORIGIN, "current");
        const baseline = await measure(BASELINE_ORIGIN, "baseline");
        const row = {
          geometryMode,
          colourMode,
          current: current.lumas,
          baseline: baseline.lumas,
          currentMedian: median(current.lumas),
          baselineMedian: median(baseline.lumas),
          currentPoints: current.stats.points,
          baselinePoints: baseline.stats.points,
          currentBandPoints: current.stats.bandPoints,
          baselineBandPoints: baseline.stats.bandPoints,
          currentHybridCloudPoints: current.stats.hybridCloudPoints,
          baselineHybridCloudPoints: baseline.stats.hybridCloudPoints,
          currentSampler: current.stats.sampler,
          baselineSampler: baseline.stats.sampler,
        };
        rows.push(row);
        console.log(`brightness ${geometryMode} ${colourMode}: ${JSON.stringify(row)}`);
        expect(Math.abs(row.currentMedian / row.baselineMedian - 1), `${geometryMode} ${colourMode} mean luminance`).toBeLessThanOrEqual(0.05);
        if (geometryMode === "hybrid") {
          expect(current.stats.bandPoints).toBe(baseline.stats.bandPoints);
          expect(current.stats.hybridCloudPoints).toBe(baseline.stats.hybridCloudPoints);
        }
      }
    }
    saveJson("brightness.json", rows);
  });
});

test.describe("prebaked", () => {
  test("a bake stays stacked and draws as before", async ({ page }) => {
    test.setTimeout(600_000);
    const bakePath = "public/baked/lm-tiny.elpc";
    expect(existsSync(bakePath), `${bakePath} missing: bake it first (card 103 criterion 8)`).toBe(true);
    const header = elpcHeader(readFileSync(bakePath));
    const manifest = JSON.parse(readFileSync("public/baked/index.json", "utf8")) as unknown;
    const entries = Array.isArray(manifest) ? manifest : (manifest as { bakes?: unknown[]; entries?: unknown[] }).bakes ?? (manifest as { entries?: unknown[] }).entries ?? Object.values(manifest as Record<string, unknown>);
    const entry = (entries as Array<Record<string, unknown>>).find((item) => JSON.stringify(item).includes("lm-tiny"));
    expect(entry, "manifest entry for lm-tiny").toBeTruthy();
    const id = String(entry!.id ?? entry!.name ?? entry!.file);
    const measure = async (plottedIterations: number) => {
      const { canvas } = await openPacked(page, { params: cloudParams({ modelSource: id, plottedIterations }), preset: "extreme" });
      await expect(canvas).toHaveAttribute("data-orbit3d-sampler", "prebaked", { timeout: 120_000 });
      await page.waitForTimeout(600);
      const stats = await cloudStats(canvas);
      const box = (await canvas.boundingBox())!;
      const target = await projectToCanvas(page, CARDIOID_C.re, CARDIOID_C.im, period1Height(CARDIOID_C.re, CARDIOID_C.im), box.width, box.height);
      const rect: PixelRect = { x: target.x - 60, y: target.y - 40, width: 120, height: 80 };
      const fraction = litFraction(await screenshot(canvas, artifact(`prebaked-plotted${plottedIterations}.png`)), rect);
      return { plottedIterations, stats, rect, fraction };
    };
    const at8 = await measure(8);
    const at1 = await measure(1);
    saveJson("prebaked.json", { header, id, at8, at1 });
    console.log(`prebaked: ${JSON.stringify({ header, id, points8: at8.stats.points, points1: at1.stats.points, lit8: at8.fraction, lit1: at1.fraction })}`);
    for (const row of [at8, at1]) {
      expect(row.stats.sampler).toBe("prebaked");
      expect(row.stats.layout).toBe("stacked");
      expect(row.fraction).toBeGreaterThan(0.1);
    }
    expect(at8.stats.points).toBe(header.cellCount * 8);
    expect(at1.stats.points).toBe(header.cellCount * 1);
  });
});

test.describe("cost", () => {
  test("build time, warm render time and build bytes against the served baseline at the shipped defaults", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const SAMPLE_COUNT = 3;
    const TREES = [[CURRENT_ORIGIN, "current"], [BASELINE_ORIGIN, "baseline"]] as const;
    const params = frozenParams({ boundaryDetail: 1, tailRefinement: 0, cycleSpeed: 0.1, cycleBands: 4, edgeGlow: 0.2 });
    type Timed = { renders: FrameTiming[]; mainThread: MainThreadLoad };
    type Run = { buildMs: number; stats: CloudStats; timed: Timed | null };
    // Warm render timing: `runs` passes of frameTiming on one page, with the
    // renderer's main-thread task time over the same window from the DevTools
    // Performance domain, so a long frame interval can be told apart from a
    // busy main thread.
    const timeRenders = async (target: Page, runs = SAMPLE_COUNT): Promise<Timed> => {
      const { result, load } = await mainThreadLoad(target, async () => {
        const out: FrameTiming[] = [];
        for (let run = 0; run < runs; run += 1) out.push(await frameTiming(target));
        return out;
      });
      return { renders: result, mainThread: load };
    };
    const measure = async (origin: string, newPage: () => Promise<Page>): Promise<Run[]> => {
      const runs: Run[] = [];
      for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
        const target = await newPage();
        const { canvas, buildMs } = await openPacked(target, { origin, params, preset: "extreme", timeoutMs: 600_000 });
        await target.waitForTimeout(1000);
        const stats = await cloudStats(canvas);
        expect(stats.sampler).toBe("gpu-sampled");
        const timed = sample === SAMPLE_COUNT - 1 ? await timeRenders(target) : null;
        runs.push({ buildMs, stats, timed });
        await target.context().close();
      }
      return runs;
    };
    const headlessPage = async (): Promise<Page> =>
      (await page.context().browser()!.newContext({ viewport: VIEWPORT })).newPage();
    const current = await measure(CURRENT_ORIGIN, headlessPage);
    const baseline = await measure(BASELINE_ORIGIN, headlessPage);
    // The detail-0 baseline that the refined-cell derivation needs gets its
    // own context, closed before any timing runs: a page left rendering
    // 7.4M points shares the GPU with whatever is measured next.
    const plainPage = await headlessPage();
    const baselinePlain = await openPacked(plainPage, { origin: BASELINE_ORIGIN, params: { ...params, boundaryDetail: 0 }, preset: "extreme", timeoutMs: 600_000 });
    const baselinePlainStats = await cloudStats(baselinePlain.canvas);
    await plainPage.context().close();
    const baselineRefined = baseline[0].stats.points / SAMPLES - baselinePlainStats.points / SAMPLES;

    const timingSummary = ({ renders, mainThread }: Timed) => ({
      renderMedianMs: renders.map((r) => r.medianMs),
      renderP90Ms: renders.map((r) => r.p90Ms),
      renderMethod: renders.map((r) => r.method),
      intervalMedianMs: renders.map((r) => r.intervalMedianMs),
      intervalP90Ms: renders.map((r) => r.intervalP90Ms),
      disjoint: renders.some((r) => r.disjoint),
      mainThread: {
        ...mainThread,
        // What the main thread did between two frames, against the interval
        // it waited: utilisation times the median frame interval.
        taskMsPerFrame: mainThread.utilisation * median(renders.map((r) => r.intervalMedianMs)),
      },
    });

    // Pacing control: the same helper on both trees at lighter presets. Where
    // the baseline's own GPU time falls under the headless frame interval,
    // its interval shows the same floor, which places the floor in headless
    // Chromium's frame pacing rather than in the tree under test.
    const pacing: Array<{ tree: string; preset: ResolutionPreset; points: number } & ReturnType<typeof timingSummary>> = [];
    for (const preset of ["balanced", "high"] as const) {
      for (const [origin, tree] of TREES) {
        const target = await headlessPage();
        const { canvas } = await openPacked(target, { origin, params, preset, timeoutMs: 600_000 });
        await target.waitForTimeout(1000);
        const stats = await cloudStats(canvas);
        pacing.push({ tree, preset, points: stats.points, ...timingSummary(await timeRenders(target, 1)) });
        await target.context().close();
      }
    }

    // Real-display pacing: headless Chromium on macOS paces BeginFrames
    // erratically once the GPU finishes a frame early (see frameTiming), so
    // the requestAnimationFrame interval is also taken under a display link,
    // in one headed launch for both trees. Unavailable without a GUI session;
    // the report then records why.
    let headed: { current: Timed; baseline: Timed } | null = null;
    let headedError: string | null = null;
    try {
      const args = playwrightConfig.use?.launchOptions?.args ?? [];
      const browser = await chromium.launch({ headless: false, args });
      try {
        const timings = async (origin: string): Promise<Timed> => {
          const target = await (await browser.newContext({ viewport: VIEWPORT })).newPage();
          await openPacked(target, { origin, params, preset: "extreme", timeoutMs: 600_000 });
          await target.waitForTimeout(1000);
          const timed = await timeRenders(target);
          await target.context().close();
          return timed;
        };
        headed = { current: await timings(CURRENT_ORIGIN), baseline: await timings(BASELINE_ORIGIN) };
      } finally {
        await browser.close();
      }
    } catch (error) {
      headedError = (error as Error).message.split("\n")[0];
    }

    const timedOf = (runs: Run[]): Timed => runs[SAMPLE_COUNT - 1].timed!;
    const ratioOf = (a: number[], b: number[]) => median(a) / median(b);
    const currentTiming = timingSummary(timedOf(current));
    const baselineTiming = timingSummary(timedOf(baseline));
    const headedTiming = headed ? { current: timingSummary(headed.current), baseline: timingSummary(headed.baseline) } : null;
    const report = {
      current: {
        buildMs: current.map((r) => r.buildMs),
        ...currentTiming,
        points: current.map((r) => r.stats.points),
        buildBytes: current.map((r) => r.stats.buildBytes),
        samplerBytes: current.map((r) => r.stats.samplerBytes),
        refinedSubCells: current.map((r) => r.stats.refinedSubCells),
        baseCells: current[0].stats.baseCells,
        slots: current[0].stats.slots,
        pointBudget: current[0].stats.pointBudget,
      },
      baseline: {
        buildMs: baseline.map((r) => r.buildMs),
        ...baselineTiming,
        points: baseline.map((r) => r.stats.points),
        pointBudget: baseline[0].stats.pointBudget,
        budgetTimes24: baseline[0].stats.pointBudget * 24,
        refinedSubCells: baselineRefined,
      },
      pacing,
      headed: headedTiming,
      headedError,
      ratios: {
        buildTime: ratioOf(current.map((r) => r.buildMs), baseline.map((r) => r.buildMs)),
        // Render cost: GPU frame time where EXT_disjoint_timer_query_webgl2
        // exists, else the headless rAF interval (FrameTiming.method).
        render: ratioOf(currentTiming.renderMedianMs, baselineTiming.renderMedianMs),
        headlessInterval: ratioOf(currentTiming.intervalMedianMs, baselineTiming.intervalMedianMs),
        headedInterval: headedTiming ? ratioOf(headedTiming.current.intervalMedianMs, headedTiming.baseline.intervalMedianMs) : null,
        headedRender: headedTiming ? ratioOf(headedTiming.current.renderMedianMs, headedTiming.baseline.renderMedianMs) : null,
        mainThreadTaskPerFrame: currentTiming.mainThread.taskMsPerFrame / baselineTiming.mainThread.taskMsPerFrame,
        refinedSubCells: current[0].stats.refinedSubCells / Math.max(1, baselineRefined),
        buildBytesOverBaselineBudget24: median(current.map((r) => r.stats.buildBytes)) / (baseline[0].stats.pointBudget * 24),
      },
    };
    saveJson("cost.json", report);
    console.log(`cost: ${JSON.stringify(report)}`);
    expect(report.ratios.render, `warm render within 20% (${currentTiming.renderMethod[0]})`).toBeLessThanOrEqual(1.2);
    if (headedTiming) {
      expect(report.ratios.headedInterval!, "real-display frame interval within 20%").toBeLessThanOrEqual(1.2);
    }
    expect(median(report.current.buildBytes), "build bytes within the baseline's budget times 24").toBeLessThanOrEqual(report.baseline.budgetTimes24);
    expect(report.ratios.buildTime, "build time rise explained by the refined sub-cell ratio").toBeLessThanOrEqual(Math.max(1.2, report.ratios.refinedSubCells));
  });
});

test.describe("evidence", () => {
  test("screenshots of the cardioid pose and the Bifurcation curtain preset on both trees", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const record: Record<string, unknown> = {};
    for (const [origin, label] of [[CURRENT_ORIGIN, "current"], [BASELINE_ORIGIN, "baseline"]] as const) {
      for (const tailRefinement of [0, 0.6]) {
        const { canvas } = await openPacked(page, { origin, params: cloudParams({ tailRefinement }), preset: "extreme", timeoutMs: 600_000 });
        const pose = await cardioidPose(page, canvas);
        const path = artifact(`evidence-cardioid-${label}-tail${tailRefinement}.png`);
        const image = await screenshot(canvas, path);
        record[`cardioid-${label}-tail${tailRefinement}`] = { path, fraction: litFraction(image, pose.rect, LIT_THRESHOLD), pose: { distance: pose.distance, azimuth: pose.azimuth }, stats: await cloudStats(canvas) };
      }
      const { canvas } = await openPacked(page, { origin, params: cloudParams(), preset: "extreme", timeoutMs: 600_000 });
      const handle = page.locator(".sim-view__drawer-handle");
      await handle.click();
      const presets = page.getByRole("combobox", { name: "Kernel preset", exact: true });
      await presets.selectOption("bifurcation-curtain");
      await expect(presets).toHaveValue("bifurcation-curtain");
      await setParam(page, "autoRotate", false);
      await setParam(page, "continuousSpin", false);
      await setParam(page, "tailRefinement", 0.6);
      await expect(page.locator('[data-param-key="tailRefinement"]')).toHaveValue("0.6");
      await handle.click();
      await page.waitForTimeout(500);
      await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 600_000 });
      let previous = "";
      await expect.poll(async () => {
        const stats = await cloudStats(canvas);
        const pose = `${stats.cameraAzimuth}|${stats.cameraDistance}`;
        const settled = pose === previous;
        previous = pose;
        return settled;
      }, { timeout: 30_000, intervals: [500] }).toBe(true);
      await page.waitForTimeout(800);
      const path = artifact(`evidence-curtain-${label}-tail0.6.png`);
      await screenshot(canvas, path);
      record[`curtain-${label}-tail0.6`] = { path, stats: await cloudStats(canvas) };
    }
    saveJson("evidence.json", record);
    console.log(`evidence: ${JSON.stringify(Object.keys(record))}`);
  });
});
