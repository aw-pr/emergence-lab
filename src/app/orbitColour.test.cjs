const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ATTRACTION_ESCAPED,
  ATTRACTION_RESOLVED,
  ATTRACTION_UNRESOLVED,
  INSIDE_OUT_GLSL,
  classifyAttraction,
  spreadPaletteCoordinate,
} = require("../../.test-build/app/orbitColour.js");

const near = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("spread coordinate is fract(bands * |height - centre| - phase)", () => {
  near(spreadPaletteCoordinate(0.3, 0.3, 1.5, 0), 0);
  near(spreadPaletteCoordinate(0.8, 0.3, 1.5, 0), 0.75);
  near(spreadPaletteCoordinate(0.8, 0.3, 1.5, 0.25), 0.5);
  near(spreadPaletteCoordinate(0.3, 0.3, 1.5, 0.25), 0.75);
});

test("spread coordinate closes the cyclic loop at phase 1 and never clamps the distance", () => {
  near(spreadPaletteCoordinate(0.9, 0.2, 2, 1), spreadPaletteCoordinate(0.9, 0.2, 2, 0));
  // 2.45 height units is the audit's largest column deviation: 3.675 laps.
  near(spreadPaletteCoordinate(2, -0.45, 1.5, 0), 0.675, 1e-9);
  assert.notEqual(spreadPaletteCoordinate(2, -0.45, 1.5, 0), spreadPaletteCoordinate(0.55, -0.45, 1.5, 0));
});

test("the coordinate is mirrored about the centre and shifts with height and centre together", () => {
  for (const distance of [0.05, 0.4, 1.1, 1.9]) {
    near(
      spreadPaletteCoordinate(-0.5 + distance, -0.5, 1.5, 0.3),
      spreadPaletteCoordinate(-0.5 - distance, -0.5, 1.5, 0.3),
    );
  }
  near(spreadPaletteCoordinate(0.7, 0.2, 1.5, 0.3), spreadPaletteCoordinate(-0.3, -0.8, 1.5, 0.3));
  assert.notEqual(spreadPaletteCoordinate(0.7, 0.2, 1.5, 0.3), spreadPaletteCoordinate(0.9, 0.2, 1.5, 0.3));
});

test("forward phase moves a fixed colour to larger distance from the centre", () => {
  // The colour at coordinate u sits at distance d = (u + phase) / bands.
  const bands = 1.5;
  const target = spreadPaletteCoordinate(0.2, 0, bands, 0);
  const later = (0.2 * bands + 0.1) / bands;
  near(spreadPaletteCoordinate(later, 0, bands, 0.1), target);
  near(spreadPaletteCoordinate(-later, 0, bands, 0.1), target);
  assert.ok(later > 0.2);
});

test("the ground scalar is the same function with the spread as the height and zero as the centre", () => {
  near(spreadPaletteCoordinate(0.9, 0, 1.5, 0.2), (1.5 * 0.9 - 0.2) % 1);
  near(spreadPaletteCoordinate(0, 0, 1.5, 0.2), 0.8);
});

test("classification follows the escape flag and the period, and both bounded classes are coloured", () => {
  assert.equal(classifyAttraction(true, 0), ATTRACTION_ESCAPED);
  assert.equal(classifyAttraction(false, 0), ATTRACTION_UNRESOLVED);
  assert.equal(classifyAttraction(false, 2), ATTRACTION_RESOLVED);
  assert.ok(ATTRACTION_UNRESOLVED > ATTRACTION_ESCAPED && ATTRACTION_RESOLVED > ATTRACTION_UNRESOLVED);
});

test("the GLSL twin evaluates the same expression and carries no neutral constant", () => {
  assert.match(INSIDE_OUT_GLSL, /fract\(bands \* abs\(height - centre\) - phase\)/);
  assert.doesNotMatch(INSIDE_OUT_GLSL, /clamp|NEUTRAL/);
});
