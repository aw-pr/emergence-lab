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

const DEFAULT_BIRTH_MIN = 3;
const DEFAULT_BIRTH_MAX = 3;
const DEFAULT_SURVIVE_MIN = 2;
const DEFAULT_SURVIVE_MAX = 3;
const DEFAULT_SEED_DENSITY = 0.28;
// Pure Conway always relaxes into mostly-static "ash" within a couple of
// thousand generations. The spark periodically sprinkles a sparse layer of fresh
// cells, so the board keeps spawning gliders and activity indefinitely. Set the
// spark rate to 0 for purist B3/S23.
const DEFAULT_SPARK_RATE = 0.04;
const SPARK_INTERVAL = 24;
const CHANNEL_COUNT = 1;

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
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

function coordinateHash(x: number, y: number): number {
  let hash = Math.imul(x + 0x9e3779b9, 0x85ebca6b);
  hash ^= Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;

  return (hash >>> 0) / 0x100000000;
}

/** Deterministic per-cell, per-epoch unit value for the spark re-seed layer. */
function sparkHash(x: number, y: number, epoch: number): number {
  let hash = Math.imul(x + 0x7f4a7c15, 0x9e3779b1);
  hash ^= Math.imul(y + 0x165667b1, 0x85ebca6b);
  hash ^= Math.imul(epoch + 0x27d4eb2f, 0xc2b2ae35);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  hash = Math.imul(hash, 0x297a2d39);
  hash ^= hash >>> 15;

  return (hash >>> 0) / 0x100000000;
}

export class GameOfLifeKernel implements SimKernel {
  readonly name = "Conway's Game of Life";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Alive"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "birthMin",
      label: "Birth min",
      type: "number",
      default: DEFAULT_BIRTH_MIN,
      min: 0,
      max: 8,
      step: 1,
    },
    {
      key: "birthMax",
      label: "Birth max",
      type: "number",
      default: DEFAULT_BIRTH_MAX,
      min: 0,
      max: 8,
      step: 1,
    },
    {
      key: "surviveMin",
      label: "Survive min",
      type: "number",
      default: DEFAULT_SURVIVE_MIN,
      min: 0,
      max: 8,
      step: 1,
    },
    {
      key: "surviveMax",
      label: "Survive max",
      type: "number",
      default: DEFAULT_SURVIVE_MAX,
      min: 0,
      max: 8,
      step: 1,
    },
    {
      key: "seedDensity",
      label: "Seed density",
      type: "number",
      default: DEFAULT_SEED_DENSITY,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "sparkRate",
      label: "Spark rate",
      type: "number",
      default: DEFAULT_SPARK_RATE,
      min: 0,
      max: 0.2,
      step: 0.005,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private next = new Float32Array(0);
  private birthMin = DEFAULT_BIRTH_MIN;
  private birthMax = DEFAULT_BIRTH_MAX;
  private surviveMin = DEFAULT_SURVIVE_MIN;
  private surviveMax = DEFAULT_SURVIVE_MAX;
  private seedDensity = DEFAULT_SEED_DENSITY;
  private sparkRate = DEFAULT_SPARK_RATE;
  private stepCounter = 0;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
      this.next = new Float32Array(length);
    } else {
      this.state.fill(0);
      this.next.fill(0);
    }

    this.birthMin = boundedInteger(
      numberParam(params, "birthMin", DEFAULT_BIRTH_MIN),
      0,
      8,
    );
    this.birthMax = Math.max(
      this.birthMin,
      boundedInteger(numberParam(params, "birthMax", DEFAULT_BIRTH_MAX), 0, 8),
    );
    this.surviveMin = boundedInteger(
      numberParam(params, "surviveMin", DEFAULT_SURVIVE_MIN),
      0,
      8,
    );
    this.surviveMax = Math.max(
      this.surviveMin,
      boundedInteger(
        numberParam(params, "surviveMax", DEFAULT_SURVIVE_MAX),
        0,
        8,
      ),
    );
    this.seedDensity = boundedNumber(
      numberParam(params, "seedDensity", DEFAULT_SEED_DENSITY),
      0,
      1,
    );
    this.sparkRate = boundedNumber(
      numberParam(params, "sparkRate", DEFAULT_SPARK_RATE),
      0,
      0.2,
    );
    this.stepCounter = 0;

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = y * this.width + x;
        this.state[index] = coordinateHash(x, y) < this.seedDensity ? 1 : 0;
      }
    }
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const width = this.width;
    const height = this.height;
    const state = this.state;
    const next = this.next;
    const birthMin = this.birthMin;
    const birthMax = this.birthMax;
    const surviveMin = this.surviveMin;
    const surviveMax = this.surviveMax;

    for (let y = 0; y < height; y += 1) {
      const yUp = y === 0 ? height - 1 : y - 1;
      const yDown = y === height - 1 ? 0 : y + 1;

      for (let x = 0; x < width; x += 1) {
        const xLeft = x === 0 ? width - 1 : x - 1;
        const xRight = x === width - 1 ? 0 : x + 1;
        const index = y * width + x;

        const neighbours =
          state[yUp * width + xLeft] +
          state[yUp * width + x] +
          state[yUp * width + xRight] +
          state[y * width + xLeft] +
          state[y * width + xRight] +
          state[yDown * width + xLeft] +
          state[yDown * width + x] +
          state[yDown * width + xRight];
        const alive = state[index] === 1;
        const survives =
          alive && neighbours >= surviveMin && neighbours <= surviveMax;
        const born =
          !alive && neighbours >= birthMin && neighbours <= birthMax;

        next[index] = survives || born ? 1 : 0;
      }
    }

    this.stepCounter += 1;
    if (this.sparkRate > 0 && this.stepCounter % SPARK_INTERVAL === 0) {
      const epoch = (this.stepCounter / SPARK_INTERVAL) >>> 0;
      const rate = this.sparkRate;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          if (next[index] === 0 && sparkHash(x, y, epoch) < rate) {
            next[index] = 1;
          }
        }
      }
    }

    state.set(next);
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.next = new Float32Array(0);
    this.stepCounter = 0;
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new GameOfLifeKernel();
    kernel.init(32, 32, {});

    const before = Array.from(kernel.readState());
    for (let index = 0; index < 12; index += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    let changed = false;
    let alive = 0;

    for (let index = 0; index < state.length; index += 1) {
      if (state[index] !== before[index]) {
        changed = true;
      }
      if (state[index] === 1) {
        alive += 1;
      }
    }

    return changed && alive > 0;
  } catch {
    return false;
  }
}
