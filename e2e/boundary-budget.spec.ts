/**
 * Logistic-Mandelbrot boundary-detail ring, point and per-draw byte budgets.
 *
 *   npx playwright test e2e/boundary-budget.spec.ts --workers=1
 *
 * The unchanged dispatch base must be served on port 5174. Artefacts are
 * written under e2e/artifacts/boundary-ring/ (git-ignored).
 */
import { chromium, expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import playwrightConfig from "../playwright.config.ts";
import { MAX_SAMPLE_JOBS_PER_CALL } from "../src/app/orbitSampler.ts";
import { frameTiming, frozenParams, type FrameTiming, type SimParams } from "./harness/insideOut.ts";
import {
  BASELINE_ORIGIN,
  CURRENT_ORIGIN,
  cloudStats,
  dollyAt,
  elpcHeader,
  median,
  openPacked,
  realAxisPose,
  screenshot,
  type CloudStats,
  type ResolutionPreset,
} from "./harness/packedCells.ts";

const VIEWPORT = { width: 1280, height: 720 };
const ARTIFACT_DIR = "e2e/artifacts/boundary-ring";
const SAMPLE_COUNT = 8;
const MAX_DRAW_BOUND_BYTES = 400_000_000;
const MAX_DETAIL_POINTS = 12_500_000;
const DISPLAY_FRAME_MS = 1000 / 60;
const TREES = [
  { tree: "current", origin: CURRENT_ORIGIN },
  { tree: "baseline", origin: BASELINE_ORIGIN },
] as const;

test.use({ viewport: VIEWPORT });

const pinned = (overrides: SimParams = {}): SimParams => frozenParams(overrides);
const shipped = (overrides: SimParams = {}): SimParams =>
  frozenParams({
    boundaryDetail: 1,
    tailRefinement: 0.6,
    cycleBands: 4,
    edgeGlow: 0.2,
    ...overrides,
  });

function artifact(name: string): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  return `${ARTIFACT_DIR}/${name}`;
}

function saveJson(name: string, value: unknown): void {
  writeFileSync(artifact(name), JSON.stringify(value, null, 2));
}

async function requireBaseline(page: Page): Promise<void> {
  const response = await page.request.get(`${BASELINE_ORIGIN}/`, { timeout: 5000 }).catch(() => null);
  expect(
    response?.ok() ?? false,
    `no unchanged baseline served at ${BASELINE_ORIGIN}`,
  ).toBe(true);
}

interface MeasuredStats extends CloudStats {
  lowerTierPoints: number;
  resolvedDetailPoints: number;
  resolvedMainBoundBytes: number;
  resolvedDetailBoundBytes: number;
}

function measuredStats(stats: CloudStats): MeasuredStats {
  const splitSlots = stats.boundaryDetail === "active"
    ? Math.max(0, Math.min(stats.slots, stats.detailBaseSlots))
    : stats.slots;
  const lowerTierPoints = splitSlots * SAMPLE_COUNT;
  const resolvedDetailPoints = Number.isFinite(stats.detailPoints)
    ? stats.detailPoints
    : Math.max(0, stats.points - lowerTierPoints);
  return {
    ...stats,
    lowerTierPoints,
    resolvedDetailPoints,
    resolvedMainBoundBytes: Number.isFinite(stats.mainBoundBytes)
      ? stats.mainBoundBytes
      : lowerTierPoints * 32,
    resolvedDetailBoundBytes: Number.isFinite(stats.detailBoundBytes)
      ? stats.detailBoundBytes
      : resolvedDetailPoints * 32,
  };
}

interface BuildOptions {
  origin: string;
  params: SimParams;
  preset: ResolutionPreset;
  cpu?: boolean;
  timeoutMs?: number;
}

async function inFreshBuild<T>(
  page: Page,
  options: BuildOptions,
  use?: (target: Page, canvas: Locator) => Promise<T>,
): Promise<{ stats: MeasuredStats; buildMs: number; extra: T | null }> {
  const context = await page.context().browser()!.newContext({ viewport: VIEWPORT });
  try {
    const target = await context.newPage();
    const { canvas, buildMs } = await openPacked(target, {
      timeoutMs: 600_000,
      ...options,
    });
    await target.waitForTimeout(500);
    const extra = use ? await use(target, canvas) : null;
    return { stats: measuredStats(await cloudStats(canvas)), buildMs, extra };
  } finally {
    await context.close();
  }
}

