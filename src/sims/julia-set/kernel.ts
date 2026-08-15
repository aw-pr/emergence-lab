import {
  effectiveIterationLimit,
  MAX_BASE_ITERATIONS,
  MAX_FRACTAL_ZOOM,
} from "../fractal/detail.js";

type ParamDescriptor = {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  info?: string;
  group?: string;
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

const DEFAULT_C_RE = -0.4;
const DEFAULT_C_IM = 0.6;
const DEFAULT_CENTER_X = 0;
const DEFAULT_CENTER_Y = 0;
const DEFAULT_ZOOM = 1.45;
const DEFAULT_MAX_ITERATIONS = 180;
const DEFAULT_AUTO_ITERATIONS = true;
const DEFAULT_PALETTE_PHASE = 0.38;
const DEFAULT_CYCLE_SPEED = 0.1;
const CHANNEL_COUNT = 1;
const BASE_VIEW_HEIGHT = 3;
const ESCAPE_RADIUS_SQUARED = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(
  params: SimParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return clamp(numberParam(params, key, fallback), min, max);
}

function boundedInteger(
  params: SimParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.round(boundedNumber(params, key, fallback, min, max));
}

function wrapUnit(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

export class JuliaSetKernel implements SimKernel {
  readonly name = "Julia Set";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Escape"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "cRe",
      label: "C real",
      type: "number",
      default: DEFAULT_C_RE,
      min: -1.5,
      max: 1.5,
      step: 0.001,
      info: "Real part of the constant c that shapes this Julia set. Changing it reshapes the whole fractal into a different filigree, from dust to connected blobs; it recomputes the whole image.",
    },
    {
      key: "cIm",
      label: "C imaginary",
      type: "number",
      default: DEFAULT_C_IM,
      min: -1.5,
      max: 1.5,
      step: 0.001,
      info: "Imaginary part of the constant c that shapes this Julia set. Changing it reshapes the whole fractal; it recomputes the whole image.",
    },
    {
      key: "centerX",
      label: "Center X",
      type: "number",
      default: DEFAULT_CENTER_X,
      min: -2,
      max: 2,
      step: 0.001,
      info: "Real-axis coordinate the view is centred on. Panning it slides the fractal sideways; changing it recomputes the whole image.",
    },
    {
      key: "centerY",
      label: "Center Y",
      type: "number",
      default: DEFAULT_CENTER_Y,
      min: -2,
      max: 2,
      step: 0.001,
      info: "Imaginary-axis coordinate the view is centred on. Panning it slides the fractal up or down; changing it recomputes the whole image.",
    },
    {
      key: "zoom",
      label: "Zoom",
      type: "number",
      default: DEFAULT_ZOOM,
      min: 0.25,
      max: MAX_FRACTAL_ZOOM,
      step: 0.01,
      info: "How far into the fractal the view is magnified. Higher values reveal finer filigree detail; changing it recomputes the whole image.",
    },
    {
      key: "maxIterations",
      label: "Max iterations",
      type: "number",
      default: DEFAULT_MAX_ITERATIONS,
      min: 16,
      max: MAX_BASE_ITERATIONS,
      step: 1,
      info: "Escape-time cutoff per pixel. Higher values sharpen fine boundary detail at the cost of more computation per frame; ignored while adaptive detail is on.",
    },
    {
      key: "autoIterations",
      label: "Adaptive detail",
      type: "boolean",
      default: DEFAULT_AUTO_ITERATIONS,
      info: "Automatically raises the iteration limit as zoom increases, so deep zooms stay sharp without manually raising max iterations.",
    },
    {
      key: "palettePhase",
      label: "Palette phase",
      type: "number",
      default: DEFAULT_PALETTE_PHASE,
      min: 0,
      max: 1,
      step: 0.001,
      info: "Shifts the colour palette around the escape-time gradient. Wraps continuously, so dragging it cycles through the full palette.",
    },
    {
      key: "cycleSpeed",
      label: "Cycle speed",
      type: "number",
      default: DEFAULT_CYCLE_SPEED,
      min: 0,
      max: 5,
      step: 0.001,
      info: "Speed at which the palette phase animates on its own. Zero freezes the colours in place.",
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private base = new Float32Array(0);
  private cRe = DEFAULT_C_RE;
  private cIm = DEFAULT_C_IM;
  private centerX = DEFAULT_CENTER_X;
  private centerY = DEFAULT_CENTER_Y;
  private zoom = DEFAULT_ZOOM;
  private maxIterations = DEFAULT_MAX_ITERATIONS;
  private palettePhase = DEFAULT_PALETTE_PHASE;
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

    this.cRe = boundedNumber(params, "cRe", DEFAULT_C_RE, -1.5, 1.5);
    this.cIm = boundedNumber(params, "cIm", DEFAULT_C_IM, -1.5, 1.5);
    this.centerX = boundedNumber(params, "centerX", DEFAULT_CENTER_X, -2, 2);
    this.centerY = boundedNumber(params, "centerY", DEFAULT_CENTER_Y, -2, 2);
    this.zoom = boundedNumber(
      params,
      "zoom",
      DEFAULT_ZOOM,
      0.25,
      MAX_FRACTAL_ZOOM,
    );
    const baseIterations = boundedInteger(
      params,
      "maxIterations",
      DEFAULT_MAX_ITERATIONS,
      16,
      MAX_BASE_ITERATIONS,
    );
    const autoIterations =
      typeof params.autoIterations === "boolean"
        ? params.autoIterations
        : DEFAULT_AUTO_ITERATIONS;
    this.maxIterations = effectiveIterationLimit(
      baseIterations,
      this.zoom,
      autoIterations,
    );
    this.palettePhase = boundedNumber(
      params,
      "palettePhase",
      DEFAULT_PALETTE_PHASE,
      0,
      1,
    );
    this.cycleSpeed = boundedNumber(
      params,
      "cycleSpeed",
      DEFAULT_CYCLE_SPEED,
      0,
      5,
    );

    this.computeBaseField();
    this.writePhasedState();
  }

  step(dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    this.palettePhase = wrapUnit(this.palettePhase + this.cycleSpeed * dt);
    this.writePhasedState();
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.base = new Float32Array(0);
  }

  private computeBaseField(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const width = this.width;
    const height = this.height;
    const aspect = width / height;
    const viewHeight = BASE_VIEW_HEIGHT / this.zoom;
    const viewWidth = viewHeight * aspect;
    const xMin = this.centerX - viewWidth * 0.5;
    const yMin = this.centerY - viewHeight * 0.5;
    const xScale = width > 1 ? viewWidth / (width - 1) : 0;
    const yScale = height > 1 ? viewHeight / (height - 1) : 0;

    for (let y = 0; y < height; y += 1) {
      const zIm0 = yMin + y * yScale;

      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        let zRe = xMin + x * xScale;
        let zIm = zIm0;
        let escapedAt = this.maxIterations;
        let magnitudeSquared = 0;

        for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
          const reSquared = zRe * zRe;
          const imSquared = zIm * zIm;
          magnitudeSquared = reSquared + imSquared;

          if (magnitudeSquared > ESCAPE_RADIUS_SQUARED) {
            escapedAt = iteration;
            break;
          }

          zIm = 2 * zRe * zIm + this.cIm;
          zRe = reSquared - imSquared + this.cRe;
        }

        this.base[index] = this.escapeValue(escapedAt, magnitudeSquared);
      }
    }
  }

  private escapeValue(iteration: number, magnitudeSquared: number): number {
    if (iteration >= this.maxIterations) {
      return 0;
    }

    const magnitude = Math.sqrt(Math.max(magnitudeSquared, 1));
    const smooth =
      iteration + 1 - Math.log(Math.log(magnitude)) / Math.LN2;

    return clamp(smooth / this.maxIterations, 0, 1);
  }

  private writePhasedState(): void {
    const phase = this.palettePhase;

    for (let index = 0; index < this.state.length; index += 1) {
      this.state[index] = wrapUnit(this.base[index] + phase);
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new JuliaSetKernel();
    kernel.init(48, 36, { cycleSpeed: 0.02 });

    const before = Array.from(kernel.readState());
    kernel.step(1);
    const state = kernel.readState();
    let changed = false;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < state.length; index += CHANNEL_COUNT) {
      const value = state[index];
      if (value !== before[index]) {
        changed = true;
      }
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
      if (value < 0 || value > 1) {
        return false;
      }
    }

    return changed && max > min;
  } catch {
    return false;
  }
}
