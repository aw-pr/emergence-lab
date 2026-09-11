#!/usr/bin/env node
/**
 * THROWAWAY MEASUREMENT SCRIPT: period-detection census for the
 * logistic-Mandelbrot sampler (stage 89). This is not shipping application
 * code; it is the evidence behind the stage's before/after claim.
 *
 * From the repository root:
 *   npm run build:test
 *   node scripts/spike-period-census.mjs
 *
 * It prints deterministic JSON with three parts:
 *
 *   cascade   the real-axis period-doubling windows and superstable centres,
 *             derived here by bisection rather than quoted from literature
 *   census    per-period cell counts at the shipped kernel default, in two
 *             columns: "legacy" (estimatePeriod over the 8-value plot window,
 *             which is exactly what dev computed) and "current" (whatever
 *             sampleAttractorCell returns on this tree)
 *   ceiling   the highest period each column can represent
 *
 * Both columns come from one run, so the movement reported is a difference in
 * the code under test, not a difference between two invocations.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const model = require(join(repoRoot, ".test-build/sims/logistic-mandelbrot/model.js"));

const { ESCAPED, MAX_DETECTABLE_PERIOD, estimatePeriod, sampleAttractorCell } = model;

// Shipped kernel default: DEFAULT_KERNEL_WARMUP / DEFAULT_KERNEL_SAMPLES in
// src/sims/logistic-mandelbrot/kernel.ts.
const SHIPPED_WARMUP = 1500;
const SHIPPED_SAMPLES = 8;

// Reference oracle, used only to locate the cascade windows. Far longer than
// anything shipped, and far tighter, so a window edge it reports is limited by
// the multiplier approaching -1 rather than by the sampler.
const REFERENCE_WARMUP = 1_000_000;
const REFERENCE_WINDOW = 256;
const REFERENCE_TOLERANCE = 1e-10;
const BISECTION_TOLERANCE = 1e-7;

function referencePeriod(c) {
  const samples = new Float64Array(REFERENCE_WINDOW);
  let z = 0;
  for (let n = 0; n < REFERENCE_WARMUP; n += 1) {
    z = z * z + c;
    if (z * z > 4) return -1;
  }
  for (let n = 0; n < REFERENCE_WINDOW; n += 1) {
    z = z * z + c;
    if (z * z > 4) return -1;
    samples[n] = z;
  }
  for (let q = 1; q <= REFERENCE_WINDOW / 2; q += 1) {
    let matches = true;
    for (let n = 0; n + q < REFERENCE_WINDOW; n += 1) {
      const delta = samples[n + q] - samples[n];
      if (delta > REFERENCE_TOLERANCE || delta < -REFERENCE_TOLERANCE) {
        matches = false;
        break;
      }
    }
    if (matches) return q;
  }
  return 0;
}

/** c where the real-axis attractor stops having period `lower`, bisected. */
function bifurcationPoint(lower, insideC, outsideC) {
  let inside = insideC;
  let outside = outsideC;
  let steps = 0;
  while (Math.abs(inside - outside) > BISECTION_TOLERANCE && steps < 200) {
    const mid = (inside + outside) / 2;
    if (referencePeriod(mid) === lower) inside = mid;
    else outside = mid;
    steps += 1;
  }
  return { c: (inside + outside) / 2, bracket: [inside, outside], steps };
}

/** f_c^q(0), the polynomial whose roots in a window are its superstable c. */
function criticalOrbit(c, q) {
  let z = 0;
  for (let n = 0; n < q; n += 1) z = z * z + c;
  return z;
}

/** The single superstable parameter of the period-q window (lo, hi). */
function superstablePoint(q, lo, hi) {
  const scan = 4096;
  for (let index = 0; index < scan; index += 1) {
    let left = lo + ((hi - lo) * index) / scan;
    let right = lo + ((hi - lo) * (index + 1)) / scan;
    let fLeft = criticalOrbit(left, q);
    const fRight = criticalOrbit(right, q);
    if (fLeft === 0) return { c: left, bracket: [left, left] };
    if (fLeft > 0 === fRight > 0) continue;
    for (let step = 0; step < 200; step += 1) {
      const mid = (left + right) / 2;
      if (mid === left || mid === right) break;
      const fMid = criticalOrbit(mid, q);
      if (fMid === 0) return { c: mid, bracket: [mid, mid] };
      if (fLeft > 0 === fMid > 0) {
        left = mid;
        fLeft = fMid;
      } else {
        right = mid;
      }
    }
    return { c: (left + right) / 2, bracket: [left, right] };
  }
  return null;
}

/** Highest period a window of `count` iterates can report. */
function detectionCeiling(count) {
  return Math.min(MAX_DETECTABLE_PERIOD, count - 1);
}

