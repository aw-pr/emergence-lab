import {
  createKuramotoInitialFields,
  KURAMOTO_TAU,
  type KuramotoPattern,
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

const DEFAULT_COUPLING = 1.8;
const DEFAULT_SPREAD = 0.45;
const DEFAULT_TIMESTEP = 0.045;
const DEFAULT_MODE = "local";
const DEFAULT_NOISE = 0.015;
const DEFAULT_PATTERN = "vortices";

function numberParam(params: SimParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapTau(value: number): number {
  const wrapped = value % KURAMOTO_TAU;
  return wrapped < 0 ? wrapped + KURAMOTO_TAU : wrapped;
}

export class KuramotoOscillatorsKernel {
  readonly name = "Kuramoto Oscillators";
  readonly channelCount = 1;
  readonly channelLabels = ["Phase"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "coupling",
      label: "Coupling",
      type: "number",
      default: DEFAULT_COUPLING,
      min: 0,
      max: 6,
      step: 0.05,
      group: "Dynamics",
      info: "How strongly each oscillator pulls its neighbours' phase toward its own. Higher values snap the field into synchronised patches faster; near zero, phases drift independently and the field looks like noise. Changing it resets the field.",
    },
    {
      key: "frequencySpread",
      label: "Frequency spread",
      type: "number",
      default: DEFAULT_SPREAD,
      min: 0,
      max: 2,
      step: 0.01,
      group: "Dynamics",
      info: "Spread of each oscillator's natural, uncoupled cycling rate. At zero every oscillator would cycle identically if uncoupled; higher spread makes synchronisation harder to hold, keeping the field more turbulent. Changing it resets the field.",
    },
    {
      key: "noise",
      label: "Phase noise",
      type: "number",
      default: DEFAULT_NOISE,
      min: 0,
      max: 0.4,
      step: 0.005,
      group: "Dynamics",
      info: "Random jitter added to every oscillator's phase each step. A little keeps synchronised patches from freezing solid; a lot dissolves vortices and waves into speckle. Changing it resets the field.",
    },
    {
      key: "timestep",
      label: "Time step",
      type: "number",
      default: DEFAULT_TIMESTEP,
      min: 0.005,
      max: 0.15,
      step: 0.005,
      info: "Simulated time advanced per frame. Larger steps make patterns evolve and rotate faster but coarsen the integration, which can make tightly coupled regions look unstable. Changing it resets the field.",
    },
    {
      key: "couplingMode",
      label: "Coupling mode",
      type: "enum",
      default: DEFAULT_MODE,
      options: ["local", "global"],
      info: "Whether each oscillator couples only to its four grid neighbours (local, producing travelling waves and vortices) or to the field's overall average phase (global, pulling everything toward one shared rhythm). Changing it resets the field.",
    },
    {
      key: "initialPattern",
      label: "Initial pattern",
      type: "enum",
      default: DEFAULT_PATTERN,
      options: ["vortices", "waves", "random"],
      info: "Starting phase layout: a vortex/antivortex pair, diagonal travelling waves, or fully random phases. Only affects the field at the moment of reset; the dynamics afterwards are governed by coupling, not by which pattern it started from.",
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private phases = new Float32Array(0);
  private next = new Float32Array(0);
  private frequencies = new Float32Array(0);
  private state = new Float32Array(0);
  private coupling = DEFAULT_COUPLING;
  private frequencySpread = DEFAULT_SPREAD;
  private timestep = DEFAULT_TIMESTEP;
  private couplingMode = DEFAULT_MODE;
  private initialPattern: KuramotoPattern = DEFAULT_PATTERN;
  private noise = DEFAULT_NOISE;
  private rngState = 1;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    const length = this.width * this.height;
    if (this.phases.length !== length) {
      this.phases = new Float32Array(length);
      this.next = new Float32Array(length);
      this.frequencies = new Float32Array(length);
      this.state = new Float32Array(length);
    }

    this.coupling = clamp(numberParam(params, "coupling", DEFAULT_COUPLING), 0, 6);
    this.frequencySpread = clamp(numberParam(params, "frequencySpread", DEFAULT_SPREAD), 0, 2);
    this.timestep = clamp(numberParam(params, "timestep", DEFAULT_TIMESTEP), 0.005, 0.15);
    this.couplingMode = params.couplingMode === "global" ? "global" : DEFAULT_MODE;
    this.initialPattern = params.initialPattern === "waves" || params.initialPattern === "random"
      ? params.initialPattern
      : DEFAULT_PATTERN;
    this.noise = clamp(numberParam(params, "noise", DEFAULT_NOISE), 0, 0.4);
    const initial = createKuramotoInitialFields(this.width, this.height, {
      frequencySpread: this.frequencySpread,
      initialPattern: this.initialPattern,
      seed: numberParam(params, "seed", 1),
    });
    this.phases.set(initial.phases);
    this.frequencies.set(initial.frequencies);
    this.rngState = initial.rngState;
    this.writeState();
  }

  step(_dt: number): void {
    if (this.phases.length === 0) return;
    if (this.couplingMode === "global") this.stepGlobal();
    else this.stepLocal();
    const swap = this.phases;
    this.phases = this.next;
    this.next = swap;
    this.writeState();
  }

  readState(): Float32Array {
    return this.state;
  }

  applyImpulse(x: number, y: number, radius: number, strength: number): void {
    if (this.phases.length === 0 || strength <= 0) return;
    const amount = clamp(strength, 0, 1);
    const r = Math.max(0, radius);
    const r2 = r * r;
    const minX = Math.max(0, Math.floor(x - r));
    const maxX = Math.min(this.width - 1, Math.ceil(x + r));
    const minY = Math.max(0, Math.floor(y - r));
    const maxY = Math.min(this.height - 1, Math.ceil(y + r));
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        if (dx * dx + dy * dy > r2) continue;
        const index = py * this.width + px;
        this.phases[index] = wrapTau(this.phases[index] * (1 - amount));
      }
    }
    this.writeState();
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.phases = new Float32Array(0);
    this.next = new Float32Array(0);
    this.frequencies = new Float32Array(0);
    this.state = new Float32Array(0);
  }

  private stepGlobal(): void {
    let sumCos = 0;
    let sumSin = 0;
    for (const phase of this.phases) {
      sumCos += Math.cos(phase);
      sumSin += Math.sin(phase);
    }
    const count = this.phases.length;
    const meanCos = sumCos / count;
    const meanSin = sumSin / count;
    const order = Math.hypot(meanCos, meanSin);
    const meanPhase = Math.atan2(meanSin, meanCos);
    for (let index = 0; index < count; index += 1) {
      const coupling = this.coupling * order * Math.sin(meanPhase - this.phases[index]);
      this.next[index] = this.advance(index, coupling);
    }
  }

  private stepLocal(): void {
    for (let y = 0; y < this.height; y += 1) {
      const up = (y + this.height - 1) % this.height;
      const down = (y + 1) % this.height;
      for (let x = 0; x < this.width; x += 1) {
        const left = (x + this.width - 1) % this.width;
        const right = (x + 1) % this.width;
        const index = y * this.width + x;
        const phase = this.phases[index];
        const coupling =
          (this.coupling / 4) *
          (Math.sin(this.phases[y * this.width + left] - phase) +
            Math.sin(this.phases[y * this.width + right] - phase) +
            Math.sin(this.phases[up * this.width + x] - phase) +
            Math.sin(this.phases[down * this.width + x] - phase));
        this.next[index] = this.advance(index, coupling);
      }
    }
  }

  private advance(index: number, coupling: number): number {
    const jitter = this.noise * (this.random() * 2 - 1);
    return wrapTau(
      this.phases[index] +
        this.timestep * (this.frequencies[index] + coupling + jitter),
    );
  }

  private writeState(): void {
    for (let index = 0; index < this.phases.length; index += 1) {
      this.state[index] = this.phases[index] / KURAMOTO_TAU;
    }
  }

  private random(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return this.rngState / 0x100000000;
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new KuramotoOscillatorsKernel();
    kernel.init(20, 14, { seed: 5 });
    const before = Array.from(kernel.readState());
    kernel.step(1 / 60);
    const state = kernel.readState();
    return state.length === 280 && state.every((value) => value >= 0 && value < 1) && state.some((value, index) => value !== before[index]);
  } catch {
    return false;
  }
}
