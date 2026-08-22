import type { OrbitSurfaceComplex } from "./orbitSurfaceCurves.js";

/**
 * Exact-period classification of a c-parameter against the hyperbolic
 * components of z -> z^2 + c.
 *
 * The finite sampler in `model.ts` labels a cell by looking for a repeat in a
 * short window of Re(z) after a fixed warmup. That misses two large families
 * of genuinely periodic parameters: components whose period exceeds the
 * window length (period 8 never fits an eight-sample window, because the
 * repeat test needs a lag pair), and components whose multiplier is close
 * enough to the unit circle that the warmup has not landed on the cycle yet.
 * Both render as chaotic dust.
 *
 * This module answers the same question exactly instead of empirically. For
 * each candidate period q it solves f_c^q(z) - z = 0 by Newton iteration from
 * a warmed-up orbit point, then reads the cycle multiplier
 * mu_q = prod 2 z_j = d f_c^q / dz at the root. A quadratic map has one
 * critical point, so it admits at most one attracting cycle: any root with
 * |mu_q| < 1 is therefore the attractor, and the parameter lies inside the
 * period-q component. That single fact is what keeps the classification from
 * overreaching, because a chaotic parameter has no such root at any q.
 *
 * Everything here is pure, deterministic and renderer-independent. The
 * component seeds it returns carry the (period, c, cycle) triple that
 * `orbitSurfaceCurves.correctOrbitSurfaceBoundaryPoint` takes as its
 * predictor, so a later stage can trace each discovered component's
 * bifurcation curve without rediscovering the component.
 */

/** Highest period this module will claim, matching the renderer sample window. */
export const ORBIT_SURFACE_MAX_COMPONENT_PERIOD = 8;

/**
 * A root is only accepted when |mu| <= 1 - margin. The root itself is exact to
 * near machine precision, so the margin is not there to cover numerical doubt;
 * it holds the claimed sheet a measurable step inside the bifurcation locus so
 * that no sheet can appear over chaotic parameter space.
 */
export const ORBIT_SURFACE_COMPONENT_MULTIPLIER_MARGIN = 0.02;

/** Iterations run from z = 0 before Newton, to land inside the root's basin. */
export const ORBIT_SURFACE_COMPONENT_WARMUP = 256;

const ESCAPE_RADIUS_SQUARED = 4;
const SAMPLE_CLIP = 2;
const DEFAULT_ROOT_TOLERANCE = 1e-12;
const DEFAULT_MAX_NEWTON_ITERATIONS = 40;
/** A root this close to a lower-period cycle is that cycle, not a new one. */
const DIVISOR_TOLERANCE = 1e-6;
/** Newton is ill-conditioned where mu approaches 1; those cells stay cloud. */
const MIN_NEWTON_DENOMINATOR = 1e-9;
const MAX_NEWTON_MAGNITUDE = 4;

export interface OrbitSurfaceComponentOptions {
  maxPeriod?: number;
  multiplierMargin?: number;
  warmupIterations?: number;
  rootTolerance?: number;
  maxNewtonIterations?: number;
}

export interface OrbitSurfaceComponentClassification {
  /** Exact component period, or 0 when the parameter is not confidently periodic. */
  period: number;
  /** |mu| of the accepted cycle; 1 when nothing was accepted. */
  multiplier: number;
  /** 1 - |mu|: zero on the bifurcation locus, one at the component centre. */
  confidence: number;
  /** Argument of the accepted cycle multiplier, used to seed continuation. */
  multiplierAngle: number;
  /** A point of the accepted cycle, exact to `rootTolerance`. */
  cycle: OrbitSurfaceComplex;
  /** |f_c^q(z) - z| at the accepted root. */
  residual: number;
  escaped: boolean;
}

export interface OrbitSurfaceComponentSeed {
  period: number;
  c: OrbitSurfaceComplex;
  cycle: OrbitSurfaceComplex;
  multiplier: number;
  /** Argument of the cycle multiplier. Older fixture seeds may omit it. */
  multiplierAngle?: number;
}

export interface OrbitSurfaceComponentRegion {
  period: number;
  /** Grid cells in this connected same-period region. */
  cellCount: number;
  /** Lowest grid index in the region, so the catalogue order is deterministic. */
  firstCell: number;
  /** Interior point with the smallest multiplier magnitude found in the region. */
  seed: OrbitSurfaceComponentSeed;
}

