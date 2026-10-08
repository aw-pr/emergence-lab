/**
 * Logistic-Mandelbrot second refinement level: integration evidence for
 * stage 105 criteria 2-8
 * (docs/stages/105-logistic-mandelbrot-second-refinement-level.md).
 *
 *   npx playwright test e2e/refine-levels.spec.ts --workers=1
 *
 * Describe titles match the card's --grep keys: budget, geometry, tail
 * density, defaults, boundary detail, prebaked, cost, evidence; "layout
 * table" tabulates every preset for the audit. Criteria that name the served
 * baseline read the unchanged tree on port 5174
 * (docs/audits/100-inside-out-spread-colouring.md, "Serving the baseline");
 * a missing baseline fails them. Artefacts land under
 * e2e/artifacts/refine-levels/ (git-ignored).
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { frameTiming, frozenParams, setParam, type FrameTiming, type SimParams } from "./harness/insideOut.ts";
import {
  BASELINE_ORIGIN,
  CARDIOID_LIT_THRESHOLD,
  CURRENT_ORIGIN,
  PRESET_TARGETS,
  cardioidPose,
  cloudStats,
  elpcHeader,
  litFraction,
  meanLuma,
  meanLumaRect,
  median,
  openPacked,
  readRefineJobs,
  realAxisPose,
  screenshot,
  type CloudStats,
  type PixelRect,
  type RefineJob,
  type ResolutionPreset,
} from "./harness/packedCells.ts";

const VIEWPORT = { width: 1280, height: 720 };
const SAMPLES = 8;
const ARTIFACT_DIR = "e2e/artifacts/refine-levels";
/**
 * Criterion 4's rectangle, in the real-axis pose on a 1280 by 720 canvas:
 * the region to the right of the period-4 bulb's sheet, where the period-8
 * and deeper cascade tails and the chaotic points beyond them sit. Chosen
 * by inspection of the pose at Tail refinement 0, 0.3 and 0.6
 * (e2e/artifacts/refine-levels/probe-pose-gpu-extreme-tail*.png).
 */
const TAIL_RECT: PixelRect = { x: 720, y: 40, width: 440, height: 520 };
const TAIL_SETTINGS = [0, 0.3, 0.6] as const;

test.use({ viewport: VIEWPORT });

function artifact(name: string): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  return `${ARTIFACT_DIR}/${name}`;
}

function saveJson(name: string, value: unknown): void {
  writeFileSync(artifact(name), JSON.stringify(value, null, 2));
}

const cloudParams = (overrides: SimParams = {}): SimParams =>
  frozenParams({ boundaryDetail: 0, tailRefinement: 0, ...overrides });

/** Hook totals only: how many jobs each tail level sampled in the last build. */
async function jobTotals(canvas: ReturnType<Page["locator"]>): Promise<{ level1: number; level2: number }> {
  const level1 = await readRefineJobs(canvas, 1, 0);
  const level2 = await readRefineJobs(canvas, 2, 0);
  return { level1: level1.total, level2: level2.total };
}

async function requireBaseline(page: Page): Promise<void> {
  const response = await page.request.get(`${BASELINE_ORIGIN}/`, { timeout: 5000 }).catch(() => null);
  expect(
    response?.ok() ?? false,
    `no unchanged baseline served at ${BASELINE_ORIGIN} (see docs/audits/100-inside-out-spread-colouring.md, "Serving the baseline")`,
  ).toBe(true);
}

/** The per-level figures the card's tables need, from one build. */
function levelRow(stats: CloudStats, buildMs: number, jobs?: { level1: number; level2: number }) {
  return {
    buildMs,
    /** Jobs each level sampled (hook totals); level-2 candidates are level2Jobs / 9. */
    level1Jobs: jobs?.level1 ?? NaN,
    level2Jobs: jobs?.level2 ?? NaN,
    sampler: stats.sampler,
    points: stats.points,
    pointBudget: stats.pointBudget,
    candidateCells: stats.candidateCells,
    baseCells: stats.baseCells,
    baseRows: stats.baseRows,
    slots: stats.slots,
    refineRowBudget: stats.refineRowBudget,
    refinedL1SubCells: stats.refinedL1SubCells,
    refinedL1Rows: stats.refinedL1Rows,
    refinedL2SubCells: stats.refinedL2SubCells,
    refinedL2Rows: stats.refinedL2Rows,
    refinedDetailSubCells: stats.refinedDetailSubCells,
    refinedSubCells: stats.refinedSubCells,
    refinedRows: stats.refinedRows,
    detailBaseSlots: stats.detailBaseSlots,
    boundaryDetail: stats.boundaryDetail,
    buildBytes: stats.buildBytes,
    samplerBytes: stats.samplerBytes,
  };
}

