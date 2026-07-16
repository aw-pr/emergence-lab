/**
 * Generic float-channel -> RGB mapping.
 *
 * Kernels only expose floats; colour is a renderer concern. The options here
 * are deliberately generic so every simulation can be made legible without
 * introducing per-kernel drawing code.
 */

export type Rgb = [number, number, number];
export type RgbMapper = (channels: Float32Array, offset: number) => Rgb;

export type ColourPreset =
  | "viridis"
  | "plasma"
  | "inferno"
  | "magma"
  | "turbo"
  | "twilight"
  | "phase"
  | "ice"
  | "amber"
  | "brian"
  | "binary"
  | "chemical"
  | "rgb";

export interface ColourMapOptions {
  preset: ColourPreset;
  invert: boolean;
  gamma: number;
  contrast: number;
  /**
   * When true, single-channel samples are mirrored through the palette before
   * gamma/contrast. Used for fractal palette cycling: kernels only accept
   * non‑negative `cycleSpeed`, so “reverse” animation is achieved here rather
   * than by passing a negative kernel param (which would clamp to zero).
   */
  paletteCycleReverse: boolean;
  /**
   * Quantise the palette into N discrete bands. 0 = off (continuous ramp).
   * Renders integer/discrete fields (e.g. sandpile grain counts 0–4) as crisp
   * terraces instead of a smooth gradient.
   */
  steps: number;
}

export interface ColourPresetOption {
  value: ColourPreset;
  label: string;
}

export const COLOUR_PRESETS: readonly ColourPresetOption[] = [
  { value: "viridis", label: "Viridis" },
  { value: "plasma", label: "Plasma" },
  { value: "inferno", label: "Inferno" },
  { value: "magma", label: "Magma" },
  { value: "turbo", label: "Turbo" },
  { value: "twilight", label: "Twilight (cyclic)" },
  { value: "phase", label: "Phase silk (cyclic)" },
  { value: "ice", label: "Ice" },
  { value: "amber", label: "Amber" },
  { value: "brian", label: "Brian's Brain" },
  { value: "binary", label: "Binary" },
  { value: "chemical", label: "Chemical blend" },
  { value: "rgb", label: "Direct RGB" },
];

/**
 * Presets whose ramp endpoints match, so a phase offset can be added modularly
 * (fract) without a visible seam sweeping through the image. Consumed by the
 * renderer's palette-cycling path.
 */
const CYCLIC_PRESETS: ReadonlySet<ColourPreset> = new Set(["twilight", "phase"]);

export function isCyclic(preset: ColourPreset): boolean {
  return CYCLIC_PRESETS.has(preset);
}

export const DEFAULT_COLOUR_OPTIONS: ColourMapOptions = {
  preset: "viridis",
  invert: false,
  gamma: 1,
  contrast: 1,
  paletteCycleReverse: false,
  steps: 0,
};

type ColourStop = readonly [number, Rgb];

const RAMPS: Record<Exclude<ColourPreset, "chemical" | "rgb">, readonly ColourStop[]> = {
  viridis: [
    [0, [68, 1, 84]],
    [0.28, [59, 82, 139]],
    [0.55, [33, 145, 140]],
    [0.78, [94, 201, 98]],
    [1, [253, 231, 37]],
  ],
  plasma: [
    [0, [13, 8, 135]],
    [0.25, [126, 3, 168]],
    [0.5, [204, 71, 120]],
    [0.75, [248, 149, 64]],
    [1, [240, 249, 33]],
  ],
  inferno: [
    [0, [0, 0, 4]],
    [0.25, [87, 15, 109]],
    [0.5, [187, 55, 84]],
    [0.75, [249, 142, 8]],
    [1, [252, 255, 164]],
  ],
  magma: [
    [0, [0, 0, 4]],
    [0.25, [80, 18, 123]],
    [0.5, [182, 54, 121]],
    [0.75, [251, 136, 97]],
    [1, [252, 253, 191]],
  ],
  turbo: [
    [0, [48, 18, 59]],
    [0.14, [50, 100, 220]],
    [0.29, [30, 175, 235]],
    [0.43, [40, 220, 160]],
    [0.57, [140, 230, 70]],
    [0.71, [240, 200, 50]],
    [0.86, [240, 110, 40]],
    [1, [140, 20, 20]],
  ],
  // Cyclic: endpoints match so palette-phase cycling tiles without a seam.
  twilight: [
    [0, [226, 217, 226]],
    [0.25, [65, 110, 175]],
    [0.5, [30, 20, 55]],
    [0.75, [150, 70, 90]],
    [1, [226, 217, 226]],
  ],
  // Cyclic phase field with a restrained luminance range: hue communicates
  // phase without the near-black midpoint reading as a contour line.
  phase: [
    [0, [226, 217, 226]],
    [0.33, [65, 108, 172]],
    [0.66, [176, 82, 112]],
    [1, [226, 217, 226]],
  ],
  ice: [
    [0, [2, 6, 23]],
    [0.35, [20, 84, 150]],
    [0.7, [42, 220, 220]],
    [1, [245, 255, 255]],
  ],
  amber: [
    [0, [18, 10, 4]],
    [0.28, [92, 35, 8]],
    [0.62, [238, 156, 24]],
    [1, [255, 246, 184]],
  ],
  // Brian's Brain: dead=black, dying=amber, alive=white.
  brian: [
    [0, [0, 0, 0]],
    [0.5, [255, 136, 0]],
    [1, [255, 255, 255]],
  ],
  binary: [
    [0, [3, 7, 18]],
    [0.45, [20, 26, 38]],
    [0.55, [236, 248, 255]],
    [1, [255, 255, 255]],
  ],
};

