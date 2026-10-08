/**
 * Stage 106: Tail refinement default, persistence migration, CPU cap, cost,
 * and operator evidence against the unchanged tree on port 5174.
 */
import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import playwrightConfig from "../playwright.config.ts";
import {
  frameTiming,
  paramSnapshot,
  setParam,
  type FrameTiming,
  type SimParams,
} from "./harness/insideOut.ts";
import {
  BASELINE_ORIGIN,
  CURRENT_ORIGIN,
  cloudStats,
  meanLuma,
  median,
  realAxisPose,
  screenshot,
  type CloudStats,
  type ResolutionPreset,
} from "./harness/packedCells.ts";

const VIEWPORT = { width: 1280, height: 720 };
const SLUG = "logistic-mandelbrot";
const ARTIFACT_DIR = "e2e/artifacts/tail-default";

type Stored = Record<string, number | boolean | string>;

interface OpenOptions {
  origin?: string;
  stored: Stored | string | null;
  preset: ResolutionPreset;
  cpu?: boolean;
}

interface Opened {
  context: BrowserContext;
  page: Page;
  canvas: Locator;
  buildMs: number;
}

test.use({ viewport: VIEWPORT });

function artifact(name: string): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  return `${ARTIFACT_DIR}/${name}`;
}

function saveJson(name: string, value: unknown): void {
  writeFileSync(artifact(name), JSON.stringify(value, null, 2));
}

function marked(values: SimParams = {}): Stored {
  return { __format: 2, ...values };
}

/** Camera and animation are fixed while the cloud is compared. */
function pinned(overrides: SimParams = {}): SimParams {
  return {
    autoRotate: false,
    continuousSpin: false,
    cascadeReveal: false,
    realAxisSweep: false,
    cycleSpeed: 0,
    geometryMode: "cloud",
    colourMode: "inside-out",
    ...overrides,
  };
}

async function requireBaseline(page: Page): Promise<void> {
  const response = await page.request.get(`${BASELINE_ORIGIN}/`, { timeout: 5000 }).catch(() => null);
  expect(
    response?.ok() ?? false,
    `no unchanged baseline served at ${BASELINE_ORIGIN}`,
  ).toBe(true);
}

async function openCase(browser: Browser, options: OpenOptions): Promise<Opened> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const raw = typeof options.stored === "string"
    ? options.stored
    : options.stored === null
      ? null
      : JSON.stringify(options.stored);
  await page.addInitScript(
    ([slug, stored, preset]) => {
      if (stored === null) localStorage.removeItem(`el:values:${slug}`);
      else localStorage.setItem(`el:values:${slug}`, stored);
      localStorage.setItem(`el:resolution:${slug}`, preset);
    },
    [SLUG, raw, options.preset] as const,
  );
  const origin = options.origin ?? CURRENT_ORIGIN;
  const query = options.cpu ? "?orbit3dSampler=cpu" : "";
  const started = Date.now();
  await page.goto(`${origin}/${query}#/${SLUG}`, { timeout: 30_000 });
  const canvas = page.locator(".sim-view__canvas");
  await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-orbit3d", { timeout: 30_000 });
  await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 600_000 });
  return { context, page, canvas, buildMs: Date.now() - started };
}

async function kernelDefaults(page: Page): Promise<Record<string, number | boolean | string>> {
  return page.evaluate(async () => {
    const { LogisticMandelbrotKernel } = await import("/src/sims/logistic-mandelbrot/kernel.ts");
    return Object.fromEntries(new LogisticMandelbrotKernel().paramSchema.map((descriptor) => [descriptor.key, descriptor.default]));
  });
}

function buildSignature(stats: CloudStats) {
  return {
    points: stats.points,
    baseCells: stats.baseCells,
    refinedL1SubCells: stats.refinedL1SubCells,
    refinedL2SubCells: stats.refinedL2SubCells,
    refinedSubCells: stats.refinedSubCells,
    slots: stats.slots,
    refineRowBudget: stats.refineRowBudget,
  };
}

function relativeDifference(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1);
}

