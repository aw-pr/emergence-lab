const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/161-sandpile-four-colour-palettes.md
const skip = process.env.SANDPILE_PALETTES !== "1" && "set SANDPILE_PALETTES=1";
const colormap = () => require("../../.test-build/app/colormap.js");
const presetsModule = () => require("../../.test-build/app/presets.js");
const savedPresets = () => require("../../.test-build/app/savedPresets.js");
const sandpileKernel = () => require("../../.test-build/sims/abelian-sandpile/kernel.js");
const grayScottKernel = () => require("../../.test-build/sims/gray-scott/kernel.js");
const sha256 = (relativePath) => createHash("sha256").update(readFileSync(join(ROOT, relativePath))).digest("hex");

// Base outputs captured from dev at f6e6024a5: palette labels, default colour
// options per sim, the composite (two-channel) and single-channel colours of
// every base palette, today's sandpile look, and every thumbnail digest.
const BASE_FIXTURE = "src/app/sandpilePalettes.base-colours.json";
const BASE_FIXTURE_SHA = "cffdd23fa83e7442f128ca597dff47b602baa51e5b3456880f38ed1b907b83a3";
const base = () => JSON.parse(readFileSync(join(ROOT, BASE_FIXTURE), "utf8"));
const KERNEL_FILE = "src/sims/abelian-sandpile/kernel.ts";
const KERNEL_SHA = "8a1d63deec0a5717c676df239aa160c5d3d57d9b87956eaf04da3180e0186537";
const THUMBNAIL = "abelian-sandpile.png";

const CLASSIC = [[6, 64, 251], [90, 180, 255], [252, 195, 1], [124, 0, 0]];
const SUNFLOWER = [[255, 255, 255], [140, 138, 46], [142, 79, 160], [254, 213, 1]];
const SANDPILE_DEFAULTS = {
  preset: "sandpile-classic", invert: false, gamma: 1, contrast: 1,
  paletteCycleReverse: false, steps: 0, avalancheGlow: false,
};
const INCUMBENTS = [
  { id: "classic-critical", label: "Classic critical", params: { initialPile: 100000, toppleThreshold: 4, grainsPerStep: 1, topplesPerStep: 50000 } },
  { id: "fast-avalanches", label: "Fast avalanches", params: { initialPile: 250000, toppleThreshold: 4, grainsPerStep: 16, topplesPerStep: 150000 } },
  { id: "high-threshold", label: "High threshold", params: { initialPile: 350000, toppleThreshold: 8, grainsPerStep: 8, topplesPerStep: 120000 } },
  { id: "sandstorm", label: "Sandstorm", params: { initialPile: 15650000, toppleThreshold: 12, grainsPerStep: 1000, topplesPerStep: 2000000 } },
];
const MANDALA = { id: "mandala", label: "Mandala", params: { initialPile: 262144, toppleThreshold: 4, grainsPerStep: 0, topplesPerStep: 500000 } };

const RANGES_2 = [[0, 1], [0, 1]];
const C0 = [0, 1 / 3, 2 / 3, 1];
const C1 = [0, 0.5, 1];
const T = [0, 0.25, 0.5, 0.75, 1];
const raw = (mapper, ...channels) => mapper(new Float32Array(channels), 0);
const rounded = (colour) => colour.map((v) => Math.round(v));
const assertClose = (actual, expected, label) => {
  assert.equal(actual.length, 3, label);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 1e-6, `${label}: got ${actual}, expected ${expected}`));
};
const heightMapper = (options) => colormap().buildMapper(2, RANGES_2, options, "height");

test("the palette list keeps every base palette, renames the amber one and adds the two sandpile palettes", { skip }, () => {
  const fixture = base();
  const labels = Object.fromEntries(colormap().COLOUR_PRESETS.map((p) => [p.value, p.label]));
  for (const [value, label] of Object.entries(fixture.labels)) {
    assert.equal(labels[value], value === "sand" ? "Amber sand" : label, value);
  }
  assert.equal(labels["sandpile-classic"], "Classic sandpile");
  assert.equal(labels["sandpile-sunflower"], "Sunflower sandpile");
  assert.equal(Object.keys(labels).length, Object.keys(fixture.labels).length + 2);
});

test("the sandpile opens on Classic with the glow off; every other sim's default colour options are unchanged", { skip }, () => {
  assert.equal(sha256(BASE_FIXTURE), BASE_FIXTURE_SHA, "base fixture edited");
  const { defaultColourOptionsFor, DEFAULT_COLOUR_OPTIONS } = colormap();
  const fixture = base();
  assert.deepEqual(defaultColourOptionsFor("abelian-sandpile", 2), SANDPILE_DEFAULTS);
  assert.deepEqual(DEFAULT_COLOUR_OPTIONS, { ...fixture.defaultOptions, avalancheGlow: false });
  for (const [slug, perCount] of Object.entries(fixture.defaults)) {
    perCount.forEach((expected, index) => {
      assert.deepEqual(defaultColourOptionsFor(slug, index + 1), { ...expected, avalancheGlow: false }, `${slug} with ${index + 1} channels`);
    });
  }
});

test("only the sandpile kernel gets the height mapping", { skip }, () => {
  const { channelMappingFor } = colormap();
  assert.equal(channelMappingFor(new (sandpileKernel().AbelianSandpileKernel)()), "height");
  assert.equal(channelMappingFor(new (grayScottKernel().GrayScottKernel)()), "composite");
});