test.describe("budget", () => {
  const CASES: Array<{ path: "gpu" | "cpu"; preset: ResolutionPreset }> = [
    { path: "gpu", preset: "extreme" },
    { path: "gpu", preset: "ultra" },
    { path: "cpu", preset: "ultra" },
  ];
  for (const { path, preset } of CASES) {
    test(`${path} ${preset}: the slider sets the refinement rows and level 2 takes what level 1 leaves`, async ({ page }) => {
      test.setTimeout(1_500_000);
      const rows: Array<{ tailRefinement: number } & ReturnType<typeof levelRow>> = [];
      for (const tailRefinement of TAIL_SETTINGS) {
        const { canvas, buildMs } = await openPacked(page, {
          params: cloudParams({ tailRefinement }),
          preset,
          cpu: path === "cpu",
          timeoutMs: 1_200_000,
        });
        const stats = await cloudStats(canvas);
        rows.push({ tailRefinement, ...levelRow(stats, buildMs, await jobTotals(canvas)) });
        expect(stats.sampler).toBe(path === "cpu" ? "cpu-sampled" : "gpu-sampled");
        expect(stats.layout).toBe("packed");
        expect(Math.abs(stats.candidateCells / PRESET_TARGETS[preset] - 1)).toBeLessThanOrEqual(0.02);
        // The slider's share of the point budget; the CPU path reads 0 as 0.3.
        const share = path === "cpu" ? Math.min(tailRefinement || 0.3, 0.3) : tailRefinement;
        expect(stats.refineRowBudget, `row budget at ${tailRefinement}`).toBe(Math.floor(stats.pointBudget * share));
        expect(stats.refinedL1Rows + stats.refinedL2Rows, `rows within the row budget at ${tailRefinement}`).toBeLessThanOrEqual(stats.refineRowBudget);
        expect(stats.refinedSubCells).toBe(stats.refinedL1SubCells + stats.refinedL2SubCells + stats.refinedDetailSubCells);
        expect(stats.refinedRows).toBe(stats.refinedL1Rows + stats.refinedL2Rows);
        expect(stats.refinedDetailSubCells).toBe(0);
        expect(stats.points, `points within the budget at ${tailRefinement}`).toBeLessThanOrEqual(stats.pointBudget);
        expect(stats.points).toBe(stats.slots * SAMPLES);
        if (path === "gpu" && tailRefinement === 0) {
          expect(stats.refinedL1Rows).toBe(0);
          expect(stats.refinedL2Rows).toBe(0);
          expect(stats.refinedL1SubCells).toBe(0);
          expect(stats.refinedL2SubCells).toBe(0);
        } else {
          expect(stats.refinedL2SubCells, `level 2 present at ${tailRefinement}`).toBeGreaterThan(0);
        }
      }
      saveJson(`budget-${path}-${preset}.json`, rows);
      console.log(`budget ${path} ${preset}: ${JSON.stringify(rows.map((r) => ({ t: r.tailRefinement, budget: r.refineRowBudget, base: r.baseCells, l1: [r.refinedL1SubCells, r.refinedL1Rows], l2: [r.refinedL2SubCells, r.refinedL2Rows], points: r.points, ms: r.buildMs })))}`);
      const [at0, at3, at6] = rows;
      expect(Math.abs(at3.baseCells / at0.baseCells - 1)).toBeLessThanOrEqual(0.005);
      expect(Math.abs(at6.baseCells / at0.baseCells - 1)).toBeLessThanOrEqual(0.005);
      if (path === "gpu") {
        expect(at6.refinedL1Rows + at6.refinedL2Rows, "refined rows grow from 0.3 to 0.6").toBeGreaterThan(at3.refinedL1Rows + at3.refinedL2Rows);
        expect(at6.refinedL2SubCells, "level-2 sub-cells grow from 0.3 to 0.6").toBeGreaterThan(at3.refinedL2SubCells);
      }
    });
  }
});

