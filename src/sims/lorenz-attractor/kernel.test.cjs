const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LorenzAttractorKernel,
  SPECS,
  selfTest,
} = require("../../../.test-build/sims/lorenz-attractor/kernel.js");

const ATTRACTORS = ["lorenz", "rossler", "thomas", "aizawa", "halvorsen"];

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 120) {
  const kernel = new LorenzAttractorKernel();
  kernel.init(40, 30, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function occupiedCells(state) {
  return state.filter((value) => value > 0).length;
}

test("fade dims density without dragging hue towards zero", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(64, 48, { attractor: "lorenz", cycleSpeed: 0.5, fade: 0.9 });

  // The phase starts at zero, so the seeded trail is laid down at hue zero:
  // step first to let the cycle advance and deposit a non-zero hue.
  for (let step = 0; step < 10; step += 1) kernel.step(1);

  const state = kernel.readState();
  let index = -1;
  for (let i = 0; i < state.length; i += 2) {
    if (state[i] > 0.05 && state[i + 1] > 0.05) {
      index = i;
      break;
    }
  }
  assert.ok(index >= 0, "expected a cell carrying both density and hue");

  const densityBefore = state[index];
  const hueBefore = state[index + 1];

  // Step without letting the orbit re-deposit into this cell: fade alone.
  for (let step = 0; step < 5; step += 1) kernel.step(1);

  const after = kernel.readState();
  if (after[index] < densityBefore) {
    assert.ok(
      after[index + 1] === hueBefore || after[index + 1] > 0.05,
      `hue decayed with density: ${hueBefore} -> ${after[index + 1]}`,
    );
  }
});

test("colour cycling is off when cycleSpeed is zero", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(64, 48, { attractor: "lorenz", cycleSpeed: 0 });
  for (let step = 0; step < 20; step += 1) kernel.step(1);

  const state = kernel.readState();
  for (let i = 1; i < state.length; i += 2) {
    assert.equal(state[i], 0, "hue must stay put when the cycle is disabled");
  }
});

test("metadata matches the renderer contract", () => {
  const kernel = new LorenzAttractorKernel();

  assert.equal(kernel.name, "Strange Attractor");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, ["Density", "Hue"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1], [0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "attractor",
      "sigma",
      "rho",
      "beta",
      "stepsPerFrame",
      "fade",
      "ribbonWidth",
      "colourByHeight",
      "cycleSpeed",
    ],
  );

  for (const descriptor of kernel.paramSchema) {
    if (descriptor.type === "enum") {
      assert.ok(Array.isArray(descriptor.options));
      assert.ok(descriptor.options.includes(descriptor.default));
      continue;
    }
    if (descriptor.type === "boolean") {
      assert.equal(typeof descriptor.default, "boolean");
      continue;
    }
    assert.equal(descriptor.type, "number");
    assert.equal(typeof descriptor.default, "number");
    assert.equal(typeof descriptor.min, "number");
    assert.equal(typeof descriptor.max, "number");
    assert.equal(typeof descriptor.step, "number");
    assert.ok(descriptor.min <= descriptor.default);
    assert.ok(descriptor.default <= descriptor.max);
  }
});

test("attractor enum offers the whole family with lorenz default", () => {
  const kernel = new LorenzAttractorKernel();
  const descriptor = kernel.paramSchema.find((d) => d.key === "attractor");

  assert.ok(descriptor);
  assert.equal(descriptor.default, "lorenz");
  assert.deepEqual(Array.from(descriptor.options), ATTRACTORS);
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("init seeds a visible trajectory so the sim is not blank on load", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(96, 72, {});

  const state = Array.from(kernel.readState());
  const brightCells = state.filter((value) => value > 0.25).length;

  assert.ok(occupiedCells(state) > 300);
  assert.ok(brightCells > 100);
  assert.ok(state.some((value) => value > 0));
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new LorenzAttractorKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ sigma: defaults.sigma, rho: defaults.rho }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    sigma: 10,
    rho: 28,
    beta: 2.6666667,
    stepsPerFrame: 8,
    fade: 0.985,
  };

  assert.deepEqual(runKernel(params, 180), runKernel(params, 180));
});

test("every attractor stays bounded and is deterministic", () => {
  for (const attractor of ATTRACTORS) {
    const params = { attractor, stepsPerFrame: 12, fade: 0.99 };

    const first = runKernel(params, 200);
    const second = runKernel(params, 200);

    assert.deepEqual(first, second, `${attractor} must be deterministic`);
    assert.ok(
      first.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
      `${attractor} must stay bounded in [0, 1]`,
    );
    assert.ok(
      occupiedCells(first) > 1,
      `${attractor} must trace a visible orbit`,
    );
  }
});

