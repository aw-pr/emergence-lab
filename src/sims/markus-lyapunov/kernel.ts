import {
  effectiveIterationLimit,
  MAX_BASE_ITERATIONS,
  MAX_FRACTAL_ZOOM,
} from "../fractal/detail.js";
import {
  DEFAULT_SAMPLE_ITERATIONS,
  DEFAULT_SEQUENCE,
  DEFAULT_WARMUP_ITERATIONS,
  sampleLyapunovGrid,
} from "./model.js";

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

export const LYAPUNOV_MAGNITUDE_CEILING = 2;
export const SEQUENCE_OPTIONS = [
  "AB",
  "AABB",
  "AAB",
  "ABB",
  "AABAB",
  "AAAABBBBBB",
] as const;

const DEFAULT_CENTER_X = 3;
const DEFAULT_CENTER_Y = 3;
const DEFAULT_ZOOM = 1;

function boundedNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function boundedInteger(value: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, min, max));
}

function numberParam(params: SimParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

function sequenceParam(params: SimParams): (typeof SEQUENCE_OPTIONS)[number] {
  const value = params.sequence;
  return typeof value === "string" &&
    SEQUENCE_OPTIONS.includes(value as (typeof SEQUENCE_OPTIONS)[number])
    ? (value as (typeof SEQUENCE_OPTIONS)[number])
    : DEFAULT_SEQUENCE;
}

export class MarkusLyapunovKernel implements SimKernel {
  readonly name = "Markus–Lyapunov Fractal";
  readonly channelCount = 2;
  readonly channelLabels = ["Stability magnitude", "Chaos magnitude"] as const;
  readonly channelRanges = [
    [0, LYAPUNOV_MAGNITUDE_CEILING],
    [0, LYAPUNOV_MAGNITUDE_CEILING],
  ] as const;
  readonly paramSchema = [
    {
      key: "centerX",
      label: "Centre A",
      type: "number",
      default: DEFAULT_CENTER_X,
      min: 0,
      max: 4,
      step: 0.001,
    },
    {
      key: "centerY",
      label: "Centre B",
      type: "number",
      default: DEFAULT_CENTER_Y,
      min: 0,
      max: 4,
      step: 0.001,
    },
    {
      key: "zoom",
      label: "Zoom",
      type: "number",
      default: DEFAULT_ZOOM,
      min: 0.25,
      max: MAX_FRACTAL_ZOOM,
      step: 0.01,
    },
    {
      key: "warmupIterations",
      label: "Warmup iterations",
      type: "number",
      default: DEFAULT_WARMUP_ITERATIONS,
      min: 0,
      max: MAX_BASE_ITERATIONS,
      step: 1,
    },
    {
      key: "sampleIterations",
      label: "Sample iterations",
      type: "number",
      default: DEFAULT_SAMPLE_ITERATIONS,
      min: 16,
      max: MAX_BASE_ITERATIONS,
      step: 1,
    },
    {
      key: "sequence",
      label: "Sequence",
      type: "enum",
      default: DEFAULT_SEQUENCE,
      options: SEQUENCE_OPTIONS,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
    } else {
      this.state.fill(0);
    }

    const centerX = boundedNumber(
      numberParam(params, "centerX", DEFAULT_CENTER_X),
      0,
      4,
    );
    const centerY = boundedNumber(
      numberParam(params, "centerY", DEFAULT_CENTER_Y),
      0,
      4,
    );
    const zoom = boundedNumber(
      numberParam(params, "zoom", DEFAULT_ZOOM),
      0.25,
      MAX_FRACTAL_ZOOM,
    );
    const warmupIterations = boundedInteger(
      numberParam(params, "warmupIterations", DEFAULT_WARMUP_ITERATIONS),
      0,
      MAX_BASE_ITERATIONS,
    );
    const baseSampleIterations = boundedInteger(
      numberParam(params, "sampleIterations", DEFAULT_SAMPLE_ITERATIONS),
      16,
      MAX_BASE_ITERATIONS,
    );
    const sampleIterations = effectiveIterationLimit(
      baseSampleIterations,
      zoom,
      true,
    );
    const exponents = sampleLyapunovGrid(
      { width: this.width, height: this.height, centerX, centerY, zoom },
      sequenceParam(params),
      warmupIterations,
      sampleIterations,
    );

    for (let cell = 0; cell < exponents.length; cell += 1) {
      const exponent = exponents[cell];
      const offset = cell * this.channelCount;
      this.state[offset] = Math.min(
        LYAPUNOV_MAGNITUDE_CEILING,
        Math.max(0, -exponent),
      );
      this.state[offset + 1] = Math.min(
        LYAPUNOV_MAGNITUDE_CEILING,
        Math.max(0, exponent),
      );
    }
  }

  step(_dt: number): void {}

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new MarkusLyapunovKernel();
    kernel.init(24, 16, {});
    const state = kernel.readState();
    let stableCells = 0;
    let chaoticCells = 0;
    for (let offset = 0; offset < state.length; offset += 2) {
      const stable = state[offset];
      const chaotic = state[offset + 1];
      if (!Number.isFinite(stable) || !Number.isFinite(chaotic)) return false;
      if (stable < 0 || stable > LYAPUNOV_MAGNITUDE_CEILING) return false;
      if (chaotic < 0 || chaotic > LYAPUNOV_MAGNITUDE_CEILING) return false;
      if (stable > 0) stableCells += 1;
      if (chaotic > 0) chaoticCells += 1;
    }
    return stableCells > 0 && chaoticCells > 0;
  } catch {
    return false;
  }
}
