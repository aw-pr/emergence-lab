const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GrayScottKernel,
  selfTest,
} = require("../../../.test-build/sims/gray-scott/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new GrayScottKernel();
  kernel.init(32, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new GrayScottKernel();

  assert.equal(kernel.name, "Gray-Scott");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, ["U", "V"]);
  assert.deepEqual(kernel.channelRanges, [
    [0, 1],
    [0, 1],
  ]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["Du", "Dv", "F", "k"],
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
  const kernel = new GrayScottKernel();
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
  const kernel = new GrayScottKernel();
  kernel.init(10.9, 8.2, {});

  const state = kernel.readState();
  assert.equal(state.length, 10 * 8 * kernel.channelCount);

  kernel.step(1);
  const afterStep = Array.from(state);

  kernel.init(10.9, 8.2, {});
  assert.notDeepEqual(Array.from(kernel.readState()), afterStep);

  const vValues = [];
  for (let index = 1; index < state.length; index += kernel.channelCount) {
    vValues.push(kernel.readState()[index]);
  }

  assert.ok(vValues.some((value) => value > 0.1));
  assert.ok(vValues.some((value) => value === 0));
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new GrayScottKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ Du: defaults.Du, Dv: defaults.Dv }),
    runKernel(defaults),
  );
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({ F: 0.025, k: 0.075 });

  assert.notDeepEqual(changed, baseline);
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = { Du: 0.21, Dv: 0.105, F: 0.055, k: 0.062 };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("stepping starts the reaction and selfTest passes", () => {
  const kernel = new GrayScottKernel();
  kernel.init(32, 32, {});

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  assert.equal(selfTest(), true);
});

test("default seed keeps the reaction active after startup", () => {
  const kernel = new GrayScottKernel();
  kernel.init(64, 48, {});

  for (let index = 0; index < 180; index += 1) {
    kernel.step(1);
  }

  const state = kernel.readState();
  let activeV = 0;
  let depletedU = 0;

  for (let index = 0; index < state.length; index += kernel.channelCount) {
    if (state[index] < 0.9) {
      depletedU += 1;
    }
    if (state[index + 1] > 0.1) {
      activeV += 1;
    }
  }

  assert.ok(depletedU > 200);
  assert.ok(activeV > 200);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new GrayScottKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
