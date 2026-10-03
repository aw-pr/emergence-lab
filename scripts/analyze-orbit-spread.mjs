#!/usr/bin/env node
/**
 * MEASUREMENT SCRIPT: orbit-spread colouring study for the logistic-Mandelbrot
 * Inside-out mode (stage 99). Not shipping application code; it is the
 * evidence behind docs/audits/2026-10-02-orbit-spread-colouring.md.
 *
 * From the repository root:
 *   npm run build:test
 *   node scripts/analyze-orbit-spread.mjs > spread.json
 *   node scripts/analyze-orbit-spread.mjs --previews e2e/artifacts/orbit-spread > /dev/null
 *
 * The scalar under study is |Re(z) - h0(c)| where h0(c) is the mean height of
 * the orbit at c. Every figure labelled "shipped" comes from the production
 * sampleAttractorCell at the shipped kernel warmup and sample count; the
 * float64 orbits iterated here serve only as long references and as
 * estimators the sampler does not expose. Closed forms appear only in the
 * `check` sub-objects, computed after the measurement, never as its input.
 *
 * Deterministic: no wall-clock in the output, no RNG, fixed key order.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const model = require(join(repoRoot, ".test-build/sims/logistic-mandelbrot/model.js"));

const { ESCAPED, estimatePeriod, sampleAttractorCell, cellCoordinate } = model;

// Shipped kernel default: DEFAULT_KERNEL_WARMUP / DEFAULT_KERNEL_SAMPLES in
// src/sims/logistic-mandelbrot/kernel.ts.
const SHIPPED_WARMUP = 1500;
const SHIPPED_SAMPLES = 8;

// Shipped desktop compute grid (docs/audits/2026-09-11-logistic-mandelbrot-
// zoom-and-resolution-ceiling.md): data-render-size 2429x1518 over the
// sampler domain, with the middle row pinned to Im(c) = 0 (orbit3d.ts).
const GRID_WIDTH = 2429;
const GRID_HEIGHT = 1518;
const RE_MIN = -2;
const RE_MAX = 1;
const IM_MIN = -1;
const IM_MAX = 1;
const PITCH_RE = (RE_MAX - RE_MIN) / GRID_WIDTH;
const PITCH_IM = (IM_MAX - IM_MIN) / GRID_HEIGHT;
const AXIS_ROW = Math.floor(GRID_HEIGHT / 2);

// Estimator windows under study and the long reference.
const ESTIMATE_COUNTS = [8, 64, 256, 1024, 4096];
const REFERENCE_ITERATES = 1_000_000;
const REFERENCE_WARMUP = 1_000_000;
const REFERENCE_PERIOD_WINDOW = 4096;
const REFERENCE_MAX_PERIOD = 2048;
const REFERENCE_PERIOD_TOLERANCE = 1e-10;

// Band densities the lap-fraction tables are expressed at. 1.5 is the shipped
// cycleBands default; the audit names its recommendation from these columns.
const BAND_DENSITIES = [1, 1.5, 2, 3];
const RECOMMENDED_BANDS = 1.5;
const bandKey = (b) => `b${b}`;

// Mean window the previews use for cells with no detected period; the audit
// picks it from the runningMeanError and smoothness tables.
const RECOMMENDED_WINDOW = 1024;

// Left edge of the cascade region used by scripts/spike-period-census.mjs;
// columns at or left of it form the "chaotic band" of the real axis.
const CHAOTIC_BAND_RE_MAX = -1.4012;

const argv = process.argv.slice(2);
const previewsIndex = argv.indexOf("--previews");
const previewDir = previewsIndex >= 0 ? argv[previewsIndex + 1] : null;

// ---------------------------------------------------------------------------
// Orbit helpers
// ---------------------------------------------------------------------------

function round(value, digits = 10) {
  if (value === null || value === undefined || !Number.isFinite(value)) return value;
  return Number(value.toPrecision(digits));
}

function mean(values) {
  let sum = 0;
  for (const value of values) sum += value;
  return values.length ? sum / values.length : NaN;
}

function rms(values) {
  let sum = 0;
  for (const value of values) sum += value * value;
  return values.length ? Math.sqrt(sum / values.length) : NaN;
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.min(sorted.length - 1, low + 1);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    max: round(sorted.length ? sorted[sorted.length - 1] : NaN),
    rms: round(rms(sorted)),
    median: round(quantile(sorted, 0.5)),
    p90: round(quantile(sorted, 0.9)),
    p99: round(quantile(sorted, 0.99)),
  };
}

/** The production sampler at the shipped warmup and sample count. */
function shipped(cRe, cIm) {
  const out = new Float32Array(SHIPPED_SAMPLES);
  const measure = { interior: 1 };
  const period = sampleAttractorCell(cRe, cIm, SHIPPED_WARMUP, SHIPPED_SAMPLES, out, 0, measure);
  if (period === ESCAPED) {
    return { escaped: true, period: ESCAPED, samples: Array.from(out), h0: null, deviations: null, maxDev: null, rmsDev: null, multiplier: null };
  }
  const samples = Array.from(out);
  const h0 = mean(samples);
  const deviations = samples.map((s) => Math.abs(s - h0));
  return {
    escaped: false,
    period,
    samples,
    h0,
    deviations,
    maxDev: Math.max(...deviations),
    rmsDev: rms(deviations),
    multiplier: measure.interior,
  };
}

/**
 * Float64 orbit from z = 0: `warmup` discarded iterates, then running
 * statistics of Re(z) recorded at each checkpoint count. Returns null when
 * the orbit escapes |z| <= 2 at any point.
 */
function orbitMeans(cRe, cIm, warmup, checkpoints) {
  let zr = 0;
  let zi = 0;
  for (let n = 0; n < warmup; n += 1) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
    if (zr * zr + zi * zi > 4) return null;
  }
  const total = checkpoints[checkpoints.length - 1];
  const means = [];
  const first = [];
  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;
  let next = 0;
  for (let n = 1; n <= total; n += 1) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
    if (zr * zr + zi * zi > 4) return null;
    sum += zr;
    sumSq += zr * zr;
    if (zr < min) min = zr;
    if (zr > max) max = zr;
    if (n <= SHIPPED_SAMPLES) first.push(zr);
    if (n === checkpoints[next]) {
      const m = sum / n;
      means.push({
        count: n,
        mean: m,
        rmsDev: Math.sqrt(Math.max(0, sumSq / n - m * m)),
        maxDev: Math.max(max - m, m - min),
      });
      next += 1;
    }
  }
  return { means, first, zr, zi };
}

/**
 * Period of the orbit continuing from (zr, zi), up to REFERENCE_MAX_PERIOD.
 * A lag is a candidate when the final iterate recurs within 1e-9 of it, and
 * it is confirmed only if every lagged pair in the window agrees to the
 * reference tolerance, so a long-period cycle the 32-cap sampler cannot name
 * is still told apart from chaos.
 */
function periodFrom(zr, zi, cRe, cIm) {
  const re = new Float64Array(REFERENCE_PERIOD_WINDOW);
  const im = new Float64Array(REFERENCE_PERIOD_WINDOW);
  let r = zr;
  let i = zi;
  for (let n = 0; n < REFERENCE_PERIOD_WINDOW; n += 1) {
    const nextR = r * r - i * i + cRe;
    i = 2 * r * i + cIm;
    r = nextR;
    if (r * r + i * i > 4) return ESCAPED;
    re[n] = r;
    im[n] = i;
  }
  const last = REFERENCE_PERIOD_WINDOW - 1;
  for (let q = 1; q <= REFERENCE_MAX_PERIOD; q += 1) {
    const dr = re[last] - re[last - q];
    const di = im[last] - im[last - q];
    if (dr * dr + di * di > 1e-18) continue;
    let matches = true;
    for (let n = 0; n + q < REFERENCE_PERIOD_WINDOW; n += 1) {
      if (Math.abs(re[n + q] - re[n]) > REFERENCE_PERIOD_TOLERANCE || Math.abs(im[n + q] - im[n]) > REFERENCE_PERIOD_TOLERANCE) {
        matches = false;
        break;
      }
    }
    if (matches) return q;
  }
  return 0;
}

