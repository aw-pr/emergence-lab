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

const DEFAULT_INITIAL_PILE = 1500000;
const DEFAULT_TOPPLE_THRESHOLD = 4;
const DEFAULT_GRAINS_PER_STEP = 1;
const DEFAULT_TOPPLES_PER_STEP = 500000;
const MAX_INITIAL_PILE = 5000000;
const MAX_TOPPLES_PER_STEP = 500000;
const CHANNEL_COUNT = 1;

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
  readonly channelLabels = ["Grains"] as const;
  readonly channelRanges = [[0, 4]] as const;
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

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
      this.queue = new Int32Array(length);
      this.queued = new Uint8Array(length);
    } else {
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
    this.state[centreIndex] = boundedInteger(
      numberParam(params, "initialPile", DEFAULT_INITIAL_PILE),
      0,
      MAX_INITIAL_PILE,
    );
    this.enqueueIfUnstable(centreIndex);
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const centreX = Math.floor(this.width / 2);
    const centreY = Math.floor(this.height / 2);
    const centreIndex = centreY * this.width + centreX;
    this.state[centreIndex] += this.grainsPerStep;
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

      if (this.state[index] < this.toppleThreshold) {
        continue;
      }

      this.state[index] -= this.toppleThreshold;

      const x = index % this.width;
      if (x > 0) {
        this.addGrain(index - 1);
      }
      if (x < this.width - 1) {
        this.addGrain(index + 1);
      }
      if (index >= this.width) {
        this.addGrain(index - this.width);
      }
      if (index < this.width * (this.height - 1)) {
        this.addGrain(index + this.width);
      }

      this.enqueueIfUnstable(index);
    }

    if (this.queueCount === 0) {
      this.queueHead = 0;
      this.queueTail = 0;
    }
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.queue = new Int32Array(0);
    this.queued = new Uint8Array(0);
    this.queueHead = 0;
    this.queueTail = 0;
    this.queueCount = 0;
  }

  private addGrain(index: number): void {
    this.state[index] += 1;
    this.enqueueIfUnstable(index);
  }

  private enqueueIfUnstable(index: number): void {
    if (
      this.state[index] < this.toppleThreshold ||
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
}

export function selfTest(): boolean {
  try {
    const kernel = new AbelianSandpileKernel();
    kernel.init(32, 32, { initialPile: 256, topplesPerStep: 2000 });
    kernel.step(1);

    const state = kernel.readState();
    const centreX = 16;
    const centreY = 16;
    const centreIndex = centreY * 32 + centreX;

    for (let index = 0; index < state.length; index += 1) {
      if (index !== centreIndex && state[index] > 0) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
