const assert = require("node:assert/strict");
const test = require("node:test");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/104-logistic-mandelbrot-hierarchical-centre.md
const skip = process.env.ORBIT_HIERARCHY !== "1" && "set ORBIT_HIERARCHY=1";
const hierarchy = () => require("../../.test-build/app/orbitHierarchy.js");
const model = () => require("../../.test-build/sims/logistic-mandelbrot/model.js");
const near = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label ?? ""} ${actual} is not within ${tolerance} of ${expected}`,
  );

// Independent float64 reference: iterate z -> z^2 + c from 0 past a long
// warmup, then read one detected cycle of heights Re(z). Never fed to the
// production sampler.
function referenceCycle(cRe, cIm, warmup = 20000) {
  let zr = 0;
  let zi = 0;
  const step = () => {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
  };
  for (let i = 0; i < warmup; i += 1) step();
  const points = [];
  for (let i = 0; i < 64; i += 1) {
    step();
    points.push([zr, zi]);
  }
  for (let period = 1; period <= 32; period += 1) {
    let periodic = true;
    for (let i = 0; i + period < points.length; i += 1) {
      if (Math.hypot(points[i][0] - points[i + period][0], points[i][1] - points[i + period][1]) > 1e-9) {
        periodic = false;
        break;
      }
    }
    if (periodic) return { period, heights: points.slice(0, period).map((z) => z[0]) };
  }
  return { period: 0, heights: points.map((z) => z[0]) };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const groupMean = (heights, k, s) => {
  const period = heights.length;
  const stride = period / s;
  let sum = 0;
  for (let j = 0; j < s; j += 1) sum += heights[(k + j * stride) % period];
  return sum / s;
};

test("a period-doubled cycle is measured against the pair it was born from", { skip }, () => {
  const { cycleHierarchy } = hierarchy();
  for (const [cRe, expectedPeriod] of [[-1.3, 4], [-1.26, 4], [-1.375, 8]]) {
    const { period, heights } = referenceCycle(cRe, 0);
    assert.equal(period, expectedPeriod, `c = ${cRe} reference period`);
    const result = cycleHierarchy(heights, period);
    assert.equal(result.multiplicity, 2, `c = ${cRe} multiplicity`);
    assert.equal(result.centres.length, period);
    const columnMean = mean(heights);
    for (let k = 0; k < period; k += 1) {
      near(result.centres[k], groupMean(heights, k, 2), 1e-12, `c = ${cRe} centre ${k}`);
      near(result.centres[k], result.centres[(k + period / 2) % period], 1e-12, `c = ${cRe} pair ${k}`);
      assert.ok(Math.abs(heights[k] - result.centres[k]) < 0.2, `c = ${cRe}: point ${k} is ${Math.abs(heights[k] - result.centres[k])} from its parent`);
      assert.ok(Math.abs(heights[k] - columnMean) > 0.3, `c = ${cRe}: point ${k} is only ${Math.abs(heights[k] - columnMean)} from the column mean`);
    }
  }
});

test("a one-third satellite of the period-2 bulb is measured against its period-2 parent", { skip }, () => {
  const { cycleHierarchy } = hierarchy();
  const { period, heights } = referenceCycle(-1.14, 0.245);
  assert.equal(period, 6);
  const result = cycleHierarchy(heights, period);
  assert.equal(result.multiplicity, 3);
  for (let k = 0; k < period; k += 1) {
    near(result.centres[k], groupMean(heights, k, 3), 1e-12, `centre ${k}`);
    assert.ok(Math.abs(heights[k] - result.centres[k]) < 0.2, `point ${k} is ${Math.abs(heights[k] - result.centres[k])} from its parent`);
  }
  // The two parents are the period-2 points, far apart and either side of -0.5.
  assert.ok(result.centres[0] < -0.9 && result.centres[1] > 0.1, `parents ${result.centres[0]} ${result.centres[1]}`);
});

test("a prime-period primary bulb, a period-2 pair and a fixed point keep the column mean", { skip }, () => {
  const { cycleHierarchy } = hierarchy();
  const three = referenceCycle(-0.12, 0.74);
  assert.equal(three.period, 3);
  const primary = cycleHierarchy(three.heights, 3);
  assert.equal(primary.multiplicity, 3);
  for (let k = 0; k < 3; k += 1) near(primary.centres[k], mean(three.heights), 1e-12, `period-3 centre ${k}`);

  const two = referenceCycle(-1, 0);
  assert.equal(two.period, 2);
  const pair = cycleHierarchy(two.heights, 2);
  assert.equal(pair.multiplicity, 2);
  near(pair.centres[0], -0.5, 1e-9);
  near(pair.centres[1], -0.5, 1e-9);

  const one = referenceCycle(-0.5, 0);
  assert.equal(one.period, 1);
  const fixed = cycleHierarchy(one.heights, 1);
  assert.equal(fixed.multiplicity, 1);
  assert.equal(fixed.centres.length, 1);
  near(fixed.centres[0], one.heights[0], 1e-12);

  assert.throws(() => cycleHierarchy([0, 0], 0));
});

test("the CPU oracle carries a per-sample centre aligned to the plotted samples", { skip }, () => {
  const { sampleAttractorCell } = model();
  const samples = new Float32Array(8);
  const measure = { interior: 1, centre: Number.NaN, spread: Number.NaN, sampleCentres: new Float32Array(8) };

  assert.equal(sampleAttractorCell(-1.3, 0, 1500, 8, samples, 0, measure), 4);
  for (let k = 0; k < 8; k += 1) {
    const parent = (samples[k] + samples[(k + 2) % 4 + (k >= 4 ? 4 : 0)]) / 2;
    near(measure.sampleCentres[k], parent, 1e-3, `c = -1.3 sample ${k}`);
    assert.ok(Math.abs(measure.sampleCentres[k] - measure.centre) > 0.3, `c = -1.3 sample ${k} still reads the column mean`);
  }

  assert.equal(sampleAttractorCell(-1, 0, 1500, 8, samples, 0, measure), 2);
  for (let k = 0; k < 8; k += 1) near(measure.sampleCentres[k], -0.5, 1e-3, `c = -1 sample ${k}`);
  near(measure.centre, -0.5, 1e-3, "c = -1 column mean");

  assert.equal(sampleAttractorCell(-1.9, 0, 1500, 8, samples, 0, measure), 0);
  for (let k = 0; k < 8; k += 1) assert.equal(measure.sampleCentres[k], Math.fround(measure.centre), `chaotic sample ${k}`);
});
// AUTOMETTA-CONTRACT-END
