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
  applyImpulse?(x: number, y: number, radius: number, strength: number): void;
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
const DEFAULT_AGE_SHADING = true;

// Age-shading presentation constants. These only affect the emitted float per
// cell; the underlying alive/dead boolean evolution is unchanged regardless
// of this setting (see ageShading tests).
const AGE_MATURITY = 80; // generations to reach full brightness saturation
const AGE_BASE = 0.55; // newborn emission, just above the binary bright threshold
const AGE_SPAN = 0.45; // additional brightness gained as a cell matures
const GHOST_BASE = 0.35; // emission the instant a cell dies
const GHOST_DECAY = 0.7; // per-generation decay multiplier for the ghost trail
const GHOST_MAX_TICKS = 20; // beyond this the ghost is indistinguishable from 0
const GHOST_EPSILON = 0.001;

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

function booleanParam(
  params: SimParams,
  key: string,
  fallback: boolean,
): boolean {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
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

/** Presentation-only mapping from (alive, age, ghostTicks) to the emitted float. */
function shadeCell(
  isAlive: boolean,
  age: number,
  ghostTicks: number,
  ageShading: boolean,
): number {
  if (!ageShading) {
    return isAlive ? 1 : 0;
  }

  if (isAlive) {
    return AGE_BASE + AGE_SPAN * Math.min(1, age / AGE_MATURITY);
  }

  if (ghostTicks > GHOST_MAX_TICKS) {
    return 0;
  }

  const value = GHOST_BASE * Math.pow(GHOST_DECAY, ghostTicks);
  return value < GHOST_EPSILON ? 0 : value;
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
    {
      key: "ageShading",
      label: "Age shading",
      type: "boolean",
      default: DEFAULT_AGE_SHADING,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  // Canonical boolean (0/1) alive grid, double-buffered. This drives the
  // B/S rule and is independent of what gets emitted to the renderer.
  private alive = new Float32Array(0);
  private aliveNext = new Float32Array(0);
  // Per-cell presentation state: generations continuously alive, and steps
  // since death (for the ghost decay trail). Both are internal only.
  private age = new Float32Array(0);
  private ghostTicks = new Float32Array(0);
  // Stable buffer returned by readState(); never reallocated except on resize.
  private output = new Float32Array(0);
  private birthMin = DEFAULT_BIRTH_MIN;
  private birthMax = DEFAULT_BIRTH_MAX;
  private surviveMin = DEFAULT_SURVIVE_MIN;
  private surviveMax = DEFAULT_SURVIVE_MAX;
  private seedDensity = DEFAULT_SEED_DENSITY;
  private sparkRate = DEFAULT_SPARK_RATE;
  private ageShading = DEFAULT_AGE_SHADING;
  private stepCounter = 0;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.alive.length !== length) {
      this.alive = new Float32Array(length);
      this.aliveNext = new Float32Array(length);
      this.age = new Float32Array(length);
      this.ghostTicks = new Float32Array(length);
      this.output = new Float32Array(length);
    } else {
      this.alive.fill(0);
      this.aliveNext.fill(0);
      this.age.fill(0);
      this.ghostTicks.fill(GHOST_MAX_TICKS + 1);
      this.output.fill(0);
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
    this.ageShading = booleanParam(
      params,
      "ageShading",
      DEFAULT_AGE_SHADING,
    );
    this.stepCounter = 0;

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = y * this.width + x;
        const isAlive = coordinateHash(x, y) < this.seedDensity;
        this.alive[index] = isAlive ? 1 : 0;
        this.age[index] = 0;
        this.ghostTicks[index] = GHOST_MAX_TICKS + 1;
        this.output[index] = shadeCell(isAlive, 0, GHOST_MAX_TICKS + 1, this.ageShading);
      }
    }
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const width = this.width;
    const height = this.height;
    const alive = this.alive;
    const aliveNext = this.aliveNext;
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
          alive[yUp * width + xLeft] +
          alive[yUp * width + x] +
          alive[yUp * width + xRight] +
          alive[y * width + xLeft] +
          alive[y * width + xRight] +
          alive[yDown * width + xLeft] +
          alive[yDown * width + x] +
          alive[yDown * width + xRight];
        const wasAlive = alive[index] === 1;
        const survives =
          wasAlive && neighbours >= surviveMin && neighbours <= surviveMax;
        const born =
          !wasAlive && neighbours >= birthMin && neighbours <= birthMax;

        aliveNext[index] = survives || born ? 1 : 0;
      }
    }

    this.stepCounter += 1;
    if (this.sparkRate > 0 && this.stepCounter % SPARK_INTERVAL === 0) {
      const epoch = (this.stepCounter / SPARK_INTERVAL) >>> 0;
      const rate = this.sparkRate;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          if (aliveNext[index] === 0 && sparkHash(x, y, epoch) < rate) {
            aliveNext[index] = 1;
          }
        }
      }
    }

    const age = this.age;
    const ghostTicks = this.ghostTicks;
    const output = this.output;
    const ageShading = this.ageShading;
    const length = width * height;

    for (let index = 0; index < length; index += 1) {
      const wasAlive = alive[index] === 1;
      const isAlive = aliveNext[index] === 1;

      if (isAlive) {
        age[index] = wasAlive ? age[index] + 1 : 0;
        ghostTicks[index] = GHOST_MAX_TICKS + 1;
      } else {
        age[index] = 0;
        if (wasAlive) {
          ghostTicks[index] = 0;
        } else if (ghostTicks[index] <= GHOST_MAX_TICKS) {
          ghostTicks[index] += 1;
        }
      }

      output[index] = shadeCell(isAlive, age[index], ghostTicks[index], ageShading);
    }

    alive.set(aliveNext);
  }

  readState(): Float32Array {
    return this.output;
  }

  /**
   * Pointer poke: paint live cells inside the brush disc as fresh newborns (age
   * reset, ghost trail cleared) so the drawn shape immediately becomes seed for
   * the B/S rule on the next step. Strength scales the effective brush radius.
   * Writes both the canonical alive grid and the presentation output so a paused
   * board shows the paint at once. Bounds-clamped and allocation-free.
   */
  applyImpulse(x: number, y: number, radius: number, strength: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const s = boundedNumber(strength, 0, 1);
    if (s <= 0) {
      return;
    }

    const centreX = Math.round(x);
    const centreY = Math.round(y);
    const r = Math.max(1, Math.round(radius * s));
    const radiusSq = r * r;
    const newborn = shadeCell(true, 0, GHOST_MAX_TICKS + 1, this.ageShading);

    for (let dy = -r; dy <= r; dy += 1) {
      const py = centreY + dy;
      if (py < 0 || py >= this.height) {
        continue;
      }
      for (let dx = -r; dx <= r; dx += 1) {
        if (dx * dx + dy * dy > radiusSq) {
          continue;
        }
        const px = centreX + dx;
        if (px < 0 || px >= this.width) {
          continue;
        }
        const index = py * this.width + px;
        this.alive[index] = 1;
        this.age[index] = 0;
        this.ghostTicks[index] = GHOST_MAX_TICKS + 1;
        this.output[index] = newborn;
      }
    }
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.alive = new Float32Array(0);
    this.aliveNext = new Float32Array(0);
    this.age = new Float32Array(0);
    this.ghostTicks = new Float32Array(0);
    this.output = new Float32Array(0);
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
      if (state[index] >= 0.5) {
        alive += 1;
      }
    }

    return changed && alive > 0;
  } catch {
    return false;
  }
}
