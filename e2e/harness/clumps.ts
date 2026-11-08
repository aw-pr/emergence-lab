import { gaussianBlur } from "./metrics.ts";

export interface ClumpField {
  width: number;
  height: number;
  density: ArrayLike<number>;
  speed: ArrayLike<number>;
  vx: ArrayLike<number>;
  vy: ArrayLike<number>;
}

export interface ClumpOptions {
  blurRadius: number;
  /** Fraction of the blurred maximum a cell must reach to belong to a clump. */
  threshold: number;
  /** Smallest share of the total raw mass a component may hold and still count. */
  minMassFraction: number;
}

export interface ClumpReading {
  clumps: number;
  headingSpread: number;
  /** Density-weighted mean of the Speed channel, in the channel's own units (a fraction of maxSpeed for Boids). */
  meanSpeed: number;
  masses: number[];
  headings: number[];
}

export interface ClumpSample {
  clumps: number;
  headingSpread: number;
  /** Absolute speed: the channel fraction already scaled by the row's maxSpeed. */
  meanSpeed: number;
}

export const SPEED_CEILING = 40;
const CLUMP_TARGET = 5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Labels 4-connected components of `mask` on a torus; returns one cell-index list per component. */
function torusComponents(mask: Uint8Array, width: number, height: number): number[][] {
  const seen = new Uint8Array(mask.length);
  const components: number[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      cells.push(index);
      const x = index % width;
      const y = (index - x) / width;
      const neighbours = [
        y * width + ((x + 1) % width),
        y * width + ((x + width - 1) % width),
        ((y + 1) % height) * width + x,
        ((y + height - 1) % height) * width + x,
      ];
      for (const n of neighbours) {
        if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    components.push(cells);
  }
  return components;
}

export function clumpRegime(field: ClumpField, options: ClumpOptions): ClumpReading {
  const { width, height, density, speed, vx, vy } = field;
  const n = width * height;
  const empty: ClumpReading = { clumps: 0, headingSpread: 0, meanSpeed: 0, masses: [], headings: [] };
  if (n === 0) return empty;

  let totalMass = 0;
  let speedSum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = density[i];
    if (!(d > 0)) continue;
    totalMass += d;
    speedSum += d * speed[i];
  }
  if (totalMass <= 0) return empty;
  const meanSpeed = speedSum / totalMass;

  const blurred = gaussianBlur(density, width, height, options.blurRadius);
  let peak = 0;
  for (let i = 0; i < n; i += 1) if (blurred[i] > peak) peak = blurred[i];
  if (!(peak > 0)) return { ...empty, meanSpeed };
  const cut = options.threshold * peak;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) mask[i] = blurred[i] >= cut ? 1 : 0;

  const kept: { mass: number; heading: number; ux: number; uy: number }[] = [];
  for (const cells of torusComponents(mask, width, height)) {
    let mass = 0;
    let sx = 0;
    let sy = 0;
    for (const i of cells) {
      const d = density[i] > 0 ? density[i] : 0;
      mass += d;
      sx += d * vx[i];
      sy += d * vy[i];
    }
    if (mass < options.minMassFraction * totalMass) continue;
    const length = Math.hypot(sx, sy);
    kept.push(length > 0
      ? { mass, heading: Math.atan2(sy, sx), ux: sx / length, uy: sy / length }
      : { mass, heading: 0, ux: 0, uy: 0 });
  }
  kept.sort((a, b) => b.mass - a.mass);

  let keptMass = 0;
  let rx = 0;
  let ry = 0;
  for (const k of kept) { keptMass += k.mass; rx += k.mass * k.ux; ry += k.mass * k.uy; }
  const headingSpread = kept.length > 1 && keptMass > 0 ? clamp01(1 - Math.hypot(rx, ry) / keptMass) : 0;
  return { clumps: kept.length, headingSpread, meanSpeed, masses: kept.map(k => k.mass), headings: kept.map(k => k.heading) };
}

/** The worst sample decides: a regime that decays by the last step scores by its worst moment. */
export function clumpScore(samples: readonly ClumpSample[]): number {
  if (samples.length === 0) return 0;
  let score = Infinity;
  for (const s of samples) {
    const clumpTerm = clamp01((s.clumps - 1) / (CLUMP_TARGET - 1));
    const speedTerm = clamp01(s.meanSpeed / SPEED_CEILING);
    score = Math.min(score, clumpTerm * s.headingSpread * speedTerm);
  }
  return score;
}
