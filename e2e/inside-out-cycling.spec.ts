/**
 * Logistic-Mandelbrot Inside-out spread colouring: integration evidence for
 * stage 100 criteria 2-7 (docs/stages/100-logistic-mandelbrot-inside-out-spread-colouring.md),
 * on top of the stage 98 tests its audit (docs/audits/2026-10-02-orbit-spread-colouring.md,
 * section G) says still hold.
 *
 *   npx playwright test e2e/inside-out-cycling.spec.ts --workers=1
 *
 * Describe titles match the card's --grep keys: centre, spread, phase and
 * ground, chaotic, controls and cache, direction of travel. Artefacts land
 * under e2e/artifacts/inside-out-spread/ (git-ignored).
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  ESCAPED,
  SPREAD_WINDOW_ITERATIONS,
  sampleAttractorCell,
  type AttractorCellMeasure,
} from "../src/sims/logistic-mandelbrot/model.ts";
import {
  ATTRACTION_ESCAPED,
  ATTRACTION_RESOLVED,
  ATTRACTION_UNRESOLVED,
  classifyAttraction,
  spreadPaletteCoordinate,
} from "../src/app/orbitColour.ts";
import { encodeRgbPng, frameDifference } from "./harness/frame.ts";
import {
  ARTIFACT_DIR,
  DEFAULT_CYCLE_BANDS,
  GROUND_PLANE_HEIGHT,
  PROBE_ESCAPE_COLOUR,
  attractionFieldPlanes,
  attractionFieldRow,
  attractionFieldSummary,
  attractionTexel,
  canvasDataset,
  captureCanvas,
  expectedSpreadColour,
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
  referenceOrbit,
  rgbDistance,
  setParam,
  type Rgb,
  type ShaderProbeCase,
} from "./harness/insideOut.ts";

const WARMUP = 1500;
const SAMPLES = 8;
const MULTIPLIER_TOLERANCE = 0.01;
/** Closed-form and one-cycle centres: float32 GPU arithmetic against float64. */
const CENTRE_TOLERANCE = 1e-3;
/** A 1024-iterate running mean against a 10^6-iterate reference (audit A2, risk b). */
const UNRESOLVED_REFERENCE_TOLERANCE = 0.1;
/** Two independent 1024-iterate estimates may err in opposite directions (audit risk b). */
const UNRESOLVED_CPU_GPU_TOLERANCE = 0.16;
const COLOUR_TOLERANCE = 2;
const VIEWPORT = { width: 1280, height: 720 };
/** Stage 98's steady neutral, as 8-bit RGB; no Inside-out source may produce it now. */
const OLD_NEUTRAL: Rgb = [0.44 * 255, 0.47 * 255, 0.53 * 255];
/**
 * The shipped palette (cyclic Magma at gamma 1.65, contrast 2.4) is one flat
 * colour outside about [0.14, 0.56] of the lap, so a changed coordinate shows
 * as a changed colour only when both coordinates fall inside that band.
 * Coordinates are asserted everywhere; colours where the palette can show it.
 */
const PALETTE_VISIBLE = [0.145, 0.55];
const visible = (coordinate: number) => coordinate >= PALETTE_VISIBLE[0] && coordinate <= PALETTE_VISIBLE[1];

/** Centre of the 1/3 bulb, found by Newton on f_c^3(0) = 0 (audit A1). */
const PERIOD3_BULB = { re: -0.122561166876654, im: 0.744861766619744 };

/** The card's centre corpus: closed forms, one bulb centre, one chaotic column, one escaped cell. */
const CENTRE_CORPUS = [
  { label: "c=0", re: 0, im: 0, period: 1, centre: 0, spread: 0 },
  { label: "c=-0.5", re: -0.5, im: 0, period: 1, centre: (1 - Math.sqrt(3)) / 2, spread: 0 },
  { label: "c=-1", re: -1, im: 0, period: 2, centre: -0.5, spread: 0.5 },
  { label: "c=-0.8", re: -0.8, im: 0, period: 2, centre: -0.5, spread: Math.sqrt(0.2) / 2 },
  { label: "period-3 bulb centre", re: PERIOD3_BULB.re, im: PERIOD3_BULB.im, period: 3, centre: NaN, spread: NaN },
  { label: "c=-1.9 (bounded, no period)", re: -1.9, im: 0, period: 0, centre: NaN, spread: NaN },
  { label: "c=1 (escaped)", re: 1, im: 0, period: -1, centre: NaN, spread: NaN },
] as const;

/** Stage 98's multiplier corpus; the multiplier is still computed and unchanged. */
const LAMBDA = { re: 0.3, im: 0.4 };
const OFF_AXIS = {
  re: LAMBDA.re / 2 - (LAMBDA.re * LAMBDA.re - LAMBDA.im * LAMBDA.im) / 4,
  im: LAMBDA.im / 2 - (2 * LAMBDA.re * LAMBDA.im) / 4,
};
const MULTIPLIER_CORPUS = [
  { label: "c=0", re: 0, im: 0, period: 1, multiplier: 0 },
  { label: "c=0.1875", re: 0.1875, im: 0, period: 1, multiplier: 0.5 },
  { label: "c=-1", re: -1, im: 0, period: 2, multiplier: 0 },
  { label: "c=-1.125", re: -1.125, im: 0, period: 2, multiplier: 0.5 },
  { label: "c=lambda/2-lambda^2/4", re: OFF_AXIS.re, im: OFF_AXIS.im, period: 1, multiplier: 0.5 },
  { label: "c=1 (escaped)", re: 1, im: 0, period: -1, multiplier: NaN },
  { label: "c=-1.9 (bounded, unresolved)", re: -1.9, im: 0, period: 0, multiplier: NaN },
] as const;

interface CpuSample {
  period: number;
  multiplier: number;
  centre: number;
  spread: number;
  escaped: boolean;
}

function cpuSample(re: number, im: number): CpuSample {
  const out = new Float32Array(SAMPLES);
  const measure: AttractorCellMeasure = { interior: 1, centre: 0, spread: 0 };
  const result = sampleAttractorCell(re, im, WARMUP, SAMPLES, out, 0, measure);
  return {
    period: result === ESCAPED ? 0 : result,
    multiplier: measure.interior,
    centre: measure.centre,
    spread: measure.spread,
    escaped: result === ESCAPED,
  };
}

function analyticMultiplier(period: number, re: number, im: number): number {
  return period === 1 ? period1Multiplier(re, im) : period2Multiplier(re, im);
}

