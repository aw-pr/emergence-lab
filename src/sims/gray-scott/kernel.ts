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

const DEFAULT_DU = 0.2097;
const DEFAULT_DV = 0.105;
const DEFAULT_F = 0.055;
const DEFAULT_K = 0.062;
const CHANNEL_COUNT = 2;

function clamp01(value: number): number {
  if (value < 0) {
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
): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

export class GrayScottKernel implements SimKernel {
  readonly name = "Gray-Scott";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["U", "V"] as const;
  readonly channelRanges = [
    [0, 1],
    [0, 1],
  ] as const;
  readonly paramSchema = [
    {
      key: "Du",
      label: "Diffusion U",
      type: "number",
      default: DEFAULT_DU,
      min: 0,
      max: 0.5,
      step: 0.001,
    },
    {
      key: "Dv",
      label: "Diffusion V",
      type: "number",
      default: DEFAULT_DV,
      min: 0,
      max: 0.5,
      step: 0.001,
    },
    {
      key: "F",
      label: "Feed rate",
      type: "number",
      default: DEFAULT_F,
      min: 0,
      max: 0.1,
      step: 0.001,
    },
    {
      key: "k",
      label: "Kill rate",
      type: "number",
      default: DEFAULT_K,
      min: 0,
      max: 0.1,
      step: 0.001,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private next = new Float32Array(0);
  private du = DEFAULT_DU;
  private dv = DEFAULT_DV;
  private feed = DEFAULT_F;
  private kill = DEFAULT_K;

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

    this.du = numberParam(params, "Du", DEFAULT_DU);
    this.dv = numberParam(params, "Dv", DEFAULT_DV);
    this.feed = numberParam(params, "F", DEFAULT_F);
    this.kill = numberParam(params, "k", DEFAULT_K);

    for (let cell = 0; cell < this.width * this.height; cell += 1) {
      const index = cell * this.channelCount;
      this.state[index] = 1;
      this.state[index + 1] = 0;
    }

    this.seedCentrePatch();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const width = this.width;
    const height = this.height;
    const state = this.state;
    const next = this.next;
    const du = this.du;
    const dv = this.dv;
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

        const u = state[index];
        const v = state[index + 1];
        const laplaceU =
          state[left] + state[right] + state[up] + state[down] - 4 * u;
        const laplaceV =
          state[left + 1] +
          state[right + 1] +
          state[up + 1] +
          state[down + 1] -
          4 * v;
        const reaction = u * v * v;

        next[index] = clamp01(du * laplaceU - reaction + feed * (1 - u) + u);
        next[index + 1] = clamp01(
          dv * laplaceV + reaction - (feed + kill) * v + v,
        );
      }
    }

    state.set(next);
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

  private seedCentrePatch(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const patchSize = Math.max(
      2,
      Math.floor(Math.min(this.width, this.height) / 8),
    );
    const startX = Math.floor((this.width - patchSize) / 2);
    const startY = Math.floor((this.height - patchSize) / 2);
    const endX = startX + patchSize;
    const endY = startY + patchSize;

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const index = (y * this.width + x) * this.channelCount;
        this.state[index + 1] = 1;
      }
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new GrayScottKernel();
    kernel.init(32, 32, {});

    for (let i = 0; i < 100; i += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    for (let index = 0; index < state.length; index += CHANNEL_COUNT) {
      if (state[index] < 0.99) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
