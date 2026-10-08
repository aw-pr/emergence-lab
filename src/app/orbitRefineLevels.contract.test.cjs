const assert = require("node:assert/strict");
const test = require("node:test");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/105-logistic-mandelbrot-second-refinement-level.md
const skip = process.env.ORBIT_LEVELS !== "1" && "set ORBIT_LEVELS=1";
const levels = () => require("../../.test-build/app/orbitRefineLevels.js");

test("level 1 refines tails of period 0 or at least 8, level 2 of period 0 or at least 16, never an escaped cell", { skip }, () => {
  const { isRefineCandidate } = levels();
  for (const [period, level1, level2] of [
    [-1, false, false],
    [0, true, true],
    [1, false, false],
    [2, false, false],
    [7, false, false],
    [8, true, false],
    [12, true, false],
    [15, true, false],
    [16, true, true],
    [64, true, true],
  ]) {
    assert.equal(isRefineCandidate(period, 1), level1, `period ${period} at level 1`);
    assert.equal(isRefineCandidate(period, 2), level2, `period ${period} at level 2`);
  }
  assert.throws(() => isRefineCandidate(8, 0), RangeError);
  assert.throws(() => isRefineCandidate(8, 3), RangeError);
});

test("sub-cell centres come from the cell's own centre and size, sub-row major", { skip }, () => {
  const { subCellCentres } = levels();
  const centres = subCellCentres(-1.4, 0.25, 0.009, 0.006, 3);
  assert.ok(centres instanceof Float64Array);
  assert.equal(centres.length, 18);
  for (let sy = 0; sy < 3; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      const index = (sy * 3 + sx) * 2;
      assert.ok(Math.abs(centres[index] - (-1.4 + (sx - 1) * 0.003)) < 1e-15, `re at ${sx},${sy}`);
      assert.ok(Math.abs(centres[index + 1] - (0.25 + (sy - 1) * 0.002)) < 1e-15, `im at ${sx},${sy}`);
    }
  }
  const five = subCellCentres(0, 0, 1, 1, 5);
  assert.equal(five.length, 50);
  assert.ok(Math.abs(five[0] - -0.4) < 1e-15 && Math.abs(five[1] - -0.4) < 1e-15);
  assert.ok(Math.abs(five[48] - 0.4) < 1e-15 && Math.abs(five[49] - 0.4) < 1e-15);
});

test("two levels of 3x3 tile a base cell as a uniform 9x9 lattice, each level-2 centre inside its own parent", { skip }, () => {
  const { subCellCentres } = levels();
  const width = 0.0012;
  const height = 0.0009;
  const first = subCellCentres(-1.36, 0.1, width, height, 3);
  const res = new Set();
  const ims = new Set();
  let sumRe = 0;
  let sumIm = 0;
  for (let child = 0; child < 9; child += 1) {
    const childRe = first[child * 2];
    const childIm = first[child * 2 + 1];
    const second = subCellCentres(childRe, childIm, width / 3, height / 3, 3);
    for (let k = 0; k < 9; k += 1) {
      const re = second[k * 2];
      const im = second[k * 2 + 1];
      assert.ok(Math.abs(re - childRe) < width / 6, "level-2 re outside its parent");
      assert.ok(Math.abs(im - childIm) < height / 6, "level-2 im outside its parent");
      res.add(Math.round((re + 1.36) / (width / 9) + 4));
      ims.add(Math.round((im - 0.1) / (height / 9) + 4));
      sumRe += re;
      sumIm += im;
      const latticeRe = (re + 1.36) / (width / 9);
      const latticeIm = (im - 0.1) / (height / 9);
      assert.ok(Math.abs(latticeRe - Math.round(latticeRe)) < 1e-6, "level-2 re off the 9x9 lattice");
      assert.ok(Math.abs(latticeIm - Math.round(latticeIm)) < 1e-6, "level-2 im off the 9x9 lattice");
    }
  }
  assert.deepEqual([...res].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...ims].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(Math.abs(sumRe / 81 - -1.36) < 1e-12);
  assert.ok(Math.abs(sumIm / 81 - 0.1) < 1e-12);
});

test("the slider grants the point budget times its clamped value, rounded down", { skip }, () => {
  const { refinementRowBudget } = levels();
  assert.equal(refinementRowBudget(9_600_000, 0), 0);
  assert.equal(refinementRowBudget(9_600_000, 0.3), 2_880_000);
  assert.equal(refinementRowBudget(9_600_000, 0.6), 5_760_000);
  assert.equal(refinementRowBudget(9_600_000, 0.9), 5_760_000);
  assert.equal(refinementRowBudget(9_600_000, -0.2), 0);
  assert.equal(refinementRowBudget(4_800_000, 0.35), 1_680_000);
  assert.equal(refinementRowBudget(1_000_001, 0.3), 300_000);
  let previous = -1;
  for (let step = 0; step <= 12; step += 1) {
    const rows = refinementRowBudget(2_400_000, step * 0.05);
    assert.ok(Number.isInteger(rows), "row budget is not an integer");
    assert.ok(rows >= previous, `not monotone at ${step * 0.05}`);
    previous = rows;
  }
});

test("level 1 is never starved by level 2, and the split never exceeds the budget", { skip }, () => {
  const { splitLevelRows } = levels();
  assert.deepEqual(splitLevelRows(2_880_000, 1_466_016), { level1: 1_466_016, level2: 1_413_984 });
  assert.deepEqual(splitLevelRows(1_000_000, 1_466_016), { level1: 1_000_000, level2: 0 });
  assert.deepEqual(splitLevelRows(0, 1_466_016), { level1: 0, level2: 0 });
  assert.deepEqual(splitLevelRows(5_760_000, 0), { level1: 0, level2: 5_760_000 });
  for (const [budget, used] of [[10, 3], [10, 10], [10, 11], [7, 0]]) {
    const split = splitLevelRows(budget, used);
    assert.equal(split.level1 + split.level2, budget);
    assert.ok(split.level1 >= 0 && split.level2 >= 0);
    assert.equal(split.level1, Math.min(budget, used));
  }
  assert.throws(() => splitLevelRows(-1, 0), RangeError);
  assert.throws(() => splitLevelRows(10, -1), RangeError);
  assert.throws(() => splitLevelRows(Number.NaN, 0), RangeError);
});

test("refined points weigh 0.15 at level 1 and 0.06 at level 2, as the baker does", { skip }, () => {
  const { refinePointWeight } = levels();
  assert.equal(refinePointWeight(1), 0.15);
  assert.equal(refinePointWeight(2), 0.06);
  assert.throws(() => refinePointWeight(0), RangeError);
  assert.throws(() => refinePointWeight(3), RangeError);
});
// AUTOMETTA-CONTRACT-END
