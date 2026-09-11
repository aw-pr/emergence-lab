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

export const SWEEP_CONFIGS: Record<string, SimSweepConfig> = {
  "gray-scott": GRAY_SCOTT,
  boids: BOIDS,
  "lorenz-attractor": LORENZ,
  "clifford-dejong-clifford": CLIFFORD,
  "clifford-dejong-dejong": DEJONG,
  "clifford-dejong-svensson": SVENSSON,
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
