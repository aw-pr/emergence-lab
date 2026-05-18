const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BelousovZhabotinskyKernel,
  selfTest,
} = require("../../../.test-build/sims/belousov-zhabotinsky/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new BelousovZhabotinskyKernel();
  kernel.init(32, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function assertBounded(state) {
  for (const value of state) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0);
    assert.ok(value <= 1);
  }
}

test("metadata matches the renderer contract", () => {
  const kernel = new BelousovZhabotinskyKernel();

  assert.equal(kernel.name, "Belousov-Zhabotinsky");
  assert.equal(kernel.channelCount, 3);
  assert.deepEqual(kernel.channelLabels, [
    "Activator",
    "Inhibitor",
    "Catalyst",
  ]);
  assert.deepEqual(kernel.channelRanges, [
    [0, 1],
    [0, 1],
    [0, 1],
  ]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "diffusionA",
      "diffusionB",
      "diffusionC",
      "feed",
      "kill",
      "stepsPerFrame",
    ],
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
  const kernel = new BelousovZhabotinskyKernel();
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
  const kernel = new BelousovZhabotinskyKernel();
  kernel.init(10.9, 8.2, {});

  const state = kernel.readState();
  assert.equal(state.length, 10 * 8 * kernel.channelCount);

  kernel.step(1);
  const afterStep = Array.from(state);

  kernel.init(10.9, 8.2, {});
  assert.notDeepEqual(Array.from(kernel.readState()), afterStep);
  assertBounded(kernel.readState());
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new BelousovZhabotinskyKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({
      diffusionA: defaults.diffusionA,
      diffusionB: defaults.diffusionB,
    }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    diffusionA: 0.18,
    diffusionB: 0.08,
    diffusionC: 0.035,
    feed: 0.024,
    kill: 0.055,
    stepsPerFrame: 2,
  };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("stepping changes state and all channels stay bounded", () => {
  const kernel = new BelousovZhabotinskyKernel();
  kernel.init(32, 32, {});

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  assertBounded(after);
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({
    diffusionA: 0.24,
    diffusionB: 0.045,
    diffusionC: 0.065,
    feed: 0.045,
    kill: 0.03,
    stepsPerFrame: 4,
  });

  assert.notDeepEqual(changed, baseline);
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new BelousovZhabotinskyKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
