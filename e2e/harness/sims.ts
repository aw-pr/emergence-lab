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

export const SWEEP_CONFIGS: Record<string, SimSweepConfig> = {
  "gray-scott": GRAY_SCOTT,
  boids: BOIDS,
  "lorenz-attractor": LORENZ,
};
