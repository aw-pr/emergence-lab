const assert = require("node:assert/strict");
const test = require("node:test");

// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/106-logistic-mandelbrot-tail-refinement-default.md
const skip = process.env.PARAM_PERSISTENCE !== "1" && "set PARAM_PERSISTENCE=1";
const persistence = () => require("../../.test-build/app/paramPersistence.js");

const SCHEMA = [
  { key: "tailRefinement", default: 0.6 },
  { key: "colourMode", default: "inside-out" },
  { key: "autoRotate", default: true },
  { key: "cycleBands", default: 4 },
];

test("the stored blob carries the marker and only the values that differ from the defaults, in schema order", { skip }, () => {
  const { encodeStoredValues, STORED_VALUES_FORMAT, STORED_VALUES_FORMAT_KEY } = persistence();
  assert.equal(STORED_VALUES_FORMAT_KEY, "__format");
  assert.equal(STORED_VALUES_FORMAT, 2);
  const stored = encodeStoredValues(
    { cycleBands: 1.5, tailRefinement: 0.6, colourMode: "cycle", autoRotate: true, unknownKey: 9 },
    SCHEMA,
  );
  assert.deepEqual(stored, { __format: 2, colourMode: "cycle", cycleBands: 1.5 });
  assert.deepEqual(Object.keys(stored), ["__format", "colourMode", "cycleBands"]);
  assert.deepEqual(
    encodeStoredValues({ tailRefinement: 0.6, colourMode: "inside-out", autoRotate: true, cycleBands: 4 }, SCHEMA),
    { __format: 2 },
  );
  assert.deepEqual(encodeStoredValues({ tailRefinement: 0 }, SCHEMA), { __format: 2, tailRefinement: 0 });
  assert.deepEqual(encodeStoredValues({}, SCHEMA), { __format: 2 });
});

test("a descriptor without a default stores its value whenever one is set", { skip }, () => {
  const { encodeStoredValues } = persistence();
  const schema = [{ key: "modelSource" }, { key: "tailRefinement", default: 0.6 }];
  assert.deepEqual(encodeStoredValues({ modelSource: "live", tailRefinement: 0.6 }, schema), { __format: 2, modelSource: "live" });
  assert.deepEqual(encodeStoredValues({ tailRefinement: 0.6 }, schema), { __format: 2 });
});

test("a blob is legacy unless it carries the current marker exactly", { skip }, () => {
  const { isLegacyStoredValues, encodeStoredValues } = persistence();
  assert.equal(isLegacyStoredValues({}), true);
  assert.equal(isLegacyStoredValues({ tailRefinement: 0, colourMode: "cycle" }), true);
  assert.equal(isLegacyStoredValues({ __format: 1 }), true);
  assert.equal(isLegacyStoredValues({ __format: "2" }), true);
  assert.equal(isLegacyStoredValues({ __format: 2 }), false);
  assert.equal(isLegacyStoredValues({ __format: 2, tailRefinement: 0 }), false);
  assert.equal(isLegacyStoredValues(encodeStoredValues({ tailRefinement: 0 }, SCHEMA)), false);
});

test("a legacy blob drops only the values equal to a retired default, and the input is untouched", { skip }, () => {
  const { migrateLegacyStoredValues } = persistence();
  const legacy = { tailRefinement: 0, colourMode: "cycle", cycleBands: 4 };
  const migrated = migrateLegacyStoredValues(legacy, { tailRefinement: 0 });
  assert.deepEqual(migrated, { colourMode: "cycle", cycleBands: 4 });
  assert.deepEqual(legacy, { tailRefinement: 0, colourMode: "cycle", cycleBands: 4 });
  assert.notEqual(migrated, legacy);
  assert.deepEqual(migrateLegacyStoredValues({ tailRefinement: 0.3, colourMode: "cycle" }, { tailRefinement: 0 }), { tailRefinement: 0.3, colourMode: "cycle" });
  assert.deepEqual(migrateLegacyStoredValues({ tailRefinement: "0" }, { tailRefinement: 0 }), { tailRefinement: "0" });
  assert.deepEqual(migrateLegacyStoredValues({ tailRefinement: 0 }, {}), { tailRefinement: 0 });
  assert.deepEqual(migrateLegacyStoredValues({}, { tailRefinement: 0 }), {});
});

test("a blob with the current marker is never migrated", { skip }, () => {
  const { migrateLegacyStoredValues } = persistence();
  const current = { __format: 2, tailRefinement: 0 };
  const result = migrateLegacyStoredValues(current, { tailRefinement: 0 });
  assert.deepEqual(result, { __format: 2, tailRefinement: 0 });
  assert.notEqual(result, current);
});

test("the retired defaults name Tail refinement 0 for the logistic-Mandelbrot sim and nothing else", { skip }, () => {
  const { RETIRED_DEFAULTS } = persistence();
  assert.deepEqual(RETIRED_DEFAULTS, { "logistic-mandelbrot": { tailRefinement: 0 } });
});
// AUTOMETTA-CONTRACT-END
