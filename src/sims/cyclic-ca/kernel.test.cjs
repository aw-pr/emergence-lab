const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CyclicCaKernel,
  selfTest,
} = require("../../../.test-build/sims/cyclic-ca/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new CyclicCaKernel();
  kernel.init(32, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new CyclicCaKernel();

  assert.equal(kernel.name, "Cyclic Cellular Automaton");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["State"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["states", "threshold", "neighbourhood", "stepsPerFrame"],
  );

  for (const descriptor of kernel.paramSchema) {
    if (descriptor.type === "enum") {
      assert.equal(typeof descriptor.default, "string");
      assert.ok(descriptor.options.includes(descriptor.default));
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
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new CyclicCaKernel();
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
  const params = { states: 14, threshold: 1, neighbourhood: "moore" };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("a fixed seed reproduces identical initial fields across instances", () => {
  const params = { states: 8, threshold: 2, seed: 7 };

  assert.deepEqual(runKernel(params, 0), runKernel(params, 0));
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new CyclicCaKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ states: defaults.states, threshold: defaults.threshold }),
    runKernel(defaults),
  );
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("stepping changes state and remains bounded to [0, 1]", () => {
  const kernel = new CyclicCaKernel();
  kernel.init(32, 32, {});

  const before = Array.from(kernel.readState());
  for (let index = 0; index < 20; index += 1) {
    kernel.step(1);
  }
  const after = kernel.readState();

  assert.notDeepEqual(Array.from(after), before);
  for (const value of after) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({ states: 14, threshold: 1 });
  const changed = runKernel({ states: 6, threshold: 3, seed: 3 });

  assert.notDeepEqual(changed, baseline);
});

test("params are finite-checked and clamped", () => {
  const bounded = runKernel({
    states: -100,
    threshold: 999,
  });
  const explicit = runKernel({
    states: 3,
    threshold: 4,
  });

  assert.deepEqual(bounded, explicit);
});

test("non-finite params fall back to the schema minimum", () => {
  const kernel = new CyclicCaKernel();
  kernel.init(8, 8, { states: Number.NaN, threshold: Number.POSITIVE_INFINITY });

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  for (const value of kernel.readState()) {
    assert.ok(Number.isFinite(value));
  }
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new CyclicCaKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});

test("hand-built 3-state Moore fixture on a 3x3 torus: one step's consumption is exact", () => {
  // On a toroidal 3x3 grid, Moore's eight offsets reach every other cell, so
  // each cell's neighbourhood is simply "all eight other cells" and the
  // count of any target state among them is just that state's grid-wide
  // total (minus one, if the cell itself already holds it).
  const width = 3;
  const height = 3;
  const kernel = new CyclicCaKernel();
  kernel.init(width, height, {
    states: 3,
    threshold: 1,
    neighbourhood: "moore",
  });

  // idx 0,1,2 = state 0; idx 3,4 = state 1; idx 5,6,7,8 = state 2.
  const raw = Float32Array.from([0, 0, 0, 1, 1, 2, 2, 2, 2]);
  kernel.state.set(raw);

  kernel.step(1);

  // state-0 cells (idx 0-2) see two state-1 neighbours (idx 3,4) -> consumed
  //   to 1 (threshold 1 is met).
  // state-1 cells (idx 3,4) see four state-2 neighbours (idx 5-8) -> consumed
  //   to 2.
  // state-2 cells (idx 5-8) see three state-0 neighbours (idx 0-2) -> consumed
  //   to 0.
  const expectedRaw = [1, 1, 1, 2, 2, 0, 0, 0, 0];
  const expectedOutput = expectedRaw.map((value) => value / 2);
  assert.deepEqual(Array.from(kernel.readState()), expectedOutput);
});

test("neighbourhood param changes which cells count: von Neumann excludes diagonals", () => {
  const width = 5;
  const height = 5;

  function buildDiagonalOnlyGrid(neighbourhood) {
    const kernel = new CyclicCaKernel();
    kernel.init(width, height, { states: 3, threshold: 1, neighbourhood });

    const raw = new Float32Array(width * height);
    const centreX = 2;
    const centreY = 2;
    // Diagonal neighbour only (north-west), state 1 == (0 + 1) % 3.
    raw[(centreY - 1) * width + (centreX - 1)] = 1;
    kernel.state.set(raw);

    kernel.step(1);
    return kernel.readState()[centreY * width + centreX];
  }

  assert.equal(buildDiagonalOnlyGrid("moore"), 0.5);
  assert.equal(buildDiagonalOnlyGrid("vonNeumann"), 0);
});

test("param edges: minimum states (3) and maximum threshold (4) do not crash", () => {
  const kernel = new CyclicCaKernel();
  kernel.init(20, 20, { states: 3, threshold: 4, neighbourhood: "moore" });

  assert.doesNotThrow(() => {
    for (let index = 0; index < 10; index += 1) {
      kernel.step(1);
    }
  });

  for (const value of kernel.readState()) {
    assert.ok(value >= 0 && value <= 1);
  }
});
