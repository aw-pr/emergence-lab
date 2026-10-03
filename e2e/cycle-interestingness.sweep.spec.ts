/**
 * Logistic-Mandelbrot cycle-interestingness parameter sweep (stage 102).
 *
 * Opt in explicitly:
 *
 *   CYCLE_SWEEP=1 npx playwright test e2e/cycle-interestingness.sweep.spec.ts --workers=1
 *
 * The coarse pass scores the full Cartesian product at the default pose. The
 * top twenty then receive the other two stage-101 poses. Every capture uses a
 * fresh browser context. Outputs are written beneath the git-ignored
 * e2e/artifacts/logistic-mandelbrot-cycle-sweep/ directory.
 */
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { contactSheet, decodePng, type DecodedImage } from "./harness/frame.ts";
import {
  COLOUR_WEIGHTS,
  cycleTerms,
  scoreCycle,
  type CycleScore,
} from "./harness/cycleScore.ts";
import {
  GROUND_PLANE_HEIGHT,
  canvasDataset,
  openSim,
  paramSnapshot,
  projectToCanvas,
  setParam,
  type SimParams,
} from "./harness/insideOut.ts";

const ENABLED = process.env.CYCLE_SWEEP === "1";
const RESUME = process.env.CYCLE_SWEEP_RESUME === "1";
const RESUME_ELAPSED_MS = Number(process.env.CYCLE_SWEEP_RESUME_ELAPSED_MS ?? 0);
const OUT = "e2e/artifacts/logistic-mandelbrot-cycle-sweep";
const CANDIDATE_OUT = `${OUT}/candidates`;
const VIEWPORT = { width: 1280, height: 720 };
const FRAMES = 11;
const FRAME_GAP_MS = 700;
const TOP_COUNT = 20;

type Mode = "cycle" | "inside-out";
type PoseId = "default" | "bifurcation-curtain" | "period2-bulb-ground";
type Palette = "magma-cyclic" | "twilight" | "phase" | "magma" | "amber" | "rosewood";

interface Candidate {
  id: string;
  mode: Mode;
  palette: Palette;
  cycleBands: number;
  cycleSpeed: number;
  gamma: number;
  contrast: number;
}

interface FrameRecord {
  index: number;
  elapsedMs: number;
  phase: number;
  azimuth: string;
  distance: string;
  points: string;
  build: string;
  boundaryDetailOpacity: string;
}

interface PoseResult {
  pose: PoseId;
  frames: FrameRecord[];
  lapSpan: number;
  params: Record<string, string>;
  score: CycleScore;
}

interface AggregateScore {
  cycleInterestingness: number;
  field: number;
  coverage: number;
  spatialAutocorrelation: number;
  entropy: number;
  temporalFlux: number;
  lit: number;
  edgeDensity: number;
  chroma: number;
  hueSpread: number;
  whiteClip: number;
  neon: number;
  travel: number;
  chromaTerm: number;
  edgeTerm: number;
  travelTerm: number;
  colourScore: number;
  lapSpan: number;
}

interface CandidateResult {
  candidate: Candidate;
  coarseRank?: number;
  finalRank?: number;
  poses: PoseResult[];
  aggregate?: AggregateScore;
  artifacts: { json: string; contactSheet?: string };
}

interface RobustnessRow {
  term: keyof typeof COLOUR_WEIGHTS;
  direction: "-20%" | "+20%";
  weights: { chroma: number; edges: number; travel: number };
  topFive: string[];
  survivors: number;
}

const MODES: readonly Mode[] = ["cycle", "inside-out"];
const PALETTES: readonly Palette[] = ["magma-cyclic", "twilight", "phase", "magma", "amber", "rosewood"];
const BANDS = [1.5, 3, 5] as const;
const SPEEDS = [0.06, 0.1, 0.2] as const;
const TONE_PAIRS = [
  { gamma: 1.65, contrast: 2.4 },
  { gamma: 1.2, contrast: 1.8 },
  { gamma: 1.2, contrast: 1.4 },
] as const;
const EXPECTED_CANDIDATES = MODES.length * PALETTES.length * BANDS.length * SPEEDS.length * TONE_PAIRS.length;

const numberId = (value: number): string => String(value).replace(".", "p");

