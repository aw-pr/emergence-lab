const assert = require("node:assert/strict");
const test = require("node:test");

const { IsingModelKernel, selfTest } = require("../../../.test-build/sims/ising-model/kernel.js");

function run(params = {}, steps = 12) {
  const kernel = new IsingModelKernel();
  kernel.init(36, 28, params);
  for (let i = 0; i < steps; i += 1) kernel.step(1 / 60);
  return Array.from(kernel.readState());
}

function alignment(state, width) {
  let equal = 0;
  let pairs = 0;
  const height = state.length / width;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = state[y * width + x];
      if (value === state[y * width + ((x + 1) % width)]) equal += 1;
      if (value === state[((y + 1) % height) * width + x]) equal += 1;
      pairs += 2;
    }
  }
  return equal / pairs;
}

test("metadata matches the renderer contract", () => {
  const kernel = new IsingModelKernel();
  assert.equal(kernel.name, "2D Ising Model");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Spin"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);
  assert.deepEqual(kernel.paramSchema.map((p) => p.key), [
    "temperature", "coupling", "externalField", "sweepsPerStep", "initialState",
  ]);
});

test("state reference is stable, bounded and deterministic", () => {
  const kernel = new IsingModelKernel();
  kernel.init(20, 12, { seed: 9 });
  const ref = kernel.readState();
  kernel.step(1 / 60);
  assert.equal(kernel.readState(), ref);
  assert.equal(ref.length, 240);
  assert.ok(ref.every((value) => value === 0 || value === 1));
  assert.deepEqual(run({ seed: 17 }), run({ seed: 17 }));
  assert.notDeepEqual(run({ seed: 17 }), run({ seed: 18 }));
});

test("low temperature orders domains more strongly than high temperature", () => {
  const low = run({ seed: 3, temperature: 0.5, sweepsPerStep: 2 }, 80);
  const high = run({ seed: 3, temperature: 5, sweepsPerStep: 2 }, 80);
  assert.ok(alignment(low, 36) > alignment(high, 36));
});

test("external field biases magnetisation", () => {
  const positive = run({ seed: 4, temperature: 1.5, externalField: 2, sweepsPerStep: 2 }, 45);
  const negative = run({ seed: 4, temperature: 1.5, externalField: -2, sweepsPerStep: 2 }, 45);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(mean(positive) > mean(negative));
});

test("initial-state modes and impulse are exact", () => {
  const kernel = new IsingModelKernel();
  kernel.init(12, 10, { initialState: "down" });
  assert.ok(kernel.readState().every((value) => value === 0));
  kernel.applyImpulse(6, 5, 3, 1);
  assert.ok(kernel.readState().some((value) => value === 1));
  assert.doesNotThrow(() => kernel.applyImpulse(-100, -100, 3, 1));
});

test("selfTest and destroy are safe", () => {
  assert.equal(selfTest(), true);
  const kernel = new IsingModelKernel();
  kernel.init(8, 8, {});
  kernel.destroy();
  assert.equal(kernel.readState().length, 0);
  assert.doesNotThrow(() => kernel.step(1));
});