export function defaultColourOptionsFor(
  slug: string,
  channelCount: number,
): ColourMapOptions {
  const base = { ...DEFAULT_COLOUR_OPTIONS };
  // Per-slug intent wins over the generic multi-channel fallback below: a
  // 3-/4-channel sim with a designed look (BZ, boids) must not be forced into
  // raw RGB just because it has three or more channels.
  switch (slug) {
    case "abelian-sandpile":
      // 0–4 grains: five bands render the terraces as distinct steps.
      return { ...base, preset: "amber", gamma: 0.78, contrast: 1.45, steps: 5 };
    case "belousov-zhabotinsky":
    case "gray-scott":
    case "boids":
      return { ...base, preset: "chemical", contrast: 1.2 };
    case "brians-brain":
      return { ...base, preset: "brian", contrast: 1.2 };
    case "game-of-life":
    case "elementary-cellular-automata":
      return { ...base, preset: "binary", contrast: 1.25 };
    case "ising-model":
      return { ...base, preset: "plasma", contrast: 1.25, steps: 2 };
    case "kuramoto-oscillators":
      return { ...base, preset: "phase", contrast: 1.12 };
    case "diffusion-limited-aggregation":
      return { ...base, preset: "ice", gamma: 0.85, contrast: 1.35 };
    case "physarum":
      return { ...base, preset: "inferno", gamma: 0.7, contrast: 1.4 };
    case "lenia":
      // Viridis with a mid-tone lift: organism skirts glow teal-green over
      // the near-black background while saturated cores read yellow.
      return { ...base, preset: "viridis", gamma: 0.9, contrast: 1.35 };
    case "lorenz-attractor":
      return { ...base, preset: "inferno", gamma: 1.8, contrast: 1.55 };
    case "mandelbrot":
    case "julia-set":
      return { ...base, preset: "inferno", gamma: 0.68, contrast: 1.5 };
    case "burning-ship":
      return { ...base, preset: "ice", gamma: 0.7, contrast: 1.48 };
    case "cyclic-ca":
      // States wrap modularly, so the palette must too: state N-1 sits next
      // to state 0 at every spiral arm, and a non-cyclic ramp would draw a
      // false hard edge there.
      return { ...base, preset: "twilight", contrast: 1.2 };
    case "particle-life":
      // One species-colour per particle per cell; a slight gamma lift keeps
      // single, un-stacked particles legible while direct RGB preserves hue.
      return { ...base, preset: "rgb", gamma: 1.25, contrast: 1.2 };
    default:
      break;
  }

  // Multi-channel sims with no designed palette: direct RGB from the first
  // three channels.
  if (channelCount >= 3) {
    return { ...base, preset: "rgb", contrast: 1.12 };
  }
  return base;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  if (!Number.isFinite(value)) return 0;
  return value;
}

