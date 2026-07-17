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

// Pile size trades final size against whether the viewer ever sees the thing
// settle. Radius grows ~sqrt(grains) but the topples needed to relax grow far
// faster, and topples/second is CPU-bound, so raising "topples per step" buys
// nothing: it only trades frame rate for topples per frame. 3,000,000 grains
// wanted a radius of ~674 cells (wider than the grid, so it clipped) and was
// still a formless speckle after a minute of watching, because the terraces
// only resolve once the bulk has relaxed. This settles in well under a minute
// at a radius that fits the frame, which is what makes the terraces visible.
// Relaxation is bulk-toppling:
// each queue visit topples a cell floor(z/threshold) times at once, which the
// abelian property guarantees reaches the same stable state as one-at-a-time
// toppling. "Topples per step" therefore budgets cell relaxations per frame —
// it bounds frame cost while each relaxation moves arbitrarily many grains.
const DEFAULT_INITIAL_PILE = 450000;
const DEFAULT_TOPPLE_THRESHOLD = 4;
const DEFAULT_GRAINS_PER_STEP = 32;
const DEFAULT_TOPPLES_PER_STEP = 120000;
const MAX_INITIAL_PILE = 16000000;
const MAX_TOPPLES_PER_STEP = 2000000;
const CHANNEL_COUNT = 2;
const ACTIVITY_DECAY = 0.82;
const ACTIVITY_EPSILON = 0.01;

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

function boundedInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
}

