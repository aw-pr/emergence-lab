const assert = require("node:assert/strict");
const test = require("node:test");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/100-logistic-mandelbrot-inside-out-spread-colouring.md
const skip = process.env.ORBIT_SPREAD !== "1" && "set ORBIT_SPREAD=1";
const colour = () => require("../../.test-build/app/orbitColour.js");
const model = () => require("../../.test-build/sims/logistic-mandelbrot/model.js");
const near = (actual, expected, tolerance) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );

const SHIPPED_WARMUP = 1500;
const SHIPPED_SAMPLES = 8;

function measureCell(cRe, cIm) {
  const samples = new Float32Array(SHIPPED_SAMPLES);
  const measure = { interior: 1, centre: Number.NaN, spread: Number.NaN };
  const period = model().sampleAttractorCell(
    cRe, cIm, SHIPPED_WARMUP, SHIPPED_SAMPLES, samples, 0, measure,
  );
  return { period, samples, centre: measure.centre, spread: measure.spread };
}

// Independent float64 reference: mean and RMS deviation of Re(z) over `count`
// iterates after `warmup`. Never fed to the production sampler.
function referenceOrbit(cRe, cIm, warmup, count) {
  let zr = 0;
  let zi = 0;
  const step = () => {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;
  };
  for (let i = 0; i < warmup; i += 1) step();
  const values = new Float64Array(count);
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    step();
    values[i] = zr;
    sum += zr;
  }
  const mean = sum / count;
  let squares = 0;
  for (const value of values) squares += (value - mean) * (value - mean);
  return { mean, rms: Math.sqrt(squares / count) };
}

test("spread coordinate is fract(bands * |height - centre| - phase)", { skip }, () => {
  const { spreadPaletteCoordinate } = colour();
  near(spreadPaletteCoordinate(-0.5, -0.5, 1.5, 0), 0, 1e-12);
  near(spreadPaletteCoordinate(0, -0.5, 1.5, 0), 0.75, 1e-12);
  near(spreadPaletteCoordinate(0, -0.5, 1.5, 0.25), 0.5, 1e-12);
  near(spreadPaletteCoordinate(-0.5, -0.5, 1.5, 0.25), 0.75, 1e-12);
});

test("spread coordinate is mirrored about the centre and not clamped", { skip }, () => {
  const { spreadPaletteCoordinate } = colour();
  for (const distance of [0.1, 0.5, 0.7, 1.3]) {
    near(
      spreadPaletteCoordinate(-0.5 + distance, -0.5, 1.5, 0.1),
      spreadPaletteCoordinate(-0.5 - distance, -0.5, 1.5, 0.1),
      1e-12,
    );
  }
  // Distance 1.9 is 2.85 laps at 1.5 bands; a clamp at one unit would read 0.5.
  near(spreadPaletteCoordinate(1.4, -0.5, 1.5, 0), 0.85, 1e-9);
  near(
    spreadPaletteCoordinate(0.2, -0.5, 2, 1),
    spreadPaletteCoordinate(0.2, -0.5, 2, 0),
    1e-12,
  );
});

test("a period-1 cell is its own centre with zero spread", { skip }, () => {
  const origin = measureCell(0, 0);
  assert.equal(origin.period, 1);
  near(origin.centre, 0, 1e-4);
  near(origin.spread, 0, 1e-4);

  const cardioid = measureCell(-0.5, 0);
  assert.equal(cardioid.period, 1);
  near(cardioid.centre, (1 - Math.sqrt(3)) / 2, 1e-4);
  near(cardioid.spread, 0, 1e-4);
  for (const sample of cardioid.samples) near(sample, cardioid.centre, 1e-4);
});

test("a real period-2 cell is centred on -0.5 with its branches either side", { skip }, () => {
  const centreOfBulb = measureCell(-1, 0);
  assert.equal(centreOfBulb.period, 2);
  near(centreOfBulb.centre, -0.5, 1e-4);
  near(centreOfBulb.spread, 0.5, 1e-4);

  const nearRoot = measureCell(-0.8, 0);
  assert.equal(nearRoot.period, 2);
  near(nearRoot.centre, -0.5, 1e-4);
  near(nearRoot.spread, Math.sqrt(0.2) / 2, 1e-4);
  for (const sample of nearRoot.samples) {
    near(Math.abs(sample - nearRoot.centre), Math.sqrt(0.2) / 2, 1e-4);
  }
});

test("a period-3 cell is centred on the mean of one whole cycle, not of the plot window", { skip }, () => {
  const cRe = -0.122561166876654;
  const cIm = 0.744861766619744;
  const cell = measureCell(cRe, cIm);
  assert.equal(cell.period, 3);
  const cycle = referenceOrbit(cRe, cIm, 3000, 3);
  near(cell.centre, cycle.mean, 1e-3);
  near(cell.spread, cycle.rms, 1e-3);
});

test("a bounded cell with no detected period still has a centre and a spread", { skip }, () => {
  const cell = measureCell(-1.9, 0);
  assert.equal(cell.period, 0);
  const reference = referenceOrbit(-1.9, 0, SHIPPED_WARMUP, 1_000_000);
  near(cell.centre, reference.mean, 0.1);
  near(cell.spread, reference.rms, 0.1);
});

test("an escaped cell reports escape, whatever its centre holds", { skip }, () => {
  const cell = measureCell(1, 0);
  assert.equal(cell.period, model().ESCAPED);
});
// AUTOMETTA-CONTRACT-END