/** Expected centre and spread for a corpus row: closed form, one float64 cycle, or a long reference. */
function expectedCentre(row: (typeof CENTRE_CORPUS)[number]): { centre: number; spread: number; tolerance: number } {
  if (row.period > 0 && Number.isFinite(row.centre)) {
    return { centre: row.centre, spread: row.spread, tolerance: CENTRE_TOLERANCE };
  }
  if (row.period > 0) {
    const cycle = referenceOrbit(row.re, row.im, 3000, row.period);
    return { centre: cycle.mean, spread: cycle.rms, tolerance: CENTRE_TOLERANCE };
  }
  const reference = referenceOrbit(row.re, row.im, WARMUP, 1_000_000);
  return { centre: reference.mean, spread: reference.rms, tolerance: UNRESOLVED_REFERENCE_TOLERANCE };
}

function artifact(name: string): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  return `${ARTIFACT_DIR}/${name}`;
}

const probe = (
  stage: ShaderProbeCase["stage"],
  overrides: Partial<ShaderProbeCase>,
): ShaderProbeCase => ({
  stage,
  colourMode: "inside-out",
  period: 1,
  centre: 0,
  height: 0,
  boundary: 0.3,
  phase: 0,
  bands: DEFAULT_CYCLE_BANDS,
  reverse: false,
  ...overrides,
});

test.use({ viewport: VIEWPORT });

