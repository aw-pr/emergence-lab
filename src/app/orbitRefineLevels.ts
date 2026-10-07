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

/**
 * Whether a sampled cell is refined at `level`: a bounded cell whose
 * detected period is 0 (none found) or at least the level's threshold
 * (8 at level 1, 16 at level 2). An escaped cell (period -1) never is.
 */
export function isRefineCandidate(period: number, level: RefineLevel): boolean {
  void period;
  void level;
  throw new Error("card 105: isRefineCandidate is not implemented");
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
  void centreRe;
  void centreIm;
  void cellWidth;
  void cellHeight;
  void subdivision;
  throw new Error("card 105: subCellCentres is not implemented");
}

/**
 * Rows the Tail refinement setting grants to refinement: the point budget
 * times the setting clamped to [0, 0.6], rounded down.
 */
export function refinementRowBudget(pointBudget: number, fraction: number): number {
  void pointBudget;
  void fraction;
  throw new Error("card 105: refinementRowBudget is not implemented");
}

/**
 * Split a refinement row budget between the levels. Level 1 takes the rows
 * it actually packed, up to the budget; level 2 gets the remainder.
 */
export function splitLevelRows(
  budgetRows: number,
  level1Rows: number,
): { level1: number; level2: number } {
  void budgetRows;
  void level1Rows;
  throw new Error("card 105: splitLevelRows is not implemented");
}

/** Per-point weight of a refined point: 0.15 at level 1, 0.06 at level 2. */
export function refinePointWeight(level: RefineLevel): number {
  void level;
  throw new Error("card 105: refinePointWeight is not implemented");
}
