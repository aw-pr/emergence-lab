const assert = require("node:assert/strict");
const test = require("node:test");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/103-logistic-mandelbrot-packed-cells.md
const skip = process.env.ORBIT_PACKING !== "1" && "set ORBIT_PACKING=1";
const packing = () => require("../../.test-build/app/orbitPacking.js");

// Deterministic sequence for the random placement checks; never fed to the
// implementation as an expected value.
function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test("a cell occupies its distinct heights: min(period, samples), or every sample when no period", { skip }, () => {
  const { distinctPointCount } = packing();
  assert.equal(distinctPointCount(1, 8), 1);
  assert.equal(distinctPointCount(2, 8), 2);
  assert.equal(distinctPointCount(3, 8), 3);
  assert.equal(distinctPointCount(8, 8), 8);
  assert.equal(distinctPointCount(16, 8), 8);
  assert.equal(distinctPointCount(32, 8), 8);
  assert.equal(distinctPointCount(0, 8), 8);
  assert.equal(distinctPointCount(3, 64), 3);
  assert.equal(distinctPointCount(40, 64), 40);
  assert.equal(distinctPointCount(0, 64), 64);
  assert.equal(distinctPointCount(1, 96), 1);
});

test("the planner's rows-per-cell estimate covers the measured layout without starving the plane", { skip }, () => {
  const { estimatePackedRowsPerCell } = packing();
  // Measured 2026-10-06 on a 384x256 sweep of the sampler domain at warmup
  // 1500: 1.56 rows per bounded cell at 8 samples, 1.75 at 16, 2.57 at 64.
  // The estimate may exceed the measurement by up to a quarter and never
  // fall below it.
  for (const [samples, measured] of [[8, 1.56], [16, 1.75], [64, 2.57]]) {
    const estimate = estimatePackedRowsPerCell(samples);
    assert.ok(estimate >= measured, `${samples} samples: ${estimate} < measured ${measured}`);
    assert.ok(estimate <= measured * 1.25, `${samples} samples: ${estimate} > ${measured * 1.25}`);
  }
  assert.equal(estimatePackedRowsPerCell(1), 1);
  let previous = 0;
  for (const samples of [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96]) {
    const estimate = estimatePackedRowsPerCell(samples);
    assert.ok(estimate >= previous, `not monotone at ${samples}`);
    assert.ok(estimate <= samples, `${samples} samples: estimate ${estimate} exceeds the sample count`);
    previous = estimate;
  }
});

test("single-row cells fill a slot in order and overflow to the next", { skip }, () => {
  const { SlotPacker } = packing();
  const packer = new SlotPacker(8);
  for (let index = 0; index < 8; index += 1) {
    assert.deepEqual(packer.place(1), { slot: 0, row: index });
  }
  assert.equal(packer.slotCount, 1);
  assert.deepEqual(packer.place(1), { slot: 1, row: 0 });
  assert.equal(packer.slotCount, 2);
});

test("best fit: a cell goes into the open slot with the smallest run that still fits", { skip }, () => {
  const { SlotPacker } = packing();
  const triples = new SlotPacker(8);
  assert.deepEqual(triples.place(3), { slot: 0, row: 0 });
  assert.deepEqual(triples.place(3), { slot: 0, row: 3 });
  assert.deepEqual(triples.place(3), { slot: 1, row: 0 });
  assert.equal(triples.slotCount, 2);

  const mixed = new SlotPacker(8);
  assert.deepEqual(mixed.place(5), { slot: 0, row: 0 });
  assert.deepEqual(mixed.place(4), { slot: 1, row: 0 });
  // Three free rows in slot 0, four in slot 1: the tighter fit wins.
  assert.deepEqual(mixed.place(3), { slot: 0, row: 5 });
  assert.deepEqual(mixed.place(4), { slot: 1, row: 4 });
  assert.equal(mixed.slotCount, 2);

  const full = new SlotPacker(8);
  full.place(1);
  assert.deepEqual(full.place(8), { slot: 1, row: 0 });
  assert.deepEqual(full.place(1), { slot: 0, row: 1 });
});

test("a cell never spans two slots, never overlaps another, and the packing stays within twice the ideal", { skip }, () => {
  const { SlotPacker } = packing();
  for (const rowsPerSlot of [8, 16, 64]) {
    const random = lcg(0x103 + rowsPerSlot);
    const packer = new SlotPacker(rowsPerSlot);
    const occupied = new Map();
    let totalRows = 0;
    for (let index = 0; index < 5000; index += 1) {
      const draw = random();
      const rows = draw < 0.77 ? 1 : draw < 0.9 ? 2 : draw < 0.98
        ? 1 + Math.floor(random() * rowsPerSlot)
        : rowsPerSlot;
      const { slot, row } = packer.place(rows);
      assert.ok(Number.isInteger(slot) && slot >= 0, `slot ${slot}`);
      assert.ok(Number.isInteger(row) && row >= 0, `row ${row}`);
      assert.ok(row + rows <= rowsPerSlot, `cell of ${rows} rows at row ${row} spans slot ${slot}`);
      assert.ok(slot < packer.slotCount, `slot ${slot} beyond slotCount ${packer.slotCount}`);
      for (let r = row; r < row + rows; r += 1) {
        const key = slot * rowsPerSlot + r;
        assert.ok(!occupied.has(key), `slot ${slot} row ${r} placed twice`);
        occupied.set(key, index);
      }
      totalRows += rows;
    }
    const ideal = Math.ceil(totalRows / rowsPerSlot);
    assert.ok(packer.slotCount <= 2 * ideal + 1, `${packer.slotCount} slots for an ideal of ${ideal}`);
  }
});

test("invalid cell sizes are refused", { skip }, () => {
  const { SlotPacker } = packing();
  const packer = new SlotPacker(8);
  assert.throws(() => packer.place(0));
  assert.throws(() => packer.place(9));
  assert.throws(() => packer.place(2.5));
  assert.throws(() => new SlotPacker(0));
});

test("the admission order is a deterministic permutation whose prefixes cover the grid evenly", { skip }, () => {
  const { admissionOrder } = packing();
  for (const [width, height] of [[512, 512], [300, 200], [1, 7]]) {
    const cellCount = width * height;
    const order = admissionOrder(cellCount);
    assert.equal(order.length, cellCount);
    const seen = new Uint8Array(cellCount);
    for (const cell of order) {
      assert.ok(cell < cellCount, `cell ${cell} outside the grid`);
      assert.equal(seen[cell], 0, `cell ${cell} visited twice`);
      seen[cell] = 1;
    }
    assert.deepEqual(admissionOrder(cellCount), order);
    if (cellCount < 64) continue;
    assert.notDeepEqual(admissionOrder(cellCount, 7), order);
    // Any prefix of one sixteenth of the grid lands in each of sixteen
    // equal blocks within a quarter of the even share.
    const prefix = Math.floor(cellCount / 16);
    const blocks = new Uint32Array(16);
    for (let index = 0; index < prefix; index += 1) {
      const cell = order[index];
      const x = cell % width;
      const y = (cell - x) / width;
      blocks[Math.min(3, Math.floor((y * 4) / height)) * 4 + Math.min(3, Math.floor((x * 4) / width))] += 1;
    }
    const share = prefix / 16;
    for (let block = 0; block < 16; block += 1) {
      assert.ok(
        Math.abs(blocks[block] - share) <= share * 0.25,
        `${width}x${height}: block ${block} got ${blocks[block]} of an even ${share}`,
      );
    }
  }
});
// AUTOMETTA-CONTRACT-END
