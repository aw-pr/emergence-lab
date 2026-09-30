const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ATTRACTION_ESCAPED,
  ATTRACTION_RESOLVED,
  ATTRACTION_UNRESOLVED,
  INSIDE_OUT_GLSL,
  classifyAttraction,
  insideOutPaletteCoordinate,
} = require("../../.test-build/app/orbitColour.js");

test("inside-out coordinate is fract(bands * m - phase)", () => {
  assert.equal(insideOutPaletteCoordinate(0, 1.5, 0), 0);
  assert.ok(Math.abs(insideOutPaletteCoordinate(0.5, 1.5, 0) - 0.75) < 1e-12);
  assert.ok(Math.abs(insideOutPaletteCoordinate(0.5, 1.5, 0.25) - 0.5) < 1e-12);
  assert.ok(Math.abs(insideOutPaletteCoordinate(0, 1.5, 0.25) - 0.75) < 1e-12);
});

test("inside-out coordinate closes the cyclic loop at phase 1 and clamps m", () => {
  assert.ok(Math.abs(insideOutPaletteCoordinate(0.3, 2, 1) - insideOutPaletteCoordinate(0.3, 2, 0)) < 1e-12);
  assert.equal(insideOutPaletteCoordinate(4, 1.5, 0), insideOutPaletteCoordinate(1, 1.5, 0));
  assert.equal(insideOutPaletteCoordinate(-1, 1.5, 0), 0);
});

test("forward phase moves a fixed colour towards larger m", () => {
  // The colour at coordinate u sits at m = (u + phase) / bands.
  const bands = 1.5;
  const target = insideOutPaletteCoordinate(0.2, bands, 0);
  const later = (0.2 * bands + 0.1) / bands;
  assert.ok(Math.abs(insideOutPaletteCoordinate(later, bands, 0.1) - target) < 1e-12);
  assert.ok(later > 0.2);
});

test("classification follows the period, not the multiplier value", () => {
  assert.equal(classifyAttraction(true, 0), ATTRACTION_ESCAPED);
  assert.equal(classifyAttraction(false, 0), ATTRACTION_UNRESOLVED);
  assert.equal(classifyAttraction(false, 2), ATTRACTION_RESOLVED);
});

test("the GLSL twin evaluates the same expression", () => {
  assert.match(INSIDE_OUT_GLSL, /fract\(bands \* clamp\(multiplier, 0\.0, 1\.0\) - phase\)/);
});
