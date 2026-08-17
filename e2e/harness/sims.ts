/**
 * Per-sim sweep configuration: which parameters to vary, over what grid, for how
 * many steps, and which channel to score. Kept data-only so the spec stays a thin
 * orchestrator and tuning is a matter of editing values here.
 *
 * Grids are deliberately modest (the sweep is a relative ranking tool, not a
 * production render) so a full Cartesian sweep finishes in seconds-to-minutes.
 */

export type Params = Record<string, number | boolean | string>;

export interface SweepAxis {
  key: string;
  values: number[];
}

export interface ReferenceSet {
  id: string;
  label: string;
  params: Params;
}

export interface SimSweepConfig {
  slug: string;
  /** Artifact directory / report id; defaults to the slug. Lets several sweeps
   * (e.g. one per map of a multi-map kernel) share a slug without colliding. */
  artifactId?: string;
  /** Channel index scored as the scalar field. */
  primaryChannel: number;
  gridWidth: number;
  gridHeight: number;
  warmupSteps: number;
  fluxGap: number;
  dt: number;
  coverageThreshold: number;
  /** Fixed params applied to every set in the sweep. */
  baseParams: Params;
  /** Swept axes; the sweep is their Cartesian product. */
  axes: SweepAxis[];
  /** Existing presets/defaults to baseline candidates against. */
  references: ReferenceSet[];
}

/** Inclusive linear range with `count` samples, rounded to `decimals`. */
export function linspace(min: number, max: number, count: number, decimals = 4): number[] {
  if (count <= 1) return [Number(min.toFixed(decimals))];
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const v = min + ((max - min) * i) / (count - 1);
    out.push(Number(v.toFixed(decimals)));
  }
  return out;
}

/** Cartesian product of the axes into concrete param objects merged onto base. */
export function expandSweep(config: SimSweepConfig): Params[] {
  let combos: Params[] = [{ ...config.baseParams }];
  for (const axis of config.axes) {
    const next: Params[] = [];
    for (const combo of combos) {
      for (const value of axis.values) {
        next.push({ ...combo, [axis.key]: value });
      }
    }
    combos = next;
  }
  return combos;
}

const GRAY_SCOTT: SimSweepConfig = {
  slug: "gray-scott",
  primaryChannel: 1, // V — the pattern-forming species
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 700, // *20 inner Euler iters = 14000 — long enough for the regime to fill
  fluxGap: 12,      // the field (dying regimes empty out; living ones reach steady texture)
  dt: 1,
  coverageThreshold: 0.1,
  baseParams: { Du: 0.2097, Dv: 0.105, stepsPerFrame: 20 },
  axes: [
    { key: "F", values: linspace(0.01, 0.066, 8) },
    { key: "k", values: linspace(0.045, 0.067, 7) },
  ],
  // References mirror the shipped presets so a re-run reproduces their scores.
  // The promoted Spots/Waves deltas are recorded in docs/sweeps/.
  references: [
    { id: "default-coral", label: "Default (Coral)", params: { Du: 0.2097, Dv: 0.105, F: 0.0545, k: 0.062, stepsPerFrame: 20 } },
    { id: "mitosis", label: "Mitosis", params: { Du: 0.2097, Dv: 0.105, F: 0.0367, k: 0.0649, stepsPerFrame: 20 } },
    { id: "maze", label: "Maze", params: { Du: 0.2097, Dv: 0.105, F: 0.029, k: 0.057, stepsPerFrame: 20 } },
    { id: "spots", label: "Spots (promoted: dense lattice)", params: { Du: 0.2097, Dv: 0.105, F: 0.026, k: 0.0597, stepsPerFrame: 20 } },
    { id: "waves", label: "Waves (promoted: pulsing cells)", params: { Du: 0.2097, Dv: 0.105, F: 0.018, k: 0.0487, stepsPerFrame: 20 } },
  ],
};

const BOIDS: SimSweepConfig = {
  slug: "boids",
  primaryChannel: 0, // density (occupancy)
  gridWidth: 200,
  gridHeight: 200,
  warmupSteps: 220,
  fluxGap: 6,
  dt: 1,
  coverageThreshold: 0.001, // occupancy is sparse; any occupied cell counts
  baseParams: { boidCount: 2500, maxSpeed: 16, alignment: 0.06, cohesion: 0.012, pointSize: 6 },
  axes: [
    { key: "visualRadius", values: [16, 24, 32, 44, 56] },
    { key: "separation", values: [0.1, 0.2, 0.35, 0.55] },
    { key: "separationRadius", values: [5, 8, 12] },
  ],
  references: [
    { id: "balanced-flock", label: "Balanced flock", params: { boidCount: 2500, visualRadius: 36, separationRadius: 6, maxSpeed: 16, alignment: 0.06, cohesion: 0.012, separation: 0.2, pointSize: 6 } },
    { id: "tight-flock", label: "Tight flock", params: { boidCount: 2500, visualRadius: 30, separationRadius: 5, maxSpeed: 20, alignment: 0.1, cohesion: 0.02, separation: 0.16, pointSize: 6 } },
  ],
};

