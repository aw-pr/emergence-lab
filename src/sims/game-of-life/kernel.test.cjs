const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GameOfLifeKernel,
  selfTest,
} = require("../../../.test-build/sims/game-of-life/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new GameOfLifeKernel();
  kernel.init(32, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new GameOfLifeKernel();

  assert.equal(kernel.name, "Conway's Game of Life");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Alive"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["birthMin", "birthMax", "surviveMin", "surviveMax", "seedDensity"],
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
  const kernel = new GameOfLifeKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    birthMin: 3,
    birthMax: 3,
    surviveMin: 2,
    surviveMax: 3,
    seedDensity: 0.28,
  };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new GameOfLifeKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ birthMin: defaults.birthMin, birthMax: defaults.birthMax }),
    runKernel(defaults),
  );
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("stepping changes state and remains bounded to zero or one", () => {
  const kernel = new GameOfLifeKernel();
  kernel.init(32, 32, {});

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  for (const value of after) {
    assert.ok(value === 0 || value === 1);
  }
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({
    birthMin: 3,
    birthMax: 4,
    surviveMin: 3,
    surviveMax: 4,
    seedDensity: 0.42,
  });

  assert.notDeepEqual(changed, baseline);
});

test("params are finite-checked and clamped", () => {
  const bounded = runKernel({
    birthMin: -100,
    birthMax: Number.POSITIVE_INFINITY,
    surviveMin: Number.NaN,
    surviveMax: 100,
    seedDensity: 2,
  });
  const explicit = runKernel({
    birthMin: 0,
    birthMax: 8,
    surviveMin: 0,
    surviveMax: 8,
    seedDensity: 1,
  });

  assert.deepEqual(bounded, explicit);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new GameOfLifeKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
