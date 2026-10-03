const assert = require("node:assert/strict");
const test = require("node:test");

// Same route as metrics.test.cjs: the harness modules are plain TypeScript
// that Node requires directly under type stripping, so these tests score the
// exact source the Playwright harness scores. (docs/INTERFACE.md's
// tsconfig.test.json include route is for src/app modules; that config's
// rootDir is src, so an e2e/harness file cannot be added to it.)
const {
  COLOUR_WEIGHTS,
  CHROMA_FULL,
  EDGE_FULL,
  TRAVEL_SCALE,
  LIT_THRESHOLD,
  cycleTerms,
  luminanceField,
  scoreCycle,
} = require("./cycleScore.ts");
const { frameMetrics, interestingness } = require("./metrics.ts");

const WIDTH = 128;
const HEIGHT = 72;

function blankFrame() {
  return { width: WIDTH, height: HEIGHT, rgba: new Uint8Array(WIDTH * HEIGHT * 4) };
}

function fill(frame, x, y, [r, g, b]) {
  const i = (y * frame.width + x) * 4;
  frame.rgba[i] = r;
  frame.rgba[i + 1] = g;
  frame.rgba[i + 2] = b;
  frame.rgba[i + 3] = 255;
}

function solidFrame(colour) {
  const frame = blankFrame();
  for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) fill(frame, x, y, colour);
  return frame;
}

const BAND_A = [230, 90, 60];
const BAND_B = [70, 110, 220];
const BAND_WIDTH = 8;
/** Lit window: the middle 60% of each axis, so coverage sits on the plateau. */
const WINDOW = { x0: 26, x1: 102, y0: 15, y1: 57 };

/** Two-colour vertical bands inside the window, shifted right by `shift` px. */
function bandFrame(shift) {
  const frame = blankFrame();
  for (let y = WINDOW.y0; y < WINDOW.y1; y += 1) {
    for (let x = WINDOW.x0; x < WINDOW.x1; x += 1) {
      const band = Math.floor((x - shift) / BAND_WIDTH);
      fill(frame, x, y, band % 2 === 0 ? BAND_A : BAND_B);
    }
  }
  return frame;
}

test("a blank sequence scores 0 everywhere", () => {
  const score = scoreCycle([blankFrame(), blankFrame()]);
  assert.equal(score.cycleInterestingness, 0);
  assert.equal(score.field, 0);
  assert.equal(score.travel, 0);
  assert.equal(score.colour.lit, 0);
  assert.equal(score.fieldSummary.coverage, 0);
});

test("a solid lit chromatic frame scores 0 through the coverage factor", () => {
  const score = scoreCycle([solidFrame(BAND_A), solidFrame(BAND_A)]);
  // The colour half is alive, so only the field's coverage factor can be
  // what zeroes the composite.
  assert.ok(score.chromaTerm > 0, `chromaTerm ${score.chromaTerm}`);
  assert.equal(score.fieldSummary.coverage, 1);
  assert.equal(score.field, 0);
  assert.equal(score.cycleInterestingness, 0);
});

test("identical banded frames give zero travel and the liveliness floor", () => {
  const frame = bandFrame(0);
  const score = scoreCycle([frame, frame, frame]);
  assert.equal(score.travel, 0);
  assert.deepEqual(score.travelPairs, [0, 0]);
  assert.equal(score.travelTerm, 0);
  assert.equal(score.fieldSummary.temporalFlux, 0);
  // The field term is exactly the repo composite at zero flux...
  const lum = luminanceField(frame);
  const metrics = frameMetrics(lum.values, lum.width, lum.height, LIT_THRESHOLD);
  assert.ok(Math.abs(score.field - interestingness(metrics, 0)) < 1e-12);
  // ...which is the same frame at saturated flux times the 0.85 floor.
  assert.ok(Math.abs(score.field / interestingness(metrics, 1) - 0.85) < 1e-9);
  assert.ok(score.field > 0, `field ${score.field}`);
  assert.ok(score.cycleInterestingness > 0 && score.cycleInterestingness < 1);
});

test("moving bands give positive travel and outscore the frozen sequence", () => {
  const frozen = scoreCycle([bandFrame(0), bandFrame(0), bandFrame(0)]);
  const moving = scoreCycle([bandFrame(0), bandFrame(4), bandFrame(8)]);
  assert.equal(moving.frameCount, 3);
  assert.ok(moving.travel > 0, `travel ${moving.travel}`);
  for (const pair of moving.travelPairs) assert.ok(pair > 0);
  assert.ok(moving.fieldSummary.temporalFlux > 0);
  assert.ok(moving.field > frozen.field, `${moving.field} > ${frozen.field}`);
  assert.ok(moving.travelTerm > frozen.travelTerm);
  assert.ok(moving.cycleInterestingness > frozen.cycleInterestingness);
  assert.ok(moving.cycleInterestingness > 0 && moving.cycleInterestingness < 1);
});

test("the composite is the documented formula over the exported terms", () => {
  const score = scoreCycle([bandFrame(0), bandFrame(4), bandFrame(8)]);
  const chromaTerm = Math.min(1, score.colour.chroma / CHROMA_FULL);
  const edgeTerm = Math.min(1, score.colour.edgeDensity / EDGE_FULL);
  const travelTerm = Math.tanh(score.travel / TRAVEL_SCALE);
  const colourScore =
    COLOUR_WEIGHTS.chroma * chromaTerm + COLOUR_WEIGHTS.edges * edgeTerm + COLOUR_WEIGHTS.travel * travelTerm;
  assert.ok(Math.abs(score.chromaTerm - chromaTerm) < 1e-12);
  assert.ok(Math.abs(score.edgeTerm - edgeTerm) < 1e-12);
  assert.ok(Math.abs(score.travelTerm - travelTerm) < 1e-12);
  assert.ok(Math.abs(score.colourScore - colourScore) < 1e-12);
  assert.ok(Math.abs(score.cycleInterestingness - Math.sqrt(score.field * colourScore)) < 1e-12);
  assert.deepEqual(cycleTerms(score.field, score.colour, score.travel), {
    chromaTerm: score.chromaTerm,
    edgeTerm: score.edgeTerm,
    travelTerm: score.travelTerm,
    colourScore: score.colourScore,
    cycleInterestingness: score.cycleInterestingness,
  });
  // Re-weighting from the exported terms needs no re-render.
  const edgesOnly = cycleTerms(score.field, score.colour, score.travel, { chroma: 0, edges: 1, travel: 0 });
  assert.ok(Math.abs(edgesOnly.cycleInterestingness - Math.sqrt(score.field * edgeTerm)) < 1e-12);
});
