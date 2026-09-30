/**
 * Logistic-Mandelbrot Inside-out cycling: integration evidence for stage 98
 * criteria 2-6 (docs/stages/98-logistic-mandelbrot-inside-out-cycling.md).
 *
 *   npx playwright test e2e/inside-out-cycling.spec.ts --workers=1
 *
 * Describe titles match the card's --grep keys: multiplier, height
 * independence, phase and ground, controls and cache. Artefacts land under
 * e2e/artifacts/inside-out-cycling/ (git-ignored).
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { ESCAPED, sampleAttractorCell } from "../src/sims/logistic-mandelbrot/model.ts";
import {
  ATTRACTION_ESCAPED,
  ATTRACTION_RESOLVED,
  ATTRACTION_UNRESOLVED,
  insideOutPaletteCoordinate,
} from "../src/app/orbitColour.ts";
import { encodeRgbPng, frameDifference } from "./harness/frame.ts";
import {
  ARTIFACT_DIR,
  DEFAULT_CYCLE_BANDS,
  GROUND_PLANE_HEIGHT,
  PROBE_ESCAPE_COLOUR,
  attractionFieldPlanes,
  attractionFieldSummary,
  attractionTexel,
  canvasDataset,
  captureCanvas,
  expectedInsideOutColour,
  frameTiming,
  frozenParams,
  gpuSample,
  hueDifference,
  hueOf,
  meanWindow,
  openSim,
  paletteLookup,
  paletteTable,
  paramSnapshot,
  period1Multiplier,
  period2Multiplier,
  probeShaderColours,
  projectToCanvas,
  rgbDistance,
  setParam,
  type Rgb,
  type ShaderProbeCase,
} from "./harness/insideOut.ts";

const WARMUP = 1500;
const SAMPLES = 8;
const MULTIPLIER_TOLERANCE = 0.01;
const COLOUR_TOLERANCE = 2;
const VIEWPORT = { width: 1280, height: 720 };

/** The card's classification corpus: analytic multipliers, one escaped, one unresolved. */
const LAMBDA = { re: 0.3, im: 0.4 };
const OFF_AXIS = {
  re: LAMBDA.re / 2 - (LAMBDA.re * LAMBDA.re - LAMBDA.im * LAMBDA.im) / 4,
  im: LAMBDA.im / 2 - (2 * LAMBDA.re * LAMBDA.im) / 4,
};
const CORPUS = [
  { label: "c=0", re: 0, im: 0, period: 1, multiplier: 0 },
  { label: "c=0.1875", re: 0.1875, im: 0, period: 1, multiplier: 0.5 },
  { label: "c=-1", re: -1, im: 0, period: 2, multiplier: 0 },
  { label: "c=-1.125", re: -1.125, im: 0, period: 2, multiplier: 0.5 },
  { label: "c=lambda/2-lambda^2/4", re: OFF_AXIS.re, im: OFF_AXIS.im, period: 1, multiplier: 0.5 },
  { label: "c=1 (escaped)", re: 1, im: 0, period: -1, multiplier: NaN },
  { label: "c=-1.9 (bounded, unresolved)", re: -1.9, im: 0, period: 0, multiplier: NaN },
] as const;

function cpuSample(re: number, im: number): { period: number; multiplier: number; escaped: boolean } {
  const out = new Float32Array(SAMPLES);
  const measure = { interior: 1 };
  const result = sampleAttractorCell(re, im, WARMUP, SAMPLES, out, 0, measure);
  return { period: result === ESCAPED ? 0 : result, multiplier: measure.interior, escaped: result === ESCAPED };
}

function analyticMultiplier(period: number, re: number, im: number): number {
  return period === 1 ? period1Multiplier(re, im) : period2Multiplier(re, im);
}

function artifact(name: string): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  return `${ARTIFACT_DIR}/${name}`;
}

test.use({ viewport: VIEWPORT });

