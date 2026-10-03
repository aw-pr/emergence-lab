/**
 * Logistic-Mandelbrot cycle interestingness harness (stage 101): renders the
 * sim through the production WebGL path, captures a timed frame sequence at
 * fixed camera poses, and scores it with e2e/harness/cycleScore.ts.
 *
 * Opt-in, like the other sweeps:
 *
 *   CYCLE_SCORE=1 npx playwright test e2e/cycle-interestingness.spec.ts --workers=1
 *
 * Describe titles match the card's --grep keys: baseline, sensitivity, repeat.
 * Every candidate gets a fresh browser context; params go in through the
 * persisted store before navigation, the camera is parked, reveal and beam
 * are off, and the shipped palette, gamma and contrast are left alone unless
 * a candidate names a contrast (driven through the colour panel, which is
 * the only route: colour options are not persisted). Phase is the renderer's
 * own `data-orbit3d-phase`, recorded per frame. Artefacts land under
 * e2e/artifacts/logistic-mandelbrot-cycle/ (git-ignored).
 */
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { contactSheet, decodePng, type DecodedImage } from "./harness/frame.ts";
import { metricsTable, writePng, writeText, type ScoredCandidate } from "./harness/report.ts";
import { luminanceField, scoreCycle, type CycleScore } from "./harness/cycleScore.ts";
import {
  GROUND_PLANE_HEIGHT,
  canvasDataset,
  captureCanvas,
  openSim,
  paramSnapshot,
  projectToCanvas,
  setParam,
  type SimParams,
} from "./harness/insideOut.ts";

const ENABLED = process.env.CYCLE_SCORE === "1";
const OUT = "e2e/artifacts/logistic-mandelbrot-cycle";
const VIEWPORT = { width: 1280, height: 720 };
/** 11 frames 700 ms apart: ten steps of about a tenth of a lap at the shipped 0.1 laps/s. */
const FRAMES = 11;
const FRAME_GAP_MS = 700;
const MIN_LAP_SPAN = 1 / 3;
const REPEAT_TOLERANCE = 0.02;

const SHIPPED = { cycleSpeed: 0.1, cycleBands: 1.5, contrast: 2.4, gamma: 1.65 } as const;

type Mode = "cycle" | "inside-out";
type PoseId = "default" | "bifurcation-curtain" | "period2-bulb-ground";