test("default: the maximum is shipped, Reset keeps it, and its build matches the served baseline", async ({ browser, page }) => {
  test.setTimeout(1_800_000);
  await requireBaseline(page);

  const defaults = await openCase(browser, { stored: null, preset: "extreme" });
  try {
    const before = await paramSnapshot(defaults.page);
    expect(before.tailRefinement).toBe("0.6");
    expect(before.boundaryDetail).toBe("1");
    const descriptor = await defaults.page.evaluate(async () => {
      const { LogisticMandelbrotKernel } = await import("/src/sims/logistic-mandelbrot/kernel.ts");
      return new LogisticMandelbrotKernel().paramSchema.find(({ key }) => key === "tailRefinement");
    });
    expect(descriptor?.default).toBe(0.6);
    expect(descriptor?.max).toBe(0.6);
    await defaults.page.locator(".sim-view__drawer-handle").click();
    await defaults.page.getByRole("button", { name: "Reset to defaults", exact: true }).click();
    await expect(defaults.canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 600_000 });
    expect((await paramSnapshot(defaults.page)).tailRefinement).toBe("0.6");
  } finally {
    await defaults.context.close();
  }

  const rows: Array<Record<string, unknown>> = [];
  for (let sample = 0; sample < 3; sample += 1) {
    const params = pinned({ boundaryDetail: 1 });
    const current = await openCase(browser, { stored: marked(params), preset: "ultra" });
    const baseline = await openCase(browser, {
      origin: BASELINE_ORIGIN,
      stored: marked({ ...params, tailRefinement: 0.6 }),
      preset: "ultra",
    });
    try {
      const currentStats = await cloudStats(current.canvas);
      const baselineStats = await cloudStats(baseline.canvas);
      const currentLuma = meanLuma(await screenshot(current.canvas));
      const baselineLuma = meanLuma(await screenshot(baseline.canvas));
      expect(buildSignature(currentStats)).toEqual(buildSignature(baselineStats));
      expect(relativeDifference(currentLuma, baselineLuma), `sample ${sample} frame luma`).toBeLessThanOrEqual(0.01);
      rows.push({
        sample,
        current: { stats: buildSignature(currentStats), meanLuma: currentLuma },
        baselineExplicit06: { stats: buildSignature(baselineStats), meanLuma: baselineLuma },
      });
    } finally {
      await current.context.close();
      await baseline.context.close();
    }
  }
  saveJson("default.json", rows);
});

test("legacy: returning visitors receive the moved default while explicit choices and Reset survive", async ({ browser, page }) => {
  test.setTimeout(1_800_000);
  await requireBaseline(page);

  // A served baseline cut after card 106 stores the sparse format itself, so
  // the returning visitor's blob is written the way the pre-106 panel wrote
  // it: every parameter, no format marker, Tail refinement at its retired
  // default of 0, and one choice (cycleBands 1.5).
  await page.goto(`${CURRENT_ORIGIN}/#/${SLUG}`, { timeout: 30_000 });
  const legacy: Stored = { ...(await kernelDefaults(page)), tailRefinement: 0, cycleBands: 1.5 };
  const legacyRaw = JSON.stringify(legacy);
  expect(legacy.tailRefinement).toBe(0);
  expect(legacy.__format).toBeUndefined();

  const migrated = await openCase(browser, { stored: legacyRaw, preset: "balanced" });
  try {
    const snapshot = await paramSnapshot(migrated.page);
    expect(snapshot.tailRefinement).toBe("0.6");
    expect(snapshot.cycleBands).toBe("1.5");
  } finally {
    await migrated.context.close();
  }

  const legacyChoice = await openCase(browser, {
    stored: JSON.stringify({ tailRefinement: 0.3 }),
    preset: "balanced",
  });
  try {
    expect((await paramSnapshot(legacyChoice.page)).tailRefinement).toBe("0.3");
  } finally {
    await legacyChoice.context.close();
  }

  const explicitOff = await openCase(browser, {
    stored: { __format: 2, tailRefinement: 0 },
    preset: "balanced",
  });
  try {
    expect((await paramSnapshot(explicitOff.page)).tailRefinement).toBe("0");
  } finally {
    await explicitOff.context.close();
  }

  const oneChoice = await openCase(browser, { stored: null, preset: "balanced" });
  try {
    await setParam(oneChoice.page, "plottedIterations", 95);
    const stored = await oneChoice.page.evaluate((slug) => JSON.parse(localStorage.getItem(`el:values:${slug}`)!), SLUG) as Stored;
    expect(Object.keys(stored)).toEqual(["__format", "plottedIterations"]);
    expect(stored).toEqual({ __format: 2, plottedIterations: 95 });

    const defaults = await kernelDefaults(oneChoice.page);
    await oneChoice.page.locator(".sim-view__drawer-handle").click();
    await oneChoice.page.getByRole("button", { name: "Reset to defaults", exact: true }).click();
    const afterReset = await oneChoice.page.evaluate((slug) => ({
      stored: localStorage.getItem(`el:values:${slug}`),
      snapshot: Object.fromEntries(
        Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-param-key]")).map((element) => [
          element.dataset.paramKey ?? "",
          element instanceof HTMLInputElement && element.type === "checkbox" ? String(element.checked) : element.value,
        ]),
      ),
    }), SLUG);
    expect(afterReset.stored).toBeNull();
    for (const [key, value] of Object.entries(defaults)) {
      if (key === "plottedIterations") continue; // Reset restarts the deliberate 1-to-96 cascade reveal.
      if (!(key in afterReset.snapshot)) continue;
      expect(afterReset.snapshot[key], key).toBe(String(value));
    }
  } finally {
    await oneChoice.context.close();
  }

  saveJson("legacy.json", { legacyRaw, migratedTailRefinement: 0.6, preservedCycleBands: 1.5 });
});