test.describe("multiplier", () => {
  test("CPU and GPU production sampling recover the analytic cycle multipliers", async ({ page }) => {
    await page.goto("/");
    const gpu = await gpuSample(page, CORPUS.map((c) => [c.re, c.im] as const), WARMUP, SAMPLES);
    const rows = CORPUS.map((c, index) => ({
      ...c,
      cpu: cpuSample(c.re, c.im),
      gpu: gpu[index],
    }));
    writeFileSync(artifact("multiplier-samples.json"), JSON.stringify(rows, null, 2));
    for (const row of rows) {
      if (row.period === -1) {
        expect(row.cpu.escaped, row.label).toBe(true);
        expect(row.gpu.escaped, row.label).toBe(true);
        continue;
      }
      expect(row.cpu.escaped, row.label).toBe(false);
      expect(row.gpu.escaped, row.label).toBe(false);
      expect(row.cpu.period, `${row.label} cpu period`).toBe(row.period);
      expect(row.gpu.period, `${row.label} gpu period`).toBe(row.period);
      if (row.period === 0) continue;
      expect(Math.abs(row.cpu.multiplier - row.multiplier), `${row.label} cpu`).toBeLessThanOrEqual(MULTIPLIER_TOLERANCE);
      expect(Math.abs(row.gpu.multiplier - row.multiplier), `${row.label} gpu`).toBeLessThanOrEqual(MULTIPLIER_TOLERANCE);
    }
  });

  test("the ground attraction field classifies and measures at its texel centres", async ({ page }) => {
    const canvas = await openSim(page, frozenParams());
    const summary = await attractionFieldSummary(canvas);
    expect(summary).not.toBeNull();
    expect(summary!.warmupIterations).toBe(WARMUP);
    expect(summary!.sampleCount).toBe(SAMPLES);
    const rows = [];
    for (const c of CORPUS) {
      const texel = await attractionTexel(canvas, c.re, c.im);
      // The oracle runs at the texel's own centre, never at the nominal c.
      const oracle = cpuSample(texel.re, texel.im);
      const expectedClass = oracle.escaped
        ? ATTRACTION_ESCAPED
        : oracle.period > 0
          ? ATTRACTION_RESOLVED
          : ATTRACTION_UNRESOLVED;
      const analytic = oracle.period === 1 || oracle.period === 2
        ? analyticMultiplier(oracle.period, texel.re, texel.im)
        : NaN;
      rows.push({ ...c, texel, oracle, expectedClass, analytic });
      expect(texel.classification, c.label).toBe(expectedClass);
      if (expectedClass !== ATTRACTION_RESOLVED) {
        expect(texel.multiplier, `${c.label} unmeasured multiplier is 0`).toBe(0);
        continue;
      }
      expect(Math.abs(texel.multiplier - oracle.multiplier), `${c.label} vs cpu oracle`).toBeLessThanOrEqual(MULTIPLIER_TOLERANCE);
      expect(Math.abs(texel.multiplier - analytic), `${c.label} vs analytic`).toBeLessThanOrEqual(MULTIPLIER_TOLERANCE);
    }
    writeFileSync(artifact("attraction-texels.json"), JSON.stringify({ summary, rows }, null, 2));
    const planes = await attractionFieldPlanes(canvas);
    expect(planes).not.toBeNull();
    writeFileSync(
      artifact("attraction-field-masks.png"),
      encodeRgbPng(Uint8Array.from(planes!.rgb), planes!.width, planes!.height),
    );
  });
});

