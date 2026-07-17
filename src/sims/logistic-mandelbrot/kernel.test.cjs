const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LogisticMandelbrotKernel,
  selfTest,
} = require("../../../.test-build/sims/logistic-mandelbrot/kernel.js");
const model = require("../../../.test-build/sims/logistic-mandelbrot/model.js");

// Logistic conjugacy: x <- r*x*(1 - x) maps to z <- z^2 + c under
// z = r/2 - r*x with c = (r/2)*(1 - r/2); inverting, r = 1 + sqrt(1 - 4c).
const cFromR = (r) => (r / 2) * (1 - r / 2);
const zFromX = (r, x) => r / 2 - r * x;

function sampleCell(cRe, cIm) {
  const out = new Float32Array(model.DEFAULT_SAMPLE_COUNT);
  const period = model.sampleAttractorCell(
    cRe,
    cIm,
    model.DEFAULT_WARMUP_ITERATIONS,
    model.DEFAULT_SAMPLE_COUNT,
    out,
    0,
  );
  return { period, out };
}

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, width = 30, height = 20, steps = 8) {
  const kernel = new LogisticMandelbrotKernel();
  kernel.init(width, height, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1 / 60);
  }

  return kernel;
}

test("metadata matches the renderer contract", () => {
  const kernel = new LogisticMandelbrotKernel();

  assert.equal(kernel.name, "Logistic Mandelbrot");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, [
    "Attractor density",
    "Estimated period",
  ]);
  assert.deepEqual(kernel.channelRanges, [
    [0, 1],
    [0, model.MAX_DETECTABLE_PERIOD],
  ]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    ["warmupIterations", "sampleCount", "plottedIterations", "realSliceOnly"],
  );

  for (const descriptor of kernel.paramSchema) {
    if (descriptor.type === "boolean") {
      assert.equal(typeof descriptor.default, "boolean");
      continue;
    }
    assert.equal(descriptor.type, "number");
    assert.equal(typeof descriptor.default, "number");
    assert.ok(descriptor.min <= descriptor.default);
    assert.ok(descriptor.default <= descriptor.max);
  }

  const warmup = kernel.paramSchema.find((d) => d.key === "warmupIterations");
  assert.equal(warmup?.default, 200);
  const samples = kernel.paramSchema.find((d) => d.key === "sampleCount");
  assert.equal(samples?.default, 48);
  const plotted = kernel.paramSchema.find((d) => d.key === "plottedIterations");
  assert.equal(plotted?.default, 48);
  assert.equal(plotted?.min, 1);
});

test("c = 0 is the r = 2 logistic fixed point mapped to z = 0 (period 1)", () => {
  const r = 2;
  assert.equal(cFromR(r), 0);

  // Logistic fixed point x* = 1 - 1/r maps to z = 0.
  const zFixed = zFromX(r, 1 - 1 / r);
  assert.equal(zFixed, 0);

  const { period, out } = sampleCell(0, 0);
  assert.equal(period, 1);
  for (const value of out) {
    assert.ok(Math.abs(value - zFixed) < 1e-6);
  }
});

test("c = -1 is the r = 1 + sqrt(5) logistic 2-cycle mapped to {0, -1}", () => {
  const r = 1 + Math.sqrt(5);
  assert.ok(Math.abs(cFromR(r) - -1) < 1e-12);

  // Logistic 2-cycle: x± = (r + 1 ± sqrt((r - 3)(r + 1))) / (2r). At this r
  // the discriminant (r - 3)(r + 1) = (√5 - 2)(√5 + 2) = 1 exactly.
  const disc = Math.sqrt((r - 3) * (r + 1));
  assert.ok(Math.abs(disc - 1) < 1e-12);
  const mapped = [
    zFromX(r, (r + 1 + disc) / (2 * r)),
    zFromX(r, (r + 1 - disc) / (2 * r)),
  ].sort((a, b) => a - b);
  assert.ok(Math.abs(mapped[0] - -1) < 1e-9);
  assert.ok(Math.abs(mapped[1] - 0) < 1e-9);

  const { period, out } = sampleCell(-1, 0);
  assert.equal(period, 2);

  const observed = [out[0], out[1]].sort((a, b) => a - b);
  assert.ok(Math.abs(observed[0] - mapped[0]) < 1e-6);
  assert.ok(Math.abs(observed[1] - mapped[1]) < 1e-6);
  for (let index = 0; index + 2 < out.length; index += 1) {
    assert.ok(Math.abs(out[index + 2] - out[index]) < 1e-6);
  }
  assert.ok(Math.abs(out[1] - out[0]) > 0.5);
});

test("c = -1.76 sits inside the mapped logistic period-3 window (period 3)", () => {
  // The period-3 window opens at r = 1 + sqrt(8) and period-doubles near
  // r ≈ 3.8415; c = -1.76 maps back inside it.
  const r = 1 + Math.sqrt(1 - 4 * -1.76);
  assert.ok(r > 1 + Math.sqrt(8));
  assert.ok(r < 3.8415);

  const { period, out } = sampleCell(-1.76, 0);
  assert.equal(period, 3);

  for (let index = 0; index + 3 < out.length; index += 1) {
    assert.ok(Math.abs(out[index + 3] - out[index]) < 1e-6);
  }

  const levels = [out[0], out[1], out[2]];
  assert.ok(Math.abs(levels[0] - levels[1]) > 1e-3);
  assert.ok(Math.abs(levels[1] - levels[2]) > 1e-3);
  assert.ok(Math.abs(levels[0] - levels[2]) > 1e-3);
});

