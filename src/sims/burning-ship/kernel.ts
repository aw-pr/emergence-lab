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

const DEFAULT_CENTER_X = -0.5;
const DEFAULT_CENTER_Y = -0.5;
const DEFAULT_ZOOM = 1;
const DEFAULT_MAX_ITERATIONS = 128;
const DEFAULT_PALETTE_PHASE = 0.15;
const DEFAULT_CYCLE_SPEED = 0.2;
const CHANNEL_COUNT = 1;
const ESCAPE_RADIUS_SQUARED = 4;
const BASE_VIEW_WIDTH = 3.4;

function wrap01(value: number): number {
  return value - Math.floor(value);
}

function boundedNumber(
  params: SimParams,
  descriptor: ParamDescriptor,
): number {
  const fallback =
    typeof descriptor.default === "number" ? descriptor.default : 0;
  const value = params[descriptor.key];
  const finite = typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
  const min = typeof descriptor.min === "number" ? descriptor.min : finite;
  const max = typeof descriptor.max === "number" ? descriptor.max : finite;

  return Math.min(max, Math.max(min, finite));
}

export class BurningShipKernel implements SimKernel {
  readonly name = "Burning Ship";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Escape"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "centerX",
      label: "Center X",
      type: "number",
      default: DEFAULT_CENTER_X,
      min: -2.2,
      max: 1.2,
      step: 0.001,
    },
    {
      key: "centerY",
      label: "Center Y",
      type: "number",
      default: DEFAULT_CENTER_Y,
      min: -2,
      max: 1,
      step: 0.001,
    },
    {
      key: "zoom",
      label: "Zoom",
      type: "number",
      default: DEFAULT_ZOOM,
      min: 0.25,
      max: 500,
      step: 0.01,
    },
    {
      key: "maxIterations",
      label: "Max iterations",
      type: "number",
      default: DEFAULT_MAX_ITERATIONS,
      min: 16,
      max: 512,
      step: 1,
    },
    {
      key: "palettePhase",
      label: "Palette phase",
      type: "number",
      default: DEFAULT_PALETTE_PHASE,
      min: 0,
      max: 1,
      step: 0.001,
    },
    {
      key: "cycleSpeed",
      label: "Cycle speed",
      type: "number",
      default: DEFAULT_CYCLE_SPEED,
      min: 0,
      max: 5,
      step: 0.001,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private base = new Float32Array(0);
  private phase = DEFAULT_PALETTE_PHASE;
  private cycleSpeed = DEFAULT_CYCLE_SPEED;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
      this.base = new Float32Array(length);
    } else {
      this.state.fill(0);
      this.base.fill(0);
    }

    const centerX = this.paramNumber(params, "centerX");
    const centerY = this.paramNumber(params, "centerY");
    const zoom = this.paramNumber(params, "zoom");
    const maxIterations = Math.max(
      1,
      Math.floor(this.paramNumber(params, "maxIterations")),
    );
    this.phase = wrap01(this.paramNumber(params, "palettePhase"));
    this.cycleSpeed = this.paramNumber(params, "cycleSpeed");

    this.computeEscapeField(centerX, centerY, zoom, maxIterations);
    this.writeStateFromBase();
  }

  step(dt: number): void {
    if (this.state.length === 0) {
      return;
    }

    this.phase = wrap01(this.phase + this.cycleSpeed * dt);
    this.writeStateFromBase();
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.base = new Float32Array(0);
    this.phase = DEFAULT_PALETTE_PHASE;
    this.cycleSpeed = DEFAULT_CYCLE_SPEED;
  }

  private paramNumber(params: SimParams, key: string): number {
    const descriptor = this.paramSchema.find((entry) => entry.key === key);
    if (descriptor === undefined) {
      return 0;
    }

    return boundedNumber(params, descriptor);
  }

  private computeEscapeField(
    centerX: number,
    centerY: number,
    zoom: number,
    maxIterations: number,
  ): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const widthScale = BASE_VIEW_WIDTH / zoom;
    const heightScale = widthScale * (this.height / this.width);
    const xDivisor = Math.max(1, this.width - 1);
    const yDivisor = Math.max(1, this.height - 1);

    for (let y = 0; y < this.height; y += 1) {
      const cImag = centerY + (y / yDivisor - 0.5) * heightScale;

      for (let x = 0; x < this.width; x += 1) {
        const cReal = centerX + (x / xDivisor - 0.5) * widthScale;
        const index = y * this.width + x;
        this.base[index] = this.escapeValue(cReal, cImag, maxIterations);
      }
    }
  }

  private escapeValue(
    cReal: number,
    cImag: number,
    maxIterations: number,
  ): number {
    let zReal = 0;
    let zImag = 0;
    let radiusSquared = 0;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const absReal = Math.abs(zReal);
      const absImag = Math.abs(zImag);
      const nextReal = absReal * absReal - absImag * absImag + cReal;
      const nextImag = 2 * absReal * absImag + cImag;

      zReal = nextReal;
      zImag = nextImag;
      radiusSquared = zReal * zReal + zImag * zImag;

      if (radiusSquared > ESCAPE_RADIUS_SQUARED) {
        return this.smoothEscape(iteration, radiusSquared, maxIterations);
      }
    }

    return 0;
  }

  private smoothEscape(
    iteration: number,
    radiusSquared: number,
    maxIterations: number,
  ): number {
    const logMagnitude = Math.log(Math.sqrt(radiusSquared));
    const smooth =
      iteration + 1 - Math.log(Math.max(logMagnitude, 1e-12)) / Math.LN2;

    if (!Number.isFinite(smooth)) {
      return iteration / maxIterations;
    }

    return Math.min(1, Math.max(0, smooth / maxIterations));
  }

  private writeStateFromBase(): void {
    for (let index = 0; index < this.state.length; index += 1) {
      this.state[index] = wrap01(this.base[index] + this.phase);
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new BurningShipKernel();
    kernel.init(48, 36, { cycleSpeed: 0.02 });

    const before = Array.from(kernel.readState());
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const value of before) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    if (max - min <= 0.01) {
      return false;
    }

    kernel.step(1);
    const after = kernel.readState();
    let changed = false;

    for (let index = 0; index < after.length; index += 1) {
      const value = after[index];
      if (value < 0 || value > 1) {
        return false;
      }
      if (value !== before[index]) {
        changed = true;
      }
    }

    return changed;
  } catch {
    return false;
  }
}
