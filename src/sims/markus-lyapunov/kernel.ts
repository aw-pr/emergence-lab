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
const DEFAULT_ROTATION_SPEED = 6;
const MAX_ROTATION_SPEED = 30;
const DEGREES_TO_RADIANS = Math.PI / 180;

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

function writeChannels(
  exponents: Float32Array,
  target: Float32Array,
  channelCount: number,
): void {
  for (let cell = 0; cell < exponents.length; cell += 1) {
    const exponent = exponents[cell];
    if (!Number.isFinite(exponent)) continue; // outside [0,4]² — stays 0,0
    const offset = cell * channelCount;
    target[offset] = Math.min(
      LYAPUNOV_MAGNITUDE_CEILING,
      Math.max(0, -exponent),
    );
    target[offset + 1] = Math.min(
      LYAPUNOV_MAGNITUDE_CEILING,
      Math.max(0, exponent),
    );
  }
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
      info: "Growth-rate A coordinate the view is centred on, in the 0-4 plane the logistic map is stable across. Panning it slides the fractal sideways; changing it recomputes the whole image.",
      group: "Zoom and detail",
    },
    {
      key: "centerY",
      label: "Centre B",
      type: "number",
      default: DEFAULT_CENTER_Y,
      min: 0,
      max: 4,
      step: 0.001,
      info: "Growth-rate B coordinate the view is centred on. Panning it slides the fractal up or down; changing it recomputes the whole image.",
      group: "Zoom and detail",
    },
    {
      key: "zoom",
      label: "Zoom",
      type: "number",
      default: DEFAULT_ZOOM,
      min: 0.25,
      max: MAX_FRACTAL_ZOOM,
      step: 0.01,
      info: "How far into the A-B plane the view is magnified. Higher values reveal finer stability boundary structure; changing it recomputes the whole image.",
      group: "Zoom and detail",
    },
    {
      key: "warmupIterations",
      label: "Warmup iterations",
      type: "number",
      default: DEFAULT_WARMUP_ITERATIONS,
      min: 0,
      max: MAX_BASE_ITERATIONS,
      step: 1,
      info: "Orbit steps discarded before measuring stability, letting each cell's orbit settle first. Too few leaves transient noise in the boundary; changing it recomputes the whole image.",
      group: "Zoom and detail",
    },
    {
      key: "sampleIterations",
      label: "Sample iterations",
      type: "number",
      default: DEFAULT_SAMPLE_ITERATIONS,
      min: 16,
      max: MAX_BASE_ITERATIONS,
      step: 1,
      info: "Orbit steps measured after warmup to decide whether a cell is stable or chaotic. Higher values sharpen the boundary at the cost of more computation per frame.",
      group: "Zoom and detail",
    },
    {
      key: "sequence",
      label: "Sequence",
      type: "enum",
      default: DEFAULT_SEQUENCE,
      options: SEQUENCE_OPTIONS,
      info: "Pattern of A and B growth rates the orbit alternates through each step, for example AAB applies A, A, B, then repeats. Changing it produces an entirely different fractal.",
    },
    {
      key: "rotationSpeed",
      label: "Rotation speed (°/s)",
      type: "number",
      default: DEFAULT_ROTATION_SPEED,
      min: -MAX_ROTATION_SPEED,
      max: MAX_ROTATION_SPEED,
      step: 0.5,
      info: "How fast the view spins around its centre. Zero holds it still; negative values reverse the direction.",
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  // The base field is sampled once over a rectangle covering the view's
  // diagonal, so any rotation of the view resamples entirely inside computed
  // data. Each base dimension keeps its view dimension's parity so that at
  // angle 0 every tap lands exactly on a base cell (no start-up blur).
  private base = new Float32Array(0);
  private baseWidth = 0;
  private baseHeight = 0;
  private rotationSpeed = 0;
  private angle = 0;

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
    this.rotationSpeed = boundedNumber(
      numberParam(params, "rotationSpeed", DEFAULT_ROTATION_SPEED),
      -MAX_ROTATION_SPEED,
      MAX_ROTATION_SPEED,
    );
    this.angle = 0;

    if (this.rotationSpeed === 0 || this.width === 0 || this.height === 0) {
      this.base = new Float32Array(0);
      this.baseWidth = 0;
      this.baseHeight = 0;
      const exponents = sampleLyapunovGrid(
        { width: this.width, height: this.height, centerX, centerY, zoom },
        sequenceParam(params),
        warmupIterations,
        sampleIterations,
      );
      writeChannels(exponents, this.state, this.channelCount);
      return;
    }

    const diagonal = Math.ceil(Math.hypot(this.width, this.height));
    this.baseWidth = diagonal + ((diagonal + this.width) % 2);
    this.baseHeight = diagonal + ((diagonal + this.height) % 2);
    // Preserve the view's plane-units-per-cell on the larger base grid: the
    // grid sampler derives scale from min(width, height) · zoom.
    const baseZoom =
      (zoom * Math.min(this.width, this.height)) /
      Math.min(this.baseWidth, this.baseHeight);
    const exponents = sampleLyapunovGrid(
      {
        width: this.baseWidth,
        height: this.baseHeight,
        centerX,
        centerY,
        zoom: baseZoom,
      },
      sequenceParam(params),
      warmupIterations,
      sampleIterations,
    );
    if (this.base.length !== exponents.length * this.channelCount) {
      this.base = new Float32Array(exponents.length * this.channelCount);
    } else {
      this.base.fill(0); // NaN cells skip the write and must read as empty
    }
    writeChannels(exponents, this.base, this.channelCount);
    this.resample();
  }

  step(dt: number): void {
    if (this.rotationSpeed === 0 || this.baseWidth === 0) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.angle += this.rotationSpeed * DEGREES_TO_RADIANS * dt;
    this.resample();
  }

  // Rotate the view through the precomputed base field with bilinear taps. At
  // stability boundaries the dominant channel wins outright, preserving the
  // per-cell "stable XOR chaotic" contract the renderer relies on.
  private resample(): void {
    const { width, height, baseWidth, baseHeight, base, state } = this;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const halfW = (width - 1) / 2;
    const halfH = (height - 1) / 2;
    const centreX = (baseWidth - 1) / 2;
    const centreY = (baseHeight - 1) / 2;

    let offset = 0;
    for (let y = 0; y < height; y += 1) {
      const v = y - halfH;
      let sx = centreX + cos * -halfW - sin * v;
      let sy = centreY + sin * -halfW + cos * v;
      for (let x = 0; x < width; x += 1, sx += cos, sy += sin, offset += 2) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        if (x0 < 0 || y0 < 0 || x0 >= baseWidth - 1 || y0 >= baseHeight - 1) {
          state[offset] = 0;
          state[offset + 1] = 0;
          continue;
        }
        const fx = sx - x0;
        const fy = sy - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const i00 = (y0 * baseWidth + x0) * 2;
        const i10 = i00 + 2;
        const i01 = i00 + baseWidth * 2;
        const i11 = i01 + 2;
        const stable =
          base[i00] * w00 + base[i10] * w10 + base[i01] * w01 + base[i11] * w11;
        const chaotic =
          base[i00 + 1] * w00 +
          base[i10 + 1] * w10 +
          base[i01 + 1] * w01 +
          base[i11 + 1] * w11;
        if (stable >= chaotic) {
          state[offset] = stable;
          state[offset + 1] = 0;
        } else {
          state[offset] = 0;
          state[offset + 1] = chaotic;
        }
      }
    }
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.base = new Float32Array(0);
    this.baseWidth = 0;
    this.baseHeight = 0;
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
