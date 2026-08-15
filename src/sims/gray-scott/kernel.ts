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

const DEFAULT_DU = 0.2097;
const DEFAULT_DV = 0.105;
// Keep Du:Dv close to 2:1 for stable explicit-Euler integration.
// Waves regime; propagating fronts. Switch via the Coral, Mitosis, or Worms preset for branching, spot, or filament dynamics.
const DEFAULT_F = 0.018;
const DEFAULT_K = 0.0487;
const CHANNEL_COUNT = 2;

/**
 * Seed geometry in cells, never as a fraction of the grid.
 *
 * The reaction's length scale is fixed by Du, Dv, F and k, which are per-cell,
 * so it does not grow with the canvas. A blob much wider than that scale has a
 * flat, U-depleted interior that a high kill rate empties from the middle out:
 * measured on a 700x560 grid, mitosis blobs of radius 3 and 5 survive while 8,
 * 13 and 20 all die. Sizing the seed as a share of the grid therefore works at
 * 256² and silently kills mitosis at the resolutions the sim actually runs at.
 *
 * So radius is a constant, and a bigger grid gets more origins rather than
 * bigger ones: spacing is what fills the frame, radius is what survives.
 */
const SEED_BLOB_RADIUS = 4;
const SEED_SPACING = 56;
/** Keep the outermost ring inside the frame rather than against the edge. */
const SEED_EXTENT = 0.44;

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
      info: "How far the U reactant spreads to neighbouring cells each step. Higher values widen the pattern's features and smooth out fine detail.",
      group: "Reaction-diffusion",
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
      group: "Reaction-diffusion",
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
      group: "Reaction-diffusion",
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
      group: "Reaction-diffusion",
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: 12,
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

    this.seedOrigins();
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

  /**
   * Seed rings of small V blobs in an otherwise full U field.
   *
   * Every regime needs the same local starting condition: a compact patch of V
   * sitting in undepleted U, which it then feeds on. That is what decides
   * whether V survives at all — the UV² term needs the reservoir. A previous
   * version painted one large pre-grown wave instead, fitted to the waves
   * regime; it depleted U across a third of the domain and left V spread too
   * thin to sustain, so mitosis (high k) went extinct within a few hundred
   * steps and spots decayed. A painted approximation can only ever be correct
   * for the regime it was fitted to.
   *
   * Many origins rather than one is what fills a 960² grid quickly, which is
   * what the warm start was reaching for: real dynamics from correct seeds,
   * rather than an approximation of where those dynamics would have arrived.
   * Concentric rings keep the radial symmetry that makes the pattern read as a
   * mandala, and the whole layout is deterministic so the tests can lock it.
   *
   * See SEED_BLOB_RADIUS for why the geometry is in cells: sizing any of this
   * as a share of the grid reproduces the extinction it was meant to fix, just
   * at the larger resolutions rather than everywhere.
   */
  private seedOrigins(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }
    const centreX = Math.floor(this.width / 2);
    const centreY = Math.floor(this.height / 2);
    const minAxis = Math.min(this.width, this.height);
    // Only a grid too small to hold the constant shrinks it, which the live
    // resolutions (384² and up) never do.
    const radius = Math.max(1, Math.min(SEED_BLOB_RADIUS, Math.floor(minAxis / 4)));
    // Blobs closer than this merge into one front and no regime's character
    // survives the merge. On a grid too small for the constant, fall back to
    // whatever the grid can hold.
    const spacing = Math.min(
      SEED_SPACING,
      Math.max(3 * radius + 4, Math.floor(minAxis / 4)),
    );
    const extent = minAxis * SEED_EXTENT;

    this.seedBlob(centreX, centreY, radius);
    let ring = 0;
    for (let ringRadius = spacing; ringRadius <= extent; ringRadius += spacing) {
      // Constant arc spacing, so a wider ring carries more origins instead of
      // stretching the same few apart.
      const count = Math.max(6, Math.round((2 * Math.PI * ringRadius) / spacing));
      // Offset alternate rings so blobs interleave rather than lining up into
      // spokes, which would bias growth along those radii.
      const phase = ring % 2 === 1 ? Math.PI / count : 0;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + phase;
        this.seedBlob(
          Math.round(centreX + Math.cos(angle) * ringRadius),
          Math.round(centreY + Math.sin(angle) * ringRadius),
          radius,
        );
      }
      ring += 1;
    }
  }

  private seedBlob(centreX: number, centreY: number, radius: number): void {
    const radiusSquared = radius * radius;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const y = centreY + dy;
      if (y < 0 || y >= this.height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = centreX + dx;
        if (x < 0 || x >= this.width) continue;
        if (dx * dx + dy * dy > radiusSquared) continue;
        const index = (y * this.width + x) * this.channelCount;
        this.state[index] = 0.5;
        this.state[index + 1] = 0.25;
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
