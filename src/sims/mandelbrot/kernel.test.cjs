const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MandelbrotKernel,
  selfTest,
} = require("../../../.test-build/sims/mandelbrot/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 0) {
  const kernel = new MandelbrotKernel();
  kernel.init(40, 28, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function assertBounded(state) {
  for (const value of state) {
    assert.ok(value >= 0 && value <= 1);
  }
}

test("metadata matches the renderer contract", () => {
  const kernel = new MandelbrotKernel();

  assert.equal(kernel.name, "Mandelbrot");
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

  const cycleSpeed = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "cycleSpeed",
  );
  assert.deepEqual(
    {
      default: cycleSpeed.default,
      min: cycleSpeed.min,
      max: cycleSpeed.max,
      step: cycleSpeed.step,
    },
    { default: 0.25, min: 0, max: 5, step: 0.001 },
  );
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new MandelbrotKernel();
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
  const kernel = new MandelbrotKernel();
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
    centerX: -0.75,
    centerY: 0.1,
    zoom: 2.5,
    maxIterations: 96,
    palettePhase: 0.2,
    cycleSpeed: 0.015,
  };

  assert.deepEqual(runKernel(params, 8), runKernel(params, 8));
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new MandelbrotKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ centerX: defaults.centerX, centerY: defaults.centerY }),
    runKernel(defaults),
  );
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("zoom, center and maxIterations affect the cached field", () => {
  const baseline = runKernel({ cycleSpeed: 0 });

  assert.notDeepEqual(runKernel({ zoom: 2.2, cycleSpeed: 0 }), baseline);
  assert.notDeepEqual(
    runKernel({ centerX: -0.75, centerY: 0.2, cycleSpeed: 0 }),
    baseline,
  );
  assert.notDeepEqual(
    runKernel({ maxIterations: 64, cycleSpeed: 0 }),
    baseline,
  );
});

test("colour cycling changes state on step while staying bounded", () => {
  const kernel = new MandelbrotKernel();
  kernel.init(40, 28, { cycleSpeed: 0.025 });

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  assertBounded(after);
});

test("zero cycleSpeed leaves cached field unchanged on step", () => {
  const kernel = new MandelbrotKernel();
  kernel.init(40, 28, { cycleSpeed: 0 });

  const before = Array.from(kernel.readState());
  kernel.step(1);

  assert.deepEqual(Array.from(kernel.readState()), before);
});

test("params are finite-checked and clamped", () => {
  const bounded = runKernel({
    centerX: Number.POSITIVE_INFINITY,
    centerY: -100,
    zoom: Number.NaN,
    maxIterations: 999,
    palettePhase: 2,
    cycleSpeed: -1,
  });
  const explicit = runKernel({
    centerX: -2,
    centerY: -1.5,
    zoom: 0.25,
    maxIterations: 512,
    palettePhase: 1,
    cycleSpeed: 0,
  });

  assert.deepEqual(bounded, explicit);
  assertBounded(bounded);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new MandelbrotKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