interface Candidate {
  id: string;
  group: "baseline" | "sensitivity" | "repeat";
  pose: PoseId;
  mode: Mode;
  cycleSpeed: number;
  cycleBands: number;
  /** Colour-panel contrast; undefined leaves the shipped 2.4 untouched. */
  contrast?: number;
  /** Colour-panel gamma; undefined leaves the shipped 1.65 untouched. */
  gamma?: number;
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

interface CandidateResult {
  candidate: Candidate;
  frames: FrameRecord[];
  /** Phase advanced over the sequence, in laps, summed from signed per-step deltas. */
  lapSpan: number;
  params: Record<string, string>;
  score: CycleScore;
  artifacts: { json: string; contactSheet: string; firstFrame: string; luminance: string };
}

/** Camera parked, reveal and beam off; every other kernel param at its shipped default. */
function frozenParams(mode: Mode, cycleSpeed: number, cycleBands: number): SimParams {
  return {
    autoRotate: false,
    continuousSpin: false,
    cascadeReveal: false,
    realAxisSweep: false,
    colourMode: mode,
    cycleSpeed,
    cycleBands,
  };
}

/** Signed lap delta between two phases on the unit circle, in (-0.5, 0.5]. */
const lapDelta = (from: number, to: number) => ((to - from + 1.5) % 1) - 0.5;

const results: CandidateResult[] = [];

function artifact(name: string): string {
  mkdirSync(OUT, { recursive: true });
  return `${OUT}/${name}`;
}

/** The colour panel's Gamma / Contrast sliders carry no data-param-key; find them by label. */
async function setColourRange(page: Page, labelText: string, value: number): Promise<void> {
  await page.evaluate(
    ([labelText, value]) => {
      const control = [...document.querySelectorAll<HTMLElement>("label.control--number")].find(
        (el) => el.querySelector(".control__label")?.textContent === labelText,
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
      (el) => el.querySelector(".control__label")?.textContent === labelText,
    );
    return control?.querySelector<HTMLInputElement>('input[type="range"]')?.value ?? "";
  }, labelText);
}

/** A pose change or dolly eases over several frames; wait until pose and detail opacity hold still. */
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

async function applyPose(page: Page, canvas: Locator, candidate: Candidate): Promise<void> {
  if (candidate.pose === "bifurcation-curtain") {
    // The kernel preset resets every kernel param to its default before
    // applying its own, so the parked camera, colour mode and cycle settings
    // are re-applied after it. Selecting it needs the drawer open.
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
    await expect(page.locator('[data-param-key="autoRotate"]')).not.toBeChecked();
    await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue(candidate.mode);
    await handle.click();
    await parkDrawer(page);
    await page.waitForTimeout(500);
    await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 120_000 });
    await waitForCameraRest(canvas);
  }
  if (candidate.pose === "period2-bulb-ground") {
    // Four wheel steps toward c = -1 on the ground plane: the period-2 bulb
    // fills the frame with the ground still under it.
    const box = (await canvas.boundingBox())!;
    const target = await projectToCanvas(page, -1, 0, GROUND_PLANE_HEIGHT, box.width, box.height);
    const before = Number((await canvasDataset(canvas)).orbit3dCameraDistance);
    await canvas.evaluate(
      (element, { x, y, steps }) => {
        const rect = element.getBoundingClientRect();
        for (let step = 0; step < steps; step += 1) {
          element.dispatchEvent(
            new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: rect.left + x, clientY: rect.top + y, deltaY: -100 }),
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

async function captureCandidate(browser: Browser, candidate: Candidate): Promise<CandidateResult> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    const canvas = await openSim(page, frozenParams(candidate.mode, candidate.cycleSpeed, candidate.cycleBands));
    await applyPose(page, canvas, candidate);
    if (candidate.gamma !== undefined) {
      await setColourRange(page, "Gamma", candidate.gamma);
      expect(await colourRangeValue(page, "Gamma")).toBe(String(candidate.gamma));
    }
    if (candidate.contrast !== undefined) {
      await setColourRange(page, "Contrast", candidate.contrast);
      expect(await colourRangeValue(page, "Contrast")).toBe(String(candidate.contrast));
    }
    // Let the palette texture and any eased camera settle before sampling.
    await page.waitForTimeout(1000);
    await waitForCameraRest(canvas);

    const initial = await canvasDataset(canvas);
    expect(initial.orbit3dBuild).toBe("complete");
    expect(Number(initial.orbit3dPoints)).toBeGreaterThan(0);
    const sidebar = page.locator(".sim-view__sidebar");
    expect((await sidebar.boundingBox())!.x).toBeGreaterThan(VIEWPORT.width - 40);

    const frames: DecodedImage[] = [];
    const records: FrameRecord[] = [];
    const started = Date.now();
    for (let index = 0; index < FRAMES; index += 1) {
      if (index > 0) await page.waitForTimeout(FRAME_GAP_MS);
      const image =
        index === 0
          ? await captureCanvas(canvas, artifact(`${candidate.id}-frame-0.png`))
          : decodePng(await canvas.screenshot());
      const dataset = await canvasDataset(canvas);
      frames.push(image);
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
      // The scene under the cycling must be the same scene on every frame.
      expect(dataset.orbit3dCameraAzimuth, `${candidate.id} frame ${index} azimuth`).toBe(initial.orbit3dCameraAzimuth);
      expect(dataset.orbit3dCameraDistance, `${candidate.id} frame ${index} distance`).toBe(initial.orbit3dCameraDistance);
      expect(dataset.orbit3dPoints, `${candidate.id} frame ${index} points`).toBe(initial.orbit3dPoints);
      expect(dataset.orbit3dBuild, `${candidate.id} frame ${index} build`).toBe("complete");
    }
    const params = await paramSnapshot(page);
    expect(params.colourMode).toBe(candidate.mode);
    expect(params.cycleSpeed).toBe(String(candidate.cycleSpeed));
    expect(params.cycleBands).toBe(String(candidate.cycleBands));
    expect(params.cascadeReveal).toBe("false");
    expect(params.realAxisSweep).toBe("false");
    expect(params.autoRotate).toBe("false");

    const lapSpan = records.slice(1).reduce((sum, record, i) => sum + lapDelta(records[i].phase, record.phase), 0);
    const score = scoreCycle(frames);

    const artifacts = {
      json: artifact(`${candidate.id}.json`),
      contactSheet: artifact(`${candidate.id}-sequence.png`),
      firstFrame: artifact(`${candidate.id}-frame-0.png`),
      luminance: artifact(`${candidate.id}-luminance.png`),
    };
    // Whole frames at half size, four per row: eleven frames read as a strip.
    writeFileSync(
      artifacts.contactSheet,
      contactSheet(frames, 4, { x: 0, y: 0, width: frames[0].width, height: frames[0].height }, 2),
    );
    const lum = luminanceField(frames[0]);
    writePng(artifacts.luminance, lum.values, lum.width, lum.height, 2);
    const result: CandidateResult = { candidate, frames: records, lapSpan, params, score, artifacts };
    writeFileSync(artifacts.json, JSON.stringify(result, null, 2));
    results.push(result);
    return result;
  } finally {
    await context.close();
  }
}

const fmt = (n: number, dp = 3) => n.toFixed(dp);

function scoreRow(result: CandidateResult): string {
  const s = result.score;
  const c = result.candidate;
  return `| ${c.id} | ${c.pose} | ${c.mode} | ${c.cycleSpeed} | ${c.cycleBands} | ${c.gamma ?? SHIPPED.gamma} | ${c.contrast ?? SHIPPED.contrast} | **${fmt(s.cycleInterestingness)}** | ${fmt(s.field)} | ${fmt(s.fieldSummary.coverage)} | ${fmt(s.fieldSummary.spatialAutocorrelation)} | ${fmt(s.fieldSummary.entropy)} | ${fmt(s.fieldSummary.temporalFlux, 4)} | ${fmt(s.colour.lit)} | ${fmt(s.colour.edgeDensity)} | ${fmt(s.colour.chroma)} | ${fmt(s.colour.hueSpread)} | ${fmt(s.colour.whiteClip)} | ${fmt(s.colour.neon)} | ${fmt(s.travel, 2)} | ${fmt(s.chromaTerm)} | ${fmt(s.edgeTerm)} | ${fmt(s.travelTerm)} | ${fmt(s.colourScore)} | ${result.frames.length} | ${fmt(result.lapSpan, 2)} | \`${result.artifacts.contactSheet}\` |`;
}

const SCORE_HEADER =
  "| id | pose | mode | speed | bands | gamma | contrast | cycleInterestingness | field | coverage | autocorr | entropy | flux | lit | edges | chroma | hueSpread | whiteClip | neon | travel | chromaTerm | edgeTerm | travelTerm | colourScore | frames | laps | sequence |\n" +
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  test.skip(!ENABLED, "set CYCLE_SCORE=1 to run the cycle interestingness harness");
  mkdirSync(OUT, { recursive: true });
});

