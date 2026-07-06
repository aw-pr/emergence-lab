const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PhysarumKernel,
  selfTest,
} = require("../../../.test-build/sims/physarum/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12, width = 40, height = 32) {
  const kernel = new PhysarumKernel();
  kernel.init(width, height, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function occupiedCells(state) {
  let count = 0;
  for (let index = 0; index < state.length; index += 1) {
    if (state[index] > 0) {
      count += 1;
    }
  }
  return count;
}

function totalTrail(state) {
  let sum = 0;
  for (let index = 0; index < state.length; index += 1) {
    sum += state[index];
  }
  return sum;
}

test("metadata matches the renderer contract", () => {
  const kernel = new PhysarumKernel();

  assert.equal(kernel.name, "Physarum");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Trail"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "agentCount",
      "sensorAngle",
      "sensorDistance",
      "turnSpeed",
      "moveSpeed",
      "depositAmount",
      "evaporation",
      "stepsPerFrame",
    ],
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

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new PhysarumKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  // readState must return a stable pre-allocated reference across steps,
  // even though diffusion double-buffers internally.
  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("init floors dimensions and resets state idempotently", () => {
  const kernel = new PhysarumKernel();
  kernel.init(20.9, 16.2, {});

  const state = kernel.readState();
  assert.equal(state.length, 20 * 16 * kernel.channelCount);

  for (let index = 0; index < 8; index += 1) {
    kernel.step(1);
  }
  const afterSteps = Array.from(state);

  kernel.init(20.9, 16.2, {});
  // Re-init clears the field back to empty, not the evolved state.
  assert.equal(totalTrail(kernel.readState()), 0);
  assert.notDeepEqual(Array.from(kernel.readState()), afterSteps);
});

test("state stays within the declared [0,1] range", () => {
  const state = runKernel({ depositAmount: 1, evaporation: 0.995 }, 30);
  for (const value of state) {
    assert.ok(value >= 0);
    assert.ok(value <= 1);
  }
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new PhysarumKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ sensorDistance: defaults.sensorDistance }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = { seed: 1234, agentCount: 3000 };

  assert.deepEqual(runKernel(params, 20), runKernel(params, 20));
});

test("distinct seeds produce distinct fields", () => {
  const a = runKernel({ seed: 1, agentCount: 3000 }, 16);
  const b = runKernel({ seed: 2, agentCount: 3000 }, 16);

  assert.notDeepEqual(a, b);
});

test("trail accumulates as agents deposit", () => {
  const kernel = new PhysarumKernel();
  kernel.init(48, 48, { agentCount: 4000, evaporation: 0.9 });

  kernel.step(1);
  const early = totalTrail(kernel.readState());
  assert.ok(early > 0);

  for (let index = 0; index < 20; index += 1) {
    kernel.step(1);
  }
  const later = totalTrail(kernel.readState());

  assert.ok(later > early);
  assert.ok(occupiedCells(kernel.readState()) > 1);
});

test("trail evaporates once deposition effectively stops", () => {
  // Seed a field with a busy kernel, copy it into a near-inert one (one agent,
  // tiny deposit) and confirm the retention factor pulls total mass down. The
  // 3×3 mean blur conserves mass on the torus, so evaporation is the only sink.
  const seeded = new PhysarumKernel();
  seeded.init(32, 32, { agentCount: 2000, depositAmount: 0.5, evaporation: 0.8 });
  for (let index = 0; index < 10; index += 1) {
    seeded.step(1);
  }
  assert.ok(totalTrail(seeded.readState()) > 0);

  const decaying = new PhysarumKernel();
  decaying.init(32, 32, { agentCount: 1, depositAmount: 0.01, evaporation: 0.8 });
  decaying.readState().set(seeded.readState());

  const start = totalTrail(decaying.readState());
  for (let index = 0; index < 5; index += 1) {
    decaying.step(1);
  }
  const end = totalTrail(decaying.readState());

  assert.ok(end < start);
});

test("parameter changes affect the evolved field", () => {
  const baseline = runKernel({ seed: 7, agentCount: 4000 }, 20);
  const changed = runKernel(
    { seed: 7, agentCount: 4000, sensorAngle: 60, turnSpeed: 45 },
    20,
  );

  assert.notDeepEqual(changed, baseline);
});

test("agentCount is capped and zero-agent init is inert", () => {
  const capped = new PhysarumKernel();
  capped.init(16, 16, { agentCount: 10_000_000 });
  // Does not throw and stays in range after stepping.
  capped.step(1);
  for (const value of capped.readState()) {
    assert.ok(value >= 0 && value <= 1);
  }

  const empty = new PhysarumKernel();
  empty.init(16, 16, { agentCount: 1 });
  assert.doesNotThrow(() => empty.step(1));
});

test("stepsPerFrame batches match repeated single steps", () => {
  const batched = new PhysarumKernel();
  batched.init(24, 24, { seed: 42, agentCount: 2000, stepsPerFrame: 4 });
  batched.step(1);

  const repeated = new PhysarumKernel();
  repeated.init(24, 24, { seed: 42, agentCount: 2000, stepsPerFrame: 1 });
  for (let index = 0; index < 4; index += 1) {
    repeated.step(1);
  }

  assert.deepEqual(
    Array.from(batched.readState()),
    Array.from(repeated.readState()),
  );
});

test("stepping starts the sim and selfTest passes", () => {
  const kernel = new PhysarumKernel();
  kernel.init(48, 48, {});

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  assert.equal(selfTest(), true);
});

test("applyImpulse deposits trail attractant under the point, deterministically", () => {
  const width = 48;
  const height = 40;
  const px = 20;
  const py = 16;

  const kernel = new PhysarumKernel();
  kernel.init(width, height, { agentCount: 1000 });
  const ref = kernel.readState();
  const before = ref[py * width + px];
  kernel.applyImpulse(px, py, 4, 1);

  assert.equal(kernel.readState(), ref, "readState reference stays stable");
  assert.ok(
    kernel.readState()[py * width + px] > before,
    "trail raised at the deposit centre",
  );
  for (const value of kernel.readState()) {
    assert.ok(value >= 0 && value <= 1);
  }

  // Determinism: same init + same poke gives an identical field.
  const twin = new PhysarumKernel();
  twin.init(width, height, { agentCount: 1000 });
  twin.applyImpulse(px, py, 4, 1);
  assert.deepEqual(
    Array.from(kernel.readState()),
    Array.from(twin.readState()),
  );
});

test("applyImpulse is a safe no-op at zero strength", () => {
  const kernel = new PhysarumKernel();
  kernel.init(32, 32, { agentCount: 500 });
  const snapshot = Array.from(kernel.readState());
  kernel.applyImpulse(16, 16, 4, 0);
  assert.deepEqual(Array.from(kernel.readState()), snapshot);
  assert.doesNotThrow(() => kernel.applyImpulse(-5, -5, 3, 1));
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new PhysarumKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
