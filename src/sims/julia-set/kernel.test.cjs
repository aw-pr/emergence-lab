const assert = require("node:assert/strict");
const test = require("node:test");

const {
  JuliaSetKernel,
  selfTest,
} = require("../../../.test-build/sims/julia-set/kernel.js");

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, steps = 0) {
  const kernel = new JuliaSetKernel();
  kernel.init(40, 30, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1);
  }

  return Array.from(kernel.readState());
}

test("metadata matches the renderer contract", () => {
  const kernel = new JuliaSetKernel();

  assert.equal(kernel.name, "Julia Set");
  assert.equal(kernel.channelCount, 1);
  assert.deepEqual(kernel.channelLabels, ["Escape"]);
  assert.deepEqual(kernel.channelRanges, [[0, 1]]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "cRe",
      "cIm",
      "centerX",
      "centerY",
      "zoom",
      "maxIterations",
      "palettePhase",
      "cycleSpeed",
    ],
  );

  const expected = {
    cRe: { default: -0.8, min: -1.5, max: 1.5, step: 0.001 },
    cIm: { default: 0.156, min: -1.5, max: 1.5, step: 0.001 },
    centerX: { default: 0, min: -2, max: 2, step: 0.001 },
    centerY: { default: 0, min: -2, max: 2, step: 0.001 },
    zoom: { default: 1, min: 0.25, max: 500, step: 0.01 },
    maxIterations: { default: 128, min: 16, max: 512, step: 1 },
    palettePhase: { default: 0, min: 0, max: 1, step: 0.001 },
    cycleSpeed: { default: 0.024, min: 0, max: 5, step: 0.001 },
  };

  for (const descriptor of kernel.paramSchema) {
    assert.equal(descriptor.type, "number");
    assert.equal(typeof descriptor.default, "number");
    assert.equal(typeof descriptor.min, "number");
    assert.equal(typeof descriptor.max, "number");
    assert.equal(typeof descriptor.step, "number");
    assert.deepEqual(
      {
        default: descriptor.default,
        min: descriptor.min,
        max: descriptor.max,
        step: descriptor.step,
      },
      expected[descriptor.key],
    );
  }
});

test("init creates the expected state shape and readState reference is stable", () => {
  const kernel = new JuliaSetKernel();
  kernel.init(16, 12, {});

  const first = kernel.readState();
  const second = kernel.readState();

  assert.ok(first instanceof Float32Array);
  assert.equal(first.length, 16 * 12 * kernel.channelCount);
  assert.equal(first, second);

  kernel.step(1);
  assert.equal(kernel.readState(), first);
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new JuliaSetKernel());

  assert.deepEqual(runKernel({}), runKernel(defaults));
  assert.deepEqual(
    runKernel({ cRe: defaults.cRe, cIm: defaults.cIm, zoom: defaults.zoom }),
    runKernel(defaults),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = {
    cRe: -0.745,
    cIm: 0.113,
    centerX: 0.04,
    centerY: -0.02,
    zoom: 2.5,
    maxIterations: 180,
    palettePhase: 0.25,
    cycleSpeed: 0.015,
  };

  assert.deepEqual(runKernel(params, 8), runKernel(params, 8));
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});

test("cRe, cIm, and zoom params affect the initial state", () => {
  const baseline = runKernel({ cycleSpeed: 0 });

  assert.notDeepEqual(runKernel({ cRe: -0.7, cycleSpeed: 0 }), baseline);
  assert.notDeepEqual(runKernel({ cIm: 0.22, cycleSpeed: 0 }), baseline);
  assert.notDeepEqual(runKernel({ zoom: 3, cycleSpeed: 0 }), baseline);
});

test("colour cycling changes state on step while staying bounded", () => {
  const kernel = new JuliaSetKernel();
  kernel.init(36, 24, { cycleSpeed: 0.025 });

  const before = Array.from(kernel.readState());
  kernel.step(1);
  const after = Array.from(kernel.readState());

  assert.notDeepEqual(after, before);
  assert.ok(after.every((value) => value >= 0 && value <= 1));
});

test("params are finite-checked and clamped", () => {
  assert.deepEqual(
    runKernel({
      cRe: Number.POSITIVE_INFINITY,
      cIm: Number.NaN,
      zoom: Number.NEGATIVE_INFINITY,
      maxIterations: Number.NaN,
      palettePhase: Number.POSITIVE_INFINITY,
      cycleSpeed: Number.NaN,
    }),
    runKernel({}),
  );

  assert.deepEqual(
    runKernel({
      cRe: -100,
      cIm: 100,
      centerX: -100,
      centerY: 100,
      zoom: -1,
      maxIterations: 1000,
      palettePhase: 3,
      cycleSpeed: 10,
    }),
    runKernel({
      cRe: -1.5,
      cIm: 1.5,
      centerX: -2,
      centerY: 2,
      zoom: 0.25,
      maxIterations: 512,
      palettePhase: 1,
      cycleSpeed: 5,
    }),
  );
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = new JuliaSetKernel();
  kernel.init(12, 10, {});

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1);
  });
  assert.equal(kernel.readState().length, 0);
});