test.describe("baseline", () => {
  const POSES: PoseId[] = ["default", "bifurcation-curtain", "period2-bulb-ground"];
  const MODES: Mode[] = ["cycle", "inside-out"];
  for (const pose of POSES) {
    for (const mode of MODES) {
      test(`${pose} in ${mode} mode at the shipped defaults`, async ({ browser }) => {
        test.skip(!ENABLED, "set CYCLE_SCORE=1 to run the cycle interestingness harness");
        test.setTimeout(300_000);
        const result = await captureCandidate(browser, {
          id: `baseline-${pose}-${mode}`,
          group: "baseline",
          pose,
          mode,
          cycleSpeed: SHIPPED.cycleSpeed,
          cycleBands: SHIPPED.cycleBands,
        });
        expect(result.frames.length).toBeGreaterThanOrEqual(6);
        expect(result.lapSpan, `${result.candidate.id} spans ${result.lapSpan} laps`).toBeGreaterThanOrEqual(MIN_LAP_SPAN);
        expect(result.score.cycleInterestingness).toBeGreaterThan(0);
        expect(result.score.cycleInterestingness).toBeLessThan(1);
      });
    }
  }
});

test.describe("sensitivity", () => {
  for (const mode of ["cycle", "inside-out"] as Mode[]) {
    test(`${mode} mode at the default pose: speed, bands and contrast move the terms the right way`, async ({ browser }) => {
      test.skip(!ENABLED, "set CYCLE_SCORE=1 to run the cycle interestingness harness");
      test.setTimeout(600_000);
      const base = { group: "sensitivity" as const, pose: "default" as const, mode };
      const shipped = await captureCandidate(browser, { ...base, id: `sensitivity-${mode}-shipped`, cycleSpeed: SHIPPED.cycleSpeed, cycleBands: SHIPPED.cycleBands });
      const speed0 = await captureCandidate(browser, { ...base, id: `sensitivity-${mode}-speed0`, cycleSpeed: 0, cycleBands: SHIPPED.cycleBands });
      const bands5 = await captureCandidate(browser, { ...base, id: `sensitivity-${mode}-bands5`, cycleSpeed: SHIPPED.cycleSpeed, cycleBands: 5 });
      const contrast14 = await captureCandidate(browser, { ...base, id: `sensitivity-${mode}-contrast1.4`, cycleSpeed: SHIPPED.cycleSpeed, cycleBands: SHIPPED.cycleBands, contrast: 1.4 });
      // Supplementary, not asserted: the pairing card 96's audit actually
      // measured (amber k1.4 lowered gamma to 1.2 along with contrast), so the
      // write-up can tell the gamma effect from the contrast effect.
      const auditPair = await captureCandidate(browser, { ...base, id: `sensitivity-${mode}-gamma1.2-contrast1.4`, cycleSpeed: SHIPPED.cycleSpeed, cycleBands: SHIPPED.cycleBands, gamma: 1.2, contrast: 1.4 });

      const comparison = {
        mode,
        speed: {
          shipped: { cycleInterestingness: shipped.score.cycleInterestingness, field: shipped.score.field, travel: shipped.score.travel, temporalFlux: shipped.score.fieldSummary.temporalFlux, travelTerm: shipped.score.travelTerm },
          speed0: { cycleInterestingness: speed0.score.cycleInterestingness, field: speed0.score.field, travel: speed0.score.travel, temporalFlux: speed0.score.fieldSummary.temporalFlux, travelTerm: speed0.score.travelTerm },
        },
        bands: {
          bands1_5: { edgeDensity: shipped.score.colour.edgeDensity, edgeTerm: shipped.score.edgeTerm, cycleInterestingness: shipped.score.cycleInterestingness },
          bands5: { edgeDensity: bands5.score.colour.edgeDensity, edgeTerm: bands5.score.edgeTerm, cycleInterestingness: bands5.score.cycleInterestingness },
        },
        contrast: {
          contrast2_4: { chroma: shipped.score.colour.chroma, chromaTerm: shipped.score.chromaTerm, whiteClip: shipped.score.colour.whiteClip, hueSpread: shipped.score.colour.hueSpread, cycleInterestingness: shipped.score.cycleInterestingness },
          contrast1_4: { chroma: contrast14.score.colour.chroma, chromaTerm: contrast14.score.chromaTerm, whiteClip: contrast14.score.colour.whiteClip, hueSpread: contrast14.score.colour.hueSpread, cycleInterestingness: contrast14.score.cycleInterestingness },
          chromaDirection: contrast14.score.colour.chroma > shipped.score.colour.chroma ? "up at 1.4" : "down at 1.4",
          gamma1_2_contrast1_4: { chroma: auditPair.score.colour.chroma, chromaTerm: auditPair.score.chromaTerm, whiteClip: auditPair.score.colour.whiteClip, hueSpread: auditPair.score.colour.hueSpread, cycleInterestingness: auditPair.score.cycleInterestingness },
        },
      };
      writeFileSync(artifact(`sensitivity-${mode}.json`), JSON.stringify(comparison, null, 2));

      // Speed 0 pins the phase: no travel, zero flux, the composite sits on
      // its 0.85 liveliness floor, and the whole score drops below speed 0.1.
      expect(speed0.score.travel, `speed 0 travel ${speed0.score.travel}`).toBe(0);
      expect(speed0.score.fieldSummary.temporalFlux).toBe(0);
      expect(speed0.score.field, `field ${speed0.score.field} < ${shipped.score.field}`).toBeLessThan(shipped.score.field);
      expect(speed0.score.cycleInterestingness).toBeLessThan(shipped.score.cycleInterestingness);
      // More bands per unit pack more band edges into the same object
      // (palette sweep: edges rose with cycleBands for every palette).
      expect(bands5.score.colour.edgeDensity, `edges ${bands5.score.colour.edgeDensity} > ${shipped.score.colour.edgeDensity}`).toBeGreaterThan(shipped.score.colour.edgeDensity);
      // Contrast moves chroma: 2.4 clips 58% of the lap to the floor colour,
      // 1.4 stretches the ramp. The card expected the rise card 96's audit saw
      // on amber at contrast 1.4, but that reading also lowered gamma to 1.2;
      // on the shipped cyclic Magma at gamma 1.65 the first run measured a
      // fall (0.0393 against 0.0422), so the harness asserts a change of at
      // least 0.001 and records the direction, which the sweep document
      // reports with both numbers.
      expect(Math.abs(contrast14.score.colour.chroma - shipped.score.colour.chroma), `chroma ${contrast14.score.colour.chroma} vs ${shipped.score.colour.chroma}`).toBeGreaterThan(0.001);
    });
  }
});

