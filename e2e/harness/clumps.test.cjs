const assert = require("node:assert/strict");
const test = require("node:test");

// Plain TypeScript with one sibling import: required directly under type
// stripping, so the unit tests read exactly the source the sweep imports.
const { clumpRegime, clumpScore } = require("./clumps.ts");

const OPTIONS = { blurRadius: 6, threshold: 0.25, minMassFraction: 0.03 };
const W = 64;
const H = 64;

function blobField(blobs, sigma = 4, width = W, height = H) {
  const n = width * height;
  const density = new Float32Array(n);
  const speed = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = y * width + x;
    let best = 0;
    let chosen = null;
    for (const b of blobs) {
      const dx = Math.min(Math.abs(x - b.x), width - Math.abs(x - b.x));
      const dy = Math.min(Math.abs(y - b.y), height - Math.abs(y - b.y));
      const d = (b.weight ?? 1) * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      density[i] += d;
      if (d > best) { best = d; chosen = b; }
    }
    if (density[i] > 1e-3 && chosen) { vx[i] = chosen.vx; vy[i] = chosen.vy; speed[i] = Math.hypot(chosen.vx, chosen.vy); } else density[i] = 0;
  }
  return { width, height, density, speed, vx, vy };
}

const uniform = (vxValue, vyValue) => ({
  width: W, height: H,
  density: new Float32Array(W * H).fill(1), speed: new Float32Array(W * H).fill(Math.hypot(vxValue, vyValue)),
  vx: new Float32Array(W * H).fill(vxValue), vy: new Float32Array(W * H).fill(vyValue),
});

test("a uniform field is one clump with no heading spread", () => {
  const r = clumpRegime(uniform(1, 0), OPTIONS);
  assert.equal(r.clumps, 1);
  assert.ok(Math.abs(r.headingSpread) < 1e-9);
  assert.ok(Math.abs(r.meanSpeed - 1) < 1e-9);
});

test("opposed blobs count as two clumps with near-full spread", () => {
  const r = clumpRegime(blobField([{ x: 16, y: 32, vx: 1, vy: 0 }, { x: 48, y: 32, vx: -1, vy: 0 }]), OPTIONS);
  assert.equal(r.clumps, 2);
  assert.ok(r.headingSpread > 0.99);
});

test("blobs at right angles spread by 1 - 1/sqrt(2) for equal mass", () => {
  const r = clumpRegime(blobField([{ x: 16, y: 32, vx: 1, vy: 0 }, { x: 48, y: 32, vx: 0, vy: 1 }]), OPTIONS);
  assert.equal(r.clumps, 2);
  assert.ok(Math.abs(r.headingSpread - (1 - Math.SQRT1_2)) < 1e-3, `spread ${r.headingSpread}`);
});

test("four co-moving blobs keep their count but no spread", () => {
  const r = clumpRegime(blobField([16, 48].flatMap(x => [16, 48].map(y => ({ x, y, vx: 0, vy: 2 })))), OPTIONS);
  assert.equal(r.clumps, 4);
  assert.ok(r.headingSpread < 0.05);
  assert.ok(Math.abs(r.meanSpeed - 2) < 1e-9);
});

test("a blob across the torus edge is a single clump", () => {
  assert.equal(clumpRegime(blobField([{ x: 0, y: 32, vx: 1, vy: 0 }]), OPTIONS).clumps, 1);
  assert.equal(clumpRegime(blobField([{ x: 0, y: 0, vx: 1, vy: 0 }]), OPTIONS).clumps, 1);
});

test("a component below the mass fraction is dropped", () => {
  const field = blobField([{ x: 16, y: 32, vx: 1, vy: 0 }, { x: 48, y: 32, vx: -1, vy: 0, weight: 0.3 }]);
  assert.equal(clumpRegime(field, { ...OPTIONS, minMassFraction: 0 }).clumps, 2);
  const cut = clumpRegime(field, { ...OPTIONS, minMassFraction: 0.3 });
  assert.equal(cut.clumps, 1);
  assert.equal(cut.masses.length, 1);
  assert.equal(cut.headings.length, 1);
  assert.ok(Math.abs(cut.headingSpread) < 1e-9);
});

test("a clump with zero velocity adds mass but no direction", () => {
  const r = clumpRegime(blobField([{ x: 16, y: 32, vx: 1, vy: 0 }, { x: 48, y: 32, vx: 0, vy: 0 }]), OPTIONS);
  assert.equal(r.clumps, 2);
  assert.ok(r.headingSpread > 0.4 && r.headingSpread < 0.6, `spread ${r.headingSpread}`);
  assert.ok(r.headings.includes(0));
});

test("an empty field reads zero, never NaN", () => {
  const z = () => new Float32Array(W * H);
  const r = clumpRegime({ width: W, height: H, density: z(), speed: z(), vx: z(), vy: z() }, OPTIONS);
  assert.deepEqual([r.clumps, r.headingSpread, r.meanSpeed], [0, 0, 0]);
});

test("the score is the worst sample's clump x spread x speed product", () => {
  assert.ok(Math.abs(clumpScore([{ clumps: 5, headingSpread: 0.8, meanSpeed: 32 }]) - 0.64) < 1e-9);
  assert.ok(Math.abs(clumpScore([{ clumps: 3, headingSpread: 0.5, meanSpeed: 20 }]) - 0.125) < 1e-9);
  assert.equal(clumpScore([{ clumps: 5, headingSpread: 0.8, meanSpeed: 32 }, { clumps: 1, headingSpread: 0.9, meanSpeed: 40 }]), 0);
  assert.equal(clumpScore([{ clumps: 9, headingSpread: 1, meanSpeed: 80 }]), 1);
});