test.describe("multiplier", () => {
  test("CPU and GPU production sampling recover the analytic cycle multipliers", async ({ page }) => {
    await page.goto("/");
    const gpu = await gpuSample(page, MULTIPLIER_CORPUS.map((c) => [c.re, c.im] as const), WARMUP, SAMPLES);
    const rows = MULTIPLIER_CORPUS.map((c, index) => ({
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
});

test.describe("centre", () => {
  test("the production GPU sampler reads the centre and RMS deviation of the closed forms, one float64 cycle and a long reference", async ({ page }) => {
    await page.goto("/");
    const gpu = await gpuSample(page, CENTRE_CORPUS.map((c) => [c.re, c.im] as const), WARMUP, SAMPLES);
    const rows = CENTRE_CORPUS.map((c, index) => {
      const expected = c.period === -1 ? null : expectedCentre(c);
      return { ...c, expected, cpu: cpuSample(c.re, c.im), gpu: gpu[index] };
    });
    writeFileSync(artifact("centre-samples.json"), JSON.stringify(rows, null, 2));
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
      const { centre, spread, tolerance } = row.expected!;
      for (const path of ["cpu", "gpu"] as const) {
        expect(Math.abs(row[path].centre - centre), `${row.label} ${path} centre ${row[path].centre} vs ${centre}`).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(row[path].spread - spread), `${row.label} ${path} spread ${row[path].spread} vs ${spread}`).toBeLessThanOrEqual(tolerance);
      }
      const pathTolerance = row.period === 0 ? UNRESOLVED_CPU_GPU_TOLERANCE : CENTRE_TOLERANCE;
      expect(Math.abs(row.cpu.centre - row.gpu.centre), `${row.label} cpu vs gpu centre`).toBeLessThanOrEqual(pathTolerance);
      expect(Math.abs(row.cpu.spread - row.gpu.spread), `${row.label} cpu vs gpu spread`).toBeLessThanOrEqual(pathTolerance);
    }
    // The chaotic column is wide: a centre read from its 8 plotted samples
    // would be off by up to 0.79 (audit A2), so a correct reading proves the
    // long window ran on both paths.
    const chaotic = rows.find((row) => row.period === 0)!;
    expect(chaotic.gpu.spread).toBeGreaterThan(0.5);
    expect(SPREAD_WINDOW_ITERATIONS).toBe(1024);
  });

  test("the ground attraction field holds each texel's centre, RMS deviation and classification", async ({ page }) => {
    const canvas = await openSim(page, frozenParams());
    const summary = await attractionFieldSummary(canvas);
    expect(summary).not.toBeNull();
    expect(summary!.warmupIterations).toBe(WARMUP);
    expect(summary!.sampleCount).toBe(SAMPLES);
    expect(summary!.source).toBe("gpu");
    const rows = [];
    for (const c of CENTRE_CORPUS) {
      const texel = await attractionTexel(canvas, c.re, c.im);
      // The oracle runs at the texel's own centre, never at the nominal c.
      const oracle = cpuSample(texel.re, texel.im);
      const expectedClass = classifyAttraction(oracle.escaped, oracle.period);
      rows.push({ ...c, texel, oracle, expectedClass });
      expect(texel.classification, c.label).toBe(expectedClass);
      expect(texel.period, `${c.label} period`).toBe(oracle.period);
      if (expectedClass === ATTRACTION_ESCAPED) {
        expect(texel.centre, `${c.label} escaped centre is 0`).toBe(0);
        expect(texel.spread, `${c.label} escaped spread is 0`).toBe(0);
        continue;
      }
      const tolerance = expectedClass === ATTRACTION_RESOLVED ? CENTRE_TOLERANCE : UNRESOLVED_CPU_GPU_TOLERANCE;
      expect(Math.abs(texel.centre - oracle.centre), `${c.label} centre vs cpu oracle`).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(texel.spread - oracle.spread), `${c.label} spread vs cpu oracle`).toBeLessThanOrEqual(tolerance);
    }
    expect(rows.map((row) => row.expectedClass)).toEqual(expect.arrayContaining([ATTRACTION_RESOLVED, ATTRACTION_UNRESOLVED, ATTRACTION_ESCAPED]));
    // Along Im(c) = 0 the cardioid's spread is zero and the period-2 bulb's
    // spread is sqrt(-(c + 3/4)) for -5/4 < c < -3/4.
    const row = await attractionFieldRow(canvas, 0);
    const cardioid = row.filter((t) => t.period === 1 && t.re > -0.7 && t.re < 0.2);
    const bulb = row.filter((t) => t.period === 2 && t.re > -1.24 && t.re < -0.76);
    expect(cardioid.length).toBeGreaterThan(100);
    expect(bulb.length).toBeGreaterThan(50);
    for (const texel of cardioid) expect(texel.spread, `cardioid spread at ${texel.re}`).toBeLessThanOrEqual(CENTRE_TOLERANCE);
    for (const texel of bulb) {
      expect(Math.abs(texel.centre + 0.5), `bulb centre at ${texel.re}`).toBeLessThanOrEqual(CENTRE_TOLERANCE);
      expect(Math.abs(texel.spread - Math.sqrt(-(texel.re + 0.75))), `bulb spread at ${texel.re}`).toBeLessThanOrEqual(CENTRE_TOLERANCE);
    }
    writeFileSync(artifact("attraction-texels.json"), JSON.stringify({ summary, rows, realAxis: { cardioidTexels: cardioid.length, bulbTexels: bulb.length } }, null, 2));
    const planes = await attractionFieldPlanes(canvas);
    expect(planes).not.toBeNull();
    writeFileSync(
      artifact("attraction-field-planes.png"),
      encodeRgbPng(Uint8Array.from(planes!.rgb), planes!.width, planes!.height),
    );
  });
});

test.describe("spread", () => {
  test("point and sheet palette colour follows the mirrored height distance in the production shaders", async ({ page }) => {
    await page.goto("/");
    const { preset, table } = await paletteTable(page);
    expect(preset).toBe("magma-cyclic");
    const centre = -0.5;
    // Coordinates 0.15, 0.3, 0.45 (visible), 0.6, 0.05 and 0.8 (flat).
    const distances = [0.1, 0.2, 0.3, 0.4, 0.7, 1.2];
    const cases: ShaderProbeCase[] = [];
    const labels: string[] = [];
    const expected: Rgb[] = [];
    for (const stage of ["point", "surface"] as const) {
      for (const distance of distances) {
        for (const sign of [1, -1]) {
          cases.push(probe(stage, { centre, height: centre + sign * distance, period: 2 }));
          labels.push(`${stage} d=${distance} ${sign > 0 ? "above" : "below"}`);
          expected.push(expectedSpreadColour(table, centre + sign * distance, centre, DEFAULT_CYCLE_BANDS, 0));
        }
      }
      // Shifting height and centre together leaves the distance, so the colour.
      cases.push(probe(stage, { centre: 0.1, height: 0.3, period: 1 }));
      labels.push(`${stage} d=0.2 at centre 0.1`);
      expected.push(expectedSpreadColour(table, 0.3, 0.1, DEFAULT_CYCLE_BANDS, 0));
      cases.push(probe(stage, { centre: -1.1, height: -0.9, period: 0 }));
      labels.push(`${stage} d=0.2 at centre -1.1`);
      expected.push(expectedSpreadColour(table, -0.9, -1.1, DEFAULT_CYCLE_BANDS, 0));
      // A period-1 sheet sits at its own centre: distance zero at any height.
      for (const height of [-1.5, 0.2, 1.4]) {
        cases.push(probe(stage, { centre: height, height, period: 1 }));
        labels.push(`${stage} d=0 at height ${height}`);
        expected.push(expectedSpreadColour(table, height, height, DEFAULT_CYCLE_BANDS, 0));
      }
      // Cycle mode is untouched: its own height term still moves the colour.
      cases.push(probe(stage, { colourMode: "cycle", centre: 0, height: 0 }));
      labels.push(`${stage} cycle height 0`);
      expected.push([NaN, NaN, NaN]);
      cases.push(probe(stage, { colourMode: "cycle", centre: 0, height: 1 }));
      labels.push(`${stage} cycle height 1`);
      expected.push([NaN, NaN, NaN]);
    }
    const colours = await probeShaderColours(page, cases);
    writeFileSync(
      artifact("spread-lookups.json"),
      JSON.stringify(cases.map((c, i) => ({ label: labels[i], ...c, rgb: colours[i], expected: expected[i], coordinate: spreadPaletteCoordinate(c.height, c.centre, c.bands, c.phase) })), null, 2),
    );
    const at = (label: string) => {
      const i = labels.indexOf(label);
      expect(i, label).toBeGreaterThanOrEqual(0);
      return colours[i];
    };
    for (const stage of ["point", "surface"] as const) {
      for (const distance of distances) {
        const above = at(`${stage} d=${distance} above`);
        const below = at(`${stage} d=${distance} below`);
        expect(rgbDistance(above, expected[labels.indexOf(`${stage} d=${distance} above`)]), `${stage} d=${distance} above matches the oracle`).toBeLessThanOrEqual(COLOUR_TOLERANCE);
        expect(rgbDistance(above, below), `${stage} d=${distance} mirrored`).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      }
      // Changing the distance changes the coordinate; where the palette is
      // not flat it changes the colour too.
      let visiblePairs = 0;
      for (let a = 0; a < distances.length; a += 1) {
        for (let b = a + 1; b < distances.length; b += 1) {
          const ca = spreadPaletteCoordinate(centre + distances[a], centre, DEFAULT_CYCLE_BANDS, 0);
          const cb = spreadPaletteCoordinate(centre + distances[b], centre, DEFAULT_CYCLE_BANDS, 0);
          expect(Math.abs(ca - cb), `${stage} d=${distances[a]} and d=${distances[b]} coordinates differ`).toBeGreaterThan(0.04);
          if (visible(ca) && visible(cb)) {
            visiblePairs += 1;
            expect(rgbDistance(at(`${stage} d=${distances[a]} above`), at(`${stage} d=${distances[b]} above`)), `${stage} d=${distances[a]} differs from d=${distances[b]}`).toBeGreaterThan(10);
          }
        }
      }
      expect(visiblePairs).toBeGreaterThanOrEqual(3);
      expect(rgbDistance(at(`${stage} d=0.2 at centre 0.1`), at(`${stage} d=0.2 at centre -1.1`)), `${stage} shift invariance`).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(at(`${stage} d=0.2 at centre 0.1`), expected[labels.indexOf(`${stage} d=0.2 at centre 0.1`)])).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      const zero = [-1.5, 0.2, 1.4].map((height) => at(`${stage} d=0 at height ${height}`));
      for (const colour of zero) {
        expect(rgbDistance(colour, paletteLookup(table, 0)), `${stage} period-1 sheet reads coordinate 0`).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      }
      expect(rgbDistance(at(`${stage} cycle height 0`), at(`${stage} cycle height 1`)), `${stage} cycle mode still ramps with height`).toBeGreaterThan(4);
    }
  });

  test("two sheets over a period-2 point share hue in the real route", async ({ page }) => {
    const canvas = await openSim(page, frozenParams({ geometryMode: "hybrid" }));
    await page.waitForTimeout(1500);
    const frame = await captureCanvas(canvas, artifact("real-route-period2-sheets.png"));
    // c = -1 is the period-2 bulb's centre: the cycle is z = 0, -1, one sheet
    // 0.5 above and one 0.5 below the column centre h0 = -0.5, so both read
    // the palette at the same mirrored distance.
    const re = -1;
    const sheets = [0, -1];
    const samples = [];
    for (const z of sheets) {
      const { x, y } = await projectToCanvas(page, re, 0, z, frame.width, frame.height);
      const rgb = meanWindow(frame, x, y, 2);
      samples.push({ z, x, y, rgb, ...hueOf(rgb), coordinate: spreadPaletteCoordinate(z, -0.5, DEFAULT_CYCLE_BANDS, 0) });
    }
    writeFileSync(artifact("real-route-period2-sheets.json"), JSON.stringify(samples, null, 2));
    for (const sample of samples) {
      expect(sample.lightness, `sheet z=${sample.z} is lit`).toBeGreaterThan(0.1);
      expect(sample.chroma, `sheet z=${sample.z} is chromatic`).toBeGreaterThan(0.02);
    }
    expect(samples[0].coordinate).toBeCloseTo(samples[1].coordinate, 9);
    expect(hueDifference(samples[0].hue, samples[1].hue)).toBeLessThan(25);
  });
});

test.describe("phase and ground", () => {
  const PHASES = [0, 0.25, 0.5, 1];

  test("point, sheet and interior ground lookups follow the coordinate at phases 0, 0.25, 0.5 and 1 in both directions", async ({ page }) => {
    const canvas = await openSim(page, frozenParams());
    const { table } = await paletteTable(page);
    // Real field texels, read at their actual centres, feed the ground probe:
    // the cardioid (period 1, spread 0), the period-2 bulb and the chaotic band.
    const texels = {
      cardioid: await attractionTexel(canvas, -0.2, 0),
      bulb: await attractionTexel(canvas, -1.05, 0.1),
      chaotic: await attractionTexel(canvas, -1.9, 0),
    };
    expect(texels.cardioid.period).toBe(1);
    expect(texels.cardioid.spread).toBeLessThanOrEqual(CENTRE_TOLERANCE);
    expect(texels.bulb.period).toBe(2);
    expect(texels.chaotic.classification).toBe(ATTRACTION_UNRESOLVED);
    expect(texels.chaotic.spread).toBeGreaterThan(0.5);

    const pointScalars = [
      { key: "d=0.5", height: 0, centre: -0.5, period: 2 },
      { key: "d=0.5 below", height: -1, centre: -0.5, period: 2 },
      { key: "d=0", height: 0.3, centre: 0.3, period: 1 },
      { key: "d=1.2", height: 1.2, centre: 0, period: 0 },
    ];
    const groundScalars = [
      { key: "spread 0.5", spread: 0.5, period: 2 },
      { key: "cardioid texel", spread: texels.cardioid.spread, period: 1 },
      { key: "bulb texel", spread: texels.bulb.spread, period: 2 },
      { key: "chaotic texel", spread: texels.chaotic.spread, period: 0 },
    ];
    const cases: ShaderProbeCase[] = [];
    const expected: Rgb[] = [];
    const labels: string[] = [];
    for (const reverse of [false, true]) {
      for (const phase of PHASES) {
        for (const stage of ["point", "surface"] as const) {
          for (const scalar of pointScalars) {
            cases.push(probe(stage, { centre: scalar.centre, height: scalar.height, period: scalar.period, phase, reverse }));
            expected.push(expectedSpreadColour(table, scalar.height, scalar.centre, DEFAULT_CYCLE_BANDS, phase));
            labels.push(`${stage} reverse=${reverse} phase=${phase} ${scalar.key}`);
          }
        }
        for (const scalar of groundScalars) {
          cases.push(probe("ground", { centre: -0.5, spread: scalar.spread, period: scalar.period, phase, reverse }));
          expected.push(expectedSpreadColour(table, scalar.spread, 0, DEFAULT_CYCLE_BANDS, phase));
          labels.push(`ground reverse=${reverse} phase=${phase} ${scalar.key}`);
        }
      }
    }
    const colours = await probeShaderColours(page, cases);
    writeFileSync(
      artifact("phase-lookups.json"),
      JSON.stringify({ texels, cases: cases.map((c, i) => ({ label: labels[i], ...c, rgb: colours[i], expected: expected[i] })) }, null, 2),
    );
    colours.forEach((rgb, i) => {
      expect(rgbDistance(rgb, expected[i]), labels[i]).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    });
    const at = (label: string) => {
      const i = labels.indexOf(label);
      expect(i, label).toBeGreaterThanOrEqual(0);
      return colours[i];
    };
    for (const stage of ["point", "surface"]) {
      // Phase 0 and 1 close the loop; the reverse flag alone changes nothing
      // (direction lives in the phase sign); the phase moves the colour; the
      // two branches 0.5 either side of the centre agree at every phase.
      expect(rgbDistance(at(`${stage} reverse=false phase=0 d=0.5`), at(`${stage} reverse=false phase=1 d=0.5`))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(at(`${stage} reverse=false phase=0.5 d=0.5`), at(`${stage} reverse=true phase=0.5 d=0.5`))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(at(`${stage} reverse=false phase=0.25 d=0.5`), at(`${stage} reverse=false phase=0.5 d=0.5`))).toBeGreaterThan(10);
      for (const phase of PHASES) {
        expect(rgbDistance(at(`${stage} reverse=false phase=${phase} d=0.5`), at(`${stage} reverse=false phase=${phase} d=0.5 below`))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
        // A period-1 sheet reads fract(-phase), the same as the ground under the cardioid.
        expect(rgbDistance(at(`${stage} reverse=false phase=${phase} d=0`), paletteLookup(table, spreadPaletteCoordinate(0, 0, DEFAULT_CYCLE_BANDS, phase)))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
        expect(rgbDistance(at(`${stage} reverse=false phase=${phase} d=0`), at(`ground reverse=false phase=${phase} cardioid texel`))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
        // Points 0.5 from the centre and ground with spread 0.5 share a coordinate.
        expect(rgbDistance(at(`${stage} reverse=false phase=${phase} d=0.5`), at(`ground reverse=false phase=${phase} spread 0.5`))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      }
    }
    for (const phase of PHASES) {
      expect(rgbDistance(at(`ground reverse=false phase=${phase} cardioid texel`), paletteLookup(table, spreadPaletteCoordinate(0, 0, DEFAULT_CYCLE_BANDS, phase))), `cardioid ground at phase ${phase} is fract(-phase)`).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(at(`point reverse=false phase=${phase} d=0.5`), at(`surface reverse=false phase=${phase} d=0.5`))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    }
    expect(rgbDistance(at("ground reverse=false phase=0 cardioid texel"), at("ground reverse=false phase=1 cardioid texel"))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    expect(rgbDistance(at("ground reverse=false phase=0 chaotic texel"), at("ground reverse=false phase=0.5 chaotic texel"))).toBeGreaterThan(10);

    // Real route at speed zero (phase 0) with the ground writing its pre-ink
    // colour: the cardioid ground is one flat colour at coordinate 0 and the
    // period-2 bulb's ground differs from it, both under the live cloud. The
    // first page is parked so only one renderer holds the GPU.
    await page.goto("about:blank");
    const diagnostic = await page.context().browser()!.newContext({ viewport: VIEWPORT });
    const other = await diagnostic.newPage();
    const diagnosticCanvas = await openSim(other, frozenParams({ cycleSpeed: 0 }), "?groundDiagnostic=palette");
    await other.waitForTimeout(1200);
    expect((await canvasDataset(diagnosticCanvas)).orbit3dPhase).toBe("0.000000");
    const frame = await captureCanvas(diagnosticCanvas, artifact("ground-diagnostic-inside-out-speed0.png"));
    const cardioidPoints = [[-0.2, 0.1], [0, 0.3], [-0.4, -0.2], [-0.6, 0]] as const;
    const groundSamples = [];
    for (const [re, im] of cardioidPoints) {
      const texel = await attractionTexel(diagnosticCanvas, re, im);
      const { x, y } = await projectToCanvas(other, texel.re, texel.im, GROUND_PLANE_HEIGHT, frame.width, frame.height);
      const rgb = meanWindow(frame, x, y, 1);
      groundSamples.push({ re, im, texel, x, y, rgb, ...hueOf(rgb) });
    }
    const bulbTexel = await attractionTexel(diagnosticCanvas, -1.05, 0.15);
    const bulbPoint = await projectToCanvas(other, bulbTexel.re, bulbTexel.im, GROUND_PLANE_HEIGHT, frame.width, frame.height);
    const bulbRgb = meanWindow(frame, bulbPoint.x, bulbPoint.y, 1);
    await diagnostic.close();
    const reference = hueOf(paletteLookup(table, 0));
    writeFileSync(artifact("ground-real-route-speed0.json"), JSON.stringify({ cardioid: groundSamples, bulb: { texel: bulbTexel, ...bulbPoint, rgb: bulbRgb, ...hueOf(bulbRgb) }, paletteAtZero: reference }, null, 2));
    for (const sample of groundSamples) {
      expect(sample.texel.period, `cardioid texel at ${sample.re},${sample.im}`).toBe(1);
      expect(sample.chroma, `cardioid ground at ${sample.re},${sample.im} is chromatic`).toBeGreaterThan(0.02);
      expect(hueDifference(sample.hue, reference.hue), `cardioid ground at ${sample.re},${sample.im} takes the coordinate-0 hue`).toBeLessThan(30);
      expect(hueDifference(sample.hue, groundSamples[0].hue), `cardioid ground is one colour`).toBeLessThan(20);
    }
    expect(bulbTexel.period).toBe(2);
    expect(rgbDistance(bulbRgb, groundSamples[0].rgb), "period-2 bulb ground differs from the cardioid's").toBeGreaterThan(10);
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
    const { table } = await paletteTable(page);
    const probes = await probeShaderColours(page, [
      probe("ground", { period: 1, centre: 0.2, spread: 0, escaped: true }),
      probe("ground", { period: 2, centre: -0.5, spread: 0.9, phase: 0.6, bands: 4, reverse: true, escaped: true }),
      probe("ground", { period: 0, centre: -0.39, spread: 1.2, phase: 0.3 }),
    ]);
    // Escaped texels reproduce the escape texture whatever the field holds;
    // a bounded texel with no detected period is coloured like any other.
    expect(rgbDistance(probes[0], PROBE_ESCAPE_COLOUR)).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    expect(rgbDistance(probes[1], PROBE_ESCAPE_COLOUR)).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    expect(rgbDistance(probes[2], expectedSpreadColour(table, 1.2, 0, DEFAULT_CYCLE_BANDS, 0.3))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    expect(rgbDistance(probes[2], OLD_NEUTRAL)).toBeGreaterThan(10);

    // Real route: with the ground writing its pre-ink colour, exterior pixels
    // are identical between Inside-out and Period mode at phase 0 (both are
    // the escape colouring), while interior pixels differ.
    const frames: Record<string, { x: number; y: number; rgb: Rgb }[]> = {};
    // Exterior probes sit on ground with no cloud along the default camera's
    // view ray (additive points would tint the pixel differently per mode).
    const points = [
      { label: "exterior c=(-0.2,0.85)", re: -0.2, im: 0.85 },
      { label: "exterior c=(0.6,-0.9)", re: 0.6, im: -0.9 },
      { label: "exterior c=(-1.6,-0.9)", re: -1.6, im: -0.9 },
      // Interior probes sit in the period-2 bulb where the spread
      // sqrt(-(c + 3/4)) puts the coordinate inside the palette's visible band
      // (0.26 and 0.37); the cardioid reads coordinate 0, the seam colour the
      // escape texture's interior fill also carries, so it cannot separate
      // the two modes at phase 0.
      { label: "interior period-2 c=(-0.78,0)", re: -0.78, im: 0 },
      { label: "interior period-2 c=(-0.81,0)", re: -0.81, im: 0 },
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
    // Different escape times, different exterior colours: the exterior still
    // depends on smooth escape time rather than on any interior scalar.
    expect(rgbDistance(frames["inside-out"][0].rgb, frames["inside-out"][2].rgb)).toBeGreaterThan(10);
    for (let index = 3; index < points.length; index += 1) {
      expect(rgbDistance(frames["inside-out"][index].rgb, frames.period[index].rgb), points[index].label).toBeGreaterThan(10);
    }
  });
});

test.describe("chaotic", () => {
  test("bounded cells with no detected period take palette colour that varies with height and phase, and nothing draws the old neutral", async ({ page }) => {
    const canvas = await openSim(page, frozenParams());
    const { table } = await paletteTable(page);
    // The production sampler's own reading of the chaotic column at c = -1.9.
    const [sampled] = await gpuSample(page, [[-1.9, 0]], WARMUP, SAMPLES);
    expect(sampled.escaped).toBe(false);
    expect(sampled.period).toBe(0);
    const texel = await attractionTexel(canvas, -1.9, 0);
    expect(texel.classification).toBe(ATTRACTION_UNRESOLVED);
    expect(texel.spread).toBeGreaterThan(0.5);

    const heights = [-1.5, -0.8, 0, 0.9, 1.6];
    const phases = [0, 0.3, 0.6];
    const cases: ShaderProbeCase[] = [];
    const labels: string[] = [];
    const expected: Rgb[] = [];
    for (const stage of ["point", "surface"] as const) {
      for (const phase of phases) {
        for (const height of heights) {
          cases.push(probe(stage, { period: 0, centre: sampled.centre, height, phase }));
          labels.push(`${stage} phase=${phase} height=${height}`);
          expected.push(expectedSpreadColour(table, height, sampled.centre, DEFAULT_CYCLE_BANDS, phase));
        }
      }
    }
    cases.push(probe("ground", { period: 0, centre: texel.centre, spread: texel.spread, phase: 0 }));
    labels.push("ground chaotic texel phase=0");
    expected.push(expectedSpreadColour(table, texel.spread, 0, DEFAULT_CYCLE_BANDS, 0));
    cases.push(probe("ground", { period: 0, centre: texel.centre, spread: texel.spread, phase: 0.3 }));
    labels.push("ground chaotic texel phase=0.3");
    expected.push(expectedSpreadColour(table, texel.spread, 0, DEFAULT_CYCLE_BANDS, 0.3));
    const colours = await probeShaderColours(page, cases);
    writeFileSync(
      artifact("chaotic-lookups.json"),
      JSON.stringify({ sampled, texel, cases: cases.map((c, i) => ({ label: labels[i], ...c, rgb: colours[i], expected: expected[i] })) }, null, 2),
    );
    colours.forEach((rgb, i) => {
      expect(rgbDistance(rgb, expected[i]), labels[i]).toBeLessThanOrEqual(COLOUR_TOLERANCE);
      expect(rgbDistance(rgb, OLD_NEUTRAL), `${labels[i]} is not the old neutral`).toBeGreaterThan(6);
    });
    const at = (label: string) => colours[labels.indexOf(label)];
    const coordinate = (height: number, phase: number) => spreadPaletteCoordinate(height, sampled.centre, DEFAULT_CYCLE_BANDS, phase);
    // Every height has its own coordinate, and the phase moves each one.
    for (let a = 0; a < heights.length; a += 1) {
      for (let b = a + 1; b < heights.length; b += 1) {
        expect(Math.abs(coordinate(heights[a], 0) - coordinate(heights[b], 0)), `heights ${heights[a]} and ${heights[b]} differ in coordinate`).toBeGreaterThan(0.04);
      }
    }
    for (const stage of ["point", "surface"] as const) {
      // Across heights at one phase, at least three colours the palette can
      // tell apart; for every height, at least one phase pair changes its colour.
      let distinct = 0;
      for (let a = 0; a < heights.length; a += 1) {
        for (let b = a + 1; b < heights.length; b += 1) {
          if (rgbDistance(at(`${stage} phase=0.3 height=${heights[a]}`), at(`${stage} phase=0.3 height=${heights[b]}`)) > 10) distinct += 1;
        }
      }
      expect(distinct, `${stage} colour varies with height`).toBeGreaterThanOrEqual(3);
      for (const height of heights) {
        const spreadAcrossPhases = Math.max(
          rgbDistance(at(`${stage} phase=0 height=${height}`), at(`${stage} phase=0.3 height=${height}`)),
          rgbDistance(at(`${stage} phase=0 height=${height}`), at(`${stage} phase=0.6 height=${height}`)),
          rgbDistance(at(`${stage} phase=0.3 height=${height}`), at(`${stage} phase=0.6 height=${height}`)),
        );
        expect(spreadAcrossPhases, `${stage} height ${height} varies with phase`).toBeGreaterThan(10);
      }
    }
    // The chaotic ground texel: spread about 1.16, coordinate 0.74 at phase 0
    // (flat) and 0.44 at phase 0.3 (visible), so the phase changes its colour.
    expect(Math.abs(spreadPaletteCoordinate(texel.spread, 0, DEFAULT_CYCLE_BANDS, 0) - spreadPaletteCoordinate(texel.spread, 0, DEFAULT_CYCLE_BANDS, 0.3))).toBeCloseTo(0.3, 6);
    expect(rgbDistance(at("ground chaotic texel phase=0"), at("ground chaotic texel phase=0.3"))).toBeGreaterThan(10);

    // No Inside-out pixel source carries the stage 98 neutral or its mapping.
    const sources = await page.evaluate(async () => {
      const { ORBIT3D_SHADER_SOURCES } = await import("/src/app/orbit3d.ts");
      return Object.values(ORBIT3D_SHADER_SOURCES as Record<string, string>).join("\n");
    });
    expect(sources).not.toMatch(/INSIDE_OUT_NEUTRAL|insideOutCoordinate/);
    expect(sources.match(/spreadPaletteCoordinate\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
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
    await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue("inside-out");
    await expect(palette).toHaveValue("magma-cyclic");
    await expect(direction).toHaveValue("forward");
    const snapshot = await paramSnapshot(page);
    expect(snapshot.cycleSpeed).toBe("0.1");
    expect(snapshot.cycleBands).toBe("1.5");
    expect(snapshot.geometryMode).toBe("cloud");
    expect(snapshot.colourMode).toBe("inside-out");
    expect(errors).toEqual([]);
  });

  test("cloud build, field build and warm render time against the unchanged baseline", async ({ page }) => {
    test.setTimeout(600_000);
    const baseUrl = process.env.INSIDE_OUT_BASELINE_URL ?? "http://localhost:5174";
    const params = frozenParams({ cycleSpeed: 0.1 });
    const SAMPLE_COUNT = 3;
    type Timing = Awaited<ReturnType<typeof frameTiming>>;
    type Run = { cloudBuildMs: number; fieldBuildMs: number; points: string; renders: Timing[] };
    type Measured = { runs: Run[] };
    // Three matched page loads each: the cloud build is wall-clock from
    // navigation to the complete attribute; the field build is the renderer's
    // own figure; the warm render timing is taken on the last load.
    const measure = async (origin: string, label: string): Promise<Measured> => {
      const runs: Run[] = [];
      for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
        const context = await page.context().browser()!.newContext({ viewport: VIEWPORT });
        const target = await context.newPage();
        await target.addInitScript(
          ([values]) => localStorage.setItem("el:values:logistic-mandelbrot", JSON.stringify(values)),
          [params] as const,
        );
        const started = Date.now();
        await target.goto(`${origin}/#/logistic-mandelbrot`, { timeout: 15_000 });
        const canvas = target.locator(".sim-view__canvas");
        await expect(canvas).toHaveAttribute("data-simulation-renderer", "gpu-orbit3d");
        await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 120_000 });
        const cloudBuildMs = Date.now() - started;
        await target.waitForTimeout(1000);
        const dataset = await canvasDataset(canvas);
        expect(dataset.orbit3dSampler, `${label} sample ${sample} uses the GPU sampler`).toBe("gpu-sampled");
        expect(dataset.orbit3dAttractionSource, `${label} sample ${sample} field source`).toBe("gpu");
        const renders: Timing[] = [];
        if (sample === SAMPLE_COUNT - 1) {
          for (let run = 0; run < SAMPLE_COUNT; run += 1) renders.push(await frameTiming(target));
        }
        runs.push({
          cloudBuildMs,
          fieldBuildMs: Number(dataset.orbit3dAttractionBuildMs),
          points: dataset.orbit3dPoints,
          renders,
        });
        await context.close();
      }
      return { runs };
    };
    const current = await measure("http://localhost:5173", "current");
    await page.goto("about:blank");
    let baseline: Measured | null = null;
    try {
      baseline = await measure(baseUrl, "baseline");
    } catch (error) {
      baseline = null;
      console.log(`baseline server unavailable at ${baseUrl}: ${(error as Error).message.split("\n")[0]}`);
    }
    const summarise = (measured: Measured) => {
      const last = measured.runs[measured.runs.length - 1];
      return {
        cloudBuildMs: measured.runs.map((r) => r.cloudBuildMs),
        fieldBuildMs: measured.runs.map((r) => r.fieldBuildMs),
        renderMedianMs: last.renders.map((r) => r.medianMs),
        renderP90Ms: last.renders.map((r) => r.p90Ms),
        points: measured.runs.map((r) => r.points),
      };
    };
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const report = {
      current: summarise(current),
      baseline: baseline ? summarise(baseline) : null,
      verdict: baseline ? "compared" : "unmet",
    };
    console.log(JSON.stringify(report));
    writeFileSync(artifact("render-timing.json"), JSON.stringify(report, null, 2));
    expect(
      baseline,
      `criterion 6 timing comparison unmet: no unchanged baseline served at ${baseUrl} (see docs/audits/100-inside-out-spread-colouring.md, "Serving the baseline")`,
    ).not.toBeNull();
    const cur = report.current;
    const base = report.baseline!;
    expect(cur.renderMedianMs.length).toBe(SAMPLE_COUNT);
    expect(base.renderMedianMs.length).toBe(SAMPLE_COUNT);
    expect(new Set(cur.points).size).toBe(1);
    expect(cur.points[0]).toBe(base.points[0]);
    // A sustained regression above 20% in build or render time needs an
    // explanation and verifier approval; the medians of three matched samples
    // are the sustained figures.
    expect(median(cur.cloudBuildMs), `cloud build ${cur.cloudBuildMs} vs ${base.cloudBuildMs}`).toBeLessThanOrEqual(median(base.cloudBuildMs) * 1.2 + 50);
    expect(median(cur.fieldBuildMs), `field build ${cur.fieldBuildMs} vs ${base.fieldBuildMs}`).toBeLessThanOrEqual(median(base.fieldBuildMs) * 1.2 + 5);
    expect(median(cur.renderMedianMs), `render ${cur.renderMedianMs} vs ${base.renderMedianMs}`).toBeLessThanOrEqual(median(base.renderMedianMs) * 1.2 + 1);
    expect(median(cur.fieldBuildMs)).toBeLessThan(2000);
  });
});

test.describe("direction of travel", () => {
  const SEQUENCE_DIR = `${ARTIFACT_DIR}/reverse-sequence`;
  const FRAMES = 4;
  const FRAME_GAP_MS = 1000;
  /** A fixed height distance from a column's centre whose colour the phase carries. */
  const FIXED_DISTANCE = 0.5;

  /** Signed lap delta between two phases on the unit circle, in (-0.5, 0.5]. */
  const lapDelta = (from: number, to: number) => ((to - from + 1.5) % 1) - 0.5;

  const VIEWS = [
    { id: "cloud-default", geometryMode: "cloud", preset: null, zoomTo: null },
    { id: "hybrid-default", geometryMode: "hybrid", preset: null, zoomTo: null },
    { id: "bifurcation-curtain", geometryMode: "cloud", preset: "bifurcation-curtain", zoomTo: null },
    { id: "period2-bulb-ground", geometryMode: "cloud", preset: null, zoomTo: { re: -1, im: 0, steps: 4 } },
  ] as const;

  for (const view of VIEWS) {
    test(`${view.id}: forward and reverse sequences move a fixed-distance colour in opposite directions`, async ({ page }) => {
      mkdirSync(SEQUENCE_DIR, { recursive: true });
      // Defaults except Inside-out mode and a parked camera. The default pose
      // looks down on the whole set from above the ground plane, so the ground,
      // the cardioid and the period-2 bulb at c = -1 are all in frame.
      const canvas = await openSim(page, frozenParams({ geometryMode: view.geometryMode, cycleSpeed: 0.1 }));
      const handle = page.locator(".sim-view__drawer-handle");
      const sidebar = page.locator(".sim-view__sidebar");
      const parkDrawer = async () => {
        await expect(handle).toHaveAttribute("aria-expanded", "false");
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.mouse.move(20, VIEWPORT.height / 2);
        await expect.poll(async () => (await sidebar.boundingBox())!.x, { timeout: 5000 }).toBeGreaterThan(VIEWPORT.width - 40);
      };
      // A pose change (the curtain preset's side view) and a dolly ease the
      // camera over several frames; the sequence starts once it has settled.
      const waitForCameraRest = async () => {
        let previous = "";
        await expect.poll(async () => {
          const dataset = await canvasDataset(canvas);
          const pose = `${dataset.orbit3dCameraAzimuth}|${dataset.orbit3dCameraDistance}`;
          const settled = pose === previous;
          previous = pose;
          return settled;
        }, { timeout: 20_000, intervals: [500] }).toBe(true);
      };
      if (view.preset) {
        await handle.click();
        const presets = page.getByRole("combobox", { name: "Kernel preset", exact: true });
        await presets.selectOption(view.preset);
        await expect(presets).toHaveValue(view.preset);
        await expect(page.locator('[data-param-key="realSliceOnly"]')).toBeChecked();
        await expect(page.locator('[data-param-key="colourMode"]')).toHaveValue("inside-out");
        // A kernel preset starts from the kernel defaults, which turn the
        // ambient auto-rotate back on; the sequence needs a parked camera.
        await setParam(page, "autoRotate", false);
        await setParam(page, "continuousSpin", false);
        await expect(page.locator('[data-param-key="autoRotate"]')).not.toBeChecked();
        await expect(page.locator('[data-param-key="cycleSpeed"]')).toHaveValue("0.1");
        await handle.click();
        await parkDrawer();
        await page.waitForTimeout(500);
        await expect(canvas).toHaveAttribute("data-orbit3d-build", "complete", { timeout: 120_000 });
        await waitForCameraRest();
      }
      if (view.zoomTo) {
        const box = (await canvas.boundingBox())!;
        const target = await projectToCanvas(page, view.zoomTo.re, view.zoomTo.im, GROUND_PLANE_HEIGHT, box.width, box.height);
        const before = Number((await canvasDataset(canvas)).orbit3dCameraDistance);
        await canvas.evaluate((element, { x, y, steps }) => {
          const rect = element.getBoundingClientRect();
          for (let step = 0; step < steps; step += 1) {
            element.dispatchEvent(new WheelEvent("wheel", {
              bubbles: true, cancelable: true,
              clientX: rect.left + x, clientY: rect.top + y, deltaY: -100,
            }));
          }
        }, { x: target.x, y: target.y, steps: view.zoomTo.steps });
        await page.waitForTimeout(300);
        await waitForCameraRest();
        expect(Number((await canvasDataset(canvas)).orbit3dCameraDistance)).toBeLessThan(before * 0.6);
      }
      await page.waitForTimeout(1000);
      const initial = await canvasDataset(canvas);
      const points = initial.orbit3dPoints;
      const azimuth = initial.orbit3dCameraAzimuth;
      const distance = initial.orbit3dCameraDistance;
      expect(Number(points)).toBeGreaterThan(0);
      const parkedX = (await sidebar.boundingBox())!.x;
      expect(parkedX).toBeGreaterThan(VIEWPORT.width - 40);

      const capture = async (direction: "forward" | "reverse") => {
        const frames: { path: string; phase: number; coordinate: number; motion: number }[] = [];
        let previous: Awaited<ReturnType<typeof captureCanvas>> | null = null;
        for (let index = 0; index < FRAMES; index += 1) {
          if (index > 0) await page.waitForTimeout(FRAME_GAP_MS);
          const path = `${SEQUENCE_DIR}/${view.id}-${direction}-${index}.png`;
          const image = await captureCanvas(canvas, path);
          const dataset = await canvasDataset(canvas);
          expect(dataset.orbit3dPoints, `${direction} frame ${index} point count`).toBe(points);
          expect(dataset.orbit3dCameraAzimuth, `${direction} frame ${index} camera azimuth`).toBe(azimuth);
          expect(dataset.orbit3dCameraDistance, `${direction} frame ${index} camera distance`).toBe(distance);
          expect(dataset.orbit3dGeometry).toBe(view.geometryMode);
          const phase = Number(dataset.orbit3dPhase);
          frames.push({
            path,
            phase,
            coordinate: spreadPaletteCoordinate(FIXED_DISTANCE, 0, DEFAULT_CYCLE_BANDS, phase),
            motion: previous ? frameDifference(previous, image) : 0,
          });
          previous = image;
        }
        return frames;
      };

      const forward = await capture("forward");

      // Flip only the direction. Palette, bands, geometry and camera stay as
      // they were, and the drawer is closed again before the reverse frames.
      await handle.click();
      const direction = page.getByRole("combobox", { name: "Cycle direction", exact: true });
      await direction.selectOption("reverse");
      await expect(direction).toHaveValue("reverse");
      await handle.click();
      await parkDrawer();
      await expect.poll(async () => (await sidebar.boundingBox())!.x, { timeout: 5000 }).toBe(parkedX);
      await page.waitForTimeout(600);
      const reverse = await capture("reverse");
      const snapshot = await paramSnapshot(page);
      expect(snapshot.cycleBands).toBe(String(DEFAULT_CYCLE_BANDS));
      expect(snapshot.cycleSpeed).toBe("0.1");
      expect(snapshot.colourMode).toBe("inside-out");
      expect(snapshot.geometryMode).toBe(view.geometryMode);
      expect(await page.getByRole("combobox", { name: "Palette", exact: true }).inputValue()).toBe("magma-cyclic");

      const steps = (frames: typeof forward, key: "phase" | "coordinate") =>
        frames.slice(1).map((frame, i) => lapDelta(frames[i][key], frame[key]));
      const report = {
        view: view.id,
        geometry: view.geometryMode,
        preset: view.preset,
        zoomTo: view.zoomTo,
        camera: { azimuth, distance },
        fixedDistance: FIXED_DISTANCE,
        bands: DEFAULT_CYCLE_BANDS,
        forward,
        reverse,
        forwardPhaseSteps: steps(forward, "phase"),
        reversePhaseSteps: steps(reverse, "phase"),
        forwardCoordinateSteps: steps(forward, "coordinate"),
        reverseCoordinateSteps: steps(reverse, "coordinate"),
      };
      writeFileSync(`${SEQUENCE_DIR}/${view.id}-sequence.json`, JSON.stringify(report, null, 2));

      // Production phase uniform: forward advances, reverse retreats, every step.
      for (const step of report.forwardPhaseSteps) expect(step).toBeGreaterThan(0.02);
      for (const step of report.reversePhaseSteps) expect(step).toBeLessThan(-0.02);
      // The palette coordinate fract(k*d - phase) at a fixed distance d moves
      // the opposite way to the phase: down in forward mode, up in reverse. A
      // fixed colour (fixed coordinate) sits at d = (coordinate + phase) / k,
      // so forward carries it to larger distance, out of each column's centre
      // upward and downward, and reverse carries it back in.
      for (const step of report.forwardCoordinateSteps) expect(step).toBeLessThan(-0.02);
      for (const step of report.reverseCoordinateSteps) expect(step).toBeGreaterThan(0.02);
      // Frame-to-frame motion at a one-second gap is a fraction of the frozen
      // contract's 2.5-second threshold of 1; the sequence end-to-end clears it.
      for (const frame of [...forward.slice(1), ...reverse.slice(1)]) expect(frame.motion, frame.path).toBeGreaterThan(0.3);
      for (const frames of [forward, reverse]) {
        expect(frames.reduce((sum, frame) => sum + frame.motion, 0), `${view.id} ${frames[0].path} sequence motion`).toBeGreaterThan(1);
      }
    });
  }
});
