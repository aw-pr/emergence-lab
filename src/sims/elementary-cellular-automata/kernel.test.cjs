const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ElementaryCellularAutomataKernel,
  selfTest,
} = require("../../../.test-build/sims/elementary-cellular-automata/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new ElementaryCellularAutomataKernel();
  kernel.init(33, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new ElementaryCellularAutomataKernel();

  assert.equal(kernel.name, "Elementary Cellular Automata");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["State"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["rule", "seedMode", "stepsPerFrame"],
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
  const kernel = new ElementaryCellularAutomataKernel();
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
  const defaults = defaultsFromSchema(new ElementaryCellularAutomataKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(runKernel({ rule: defaults.rule }), runKernel(defaults));
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    rule: 30,
    seedMode: 1,
    stepsPerFrame: 3,
  };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("rule 30 evolves into a bounded nontrivial spacetime pattern", () => {
  const kernel = new ElementaryCellularAutomataKernel();
  kernel.init(41, 28, { rule: 30, seedMode: 0, stepsPerFrame: 1 });

  for (let index = 0; index < 18; index += 1) {
    kernel.step(1);
  }

  const state = Array.from(kernel.readState());
  const liveCells = state.filter((value) => value === 1).length;

  assert.ok(liveCells > 18);
  assert.ok(liveCells < state.length);
  assert.ok(state.every((value) => value === 0 || value === 1));
});

test("parameter changes affect the evolved state", () => {
  const rule30 = runKernel({ rule: 30, seedMode: 0, stepsPerFrame: 1 }, 16);
  const rule90 = runKernel({ rule: 90, seedMode: 0, stepsPerFrame: 1 }, 16);
  const sparseSeed = runKernel({ rule: 30, seedMode: 1, stepsPerFrame: 1 }, 16);
  const faster = runKernel({ rule: 30, seedMode: 0, stepsPerFrame: 3 }, 16);

  assert.notDeepEqual(rule90, rule30);
  assert.notDeepEqual(sparseSeed, rule30);
  assert.notDeepEqual(faster, rule30);
});

test("params are finite-checked and clamped", () => {
  const boundedHigh = runKernel({
    rule: 999,
    seedMode: 999,
    stepsPerFrame: 999,
  });
  const explicitHigh = runKernel({
    rule: 255,
    seedMode: 2,
    stepsPerFrame: 32,
  });
  const boundedLow = runKernel({
    rule: Number.POSITIVE_INFINITY,
    seedMode: Number.NaN,
    stepsPerFrame: -100,
  });
  const explicitLow = runKernel({
    rule: 0,
    seedMode: 0,
    stepsPerFrame: 1,
  });

  assert.deepEqual(boundedHigh, explicitHigh);
  assert.deepEqual(boundedLow, explicitLow);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new ElementaryCellularAutomataKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
