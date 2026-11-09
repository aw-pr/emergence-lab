const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { readFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/159-sandpile-sandstorm-preset.md
const skip = process.env.SANDPILE_PRESETS !== "1" && "set SANDPILE_PRESETS=1";
const presetsModule = () => require("../../.test-build/app/presets.js");
const kernelModule = () => require("../../.test-build/sims/abelian-sandpile/kernel.js");
const sha256 = (relativePath) => createHash("sha256").update(readFileSync(join(ROOT, relativePath))).digest("hex");

const INCUMBENTS = [
  { id: "classic-critical", label: "Classic critical", params: { initialPile: 100000, toppleThreshold: 4, grainsPerStep: 1, topplesPerStep: 50000 } },
  { id: "fast-avalanches", label: "Fast avalanches", params: { initialPile: 250000, toppleThreshold: 4, grainsPerStep: 16, topplesPerStep: 150000 } },
  { id: "high-threshold", label: "High threshold", params: { initialPile: 350000, toppleThreshold: 8, grainsPerStep: 8, topplesPerStep: 120000 } },
];
const SANDSTORM = { id: "sandstorm", label: "Sandstorm", params: { initialPile: 15650000, toppleThreshold: 12, grainsPerStep: 1000, topplesPerStep: 2000000 } };
const DEFAULTS = { initialPile: 450000, toppleThreshold: 4, grainsPerStep: 32, topplesPerStep: 120000 };
const THUMBNAIL = "cc697d9d8cebf0a04f2b4d30693e565ab02a1e4ca4edf24390cd5b02acac67cc";
const REPORT = "docs/sweeps/2026-11-10-sandpile-sandstorm.md";

test("abelian-sandpile ships four presets: the three incumbents unchanged, then Sandstorm", { skip }, () => {
  const sandpile = presetsModule().presetsFor("abelian-sandpile");
  assert.equal(sandpile.length, 4);
  assert.deepEqual(sandpile.slice(0, 3), INCUMBENTS);
  assert.deepEqual(sandpile[3], SANDSTORM);
});

test("the Sandstorm values sit inside the descriptor ranges and the kernel defaults are unchanged", { skip }, () => {
  const schema = new (kernelModule().AbelianSandpileKernel)().paramSchema;
  assert.deepEqual(schema.map((d) => d.key).sort(), Object.keys(SANDSTORM.params).sort());
  for (const descriptor of schema) {
    assert.equal(descriptor.default, DEFAULTS[descriptor.key], `${descriptor.key} default`);
    const value = SANDSTORM.params[descriptor.key];
    assert.ok(descriptor.min <= value && value <= descriptor.max, `${descriptor.key}=${value} outside ${descriptor.min}..${descriptor.max}`);
  }
});

test("the abelian-sandpile thumbnail is byte-for-byte unchanged: the default preset did not move", { skip }, () => {
  assert.equal(sha256("public/thumbnails/abelian-sandpile.png"), THUMBNAIL);
});

test("the promotion note exists and records the operator's Test1 provenance and the measured cost", { skip }, () => {
  assert.ok(existsSync(join(ROOT, REPORT)), REPORT);
  const report = readFileSync(join(ROOT, REPORT), "utf8");
  for (const needle of ["Test1", "15650000", "2000000", "Sandstorm", "fps", "High threshold", "docs/UAT/uat.md"]) {
    assert.ok(report.includes(needle), `report lacks "${needle}"`);
  }
});
// AUTOMETTA-CONTRACT-END