test("cpu: the fallback caps Tail refinement at its automatic share", async ({ browser, page }) => {
  test.setTimeout(1_800_000);
  await requireBaseline(page);
  const settings: Array<number | undefined> = [undefined, 0.3, 0.6, 0.1];
  const rows: Array<{ setting: number | "default"; buildMs: number; stats: CloudStats }> = [];
  for (const setting of settings) {
    const params = pinned({ boundaryDetail: 0 });
    if (setting !== undefined) params.tailRefinement = setting;
    const opened = await openCase(browser, { stored: marked(params), preset: "balanced", cpu: true });
    try {
      const stats = await cloudStats(opened.canvas);
      const share = setting === 0.1 ? 0.1 : 0.3;
      expect(stats.refineRowBudget).toBe(Math.floor(stats.pointBudget * share));
      expect(stats.points).toBeLessThanOrEqual(stats.pointBudget);
      rows.push({ setting: setting ?? "default", buildMs: opened.buildMs, stats });
    } finally {
      await opened.context.close();
    }
  }
  const baseCells = rows[0].stats.baseCells;
  for (const row of rows) expect(relativeDifference(row.stats.baseCells, baseCells)).toBeLessThanOrEqual(0.005);

  const currentBuilds: number[] = [];
  const baselineBuilds: number[] = [];
  for (let sample = 0; sample < 3; sample += 1) {
    const params = pinned({ boundaryDetail: 0 });
    const current = await openCase(browser, { stored: marked(params), preset: "balanced", cpu: true });
    const baseline = await openCase(browser, {
      origin: BASELINE_ORIGIN,
      stored: marked(params),
      preset: "balanced",
      cpu: true,
    });
    currentBuilds.push(current.buildMs);
    baselineBuilds.push(baseline.buildMs);
    await current.context.close();
    await baseline.context.close();
  }
  const buildRatio = median(currentBuilds) / median(baselineBuilds);
  expect(Math.abs(buildRatio - 1), `CPU build ratio ${buildRatio}`).toBeLessThanOrEqual(0.2);
  saveJson("cpu.json", { rows, currentBuilds, baselineBuilds, buildRatio });
});

interface CostRun {
  buildMs: number;
  stats: CloudStats;
  timing: FrameTiming;
}