test("c = 0.5 escapes and contributes nothing", () => {
  const { period, out } = sampleCell(0.5, 0);
  assert.equal(period, model.ESCAPED);
  assert.ok(out.every((value) => value === 0));
});

test("sampleAttractorGrid returns contract-shaped typed arrays", () => {
  const field = model.sampleAttractorGrid(
    {
      width: 12,
      height: 8,
      reMin: model.RE_MIN,
      reMax: model.RE_MAX,
      imMin: model.IM_MIN,
      imMax: model.IM_MAX,
    },
    model.DEFAULT_WARMUP_ITERATIONS,
    model.DEFAULT_SAMPLE_COUNT,
  );

  assert.equal(field.width, 12);
  assert.equal(field.height, 8);
  assert.equal(field.samples.length, 12 * 8 * model.DEFAULT_SAMPLE_COUNT);
  assert.equal(field.escaped.length, 12 * 8);
  assert.equal(field.period.length, 12 * 8);

  let escapedCells = 0;
  for (let cell = 0; cell < 12 * 8; cell += 1) {
    if (field.escaped[cell] === 1) {
      escapedCells += 1;
      assert.equal(field.period[cell], 0);
      for (let s = 0; s < field.sampleCount; s += 1) {
        assert.equal(field.samples[cell * field.sampleCount + s], 0);
      }
    }
    for (let s = 0; s < field.sampleCount; s += 1) {
      const value = field.samples[cell * field.sampleCount + s];
      assert.ok(value >= -model.SAMPLE_CLIP && value <= model.SAMPLE_CLIP);
    }
  }
  assert.ok(escapedCells > 0);
  assert.ok(escapedCells < 12 * 8);
});

test("kernel grid output dimensions and channel ranges honour the contract", () => {
  const width = 30;
  const height = 20;
  const kernel = runKernel({}, width, height);
  const state = kernel.readState();

  assert.ok(state instanceof Float32Array);
  assert.equal(state.length, width * height * kernel.channelCount);
  assert.equal(kernel.readState(), state);

  let inSet = 0;
  let escaped = 0;
  for (let cell = 0; cell < width * height; cell += 1) {
    const density = state[cell * 2];
    const period = state[cell * 2 + 1];

    assert.ok(density >= 0 && density <= 1);
    assert.ok(period >= 0 && period <= model.MAX_DETECTABLE_PERIOD);
    assert.ok(Number.isInteger(period));

    if (density === 0) {
      escaped += 1;
      assert.equal(period, 0);
    } else {
      inSet += 1;
    }
  }
  assert.ok(inSet > 0, "some cells hold a bounded attractor");
  assert.ok(escaped > 0, "some cells escape");

  // Cell centres nearest the main cardioid and the period-2 disc.
  const cellNear = (re, im) => {
    const x = Math.round(
      ((re - model.RE_MIN) / (model.RE_MAX - model.RE_MIN)) * width - 0.5,
    );
    const y = Math.round(
      ((im - model.IM_MIN) / (model.IM_MAX - model.IM_MIN)) * height - 0.5,
    );
    return y * width + x;
  };
  const cardioid = cellNear(-0.5, 0) * 2;
  assert.equal(state[cardioid], 1);
  assert.equal(state[cardioid + 1], 1);
  const disc = cellNear(-1, 0) * 2;
  assert.equal(state[disc], 0.5);
  assert.equal(state[disc + 1], 2);
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new LogisticMandelbrotKernel());

  assert.deepEqual(
    Array.from(runKernel({}).readState()),
    Array.from(runKernel(defaults).readState()),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = { warmupIterations: 150, sampleCount: 32, plottedIterations: 32 };

  assert.deepEqual(
    Array.from(runKernel(params).readState()),
    Array.from(runKernel(params).readState()),
  );
});

test("plotted iterations = 1 collapses the period structure", () => {
  const width = 30;
  const height = 20;
  const full = runKernel({}, width, height).readState();
  const collapsed = runKernel({ plottedIterations: 1 }, width, height).readState();

  const densities = (state) =>
    new Set(
      Array.from({ length: width * height }, (_v, cell) => state[cell * 2]).filter(
        (value) => value > 0,
      ),
    );

  // Full window: cardioid (1), period-2 disc (0.5), and more bands coexist.
  assert.ok(densities(full).size > 2);

  // One plotted sample: every bounded cell is a single level, no periods.
  assert.deepEqual(Array.from(densities(collapsed)), [1]);
  for (let cell = 0; cell < width * height; cell += 1) {
    assert.equal(collapsed[cell * 2 + 1], 0);
  }
});

test("real-slice-only repeats the bifurcation slice down every column", () => {
  const width = 30;
  const height = 20;
  const state = runKernel({ realSliceOnly: true }, width, height).readState();

  const row = (y) =>
    Array.from(state.subarray(y * width * 2, (y + 1) * width * 2));
  assert.deepEqual(row(0), row(10));
  assert.deepEqual(row(19), row(10));

  // Column at Re(c) = -1.35 maps to r = 1 + sqrt(6.4) ≈ 3.53, inside the
  // logistic period-4 window (3.4495 < r < 3.5441).
  const x = Math.round(
    ((-1.35 - model.RE_MIN) / (model.RE_MAX - model.RE_MIN)) * width - 0.5,
  );
  assert.equal(state[x * 2 + 1], 4);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = runKernel({}, 12, 10, 2);

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1 / 60);
  });
  assert.equal(kernel.readState().length, 0);
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});
