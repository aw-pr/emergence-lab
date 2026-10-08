/**
 * Logistic-Mandelbrot extreme candidate pool: integration evidence for stage
 * 107 criteria 2-8 (docs/stages/107-logistic-mandelbrot-extreme-pool.md).
 *
 *   npx playwright test e2e/extreme-pool.spec.ts --workers=1
 *
 * Describe titles match the card's --grep keys: layout, plane, cost,
 * boundary detail, cpu, prebaked, evidence. Every criterion reads the served
 * baseline, the unchanged tree on port 5174
 * (docs/audits/100-inside-out-spread-colouring.md, "Serving the baseline");
 * a missing baseline fails it. Artefacts land under
 * e2e/artifacts/extreme-pool/ (git-ignored).
 */
import { chromium, test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import playwrightConfig from "../playwright.config.ts";
import { frameTiming, frozenParams, type FrameTiming, type SimParams } from "./harness/insideOut.ts";
import {
  BASELINE_ORIGIN,
  CARDIOID_LIT_THRESHOLD,
  CURRENT_ORIGIN,
  PRESET_TARGETS,
  cardioidPose,
  cloudStats,
  elpcHeader,
  litFraction,
  median,
  openPacked,
  realAxisPose,
  screenshot,
  type CloudStats,
  type ResolutionPreset,
} from "./harness/packedCells.ts";

const VIEWPORT = { width: 1280, height: 720 };
const SAMPLES = 8;
const ARTIFACT_DIR = "e2e/artifacts/extreme-pool";
/** The pool this card raises `extreme` to, and the pool the served baseline still has. */
const WIDENED_POOL = 2560 * 2560;
const BASELINE_POOL = 1920 * 1920;
const DISPLAY_FRAME_MS = 1000 / 60;
const TREES = [
  { tree: "current", origin: CURRENT_ORIGIN },
  { tree: "baseline", origin: BASELINE_ORIGIN },
] as const;

test.use({ viewport: VIEWPORT });

function artifact(name: string): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  return `${ARTIFACT_DIR}/${name}`;
}

function saveJson(name: string, value: unknown): void {
  writeFileSync(artifact(name), JSON.stringify(value, null, 2));
}

/** Camera parked, reveal, spin and phase off, splat growth 0; the settings a criterion names on top. */
const pinned = (overrides: SimParams = {}): SimParams => frozenParams(overrides);

/** The shipped colour defaults with the camera and phase pinned. */
const shipped = (overrides: SimParams = {}): SimParams =>
  frozenParams({ boundaryDetail: 1, tailRefinement: 0.6, cycleBands: 4, edgeGlow: 0.2, ...overrides });

async function requireBaseline(page: Page): Promise<void> {
  const response = await page.request.get(`${BASELINE_ORIGIN}/`, { timeout: 5000 }).catch(() => null);
  expect(
    response?.ok() ?? false,
    `no unchanged baseline served at ${BASELINE_ORIGIN} (see docs/audits/100-inside-out-spread-colouring.md, "Serving the baseline")`,
  ).toBe(true);
}