test.describe("layout table", () => {
  const PRESETS: ResolutionPreset[] = ["performance", "balanced", "high", "ultra", "extreme"];
  const tabulate = async (page: Page, origin: string, preset: ResolutionPreset, cpu: boolean, boundaryDetail: number, tailRefinement: number) => {
    const { canvas, buildMs } = await openPacked(page, {
      origin,
      params: cloudParams({ boundaryDetail, tailRefinement }),
      preset,
      cpu,
      timeoutMs: 1_200_000,
    });
    const stats = await cloudStats(canvas);
    return levelRow(stats, buildMs, origin === CURRENT_ORIGIN ? await jobTotals(canvas) : undefined);
  };
  test("the gpu path at every preset, detail 0 and 1, on both trees", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const rows: Array<Record<string, unknown>> = [];
    for (const preset of PRESETS) {
      for (const boundaryDetail of [0, 1]) {
        for (const tailRefinement of TAIL_SETTINGS) {
          const current = await tabulate(page, CURRENT_ORIGIN, preset, false, boundaryDetail, tailRefinement);
          const baseline = await tabulate(page, BASELINE_ORIGIN, preset, false, boundaryDetail, tailRefinement);
          rows.push({ preset, boundaryDetail, tailRefinement, current, baseline });
          console.log(`layout gpu ${preset} detail ${boundaryDetail} tail ${tailRefinement}: ${JSON.stringify({ current: { base: current.baseCells, budget: current.refineRowBudget, l1: [current.refinedL1SubCells, current.refinedL1Rows], l2: [current.refinedL2SubCells, current.refinedL2Rows], detail: current.refinedDetailSubCells, points: current.points, ms: current.buildMs }, baseline: { refined: baseline.refinedSubCells, points: baseline.points, ms: baseline.buildMs } })}`);
          expect(current.points).toBeLessThanOrEqual(current.pointBudget);
        }
      }
    }
    saveJson("layout-table-gpu.json", rows);
  });
  test("the cpu path at balanced, high and ultra on both trees", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const rows: Array<Record<string, unknown>> = [];
    for (const preset of ["balanced", "high", "ultra"] as const) {
      for (const tailRefinement of TAIL_SETTINGS) {
        const current = await tabulate(page, CURRENT_ORIGIN, preset, true, 0, tailRefinement);
        const baseline = await tabulate(page, BASELINE_ORIGIN, preset, true, 0, tailRefinement);
        rows.push({ preset, tailRefinement, current, baseline });
        console.log(`layout cpu ${preset} tail ${tailRefinement}: ${JSON.stringify({ current: { base: current.baseCells, budget: current.refineRowBudget, l1: [current.refinedL1SubCells, current.refinedL1Rows], l2: [current.refinedL2SubCells, current.refinedL2Rows], points: current.points, ms: current.buildMs }, baseline: { refined: baseline.refinedSubCells, points: baseline.points, ms: baseline.buildMs } })}`);
        expect(current.points).toBeLessThanOrEqual(current.pointBudget);
      }
    }
    saveJson("layout-table-cpu.json", rows);
  });
});

