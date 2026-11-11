const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/163-sandpile-opens-on-mandala.md
const skip = process.env.SANDPILE_OPENING !== "1" && "set SANDPILE_OPENING=1";
const presetsModule = () => require("../../.test-build/app/presets.js");
const qualityModule = () => require("../../.test-build/app/qualityProfiles.js");
const colormap = () => require("../../.test-build/app/colormap.js");
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

// Base outputs captured from dev at 92060d523: every kernel's schema defaults,
// every slug's quality profile per device tier and render mode, and every
// gallery thumbnail digest.
const BASE_FIXTURE = "src/app/sandpileOpening.base.json";
const BASE_FIXTURE_SHA = "d48fff7f7a8d471ba424646ae08228cb08a3f0af158c893c9b7939738848c8a8";
const base = () => JSON.parse(readFileSync(join(ROOT, BASE_FIXTURE), "utf8"));
const SLUG = "abelian-sandpile";
const THUMBNAIL = "abelian-sandpile.png";

const MANDALA_PARAMS = { initialPile: 262144, toppleThreshold: 4, grainsPerStep: 0, topplesPerStep: 500000 };
const SANDPILE_PRESETS = [
  { id: "classic-critical", label: "Classic critical", params: { initialPile: 100000, toppleThreshold: 4, grainsPerStep: 1, topplesPerStep: 50000 } },
  { id: "fast-avalanches", label: "Fast avalanches", params: { initialPile: 250000, toppleThreshold: 4, grainsPerStep: 16, topplesPerStep: 150000 } },
  { id: "high-threshold", label: "High threshold", params: { initialPile: 350000, toppleThreshold: 8, grainsPerStep: 8, topplesPerStep: 120000 } },
  { id: "sandstorm", label: "Sandstorm", params: { initialPile: 15650000, toppleThreshold: 12, grainsPerStep: 1000, topplesPerStep: 2000000 } },
  { id: "mandala", label: "Mandala", params: MANDALA_PARAMS },
];

const run = (params, steps) => {
  const kernel = kernelFor(SLUG);
  kernel.init(96, 64, params);
  for (let i = 0; i < steps; i += 1) kernel.step(1);
  return Array.from(kernel.readState());
};

test("the sandpile's schema defaults are Mandala's values; every other kernel's defaults are unchanged", { skip }, () => {
  assert.equal(sha256(BASE_FIXTURE), BASE_FIXTURE_SHA, "base fixture edited");
  const fixture = base();
  assert.equal(Object.keys(fixture.defaults).length, 22);
  for (const [slug, expected] of Object.entries(fixture.defaults)) {
    assert.deepEqual(schemaDefaults(slug), slug === SLUG ? MANDALA_PARAMS : expected, slug);
  }
});

test("a sandpile initialised with no params runs exactly as Mandala, and not as the old defaults", { skip }, () => {
  const implicit = run({}, 4);
  assert.ok(implicit.some((v) => v !== 0), "empty field");
  assert.deepEqual(implicit, run(MANDALA_PARAMS, 4), "init({}) differs from Mandala");
  assert.notDeepEqual(implicit, run(base().defaults[SLUG], 4), "init({}) still runs the old defaults");
});

test("the sandpile preset list is unchanged", { skip }, () => {
  assert.deepEqual(presetsModule().presetsFor(SLUG), SANDPILE_PRESETS);
});

test("the sandpile opens on the Balanced grid on every device tier; every other quality profile is unchanged", { skip }, () => {
  const { qualityProfileFor } = qualityModule();
  const fixture = base();
  assert.equal(Object.keys(fixture.quality).length, 22);
  for (const [slug, profiles] of Object.entries(fixture.quality)) {
    for (const [key, expected] of Object.entries(profiles)) {
      const [tier, mode] = key.split("/");
      const actual = qualityProfileFor(slug, mode, tier);
      if (slug === SLUG) {
        assert.equal(actual.defaultPreset, "balanced", `${slug} ${key}`);
        assert.deepEqual({ ...actual, defaultPreset: expected.defaultPreset }, expected, `${slug} ${key} beyond the preset`);
      } else {
        assert.deepEqual(actual, expected, `${slug} ${key}`);
      }
    }
  }
});

test("the legend lists Avalanche activity only when the sandpile's glow is on; composite and one-channel legends list every channel", { skip }, () => {
  const { legendChannelsFor } = colormap();
  assert.equal(typeof legendChannelsFor, "function");
  assert.deepEqual(legendChannelsFor("height", 2, { avalancheGlow: false }), [0]);
  assert.deepEqual(legendChannelsFor("height", 2, { avalancheGlow: true }), [0, 1]);
  assert.deepEqual(legendChannelsFor("composite", 2, { avalancheGlow: false }), [0, 1]);
  assert.deepEqual(legendChannelsFor("composite", 2, { avalancheGlow: true }), [0, 1]);
  assert.deepEqual(legendChannelsFor("composite", 1, { avalancheGlow: false }), [0]);
  assert.deepEqual(legendChannelsFor("composite", 3, { avalancheGlow: false }), [0, 1, 2]);
});

test("only the sandpile thumbnail is regenerated", { skip }, () => {
  const fixture = base();
  assert.deepEqual(readdirSync(join(ROOT, "public/thumbnails")).sort(), Object.keys(fixture.thumbnails));
  for (const [file, digest] of Object.entries(fixture.thumbnails)) {
    if (file === THUMBNAIL) continue;
    assert.equal(sha256(`public/thumbnails/${file}`), digest, file);
  }
  assert.notEqual(sha256(`public/thumbnails/${THUMBNAIL}`), fixture.thumbnails[THUMBNAIL], "sandpile thumbnail not regenerated");
  const png = readFileSync(join(ROOT, "public/thumbnails", THUMBNAIL));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [640, 400]);
});
// AUTOMETTA-CONTRACT-END
