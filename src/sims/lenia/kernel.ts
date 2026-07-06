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

const DEFAULT_MU = 0.15;
const DEFAULT_SIGMA = 0.017;
const DEFAULT_DT = 0.1;
// Radius 8 keeps the convolution ~160 taps: measured ~25 ms/step at the
// 384x384 performance grid, the budget for smooth animation in plain JS.
// Radius is in grid cells (no resolution scaling): larger grids get a bigger
// world with more organisms at proportionally higher cost, so this sim pins
// its default resolution to "performance" in the renderer.
const DEFAULT_RADIUS = 8;
const MIN_RADIUS = 4;
const MAX_RADIUS = 16;
/** Gaussian shell width as a fraction of the radius (fixed; not a slider). */
const KERNEL_WIDTH = 0.15;
/** Skip shell taps below this fraction of the peak weight when building the
 * offset list — trims ~20% of taps for an imperceptible change in dynamics. */
const TAP_THRESHOLD = 0.03;
/** Fraction of the grid area covered by seed blobs (before overlap). Tuned
 * empirically: enough mass for self-organising blobs to condense in the
 * default regime without saturating the field. */
const BLOB_DENSITY = 0.4;
const CHANNEL_COUNT = 1;

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

export class LeniaKernel implements SimKernel {
  readonly name = "Lenia";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Mass"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "mu",
      label: "Growth centre (μ)",
      type: "number",
      default: DEFAULT_MU,
      min: 0.05,
      max: 0.35,
      step: 0.005,
    },
    {
      key: "sigma",
      label: "Growth width (σ)",
      type: "number",
      default: DEFAULT_SIGMA,
      min: 0.005,
      max: 0.06,
      step: 0.001,
    },
    {
      key: "dt",
      label: "Time step",
      type: "number",
      default: DEFAULT_DT,
      min: 0.02,
      max: 0.3,
      step: 0.01,
    },
    {
      key: "radius",
      label: "Kernel radius",
      type: "number",
      default: DEFAULT_RADIUS,
      min: MIN_RADIUS,
      max: MAX_RADIUS,
      step: 1,
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: 1,
      min: 1,
      max: 4,
      step: 1,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private potential = new Float32Array(0);
  private offX = new Int32Array(0);
  private offY = new Int32Array(0);
  private weights = new Float32Array(0);
  private tapCount = 0;
  private mu = DEFAULT_MU;
  private sigma = DEFAULT_SIGMA;
  private timeStep = DEFAULT_DT;
  private radius = DEFAULT_RADIUS;
  private stepsPerFrame = 1;
  private seed = 0;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    this.mu = clamp(numberParam(params, "mu", DEFAULT_MU), 0.01, 0.5);
    this.sigma = clamp(numberParam(params, "sigma", DEFAULT_SIGMA), 0.003, 0.1);
    this.timeStep = clamp(numberParam(params, "dt", DEFAULT_DT), 0.01, 0.5);
    // Row-shift wrapping in step() assumes the kernel fits the grid once
    // (|shift| < dimension), so cap the radius on degenerate tiny grids.
    const fitCap = Math.max(1, Math.floor((Math.min(this.width, this.height) - 1) / 2));
    this.radius = Math.floor(
      clamp(
        numberParam(params, "radius", DEFAULT_RADIUS),
        Math.min(MIN_RADIUS, fitCap),
        Math.min(MAX_RADIUS, fitCap),
      ),
    );
    this.stepsPerFrame = Math.floor(
      clamp(numberParam(params, "stepsPerFrame", 1), 1, 4),
    );
    // Optional run-to-run variety, injected by the renderer. Absent (0),
    // seeding is a pure function of grid size and radius.
    this.seed = numberParam(params, "seed", 0) | 0;

    const length = this.width * this.height * CHANNEL_COUNT;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
      this.potential = new Float32Array(length);
    } else {
      this.state.fill(0);
      this.potential.fill(0);
    }

    // The renderer re-inits the kernel on every param change, so the shell
    // table (radius-dependent) is always rebuilt where it is consumed.
    this.buildShellKernel();
    this.seedBlobs();
  }

  step(_dt: number): void {
    const width = this.width;
    const height = this.height;
    if (width === 0 || height === 0 || this.tapCount === 0) {
      return;
    }

    const state = this.state;
    const potential = this.potential;
    const offX = this.offX;
    const offY = this.offY;
    const weights = this.weights;
    const tapCount = this.tapCount;
    const mu = this.mu;
    const dt = this.timeStep;
    const twoSigmaSq = 2 * this.sigma * this.sigma;
    const cellCount = width * height;

    for (let stepIndex = 0; stepIndex < this.stepsPerFrame; stepIndex += 1) {
      // Convolution as per-tap shifted-row accumulation: each tap adds a
      // weighted, torus-shifted copy of the field. The inner loops are
      // branch-free contiguous runs (4x unrolled), which is what makes
      // plain-JS Lenia fast enough — a per-cell gather with wrapping is ~6x
      // slower, and the unroll alone is worth ~25%.
      potential.fill(0);
      for (let tap = 0; tap < tapCount; tap += 1) {
        const weight = weights[tap];
        const shiftY = offY[tap];
        let shiftX = offX[tap] % width;
        if (shiftX < 0) {
          shiftX += width;
        }
        const splitX = width - shiftX;

        for (let y = 0; y < height; y += 1) {
          let sourceY = y + shiftY;
          if (sourceY < 0) {
            sourceY += height;
          } else if (sourceY >= height) {
            sourceY -= height;
          }
          const dstBase = y * width;
          const srcBase = sourceY * width;

          const srcRight = srcBase + shiftX;
          const splitX4 = splitX & ~3;
          let x = 0;
          for (; x < splitX4; x += 4) {
            const d = dstBase + x;
            const s = srcRight + x;
            potential[d] += weight * state[s];
            potential[d + 1] += weight * state[s + 1];
            potential[d + 2] += weight * state[s + 2];
            potential[d + 3] += weight * state[s + 3];
          }
          for (; x < splitX; x += 1) {
            potential[dstBase + x] += weight * state[srcRight + x];
          }

          const dstSplit = dstBase + splitX;
          const shiftX4 = shiftX & ~3;
          let x2 = 0;
          for (; x2 < shiftX4; x2 += 4) {
            const d = dstSplit + x2;
            const s = srcBase + x2;
            potential[d] += weight * state[s];
            potential[d + 1] += weight * state[s + 1];
            potential[d + 2] += weight * state[s + 2];
            potential[d + 3] += weight * state[s + 3];
          }
          for (; x2 < shiftX; x2 += 1) {
            potential[dstSplit + x2] += weight * state[srcBase + x2];
          }
        }
      }

      for (let i = 0; i < cellCount; i += 1) {
        const u = potential[i] - mu;
        const growth = 2 * Math.exp(-(u * u) / twoSigmaSq) - 1;
        let a = state[i] + dt * growth;
        if (a < 0) {
          a = 0;
        } else if (a > 1) {
          a = 1;
        }
        state[i] = a;
      }
    }
  }

  readState(): Float32Array {
    return this.state;
  }

  /**
   * Pointer poke: stamp a soft Gaussian blob of mass under the cursor, the same
   * profile the seed blobs use. In the growth regime a fresh blob condenses into
   * a new organism instead of erasing what is there — mass is only ever added
   * (clamped to 1). The disc wraps on the torus and is allocation-free.
   */
  applyImpulse(x: number, y: number, radius: number, strength: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
    if (s <= 0) {
      return;
    }

    const width = this.width;
    const height = this.height;
    const centreX = Math.round(x);
    const centreY = Math.round(y);
    const blobRadius = Math.max(1, radius);
    const reach = Math.ceil(blobRadius);
    const falloff = 2 * blobRadius * blobRadius * 0.35;
    const state = this.state;

    for (let dy = -reach; dy <= reach; dy += 1) {
      let py = (centreY + dy) % height;
      if (py < 0) {
        py += height;
      }
      const rowBase = py * width;
      for (let dx = -reach; dx <= reach; dx += 1) {
        let px = (centreX + dx) % width;
        if (px < 0) {
          px += width;
        }
        const value = s * Math.exp(-(dx * dx + dy * dy) / falloff);
        const index = rowBase + px;
        const sum = state[index] + value;
        state[index] = sum > 1 ? 1 : sum;
      }
    }
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.potential = new Float32Array(0);
    this.offX = new Int32Array(0);
    this.offY = new Int32Array(0);
    this.weights = new Float32Array(0);
    this.tapCount = 0;
  }

  /**
   * Precompute the ring kernel as flat offset+weight arrays. Weight is a
   * Gaussian shell peaking at half the radius:
   *   w(r) = exp(-((r/R - 0.5)² / (2·KERNEL_WIDTH²)))
   * Near-zero taps are skipped and the kept weights renormalised to sum 1.
   */
  private buildShellKernel(): void {
    const radius = this.radius;
    const offX: number[] = [];
    const offY: number[] = [];
    const raw: number[] = [];
    let rawSum = 0;

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const r = Math.sqrt(dx * dx + dy * dy) / radius;
        if (r > 1) {
          continue;
        }
        const shell = r - 0.5;
        const weight = Math.exp(
          -(shell * shell) / (2 * KERNEL_WIDTH * KERNEL_WIDTH),
        );
        if (weight < TAP_THRESHOLD) {
          continue;
        }
        offX.push(dx);
        offY.push(dy);
        raw.push(weight);
        rawSum += weight;
      }
    }

    this.tapCount = raw.length;
    this.offX = Int32Array.from(offX);
    this.offY = Int32Array.from(offY);
    this.weights = new Float32Array(this.tapCount);
    for (let i = 0; i < this.tapCount; i += 1) {
      this.weights[i] = raw[i] / rawSum;
    }
  }

  /**
   * Scatter soft Gaussian blobs sized to the kernel radius. In the default
   * growth regime the blobs condense into self-organising spots and gliders
   * within the first few hundred steps.
   */
  private seedBlobs(): void {
    const width = this.width;
    const height = this.height;
    if (width === 0 || height === 0) {
      return;
    }

    const seed =
      (Math.imul(width, 73856093) ^
        Math.imul(height, 19349663) ^
        Math.imul(this.radius, 83492791) ^
        Math.imul(this.seed, 0x9e3779b1)) >>>
      0;
    const random = mulberry32(seed);
    const state = this.state;
    const radius = this.radius;
    const cellCount = width * height;
    const blobCount = Math.max(
      1,
      Math.round((cellCount * BLOB_DENSITY) / (radius * radius)),
    );

    for (let blob = 0; blob < blobCount; blob += 1) {
      const centreX = Math.floor(random() * width);
      const centreY = Math.floor(random() * height);
      const peak = 0.5 + random() * 0.5;
      const blobRadius = radius * (0.6 + random() * 0.8);
      const reach = Math.ceil(blobRadius);
      const falloff = 2 * blobRadius * blobRadius * 0.35;

      for (let dy = -reach; dy <= reach; dy += 1) {
        let y = centreY + dy;
        if (y < 0) {
          y += height;
        } else if (y >= height) {
          y -= height;
        }
        const rowBase = y * width;
        for (let dx = -reach; dx <= reach; dx += 1) {
          let x = centreX + dx;
          if (x < 0) {
            x += width;
          } else if (x >= width) {
            x -= width;
          }
          const value = peak * Math.exp(-(dx * dx + dy * dy) / falloff);
          const index = rowBase + x;
          const sum = state[index] + value;
          state[index] = sum > 1 ? 1 : sum;
        }
      }
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new LeniaKernel();
    kernel.init(96, 96, {});

    for (let i = 0; i < 60; i += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    let alive = 0;
    let empty = 0;
    for (let i = 0; i < state.length; i += 1) {
      if (state[i] > 0.01) {
        alive += 1;
      } else {
        empty += 1;
      }
    }

    // Alive but not saturated: some mass persists, some space stays clear.
    return alive > state.length * 0.02 && empty > state.length * 0.05;
  } catch {
    return false;
  }
}