/** The figures the audit's layout table needs, from one build. */
function layoutRow(stats: CloudStats, buildMs: number) {
  return {
    buildMs,
    sampler: stats.sampler,
    layout: stats.layout,
    points: stats.points,
    pointBudget: stats.pointBudget,
    candidateCells: stats.candidateCells,
    boundedCandidates: stats.boundedCandidates,
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

type LayoutRow = ReturnType<typeof layoutRow>;

/**
 * Page events that would invalidate a measurement: a navigation after the
 * sim page loaded, a renderer crash, or an uncaught page error. Recorded in
 * each report so an interrupted load is visible rather than silently retried.
 */
const INCIDENTS: string[] = [];

/** Whether an error means the page went away under the measurement rather than failing it. */
function pageWentAway(error: unknown): boolean {
  const message = (error as Error).message ?? String(error);
  return /Execution context was destroyed|Target crashed|Target page, context or browser has been closed/.test(message);
}

/**
 * One build in its own context, closed afterwards so nothing shares the GPU
 * with the next load. A load whose page is reloaded or crashes mid-measurement
 * is taken again once in a fresh context; the incident is recorded.
 */
async function buildInContext(
  page: Page,
  options: { origin: string; params: SimParams; preset: ResolutionPreset; cpu?: boolean; timeoutMs?: number },
  use?: (target: Page, canvas: ReturnType<Page["locator"]>) => Promise<void>,
): Promise<LayoutRow> {
  try {
    return await buildInFreshContext(page, options, use);
  } catch (error) {
    if (!pageWentAway(error)) throw error;
    INCIDENTS.push(`${new Date().toISOString().slice(11, 23)} ${options.origin} measurement interrupted (${(error as Error).message.split("\n")[0]}); load taken again`);
    return await buildInFreshContext(page, options, use);
  }
}

async function buildInFreshContext(
  page: Page,
  options: { origin: string; params: SimParams; preset: ResolutionPreset; cpu?: boolean; timeoutMs?: number },
  use?: (target: Page, canvas: ReturnType<Page["locator"]>) => Promise<void>,
): Promise<LayoutRow> {
  const context = await page.context().browser()!.newContext({ viewport: VIEWPORT });
  try {
    const target = await context.newPage();
    const stamp = () => new Date().toISOString().slice(11, 23);
    let loaded = false;
    target.on("framenavigated", (frame) => {
      if (frame === target.mainFrame() && loaded) INCIDENTS.push(`${stamp()} ${options.origin} navigated to ${frame.url()}`);
    });
    target.on("crash", () => INCIDENTS.push(`${stamp()} ${options.origin} renderer crashed`));
    target.on("pageerror", (error) => {
      if (loaded) INCIDENTS.push(`${stamp()} ${options.origin} page error ${error.message.split("\n")[0]}`);
    });
    target.on("console", (message) => {
      if (loaded && /vite|lost|reload|context/i.test(message.text())) INCIDENTS.push(`${stamp()} ${options.origin} console ${message.text().slice(0, 160)}`);
    });
    const { canvas, buildMs } = await openPacked(target, { timeoutMs: 600_000, ...options });
    loaded = true;
    await target.waitForTimeout(500);
    if (use) await use(target, canvas);
    return layoutRow(await cloudStats(canvas), buildMs);
  } finally {
    await context.close();
  }
}

function relative(a: number, b: number): number {
  return Math.abs(a / b - 1);
}

test.describe("layout", () => {
  test("the pool, the base tier and the budget on both trees", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const maxTextureSize = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      return gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : null;
    });
    const rows: Array<{ preset: ResolutionPreset; tailRefinement: number; tree: string } & LayoutRow> = [];
    const find = (preset: ResolutionPreset, tailRefinement: number, tree: string): LayoutRow =>
      rows.find((row) => row.preset === preset && row.tailRefinement === tailRefinement && row.tree === tree)!;
    for (const preset of ["extreme", "ultra"] as const) {
      for (const tailRefinement of [0.6, 0]) {
        for (const { tree, origin } of TREES) {
          const row = await buildInContext(page, { origin, params: pinned({ boundaryDetail: 0, tailRefinement }), preset });
          rows.push({ preset, tailRefinement, tree, ...row });
          console.log(`layout ${preset} tail ${tailRefinement} ${tree}: ${JSON.stringify({ candidates: row.candidateCells, bounded: row.boundedCandidates, base: row.baseCells, baseRows: row.baseRows, slots: row.slots, budget: row.refineRowBudget, l1: [row.refinedL1SubCells, row.refinedL1Rows], l2: [row.refinedL2SubCells, row.refinedL2Rows], points: row.points, bytes: [row.buildBytes, row.samplerBytes], ms: row.buildMs })}`);
          expect(row.sampler, `${preset} ${tree} sampler`).toBe("gpu-sampled");
          expect(row.points, `${preset} tail ${tailRefinement} ${tree} within budget`).toBeLessThanOrEqual(row.pointBudget);
        }
      }
    }
    const ratios: Record<string, number> = {};
    for (const tailRefinement of [0.6, 0]) {
      const current = find("extreme", tailRefinement, "current");
      const baseline = find("extreme", tailRefinement, "baseline");
      ratios[`extreme-tail${tailRefinement}-baseCells`] = current.baseCells / baseline.baseCells;
      ratios[`extreme-tail${tailRefinement}-candidateCells`] = current.candidateCells / baseline.candidateCells;
      expect(relative(current.candidateCells, WIDENED_POOL), `current candidate cells at tail ${tailRefinement}`).toBeLessThanOrEqual(0.02);
      expect(relative(current.candidateCells, PRESET_TARGETS.extreme), "the production target is the widened pool").toBeLessThanOrEqual(0.02);
      expect(relative(baseline.candidateCells, BASELINE_POOL), `baseline candidate cells at tail ${tailRefinement}`).toBeLessThanOrEqual(0.02);
      expect(current.baseCells / baseline.baseCells, `base cells ratio at tail ${tailRefinement}`).toBeGreaterThanOrEqual(1.72);
      expect(current.baseCells / baseline.baseCells, `base cells ratio at tail ${tailRefinement}`).toBeLessThanOrEqual(1.84);
      expect(current.layout, `current layout at tail ${tailRefinement}`).toBe("packed");
      expect(baseline.layout, `baseline layout at tail ${tailRefinement}`).toBe("packed");
      if (tailRefinement === 0.6) {
        const currentLevels = current.refinedL1Rows + current.refinedL2Rows;
        const baselineLevels = baseline.refinedL1Rows + baseline.refinedL2Rows;
        ratios["extreme-tail0.6-levelRows"] = currentLevels / baselineLevels;
        expect(current.refineRowBudget, "refinement row budget").toBe(baseline.refineRowBudget);
        expect(relative(currentLevels, baselineLevels), "level-1 plus level-2 rows within 1%").toBeLessThanOrEqual(0.01);
      }
    }
    for (const tailRefinement of [0.6, 0]) {
      const current = find("ultra", tailRefinement, "current");
      const baseline = find("ultra", tailRefinement, "baseline");
      for (const key of ["candidateCells", "baseCells", "refinedSubCells", "points", "slots"] as const) {
        expect(current[key], `ultra tail ${tailRefinement} ${key}`).toBe(baseline[key]);
      }
    }
    saveJson("layout.json", { maxTextureSize, widenedPool: WIDENED_POOL, baselinePool: BASELINE_POOL, rows, ratios });
    console.log(`layout ratios: ${JSON.stringify({ maxTextureSize, ...ratios })}`);
  });
});

