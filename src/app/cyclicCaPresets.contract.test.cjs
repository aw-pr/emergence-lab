const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/158-cyclic-ca-square-scrolls.md
const skip = process.env.CYCLIC_PRESETS !== "1" && "set CYCLIC_PRESETS=1";
const presetsModule = () => require("../../.test-build/app/presets.js");
const kernelModule = () => require("../../.test-build/sims/cyclic-ca/kernel.js");
const sha256 = (relativePath) => createHash("sha256").update(readFileSync(join(ROOT, relativePath))).digest("hex");

const INCUMBENTS = [
  { id: "demons", label: "Demons", params: { states: 14, threshold: 1, neighbourhood: "moore" } },
  { id: "turbulence", label: "Turbulence", params: { states: 8, threshold: 2, neighbourhood: "moore" } },
  { id: "crystal-lattice", label: "Crystal lattice", params: { states: 12, threshold: 1, neighbourhood: "vonNeumann" } },
];
const SQUARE_SCROLLS = { id: "square-scrolls", label: "Square scrolls", params: { states: 23, threshold: 1, neighbourhood: "moore" } };
const DEFAULTS = { states: 14, threshold: 1, neighbourhood: "moore" };
const THUMBNAIL = "46a715586dfe3bad1a635ae216ebdde1f1815afb10e160a731696877bd663415";
const INTERESTINGNESS = "docs/sweeps/cyclic-ca-interestingness.md";

test("cyclic-ca ships four presets: the three incumbents unchanged, then Square scrolls", { skip }, () => {
  const cyclic = presetsModule().presetsFor("cyclic-ca");
  assert.equal(cyclic.length, 4);
  assert.deepEqual(cyclic.slice(0, 3), INCUMBENTS);
  assert.deepEqual(cyclic[3], SQUARE_SCROLLS);
});

test("the Square scrolls values sit inside the descriptor ranges and the kernel defaults are unchanged", { skip }, () => {
  const schema = new (kernelModule().CyclicCaKernel)().paramSchema;
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const descriptor = schema.find((d) => d.key === key);
    assert.ok(descriptor, key);
    assert.equal(descriptor.default, value, `${key} default`);
  }
  for (const [key, value] of Object.entries(SQUARE_SCROLLS.params)) {
    const descriptor = schema.find((d) => d.key === key);
    if (descriptor.type === "enum") assert.ok(descriptor.options.includes(value), `${key}=${value}`);
    else assert.ok(descriptor.min <= value && value <= descriptor.max, `${key}=${value} outside ${descriptor.min}..${descriptor.max}`);
  }
});

test("the cyclic-ca thumbnail is byte-for-byte unchanged: the default preset did not move", { skip }, () => {
  assert.equal(sha256("public/thumbnails/cyclic-ca.png"), THUMBNAIL);
});

test("the cyclic-ca interestingness write-up records the promotion against the card-147 finalist", { skip }, () => {
  const doc = readFileSync(join(ROOT, INTERESTINGNESS), "utf8");
  const start = doc.indexOf("## Promotion: Square scrolls");
  assert.ok(start >= 0, `${INTERESTINGNESS} lacks a "## Promotion: Square scrolls" section`);
  const next = doc.indexOf("\n## ", start + 1);
  const section = doc.slice(start, next < 0 ? undefined : next);
  for (const needle of ["147-cyclic-ca-c43", "0.887", "states 23", "Demons"]) {
    assert.ok(section.includes(needle), `promotion section lacks "${needle}"`);
  }
});
// AUTOMETTA-CONTRACT-END
