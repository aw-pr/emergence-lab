/**
 * Hierarchical cycle centres for Inside-out colouring.
 *
 * Inside-out colours a point by its height distance from a centre. With one
 * centre per column (the orbit mean) a cycle born by period-doubling starts
 * at its parent's distance, so the bands of a period-4 bulb continue the
 * period-2 bulb's bands instead of leaving the period-4 root: measured at
 * c = -1.26 the four branches sit at 0.63 to 0.79 from the column mean while
 * the period-2 branches arrive at 0.70. This module measures each cycle
 * point against the parent cycle point it was born from.
 *
 * For a cycle of period p with heights h_0..h_{p-1} (consecutive iterates),
 * every divisor s >= 2 of p proposes a satellite multiplicity: the group of
 * cycle index k is {k + j p/s mod p : j < s}, its parent is the group's mean
 * height, and the proposal's cost is the mean squared deviation of each
 * point from its parent. The proposal with the smallest cost wins; a tie
 * within 1e-12 relative goes to the larger s. A prime period has only
 * s = p, whose parents are all the column mean, so primary bulbs keep the
 * current colouring; a period-doubled bulb picks s = 2 and a 1/3 satellite
 * picks s = 3. Pure: no DOM, no WebGL. The CPU oracle (model.ts), the GPU
 * sampler, the prebaked derive and the hybrid sheet builder all apply it.
 */

export interface CycleHierarchy {
  /** The chosen satellite multiplicity s (1 for a period-1 cycle). */
  multiplicity: number;
  /** Parent centre of each cycle index 0..period-1. */
  centres: Float64Array;
}

/**
 * Parent centres for one cycle. `heights` holds at least `period` consecutive
 * cycle heights starting at cycle index 0; `period` must be at least 1.
 */
export function cycleHierarchy(
  heights: ArrayLike<number>,
  period: number,
): CycleHierarchy {
  if (!Number.isInteger(period) || period < 1 || heights.length < period) {
    throw new RangeError("a cycle needs a positive integer period and one full cycle of heights");
  }
  const centres = new Float64Array(period);
  if (period === 1) {
    centres[0] = heights[0];
    return { multiplicity: 1, centres };
  }
  const parents = new Float64Array(period);
  let multiplicity = 1;
  let bestCost = Infinity;
  for (let s = 2; s <= period; s += 1) {
    if (period % s !== 0) continue;
    const stride = period / s;
    let cost = 0;
    for (let group = 0; group < stride; group += 1) {
      let sum = 0;
      for (let k = group; k < period; k += stride) sum += heights[k];
      const parent = sum / s;
      for (let k = group; k < period; k += stride) {
        parents[k] = parent;
        cost += (heights[k] - parent) ** 2;
      }
    }
    cost /= period;
    if (cost <= bestCost || Math.abs(cost - bestCost) <= 1e-12 * Math.max(cost, bestCost)) {
      bestCost = cost;
      multiplicity = s;
      centres.set(parents);
    }
  }
  return { multiplicity, centres };
}
