const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GrayScottKernel,
  selfTest,
} = require("../../../.test-build/sims/gray-scott/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 12) {
  const kernel = new GrayScottKernel();
  kernel.init(32, 24, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

function readCell(state, width, x, y) {
  const index = (y * width + x) * 2;
  return { u: state[index], v: state[index + 1] };
}

test("metadata matches the renderer contract", () => {
  const kernel = new GrayScottKernel();

  assert.equal(kernel.name, "Gray-Scott");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, ["U", "V"]);
  assert.deepEqual(kernel.channelRanges, [
    [0, 1],
    [0, 1],
  ]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["Du", "Dv", "F", "k", "stepsPerFrame"],
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

test("schema defaults use waves regime at gentler pace", () => {
  const defaults = defaultsFromSchema(new GrayScottKernel());

  assert.equal(defaults.Du, 0.2097);
  assert.equal(defaults.Dv, 0.105);
  assert.equal(defaults.F, 0.018);
  assert.equal(defaults.k, 0.0487);
  assert.equal(defaults.stepsPerFrame, 12);
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new GrayScottKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("init floors dimensions and resets state idempotently", () => {
  const kernel = new GrayScottKernel();
  kernel.init(10.9, 8.2, {});

  const state = kernel.readState();
  assert.equal(state.length, 10 * 8 * kernel.channelCount);

  kernel.step(1);
  const afterStep = Array.from(state);

  kernel.init(10.9, 8.2, {});
  assert.notDeepEqual(Array.from(kernel.readState()), afterStep);

  const vValues = [];
  for (let index = 1; index < state.length; index += kernel.channelCount) {
    vValues.push(kernel.readState()[index]);
  }

  assert.ok(vValues.some((value) => value > 0));
  assert.ok(vValues.some((value) => value < 0.1));
});

test("init seeds compact V blobs into an otherwise undepleted U field", () => {
  const width = 96;
  const height = 96;
  const kernel = new GrayScottKernel();
  kernel.init(width, height, {});

  const state = kernel.readState();
  const centreX = Math.floor(width / 2);
  const centreY = Math.floor(height / 2);

  const centreCell = readCell(state, width, centreX, centreY);
  assert.equal(centreCell.u, 0.5);
  assert.equal(centreCell.v, 0.25);

  // The reservoir is what every regime feeds on: seeds must be a small
  // minority of the field, not a structure spanning it.
  let seeded = 0;
  for (let index = 1; index < state.length; index += kernel.channelCount) {
    if (state[index] > 0.1) seeded += 1;
  }
  const seededFraction = seeded / (width * height);
  assert.ok(seededFraction > 0.01, `seeded ${seededFraction}`);
  assert.ok(seededFraction < 0.12, `seeded ${seededFraction}`);

  const farCell = readCell(state, width, 0, 0);
  assert.equal(farCell.u, 1);
  assert.equal(farCell.v, 0);

  for (let offset = 0; offset <= 15; offset += 3) {
    const left = readCell(state, width, centreX - offset, centreY);
    const right = readCell(state, width, centreX + offset, centreY);
    assert.equal(left.u, right.u);
    assert.equal(left.v, right.v);

    const up = readCell(state, width, centreX, centreY - offset);
    const down = readCell(state, width, centreX, centreY + offset);
    assert.equal(up.u, down.u);
    assert.equal(up.v, down.v);
  }
});

test("init seeds several separated origins, not one merged structure", () => {
  const width = 96;
  const height = 96;
  const kernel = new GrayScottKernel();
  kernel.init(width, height, {});
  const state = kernel.readState();

  // Count 4-connected components of seeded V. One origin means the seed spans
  // the domain as a single painted structure, which is the shape that starved
  // the high-k regimes.
  const seen = new Uint8Array(width * height);
  let origins = 0;
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || state[start * 2 + 1] <= 0.1) continue;
    origins += 1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const cell = stack.pop();
      const x = cell % width;
      const y = Math.floor(cell / width);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || state[next * 2 + 1] <= 0.1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }

  assert.ok(origins > 4, `expected several origins, got ${origins}`);
});

/** Widest span of seeded V through the centre row, i.e. the centre blob's
 * diameter in cells. */
function centreBlobDiameter(kernel, width, height) {
  const state = kernel.readState();
  const centreY = Math.floor(height / 2);
  let span = 0;
  for (let x = 0; x < width; x += 1) {
    if (state[(centreY * width + x) * kernel.channelCount + 1] > 0.1) span += 1;
    else if (span > 0) break;
  }
  return span;
}

// The seed's size is set by the reaction's length scale, which is per-cell and
// so identical at every resolution. Sizing it as a share of the grid passes at
// 256² and kills mitosis at the resolutions the sim actually runs at, because
// the blob outgrows the length scale. Lock the invariant, not one grid.
test("seed blob size does not scale with the grid", () => {
  const small = new GrayScottKernel();
  small.init(384, 384, {});
  const large = new GrayScottKernel();
  large.init(1280, 785, {});

  assert.equal(
    centreBlobDiameter(small, 384, 384),
    centreBlobDiameter(large, 1280, 785),
  );
});

// Regression guard at a resolution the sim really uses. A warm start fitted to
// the waves regime drove mitosis extinct within ~400 steps, and a seed scaled
// to the grid did the same above ~400 cells: V has a high kill rate here and
// dies unless each blob starts compact in undepleted U. Assert survival.
test("high-kill-rate regimes survive the seed rather than going extinct", () => {
  const regimes = [
    { label: "mitosis", F: 0.0367, k: 0.0649 },
    { label: "spots", F: 0.026, k: 0.0597 },
  ];

  for (const { label, F, k } of regimes) {
    const width = 512;
    const height = 400;
    const kernel = new GrayScottKernel();
    kernel.init(width, height, { Du: 0.2097, Dv: 0.105, F, k });

    for (let step = 0; step < 250; step += 1) {
      kernel.step(1);
    }

    const state = kernel.readState();
    let alive = 0;
    for (let index = 1; index < state.length; index += kernel.channelCount) {
      if (state[index] > 0.2) alive += 1;
    }
    assert.ok(alive > 500, `${label} died out: ${alive} cells`);
  }
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new GrayScottKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ Du: defaults.Du, Dv: defaults.Dv }),
    runKernel(defaults),
  );
});

test("parameter changes affect the evolved state", () => {
  const baseline = runKernel({});
  const changed = runKernel({ F: 0.025, k: 0.067 });

  assert.notDeepEqual(changed, baseline);
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = { Du: 0.21, Dv: 0.105, F: 0.055, k: 0.062 };

  assert.deepEqual(runKernel(params, 24), runKernel(params, 24));
});

test("stepping starts the reaction and selfTest passes", () => {
  const kernel = new GrayScottKernel();
  kernel.init(32, 32, {});

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  assert.equal(selfTest(), true);
});

test("stepsPerFrame matches repeated single-step work", () => {
  const batched = new GrayScottKernel();
  batched.init(24, 24, { stepsPerFrame: 5 });
  batched.step(1);

  const repeated = new GrayScottKernel();
  repeated.init(24, 24, { stepsPerFrame: 1 });
  for (let index = 0; index < 5; index += 1) {
    repeated.step(1);
  }

  assert.deepEqual(Array.from(batched.readState()), Array.from(repeated.readState()));
});

test("default seed keeps the reaction active after startup", () => {
  const kernel = new GrayScottKernel();
  kernel.init(64, 48, {});

  for (let index = 0; index < 180; index += 1) {
    kernel.step(1);
  }

  const state = kernel.readState();
  let activeV = 0;
  let depletedU = 0;

  for (let index = 0; index < state.length; index += kernel.channelCount) {
    if (state[index] < 0.9) {
      depletedU += 1;
    }
    if (state[index + 1] > 0.1) {
      activeV += 1;
    }
  }

  assert.ok(depletedU > 200);
  assert.ok(activeV > 200);
});

test("applyImpulse injects V and depletes U under the point, deterministically", () => {
  const width = 40;
  const height = 30;
  const px = 5;
  const py = 5;

  const run = () => {
    const kernel = new GrayScottKernel();
    kernel.init(width, height, {});
    kernel.applyImpulse(px, py, 5, 1);
    return Array.from(kernel.readState());
  };

  const first = run();
  const second = run();
  assert.deepEqual(first, second);

  const clean = new GrayScottKernel();
  clean.init(width, height, {});
  const baseline = Array.from(clean.readState());

  const centre = readCell(first, width, px, py);
  const before = readCell(baseline, width, px, py);
  assert.ok(centre.v > before.v, "V raised at the impulse centre");
  assert.ok(centre.u < before.u, "U depleted at the impulse centre");

  // A cell well outside the brush radius is untouched.
  const far = readCell(first, width, width - 1, height - 1);
  const farBase = readCell(baseline, width, width - 1, height - 1);
  assert.equal(far.u, farBase.u);
  assert.equal(far.v, farBase.v);
});

test("applyImpulse keeps readState reference stable and clamps to bounds", () => {
  const kernel = new GrayScottKernel();
  kernel.init(24, 24, {});
  const ref = kernel.readState();

  // Out-of-range centre and zero strength are safe no-ops that never throw.
  assert.doesNotThrow(() => kernel.applyImpulse(-100, -100, 4, 1));
  assert.doesNotThrow(() => kernel.applyImpulse(12, 12, 4, 0));
  kernel.applyImpulse(12, 12, 6, 1);

  assert.equal(kernel.readState(), ref);
  for (const value of kernel.readState()) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new GrayScottKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