function clamp255(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function normalise(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp01((value - min) / (max - min));
}

function adjust(value: number, options: ColourMapOptions): number {
  const gamma = Math.max(0.1, Math.min(4, options.gamma));
  const contrast = Math.max(0, Math.min(4, options.contrast));
  const inverted = options.invert ? 1 - value : value;
  const corrected = Math.pow(clamp01(inverted), 1 / gamma);
  return clamp01((corrected - 0.5) * contrast + 0.5);
}

function rampColour(preset: Exclude<ColourPreset, "chemical" | "rgb">, t: number): Rgb {
  const stops = RAMPS[preset];
  const x = clamp01(t);
  for (let i = 1; i < stops.length; i += 1) {
    const [rightAt, rightColour] = stops[i];
    const [leftAt, leftColour] = stops[i - 1];
    if (x <= rightAt) {
      const localT = (x - leftAt) / (rightAt - leftAt || 1);
      return mix(leftColour, rightColour, localT);
    }
  }
  return stops[stops.length - 1][1];
}

function mix(left: Rgb, right: Rgb, t: number): Rgb {
  const x = clamp01(t);
  return [
    Math.round(left[0] + (right[0] - left[0]) * x),
    Math.round(left[1] + (right[1] - left[1]) * x),
    Math.round(left[2] + (right[2] - left[2]) * x),
  ];
}

function twoChannelColour(c0: number, c1: number, options: ColourMapOptions): Rgb {
  if (options.preset !== "chemical") {
    const composite = clamp01(c1 * 0.72 + (1 - c0) * 0.28);
    return singleChannelColour(composite, options);
  }

  const cool = rampColour("ice", adjust(1 - c0, options));
  const warm = rampColour("amber", adjust(c1, options));
  const energy = clamp01(c1 * 0.85 + (1 - c0) * 0.2);
  return mix(cool, warm, energy);
}

/**
 * Three-channel "chemical" look (e.g. Belousov-Zhabotinsky activator /
 * inhibitor / catalyst). The activator drives the same cool→warm blend as the
 * two-channel path; the catalyst channel lifts a bright highlight so travelling
 * wavefronts read as luminous crests rather than a flat activator/inhibitor/
 * catalyst RGB triple.
 */
function threeChannelChemical(
  a: number,
  b: number,
  c: number,
  options: ColourMapOptions,
): Rgb {
  const cool = rampColour("ice", adjust(1 - a, options));
  const warm = rampColour("amber", adjust(a, options));
  const energy = clamp01(a * 0.85 + (1 - b) * 0.2);
  const base = mix(cool, warm, energy);
  const highlight = adjust(c, options);
  return mix(base, [255, 255, 255], clamp01(highlight * 0.55));
}

/**
 * Snap a ramp coordinate into one of N evenly spaced levels spanning the full
 * palette. 0 (or <1) leaves it continuous.
 */
function quantise(t: number, steps: number): number {
  const n = Math.floor(steps);
  if (!Number.isFinite(n) || n <= 0) return t;
  if (n <= 1) return 0;
  return clamp01(Math.floor(clamp01(t) * n) / (n - 1));
}

function singleChannelColour(t: number, options: ColourMapOptions): Rgb {
  const value = adjust(quantise(t, options.steps), options);
  const preset =
    options.preset === "chemical" || options.preset === "rgb"
      ? "viridis"
      : options.preset;
  return rampColour(preset, value);
}

/**
 * Build a mapper that takes raw float channels (the kernel's interleaved
 * Float32Array) and produces an RGB triple. Normalisation uses the kernel's
 * declared channelRanges so the renderer never has to inspect the data.
 */
export function buildMapper(
  channelCount: number,
  channelRanges: readonly (readonly [number, number])[],
  options: ColourMapOptions = DEFAULT_COLOUR_OPTIONS,
): RgbMapper {
  if (channelCount <= 0) {
    return () => [0, 0, 0];
  }

  if (channelCount === 1) {
    const [min, max] = channelRanges[0] ?? [0, 1];
    return (channels, offset) => {
      let t = normalise(channels[offset], min, max);
      if (options.paletteCycleReverse) {
        t = clamp01(1 - t);
      }
      return singleChannelColour(t, options);
    };
  }

  if (channelCount === 2) {
    const [min0, max0] = channelRanges[0] ?? [0, 1];
    const [min1, max1] = channelRanges[1] ?? [0, 1];
    return (channels, offset) => {
      const c0 = normalise(channels[offset], min0, max0);
      const c1 = normalise(channels[offset + 1], min1, max1);
      return twoChannelColour(c0, c1, options);
    };
  }

  // Three or more channels: direct RGB by default, or scalarise if requested.
  const r0 = channelRanges[0] ?? [0, 1];
  const r1 = channelRanges[1] ?? [0, 1];
  const r2 = channelRanges[2] ?? [0, 1];
  return (channels, offset) => {
    const c0 = normalise(channels[offset], r0[0], r0[1]);
    const c1 = normalise(channels[offset + 1], r1[0], r1[1]);
    const c2 = normalise(channels[offset + 2], r2[0], r2[1]);
    if (options.preset === "chemical") {
      return threeChannelChemical(c0, c1, c2, options);
    }
    if (options.preset !== "rgb") {
      return singleChannelColour((c0 + c1 + c2) / 3, options);
    }
    const r = Math.round(255 * adjust(c0, options));
    const g = Math.round(255 * adjust(c1, options));
    const b = Math.round(255 * adjust(c2, options));
    return [clamp255(r), clamp255(g), clamp255(b)];
  };
}

export function sampleColour(
  channelIndex: number,
  channelCount: number,
  options: ColourMapOptions,
): string {
  const values = new Float32Array(Math.max(1, channelCount));
  values[channelIndex] = 1;
  const mapper = buildMapper(channelCount, [], options);
  const [r, g, b] = mapper(values, 0);
  return `rgb(${r}, ${g}, ${b})`;
}