test.describe("height independence", () => {
  test("point and sheet palette colour ignores height and follows the multiplier", async ({ page }) => {
    await page.goto("/");
    const { preset, table } = await paletteTable(page);
    expect(preset).toBe("magma-cyclic");
    const heights = [-1.5, -0.5, 0, 0.5, 1.5];
    const cases: ShaderProbeCase[] = [];
    for (const stage of ["point", "surface"] as const) {
      for (const height of heights) {
        cases.push({ stage, colourMode: "inside-out", period: 1, multiplier: 0.5, height, boundary: 0.3, phase: 0, bands: DEFAULT_CYCLE_BANDS, reverse: false });
      }
      cases.push({ stage, colourMode: "inside-out", period: 1, multiplier: 0.15, height: 0, boundary: 0.3, phase: 0, bands: DEFAULT_CYCLE_BANDS, reverse: false });
      cases.push({ stage, colourMode: "inside-out", period: 2, multiplier: 0.5, height: -1.1, boundary: 0.9, phase: 0, bands: DEFAULT_CYCLE_BANDS, reverse: false });
      // Cycle mode keeps its height term: the same probe must see it move.
      cases.push({ stage, colourMode: "cycle", period: 1, multiplier: 0.5, height: 0, boundary: 0.3, phase: 0, bands: DEFAULT_CYCLE_BANDS, reverse: false });
      // One unit of height is half a lap at 1.5 bands: the far side of the palette.
      cases.push({ stage, colourMode: "cycle", period: 1, multiplier: 0.5, height: 1, boundary: 0.3, phase: 0, bands: DEFAULT_CYCLE_BANDS, reverse: false });
    }
    const colours = await probeShaderColours(page, cases);
    writeFileSync(artifact("height-independence.json"), JSON.stringify(cases.map((c, i) => ({ ...c, rgb: colours[i] })), null, 2));
    const expected = expectedInsideOutColour(table, 0.5, DEFAULT_CYCLE_BANDS, 0);
    const other = expectedInsideOutColour(table, 0.15, DEFAULT_CYCLE_BANDS, 0);
    expect(rgbDistance(expected, other)).toBeGreaterThan(20);
    let index = 0;
    for (const stage of ["point", "surface"] as const) {
      for (const height of heights) {
        expect(rgbDistance(colours[index], expected), `${stage} height ${height}`).toBeLessThanOrEqual(COLOUR_TOLERANCE);
        index += 1;
      }
      expect(rgbDistance(colours[index], other), `${stage} m=0.15`).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(colours[index], expected), `${stage} m=0.15 differs from m=0.5`).toBeGreaterThan(10);
      index += 1;
      expect(rgbDistance(colours[index], expected), `${stage} period-2 m=0.5 at another height and boundary`).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      index += 1;
      const cycleLow = colours[index];
      const cycleHigh = colours[index + 1];
      expect(rgbDistance(cycleLow, cycleHigh), `${stage} cycle mode still ramps with height`).toBeGreaterThan(4);
      index += 2;
    }
  });

  test("two sheets over a period-2 point share hue in the real route", async ({ page }) => {
    const canvas = await openSim(page, frozenParams({ geometryMode: "hybrid" }));
    await page.waitForTimeout(1500);
    const frame = await captureCanvas(canvas, artifact("real-route-period2-sheets.png"));
    // c = -1.125 lies in the period-2 disc with m = 0.5; its cycle points are
    // z = (-1 ± √1.5) / 2, one sheet above and one below the ground marker.
    const re = -1.125;
    const root = Math.sqrt(1.5);
    const sheets = [(-1 + root) / 2, (-1 - root) / 2];
    const samples = [];
    for (const z of sheets) {
      const { x, y } = await projectToCanvas(page, re, 0, z, frame.width, frame.height);
      const rgb = meanWindow(frame, x, y, 2);
      samples.push({ z, x, y, rgb, ...hueOf(rgb) });
    }
    writeFileSync(artifact("real-route-period2-sheets.json"), JSON.stringify(samples, null, 2));
    for (const sample of samples) {
      expect(sample.lightness, `sheet z=${sample.z} is lit`).toBeGreaterThan(0.1);
      expect(sample.chroma, `sheet z=${sample.z} is chromatic`).toBeGreaterThan(0.02);
    }
    expect(hueDifference(samples[0].hue, samples[1].hue)).toBeLessThan(25);
  });
});

