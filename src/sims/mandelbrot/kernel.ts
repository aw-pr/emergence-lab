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
const DEFAULT_CENTER_Y = 0;
const DEFAULT_ZOOM = 1;
const DEFAULT_MAX_ITERATIONS = 128;
const DEFAULT_PALETTE_PHASE = 0;
const DEFAULT_CYCLE_SPEED = 0.01;
const CHANNEL_COUNT = 1;

function boundedNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function boundedInteger(value: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, min, max));
}

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

function wrap01(value: number): number {
  return value - Math.floor(value);
}

export class MandelbrotKernel implements SimKernel {
  readonly name = "Mandelbrot";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Escape"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "centerX",
      label: "Center X",
      type: "number",
      default: DEFAULT_CENTER_X,
      min: -2,
      max: 1,
      step: 0.001,
    },
    {
      key: "centerY",
      label: "Center Y",
      type: "number",
      default: DEFAULT_CENTER_Y,
      min: -1.5,
      max: 1.5,
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
      max: 0.08,
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

    const centerX = boundedNumber(
      numberParam(params, "centerX", DEFAULT_CENTER_X),
      -2,
      1,
    );
    const centerY = boundedNumber(
      numberParam(params, "centerY", DEFAULT_CENTER_Y),
      -1.5,
      1.5,
    );
    const zoom = boundedNumber(numberParam(params, "zoom", DEFAULT_ZOOM), 0.25, 500);
    const maxIterations = boundedInteger(
      numberParam(params, "maxIterations", DEFAULT_MAX_ITERATIONS),
      16,
      512,
    );
    this.phase = boundedNumber(
      numberParam(params, "palettePhase", DEFAULT_PALETTE_PHASE),
      0,
      1,
    );
    this.cycleSpeed = boundedNumber(
      numberParam(params, "cycleSpeed", DEFAULT_CYCLE_SPEED),
      0,
      0.08,
    );

    this.computeBase(centerX, centerY, zoom, maxIterations);
    this.writeStateFromBase();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    this.phase = wrap01(this.phase + this.cycleSpeed);
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

  private computeBase(
    centerX: number,
    centerY: number,
    zoom: number,
    maxIterations: number,
  ): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const width = this.width;
    const height = this.height;
    const scale = 3 / (Math.min(width, height) * zoom);

    for (let y = 0; y < height; y += 1) {
      const cy = centerY + (y - (height - 1) / 2) * scale;

      for (let x = 0; x < width; x += 1) {
        const cx = centerX + (x - (width - 1) / 2) * scale;
        let zx = 0;
        let zy = 0;
        let iteration = 0;

        while (iteration < maxIterations && zx * zx + zy * zy <= 4) {
          const nextX = zx * zx - zy * zy + cx;
          zy = 2 * zx * zy + cy;
          zx = nextX;
          iteration += 1;
        }

        const index = y * width + x;
        if (iteration >= maxIterations) {
          this.base[index] = 0;
          continue;
        }

        const magnitude = Math.sqrt(zx * zx + zy * zy);
        const smooth = iteration + 1 - Math.log2(Math.log2(magnitude));
        this.base[index] = boundedNumber(smooth / maxIterations, 0, 1);
      }
    }
  }

  private writeStateFromBase(): void {
    for (let index = 0; index < this.state.length; index += 1) {
      const base = this.base[index];
      this.state[index] = base === 0 ? 0 : wrap01(base + this.phase);
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new MandelbrotKernel();
    kernel.init(48, 32, { cycleSpeed: 0.02 });

    const before = Array.from(kernel.readState());
    kernel.step(1);
    const after = kernel.readState();
    let changed = false;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < after.length; index += 1) {
      const value = after[index];
      if (value !== before[index]) {
        changed = true;
      }
      min = Math.min(min, value);
      max = Math.max(max, value);
      if (value < 0 || value > 1) {
        return false;
      }
    }

    return changed && min < max;
  } catch {
    return false;
  }
}
