const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LorenzAttractorKernel,
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

test("metadata matches the renderer contract", () => {
  const kernel = new LorenzAttractorKernel();

  assert.equal(kernel.name, "Strange Attractor");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Density"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["attractor", "sigma", "rho", "beta", "stepsPerFrame", "fade", "ribbonWidth", "colourByHeight"],
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