test.describe("plane", () => {
  test("the cardioid lattice is denser on the tree under test and unchanged at ultra", async ({ page }) => {
    test.setTimeout(1_500_000);
    await requireBaseline(page);
    const measure = async (origin: string, tree: string, preset: ResolutionPreset) => {
      const { canvas } = await openPacked(page, {
        origin,
        params: pinned({ boundaryDetail: 0, tailRefinement: 0.6 }),
        preset,
        timeoutMs: 600_000,
      });
      const pose = await cardioidPose(page, canvas);
      const path = artifact(`plane-${tree}-${preset}.png`);
      const image = await screenshot(canvas, path);
      const stats = await cloudStats(canvas);
      return {
        tree,
        preset,
        path,
        fraction: litFraction(image, pose.rect, CARDIOID_LIT_THRESHOLD),
        pose: { distance: pose.distance, azimuth: pose.azimuth, rect: pose.rect, pointer: pose.pointer },
        candidateCells: stats.candidateCells,
        baseCells: stats.baseCells,
        points: stats.points,
      };
    };
    const currentExtreme = await measure(CURRENT_ORIGIN, "current", "extreme");
    const baselineExtreme = await measure(BASELINE_ORIGIN, "baseline", "extreme");
    const currentUltra = await measure(CURRENT_ORIGIN, "current", "ultra");
    const baselineUltra = await measure(BASELINE_ORIGIN, "baseline", "ultra");
    const report = {
      litThreshold: CARDIOID_LIT_THRESHOLD,
      currentExtreme,
      baselineExtreme,
      currentUltra,
      baselineUltra,
      ratios: {
        extreme: currentExtreme.fraction / baselineExtreme.fraction,
        ultra: currentUltra.fraction / baselineUltra.fraction,
      },
    };
    saveJson("plane.json", report);
    console.log(`plane: ${JSON.stringify({ fractions: [currentExtreme.fraction, baselineExtreme.fraction, currentUltra.fraction, baselineUltra.fraction], ratios: report.ratios })}`);
    expect(report.ratios.extreme, "extreme lit fraction at least 15% above the baseline").toBeGreaterThanOrEqual(1.15);
    expect(Math.abs(report.ratios.ultra - 1), "ultra lit fraction within 2%").toBeLessThanOrEqual(0.02);
  });
});