/** Mean of Re(z) over exactly one cycle of length q after the shipped warmup. */
function cycleMean(cRe, cIm, q) {
  const orbit = orbitMeans(cRe, cIm, SHIPPED_WARMUP, [q]);
  return orbit ? orbit.means[0] : null;
}

/** Converged reference: long warmup, then one window of statistics. */
function convergedReference(cRe, cIm, count) {
  const orbit = orbitMeans(cRe, cIm, REFERENCE_WARMUP, [count]);
  return orbit ? orbit.means[0] : null;
}

/** Re of the principal-branch fixed point z* = (1 - sqrt(1 - 4c)) / 2. */
function fixedPointRe(cRe, cIm) {
  const wr = 1 - 4 * cRe;
  const wi = -4 * cIm;
  const modulus = Math.hypot(wr, wi);
  const sqrtRe = Math.sqrt(Math.max(0, (modulus + wr) / 2));
  return (1 - sqrtRe) / 2;
}

function linspace(lo, hi, count) {
  return Array.from({ length: count }, (_v, i) => lo + ((hi - lo) * (i + 0.5)) / count);
}

// ---------------------------------------------------------------------------
// Superattracting centres
// ---------------------------------------------------------------------------

/** f_c^q(0) and its c-derivative, complex. */
function criticalOrbit(cRe, cIm, q) {
  let zr = 0;
  let zi = 0;
  let dr = 0;
  let di = 0;
  for (let n = 0; n < q; n += 1) {
    const nextDr = 2 * (zr * dr - zi * di) + 1;
    const nextDi = 2 * (zr * di + zi * dr);
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
    dr = nextDr;
    di = nextDi;
  }
  return { zr, zi, dr, di };
}

/** Newton on f_c^q(0) = 0 from a seed; the seed only starts the search. */
function newtonCentre(q, seedRe, seedIm) {
  let cRe = seedRe;
  let cIm = seedIm;
  let residual = Infinity;
  for (let step = 0; step < 100; step += 1) {
    const { zr, zi, dr, di } = criticalOrbit(cRe, cIm, q);
    residual = Math.hypot(zr, zi);
    if (residual < 1e-15) break;
    const denominator = dr * dr + di * di;
    cRe -= (zr * dr + zi * di) / denominator;
    cIm -= (zi * dr - zr * di) / denominator;
  }
  return { re: cRe, im: cIm, residual };
}

function cardioidPoint(theta) {
  const e1r = Math.cos(theta);
  const e1i = Math.sin(theta);
  const e2r = Math.cos(2 * theta);
  const e2i = Math.sin(2 * theta);
  return { re: e1r / 2 - e2r / 4, im: e1i / 2 - e2i / 4 };
}

/** Root and seed of the 1/q bulb; the seed sits one bulb radius outward. */
function bulbSeed(q) {
  const theta = (2 * Math.PI) / q;
  const root = cardioidPoint(theta);
  const tangentR = (-Math.sin(theta) + Math.sin(2 * theta)) / 2;
  const tangentI = (Math.cos(theta) - Math.cos(2 * theta)) / 2;
  const length = Math.hypot(tangentR, tangentI);
  const normal = { re: tangentI / length, im: -tangentR / length };
  const radius = Math.sin(Math.PI / q) / (q * q);
  return { root, normal, seed: { re: root.re + radius * normal.re, im: root.im + radius * normal.im } };
}

/** Real superstable parameters of period q in [lo, hi], bisected. */
function realSuperstablePoints(q, lo, hi, scan) {
  const points = [];
  let left = lo;
  let fLeft = criticalOrbit(left, 0, q).zr;
  for (let index = 1; index <= scan; index += 1) {
    const right = lo + ((hi - lo) * index) / scan;
    const fRight = criticalOrbit(right, 0, q).zr;
    if (fLeft === 0) points.push(left);
    else if (fLeft > 0 !== fRight > 0) {
      let a = left;
      let b = right;
      let fa = fLeft;
      for (let step = 0; step < 200; step += 1) {
        const mid = (a + b) / 2;
        if (mid === a || mid === b) break;
        const fMid = criticalOrbit(mid, 0, q).zr;
        if (fMid === 0) {
          a = mid;
          b = mid;
          break;
        }
        if (fa > 0 === fMid > 0) {
          a = mid;
          fa = fMid;
        } else b = mid;
      }
      points.push((a + b) / 2);
    }
    left = right;
    fLeft = fRight;
  }
  return points;
}

// ---------------------------------------------------------------------------
// Closed-form cells (criterion 3)
// ---------------------------------------------------------------------------

function closedFormSection() {
  const cells = [
    { label: "c = 0", re: 0, im: 0 },
    { label: "c = -0.5", re: -0.5, im: 0 },
    { label: "c = -1", re: -1, im: 0 },
    { label: "c = -0.8", re: -0.8, im: 0 },
    { label: "c = 1", re: 1, im: 0 },
    { label: "c = -2 (tip)", re: -2, im: 0 },
  ];
  return cells.map(({ label, re, im }) => {
    const cell = shipped(re, im);
    const row = {
      label,
      cRe: re,
      cIm: im,
      escaped: cell.escaped,
      period: cell.period,
      h0: round(cell.h0),
      deviations: cell.deviations ? cell.deviations.map((d) => round(d)) : null,
      maxDev: round(cell.maxDev),
      samples: cell.samples.map((s) => round(s)),
    };
    // Independent check, evaluated after the measurement: period-1 cells sit
    // at the fixed point, period-2 cells at the cycle with z1 + z2 = -1 and
    // z1 * z2 = c + 1, so h0 = -1/2 and |z - h0| = sqrt(-4c - 3) / 2.
    if (!cell.escaped && cell.period === 1) {
      // Either fixed point (1 -+ sqrt(1 - 4c)) / 2; the orbit from 0 can only
      // sit on the repelling one when it lands there exactly, as at c = -2.
      const principal = fixedPointRe(re, im);
      const other = 1 - principal;
      const fixed = Math.abs(cell.h0 - principal) <= Math.abs(cell.h0 - other) ? principal : other;
      row.check = {
        h0: round(fixed),
        branch: fixed === principal ? "principal (attracting)" : "other (repelling)",
        deviation: 0,
        agreesTo1e4: Math.abs(cell.h0 - fixed) < 1e-4 && cell.maxDev < 1e-4,
      };
    } else if (!cell.escaped && cell.period === 2) {
      const deviation = Math.sqrt(-4 * re - 3) / 2;
      row.check = {
        h0: -0.5,
        deviation: round(deviation),
        agreesTo1e4:
          Math.abs(cell.h0 + 0.5) < 1e-4 && cell.deviations.every((d) => Math.abs(d - deviation) < 1e-4),
      };
    }
    return row;
  });
}

// ---------------------------------------------------------------------------
// A1: window-mean bias at superattracting centres
// ---------------------------------------------------------------------------

