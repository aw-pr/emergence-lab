const assert = require("node:assert/strict");
const test = require("node:test");

// The harness metrics module is plain TypeScript with no imports, so Node can
// require it directly under type stripping — no build step, and the unit tests
// score exactly the source the Playwright sweep scores.
const { channelMixing } = require("./metrics.ts");

const CHANNELS = 3;
const WIDTH = 8;
const HEIGHT = 8;
const CELLS = WIDTH * HEIGHT;

/** Maximum reading for C channels: an even C-way blend. */
const MAX_MIXING = 1 - 1 / CHANNELS;

// Occupied cells sit on a checkerboard so empty cells are interleaved with
// them. Nothing in the statistic is spatial, but it keeps the fixtures from
// accidentally exercising one contiguous run.
function isOccupied(index) {
  return ((index % WIDTH) + Math.floor(index / WIDTH)) % 2 === 0;
}

// Per-cell total density varies across the fixture. The statistic is a ratio
// within each cell, so a correct implementation is blind to that variation;
// a wrong one that sums densities before dividing is not.
function totalDensityAt(index) {
  return 0.2 + (index % 5) * 0.35;
}

/**
 * Build CHANNELS parallel fields. `split(index, total)` returns the per-channel
 * densities for an occupied cell; unoccupied cells are zero in every channel.
 */
function fieldsFrom(split) {
  const fields = Array.from({ length: CHANNELS }, () =>
    new Array(CELLS).fill(0),
  );
  for (let index = 0; index < CELLS; index += 1) {
    if (!isOccupied(index)) continue;
    const densities = split(index, totalDensityAt(index));
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      fields[channel][index] = densities[channel];
    }
  }
  return fields;
}

function segregatedSplit(index, total) {
  const densities = [0, 0, 0];
  densities[index % CHANNELS] = total;
  return densities;
}

function evenBlendSplit(_index, total) {
  return [total / CHANNELS, total / CHANNELS, total / CHANNELS];
}

function halfAndHalfSplit(index, total) {
  const densities = [0, 0, 0];
  densities[index % CHANNELS] = total / 2;
  densities[(index + 1) % CHANNELS] = total / 2;
  return densities;
}

function assertClose(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

test("channelMixing: perfect segregation reads 0", () => {
  const fields = fieldsFrom(segregatedSplit);
  assert.equal(channelMixing(fields), 0);
});

test("channelMixing: an even three-way blend reads the 2/3 maximum", () => {
  const fields = fieldsFrom(evenBlendSplit);
  assertClose(MAX_MIXING, 2 / 3);
  assertClose(channelMixing(fields), 2 / 3);
});

test("channelMixing: a half-and-half field reads 0.5, between the two", () => {
  const fields = fieldsFrom(halfAndHalfSplit);
  const reading = channelMixing(fields);
  assertClose(reading, 0.5);
  assert.ok(reading > 0 && reading < 2 / 3);
});

test("channelMixing: the mask selects which cells are averaged", () => {
  // Segregated on the left half of every row, evenly blended on the right.
  const fields = fieldsFrom((index, total) =>
    index % WIDTH < WIDTH / 2
      ? segregatedSplit(index, total)
      : evenBlendSplit(index, total),
  );
  const leftHalf = new Array(CELLS)
    .fill(0)
    .map((_, index) => (index % WIDTH < WIDTH / 2 ? 1 : 0));
  const rightHalf = leftHalf.map((value) => 1 - value);

  assert.equal(channelMixing(fields, leftHalf), 0);
  assertClose(channelMixing(fields, rightHalf), 2 / 3);
  // Unmasked, the two halves carry equal cell counts and average to half the
  // blended reading.
  assertClose(channelMixing(fields), 1 / 3);
});

test("channelMixing: empty cells are excluded, not scored as segregated", () => {
  const blended = fieldsFrom(evenBlendSplit);
  const everyCell = new Array(CELLS).fill(1);

  // Half the grid is empty by construction; including it as 0 would halve the
  // reading. It must not, with or without an all-pass mask.
  assertClose(channelMixing(blended), 2 / 3);
  assertClose(channelMixing(blended, everyCell), 2 / 3);
  assert.equal(channelMixing([new Array(CELLS).fill(0), new Array(CELLS).fill(0)]), 0);
});
