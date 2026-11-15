const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/162-cyclic-and-gray-scott-opening-defaults.md
const skip = process.env.OPENING_DEFAULTS !== "1" && "set OPENING_DEFAULTS=1";
const presetsModule = () => require("../../.test-build/app/presets.js");
const KERNEL_MODULES = {
  "abelian-sandpile": () => require("../../.test-build/sims/abelian-sandpile/kernel.js"),
  "belousov-zhabotinsky": () => require("../../.test-build/sims/belousov-zhabotinsky/kernel.js"),
  "boids": () => require("../../.test-build/sims/boids/kernel.js"),
  "brians-brain": () => require("../../.test-build/sims/brians-brain/kernel.js"),
  "burning-ship": () => require("../../.test-build/sims/burning-ship/kernel.js"),
  "clifford-dejong": () => require("../../.test-build/sims/clifford-dejong/kernel.js"),
  "cyclic-ca": () => require("../../.test-build/sims/cyclic-ca/kernel.js"),
  "diffusion-limited-aggregation": () => require("../../.test-build/sims/diffusion-limited-aggregation/kernel.js"),
  "elementary-cellular-automata": () => require("../../.test-build/sims/elementary-cellular-automata/kernel.js"),
  "game-of-life": () => require("../../.test-build/sims/game-of-life/kernel.js"),
  "gray-scott": () => require("../../.test-build/sims/gray-scott/kernel.js"),
  "ising-model": () => require("../../.test-build/sims/ising-model/kernel.js"),
  "julia-set": () => require("../../.test-build/sims/julia-set/kernel.js"),
  "kuramoto-oscillators": () => require("../../.test-build/sims/kuramoto-oscillators/kernel.js"),
  "lenia": () => require("../../.test-build/sims/lenia/kernel.js"),
  "logistic-mandelbrot": () => require("../../.test-build/sims/logistic-mandelbrot/kernel.js"),
  "lorenz-attractor": () => require("../../.test-build/sims/lorenz-attractor/kernel.js"),
  "mandelbrot": () => require("../../.test-build/sims/mandelbrot/kernel.js"),
  "markus-lyapunov": () => require("../../.test-build/sims/markus-lyapunov/kernel.js"),
  "particle-life": () => require("../../.test-build/sims/particle-life/kernel.js"),
  "physarum": () => require("../../.test-build/sims/physarum/kernel.js"),
  "swarmalators": () => require("../../.test-build/sims/swarmalators/kernel.js"),
};
const kernelFor = (slug) => {
  const module = KERNEL_MODULES[slug]();
  const Kernel = Object.values(module).find((value) => typeof value === "function" && /Kernel$/.test(value.name));
  return new Kernel();
};
const schemaDefaults = (slug) => Object.fromEntries(kernelFor(slug).paramSchema.map((d) => [d.key, d.default]));
const sha256 = (relativePath) => createHash("sha256").update(readFileSync(join(ROOT, relativePath))).digest("hex");

// Base outputs captured from dev at c3a932b5f: every kernel's schema defaults
// and every gallery thumbnail digest.
const BASE_FIXTURE = "src/app/openingDefaults.base.json";
const BASE_FIXTURE_SHA = "38ad35f7882c76a42633253c8dce4eb8c23fec9b0f938e227ebc816c47a2d512";
const base = () => JSON.parse(readFileSync(join(ROOT, BASE_FIXTURE), "utf8"));