test("Classic and Sunflower draw grain counts 0 to 3 in their four exact colours, and ignore activity with the glow off", { skip }, () => {
  for (const [preset, colours] of [["sandpile-classic", CLASSIC], ["sandpile-sunflower", SUNFLOWER]]) {
    const mapper = heightMapper({ ...SANDPILE_DEFAULTS, preset });
    colours.forEach((expected, height) => {
      for (const activity of C1) {
        assert.deepEqual(rounded(raw(mapper, height / 3, activity)), expected, `${preset} height ${height} activity ${activity}`);
      }
    });
  }
});

test("under the height mapping every palette but Amber sand colours a height exactly as it colours that value on a one-channel sim", { skip }, () => {
  const { buildMapper } = colormap();
  for (const preset of [...Object.keys(base().labels).filter((p) => p !== "sand"), "sandpile-classic", "sandpile-sunflower"]) {
    for (const glow of [false, true]) {
      const options = { ...SANDPILE_DEFAULTS, preset, avalancheGlow: glow };
      const height = heightMapper(options);
      const single = buildMapper(1, [[0, 1]], options);
      for (const c0 of C0) assertClose(raw(height, c0, 0), raw(single, c0), `${preset} glow ${glow} at ${c0}`);
    }
  }
});

test("the glow switch overlays activity only when on; Amber sand with the glow on is today's sandpile look", { skip }, () => {
  for (const preset of ["sandpile-classic", "sandpile-sunflower", "viridis"]) {
    const on = heightMapper({ ...SANDPILE_DEFAULTS, preset, avalancheGlow: true });
    const off = heightMapper({ ...SANDPILE_DEFAULTS, preset, avalancheGlow: false });
    for (const c0 of C0) {
      assertClose(raw(on, c0, 0), raw(off, c0, 0), `${preset} at rest`);
      assert.notDeepEqual(rounded(raw(on, c0, 1)), rounded(raw(off, c0, 1)), `${preset} glow at ${c0}`);
    }
  }
  const look = base().sandLook;
  const amber = { ...SANDPILE_DEFAULTS, preset: "sand", gamma: 0.9, contrast: 1.1 };
  const on = heightMapper({ ...amber, avalancheGlow: true });
  const off = heightMapper({ ...amber, avalancheGlow: false });
  let index = 0;
  for (const c0 of C0) {
    for (const c1 of C1) {
      assertClose(raw(on, c0, c1), look[index], `amber glow on ${c0},${c1}`);
      assertClose(raw(off, c0, c1), look[index - (index % C1.length)], `amber glow off ${c0},${c1}`);
      index += 1;
    }
  }
});

test("every other sim colours exactly as before: composite two-channel and one-channel outputs are unchanged", { skip }, () => {
  const { buildMapper, DEFAULT_COLOUR_OPTIONS } = colormap();
  const fixture = base();
  for (const preset of Object.keys(fixture.labels)) {
    for (const glow of [false, true]) {
      const options = { ...DEFAULT_COLOUR_OPTIONS, preset, avalancheGlow: glow };
      for (const mapper of [buildMapper(2, RANGES_2, options), buildMapper(2, RANGES_2, options, "composite")]) {
        let index = 0;
        for (const c0 of C0) for (const c1 of C1) assertClose(raw(mapper, c0, c1), fixture.two[preset][index++], `${preset} composite ${c0},${c1}`);
      }
      const single = buildMapper(1, [[0, 1]], options);
      T.forEach((t, i) => assertClose(raw(single, t), fixture.one[preset][i], `${preset} single ${t}`));
    }
  }
});

test("the sandpile ships five presets: the four incumbents unchanged, then Mandala; the kernel source is unchanged", { skip }, () => {
  const sandpile = presetsModule().presetsFor("abelian-sandpile");
  assert.equal(sandpile.length, 5);
  assert.deepEqual(sandpile.slice(0, 4), INCUMBENTS);
  assert.deepEqual(sandpile[4], MANDALA);
  assert.equal(sha256(KERNEL_FILE), KERNEL_SHA);
  const schema = new (sandpileKernel().AbelianSandpileKernel)().paramSchema;
  for (const [key, value] of Object.entries(MANDALA.params)) {
    const descriptor = schema.find((d) => d.key === key);
    assert.ok(descriptor.min <= value && value <= descriptor.max, `${key}=${value}`);
  }
});

test("saved presets load with or without the glow field and reject a malformed one", { skip }, async () => {
  const { PresetValidator } = savedPresets();
  const validator = new PresetValidator([{ slug: "abelian-sandpile", load: async () => new (sandpileKernel().AbelianSandpileKernel)() }]);
  const snapshot = (colourOptions) => ({
    slug: "abelian-sandpile", params: { ...MANDALA.params }, colourOptions,
    displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 }, resolution: "ultra", stepsPerFrame: 1, autoCycle: false,
  });
  const old = { preset: "sand", invert: false, gamma: 0.9, contrast: 1.1, steps: 0, paletteCycleReverse: false };
  await validator.snapshot(snapshot(old));
  const glowing = await validator.snapshot(snapshot({ ...old, preset: "sandpile-sunflower", avalancheGlow: true }));
  assert.equal(glowing.colourOptions.avalancheGlow, true);
  await assert.rejects(validator.snapshot(snapshot({ ...old, avalancheGlow: "true" })));
  await assert.rejects(validator.snapshot(snapshot({ ...old, glow: true })));
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
