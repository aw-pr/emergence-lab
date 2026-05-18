const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LorenzAttractorKernel,
  selfTest,
} = require("../../../.test-build/sims/lorenz-attractor/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 120) {
  const kernel = new LorenzAttractorKernel();
  kernel.init(40, 30, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function occupiedCells(state) {
  return state.filter((value) => value > 0).length;
}

test("metadata matches the renderer contract", () => {
  const kernel = new LorenzAttractorKernel();

  assert.equal(kernel.name, "Lorenz Attractor");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Density"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["sigma", "rho", "beta", "stepsPerFrame", "fade"],
  );

  for (const descriptor of kernel.paramSchema) {
    assert.equal(descriptor.type, "number");
    assert.equal(typeof descriptor.default, "number");
    assert.equal(typeof descriptor.min, "number");
    assert.equal(typeof descriptor.max, "number");
    assert.equal(typeof descriptor.step, "number");
    assert.ok(descriptor.min <= descriptor.default);
    assert.ok(descriptor.default <= descriptor.max);
  }
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("init seeds a visible trajectory so the sim is not blank on load", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(96, 72, {});

  const state = Array.from(kernel.readState());

  assert.ok(occupiedCells(state) > 20);
  assert.ok(state.some((value) => value > 0));
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new LorenzAttractorKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ sigma: defaults.sigma, rho: defaults.rho }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    sigma: 10,
    rho: 28,
    beta: 2.6666667,
    stepsPerFrame: 8,
    fade: 0.985,
  };

  assert.deepEqual(runKernel(params, 180), runKernel(params, 180));
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("stepping deposits bounded density in multiple cells", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(48, 36, {});

  for (let index = 0; index < 220; index += 1) {
    kernel.step(1);
  }

  const state = Array.from(kernel.readState());

  assert.ok(occupiedCells(state) > 1);
  assert.ok(state.some((value) => value > 0));
  assert.ok(state.every((value) => value >= 0 && value <= 1));
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({ rho: 35, beta: 3.1, stepsPerFrame: 10 });

  assert.notDeepEqual(changed, baseline);
});

test("non-finite params fall back to bounded defaults", () => {
  const baseline = runKernel({});
  const invalid = runKernel({
    sigma: Number.NaN,
    rho: Number.POSITIVE_INFINITY,
    beta: Number.NEGATIVE_INFINITY,
  });

  assert.deepEqual(invalid, baseline);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