test.describe("cost", () => {
  test("build time, GPU frame time, build bytes and sampler bytes at the desktop default on both trees", async ({ page }) => {
    test.setTimeout(2_400_000);
    await requireBaseline(page);
    const SAMPLE_COUNT = 3;
    const params = shipped({ cycleSpeed: 0.1 });
    type Run = LayoutRow & { timing: FrameTiming };
    const measured: Record<string, Run[]> = { current: [], baseline: [] };
    // Matched loads interleaved across the trees, each in a fresh context
    // closed before the next, so clock and pacing drift fall on both alike.
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      for (const { tree, origin } of TREES) {
        let timing: FrameTiming | null = null;
        const row = await buildInContext(page, { origin, params, preset: "extreme" }, async (target) => {
          await target.waitForTimeout(500);
          timing = await frameTiming(target);
        });
        expect(row.sampler, `${tree} sample ${sample} sampler`).toBe("gpu-sampled");
        measured[tree].push({ ...row, timing: timing! });
        console.log(`cost ${tree} sample ${sample}: ${JSON.stringify({ ms: row.buildMs, points: row.points, buildBytes: row.buildBytes, samplerBytes: row.samplerBytes, gpuMs: timing!.medianMs, method: timing!.method, intervalMs: timing!.intervalMedianMs })}`);
      }
    }

    // Where the frame time goes: the same timing at boundary detail 0 with
    // Tail refinement 0 (the base tier alone) and 0.6 (base plus the two
    // levels), one load each on both trees; recorded, no bar.
    const breakdown: Array<{ tree: string; boundaryDetail: number; tailRefinement: number; points: number; slots: number; gpuMs: number; method: string; intervalMs: number; buildMs: number }> = [];
    for (const [boundaryDetail, tailRefinement] of [[0, 0], [0, 0.6]] as const) {
      for (const { tree, origin } of TREES) {
        let timing: FrameTiming | null = null;
        const row = await buildInContext(page, { origin, params: shipped({ cycleSpeed: 0.1, boundaryDetail, tailRefinement }), preset: "extreme" }, async (target) => {
          await target.waitForTimeout(500);
          timing = await frameTiming(target);
        });
        breakdown.push({ tree, boundaryDetail, tailRefinement, points: row.points, slots: row.slots, gpuMs: timing!.medianMs, method: timing!.method, intervalMs: timing!.intervalMedianMs, buildMs: row.buildMs });
        console.log(`cost breakdown ${tree} detail ${boundaryDetail} tail ${tailRefinement}: ${JSON.stringify(breakdown[breakdown.length - 1])}`);
      }
    }

    // The raised tier shown: the same timing at card 104's real-axis pose,
    // which dollies inside the tier's show distance, one load each on both
    // trees; recorded, no bar.
    const shown: Array<{ tree: string; cameraDistance: number; tierShown: boolean; points: number; gpuMs: number; method: string; intervalMs: number }> = [];
    for (const { tree, origin } of TREES) {
      let timing: FrameTiming | null = null;
      let cameraDistance = NaN;
      await buildInContext(page, { origin, params, preset: "extreme" }, async (target, canvas) => {
        const pose = await realAxisPose(target, canvas);
        cameraDistance = pose.distance;
        timing = await frameTiming(target);
      });
      const row = { tree, cameraDistance, tierShown: cameraDistance <= 2.8, points: measured[tree][0].points, gpuMs: timing!.medianMs, method: timing!.method, intervalMs: timing!.intervalMedianMs };
      shown.push(row);
      console.log(`cost tier shown ${tree}: ${JSON.stringify(row)}`);
    }

    // Real-display pacing: one headed launch for both trees, three timing
    // runs each; recorded, no bar. Unavailable without a GUI session, in
    // which case the report says why.
    const headed: Record<string, FrameTiming[]> = { current: [], baseline: [] };
    let headedError: string | null = null;
    try {
      const args = playwrightConfig.use?.launchOptions?.args ?? [];
      const browser = await chromium.launch({ headless: false, args });
      try {
        for (const { tree, origin } of TREES) {
          const timeHeaded = async (): Promise<FrameTiming[]> => {
            const context = await browser.newContext({ viewport: VIEWPORT });
            try {
              const target = await context.newPage();
              await openPacked(target, { origin, params, preset: "extreme", timeoutMs: 600_000 });
              await target.waitForTimeout(1000);
              const runs: FrameTiming[] = [];
              for (let run = 0; run < 3; run += 1) runs.push(await frameTiming(target));
              return runs;
            } finally {
              await context.close();
            }
          };
          try {
            headed[tree] = await timeHeaded();
          } catch (error) {
            if (!pageWentAway(error)) throw error;
            INCIDENTS.push(`${new Date().toISOString().slice(11, 23)} headed ${origin} measurement interrupted (${(error as Error).message.split("\n")[0]}); load taken again`);
            headed[tree] = await timeHeaded();
          }
        }
      } finally {
        await browser.close();
      }
    } catch (error) {
      headedError = (error as Error).message.split("\n")[0];
    }

    const summarise = (runs: Run[]) => {
      const gpuMedianMs = median(runs.map((run) => run.timing.medianMs));
      return {
        buildMs: runs.map((run) => run.buildMs),
        buildMedianMs: median(runs.map((run) => run.buildMs)),
        renderMedianMs: runs.map((run) => run.timing.medianMs),
        renderMethod: runs.map((run) => run.timing.method),
        gpuMedianMs,
        /** Display frames at 60 Hz the median GPU time spans; above 1 the frame misses 16.7 ms. */
        displayFramesAt60Hz: Math.ceil(gpuMedianMs / DISPLAY_FRAME_MS),
        crosses60HzFrame: gpuMedianMs > DISPLAY_FRAME_MS,
        intervalMedianMs: runs.map((run) => run.timing.intervalMedianMs),
        intervalP90Ms: runs.map((run) => run.timing.intervalP90Ms),
        disjoint: runs.some((run) => run.timing.disjoint),
        points: runs.map((run) => run.points),
        buildBytes: runs.map((run) => run.buildBytes),
        samplerBytes: runs.map((run) => run.samplerBytes),
        stats: runs[0],
      };
    };
    const headedSummary = (runs: FrameTiming[]) =>
      runs.length === 0
        ? null
        : {
            intervalMedianMs: runs.map((run) => run.intervalMedianMs),
            intervalP90Ms: runs.map((run) => run.intervalP90Ms),
            renderMedianMs: runs.map((run) => run.medianMs),
            renderMethod: runs.map((run) => run.method),
          };
    const current = summarise(measured.current);
    const baseline = summarise(measured.baseline);
    const gpuTimed = [...measured.current, ...measured.baseline].every((run) => run.timing.method === "gpu-timer");
    const ratios = {
      buildTime: current.buildMedianMs / baseline.buildMedianMs,
      gpuFrame: gpuTimed ? current.gpuMedianMs / baseline.gpuMedianMs : null,
      headlessInterval: median(current.intervalMedianMs) / median(baseline.intervalMedianMs),
      buildBytes: median(current.buildBytes) / median(baseline.buildBytes),
      samplerBytes: median(current.samplerBytes) / median(baseline.samplerBytes),
      points: median(current.points) / median(baseline.points),
      headedInterval:
        headed.current.length > 0 && headed.baseline.length > 0
          ? median(headed.current.map((run) => run.intervalMedianMs)) / median(headed.baseline.map((run) => run.intervalMedianMs))
          : null,
    };
    const report = {
      params,
      current,
      baseline,
      headed: { current: headedSummary(headed.current), baseline: headedSummary(headed.baseline), error: headedError },
      breakdown,
      shown,
      ratios,
      incidents: [...INCIDENTS],
    };
    saveJson("cost.json", report);
    console.log(`cost: ${JSON.stringify({ build: [current.buildMs, baseline.buildMs], gpu: [current.renderMedianMs, baseline.renderMedianMs, current.renderMethod[0]], buildBytes: [current.buildBytes[0], baseline.buildBytes[0]], samplerBytes: [current.samplerBytes[0], baseline.samplerBytes[0]], headed: report.headed, ratios })}`);
    expect(ratios.buildTime, `build time ${current.buildMs} vs ${baseline.buildMs}`).toBeLessThanOrEqual(2.2);
    if (gpuTimed) {
      expect(ratios.gpuFrame!, `GPU frame time ${current.renderMedianMs} vs ${baseline.renderMedianMs}`).toBeLessThanOrEqual(1.5);
    }
    expect(ratios.buildBytes, "build bytes").toBeLessThanOrEqual(1.5);
    expect(ratios.samplerBytes, "sampler bytes").toBeLessThanOrEqual(1.9);
  });
});