export class AbelianSandpileKernel implements SimKernel {
  readonly name = "Abelian Sandpile";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Stable height", "Avalanche activity"] as const;
  readonly channelRanges = [[0, 1], [0, 1]] as const;
  readonly paramSchema = [
    {
      key: "initialPile",
      label: "Initial pile",
      type: "number",
      default: DEFAULT_INITIAL_PILE,
      min: 0,
      max: MAX_INITIAL_PILE,
      step: 50000,
    },
    {
      key: "toppleThreshold",
      label: "Topple threshold",
      type: "number",
      default: DEFAULT_TOPPLE_THRESHOLD,
      min: 2,
      max: 12,
      step: 1,
    },
    {
      key: "grainsPerStep",
      label: "Grains per step",
      type: "number",
      default: DEFAULT_GRAINS_PER_STEP,
      min: 0,
      max: 1000,
      step: 1,
    },
    {
      key: "topplesPerStep",
      label: "Topples per step",
      type: "number",
      default: DEFAULT_TOPPLES_PER_STEP,
      min: 1,
      max: MAX_TOPPLES_PER_STEP,
      step: 1000,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private grains = new Float32Array(0);
  private activity = new Float32Array(0);
  private state = new Float32Array(0);
  private queue = new Int32Array(0);
  private queued = new Uint8Array(0);
  private queueHead = 0;
  private queueTail = 0;
  private queueCount = 0;
  private toppleThreshold = DEFAULT_TOPPLE_THRESHOLD;
  private grainsPerStep = DEFAULT_GRAINS_PER_STEP;
  private topplesPerStep = DEFAULT_TOPPLES_PER_STEP;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const cellCount = this.width * this.height;
    const length = cellCount * this.channelCount;
    if (this.state.length !== length) {
      this.grains = new Float32Array(cellCount);
      this.activity = new Float32Array(cellCount);
      this.state = new Float32Array(length);
      this.queue = new Int32Array(cellCount);
      this.queued = new Uint8Array(cellCount);
    } else {
      this.grains.fill(0);
      this.activity.fill(0);
      this.state.fill(0);
      this.queued.fill(0);
    }

    this.queueHead = 0;
    this.queueTail = 0;
    this.queueCount = 0;
    this.toppleThreshold = boundedInteger(
      numberParam(params, "toppleThreshold", DEFAULT_TOPPLE_THRESHOLD),
      2,
      12,
    );
    this.grainsPerStep = boundedInteger(
      numberParam(params, "grainsPerStep", DEFAULT_GRAINS_PER_STEP),
      0,
      1000,
    );
    this.topplesPerStep = boundedInteger(
      numberParam(params, "topplesPerStep", DEFAULT_TOPPLES_PER_STEP),
      1,
      MAX_TOPPLES_PER_STEP,
    );

    if (length === 0) {
      return;
    }

    const centreX = Math.floor(this.width / 2);
    const centreY = Math.floor(this.height / 2);
    const centreIndex = centreY * this.width + centreX;
    this.grains[centreIndex] = boundedInteger(
      numberParam(params, "initialPile", DEFAULT_INITIAL_PILE),
      0,
      MAX_INITIAL_PILE,
    );
    this.enqueueIfUnstable(centreIndex);
    this.writeState();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    for (let index = 0; index < this.activity.length; index += 1) {
      const decayed = this.activity[index] * ACTIVITY_DECAY;
      this.activity[index] = decayed < ACTIVITY_EPSILON ? 0 : decayed;
    }

    const centreX = Math.floor(this.width / 2);
    const centreY = Math.floor(this.height / 2);
    const centreIndex = centreY * this.width + centreX;
    this.grains[centreIndex] += this.grainsPerStep;
    this.enqueueIfUnstable(centreIndex);

    for (
      let workDone = 0;
      workDone < this.topplesPerStep && this.queueCount > 0;
      workDone += 1
    ) {
      const index = this.queue[this.queueHead];
      this.queueHead = (this.queueHead + 1) % this.queue.length;
      this.queueCount -= 1;
      this.queued[index] = 0;

      const grains = this.grains[index];
      if (grains < this.toppleThreshold) {
        continue;
      }

      const bulk = Math.floor(grains / this.toppleThreshold);
      this.grains[index] = grains - bulk * this.toppleThreshold;
      const intensity = Math.min(1, Math.log2(bulk + 1) / 12);
      this.activity[index] = Math.max(this.activity[index], intensity);

      const x = index % this.width;
      if (x > 0) {
        this.addGrains(index - 1, bulk);
      }
      if (x < this.width - 1) {
        this.addGrains(index + 1, bulk);
      }
      if (index >= this.width) {
        this.addGrains(index - this.width, bulk);
      }
      if (index < this.width * (this.height - 1)) {
        this.addGrains(index + this.width, bulk);
      }
    }

    if (this.queueCount === 0) {
      this.queueHead = 0;
      this.queueTail = 0;
    }
    this.writeState();
  }

  readState(): Float32Array {
    return this.state;
  }

  /**
   * Pointer poke: pour a soft burst of grains into the disc under the cursor and
   * feed the touched cells into the existing topple queue, so relaxation happens
   * through step()'s bounded topple machinery rather than being applied here.
   * The per-cell pour clears the topple threshold at the centre so a cascade is
   * guaranteed. Bounds-clamped and allocation-free.
   */
  applyImpulse(x: number, y: number, radius: number, strength: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const s = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
    if (s <= 0) {
      return;
    }

    const centreX = Math.round(x);
    const centreY = Math.round(y);
    const r = Math.max(1, Math.round(radius));
    const radiusSq = r * r;
    const base = this.toppleThreshold + 4;

    for (let dy = -r; dy <= r; dy += 1) {
      const py = centreY + dy;
      if (py < 0 || py >= this.height) {
        continue;
      }
      for (let dx = -r; dx <= r; dx += 1) {
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) {
          continue;
        }
        const px = centreX + dx;
        if (px < 0 || px >= this.width) {
          continue;
        }
        const grains = Math.round(base * (1 - Math.sqrt(distSq) / r) * s);
        if (grains <= 0) {
          continue;
        }
        const index = py * this.width + px;
        this.grains[index] += grains;
        this.activity[index] = Math.max(
          this.activity[index],
          0.5 * (1 - Math.sqrt(distSq) / r) * s,
        );
        this.enqueueIfUnstable(index);
      }
    }
    this.writeState();
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.grains = new Float32Array(0);
    this.activity = new Float32Array(0);
    this.state = new Float32Array(0);
    this.queue = new Int32Array(0);
    this.queued = new Uint8Array(0);
    this.queueHead = 0;
    this.queueTail = 0;
    this.queueCount = 0;
  }

  private addGrains(index: number, count: number): void {
    this.grains[index] += count;
    this.enqueueIfUnstable(index);
  }

  private enqueueIfUnstable(index: number): void {
    if (
      this.grains[index] < this.toppleThreshold ||
      this.queued[index] === 1 ||
      this.queueCount >= this.queue.length
    ) {
      return;
    }

    this.queue[this.queueTail] = index;
    this.queueTail = (this.queueTail + 1) % this.queue.length;
    this.queueCount += 1;
    this.queued[index] = 1;
  }

  private writeState(): void {
    const stableMaximum = Math.max(1, this.toppleThreshold - 1);
    for (let cell = 0; cell < this.grains.length; cell += 1) {
      const offset = cell * CHANNEL_COUNT;
      this.state[offset] = (this.grains[cell] % this.toppleThreshold) / stableMaximum;
      this.state[offset + 1] = this.activity[cell];
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new AbelianSandpileKernel();
    kernel.init(32, 32, { initialPile: 256, topplesPerStep: 2000 });
    kernel.step(1);

    const state = kernel.readState();
    const centreX = 16;
    const centreY = 16;
    const centreCell = centreY * 32 + centreX;

    for (let cell = 0; cell < 32 * 32; cell += 1) {
      if (cell !== centreCell && state[cell * CHANNEL_COUNT] > 0) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
