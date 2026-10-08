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
  return period > 0 ? Math.min(period, sampleCount) : sampleCount;
}

/**
 * Expected rows per bounded cell for a planner sizing the base grid before
 * sampling. Conservative against the measured 1.56 (8 samples), 1.75 (16)
 * and 2.57 (64): an estimate that is too high leaves slots for the tails,
 * one that is too low thins the base grid.
 */
export function estimatePackedRowsPerCell(sampleCount: number): number {
  return Math.min(sampleCount, 1.45 + sampleCount / 48);
}

/**
 * Online best-fit packer: a cell of n rows goes into the open slot with the
 * smallest free run that still fits, else a new slot. A cell never spans two
 * slots. Deterministic for a given placement sequence.
 *
 * Cells are only ever appended to a slot, so a slot's free rows are one run
 * at its end and "the smallest free run that fits" is the open slot with the
 * fewest free rows that is still at least n. Open slots are bucketed by free
 * row count; a placement scans at most rowsPerSlot buckets.
 */
export class SlotPacker {
  private readonly slotsByFree: number[][];
  private readonly usedRows: number[] = [];
  private rows = 0;

  constructor(readonly rowsPerSlot: number) {
    if (!Number.isInteger(rowsPerSlot) || rowsPerSlot < 1) {
      throw new RangeError(`SlotPacker: rowsPerSlot must be a positive integer, got ${rowsPerSlot}`);
    }
    this.slotsByFree = Array.from({ length: rowsPerSlot + 1 }, () => []);
  }

  /** Slots opened so far. */
  get slotCount(): number {
    return this.usedRows.length;
  }

  /** Rows occupied across every slot. */
  get rowCount(): number {
    return this.rows;
  }

  /** Whether a cell of `rows` rows fits an already open slot. */
  fitsOpenSlot(rows: number): boolean {
    this.checkRows(rows);
    for (let free = rows; free <= this.rowsPerSlot; free += 1) {
      if (this.slotsByFree[free].length > 0) return true;
    }
    return false;
  }

  /** Rows a slot has used, for walking the layout after packing. */
  usedRowsOf(slot: number): number {
    return this.usedRows[slot] ?? 0;
  }

  place(rows: number): SlotPlacement {
    const packed = this.placePacked(rows);
    return {
      slot: Math.floor(packed / this.rowsPerSlot),
      row: packed % this.rowsPerSlot,
    };
  }

  /**
   * `place` returning `slot * rowsPerSlot + row` as one integer, for the
   * builders' per-cell loops, which would otherwise allocate a placement
   * object for every one of millions of cells.
   */
  placePacked(rows: number): number {
    this.checkRows(rows);
    for (let free = rows; free <= this.rowsPerSlot; free += 1) {
      const bucket = this.slotsByFree[free];
      if (bucket.length === 0) continue;
      const slot = bucket.pop() as number;
      const row = this.usedRows[slot];
      this.usedRows[slot] = row + rows;
      this.rows += rows;
      const remaining = free - rows;
      if (remaining > 0) this.slotsByFree[remaining].push(slot);
      return slot * this.rowsPerSlot + row;
    }
    const slot = this.usedRows.length;
    this.usedRows.push(rows);
    this.rows += rows;
    const remaining = this.rowsPerSlot - rows;
    if (remaining > 0) this.slotsByFree[remaining].push(slot);
    return slot * this.rowsPerSlot;
  }

  private checkRows(rows: number): void {
    if (!Number.isInteger(rows) || rows < 1 || rows > this.rowsPerSlot) {
      throw new RangeError(
        `SlotPacker: cell size must be an integer in 1..${this.rowsPerSlot}, got ${rows}`,
      );
    }
  }
}

/**
 * The order in which the candidate grid's cells are admitted into the base
 * tier. A deterministic permutation whose every prefix is spatially uniform,
 * so running out of budget part-way thins the plane evenly instead of
 * truncating it row by row.
 *
 * A seeded Fisher-Yates shuffle: every prefix is a uniform random subset of
 * the grid, so any block of the plane receives its share of a prefix to
 * within sampling noise.
 */
export function admissionOrder(cellCount: number, seed = 0x103): Uint32Array {
  const order = new Uint32Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) order[index] = index;
  // xorshift32 over a non-zero state; the seed is mixed so 0 is usable too.
  // Inlined rather than a generator closure: the shuffle runs over millions
  // of cells and the closure call was most of its cost.
  let state = (seed ^ 0x9e3779b9) >>> 0 || 0x1;
  for (let index = cellCount - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const swap = state % (index + 1);
    const held = order[index];
    order[index] = order[swap];
    order[swap] = held;
  }
  return order;
}