test.describe("boundary detail", () => {
  test("the raised tier keeps its gating and grows with the pool", async ({ page }) => {
    test.setTimeout(1_200_000);
    await requireBaseline(page);
    const current1 = await buildInContext(page, { origin: CURRENT_ORIGIN, params: pinned({ boundaryDetail: 1, tailRefinement: 0.6 }), preset: "extreme" });
    const current0 = await buildInContext(page, { origin: CURRENT_ORIGIN, params: pinned({ boundaryDetail: 0, tailRefinement: 0.6 }), preset: "extreme" });
    const baseline1 = await buildInContext(page, { origin: BASELINE_ORIGIN, params: pinned({ boundaryDetail: 1, tailRefinement: 0.6 }), preset: "extreme" });
    const report = {
      current1,
      current0,
      baseline1,
      ratio: current1.refinedDetailSubCells / Math.max(1, baseline1.refinedDetailSubCells),
    };
    saveJson("boundary-detail.json", report);
    console.log(`boundary detail: ${JSON.stringify({ detail: current1.boundaryDetail, raised: [current1.refinedDetailSubCells, baseline1.refinedDetailSubCells], ratio: report.ratio, detailBaseSlots: current1.detailBaseSlots, slotsAtDetail0: current0.slots, points: [current1.points, baseline1.points], budget: [current1.pointBudget, baseline1.pointBudget] })}`);
    expect(current1.boundaryDetail).toBe("active");
    expect(current1.detailBaseSlots, "gate sits above the detail-0 cloud").toBe(current0.slots);
    expect(report.ratio, "raised tier sub-cells over the baseline's").toBeGreaterThanOrEqual(1.5);
    expect(report.ratio, "raised tier sub-cells over the baseline's").toBeLessThanOrEqual(1.9);
    expect(current1.points).toBeLessThanOrEqual(current1.pointBudget);
  });
});

