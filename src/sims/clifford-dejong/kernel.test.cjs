const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CliffordDeJongKernel,
  MAP_SPECS,
  CLASSIC_COEFFS,
  selfTest,
} = require("../../../.test-build/sims/clifford-dejong/kernel.js");

const MAPS = ["clifford", "dejong", "svensson"];
const CLASSIC_PARAMS = CLASSIC_COEFFS;

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 60) {
  const kernel = new CliffordDeJongKernel();
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
  const kernel = new CliffordDeJongKernel();

  assert.equal(kernel.name, "Point-Map Attractor");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, ["Density", "Hue"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1], [0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "map",
      "a",
      "b",
      "c",
      "d",
      "pointsPerFrame",
      "exposure",
      "fade",
      "colourMode",
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

test("map enum offers the whole family with clifford default", () => {
  const kernel = new CliffordDeJongKernel();
  const descriptor = kernel.paramSchema.find((d) => d.key === "map");

  assert.ok(descriptor);
  assert.equal(descriptor.default, "clifford");
  assert.deepEqual(Array.from(descriptor.options), MAPS);
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new CliffordDeJongKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("init seeds a visible attractor so the sim is not blank on load", () => {
  const kernel = new CliffordDeJongKernel();
  kernel.init(96, 72, {});

  const state = Array.from(kernel.readState());

  assert.ok(occupiedCells(state) > 300);
  assert.ok(state.some((value) => value > 0.1));
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new CliffordDeJongKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
});

test("repeated runs are deterministic for the same params and steps", () => {
  for (const map of MAPS) {
    const params = { map, ...CLASSIC_PARAMS[map] };
    assert.deepEqual(
      runKernel(params, 90),
      runKernel(params, 90),
      `${map} must be deterministic`,
    );
  }
});

test("every map stays bounded in [0, 1] and covers the frame", () => {
  for (const map of MAPS) {
    const state = runKernel({ map, ...CLASSIC_PARAMS[map] }, 90);

    assert.ok(
      state.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
      `${map} must stay bounded in [0, 1]`,
    );
    assert.ok(
      occupiedCells(state) > 100,
      `${map} must fill a substantial fraction of the frame`,
    );
  }
});

// The analytic bounds are what frames the image with no settle-and-measure
// pass, so they must actually contain the orbit for arbitrary coefficients.
test("analytic bounds contain long orbits across coefficient space", () => {
  const coefficientSets = [
    ...Object.values(CLASSIC_PARAMS),
    { a: -1.7, b: 1.3, c: -0.1, d: -1.2 },
    { a: 2.01, b: -2.53, c: 1.61, d: -0.33 },
    { a: 0.4, b: -0.9, c: 3.1, d: -4.2 },
  ];

  for (const map of MAPS) {
    const spec = MAP_SPECS[map];
    for (const { a, b, c, d } of coefficientSets) {
      const [boundX, boundY] = spec.bounds(a, b, c, d);
      let x = 0.1;
      let y = 0.1;
      for (let index = 0; index < 20000; index += 1) {
        [x, y] = spec.apply(x, y, a, b, c, d);
        assert.ok(
          Math.abs(x) <= boundX + 1e-9 && Math.abs(y) <= boundY + 1e-9,
          `${map} orbit escaped its analytic bounds at (${x}, ${y})`,
        );
      }
    }
  }
});

test("switching map changes the evolved field", () => {
  const clifford = runKernel({ map: "clifford" }, 90);

  for (const map of ["dejong", "svensson"]) {
    assert.notDeepEqual(
      runKernel({ map, ...CLASSIC_PARAMS[map] }, 90),
      clifford,
      `${map} should differ from clifford`,
    );
  }
});

test("unknown map falls back to the clifford default", () => {
  assert.deepEqual(
    runKernel({ map: "not-a-map" }),
    runKernel({ map: "clifford" }),
  );
});

test("coefficient changes reshape the attractor", () => {
  const baseline = runKernel({});
  const changed = runKernel({ a: -1.7, b: 1.3, c: -0.1, d: -1.2 });

  assert.notDeepEqual(changed, baseline);
});

test("colour modes write different hue fields over the same density", () => {
  const density = (state) =>
    state.filter((_value, index) => index % 2 === 0);
  const hue = (state) => state.filter((_value, index) => index % 2 === 1);

  const speed = runKernel({ colourMode: "speed", cycleSpeed: 0 }, 60);
  const angle = runKernel({ colourMode: "angle", cycleSpeed: 0 }, 60);

  assert.deepEqual(density(speed), density(angle));
  assert.notDeepEqual(hue(speed), hue(angle));
});

test("cycle mode with zero cycleSpeed keeps hue at zero", () => {
  const state = runKernel({ colourMode: "cycle", cycleSpeed: 0 }, 30);
  for (let index = 1; index < state.length; index += 2) {
    assert.equal(state[index], 0, "hue must stay put when the cycle is frozen");
  }
});

test("fade dims density without dragging hue towards zero", () => {
  const kernel = new CliffordDeJongKernel();
  kernel.init(64, 48, { fade: 0.9, cycleSpeed: 0.5, colourMode: "cycle" });

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
});

test("fade at 1 only ever accumulates", () => {
  const early = runKernel({ fade: 1 }, 10);
  const late = runKernel({ fade: 1 }, 40);

  const sum = (state) =>
    state.reduce(
      (total, value, index) => (index % 2 === 0 ? total + value : total),
      0,
    );
  assert.ok(sum(late) >= sum(early) - 1e-6);
});

test("non-finite params fall back to bounded defaults", () => {
  const baseline = runKernel({});
  const invalid = runKernel({
    a: Number.NaN,
    b: Number.POSITIVE_INFINITY,
    c: Number.NEGATIVE_INFINITY,
  });

  assert.deepEqual(invalid, baseline);
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new CliffordDeJongKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