test.describe("phase and ground", () => {
  const PHASES = [0, 0.25, 0.5, 1];

  test("point, sheet and ground palette lookups follow fract(bands*m - phase) in both directions", async ({ page }) => {
    await page.goto("/");
    const { table } = await paletteTable(page);
    const cases: ShaderProbeCase[] = [];
    const expected: Rgb[] = [];
    const labels: string[] = [];
    for (const stage of ["point", "surface", "ground"] as const) {
      for (const reverse of [false, true]) {
        for (const phase of PHASES) {
          for (const [period, multiplier] of [[1, 0.5], [2, 0.5], [1, 0.1], [3, 0.8]] as const) {
            cases.push({ stage, colourMode: "inside-out", period, multiplier, height: 0.3, boundary: 0.6, phase, bands: DEFAULT_CYCLE_BANDS, reverse });
            expected.push(expectedInsideOutColour(table, multiplier, DEFAULT_CYCLE_BANDS, phase));
            labels.push(`${stage} reverse=${reverse} phase=${phase} q=${period} m=${multiplier}`);
          }
        }
      }
    }
    const colours = await probeShaderColours(page, cases);
    writeFileSync(
      artifact("phase-lookups.json"),
      JSON.stringify(cases.map((c, i) => ({ ...c, rgb: colours[i], expected: expected[i], coordinate: insideOutPaletteCoordinate(c.multiplier, c.bands, c.phase) })), null, 2),
    );
    colours.forEach((rgb, i) => {
      expect(rgbDistance(rgb, expected[i]), labels[i]).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    });
    // Phase 0 and phase 1 close the loop; period-1 and period-2 cells with
    // m = 0.5 agree; the three stages agree with one another.
    const at = (stage: string, reverse: boolean, phase: number, period: number, multiplier: number) => {
      const i = labels.indexOf(`${stage} reverse=${reverse} phase=${phase} q=${period} m=${multiplier}`);
      expect(i).toBeGreaterThanOrEqual(0);
      return colours[i];
    };
    for (const stage of ["point", "surface", "ground"]) {
      expect(rgbDistance(at(stage, false, 0, 1, 0.5), at(stage, false, 1, 1, 0.5))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(at(stage, false, 0.25, 1, 0.5), at(stage, false, 0.25, 2, 0.5))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(at(stage, false, 0.5, 1, 0.5), at(stage, true, 0.5, 1, 0.5))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(at(stage, false, 0.25, 1, 0.5), at(stage, false, 0.5, 1, 0.5))).toBeGreaterThan(10);
    }
    for (const phase of PHASES) {
      expect(rgbDistance(at("point", false, phase, 1, 0.5), at("surface", false, phase, 1, 0.5))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(at("point", false, phase, 1, 0.5), at("ground", false, phase, 1, 0.5))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    }
  });

  test("the shared phase reverses sign once and pins at speed zero", async ({ page }) => {
    const canvas = await openSim(page, frozenParams({ cycleSpeed: 0 }));
    await page.waitForTimeout(500);
    expect((await canvasDataset(canvas)).orbit3dPhase).toBe("0.000000");
    const phases = await page.evaluate(async () => {
      const { palettePhase } = await import("/src/app/webglRenderer.ts");
      const options = { preset: "magma-cyclic", invert: false, gamma: 1.65, contrast: 2.4, steps: 0 };
      return {
        forward: palettePhase({ cycleSpeed: 0.1 }, 2.5, { ...options, paletteCycleReverse: false } as any, 1),
        reverse: palettePhase({ cycleSpeed: 0.1 }, 2.5, { ...options, paletteCycleReverse: true } as any, 1),
        stopped: palettePhase({ cycleSpeed: 0 }, 2.5, { ...options, paletteCycleReverse: true } as any, 1),
        wrapped: palettePhase({ cycleSpeed: 0.1 }, 12.5, { ...options, paletteCycleReverse: false } as any, 1),
      };
    });
    expect(phases.forward).toBeCloseTo(0.25, 9);
    expect(phases.reverse).toBeCloseTo(0.75, 9);
    expect(phases.stopped).toBe(0);
    expect(phases.wrapped).toBeCloseTo(0.25, 9);
  });

  test("exterior ground keeps escape-time colouring", async ({ page }) => {
    await page.goto("/");
    const escaped = await probeShaderColours(page, [
      { stage: "ground", colourMode: "inside-out", period: 1, multiplier: 0.2, height: 0, boundary: 0, phase: 0, bands: DEFAULT_CYCLE_BANDS, reverse: false, escaped: true },
      { stage: "ground", colourMode: "inside-out", period: 2, multiplier: 0.9, height: 0, boundary: 0, phase: 0.6, bands: 4, reverse: true, escaped: true },
      { stage: "ground", colourMode: "inside-out", period: 0, multiplier: 0, height: 0, boundary: 0, phase: 0.3, bands: DEFAULT_CYCLE_BANDS, reverse: false },
    ]);
    // Escaped texels reproduce the escape texture whatever the field holds;
    // an unresolved texel takes the steady neutral.
    expect(rgbDistance(escaped[0], PROBE_ESCAPE_COLOUR)).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    expect(rgbDistance(escaped[1], PROBE_ESCAPE_COLOUR)).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    expect(rgbDistance(escaped[2], [0.44 * 255, 0.47 * 255, 0.53 * 255])).toBeLessThanOrEqual(COLOUR_TOLERANCE);

    // Real route: with the ground writing its pre-ink colour, exterior pixels
    // are identical between Inside-out and Period mode at phase 0 (both are
    // the escape colouring), while interior pixels differ.
    const frames: Record<string, { x: number; y: number; rgb: Rgb }[]> = {};
    // Exterior probes sit on ground with no cloud along the default camera's
    // view ray (additive points would tint the pixel differently per mode);
    // interior probes sit where the multiplier puts the palette coordinate
    // at 0.5 (1.5 bands × m = 1/3).
    const points = [
      { label: "exterior c=(-0.2,0.85)", re: -0.2, im: 0.85 },
      { label: "exterior c=(0.6,-0.9)", re: 0.6, im: -0.9 },
      { label: "exterior c=(-1.6,-0.9)", re: -1.6, im: -0.9 },
      { label: "interior cardioid c=(0.138,0)", re: 0.138, im: 0 },
      { label: "interior period-2 c=(-1.083,0)", re: -1.083, im: 0 },
    ];
    for (const colourMode of ["inside-out", "period"]) {
      const context = await page.context().browser()!.newContext({ viewport: VIEWPORT });
      const other = await context.newPage();
      const canvas = await openSim(other, frozenParams({ colourMode }), "?groundDiagnostic=palette");
      await other.waitForTimeout(1200);
      const frame = await captureCanvas(canvas, artifact(`ground-diagnostic-${colourMode}.png`));
      frames[colourMode] = [];
      for (const point of points) {
        const { x, y } = await projectToCanvas(other, point.re, point.im, GROUND_PLANE_HEIGHT, frame.width, frame.height);
        expect(x, `${point.label} on canvas`).toBeGreaterThan(0);
        expect(y, `${point.label} on canvas`).toBeGreaterThan(0);
        expect(x, `${point.label} on canvas`).toBeLessThan(frame.width);
        expect(y, `${point.label} on canvas`).toBeLessThan(frame.height);
        frames[colourMode].push({ x, y, rgb: meanWindow(frame, x, y, 1) });
      }
      await context.close();
    }
    writeFileSync(artifact("ground-exterior-comparison.json"), JSON.stringify({ points, frames }, null, 2));
    for (let index = 0; index < 3; index += 1) {
      expect(rgbDistance(frames["inside-out"][index].rgb, frames.period[index].rgb), points[index].label).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(Math.max(...frames.period[index].rgb), `${points[index].label} is lit`).toBeGreaterThan(20);
    }
    for (let index = 3; index < points.length; index += 1) {
      expect(rgbDistance(frames["inside-out"][index].rgb, frames.period[index].rgb), points[index].label).toBeGreaterThan(10);
    }
  });
});

test.describe("controls and cache", () => {
  test("selecting Inside-out through the controls animates without rebuilding the cloud or the field", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const canvas = await openSim(page, frozenParams({ colourMode: "cycle", cycleSpeed: 0 }));
    await page.locator(".sim-view__drawer-handle").click();
    const initial = await canvasDataset(canvas);
    const points = initial.orbit3dPoints;
    expect(Number(points)).toBeGreaterThan(0);
    expect(initial.orbit3dAttractionBuilds).toBe("0");

    await setParam(page, "colourMode", "inside-out");
    await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue("inside-out");
    await page.waitForTimeout(600);
    const selected = await canvasDataset(canvas);
    expect(selected.orbit3dPoints).toBe(points);
    expect(selected.orbit3dBuild).toBe("complete");
    expect(selected.orbit3dAttractionBuilds).toBe("1");
    expect(selected.orbit3dAttractionSource).toBe("gpu");
    const stopped = await captureCanvas(canvas, artifact("controls-inside-out-speed0.png"));

    await setParam(page, "cycleSpeed", 0.1);
    await expect(page.locator('[data-param-key="cycleSpeed"]')).toHaveValue("0.1");
    await page.waitForTimeout(800);
    const phaseA = (await canvasDataset(canvas)).orbit3dPhase;
    await page.waitForTimeout(1200);
    const running = await canvasDataset(canvas);
    expect(running.orbit3dPhase).not.toBe(phaseA);
    expect(running.orbit3dAttractionBuilds).toBe("1");
    expect(running.orbit3dPoints).toBe(points);
    const moving = await captureCanvas(canvas, artifact("controls-inside-out-speed0.1.png"));
    expect(frameDifference(stopped, moving)).toBeGreaterThan(1);

    const direction = page.getByRole("combobox", { name: "Cycle direction", exact: true });
    await direction.selectOption("reverse");
    await expect(direction).toHaveValue("reverse");
    await page.waitForTimeout(600);
    const palette = page.getByRole("combobox", { name: "Palette", exact: true });
    await palette.selectOption("magma");
    await expect(palette).toHaveValue("magma");
    await page.waitForTimeout(600);
    await setParam(page, "cycleBands", 3);
    await expect(page.locator('[data-param-key="cycleBands"]')).toHaveValue("3");
    await page.waitForTimeout(600);
    const recoloured = await canvasDataset(canvas);
    expect(recoloured.orbit3dAttractionBuilds).toBe("1");
    expect(recoloured.orbit3dPoints).toBe(points);
    await captureCanvas(canvas, artifact("controls-reverse-magma-bands3.png"));

    await setParam(page, "geometryMode", "hybrid");
    await expect(canvas).toHaveAttribute("data-orbit3d-geometry", "hybrid", { timeout: 120_000 });
    await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 120_000 });
    await page.waitForTimeout(800);
    const hybrid = await canvasDataset(canvas);
    expect(hybrid.orbit3dAttractionBuilds).toBe("1");
    await captureCanvas(canvas, artifact("controls-hybrid.png"));

    await setParam(page, "colourMode", "cycle");
    await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue("cycle");
    await page.waitForTimeout(600);
    await captureCanvas(canvas, artifact("controls-back-to-cycle.png"));

    await page.getByRole("button", { name: "Reset to defaults", exact: true }).click();
    await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue("cycle");
    await expect(palette).toHaveValue("magma-cyclic");
    await expect(direction).toHaveValue("forward");
    const snapshot = await paramSnapshot(page);
    expect(snapshot.cycleSpeed).toBe("0.1");
    expect(snapshot.cycleBands).toBe("1.5");
    expect(snapshot.geometryMode).toBe("cloud");
    expect(snapshot.colourMode).toBe("cycle");
    expect(errors).toEqual([]);
  });

  test("warm-cache render timing and field build time against the unchanged baseline", async ({ page }) => {
    const baseUrl = process.env.INSIDE_OUT_BASELINE_URL ?? "http://localhost:5174";
    const measure = async (target: typeof page, prefix: string) => {
      const canvas = target.locator(".sim-view__canvas");
      await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 120_000 });
      await target.waitForTimeout(1000);
      const runs = [];
      for (let sample = 0; sample < 3; sample += 1) runs.push(await frameTiming(target));
      return { prefix, runs, dataset: await canvasDataset(canvas) };
    };
    const params = frozenParams({ cycleSpeed: 0.1 });
    const current = await (async () => {
      await openSim(page, params);
      return measure(page, "current");
    })();
    // Park the current page so only one renderer holds the GPU while the
    // baseline is measured.
    await page.goto("about:blank");
    let baseline: Awaited<ReturnType<typeof measure>> | null = null;
    try {
      const context = await page.context().browser()!.newContext({ viewport: VIEWPORT });
      const other = await context.newPage();
      await other.addInitScript(
        ([values]) => localStorage.setItem("el:values:logistic-mandelbrot", JSON.stringify(values)),
        [params] as const,
      );
      await other.goto(`${baseUrl}/#/logistic-mandelbrot`, { timeout: 10_000 });
      baseline = await measure(other, "baseline");
      await context.close();
    } catch (error) {
      baseline = null;
      console.log(`baseline server unavailable at ${baseUrl}: ${(error as Error).message.split("\n")[0]}`);
    }
    if (!baseline) {
      writeFileSync(artifact("render-timing.json"), JSON.stringify({ current: current.runs, baseline: null, verdict: "unmet" }, null, 2));
    }
    expect(
      baseline,
      `criterion 5 render-timing comparison unmet: no unchanged baseline served at ${baseUrl} (see docs/audits/98-inside-out-cycling.md, "Serving the baseline")`,
    ).not.toBeNull();
    const report = {
      current: {
        medianMs: current.runs.map((r) => r.medianMs),
        p90Ms: current.runs.map((r) => r.p90Ms),
        attractionBuildMs: current.dataset.orbit3dAttractionBuildMs,
        attractionSize: current.dataset.orbit3dAttractionSize,
        points: current.dataset.orbit3dPoints,
      },
      baseline: baseline
        ? {
            medianMs: baseline.runs.map((r) => r.medianMs),
            p90Ms: baseline.runs.map((r) => r.p90Ms),
            points: baseline.dataset.orbit3dPoints,
          }
        : null,
    };
    console.log(JSON.stringify(report));
    writeFileSync(artifact("render-timing.json"), JSON.stringify(report, null, 2));
    expect(Number(current.dataset.orbit3dAttractionBuildMs)).toBeLessThan(2000);
    for (let sample = 0; sample < 3; sample += 1) {
      expect(current.runs[sample].medianMs).toBeLessThanOrEqual(baseline!.runs[sample].medianMs * 1.2 + 1);
    }
  });
});