function censusOver(label, cValues) {
  const out = new Float32Array(SHIPPED_SAMPLES);
  const legacy = new Map();
  const current = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  let escaped = 0;

  for (const c of cValues) {
    const period = sampleAttractorCell(
      c,
      0,
      SHIPPED_WARMUP,
      SHIPPED_SAMPLES,
      out,
      0,
    );
    if (period === ESCAPED) {
      escaped += 1;
      continue;
    }
    bump(current, period);
    // Exactly what dev computed: the period test run over the plot window.
    bump(legacy, estimatePeriod(out, 0, SHIPPED_SAMPLES));
  }

  const table = (map) =>
    Object.fromEntries(
      [...map.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, v]),
    );
  return {
    label,
    cells: cValues.length,
    escapedCells: escaped,
    legacy: table(legacy),
    current: table(current),
    movedOutOfZeroBucket: (legacy.get(0) ?? 0) - (current.get(0) ?? 0),
  };
}

/**
 * Independent check that a census really sampled the window it claims: the
 * reference oracle's period for an evenly spaced subsample. Without this the
 * census is only as good as the bisection that produced the endpoints.
 */
function referenceAgreement(lo, hi, count) {
  const out = new Float32Array(SHIPPED_SAMPLES);
  const tally = new Map();
  for (const c of linspace(lo, hi, count)) {
    const reference = referencePeriod(c);
    const shipped = sampleAttractorCell(c, 0, SHIPPED_WARMUP, SHIPPED_SAMPLES, out, 0);
    const key = `reference ${reference} / shipped ${shipped}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...tally.entries()].sort());
}

/**
 * Orbit iterations one cell costs, counted by a clone of
 * sampleAttractorCell's control flow: warmup (with the same Brent-style early
 * exit), plot window, then detection tail. `legacy` is the same count without
 * the tail, which is what dev executed. The caller validates the clone's
 * period against the model on every cell it counts, so a clone that drifted
 * from the code under test fails the run instead of reporting a number.
 */
function countIterations(cRe, cIm, warmup, sampleCount, detectionCount) {
  const escapeSquared = 4;
  const toleranceSq = 1e-18;
  let zr = 0;
  let zi = 0;
  let checkpointR = 0;
  let checkpointI = 0;
  let revisitWindow = 8;
  let sinceCheckpoint = 0;
  let iterations = 0;

  for (let iteration = 0; iteration < warmup; iteration += 1) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
    iterations += 1;
    if (zr * zr + zi * zi > escapeSquared) {
      return { iterations, legacy: iterations, period: ESCAPED };
    }
    const deltaR = zr - checkpointR;
    const deltaI = zi - checkpointI;
    if (deltaR * deltaR + deltaI * deltaI < toleranceSq) break;
    sinceCheckpoint += 1;
    if (sinceCheckpoint === revisitWindow) {
      checkpointR = zr;
      checkpointI = zi;
      sinceCheckpoint = 0;
      if (revisitWindow < 256) revisitWindow *= 2;
    }
  }

  const window = new Float32Array(Math.max(sampleCount, detectionCount));
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
    iterations += 1;
    if (zr * zr + zi * zi > escapeSquared) {
      return { iterations, legacy: iterations, period: ESCAPED };
    }
    window[sample] = zr > 2 ? 2 : zr < -2 ? -2 : zr;
  }

  const legacy = iterations;
  let kept = sampleCount;
  while (kept < detectionCount) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
    iterations += 1;
    if (zr * zr + zi * zi > escapeSquared) break;
    window[kept] = zr > 2 ? 2 : zr < -2 ? -2 : zr;
    kept += 1;
  }

  return { iterations, legacy, period: estimatePeriod(window, 0, kept) };
}

/** Per-cell orbit cost and wall-clock over a representative c-grid. */
function costOver(width, height) {
  const detectionCount = model.periodDetectionWindow
    ? model.periodDetectionWindow(SHIPPED_SAMPLES)
    : SHIPPED_SAMPLES;
  const out = new Float32Array(SHIPPED_SAMPLES);
  let iterations = 0;
  let legacyIterations = 0;
  let cells = 0;
  let disagreements = 0;

  for (let y = 0; y < height; y += 1) {
    const cIm = -1 + ((y + 0.5) / height) * 2;
    for (let x = 0; x < width; x += 1) {
      const cRe = -2 + ((x + 0.5) / width) * 3;
      const counted = countIterations(
        cRe,
        cIm,
        SHIPPED_WARMUP,
        SHIPPED_SAMPLES,
        detectionCount,
      );
      const actual = sampleAttractorCell(
        cRe,
        cIm,
        SHIPPED_WARMUP,
        SHIPPED_SAMPLES,
        out,
        0,
      );
      if (counted.period !== actual) disagreements += 1;
      iterations += counted.iterations;
      legacyIterations += counted.legacy;
      cells += 1;
    }
  }

  const timed = (count) => {
    const scratch = new Float32Array(SHIPPED_SAMPLES);
    const started = process.hrtime.bigint();
    for (let index = 0; index < count; index += 1) {
      const cRe = -2 + ((index % width) + 0.5) * (3 / width);
      const cIm = -1 + ((Math.floor(index / width) % height) + 0.5) * (2 / height);
      sampleAttractorCell(cRe, cIm, SHIPPED_WARMUP, SHIPPED_SAMPLES, scratch, 0);
    }
    return Number(process.hrtime.bigint() - started) / 1e6;
  };

  const wallClockMs = Math.min(timed(cells), timed(cells), timed(cells));

  return {
    grid: `${width}x${height}`,
    cells,
    // Non-zero here means the counting clone no longer matches model.ts and
    // every figure below is void.
    cloneDisagreements: disagreements,
    meanOrbitIterationsPerCell: iterations / cells,
    meanOrbitIterationsPerCellWithoutTail: legacyIterations / cells,
    extraIterationsPerCell: (iterations - legacyIterations) / cells,
    extraIterationFraction: (iterations - legacyIterations) / legacyIterations,
    wallClockMs,
    microsecondsPerCell: (wallClockMs * 1000) / cells,
    // The shipped desktop compute grid, docs/audits/2026-09-11-...:
    // data-render-size 2429x1518.
    projectedProductionGridSeconds:
      ((wallClockMs / cells) * 2429 * 1518) / 1000,
  };
}

function linspace(lo, hi, count) {
  return Array.from(
    { length: count },
    (_value, index) => lo + ((hi - lo) * (index + 0.5)) / count,
  );
}

// The cascade, derived. Each bracket starts from a c the reference oracle
// already agrees has the lower period, and one it agrees does not.
const b1 = bifurcationPoint(2, -1.2, -1.3); // period 2 -> 4
const b2 = bifurcationPoint(4, -1.3, -1.38); // period 4 -> 8
const b3 = bifurcationPoint(8, -1.385, -1.396); // period 8 -> 16
const b4 = bifurcationPoint(16, -1.3955, -1.3999); // period 16 -> 32

const period8Window = [b3.c, b2.c];
const period16Window = [b4.c, b3.c];
const superstable8 = superstablePoint(8, period8Window[0], period8Window[1]);
const superstable16 = superstablePoint(16, period16Window[0], period16Window[1]);

const report = {
  settings: {
    shippedWarmup: SHIPPED_WARMUP,
    shippedSamples: SHIPPED_SAMPLES,
    referenceWarmup: REFERENCE_WARMUP,
    referenceWindow: REFERENCE_WINDOW,
    referenceTolerance: REFERENCE_TOLERANCE,
    bisectionTolerance: BISECTION_TOLERANCE,
  },
  cascade: {
    bifurcation2to4: b1,
    bifurcation4to8: b2,
    bifurcation8to16: b3,
    bifurcation16to32: b4,
    period8Window,
    period16Window,
    superstable8,
    superstable16,
    superstable8ReferencePeriod: referencePeriod(superstable8.c),
    superstable16ReferencePeriod: referencePeriod(superstable16.c),
  },
  ceiling: {
    legacyWindowIterates: SHIPPED_SAMPLES,
    legacyHighestDetectablePeriod: detectionCeiling(SHIPPED_SAMPLES),
    currentWindowIterates: model.periodDetectionWindow
      ? model.periodDetectionWindow(SHIPPED_SAMPLES)
      : SHIPPED_SAMPLES,
    currentHighestDetectablePeriod: detectionCeiling(
      model.periodDetectionWindow
        ? model.periodDetectionWindow(SHIPPED_SAMPLES)
        : SHIPPED_SAMPLES,
    ),
  },
  windowMembership: {
    period8Window: referenceAgreement(period8Window[0], period8Window[1], 64),
    period16Window: referenceAgreement(period16Window[0], period16Window[1], 64),
  },
  cost: costOver(600, 400),
  census: [
    censusOver("period-8-window", linspace(period8Window[0], period8Window[1], 2000)),
    censusOver("period-16-window", linspace(period16Window[0], period16Window[1], 2000)),
    censusOver("cascade-region", linspace(-1.4012, -1.24, 4000)),
    // The shipped real-axis slice at the production compute width (2429),
    // i.e. the c-values the shipped default actually samples on Im(c) = 0.
    censusOver("shipped-real-axis-slice", linspace(-2, 1, 2429)),
  ],
};

console.log(JSON.stringify(report, null, 2));