const LORENZ: SimSweepConfig = {
  slug: "lorenz-attractor",
  primaryChannel: 0, // trail density
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 280,
  fluxGap: 8,
  dt: 1,
  coverageThreshold: 0.04,
  baseParams: { beta: 2.6667, stepsPerFrame: 6, fade: 0.992 },
  axes: [
    { key: "rho", values: linspace(24, 46, 6, 2) },
    { key: "sigma", values: [8, 10, 12, 14] },
    { key: "fade", values: [0.985, 0.992, 0.997] },
  ],
  // The classic rho=28 reads thin (the trajectory lingers on one wing and the
  // short trail decays before both wings light up) — but rho=28 is the canonical
  // Lorenz value and "Wide wings" already renders the full butterfly, so no clean
  // promotion was made here. See docs/sweeps/ for the reasoning.
  references: [
    { id: "classic", label: "Classic butterfly (app default)", params: { sigma: 10, rho: 28, beta: 2.6667, stepsPerFrame: 6, fade: 0.992 } },
    { id: "wide-wings", label: "Wide wings", params: { sigma: 10, rho: 35, beta: 2.6667, stepsPerFrame: 12, fade: 0.99 } },
  ],
};

/**
 * Point-map attractor sweeps: one config per map, sharing the slug. The a/b
 * axes are the interesting knobs (they set the trig frequencies that fold the
 * plane); c/d stay at a per-map anchor for the coarse pass. Rendering knobs are
 * scaled down for the 128² sweep grid — at app defaults 14 000 points/frame
 * saturate most support cells to 1.0 and the entropy term goes blind. With
 * exposure 0.015 / fade 0.99 a cell's equilibrium is ≈1.5× its visits-per-frame,
 * so the density histogram stays graded and the metrics can discriminate.
 */
const CLIFFORD_DEJONG_BASE = {
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 260, // ≈2.6×the 1/(1-fade) convergence timescale at fade 0.99
  fluxGap: 5,
  dt: 1,
  primaryChannel: 0, // density histogram
  coverageThreshold: 0.04,
} as const;

// driftAmount 0 pins the coefficients: the kernel drifts them by default, and
// a moving figure would corrupt every structure/flux metric in the sweep.
const CLIFFORD_RENDER = {
  pointsPerFrame: 14000,
  exposure: 0.015,
  fade: 0.99,
  driftAmount: 0,
};

const CLIFFORD: SimSweepConfig = {
  slug: "clifford-dejong",
  artifactId: "clifford-dejong-clifford",
  ...CLIFFORD_DEJONG_BASE,
  baseParams: { map: "clifford", c: 1.0, d: 0.7, ...CLIFFORD_RENDER },
  axes: [
    { key: "a", values: linspace(-2.4, 2.4, 9, 2) },
    { key: "b", values: linspace(-2.4, 2.4, 9, 2) },
  ],
  // References mirror the shipped presets; veils carries the 2026-08-16
  // promoted coefficients (see docs/sweeps/clifford-dejong-interestingness.md).
  references: [
    { id: "classic", label: "Clifford classic", params: { map: "clifford", a: -1.4, b: 1.6, c: 1.0, d: 0.7, ...CLIFFORD_RENDER } },
    { id: "veils", label: "Clifford veils (promoted)", params: { map: "clifford", a: -1.8, b: -2.4, c: -1.0, d: 1.0, ...CLIFFORD_RENDER } },
    { id: "bloom", label: "Clifford bloom", params: { map: "clifford", a: -1.8, b: -2.0, c: -0.5, d: -0.9, ...CLIFFORD_RENDER } },
  ],
};

const DEJONG: SimSweepConfig = {
  slug: "clifford-dejong",
  artifactId: "clifford-dejong-dejong",
  ...CLIFFORD_DEJONG_BASE,
  baseParams: { map: "dejong", c: 2.4, d: -2.1, ...CLIFFORD_RENDER },
  axes: [
    { key: "a", values: linspace(-2.8, 2.8, 9, 2) },
    { key: "b", values: linspace(-2.8, 2.8, 9, 2) },
  ],
  // Swan and heart are the 2026-08-16 promotions that replaced the thin
  // web/scroll sets (0.435/0.262 — small off-centre line figures).
  references: [
    { id: "classic", label: "De Jong classic", params: { map: "dejong", a: 1.4, b: -2.3, c: 2.4, d: -2.1, ...CLIFFORD_RENDER } },
    { id: "swan", label: "De Jong swan (promoted)", params: { map: "dejong", a: 1.4, b: -2.8, c: 2.8, d: -1.87, ...CLIFFORD_RENDER } },
    { id: "heart", label: "De Jong heart (promoted)", params: { map: "dejong", a: 1.4, b: -2.8, c: 2.4, d: -2.1, ...CLIFFORD_RENDER } },
  ],
};

const SVENSSON: SimSweepConfig = {
  slug: "clifford-dejong",
  artifactId: "clifford-dejong-svensson",
  ...CLIFFORD_DEJONG_BASE,
  baseParams: { map: "svensson", c: 1.6, ...CLIFFORD_RENDER },
  axes: [
    { key: "a", values: linspace(-2.2, 2.2, 8, 2) },
    { key: "b", values: linspace(-2.2, 2.2, 8, 2) },
    // d scales the whole x term on Svensson, so it changes the figure's
    // character, not just its frame — worth a coarse axis of its own.
    { key: "d", values: [-6.56, -2.4, 0.9] },
  ],
  references: [
    { id: "drape", label: "Svensson drape", params: { map: "svensson", a: 1.4, b: 1.56, c: 1.4, d: -6.56, ...CLIFFORD_RENDER } },
    { id: "moth", label: "Svensson moth", params: { map: "svensson", a: 1.5, b: -1.8, c: 1.6, d: 0.9, ...CLIFFORD_RENDER } },
  ],
};

export const SWEEP_CONFIGS: Record<string, SimSweepConfig> = {
  "gray-scott": GRAY_SCOTT,
  boids: BOIDS,
  "lorenz-attractor": LORENZ,
  "clifford-dejong-clifford": CLIFFORD,
  "clifford-dejong-dejong": DEJONG,
  "clifford-dejong-svensson": SVENSSON,
};
