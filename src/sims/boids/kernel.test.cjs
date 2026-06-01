const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BoidsKernel,
  selfTest,
} = require("../../../.test-build/sims/boids/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new BoidsKernel();
  kernel.init(32, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function initOnlyState(params = {}) {
  const kernel = new BoidsKernel();
  kernel.init(32, 24, params);
  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new BoidsKernel();

  assert.equal(kernel.name, "Boids");
  assert.equal(kernel.channelCount, 4);
  assert.deepEqual(kernel.channelLabels, [
    "Density",
    "Speed",
    "Velocity X",
    "Velocity Y",
  ]);
  assert.deepEqual(kernel.channelRanges, [
    [0, 1],
    [0, 1],
    [-1, 1],
    [-1, 1],
  ]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "boidCount",
      "visualRadius",
      "separationRadius",
      "maxSpeed",
      "alignment",
      "cohesion",
      "separation",
      "pointSize",
    ],
  );

  const pointSize = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "pointSize",
  );
  assert.equal(pointSize.label, "Point size (px)");
  assert.equal(pointSize.default, 6);
  assert.equal(pointSize.min, 4);

  const boidCount = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "boidCount",
  );
  assert.equal(boidCount.default, 5000);
  assert.equal(boidCount.max, 12000);

  const maxSpeed = kernel.paramSchema.find(
    (descriptor) => descriptor.key === "maxSpeed",
  );
  assert.equal(maxSpeed.default, 36);
  assert.equal(maxSpeed.max, 40);

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
  const kernel = new BoidsKernel();
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
  const defaults = defaultsFromSchema(new BoidsKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ boidCount: defaults.boidCount, maxSpeed: defaults.maxSpeed }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    boidCount: 64,
    visualRadius: 10,
    separationRadius: 4,
    maxSpeed: 1.6,
    alignment: 0.08,
    cohesion: 0.01,
    separation: 0.22,
  };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("seeded random initial flock is deterministic", () => {
  const params = {
    boidCount: 96,
    maxSpeed: 2.4,
  };
  assert.deepEqual(initOnlyState(params), initOnlyState(params));
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("stepping populates bounded density, speed, and velocity channels", () => {
  const kernel = new BoidsKernel();
  kernel.init(32, 32, {});
  kernel.step(1);

  const state = kernel.readState();
  let densityCells = 0;
  let speedCells = 0;

  for (let index = 0; index < state.length; index += kernel.channelCount) {
    const density = state[index];
    const speed = state[index + 1];
    const velocityX = state[index + 2];
    const velocityY = state[index + 3];

    assert.ok(density >= 0);
    assert.ok(density <= 1);
    assert.ok(speed >= 0);
    assert.ok(speed <= 1);
    assert.ok(velocityX >= -1);
    assert.ok(velocityX <= 1);
    assert.ok(velocityY >= -1);
    assert.ok(velocityY <= 1);

    if (density > 0) {
      densityCells += 1;
      assert.ok(Math.hypot(velocityX, velocityY) > 0);
    }
    if (speed > 0) {
      speedCells += 1;
    }
  }

  assert.ok(densityCells > 1);
  assert.ok(speedCells > 1);
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({
    boidCount: 80,
    visualRadius: 18,
    separationRadius: 8,
    alignment: 0.15,
    cohesion: 0.02,
    separation: 0.45,
  });

  assert.notDeepEqual(changed, baseline);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new BoidsKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