test.describe("geometry", () => {
  for (const path of ["gpu", "cpu"] as const) {
    test(`${path} balanced: level 2 subdivides its own level-1 parents on a 3 by 3 lattice`, async ({ page }) => {
      test.setTimeout(900_000);
      const { canvas } = await openPacked(page, {
        params: cloudParams({ tailRefinement: 0.6 }),
        preset: "balanced",
        cpu: path === "cpu",
        timeoutMs: 600_000,
      });
      const stats = await cloudStats(canvas);
      expect(stats.refinedL2SubCells).toBeGreaterThan(0);
      const level2 = await readRefineJobs(canvas, 2, 4096);
      const level1 = await readRefineJobs(canvas, 1, 4096);
      expect(level2.total).toBeGreaterThan(0);
      expect(level1.total).toBeGreaterThan(0);
      expect(level2.jobs.length).toBe(Math.min(4096, level2.total));
      expect(level1.jobs.length).toBe(Math.min(4096, level1.total));
      const level1Full = await readRefineJobs(canvas, 1, level1.total);
      expect(level1Full.jobs.length).toBe(level1.total);

      const parentWidth1 = level1.jobs[0].parentWidth;
      const parentHeight1 = level1.jobs[0].parentHeight;
      const relative = (value: number, reference: number) => Math.abs(value - reference) / Math.abs(reference);
      const violations: string[] = [];
      const offsets = new Set<string>();
      const checkOffsets = (job: RefineJob, label: string) => {
        const ox = (job.re - job.parentRe) / job.parentWidth;
        const oy = (job.im - job.parentIm) / job.parentHeight;
        const snap = (offset: number): number | null => {
          for (const value of [-1 / 3, 0, 1 / 3]) {
            if (Math.abs(offset - value) <= 1e-9) return value;
          }
          return null;
        };
        const sx = snap(ox);
        const sy = snap(oy);
        if (sx === null || sy === null) violations.push(`${label}: offset (${ox}, ${oy}) off the lattice`);
        else offsets.add(`${sx.toFixed(6)},${sy.toFixed(6)}`);
        if (Math.abs(job.re - job.parentRe) > job.parentWidth / 2 + 1e-15 || Math.abs(job.im - job.parentIm) > job.parentHeight / 2 + 1e-15) {
          violations.push(`${label}: outside its parent's rectangle`);
        }
      };
      // Level-1 positions, keyed at 1e-12 so a level-2 parent can be looked up.
      const SCALE = 1e12;
      const level1ByKey = new Map<string, RefineJob[]>();
      const keyOf = (re: number, im: number) => `${Math.round(re * SCALE)},${Math.round(im * SCALE)}`;
      for (const job of level1Full.jobs) {
        const key = keyOf(job.re, job.im);
        const list = level1ByKey.get(key) ?? [];
        list.push(job);
        level1ByKey.set(key, list);
      }
      const level1Near = (re: number, im: number): boolean => {
        const baseRe = Math.round(re * SCALE);
        const baseIm = Math.round(im * SCALE);
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            const list = level1ByKey.get(`${baseRe + dx},${baseIm + dy}`);
            if (list?.some((job) => Math.abs(job.re - re) <= 1e-12 && Math.abs(job.im - im) <= 1e-12)) return true;
          }
        }
        return false;
      };
      level1.jobs.forEach((job, index) => {
        if (relative(job.parentWidth, parentWidth1) > 1e-9 || relative(job.parentHeight, parentHeight1) > 1e-9) violations.push(`level 1 job ${index}: parent size varies`);
        checkOffsets(job, `level 1 job ${index}`);
      });
      let parentsFound = 0;
      level2.jobs.forEach((job, index) => {
        if (relative(job.parentWidth, parentWidth1 / 3) > 1e-9) violations.push(`level 2 job ${index}: parent width ${job.parentWidth} is not a third of ${parentWidth1}`);
        if (relative(job.parentHeight, parentHeight1 / 3) > 1e-9) violations.push(`level 2 job ${index}: parent height ${job.parentHeight} is not a third of ${parentHeight1}`);
        checkOffsets(job, `level 2 job ${index}`);
        if (level1Near(job.parentRe, job.parentIm)) parentsFound += 1;
        else violations.push(`level 2 job ${index}: parent (${job.parentRe}, ${job.parentIm}) is not a level-1 job`);
      });
      const report = {
        path,
        level1Total: level1.total,
        level2Total: level2.total,
        level1Checked: level1.jobs.length,
        level2Checked: level2.jobs.length,
        parentWidth1,
        parentHeight1,
        parentWidth2: level2.jobs[0].parentWidth,
        parentHeight2: level2.jobs[0].parentHeight,
        offsetsSeen: [...offsets].sort(),
        parentsFound,
        violations: violations.slice(0, 50),
        violationCount: violations.length,
        sample: { level1: level1.jobs.slice(0, 3), level2: level2.jobs.slice(0, 3) },
        stats: levelRow(stats, 0),
      };
      saveJson(`geometry-${path}-balanced.json`, report);
      console.log(`geometry ${path}: ${JSON.stringify({ l1: level1.total, l2: level2.total, offsets: report.offsetsSeen.length, parentsFound, violations: violations.length })}`);
      expect(violations, violations.slice(0, 5).join("; ")).toEqual([]);
      expect(parentsFound).toBe(level2.jobs.length);
      expect(offsets.size, "all nine sub-cell offsets occur").toBe(9);
    });
  }
});