test.describe("cpu", () => {
  test("the fallback reaches the whole pool and keeps its automatic share", async ({ page }) => {
    test.setTimeout(900_000);
    await requireBaseline(page);
    // No `tailRefinement` key: the default, which the fallback reads as its
    // automatic share.
    const params = pinned({ boundaryDetail: 0 });
    delete params.tailRefinement;
    const current = await buildInContext(page, { origin: CURRENT_ORIGIN, params, preset: "extreme", cpu: true, timeoutMs: 850_000 });
    console.log(`cpu current: ${JSON.stringify({ ms: current.buildMs, candidates: current.candidateCells, base: current.baseCells, budget: current.refineRowBudget, pointBudget: current.pointBudget, points: current.points, l1: current.refinedL1SubCells, l2: current.refinedL2SubCells })}`);
    expect(current.sampler).toBe("cpu-sampled");
    expect(relative(current.candidateCells, WIDENED_POOL), "candidate cells within 2% of 2560 by 2560").toBeLessThanOrEqual(0.02);
    expect(current.refineRowBudget, "automatic share").toBe(Math.floor(current.pointBudget * 0.3));
    expect(current.points).toBeLessThanOrEqual(current.pointBudget);
    const baseline = await buildInContext(page, { origin: BASELINE_ORIGIN, params, preset: "extreme", cpu: true, timeoutMs: 600_000 });
    console.log(`cpu baseline: ${JSON.stringify({ ms: baseline.buildMs, candidates: baseline.candidateCells, base: baseline.baseCells, points: baseline.points })}`);
    saveJson("cpu.json", { current, baseline, buildRatio: current.buildMs / baseline.buildMs });
  });
});