function biasAt(label, re, im, q) {
  const cell = shipped(re, im);
  if (cell.escaped || cell.period !== q) {
    return { label, cRe: round(re, 12), cIm: round(im, 12), expectedPeriod: q, shippedPeriod: cell.period, note: "shipped period differs; bias not defined" };
  }
  const cycle = cell.samples.slice(0, q);
  const cycleMeanValue = mean(cycle);
  // Worst case over the window's phase within the cycle, which the Brent exit
  // decides and the renderer cannot choose.
  let worst = 0;
  for (let start = 0; start < q; start += 1) {
    let sum = 0;
    for (let n = 0; n < SHIPPED_SAMPLES; n += 1) sum += cycle[(start + n) % q];
    worst = Math.max(worst, Math.abs(sum / SHIPPED_SAMPLES - cycleMeanValue));
  }
  const bias = Math.abs(cell.h0 - cycleMeanValue);
  return {
    label,
    cRe: round(re, 12),
    cIm: round(im, 12),
    period: q,
    multiplier: round(cell.multiplier, 6),
    cycleHeights: cycle.map((s) => round(s, 8)),
    cycleMean: round(cycleMeanValue),
    shippedWindowMean: round(cell.h0),
    bias: round(bias),
    worstCaseBiasOverWindowPhase: round(worst),
    biasLapFraction: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), round(bias * b, 6)])),
    worstCaseLapFraction: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), round(worst * b, 6)])),
    cycleSpanHalf: round((Math.max(...cycle) - Math.min(...cycle)) / 2),
  };
}

function meanBiasSection() {
  const bulbs = [];
  for (const q of [2, 3, 4, 5, 6, 7]) {
    const { root, seed } = bulbSeed(q);
    const centre = newtonCentre(q, seed.re, seed.im);
    bulbs.push({
      ...biasAt(`1/${q} bulb centre`, centre.re, centre.im, q),
      newtonResidual: round(centre.residual, 3),
      cardioidRoot: { re: round(root.re, 12), im: round(root.im, 12) },
    });
  }
  const realWindows = [];
  for (const q of [3, 5, 6, 7]) {
    const points = realSuperstablePoints(q, -2, 0.25, 40000);
    for (const c of points) {
      const row = biasAt(`real-axis period-${q} window centre`, c, 0, q);
      if (row.period === q) realWindows.push(row);
    }
  }
  return { bulbs, realWindows };
}

// ---------------------------------------------------------------------------
// A2: running-mean error on chaotic cells
// ---------------------------------------------------------------------------

function gridRe(x) {
  return cellCoordinate(RE_MIN, RE_MAX, x, GRID_WIDTH);
}

function gridIm(y) {
  return y === AXIS_ROW ? 0 : cellCoordinate(IM_MIN, IM_MAX, y, GRID_HEIGHT);
}

/** Shipped cell plus the float64 estimators and reference; null if escaped. */
function studyCell(x, y) {
  const cRe = gridRe(x);
  const cIm = gridIm(y);
  const cell = shipped(cRe, cIm);
  if (cell.escaped) return null;
  const orbit = orbitMeans(cRe, cIm, SHIPPED_WARMUP, [...ESTIMATE_COUNTS, REFERENCE_ITERATES]);
  if (!orbit) return { x, y, cRe, cIm, shipped: cell, referenceEscaped: true };
  const reference = orbit.means[orbit.means.length - 1];
  const referencePeriod = periodFrom(orbit.zr, orbit.zi, cRe, cIm);
  let cloneGap = 0;
  if (cell.period === 0) {
    for (let n = 0; n < SHIPPED_SAMPLES; n += 1) {
      cloneGap = Math.max(cloneGap, Math.abs(orbit.first[n] - cell.samples[n]));
    }
  }
  return {
    x,
    y,
    cRe,
    cIm,
    shipped: cell,
    estimates: orbit.means.slice(0, ESTIMATE_COUNTS.length),
    reference,
    referencePeriod,
    cloneGap,
    fixedPointRe: fixedPointRe(cRe, cIm),
  };
}

/** Bounded, no shipped period, and still bounded through the reference. */
function isUnresolved(cell) {
  return Boolean(cell && !cell.referenceEscaped && cell.shipped.period === 0);
}

/** Unresolved and with no reference period up to REFERENCE_MAX_PERIOD. */
function isChaotic(cell) {
  return isUnresolved(cell) && cell.referencePeriod === 0;
}

function errorTable(cells) {
  if (!cells.length) return { cells: 0 };
  const shippedErrors = cells.map((c) => Math.abs(c.shipped.h0 - c.reference.mean));
  const perCount = ESTIMATE_COUNTS.map((count, index) => {
    const errors = cells.map((c) => Math.abs(c.estimates[index].mean - c.reference.mean));
    return {
      count,
      maxError: round(Math.max(...errors), 6),
      rmsError: round(rms(errors), 6),
      medianError: round(quantile([...errors].sort((a, b) => a - b), 0.5), 6),
      maxErrorLapFraction: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), round(Math.max(...errors) * b, 6)])),
      rmsErrorLapFraction: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), round(rms(errors) * b, 6)])),
    };
  });
  return {
    cells: cells.length,
    shippedWindow: {
      count: SHIPPED_SAMPLES,
      source: "production sampleAttractorCell, float32 samples",
      maxError: round(Math.max(...shippedErrors), 6),
      rmsError: round(rms(shippedErrors), 6),
      maxCloneGap: round(Math.max(...cells.map((c) => c.cloneGap)), 3),
    },
    float64Windows: perCount,
    shippedMaxDevMinusReference: stats(cells.map((c) => c.shipped.maxDev - c.reference.maxDev)),
    shippedRmsDevMinusReference: stats(cells.map((c) => c.shipped.rmsDev - c.reference.rmsDev)),
    referenceRmsDeviation: stats(cells.map((c) => c.reference.rmsDev)),
    referenceMaxDeviation: stats(cells.map((c) => c.reference.maxDev)),
  };
}

