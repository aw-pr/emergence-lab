/**
 * Packed point layout for the logistic-Mandelbrot orbit cloud.
 *
 * A periodic cell has only min(p, sampleCount) distinct heights, so storing
 * sampleCount points for it stacks duplicates on one location: at the
 * shipped 8 samples, 76.9% of bounded cells are period 1 and 7 of every 8
 * points on the cardioid sheet are copies. The packed layout keeps the
 * sample-major stride (sampleCount rows per slot) and lets periodic cells
 * share a slot, each occupying one contiguous run of rows, so the base grid
 * costs about 1.56 rows per bounded cell instead of 8 (measured on a 384 by
 * 256 sweep at warmup 1500) and the budget it no longer spends on copies
 * goes to the cascade tails.
 *
 * These helpers are the pure part of that layout: how many rows a cell
 * needs, how slots fill, how many rows a planner should expect per bounded
 * cell, and the order in which candidate cells are admitted when the budget
 * binds. Pure: no DOM, no WebGL. The renderer (orbit3d.ts) and the GPU
 * assembly (orbitSampler.ts) consume them.
 */

export interface SlotPlacement {
  /** Index of the slot (the sample-major column) the cell occupies. */
  slot: number;
  /** First row of the cell's contiguous run inside that slot. */
  row: number;
}

/**
 * Rows a cell occupies: its distinct heights. A detected period p gives
 * min(p, sampleCount) rows; no detected period (0) gives sampleCount.
 */
export function distinctPointCount(period: number, sampleCount: number): number {
  void period;
  void sampleCount;
  throw new Error("card 103: distinctPointCount is not implemented");
}

/**
 * Expected rows per bounded cell for a planner sizing the base grid before
 * sampling. Conservative against the measured 1.56 (8 samples), 1.75 (16)
 * and 2.57 (64): an estimate that is too high leaves slots for the tails,
 * one that is too low thins the base grid.
 */
export function estimatePackedRowsPerCell(sampleCount: number): number {
  void sampleCount;
  throw new Error("card 103: estimatePackedRowsPerCell is not implemented");
}

/**
 * Online best-fit packer: a cell of n rows goes into the open slot with the
 * smallest free run that still fits, else a new slot. A cell never spans two
 * slots. Deterministic for a given placement sequence.
 */
export class SlotPacker {
  constructor(readonly rowsPerSlot: number) {
    throw new Error("card 103: SlotPacker is not implemented");
  }

  /** Slots opened so far. */
  get slotCount(): number {
    throw new Error("card 103: SlotPacker.slotCount is not implemented");
  }

  place(rows: number): SlotPlacement {
    void rows;
    throw new Error("card 103: SlotPacker.place is not implemented");
  }
}

/**
 * The order in which the candidate grid's cells are admitted into the base
 * tier. A deterministic permutation whose every prefix is spatially uniform,
 * so running out of budget part-way thins the plane evenly instead of
 * truncating it row by row.
 */
export function admissionOrder(cellCount: number, seed = 0x103): Uint32Array {
  void cellCount;
  void seed;
  throw new Error("card 103: admissionOrder is not implemented");
}
