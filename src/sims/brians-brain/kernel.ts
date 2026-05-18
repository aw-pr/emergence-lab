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

const DEFAULT_BIRTH_COUNT = 2;
const DEFAULT_SEED_DENSITY = 0.22;
const DEFAULT_DYING_VALUE = 0.5;
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

export class BriansBrainKernel implements SimKernel {
  readonly name = "Brian's Brain";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["State"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "birthCount",
      label: "Birth count",
      type: "number",
      default: DEFAULT_BIRTH_COUNT,
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
      key: "dyingValue",
      label: "Dying value",
      type: "number",
      default: DEFAULT_DYING_VALUE,
      min: 0,
      max: 1,
      step: 0.01,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private next = new Float32Array(0);
  private birthCount = DEFAULT_BIRTH_COUNT;
  private seedDensity = DEFAULT_SEED_DENSITY;
  private dyingValue = DEFAULT_DYING_VALUE;

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

    this.birthCount = boundedInteger(
      numberParam(params, "birthCount", DEFAULT_BIRTH_COUNT),
      0,
      8,
    );
    this.seedDensity = boundedNumber(
      numberParam(params, "seedDensity", DEFAULT_SEED_DENSITY),
      0,
      1,
    );
    this.dyingValue = boundedNumber(
      numberParam(params, "dyingValue", DEFAULT_DYING_VALUE),
      0,
      1,
    );

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
    const birthCount = this.birthCount;
    const dyingValue = this.dyingValue;

    for (let y = 0; y < height; y += 1) {
      const yUp = y === 0 ? height - 1 : y - 1;
      const yDown = y === height - 1 ? 0 : y + 1;

      for (let x = 0; x < width; x += 1) {
        const xLeft = x === 0 ? width - 1 : x - 1;
        const xRight = x === width - 1 ? 0 : x + 1;
        const index = y * width + x;
        const current = state[index];

        if (current === 1) {
          next[index] = dyingValue;
          continue;
        }

        if (current === dyingValue) {
          next[index] = 0;
          continue;
        }

        const liveNeighbours =
          (state[yUp * width + xLeft] === 1 ? 1 : 0) +
          (state[yUp * width + x] === 1 ? 1 : 0) +
          (state[yUp * width + xRight] === 1 ? 1 : 0) +
          (state[y * width + xLeft] === 1 ? 1 : 0) +
          (state[y * width + xRight] === 1 ? 1 : 0) +
          (state[yDown * width + xLeft] === 1 ? 1 : 0) +
          (state[yDown * width + x] === 1 ? 1 : 0) +
          (state[yDown * width + xRight] === 1 ? 1 : 0);

        next[index] = liveNeighbours === birthCount ? 1 : 0;
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
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new BriansBrainKernel();
    kernel.init(40, 32, {});

    const before = Array.from(kernel.readState());
    for (let index = 0; index < 12; index += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    let changed = false;
    let active = 0;

    for (let index = 0; index < state.length; index += 1) {
      if (state[index] !== before[index]) {
        changed = true;
      }
      if (state[index] > 0) {
        active += 1;
      }
    }

    return changed && active > 0;
  } catch {
    return false;
  }
}