test("cost: three matched samples at the new default, explicit 0.6, and the old default", async ({ browser, page }) => {
  test.setTimeout(3_600_000);
  await requireBaseline(page);
  const cases = [
    { label: "treeDefault", origin: CURRENT_ORIGIN, tail: undefined },
    { label: "baselineExplicit06", origin: BASELINE_ORIGIN, tail: 0.6 },
    { label: "baselineOldDefault", origin: BASELINE_ORIGIN, tail: undefined },
  ] as const;
  const measured: Record<string, CostRun[]> = Object.fromEntries(cases.map(({ label }) => [label, []]));
  for (let sample = 0; sample < 3; sample += 1) {
    for (const item of cases) {
      const params = pinned({ boundaryDetail: 1 });
      if (item.tail !== undefined) params.tailRefinement = item.tail;
      const opened = await openCase(browser, {
        origin: item.origin,
        stored: marked(params),
        preset: "ultra",
      });
      try {
        await opened.page.waitForTimeout(500);
        measured[item.label].push({
          buildMs: opened.buildMs,
          stats: await cloudStats(opened.canvas),
          timing: await frameTiming(opened.page),
        });
      } finally {
        await opened.context.close();
      }
    }
  }

  const launchArgs = playwrightConfig.use?.launchOptions?.args ?? [];
  const headedBrowser = await chromium.launch({ headless: false, args: launchArgs });
  const headed: Record<string, FrameTiming[]> = Object.fromEntries(cases.map(({ label }) => [label, []]));
  try {
    for (const item of cases) {
      const params = pinned({ boundaryDetail: 1 });
      if (item.tail !== undefined) params.tailRefinement = item.tail;
      const opened = await openCase(headedBrowser, {
        origin: item.origin,
        stored: marked(params),
        preset: "ultra",
      });
      try {
        await opened.page.waitForTimeout(500);
        for (let sample = 0; sample < 3; sample += 1) headed[item.label].push(await frameTiming(opened.page));
      } finally {
        await opened.context.close();
      }
    }
  } finally {
    await headedBrowser.close();
  }

  const current = measured.treeDefault;
  const explicit = measured.baselineExplicit06;
  const buildRatio = median(current.map(({ buildMs }) => buildMs)) / median(explicit.map(({ buildMs }) => buildMs));
  expect(Math.abs(buildRatio - 1), `build ratio ${buildRatio}`).toBeLessThanOrEqual(0.1);
  expect(current.map(({ stats }) => stats.points)).toEqual(explicit.map(({ stats }) => stats.points));
  expect(current.map(({ stats }) => stats.buildBytes)).toEqual(explicit.map(({ stats }) => stats.buildBytes));
  if (current.every(({ timing }) => timing.method === "gpu-timer") && explicit.every(({ timing }) => timing.method === "gpu-timer")) {
    const gpuRatio = median(current.map(({ timing }) => timing.medianMs)) / median(explicit.map(({ timing }) => timing.medianMs));
    expect(Math.abs(gpuRatio - 1), `GPU frame ratio ${gpuRatio}`).toBeLessThanOrEqual(0.1);
  }
  saveJson("cost.json", { measured, headed, buildRatio });
});

test("evidence: default and real-axis views show the operator the new and old clouds", async ({ browser, page }) => {
  test.setTimeout(1_800_000);
  await requireBaseline(page);
  const defaultCases = [
    { label: "current-default", origin: CURRENT_ORIGIN, tail: undefined },
    { label: "baseline-old-default", origin: BASELINE_ORIGIN, tail: undefined },
    { label: "baseline-explicit-0.6", origin: BASELINE_ORIGIN, tail: 0.6 },
  ] as const;
  const record: Record<string, unknown> = {};
  for (const item of defaultCases) {
    const params = pinned({ boundaryDetail: 1 });
    if (item.tail !== undefined) params.tailRefinement = item.tail;
    const opened = await openCase(browser, { origin: item.origin, stored: marked(params), preset: "extreme" });
    try {
      await opened.page.waitForTimeout(800);
      const path = artifact(`default-${item.label}.png`);
      const image = await screenshot(opened.canvas, path);
      record[`default-${item.label}`] = { path, meanLuma: meanLuma(image), stats: await cloudStats(opened.canvas) };
    } finally {
      await opened.context.close();
    }
  }

  for (const item of [
    { label: "current-default", origin: CURRENT_ORIGIN },
    { label: "baseline-old-default", origin: BASELINE_ORIGIN },
  ] as const) {
    const opened = await openCase(browser, {
      origin: item.origin,
      stored: marked(pinned({ boundaryDetail: 1 })),
      preset: "extreme",
    });
    try {
      const pose = await realAxisPose(opened.page, opened.canvas);
      const path = artifact(`real-axis-${item.label}.png`);
      const image = await screenshot(opened.canvas, path);
      record[`real-axis-${item.label}`] = { path, pose, meanLuma: meanLuma(image), stats: await cloudStats(opened.canvas) };
    } finally {
      await opened.context.close();
    }
  }
  saveJson("evidence.json", record);
});
