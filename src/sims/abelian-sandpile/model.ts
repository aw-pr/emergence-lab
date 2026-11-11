type SandpileParams = Record<string, number | boolean | string>;

export const SANDPILE_DEFAULT_INITIAL_PILE = 262144;
export const SANDPILE_DEFAULT_TOPPLE_THRESHOLD = 4;
export const SANDPILE_DEFAULT_GRAINS_PER_STEP = 0;
export const SANDPILE_DEFAULT_TOPPLES_PER_STEP = 500000;
export const SANDPILE_MAX_INITIAL_PILE = 16000000;
export const SANDPILE_MAX_TOPPLES_PER_STEP = 2000000;
export const SANDPILE_ACTIVITY_DECAY = 0.82;
export const SANDPILE_ACTIVITY_EPSILON = 0.01;

/**
 * Queue visits that one synchronous round stands in for. A round topples every
 * unstable cell at once, so "Topples per step" maps to rounds rather than to
 * individual relaxations.
 */
const TOPPLES_PER_ROUND = 2000;
const MAX_ROUNDS_PER_STEP = 500;

/** The settings a run latches when it is seeded, bounded as the CPU kernel bounds them. */
export interface SandpileConfig {
  initialPile: number;
  toppleThreshold: number;
  /** A topple only makes progress once it ships at least 4 grains. */
  minToppleGrains: number;
  grainsPerStep: number;
  topplesPerStep: number;
  roundsPerStep: number;
}

/** One cell of a pointer pour: grains added and the activity floor it sets. */
export interface SandpileImpulseCell {
  x: number;
  y: number;
  grains: number;
  activity: number;
}

function numberParam(params: SandpileParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

function boundedInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function sandpileRoundsPerStep(topplesPerStep: number): number {
  if (Number.isNaN(topplesPerStep)) {
    return 1;
  }
  return Math.max(1, Math.min(MAX_ROUNDS_PER_STEP, Math.ceil(topplesPerStep / TOPPLES_PER_ROUND)));
}

export function readSandpileConfig(params: SandpileParams): SandpileConfig {
  const toppleThreshold = boundedInteger(
    numberParam(params, "toppleThreshold", SANDPILE_DEFAULT_TOPPLE_THRESHOLD),
    2,
    12,
  );
  const topplesPerStep = boundedInteger(
    numberParam(params, "topplesPerStep", SANDPILE_DEFAULT_TOPPLES_PER_STEP),
    1,
    SANDPILE_MAX_TOPPLES_PER_STEP,
  );
  return {
    initialPile: boundedInteger(
      numberParam(params, "initialPile", SANDPILE_DEFAULT_INITIAL_PILE),
      0,
      SANDPILE_MAX_INITIAL_PILE,
    ),
    toppleThreshold,
    minToppleGrains: toppleThreshold * Math.ceil(4 / toppleThreshold),
    grainsPerStep: boundedInteger(
      numberParam(params, "grainsPerStep", SANDPILE_DEFAULT_GRAINS_PER_STEP),
      0,
      1000,
    ),
    topplesPerStep,
    roundsPerStep: sandpileRoundsPerStep(topplesPerStep),
  };
}

/**
 * The presented height of every residue `grains % threshold`, as float32 so a
 * lookup returns exactly what the CPU kernel's readState() stores.
 */
export function sandpileHeightLevels(threshold: number): Float32Array {
  const levels = new Float32Array(threshold);
  const stableMaximum = Math.max(1, threshold - 1);
  for (let residue = 0; residue < threshold; residue += 1) {
    levels[residue] = residue / stableMaximum;
  }
  return levels;
}

/**
 * The cells a pointer poke pours into, with the CPU kernel's rounding, bounds
 * clipping and activity floor. Empty when the strength leaves the pile untouched.
 */
export function sandpileImpulseCells(
  width: number,
  height: number,
  threshold: number,
  x: number,
  y: number,
  radius: number,
  strength: number,
): SandpileImpulseCell[] {
  const cells: SandpileImpulseCell[] = [];
  if (width === 0 || height === 0) {
    return cells;
  }
  const s = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  if (s <= 0) {
    return cells;
  }

  const centreX = Math.round(x);
  const centreY = Math.round(y);
  const r = Math.max(1, Math.round(radius));
  const radiusSq = r * r;
  const base = threshold + 4;

  for (let dy = -r; dy <= r; dy += 1) {
    const py = centreY + dy;
    if (py < 0 || py >= height) {
      continue;
    }
    for (let dx = -r; dx <= r; dx += 1) {
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) {
        continue;
      }
      const px = centreX + dx;
      if (px < 0 || px >= width) {
        continue;
      }
      const falloff = 1 - Math.sqrt(distSq) / r;
      const grains = Math.round(base * falloff * s);
      if (grains <= 0) {
        continue;
      }
      cells.push({ x: px, y: py, grains, activity: 0.5 * falloff * s });
    }
  }
  return cells;
}