function runningMeanErrorSection(realAxisCells) {
  const realUnresolved = realAxisCells.filter((c) => isUnresolved(c) && c.cRe <= CHAOTIC_BAND_RE_MAX);
  const realChaotic = realUnresolved.filter(isChaotic);

  // Off-axis population: every shipped-grid cell with |Im(c)| >= 0.01 that is
  // bounded with no detected period. They lie along the antennae and
  // cascade tips of the satellite bulbs. All of them are studied.
  const candidates = [];
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    const cIm = gridIm(y);
    if (Math.abs(cIm) < 0.01) continue;
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const cell = shipped(gridRe(x), cIm);
      if (!cell.escaped && cell.period === 0) candidates.push({ x, y });
    }
  }
  const byKey = new Map();
  const offAxis = [];
  for (const candidate of candidates) {
    const cell = studyCell(candidate.x, candidate.y);
    byKey.set(`${candidate.x},${candidate.y}`, cell);
    if (cell) offAxis.push(cell);
  }
  const offUnresolved = offAxis.filter(isUnresolved);
  const offChaotic = offUnresolved.filter(isChaotic);

  // Cell-to-cell jumps between shipped-grid neighbours that are both in the
  // population: one column over (alongRe) and one row over (alongIm).
  const seriesKeys = ["shippedWindow8", ...ESTIMATE_COUNTS.slice(1).map((n) => `float64Window${n}`), "reference1e6", "fixedPointRe"];
  const valuesOf = (cell) => ({
    shippedWindow8: cell.shipped.h0,
    ...Object.fromEntries(ESTIMATE_COUNTS.slice(1).map((n, i) => [`float64Window${n}`, cell.estimates[i + 1].mean])),
    reference1e6: cell.reference.mean,
    fixedPointRe: cell.fixedPointRe,
  });
  const neighbourJumps = (population, predicate) => {
    const jumps = { alongRe: {}, alongIm: {} };
    for (const key of seriesKeys) {
      jumps.alongRe[key] = [];
      jumps.alongIm[key] = [];
    }
    for (const cell of population) {
      const here = valuesOf(cell);
      for (const [axis, nx, ny] of [["alongRe", cell.x + 1, cell.y], ["alongIm", cell.x, cell.y + 1]]) {
        const neighbour = byKey.get(`${nx},${ny}`);
        if (!predicate(neighbour)) continue;
        const there = valuesOf(neighbour);
        for (const key of seriesKeys) jumps[axis][key].push(Math.abs(there[key] - here[key]));
      }
    }
    return {
      pairsAlongRe: jumps.alongRe[seriesKeys[0]].length,
      pairsAlongIm: jumps.alongIm[seriesKeys[0]].length,
      alongRe: Object.fromEntries(seriesKeys.map((k) => [k, lapStats(jumps.alongRe[k])])),
      alongIm: Object.fromEntries(seriesKeys.map((k) => [k, lapStats(jumps.alongIm[k])])),
    };
  };

  const classify = (cells) => ({
    studied: cells.length,
    referenceEscaped: cells.filter((c) => c.referenceEscaped).length,
    unresolved: cells.filter(isUnresolved).length,
    referencePeriodUpTo32: cells.filter((c) => isUnresolved(c) && c.referencePeriod > 0 && c.referencePeriod <= 32).length,
    referencePeriod33to2048: cells.filter((c) => isUnresolved(c) && c.referencePeriod > 32).length,
    chaotic: cells.filter(isChaotic).length,
  });
  const absIm = (cells) =>
    cells.length ? [round(Math.min(...cells.map((c) => Math.abs(c.cIm))), 8), round(Math.max(...cells.map((c) => Math.abs(c.cIm))), 8)] : null;
  return {
    definition: {
      unresolved: "bounded, shipped period 0, and still bounded through the 10^6-iterate reference (what the renderer will treat as having no period)",
      chaotic: `unresolved and with no period up to ${REFERENCE_MAX_PERIOD} in the reference orbit's final ${REFERENCE_PERIOD_WINDOW} iterates (tolerance ${REFERENCE_PERIOD_TOLERANCE})`,
      error: "|mean over the first N iterates after the 1500-iterate warmup - mean over 10^6 iterates|, float64; N = 8 is also taken from the production sampler",
    },
    realAxis: {
      selection: `shipped-grid axis row, columns with Re(c) <= ${CHAOTIC_BAND_RE_MAX}`,
      classification: classify(realAxisCells.filter((c) => c && c.cRe <= CHAOTIC_BAND_RE_MAX && c.shipped.period === 0)),
      cRange: [round(realUnresolved[0].cRe, 8), round(realUnresolved[realUnresolved.length - 1].cRe, 8)],
      unresolved: errorTable(realUnresolved),
      chaotic: errorTable(realChaotic),
    },
    offAxis: {
      selection: "every shipped-grid cell with |Im(c)| >= 0.01 that is bounded with no detected period",
      candidates: candidates.length,
      classification: classify(offAxis),
      absImRangeUnresolved: absIm(offUnresolved),
      absImRangeChaotic: absIm(offChaotic),
      unresolved: errorTable(offUnresolved),
      chaotic: errorTable(offChaotic),
      neighbourJumpsUnresolved: neighbourJumps(offUnresolved, isUnresolved),
      neighbourJumpsChaotic: neighbourJumps(offChaotic, isChaotic),
    },
    offAxisUnresolvedCells: offUnresolved,
    offAxisChaoticCells: offChaotic,
  };
}

// ---------------------------------------------------------------------------
// B: smoothness of the centre along the real axis
// ---------------------------------------------------------------------------

function lapStats(jumps) {
  const base = stats(jumps);
  return {
    ...base,
    lapFractionMax: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), round(base.max * b, 6)])),
    lapFractionRms: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), round(base.rms * b, 6)])),
    lapFractionMedian: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), round(base.median * b, 6)])),
  };
}

/** Jump statistics of a consecutive series; null entries break the chain. */
function jumpStats(values) {
  const jumps = [];
  for (let index = 1; index < values.length; index += 1) {
    const a = values[index - 1];
    const b = values[index];
    if (a === null || b === null || a === undefined || b === undefined) continue;
    jumps.push(Math.abs(b - a));
  }
  return lapStats(jumps);
}

/** Consecutive-column series of each centre estimator over a cell run. */
function estimatorSeries(cells, perBulb) {
  const series = {
    shippedWindow8: cells.map((c) => (c ? c.shipped.h0 : null)),
  };
  ESTIMATE_COUNTS.slice(1).forEach((count, index) => {
    series[`float64Window${count}`] = cells.map((c) => (c && c.estimates ? c.estimates[index + 1].mean : null));
  });
  series.reference1e6 = cells.map((c) => (c && c.reference ? c.reference.mean : null));
  series.fixedPointRe = cells.map((c) => (c ? c.fixedPointRe : null));
  if (perBulb) series.perBulbConstant = cells.map((c) => (c && c.perBulb !== undefined ? c.perBulb : null));
  return series;
}

function smoothnessSection(realAxisCells, windows) {
  // Per-bulb constant on the real axis: the cycle mean at the nearest
  // superstable centre of the cell's own shipped period, where one is known.
  for (const cell of realAxisCells) {
    if (!cell) continue;
    const q = cell.shipped.period;
    const centres = windows[q];
    if (!centres || !centres.length) {
      cell.perBulb = null;
      continue;
    }
    let best = centres[0];
    for (const centre of centres) if (Math.abs(centre.c - cell.cRe) < Math.abs(best.c - cell.cRe)) best = centre;
    cell.perBulb = best.cycleMean;
  }

  const bounded = realAxisCells.filter(Boolean);
  const inBand = (c) => c.cRe <= CHAOTIC_BAND_RE_MAX;
  const chaoticRun = realAxisCells.map((c) => (c && inBand(c) && c.shipped.period === 0 ? c : null));
  const chaoticPairs = estimatorSeries(chaoticRun, true);
  const allRun = realAxisCells.map((c) => c ?? null);
  const allPairs = estimatorSeries(allRun, true);

  const jumpsOf = (series) => Object.fromEntries(Object.entries(series).map(([k, v]) => [k, jumpStats(v)]));

  // Agreement of the comparators with the reference mean, by region.
  const regions = {
    period1: bounded.filter((c) => c.shipped.period === 1),
    period2: bounded.filter((c) => c.shipped.period === 2),
    period3to32: bounded.filter((c) => c.shipped.period >= 3),
    chaoticBand: bounded.filter((c) => inBand(c) && c.shipped.period === 0),
  };
  const agreement = Object.fromEntries(
    Object.entries(regions).map(([name, cells]) => [
      name,
      {
        cells: cells.length,
        fixedPointMinusMean: stats(cells.filter((c) => c.reference).map((c) => Math.abs(c.fixedPointRe - c.reference.mean))),
        perBulbMinusMean: stats(
          cells.filter((c) => c.reference && c.perBulb !== null).map((c) => Math.abs(c.perBulb - c.reference.mean)),
        ),
        perBulbDefined: cells.filter((c) => c.perBulb !== null).length,
      },
    ]),
  );

  // Steps of the per-bulb constant where the real-axis period changes.
  const perBulbSteps = [];
  for (let index = 1; index < bounded.length; index += 1) {
    const a = bounded[index - 1];
    const b = bounded[index];
    if (a.perBulb !== null && b.perBulb !== null && a.shipped.period !== b.shipped.period) {
      perBulbSteps.push({
        between: [round(a.cRe, 6), round(b.cRe, 6)],
        periods: [a.shipped.period, b.shipped.period],
        step: round(Math.abs(b.perBulb - a.perBulb), 6),
        referenceMeanStep: a.reference && b.reference ? round(Math.abs(b.reference.mean - a.reference.mean), 6) : null,
      });
    }
  }

  // The largest reference-mean jumps inside the chaotic band: seams the
  // exact centre has on its own, independent of any estimator.
  const chaoticCells = chaoticRun.filter(Boolean);
  const largeReferenceJumps = [];
  for (let index = 1; index < chaoticRun.length; index += 1) {
    const a = chaoticRun[index - 1];
    const b = chaoticRun[index];
    if (!a || !b || !a.reference || !b.reference) continue;
    const jump = Math.abs(b.reference.mean - a.reference.mean);
    largeReferenceJumps.push({ between: [round(a.cRe, 6), round(b.cRe, 6)], jump: round(jump, 6), lapAtRecommended: round(jump * RECOMMENDED_BANDS, 6) });
  }
  largeReferenceJumps.sort((p, q) => q.jump - p.jump);
  const seamCount = (threshold) => largeReferenceJumps.filter((j) => j.jump * RECOMMENDED_BANDS > threshold).length;

  return {
    gridPitchRe: round(PITCH_RE, 8),
    chaoticBand: {
      columns: chaoticRun.filter(Boolean).length,
      jumpsBetweenChaoticNeighbours: jumpsOf(chaoticPairs),
    },
    wholeRealAxis: {
      boundedColumns: bounded.length,
      jumpsBetweenBoundedNeighbours: jumpsOf(allPairs),
    },
    comparatorAgreement: agreement,
    perBulbSteps,
    referenceSeamsInChaoticBand: {
      pairs: largeReferenceJumps.length,
      pairsAbove5pctLapAtRecommended: seamCount(0.05),
      pairsAbove10pctLapAtRecommended: seamCount(0.1),
      pairsAbove25pctLapAtRecommended: seamCount(0.25),
      top10: largeReferenceJumps.slice(0, 10),
    },
    offAxis: "see runningMeanError.offAxis.neighbourJumpsUnresolved and neighbourJumpsChaotic",
  };
}