async function wholeCardioidPose(
  page: Page,
  canvas: Locator,
): Promise<{ distance: number; azimuth: number; steps: number }> {
  const box = (await canvas.boundingBox())!;
  let steps = 0;
  let pose = { distance: Number(await canvas.getAttribute("data-orbit3d-camera-distance")), azimuth: NaN };
  while (pose.distance > 2.7 && steps < 12) {
    pose = await dollyAt(page, canvas, box.width / 2, box.height / 2, 1);
    steps += 1;
  }
  expect(pose.distance, "whole-cardioid pose enters the detail tier").toBeLessThanOrEqual(2.8);
  expect(pose.distance, "whole-cardioid pose keeps the whole body in frame").toBeGreaterThanOrEqual(2);
  return { ...pose, steps };
}

function meanAbsoluteRgbDifference(
  left: Awaited<ReturnType<typeof screenshot>>,
  right: Awaited<ReturnType<typeof screenshot>>,
): number {
  expect(left.width).toBe(right.width);
  expect(left.height).toBe(right.height);
  let sum = 0;
  let channels = 0;
  for (let index = 0; index < left.rgba.length; index += 4) {
    sum += Math.abs(left.rgba[index] - right.rgba[index]);
    sum += Math.abs(left.rgba[index + 1] - right.rgba[index + 1]);
    sum += Math.abs(left.rgba[index + 2] - right.rgba[index + 2]);
    channels += 3;
  }
  return channels === 0 ? 0 : sum / channels;
}

function relativeRatio(current: number, baseline: number): number {
  return current / baseline;
}

