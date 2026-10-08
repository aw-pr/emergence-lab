const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveOrbitRefinement,
} = require("../../.test-build/app/orbitRefinement.js");

test("orbit refinement: GPU zero stays off", () => {
  assert.equal(resolveOrbitRefinement(0, true, false), 0);
});

test("orbit refinement: GPU undefined defaults to 0.3", () => {
  assert.equal(resolveOrbitRefinement(undefined, true, false), 0.3);
});

test("orbit refinement: GPU 0.45 stays 0.45", () => {
  assert.equal(resolveOrbitRefinement(0.45, true, false), 0.45);
});

test("orbit refinement: GPU 2 clamps to 0.6", () => {
  assert.equal(resolveOrbitRefinement(2, true, false), 0.6);
});

test("orbit refinement: CPU zero selects automatic 0.3", () => {
  assert.equal(resolveOrbitRefinement(0, false, false), 0.3);
});

test("orbit refinement: CPU 0.1 stays 0.1", () => {
  assert.equal(resolveOrbitRefinement(0.1, false, false), 0.1);
});

test("orbit refinement: CPU 0.45 caps at the automatic 0.3 share", () => {
  assert.equal(resolveOrbitRefinement(0.45, false, false), 0.3);
});

test("orbit refinement: CPU 0.6 caps at the automatic 0.3 share", () => {
  assert.equal(resolveOrbitRefinement(0.6, false, false), 0.3);
});

test("orbit refinement: CPU undefined defaults to 0.3", () => {
  assert.equal(resolveOrbitRefinement(undefined, false, false), 0.3);
});

test("orbit refinement: real slices disable refinement on both paths", () => {
  for (const gpuAvailable of [true, false]) {
    for (const value of [0, 0.1, 0.45, 2, -1, undefined, NaN, Infinity, true, "0.3"]) {
      assert.equal(resolveOrbitRefinement(value, gpuAvailable, true), 0);
    }
  }
});
