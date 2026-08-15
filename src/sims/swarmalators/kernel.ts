import {
  createSwarmalatorState,
  mulberry32,
  stepSwarmalators,
  SWARMALATOR_TAU,
  wrapTau,
  type SwarmalatorState,
} from "./model.js";

type ParamDescriptor = {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  info?: string;
  group?: string;
};

type SimParams = Record<string, number | boolean | string>;

interface SimKernel {
  init(width: number, height: number, params: SimParams): void;
  step(dt: number): void;
  readState(): Float32Array;
  readonly channelCount: number;
  readonly channelRanges: readonly (readonly [number, number])[];
  readonly name: string;
  readonly channelLabels: readonly string[];
  readonly paramSchema: readonly ParamDescriptor[];
  destroy(): void;
}

const DEFAULT_PARTICLE_COUNT = 384;
const MAX_PARTICLE_COUNT = 1200;
const DEFAULT_A = 1;
const DEFAULT_B = 18;
const DEFAULT_J = 1;
// The J=1, K=-0.75 "active phase wave" regime circulates forever; K=0 lands on
// the static phase wave, which freezes into a ring within seconds of loading.
const DEFAULT_K = -0.75;
const DEFAULT_FREQUENCY_SPREAD = 0;
const DEFAULT_NOISE = 0;
const MAX_NOISE = 1;
// Decorrelates the jitter stream from the placement RNG, which consumes the
// raw seed.
const NOISE_SEED_OFFSET = 0x9e37;
const DEFAULT_TIMESTEP = 0.05;
const DEFAULT_SEED = 1;
const CHANNEL_COUNT = 2;
const SPLAT_RADIUS = 3;
const SPLAT_RADIUS_SQUARED = SPLAT_RADIUS * SPLAT_RADIUS;
const VIEW_FIT_SMOOTHING = 0.04;
const DEFAULT_CAMERA_DRIFT = 0.5;
const MAX_CAMERA_DRIFT = 1;
const CAMERA_DRIFT_VIEW_FRACTION = 0.12;
const CAMERA_DRIFT_ANGULAR_SPEED = 0.006;
const DEFAULT_TRAIL_PERSISTENCE = 0.85;
// Below this residue a trail cell is snapped to empty: the density would be
// invisible anyway and the atan2 of two near-zero sums is just noise.
const TRAIL_FLOOR = 0.004;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberParam(params: SimParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export class SwarmalatorsKernel implements SimKernel {
  readonly name = "Swarmalators";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Density", "Phase"] as const;
  readonly channelRanges = [[0, 1], [0, 1]] as const;
  readonly paramSchema = [
    {
      key: "particleCount",
      label: "Particle count",
      type: "number",
      default: DEFAULT_PARTICLE_COUNT,
      min: 2,
      max: MAX_PARTICLE_COUNT,
      step: 1,
      info: "How many swarmalators make up the swarm. More particles produce richer, more continuous-looking phase patterns, at the cost of frame rate (every particle interacts with every other). Changing it resets the swarm.",
    },
    {
      key: "A",
      label: "Attraction",
      type: "number",
      default: DEFAULT_A,
      min: 0.1,
      max: 3,
      step: 0.05,
      group: "Dynamics",
      info: "Strength of the spatial pull drawing particles together. Higher values compress the swarm into a tighter cloud; lower values let it spread out. Changing it resets the swarm.",
    },
    {
      key: "B",
      label: "Repulsion",
      type: "number",
      default: DEFAULT_B,
      min: 1,
      max: 40,
      step: 0.5,
      group: "Dynamics",
      info: "Strength of the short-range push keeping particles from collapsing onto each other, and the main driver of the swarm's overall size. Higher values give a larger, more open swarm. Changing it resets the swarm.",
    },
    {
      key: "J",
      label: "Phase attraction",
      type: "number",
      default: DEFAULT_J,
      min: -1,
      max: 1,
      step: 0.05,
      group: "Dynamics",
      info: "How strongly a particle's position is pulled toward others sharing its phase (colour). Positive values sort the swarm into phase-matched clusters; negative values scatter same-phase particles apart. Changing it resets the swarm.",
    },
    {
      key: "K",
      label: "Synchronisation",
      type: "number",
      default: DEFAULT_K,
      min: -2,
      max: 2,
      step: 0.05,
      group: "Dynamics",
      info: "How strongly nearby particles pull each other's phase into sync. Positive values drive the swarm toward a single shared colour; negative values (the default regime) keep phase waves circulating instead of settling. Changing it resets the swarm.",
    },
    {
      key: "frequencySpread",
      label: "Frequency spread",
      type: "number",
      default: DEFAULT_FREQUENCY_SPREAD,
      min: 0,
      max: 2,
      step: 0.01,
      group: "Dynamics",
      info: "Spread of each particle's natural, unforced phase-cycling rate. At zero every particle would cycle at the same rate if left alone; higher spread gives particles more individual phase drift, disrupting synchronisation. Changing it resets the swarm.",
    },
    {
      key: "noise",
      label: "Jitter",
      type: "number",
      default: DEFAULT_NOISE,
      min: 0,
      max: MAX_NOISE,
      step: 0.01,
      group: "Dynamics",
      info: "Random position and phase kicks applied each step. A little keeps an otherwise-static configuration gently simmering instead of freezing solid; a lot dissolves structure into noise. Changing it resets the swarm.",
    },
    {
      key: "timestep",
      label: "Time step",
      type: "number",
      default: DEFAULT_TIMESTEP,
      min: 0.002,
      max: 0.1,
      step: 0.002,
      info: "Simulated time advanced per frame. Larger steps make the swarm evolve faster but coarsen the integration, which can make fast regimes look jittery or unstable. Changing it resets the swarm.",
    },
    {
      key: "seed",
      label: "Seed",
      type: "number",
      default: DEFAULT_SEED,
      min: 1,
      max: 9999,
      step: 1,
      info: "Random seed for the initial particle placement, phases, and jitter stream. Changing it reshuffles the starting layout without changing the dynamics regime; the same seed always reproduces the same run. Changing it resets the swarm.",
    },
    {
      key: "trailPersistence",
      label: "Trail persistence",
      type: "number",
      default: DEFAULT_TRAIL_PERSISTENCE,
      min: 0,
      max: 0.98,
      step: 0.01,
      info: "How much of each cell's rendered density and colour survives from frame to frame before fading. Higher values leave long, ghostly wakes behind moving particles; zero shows only their current positions. Changing it resets the swarm.",
    },
    {
      key: "cameraDrift",
      label: "Camera drift",
      type: "number",
      default: DEFAULT_CAMERA_DRIFT,
      min: 0,
      max: MAX_CAMERA_DRIFT,
      step: 0.05,
      info: "How far the view slowly drifts around the swarm's centre while it runs, purely for presentation. Zero holds the view still; higher values give a wider, slower pan. Changing it resets the swarm.",
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private densityAcc = new Float32Array(0);
  private phaseCos = new Float32Array(0);
  private phaseSin = new Float32Array(0);
  private trailPersistence = DEFAULT_TRAIL_PERSISTENCE;
  private particles: SwarmalatorState = createSwarmalatorState({ particleCount: 0, frequencySpread: 0, seed: 1 });
  private viewScale = 0;
  private viewCentreX = 0;
  private viewCentreY = 0;
  private viewSwarmRadius = 0;
  private cameraDrift = DEFAULT_CAMERA_DRIFT;
  private simulationTime = 0;
  private A = DEFAULT_A;
  private B = DEFAULT_B;
  private J = DEFAULT_J;
  private K = DEFAULT_K;
  private timestep = DEFAULT_TIMESTEP;
  private noise = DEFAULT_NOISE;
  private noiseRandom: () => number = mulberry32(DEFAULT_SEED + NOISE_SEED_OFFSET);

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    const particleCount = Math.floor(clamp(numberParam(params, "particleCount", DEFAULT_PARTICLE_COUNT), 2, MAX_PARTICLE_COUNT));
    this.A = clamp(numberParam(params, "A", DEFAULT_A), 0.1, 3);
    this.B = clamp(numberParam(params, "B", DEFAULT_B), 1, 40);
    this.J = clamp(numberParam(params, "J", DEFAULT_J), -1, 1);
    this.K = clamp(numberParam(params, "K", DEFAULT_K), -2, 2);
    this.timestep = clamp(numberParam(params, "timestep", DEFAULT_TIMESTEP), 0.002, 0.08);
    const frequencySpread = clamp(numberParam(params, "frequencySpread", DEFAULT_FREQUENCY_SPREAD), 0, 2);
    this.noise = clamp(numberParam(params, "noise", DEFAULT_NOISE), 0, MAX_NOISE);
    const seed = numberParam(params, "seed", DEFAULT_SEED);
    this.noiseRandom = mulberry32(seed + NOISE_SEED_OFFSET);
    const cells = this.width * this.height;

    this.state = new Float32Array(cells * CHANNEL_COUNT);
    this.densityAcc = new Float32Array(cells);
    this.phaseCos = new Float32Array(cells);
    this.phaseSin = new Float32Array(cells);
    this.trailPersistence = clamp(
      numberParam(params, "trailPersistence", DEFAULT_TRAIL_PERSISTENCE),
      0,
      0.98,
    );
    this.cameraDrift = clamp(
      numberParam(params, "cameraDrift", DEFAULT_CAMERA_DRIFT),
      0,
      MAX_CAMERA_DRIFT,
    );
    this.particles = createSwarmalatorState(
      { particleCount, frequencySpread, seed },
      {
        centreX: this.width / 2,
        centreY: this.height / 2,
        radius: Math.min(this.width, this.height) * 0.32,
      },
    );
    this.viewScale = 0; // snap the view fit on (re)init rather than lerping
    this.simulationTime = 0;
    this.rasterise();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) return;
    // Positions live in grid cells, which stretches the model's natural length
    // unit to L = B/A cells — and with it the timescale, by the same factor.
    // Renormalise dt so parameter changes alter the physics, not the tempo:
    // the canonical regimes (sync, phase wave, splintering) play out in
    // seconds at 1x regardless of B/A.
    const timeScale = this.B / this.A;
    const dtEff = this.timestep * timeScale;
    stepSwarmalators(this.particles, { A: this.A, B: this.B, J: this.J, K: this.K }, dtEff);
    if (this.noise > 0) {
      // Seeded Brownian kicks (√dt scaling) so ordered states keep simmering
      // instead of freezing. Position kicks scale with the model's natural
      // length L = B/A cells; phase kicks are a fraction of a radian at full
      // slider.
      const random = this.noiseRandom;
      const positionKick = this.noise * timeScale * 0.05 * Math.sqrt(dtEff);
      const phaseKick = this.noise * 0.6 * Math.sqrt(this.timestep);
      const { x, y, theta } = this.particles;
      for (let i = 0; i < x.length; i += 1) {
        x[i] += (random() * 2 - 1) * positionKick;
        y[i] += (random() * 2 - 1) * positionKick;
        theta[i] = wrapTau(theta[i] + (random() * 2 - 1) * phaseKick);
      }
    }
    this.simulationTime += dtEff;
    this.rasterise();
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.densityAcc = new Float32Array(0);
    this.phaseCos = new Float32Array(0);
    this.phaseSin = new Float32Array(0);
    this.viewSwarmRadius = 0;
    this.simulationTime = 0;
    this.particles = createSwarmalatorState({ particleCount: 0, frequencySpread: 0, seed: 1 });
  }

  // The equilibrium swarm is only ~B/A cells across — a speck on a full-size
  // grid — so the rasteriser tracks the swarm with a smoothed centroid+scale
  // fit instead of drawing world units 1:1. The slow zoom as the cloud
  // coalesces is deterministic (pure function of particle history).
  private updateViewFit(): void {
    const count = this.particles.x.length;
    if (count === 0) return;

    let centroidX = 0;
    let centroidY = 0;
    for (let i = 0; i < count; i += 1) {
      centroidX += this.particles.x[i];
      centroidY += this.particles.y[i];
    }
    centroidX /= count;
    centroidY /= count;

    let maxRadius = 0;
    for (let i = 0; i < count; i += 1) {
      const dx = this.particles.x[i] - centroidX;
      const dy = this.particles.y[i] - centroidY;
      const radius = dx * dx + dy * dy;
      if (radius > maxRadius) maxRadius = radius;
    }
    const minDim = Math.min(this.width, this.height);
    const swarmRadius = Math.max(Math.sqrt(maxRadius), minDim * 0.02);
    const targetScale = (minDim * 0.35) / swarmRadius;

    if (this.viewScale <= 0) {
      this.viewScale = targetScale;
      this.viewCentreX = centroidX;
      this.viewCentreY = centroidY;
      this.viewSwarmRadius = swarmRadius;
      return;
    }
    this.viewScale *= Math.pow(targetScale / this.viewScale, VIEW_FIT_SMOOTHING);
    this.viewCentreX += (centroidX - this.viewCentreX) * VIEW_FIT_SMOOTHING;
    this.viewCentreY += (centroidY - this.viewCentreY) * VIEW_FIT_SMOOTHING;
    // Include centre-tracking lag in the enclosing radius used by the drift
    // safety bound. The triangle inequality makes this conservative.
    this.viewSwarmRadius = swarmRadius + Math.hypot(
      centroidX - this.viewCentreX,
      centroidY - this.viewCentreY,
    );
  }

  private cameraOffset(): readonly [number, number] {
    if (this.cameraDrift === 0 || this.viewScale <= 0) return [0, 0];

    const minDim = Math.min(this.width, this.height);
    const viewHalfSpan = minDim / (2 * this.viewScale);
    const splatMargin = SPLAT_RADIUS / this.viewScale;
    const availableMargin = Math.max(
      0,
      viewHalfSpan - this.viewSwarmRadius - splatMargin,
    );
    const amplitude = Math.min(
      viewHalfSpan * CAMERA_DRIFT_VIEW_FRACTION * this.cameraDrift,
      availableMargin,
    );
    const phase = this.simulationTime * CAMERA_DRIFT_ANGULAR_SPEED;
    const axisAmplitude = amplitude / Math.SQRT2;
    return [
      Math.sin(phase) * axisAmplitude,
      Math.sin(phase * 0.73) * axisAmplitude,
    ];
  }

  private rasterise(): void {
    // Instead of clearing, decay the accumulators: departed particles leave a
    // fading wake whose hue is the phase they carried through. Persistence 0
    // reduces to a hard clear.
    const decay = this.trailPersistence;
    for (let cell = 0; cell < this.densityAcc.length; cell += 1) {
      const faded = this.densityAcc[cell] * decay;
      if (faded < TRAIL_FLOOR) {
        this.densityAcc[cell] = 0;
        this.phaseCos[cell] = 0;
        this.phaseSin[cell] = 0;
      } else {
        this.densityAcc[cell] = faded;
        this.phaseCos[cell] *= decay;
        this.phaseSin[cell] *= decay;
      }
    }
    this.updateViewFit();
    const [cameraOffsetX, cameraOffsetY] = this.cameraOffset();

    for (let i = 0; i < this.particles.x.length; i += 1) {
      const particleX = this.width / 2 + (this.particles.x[i] - this.viewCentreX - cameraOffsetX) * this.viewScale;
      const particleY = this.height / 2 + (this.particles.y[i] - this.viewCentreY - cameraOffsetY) * this.viewScale;
      const minX = Math.max(0, Math.floor(particleX - SPLAT_RADIUS));
      const maxX = Math.min(this.width - 1, Math.floor(particleX + SPLAT_RADIUS));
      const minY = Math.max(0, Math.floor(particleY - SPLAT_RADIUS));
      const maxY = Math.min(this.height - 1, Math.floor(particleY + SPLAT_RADIUS));
      const phaseCos = Math.cos(this.particles.theta[i]);
      const phaseSin = Math.sin(this.particles.theta[i]);

      for (let y = minY; y <= maxY; y += 1) {
        const dy = y + 0.5 - particleY;
        for (let x = minX; x <= maxX; x += 1) {
          const dx = x + 0.5 - particleX;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= SPLAT_RADIUS_SQUARED) continue;

          const weight = 1 - distanceSquared / SPLAT_RADIUS_SQUARED;
          const cell = y * this.width + x;
          this.densityAcc[cell] += weight;
          this.phaseCos[cell] += phaseCos * weight;
          this.phaseSin[cell] += phaseSin * weight;
        }
      }
    }

    for (let cell = 0; cell < this.width * this.height; cell += 1) {
      const offset = cell * CHANNEL_COUNT;
      const density = this.densityAcc[cell];
      if (density === 0) {
        this.state[offset] = 0;
        this.state[offset + 1] = 0;
        continue;
      }
      this.state[offset] = clamp(density, 0, 1);
      const phase = Math.atan2(this.phaseSin[cell], this.phaseCos[cell]);
      this.state[offset + 1] = (phase < 0 ? phase + SWARMALATOR_TAU : phase) / SWARMALATOR_TAU;
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new SwarmalatorsKernel();
    kernel.init(48, 36, { particleCount: 64, seed: 7 });
    kernel.step(1 / 60);
    const state = kernel.readState();
    return state.length === 48 * 36 * CHANNEL_COUNT && state.every((value) => value >= 0 && value <= 1) && state.some((value, index) => index % CHANNEL_COUNT === 0 && value > 0);
  } catch {
    return false;
  }
}
