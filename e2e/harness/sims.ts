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
  /** Enum-valued params (neighbourhood, couplingMode, initialPattern) are swept
   * as strings, so an axis is not restricted to numbers. */
  values: (number | string | boolean)[];
}

export interface ReferenceSet {
  id: string;
  label: string;
  params: Params;
}

/**
 * Opt-in scoring path for sparse point-cloud sims (stage 63). The raw lag-1
 * metric stack is blind to rasterised dots — boids (2026-07-16) and Particle
 * Life (2026-08-23) both recorded it — so opted-in sims are scored on a
 * Gaussian-smoothed density field instead, plus a polarisation order
 * parameter where the kernel rasterises velocity channels. Field sims never
 * touch this path: no `pointCloud` block, byte-identical scoring.
 */
export interface PointCloudConfig {
  /** Gaussian blur support in cells each side (sigma = radius/2), toroidal.
   * Set at the scale of the sim's interaction/clustering radius. */
  blurRadius: number;
  /** Coverage threshold for the smoothed, max-normalised field. The raw
   * per-sim threshold is tuned for dot occupancy and misreads a smoothed
   * field (blur pushes some density into nearly every cell). */
  coverageThreshold: number;
  /** [vx, vy] channel indices for the velocity-coherence metric; omit for
   * sims that do not rasterise velocity. Channels are assumed to carry a
   * [-1, 1] channelRange, as boids does. */
  velocityChannels?: readonly [number, number];
}

/** Opt-in circular-statistics path for a phase channel normalised to [0, 1]. */
export interface PhaseConfig {
  channel: number;
  /** Optional channel/threshold selecting cells whose phase is defined. */
  occupancy?: { channel: number; threshold: number };
}

export interface MultiSnapshotConfig {
  /** Absolute kernel.step() counts before each frame A is captured. */
  warmupSteps: number[];
}

/**
 * Opt-in growth/criticality path (stage 146). Captures are taken at declared
 * fixed steps (sandpile, Ising) or at declared occupied-cell milestones (DLA),
 * so candidates are compared at equal simulated time or equal growth rather
 * than after an arbitrary warmup. Diagnostics never feed the score.
 */
export interface GrowthCriticalityConfig {
  methodVersion: "growth-criticality-v1";
  sampleSteps?: number[];
  milestones?: number[];
  stepCap?: number;
  /** Repeat horizon: absolute steps (fixed time) or a milestone (growth). */
  longHorizon: number;
  /** Second and larger resolutions for the finite-size check. */
  validationSizes: number[];
  seeds?: number[];
}

