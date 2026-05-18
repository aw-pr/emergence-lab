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

const CHANNEL_COUNT = 3;
const DEFAULT_DIFFUSION_A = 0.18;
const DEFAULT_DIFFUSION_B = 0.08;
const DEFAULT_DIFFUSION_C = 0.035;
const DEFAULT_FEED = 0.024;
const DEFAULT_KILL = 0.055;
const DEFAULT_STEPS_PER_FRAME = 2;
const INTERNAL_DT = 0.2;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export class BelousovZhabotinskyKernel implements SimKernel {
  readonly name = "Belousov-Zhabotinsky";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Activator", "Inhibitor", "Catalyst"] as const;
  readonly channelRanges = [
    [0, 1],
    [0, 1],
    [0, 1],
  ] as const;
  readonly paramSchema = [
    {
      key: "diffusionA",
      label: "Diffusion activator",
      type: "number",
      default: DEFAULT_DIFFUSION_A,
      min: 0,
      max: 0.35,
      step: 0.001,
    },
    {
      key: "diffusionB",
      label: "Diffusion inhibitor",
      type: "number",
      default: DEFAULT_DIFFUSION_B,
      min: 0,
      max: 0.25,
      step: 0.001,
    },
    {
      key: "diffusionC",
      label: "Diffusion catalyst",
      type: "number",
      default: DEFAULT_DIFFUSION_C,
      min: 0,
      max: 0.2,
      step: 0.001,
    },
    {
      key: "feed",
      label: "Feed",
      type: "number",
      default: DEFAULT_FEED,
      min: 0,
      max: 0.08,
      step: 0.001,
    },
    {
      key: "kill",
      label: "Damping",
      type: "number",
      default: DEFAULT_KILL,
      min: 0,
      max: 0.12,
      step: 0.001,
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: DEFAULT_STEPS_PER_FRAME,
      min: 1,
      max: 8,
      step: 1,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private next = new Float32Array(0);
  private diffusionA = DEFAULT_DIFFUSION_A;
  private diffusionB = DEFAULT_DIFFUSION_B;
  private diffusionC = DEFAULT_DIFFUSION_C;
  private feed = DEFAULT_FEED;
  private kill = DEFAULT_KILL;
  private stepsPerFrame = DEFAULT_STEPS_PER_FRAME;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
      this.next = new Float32Array(length);
    } else {
      this.state.fill(0);
      this.next.fill(0);
    }

    this.diffusionA = numberParam(
      params,
      "diffusionA",
      DEFAULT_DIFFUSION_A,
      0,
      0.35,
    );
    this.diffusionB = numberParam(
      params,
      "diffusionB",
      DEFAULT_DIFFUSION_B,
      0,
      0.25,
    );
    this.diffusionC = numberParam(
      params,
      "diffusionC",
      DEFAULT_DIFFUSION_C,
      0,
      0.2,
    );
    this.feed = numberParam(params, "feed", DEFAULT_FEED, 0, 0.08);
    this.kill = numberParam(params, "kill", DEFAULT_KILL, 0, 0.12);
    this.stepsPerFrame = Math.max(
      1,
      Math.round(
        numberParam(
          params,
          "stepsPerFrame",
          DEFAULT_STEPS_PER_FRAME,
          1,
          8,
        ),
      ),
    );

    this.seedSpatialPattern();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    for (let pass = 0; pass < this.stepsPerFrame; pass += 1) {
      this.stepInternal();
    }
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.next = new Float32Array(0);
  }

  private seedSpatialPattern(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const width = this.width;
    const height = this.height;
    const centreX = (width - 1) * 0.5;
    const centreY = (height - 1) * 0.5;
    const scale = Math.max(1, Math.min(width, height));

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = (x - centreX) / scale;
        const dy = (y - centreY) / scale;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const ring = 0.5 + 0.5 * Math.cos(52 * radius);
        const checker = ((x >> 3) + (y >> 3)) % 2 === 0 ? 1 : -1;
        const wave = 0.5 + 0.5 * Math.sin(0.37 * x + 0.23 * y);
        const patch =
          Math.abs(dx - 0.15) < 0.055 && Math.abs(dy + 0.1) < 0.055 ? 1 : 0;
        const index = (y * width + x) * CHANNEL_COUNT;

        this.state[index] = clamp01(0.28 + 0.42 * ring + 0.18 * patch);
        this.state[index + 1] = clamp01(0.22 + 0.18 * wave + 0.08 * checker);
        this.state[index + 2] = clamp01(
          0.38 + 0.18 * (1 - ring) + 0.16 * patch,
        );
      }
    }
  }

  private stepInternal(): void {
    const width = this.width;
    const height = this.height;
    const state = this.state;
    const next = this.next;
    const diffusionA = this.diffusionA;
    const diffusionB = this.diffusionB;
    const diffusionC = this.diffusionC;
    const feed = this.feed;
    const kill = this.kill;

    for (let y = 0; y < height; y += 1) {
      const yUp = y === 0 ? height - 1 : y - 1;
      const yDown = y === height - 1 ? 0 : y + 1;

      for (let x = 0; x < width; x += 1) {
        const xLeft = x === 0 ? width - 1 : x - 1;
        const xRight = x === width - 1 ? 0 : x + 1;

        const index = (y * width + x) * CHANNEL_COUNT;
        const left = (y * width + xLeft) * CHANNEL_COUNT;
        const right = (y * width + xRight) * CHANNEL_COUNT;
        const up = (yUp * width + x) * CHANNEL_COUNT;
        const down = (yDown * width + x) * CHANNEL_COUNT;

        const a = state[index];
        const b = state[index + 1];
        const c = state[index + 2];
        const laplaceA =
          state[left] + state[right] + state[up] + state[down] - 4 * a;
        const laplaceB =
          state[left + 1] +
          state[right + 1] +
          state[up + 1] +
          state[down + 1] -
          4 * b;
        const laplaceC =
          state[left + 2] +
          state[right + 2] +
          state[up + 2] +
          state[down + 2] -
          4 * c;

        const ab = a * b;
        const bc = b * c;
        const ca = c * a;
        const dA = diffusionA * laplaceA + feed * (1 - a) + ca - ab;
        const dB = diffusionB * laplaceB + ab - bc - kill * b;
        const dC = diffusionC * laplaceC + bc - ca - 0.5 * kill * (c - 0.35);

        next[index] = clamp01(a + INTERNAL_DT * dA);
        next[index + 1] = clamp01(b + INTERNAL_DT * dB);
        next[index + 2] = clamp01(c + INTERNAL_DT * dC);
      }
    }

    state.set(next);
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new BelousovZhabotinskyKernel();
    kernel.init(32, 32, {});
    const before = Array.from(kernel.readState());

    for (let index = 0; index < 24; index += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    if (state.length !== before.length) {
      return false;
    }

    let changed = false;
    for (let index = 0; index < state.length; index += 1) {
      const value = state[index];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        return false;
      }
      if (Math.abs(value - before[index]) > 0.000001) {
        changed = true;
      }
    }

    return changed;
  } catch {
    return false;
  }
}
