#!/usr/bin/env node
/**
 * THROWAWAY MEASUREMENT SCRIPT: fp32 precision spike for the
 * logistic-Mandelbrot orbit sampler. This is not shipping application code.
 *
 * From the repository root:
 *   npm run build:test
 *   node scripts/spike-fp32-orbit.mjs
 *
 * The second command prints deterministic JSON containing every figure used
 * by docs/spikes/2026-08-14-fp32-orbit-precision.md.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const model = require(join(repoRoot, ".test-build/sims/logistic-mandelbrot/model.js"));

const {
  ESCAPED,
  MAX_DETECTABLE_PERIOD,
  PERIOD_TOLERANCE,
  sampleAttractorCell,
} = model;

const SEED = 0x34f032;
const ESCAPE_RADIUS = 2;
const SAMPLE_CLIP = 2;
const CONVERGENCE_TOLERANCE_SQ = 1e-18;
const CONVERGENCE_WINDOW_CAP = 256;
const PERIOD4_CENTRE_RE = -1.3107026413368328;
const PERIOD4_CENTRE_IM = 0;

const SETTINGS = [
  { name: "production", warmup: 1500, samples: 8 },
  { name: "baker", warmup: 20000, samples: 64 },
];

const REGION_COUNTS = {
  cardioidInterior: 1024,
  period2Interior: 1024,
  period4Interior: 1024,
  chaoticBand: 1536,
  cardioidBoundary: 4096,
  period2Boundary: 2048,
  period4Boundary: 1536,
};

const f32 = Math.fround;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function radicalInverseBase2(index) {
  let bits = index >>> 0;
  bits = ((bits << 16) | (bits >>> 16)) >>> 0;
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
  return bits / 4294967296;
}

function estimatePeriod64(samples) {
  const limit = Math.min(MAX_DETECTABLE_PERIOD, samples.length - 1);
  for (let period = 1; period <= limit; period += 1) {
    let matches = true;
    for (let index = 0; index + period < samples.length; index += 1) {
      const delta = samples[index + period] - samples[index];
      if (delta > PERIOD_TOLERANCE || delta < -PERIOD_TOLERANCE) {
        matches = false;
        break;
      }
    }
    if (matches) return period;
  }
  return 0;
}

function estimatePeriod32(samples) {
  const limit = Math.min(MAX_DETECTABLE_PERIOD, samples.length - 1);
  const tolerance = f32(PERIOD_TOLERANCE);
  for (let period = 1; period <= limit; period += 1) {
    let matches = true;
    for (let index = 0; index + period < samples.length; index += 1) {
      const delta = f32(samples[index + period] - samples[index]);
      if (delta > tolerance || delta < f32(-tolerance)) {
        matches = false;
        break;
      }
    }
    if (matches) return period;
  }
  return 0;
}

function step64(zr, zi, cRe, cIm) {
  const nextR = zr * zr - zi * zi + cRe;
  const nextI = 2 * zr * zi + cIm;
  return [nextR, nextI];
}

// Each arithmetic operation is rounded separately. In particular, neither
// z^2+c component is represented as a fused operation.
function step32(zr, zi, cRe, cIm) {
  const zrSquared = f32(zr * zr);
  const ziSquared = f32(zi * zi);
  const realDifference = f32(zrSquared - ziSquared);
  const nextR = f32(realDifference + cRe);
  const product = f32(zr * zi);
  const doubledProduct = f32(f32(2) * product);
  const nextI = f32(doubledProduct + cIm);
  return [nextR, nextI];
}

function magnitudeSquared32(zr, zi) {
  const zrSquared = f32(zr * zr);
  const ziSquared = f32(zi * zi);
  return f32(zrSquared + ziSquared);
}

function runOrbit64(cRe, cIm, warmup, sampleCount, allowConvergenceExit) {
  const samples = new Float32Array(sampleCount);
  const escapeSquared = ESCAPE_RADIUS * ESCAPE_RADIUS;
  let zr = 0;
  let zi = 0;
  let checkpointR = 0;
  let checkpointI = 0;
  let revisitWindow = 8;
  let sinceCheckpoint = 0;
  let warmupExecuted = 0;
  let exitReason = "full";
  let convergenceDistanceSq = null;

  for (let iteration = 0; iteration < warmup; iteration += 1) {
    [zr, zi] = step64(zr, zi, cRe, cIm);
    warmupExecuted += 1;
    if (zr * zr + zi * zi > escapeSquared) {
      return {
        period: ESCAPED,
        samples,
        interior: null,
        warmupExecuted,
        exitReason: "escaped",
        convergenceDistanceSq,
      };
    }
    const deltaR = zr - checkpointR;
    const deltaI = zi - checkpointI;
    const distanceSquared = deltaR * deltaR + deltaI * deltaI;
    if (allowConvergenceExit && distanceSquared < CONVERGENCE_TOLERANCE_SQ) {
      exitReason = "converged";
      convergenceDistanceSq = distanceSquared;
      break;
    }
    sinceCheckpoint += 1;
    if (sinceCheckpoint === revisitWindow) {
      checkpointR = zr;
      checkpointI = zi;
      sinceCheckpoint = 0;
      if (revisitWindow < CONVERGENCE_WINDOW_CAP) revisitWindow *= 2;
    }
  }

  for (let sample = 0; sample < sampleCount; sample += 1) {
    [zr, zi] = step64(zr, zi, cRe, cIm);
    if (zr * zr + zi * zi > escapeSquared) {
      samples.fill(0);
      return {
        period: ESCAPED,
        samples,
        interior: null,
        warmupExecuted,
        exitReason: "escaped",
        convergenceDistanceSq,
      };
    }
    samples[sample] =
      zr > SAMPLE_CLIP ? SAMPLE_CLIP : zr < -SAMPLE_CLIP ? -SAMPLE_CLIP : zr;
  }

  const period = estimatePeriod64(samples);
  let multiplier = 1;
  if (period > 0) {
    for (let step = 0; step < period; step += 1) {
      [zr, zi] = step64(zr, zi, cRe, cIm);
      multiplier *= 2 * Math.hypot(zr, zi);
    }
  }
  return {
    period,
    samples,
    interior: Math.max(0, Math.min(1, multiplier)),
    warmupExecuted,
    exitReason,
    convergenceDistanceSq,
  };
}

function runOrbit32(cReInput, cImInput, warmup, sampleCount, allowConvergenceExit) {
  const samples = new Float32Array(sampleCount);
  const cRe = f32(cReInput);
  const cIm = f32(cImInput);
  const escapeSquared = f32(f32(ESCAPE_RADIUS) * f32(ESCAPE_RADIUS));
  const convergenceToleranceSquared = f32(CONVERGENCE_TOLERANCE_SQ);
  let zr = f32(0);
  let zi = f32(0);
  let checkpointR = f32(0);
  let checkpointI = f32(0);
  let revisitWindow = 8;
  let sinceCheckpoint = 0;
  let warmupExecuted = 0;
  let exitReason = "full";
  let convergenceDistanceSq = null;

  for (let iteration = 0; iteration < warmup; iteration += 1) {
    [zr, zi] = step32(zr, zi, cRe, cIm);
    warmupExecuted += 1;
    if (magnitudeSquared32(zr, zi) > escapeSquared) {
      return {
        period: ESCAPED,
        samples,
        interior: null,
        warmupExecuted,
        exitReason: "escaped",
        convergenceDistanceSq,
      };
    }
    const deltaR = f32(zr - checkpointR);
    const deltaI = f32(zi - checkpointI);
    const deltaRSquared = f32(deltaR * deltaR);
    const deltaISquared = f32(deltaI * deltaI);
    const distanceSquared = f32(deltaRSquared + deltaISquared);
    if (allowConvergenceExit && distanceSquared < convergenceToleranceSquared) {
      exitReason = "converged";
      convergenceDistanceSq = distanceSquared;
      break;
    }
    sinceCheckpoint += 1;
    if (sinceCheckpoint === revisitWindow) {
      checkpointR = zr;
      checkpointI = zi;
      sinceCheckpoint = 0;
      if (revisitWindow < CONVERGENCE_WINDOW_CAP) revisitWindow *= 2;
    }
  }

  for (let sample = 0; sample < sampleCount; sample += 1) {
    [zr, zi] = step32(zr, zi, cRe, cIm);
    if (magnitudeSquared32(zr, zi) > escapeSquared) {
      samples.fill(0);
      return {
        period: ESCAPED,
        samples,
        interior: null,
        warmupExecuted,
        exitReason: "escaped",
        convergenceDistanceSq,
      };
    }
    samples[sample] =
      zr > f32(SAMPLE_CLIP)
        ? f32(SAMPLE_CLIP)
        : zr < f32(-SAMPLE_CLIP)
          ? f32(-SAMPLE_CLIP)
          : zr;
  }

  const period = estimatePeriod32(samples);
  let multiplier = f32(1);
  if (period > 0) {
    for (let step = 0; step < period; step += 1) {
      [zr, zi] = step32(zr, zi, cRe, cIm);
      const radiusSquared = magnitudeSquared32(zr, zi);
      const radius = f32(Math.sqrt(radiusSquared));
      const derivative = f32(f32(2) * radius);
      multiplier = f32(multiplier * derivative);
    }
  }
  const clampedInterior = Math.max(f32(0), Math.min(f32(1), multiplier));
  return {
    period,
    samples,
    interior: clampedInterior,
    warmupExecuted,
    exitReason,
    convergenceDistanceSq,
  };
}

function period4BoundaryRadius(angle) {
  const directionR = Math.cos(angle);
  const directionI = Math.sin(angle);
  let inside = 0;
  let outside = 0.15;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const radius = (inside + outside) / 2;
    const result = runOrbit64(
      PERIOD4_CENTRE_RE + radius * directionR,
      PERIOD4_CENTRE_IM + radius * directionI,
      12000,
      16,
      true,
    );
    if (result.period === 4) inside = radius;
    else outside = radius;
  }
  return (inside + outside) / 2;
}

function generateCells() {
  const random = mulberry32(SEED);
  const cells = [];
  const push = (cRe, cIm, region, boundary = false) => {
    cells.push({ cRe, cIm, region, boundary });
  };

  for (let index = 0; index < REGION_COUNTS.cardioidInterior; index += 1) {
    const radius = 0.82 * Math.sqrt(random());
    const angle = 2 * Math.PI * random();
    const muR = radius * Math.cos(angle);
    const muI = radius * Math.sin(angle);
    const muSquaredR = muR * muR - muI * muI;
    const muSquaredI = 2 * muR * muI;
    push(muR / 2 - muSquaredR / 4, muI / 2 - muSquaredI / 4, "cardioid-interior");
  }

  for (let index = 0; index < REGION_COUNTS.period2Interior; index += 1) {
    const radius = 0.205 * Math.sqrt(random());
    const angle = 2 * Math.PI * random();
    push(-1 + radius * Math.cos(angle), radius * Math.sin(angle), "period-2-interior");
  }

  const period4Radii = Array.from({ length: 384 }, (_, index) =>
    period4BoundaryRadius((2 * Math.PI * (index + 0.5)) / 384),
  );
  for (let index = 0; index < REGION_COUNTS.period4Interior; index += 1) {
    const angleIndex = Math.floor(random() * period4Radii.length);
    const angle = (2 * Math.PI * (angleIndex + 0.5)) / period4Radii.length;
    const radius = 0.72 * Math.sqrt(random()) * period4Radii[angleIndex];
    push(
      PERIOD4_CENTRE_RE + radius * Math.cos(angle),
      PERIOD4_CENTRE_IM + radius * Math.sin(angle),
      "period-4-interior",
    );
  }

  let candidate = 1;
  while (
    cells.filter((cell) => cell.region === "chaotic-band").length <
    REGION_COUNTS.chaoticBand
  ) {
    const cRe = -1.99 + radicalInverseBase2(candidate) * (-1.405 + 1.99);
    candidate += 1;
    const probe = runOrbit64(cRe, 0, 20000, 64, true);
    // The real chaotic interval is part of the Mandelbrot boundary in the
    // complex plane, so these cells belong in both requested strata.
    if (probe.period === 0) push(cRe, 0, "chaotic-band", true);
    assert.ok(candidate < 100000, "Unable to fill the bounded aperiodic chaotic-band stratum");
  }

  const boundaryScales = [-0.01, -0.002, 0.002, 0.01];
  for (let angleIndex = 0; angleIndex < 1024; angleIndex += 1) {
    const angle = (2 * Math.PI * (angleIndex + 0.5)) / 1024;
    for (const offset of boundaryScales) {
      const radius = 1 + offset;
      const muR = radius * Math.cos(angle);
      const muI = radius * Math.sin(angle);
      const muSquaredR = muR * muR - muI * muI;
      const muSquaredI = 2 * muR * muI;
      push(
        muR / 2 - muSquaredR / 4,
        muI / 2 - muSquaredI / 4,
        "cardioid-boundary",
        true,
      );
    }
  }

  for (let angleIndex = 0; angleIndex < 512; angleIndex += 1) {
    const angle = (2 * Math.PI * (angleIndex + 0.5)) / 512;
    for (const offset of boundaryScales) {
      const radius = 0.25 * (1 + offset);
      push(
        -1 + radius * Math.cos(angle),
        radius * Math.sin(angle),
        "period-2-boundary",
        true,
      );
    }
  }

  for (let angleIndex = 0; angleIndex < period4Radii.length; angleIndex += 1) {
    const angle = (2 * Math.PI * (angleIndex + 0.5)) / period4Radii.length;
    for (const offset of boundaryScales) {
      const radius = period4Radii[angleIndex] * (1 + offset);
      push(
        PERIOD4_CENTRE_RE + radius * Math.cos(angle),
        PERIOD4_CENTRE_IM + radius * Math.sin(angle),
        "period-4-boundary",
        true,
      );
    }
  }

  return cells;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function fraction(count, total) {
  return total === 0 ? null : count / total;
}

function compareResults(cells, left, right) {
  const valueDifferences = [];
  const interiorDifferences = [];
  let comparableCells = 0;
  let changedSampleCells = 0;
  let periodMismatches = 0;
  let boundaryPeriodMismatches = 0;
  let boundaryCells = 0;
  let escapeMismatches = 0;
  let interiorChangedCells = 0;
  const regions = {};

  for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    const a = left[cellIndex];
    const b = right[cellIndex];
    const region = cells[cellIndex].region;
    regions[region] ??= {
      cells: 0,
      comparableNonEscapedCells: 0,
      periodMismatchCount: 0,
      valueDifferences: [],
    };
    regions[region].cells += 1;
    if (a.period !== b.period) {
      periodMismatches += 1;
      regions[region].periodMismatchCount += 1;
      if (cells[cellIndex].boundary) boundaryPeriodMismatches += 1;
    }
    if (cells[cellIndex].boundary) boundaryCells += 1;
    if ((a.period === ESCAPED) !== (b.period === ESCAPED)) escapeMismatches += 1;
    if (a.period === ESCAPED || b.period === ESCAPED) continue;

    comparableCells += 1;
    regions[region].comparableNonEscapedCells += 1;
    let sampleChanged = false;
    for (let sample = 0; sample < a.samples.length; sample += 1) {
      const difference = Math.abs(a.samples[sample] - b.samples[sample]);
      valueDifferences.push(difference);
      regions[region].valueDifferences.push(difference);
      if (difference !== 0) sampleChanged = true;
    }
    if (sampleChanged) changedSampleCells += 1;

    const interiorDifference = Math.abs(a.interior - b.interior);
    interiorDifferences.push(interiorDifference);
    if (interiorDifference !== 0) interiorChangedCells += 1;
  }

  valueDifferences.sort((a, b) => a - b);
  interiorDifferences.sort((a, b) => a - b);
  for (const region of Object.values(regions)) {
    region.periodMismatchFraction = fraction(region.periodMismatchCount, region.cells);
    region.valueDifferences.sort((a, b) => a - b);
    region.valueMaxAbs = region.valueDifferences.at(-1) ?? null;
    region.valueP99Abs = percentile(region.valueDifferences, 0.99);
    delete region.valueDifferences;
  }
  return {
    cells: cells.length,
    boundaryCells,
    comparableNonEscapedCells: comparableCells,
    valueMaxAbs: valueDifferences.at(-1) ?? null,
    valueP99Abs: percentile(valueDifferences, 0.99),
    changedSampleCellFraction: fraction(changedSampleCells, comparableCells),
    periodMismatchCount: periodMismatches,
    periodMismatchFraction: fraction(periodMismatches, cells.length),
    boundaryPeriodMismatchCount: boundaryPeriodMismatches,
    boundaryPeriodMismatchFraction: fraction(boundaryPeriodMismatches, boundaryCells),
    escapeMismatchCount: escapeMismatches,
    escapeMismatchFraction: fraction(escapeMismatches, cells.length),
    interiorMaxAbs: interiorDifferences.at(-1) ?? null,
    interiorP99Abs: percentile(interiorDifferences, 0.99),
    interiorChangedCellFraction: fraction(interiorChangedCells, comparableCells),
    regions,
  };
}

function convergenceCost(cells, fp64, fp32) {
  let fp64Converged = 0;
  let fp32Converged = 0;
  let fp32ExactConvergence = 0;
  let fp32PositiveSubToleranceConvergence = 0;
  let lostExit = 0;
  let nonEscapedBoth = 0;
  let fp64Full = 0;
  let fp32Full = 0;
  let fp64Iterations = 0;
  let fp32Iterations = 0;

  for (let index = 0; index < cells.length; index += 1) {
    const a = fp64[index];
    const b = fp32[index];
    if (a.exitReason === "converged") fp64Converged += 1;
    if (b.exitReason === "converged") {
      fp32Converged += 1;
      if (b.convergenceDistanceSq === 0) fp32ExactConvergence += 1;
      else fp32PositiveSubToleranceConvergence += 1;
    }
    if (a.exitReason === "converged" && b.exitReason === "full") lostExit += 1;
    if (a.period !== ESCAPED && b.period !== ESCAPED) {
      nonEscapedBoth += 1;
      fp64Iterations += a.warmupExecuted;
      fp32Iterations += b.warmupExecuted;
      if (a.exitReason === "full") fp64Full += 1;
      if (b.exitReason === "full") fp32Full += 1;
    }
  }

  return {
    fp64ConvergedCount: fp64Converged,
    fp64ConvergedFraction: fraction(fp64Converged, cells.length),
    fp32ConvergedCount: fp32Converged,
    fp32ConvergedFraction: fraction(fp32Converged, cells.length),
    fp32ExactConvergenceCount: fp32ExactConvergence,
    fp32PositiveSubToleranceConvergenceCount: fp32PositiveSubToleranceConvergence,
    lostExitCount: lostExit,
    lostExitFractionAllCells: fraction(lostExit, cells.length),
    lostExitFractionOfFp64Converged: fraction(lostExit, fp64Converged),
    comparableNonEscapedCells: nonEscapedBoth,
    fp64FullWarmupFractionNonEscaped: fraction(fp64Full, nonEscapedBoth),
    fp32FullWarmupFractionNonEscaped: fraction(fp32Full, nonEscapedBoth),
    fp64MeanWarmupIterationsNonEscaped: fraction(fp64Iterations, nonEscapedBoth),
    fp32MeanWarmupIterationsNonEscaped: fraction(fp32Iterations, nonEscapedBoth),
    meanWarmupIterationRatioFp32OverFp64:
      fp64Iterations === 0 ? null : fp32Iterations / fp64Iterations,
  };
}

function validateFp64Clone(cells) {
  const probes = [cells[0], cells[1023], cells[2047], cells[3071], cells.at(-1)];
  for (const setting of SETTINGS) {
    for (const cell of probes) {
      const expectedSamples = new Float32Array(setting.samples);
      const expectedMeasure = { interior: 0 };
      const expectedPeriod = sampleAttractorCell(
        cell.cRe,
        cell.cIm,
        setting.warmup,
        setting.samples,
        expectedSamples,
        0,
        expectedMeasure,
      );
      const actual = runOrbit64(cell.cRe, cell.cIm, setting.warmup, setting.samples, true);
      assert.equal(actual.period, expectedPeriod, "fp64 clone period differs from model.ts");
      assert.deepEqual(actual.samples, expectedSamples, "fp64 clone samples differ from model.ts");
      if (expectedPeriod !== ESCAPED) {
        assert.equal(actual.interior, expectedMeasure.interior, "fp64 clone interior differs");
      }
    }
  }
}

function runSetting(cells, setting) {
  const fp64Early = new Array(cells.length);
  const fp64Full = new Array(cells.length);
  const fp32Early = new Array(cells.length);
  const fp32Full = new Array(cells.length);

  for (let index = 0; index < cells.length; index += 1) {
    const { cRe, cIm } = cells[index];
    fp64Early[index] = runOrbit64(cRe, cIm, setting.warmup, setting.samples, true);
    fp64Full[index] = runOrbit64(cRe, cIm, setting.warmup, setting.samples, false);
    fp32Early[index] = runOrbit32(cRe, cIm, setting.warmup, setting.samples, true);
    fp32Full[index] = runOrbit32(cRe, cIm, setting.warmup, setting.samples, false);
  }

  return {
    warmup: setting.warmup,
    samples: setting.samples,
    fp32VsFp64: compareResults(cells, fp64Early, fp32Early),
    convergenceCost: convergenceCost(cells, fp64Early, fp32Early),
    fp64EarlyExitVsFullWarmup: compareResults(cells, fp64Early, fp64Full),
    fp32EarlyExitVsFullWarmup: compareResults(cells, fp32Early, fp32Full),
  };
}

const cells = generateCells();
assert.equal(cells.length, Object.values(REGION_COUNTS).reduce((sum, count) => sum + count, 0));
validateFp64Clone(cells);

const results = {};
for (const setting of SETTINGS) {
  console.error(`Measuring ${setting.name}: ${cells.length} cells, ${setting.warmup} warmup, ${setting.samples} samples`);
  results[setting.name] = runSetting(cells, setting);
}

console.log(
  JSON.stringify(
    {
      methodology: {
        seedDecimal: SEED,
        seedHex: `0x${SEED.toString(16)}`,
        map: "z -> z^2 + c",
        fp32: "Math.fround after every arithmetic result; separate multiply and add",
        periodTolerance: PERIOD_TOLERANCE,
        convergenceToleranceSquared: CONVERGENCE_TOLERANCE_SQ,
        totalCells: cells.length,
        boundaryCells: cells.filter((cell) => cell.boundary).length,
        regionCounts: REGION_COUNTS,
      },
      results,
    },
    null,
    2,
  ),
);