test.describe("tail density", () => {
  test("more tail detail where the tails are at 0.3 and 0.6, above the baseline, with the plane unchanged", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const measure = async (origin: string, label: string, tailRefinement: number) => {
      const { canvas } = await openPacked(page, {
        origin,
        params: cloudParams({ tailRefinement }),
        preset: "extreme",
        timeoutMs: 600_000,
      });
      const pose = await realAxisPose(page, canvas);
      const path = artifact(`tail-density-${label}-tail${tailRefinement}.png`);
      const image = await screenshot(canvas, path);
      const stats = await cloudStats(canvas);
      return { label, tailRefinement, path, mean: meanLumaRect(image, TAIL_RECT), frameMean: meanLuma(image), pose, ...levelRow(stats, 0) };
    };
    const current0 = await measure(CURRENT_ORIGIN, "current", 0);
    const current3 = await measure(CURRENT_ORIGIN, "current", 0.3);
    const current6 = await measure(CURRENT_ORIGIN, "current", 0.6);
    const baseline6 = await measure(BASELINE_ORIGIN, "baseline", 0.6);

    // Card 103's plane-coverage measurement: its pose, rectangle and threshold.
    const plane = async (tailRefinement: number) => {
      const { canvas } = await openPacked(page, { params: cloudParams({ tailRefinement }), preset: "extreme", timeoutMs: 600_000 });
      const pose = await cardioidPose(page, canvas);
      const path = artifact(`tail-density-plane-current-tail${tailRefinement}.png`);
      const image = await screenshot(canvas, path);
      return { tailRefinement, path, fraction: litFraction(image, pose.rect, CARDIOID_LIT_THRESHOLD), rect: pose.rect, distance: pose.distance, azimuth: pose.azimuth };
    };
    const plane0 = await plane(0);
    const plane6 = await plane(0.6);
    const report = {
      rect: TAIL_RECT,
      litThreshold: CARDIOID_LIT_THRESHOLD,
      current0,
      current3,
      current6,
      baseline6,
      ratios: {
        current3Over0: current3.mean / current0.mean,
        current6Over3: current6.mean / current3.mean,
        current6OverBaseline6: current6.mean / baseline6.mean,
        plane6Over0: plane6.fraction / plane0.fraction,
      },
      plane0,
      plane6,
    };
    saveJson("tail-density.json", report);
    console.log(`tail density: ${JSON.stringify({ means: [current0.mean, current3.mean, current6.mean, baseline6.mean], ratios: report.ratios, plane: [plane0.fraction, plane6.fraction] })}`);
    expect(current3.mean, "0.3 denser than 0").toBeGreaterThan(current0.mean);
    expect(current6.mean, "0.6 denser than 0.3").toBeGreaterThan(current3.mean);
    expect(current6.mean, "0.6 denser than the baseline at 0.6").toBeGreaterThan(baseline6.mean);
    expect(plane0.fraction, "cardioid lattice resolved").toBeGreaterThanOrEqual(0.15);
    expect(Math.abs(plane6.fraction / plane0.fraction - 1), "plane unchanged from 0 to 0.6").toBeLessThanOrEqual(0.02);
  });
});