test.describe("budget", () => {
  test("20M extreme ceiling, raised-tier cap and lower-tier compatibility", async ({ page }) => {
    test.setTimeout(2_400_000);
    await requireBaseline(page);
    const rows: Array<{
      tree: string;
      preset: ResolutionPreset;
      boundaryDetail: number;
      tailRefinement: number;
      buildMs: number;
      stats: MeasuredStats;
    }> = [];
    const take = async (
      tree: string,
      origin: string,
      preset: ResolutionPreset,
      boundaryDetail: number,
      tailRefinement: number,
    ): Promise<MeasuredStats> => {
      const run = await inFreshBuild(page, {
        origin,
        preset,
        params: pinned({ boundaryDetail, tailRefinement }),
      });
      rows.push({ tree, preset, boundaryDetail, tailRefinement, buildMs: run.buildMs, stats: run.stats });
      return run.stats;
    };

    for (const tailRefinement of [0.6, 0.3, 0]) {
      for (const { tree, origin } of TREES) {
        const stats = await take(tree, origin, "extreme", 1, tailRefinement);
        if (tree === "current") {
          expect(stats.detailPoints, "current publishes its raised-tier point allocation").toBe(stats.resolvedDetailPoints);
          expect(stats.mainBoundBytes, "current publishes its main allocation").toBe(stats.resolvedMainBoundBytes);
          expect(stats.detailBoundBytes, "current publishes its raised allocation").toBe(stats.resolvedDetailBoundBytes);
          expect(stats.resolvedDetailPoints).toBeLessThanOrEqual(MAX_DETAIL_POINTS);
          expect(stats.resolvedMainBoundBytes).toBeLessThanOrEqual(MAX_DRAW_BOUND_BYTES);
          expect(stats.resolvedDetailBoundBytes).toBeLessThanOrEqual(MAX_DRAW_BOUND_BYTES);
          expect(stats.points).toBeLessThanOrEqual(stats.pointBudget);
        }
      }
    }
    saveJson("layout-precheck.json", { rows });

    const at = (
      tree: string,
      preset: ResolutionPreset,
      boundaryDetail: number,
      tailRefinement: number,
    ): MeasuredStats => rows.find((row) =>
      row.tree === tree && row.preset === preset && row.boundaryDetail === boundaryDetail &&
      row.tailRefinement === tailRefinement
    )!.stats;
    const currentDefault = at("current", "extreme", 1, 0.6);
    const baselineDefault = at("baseline", "extreme", 1, 0.6);
    expect(currentDefault.pointBudget).toBe(20_000_000);
    expect(baselineDefault.pointBudget).toBe(16_000_000);
    expect(currentDefault.detailRing).toBe(4);
    expect(currentDefault.detailCoreCandidates).toBeGreaterThan(0);
    expect(currentDefault.detailCandidatesAdmitted)
      .toBeGreaterThanOrEqual(currentDefault.detailCoreCandidates);
    expect(currentDefault.refinedDetailSubCells)
      .toBeGreaterThanOrEqual(baselineDefault.refinedDetailSubCells);
    saveJson(`ring-selection-r${currentDefault.detailRing}.json`, {
      current: currentDefault,
      baseline: baselineDefault,
      detailPointRatio: currentDefault.resolvedDetailPoints / baselineDefault.resolvedDetailPoints,
      baselineAttemptCoreCandidates: 81_380,
    });
    expect(currentDefault.resolvedDetailPoints / baselineDefault.resolvedDetailPoints)
      .toBeGreaterThanOrEqual(1.25);

    const currentDetail0 = await take("current", CURRENT_ORIGIN, "extreme", 0, 0.6);
    const baselineDetail0 = await take("baseline", BASELINE_ORIGIN, "extreme", 0, 0.6);
    for (const key of ["points", "slots", "baseCells", "refinedSubCells"] as const) {
      expect(currentDetail0[key], `detail 0 ${key}`).toBe(baselineDetail0[key]);
    }
    expect(currentDetail0.detailRing).toBe(0);

    const currentUltra = await take("current", CURRENT_ORIGIN, "ultra", 1, 0.6);
    const baselineUltra = await take("baseline", BASELINE_ORIGIN, "ultra", 1, 0.6);
    expect(currentUltra.pointBudget).toBe(16_000_000);
    expect(baselineUltra.pointBudget).toBe(16_000_000);
    expect(currentUltra.detailRing).toBe(1);
    if (baselineUltra.resolvedDetailPoints <= MAX_DETAIL_POINTS) {
      for (const key of ["points", "slots", "baseCells", "refinedSubCells", "resolvedDetailPoints"] as const) {
        expect(currentUltra[key], `ultra ${key}`).toBe(baselineUltra[key]);
      }
    } else {
      expect(currentUltra.resolvedDetailPoints).toBe(MAX_DETAIL_POINTS);
    }

    const maxTextureSize = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      return gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0;
    });
    const largestBatchWidth = Math.min(maxTextureSize, MAX_SAMPLE_JOBS_PER_CALL);
    const largestBatchHeight = Math.ceil(MAX_SAMPLE_JOBS_PER_CALL / largestBatchWidth);
    expect(largestBatchHeight).toBeLessThanOrEqual(maxTextureSize);
    saveJson("budget.json", {
      rows,
      defaultDetailPointRatio: currentDefault.resolvedDetailPoints / baselineDefault.resolvedDetailPoints,
      ringSelection: {
        ring: currentDefault.detailRing,
        coreCandidates: currentDefault.detailCoreCandidates,
        ringCandidates: currentDefault.detailRingCandidates,
        candidatesAdmitted: currentDefault.detailCandidatesAdmitted,
        ringCells: currentDefault.detailRingCells,
        ringBoundedCells: currentDefault.detailRingBoundedCells,
        baselineAttemptCoreCandidates: 81_380,
      },
      baselineCrossesCap: rows.filter((row) => row.tree === "baseline" && row.boundaryDetail === 1).map((row) => ({
        tailRefinement: row.tailRefinement,
        detailPoints: row.stats.resolvedDetailPoints,
        detailBoundBytes: row.stats.resolvedDetailBoundBytes,
        crossesPointCap: row.stats.resolvedDetailPoints > MAX_DETAIL_POINTS,
        crossesByteCap: row.stats.resolvedDetailBoundBytes > MAX_DRAW_BOUND_BYTES,
      })),
      samplerBatch: { maxJobs: MAX_SAMPLE_JOBS_PER_CALL, maxTextureSize, largestBatchWidth, largestBatchHeight },
    });
  });
});

