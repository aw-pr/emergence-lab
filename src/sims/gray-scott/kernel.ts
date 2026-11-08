import {
  clamp01,
  fillGrayScottInitialField,
  grayScottImpulseDisc,
  readGrayScottConfig,
  GRAY_SCOTT_DEFAULT_DT,
  GRAY_SCOTT_DEFAULT_DU,
  GRAY_SCOTT_DEFAULT_DV,
  GRAY_SCOTT_DEFAULT_F,
  GRAY_SCOTT_DEFAULT_K,
  GRAY_SCOTT_DEFAULT_STENCIL,
  GRAY_SCOTT_DEFAULT_STEPS_PER_FRAME,
  GRAY_SCOTT_MIN_DT,
  GRAY_SCOTT_STENCILS,
  type GrayScottStencil,
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
  applyImpulse?(x: number, y: number, radius: number, strength: number): void;
}

const DEFAULT_DU = GRAY_SCOTT_DEFAULT_DU;
const DEFAULT_DV = GRAY_SCOTT_DEFAULT_DV;
const DEFAULT_F = GRAY_SCOTT_DEFAULT_F;
const DEFAULT_K = GRAY_SCOTT_DEFAULT_K;
const CHANNEL_COUNT = 2;
const STENCIL_OPTIONS = GRAY_SCOTT_STENCILS;
type Stencil = GrayScottStencil;
const DEFAULT_STENCIL = GRAY_SCOTT_DEFAULT_STENCIL;
const DEFAULT_DT = GRAY_SCOTT_DEFAULT_DT;
const DEFAULT_STEPS_PER_FRAME = GRAY_SCOTT_DEFAULT_STEPS_PER_FRAME;
const MIN_DT = GRAY_SCOTT_MIN_DT;

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
      info: "How far the U reactant spreads to neighbouring cells each step. Higher values widen the pattern's features and smooth out fine detail.",
      group: "Diffusion",
    },
    {
      key: "Dv",
      label: "Diffusion V",
      type: "number",
      default: DEFAULT_DV,
      min: 0,
      max: 0.5,
      step: 0.001,
      info: "How far the V reactant spreads to neighbouring cells each step. Pushing it close to Diffusion U flattens the pattern; keeping it well below U is what lets spots and stripes form.",
      group: "Diffusion",
    },
    {
      key: "F",
      label: "Feed rate",
      type: "number",
      default: DEFAULT_F,
      min: 0.01,
      max: 0.07,
      step: 0.0005,
      info: "Rate at which U is replenished across the field. Together with kill rate, this is what tips the pattern between spots, stripes, worms and waves.",
      group: "Reaction",
    },
    {
      key: "k",
      label: "Kill rate",
      type: "number",
      default: DEFAULT_K,
      min: 0.04,
      max: 0.07,
      step: 0.0005,
      info: "Rate at which V is removed from the field. Small changes here shift the pattern regime dramatically, from splitting spots to fixed stripes.",
      group: "Reaction",
    },
    {
      key: "stencil",
      label: "Laplacian stencil",
      type: "enum",
      default: DEFAULT_STENCIL,
      options: STENCIL_OPTIONS,
      info: "How diffusion samples a cell's neighbours. Five-point reads the four edge neighbours and is what every preset was tuned on. Nine-point adds the diagonals with isotropic weighting, so features stop favouring the grid's axes at the same size and speed.",
      group: "Reaction-diffusion",
    },
    {
      key: "dt",
      label: "Timestep",
      type: "number",
      default: DEFAULT_DT,
      min: MIN_DT,
      max: 1,
      step: MIN_DT,
      info: "Euler timestep per substep. Smaller values use proportionally more substeps to cover the same simulated time, adding compute while refining the discretisation.",
      group: "Reaction-diffusion",
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: DEFAULT_STEPS_PER_FRAME,
      min: 1,
      max: 60,
      step: 1,
      info: "Simulation steps computed per rendered frame. Higher values make the pattern evolve faster at the cost of more computation per frame.",
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
  private stencil: Stencil = DEFAULT_STENCIL;
  private dt = DEFAULT_DT;
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

    const config = readGrayScottConfig(params);
    this.du = config.du;
    this.dv = config.dv;
    this.feed = config.feed;
    this.kill = config.kill;
    this.stencil = config.stencil;
    this.dt = config.dt;
    this.stepsPerFrame = config.stepsPerFrame;

    fillGrayScottInitialField(this.state, this.width, this.height);
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const output = this.state;
    let state = output;
    let next = this.next;

    const substepsPerFrame = this.stepsPerFrame / this.dt;
    for (let stepIndex = 0; stepIndex < substepsPerFrame; stepIndex += 1) {
      if (this.stencil === "nine-point") {
        this.reactDiffuseNinePoint(state, next, this.dt);
      } else {
        this.reactDiffuseFivePoint(state, next, this.dt);
      }

      const swap = state;
      state = next;
      next = swap;
    }

    // readState() must retain its stable reference. Even step counts finish in
    // the canonical output buffer; odd counts need one final copy instead of a
    // full-field copy after every internal reaction-diffusion pass.
    if (state !== output) {
      output.set(state);
    }
  }

  readState(): Float32Array {
    return this.state;
  }

  /** The shipped stencil: one explicit-Euler pass over the four edge neighbours. */
  private reactDiffuseFivePoint(
    state: Float32Array,
    next: Float32Array,
    dt: number,
  ): void {
    const width = this.width;
    const height = this.height;
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

        if (dt === 1) {
          next[index] = clamp01(du * laplaceU - reaction + feed * (1 - u) + u);
          next[index + 1] = clamp01(
            dv * laplaceV + reaction - (feed + kill) * v + v,
          );
        } else {
          next[index] = clamp01(
            u + dt * (du * laplaceU - reaction + feed * (1 - u)),
          );
          next[index + 1] = clamp01(
            v + dt * (dv * laplaceV + reaction - (feed + kill) * v),
          );
        }
      }
    }
  }

  /**
   * One explicit-Euler pass with the isotropic nine-point Laplacian:
   * (4·edges + diagonals − 20·centre) / 6. Identical reaction terms; only the
   * diffusion sampling differs from the five-point pass.
   */
  private reactDiffuseNinePoint(
    state: Float32Array,
    next: Float32Array,
    dt: number,
  ): void {
    const width = this.width;
    const height = this.height;
    const du = this.du;
    const dv = this.dv;
    const feed = this.feed;
    const kill = this.kill;

    for (let y = 0; y < height; y += 1) {
      const yUp = y === 0 ? height - 1 : y - 1;
      const yDown = y === height - 1 ? 0 : y + 1;
      const rowIndex = y * width;
      const rowUp = yUp * width;
      const rowDown = yDown * width;

      for (let x = 0; x < width; x += 1) {
        const xLeft = x === 0 ? width - 1 : x - 1;
        const xRight = x === width - 1 ? 0 : x + 1;

        const index = (rowIndex + x) * CHANNEL_COUNT;
        const left = (rowIndex + xLeft) * CHANNEL_COUNT;
        const right = (rowIndex + xRight) * CHANNEL_COUNT;
        const up = (rowUp + x) * CHANNEL_COUNT;
        const down = (rowDown + x) * CHANNEL_COUNT;
        const upLeft = (rowUp + xLeft) * CHANNEL_COUNT;
        const upRight = (rowUp + xRight) * CHANNEL_COUNT;
        const downLeft = (rowDown + xLeft) * CHANNEL_COUNT;
        const downRight = (rowDown + xRight) * CHANNEL_COUNT;

        const u = state[index];
        const v = state[index + 1];
        const laplaceU =
          (4 * (state[left] + state[right] + state[up] + state[down]) +
            (state[upLeft] + state[upRight] + state[downLeft] + state[downRight]) -
            20 * u) /
          6;
        const laplaceV =
          (4 *
            (state[left + 1] +
              state[right + 1] +
              state[up + 1] +
              state[down + 1]) +
            (state[upLeft + 1] +
              state[upRight + 1] +
              state[downLeft + 1] +
              state[downRight + 1]) -
            20 * v) /
          6;
        const reaction = u * v * v;

        if (dt === 1) {
          next[index] = clamp01(du * laplaceU - reaction + feed * (1 - u) + u);
          next[index + 1] = clamp01(
            dv * laplaceV + reaction - (feed + kill) * v + v,
          );
        } else {
          next[index] = clamp01(
            u + dt * (du * laplaceU - reaction + feed * (1 - u)),
          );
          next[index + 1] = clamp01(
            v + dt * (dv * laplaceV + reaction - (feed + kill) * v),
          );
        }
      }
    }
  }

  /**
   * Pointer poke: stamp a soft disc of the reactant V (and deplete U) under the
   * cursor, the same seed the centre patch uses. Only ever adds V / removes U,
   * so it triggers fresh growth without erasing existing structure. Bounds are
   * clamped (no wrap); allocation-free.
   */
  applyImpulse(x: number, y: number, radius: number, strength: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const disc = grayScottImpulseDisc(x, y, radius, strength);
    if (!disc) {
      return;
    }

    const s = disc.strength;
    const centreX = disc.centreX;
    const centreY = disc.centreY;
    const r = disc.radius;
    const radiusSq = r * r;

    for (let dy = -r; dy <= r; dy += 1) {
      const py = centreY + dy;
      if (py < 0 || py >= this.height) {
        continue;
      }
      for (let dx = -r; dx <= r; dx += 1) {
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) {
          continue;
        }
        const px = centreX + dx;
        if (px < 0 || px >= this.width) {
          continue;
        }
        const weight = (1 - Math.sqrt(distSq) / r) * s;
        if (weight <= 0) {
          continue;
        }
        const index = (py * this.width + px) * this.channelCount;
        this.state[index] = Math.min(this.state[index], 1 - 0.5 * weight);
        this.state[index + 1] = Math.max(this.state[index + 1], 0.25 * weight);
      }
    }
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.next = new Float32Array(0);
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new GrayScottKernel();
    // Waves fronts need room to propagate; a 32x32 torus is too small and the
    // seed heals over before the reaction takes hold.
    kernel.init(64, 64, {});

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