test.describe("defaults", () => {
  test("the shipped build is identical to the served baseline in cloud and hybrid, Inside-out and Period", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const SAMPLE_COUNT = 3;
    const rows: Array<Record<string, unknown>> = [];
    for (const geometryMode of ["cloud", "hybrid"] as const) {
      for (const colourMode of ["inside-out", "period"] as const) {
        const params = frozenParams({ boundaryDetail: 1, tailRefinement: 0, geometryMode, colourMode });
        const measure = async (origin: string, label: string) => {
          const lumas: number[] = [];
          let stats: CloudStats | null = null;
          for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
            const context = await page.context().browser()!.newContext({ viewport: VIEWPORT });
            const target = await context.newPage();
            const { canvas } = await openPacked(target, { origin, params, preset: "extreme", timeoutMs: 600_000 });
            await target.waitForTimeout(800);
            const image = await screenshot(canvas, sample === 0 ? artifact(`defaults-${label}-${geometryMode}-${colourMode}.png`) : undefined);
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
          currentLumas: current.lumas,
          baselineLumas: baseline.lumas,
          currentMedian: median(current.lumas),
          baselineMedian: median(baseline.lumas),
          current: levelRow(current.stats, 0),
          baseline: levelRow(baseline.stats, 0),
          currentBandPoints: current.stats.bandPoints,
          baselineBandPoints: baseline.stats.bandPoints,
          currentHybridCloudPoints: current.stats.hybridCloudPoints,
          baselineHybridCloudPoints: baseline.stats.hybridCloudPoints,
        };
        rows.push(row);
        console.log(`defaults ${geometryMode} ${colourMode}: ${JSON.stringify({ points: [current.stats.points, baseline.stats.points], slots: [current.stats.slots, baseline.stats.slots], refined: [current.stats.refinedSubCells, baseline.stats.refinedSubCells], l2: current.stats.refinedL2SubCells, lumas: [row.currentMedian, row.baselineMedian] })}`);
        expect(current.stats.sampler).toBe("gpu-sampled");
        expect(baseline.stats.sampler).toBe("gpu-sampled");
        expect(current.stats.points).toBe(baseline.stats.points);
        expect(current.stats.baseCells).toBe(baseline.stats.baseCells);
        expect(current.stats.refinedSubCells).toBe(baseline.stats.refinedSubCells);
        expect(current.stats.slots).toBe(baseline.stats.slots);
        expect(current.stats.refinedL2SubCells).toBe(0);
        expect(current.stats.refinedL1SubCells).toBe(0);
        expect(Math.abs(row.currentMedian / row.baselineMedian - 1), `${geometryMode} ${colourMode} mean luminance`).toBeLessThanOrEqual(0.01);
        if (geometryMode === "hybrid") {
          expect(current.stats.bandPoints).toBe(baseline.stats.bandPoints);
          expect(current.stats.hybridCloudPoints).toBe(baseline.stats.hybridCloudPoints);
        }
      }
    }
    saveJson("defaults.json", rows);
  });
});

test.describe("boundary detail", () => {
  test("the raised tier keeps its count and its gate sits above level 2", async ({ page }) => {
    test.setTimeout(1_200_000);
    await requireBaseline(page);
    const open = async (origin: string, boundaryDetail: number) => {
      const { canvas, buildMs } = await openPacked(page, { origin, params: cloudParams({ boundaryDetail, tailRefinement: 0.3 }), preset: "extreme", timeoutMs: 600_000 });
      return levelRow(await cloudStats(canvas), buildMs);
    };
    const current1 = await open(CURRENT_ORIGIN, 1);
    const current0 = await open(CURRENT_ORIGIN, 0);
    const baseline1 = await open(BASELINE_ORIGIN, 1);
    const baseline0 = await open(BASELINE_ORIGIN, 0);
    const baselineRaised = baseline1.refinedSubCells - baseline0.refinedSubCells;
    const report = {
      current1,
      current0,
      baseline1,
      baseline0,
      baselineRaised,
      ratio: current1.refinedDetailSubCells / Math.max(1, baselineRaised),
    };
    saveJson("boundary-detail.json", report);
    console.log(`boundary detail: ${JSON.stringify({ detail: current1.boundaryDetail, raised: current1.refinedDetailSubCells, baselineRaised, ratio: report.ratio, detailBaseSlots: current1.detailBaseSlots, slotsAtDetail0: current0.slots, l2: [current1.refinedL2SubCells, current0.refinedL2SubCells] })}`);
    expect(current1.boundaryDetail).toBe("active");
    expect(Math.abs(report.ratio - 1), "raised tier within 1% of the baseline's").toBeLessThanOrEqual(0.01);
    expect(current1.detailBaseSlots, "gate sits above level 2").toBe(current0.slots);
    expect(current1.refinedL2SubCells).toBe(current0.refinedL2SubCells);
    expect(current1.refinedL1SubCells).toBe(current0.refinedL1SubCells);
    expect(current1.refineRowBudget).toBe(current0.refineRowBudget);
  });
});

