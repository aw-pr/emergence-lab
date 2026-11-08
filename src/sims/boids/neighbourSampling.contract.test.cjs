const assert = require("node:assert/strict");
const test = require("node:test");
const { resolve } = require("node:path");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/153-boids-unbiased-neighbours.md
const skip = process.env.BOIDS_153 !== "1" && "set BOIDS_153=1";
const KERNEL_PATH = process.env.BOIDS_153_KERNEL
  ? resolve(process.env.BOIDS_153_KERNEL)
  : resolve(__dirname, "../../../.test-build/sims/boids/kernel.js");
const { BoidsKernel } = skip ? {} : require(KERNEL_PATH);

const SCHEMA = [["obstacleLayout","enum","reef",null,null,null],["obstacleAmount","number",0.5,0.1,1,0.05],["boidCount","number",17777,1,28000,1],["initialFlocks","number",6,0,12,1],["visualRadius","number",25,1,64,1],["separationRadius","number",8,1,32,1],["maxSpeed","number",36,0.25,40,0.05],["alignment","number",0.09,0,0.25,0.001],["cohesion","number",0.011,0,0.05,0.001],["separation","number",0.22,0,1,0.001],["pointSize","number",4,4,16,1]];
const DEFAULTS = { obstacleLayout: "none", boidCount: 17777, initialFlocks: 6, visualRadius: 25, separationRadius: 8, maxSpeed: 36, alignment: 0.09, cohesion: 0.011, separation: 0.22 };

function run(width, height, params, steps) {
  const kernel = new BoidsKernel();
  kernel.init(width, height, { ...DEFAULTS, ...params });
  for (let step = 0; step < steps; step += 1) kernel.step(1);
  return kernel;
}

function meanUnit(kernel, count, first = 0, stride = 1) {
  let x = 0;
  let y = 0;
  let boids = 0;
  for (let i = first; i < count; i += stride) {
    const speed = Math.hypot(kernel.vx[i], kernel.vy[i]);
    assert.ok(Number.isFinite(speed), "velocity is finite");
    if (speed > 0) {
      x += kernel.vx[i] / speed;
      y += kernel.vy[i] / speed;
    }
    boids += 1;
  }
  assert.ok(boids > 0, "measured at least one boid");
  return { x: x / boids, y: y / boids };
}

test("153 c1: one step on a still, even crowd has no preferred compass direction", { skip }, () => {
  const count = 6000;
  const kernel = new BoidsKernel();
  kernel.init(200, 200, { ...DEFAULTS, boidCount: count, initialFlocks: 0 });
  kernel.vx.fill(0);
  kernel.vy.fill(0);
  kernel.step(1);
  let sumX = 0;
  let sumY = 0;
  let sumSpeed = 0;
  for (let i = 0; i < count; i += 1) {
    sumX += kernel.vx[i];
    sumY += kernel.vy[i];
    sumSpeed += Math.hypot(kernel.vx[i], kernel.vy[i]);
  }
  assert.ok(sumSpeed > 0, "boids responded");
  const drift = Math.hypot(sumX, sumY) / sumSpeed;
  assert.ok(drift <= 0.1, `net drift ${drift.toFixed(3)} exceeds 0.1 of total speed`);
});

test("153 c2: the heading a crowd settles on varies with the seed", { skip }, () => {
  const count = 4445;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  let x = 0;
  let y = 0;
  for (const seed of seeds) {
    const unit = meanUnit(run(480, 300, { boidCount: count, initialFlocks: 0, seed }, 300), count);
    x += unit.x;
    y += unit.y;
  }
  const shared = Math.hypot(x, y) / seeds.length;
  assert.ok(shared <= 0.7, `seeds share a heading: resultant ${shared.toFixed(3)} exceeds 0.7`);
});

test("153 c3: flocks stay fast at the default population", { skip }, () => {
  const count = DEFAULTS.boidCount;
  const kernel = run(960, 600, {}, 300);
  let total = 0;
  for (let i = 0; i < count; i += 1) total += Math.hypot(kernel.vx[i], kernel.vy[i]);
  const mean = total / count;
  assert.ok(mean >= 21.6, `mean speed ${mean.toFixed(1)} at 300 steps is under 60% of maxSpeed 36`);
  assert.ok(mean <= 36.001, `mean speed ${mean.toFixed(1)} exceeds maxSpeed`);
});

test("153 c4: at least four of six starting flocks stay coherent with distinct headings at 100 steps", { skip }, () => {
  const count = DEFAULTS.boidCount;
  const flocks = DEFAULTS.initialFlocks;
  for (const seed of [0, 1]) {
    const kernel = run(960, 600, { seed }, 100);
    const units = [];
    for (let flock = 0; flock < flocks; flock += 1) {
      const unit = meanUnit(kernel, count, flock, flocks);
      const coherence = Math.hypot(unit.x, unit.y);
      if (coherence >= 0.4) units.push({ x: unit.x / coherence, y: unit.y / coherence });
    }
    assert.ok(units.length >= 4, `seed ${seed}: only ${units.length} of ${flocks} flocks are still coherent at 100 steps`);
    const shared = Math.hypot(units.reduce((sum, u) => sum + u.x, 0), units.reduce((sum, u) => sum + u.y, 0)) / units.length;
    assert.ok(shared <= 0.75, `seed ${seed} flocks share a heading: resultant ${shared.toFixed(3)} exceeds 0.75`);
  }
});

test("153 c5: a run stays reproducible from its seed and differs between seeds", { skip }, () => {
  const a = run(320, 200, { boidCount: 3000, seed: 5 }, 60).readState().slice();
  const b = run(320, 200, { boidCount: 3000, seed: 5 }, 60).readState().slice();
  const c = run(320, 200, { boidCount: 3000, seed: 6 }, 60).readState().slice();
  assert.ok(a.length > 0, "state is not empty");
  assert.ok(a.some((value) => value !== 0), "state is populated");
  assert.deepEqual(Buffer.from(a.buffer), Buffer.from(b.buffer), "same seed gives the same state");
  assert.notDeepEqual(Buffer.from(a.buffer), Buffer.from(c.buffer), "different seeds differ");
});

test("153 c6: parameter schema and channel count are unchanged", { skip }, () => {
  const kernel = new BoidsKernel();
  assert.deepEqual(kernel.paramSchema.map((d) => [d.key, d.type, d.default, d.min ?? null, d.max ?? null, d.step ?? null]), SCHEMA);
  assert.equal(kernel.channelCount, 4);
});
// AUTOMETTA-CONTRACT-END
