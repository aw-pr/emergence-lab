const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ParticleLifeKernel,
  selfTest,
} = require("../../../.test-build/sims/particle-life/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [descriptor.key, descriptor.default]),
  );
}

function runKernel(params = {}, steps = 16) {
  const kernel = new ParticleLifeKernel();
  kernel.init(48, 36, params);
  for (let index = 0; index < steps; index += 1) {
    kernel.step(0.1);
  }
  return Array.from(kernel.readState());
}

function initOnlyState(params = {}) {
  const kernel = new ParticleLifeKernel();
  kernel.init(48, 36, params);
  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new ParticleLifeKernel();

  assert.equal(kernel.name, "Particle Life");
  assert.equal(kernel.channelCount, 3);
  assert.deepEqual(kernel.channelLabels, ["Red", "Green", "Blue"]);
  assert.deepEqual(kernel.channelRanges, [
    [0, 1],
    [0, 1],
    [0, 1],
  ]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "particleCount",
      "species",
      "rmax",
      "rmin",
      "forceScale",
      "friction",
      "matrixBias",
      "pointSize",
    ],
  );

  const particleCount = kernel.paramSchema.find((d) => d.key === "particleCount");
  assert.equal(particleCount.default, 6000);
  assert.equal(particleCount.max, 20000);

  const species = kernel.paramSchema.find((d) => d.key === "species");
  assert.equal(species.default, 5);
  assert.equal(species.min, 2);
  assert.equal(species.max, 8);

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
  const kernel = new ParticleLifeKernel();
  kernel.init(20, 16, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 20 * 16 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(0.1);
  assert.equal(kernel.readState(), first);
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new ParticleLifeKernel());
  assert.deepEqual(runKernel({}), runKernel(defaults));
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    particleCount: 400,
    species: 4,
    rmax: 30,
    rmin: 9,
    forceScale: 50,
    friction: 0.5,
    seed: 4242,
  };
  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("seed drives a fresh ecosystem but stays deterministic per seed", () => {
  const base = { particleCount: 400, species: 4 };

  assert.deepEqual(
    initOnlyState({ ...base, seed: 111 }),
    initOnlyState({ ...base, seed: 111 }),
  );
  assert.notDeepEqual(
    initOnlyState({ ...base, seed: 111 }),
    initOnlyState({ ...base, seed: 222 }),
  );
  assert.deepEqual(initOnlyState({ ...base, seed: 0 }), initOnlyState(base));
});

test("attraction matrix is reproducible per seed and varies with the seed", () => {
  function matrixFor(params) {
    const kernel = new ParticleLifeKernel();
    kernel.init(48, 36, params);
    return Array.from(kernel.attractionMatrix());
  }

  const a = matrixFor({ seed: 7, species: 5 });
  const b = matrixFor({ seed: 7, species: 5 });
  const c = matrixFor({ seed: 8, species: 5 });

  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.length, 5 * 5);
  for (const value of a) {
    assert.ok(value >= -1 && value <= 1);
  }
});

test("state channels stay within the declared [0,1] range", () => {
  const kernel = new ParticleLifeKernel();
  kernel.init(64, 48, { seed: 3 });

  let coloured = 0;
  for (let s = 0; s < 24; s += 1) {
    kernel.step(0.1);
  }
  const state = kernel.readState();
  for (let index = 0; index < state.length; index += 1) {
    assert.ok(Number.isFinite(state[index]));
    assert.ok(state[index] >= 0);
    assert.ok(state[index] <= 1);
  }
  for (let index = 0; index < state.length; index += kernel.channelCount) {
    if (state[index] > 0 || state[index + 1] > 0 || state[index + 2] > 0) {
      coloured += 1;
    }
  }
  assert.ok(coloured > 1);
});

test("particles stay in bounds under variable time-steps", () => {
  // Rasterisation writes into cell (floor(x), floor(y)); an out-of-bounds
  // particle would land outside the state buffer and corrupt or throw. A clean
  // run over jittery dt proves wrapping keeps every particle on the torus.
  const width = 80;
  const height = 60;
  const kernel = new ParticleLifeKernel();
  kernel.init(width, height, { seed: 5, particleCount: 500 });

  assert.doesNotThrow(() => {
    for (let s = 0; s < 200; s += 1) {
      kernel.step(0.04 + (s % 7) * 0.02);
    }
  });

  const state = kernel.readState();
  assert.equal(state.length, width * height * kernel.channelCount);
});

test("energy stays bounded: no NaN or runaway over a long run", () => {
  const kernel = new ParticleLifeKernel();
  kernel.init(96, 72, { seed: 13, forceScale: 160, friction: 0 });

  for (let s = 0; s < 400; s += 1) {
    kernel.step(0.12);
  }

  const state = kernel.readState();
  let occupied = 0;
  for (let index = 0; index < state.length; index += 1) {
    assert.ok(Number.isFinite(state[index]));
    assert.ok(state[index] >= 0 && state[index] <= 1);
  }
  for (let index = 0; index < state.length; index += kernel.channelCount) {
    if (state[index] > 0 || state[index + 1] > 0 || state[index + 2] > 0) {
      occupied += 1;
    }
  }
  assert.ok(occupied > 1);
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({ seed: 99 });
  const changed = runKernel({
    seed: 99,
    species: 3,
    rmax: 24,
    forceScale: 90,
    friction: 0.2,
  });
  assert.notDeepEqual(changed, baseline);
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new ParticleLifeKernel();
  kernel.init(16, 12, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(0.1);
  });
  assert.equal(kernel.readState().length, 0);
});
