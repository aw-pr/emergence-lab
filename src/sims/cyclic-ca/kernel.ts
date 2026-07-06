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

const DEFAULT_STATES = 14;
const DEFAULT_THRESHOLD = 1;
const DEFAULT_NEIGHBOURHOOD = "moore";
const DEFAULT_STEPS_PER_FRAME = 1;
const CHANNEL_COUNT = 1;

// Moore: all eight surrounding cells. Von Neumann: the four orthogonal
// neighbours only (no diagonals).
const MOORE_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const VON_NEUMANN_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

function stringParam(
  params: SimParams,
  key: string,
  fallback: string,
): string {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

function boundedNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function boundedInteger(value: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, min, max));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

export class CyclicCaKernel implements SimKernel {
  readonly name = "Cyclic Cellular Automaton";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["State"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "states",
      label: "States",
      type: "number",
      default: DEFAULT_STATES,
      min: 3,
      max: 24,
      step: 1,
    },
    {
      key: "threshold",
      label: "Threshold",
      type: "number",
      default: DEFAULT_THRESHOLD,
      min: 1,
      max: 4,
      step: 1,
    },
    {
      key: "neighbourhood",
      label: "Neighbourhood",
      type: "enum",
      default: DEFAULT_NEIGHBOURHOOD,
      options: ["moore", "vonNeumann"],
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: DEFAULT_STEPS_PER_FRAME,
      min: 1,
      max: 8,
      step: 1,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  /** Raw integer cell state in 0..states-1, stored as float for buffer reuse. */
  private state = new Float32Array(0);
  private next = new Float32Array(0);
  /** Stable pre-allocated buffer returned by readState(), scaled to [0, 1]. */
  private output = new Float32Array(0);
  private states = DEFAULT_STATES;
  private threshold = DEFAULT_THRESHOLD;
  private neighbourhood: "moore" | "vonNeumann" = DEFAULT_NEIGHBOURHOOD;
  private stepsPerFrame = DEFAULT_STEPS_PER_FRAME;
  private seed = 0;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
      this.next = new Float32Array(length);
      this.output = new Float32Array(length);
    } else {
      this.state.fill(0);
      this.next.fill(0);
      this.output.fill(0);
    }

    this.states = boundedInteger(
      numberParam(params, "states", DEFAULT_STATES),
      3,
      24,
    );
    this.threshold = boundedInteger(
      numberParam(params, "threshold", DEFAULT_THRESHOLD),
      1,
      4,
    );
    const neighbourhoodParam = stringParam(
      params,
      "neighbourhood",
      DEFAULT_NEIGHBOURHOOD,
    );
    this.neighbourhood =
      neighbourhoodParam === "vonNeumann" ? "vonNeumann" : "moore";
    this.stepsPerFrame = boundedInteger(
      numberParam(params, "stepsPerFrame", DEFAULT_STEPS_PER_FRAME),
      1,
      8,
    );
    this.seed = numberParam(params, "seed", 0) | 0;

    const seed =
      (Math.imul(this.width, 73856093) ^
        Math.imul(this.height, 19349663) ^
        Math.imul(this.states, 83492791) ^
        Math.imul(this.seed, 0x9e3779b1)) >>>
      0;
    const random = mulberry32(seed);

    for (let index = 0; index < length; index += 1) {
      this.state[index] = Math.floor(random() * this.states) % this.states;
    }

    this.writeOutput();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    for (let iteration = 0; iteration < this.stepsPerFrame; iteration += 1) {
      this.stepOnce();
    }

    this.writeOutput();
  }

  private stepOnce(): void {
    const width = this.width;
    const height = this.height;
    const state = this.state;
    const next = this.next;
    const states = this.states;
    const threshold = this.threshold;
    const offsets =
      this.neighbourhood === "moore" ? MOORE_OFFSETS : VON_NEUMANN_OFFSETS;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const current = state[index];
        const target = (current + 1) % states;

        let count = 0;
        for (let i = 0; i < offsets.length; i += 1) {
          const [dx, dy] = offsets[i];
          let nx = x + dx;
          if (nx < 0) nx = width - 1;
          else if (nx >= width) nx = 0;
          let ny = y + dy;
          if (ny < 0) ny = height - 1;
          else if (ny >= height) ny = 0;

          if (state[ny * width + nx] === target) {
            count += 1;
          }
        }

        next[index] = count >= threshold ? target : current;
      }
    }

    this.state.set(next);
  }

  private writeOutput(): void {
    const denominator = Math.max(1, this.states - 1);
    for (let index = 0; index < this.state.length; index += 1) {
      this.output[index] = this.state[index] / denominator;
    }
  }

  readState(): Float32Array {
    return this.output;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.next = new Float32Array(0);
    this.output = new Float32Array(0);
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new CyclicCaKernel();
    kernel.init(48, 48, {});

    const before = Array.from(kernel.readState());
    for (let index = 0; index < 40; index += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    let changed = false;
    let inRange = true;

    for (let index = 0; index < state.length; index += 1) {
      if (state[index] !== before[index]) {
        changed = true;
      }
      if (state[index] < 0 || state[index] > 1) {
        inRange = false;
      }
    }

    return changed && inRange;
  } catch {
    return false;
  }
}
