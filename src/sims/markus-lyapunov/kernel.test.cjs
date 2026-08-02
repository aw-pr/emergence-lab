const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LYAPUNOV_MAGNITUDE_CEILING,
  MarkusLyapunovKernel,
  SEQUENCE_OPTIONS,
  selfTest,
} = require("../../../.test-build/sims/markus-lyapunov/kernel.js");
const model = require("../../../.test-build/sims/markus-lyapunov/model.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [descriptor.key, descriptor.default]),
  );
}

function runKernel(params = {}, width = 20, height = 14) {
  const kernel = new MarkusLyapunovKernel();
  kernel.init(width, height, params);
  kernel.step(1 / 60);
  return kernel;
}

test("metadata matches the renderer contract", () => {
  const kernel = new MarkusLyapunovKernel();
  assert.equal(kernel.name, "Markus–Lyapunov Fractal");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, [
    "Stability magnitude",
    "Chaos magnitude",
  ]);
  assert.deepEqual(kernel.channelRanges, [
    [0, LYAPUNOV_MAGNITUDE_CEILING],
    [0, LYAPUNOV_MAGNITUDE_CEILING],
  ]);
  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "centerX",
      "centerY",
      "zoom",
      "warmupIterations",
      "sampleIterations",
      "sequence",
    ],
  );

  const sequence = kernel.paramSchema.find((d) => d.key === "sequence");
  assert.equal(sequence.type, "enum");
  assert.deepEqual(sequence.options, SEQUENCE_OPTIONS);
  assert.ok(sequence.options.includes(sequence.default));
});

test("a = b = 0.5 converges to the closed-form exponent ln(0.5)", () => {
  const exponent = model.sampleLyapunovPoint(0.5, 0.5, "AB", 500, 1000);
  assert.ok(Math.abs(exponent - Math.log(0.5)) < 0.01);
});

test("a = b = 4 approaches the exact chaotic exponent ln(2)", () => {
  const exponent = model.sampleLyapunovPoint(4, 4, "AABB", 1000, 10000);
  assert.ok(Math.abs(exponent - Math.log(2)) < 0.05);
});

test("different schedules change the exponent when a and b differ", () => {
  const alternating = model.sampleLyapunovPoint(3.4, 3.8, "AB", 500, 3000);
  const blocked = model.sampleLyapunovPoint(3.4, 3.8, "AABB", 500, 3000);
  assert.ok(Math.abs(alternating - blocked) > 0.01);
});

test("grid output and channel ranges honour the contract", () => {
  const width = 24;
  const height = 18;
  const kernel = runKernel({}, width, height);
  const state = kernel.readState();
  assert.ok(state instanceof Float32Array);
  assert.equal(state.length, width * height * kernel.channelCount);
  assert.equal(kernel.readState(), state);

  let stableCells = 0;
  let chaoticCells = 0;
  for (let offset = 0; offset < state.length; offset += 2) {
    const stable = state[offset];
    const chaotic = state[offset + 1];
    assert.ok(Number.isFinite(stable));
    assert.ok(Number.isFinite(chaotic));
    assert.ok(stable >= 0 && stable <= LYAPUNOV_MAGNITUDE_CEILING);
    assert.ok(chaotic >= 0 && chaotic <= LYAPUNOV_MAGNITUDE_CEILING);
    assert.ok(stable === 0 || chaotic === 0);
    if (stable > 0) stableCells += 1;
    if (chaotic > 0) chaoticCells += 1;
  }
  assert.ok(stableCells > 0);
  assert.ok(chaoticCells > 0);
});

test("single-cell kernel channels preserve the exponent sign", () => {
  const stable = runKernel(
    { centerX: 0.5, centerY: 0.5, warmupIterations: 500, sampleIterations: 1000 },
    1,
    1,
  ).readState();
  assert.ok(Math.abs(stable[0] - -Math.log(0.5)) < 0.01);
  assert.equal(stable[1], 0);

  const chaotic = runKernel(
    { centerX: 4, centerY: 4, warmupIterations: 1000, sampleIterations: 2048 },
    1,
    1,
  ).readState();
  assert.equal(chaotic[0], 0);
  assert.ok(Math.abs(chaotic[1] - Math.log(2)) < 0.05);
});

test("missing params use schema defaults and repeated runs are deterministic", () => {
  const defaults = defaultsFromSchema(new MarkusLyapunovKernel());
  assert.deepEqual(
    Array.from(runKernel({}).readState()),
    Array.from(runKernel(defaults).readState()),
  );
  assert.deepEqual(
    Array.from(runKernel({ sequence: "AABAB" }).readState()),
    Array.from(runKernel({ sequence: "AABAB" }).readState()),
  );
});

test("destroy releases state and selfTest passes", () => {
  const kernel = runKernel({}, 8, 6);
  kernel.destroy();
  assert.equal(kernel.readState().length, 0);
  assert.doesNotThrow(() => kernel.step(1 / 60));
  assert.equal(selfTest(), true);
});