// ---------------------------------------------------------------------------
// C: bifurcations
// ---------------------------------------------------------------------------

const OFFSETS = [1e-1, 3e-2, 1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5];

function bifurcationRows(label, at, direction) {
  const rows = [];
  for (const sign of [-1, 1]) {
    for (const offset of [...OFFSETS].reverse()) {
      const t = sign * offset;
      const cRe = at.re + t * direction.re;
      const cIm = at.im + t * direction.im;
      const cell = shipped(cRe, cIm);
      const reference = convergedReference(cRe, cIm, 64);
      // With a detected period q <= 8 the centre is the exact cycle mean of
      // the first q samples, which is what the implementation would use;
      // the plot-window mean is kept alongside for comparison.
      let cycleH0 = null;
      let cycleMaxDev = null;
      if (!cell.escaped && cell.period > 0 && cell.period <= SHIPPED_SAMPLES) {
        cycleH0 = mean(cell.samples.slice(0, cell.period));
        cycleMaxDev = Math.max(...cell.samples.map((v) => Math.abs(v - cycleH0)));
      }
      const shippedScalarMax = cycleMaxDev ?? cell.maxDev;
      const residual = cell.escaped || !reference ? null : Math.abs(shippedScalarMax - reference.maxDev);
      const residualWindowMean = cell.escaped || !reference ? null : Math.abs(cell.maxDev - reference.maxDev);
      rows.push({
        offset: t,
        cRe: round(cRe, 12),
        cIm: round(cIm, 12),
        shippedPeriod: cell.period,
        shippedWindowH0: round(cell.h0, 8),
        shippedWindowMaxDev: round(cell.maxDev, 8),
        shippedCycleH0: round(cycleH0, 8),
        shippedCycleMaxDev: round(cycleMaxDev, 8),
        shippedScalarMax: round(shippedScalarMax, 8),
        referenceH0: reference ? round(reference.mean, 8) : null,
        referenceMaxDev: reference ? round(reference.maxDev, 8) : null,
        residual: round(residual, 8),
        residualWindowMean: round(residualWindowMean, 8),
        residualLapFraction: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), round(residual === null ? null : residual * b, 6)])),
      });
    }
  }
  const exceeds = (bands) =>
    rows.filter((r) => r.residual !== null && r.residual * bands > 0.01).map((r) => r.offset);
  return {
    label,
    at: { re: round(at.re, 12), im: round(at.im, 12) },
    direction: { re: round(direction.re, 12), im: round(direction.im, 12) },
    rows,
    offsetsWhereResidualExceeds1pctLap: Object.fromEntries(BAND_DENSITIES.map((b) => [bandKey(b), exceeds(b)])),
  };
}

function bifurcationSection() {
  const { root, seed } = bulbSeed(3);
  const centre = newtonCentre(3, seed.re, seed.im);
  const dx = centre.re - root.re;
  const dy = centre.im - root.im;
  const length = Math.hypot(dx, dy);
  return [
    bifurcationRows("period 1 -> 2 at c = -0.75", { re: -0.75, im: 0 }, { re: 1, im: 0 }),
    bifurcationRows("period 2 -> 4 at c = -1.25", { re: -1.25, im: 0 }, { re: 1, im: 0 }),
    bifurcationRows(
      "period 1 -> 3 at the 1/3 bulb root, offset along root->centre",
      root,
      { re: dx / length, im: dy / length },
    ),
  ];
}

// ---------------------------------------------------------------------------
// D/E/F: region census on the shipped grid (stride 2)
// ---------------------------------------------------------------------------

const HIST_BINS = 2000;
const HIST_MAX = 2;

function histogram() {
  return { bins: new Uint32Array(HIST_BINS + 1), count: 0, max: -Infinity, sum: 0 };
}

function histAdd(h, value) {
  const bin = Math.min(HIST_BINS, Math.floor((value / HIST_MAX) * HIST_BINS));
  h.bins[bin] += 1;
  h.count += 1;
  h.sum += value;
  if (value > h.max) h.max = value;
}

function histQuantile(h, q) {
  const target = q * h.count;
  let seen = 0;
  for (let bin = 0; bin <= HIST_BINS; bin += 1) {
    seen += h.bins[bin];
    if (seen >= target) return (bin / HIST_BINS) * HIST_MAX;
  }
  return HIST_MAX;
}

function histSummary(h) {
  return {
    count: h.count,
    mean: round(h.count ? h.sum / h.count : NaN, 6),
    p50: round(histQuantile(h, 0.5), 6),
    p90: round(histQuantile(h, 0.9), 6),
    p99: round(histQuantile(h, 0.99), 6),
    max: round(h.count ? h.max : NaN, 6),
    binWidth: HIST_MAX / HIST_BINS,
    quantilesAre: "lower edge of the containing bin",
  };
}

function regionOf(period) {
  if (period === 1) return "period1";
  if (period === 2) return "period2";
  if (period >= 3) return "period3to32";
  return "noPeriod";
}

