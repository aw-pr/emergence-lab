const assert = require("node:assert/strict");
const test = require("node:test");

const { BoidsKernel } = require("../../../.test-build/sims/boids/kernel.js");

const PARAMS = { boidCount: 600, initialFlocks: 3, visualRadius: 10, seed: 7 };

function kernelAt(steps, params = PARAMS) {
  const kernel = new BoidsKernel();
  kernel.init(240, 160, params);
  for (let step = 0; step < steps; step += 1) kernel.step(1 / 60);
  return kernel;
}

test("exportBoids interleaves x, y, vx, vy for every boid", () => {
  const kernel = kernelAt(5);
  const boids = kernel.exportBoids();
  assert.equal(boids.length, 600 * 4);
  assert.equal(boids[0], kernel.x[0]);
  assert.equal(boids[1], kernel.y[0]);
  assert.equal(boids[2], kernel.vx[0]);
  assert.equal(boids[3], kernel.vy[0]);
  assert.equal(boids[599 * 4 + 3], kernel.vy[599]);
});

test("a flock handed out and straight back steps exactly as one never handed over", () => {
  const handed = kernelAt(20);
  const kept = kernelAt(20);
  assert.equal(handed.importBoids(handed.exportBoids()), true);
  for (let step = 0; step < 20; step += 1) {
    handed.step(1 / 60);
    kept.step(1 / 60);
  }
  assert.deepEqual(handed.exportBoids(), kept.exportBoids());
  assert.deepEqual(handed.readState(), kept.readState());
});

test("importBoids moves the flock and redraws it, and refuses a different count", () => {
  const kernel = kernelAt(0);
  const boids = new Float32Array(600 * 4);
  boids[0] = 12.5;
  boids[1] = 40.25;
  boids[2] = 30;
  assert.equal(kernel.importBoids(boids), true);
  assert.equal(kernel.x[0], 12.5);
  assert.equal(kernel.y[0], 40.25);
  const state = kernel.readState();
  assert.equal(state[(40 * 240 + 12) * 4], 1, "the moved boid is drawn in its new cell");
  const before = kernel.exportBoids();
  assert.equal(kernel.importBoids(new Float32Array(4)), false);
  assert.deepEqual(kernel.exportBoids(), before);
});

test("a flock handed back onto a dropped boulder is pushed out of it", () => {
  const kernel = kernelAt(0);
  assert.equal(kernel.hasObstacles(), false);
  assert.equal(kernel.placeCustomRock(120, 80), true);
  assert.equal(kernel.hasObstacles(), true);
  const boids = kernel.exportBoids();
  boids[0] = 120;
  boids[1] = 80;
  kernel.importBoids(boids);
  assert.ok(Math.hypot(kernel.x[0] - 120, kernel.y[0] - 80) > 1, "boid left the boulder's centre");
  assert.equal(kernel.clearCustomObstacles(), true);
  assert.equal(kernel.hasObstacles(), false);
});

test("steeringConfig reports the latched, clamped values and the kernel's constants", () => {
  const kernel = new BoidsKernel();
  kernel.init(240, 160, { ...PARAMS, visualRadius: 99, maxSpeed: 12 });
  const config = kernel.steeringConfig();
  assert.equal(config.width, 240);
  assert.equal(config.height, 160);
  assert.equal(config.boidCount, 600);
  assert.equal(config.visualRadius, 64);
  assert.equal(config.maxSpeed, 12);
  assert.equal(config.seed, 7);
  assert.equal(config.step, 0);
  assert.equal(config.neighbourCandidates, 72);
  assert.equal(config.minSpeedFraction, 0.7);
  assert.equal(config.wanderStrength, 0.05);
  assert.equal(config.binningMinBoids, 256);
  kernel.step(1 / 60);
  assert.equal(kernel.steeringConfig().step, 1);
});
