const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BurningShipKernel,
  selfTest,
} = require("../../../.test-build/sims/burning-ship/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 0) {
  const kernel = new BurningShipKernel();
  kernel.init(40, 30, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function bounded01(state) {
  return state.every((value) => value >= 0 && value <= 1);
}

test("metadata matches the renderer contract", () => {
  const kernel = new BurningShipKernel();

  assert.equal(kernel.name, "Burning Ship");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Escape"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "centerX",
      "centerY",
      "zoom",
      "maxIterations",
      "palettePhase",
      "cycleSpeed",
    ],
  );

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
      descriptor.min,
      descriptor.max,
      descriptor.step,
    ]),
    [
      ["centerX", -0.5, -2.2, 1.2, 0.001],
      ["centerY", -0.5, -2, 1, 0.001],
      ["zoom", 1, 0.25, 500, 0.01],
      ["maxIterations", 128, 16, 512, 1],
      ["palettePhase", 0.15, 0, 1, 0.001],
      ["cycleSpeed", 0.2, 0, 5, 0.001],
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
  const kernel = new BurningShipKernel();
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
    centerX: -0.62,
    centerY: -0.48,
    zoom: 1.8,
    maxIterations: 160,
    palettePhase: 0.2,
    cycleSpeed: 0.011,
  };

  assert.deepEqual(runKernel(params, 8), runKernel(params, 8));
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("zoom, center and maxIterations params affect state", () => {
  const baseline = runKernel({ cycleSpeed: 0 });

  assert.notDeepEqual(runKernel({ zoom: 2, cycleSpeed: 0 }), baseline);
  assert.notDeepEqual(runKernel({ centerX: -1, cycleSpeed: 0 }), baseline);
  assert.notDeepEqual(runKernel({ centerY: -0.8, cycleSpeed: 0 }), baseline);
  assert.notDeepEqual(
    runKernel({ maxIterations: 64, cycleSpeed: 0 }),
    baseline,
  );
});

test("colour cycling changes state on step while staying bounded", () => {
  const kernel = new BurningShipKernel();
  kernel.init(32, 24, { cycleSpeed: 0.025 });

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  assert.equal(bounded01(after), true);
});

test("finite and clamp behavior is schema-driven", () => {
  const defaults = defaultsFromSchema(new BurningShipKernel());

  assert.deepEqual(
    runKernel({
      centerX: Number.NaN,
      centerY: Number.POSITIVE_INFINITY,
      zoom: Number.NEGATIVE_INFINITY,
      maxIterations: Number.NaN,
      palettePhase: Number.POSITIVE_INFINITY,
      cycleSpeed: Number.NEGATIVE_INFINITY,
    }),
    runKernel(defaults),
  );

  assert.deepEqual(
    runKernel({
      centerX: -99,
      centerY: 99,
      zoom: 999,
      maxIterations: 999,
      palettePhase: 99,
      cycleSpeed: 99,
    }),
    runKernel({
      centerX: -2.2,
      centerY: 1,
      zoom: 500,
      maxIterations: 512,
      palettePhase: 1,
      cycleSpeed: 5,
    }),
  );
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new BurningShipKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
