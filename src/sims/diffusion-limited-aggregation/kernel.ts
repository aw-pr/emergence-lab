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

const DEFAULT_WALKERS_PER_STEP = 64;
const DEFAULT_MAX_WALK_STEPS = 256;
const DEFAULT_SPAWN_RADIUS = 0.05;
const DEFAULT_STICKINESS = 1;
const DEFAULT_SEED_COUNT = 1;
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

function hashUint32(a: number, b: number, c: number): number {
  let hash = Math.imul(a + 0x9e3779b9, 0x85ebca6b);
  hash ^= Math.imul(b + 0xc2b2ae35, 0x27d4eb2f);
  hash ^= Math.imul(c + 0x165667b1, 0x9e3779b1);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

function hashUnit(a: number, b: number, c: number): number {
  return hashUint32(a, b, c) / 0x100000000;
}

export class DiffusionLimitedAggregationKernel implements SimKernel {
  readonly name = "Diffusion-Limited Aggregation";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Cluster"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "walkersPerStep",
      label: "Walkers per step",
      type: "number",
      default: DEFAULT_WALKERS_PER_STEP,
      min: 0,
      max: 512,
      step: 1,
    },
    {
      key: "maxWalkSteps",
      label: "Max walk steps",
      type: "number",
      default: DEFAULT_MAX_WALK_STEPS,
      min: 1,
      max: 2048,
      step: 1,
    },
    {
      key: "spawnRadius",
      label: "Spawn radius",
      type: "number",
      default: DEFAULT_SPAWN_RADIUS,
      min: 0.05,
      max: 0.5,
      step: 0.01,
    },
    {
      key: "stickiness",
      label: "Stickiness",
      type: "number",
      default: DEFAULT_STICKINESS,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: "seedCount",
      label: "Seed count",
      type: "number",
      default: DEFAULT_SEED_COUNT,
      min: 1,
      max: 32,
      step: 1,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private walkersPerStep = DEFAULT_WALKERS_PER_STEP;
  private maxWalkSteps = DEFAULT_MAX_WALK_STEPS;
  private spawnRadius = DEFAULT_SPAWN_RADIUS;
  private stickiness = DEFAULT_STICKINESS;
  private seedCount = DEFAULT_SEED_COUNT;
  private walkerCursor = 0;
  private clusterSize = 0;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
    } else {
      this.state.fill(0);
    }

    this.walkersPerStep = boundedInteger(
      numberParam(params, "walkersPerStep", DEFAULT_WALKERS_PER_STEP),
      0,
      512,
    );
    this.maxWalkSteps = boundedInteger(
      numberParam(params, "maxWalkSteps", DEFAULT_MAX_WALK_STEPS),
      1,
      2048,
    );
    this.spawnRadius = boundedNumber(
      numberParam(params, "spawnRadius", DEFAULT_SPAWN_RADIUS),
      0.05,
      0.5,
    );
    this.stickiness = boundedNumber(
      numberParam(params, "stickiness", DEFAULT_STICKINESS),
      0,
      1,
    );
    this.seedCount = boundedInteger(
      numberParam(params, "seedCount", DEFAULT_SEED_COUNT),
      1,
      32,
    );
    this.walkerCursor = 0;
    this.clusterSize = 0;

    if (length === 0) {
      return;
    }

    this.seedCluster();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0 || this.clusterSize === 0) {
      return;
    }

    for (let walker = 0; walker < this.walkersPerStep; walker += 1) {
      this.launchWalker(this.walkerCursor);
      this.walkerCursor += 1;
    }
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.walkerCursor = 0;
    this.clusterSize = 0;
  }

  private seedCluster(): void {
    const centreX = Math.floor(this.width / 2);
    const centreY = Math.floor(this.height / 2);
    this.occupy(centreX, centreY);

    const offsets = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
      [2, 0],
      [0, 2],
      [-2, 0],
      [0, -2],
      [2, 1],
      [1, 2],
      [-1, 2],
      [-2, 1],
      [-2, -1],
      [-1, -2],
      [1, -2],
      [2, -1],
      [2, 2],
      [-2, 2],
      [-2, -2],
      [2, -2],
      [3, 0],
      [0, 3],
      [-3, 0],
      [0, -3],
      [3, 1],
      [1, 3],
      [-1, 3],
    ] as const;

    for (
      let index = 0;
      index < offsets.length && this.clusterSize < this.seedCount;
      index += 1
    ) {
      const [dx, dy] = offsets[index];
      this.occupy(centreX + dx, centreY + dy);
    }
  }

  private launchWalker(walkerId: number): void {
    let [x, y] = this.spawnPoint(walkerId);

    for (let stepIndex = 0; stepIndex < this.maxWalkSteps; stepIndex += 1) {
      if (!this.inBounds(x, y)) {
        return;
      }

      if (this.isEmpty(x, y) && this.hasOccupiedNeighbour(x, y)) {
        const threshold = hashUnit(walkerId, stepIndex, this.clusterSize);
        if (threshold < this.stickiness) {
          this.occupy(x, y);
          return;
        }
      }

      const direction = this.walkDirection(walkerId, stepIndex, x, y);
      if (direction === 0) {
        x += 1;
      } else if (direction === 1) {
        x -= 1;
      } else if (direction === 2) {
        y += 1;
      } else {
        y -= 1;
      }
    }
  }

  private spawnPoint(walkerId: number): [number, number] {
    const centreX = Math.floor(this.width / 2);
    const centreY = Math.floor(this.height / 2);
    const radius = Math.max(
      1,
      Math.floor(Math.min(this.width, this.height) * this.spawnRadius),
    );
    const perimeter = Math.max(1, radius * 8);
    const position = hashUint32(walkerId, this.width, this.height) % perimeter;

    let x = centreX;
    let y = centreY;
    const side = Math.floor(position / (radius * 2));
    const offset = (position % (radius * 2)) - radius;

    if (side === 0) {
      x += offset;
      y -= radius;
    } else if (side === 1) {
      x += radius;
      y += offset;
    } else if (side === 2) {
      x -= offset;
      y += radius;
    } else {
      x -= radius;
      y -= offset;
    }

    return [
      Math.max(0, Math.min(this.width - 1, x)),
      Math.max(0, Math.min(this.height - 1, y)),
    ];
  }

  private walkDirection(
    walkerId: number,
    stepIndex: number,
    x: number,
    y: number,
  ): number {
    return hashUint32(walkerId, stepIndex, x + y * this.width) & 3;
  }

  private occupy(x: number, y: number): void {
    if (!this.inBounds(x, y)) {
      return;
    }

    const index = y * this.width + x;
    if (this.state[index] === 1) {
      return;
    }

    this.state[index] = 1;
    this.clusterSize += 1;
  }

  private isEmpty(x: number, y: number): boolean {
    return this.state[y * this.width + x] === 0;
  }

  private hasOccupiedNeighbour(x: number, y: number): boolean {
    return (
      (x > 0 && this.state[y * this.width + x - 1] === 1) ||
      (x < this.width - 1 && this.state[y * this.width + x + 1] === 1) ||
      (y > 0 && this.state[(y - 1) * this.width + x] === 1) ||
      (y < this.height - 1 && this.state[(y + 1) * this.width + x] === 1)
    );
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new DiffusionLimitedAggregationKernel();
    kernel.init(32, 32, {
      walkersPerStep: 96,
      maxWalkSteps: 384,
      spawnRadius: 0.32,
      stickiness: 1,
      seedCount: 1,
    });

    const initialCluster = Array.from(kernel.readState()).reduce(
      (sum, value) => sum + value,
      0,
    );
    for (let index = 0; index < 8; index += 1) {
      kernel.step(1);
    }
    const grownCluster = Array.from(kernel.readState()).reduce(
      (sum, value) => sum + value,
      0,
    );

    return grownCluster > initialCluster;
  } catch {
    return false;
  }
}