function regionCensus(stride) {
  const names = ["period1", "period2", "period3to32", "noPeriod"];
  const regions = Object.fromEntries(
    names.map((name) => [name, { cells: 0, pointDev: histogram(), cellMaxDev: histogram(), cellRmsDev: histogram(), h0: histogram() }]),
  );
  let escaped = 0;
  let bounded = 0;
  let clippedSamples = 0;
  let overClipSamples = 0;
  let nonFiniteSamples = 0;
  let boundedWithoutCentre = 0;
  let fractionZeroDev = 0;
  for (let y = AXIS_ROW % stride; y < GRID_HEIGHT; y += stride) {
    const cIm = gridIm(y);
    for (let x = 0; x < GRID_WIDTH; x += stride) {
      const cell = shipped(gridRe(x), cIm);
      if (cell.escaped) {
        escaped += 1;
        continue;
      }
      bounded += 1;
      if (!Number.isFinite(cell.h0)) boundedWithoutCentre += 1;
      const region = regions[regionOf(cell.period)];
      region.cells += 1;
      histAdd(region.cellMaxDev, cell.maxDev);
      histAdd(region.cellRmsDev, cell.rmsDev);
      histAdd(region.h0, Math.abs(cell.h0));
      if (cell.maxDev === 0) fractionZeroDev += 1;
      for (let n = 0; n < SHIPPED_SAMPLES; n += 1) {
        const s = cell.samples[n];
        if (!Number.isFinite(s)) nonFiniteSamples += 1;
        else if (Math.abs(s) > 2) overClipSamples += 1;
        else if (Math.abs(s) === 2) clippedSamples += 1;
        histAdd(region.pointDev, cell.deviations[n]);
      }
    }
  }
  return {
    stride,
    cellsVisited: escaped + bounded,
    escapedCells: escaped,
    boundedCells: bounded,
    boundedCellsWithoutFiniteCentre: boundedWithoutCentre,
    boundedCellsWithZeroSpread: fractionZeroDev,
    samplesAtClip: clippedSamples,
    samplesBeyondClip: overClipSamples,
    nonFiniteSamples,
    regions: Object.fromEntries(
      names.map((name) => [
        name,
        {
          cells: regions[name].cells,
          fractionOfBounded: round(regions[name].cells / bounded, 6),
          pointDeviation: histSummary(regions[name].pointDev),
          cellMaxDeviation: histSummary(regions[name].cellMaxDev),
          cellRmsDeviation: histSummary(regions[name].cellRmsDev),
          absH0: histSummary(regions[name].h0),
        },
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// E: ground transects and the smoothness of the two ground candidates
// ---------------------------------------------------------------------------

function transect(label, points) {
  const rows = points.map(({ re, im, t }) => {
    const cell = shipped(re, im);
    const long = cell.escaped ? null : orbitMeans(re, im, SHIPPED_WARMUP, [4096]);
    return {
      t: round(t, 8),
      cRe: round(re, 8),
      cIm: round(im, 8),
      period: cell.period,
      shippedMaxDev: round(cell.maxDev, 6),
      shippedRmsDev: round(cell.rmsDev, 6),
      window4096MaxDev: long ? round(long.means[0].maxDev, 6) : null,
      window4096RmsDev: long ? round(long.means[0].rmsDev, 6) : null,
    };
  });
  const boundedRows = rows.filter((r) => r.period !== ESCAPED);
  return {
    label,
    points: rows.length,
    bounded: boundedRows.length,
    firstEscapedT: rows.find((r) => r.period === ESCAPED)?.t ?? null,
    lastBoundedT: boundedRows.length ? boundedRows[boundedRows.length - 1].t : null,
    valueAtLastBounded: boundedRows.length ? boundedRows[boundedRows.length - 1] : null,
    neighbourJumps: {
      shippedMaxDev: jumpStats(rows.map((r) => r.shippedMaxDev)),
      shippedRmsDev: jumpStats(rows.map((r) => r.shippedRmsDev)),
      window4096MaxDev: jumpStats(rows.map((r) => r.window4096MaxDev)),
      window4096RmsDev: jumpStats(rows.map((r) => r.window4096RmsDev)),
    },
    every20th: rows.filter((_r, i) => i % 20 === 0),
  };
}

function groundSection() {
  const real = linspace(-2, 0.25, 900).map((re) => ({ re, im: 0, t: re }));
  const vertical = linspace(0, 0.4, 160).map((im) => ({ re: -1, im, t: im }));
  const cardioid = linspace(0, 0.75, 300).map((im) => ({ re: -0.1, im, t: im }));
  return {
    realAxis: transect("real axis, Re(c) from -2 to 0.25 at shipped-pitch-scale steps (0.0025)", real),
    period2BulbUpward: transect("Re(c) = -1, Im(c) from 0 to 0.4", vertical),
    cardioidUpwardThroughBulb3: transect("Re(c) = -0.1, Im(c) from 0 to 0.75, through the cardioid into the 1/3 bulb", cardioid),
  };
}

// ---------------------------------------------------------------------------
// Cost: extra iterations a per-cell mean window would add
// ---------------------------------------------------------------------------

/** Iterations one cell costs today, by a clone of the sampler's control flow. */
function countIterations(cRe, cIm) {
  const toleranceSq = 1e-18;
  let zr = 0;
  let zi = 0;
  let checkpointR = 0;
  let checkpointI = 0;
  let revisitWindow = 8;
  let sinceCheckpoint = 0;
  let iterations = 0;
  for (let iteration = 0; iteration < SHIPPED_WARMUP; iteration += 1) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
    iterations += 1;
    if (zr * zr + zi * zi > 4) return { iterations, period: ESCAPED };
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
  const detectionCount = model.periodDetectionWindow(SHIPPED_SAMPLES);
  const window = new Float32Array(detectionCount);
  let kept = 0;
  while (kept < detectionCount) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
    iterations += 1;
    if (zr * zr + zi * zi > 4) {
      if (kept < SHIPPED_SAMPLES) return { iterations, period: ESCAPED };
      break;
    }
    window[kept] = zr > 2 ? 2 : zr < -2 ? -2 : zr;
    kept += 1;
  }
  return { iterations, period: estimatePeriod(window, 0, kept) };
}

function costSection(stride) {
  const out = new Float32Array(SHIPPED_SAMPLES);
  let cells = 0;
  let iterations = 0;
  let unresolved = 0;
  let periodic = 0;
  let periodSum = 0;
  let disagreements = 0;
  for (let y = 0; y < GRID_HEIGHT; y += stride) {
    const cIm = gridIm(y);
    for (let x = 0; x < GRID_WIDTH; x += stride) {
      const cRe = gridRe(x);
      const counted = countIterations(cRe, cIm);
      const actual = sampleAttractorCell(cRe, cIm, SHIPPED_WARMUP, SHIPPED_SAMPLES, out, 0);
      if (counted.period !== actual) disagreements += 1;
      cells += 1;
      iterations += counted.iterations;
      if (actual === 0) unresolved += 1;
      else if (actual > 0) {
        periodic += 1;
        periodSum += actual;
      }
    }
  }
  const meanNow = iterations / cells;
  return {
    stride,
    cells,
    cloneDisagreements: disagreements,
    meanIterationsPerCellNow: round(meanNow, 6),
    unresolvedFraction: round(unresolved / cells, 6),
    periodicFraction: round(periodic / cells, 6),
    meanPeriodOfPeriodicCells: round(periodSum / periodic, 6),
    // Periodic cells get the exact cycle mean from the detection window at no
    // extra iterations; only unresolved cells pay for a mean window.
    extraForUnresolvedWindow: Object.fromEntries(
      [256, 1024, 4096].map((n) => [
        String(n),
        {
          extraIterationsPerCell: round((unresolved * n) / cells, 6),
          relativeToNow: round((unresolved * n) / iterations, 6),
          worstCellIterations: SHIPPED_WARMUP + model.periodDetectionWindow(SHIPPED_SAMPLES) + n,
        },
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

const MAGMA_CYCLIC = [
  [0, [40, 16, 60]],
  [0.18, [104, 28, 128]],
  [0.36, [190, 58, 111]],
  [0.52, [247, 139, 96]],
  [0.64, [252, 235, 183]],
  [0.8, [184, 78, 114]],
  [1, [40, 16, 60]],
];

function smoothstep01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/** colormap.ts rampColour for magma-cyclic: smoothstep between stops. */
function magmaCyclic(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < MAGMA_CYCLIC.length; i += 1) {
    const [rightAt, right] = MAGMA_CYCLIC[i];
    const [leftAt, left] = MAGMA_CYCLIC[i - 1];
    if (x <= rightAt) {
      const local = smoothstep01((x - leftAt) / (rightAt - leftAt));
      return left.map((l, k) => Math.round(l + (right[k] - l) * local));
    }
  }
  return MAGMA_CYCLIC[MAGMA_CYCLIC.length - 1][1];
}

function paletteCoordinate(deviation, bands, phase) {
  const value = bands * deviation - phase;
  return value - Math.floor(value);
}

const CRC_TABLE = new Uint32Array(256).map((_v, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(image) {
  const { width, height, data } = image;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    data.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createImage(width, height, fill = [10, 10, 14]) {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 3] = fill[0];
    data[i * 3 + 1] = fill[1];
    data[i * 3 + 2] = fill[2];
  }
  return { width, height, data };
}

function putPixel(image, x, y, rgb) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 3;
  image.data[i] = rgb[0];
  image.data[i + 1] = rgb[1];
  image.data[i + 2] = rgb[2];
}

function fillRect(image, x0, y0, w, h, rgb) {
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) putPixel(image, x, y, rgb);
}

const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
};

function drawText(image, x, y, text, scale = 2, rgb = [230, 230, 230]) {
  let cursor = x;
  for (const raw of text.toUpperCase()) {
    const glyph = FONT[raw] ?? FONT[" "];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] === "1") fillRect(image, cursor + col * scale, y + row * scale, scale, scale, rgb);
      }
    }
    cursor += 6 * scale;
  }
}

/** One curtain panel: columns of shipped samples coloured by |Re z - h0|. */
function drawCurtain(image, originY, columns, centres, bands, phase, zMin, zMax, panelHeight) {
  for (let x = 0; x < columns.length; x += 1) {
    const cell = columns[x];
    const h0 = centres[x];
    if (!cell || cell.escaped || h0 === null || h0 === undefined) continue;
    for (const s of cell.samples) {
      const y = originY + Math.round(((zMax - s) / (zMax - zMin)) * (panelHeight - 1));
      const rgb = magmaCyclic(paletteCoordinate(Math.abs(s - h0), bands, phase));
      fillRect(image, x, y - 1, 2, 2, rgb);
    }
  }
}

function axisTicks(image, originY, panelHeight, width, reMin, reMax, zMin, zMax) {
  const grey = [70, 70, 80];
  for (let re = Math.ceil(reMin * 4) / 4; re <= reMax; re += 0.25) {
    const x = Math.round(((re - reMin) / (reMax - reMin)) * width);
    fillRect(image, x, originY + panelHeight - 10, 1, 10, grey);
    drawText(image, x + 3, originY + panelHeight - 18, re.toFixed(2), 1, grey);
  }
  for (let z = Math.ceil(zMin); z <= zMax; z += 1) {
    const y = originY + Math.round(((zMax - z) / (zMax - zMin)) * (panelHeight - 1));
    fillRect(image, 0, y, 10, 1, grey);
    drawText(image, 12, y - 3, `Z=${z}`, 1, grey);
  }
}

function writePreviews(dir, report, windows) {
  mkdirSync(dir, { recursive: true });
  const width = 1800;
  const panelHeight = 800;
  const reMin = -2;
  const reMax = 0.25;
  const zMin = -2;
  const zMax = 2;
  const bands = RECOMMENDED_BANDS;
  const label = 26;

  // Shipped columns at one column per pixel (pitch 0.00125, the shipped
  // pitch is 0.001235), with every centre estimator per column.
  const columns = [];
  const centres = { shippedWindow8: [], recommended: [], fixedPointRe: [], perBulbConstant: [] };
  for (let x = 0; x < width; x += 1) {
    const cRe = reMin + ((x + 0.5) / width) * (reMax - reMin);
    const cell = shipped(cRe, 0);
    columns.push(cell);
    if (cell.escaped) {
      for (const key of Object.keys(centres)) centres[key].push(null);
      continue;
    }
    centres.shippedWindow8.push(cell.h0);
    const recommended = cell.period > 0 ? cycleMean(cRe, 0, cell.period) : orbitMeans(cRe, 0, SHIPPED_WARMUP, [RECOMMENDED_WINDOW])?.means[0];
    centres.recommended.push(recommended ? recommended.mean : null);
    centres.fixedPointRe.push(fixedPointRe(cRe, 0));
    const known = windows[cell.period];
    if (known && known.length) {
      let best = known[0];
      for (const centre of known) if (Math.abs(centre.c - cRe) < Math.abs(best.c - cRe)) best = centre;
      centres.perBulbConstant.push(best.cycleMean);
    } else centres.perBulbConstant.push(null);
  }

  const written = [];
  for (const phase of [0, 0.25, 0.5, 0.75]) {
    const image = createImage(width, panelHeight + label);
    drawText(image, 8, 6, `REAL AXIS  RE(C) -2 TO 0.25  RE(Z) -2 TO 2  CENTRE: CYCLE MEAN OR ${RECOMMENDED_WINDOW}-ITERATE MEAN  BANDS ${bands}  PHASE ${phase.toFixed(2)}`, 2);
    drawCurtain(image, label, columns, centres.recommended, bands, phase, zMin, zMax, panelHeight);
    axisTicks(image, label, panelHeight, width, reMin, reMax, zMin, zMax);
    const path = join(dir, `real-axis-phase-${phase.toFixed(2)}.png`);
    writeFileSync(path, encodePng(image));
    written.push(path);
  }

  const panels = [
    ["shippedWindow8", "A: MEAN OF THE 8 SHIPPED SAMPLES (NO SAMPLER CHANGE)"],
    ["recommended", `B: EXACT CYCLE MEAN WHERE A PERIOD IS DETECTED, ELSE ${RECOMMENDED_WINDOW}-ITERATE MEAN (RECOMMENDED)`],
    ["fixedPointRe", "C: RE(Z*) ANALYTIC FIXED POINT, PRINCIPAL BRANCH (COMPARATOR)"],
    ["perBulbConstant", "D: ONE CONSTANT PER REAL-AXIS WINDOW, CYCLE MEAN AT ITS SUPERSTABLE CENTRE (COMPARATOR, GREY = UNDEFINED)"],
  ];
  const stackHeight = 360;
  const stack = createImage(width, panels.length * (stackHeight + label));
  panels.forEach(([key, title], index) => {
    const originY = index * (stackHeight + label);
    drawText(stack, 8, originY + 6, `${title}  PHASE 0.00  BANDS ${bands}`, 2);
    if (key === "perBulbConstant") {
      for (let x = 0; x < width; x += 1) {
        const cell = columns[x];
        if (!cell || cell.escaped || centres[key][x] !== null) continue;
        for (const s of cell.samples) {
          const y = originY + label + Math.round(((zMax - s) / (zMax - zMin)) * (stackHeight - 1));
          fillRect(stack, x, y - 1, 2, 2, [90, 90, 90]);
        }
      }
    }
    drawCurtain(stack, originY + label, columns, centres[key], bands, 0, zMin, zMax, stackHeight);
    axisTicks(stack, originY + label, stackHeight, width, reMin, reMax, zMin, zMax);
  });
  const stackPath = join(dir, "real-axis-centre-comparison.png");
  writeFileSync(stackPath, encodePng(stack));
  written.push(stackPath);

  // Off-axis slice through the 1/3 bulb: the line from the cardioid root
  // through the bulb's superattracting centre, from inside the cardioid to
  // outside the set.
  const { root, seed } = bulbSeed(3);
  const centre = newtonCentre(3, seed.re, seed.im);
  const dx = centre.re - root.re;
  const dy = centre.im - root.im;
  const length = Math.hypot(dx, dy);
  const direction = { re: dx / length, im: dy / length };
  const tMin = -0.25;
  const tMax = 0.35;
  const sliceZMin = -1.5;
  const sliceZMax = 1.5;
  const sliceColumns = [];
  const sliceCentres = [];
  for (let x = 0; x < width; x += 1) {
    const t = tMin + ((x + 0.5) / width) * (tMax - tMin);
    const cRe = root.re + t * direction.re;
    const cIm = root.im + t * direction.im;
    const cell = shipped(cRe, cIm);
    sliceColumns.push(cell);
    if (cell.escaped) {
      sliceCentres.push(null);
      continue;
    }
    const estimate = cell.period > 0 ? cycleMean(cRe, cIm, cell.period) : orbitMeans(cRe, cIm, SHIPPED_WARMUP, [RECOMMENDED_WINDOW])?.means[0];
    sliceCentres.push(estimate ? estimate.mean : null);
  }
  const slice = createImage(width, panelHeight + label);
  drawText(slice, 8, 6, `OFF-AXIS SLICE THROUGH THE 1/3 BULB  T=${tMin} TO ${tMax} ALONG ROOT->CENTRE  RE(Z) ${sliceZMin} TO ${sliceZMax}  BANDS ${bands}  PHASE 0.00`, 2);
  drawCurtain(slice, label, sliceColumns, sliceCentres, bands, 0, sliceZMin, sliceZMax, panelHeight);
  const grey = [70, 70, 80];
  for (let t = tMin; t <= tMax + 1e-9; t += 0.05) {
    const x = Math.round(((t - tMin) / (tMax - tMin)) * width);
    fillRect(slice, x, label + panelHeight - 10, 1, 10, grey);
    drawText(slice, x + 3, label + panelHeight - 18, `T=${t.toFixed(2)}`, 1, grey);
  }
  for (let z = -1; z <= 1; z += 1) {
    const y = label + Math.round(((sliceZMax - z) / (sliceZMax - sliceZMin)) * (panelHeight - 1));
    fillRect(slice, 0, y, 10, 1, grey);
    drawText(slice, 12, y - 3, `Z=${z}`, 1, grey);
  }
  const slicePath = join(dir, "off-axis-slice.png");
  writeFileSync(slicePath, encodePng(slice));
  written.push(slicePath);

  const periodsAlongSlice = [];
  let last = null;
  sliceColumns.forEach((cell, x) => {
    if (cell.period !== last) {
      periodsAlongSlice.push({ t: round(tMin + ((x + 0.5) / width) * (tMax - tMin), 6), period: cell.period });
      last = cell.period;
    }
  });

  report.previews = {
    directory: dir,
    files: written.map((p) => p.replace(`${repoRoot}/`, "")),
    bands,
    recommendedWindow: RECOMMENDED_WINDOW,
    realAxis: { reMin, reMax, zMin, zMax, columns: width, pitch: round((reMax - reMin) / width, 8) },
    centreComparisonPanels: panels.map(([key, title]) => ({ key, title })),
    offAxisSlice: {
      start: { re: round(root.re + tMin * direction.re, 8), im: round(root.im + tMin * direction.im, 8) },
      end: { re: round(root.re + tMax * direction.re, 8), im: round(root.im + tMax * direction.im, 8) },
      root: { re: round(root.re, 8), im: round(root.im, 8) },
      bulbCentre: { re: round(centre.re, 8), im: round(centre.im, 8) },
      direction: { re: round(direction.re, 8), im: round(direction.im, 8) },
      tRange: [tMin, tMax],
      zRange: [sliceZMin, sliceZMax],
      periodRuns: periodsAlongSlice.slice(0, 40),
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const started = process.hrtime.bigint();
const elapsed = () => Number(process.hrtime.bigint() - started) / 1e9;
const log = (message) => process.stderr.write(`[${elapsed().toFixed(1)}s] ${message}\n`);

log("closed forms");
const closedForm = closedFormSection();

log("mean bias at centres");
const meanBias = meanBiasSection();

// Real-axis windows for the per-bulb comparator: superstable centres of
// periods 1..8 found by scanning f_c^q(0), keyed by shipped period.
log("real-axis windows");
const windows = {};
for (let q = 1; q <= 8; q += 1) {
  const points = realSuperstablePoints(q, -2, 0.25, 40000);
  windows[q] = [];
  for (const c of points) {
    const cell = shipped(c, 0);
    if (cell.period !== q) continue;
    windows[q].push({ c, cycleMean: mean(cell.samples.slice(0, q)) });
  }
}

log("real-axis columns with references");
const realAxisCells = [];
for (let x = 0; x < GRID_WIDTH; x += 1) realAxisCells.push(studyCell(x, AXIS_ROW));

log("off-axis chaotic cells");
const runningMeanError = runningMeanErrorSection(realAxisCells);

log("smoothness");
const smoothness = smoothnessSection(realAxisCells, windows);

log("bifurcations");
const bifurcations = bifurcationSection();

log("region census");
const regions = regionCensus(2);

log("ground transects");
const ground = groundSection();

log("cost");
const cost = costSection(4);

const report = {
  settings: {
    shippedWarmup: SHIPPED_WARMUP,
    shippedSamples: SHIPPED_SAMPLES,
    detectionWindow: model.periodDetectionWindow(SHIPPED_SAMPLES),
    grid: { width: GRID_WIDTH, height: GRID_HEIGHT, reMin: RE_MIN, reMax: RE_MAX, imMin: IM_MIN, imMax: IM_MAX, axisRow: AXIS_ROW },
    pitchRe: round(PITCH_RE, 8),
    pitchIm: round(PITCH_IM, 8),
    estimateCounts: ESTIMATE_COUNTS,
    referenceIterates: REFERENCE_ITERATES,
    referenceWarmupForConverged: REFERENCE_WARMUP,
    bandDensities: BAND_DENSITIES,
    recommendedBands: RECOMMENDED_BANDS,
    recommendedWindow: RECOMMENDED_WINDOW,
    estimatorConvention: "float64 orbit from z = 0, 1500 warmup iterates discarded, running mean of Re(z) over the next N iterates; reference N = 10^6",
    chaoticBandReMax: CHAOTIC_BAND_RE_MAX,
    scalar: "|Re(z) - h0(c)|, h0 = mean height of the orbit at c, palette at fract(bands * scalar - phase)",
  },
  closedForm,
  meanBias,
  realAxisWindows: Object.fromEntries(
    Object.entries(windows).map(([q, list]) => [q, list.map((w) => ({ c: round(w.c, 10), cycleMean: round(w.cycleMean, 8) }))]),
  ),
  runningMeanError: {
    definition: runningMeanError.definition,
    realAxis: runningMeanError.realAxis,
    offAxis: runningMeanError.offAxis,
  },
  smoothness,
  bifurcations,
  regions,
  ground,
  cost,
  // Per-cell rows the verifier can reproduce: every 4th real-axis chaotic
  // cell and every 4th off-axis chaotic cell, with the N = 64 error.
  verifierCells: {
    realAxis: realAxisCells
      .filter((c) => isUnresolved(c) && c.cRe <= CHAOTIC_BAND_RE_MAX)
      .filter((_c, i) => i % 4 === 0)
      .map((c) => ({
        x: c.x,
        cRe: round(c.cRe, 12),
        cIm: 0,
        referencePeriod: c.referencePeriod,
        shippedH0: round(c.shipped.h0, 8),
        mean64: round(c.estimates[1].mean, 8),
        mean4096: round(c.estimates[4].mean, 8),
        reference: round(c.reference.mean, 8),
        error64: round(Math.abs(c.estimates[1].mean - c.reference.mean), 6),
        error4096: round(Math.abs(c.estimates[4].mean - c.reference.mean), 6),
      })),
    offAxisChaotic: runningMeanError.offAxisChaoticCells
      .map((c) => ({
        x: c.x,
        y: c.y,
        cRe: round(c.cRe, 12),
        cIm: round(c.cIm, 12),
        referencePeriod: c.referencePeriod,
        shippedH0: round(c.shipped.h0, 8),
        mean64: round(c.estimates[1].mean, 8),
        mean4096: round(c.estimates[4].mean, 8),
        reference: round(c.reference.mean, 8),
        error64: round(Math.abs(c.estimates[1].mean - c.reference.mean), 6),
        error4096: round(Math.abs(c.estimates[4].mean - c.reference.mean), 6),
      })),
    offAxisUnresolved: runningMeanError.offAxisUnresolvedCells
      .filter((_c, i) => i % 40 === 0)
      .map((c) => ({
        x: c.x,
        y: c.y,
        cRe: round(c.cRe, 12),
        cIm: round(c.cIm, 12),
        referencePeriod: c.referencePeriod,
        shippedH0: round(c.shipped.h0, 8),
        mean64: round(c.estimates[1].mean, 8),
        mean4096: round(c.estimates[4].mean, 8),
        reference: round(c.reference.mean, 8),
        error64: round(Math.abs(c.estimates[1].mean - c.reference.mean), 6),
        error4096: round(Math.abs(c.estimates[4].mean - c.reference.mean), 6),
      })),
  },
};

if (previewDir) {
  log("previews");
  writePreviews(resolve(repoRoot, previewDir), report, windows);
}

log("done");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
