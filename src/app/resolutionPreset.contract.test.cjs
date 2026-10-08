const assert = require("node:assert/strict");
const test = require("node:test");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/107-logistic-mandelbrot-extreme-pool.md
const skip = process.env.EXTREME_POOL !== "1" && "set EXTREME_POOL=1";
const presets = () => require("../../.test-build/app/resolutionPreset.js");

test("the extreme pool is 2560 by 2560 cells", { skip }, () => {
  const { RESOLUTION_TARGETS } = presets();
  assert.equal(RESOLUTION_TARGETS.extreme, 2560 * 2560);
});

test("the other presets and the default are unchanged", { skip }, () => {
  const { RESOLUTION_TARGETS, DEFAULT_RESOLUTION } = presets();
  assert.equal(RESOLUTION_TARGETS.performance, 384 * 384);
  assert.equal(RESOLUTION_TARGETS.balanced, 640 * 640);
  assert.equal(RESOLUTION_TARGETS.high, 960 * 960);
  assert.equal(RESOLUTION_TARGETS.ultra, 1280 * 1280);
  assert.equal(DEFAULT_RESOLUTION, "balanced");
  assert.deepEqual(Object.keys(RESOLUTION_TARGETS).sort(), ["balanced", "extreme", "high", "performance", "ultra"]);
});

test("the presets stay strictly ordered by cell count", { skip }, () => {
  const { RESOLUTION_TARGETS } = presets();
  const order = ["performance", "balanced", "high", "ultra", "extreme"].map((p) => RESOLUTION_TARGETS[p]);
  for (let i = 1; i < order.length; i += 1) assert.ok(order[i] > order[i - 1], `${i}`);
});
// AUTOMETTA-CONTRACT-END