test.describe("prebaked", () => {
  test("a bake stays stacked and reports the same points on both trees", async ({ page }) => {
    test.setTimeout(900_000);
    await requireBaseline(page);
    const bakePath = "public/baked/lm-tiny.elpc";
    expect(existsSync(bakePath), `${bakePath} missing: bake it first (card 105 criterion 7)`).toBe(true);
    const header = elpcHeader(readFileSync(bakePath));
    const manifest = JSON.parse(readFileSync("public/baked/index.json", "utf8")) as { bakes?: Array<Record<string, unknown>> };
    const entry = (manifest.bakes ?? []).find((item) => JSON.stringify(item).includes("lm-tiny"));
    expect(entry, "manifest entry for lm-tiny").toBeTruthy();
    const id = String(entry!.id);
    const measure = async (origin: string, label: string) => {
      const { canvas } = await openPacked(page, { origin, params: cloudParams({ modelSource: id, plottedIterations: 8 }), preset: "extreme" });
      await expect(canvas).toHaveAttribute("data-orbit3d-sampler", "prebaked", { timeout: 120_000 });
      await page.waitForTimeout(600);
      const stats = await cloudStats(canvas);
      await screenshot(canvas, artifact(`prebaked-${label}.png`));
      return { label, ...levelRow(stats, 0), layout: stats.layout };
    };
    const current = await measure(CURRENT_ORIGIN, "current");
    const baseline = await measure(BASELINE_ORIGIN, "baseline");
    saveJson("prebaked.json", { header, id, current, baseline });
    console.log(`prebaked: ${JSON.stringify({ header, id, points: [current.points, baseline.points], layout: [current.layout, baseline.layout] })}`);
    for (const row of [current, baseline]) {
      expect(row.sampler).toBe("prebaked");
      expect(row.layout).toBe("stacked");
      expect(row.points).toBe(header.cellCount * 8);
    }
    expect(current.refinedL2SubCells).toBe(0);
    expect(current.detailBaseSlots).toBe(current.slots);
  });
});

test.describe("cost", () => {
  test("build time, warm render time and build bytes against the served baseline at the shipped settings and at 0.6", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const SAMPLE_COUNT = 3;
    type Run = { buildMs: number; stats: ReturnType<typeof levelRow>; timing: FrameTiming[] | null };
    const measure = async (origin: string, params: SimParams): Promise<Run[]> => {
      const runs: Run[] = [];
      for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
        const context = await page.context().browser()!.newContext({ viewport: VIEWPORT });
        const target = await context.newPage();
        const { canvas, buildMs } = await openPacked(target, { origin, params, preset: "extreme", timeoutMs: 600_000 });
        await target.waitForTimeout(1000);
        const stats = await cloudStats(canvas);
        expect(stats.sampler).toBe("gpu-sampled");
        // Warm render timing on the last load: three runs of 15 warm-up plus
        // 90 requestAnimationFrame intervals with card 103's helper.
        const timing: FrameTiming[] | null = sample === SAMPLE_COUNT - 1 ? [] : null;
        if (timing) for (let run = 0; run < 3; run += 1) timing.push(await frameTiming(target));
        runs.push({ buildMs, stats: levelRow(stats, buildMs), timing });
        await context.close();
      }
      return runs;
    };
    const summarise = (runs: Run[]) => {
      const timing = runs[SAMPLE_COUNT - 1].timing!;
      return {
        buildMs: runs.map((r) => r.buildMs),
        buildMedianMs: median(runs.map((r) => r.buildMs)),
        intervalMedianMs: timing.map((t) => t.intervalMedianMs),
        intervalMedian: median(timing.map((t) => t.intervalMedianMs)),
        renderMedianMs: timing.map((t) => t.medianMs),
        renderMethod: timing.map((t) => t.method),
        buildBytes: runs.map((r) => r.stats.buildBytes),
        samplerBytes: runs.map((r) => r.stats.samplerBytes),
        points: runs.map((r) => r.stats.points),
        stats: runs[0].stats,
      };
    };
    const CASES = [
      { label: "defaults", params: frozenParams({ boundaryDetail: 1, tailRefinement: 0, cycleSpeed: 0.1, cycleBands: 4, edgeGlow: 0.2 }) },
      { label: "tail0.6", params: frozenParams({ boundaryDetail: 0, tailRefinement: 0.6, cycleSpeed: 0.1, cycleBands: 4, edgeGlow: 0.2 }) },
    ];
    const report: Record<string, unknown> = {};
    for (const { label, params } of CASES) {
      const current = summarise(await measure(CURRENT_ORIGIN, params));
      const baseline = summarise(await measure(BASELINE_ORIGIN, params));
      const ratios = {
        buildTime: current.buildMedianMs / baseline.buildMedianMs,
        warmRender: current.intervalMedian / baseline.intervalMedian,
        gpuRender: median(current.renderMedianMs) / median(baseline.renderMedianMs),
        buildBytes: median(current.buildBytes) / median(baseline.buildBytes),
        points: median(current.points) / median(baseline.points),
      };
      report[label] = { current, baseline, ratios };
      console.log(`cost ${label}: ${JSON.stringify({ build: [current.buildMs, baseline.buildMs], interval: [current.intervalMedianMs, baseline.intervalMedianMs], render: [current.renderMedianMs, baseline.renderMedianMs, current.renderMethod[0]], bytes: [current.buildBytes[0], baseline.buildBytes[0]], points: [current.points[0], baseline.points[0]], ratios })}`);
      if (label === "defaults") {
        expect(ratios.buildTime, "build time within 20%").toBeLessThanOrEqual(1.2);
        expect(ratios.warmRender, "warm render within 20%").toBeLessThanOrEqual(1.2);
        expect(median(current.buildBytes), "build bytes equal").toBe(median(baseline.buildBytes));
        expect(current.stats.points).toBe(baseline.stats.points);
      }
    }
    saveJson("cost.json", report);
  });
});

