const assert = require("node:assert/strict");
const test = require("node:test");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/108-logistic-mandelbrot-boundary-detail-budget.md
const skip = process.env.POINT_BUDGETS !== "1" && "set POINT_BUDGETS=1";
const budgets = () => require("../../.test-build/app/orbitPointBudgets.js");

test("the tier point budgets are unchanged", { skip }, () => {
  const { POINT_BUDGETS } = budgets();
  assert.deepEqual(
    { ...POINT_BUDGETS },
    {
      performance: 1_000_000,
      balanced: 2_400_000,
      high: 3_400_000,
      ultra: 4_800_000,
      extreme: 9_600_000,
    },
  );
});

test("boundary detail reaches 20M at extreme and stays at 16M at every other tier", { skip }, () => {
  const { POINT_BUDGETS, boundaryDetailCeilingFor } = budgets();
  assert.equal(boundaryDetailCeilingFor(POINT_BUDGETS.extreme), 20_000_000);
  for (const tier of ["performance", "balanced", "high", "ultra"]) {
    assert.equal(boundaryDetailCeilingFor(POINT_BUDGETS[tier]), 16_000_000, tier);
  }
});

test("the boundary detail level interpolates to the tier's ceiling, clamped and floored", { skip }, () => {
  const { gpuPointBudgetFor } = budgets();
  assert.equal(gpuPointBudgetFor(9_600_000, 1), 20_000_000);
  assert.equal(gpuPointBudgetFor(9_600_000, 0), 9_600_000);
  assert.equal(gpuPointBudgetFor(9_600_000, 0.5), 14_800_000);
  assert.equal(gpuPointBudgetFor(9_600_000, 0.3), 12_720_000);
  assert.equal(gpuPointBudgetFor(9_600_000, 2), 20_000_000);
  assert.equal(gpuPointBudgetFor(9_600_000, -1), 9_600_000);
  assert.equal(gpuPointBudgetFor(4_800_000, 1), 16_000_000);
  assert.equal(gpuPointBudgetFor(4_800_000, 0.5), 10_400_000);
  assert.equal(gpuPointBudgetFor(1_000_000, 1 / 3), 6_000_000);
});

test("one draw binds at most 400 MB, 12.5M points, and every tier's lower block fits", { skip }, () => {
  const { POINT_BUDGETS, BOUND_BYTES_PER_POINT, MAX_DRAW_BOUND_BYTES, maxPointsPerDraw } = budgets();
  assert.equal(BOUND_BYTES_PER_POINT, 32);
  assert.equal(MAX_DRAW_BOUND_BYTES, 400_000_000);
  assert.equal(maxPointsPerDraw(), 12_500_000);
  for (const [tier, points] of Object.entries(POINT_BUDGETS)) {
    assert.ok(points * BOUND_BYTES_PER_POINT <= MAX_DRAW_BOUND_BYTES, tier);
  }
});

test("the raised tier takes what the lower tiers leave, capped at one draw", { skip }, () => {
  const { raisedTierPointCap } = budgets();
  assert.equal(raisedTierPointCap(20_000_000, 8_361_936), 11_638_064);
  assert.equal(raisedTierPointCap(20_000_000, 2_601_936), 12_500_000);
  assert.equal(raisedTierPointCap(16_000_000, 2_601_936), 12_500_000);
  assert.equal(raisedTierPointCap(16_000_000, 8_361_936), 7_638_064);
  assert.equal(raisedTierPointCap(16_000_000, 3_500_000), 12_500_000);
  assert.equal(raisedTierPointCap(9_600_000, 9_600_000), 0);
  assert.equal(raisedTierPointCap(5_000_000, 6_000_000), 0);
});
// AUTOMETTA-CONTRACT-END