export interface SimSweepConfig {
  growthCriticality?: GrowthCriticalityConfig;
  reactionDiffusion?: { methodVersion: "rd-persistence-v1" };
  eca?: { methodVersion: "eca-spacetime-v1" };
  staticBoundary?: { methodVersion: "static-boundary-v1" };
  /** Opt-in two-channel sign geometry for signed fields stored as separate
   * magnitude channels (channel 0 stable, channel 1 chaotic). */
  signMix?: { methodVersion: "lyapunov-sign-v1"; stableChannel: number; chaoticChannel: number };
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
  /** Present only on sparse particle sims; see PointCloudConfig. */
  pointCloud?: PointCloudConfig;
  /** Present only when a kernel exposes a phase channel. */
  phase?: PhaseConfig;
  /** Present only when timing-sensitive trajectories need repeated scoring. */
  multiSnapshot?: MultiSnapshotConfig;
  /** Fixed params applied to every set in the sweep. */
  baseParams: Params;
  /** Swept axes; the sweep is their Cartesian product, unless `sets` is
   * present, in which case they only declare which keys vary and which values
   * each one visits (the report's columns and candidate ids read from here). */
  axes: SweepAxis[];
  /** Explicit set list, for a sweep whose points lie on a tied curve through
   * parameter space rather than on a grid. Two of Belousov-Zhabotinsky's three
   * diffusion rates move together along the line its presets share, so their
   * Cartesian product would spend most of a twelve-set budget off it. When
   * present this replaces the product; each entry is merged onto baseParams. */
  sets?: Params[];
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

/** Cartesian product of the axes into concrete param objects merged onto base,
 * or the explicit `sets` list where a config declares one. */
export function expandSweep(config: SimSweepConfig): Params[] {
  if (config.sets) return config.sets.map((set) => ({ ...config.baseParams, ...set }));
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
  // References mirror all seven shipped presets (src/app/presets.ts) so a
  // re-run reproduces their scores like-for-like. Worms and u-skate were never
  // previously scored (added to this list at the 70-gray-scott-rebaseline
  // stage); see docs/sweeps/ for the old/new comparison.
  references: [
    { id: "default-coral", label: "Default (Coral)", params: { Du: 0.2097, Dv: 0.105, F: 0.0545, k: 0.062, stepsPerFrame: 20 } },
    { id: "mitosis", label: "Mitosis", params: { Du: 0.2097, Dv: 0.105, F: 0.0367, k: 0.0649, stepsPerFrame: 20 } },
    { id: "worms", label: "Worms", params: { Du: 0.2097, Dv: 0.105, F: 0.054, k: 0.063, stepsPerFrame: 20 } },
    { id: "maze", label: "Maze", params: { Du: 0.2097, Dv: 0.105, F: 0.029, k: 0.057, stepsPerFrame: 20 } },
    { id: "spots", label: "Spots (promoted: dense lattice)", params: { Du: 0.2097, Dv: 0.105, F: 0.026, k: 0.0597, stepsPerFrame: 20 } },
    { id: "waves", label: "Waves (promoted: pulsing cells)", params: { Du: 0.2097, Dv: 0.105, F: 0.018, k: 0.0487, stepsPerFrame: 20 } },
    { id: "u-skate", label: "U-skate gliders", params: { Du: 0.2097, Dv: 0.105, F: 0.062, k: 0.0609, stepsPerFrame: 20 } },
  ],
};

// Stage 63: scored through the point-cloud path — smoothed density plus the
// polarisation order parameter over the rasterised velocity channels (2-3),
// which is where flocking "interest" actually lives. blurRadius 6 (sigma 3)
// sits between the separationRadius axis (5-12) and the smallest visualRadius
// (16), so a flock blurs into one graded blob without bridging separate
// flocks. obstacleLayout is pinned to "none": the kernel's default reef
// raster paints constant density AND constant pseudo-velocity tones into the
// state channels, which would feed a fixed vector bias into every candidate's
// coherence — the instrument is calibrated against the flock, not the rocks.
// (The 2026-07-16 sweep predates obstacles, so this also restores its
// conditions.)
const BOIDS: SimSweepConfig = {
  slug: "boids",
  primaryChannel: 0, // density (occupancy)
  gridWidth: 200,
  gridHeight: 200,
  warmupSteps: 220,
  fluxGap: 6,
  dt: 1,
  coverageThreshold: 0.001, // occupancy is sparse; any occupied cell counts
  // The smoothed coverageThreshold is set from a measured probe, not guessed:
  // at 0.25 of peak smoothed density the probed flocking regimes read 0.46-0.77
  // (inside the composite's coverage plateau) while a fully collapsed flock
  // reads ~0.07, so extreme concentration is penalised but ordinary flocks are
  // ranked on structure/entropy.
  pointCloud: { blurRadius: 6, coverageThreshold: 0.25, velocityChannels: [2, 3] },
  baseParams: { boidCount: 2500, maxSpeed: 16, alignment: 0.06, cohesion: 0.012, pointSize: 6, obstacleLayout: "none" },
  axes: [
    { key: "visualRadius", values: [16, 24, 32, 44, 56] },
    { key: "separation", values: [0.1, 0.2, 0.35, 0.55] },
    { key: "separationRadius", values: [5, 8, 12] },
  ],
  references: [
    { id: "balanced-flock", label: "Balanced flock", params: { boidCount: 2500, visualRadius: 36, separationRadius: 6, maxSpeed: 16, alignment: 0.06, cohesion: 0.012, separation: 0.2, pointSize: 6, obstacleLayout: "none" } },
    { id: "tight-flock", label: "Tight flock", params: { boidCount: 2500, visualRadius: 30, separationRadius: 5, maxSpeed: 20, alignment: 0.1, cohesion: 0.02, separation: 0.16, pointSize: 6, obstacleLayout: "none" } },
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
  // Five deterministic positions span three trail-memory windows. Each sample
  // starts from a fresh kernel, so this costs roughly five single-pair drives.
  multiSnapshot: { warmupSteps: [280, 420, 560, 700, 840] },
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


const LORENZ_142_BETA = [0.6, 1.4, 4.5, 7];
const LORENZ_142_RHO_BETA = [8, 16, 22, 26, 50, 54, 57, 60];
const LORENZ_142_SIGMA = [1.5, 4, 20, 28];
const LORENZ_142_RHO_SIGMA = [14, 20, 24, 30, 34, 48, 54, 60];
/** Refinement sets (presentation only) appended after the 64 dynamic sets. */
export const LORENZ_142_REFINEMENTS: Params[] = [
  { sigma: 20, beta: 2.6667, rho: 34 }, { sigma: 10, beta: 1.4, rho: 26 }, { sigma: 28, beta: 2.6667, rho: 34 },
].flatMap(base => [0.985, 0.997].flatMap(fade => [3, 12].map(stepsPerFrame => ({ ...base, stepsPerFrame, fade }))));
const LORENZ_142_SETS: Params[] = [
  ...LORENZ_142_BETA.flatMap(beta => LORENZ_142_RHO_BETA.map(rho => ({ sigma: 10, beta, rho }))),
  ...LORENZ_142_SIGMA.flatMap(sigma => LORENZ_142_RHO_SIGMA.map(rho => ({ sigma, beta: 2.6667, rho }))),
  ...LORENZ_142_REFINEMENTS,
];

const LORENZ_UNEXPLORED: SimSweepConfig = {
  ...LORENZ,
  artifactId: "sweep-142-lorenz-attractor",
  baseParams: { sigma: 10, rho: 28, beta: 2.6667, stepsPerFrame: 6, fade: 0.992 },
  axes: [
    { key: "beta", values: [...LORENZ_142_BETA, 2.6667] },
    { key: "sigma", values: [10, ...LORENZ_142_SIGMA] },
    { key: "rho", values: [...new Set([...LORENZ_142_RHO_BETA, ...LORENZ_142_RHO_SIGMA])].sort((a, b) => a - b) },
  ],
  sets: LORENZ_142_SETS,
  // Current shipped lorenz-attractor presets, copied from src/app/presets.ts.
  references: [
    { id: "142-current-classic", label: "Classic butterfly (shipped preset)", params: { sigma: 10, rho: 28, beta: 2.6667, stepsPerFrame: 8, fade: 0.985 } },
    { id: "142-current-wide-wings", label: "Wide wings (shipped preset)", params: { sigma: 10, rho: 35, beta: 2.6667, stepsPerFrame: 12, fade: 0.99 } },
    { id: "142-current-dense-wings", label: "Dense wings (shipped preset)", params: { beta: 2.6667, stepsPerFrame: 6, fade: 0.997, rho: 41.6, sigma: 14 } },
    { id: "142-current-fast-trace", label: "Fast trace (shipped preset)", params: { sigma: 14, rho: 32, beta: 3.1, stepsPerFrame: 20, fade: 0.975 } },
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

/**
 * Stage 148: c/d interactions around diverse a/b anchors. The historical
 * Clifford and De Jong sweeps pinned c/d and swept a/b; Svensson swept d only.
 * Each variant here visits 4 anchors x 4 c x 3 d = 48 explicit sets with the
 * same fixed render knobs as the historical configs (drift 0), so morphology
 * is screened apart from motion. Current shipped coefficients are re-measured
 * under new "148-current-*" ids; the historical reference rows stay untouched.
 */
export const ATTRACTOR_148_METHOD = "attractor-cd-interaction-v1";
export const CLIFFORD_RENDER_148 = CLIFFORD_RENDER;
/** Shipped morph render knobs from src/app/presets.ts; Clifford morph drifts at 0.35, De Jong morph overrides to 0.3. */
const MORPH_RENDER = { driftAmount: 0.35, driftSpeed: 0.5, fade: 0.985, exposure: 0.09, pointsPerFrame: 40000 };

function attractorInteractionSets(
  map: string,
  anchors: readonly (readonly [number, number])[],
  cValues: readonly number[],
  dValues: readonly number[],
): Params[] {
  const sets: Params[] = [];
  for (const [a, b] of anchors) {
    for (const c of cValues) {
      for (const d of dValues) sets.push({ map, a, b, c, d });
    }
  }
  return sets;
}

function attractorInteractionConfig(
  variant: "clifford" | "dejong" | "svensson",
  anchors: readonly (readonly [number, number])[],
  cValues: readonly number[],
  dValues: readonly number[],
  references: ReferenceSet[],
): SimSweepConfig {
  return {
    slug: "clifford-dejong",
    artifactId: `sweep-148-clifford-dejong-${variant}`,
    ...CLIFFORD_DEJONG_BASE,
    baseParams: { ...CLIFFORD_RENDER },
    axes: [
      { key: "a", values: anchors.map(([a]) => a) },
      { key: "c", values: [...cValues] },
      { key: "d", values: [...dValues] },
    ],
    sets: attractorInteractionSets(variant, anchors, cValues, dValues),
    references,
  };
}

const ATTRACTOR_148_CLIFFORD = attractorInteractionConfig(
  "clifford",
  [[-1.4, 1.6], [-1.8, -2.4], [1.7, 1.3], [-2.2, 2.0]],
  [-1.6, -0.6, 0.6, 1.6],
  [-1.4, 0.3, 1.4],
  [
    { id: "148-current-clifford-classic", label: "Clifford classic (shipped)", params: { map: "clifford", a: -1.4, b: 1.6, c: 1.0, d: 0.7, ...CLIFFORD_RENDER } },
    { id: "148-current-clifford-veils", label: "Clifford veils (shipped)", params: { map: "clifford", a: -1.8, b: -2.4, c: -1.0, d: 1.0, ...CLIFFORD_RENDER } },
    { id: "148-current-clifford-bloom", label: "Clifford bloom (shipped)", params: { map: "clifford", a: -1.8, b: -2.0, c: -0.5, d: -0.9, ...CLIFFORD_RENDER } },
    // Shipped morph preset, measured with its own drift/exposure/fade/point count (not the screening knobs).
    { id: "148-current-clifford-morph", label: "Clifford morph (shipped)", params: { map: "clifford", a: -1.8, b: -2.4, c: -1.0, d: 1.0, ...MORPH_RENDER } },
  ],
);

const ATTRACTOR_148_DEJONG = attractorInteractionConfig(
  "dejong",
  [[1.4, -2.3], [1.4, -2.8], [-2.0, 1.2], [2.2, 2.5]],
  [-2.8, -1.2, 1.2, 2.8],
  [-2.6, -0.8, 1.4],
  [
    { id: "148-current-dejong-classic", label: "De Jong classic (shipped)", params: { map: "dejong", a: 1.4, b: -2.3, c: 2.4, d: -2.1, ...CLIFFORD_RENDER } },
    { id: "148-current-dejong-swan", label: "De Jong swan (shipped)", params: { map: "dejong", a: 1.4, b: -2.8, c: 2.8, d: -1.87, ...CLIFFORD_RENDER } },
    { id: "148-current-dejong-heart", label: "De Jong heart (shipped)", params: { map: "dejong", a: 1.4, b: -2.8, c: 2.4, d: -2.1, ...CLIFFORD_RENDER } },
    { id: "148-current-dejong-morph", label: "De Jong morph (shipped)", params: { map: "dejong", a: 1.4, b: -2.8, c: 2.4, d: -2.1, ...MORPH_RENDER, driftAmount: 0.3 } },
  ],
);

const ATTRACTOR_148_SVENSSON = attractorInteractionConfig(
  "svensson",
  [[1.4, 1.56], [1.5, -1.8], [-1.7, 1.9], [2.0, -0.9]],
  [-2.0, -0.8, 0.7, 2.0],
  [-3.5, -1.2, 1.8],
  [
    { id: "148-current-svensson-drape", label: "Svensson drape (shipped)", params: { map: "svensson", a: 1.4, b: 1.56, c: 1.4, d: -6.56, ...CLIFFORD_RENDER } },
    { id: "148-current-svensson-moth", label: "Svensson moth (shipped)", params: { map: "svensson", a: 1.5, b: -1.8, c: 1.6, d: 0.9, ...CLIFFORD_RENDER } },
  ],
);

/*
 * ---------------------------------------------------------------------------
 * Stage 57 (2026-08-23): the twelve remaining dynamic kernels.
 *
 * Three conventions run through the configs below; each write-up under
 * docs/sweeps/ restates the ones that bind its sim.
 *
 * 1. coverageThreshold is per-sim because "background" is not a fixed level.
 *    A reaction-diffusion medium is nonzero nearly everywhere, so a low
 *    threshold reports coverage ≈0.97, which the composite's coverageFactor
 *    reads as a saturated field and drives the score to near zero. The
 *    threshold is set where each sim's field actually separates figure from
 *    ground (0.5 for a dense or two-state field, 0.05-0.25 for a sparse one).
 *    Same convention as gray-scott's 0.1 and boids' 0.001 — it is a per-sim
 *    lens setting, not a change to the metric.
 * 2. Population parameters (agentCount, particleCount) are pinned at a
 *    sweep-scale value in baseParams AND in the references, because the sweep
 *    grid is smaller than the app's compute grid and agents-per-cell is what
 *    the dynamics respond to. The consequence is stated plainly in each
 *    write-up: presets that differ only in population are not distinguished
 *    by this sweep and cannot be promoted on its evidence.
 * 3. Every set pins any RNG seed the kernel accepts. DLA is the only one of
 *    the twelve that reaches for Math.random when no seed is supplied, so its
 *    configs would not reproduce without it.
 * ---------------------------------------------------------------------------
 */

// Continuous CA. mu/sigma set which blob sizes are stable, so they are the
// axes; muDrift stays at the shipped 0.015 (it keeps spots splitting and
// travelling rather than freezing, which is what the flux term reads) and
// radius stays at 8 so swept sets and references share one organism scale.
const LENIA: SimSweepConfig = {
  slug: "lenia",
  primaryChannel: 0, // Mass
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 260, // blobs condense out of the seeded soup by ~200 at dt 0.1
  fluxGap: 8,
  dt: 1,
  coverageThreshold: 0.1,
  baseParams: { muDrift: 0.015, dt: 0.1, radius: 8, stepsPerFrame: 1, seed: 0 },
  axes: [
    { key: "mu", values: linspace(0.1, 0.24, 6, 3) },
    { key: "sigma", values: [0.01, 0.016, 0.022, 0.028] },
  ],
  references: [
    { id: "orbium-soup", label: "Drifting soup", params: { mu: 0.15, sigma: 0.017, muDrift: 0.015, dt: 0.1, radius: 8, stepsPerFrame: 1, seed: 0 } },
    { id: "coral-growth", label: "Still spots", params: { mu: 0.15, sigma: 0.017, muDrift: 0, dt: 0.1, radius: 8, stepsPerFrame: 1, seed: 0 } },
    { id: "geminium-storm", label: "Geminium storm", params: { mu: 0.15, sigma: 0.017, muDrift: 0.02, dt: 0.1, radius: 10, stepsPerFrame: 1, seed: 0 } },
  ],
};

// Excitable medium. feed/kill is the Pearson-style control plane here too: the
// kernel's own note says damping above ~0.04 collapses the medium to a fixed
// point, so the kill axis brackets that cliff rather than ranging to the
// slider maximum.
const BELOUSOV_ZHABOTINSKY: SimSweepConfig = {
  slug: "belousov-zhabotinsky",
  primaryChannel: 0, // Activator
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 400, // spirals need ~300 steps to organise out of the seed
  fluxGap: 8,
  dt: 1,
  // The activator is nonzero across nearly the whole medium; 0.5 splits
  // wavefront from trough instead of reporting "everything is covered".
  coverageThreshold: 0.5,
  baseParams: { diffusionA: 0.18, diffusionB: 0.08, diffusionC: 0.035, stepsPerFrame: 1 },
  axes: [
    { key: "feed", values: linspace(0.008, 0.05, 8, 4) },
    { key: "kill", values: [0.008, 0.016, 0.024, 0.032, 0.044] },
  ],
  references: [
    { id: "spiral-waves", label: "Spiral waves", params: { diffusionA: 0.18, diffusionB: 0.08, diffusionC: 0.035, feed: 0.02, kill: 0.02, stepsPerFrame: 1 } },
    { id: "soft-rings", label: "Soft rings", params: { diffusionA: 0.14, diffusionB: 0.06, diffusionC: 0.055, feed: 0.012, kill: 0.03, stepsPerFrame: 1 } },
    { id: "fast-catalyst", label: "Fast catalyst", params: { diffusionA: 0.24, diffusionB: 0.11, diffusionC: 0.08, feed: 0.03, kill: 0.03, stepsPerFrame: 3 } },
  ],
};

// Stage 81: the three diffusion rates the feed/kill sweep above held fixed, at
// Spiral waves' feed/kill. A second entry rather than extra axes on the config
// above, so the feed/kill ranking stands and neither sweep's set count depends
// on the other's. Every lens setting is copied from it unchanged, which is what
// lets the same three references re-score to the 2026-08-23 figures and prove
// nothing but the diffusion triple moved.
//
// The three shipped presets are NOT collinear in (A, B, C) — see the appendix
// in docs/sweeps/belousov-zhabotinsky-interestingness.md — but their (A, B)
// projections lie exactly on B = A/2 - 0.01, all three of them. That line is
// the sweep's spine, walked at Spiral waves' catalyst rate; the two off-line
// probes put the other two presets' catalyst rates at Spiral waves' own (A, B),
// which is the one direction the spine cannot reach.
const BELOUSOV_ZHABOTINSKY_DIFFUSION: SimSweepConfig = {
  slug: "belousov-zhabotinsky",
  artifactId: "belousov-zhabotinsky-diffusion",
  primaryChannel: 0,
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 400,
  fluxGap: 8,
  dt: 1,
  coverageThreshold: 0.5,
  baseParams: { feed: 0.02, kill: 0.02, stepsPerFrame: 1 },
  axes: [
    { key: "diffusionA", values: [0.06, 0.09, 0.12, 0.14, 0.18, 0.21, 0.24, 0.27, 0.3, 0.34] },
    { key: "diffusionB", values: [0.02, 0.035, 0.05, 0.06, 0.08, 0.095, 0.11, 0.125, 0.14, 0.16] },
    { key: "diffusionC", values: [0.035, 0.055, 0.08] },
  ],
  sets: [
    { diffusionA: 0.06, diffusionB: 0.02, diffusionC: 0.035 },
    { diffusionA: 0.09, diffusionB: 0.035, diffusionC: 0.035 },
    { diffusionA: 0.12, diffusionB: 0.05, diffusionC: 0.035 },
    { diffusionA: 0.14, diffusionB: 0.06, diffusionC: 0.035 }, // Soft rings' (A, B)
    { diffusionA: 0.18, diffusionB: 0.08, diffusionC: 0.035 }, // Spiral waves' triple
    { diffusionA: 0.21, diffusionB: 0.095, diffusionC: 0.035 },
    { diffusionA: 0.24, diffusionB: 0.11, diffusionC: 0.035 }, // Fast catalyst's (A, B)
    { diffusionA: 0.27, diffusionB: 0.125, diffusionC: 0.035 },
    { diffusionA: 0.3, diffusionB: 0.14, diffusionC: 0.035 },
    { diffusionA: 0.34, diffusionB: 0.16, diffusionC: 0.035 },
    { diffusionA: 0.18, diffusionB: 0.08, diffusionC: 0.055 }, // off-line: Soft rings' C
    { diffusionA: 0.18, diffusionB: 0.08, diffusionC: 0.08 },  // off-line: Fast catalyst's C
  ],
  references: BELOUSOV_ZHABOTINSKY.references,
};

// Stigmergy. Swept on the sensing geometry, which is what decides whether the
// network comes out as filaments, fans, or a fine web. 256² with agent counts
// scaled by (256/384)² ≈ 0.44 keeps agents-per-cell at the app's ratio — the
// app pins physarum to its own compute scale, so density, not raw count, is
// the transferable quantity.
const PHYSARUM: SimSweepConfig = {
  slug: "physarum",
  primaryChannel: 0, // Trail
  gridWidth: 256,
  gridHeight: 256,
  warmupSteps: 300,
  fluxGap: 6,
  dt: 1,
  coverageThreshold: 0.1,
  baseParams: { agentCount: 14000, moveSpeed: 1, depositAmount: 0.22, evaporation: 0.9, stepsPerFrame: 1, seed: 0 },
  axes: [
    { key: "sensorAngle", values: [12, 22.5, 38, 60] },
    { key: "sensorDistance", values: [5, 9, 17] },
    { key: "turnSpeed", values: [12, 22.5, 40] },
  ],
  references: [
    { id: "veins", label: "Veins", params: { agentCount: 14000, sensorAngle: 22.5, sensorDistance: 9, turnSpeed: 22.5, moveSpeed: 1, depositAmount: 0.24, evaporation: 0.9, stepsPerFrame: 1, seed: 0 } },
    { id: "coral-fans", label: "Coral fans", params: { agentCount: 11500, sensorAngle: 15, sensorDistance: 17, turnSpeed: 14, moveSpeed: 1.35, depositAmount: 0.2, evaporation: 0.94, stepsPerFrame: 1, seed: 0 } },
    { id: "filigree-web", label: "Filigree web", params: { agentCount: 26500, sensorAngle: 38, sensorDistance: 5, turnSpeed: 34, moveSpeed: 0.8, depositAmount: 0.12, evaporation: 0.96, stepsPerFrame: 1, seed: 0 } },
  ],
};

// Shelved from the gallery (registry.ts SHELVED_SLUGS) but the kernel is live,
// so the driver reaches it through its module path. J/K are the classifying
// pair in the Swarmalators literature — the five named regimes are corners of
// that plane — so they are the axes and everything else holds at the default.
const SWARMALATORS: SimSweepConfig = {
  slug: "swarmalators",
  primaryChannel: 0, // Density
  phase: { channel: 1, occupancy: { channel: 0, threshold: 0.05 } },
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 250,
  fluxGap: 6,
  dt: 1,
  coverageThreshold: 0.05, // a rasterised 384-particle swarm is sparse
  baseParams: { particleCount: 384, A: 1, B: 18, frequencySpread: 0, noise: 0, timestep: 0.05, seed: 1 },
  axes: [
    { key: "J", values: [-1, -0.5, 0.1, 0.5, 1] },
    { key: "K", values: [-1.5, -0.75, -0.1, 0.5, 1] },
  ],
  references: [
    { id: "static-sync", label: "Static sync", params: { particleCount: 384, A: 1, B: 18, J: 0.1, K: 1, frequencySpread: 0, noise: 0, timestep: 0.05, seed: 1 } },
    { id: "static-async", label: "Static async", params: { particleCount: 384, A: 1, B: 18, J: 0.1, K: -1, frequencySpread: 0, noise: 0, timestep: 0.05, seed: 1 } },
    { id: "static-phase-wave", label: "Static phase wave", params: { particleCount: 384, A: 1, B: 18, J: 1, K: 0, frequencySpread: 0, noise: 0, timestep: 0.05, seed: 1 } },
    { id: "splintered-phase-wave", label: "Splintered phase wave", params: { particleCount: 384, A: 1, B: 18, J: 1, K: -0.1, frequencySpread: 0, noise: 0, timestep: 0.05, seed: 1 } },
    { id: "active-phase-wave", label: "Active phase wave", params: { particleCount: 384, A: 1, B: 18, J: 1, K: -0.75, frequencySpread: 0, noise: 0, timestep: 0.05, seed: 1 } },
    { id: "restless-mix", label: "Restless mix", params: { particleCount: 384, A: 1, B: 18, J: 1, K: -0.6, frequencySpread: 0.6, noise: 0.35, timestep: 0.05, seed: 1 } },
  ],
};

// Self-organised criticality. 256² so the relaxed pile still fits inside the
// grid at the shipped grain counts (the pile radius grows as √N; at 128² the
// larger presets would topple grains off the edge and the fractal terraces
// would be clipped rather than ranked).
const ABELIAN_SANDPILE: SimSweepConfig = {
  slug: "abelian-sandpile",
  primaryChannel: 0, // Stable height
  gridWidth: 256,
  gridHeight: 256,
  warmupSteps: 200,
  fluxGap: 4,
  dt: 1,
  coverageThreshold: 0.25, // above the lowest of the four stable heights
  baseParams: { topplesPerStep: 120000 },
  axes: [
    { key: "initialPile", values: [25000, 60000, 120000, 250000] },
    { key: "toppleThreshold", values: [4, 5, 6, 8] },
    { key: "grainsPerStep", values: [1, 32] },
  ],
  references: [
    { id: "classic-critical", label: "Classic critical", params: { initialPile: 100000, toppleThreshold: 4, grainsPerStep: 1, topplesPerStep: 50000 } },
    { id: "fast-avalanches", label: "Fast avalanches", params: { initialPile: 250000, toppleThreshold: 4, grainsPerStep: 16, topplesPerStep: 150000 } },
    { id: "high-threshold", label: "High threshold", params: { initialPile: 350000, toppleThreshold: 8, grainsPerStep: 8, topplesPerStep: 120000 } },
  ],
};

// Three-state CA. Keep coverage above every refractory value so it counts
// firing cells only; the other metrics still measure the rendered afterglow.
const BRIANS_BRAIN: SimSweepConfig = {
  slug: "brians-brain",
  primaryChannel: 0, // State
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 120, // the transient burns off by ~80 steps and settles to waves
  fluxGap: 4,
  dt: 1,
  coverageThreshold: 0.99, // counts firing only for all sets and references
  baseParams: { birthCount: 2 },
  axes: [
    { key: "dyingValue", values: [0.1, 0.3, 0.5, 0.7, 0.9] },
    { key: "seedDensity", values: [0.12, 0.36] },
  ],
  references: [
    { id: "classic", label: "Classic waves", params: { birthCount: 2, seedDensity: 0.22, dyingValue: 0.5 } },
    { id: "sparse-spirals", label: "Sparse spirals", params: { birthCount: 2, seedDensity: 0.12, dyingValue: 0.62 } },
    { id: "storm", label: "Storm", params: { birthCount: 2, seedDensity: 0.36, dyingValue: 0.42 } },
  ],
};

// Cyclic CA. The state channel is a cycle index normalised to [0, 1], so
// coverage at 0.5 reads as "cells in the upper half of the cycle" — a phase
// balance, not a fill fraction. It stays near 0.5 for any live regime, which
// is the point: it keeps coverageFactor out of the way so structure and
// entropy do the ranking.
const CYCLIC_CA: SimSweepConfig = {
  slug: "cyclic-ca",
  primaryChannel: 0, // State
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 200, // droplets have resolved into spirals or demons by ~150
  fluxGap: 4,
  dt: 1,
  coverageThreshold: 0.5,
  baseParams: { neighbourhood: "vonNeumann", stepsPerFrame: 1, seed: 0 },
  axes: [
    { key: "states", values: [10, 11, 12, 13, 14, 15, 16] },
    { key: "threshold", values: [1, 2] },
  ],
  references: [
    { id: "demons", label: "Demons", params: { states: 14, threshold: 1, neighbourhood: "moore", stepsPerFrame: 1, seed: 0 } },
    { id: "turbulence", label: "Turbulence (promoted: unfrozen)", params: { states: 8, threshold: 2, neighbourhood: "moore", stepsPerFrame: 1, seed: 0 } },
    { id: "crystal-lattice", label: "Crystal lattice", params: { states: 12, threshold: 2, neighbourhood: "vonNeumann", stepsPerFrame: 1, seed: 0 } },
  ],
};

// Life-like CA. Birth stays at B3 (moving it leaves the Life-like family
// altogether and the shipped presets are all B3); the survival window and the
// seed density are what separate Conway from the maze and dense-ash regimes.
const GAME_OF_LIFE: SimSweepConfig = {
  slug: "game-of-life",
  primaryChannel: 0, // Alive
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 200, // long enough for the soup to burn down to its ash
  fluxGap: 4,
  dt: 1,
  coverageThreshold: 0.1,
  baseParams: { birthMin: 3, birthMax: 3, sparkRate: 0.1, ageShading: true },
  axes: [
    { key: "surviveMin", values: [1, 2, 3] },
    { key: "surviveMax", values: [3, 4, 5] },
    { key: "seedDensity", values: [0.05, 0.12, 0.2, 0.28, 0.4] },
  ],
  references: [
    { id: "conway", label: "Conway", params: { birthMin: 3, birthMax: 3, surviveMin: 2, surviveMax: 3, seedDensity: 0.28, sparkRate: 0.1, ageShading: true } },
    { id: "maze", label: "Maze-like", params: { birthMin: 3, birthMax: 3, surviveMin: 1, surviveMax: 5, seedDensity: 0.05, sparkRate: 0.1, ageShading: true } },
    { id: "dense-ash", label: "Dense ash (promoted: denser seed)", params: { birthMin: 3, birthMax: 3, surviveMin: 2, surviveMax: 3, seedDensity: 0.4, sparkRate: 0.1, ageShading: true } },
  ],
};

// Statistical physics. The spin field is two-valued, so its histogram can only
// fill 2 of the 32 entropy bins and the detail term is pinned near 0.2 for
// every set — the ranking here is carried almost entirely by structure and
// flux, which is the correct reading for a domain-coarsening model.
const ISING_MODEL: SimSweepConfig = {
  slug: "ising-model",
  primaryChannel: 0, // Spin
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 300,
  fluxGap: 4,
  dt: 1,
  coverageThreshold: 0.5, // fraction of up spins on a binary field
  baseParams: { coupling: 1, sweepsPerStep: 0.5, initialState: "random", seed: 7 },
  axes: [
    { key: "externalField", values: [0.02, 0.05, 0.08, 0.11, 0.14, 0.17, 0.2] },
    { key: "temperature", values: [1.8, 2.1, 2.4] },
  ],
  references: [
    { id: "critical", label: "Critical domains", params: { temperature: 2.269, coupling: 1, externalField: 0, sweepsPerStep: 0.5, initialState: "random", seed: 7 } },
    { id: "cold-quench", label: "Cold quench", params: { temperature: 0.7, coupling: 1, externalField: 0, sweepsPerStep: 0.8, initialState: "random", seed: 7 } },
    { id: "hot-noise", label: "Hot noise", params: { temperature: 4.5, coupling: 1, externalField: 0, sweepsPerStep: 1, initialState: "random", seed: 7 } },
    { id: "field-sweep", label: "Positive field", params: { temperature: 1.8, coupling: 1, externalField: 0.02, sweepsPerStep: 0.5, initialState: "random", seed: 7 } },
  ],
};

// Growth model with a terminal state: once the cluster reaches the spawn ring's
// grid limit, walkers spawn on top of it and nothing more sticks. warmup 500
// puts every set past that point, including the slow low-stickiness ones, so
// temporal flux is 0 across the board and liveliness is a constant 0.85. That is
// deliberate — the ranking is of final cluster morphology, and a flux term would
// otherwise just measure which sets had not finished growing yet.
const DIFFUSION_LIMITED_AGGREGATION: SimSweepConfig = {
  slug: "diffusion-limited-aggregation",
  primaryChannel: 0, // Cluster
  gridWidth: 192,
  gridHeight: 192,
  warmupSteps: 500,
  fluxGap: 6,
  dt: 1,
  coverageThreshold: 0.05,
  // seed is mandatory here: this is the only one of the twelve that falls back
  // to Math.random when none is supplied, which would break reproducibility.
  baseParams: { walkersPerStep: 64, maxWalkSteps: 400, seed: 7 },
  axes: [
    { key: "stickiness", values: [0.15, 0.3, 0.5, 0.75, 1] },
    { key: "spawnRadius", values: [0.03, 0.06, 0.12] },
    { key: "seedCount", values: [1, 4, 12] },
  ],
  references: [
    { id: "branching", label: "Branching", params: { walkersPerStep: 64, maxWalkSteps: 400, spawnRadius: 0.06, stickiness: 1, seedCount: 1, seed: 7 } },
    { id: "dense-coral", label: "Dense coral (promoted: low stickiness)", params: { walkersPerStep: 64, maxWalkSteps: 400, spawnRadius: 0.06, stickiness: 0.15, seedCount: 4, seed: 7 } },
    { id: "multi-seed", label: "Multi-seed", params: { walkersPerStep: 64, maxWalkSteps: 400, spawnRadius: 0.06, stickiness: 0.8, seedCount: 8, seed: 7 } },
  ],
};

// Synchronisation. The single channel is a phase, which wraps: a cell at 0.99
// and one at 0.01 are neighbours on the circle but maximally distant to the
// linear metrics. Autocorrelation and flux therefore read a wrap-around
// boundary as a discontinuity, which flatters regimes that happen to park their
// wavefronts away from 0. Scores rank within this sim only; a circular-statistics
// metric is the right instrument and is not in this stage's scope.
const KURAMOTO_OSCILLATORS: SimSweepConfig = {
  slug: "kuramoto-oscillators",
  primaryChannel: 0, // Phase
  phase: { channel: 0 },
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 400,
  fluxGap: 6,
  dt: 1,
  coverageThreshold: 0.5,
  baseParams: { noise: 0.015, timestep: 0.045, initialPattern: "vortices", seed: 1 },
  axes: [
    { key: "coupling", values: [0.6, 1.2, 1.8, 3.2, 4.6] },
    { key: "frequencySpread", values: [0.1, 0.3, 0.45, 0.8] },
    { key: "couplingMode", values: ["local", "global"] },
  ],
  references: [
    { id: "local-waves", label: "Local phase waves", params: { coupling: 1.8, frequencySpread: 0.45, timestep: 0.045, couplingMode: "local", initialPattern: "waves", noise: 0.015, seed: 1 } },
    { id: "vortex-field", label: "Vortex field", params: { coupling: 3.2, frequencySpread: 0.18, timestep: 0.04, couplingMode: "local", initialPattern: "vortices", noise: 0.005, seed: 1 } },
    { id: "global-threshold", label: "Global threshold", params: { coupling: 1.1, frequencySpread: 0.55, timestep: 0.055, couplingMode: "global", initialPattern: "random", noise: 0.01, seed: 1 } },
    { id: "global-lock", label: "Global lock", params: { coupling: 4.2, frequencySpread: 0.3, timestep: 0.05, couplingMode: "global", initialPattern: "random", noise: 0, seed: 1 } },
  ],
};

// Particle sim, and the same instrument problem the 2026-07-16 write-up
// recorded for boids: a rasterised point cloud carries almost no lag-1 spatial
// autocorrelation, so the structure term — 55% of the composite — reads ~0 for
// every set and the ranking collapses onto coverage. particleCount is pinned at
// 3000 (the shipped presets run 5000-12000 on a 640² grid; 3000 on 128² is the
// matching order of density) so the axes are compared at one population.
// Stage 63: scored through the point-cloud path — the 2026-08-23 write-up's
// own follow-up spec ("a Gaussian blur at the interaction radius before the
// metrics run"). blurRadius 8 (sigma 4) sits at rmin (12) scale, well under
// the rmax axis (16-32), so intra-cluster texture blurs to a graded blob but
// distinct clusters stay distinct. No velocityChannels: this kernel
// rasterises species colour only.
const PARTICLE_LIFE: SimSweepConfig = {
  slug: "particle-life",
  primaryChannel: 0, // Red species density
  gridWidth: 128,
  gridHeight: 128,
  warmupSteps: 150,
  fluxGap: 6,
  dt: 1,
  coverageThreshold: 0.05,
  // rmin repulsion spreads particles across the whole grid, so the smoothed
  // field is nonzero nearly everywhere and low thresholds read coverage 1.0
  // (which the composite's coverageFactor zeroes). A measured probe puts the
  // figure/ground split at half of peak density: at 0.5 the probed regimes
  // read 0.16-0.82, inside the composite's coverage plateau.
  pointCloud: { blurRadius: 8, coverageThreshold: 0.5 },
  baseParams: { particleCount: 3000, species: 5, rmin: 12, friction: 0.7, seed: 0 },
  axes: [
    { key: "rmax", values: [16, 24, 32] },
    { key: "forceScale", values: [25, 60, 110] },
    { key: "matrixBias", values: [-0.15, 0.05, 0.25] },
  ],
  references: [
    { id: "cells", label: "Cells", params: { particleCount: 3000, species: 5, rmax: 40, rmin: 12, forceScale: 45, friction: 0.7, matrixBias: 0.08, seed: 0 } },
    { id: "chasers", label: "Chasers", params: { particleCount: 3000, species: 6, rmax: 48, rmin: 14, forceScale: 85, friction: 0.2, matrixBias: 0, seed: 0 } },
    { id: "gas-clouds", label: "Gas clouds", params: { particleCount: 3000, species: 4, rmax: 30, rmin: 8, forceScale: 22, friction: 0.45, matrixBias: -0.05, seed: 0 } },
  ],
};

export const MANDELBROT_ANCHORS = [
  { id: "whole-set", centerX: -0.5, centerY: 0, zoom: 1 },
  { id: "seahorse-valley", centerX: -0.75, centerY: 0.047, zoom: 18 },
  { id: "spiral-hub", centerX: -0.761574, centerY: -0.0847596, zoom: 96 },
];

export const MANDELBROT_REFINEMENT_CENTRES = [
  { centerX: -0.765324, centerY: -0.0885096, zoom: 288 },
  { centerX: -0.14, centerY: -0.36, zoom: 2.2 },
  { centerX: -0.77, centerY: 0.067, zoom: 54 },
];

const MANDELBROT_BOUNDARY: SimSweepConfig = {
  slug: "mandelbrot", artifactId: "sweep-137-mandelbrot",
  staticBoundary: { methodVersion: "static-boundary-v1" },
  primaryChannel: 0, gridWidth: 128, gridHeight: 128,
  warmupSteps: 0, fluxGap: 0, dt: 1, coverageThreshold: 0,
  baseParams: { maxIterations: 512, autoIterations: true, palettePhase: 0, cycleSpeed: 0 },
  axes: ["centerX", "centerY", "zoom"].map(key => ({ key, values: [] })),
  sets: [...MANDELBROT_ANCHORS.flatMap(anchor => [1.2, 1.6, 2.2, 3].flatMap(factor =>
    [-0.12, 0.12].flatMap(dx => [-0.12, 0.12].map(dy => ({
      centerX: Number((anchor.centerX + dx * 3 / anchor.zoom).toFixed(12)),
      centerY: Number((anchor.centerY + dy * 3 / anchor.zoom).toFixed(12)),
      zoom: Number((anchor.zoom * factor).toFixed(6)),
    }))),
  )), ...MANDELBROT_REFINEMENT_CENTRES.flatMap(anchor => [1.15, 1.45].flatMap(factor =>
    [-0.06, 0.06].flatMap(dx => [-0.06, 0.06].map(dy => ({
      centerX: Number((anchor.centerX + dx * 3 / anchor.zoom).toFixed(12)),
      centerY: Number((anchor.centerY + dy * 3 / anchor.zoom).toFixed(12)),
      zoom: Number((anchor.zoom * factor).toFixed(6)),
    }))),
  ))],
  references: [
    { id: "137-current-default", label: "Kernel default (motion disabled)", params: { centerX: -0.5, centerY: 0, zoom: 1, maxIterations: 128, autoIterations: true, palettePhase: 0, cycleSpeed: 0 } },
    ...MANDELBROT_ANCHORS.map((anchor, i) => ({
      id: `137-current-${anchor.id}`, label: `${anchor.id} (motion disabled)`,
      params: { centerX: anchor.centerX, centerY: anchor.centerY, zoom: anchor.zoom, maxIterations: [128, 256, 384][i], autoIterations: true, palettePhase: 0, cycleSpeed: 0 },
    })),
  ],
};

const JULIA_REFINED_CONSTANTS = [
  { cRe: -0.44, cIm: 0.56 },
  { cRe: -0.36, cIm: 0.56 },
  { cRe: -0.36, cIm: 0.64 },
  { cRe: -0.83, cIm: 0.141 },
  { cRe: -0.153, cIm: 0.715 },
  { cRe: -0.82, cIm: 0.185 },
];

const JULIA_CONNECTIVITY: SimSweepConfig = {
  slug: "julia-set", artifactId: "sweep-139-julia-set",
  staticBoundary: { methodVersion: "static-boundary-v1" },
  primaryChannel: 0, gridWidth: 128, gridHeight: 128,
  warmupSteps: 0, fluxGap: 0, dt: 1, coverageThreshold: 0,
  baseParams: { centerX: 0, centerY: 0, zoom: 0.85, maxIterations: 512,
    autoIterations: false, palettePhase: 0, cycleSpeed: 0 },
  axes: ["cRe", "cIm", "zoom"].map(key => ({ key, values: [] })),
  sets: [
    ...[
      { re: [-0.44, -0.42, -0.38, -0.36], im: [0.56, 0.58, 0.62, 0.64] },
      { re: [-0.83, -0.81, -0.79, -0.77], im: [0.141, 0.151, 0.161, 0.171] },
      { re: [-0.153, -0.133, -0.113, -0.093], im: [0.715, 0.735, 0.755, 0.775] },
      { re: [-0.82, -0.8, -0.78, -0.76], im: [0.185, 0.195, 0.205, 0.215] },
    ].flatMap(region => region.re.flatMap(cRe => region.im.map(cIm => ({ cRe, cIm })))),
    ...JULIA_REFINED_CONSTANTS.flatMap(c => [1, 1.3, 1.7, 2.2].map(zoom => ({ ...c, zoom }))),
  ],
  references: [
    { id: "139-current-default", label: "Kernel default (phase/cycle disabled)", params: { cRe: -0.4, cIm: 0.6, centerX: 0, centerY: 0, zoom: 1.45, maxIterations: 180, autoIterations: true, palettePhase: 0, cycleSpeed: 0 } },
    { id: "139-current-dendrite", label: "Dendrite seed (phase/cycle disabled)", params: { cRe: -0.8, cIm: 0.156, centerX: 0, centerY: 0, zoom: 1, maxIterations: 128, autoIterations: true, palettePhase: 0, cycleSpeed: 0 } },
    { id: "139-current-rabbit", label: "Douady rabbit (phase/cycle disabled)", params: { cRe: -0.123, cIm: 0.745, centerX: 0, centerY: 0, zoom: 1.15, maxIterations: 220, autoIterations: true, palettePhase: 0, cycleSpeed: 0 } },
  ],
};

/** Every finite sequence enum the kernel schema exposes, in schema order. */
export const MARKUS_SEQUENCES = ["AB", "AABB", "AAB", "ABB", "AABAB", "AAAABBBBBB"] as const;

/** Eight views per sequence around the two shipped views (Zircon Zity at
 * 3,3 zoom 1; Woven boundary at 3.48,3.64 zoom 4.5). */
export const MARKUS_COARSE_VIEWS = [
  { centerX: 3, centerY: 3, zoom: 1 },
  { centerX: 3, centerY: 3, zoom: 1.6 },
  { centerX: 3.3, centerY: 3.3, zoom: 2.4 },
  { centerX: 2.7, centerY: 3.3, zoom: 2.4 },
  { centerX: 3.48, centerY: 3.64, zoom: 4.5 },
  { centerX: 3.48, centerY: 3.64, zoom: 2.8 },
  { centerX: 3.36, centerY: 3.52, zoom: 4.5 },
  { centerX: 3.6, centerY: 3.76, zoom: 4.5 },
] as const;

/** Second-pass views, chosen from the coarse ranking and appended after it. */
export const MARKUS_REFINEMENT_LEADERS = [
  { sequence: "AB", centerX: 3.48, centerY: 3.64, zoom: 2.8 },
  { sequence: "ABB", centerX: 3.36, centerY: 3.52, zoom: 4.5 },
  { sequence: "AABB", centerX: 3.48, centerY: 3.64, zoom: 4.5 },
] as const;

/** Each leader (the three best distinct sequence/window pairs of the coarse
 * ranking) gets zoom factors [1.4, 2] x diagonal offsets of 0.15 of its coarse
 * window span (2/zoom), centre rounded to 12 decimals and zoom to 6. */
export const MARKUS_REFINED_VIEWS: Params[] = MARKUS_REFINEMENT_LEADERS.flatMap(leader =>
  [1.4, 2].flatMap(factor => [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dx, dy]) => {
    const offset = 0.15 * (2 / leader.zoom);
    return {
      sequence: leader.sequence,
      centerX: Number((leader.centerX + dx * offset).toFixed(12)),
      centerY: Number((leader.centerY + dy * offset).toFixed(12)),
      zoom: Number((leader.zoom * factor).toFixed(6)),
    };
  })));

/** Evidence finalists (candidate ids), fixed by hand after the ranking and
 * its montage are inspected; empty means the score leader alone. */
export const MARKUS_FINALISTS: string[] = ["140-c06", "140-c62", "140-c69"];

const MARKUS_LYAPUNOV: SimSweepConfig = {
  slug: "markus-lyapunov", artifactId: "sweep-140-markus-lyapunov",
  signMix: { methodVersion: "lyapunov-sign-v1", stableChannel: 0, chaoticChannel: 1 },
  primaryChannel: 0, gridWidth: 128, gridHeight: 128,
  warmupSteps: 0, fluxGap: 0, dt: 1, coverageThreshold: 0,
  baseParams: { warmupIterations: 300, sampleIterations: 700, rotationSpeed: 0 },
  axes: ["sequence", "centerX", "centerY", "zoom"].map(key => ({ key, values: [] })),
  sets: [
    ...MARKUS_SEQUENCES.flatMap(sequence => MARKUS_COARSE_VIEWS.map(view => ({ sequence, ...view }))),
    ...MARKUS_REFINED_VIEWS,
  ],
  references: [
    { id: "140-current-zircon-zity", label: "Zircon Zity (rotation disabled)", params: { centerX: 3, centerY: 3, zoom: 1, warmupIterations: 200, sampleIterations: 500, sequence: "AB", rotationSpeed: 0 } },
    { id: "140-current-woven-boundary", label: "Woven boundary (rotation disabled)", params: { centerX: 3.48, centerY: 3.64, zoom: 4.5, warmupIterations: 300, sampleIterations: 700, sequence: "AABAB", rotationSpeed: 0 } },
  ],
};

export const BURNING_SHIP_ANCHORS = [
  { id: "harbour", centerX: -0.5, centerY: -0.5, zoom: 1 },
  { id: "mast", centerX: -1.755, centerY: -0.03, zoom: 14 },
  { id: "ridge-deep", centerX: -1.744, centerY: -0.017, zoom: 72 },
];

// Centres of the refinement pass, chosen from the retained coarse ranking.
export const BURNING_SHIP_REFINEMENT_CENTRES: { centerX: number; centerY: number; zoom: number }[] = [
  { centerX: -1.753444444444, centerY: -0.007555555556, zoom: 86.4 },
  { centerX: 0.18, centerY: -1.18, zoom: 3 },
  { centerX: -1.803571428571, centerY: 0.018571428571, zoom: 30.8 },
];

const BURNING_SHIP_SPAN = 3.4;

const BURNING_SHIP_BOUNDARY: SimSweepConfig = {
  slug: "burning-ship", artifactId: "sweep-138-burning-ship",
  staticBoundary: { methodVersion: "static-boundary-v1" },
  primaryChannel: 0, gridWidth: 128, gridHeight: 128,
  warmupSteps: 0, fluxGap: 0, dt: 1, coverageThreshold: 0,
  baseParams: { maxIterations: 512, autoIterations: true, palettePhase: 0, cycleSpeed: 0 },
  axes: ["centerX", "centerY", "zoom"].map(key => ({ key, values: [] })),
  sets: [...BURNING_SHIP_ANCHORS.flatMap(anchor => [1.2, 1.6, 2.2, 3].flatMap(factor =>
    [-0.2, 0.2].flatMap(dx => [-0.2, 0.2].map(dy => ({
      centerX: Number((anchor.centerX + dx * BURNING_SHIP_SPAN / anchor.zoom).toFixed(12)),
      centerY: Number((anchor.centerY + dy * BURNING_SHIP_SPAN / anchor.zoom).toFixed(12)),
      zoom: Number((anchor.zoom * factor).toFixed(6)),
    }))),
  )), ...BURNING_SHIP_REFINEMENT_CENTRES.flatMap(anchor => [1.15, 1.45].flatMap(factor =>
    [-0.1, 0.1].flatMap(dx => [-0.1, 0.1].map(dy => ({
      centerX: Number((anchor.centerX + dx * BURNING_SHIP_SPAN / anchor.zoom).toFixed(12)),
      centerY: Number((anchor.centerY + dy * BURNING_SHIP_SPAN / anchor.zoom).toFixed(12)),
      zoom: Number((anchor.zoom * factor).toFixed(6)),
    }))),
  ))],
  references: [
    { id: "138-current-default", label: "Kernel default (motion disabled)", params: { centerX: -1.755, centerY: -0.03, zoom: 14, maxIterations: 260, autoIterations: true, palettePhase: 0, cycleSpeed: 0 } },
    ...BURNING_SHIP_ANCHORS.map((anchor, i) => ({
      id: `138-current-${anchor.id}`, label: `${anchor.id} (motion disabled)`,
      params: { centerX: anchor.centerX, centerY: anchor.centerY, zoom: anchor.zoom, maxIterations: [128, 260, 384][i], autoIterations: true, palettePhase: 0, cycleSpeed: 0 },
    })),
  ],
};

const SANDPILE_146: SimSweepConfig = {
  slug: "abelian-sandpile", artifactId: "sweep-146-abelian-sandpile",
  growthCriticality: { methodVersion: "growth-criticality-v1", sampleSteps: [100, 250, 400], longHorizon: 1000, validationSizes: [128, 384] },
  primaryChannel: 0, gridWidth: 256, gridHeight: 256, warmupSteps: 250, fluxGap: 4, dt: 1, coverageThreshold: 0.25,
  baseParams: { initialPile: 30000, toppleThreshold: 4 },
  axes: [
    { key: "grainsPerStep", values: [3, 8, 20, 50, 120, 250] },
    { key: "topplesPerStep", values: [600, 2000, 5000, 12000, 25000, 250000, 700000, 2000000] },
  ],
  references: ABELIAN_SANDPILE.references.map(r => ({ ...r, id: `146-current-${r.id}` })),
};

// Metropolis acceptance depends on J/T and h/T only, so at h = 0 the physics is
// a function of the ratio T/J; coupling and temperature are paired so every
// candidate has a distinct ratio and a distinct (T, J) rather than a rescaled copy.
const ISING_146_RATIOS = [1.4, 1.7, 1.9, 2.0, 2.1, 2.2, 2.25, 2.3, 2.35, 2.4, 2.5, 2.6, 2.7, 2.85, 3.0, 3.3];
const ISING_146_COUPLINGS = [0.6, 1.4, 0.9, 1.5];
const ISING_146: SimSweepConfig = {
  slug: "ising-model", artifactId: "sweep-146-ising-model",
  growthCriticality: { methodVersion: "growth-criticality-v1", sampleSteps: [100, 300, 900], longHorizon: 3000, validationSizes: [64, 256], seeds: [7, 11, 23] },
  primaryChannel: 0, gridWidth: 128, gridHeight: 128, warmupSteps: 300, fluxGap: 4, dt: 1, coverageThreshold: 0.5,
  baseParams: { externalField: 0, sweepsPerStep: 0.5, seed: 7 },
  axes: [
    { key: "temperature", values: [] }, { key: "coupling", values: ISING_146_COUPLINGS }, { key: "initialState", values: ["random", "up", "checkerboard"] },
  ],
  sets: ISING_146_RATIOS.flatMap((ratio, i) => ["random", "up", "checkerboard"].map(initialState => {
    const coupling = ISING_146_COUPLINGS[i % ISING_146_COUPLINGS.length];
    return { temperature: Number((ratio * coupling).toFixed(3)), coupling, initialState };
  })),
  references: ISING_MODEL.references.map(r => ({ ...r, id: `146-current-${r.id}` })),
};
ISING_146.axes[0].values = [...new Set((ISING_146.sets as Params[]).map(s => s.temperature as number))];

const DLA_146: SimSweepConfig = {
  slug: "diffusion-limited-aggregation", artifactId: "sweep-146-diffusion-limited-aggregation",
  growthCriticality: { methodVersion: "growth-criticality-v1", milestones: [1000, 2500, 4500], stepCap: 6000, longHorizon: 20000, validationSizes: [192, 288], seeds: [7, 11, 23] },
  primaryChannel: 0, gridWidth: 192, gridHeight: 192, warmupSteps: 6000, fluxGap: 6, dt: 1, coverageThreshold: 0.05,
  baseParams: { walkersPerStep: 64, maxWalkSteps: 400, seed: 7 },
  axes: [
    { key: "stickiness", values: [0.04, 0.08, 0.22, 0.4, 0.62, 0.9] },
    { key: "spawnRadius", values: [0.08, 0.16, 0.26, 0.5] },
    { key: "seedCount", values: [2, 6] },
  ],
  references: DIFFUSION_LIMITED_AGGREGATION.references.map(r => ({ ...r, id: `146-current-${r.id}` })),
};

export const SWEEP_CONFIGS: Record<string, SimSweepConfig> = {
  "sweep-147-brians-brain": {
    ...BRIANS_BRAIN, artifactId: "sweep-147-brians-brain",
    warmupSteps: 200, multiSnapshot: { warmupSteps: [200, 500, 1000] },
    baseParams: { dyingValue: 0.5 },
    axes: [{ key: "birthCount", values: [0, 1, 2, 3, 4, 5] },
      { key: "seedDensity", values: [0.015, 0.035, 0.085, 0.155, 0.31, 0.52, 0.68, 0.85] }],
    references: BRIANS_BRAIN.references.map(r => ({ ...r, id: `147-current-${r.id}`,
      params: { ...r.params, dyingValue: r.id === "classic" ? 0.5 : 0.9 } })),
  },
  "sweep-147-cyclic-ca": {
    ...CYCLIC_CA, artifactId: "sweep-147-cyclic-ca",
    multiSnapshot: { warmupSteps: [200, 500, 1000] },
    baseParams: { stepsPerFrame: 1, seed: 0 },
    axes: [{ key: "states", values: [3, 5, 7, 9, 17, 18, 21, 23] },
      { key: "threshold", values: [1, 2, 3] }, { key: "neighbourhood", values: ["moore", "vonNeumann"] }],
    references: CYCLIC_CA.references.map(r => ({ ...r, id: `147-current-${r.id}`,
      params: { ...r.params, threshold: r.id === "crystal-lattice" ? 1 : r.params.threshold } })),
  },
  "sweep-147-game-of-life": {
    ...GAME_OF_LIFE, artifactId: "sweep-147-game-of-life",
    multiSnapshot: { warmupSteps: [200, 500, 1000] },
    baseParams: { seedDensity: 0.28, ageShading: true },
    axes: [{ key: "birthMin", values: [1, 2, 4] }, { key: "birthMax", values: [1, 2, 3, 4] },
      { key: "surviveMin", values: [1, 2, 3] }, { key: "surviveMax", values: [3, 5] },
      { key: "sparkRate", values: [0, 0.025, 0.075, 0.2] }],
    sets: [[1, 1], [2, 2], [2, 3], [4, 4]].flatMap(([birthMin, birthMax]) =>
      [[1, 3], [2, 3], [3, 5]].flatMap(([surviveMin, surviveMax]) =>
        [0, 0.025, 0.075, 0.2].map(sparkRate => ({ birthMin, birthMax, surviveMin, surviveMax, sparkRate })))),
    references: GAME_OF_LIFE.references.map(r => ({ ...r, id: `147-current-${r.id}` })),
  },
  "sweep-146-abelian-sandpile": SANDPILE_146,
  "sweep-146-diffusion-limited-aggregation": DLA_146,
  "sweep-146-ising-model": ISING_146,
  "sweep-143-gray-scott": {
    slug: "gray-scott", artifactId: "sweep-143-gray-scott",
    reactionDiffusion: { methodVersion: "rd-persistence-v1" },
    primaryChannel: 1, gridWidth: 128, gridHeight: 128, warmupSteps: 700, fluxGap: 12, dt: 1, coverageThreshold: 0.1,
    multiSnapshot: { warmupSteps: [700, 850, 1000] },
    baseParams: { Du: 0.2097, Dv: 0.105, stencil: "nine-point", dt: 1, stepsPerFrame: 20 },
    axes: ["F", "k", "Dv"].map(key => ({ key, values: [] })),
    sets: [[0.017, 0.049], [0.025, 0.060], [0.035, 0.065], [0.053, 0.0625]].flatMap(([f, k]) =>
      [-0.0005, 0.0005].flatMap(df => [-0.00025, 0.00025].flatMap(dk => [0.085, 0.105, 0.125].map(Dv =>
        ({ F: Number((f + df).toFixed(5)), k: Number((k + dk).toFixed(5)), Dv }))))),
    references: GRAY_SCOTT.references.filter(r => r.id !== "u-skate").map(r => ({
      ...r, id: `143-current-${r.id === "default-coral" ? "coral" : r.id}`, label: r.label.replace("Default (Coral)", "Coral"),
      params: { ...r.params, stencil: "nine-point", dt: 1 },
    })),
  },
  "sweep-143-belousov-zhabotinsky": {
    slug: "belousov-zhabotinsky", artifactId: "sweep-143-belousov-zhabotinsky",
    reactionDiffusion: { methodVersion: "rd-persistence-v1" },
    primaryChannel: 0, gridWidth: 128, gridHeight: 128, warmupSteps: 400, fluxGap: 8, dt: 1, coverageThreshold: 0.5,
    multiSnapshot: { warmupSteps: [400, 700, 1000] },
    baseParams: { stepsPerFrame: 1 }, axes: ["feed", "kill", "diffusionA", "diffusionB", "diffusionC"].map(key => ({ key, values: [] })),
    sets: [0.014, 0.026, 0.038, 0.05].flatMap(feed => [0.016, 0.028, 0.04].flatMap(kill =>
      [[0.12, 0.12, 0.02], [0.18, 0.04, 0.08], [0.24, 0.16, 0.055], [0.3, 0.06, 0.12]].map(([diffusionA, diffusionB, diffusionC]) =>
        ({ feed, kill, diffusionA, diffusionB, diffusionC })))),
    references: [
      ...BELOUSOV_ZHABOTINSKY.references.map(r => ({ ...r, id: `143-current-${r.id}` })),
    ],
  },
  "sweep-143-lenia": {
    slug: "lenia", artifactId: "sweep-143-lenia", reactionDiffusion: { methodVersion: "rd-persistence-v1" },
    primaryChannel: 0, gridWidth: 128, gridHeight: 128, warmupSteps: 260, fluxGap: 8, dt: 1, coverageThreshold: 0.1,
    multiSnapshot: { warmupSteps: [260, 510, 760] },
    baseParams: { dt: 0.1, stepsPerFrame: 1, seed: 0 }, axes: ["radius", "muDrift", "mu", "sigma"].map(key => ({ key, values: [] })),
    sets: [7, 11, 15].flatMap(radius => [0, 0.008, 0.024, 0.03].flatMap(muDrift =>
      [[0.135, 0.018], [0.165, 0.022], [0.205, 0.026], [0.245, 0.03]].map(([mu, sigma]) => ({ radius, muDrift, mu, sigma })))),
    references: [
      ...LENIA.references.map(r => ({ ...r, id: `143-current-${r.id}` })),
      { id: "143-current-living-labyrinth", label: "Living labyrinth", params: { mu: 0.24, sigma: 0.028, muDrift: 0.015, dt: 0.1, radius: 14, stepsPerFrame: 1, seed: 0 } },
    ],
  },

  "sweep-142-lorenz-attractor": LORENZ_UNEXPLORED,
  "sweep-141-elementary-cellular-automata": {
    slug: "elementary-cellular-automata", artifactId: "sweep-141-elementary-cellular-automata",
    eca: { methodVersion: "eca-spacetime-v1" },
    primaryChannel: 0, gridWidth: 128, gridHeight: 128, warmupSteps: 127, fluxGap: 1, dt: 1,
    coverageThreshold: 0.5, baseParams: { stepsPerFrame: 1 },
    axes: [{ key: "rule", values: Array.from({ length: 256 }, (_, i) => i) }, { key: "seedMode", values: [0, 1, 2] }],
    references: [
      { id: "141-current-rule-30", label: "Rule 30 chaos / kernel default", params: { rule: 30, seedMode: 0, stepsPerFrame: 1 } },
      { id: "141-current-rule-90", label: "Rule 90 triangles", params: { rule: 90, seedMode: 0, stepsPerFrame: 1 } },
      { id: "141-current-rule-110", label: "Rule 110 complexity", params: { rule: 110, seedMode: 0, stepsPerFrame: 1 } },
      { id: "141-current-rule-184", label: "Rule 184 traffic", params: { rule: 184, seedMode: 1, stepsPerFrame: 2 } },
    ],
  },
  "sweep-140-markus-lyapunov": MARKUS_LYAPUNOV,
  "sweep-137-mandelbrot": MANDELBROT_BOUNDARY,
  "sweep-139-julia-set": JULIA_CONNECTIVITY,
  "sweep-138-burning-ship": BURNING_SHIP_BOUNDARY,
  "gray-scott": GRAY_SCOTT,
  boids: BOIDS,
  "lorenz-attractor": LORENZ,
  "clifford-dejong-clifford": CLIFFORD,
  "clifford-dejong-dejong": DEJONG,
  "clifford-dejong-svensson": SVENSSON,
  "sweep-148-clifford-dejong-clifford": ATTRACTOR_148_CLIFFORD,
  "sweep-148-clifford-dejong-dejong": ATTRACTOR_148_DEJONG,
  "sweep-148-clifford-dejong-svensson": ATTRACTOR_148_SVENSSON,
  lenia: LENIA,
  "belousov-zhabotinsky": BELOUSOV_ZHABOTINSKY,
  "belousov-zhabotinsky-diffusion": BELOUSOV_ZHABOTINSKY_DIFFUSION,
  physarum: PHYSARUM,
  swarmalators: SWARMALATORS,
  "abelian-sandpile": ABELIAN_SANDPILE,
  "brians-brain": BRIANS_BRAIN,
  "cyclic-ca": CYCLIC_CA,
  "game-of-life": GAME_OF_LIFE,
  "ising-model": ISING_MODEL,
  "diffusion-limited-aggregation": DIFFUSION_LIMITED_AGGREGATION,
  "kuramoto-oscillators": KURAMOTO_OSCILLATORS,
  "particle-life": PARTICLE_LIFE,
};
