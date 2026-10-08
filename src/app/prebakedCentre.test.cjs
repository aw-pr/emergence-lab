const assert = require("node:assert/strict");
const test = require("node:test");

const {
  dequantizeHeight,
  deriveQuantizedCentres,
  quantizeHeight,
} = require("../../.test-build/app/prebakedCentre.js");

const CLIP = 2;

// Build a sample-major cloud from per-cell height windows.
function cloud(columns) {
  const cellCount = columns.length;
  const sampleCount = columns[0].heights.length;
  const positions = new Uint16Array(cellCount * sampleCount * 3);
  const periods = new Uint8Array(cellCount * sampleCount);
  columns.forEach((column, cell) => {
    column.heights.forEach((z, sample) => {
      const index = sample * cellCount + cell;
      positions[index * 3 + 2] = quantizeHeight(z, CLIP);
      periods[index] = column.period;
    });
  });
  return { positions, periods, cellCount, sampleCount };
}

function centreOf(centres, cellCount, cell) {
  return dequantizeHeight(centres[cell], CLIP);
}

test("a periodic column is centred on the mean of one cycle, not the window", () => {
  // Period 3 over an 8-sample window: the window mean would be biased.
  const heights = [0.5, -0.5, 0.3, 0.5, -0.5, 0.3, 0.5, -0.5];
  const { positions, periods, cellCount, sampleCount } = cloud([{ period: 3, heights }]);
  const centres = deriveQuantizedCentres(positions, periods, cellCount, sampleCount);
  const expected = (0.5 - 0.5 + 0.3) / 3;
  assert.ok(Math.abs(centreOf(centres, cellCount, 0) - expected) < 1e-4);
  const windowMean = heights.reduce((a, b) => a + b, 0) / heights.length;
  assert.ok(Math.abs(centreOf(centres, cellCount, 0) - windowMean) > 0.01);
});

test("a column with no detected period is centred on its whole window", () => {
  const heights = [1.9, -1.2, 0.4, -0.7, 1.1, 0.2, -1.5, 0.8];
  const { positions, periods, cellCount, sampleCount } = cloud([{ period: 0, heights }]);
  const centres = deriveQuantizedCentres(positions, periods, cellCount, sampleCount);
  const expected = heights.reduce((a, b) => a + b, 0) / heights.length;
  assert.ok(Math.abs(centreOf(centres, cellCount, 0) - expected) < 1e-4);
});

test("every sample of a column carries the same centre, in sample-major order", () => {
  const { positions, periods, cellCount, sampleCount } = cloud([
    { period: 1, heights: [-0.366, -0.366, -0.366, -0.366] },
    { period: 2, heights: [0, -1, 0, -1] },
  ]);
  const centres = deriveQuantizedCentres(positions, periods, cellCount, sampleCount);
  assert.equal(centres.length, cellCount * sampleCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    assert.ok(Math.abs(dequantizeHeight(centres[sample * cellCount + 0], CLIP) + 0.366) < 1e-4);
    assert.ok(Math.abs(dequantizeHeight(centres[sample * cellCount + 1], CLIP) + 0.5) < 1e-4);
  }
});

test("quantization round-trips within one step", () => {
  for (const z of [-2, -0.5, 0, 0.7071, 2]) {
    assert.ok(Math.abs(dequantizeHeight(quantizeHeight(z, CLIP), CLIP) - z) <= 4 / 65535);
  }
});

const { cycleHierarchy } = require("../../.test-build/app/orbitHierarchy.js");

function bakedOrbit(re, im, period) {
  let zr = 0;
  let zi = 0;
  const heights = [];
  for (let i = 0; i < 20064; i += 1) {
    const next = zr * zr - zi * zi + re;
    zi = 2 * zr * zi + im;
    zr = next;
    if (i >= 20000) heights.push(zr);
  }
  return { heights, period };
}

test("64-sample bakes preserve each period-4 and period-6 parent in sample-major order", () => {
  const columns = [bakedOrbit(-1.3, 0, 4), bakedOrbit(-1.14, 0.245, 6), bakedOrbit(-1, 0, 2)];
  const { positions, periods, cellCount, sampleCount } = cloud(columns);
  const centres = deriveQuantizedCentres(positions, periods, cellCount, sampleCount);
  columns.forEach((column, cell) => {
    const expected = cycleHierarchy(column.heights, column.period);
    assert.equal(expected.multiplicity, cell === 1 ? 3 : 2);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const actual = dequantizeHeight(centres[sample * cellCount + cell], CLIP);
      assert.ok(Math.abs(actual - expected.centres[sample % column.period]) < 1e-4);
      if (column.period === 2) assert.ok(Math.abs(actual + 0.5) < 1e-4);
    }
  });
});

test("chaotic and incompletely baked cycles keep the window mean at every sample", () => {
  const columns = [bakedOrbit(-1.9, 0, 0), { heights: [0.1, -1.3, 0.4, -1.1], period: 8 }];
  for (const column of columns) {
    const { positions, periods, cellCount, sampleCount } = cloud([column]);
    const centres = deriveQuantizedCentres(positions, periods, cellCount, sampleCount);
    const expected = column.heights.reduce((sum, h) => sum + h, 0) / sampleCount;
    for (const centre of centres) assert.ok(Math.abs(dequantizeHeight(centre, CLIP) - expected) < 1e-4);
  }
});
