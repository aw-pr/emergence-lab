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

const DEFAULT_RULE = 30;
const DEFAULT_SEED_MODE = 0;
const DEFAULT_STEPS_PER_FRAME = 1;
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

  return Math.max(min, Math.min(max, Math.round(value)));
}

function coordinateHash(x: number): number {
  let hash = Math.imul(x + 0x9e3779b9, 0x85ebca6b);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;

  return (hash >>> 0) / 0x100000000;
}

export class ElementaryCellularAutomataKernel implements SimKernel {
  readonly name = "Elementary Cellular Automata";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["State"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "rule",
      label: "Rule",
      type: "number",
      default: DEFAULT_RULE,
      min: 0,
      max: 255,
      step: 1,
    },
    {
      key: "seedMode",
      label: "Seed mode",
      type: "number",
      default: DEFAULT_SEED_MODE,
      min: 0,
      max: 2,
      step: 1,
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: DEFAULT_STEPS_PER_FRAME,
      min: 1,
      max: 32,
      step: 1,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private currentRow = new Uint8Array(0);
  private nextRow = new Uint8Array(0);
  private rule = DEFAULT_RULE;
  private seedMode = DEFAULT_SEED_MODE;
  private stepsPerFrame = DEFAULT_STEPS_PER_FRAME;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
    } else {
      this.state.fill(0);
    }

    if (this.currentRow.length !== this.width) {
      this.currentRow = new Uint8Array(this.width);
      this.nextRow = new Uint8Array(this.width);
    } else {
      this.currentRow.fill(0);
      this.nextRow.fill(0);
    }

    this.rule = boundedInteger(numberParam(params, "rule", DEFAULT_RULE), 0, 255);
    this.seedMode = boundedInteger(
      numberParam(params, "seedMode", DEFAULT_SEED_MODE),
      0,
      2,
    );
    this.stepsPerFrame = boundedInteger(
      numberParam(params, "stepsPerFrame", DEFAULT_STEPS_PER_FRAME),
      1,
      32,
    );

    this.seedCurrentRow();
    this.writeTopRow(this.currentRow);
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    for (let index = 0; index < this.stepsPerFrame; index += 1) {
      this.computeNextRow();
      this.scrollHistory();
      this.writeTopRow(this.nextRow);

      const previous = this.currentRow;
      this.currentRow = this.nextRow;
      this.nextRow = previous;
    }
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.currentRow = new Uint8Array(0);
    this.nextRow = new Uint8Array(0);
  }

  private seedCurrentRow(): void {
    if (this.width === 0) {
      return;
    }

    if (this.seedMode === 0) {
      this.currentRow[Math.floor(this.width / 2)] = 1;
      return;
    }

    for (let x = 0; x < this.width; x += 1) {
      if (this.seedMode === 1) {
        this.currentRow[x] = coordinateHash(x) < 0.22 ? 1 : 0;
      } else {
        this.currentRow[x] = (x % 6 === 1 || x % 6 === 2 || x % 6 === 4) ? 1 : 0;
      }
    }
  }

  private computeNextRow(): void {
    const width = this.width;
    const currentRow = this.currentRow;
    const nextRow = this.nextRow;
    const rule = this.rule;

    for (let x = 0; x < width; x += 1) {
      const left = currentRow[x === 0 ? width - 1 : x - 1];
      const centre = currentRow[x];
      const right = currentRow[x === width - 1 ? 0 : x + 1];
      const neighbourhood = (left << 2) | (centre << 1) | right;

      nextRow[x] = (rule >> neighbourhood) & 1;
    }
  }

  private scrollHistory(): void {
    const rowLength = this.width * this.channelCount;
    if (this.height <= 1 || rowLength === 0) {
      return;
    }

    this.state.copyWithin(rowLength, 0, rowLength * (this.height - 1));
  }

  private writeTopRow(row: Uint8Array): void {
    for (let x = 0; x < this.width; x += 1) {
      this.state[x] = row[x];
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new ElementaryCellularAutomataKernel();
    kernel.init(33, 24, {});

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
      if (state[index] !== 0 && state[index] !== 1) {
        return false;
      }
    }

    return changed && alive > 0;
  } catch {
    return false;
  }
}