const CANDIDATES: Candidate[] = MODES.flatMap((mode) =>
  PALETTES.flatMap((palette) =>
    BANDS.flatMap((cycleBands) =>
      SPEEDS.flatMap((cycleSpeed) =>
        TONE_PAIRS.map(({ gamma, contrast }) => ({
          id: `${mode}-${palette}-b${numberId(cycleBands)}-s${numberId(cycleSpeed)}-g${numberId(gamma)}-c${numberId(contrast)}`,
          mode,
          palette,
          cycleBands,
          cycleSpeed,
          gamma,
          contrast,
        })),
      ),
    ),
  ),
);

function frozenParams(candidate: Candidate): SimParams {
  return {
    autoRotate: false,
    continuousSpin: false,
    cascadeReveal: false,
    realAxisSweep: false,
    colourMode: candidate.mode,
    cycleSpeed: candidate.cycleSpeed,
    cycleBands: candidate.cycleBands,
  };
}

const lapDelta = (from: number, to: number): number => ((to - from + 1.5) % 1) - 0.5;

function artifact(path: string): string {
  mkdirSync(OUT, { recursive: true });
  return `${OUT}/${path}`;
}

async function setColourRange(page: Page, labelText: string, value: number): Promise<void> {
  await page.evaluate(
    ([labelText, value]) => {
      const control = [...document.querySelectorAll<HTMLElement>("label.control--number")].find(
        (element) => element.querySelector(".control__label")?.textContent === labelText,
      );
      const input = control?.querySelector<HTMLInputElement>('input[type="range"]');
      if (!input) throw new Error(`${labelText} control not found`);
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [labelText, value] as const,
  );
}

async function colourRangeValue(page: Page, labelText: string): Promise<string> {
  return page.evaluate((labelText) => {
    const control = [...document.querySelectorAll<HTMLElement>("label.control--number")].find(
      (element) => element.querySelector(".control__label")?.textContent === labelText,
    );
    return control?.querySelector<HTMLInputElement>('input[type="range"]')?.value ?? "";
  }, labelText);
}

async function setPalette(page: Page, palette: Palette): Promise<void> {
  await page.evaluate((palette) => {
    const matches = [...document.querySelectorAll<HTMLSelectElement>("select")].filter((select) =>
      [...select.options].some((option) => option.value === palette),
    );
    if (matches.length !== 1) throw new Error(`expected one palette selector for ${palette}, found ${matches.length}`);
    matches[0].value = palette;
    matches[0].dispatchEvent(new Event("change", { bubbles: true }));
  }, palette);
  await expect
    .poll(() => page.locator("select").evaluateAll((selects, value) => selects.some((select) => select.value === value), palette))
    .toBe(true);
}

async function waitForCameraRest(canvas: Locator): Promise<void> {
  let previous = "";
  await expect
    .poll(
      async () => {
        const dataset = await canvasDataset(canvas);
        const pose = `${dataset.orbit3dCameraAzimuth}|${dataset.orbit3dCameraDistance}|${dataset.orbit3dBoundaryDetailOpacity}`;
        const settled = pose === previous;
        previous = pose;
        return settled;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
}

async function parkDrawer(page: Page): Promise<void> {
  const handle = page.locator(".sim-view__drawer-handle");
  const sidebar = page.locator(".sim-view__sidebar");
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(20, VIEWPORT.height / 2);
  await expect.poll(async () => (await sidebar.boundingBox())!.x, { timeout: 5000 }).toBeGreaterThan(VIEWPORT.width - 40);
}

async function applyPose(page: Page, canvas: Locator, candidate: Candidate, pose: PoseId): Promise<void> {
  if (pose === "bifurcation-curtain") {
    const handle = page.locator(".sim-view__drawer-handle");
    await handle.click();
    const presets = page.getByRole("combobox", { name: "Kernel preset", exact: true });
    await presets.selectOption("bifurcation-curtain");
    await expect(presets).toHaveValue("bifurcation-curtain");
    await expect(page.locator('[data-param-key="realSliceOnly"]')).toBeChecked();
    await setParam(page, "autoRotate", false);
    await setParam(page, "continuousSpin", false);
    await setParam(page, "colourMode", candidate.mode);
    await setParam(page, "cycleSpeed", candidate.cycleSpeed);
    await setParam(page, "cycleBands", candidate.cycleBands);
    await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue(candidate.mode);
    await handle.click();
    await parkDrawer(page);
    await page.waitForTimeout(500);
    await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 120_000 });
    await waitForCameraRest(canvas);
  }
  if (pose === "period2-bulb-ground") {
    const box = (await canvas.boundingBox())!;
    const target = await projectToCanvas(page, -1, 0, GROUND_PLANE_HEIGHT, box.width, box.height);
    const before = Number((await canvasDataset(canvas)).orbit3dCameraDistance);
    await canvas.evaluate(
      (element, { x, y, steps }) => {
        const rect = element.getBoundingClientRect();
        for (let step = 0; step < steps; step += 1) {
          element.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + x,
              clientY: rect.top + y,
              deltaY: -100,
            }),
          );
        }
      },
      { x: target.x, y: target.y, steps: 4 },
    );
    await page.waitForTimeout(300);
    await waitForCameraRest(canvas);
    expect(Number((await canvasDataset(canvas)).orbit3dCameraDistance)).toBeLessThan(before * 0.6);
  }
}

