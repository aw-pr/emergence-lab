import {
  createSwarmalatorState,
  stepSwarmalators,
  SWARMALATOR_TAU,
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
const DEFAULT_K = 0;
const DEFAULT_FREQUENCY_SPREAD = 0;
const DEFAULT_TIMESTEP = 0.05;
const DEFAULT_SEED = 1;
const CHANNEL_COUNT = 2;

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
    { key: "particleCount", label: "Particle count", type: "number", default: DEFAULT_PARTICLE_COUNT, min: 2, max: MAX_PARTICLE_COUNT, step: 1 },
    { key: "A", label: "Attraction", type: "number", default: DEFAULT_A, min: 0.1, max: 3, step: 0.05 },
    { key: "B", label: "Repulsion", type: "number", default: DEFAULT_B, min: 1, max: 40, step: 0.5 },
    { key: "J", label: "Phase attraction", type: "number", default: DEFAULT_J, min: -1, max: 1, step: 0.05 },
    { key: "K", label: "Synchronisation", type: "number", default: DEFAULT_K, min: -2, max: 2, step: 0.05 },
    { key: "frequencySpread", label: "Frequency spread", type: "number", default: DEFAULT_FREQUENCY_SPREAD, min: 0, max: 2, step: 0.01 },
    { key: "timestep", label: "Time step", type: "number", default: DEFAULT_TIMESTEP, min: 0.002, max: 0.1, step: 0.002 },
    { key: "seed", label: "Seed", type: "number", default: DEFAULT_SEED, min: 1, max: 9999, step: 1 },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private phaseCos = new Float32Array(0);
  private phaseSin = new Float32Array(0);
  private particles: SwarmalatorState = createSwarmalatorState({ particleCount: 0, frequencySpread: 0, seed: 1 });
  private A = DEFAULT_A;
  private B = DEFAULT_B;
  private J = DEFAULT_J;
  private K = DEFAULT_K;
  private timestep = DEFAULT_TIMESTEP;

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
    const seed = numberParam(params, "seed", DEFAULT_SEED);
    const cells = this.width * this.height;

    this.state = new Float32Array(cells * CHANNEL_COUNT);
    this.phaseCos = new Float32Array(cells);
    this.phaseSin = new Float32Array(cells);
    this.particles = createSwarmalatorState(
      { particleCount, frequencySpread, seed },
      {
        centreX: this.width / 2,
        centreY: this.height / 2,
        radius: Math.min(this.width, this.height) * 0.32,
      },
    );
    this.rasterise();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) return;
    stepSwarmalators(this.particles, { A: this.A, B: this.B, J: this.J, K: this.K }, this.timestep);
    this.rasterise();
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.phaseCos = new Float32Array(0);
    this.phaseSin = new Float32Array(0);
    this.particles = createSwarmalatorState({ particleCount: 0, frequencySpread: 0, seed: 1 });
  }

  private rasterise(): void {
    this.state.fill(0);
    this.phaseCos.fill(0);
    this.phaseSin.fill(0);

    for (let i = 0; i < this.particles.x.length; i += 1) {
      const x = Math.floor(this.particles.x[i]);
      const y = Math.floor(this.particles.y[i]);
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;

      const cell = y * this.width + x;
      const offset = cell * CHANNEL_COUNT;
      this.state[offset] += 1;
      this.phaseCos[cell] += Math.cos(this.particles.theta[i]);
      this.phaseSin[cell] += Math.sin(this.particles.theta[i]);
    }

    for (let cell = 0; cell < this.width * this.height; cell += 1) {
      const offset = cell * CHANNEL_COUNT;
      const count = this.state[offset];
      if (count === 0) continue;
      this.state[offset] = clamp(count, 0, 1);
      const phase = Math.atan2(this.phaseSin[cell] / count, this.phaseCos[cell] / count);
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