test.describe("evidence", () => {
  test("screenshots of the real-axis pose at 0, 0.3 and 0.6 and of the cardioid pose at 0.6 on both trees", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const record: Record<string, unknown> = {};
    const realAxis = async (origin: string, label: string, tailRefinement: number) => {
      const { canvas } = await openPacked(page, { origin, params: cloudParams({ tailRefinement }), preset: "extreme", timeoutMs: 600_000 });
      const pose = await realAxisPose(page, canvas);
      const path = artifact(`evidence-real-axis-${label}-tail${tailRefinement}.png`);
      const image = await screenshot(canvas, path);
      record[`real-axis-${label}-tail${tailRefinement}`] = { path, rect: TAIL_RECT, mean: meanLumaRect(image, TAIL_RECT), pose, stats: levelRow(await cloudStats(canvas), 0) };
    };
    for (const tailRefinement of TAIL_SETTINGS) await realAxis(CURRENT_ORIGIN, "current", tailRefinement);
    await realAxis(BASELINE_ORIGIN, "baseline", 0.6);
    for (const [origin, label] of [[CURRENT_ORIGIN, "current"], [BASELINE_ORIGIN, "baseline"]] as const) {
      const { canvas } = await openPacked(page, { origin, params: cloudParams({ tailRefinement: 0.6 }), preset: "extreme", timeoutMs: 600_000 });
      const pose = await cardioidPose(page, canvas);
      const path = artifact(`evidence-cardioid-${label}-tail0.6.png`);
      const image = await screenshot(canvas, path);
      record[`cardioid-${label}-tail0.6`] = { path, fraction: litFraction(image, pose.rect, CARDIOID_LIT_THRESHOLD), pose: { distance: pose.distance, azimuth: pose.azimuth, rect: pose.rect }, stats: levelRow(await cloudStats(canvas), 0) };
    }
    saveJson("evidence.json", record);
    console.log(`evidence: ${JSON.stringify(Object.keys(record))}`);
    // The slider is a live control: raising it from the drawer rebuilds with level 2.
    const { canvas } = await openPacked(page, { params: cloudParams(), preset: "balanced", timeoutMs: 600_000 });
    const handle = page.locator(".sim-view__drawer-handle");
    await handle.click();
    await setParam(page, "tailRefinement", 0.6);
    await expect(page.locator('[data-param-key="tailRefinement"]')).toHaveValue("0.6");
    await handle.click();
    await page.waitForTimeout(500);
    await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 600_000 });
    const live = await cloudStats(canvas);
    expect(live.refinedL2SubCells).toBeGreaterThan(0);
  });
});