test.describe("repeat", () => {
  test("three fresh captures of the default pose in cycle mode agree within 0.02", async ({ browser }) => {
    test.skip(!ENABLED, "set CYCLE_SCORE=1 to run the cycle interestingness harness");
    test.setTimeout(600_000);
    const runs: CandidateResult[] = [];
    for (let i = 0; i < 3; i += 1) {
      runs.push(
        await captureCandidate(browser, {
          id: `repeat-default-cycle-${i}`,
          group: "repeat",
          pose: "default",
          mode: "cycle",
          cycleSpeed: SHIPPED.cycleSpeed,
          cycleBands: SHIPPED.cycleBands,
        }),
      );
    }
    const component = (pick: (s: CycleScore) => number) => {
      const values = runs.map((run) => pick(run.score));
      return { values, spread: Math.max(...values) - Math.min(...values) };
    };
    const report = {
      cycleInterestingness: component((s) => s.cycleInterestingness),
      field: component((s) => s.field),
      coverage: component((s) => s.fieldSummary.coverage),
      spatialAutocorrelation: component((s) => s.fieldSummary.spatialAutocorrelation),
      entropy: component((s) => s.fieldSummary.entropy),
      temporalFlux: component((s) => s.fieldSummary.temporalFlux),
      lit: component((s) => s.colour.lit),
      edgeDensity: component((s) => s.colour.edgeDensity),
      chroma: component((s) => s.colour.chroma),
      hueSpread: component((s) => s.colour.hueSpread),
      whiteClip: component((s) => s.colour.whiteClip),
      neon: component((s) => s.colour.neon),
      travel: component((s) => s.travel),
      chromaTerm: component((s) => s.chromaTerm),
      edgeTerm: component((s) => s.edgeTerm),
      travelTerm: component((s) => s.travelTerm),
      colourScore: component((s) => s.colourScore),
      lapSpan: { values: runs.map((run) => run.lapSpan), spread: Math.max(...runs.map((r) => r.lapSpan)) - Math.min(...runs.map((r) => r.lapSpan)) },
      startPhase: { values: runs.map((run) => run.frames[0].phase) },
    };
    writeFileSync(artifact("repeat-default-cycle.json"), JSON.stringify(report, null, 2));
    expect(report.cycleInterestingness.spread, `spread ${report.cycleInterestingness.spread} over ${report.cycleInterestingness.values}`).toBeLessThanOrEqual(REPEAT_TOLERANCE);
  });
});

