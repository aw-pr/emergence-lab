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
const DEFAULT_MAX_WALK_STEPS = 400;
const DEFAULT_SPAWN_RADIUS = 0.05;
const DEFAULT_STICKINESS = 1;
const DEFAULT_SEED_COUNT = 1;
const CHANNEL_COUNT = 1;
const TWO_PI = Math.PI * 2;
/** Fraction of walk steps nudged radially toward the seed so every direction gets fed (prevents runaway single tendrils). */
const INWARD_BIAS = 0.15;
/** Stop feeding once the aggregate reaches this fraction of the usable radius, so it never pancakes on the boundary. */
const EDGE_STOP_FRACTION = 0.92;

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
      max: 4096,
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
  private centreX = 0;
  private centreY = 0;
  private maxRadius = 0;

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
      4096,
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
    this.centreX = Math.floor(this.width / 2);
    this.centreY = Math.floor(this.height / 2);
    this.maxRadius = 0;

    if (length === 0) {
      return;
    }

    this.seedCluster();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0 || this.clusterSize === 0) {
      return;
    }

    if (this.maxRadius >= this.maxGridRadius() * EDGE_STOP_FRACTION) {
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
    this.maxRadius = 0;
  }

  private seedCluster(): void {
    const centreX = this.centreX;
    const centreY = this.centreY;
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
    const gap = this.spawnGap();
    const ring = this.spawnRingRadius(gap);
    const killRadius = ring + Math.max(8, gap * 2);
    const killRadiusSq = killRadius * killRadius;

    let [x, y] = this.spawnPoint(walkerId, ring);

    for (let stepIndex = 0; stepIndex < this.maxWalkSteps; stepIndex += 1) {
      if (!this.inBounds(x, y)) {
        return;
      }

      const dx = x - this.centreX;
      const dy = y - this.centreY;
      if (dx * dx + dy * dy > killRadiusSq) {
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

  /** Gap, in cells, between the current cluster edge and the walker spawn ring. */
  private spawnGap(): number {
    const raw = Math.round(
      Math.min(this.width, this.height) * this.spawnRadius * 0.25,
    );
    return Math.max(2, Math.min(16, raw));
  }

  /** Largest spawn radius that still fits a centred circle inside the grid. */
  private maxGridRadius(): number {
    return Math.max(1, Math.floor(Math.min(this.width, this.height) / 2) - 1);
  }

  /** Spawn ring tracks the growing cluster: just outside its current radius. */
  private spawnRingRadius(gap: number): number {
    return Math.min(this.maxRadius + gap, this.maxGridRadius());
  }

  private spawnPoint(walkerId: number, ringRadius: number): [number, number] {
    const radius = Math.min(this.maxGridRadius(), Math.max(1, ringRadius));
    const angle = hashUnit(walkerId, this.width, this.height) * TWO_PI;
    const x = Math.round(this.centreX + radius * Math.cos(angle));
    const y = Math.round(this.centreY + radius * Math.sin(angle));

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
    const hash = hashUint32(walkerId, stepIndex, x + y * this.width);
    const drift = (hash & 0xffff) / 0x10000;

    if (drift < INWARD_BIAS) {
      const dx = this.centreX - x;
      const dy = this.centreY - y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const total = adx + ady;
      if (total > 0) {
        // Pick the inward axis weighted by its distance component, so the drift
        // points radially toward the seed (not snapped to a diagonal).
        const pick = ((hash >>> 16) / 0x10000) * total;
        if (pick < adx) {
          return dx >= 0 ? 0 : 1;
        }
        return dy >= 0 ? 2 : 3;
      }
    }

    return (hash >>> 16) & 3;
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

    const dx = x - this.centreX;
    const dy = y - this.centreY;
    const radius = Math.sqrt(dx * dx + dy * dy);
    if (radius > this.maxRadius) {
      this.maxRadius = radius;
    }
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
