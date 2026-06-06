const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DiffusionLimitedAggregationKernel,
  selfTest,
} = require("../../../.test-build/sims/diffusion-limited-aggregation/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 8) {
  const kernel = new DiffusionLimitedAggregationKernel();
  // Fixed seed so determinism/equality assertions hold; the app omits `seed`
  // and so draws a fresh random cluster each run.
  kernel.init(32, 32, { seed: 1, ...params });

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function clusterSize(state) {
  return state.reduce((sum, value) => sum + value, 0);
}

test("metadata matches the renderer contract", () => {
  const kernel = new DiffusionLimitedAggregationKernel();

  assert.equal(kernel.name, "Diffusion-Limited Aggregation");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Cluster"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "walkersPerStep",
      "maxWalkSteps",
      "spawnRadius",
      "stickiness",
      "seedCount",
    ],
  );

  for (const descriptor of kernel.paramSchema) {
    assert.equal(descriptor.type, "number");
    assert.equal(typeof descriptor.default, "number");
    assert.equal(typeof descriptor.min, "number");
    assert.equal(typeof descriptor.max, "number");
    assert.equal(typeof descriptor.step, "number");
    assert.ok(Number.isFinite(descriptor.default));
    assert.ok(descriptor.min <= descriptor.default);
    assert.ok(descriptor.default <= descriptor.max);
  }
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new DiffusionLimitedAggregationKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new DiffusionLimitedAggregationKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({
      walkersPerStep: defaults.walkersPerStep,
      maxWalkSteps: defaults.maxWalkSteps,
    }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    walkersPerStep: 80,
    maxWalkSteps: 320,
    spawnRadius: 0.35,
    stickiness: 0.75,
    seedCount: 2,
  };

  assert.deepEqual(runKernel(params, 12), runKernel(params, 12));
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("stepping grows the cluster and remains bounded to zero or one", () => {
  const kernel = new DiffusionLimitedAggregationKernel();
  kernel.init(32, 32, {
    walkersPerStep: 96,
    maxWalkSteps: 384,
    spawnRadius: 0.32,
    stickiness: 1,
    seedCount: 1,
  });

  const before = Array.from(kernel.readState());
  for (let index = 0; index < 6; index += 1) {
    kernel.step(1);
  }
  const after = Array.from(kernel.readState());

  assert.ok(clusterSize(after) > clusterSize(before));
  for (const value of after) {
    assert.ok(value === 0 || value === 1);
  }
});

test("default settings produce a visible cluster within the page-load budget", () => {
  const kernel = new DiffusionLimitedAggregationKernel();
  kernel.init(800, 600, { ...defaultsFromSchema(kernel), seed: 1 });

  for (let index = 0; index < 480; index += 1) {
    kernel.step(1);
  }

  assert.ok(clusterSize(Array.from(kernel.readState())) >= 100);
});

test("growth remains directional-balanced around the seed", () => {
  const width = 41;
  const height = 41;
  const centreX = Math.floor(width / 2);
  const centreY = Math.floor(height / 2);
  const kernel = new DiffusionLimitedAggregationKernel();
  kernel.init(width, height, {
    walkersPerStep: 160,
    maxWalkSteps: 512,
    spawnRadius: 0.34,
    stickiness: 1,
    seedCount: 1,
    seed: 1,
  });

  for (let index = 0; index < 10; index += 1) {
    kernel.step(1);
  }

  const state = kernel.readState();
  let left = 0;
  let right = 0;
  let up = 0;
  let down = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (state[y * width + x] !== 1) {
        continue;
      }
      if (x < centreX) left += 1;
      if (x > centreX) right += 1;
      if (y < centreY) up += 1;
      if (y > centreY) down += 1;
    }
  }

  assert.ok(left > 0);
  assert.ok(right > 0);
  assert.ok(up > 0);
  assert.ok(down > 0);
});

test("open boundaries keep walkers on-grid or discard them without wrapping", () => {
  const kernel = new DiffusionLimitedAggregationKernel();
  kernel.init(5, 5, {
    walkersPerStep: 32,
    maxWalkSteps: 64,
    spawnRadius: 0.5,
    stickiness: 1,
    seedCount: 1,
  });

  for (let index = 0; index < 4; index += 1) {
    kernel.step(1);
  }

  assert.equal(kernel.readState().length, 25);
  for (const value of kernel.readState()) {
    assert.ok(value === 0 || value === 1);
  }
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({
    walkersPerStep: 64,
    maxWalkSteps: 256,
    spawnRadius: 0.48,
    stickiness: 1,
    seedCount: 1,
  });
  const changed = runKernel({
    walkersPerStep: 16,
    maxWalkSteps: 96,
    spawnRadius: 0.25,
    stickiness: 0.5,
    seedCount: 5,
  });

  assert.notDeepEqual(changed, baseline);
});

test("params are finite-checked and clamped", () => {
  const bounded = runKernel({
    walkersPerStep: Number.POSITIVE_INFINITY,
    maxWalkSteps: Number.NaN,
    spawnRadius: -100,
    stickiness: 2,
    seedCount: 100,
  });
  const explicit = runKernel({
    walkersPerStep: 0,
    maxWalkSteps: 1,
    spawnRadius: 0.05,
    stickiness: 1,
    seedCount: 32,
  });

  assert.deepEqual(bounded, explicit);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new DiffusionLimitedAggregationKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