// Every attractor in this file is sold as strange, i.e. chaotic, and two of
// them were not: Halvorsen at the usually quoted a=1.89 and Thomas at
// b=0.208186 (the bound in "chaotic for b < 0.208186") both settled onto limit
// cycles that retrace one closed path forever. The constants look canonical, so
// nothing short of measuring the dynamics catches it. The rendered field cannot
// answer this — a chaotic orbit's footprint saturates once it has covered its
// projection, exactly as a cycle's does — so integrate the equations directly.
//
// Benettin: advance two trajectories a hair apart, accumulate the log of how
// fast the gap grows, renormalising to keep it infinitesimal. The mean is the
// largest Lyapunov exponent; positive means chaos, ~0 a periodic orbit.
function largestLyapunov(spec, params) {
  const rk4 = (p) => {
    const d = (x, y, z) =>
      spec.derivative(x, y, z, params.sigma, params.rho, params.beta);
    const { dt } = spec;
    const [x, y, z] = p;
    const k1 = d(x, y, z);
    const k2 = d(x + (k1.dx * dt) / 2, y + (k1.dy * dt) / 2, z + (k1.dz * dt) / 2);
    const k3 = d(x + (k2.dx * dt) / 2, y + (k2.dy * dt) / 2, z + (k2.dz * dt) / 2);
    const k4 = d(x + k3.dx * dt, y + k3.dy * dt, z + k3.dz * dt);
    return [
      x + (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx),
      y + (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy),
      z + (dt / 6) * (k1.dz + 2 * k2.dz + 2 * k3.dz + k4.dz),
    ];
  };
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // Settle onto the attractor first: the transient towards it is not the thing
  // being measured.
  let p = [...spec.start];
  for (let i = 0; i < Math.round(400 / spec.dt); i += 1) p = rk4(p);

  const seed = 1e-9;
  let q = [p[0] + seed, p[1], p[2]];
  let total = 0;
  const steps = Math.round(1200 / spec.dt);
  for (let i = 0; i < steps; i += 1) {
    p = rk4(p);
    q = rk4(q);
    const spread = gap(p, q);
    if (!(spread > 0)) break;
    total += Math.log(spread / seed);
    q = [
      p[0] + ((q[0] - p[0]) * seed) / spread,
      p[1] + ((q[1] - p[1]) * seed) / spread,
      p[2] + ((q[2] - p[2]) * seed) / spread,
    ];
  }
  return total / (steps * spec.dt);
}

test("every attractor is actually chaotic, not a limit cycle", () => {
  const defaults = defaultsFromSchema(new LorenzAttractorKernel());

  // Thomas is the slowest diverger of the five at ~0.037, so the floor sits
  // well under it and still an order of magnitude above the ~0.001 a cycle
  // returns. Lorenz doubles as the check that this integration is faithful:
  // it should land near the textbook 0.906.
  for (const attractor of ATTRACTORS) {
    const lambda = largestLyapunov(SPECS[attractor], defaults);
    assert.ok(
      lambda > 0.02,
      `${attractor} is not chaotic: largest Lyapunov exponent ${lambda.toFixed(4)}`,
    );
  }

  const lorenz = largestLyapunov(SPECS.lorenz, defaults);
  assert.ok(
    Math.abs(lorenz - 0.906) < 0.15,
    `Lorenz should sit near the textbook 0.906, got ${lorenz.toFixed(4)}`,
  );
});

test("switching attractor changes the evolved field", () => {
  const lorenz = runKernel({ attractor: "lorenz" }, 200);

  for (const attractor of ["rossler", "thomas", "aizawa", "halvorsen"]) {
    assert.notDeepEqual(
      runKernel({ attractor }, 200),
      lorenz,
      `${attractor} should differ from lorenz`,
    );
  }
});

test("unknown attractor falls back to the lorenz default", () => {
  assert.deepEqual(
    runKernel({ attractor: "not-an-attractor" }),
    runKernel({ attractor: "lorenz" }),
  );
});

test("colourByHeight defaults on and modulates the deposited field", () => {
  const descriptor = new LorenzAttractorKernel().paramSchema.find(
    (d) => d.key === "colourByHeight",
  );
  assert.ok(descriptor);
  assert.equal(descriptor.type, "boolean");
  assert.equal(descriptor.default, true);

  for (const attractor of ATTRACTORS) {
    const on = runKernel({ attractor, colourByHeight: true }, 200);
    const off = runKernel({ attractor, colourByHeight: false }, 200);

    assert.notDeepEqual(
      on,
      off,
      `${attractor} height colouring should change deposits`,
    );

    // Height colouring only scales each deposit down (floor 0.35, span 0.65),
    // so total density can never exceed the flat-deposit path.
    const sum = (state) => state.reduce((total, value) => total + value, 0);
    assert.ok(
      sum(off) >= sum(on) - 1e-6,
      `${attractor} flat deposits should total >= height-coloured deposits`,
    );
    assert.ok(
      on.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
      `${attractor} height-coloured field must stay bounded`,
    );
  }
});

test("ribbon width changes the subpixel trail footprint", () => {
  const fine = runKernel({ ribbonWidth: 0.75, fade: 1 }, 20);
  const silk = runKernel({ ribbonWidth: 3, fade: 1 }, 20);
  assert.ok(occupiedCells(silk) > occupiedCells(fine));
  assert.notDeepEqual(silk, fine);
});

test("colourByHeight off is deterministic and matches the schema-default toggle", () => {
  const off = runKernel({ attractor: "lorenz", colourByHeight: false }, 200);

  assert.deepEqual(
    off,
    runKernel({ attractor: "lorenz", colourByHeight: false }, 200),
  );
  // A non-boolean toggle falls back to the default (on), so it must differ.
  assert.notDeepEqual(
    off,
    runKernel({ attractor: "lorenz", colourByHeight: "nope" }, 200),
  );
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("stepping deposits bounded density in multiple cells", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(48, 36, {});

  for (let index = 0; index < 220; index += 1) {
    kernel.step(1);
  }

  const state = Array.from(kernel.readState());

  assert.ok(occupiedCells(state) > 1);
  assert.ok(state.some((value) => value > 0));
  assert.ok(state.every((value) => value >= 0 && value <= 1));
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({ rho: 35, beta: 3.1, stepsPerFrame: 10 });

  assert.notDeepEqual(changed, baseline);
});

test("non-finite params fall back to bounded defaults", () => {
  const baseline = runKernel({});
  const invalid = runKernel({
    sigma: Number.NaN,
    rho: Number.POSITIVE_INFINITY,
    beta: Number.NEGATIVE_INFINITY,
  });

  assert.deepEqual(invalid, baseline);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new LorenzAttractorKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