test.describe("prebaked", () => {
  test("a bake stays stacked and reports the same points on both trees", async ({ page }) => {
    test.setTimeout(900_000);
    await requireBaseline(page);
    const bakePath = "public/baked/lm-tiny.elpc";
    expect(existsSync(bakePath), `${bakePath} missing: bake it first (card 107 criterion 7)`).toBe(true);
    const header = elpcHeader(readFileSync(bakePath));
    const manifest = JSON.parse(readFileSync("public/baked/index.json", "utf8")) as { bakes?: Array<Record<string, unknown>> };
    const entry = (manifest.bakes ?? []).find((item) => JSON.stringify(item).includes("lm-tiny"));
    expect(entry, "manifest entry for lm-tiny").toBeTruthy();
    const id = String(entry!.id);
    const measure = async (origin: string, tree: string) => {
      const { canvas } = await openPacked(page, { origin, params: pinned({ modelSource: id, plottedIterations: 8 }), preset: "extreme" });
      await expect(canvas).toHaveAttribute("data-orbit3d-sampler", "prebaked", { timeout: 120_000 });
      await page.waitForTimeout(600);
      const stats = await cloudStats(canvas);
      await screenshot(canvas, artifact(`prebaked-${tree}.png`));
      return { tree, ...layoutRow(stats, 0) };
    };
    const current = await measure(CURRENT_ORIGIN, "current");
    const baseline = await measure(BASELINE_ORIGIN, "baseline");
    saveJson("prebaked.json", { header, id, current, baseline });
    console.log(`prebaked: ${JSON.stringify({ header, id, points: [current.points, baseline.points], layout: [current.layout, baseline.layout] })}`);
    for (const row of [current, baseline]) {
      expect(row.sampler, `${row.tree} sampler`).toBe("prebaked");
      expect(row.layout, `${row.tree} layout`).toBe("stacked");
      expect(row.points, `${row.tree} points`).toBe(header.cellCount * SAMPLES);
    }
    expect(current.points).toBe(baseline.points);
  });
});

test.describe("evidence", () => {
  test("screenshots of the cardioid and real-axis poses at the shipped defaults on both trees", async ({ page }) => {
    test.setTimeout(1_500_000);
    await requireBaseline(page);
    const record: Record<string, unknown> = {};
    for (const { tree, origin } of TREES) {
      {
        const { canvas } = await openPacked(page, { origin, params: shipped(), preset: "extreme", timeoutMs: 600_000 });
        const pose = await cardioidPose(page, canvas);
        const path = artifact(`evidence-cardioid-${tree}.png`);
        const image = await screenshot(canvas, path);
        record[`cardioid-${tree}`] = {
          path,
          litFraction: litFraction(image, pose.rect, CARDIOID_LIT_THRESHOLD),
          pose: { distance: pose.distance, azimuth: pose.azimuth, rect: pose.rect },
          stats: layoutRow(await cloudStats(canvas), 0),
        };
      }
      {
        const { canvas } = await openPacked(page, { origin, params: shipped(), preset: "extreme", timeoutMs: 600_000 });
        const pose = await realAxisPose(page, canvas);
        const path = artifact(`evidence-real-axis-${tree}.png`);
        await screenshot(canvas, path);
        record[`real-axis-${tree}`] = { path, pose, stats: layoutRow(await cloudStats(canvas), 0) };
      }
    }
    saveJson("evidence.json", record);
    console.log(`evidence: ${JSON.stringify(Object.keys(record))}`);
  });
});