const CYCLIC_DEFAULTS = { states: 23, threshold: 1, neighbourhood: "moore", stepsPerFrame: 1 };
const GRAY_SCOTT_DEFAULTS = { Du: 0.2097, Dv: 0.105, F: 0.018, k: 0.0487, stencil: "nine-point", dt: 1, stepsPerFrame: 3 };
const CHANGED = { "cyclic-ca": CYCLIC_DEFAULTS, "gray-scott": GRAY_SCOTT_DEFAULTS };
const CYCLIC_PRESETS = [
  { id: "demons", label: "Demons", params: { states: 14, threshold: 1, neighbourhood: "moore" } },
  { id: "turbulence", label: "Turbulence", params: { states: 8, threshold: 2, neighbourhood: "moore" } },
  { id: "crystal-lattice", label: "Crystal lattice", params: { states: 12, threshold: 1, neighbourhood: "vonNeumann" } },
  { id: "square-scrolls", label: "Square scrolls", params: { states: 23, threshold: 1, neighbourhood: "moore" } },
];
const GS = { Du: 0.2097, Dv: 0.105 };
const GRAY_SCOTT_PRESETS = [
  { id: "mitosis", label: "Mitosis", params: { ...GS, F: 0.0367, k: 0.0649, stepsPerFrame: 20 } },
  { id: "coral", label: "Coral", params: { ...GS, F: 0.0545, k: 0.062, stepsPerFrame: 20 } },
  { id: "worms", label: "Worms", params: { ...GS, F: 0.054, k: 0.063, stepsPerFrame: 20 } },
  { id: "maze", label: "Maze", params: { ...GS, F: 0.029, k: 0.057, stepsPerFrame: 20 } },
  { id: "spots", label: "Spots", params: { ...GS, F: 0.026, k: 0.0597, stepsPerFrame: 20 } },
  { id: "waves", label: "Waves", params: { ...GS, F: 0.018, k: 0.0487, stepsPerFrame: 20 } },
];

const run = (slug, params, steps) => {
  const kernel = kernelFor(slug);
  kernel.init(48, 32, params);
  for (let i = 0; i < steps; i += 1) kernel.step(1);
  return Array.from(kernel.readState());
};

test("the schema defaults: Cyclic CA reads Square scrolls' values, Gray-Scott reads three steps per frame, every other kernel is unchanged", { skip }, () => {
  assert.equal(sha256(BASE_FIXTURE), BASE_FIXTURE_SHA, "base fixture edited");
  const fixture = base();
  assert.equal(Object.keys(fixture.defaults).length, 22);
  for (const [slug, expected] of Object.entries(fixture.defaults)) {
    assert.deepEqual(schemaDefaults(slug), CHANGED[slug] ?? expected, slug);
  }
});

test("a kernel initialised with no params runs exactly as one given the new defaults, and not as one given the old", { skip }, () => {
  const fixture = base();
  for (const [slug, defaults] of Object.entries(CHANGED)) {
    const implicit = run(slug, {}, 6);
    assert.ok(implicit.length > 0 && implicit.some((v) => v !== 0), `${slug} produced an empty field`);
    assert.deepEqual(implicit, run(slug, defaults, 6), `${slug}: init({}) differs from the new defaults`);
    assert.notDeepEqual(implicit, run(slug, fixture.defaults[slug], 6), `${slug}: init({}) still runs the old defaults`);
  }
  assert.equal(require("../../.test-build/sims/gray-scott/model.js").readGrayScottConfig({}).stepsPerFrame, 3);
});

test("the Cyclic CA and Gray-Scott preset lists are unchanged", { skip }, () => {
  const { presetsFor } = presetsModule();
  assert.deepEqual(presetsFor("cyclic-ca"), CYCLIC_PRESETS);
  assert.deepEqual(presetsFor("gray-scott"), GRAY_SCOTT_PRESETS);
});

test("only the Cyclic CA and Gray-Scott thumbnails may change, and the Cyclic CA one does", { skip }, () => {
  const fixture = base();
  assert.deepEqual(readdirSync(join(ROOT, "public/thumbnails")).sort(), Object.keys(fixture.thumbnails));
  for (const [file, digest] of Object.entries(fixture.thumbnails)) {
    if (file === "cyclic-ca.png" || file === "gray-scott.png") continue;
    assert.equal(sha256(`public/thumbnails/${file}`), digest, file);
  }
  assert.notEqual(sha256("public/thumbnails/cyclic-ca.png"), fixture.thumbnails["cyclic-ca.png"], "cyclic-ca thumbnail not regenerated");
  for (const file of ["cyclic-ca.png", "gray-scott.png"]) {
    const png = readFileSync(join(ROOT, "public/thumbnails", file));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", file);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [640, 400], file);
  }
});
// AUTOMETTA-CONTRACT-END