test.describe("gating", () => {
  test("the raised tier stays invisible at the opening pose and fades in inside the show distance", async ({ page }) => {
    test.setTimeout(1_200_000);
    const detail1 = await inFreshBuild(page, {
      origin: CURRENT_ORIGIN,
      preset: "extreme",
      params: pinned({ boundaryDetail: 1, tailRefinement: 0.6 }),
    }, async (_target, canvas) => ({
      opacity: Number(await canvas.getAttribute("data-orbit3d-boundary-detail-opacity")),
      image: await screenshot(canvas),
    }));
    const detail0 = await inFreshBuild(page, {
      origin: CURRENT_ORIGIN,
      preset: "extreme",
      params: pinned({ boundaryDetail: 0, tailRefinement: 0.6 }),
    }, async (_target, canvas) => screenshot(canvas));
    expect(detail1.stats.boundaryDetail).toBe("active");
    expect(detail1.extra!.opacity).toBe(0);
    const openingDifference = meanAbsoluteRgbDifference(detail1.extra!.image, detail0.extra!);
    expect(openingDifference).toBeLessThanOrEqual(1);

    const shown = await inFreshBuild(page, {
      origin: CURRENT_ORIGIN,
      preset: "extreme",
      params: pinned({ boundaryDetail: 1, tailRefinement: 0.6 }),
    }, async (target, canvas) => {
      const pose = await realAxisPose(target, canvas);
      await expect.poll(
        async () => Number(await canvas.getAttribute("data-orbit3d-boundary-detail-opacity")),
        { timeout: 10_000 },
      ).toBe(1);
      return {
        pose,
        opacity: Number(await canvas.getAttribute("data-orbit3d-boundary-detail-opacity")),
      };
    });
    saveJson("gating.json", {
      opening: { difference: openingDifference, opacity: detail1.extra!.opacity },
      shown: shown.extra,
    });
  });
});

interface TimedRun {
  buildMs: number;
  stats: MeasuredStats;
  timing: FrameTiming;
  pose: { distance: number; azimuth: number; steps?: number };
}

async function timedBuild(
  page: Page,
  origin: string,
  pose: "opening" | "whole-cardioid" | "real-axis",
): Promise<TimedRun> {
  const run = await inFreshBuild(page, {
    origin,
    preset: "extreme",
    params: shipped({ cycleSpeed: 0.1 }),
  }, async (target, canvas) => {
    let camera: { distance: number; azimuth: number; steps?: number } = {
      distance: Number(await canvas.getAttribute("data-orbit3d-camera-distance")),
      azimuth: Number(await canvas.getAttribute("data-orbit3d-camera-azimuth")),
    };
    if (pose === "whole-cardioid") camera = await wholeCardioidPose(target, canvas);
    if (pose === "real-axis") camera = await realAxisPose(target, canvas);
    await target.waitForTimeout(500);
    return { timing: await frameTiming(target), camera };
  });
  return { buildMs: run.buildMs, stats: run.stats, timing: run.extra!.timing, pose: run.extra!.camera };
}

function timingSummary(runs: TimedRun[]) {
  const gpuMedianMs = median(runs.map((run) => run.timing.medianMs));
  return {
    buildMs: runs.map((run) => run.buildMs),
    buildMedianMs: median(runs.map((run) => run.buildMs)),
    gpuMs: runs.map((run) => run.timing.medianMs),
    gpuMedianMs,
    methods: runs.map((run) => run.timing.method),
    intervalMs: runs.map((run) => run.timing.intervalMedianMs),
    buildBytes: runs.map((run) => run.stats.buildBytes),
    samplerBytes: runs.map((run) => run.stats.samplerBytes),
    points: runs.map((run) => run.stats.points),
    poses: runs.map((run) => run.pose),
    displayFramesAt60Hz: Math.ceil(gpuMedianMs / DISPLAY_FRAME_MS),
    crosses60HzFrame: gpuMedianMs > DISPLAY_FRAME_MS,
  };
}