const UNCLASSIFIED: OrbitSurfaceComponentClassification = {
  period: 0,
  multiplier: 1,
  confidence: 0,
  multiplierAngle: 0,
  cycle: { re: 0, im: 0 },
  residual: Number.POSITIVE_INFINITY,
  escaped: false,
};

/**
 * Classify one parameter by solving for an attracting cycle of period 1 to
 * `maxPeriod`. Returns period 0 for escaped, chaotic and near-boundary
 * parameters alike, all of which stay cloud.
 */
export function classifyOrbitSurfaceComponent(
  cRe: number,
  cIm: number,
  options: OrbitSurfaceComponentOptions = {},
): OrbitSurfaceComponentClassification {
  const maxPeriod = Math.max(
    1,
    Math.min(
      ORBIT_SURFACE_MAX_COMPONENT_PERIOD,
      Math.floor(options.maxPeriod ?? ORBIT_SURFACE_MAX_COMPONENT_PERIOD),
    ),
  );
  const margin = Math.max(
    0,
    Math.min(1, options.multiplierMargin ?? ORBIT_SURFACE_COMPONENT_MULTIPLIER_MARGIN),
  );
  const warmup = Math.max(
    0,
    Math.floor(options.warmupIterations ?? ORBIT_SURFACE_COMPONENT_WARMUP),
  );
  const tolerance = Math.max(
    Number.EPSILON,
    Math.abs(options.rootTolerance ?? DEFAULT_ROOT_TOLERANCE),
  );
  const maxIterations = Math.max(
    1,
    Math.floor(options.maxNewtonIterations ?? DEFAULT_MAX_NEWTON_ITERATIONS),
  );
  if (!Number.isFinite(cRe) || !Number.isFinite(cIm)) return UNCLASSIFIED;

  let seedRe = 0;
  let seedIm = 0;
  for (let iteration = 0; iteration < warmup; iteration += 1) {
    const nextRe = seedRe * seedRe - seedIm * seedIm + cRe;
    seedIm = 2 * seedRe * seedIm + cIm;
    seedRe = nextRe;
    if (seedRe * seedRe + seedIm * seedIm > ESCAPE_RADIUS_SQUARED) {
      return { ...UNCLASSIFIED, escaped: true };
    }
  }

  const acceptedMagnitude = 1 - margin;
  for (let period = 1; period <= maxPeriod; period += 1) {
    const root = solveCycleRoot(
      period,
      seedRe,
      seedIm,
      cRe,
      cIm,
      tolerance,
      maxIterations,
    );
    if (!root) continue;
    const multiplier = Math.hypot(root.multiplierRe, root.multiplierIm);
    if (!(multiplier <= acceptedMagnitude)) continue;
    if (hasLowerPeriodCycle(period, root.re, root.im, cRe, cIm)) continue;
    return {
      period,
      multiplier,
      confidence: 1 - multiplier,
      multiplierAngle: Math.atan2(root.multiplierIm, root.multiplierRe),
      cycle: { re: root.re, im: root.im },
      residual: root.residual,
      escaped: false,
    };
  }
  return UNCLASSIFIED;
}

/**
 * Write the exact cycle of a classified parameter into a sample window, in the
 * same clipped Re(z) form the empirical sampler produces. The window repeats
 * with lag `period` to the last bit, so downstream period estimation and sheet
 * ranking see a clean cycle rather than an unconverged orbit.
 */
export function writeOrbitSurfaceCycleSamples(
  classification: OrbitSurfaceComponentClassification,
  cRe: number,
  cIm: number,
  samplesOut: Float32Array,
  offset: number,
  sampleCount: number,
): boolean {
  const period = Math.floor(classification.period);
  const count = Math.max(0, Math.floor(sampleCount));
  if (period < 1 || period > count) return false;

  const cycle = new Float64Array(period);
  let zr = classification.cycle.re;
  let zi = classification.cycle.im;
  for (let step = 0; step < period; step += 1) {
    const nextRe = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextRe;
    if (!Number.isFinite(zr) || !Number.isFinite(zi)) return false;
    cycle[step] = zr > SAMPLE_CLIP ? SAMPLE_CLIP : zr < -SAMPLE_CLIP ? -SAMPLE_CLIP : zr;
  }
  for (let sample = 0; sample < count; sample += 1) {
    samplesOut[offset + sample] = cycle[sample % period];
  }
  return true;
}

/**
 * Group classified grid cells into connected same-period regions, one
 * catalogue entry per component visible in the window. The representative seed
 * is the interior point with the smallest multiplier magnitude, which is the
 * best-conditioned starting point for boundary continuation.
 */
