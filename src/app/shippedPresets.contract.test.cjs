const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { readFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/151-promote-144-trials.md
const skip = process.env.SHIPPED_PRESETS !== "1" && "set SHIPPED_PRESETS=1";
const presetsModule = () => require("../../.test-build/app/presets.js");
const particleLifeModule = () => require("../../.test-build/sims/particle-life/kernel.js");
const sha256 = (relativePath) => createHash("sha256").update(readFileSync(join(ROOT, relativePath))).digest("hex");
const text = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

const PHYSARUM_INCUMBENTS = [
  { id: "veins", label: "Veins", params: { agentCount: 32000, sensorAngle: 22.5, sensorDistance: 9, turnSpeed: 22.5, moveSpeed: 1, depositAmount: 0.24, evaporation: 0.9, stepsPerFrame: 1 } },
  { id: "coral-fans", label: "Coral fans", params: { agentCount: 26000, sensorAngle: 15, sensorDistance: 17, turnSpeed: 14, moveSpeed: 1.35, depositAmount: 0.2, evaporation: 0.94, stepsPerFrame: 1 } },
  { id: "filigree-web", label: "Filigree web", params: { agentCount: 60000, sensorAngle: 38, sensorDistance: 5, turnSpeed: 34, moveSpeed: 0.8, depositAmount: 0.12, evaporation: 0.96, stepsPerFrame: 1 } },
  { id: "root-mat", label: "Root mat", params: { agentCount: 31500, sensorAngle: 60, sensorDistance: 5, turnSpeed: 12, moveSpeed: 1, depositAmount: 0.22, evaporation: 0.9, stepsPerFrame: 1 } },
];
const RESTLESS_THREADS = {
  id: "restless-threads",
  label: "Restless threads",
  params: { agentCount: 32000, sensorAngle: 30, sensorDistance: 3, turnSpeed: 22.5, moveSpeed: 2.5, depositAmount: 0.06, evaporation: 0.975, stepsPerFrame: 1 },
};
const PARTICLE_LIFE_PRESETS = [
  { id: "cells", label: "Cells", params: { particleCount: 6000, species: 5, rmax: 40, rmin: 12, forceScale: 45, friction: 0.7, matrixBias: 0.08 } },
  { id: "chasers", label: "Chasers", params: { particleCount: 5000, species: 6, rmax: 48, rmin: 14, forceScale: 85, friction: 0.2, matrixBias: 0 } },
  { id: "gas-clouds", label: "Gas clouds", params: { particleCount: 12000, species: 4, rmax: 30, rmin: 8, forceScale: 22, friction: 0.45, matrixBias: -0.05 } },
];
const PARTICLE_LIFE_DEFAULTS = { particleCount: 6000, species: 8, rmax: 24, rmin: 12, forceScale: 140, friction: 0.97, matrixBias: 0.35, pointSize: 3 };
const PARTICLE_LIFE_RANGES = {
  particleCount: { min: 100, max: 20000, step: 1 },
  species: { min: 2, max: 8, step: 1 },
  rmax: { min: 10, max: 120, step: 1 },
  rmin: { min: 2, max: 60, step: 1 },
  forceScale: { min: 1, max: 160, step: 1 },
  friction: { min: 0, max: 0.99, step: 0.01 },
  matrixBias: { min: -0.5, max: 0.5, step: 0.01 },
  pointSize: { min: 2, max: 16, step: 1 },
};
const BASE_PARTICLE_LIFE_THUMBNAIL = "7d5ea6c6e2e6459619c9e6b8d5ac18a19bcf8d295ab36134f85c229c9a44bd5b";
const UNCHANGED_THUMBNAILS = {
  "abelian-sandpile.png": "cc697d9d8cebf0a04f2b4d30693e565ab02a1e4ca4edf24390cd5b02acac67cc",
  "belousov-zhabotinsky.png": "72ee5160cf55e88d3ac647f53a629cd236603182961be8c1e7cff473aee55bb8",
  "boids.png": "f41636f53eacdf79629496dc29e94b118a7dc612068b71f337d7068a5f4552a2",
  "brians-brain.png": "731806f656c8cfd0055ebec6ceb441519dc36b5d8f91454674b30ffbe480b296",
  "burning-ship.png": "1afd0d07be39fa05e82ac84e9d0a4c0c86b3494c7b4faab08f243c0c1faf016a",
  "clifford-dejong__clifford.png": "b72c402c4f7a68707239f9016c3214786302860b209f79e00f4e7cb29fd67a7b",
  "clifford-dejong__dejong.png": "587f87fa36410bb5855a4e08675c24b9ac314155239c76f001aab27111a580a0",
  "clifford-dejong__svensson.png": "727193e8c3d2fe699c0783c0ac0b892948459609e357904915c4163073f5503a",
  "cyclic-ca.png": "46a715586dfe3bad1a635ae216ebdde1f1815afb10e160a731696877bd663415",
  "diffusion-limited-aggregation.png": "b122c5b04522035ef23e613341a6a85580f123347626c19f114e35510a430e92",
  "elementary-cellular-automata.png": "55c3f34686b810cbd626b7bdf7be61f3ef10d22b64f18ace5dfce0e7e272e79d",
  "game-of-life.png": "e56b26ab33989c321ed7ab590d74d17c92ce77de53e48547c7fe99fcf7425d89",
  "gray-scott.png": "d3d21cab06bf3d874e5cd19cd20d6c0da2170adc488bfbaea524a0402706333f",
  "ising-model.png": "66ea592b8a17ff35b7b660bedf4f1649ee5a6bcb8bf31929df08bbae2b0e6d5e",
  "julia-set.png": "2e58e28bb16301c1c939070c42fd1af491bc76de67d79e317f678070e08bff35",
  "kuramoto-oscillators.png": "339b13ee7b93d3b1d72926f2a7402a1fb2bd8fa00b76b1be4e0afa21cc1a9c2a",
  "lenia.png": "ba16d3d7c35401b1e9c2caf3c255ec5584baeef5d4b83adb3b7f9f44daaf179b",
  "logistic-mandelbrot.png": "4c636ef95c6d7e9129e34c0d6c3f76500f3ef8159e7de5ad5b19dbca67af73ef",
  "lorenz-attractor__aizawa.png": "d949ac5b29c79b42d6e7b6b12e201a31f2a7de1e24204834a896a04022d248e0",
  "lorenz-attractor__halvorsen.png": "e17a06c1ebda38a1242f19ff736f7b89eccf08dd1670162c15488dae677c2e85",
  "lorenz-attractor__lorenz.png": "b54cbc1211462d89754c0c288331b0e48e36cc8d60d6154d7b91ba9156fde3e3",
  "lorenz-attractor__rossler.png": "a569c25df744b822e118e1801ba10e034d734fad8a48379efc48e3d4eee87f21",
  "lorenz-attractor__thomas.png": "218bf5ef1b20ec2b484bbd6c3d288fbc7c4adc2ee45e09a8ad0a2011d6ccfad2",
  "mandelbrot.png": "d10d21d9bd4420bb3ee96aa1b2fbdd9e9b13a7c5b8e33ed8673c88f997f23d1a",
  "physarum.png": "9098919cc04310ac7472d67850fba4b4802e7dc5f065878fc0050b84aa68bc57",
};

test("physarum ships five presets: the four incumbents unchanged, then Restless threads", { skip }, () => {
  const { presetsFor } = presetsModule();
  const physarum = presetsFor("physarum");
  assert.equal(physarum.length, 5);
  assert.deepEqual(physarum.slice(0, 4), PHYSARUM_INCUMBENTS);
  assert.deepEqual(physarum[4], RESTLESS_THREADS);
  assert.equal(Object.hasOwn(physarum[4].params, "seed"), false);
});

test("the Restless threads values sit inside the physarum descriptor ranges", { skip }, () => {
  const { PhysarumKernel } = require("../../.test-build/sims/physarum/kernel.js");
  const schema = new PhysarumKernel().paramSchema;
  assert.deepEqual(Object.keys(RESTLESS_THREADS.params).sort(), schema.map((d) => d.key).sort());
  for (const descriptor of schema) {
    const value = RESTLESS_THREADS.params[descriptor.key];
    assert.equal(typeof value, "number", descriptor.key);
    assert.ok(descriptor.min <= value && value <= descriptor.max, `${descriptor.key}=${value} outside ${descriptor.min}..${descriptor.max}`);
  }
});

test("the particle-life kernel default is the Eight-species attraction row; ranges and point size unchanged", { skip }, () => {
  const { ParticleLifeKernel } = particleLifeModule();
  const schema = new ParticleLifeKernel().paramSchema;
  assert.deepEqual(schema.map((d) => d.key), Object.keys(PARTICLE_LIFE_DEFAULTS));
  for (const descriptor of schema) {
    assert.equal(descriptor.default, PARTICLE_LIFE_DEFAULTS[descriptor.key], `${descriptor.key} default`);
    assert.deepEqual({ min: descriptor.min, max: descriptor.max, step: descriptor.step }, PARTICLE_LIFE_RANGES[descriptor.key], `${descriptor.key} range`);
  }
});

test("a particle-life kernel given no params runs exactly as one given the new defaults", { skip }, () => {
  const { ParticleLifeKernel } = particleLifeModule();
  const run = (params) => {
    const kernel = new ParticleLifeKernel();
    kernel.init(24, 16, params);
    for (let i = 0; i < 5; i += 1) kernel.step(0.1);
    const state = Array.from(kernel.readState());
    kernel.destroy();
    return state;
  };
  const withDefaults = run({ ...PARTICLE_LIFE_DEFAULTS });
  assert.ok(withDefaults.some((value) => value !== 0));
  assert.deepEqual(run({}), withDefaults);
});

test("the three particle-life presets are byte-for-byte unchanged", { skip }, () => {
  const { presetsFor } = presetsModule();
  assert.deepEqual(presetsFor("particle-life"), PARTICLE_LIFE_PRESETS);
});

test("the particle-life gallery thumbnail was regenerated and no other thumbnail changed", { skip }, () => {
  const png = readFileSync(join(ROOT, "public/thumbnails/particle-life.png"));
  assert.ok(png.length > 1000);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.notEqual(sha256("public/thumbnails/particle-life.png"), BASE_PARTICLE_LIFE_THUMBNAIL);
  for (const [name, hash] of Object.entries(UNCHANGED_THUMBNAILS)) {
    assert.equal(sha256(`public/thumbnails/${name}`), hash, name);
  }
  assert.equal(Object.keys(UNCHANGED_THUMBNAILS).length, 25);
});

test("both sweep reports carry the dated 2026-11-03 appendix", { skip }, () => {
  const physarum = text("docs/sweeps/physarum-interestingness.md");
  assert.match(physarum, /^## Promotion appendix — 2026-11-03/m);
  assert.match(physarum, /Restless threads/);
  assert.match(physarum, /uat-preset-review\.md/);
  const particleLife = text("docs/sweeps/particle-life-interestingness.md");
  assert.match(particleLife, /^## Default appendix — 2026-11-03/m);
  assert.match(particleLife, /friction0\.97_species8_forceScale140_matrixBias0\.35/);
  assert.match(particleLife, /uat-preset-review\.md/);
  assert.ok(existsSync(join(ROOT, "docs/UAT/uat-preset-review.md")));
});
// AUTOMETTA-CONTRACT-END