test.describe("cost", () => {
  test("three matched GPU samples plus headed display pacing at all three poses", async ({ page }) => {
    test.setTimeout(3_600_000);
    await requireBaseline(page);
    const runs: Record<string, Record<string, TimedRun[]>> = {
      current: { opening: [], "whole-cardioid": [], "real-axis": [] },
      baseline: { opening: [], "whole-cardioid": [], "real-axis": [] },
    };
    for (let sample = 0; sample < 3; sample += 1) {
      for (const { tree, origin } of TREES) {
        for (const pose of ["opening", "whole-cardioid", "real-axis"] as const) {
          const run = await timedBuild(page, origin, pose);
          runs[tree][pose].push(run);
          console.log(`boundary budget cost ${tree} ${pose} ${sample}: ${JSON.stringify({
            buildMs: run.buildMs,
            points: run.stats.points,
            gpuMs: run.timing.medianMs,
            method: run.timing.method,
            intervalMs: run.timing.intervalMedianMs,
            distance: run.pose.distance,
          })}`);
        }
      }
    }

    const summary = Object.fromEntries(TREES.map(({ tree }) => [
      tree,
      Object.fromEntries(Object.entries(runs[tree]).map(([pose, values]) => [pose, timingSummary(values)])),
    ])) as Record<string, Record<string, ReturnType<typeof timingSummary>>>;
    const openingCurrent = summary.current.opening;
    const openingBaseline = summary.baseline.opening;
    const ratios = {
      openingGpu: openingCurrent.gpuMedianMs / openingBaseline.gpuMedianMs,
      build: openingCurrent.buildMedianMs / openingBaseline.buildMedianMs,
      buildBytes: median(openingCurrent.buildBytes) / median(openingBaseline.buildBytes),
      samplerBytes: median(openingCurrent.samplerBytes) / median(openingBaseline.samplerBytes),
      wholeCardioidGpu: summary.current["whole-cardioid"].gpuMedianMs /
        summary.baseline["whole-cardioid"].gpuMedianMs,
      realAxisGpu: summary.current["real-axis"].gpuMedianMs /
        summary.baseline["real-axis"].gpuMedianMs,
    };
    expect(ratios.build).toBeLessThanOrEqual(1.6);
    expect(ratios.buildBytes).toBeLessThanOrEqual(1.5);
    expect(ratios.samplerBytes).toBeLessThanOrEqual(1.5);
    const gpuTimed = (pose: string): boolean => TREES.every(({ tree }) =>
      runs[tree][pose].every((run) => run.timing.method === "gpu-timer")
    );
    if (gpuTimed("opening")) expect(ratios.openingGpu).toBeLessThanOrEqual(1.05);
    if (gpuTimed("whole-cardioid")) expect(ratios.wholeCardioidGpu).toBeLessThanOrEqual(1.5);
    if (gpuTimed("real-axis")) expect(ratios.realAxisGpu).toBeLessThanOrEqual(1.5);

    const headed: Record<string, Record<string, FrameTiming & { pose: TimedRun["pose"] }>> = {
      current: {},
      baseline: {},
    };
    const args = playwrightConfig.use?.launchOptions?.args ?? [];
    const browser = await chromium.launch({ headless: false, args });
    try {
      for (const { tree, origin } of TREES) {
        for (const pose of ["opening", "whole-cardioid", "real-axis"] as const) {
          const context = await browser.newContext({ viewport: VIEWPORT });
          try {
            const target = await context.newPage();
            const { canvas } = await openPacked(target, {
              origin,
              preset: "extreme",
              params: shipped({ cycleSpeed: 0.1 }),
              timeoutMs: 600_000,
            });
            let camera: TimedRun["pose"] = {
              distance: Number(await canvas.getAttribute("data-orbit3d-camera-distance")),
              azimuth: Number(await canvas.getAttribute("data-orbit3d-camera-azimuth")),
            };
            if (pose === "whole-cardioid") camera = await wholeCardioidPose(target, canvas);
            if (pose === "real-axis") camera = await realAxisPose(target, canvas);
            await target.waitForTimeout(500);
            headed[tree][pose] = { ...(await frameTiming(target)), pose: camera };
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
    saveJson("cost.json", { runs, summary, ratios, headed });
  });
});

test.describe("unchanged", () => {
  test("CPU fallback and prebaked selection match the served baseline", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const cpuParams = pinned({ boundaryDetail: 1 });
    delete cpuParams.tailRefinement;
    const currentCpu = await inFreshBuild(page, {
      origin: CURRENT_ORIGIN,
      preset: "balanced",
      params: cpuParams,
      cpu: true,
    });
    const baselineCpu = await inFreshBuild(page, {
      origin: BASELINE_ORIGIN,
      preset: "balanced",
      params: cpuParams,
      cpu: true,
    });
    for (const key of ["pointBudget", "points", "slots", "refineRowBudget"] as const) {
      expect(currentCpu.stats[key], `CPU ${key}`).toBe(baselineCpu.stats[key]);
    }
    expect(currentCpu.stats.detailPoints).toBe(0);

    const bakePath = "public/baked/lm-tiny.elpc";
    expect(existsSync(bakePath), `${bakePath} missing: run the stage 108 bake command`).toBe(true);
    const header = elpcHeader(readFileSync(bakePath));
    const manifest = JSON.parse(readFileSync("public/baked/index.json", "utf8")) as { bakes?: Array<Record<string, unknown>> };
    const entry = (manifest.bakes ?? []).find((item) => JSON.stringify(item).includes("lm-tiny"));
    expect(entry, "manifest entry for lm-tiny").toBeTruthy();
    const modelSource = String(entry!.id);
    const prebaked: Record<string, MeasuredStats> = {};
    for (const { tree, origin } of TREES) {
      const run = await inFreshBuild(page, {
        origin,
        preset: "extreme",
        params: pinned({ modelSource, plottedIterations: 8 }),
      }, async (_target, canvas) => {
        await expect(canvas).toHaveAttribute("data-orbit3d-sampler", "prebaked", { timeout: 120_000 });
      });
      prebaked[tree] = run.stats;
      expect(run.stats.sampler).toBe("prebaked");
      expect(run.stats.points).toBe(header.cellCount * SAMPLE_COUNT);
    }
    expect(prebaked.current.points).toBe(prebaked.baseline.points);
    saveJson("unchanged.json", {
      cpu: { current: currentCpu, baseline: baselineCpu },
      prebaked: { header, modelSource, ...prebaked },
    });
  });
});

test.describe("hybrid", () => {
  test("the hybrid cloud follows the same point and draw caps", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const rows: Record<string, { buildMs: number; stats: MeasuredStats }> = {};
    for (const { tree, origin } of TREES) {
      const run = await inFreshBuild(page, {
        origin,
        preset: "extreme",
        params: pinned({ geometryMode: "hybrid", boundaryDetail: 1, tailRefinement: 0.6 }),
        timeoutMs: 900_000,
      });
      rows[tree] = { buildMs: run.buildMs, stats: run.stats };
      expect(run.stats.points).toBeLessThanOrEqual(run.stats.pointBudget);
      if (tree === "current") {
        expect(run.stats.resolvedMainBoundBytes).toBeLessThanOrEqual(MAX_DRAW_BOUND_BYTES);
        expect(run.stats.resolvedDetailBoundBytes).toBeLessThanOrEqual(MAX_DRAW_BOUND_BYTES);
      }
    }
    saveJson("hybrid.json", rows);
  });
});

test.describe("evidence", () => {
  test("tier-shown screenshots at the whole-cardioid and real-axis poses", async ({ page }) => {
    test.setTimeout(1_800_000);
    await requireBaseline(page);
    const rows: Record<string, unknown> = {};
    for (const { tree, origin } of TREES) {
      for (const pose of ["whole-cardioid", "real-axis"] as const) {
        const run = await inFreshBuild(page, {
          origin,
          preset: "extreme",
          params: shipped(),
        }, async (target, canvas) => {
          const camera = pose === "whole-cardioid"
            ? await wholeCardioidPose(target, canvas)
            : await realAxisPose(target, canvas);
          const path = artifact(`evidence-${pose}-${tree}.png`);
          await canvas.screenshot({ path });
          return { camera, path };
        });
        rows[`${pose}-${tree}`] = { ...run.extra!, stats: run.stats };
      }
    }
    saveJson("evidence.json", rows);
  });
});
