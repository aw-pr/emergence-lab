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

/** Threshold a field of emitted floats back to the boolean alive/dead grid. */
function thresholded(field) {
  return field.map((value) => (value >= 0.5 ? 1 : 0));
}

test("metadata matches the renderer contract", () => {
  const kernel = new GameOfLifeKernel();

  assert.equal(kernel.name, "Conway's Game of Life");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Alive"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "birthMin",
      "birthMax",
      "surviveMin",
      "surviveMax",
      "seedDensity",
      "sparkRate",
      "ageShading",
    ],
  );

  for (const descriptor of kernel.paramSchema) {
    if (descriptor.type === "boolean") {
      assert.equal(typeof descriptor.default, "boolean");
      continue;
    }

    assert.equal(descriptor.type, "number");
    assert.equal(typeof descriptor.default, "number");
    assert.equal(typeof descriptor.min, "number");
    assert.equal(typeof descriptor.max, "number");
    assert.equal(typeof descriptor.step, "number");
    assert.ok(Number.isFinite(descriptor.default));
    assert.ok(descriptor.min <= descriptor.default);
    assert.ok(descriptor.default <= descriptor.max);
  }

  const ageShading = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "ageShading",
  );
  assert.equal(ageShading.default, true);
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

test("with ageShading off, stepping changes state and remains bit-exact 0/1", () => {
  const kernel = new GameOfLifeKernel();
  kernel.init(32, 32, { ageShading: false });

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  for (const value of after) {
    assert.ok(value === 0 || value === 1);
  }
});

test("with ageShading on, emitted values stay within [0, 1] and are not bit-exact 0/1", () => {
  const kernel = new GameOfLifeKernel();
  kernel.init(32, 32, { ageShading: true });

  kernel.step(1);
  const after = kernel.readState();

  let sawShadedValue = false;
  for (const value of after) {
    assert.ok(value >= 0 && value <= 1);
    if (value !== 0 && value !== 1) {
      sawShadedValue = true;
    }
  }
  assert.ok(sawShadedValue, "expected at least one shaded (non 0/1) value");
});

test("ageShading is presentation-only: thresholded evolution is identical with it on or off", () => {
  const params = {
    birthMin: 3,
    birthMax: 3,
    surviveMin: 2,
    surviveMax: 3,
    seedDensity: 0.3,
    sparkRate: 0.04,
  };

  const withShading = runKernel({ ...params, ageShading: true }, 40);
  const withoutShading = runKernel({ ...params, ageShading: false }, 40);

  assert.deepEqual(thresholded(withShading), thresholded(withoutShading));
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

test("age increments for continuously-alive cells and saturates brightness at maturity", () => {
  // With every cell alive on a wrapped torus, every cell always has exactly
  // 8 neighbours. surviveMin=0/surviveMax=8 keeps every cell alive forever
  // (birth never triggers because no cell is ever dead). This isolates the
  // age ramp from any B/S rule interaction.
  const kernel = new GameOfLifeKernel();
  kernel.init(8, 8, {
    birthMin: 8,
    birthMax: 8,
    surviveMin: 0,
    surviveMax: 8,
    seedDensity: 1,
    sparkRate: 0,
    ageShading: true,
  });

  const sample = () => kernel.readState()[0];

  const initial = sample();
  assert.ok(
    Math.abs(initial - 0.55) < 1e-6,
    "newborn/seed cells emit the base brightness",
  );

  kernel.step(1);
  const afterOneStep = sample();
  assert.ok(afterOneStep > initial, "age should increase brightness");

  let previous = afterOneStep;
  for (let index = 0; index < 79; index += 1) {
    kernel.step(1);
    const current = sample();
    assert.ok(current >= previous, "brightness must not decrease while alive");
    previous = current;
  }

  // Age is now 80 (1 initial step + 79 more), so brightness should saturate.
  assert.ok(
    Math.abs(sample() - 1) < 1e-6,
    "mature cells should saturate to full brightness",
  );

  kernel.step(1);
  assert.ok(
    Math.abs(sample() - 1) < 1e-6,
    "brightness stays saturated beyond maturity",
  );
});

test("dead cells leave a decaying ghost trail that reaches exactly zero", () => {
  // Every cell starts alive with exactly 8 neighbours (wrapped torus).
  // surviveMax=7 excludes 8, so every cell dies on the first step. Once the
  // whole grid is dead, neighbour counts drop to 0, and birthMin=1 excludes
  // 0, so the grid stays dead forever after. This isolates the ghost-decay
  // ramp from any B/S rule interaction.
  const kernel = new GameOfLifeKernel();
  kernel.init(8, 8, {
    birthMin: 1,
    birthMax: 8,
    surviveMin: 0,
    surviveMax: 7,
    seedDensity: 1,
    sparkRate: 0,
    ageShading: true,
  });

  const sample = () => kernel.readState()[0];

  assert.ok(
    Math.abs(sample() - 0.55) < 1e-6,
    "cell starts alive at seed brightness",
  );

  kernel.step(1);
  assert.ok(
    Math.abs(sample() - 0.35) < 1e-6,
    "cell emits the ghost base value the instant it dies",
  );

  let previous = sample();
  let sawZero = false;
  for (let index = 0; index < 30; index += 1) {
    kernel.step(1);
    const current = sample();
    assert.ok(current <= previous + 1e-9, "ghost trail must decay monotonically");
    if (current === 0) {
      sawZero = true;
    }
    previous = current;
  }

  assert.ok(sawZero, "ghost trail should eventually decay to exactly zero");
  assert.equal(sample(), 0, "ghost stays at zero once fully decayed");
});