test.describe("direction of travel", () => {
  const SEQUENCE_DIR = `${ARTIFACT_DIR}/reverse-sequence`;
  const FRAMES = 4;
  const FRAME_GAP_MS = 1000;
  const FIXED_MULTIPLIER = 0.5;

  /** Signed lap delta between two phases on the unit circle, in (-0.5, 0.5]. */
  const lapDelta = (from: number, to: number) => ((to - from + 1.5) % 1) - 0.5;

  for (const geometry of ["cloud", "hybrid"] as const) {
    test(`${geometry}: forward and reverse sequences over the ground and the period-2 bulb move in opposite directions`, async ({ page }) => {
      mkdirSync(SEQUENCE_DIR, { recursive: true });
      // Defaults except Inside-out mode and a parked camera. The default pose
      // looks down on the whole set from above the ground plane, so the ground,
      // the cardioid and the period-2 bulb at c = -1 are all in frame.
      const canvas = await openSim(page, frozenParams({ geometryMode: geometry, cycleSpeed: 0.1 }));
      await page.waitForTimeout(1000);
      const initial = await canvasDataset(canvas);
      const points = initial.orbit3dPoints;
      const azimuth = initial.orbit3dCameraAzimuth;
      const distance = initial.orbit3dCameraDistance;
      expect(Number(points)).toBeGreaterThan(0);
      // The immersive sidebar parks off-screen and reveals on hover or
      // focus-within; its parked x is the reference for "drawer closed".
      const sidebar = page.locator(".sim-view__sidebar");
      const parkedX = (await sidebar.boundingBox())!.x;
      expect(parkedX).toBeGreaterThan(VIEWPORT.width - 40);

      const capture = async (direction: "forward" | "reverse") => {
        const frames: { path: string; phase: number; coordinate: number; motion: number }[] = [];
        let previous: Awaited<ReturnType<typeof captureCanvas>> | null = null;
        for (let index = 0; index < FRAMES; index += 1) {
          if (index > 0) await page.waitForTimeout(FRAME_GAP_MS);
          const path = `${SEQUENCE_DIR}/${geometry}-${direction}-${index}.png`;
          const image = await captureCanvas(canvas, path);
          const dataset = await canvasDataset(canvas);
          expect(dataset.orbit3dPoints, `${direction} frame ${index} point count`).toBe(points);
          expect(dataset.orbit3dCameraAzimuth, `${direction} frame ${index} camera azimuth`).toBe(azimuth);
          expect(dataset.orbit3dCameraDistance, `${direction} frame ${index} camera distance`).toBe(distance);
          expect(dataset.orbit3dGeometry).toBe(geometry);
          const phase = Number(dataset.orbit3dPhase);
          frames.push({
            path,
            phase,
            coordinate: insideOutPaletteCoordinate(FIXED_MULTIPLIER, DEFAULT_CYCLE_BANDS, phase),
            motion: previous ? frameDifference(previous, image) : 0,
          });
          previous = image;
        }
        return frames;
      };

      const forward = await capture("forward");

      // Flip only the direction. Palette, bands, geometry and camera stay as
      // they were, and the drawer is closed again before the reverse frames.
      const handle = page.locator(".sim-view__drawer-handle");
      await handle.click();
      const direction = page.getByRole("combobox", { name: "Cycle direction", exact: true });
      await direction.selectOption("reverse");
      await expect(direction).toHaveValue("reverse");
      await handle.click();
      await expect(handle).toHaveAttribute("aria-expanded", "false");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(20, VIEWPORT.height / 2);
      await expect.poll(async () => (await sidebar.boundingBox())!.x, { timeout: 5000 }).toBe(parkedX);
      await page.waitForTimeout(600);
      const reverse = await capture("reverse");
      const snapshot = await paramSnapshot(page);
      expect(snapshot.cycleBands).toBe(String(DEFAULT_CYCLE_BANDS));
      expect(snapshot.cycleSpeed).toBe("0.1");
      expect(snapshot.colourMode).toBe("inside-out");
      expect(snapshot.geometryMode).toBe(geometry);
      expect(await page.getByRole("combobox", { name: "Palette", exact: true }).inputValue()).toBe("magma-cyclic");

      const steps = (frames: typeof forward, key: "phase" | "coordinate") =>
        frames.slice(1).map((frame, i) => lapDelta(frames[i][key], frame[key]));
      const report = {
        geometry,
        fixedMultiplier: FIXED_MULTIPLIER,
        bands: DEFAULT_CYCLE_BANDS,
        forward,
        reverse,
        forwardPhaseSteps: steps(forward, "phase"),
        reversePhaseSteps: steps(reverse, "phase"),
        forwardCoordinateSteps: steps(forward, "coordinate"),
        reverseCoordinateSteps: steps(reverse, "coordinate"),
      };
      writeFileSync(`${SEQUENCE_DIR}/${geometry}-sequence.json`, JSON.stringify(report, null, 2));

      // Production phase uniform: forward advances, reverse retreats, every step.
      for (const step of report.forwardPhaseSteps) expect(step).toBeGreaterThan(0.02);
      for (const step of report.reversePhaseSteps) expect(step).toBeLessThan(-0.02);
      // Palette coordinate fract(k*m - phase) at a fixed m therefore moves the
      // opposite way to the phase: down in forward mode, up in reverse. A fixed
      // colour (fixed coordinate) sits at m = (coordinate + phase) / k, so
      // forward carries it to larger m, from the bulb centre outwards, and
      // reverse carries it inwards.
      for (const step of report.forwardCoordinateSteps) expect(step).toBeLessThan(-0.02);
      for (const step of report.reverseCoordinateSteps) expect(step).toBeGreaterThan(0.02);
      // Frame-to-frame motion at a one-second gap is a fraction of the frozen
      // contract's 2.5-second threshold of 1; the sequence end-to-end clears it.
      for (const frame of [...forward.slice(1), ...reverse.slice(1)]) expect(frame.motion, frame.path).toBeGreaterThan(0.3);
      for (const frames of [forward, reverse]) {
        expect(frames.reduce((sum, frame) => sum + frame.motion, 0), `${geometry} ${frames[0].path} sequence motion`).toBeGreaterThan(1);
      }
    });
  }
});