async function captureCandidate(
  browser: Browser,
  candidate: Candidate,
  pose: PoseId,
  sheetPath?: string,
): Promise<PoseResult> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    const canvas = await openSim(page, frozenParams(candidate));
    await applyPose(page, canvas, candidate, pose);
    await setPalette(page, candidate.palette);
    await setColourRange(page, "Gamma", candidate.gamma);
    await setColourRange(page, "Contrast", candidate.contrast);
    expect(await colourRangeValue(page, "Gamma")).toBe(String(candidate.gamma));
    expect(await colourRangeValue(page, "Contrast")).toBe(String(candidate.contrast));
    await page.waitForTimeout(1000);
    await waitForCameraRest(canvas);

    const initial = await canvasDataset(canvas);
    expect(initial.orbit3dBuild).toBe("complete");
    expect(Number(initial.orbit3dPoints)).toBeGreaterThan(0);
    expect((await page.locator(".sim-view__sidebar").boundingBox())!.x).toBeGreaterThan(VIEWPORT.width - 40);

    const frames: DecodedImage[] = [];
    const records: FrameRecord[] = [];
    const started = Date.now();
    for (let index = 0; index < FRAMES; index += 1) {
      if (index > 0) await page.waitForTimeout(FRAME_GAP_MS);
      frames.push(decodePng(await canvas.screenshot()));
      const dataset = await canvasDataset(canvas);
      records.push({
        index,
        elapsedMs: Date.now() - started,
        phase: Number(dataset.orbit3dPhase),
        azimuth: dataset.orbit3dCameraAzimuth,
        distance: dataset.orbit3dCameraDistance,
        points: dataset.orbit3dPoints,
        build: dataset.orbit3dBuild,
        boundaryDetailOpacity: dataset.orbit3dBoundaryDetailOpacity,
      });
      expect(dataset.orbit3dCameraAzimuth, `${candidate.id} ${pose} frame ${index}`).toBe(initial.orbit3dCameraAzimuth);
      expect(dataset.orbit3dCameraDistance, `${candidate.id} ${pose} frame ${index}`).toBe(initial.orbit3dCameraDistance);
      expect(dataset.orbit3dPoints, `${candidate.id} ${pose} frame ${index}`).toBe(initial.orbit3dPoints);
      expect(dataset.orbit3dBuild, `${candidate.id} ${pose} frame ${index}`).toBe("complete");
    }

    const params = await paramSnapshot(page);
    expect(params.colourMode).toBe(candidate.mode);
    expect(params.cycleSpeed).toBe(String(candidate.cycleSpeed));
    expect(params.cycleBands).toBe(String(candidate.cycleBands));
    expect(params.cascadeReveal).toBe("false");
    expect(params.realAxisSweep).toBe("false");
    expect(params.autoRotate).toBe("false");
    const lapSpan = records.slice(1).reduce((sum, record, index) => sum + lapDelta(records[index].phase, record.phase), 0);
    const score = scoreCycle(frames);
    if (sheetPath) {
      writeFileSync(sheetPath, contactSheet(frames, 4, { x: 0, y: 0, width: frames[0].width, height: frames[0].height }, 2));
    }
    return { pose, frames: records, lapSpan, params, score };
  } finally {
    await context.close();
  }
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

