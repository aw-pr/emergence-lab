const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SwarmalatorsKernel,
  selfTest,
} = require("../../../.test-build/sims/swarmalators/kernel.js");
const {
  createSwarmalatorState,
  stepSwarmalators,
} = require("../../../.test-build/sims/swarmalators/model.js");

test("metadata matches the renderer contract", () => {
  const kernel = new SwarmalatorsKernel();
  assert.equal(kernel.name, "Swarmalators");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, ["Density", "Phase"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1], [0, 1]]);
  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["particleCount", "A", "B", "J", "K", "frequencySpread", "timestep", "seed", "trailPersistence"],
  );
});

test("two particles converge to the closed-form B/A spatial equilibrium", () => {
  const particles = {
    x: new Float32Array([-2, 2]),
    y: new Float32Array([0, 0]),
    theta: new Float32Array([0.3, 2.1]),
    omega: new Float32Array([0, 0]),
  };
  const params = { A: 1, B: 2, J: 0, K: 0.7 };

  for (let step = 0; step < 1200; step += 1) {
    stepSwarmalators(particles, params, 0.01);
  }

  const distance = Math.hypot(
    particles.x[1] - particles.x[0],
    particles.y[1] - particles.y[0],
  );
  assert.ok(Math.abs(distance - 2) <= 0.05, `expected d = B/A = 2, got ${distance}`);
});

test("K=0 and zero natural frequencies leave phases invariant", () => {
  const particles = createSwarmalatorState({
    particleCount: 8,
    frequencySpread: 0,
    seed: 19,
  });
  const initial = Array.from(particles.theta);

  for (let step = 0; step < 50; step += 1) {
    stepSwarmalators(particles, { A: 1, B: 2, J: 0.8, K: 0 }, 0.02);
  }

  assert.deepEqual(Array.from(particles.theta), initial);
});

test("grid output has stable dimensions and bounded channels", () => {
  const kernel = new SwarmalatorsKernel();
  kernel.init(40, 28, { particleCount: 96, seed: 11 });
  const reference = kernel.readState();
  kernel.step(1 / 60);

  assert.equal(kernel.readState(), reference);
  assert.equal(reference.length, 40 * 28 * 2);
  for (let offset = 0; offset < reference.length; offset += 2) {
    assert.ok(reference[offset] >= 0 && reference[offset] <= 1);
    assert.ok(reference[offset + 1] >= 0 && reference[offset + 1] <= 1);
  }
  assert.ok(reference.some((value, index) => index % 2 === 0 && value > 0));
});

test("rasterisation splats particles into legible multi-cell discs", () => {
  const particleCount = 48;
  const kernel = new SwarmalatorsKernel();
  kernel.init(80, 60, { particleCount, seed: 31 });

  const state = kernel.readState();
  let occupiedCells = 0;
  for (let offset = 0; offset < state.length; offset += 2) {
    if (state[offset] > 0) occupiedCells += 1;
  }

  assert.ok(
    occupiedCells > particleCount * 4,
    `expected multi-cell particle footprints, got ${occupiedCells} occupied cells`,
  );
});

test("identical seeds and parameters are deterministic", () => {
  const run = () => {
    const kernel = new SwarmalatorsKernel();
    kernel.init(32, 24, { particleCount: 48, seed: 23, J: 1, K: -0.1 });
    for (let step = 0; step < 8; step += 1) kernel.step(1 / 60);
    return Array.from(kernel.readState());
  };
  assert.deepEqual(run(), run());
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});
