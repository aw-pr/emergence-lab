const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LeniaKernel,
  selfTest,
} = require("../../../.test-build/sims/lenia/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12, width = 64, height = 48) {
  const kernel = new LeniaKernel();
  kernel.init(width, height, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function livenessStats(state) {
  let alive = 0;
  let saturated = 0;
  for (let index = 0; index < state.length; index += 1) {
    if (state[index] > 0.01) {
      alive += 1;
    }
    if (state[index] > 0.99) {
      saturated += 1;
    }
  }
  return {
    aliveFrac: alive / state.length,
    saturatedFrac: saturated / state.length,
  };
}

test("metadata matches the renderer contract", () => {
  const kernel = new LeniaKernel();

  assert.equal(kernel.name, "Lenia");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Mass"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["mu", "sigma", "muDrift", "dt", "radius", "stepsPerFrame"],
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

test("schema defaults use the Orbium-friendly regime at performance radius", () => {
  const defaults = defaultsFromSchema(new LeniaKernel());

  assert.equal(defaults.mu, 0.15);
  assert.equal(defaults.sigma, 0.017);
  assert.equal(defaults.muDrift, 0.015);
  assert.equal(defaults.dt, 0.1);
  assert.equal(defaults.radius, 8);
  assert.equal(defaults.stepsPerFrame, 1);
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new LeniaKernel();
  kernel.init(48, 36, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 48 * 36 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("init floors dimensions and re-init resets to identical initial state", () => {
  const kernel = new LeniaKernel();
  kernel.init(42.9, 30.2, {});

  const state = kernel.readState();
  assert.equal(state.length, 42 * 30 * kernel.channelCount);

  const initial = Array.from(state);
  kernel.step(1);
  assert.notDeepEqual(Array.from(kernel.readState()), initial);

  kernel.init(42.9, 30.2, {});
  assert.deepEqual(Array.from(kernel.readState()), initial);
});

test("shell kernel weights are normalised to sum 1", () => {
  // White-box via the state buffer: on a uniform field the convolved
  // potential equals the field value times the weight sum. With mu equal to
  // the field value and a razor-thin sigma, growth is exactly +1 only when
  // the weights sum to 1 — any normalisation error collapses the growth term.
  const kernel = new LeniaKernel();
  const dt = 0.1;
  kernel.init(64, 48, { mu: 0.5, sigma: 0.005, dt });

  const state = kernel.readState();
  state.fill(0.5);
  kernel.step(1);

  for (let index = 0; index < state.length; index += 1) {
    assert.ok(
      Math.abs(state[index] - (0.5 + dt)) < 1e-4,
      `cell ${index} = ${state[index]}, expected ${0.5 + dt}`,
    );
  }
});

test("uniform fields stay uniform (toroidal convolution has no seams)", () => {
  const kernel = new LeniaKernel();
  kernel.init(50, 38, { mu: 0.3, sigma: 0.04 });

  const state = kernel.readState();
  state.fill(0.3);
  kernel.step(1);
  kernel.step(1);

  const reference = state[0];
  for (let index = 0; index < state.length; index += 1) {
    assert.equal(state[index], reference);
  }
});

test("state stays finite and within [0, 1]", () => {
  const state = runKernel({}, 40, 64, 48);

  for (const value of state) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0);
    assert.ok(value <= 1);
  }
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new LeniaKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ mu: defaults.mu, radius: defaults.radius }),
    runKernel(defaults),
  );
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({}, 20);

  assert.notDeepEqual(runKernel({ mu: 0.22 }, 20), baseline);
  assert.notDeepEqual(runKernel({ radius: 6 }, 20), baseline);
});

test("repeated runs are deterministic for the same params, seed and steps", () => {
  const params = { mu: 0.15, sigma: 0.017, dt: 0.1, radius: 8, seed: 42 };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
  assert.notDeepEqual(runKernel({ ...params, seed: 43 }, 24), runKernel(params, 24));
});

test("stepsPerFrame matches repeated single-step work", () => {
  const batched = new LeniaKernel();
  batched.init(48, 36, { stepsPerFrame: 4 });
  batched.step(1);

  const repeated = new LeniaKernel();
  repeated.init(48, 36, { stepsPerFrame: 1 });
  for (let index = 0; index < 4; index += 1) {
    repeated.step(1);
  }

  assert.deepEqual(
    Array.from(batched.readState()),
    Array.from(repeated.readState()),
  );
});

test("default regime stays alive and structured for 500 steps", () => {
  const state = runKernel({}, 500, 96, 96);
  const { aliveFrac, saturatedFrac } = livenessStats(state);

  assert.ok(aliveFrac > 0.02, `died out: aliveFrac=${aliveFrac}`);
  assert.ok(aliveFrac < 0.9, `exploded: aliveFrac=${aliveFrac}`);
  assert.ok(saturatedFrac < 0.6, `saturated: saturatedFrac=${saturatedFrac}`);
});

test("presets stay non-degenerate for 500 steps", () => {
  // Mirrors the app-level presets in src/app/presets.ts.
  const presets = {
    "drifting-soup": { mu: 0.15, sigma: 0.017, muDrift: 0.015, dt: 0.1, radius: 8, stepsPerFrame: 1 },
    "still-spots": { mu: 0.15, sigma: 0.017, muDrift: 0, dt: 0.1, radius: 8, stepsPerFrame: 1 },
    "geminium-storm": { mu: 0.15, sigma: 0.017, muDrift: 0.02, dt: 0.1, radius: 10, stepsPerFrame: 1 },
  };

  for (const [name, params] of Object.entries(presets)) {
    const state = runKernel(params, 500, 96, 96);
    const { aliveFrac } = livenessStats(state);

    assert.ok(aliveFrac > 0.02, `${name} died out: aliveFrac=${aliveFrac}`);
    assert.ok(aliveFrac < 0.9, `${name} exploded: aliveFrac=${aliveFrac}`);
  }
});

test("default mu drift keeps the field reorganising after it would have frozen", () => {
  const width = 128;
  const height = 128;
  const kernel = new LeniaKernel();
  kernel.init(width, height, {});

  // Well past the ~1200-step condensation horizon where static-mu Lenia
  // freezes into stationary spots (late activity <= 0.004/cell/step).
  for (let index = 0; index < 1500; index += 1) {
    kernel.step(1);
  }

  const before = Array.from(kernel.readState());
  for (let index = 0; index < 300; index += 1) {
    kernel.step(1);
  }
  const after = kernel.readState();

  let delta = 0;
  for (let index = 0; index < after.length; index += 1) {
    delta += Math.abs(after[index] - before[index]);
  }
  const meanDelta = delta / after.length;
  assert.ok(
    meanDelta > 0.02,
    `field froze: mean |delta| over 300 late steps = ${meanDelta}`,
  );
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("applyImpulse stamps a Gaussian mass blob under the point, deterministically", () => {
  const width = 64;
  const height = 64;
  const px = 20;
  const py = 24;

  const stamp = () => {
    const kernel = new LeniaKernel();
    // Empty field (mu high, but no seed interference matters — we read pre-step).
    kernel.init(width, height, {});
    kernel.readState().fill(0);
    kernel.applyImpulse(px, py, 6, 1);
    return Array.from(kernel.readState());
  };

  const first = stamp();
  const second = stamp();
  assert.deepEqual(first, second);

  // Centre gains the most mass; a far cell stays empty; all values bounded.
  assert.ok(first[py * width + px] > 0.5, "mass peaks at the blob centre");
  assert.equal(first[0], 0, "far cell untouched");
  for (const value of first) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test("applyImpulse only adds mass and is a safe no-op at zero strength", () => {
  const width = 48;
  const height = 48;
  const kernel = new LeniaKernel();
  kernel.init(width, height, {});
  const ref = kernel.readState();
  const before = Array.from(ref);

  kernel.applyImpulse(24, 24, 5, 0);
  assert.deepEqual(Array.from(kernel.readState()), before);

  kernel.applyImpulse(24, 24, 5, 1);
  assert.equal(kernel.readState(), ref, "readState reference stays stable");
  for (let i = 0; i < ref.length; i += 1) {
    assert.ok(ref[i] >= before[i] - 1e-9, "mass is only ever added");
  }
  assert.doesNotThrow(() => kernel.applyImpulse(-5, -5, 4, 1));
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new LeniaKernel();
  kernel.init(24, 20, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
