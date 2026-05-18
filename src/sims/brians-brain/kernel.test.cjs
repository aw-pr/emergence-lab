const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BriansBrainKernel,
  selfTest,
} = require("../../../.test-build/sims/brians-brain/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new BriansBrainKernel();
  kernel.init(32, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new BriansBrainKernel();

  assert.equal(kernel.name, "Brian's Brain");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["State"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["birthCount", "seedDensity", "dyingValue"],
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
  const kernel = new BriansBrainKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("init floors dimensions and resets state idempotently", () => {
  const kernel = new BriansBrainKernel();
  kernel.init(10.9, 8.2, {});

  const state = kernel.readState();
  assert.equal(state.length, 10 * 8 * kernel.channelCount);

  kernel.step(1);
  const afterStep = Array.from(state);

  kernel.init(10.9, 8.2, {});
  assert.notDeepEqual(Array.from(kernel.readState()), afterStep);
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    birthCount: 2,
    seedDensity: 0.22,
    dyingValue: 0.5,
  };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new BriansBrainKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ birthCount: defaults.birthCount }),
    runKernel(defaults),
  );
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("stepping changes state and remains in the allowed state set", () => {
  const kernel = new BriansBrainKernel();
  kernel.init(32, 32, {});

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  for (const value of after) {
    assert.ok(value >= 0 && value <= 1);
    assert.ok(value === 0 || value === 0.5 || value === 1);
  }
});

test("Brian's Brain rules use periodic boundaries", () => {
  const kernel = new BriansBrainKernel();
  kernel.init(3, 3, { seedDensity: 0, birthCount: 2 });

  const state = kernel.readState();
  state.fill(0);
  state[0] = 1;
  state[2] = 1;

  kernel.step(1);

  assert.equal(kernel.readState()[1], 1);
  assert.equal(kernel.readState()[0], 0.5);
  assert.equal(kernel.readState()[2], 0.5);
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({
    birthCount: 3,
    seedDensity: 0.36,
    dyingValue: 0.25,
  });

  assert.notDeepEqual(changed, baseline);
});

test("params are finite-checked and clamped", () => {
  const bounded = runKernel({
    birthCount: Number.POSITIVE_INFINITY,
    seedDensity: Number.NaN,
    dyingValue: -1,
  });
  const explicit = runKernel({
    birthCount: 0,
    seedDensity: 0,
    dyingValue: 0,
  });

  assert.deepEqual(bounded, explicit);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new BriansBrainKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