test.afterAll(() => {
  if (!ENABLED || results.length === 0) return;
  const ranked = [...results].sort((a, b) => b.score.cycleInterestingness - a.score.cycleInterestingness);
  const groups = ["baseline", "sensitivity", "repeat"] as const;
  const sections = groups
    .filter((group) => results.some((r) => r.candidate.group === group))
    .map((group) => {
      const rows = results.filter((r) => r.candidate.group === group).map(scoreRow);
      return `## ${group}\n\n${SCORE_HEADER}\n${rows.join("\n")}`;
    });
  const fieldDetail: ScoredCandidate[] = ranked.map((r) => ({
    id: r.candidate.id,
    label: r.candidate.id,
    params: { pose: r.candidate.pose, colourMode: r.candidate.mode, cycleSpeed: r.candidate.cycleSpeed, cycleBands: r.candidate.cycleBands },
    metrics: r.score.fieldSummary,
  }));
  const report = `# Logistic-Mandelbrot cycle interestingness — ${new Date().toISOString().slice(0, 10)}

Rendered through the GPU orbit3d path at ${VIEWPORT.width}×${VIEWPORT.height}, camera parked, cascade reveal and light beam off, shipped palette (cyclic Magma, gamma 1.65) unless a contrast is named. ${FRAMES} frames ${FRAME_GAP_MS} ms apart per candidate; \`laps\` is the phase the sequence spanned, from the renderer's \`data-orbit3d-phase\`. Scored by \`e2e/harness/cycleScore.ts\`; the formula and constants are in its docblock. \`field\` is the repo composite on the blurred OKLab-L field (coverage, autocorr, entropy and flux are its per-pair means); the colour columns are \`frameColourMetrics\` means over the sequence; \`travel\` is mean OKLab×100 per consecutive pair.

## Ranked

${SCORE_HEADER}
${ranked.map(scoreRow).join("\n")}

${sections.join("\n\n")}

## Field composite detail (repo metricsTable over the per-pair means)

${metricsTable(fieldDetail, ["pose", "colourMode", "cycleSpeed", "cycleBands"])}
`;
  writeText(`${OUT}/ranked.md`, report);
  writeFileSync(`${OUT}/ranked.json`, JSON.stringify(ranked.map((r) => ({ id: r.candidate.id, candidate: r.candidate, lapSpan: r.lapSpan, score: r.score, artifacts: r.artifacts })), null, 2));
});
