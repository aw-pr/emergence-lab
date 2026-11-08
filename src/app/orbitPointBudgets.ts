/**
 * Point budgets for the logistic-Mandelbrot orbit cloud, and the per-draw
 * byte ceiling the raised boundary-detail tier must stay under.
 *
 * Card 107 measured, on an Apple M2 Max under ANGLE on Metal, that once more
 * than about 415-446 MB of attribute buffers are bound to one point draw,
 * every rasterised point costs about twice as much. Points are 32 bytes in
 * those buffers (six Float32 attributes), and the renderer draws the lower
 * tiers and the raised tier as two separate blocks, so each block is held
 * under the ceiling on its own.
 *
 * Pure: no DOM, no WebGL. orbit3d.ts consumes these.
 */

/** Point budget for each grid tier, as recovered from the compute grid. */
export const POINT_BUDGETS = {
  performance: 1_000_000,
  balanced: 2_400_000,
  high: 3_400_000,
  ultra: 4_800_000,
  extreme: 9_600_000,
} as const;

/** Bytes one point occupies in the bound attribute buffers. */
export const BOUND_BYTES_PER_POINT = 32;

/** Bytes of attribute buffers one point draw may bind. */
export const MAX_DRAW_BOUND_BYTES = 400_000_000;

/**
 * Point budget the build may reach at boundary detail 1, given the tier's
 * own point budget: 20,000,000 at `extreme`, 16,000,000 at every other tier.
 */
export function boundaryDetailCeilingFor(pointBudget: number): number {
  return pointBudget === POINT_BUDGETS.extreme ? 20_000_000 : 16_000_000;
}

/**
 * Point budget at a boundary detail level: the tier budget plus the level's
 * share of the gap to the tier's ceiling, the level clamped to [0, 1] and
 * the result rounded down.
 */
export function gpuPointBudgetFor(pointBudget: number, boundaryDetailLevel: number): number {
  const level = Math.max(0, Math.min(1, boundaryDetailLevel));
  return Math.floor(
    pointBudget + (boundaryDetailCeilingFor(pointBudget) - pointBudget) * level,
  );
}

/** Points one draw may bind: the byte ceiling over the bytes per point. */
export function maxPointsPerDraw(): number {
  return Math.floor(MAX_DRAW_BOUND_BYTES / BOUND_BYTES_PER_POINT);
}

/**
 * Points the raised tier may hold: what the boundary-detail budget leaves
 * after the lower tiers, never more than one draw may bind and never less
 * than zero.
 */
export function raisedTierPointCap(gpuPointBudget: number, lowerTierPoints: number): number {
  return Math.max(
    0,
    Math.min(gpuPointBudget - lowerTierPoints, maxPointsPerDraw()),
  );
}
