const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AbelianSandpileKernel,
  selfTest,
} = require("../../../.test-build/sims/abelian-sandpile/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 8) {
  const kernel = new AbelianSandpileKernel();
  kernel.init(25, 25, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new AbelianSandpileKernel();

  assert.equal(kernel.name, "Abelian Sandpile");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, ["Stable height", "Avalanche activity"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1], [0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["initialPile", "toppleThreshold", "grainsPerStep", "topplesPerStep"],
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

  const grainsDescriptor = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "grainsPerStep",
  );
  assert.equal(grainsDescriptor?.default, 32);

  const initialPileDescriptor = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "initialPile",
  );
  assert.equal(initialPileDescriptor?.default, 450000);
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new AbelianSandpileKernel();
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
  const kernel = new AbelianSandpileKernel();
  kernel.init(10.9, 8.2, { initialPile: 65 });

  const state = kernel.readState();
  assert.equal(state.length, 10 * 8 * kernel.channelCount);

  kernel.step(1);
  const afterStep = Array.from(state);

  kernel.init(10.9, 8.2, { initialPile: 65 });
  assert.notDeepEqual(Array.from(kernel.readState()), afterStep);

  const centreIndex = (Math.floor(8 / 2) * 10 + Math.floor(10 / 2)) * kernel.channelCount;
  assert.ok(Math.abs(kernel.readState()[centreIndex] - 1 / 3) < 1e-6);
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new AbelianSandpileKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({
      initialPile: defaults.initialPile,
      toppleThreshold: defaults.toppleThreshold,
    }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    initialPile: 512,
    toppleThreshold: 4,
    grainsPerStep: 3,
    topplesPerStep: 1000,
  };

  assert.deepEqual(runKernel(params, 12), runKernel(params, 12));
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("toppling spreads grains beyond centre with open boundaries", () => {
  const kernel = new AbelianSandpileKernel();
  kernel.init(9, 9, {
    initialPile: 16,
    toppleThreshold: 4,
    grainsPerStep: 0,
    topplesPerStep: 100,
  });

  kernel.step(1);

  const state = kernel.readState();
  const centreCell = 4 * 9 + 4;
  const grains = Array.from({ length: 9 * 9 }, (_value, cell) =>
    state[cell * kernel.channelCount],
  );
  const nonCentreGrains = grains.some(
    (value, cell) => cell !== centreCell && value > 0,
  );

  assert.equal(nonCentreGrains, true);
  assert.ok(
    Math.abs(grains.reduce((sum, value) => sum + value * 3, 0) - 16) < 1e-5,
  );
});

test("toppling emits a visible avalanche activity channel", () => {
  const kernel = new AbelianSandpileKernel();
  kernel.init(21, 21, {
    initialPile: 4096,
    grainsPerStep: 0,
    topplesPerStep: 5000,
  });
  kernel.step(1);

  const state = kernel.readState();
  const activity = state.filter((_value, index) => index % 2 === 1);
  assert.ok(activity.some((value) => value > 0.1));
  assert.ok(activity.every((value) => value >= 0 && value <= 1));
});

test("open boundaries allow grains to leave the grid", () => {
  const kernel = new AbelianSandpileKernel();
  kernel.init(1, 1, {
    initialPile: 4,
    toppleThreshold: 4,
    grainsPerStep: 0,
    topplesPerStep: 10,
  });

  kernel.step(1);

  assert.equal(kernel.readState()[0], 0);
});

test("applyImpulse pours grains and relaxes through the topple queue", () => {
  const width = 21;
  const height = 21;
  const px = 10;
  const py = 10;
  const centreIndex = (py * width + px) * 2;

  const run = () => {
    const kernel = new AbelianSandpileKernel();
    kernel.init(width, height, {
      initialPile: 0,
      grainsPerStep: 0,
      topplesPerStep: 5000,
    });
    kernel.applyImpulse(px, py, 3, 1);
    // Grains land immediately but relaxation is deferred to step().
    const poured = Array.from(kernel.readState());
    kernel.step(1);
    return { poured, settled: Array.from(kernel.readState()) };
  };

  const first = run();
  const second = run();
  assert.deepEqual(first.settled, second.settled);

  assert.ok(
    first.poured.some((value, index) => index % 2 === 0 && value > 0),
    "grain-height residue appears in the poured patch",
  );
  assert.ok(first.poured[centreIndex + 1] > 0, "pour marks centre activity");

  // After a step the topple machinery has spread grains beyond the centre.
  const spread = first.settled.some(
    (value, index) => index % 2 === 0 && index !== centreIndex && value > 0,
  );
  assert.equal(spread, true);
});

test("applyImpulse is a safe no-op for zero strength and off-grid pokes", () => {
  const kernel = new AbelianSandpileKernel();
  kernel.init(16, 16, { initialPile: 0, grainsPerStep: 0 });
  const ref = kernel.readState();

  kernel.applyImpulse(8, 8, 3, 0);
  assert.equal(Array.from(ref).reduce((a, b) => a + b, 0), 0);

  assert.doesNotThrow(() => kernel.applyImpulse(-50, -50, 4, 1));
  assert.equal(kernel.readState(), ref);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new AbelianSandpileKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