function aggregatePoses(poses: PoseResult[]): AggregateScore {
  return {
    cycleInterestingness: mean(poses.map((pose) => pose.score.cycleInterestingness)),
    field: mean(poses.map((pose) => pose.score.field)),
    coverage: mean(poses.map((pose) => pose.score.fieldSummary.coverage)),
    spatialAutocorrelation: mean(poses.map((pose) => pose.score.fieldSummary.spatialAutocorrelation)),
    entropy: mean(poses.map((pose) => pose.score.fieldSummary.entropy)),
    temporalFlux: mean(poses.map((pose) => pose.score.fieldSummary.temporalFlux)),
    lit: mean(poses.map((pose) => pose.score.colour.lit)),
    edgeDensity: mean(poses.map((pose) => pose.score.colour.edgeDensity)),
    chroma: mean(poses.map((pose) => pose.score.colour.chroma)),
    hueSpread: mean(poses.map((pose) => pose.score.colour.hueSpread)),
    whiteClip: mean(poses.map((pose) => pose.score.colour.whiteClip)),
    neon: mean(poses.map((pose) => pose.score.colour.neon)),
    travel: mean(poses.map((pose) => pose.score.travel)),
    chromaTerm: mean(poses.map((pose) => pose.score.chromaTerm)),
    edgeTerm: mean(poses.map((pose) => pose.score.edgeTerm)),
    travelTerm: mean(poses.map((pose) => pose.score.travelTerm)),
    colourScore: mean(poses.map((pose) => pose.score.colourScore)),
    lapSpan: mean(poses.map((pose) => pose.lapSpan)),
  };
}

function candidateJson(result: CandidateResult): void {
  mkdirSync(CANDIDATE_OUT, { recursive: true });
  writeFileSync(result.artifacts.json, JSON.stringify(result, null, 2));
}

function perturbedWeights(term: keyof typeof COLOUR_WEIGHTS, factor: number): { chroma: number; edges: number; travel: number } {
  const raw = { ...COLOUR_WEIGHTS, [term]: COLOUR_WEIGHTS[term] * factor };
  const total = raw.chroma + raw.edges + raw.travel;
  return { chroma: raw.chroma / total, edges: raw.edges / total, travel: raw.travel / total };
}

function scoreWithWeights(result: CandidateResult, weights: { chroma: number; edges: number; travel: number }): number {
  return mean(result.poses.map((pose) => cycleTerms(pose.score.field, pose.score.colour, pose.score.travel, weights).cycleInterestingness));
}

function robustness(ranked: CandidateResult[]): RobustnessRow[] {
  const originalTopFive = new Set(ranked.slice(0, 5).map((result) => result.candidate.id));
  return (Object.keys(COLOUR_WEIGHTS) as (keyof typeof COLOUR_WEIGHTS)[]).flatMap((term) =>
    ([0.8, 1.2] as const).map((factor) => {
      const weights = perturbedWeights(term, factor);
      const topFive = [...ranked]
        .sort((left, right) => scoreWithWeights(right, weights) - scoreWithWeights(left, weights))
        .slice(0, 5)
        .map((result) => result.candidate.id);
      return {
        term,
        direction: factor < 1 ? "-20%" as const : "+20%" as const,
        weights,
        topFive,
        survivors: topFive.filter((id) => originalTopFive.has(id)).length,
      };
    }),
  );
}

const fmt = (value: number, places = 3): string => value.toFixed(places);

function rankedRow(result: CandidateResult): string {
  const candidate = result.candidate;
  const score = result.aggregate!;
  return `| ${result.finalRank} | ${candidate.id} | ${candidate.mode} | ${candidate.palette} | ${candidate.cycleBands} | ${candidate.cycleSpeed} | ${candidate.gamma} | ${candidate.contrast} | **${fmt(score.cycleInterestingness)}** | ${fmt(score.field)} | ${fmt(score.coverage)} | ${fmt(score.spatialAutocorrelation)} | ${fmt(score.entropy)} | ${fmt(score.temporalFlux, 4)} | ${fmt(score.lit)} | ${fmt(score.edgeDensity)} | ${fmt(score.chroma)} | ${fmt(score.hueSpread)} | ${fmt(score.whiteClip)} | ${fmt(score.neon)} | ${fmt(score.travel, 2)} | ${fmt(score.chromaTerm)} | ${fmt(score.edgeTerm)} | ${fmt(score.travelTerm)} | ${fmt(score.colourScore)} | ${fmt(score.lapSpan, 2)} | \`${result.artifacts.contactSheet}\` |`;
}

const RANKED_HEADER =
  "| # | id | mode | palette | bands | speed | gamma | contrast | cycleInterestingness | field | coverage | autocorr | entropy | flux | lit | edges | chroma | hueSpread | whiteClip | neon | travel | chromaTerm | edgeTerm | travelTerm | colourScore | laps | contact sheet |\n" +
  "|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|";

