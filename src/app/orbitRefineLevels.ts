/**
 * Two-level tail refinement for the logistic-Mandelbrot orbit cloud.
 *
 * Level 1 re-samples each base cell that is still a cascade tail on a 3 by 3
 * sub-grid. Level 2 re-samples each level-1 sub-cell that is still a tail on
 * a 3 by 3 sub-grid of its own, so a level-2 cell is 1/9 of a base cell on
 * each axis. The offline baker has refined this way since its first release;
 * the live builders refined one level only, and once card 103 stopped the
 * stacked copies spending the budget, every tail fitted at every slider
 * setting and the Tail refinement slider changed nothing above 0.
 *
 * Measured 2026-10-07 on a 480 by 480 sweep of the sampler domain at 8
 * samples, scaled to the 1920 by 1920 extreme pool: base rows about 1.44M,
 * level-1 rows about 1.47M, level-2 rows about 5.39M. The slider therefore
 * sets the refinement row budget directly (fraction times the point budget),
 * and level 2 spends what level 1 leaves.
 *
 * These helpers are the pure part: which cells are refined at each level,
 * where a cell's sub-cells sit, how the slider maps to a row budget and how
 * that budget is split between the levels, and the per-point weight of each
 * level. Pure: no DOM, no WebGL. The CPU builder (orbit3d.ts) and the GPU
 * assembly (orbitSampler.ts) consume them.
 */

/** Refinement levels the live builders run. */
export type RefineLevel = 1 | 2;

/** The slider's ceiling: refinement never takes more than this share of the budget. */
export const MAX_REFINE_FRACTION = 0.6;

const PERIOD_THRESHOLD_BY_LEVEL: Readonly<Record<RefineLevel, number>> = { 1: 8, 2: 16 };
const POINT_WEIGHT_BY_LEVEL: Readonly<Record<RefineLevel, number>> = { 1: 0.15, 2: 0.06 };

function checkLevel(level: number): RefineLevel {
  if (level !== 1 && level !== 2) {
    throw new RangeError(`orbitRefineLevels: level must be 1 or 2, got ${level}`);
  }
  return level;
}

/**
 * Whether a sampled cell is refined at `level`: a bounded cell whose
 * detected period is 0 (none found) or at least the level's threshold
 * (8 at level 1, 16 at level 2). An escaped cell (period -1) never is.
 */
export function isRefineCandidate(period: number, level: RefineLevel): boolean {
  const threshold = PERIOD_THRESHOLD_BY_LEVEL[checkLevel(level)];
  if (period < 0) return false;
  return period === 0 || period >= threshold;
}

/**
 * Centres of a cell's subdivision by subdivision sub-cells, from the cell's
 * own centre and size (never from a grid index), as interleaved (re, im)
 * pairs ordered by sub-row then sub-column.
 */
export function subCellCentres(
  centreRe: number,
  centreIm: number,
  cellWidth: number,
  cellHeight: number,
  subdivision: number,
): Float64Array {
  const centres = new Float64Array(subdivision * subdivision * 2);
  let cursor = 0;
  for (let sy = 0; sy < subdivision; sy += 1) {
    const im = centreIm + ((sy + 0.5) / subdivision - 0.5) * cellHeight;
    for (let sx = 0; sx < subdivision; sx += 1) {
      centres[cursor] = centreRe + ((sx + 0.5) / subdivision - 0.5) * cellWidth;
      centres[cursor + 1] = im;
      cursor += 2;
    }
  }
  return centres;
}

/**
 * Rows the Tail refinement setting grants to refinement: the point budget
 * times the setting clamped to [0, 0.6], rounded down.
 */
export function refinementRowBudget(pointBudget: number, fraction: number): number {
  const clamped = Math.max(0, Math.min(MAX_REFINE_FRACTION, fraction));
  return Math.floor(pointBudget * clamped);
}

/**
 * Split a refinement row budget between the levels. Level 1 takes the rows
 * it actually packed, up to the budget; level 2 gets the remainder.
 */
export function splitLevelRows(
  budgetRows: number,
  level1Rows: number,
): { level1: number; level2: number } {
  if (!Number.isFinite(budgetRows) || budgetRows < 0) {
    throw new RangeError(`splitLevelRows: budget must be a non-negative number, got ${budgetRows}`);
  }
  if (!Number.isFinite(level1Rows) || level1Rows < 0) {
    throw new RangeError(`splitLevelRows: level-1 rows must be a non-negative number, got ${level1Rows}`);
  }
  const level1 = Math.min(budgetRows, level1Rows);
  return { level1, level2: budgetRows - level1 };
}

/** Per-point weight of a refined point: 0.15 at level 1, 0.06 at level 2. */
export function refinePointWeight(level: RefineLevel): number {
  return POINT_WEIGHT_BY_LEVEL[checkLevel(level)];
}
