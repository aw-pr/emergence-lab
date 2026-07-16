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

const DEFAULT_DU = 0.2097;
const DEFAULT_DV = 0.105;
// Keep Du:Dv close to 2:1 for stable explicit-Euler integration.
// Waves regime; propagating fronts. Switch via the Coral, Mitosis, or Worms preset for branching, spot, or filament dynamics.
const DEFAULT_F = 0.018;
const DEFAULT_K = 0.0487;
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

function clampStepCount(value: number): number {
  const floored = Math.floor(value);
  if (floored < 1) {
    return 1;
  }
  if (floored > 60) {
    return 60;
  }
  return floored;
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
      min: 0.01,
      max: 0.07,
      step: 0.0005,
    },
    {
      key: "k",
      label: "Kill rate",
      type: "number",
      default: DEFAULT_K,
      min: 0.04,
      max: 0.07,
      step: 0.0005,
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: 12,
      min: 1,
      max: 60,
      step: 1,
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
  private stepsPerFrame = 12;

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
    this.stepsPerFrame = clampStepCount(
      numberParam(params, "stepsPerFrame", 12),
    );

    for (let cell = 0; cell < this.width * this.height; cell += 1) {
      const index = cell * this.channelCount;
      this.state[index] = 1;
      this.state[index + 1] = 0;
    }

    this.seedWarmStart();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const width = this.width;
    const height = this.height;
    const output = this.state;
    let state = output;
    let next = this.next;
    const du = this.du;
    const dv = this.dv;
    const feed = this.feed;
    const kill = this.kill;

    for (let stepIndex = 0; stepIndex < this.stepsPerFrame; stepIndex += 1) {
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

    const s = clamp01(strength);
    if (s <= 0) {
      return;
    }

    const centreX = Math.round(x);
    const centreY = Math.round(y);
    const r = Math.max(1, Math.round(radius));
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

  private seedWarmStart(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }
    const centreX = Math.floor(this.width / 2);
    const centreY = Math.floor(this.height / 2);
    const minAxis = Math.min(this.width, this.height);
    const seedHalf = Math.max(4, Math.floor(minAxis * 0.08));
    const halfExtent = Math.min(minAxis * 0.36, seedHalf + 80);
    const cornerRadius = halfExtent * 0.28;
    const straightHalf = halfExtent - cornerRadius;
    const bandWidth = Math.max(1, Math.min(3.2, minAxis * 0.08));
    const twoBandVariance = 2 * bandWidth * bandWidth;

    // Approximate the single rounded wave present around displayed iteration
    // 120. A signed-distance band avoids calculating ~1,440 Euler passes on load.
    for (let y = 0; y < this.height; y += 1) {
      const dy = Math.abs(y - centreY);
      for (let x = 0; x < this.width; x += 1) {
        const dx = Math.abs(x - centreX);
        const qx = dx - straightHalf;
        const qy = dy - straightHalf;
        const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
        const inside = Math.min(Math.max(qx, qy), 0);
        const signedDistance = outside + inside - cornerRadius;

        const horizontalWeight = dy / Math.max(1, dx + dy);
        const ripple =
          horizontalWeight *
            (2.4 * Math.cos(dx * 0.09) + 1.2 * Math.cos(dx * 0.21)) +
          (1 - horizontalWeight) * 0.8 * Math.cos(dy * 0.11);
        const distance = signedDistance + ripple;
        let activation = Math.exp(-(distance * distance) / twoBandVariance);

        const split =
          horizontalWeight * Math.exp(-(dx * dx) / (2 * 12 * 12));
        activation *= 1 - 0.55 * split;
        if (activation < 0.001) continue;

        const index = (y * this.width + x) * this.channelCount;
        this.state[index] = clamp01(1 - 0.82 * activation);
        this.state[index + 1] = clamp01(0.43 * activation);
      }
    }
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
