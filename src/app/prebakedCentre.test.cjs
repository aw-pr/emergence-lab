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
