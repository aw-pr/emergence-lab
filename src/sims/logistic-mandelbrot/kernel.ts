import {
  DEFAULT_SAMPLE_COUNT,
  DEFAULT_WARMUP_ITERATIONS,
  ESCAPED,
  IM_MAX,
  IM_MIN,
  MAX_DETECTABLE_PERIOD,
  RE_MAX,
  RE_MIN,
  cellCoordinate,
  estimatePeriod,
  sampleAttractorCell,
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

const CHANNEL_COUNT = 2;
const MIN_WARMUP_ITERATIONS = 16;
const MAX_WARMUP_ITERATIONS = 2000;
const MIN_SAMPLE_COUNT = 8;
const MAX_SAMPLE_COUNT = 96;
// Kernel defaults tuned by eye: the long warmup shrinks the unresolved
// fringe at bulb boundaries, which reads far clearer. Samples stay low
// because the GPU point budget is fixed — cells × samples = budget, so
// raising samples thins the cloud's spatial coverage of the c-plane.
// Plotted iterations defaults to the ceiling, meaning "plot every sample"
// at any sample count. The model's DEFAULT_* constants stay at the
// sampler's own reference values.
const DEFAULT_KERNEL_WARMUP = 1500;
const DEFAULT_KERNEL_SAMPLES = 8;
const DEFAULT_PLOTTED_ITERATIONS = MAX_SAMPLE_COUNT;

/**
 * Cycle points closer than this collapse into one attractor level for the
 * density channel; period-doubled pairs sit far above it.
 */
const LEVEL_TOLERANCE = 1e-3;
const DISTINCT_LEVEL_CAP = 32;

/**
 * Sampling the whole grid at once would stall init on large grids, so cells
 * are swept across step() calls under an iteration budget. The per-cell cost
 * estimate covers the orbit iterations plus sample analysis.
 */
const STEP_ITERATION_BUDGET = 3_500_000;
const ANALYSIS_COST_PER_SAMPLE = 34;
const MIN_CELLS_PER_STEP = 256;

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

function booleanParam(
  params: SimParams,
  key: string,
  fallback: boolean,
): boolean {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

export class LogisticMandelbrotKernel implements SimKernel {
  readonly name = "Logistic Mandelbrot";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Attractor density", "Estimated period"] as const;
  readonly channelRanges = [
    [0, 1],
    [0, MAX_DETECTABLE_PERIOD],
  ] as const;
  readonly paramSchema = [
    // View: how the object is rendered.
    {
      key: "colourMode",
      label: "Colour mode",
      type: "enum",
      default: "period",
      options: ["period", "inside-out", "mono", "cycle"],
    },
    {
      key: "exposure",
      label: "Exposure",
      type: "number",
      default: 1.35,
      min: 0.4,
      max: 3,
      step: 0.05,
    },
    // Resolved per frame in the point shader — dragging it is live.
    {
      key: "edgeGlow",
      label: "Edge glow",
      type: "number",
      default: 0.6,
      min: 0,
      max: 2,
      step: 0.05,
    },
    // Share of the point budget spent re-sampling cascade tails on a finer
    // sub-grid. Changing it rebuilds the cloud; 0 disables refinement.
    {
      key: "tailRefinement",
      label: "Tail refinement",
      type: "number",
      default: 0.3,
      min: 0,
      max: 0.6,
      step: 0.05,
    },
    // Culled per frame in the vertex shader, so dragging it is instant — no
    // rebuild. The wider low end is affordable for the same reason.
    {
      key: "pointDensity",
      label: "Point density",
      type: "number",
      default: 1,
      min: 0.05,
      max: 1,
      step: 0.05,
    },
    {
      key: "autoRotate",
      label: "Auto rotate",
      type: "boolean",
      default: true,
    },
    {
      key: "continuousSpin",
      label: "Continuous camera spin",
      type: "boolean",
      default: true,
    },
    // Light beam: the tracer sweeping the real axis and its wake.
    {
      key: "realAxisSweep",
      label: "Light beam sweep",
      type: "boolean",
      default: true,
    },
    {
      key: "sweepSpeed",
      label: "Sweep speed",
      type: "number",
      default: 0.1,
      min: 0.03,
      max: 0.6,
      step: 0.01,
    },
    // Animation: palette cycling and the period-doubling reveal.
    {
      key: "cycleSpeed",
      label: "Palette cycle speed",
      type: "number",
      default: 0.151,
      min: 0,
      max: 5,
      step: 0.001,
    },
    {
      key: "cascadeReveal",
      label: "Cascade reveal",
      type: "boolean",
      default: true,
    },
    {
      key: "cascadeDuration",
      label: "Cascade duration (s)",
      type: "number",
      default: 16.5,
      min: 2,
      max: 30,
      step: 0.5,
    },
    // Sampling: how each c-cell's attractor orbit is computed.
    {
      key: "warmupIterations",
      label: "Warmup iterations",
      type: "number",
      default: DEFAULT_KERNEL_WARMUP,
      min: MIN_WARMUP_ITERATIONS,
      max: MAX_WARMUP_ITERATIONS,
      step: 1,
    },
    {
      key: "sampleCount",
      label: "Orbit samples",
      type: "number",
      default: DEFAULT_KERNEL_SAMPLES,
      min: MIN_SAMPLE_COUNT,
      max: MAX_SAMPLE_COUNT,
      step: 1,
    },
    {
      key: "plottedIterations",
      label: "Plotted iterations",
      type: "number",
      default: DEFAULT_PLOTTED_ITERATIONS,
      min: 1,
      max: MAX_SAMPLE_COUNT,
      step: 1,
    },
    {
      key: "realSliceOnly",
      label: "Real-axis slice only",
      type: "boolean",
      default: false,
    },
    // Uses a machine-local baked cloud (scripts/bake-orbit3d.mjs) when the
    // file exists; a no-op otherwise, so it ships safely.
    {
      key: "prebakedModel",
      label: "Prebaked model (if available)",
      type: "boolean",
      default: true,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private samples = new Float32Array(0);
  private levels = new Float32Array(DISTINCT_LEVEL_CAP);
  private warmupIterations = DEFAULT_KERNEL_WARMUP;
  private sampleCount = DEFAULT_KERNEL_SAMPLES;
  private plottedIterations = DEFAULT_PLOTTED_ITERATIONS;
  private realSliceOnly = false;
  private cursor = 0;
  private cellsPerStep = MIN_CELLS_PER_STEP;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    this.warmupIterations = boundedInteger(
      numberParam(params, "warmupIterations", DEFAULT_KERNEL_WARMUP),
      MIN_WARMUP_ITERATIONS,
      MAX_WARMUP_ITERATIONS,
    );
    this.sampleCount = boundedInteger(
      numberParam(params, "sampleCount", DEFAULT_KERNEL_SAMPLES),
      MIN_SAMPLE_COUNT,
      MAX_SAMPLE_COUNT,
    );
    this.plottedIterations = Math.min(
      boundedInteger(
        numberParam(params, "plottedIterations", DEFAULT_PLOTTED_ITERATIONS),
        1,
        MAX_SAMPLE_COUNT,
      ),
      this.sampleCount,
    );
    this.realSliceOnly = booleanParam(params, "realSliceOnly", false);

    const cells = this.width * this.height;
    const stateLength = cells * CHANNEL_COUNT;
    if (this.state.length !== stateLength) {
      this.state = new Float32Array(stateLength);
    } else {
      this.state.fill(0);
    }

    const samplesLength = cells * this.sampleCount;
    if (this.samples.length !== samplesLength) {
      this.samples = new Float32Array(samplesLength);
    } else {
      this.samples.fill(0);
    }

    this.cursor = 0;
    const costPerCell =
      this.warmupIterations + this.sampleCount * ANALYSIS_COST_PER_SAMPLE;
    this.cellsPerStep = Math.max(
      MIN_CELLS_PER_STEP,
      Math.floor(STEP_ITERATION_BUDGET / costPerCell),
    );
  }

  step(_dt: number): void {
    const cells = this.width * this.height;
    if (cells === 0 || this.cursor >= cells) {
      return;
    }

    const imMin = this.realSliceOnly ? 0 : IM_MIN;
    const imMax = this.realSliceOnly ? 0 : IM_MAX;
    const end = Math.min(cells, this.cursor + this.cellsPerStep);

    for (let cell = this.cursor; cell < end; cell += 1) {
      const x = cell % this.width;
      const y = (cell - x) / this.width;
      const cRe = cellCoordinate(RE_MIN, RE_MAX, x, this.width);
      const cIm = cellCoordinate(imMin, imMax, y, this.height);
      const offset = cell * this.sampleCount;
      const result = sampleAttractorCell(
        cRe,
        cIm,
        this.warmupIterations,
        this.sampleCount,
        this.samples,
        offset,
      );

      const base = cell * CHANNEL_COUNT;
      if (result === ESCAPED) {
        this.state[base] = 0;
        this.state[base + 1] = 0;
        continue;
      }

      this.state[base] = 1 / this.countDistinctLevels(offset);
      this.state[base + 1] =
        this.plottedIterations < this.sampleCount
          ? estimatePeriod(this.samples, offset, this.plottedIterations)
          : result;
    }

    this.cursor = end;
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.samples = new Float32Array(0);
    this.cursor = 0;
  }

  /**
   * Number of distinct attractor levels among the plotted samples, capped so
   * chaotic cells cost O(plotted · cap) instead of O(plotted²).
   */
  private countDistinctLevels(offset: number): number {
    let distinct = 0;

    for (let n = 0; n < this.plottedIterations; n += 1) {
      const value = this.samples[offset + n];
      let known = false;

      for (let level = 0; level < distinct; level += 1) {
        const delta = value - this.levels[level];
        if (delta > -LEVEL_TOLERANCE && delta < LEVEL_TOLERANCE) {
          known = true;
          break;
        }
      }

      if (known) {
        continue;
      }

      this.levels[distinct] = value;
      distinct += 1;
      if (distinct === DISTINCT_LEVEL_CAP) {
        break;
      }
    }

    return Math.max(1, distinct);
  }
}

export function selfTest(): boolean {
  try {
    const probe = new Float32Array(DEFAULT_SAMPLE_COUNT);
    const probeCell = (cRe: number, cIm: number): number =>
      sampleAttractorCell(
        cRe,
        cIm,
        DEFAULT_WARMUP_ITERATIONS,
        DEFAULT_SAMPLE_COUNT,
        probe,
        0,
      );

    if (probeCell(0, 0) !== 1) {
      return false;
    }
    if (probe[0] !== 0 || probe[DEFAULT_SAMPLE_COUNT - 1] !== 0) {
      return false;
    }
    if (probeCell(-1, 0) !== 2) {
      return false;
    }
    if (probeCell(0.5, 0) !== ESCAPED) {
      return false;
    }

    const width = 60;
    const height = 40;
    const kernel = new LogisticMandelbrotKernel();
    kernel.init(width, height, {});
    const state = kernel.readState();

    for (let index = 0; index < 16; index += 1) {
      kernel.step(1 / 60);
    }

    if (kernel.readState() !== state) {
      return false;
    }
    if (state.length !== width * height * CHANNEL_COUNT) {
      return false;
    }

    let escapedCells = 0;
    for (let cell = 0; cell < width * height; cell += 1) {
      const density = state[cell * CHANNEL_COUNT];
      const period = state[cell * CHANNEL_COUNT + 1];

      if (density < 0 || density > 1) {
        return false;
      }
      if (
        period < 0 ||
        period > MAX_DETECTABLE_PERIOD ||
        !Number.isInteger(period)
      ) {
        return false;
      }
      if (density === 0) {
        escapedCells += 1;
      }
    }
    if (escapedCells === 0 || escapedCells === width * height) {
      return false;
    }

    const cellNear = (re: number, im: number): number => {
      const x = Math.min(
        width - 1,
        Math.max(0, Math.round(((re - RE_MIN) / (RE_MAX - RE_MIN)) * width - 0.5)),
      );
      const y = Math.min(
        height - 1,
        Math.max(0, Math.round(((im - IM_MIN) / (IM_MAX - IM_MIN)) * height - 0.5)),
      );
      return y * width + x;
    };

    const cardioid = cellNear(-0.5, 0) * CHANNEL_COUNT;
    if (state[cardioid] !== 1 || state[cardioid + 1] !== 1) {
      return false;
    }

    const periodTwoDisc = cellNear(-1, 0) * CHANNEL_COUNT;
    if (state[periodTwoDisc] !== 0.5 || state[periodTwoDisc + 1] !== 2) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
