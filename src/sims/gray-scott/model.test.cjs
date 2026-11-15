const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createGrayScottInitialField,
  grayScottImpulseDisc,
  grayScottPassesPerStep,
  readGrayScottConfig,
} = require("../../../.test-build/sims/gray-scott/model.js");
const { GrayScottKernel } = require("../../../.test-build/sims/gray-scott/kernel.js");

test("dt snaps to a dyadic substep and falls back to 1 outside [1/8, 1]", () => {
  const cases = [
    [1, 1],
    [0.75, 1],
    [0.5, 0.5],
    [0.375, 0.5],
    [0.25, 0.25],
    [0.125, 0.125],
    [0.1, 1],
    [1.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    ["x", 1],
  ];
  for (const [input, expected] of cases) {
    assert.equal(readGrayScottConfig({ dt: input }).dt, expected, String(input));
  }
});

test("steps per frame floors and clamps to 1..60, letting NaN through", () => {
  const cases = [
    [0, 1],
    [1.9, 1],
    [20, 20],
    [60, 60],
    [61, 60],
    [Number.POSITIVE_INFINITY, 60],
  ];
  for (const [input, expected] of cases) {
    assert.equal(
      readGrayScottConfig({ stepsPerFrame: input }).stepsPerFrame,
      expected,
      String(input),
    );
  }
  assert.ok(Number.isNaN(readGrayScottConfig({ stepsPerFrame: Number.NaN }).stepsPerFrame));
});

test("passes per step are steps per frame over dt", () => {
  const cases = [
    [{ stepsPerFrame: 20, dt: 1 }, 20],
    [{ stepsPerFrame: 20, dt: 0.25 }, 80],
    [{ stepsPerFrame: 60, dt: 0.125 }, 480],
    [{ stepsPerFrame: 7, dt: 0.5 }, 14],
  ];
  for (const [params, expected] of cases) {
    assert.equal(grayScottPassesPerStep(readGrayScottConfig(params)), expected);
  }
  assert.ok(
    Number.isNaN(grayScottPassesPerStep(readGrayScottConfig({ stepsPerFrame: Number.NaN }))),
  );
});

test("an unknown stencil falls back to nine-point", () => {
  assert.equal(readGrayScottConfig({}).stencil, "nine-point");
  assert.equal(readGrayScottConfig({ stencil: "seven-point" }).stencil, "nine-point");
  assert.equal(readGrayScottConfig({ stencil: "five-point" }).stencil, "five-point");
});

test("the initial field is the kernel's freshly seeded state", () => {
  for (const [width, height] of [[1, 1], [7, 5], [200, 136], [384, 384]]) {
    const kernel = new GrayScottKernel();
    kernel.init(width, height, {});
    assert.deepEqual(
      createGrayScottInitialField(width, height),
      kernel.readState(),
      `${width}x${height}`,
    );
  }
});

test("the impulse disc rounds like the kernel and is null without strength", () => {
  assert.deepEqual(grayScottImpulseDisc(100.5, 67.5, 5.4, 1), {
    centreX: 101,
    centreY: 68,
    radius: 5,
    strength: 1,
  });
  assert.equal(grayScottImpulseDisc(0, 0, 0.2, 0.5).radius, 1);
  assert.equal(grayScottImpulseDisc(0, 0, 4, 3).strength, 1);
  assert.equal(grayScottImpulseDisc(0, 0, 4, 0), null);
  assert.equal(grayScottImpulseDisc(0, 0, 4, -1), null);
});
