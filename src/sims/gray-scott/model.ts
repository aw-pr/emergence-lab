type GrayScottParams = Record<string, number | boolean | string>;

export const GRAY_SCOTT_DEFAULT_DU = 0.2097;
export const GRAY_SCOTT_DEFAULT_DV = 0.105;
// Keep Du:Dv close to 2:1 for stable explicit-Euler integration.
// Waves regime; propagating fronts. Switch via the Coral, Mitosis, or Worms preset for branching, spot, or filament dynamics.
export const GRAY_SCOTT_DEFAULT_F = 0.018;
export const GRAY_SCOTT_DEFAULT_K = 0.0487;

/**
 * Laplacian stencils. Five-point reads the four edge neighbours and is what
 * every shipped preset was tuned on. Nine-point adds the diagonals with the
 * isotropic 1-4-1 weighting (Patra-Karttunen): the same O(h²) accuracy, but
 * its leading error term is rotationally symmetric, so the grid's axes stop
 * leaking into the pattern. It also has a smaller spectral radius (16/3 against
 * 8), which lifts the explicit-Euler ceiling on Du from 0.25 to 0.375.
 */
export const GRAY_SCOTT_STENCILS = ["five-point", "nine-point"] as const;
export type GrayScottStencil = (typeof GRAY_SCOTT_STENCILS)[number];
export const GRAY_SCOTT_DEFAULT_STENCIL: GrayScottStencil = "nine-point";
export const GRAY_SCOTT_DEFAULT_DT = 1;
export const GRAY_SCOTT_DEFAULT_STEPS_PER_FRAME = 3;
export const GRAY_SCOTT_MIN_DT = 0.125;

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

/** The reaction-diffusion settings a run latches when it is initialised. */
export interface GrayScottConfig {
  du: number;
  dv: number;
  feed: number;
  kill: number;
  stencil: GrayScottStencil;
  dt: number;
  stepsPerFrame: number;
}

export interface GrayScottImpulseDisc {
  centreX: number;
  centreY: number;
  radius: number;
  strength: number;
}

export function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function numberParam(
  params: GrayScottParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

function stencilParam(
  params: GrayScottParams,
  fallback: GrayScottStencil,
): GrayScottStencil {
  const value = params.stencil;
  return value === "five-point" || value === "nine-point" ? value : fallback;
}

function timeStepParam(params: GrayScottParams, fallback: number): number {
  const value = numberParam(params, "dt", fallback);
  if (!Number.isFinite(value) || value < GRAY_SCOTT_MIN_DT || value > 1) {
    return fallback;
  }

  // Keep the physical time per frame exact: only reciprocal-integer substeps
  // are selectable, and the slider's eighths snap to the nearest dyadic value.
  const substeps = 2 ** Math.round(Math.log2(1 / value));
  return 1 / Math.min(8, Math.max(1, substeps));
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

export function readGrayScottConfig(params: GrayScottParams): GrayScottConfig {
  return {
    du: numberParam(params, "Du", GRAY_SCOTT_DEFAULT_DU),
    dv: numberParam(params, "Dv", GRAY_SCOTT_DEFAULT_DV),
    feed: numberParam(params, "F", GRAY_SCOTT_DEFAULT_F),
    kill: numberParam(params, "k", GRAY_SCOTT_DEFAULT_K),
    stencil: stencilParam(params, GRAY_SCOTT_DEFAULT_STENCIL),
    dt: timeStepParam(params, GRAY_SCOTT_DEFAULT_DT),
    stepsPerFrame: clampStepCount(
      numberParam(params, "stepsPerFrame", GRAY_SCOTT_DEFAULT_STEPS_PER_FRAME),
    ),
  };
}

/** Explicit-Euler passes one kernel step() runs. NaN when stepsPerFrame is NaN. */
export function grayScottPassesPerStep(config: GrayScottConfig): number {
  return config.stepsPerFrame / config.dt;
}

/**
 * The pointer poke's footprint, rounded exactly as the CPU kernel rounds it, or
 * null when the strength leaves the field untouched.
 */
export function grayScottImpulseDisc(
  x: number,
  y: number,
  radius: number,
  strength: number,
): GrayScottImpulseDisc | null {
  const s = clamp01(strength);
  if (s <= 0) {
    return null;
  }
  return {
    centreX: Math.round(x),
    centreY: Math.round(y),
    radius: Math.max(1, Math.round(radius)),
    strength: s,
  };
}

export function createGrayScottInitialField(
  width: number,
  height: number,
): Float32Array {
  const field = new Float32Array(width * height * CHANNEL_COUNT);
  fillGrayScottInitialField(field, width, height);
  return field;
}

/** Full U, empty V, then the seed rings; `target` holds interleaved U,V. */
export function fillGrayScottInitialField(
  target: Float32Array,
  width: number,
  height: number,
): void {
  for (let cell = 0; cell < width * height; cell += 1) {
    const index = cell * CHANNEL_COUNT;
    target[index] = 1;
    target[index + 1] = 0;
  }

  seedOrigins(target, width, height);
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
function seedOrigins(target: Float32Array, width: number, height: number): void {
  if (width === 0 || height === 0) {
    return;
  }
  const centreX = Math.floor(width / 2);
  const centreY = Math.floor(height / 2);
  const minAxis = Math.min(width, height);
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

  seedBlob(target, width, height, centreX, centreY, radius);
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
      seedBlob(
        target,
        width,
        height,
        Math.round(centreX + Math.cos(angle) * ringRadius),
        Math.round(centreY + Math.sin(angle) * ringRadius),
        radius,
      );
    }
    ring += 1;
  }
}

function seedBlob(
  target: Float32Array,
  width: number,
  height: number,
  centreX: number,
  centreY: number,
  radius: number,
): void {
  const radiusSquared = radius * radius;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const y = centreY + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = centreX + dx;
      if (x < 0 || x >= width) continue;
      if (dx * dx + dy * dy > radiusSquared) continue;
      const index = (y * width + x) * CHANNEL_COUNT;
      target[index] = 0.5;
      target[index + 1] = 0.25;
    }
  }
}
