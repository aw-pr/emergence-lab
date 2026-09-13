const assert = require("node:assert/strict");
const test = require("node:test");

const { snapshot } = require("../../scripts/param-groups-snapshot.cjs");
const expected = require("../../docs/audits/2026-09-12-param-groups-before.json");

test("parameter sections, members, view keys and remainder preserve rendered order", async () => {
  assert.deepEqual(await snapshot(), expected);
});