function speedTables(coarse: CandidateResult[]): string {
  const sections: string[] = [];
  for (const mode of MODES) {
    for (const speed of SPEEDS) {
      const rows = coarse
        .filter((result) => result.candidate.mode === mode && result.candidate.cycleSpeed === speed)
        .sort((left, right) => right.poses[0].score.cycleInterestingness - left.poses[0].score.cycleInterestingness)
        .slice(0, 5);
      sections.push(
        `### ${mode}, speed ${speed}\n\n| # | id | score | palette | bands | gamma | contrast | neon |\n|---:|---|---:|---|---:|---:|---:|---:|\n${rows
          .map((result, index) => {
            const candidate = result.candidate;
            const score = result.poses[0].score;
            return `| ${index + 1} | ${candidate.id} | ${fmt(score.cycleInterestingness)} | ${candidate.palette} | ${candidate.cycleBands} | ${candidate.gamma} | ${candidate.contrast} | ${fmt(score.colour.neon)} |`;
          })
          .join("\n")}`,
      );
    }
  }
  return sections.join("\n\n");
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  test.skip(!ENABLED, "set CYCLE_SWEEP=1 to run the cycle-interestingness sweep");
  if (!RESUME) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(CANDIDATE_OUT, { recursive: true });
});

test("coarse Cartesian pass, three-pose top twenty and robustness analysis", async ({ browser }) => {
  test.skip(!ENABLED, "set CYCLE_SWEEP=1 to run the cycle-interestingness sweep");
  test.setTimeout(7_200_000);
  expect(CANDIDATES).toHaveLength(EXPECTED_CANDIDATES);
  const started = Date.now();
  const coarse: CandidateResult[] = [];

  for (const candidate of CANDIDATES) {
    const json = `${CANDIDATE_OUT}/${candidate.id}.json`;
    if (RESUME && existsSync(json)) {
      const saved = JSON.parse(readFileSync(json, "utf8")) as CandidateResult;
      if (saved.candidate.id === candidate.id && saved.poses[0]?.pose === "default") {
        coarse.push(saved);
        continue;
      }
    }
    const result: CandidateResult = {
      candidate,
      poses: [await captureCandidate(browser, candidate, "default")],
      artifacts: { json },
    };
    coarse.push(result);
    candidateJson(result);
  }

  coarse.sort((left, right) => right.poses[0].score.cycleInterestingness - left.poses[0].score.cycleInterestingness);
  coarse.forEach((result, index) => {
    result.coarseRank = index + 1;
    candidateJson(result);
  });
  // The raw overall top twenty is dominated by Cycle mode and speed 0.2.
  // Refine the best three in every mode/speed cell, then the next best
  // remaining candidate per mode. This keeps the set at twenty while making
  // the card's three-per-mode, multi-speed shortlist possible.
  const selectedIds = new Set<string>();
  for (const mode of MODES) {
    for (const speed of SPEEDS) {
      coarse
        .filter((result) => result.candidate.mode === mode && result.candidate.cycleSpeed === speed)
        .slice(0, 3)
        .forEach((result) => selectedIds.add(result.candidate.id));
    }
    const next = coarse.find((result) => result.candidate.mode === mode && !selectedIds.has(result.candidate.id));
    if (next) selectedIds.add(next.candidate.id);
  }
  const refined = coarse.filter((result) => selectedIds.has(result.candidate.id));

  for (const result of refined) {
    if (!result.poses.some((pose) => pose.pose === "bifurcation-curtain")) {
      result.poses.push(await captureCandidate(browser, result.candidate, "bifurcation-curtain"));
    }
    result.artifacts.contactSheet ??= artifact(`${result.candidate.id}-contact-sheet.png`);
    if (!result.poses.some((pose) => pose.pose === "period2-bulb-ground")) {
      result.poses.push(await captureCandidate(browser, result.candidate, "period2-bulb-ground", result.artifacts.contactSheet));
    }
    result.aggregate = aggregatePoses(result.poses);
    candidateJson(result);
  }

  refined.sort((left, right) => right.aggregate!.cycleInterestingness - left.aggregate!.cycleInterestingness);
  refined.forEach((result, index) => {
    result.finalRank = index + 1;
    candidateJson(result);
  });
  const robust = robustness(refined);
  const robustVerdict = robust.every((row) => row.survivors === 5)
    ? "Robust: all original top-five candidates survive every one-at-a-time weight shift."
    : "Not robust: at least one one-at-a-time weight shift changes the membership of the top five.";

  const shippedRanks = Object.fromEntries(
    MODES.map((mode) => {
      const id = `${mode}-magma-cyclic-b1p5-s0p1-g1p65-c2p4`;
      const withinMode = coarse.filter((result) => result.candidate.mode === mode);
      const rank = withinMode.findIndex((result) => result.candidate.id === id) + 1;
      const result = withinMode[rank - 1];
      return [mode, { id, rank, of: withinMode.length, score: result.poses[0].score.cycleInterestingness }];
    }),
  );
  const elapsedMs = RESUME_ELAPSED_MS + Date.now() - started;
  const report = {
    generatedAt: new Date().toISOString(),
    candidateCount: coarse.length,
    expectedCandidateCount: EXPECTED_CANDIDATES,
    wallClockMs: elapsedMs,
    method: {
      coarsePose: "default",
      coarseSelection: "top three within each mode/speed cell, plus the next best remaining candidate per mode (twenty total)",
      refinedPoses: ["default", "bifurcation-curtain", "period2-bulb-ground"],
      frames: FRAMES,
      frameGapMs: FRAME_GAP_MS,
      ranking: "mean cycleInterestingness across the three poses",
      robustness: "one colour weight multiplied by 0.8 or 1.2, then all three renormalised to sum to one; no re-rendering",
    },
    shippedRanks,
    coarseRanking: coarse.map((result) => ({
      rank: result.coarseRank,
      id: result.candidate.id,
      candidate: result.candidate,
      cycleInterestingness: result.poses[0].score.cycleInterestingness,
      neon: result.poses[0].score.colour.neon,
      json: result.artifacts.json,
    })),
    rankedTopTwenty: refined.map((result) => ({
      rank: result.finalRank,
      id: result.candidate.id,
      candidate: result.candidate,
      aggregate: result.aggregate,
      json: result.artifacts.json,
      contactSheet: result.artifacts.contactSheet,
    })),
    robustness: { verdict: robustVerdict, originalTopFive: refined.slice(0, 5).map((result) => result.candidate.id), rows: robust },
  };
  writeFileSync(`${OUT}/ranked.json`, JSON.stringify(report, null, 2));

  const robustnessTable = robust
    .map((row) => `| ${row.term} | ${row.direction} | ${fmt(row.weights.chroma)} | ${fmt(row.weights.edges)} | ${fmt(row.weights.travel)} | ${row.survivors} | ${row.topFive.join(", ")} |`)
    .join("\n");
  const markdown = `# Logistic-Mandelbrot cycle-interestingness sweep\n\n${coarse.length} coarse candidates completed in ${fmt(elapsedMs / 60_000, 1)} minutes. The coarse pass used the default pose. Its raw overall top twenty contained only one Inside-out candidate and all twenty used speed 0.2, so refinement takes the top three within every mode/speed cell plus the next-best remaining candidate in each mode: twenty candidates total, ranked below by the mean score at the default, bifurcation-curtain and period2-bulb-ground poses. Each pose used a fresh browser context, ${FRAMES} frames ${FRAME_GAP_MS} ms apart, the production GPU renderer at shipped quality, and the unchanged stage-101 scorer.\n\n## Top twenty\n\n${RANKED_HEADER}\n${refined.map(rankedRow).join("\n")}\n\n## Robustness\n\nEach named weight was shifted by ±20% alone and the three colour weights were renormalised to sum to one. Scores were recomputed from each pose's exported field, colour and travel terms without re-rendering.\n\n| term | shift | chroma weight | edge weight | travel weight | original top-five survivors | perturbed top five |\n|---|---:|---:|---:|---:|---:|---|\n${robustnessTable}\n\n**${robustVerdict}**\n\n## Shipped default rank at the default pose\n\n| mode | rank | field | score | id |\n|---|---:|---:|---:|---|\n${MODES.map((mode) => {
    const shipped = shippedRanks[mode] as { id: string; rank: number; of: number; score: number };
    return `| ${mode} | ${shipped.rank} of ${shipped.of} | default pose | ${fmt(shipped.score)} | ${shipped.id} |`;
  }).join("\n")}\n\n## Coarse top five per speed and mode\n\nThe scorer's travel and liveliness terms favour faster cycling at the fixed capture interval. These tables expose that property instead of treating a fastest-wins ordering as a visual finding.\n\n${speedTables(coarse)}\n`;
  writeFileSync(`${OUT}/ranked.md`, markdown);

  expect(coarse).toHaveLength(EXPECTED_CANDIDATES);
  expect(refined).toHaveLength(TOP_COUNT);
  expect(refined.every((result) => result.poses.length === 3)).toBe(true);
  expect(refined.slice(0, 10).every((result) => Boolean(result.artifacts.contactSheet))).toBe(true);
});
