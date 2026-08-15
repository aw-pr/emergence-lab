const assert = require("node:assert/strict");
const test = require("node:test");

const { KuramotoOscillatorsKernel, selfTest } = require("../../../.test-build/sims/kuramoto-oscillators/kernel.js");

function run(params = {}, steps = 80) {
  const kernel = new KuramotoOscillatorsKernel();
  kernel.init(32, 24, params);
  for (let i = 0; i < steps; i += 1) kernel.step(1 / 60);
  return Array.from(kernel.readState());
}

function orderParameter(state) {
  let x = 0;
  let y = 0;
  for (const phase of state) {
    const angle = phase * Math.PI * 2;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  return Math.hypot(x, y) / state.length;
}

test("metadata matches the renderer contract", () => {
  const kernel = new KuramotoOscillatorsKernel();
  assert.equal(kernel.name, "Kuramoto Oscillators");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Phase"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);
  assert.deepEqual(kernel.paramSchema.map((p) => p.key), [
    "coupling", "frequencySpread", "noise", "timestep", "couplingMode", "initialPattern",
  ]);
});

test("state is stable, bounded and deterministic", () => {
  const kernel = new KuramotoOscillatorsKernel();
  kernel.init(18, 12, { seed: 8 });
  const ref = kernel.readState();
  kernel.step(1 / 60);
  assert.equal(kernel.readState(), ref);
  assert.ok(ref.every((value) => value >= 0 && value < 1));
  assert.deepEqual(run({ seed: 11 }), run({ seed: 11 }));
  assert.notDeepEqual(run({ seed: 11 }), run({ seed: 12 }));
});

test("strong global coupling raises collective order", () => {
  const uncoupled = run({ seed: 7, couplingMode: "global", initialPattern: "random", coupling: 0, frequencySpread: 0.2, noise: 0, timestep: 0.08 }, 180);
  const coupled = run({ seed: 7, couplingMode: "global", initialPattern: "random", coupling: 6, frequencySpread: 0.2, noise: 0, timestep: 0.08 }, 180);
  assert.ok(orderParameter(coupled) > orderParameter(uncoupled) + 0.25);
});

test("local and global coupling produce distinct fields", () => {
  const local = run({ seed: 9, couplingMode: "local", coupling: 2.5, noise: 0 });
  const global = run({ seed: 9, couplingMode: "global", coupling: 2.5, noise: 0 });
  assert.notDeepEqual(local, global);
});

test("initial patterns are deterministic and visually distinct", () => {
  const vortices = run({ seed: 4, initialPattern: "vortices" }, 0);
  const waves = run({ seed: 4, initialPattern: "waves" }, 0);
  const random = run({ seed: 4, initialPattern: "random" }, 0);
  assert.notDeepEqual(vortices, waves);
  assert.notDeepEqual(waves, random);
  assert.deepEqual(vortices, run({ seed: 4, initialPattern: "vortices" }, 0));
});

test("pointer impulse aligns a local phase patch", () => {
  const kernel = new KuramotoOscillatorsKernel();
  kernel.init(20, 20, { seed: 3 });
  const before = Array.from(kernel.readState());
  kernel.applyImpulse(10, 10, 4, 1);
  const after = kernel.readState();
  assert.notDeepEqual(Array.from(after), before);
  assert.equal(after[10 * 20 + 10], 0);
  assert.doesNotThrow(() => kernel.applyImpulse(-10, -10, 2, 1));
});

test("selfTest and destroy are safe", () => {
  assert.equal(selfTest(), true);
  const kernel = new KuramotoOscillatorsKernel();
  kernel.init(8, 8, {});
  kernel.destroy();
  assert.equal(kernel.readState().length, 0);
  assert.doesNotThrow(() => kernel.step(1));
});
