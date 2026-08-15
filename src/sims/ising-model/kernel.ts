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

const DEFAULT_TEMPERATURE = 2.269;
const DEFAULT_COUPLING = 1;
const DEFAULT_FIELD = 0;
const DEFAULT_SWEEPS = 0.35;
const DEFAULT_INITIAL_STATE = "random";

function numberParam(params: SimParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function seedFrom(params: SimParams): number {
  const value = numberParam(params, "seed", 1);
  return (Math.floor(value) >>> 0) || 1;
}

export class IsingModelKernel {
  readonly name = "2D Ising Model";
  readonly channelCount = 1;
  readonly channelLabels = ["Spin"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    { key: "temperature", label: "Temperature", type: "number", default: DEFAULT_TEMPERATURE, min: 0.1, max: 5, step: 0.01, group: "Physics", info: "How much thermal noise fights the spins' tendency to align. Near the default 2.269 (the critical point) domains form and dissolve constantly; low values freeze into solid blocks, high values dissolve into static." },
    { key: "coupling", label: "Coupling", type: "number", default: DEFAULT_COUPLING, min: 0.1, max: 2, step: 0.01, group: "Physics", info: "Strength of the pull between neighbouring spins to align. Higher values make domains form faster and grow larger before temperature breaks them up." },
    { key: "externalField", label: "External field", type: "number", default: DEFAULT_FIELD, min: -2, max: 2, step: 0.01, group: "Physics", info: "A uniform bias pulling every spin towards one state. Away from zero it steadily tips the board towards all-up or all-down instead of balanced domains." },
    { key: "sweepsPerStep", label: "Updates per frame", type: "number", default: DEFAULT_SWEEPS, min: 0.05, max: 4, step: 0.05, info: "How many spin-flip attempts run per cell, per frame. Higher values speed up domain evolution at the cost of more work per frame." },
    { key: "initialState", label: "Initial state", type: "enum", default: DEFAULT_INITIAL_STATE, options: ["random", "up", "down", "checkerboard"], info: "Starting spin layout: random noise, uniform up, uniform down, or an alternating checkerboard. Only takes effect on the next reset; the sim evolves away from it either way." },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private spins = new Int8Array(0);
  private state = new Float32Array(0);
  private temperature = DEFAULT_TEMPERATURE;
  private coupling = DEFAULT_COUPLING;
  private externalField = DEFAULT_FIELD;
  private sweepsPerStep = DEFAULT_SWEEPS;
  private attemptRemainder = 0;
  private rngState = 1;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    const length = this.width * this.height;
    if (this.spins.length !== length) {
      this.spins = new Int8Array(length);
      this.state = new Float32Array(length);
    }

    this.temperature = clamp(numberParam(params, "temperature", DEFAULT_TEMPERATURE), 0.1, 5);
    this.coupling = clamp(numberParam(params, "coupling", DEFAULT_COUPLING), 0.1, 2);
    this.externalField = clamp(numberParam(params, "externalField", DEFAULT_FIELD), -2, 2);
    this.sweepsPerStep = clamp(numberParam(params, "sweepsPerStep", DEFAULT_SWEEPS), 0.05, 4);
    this.rngState = seedFrom(params);
    this.attemptRemainder = 0;

    const requested = params.initialState;
    const initial =
      requested === "up" || requested === "down" || requested === "checkerboard"
        ? requested
        : DEFAULT_INITIAL_STATE;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = y * this.width + x;
        let spin = 1;
        if (initial === "down") spin = -1;
        else if (initial === "checkerboard") spin = (x + y) % 2 === 0 ? 1 : -1;
        else if (initial === "random") spin = this.random() < 0.5 ? -1 : 1;
        this.spins[index] = spin;
      }
    }
    this.writeState();
  }

  step(_dt: number): void {
    const cells = this.spins.length;
    if (cells === 0) return;
    const target = cells * this.sweepsPerStep + this.attemptRemainder;
    const attempts = Math.floor(target);
    this.attemptRemainder = target - attempts;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const index = Math.floor(this.random() * cells);
      const x = index % this.width;
      const y = Math.floor(index / this.width);
      const left = this.spins[y * this.width + ((x + this.width - 1) % this.width)];
      const right = this.spins[y * this.width + ((x + 1) % this.width)];
      const up = this.spins[((y + this.height - 1) % this.height) * this.width + x];
      const down = this.spins[((y + 1) % this.height) * this.width + x];
      const spin = this.spins[index];
      const deltaEnergy = 2 * spin * (this.coupling * (left + right + up + down) + this.externalField);
      if (deltaEnergy <= 0 || this.random() < Math.exp(-deltaEnergy / this.temperature)) {
        this.spins[index] = -spin;
      }
    }
    this.writeState();
  }

  readState(): Float32Array {
    return this.state;
  }

  applyImpulse(x: number, y: number, radius: number, strength: number): void {
    if (this.spins.length === 0 || strength <= 0) return;
    const r = Math.max(0, radius * clamp(strength, 0, 1));
    const r2 = r * r;
    const minX = Math.max(0, Math.floor(x - r));
    const maxX = Math.min(this.width - 1, Math.ceil(x + r));
    const minY = Math.max(0, Math.floor(y - r));
    const maxY = Math.min(this.height - 1, Math.ceil(y + r));
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        if (dx * dx + dy * dy <= r2) this.spins[py * this.width + px] = 1;
      }
    }
    this.writeState();
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.spins = new Int8Array(0);
    this.state = new Float32Array(0);
    this.attemptRemainder = 0;
  }

  private writeState(): void {
    for (let index = 0; index < this.spins.length; index += 1) {
      this.state[index] = this.spins[index] > 0 ? 1 : 0;
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
    const kernel = new IsingModelKernel();
    kernel.init(24, 16, { seed: 7 });
    const before = Array.from(kernel.readState());
    kernel.step(1 / 60);
    const after = kernel.readState();
    return after.length === 384 && after.some((value, index) => value !== before[index]);
  } catch {
    return false;
  }
}