export function buildOrbitSurfaceComponentCatalogue(
  periods: ArrayLike<number>,
  width: number,
  height: number,
  seedAt: (cell: number) => OrbitSurfaceComponentSeed | null,
): OrbitSurfaceComponentRegion[] {
  const gridWidth = Math.max(0, Math.floor(width));
  const gridHeight = Math.max(0, Math.floor(height));
  const cellCount = gridWidth * gridHeight;
  const visited = new Uint8Array(cellCount);
  const regions: OrbitSurfaceComponentRegion[] = [];
  const stack: number[] = [];

  for (let start = 0; start < cellCount; start += 1) {
    const period = Math.floor(periods[start] ?? 0);
    if (period <= 0 || visited[start] !== 0) continue;
    visited[start] = 1;
    stack.length = 0;
    stack.push(start);
    let members = 0;
    let seed: OrbitSurfaceComponentSeed | null = null;
    while (stack.length > 0) {
      const cell = stack.pop() as number;
      members += 1;
      const candidate = seedAt(cell);
      if (
        candidate &&
        candidate.period === period &&
        (!seed || candidate.multiplier < seed.multiplier)
      ) {
        seed = candidate;
      }
      const x = cell % gridWidth;
      const y = (cell - x) / gridWidth;
      if (x > 0) push(cell - 1, period);
      if (x + 1 < gridWidth) push(cell + 1, period);
      if (y > 0) push(cell - gridWidth, period);
      if (y + 1 < gridHeight) push(cell + gridWidth, period);
    }
    if (!seed) continue;
    regions.push({ period, cellCount: members, firstCell: start, seed });
  }
  return regions;

  function push(cell: number, period: number): void {
    if (visited[cell] !== 0) return;
    if (Math.floor(periods[cell] ?? 0) !== period) return;
    visited[cell] = 1;
    stack.push(cell);
  }
}

interface CycleRoot {
  re: number;
  im: number;
  multiplierRe: number;
  multiplierIm: number;
  residual: number;
}

function solveCycleRoot(
  period: number,
  seedRe: number,
  seedIm: number,
  cRe: number,
  cIm: number,
  tolerance: number,
  maxIterations: number,
): CycleRoot | null {
  let zr = seedRe;
  let zi = seedIm;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let vr = zr;
    let vi = zi;
    let dr = 1;
    let di = 0;
    for (let step = 0; step < period; step += 1) {
      const nextDr = 2 * (vr * dr - vi * di);
      const nextDi = 2 * (vr * di + vi * dr);
      const nextVr = vr * vr - vi * vi + cRe;
      vi = 2 * vr * vi + cIm;
      vr = nextVr;
      dr = nextDr;
      di = nextDi;
    }
    if (!Number.isFinite(vr) || !Number.isFinite(vi) || !Number.isFinite(dr) || !Number.isFinite(di)) {
      return null;
    }
    const residual = Math.hypot(vr - zr, vi - zi);
    if (residual <= tolerance) {
      return { re: zr, im: zi, multiplierRe: dr, multiplierIm: di, residual };
    }
    const denominatorRe = dr - 1;
    const denominatorIm = di;
    const denominatorSquared = denominatorRe * denominatorRe + denominatorIm * denominatorIm;
    if (denominatorSquared < MIN_NEWTON_DENOMINATOR * MIN_NEWTON_DENOMINATOR) return null;
    const numeratorRe = vr - zr;
    const numeratorIm = vi - zi;
    const stepRe = (numeratorRe * denominatorRe + numeratorIm * denominatorIm) / denominatorSquared;
    const stepIm = (numeratorIm * denominatorRe - numeratorRe * denominatorIm) / denominatorSquared;
    zr -= stepRe;
    zi -= stepIm;
    if (zr * zr + zi * zi > MAX_NEWTON_MAGNITUDE * MAX_NEWTON_MAGNITUDE) return null;
  }
  return null;
}

function hasLowerPeriodCycle(
  period: number,
  zr: number,
  zi: number,
  cRe: number,
  cIm: number,
): boolean {
  let vr = zr;
  let vi = zi;
  for (let step = 1; step < period; step += 1) {
    const nextVr = vr * vr - vi * vi + cRe;
    vi = 2 * vr * vi + cIm;
    vr = nextVr;
    if (period % step !== 0) continue;
    if (Math.hypot(vr - zr, vi - zi) <= DIVISOR_TOLERANCE) return true;
  }
  return false;
}
