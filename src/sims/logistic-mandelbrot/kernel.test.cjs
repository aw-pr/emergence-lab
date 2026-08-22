const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  LogisticMandelbrotKernel,
  selfTest,
} = require("../../../.test-build/sims/logistic-mandelbrot/kernel.js");
const model = require("../../../.test-build/sims/logistic-mandelbrot/model.js");
const surface = require("../../app/orbitSurface.ts");
const curves = require("../../app/orbitSurfaceCurves.ts");
const components = require("../../app/orbitSurfaceComponents.ts");

// Logistic conjugacy: x <- r*x*(1 - x) maps to z <- z^2 + c under
// z = r/2 - r*x with c = (r/2)*(1 - r/2); inverting, r = 1 + sqrt(1 - 4c).
const cFromR = (r) => (r / 2) * (1 - r / 2);
const zFromX = (r, x) => r / 2 - r * x;

function sampleCell(cRe, cIm) {
  const out = new Float32Array(model.DEFAULT_SAMPLE_COUNT);
  const measure = { interior: Number.NaN };
  const period = model.sampleAttractorCell(
    cRe,
    cIm,
    model.DEFAULT_WARMUP_ITERATIONS,
    model.DEFAULT_SAMPLE_COUNT,
    out,
    0,
    measure,
  );
  return { period, out, interior: measure.interior };
}

function defaultsFromSchema(kernel) {
  return Object.fromEntries(
    kernel.paramSchema.map((descriptor) => [
      descriptor.key,
      descriptor.default,
    ]),
  );
}

function runKernel(params = {}, width = 30, height = 20, steps = 8) {
  const kernel = new LogisticMandelbrotKernel();
  kernel.init(width, height, params);

  for (let index = 0; index < steps; index += 1) {
    kernel.step(1 / 60);
  }

  return kernel;
}

function surfaceCells({
  width = 2,
  height = 2,
  sampleCount = 1,
  samples = [0, 0, 0, 0],
  periods = [1, 1, 1, 1],
  escaped = [0, 0, 0, 0],
} = {}) {
  const count = width * height;
  return {
    width,
    height,
    sampleCount,
    samples: new Float32Array(samples),
    periods: new Int16Array(periods),
    interiors: Float32Array.from({ length: count }, (_value, index) => index / 10),
    boundaries: Float32Array.from({ length: count }, (_value, index) => index / 20),
    escaped: new Uint8Array(escaped),
  };
}

function assertMeshSound(mesh) {
  for (const attribute of [
    mesh.positions,
    mesh.normals,
    mesh.periods,
    mesh.interiors,
    mesh.boundaries,
    mesh.ranks,
    mesh.edgeFades,
    mesh.dissolves,
  ]) {
    assert.ok(attribute.every(Number.isFinite));
  }
  const vertexCount = mesh.positions.length / 3;
  assert.equal(mesh.normals.length, vertexCount * 3);
  assert.equal(mesh.periods.length, vertexCount);
  assert.equal(mesh.interiors.length, vertexCount);
  assert.equal(mesh.boundaries.length, vertexCount);
  assert.equal(mesh.ranks.length, vertexCount);
  assert.equal(mesh.edgeFades.length, vertexCount);
  assert.equal(mesh.dissolves.length, vertexCount);
  assert.ok(mesh.edgeFades.every((fade) => fade >= 0 && fade <= 1));
  assert.ok(mesh.dissolves.every((fade) => fade >= 0 && fade <= 1));
  assert.ok(mesh.indices.every((index) => index >= 0 && index < vertexCount));
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const length = Math.hypot(
      mesh.normals[offset],
      mesh.normals[offset + 1],
      mesh.normals[offset + 2],
    );
    assert.ok(Math.abs(length - 1) < 1e-6);
  }
}

function analyticSurfaceCells(width, height, sampleCount, sampler) {
  const count = width * height;
  const samples = new Float32Array(count * sampleCount);
  const periods = new Int16Array(count);
  const interiors = new Float32Array(count);
  const boundaries = new Float32Array(count);
  const dissolves = new Float32Array(count).fill(1);
  const escaped = new Uint8Array(count);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = y * width + x;
      const sampled = sampler(x, y);
      periods[cell] = sampled.period;
      interiors[cell] = sampled.interior;
      boundaries[cell] = sampled.boundary;
      dissolves[cell] = sampled.dissolve ?? 1;
      escaped[cell] = sampled.escaped ? 1 : 0;
      for (let rank = 0; rank < sampleCount; rank += 1) {
        samples[cell * sampleCount + rank] = sampled.samples[rank] ?? 0;
      }
    }
  }
  return {
    width,
    height,
    sampleCount,
    samples,
    periods,
    interiors,
    boundaries,
    dissolves,
    escaped,
  };
}

function assertAnalyticContour({ sampler, distanceToBoundary, expectedPeriods }) {
  const cells = analyticSurfaceCells(5, 5, 2, sampler);
  const build = () => surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler },
  );
  const first = build();
  const second = build();
  for (const key of [
    "positions",
    "normals",
    "periods",
    "interiors",
    "boundaries",
    "ranks",
    "edgeFades",
    "dissolves",
    "indices",
  ]) {
    assert.deepEqual(Array.from(first[key]), Array.from(second[key]), key);
  }
  assertMeshSound(first);

  const transitionVertices = [];
  const unique = new Set();
  const incidence = new Uint16Array(first.positions.length / 3);
  for (const index of first.indices) incidence[index] += 1;
  for (let vertex = 0; vertex < first.positions.length / 3; vertex += 1) {
    const x = first.positions[vertex * 3];
    const y = first.positions[vertex * 3 + 1];
    if (Number.isInteger(x) && Number.isInteger(y)) continue;
    assert.ok(
      distanceToBoundary(x, y) <= 1 / 8 + 1e-6,
      `transition ${x},${y} should track the analytic boundary`,
    );
    const key = [
      x.toFixed(8),
      y.toFixed(8),
      first.periods[vertex],
      first.ranks[vertex],
    ].join(":");
    assert.ok(!unique.has(key), `duplicate contour vertex ${key}`);
    unique.add(key);
    transitionVertices.push(vertex);
  }
  assert.ok(transitionVertices.length > 0);
  assert.ok(
    transitionVertices.some((vertex) => incidence[vertex] >= 2),
    "adjacent trimmed triangles should reuse contour vertices",
  );
  assert.deepEqual(
    new Set(Array.from(first.periods).filter((period) => period > 0)),
    new Set(expectedPeriods),
  );
  return first;
}

test("cloud-band classification shares the sheet dissolve coverage", () => {
  assert.equal(surface.orbitSurfaceDissolveCoverage(0.5, 4), 0);
  assert.equal(surface.orbitSurfaceDissolveCoverage(2.5, 4), 0.5);
  assert.equal(surface.orbitSurfaceDissolveCoverage(4.5, 4), 1);
  assert.equal(surface.isOrbitSurfaceCloudBandSample(0, false, 4.49, 4), true);
  assert.equal(surface.isOrbitSurfaceCloudBandSample(0, false, 4.5, 4), false);
  assert.equal(surface.isOrbitSurfaceCloudBandSample(1, false, 1, 4), false);
  assert.equal(surface.isOrbitSurfaceCloudBandSample(0, true, 1, 4), false);
});

test("hybrid cloud refinement uses the cloud path's deterministic 3 by 3 lattice", () => {
  const offsets = surface.orbitSurfaceCloudRefinementOffsets(3);
  assert.equal(offsets.length, 8);
  assert.deepEqual(offsets, surface.orbitSurfaceCloudRefinementOffsets(3));
  assert.ok(offsets.every(({ x, y }) =>
    Math.abs(x) <= 1 / 3 + 1e-12 && Math.abs(y) <= 1 / 3 + 1e-12));
  assert.ok(offsets.every(({ x, y }) => x !== 0 || y !== 0));
});

test("exact component classification reaches periods the sample window cannot", () => {
  const classify = (re, im) =>
    components.classifyOrbitSurfaceComponent(re, im);
  const sampled = (re, im) => {
    const out = new Float32Array(8);
    return model.sampleAttractorCell(re, im, 1500, 8, out, 0, { interior: 1 });
  };

  // An eight-sample window needs a lag pair to see a repeat, so period 8 is
  // outside its reach; the exact classifier answers where it cannot.
  assert.equal(sampled(-1.3815474, 0), 0);
  assert.equal(classify(-1.3815474, 0).period, 8);

  assert.equal(classify(-0.5, 0).period, 1);
  assert.equal(classify(-1, 0).period, 2);
  assert.equal(classify(-1.7548777, 0).period, 3);
  assert.equal(classify(-1.3107026, 0).period, 4);
  assert.equal(classify(-0.5043, 0.5629).period, 5);

  // Chaotic and escaping parameters stay cloud, which is what keeps sheet off
  // chaotic parameter space.
  assert.equal(classify(-1.8, 0).period, 0);
  assert.equal(classify(0.6, 0).period, 0);
  assert.equal(classify(0.6, 0).escaped, true);
  assert.equal(classify(-1.8, 0).escaped, false);

  // Above period 8 the module declines rather than guessing.
  assert.equal(classify(-1.3969, 0).period, 0);
});

test("component classification is bounded by the accepted multiplier margin", () => {
  const centre = components.classifyOrbitSurfaceComponent(-1, 0);
  assert.equal(centre.period, 2);
  assert.ok(centre.multiplier < 1e-9);
  assert.ok(Math.abs(centre.confidence - 1) < 1e-9);
  assert.ok(centre.residual <= 1e-12);

  // c = -0.749 sits just inside the cardioid, where the multiplier is close to
  // one and the classification is deliberately withheld.
  const nearCusp = components.classifyOrbitSurfaceComponent(-0.749, 0);
  assert.equal(nearCusp.period, 0);
  const permissive = components.classifyOrbitSurfaceComponent(-0.749, 0, {
    multiplierMargin: 0,
  });
  assert.equal(permissive.period, 1);
  assert.ok(permissive.multiplier > 1 - components.ORBIT_SURFACE_COMPONENT_MULTIPLIER_MARGIN);
  assert.ok(permissive.multiplier < 1);

  // Repeated calls are byte-for-byte identical.
  assert.deepEqual(
    components.classifyOrbitSurfaceComponent(-1.3815474, 0),
    components.classifyOrbitSurfaceComponent(-1.3815474, 0),
  );
});

test("classified cycles fill the sample window with an exact repeating orbit", () => {
  const classification = components.classifyOrbitSurfaceComponent(-1.3815474, 0);
  const window = new Float32Array(8);
  assert.equal(
    components.writeOrbitSurfaceCycleSamples(classification, -1.3815474, 0, window, 0, 8),
    true,
  );
  // The window holds one full cycle and no lag pair, so the empirical estimator
  // still reports nothing; the classified label is what carries period 8.
  assert.equal(model.estimatePeriod(window, 0, 8), 0);
  assert.equal(new Set(window).size, 8);
  assert.equal(surface.orbitSurfaceSamplePeriod({
    samples: window,
    period: classification.period,
    interior: classification.multiplier,
    boundary: 0,
    escaped: false,
  }, 8), 8);

  // A period wider than the window is refused rather than truncated.
  const short = new Float32Array(4);
  assert.equal(
    components.writeOrbitSurfaceCycleSamples(classification, -1.3815474, 0, short, 0, 4),
    false,
  );

  const periodTwo = components.classifyOrbitSurfaceComponent(-1, 0);
  const pair = new Float32Array(8);
  components.writeOrbitSurfaceCycleSamples(periodTwo, -1, 0, pair, 0, 8);
  for (let index = 0; index + 2 < 8; index += 1) {
    assert.equal(pair[index], pair[index + 2]);
  }
});

test("component catalogue groups classified cells into per-component seeds", () => {
  // Two period-2 regions and one period-4 region on a four by two grid.
  const periods = Int16Array.from([2, 2, 0, 4, 2, 0, 0, 4]);
  const seedAt = (cell) => ({
    period: periods[cell],
    c: { re: cell, im: 0 },
    cycle: { re: -cell, im: 0 },
    multiplier: cell === 4 ? 0.1 : 0.9,
  });
  const regions = components.buildOrbitSurfaceComponentCatalogue(periods, 4, 2, seedAt);

  assert.deepEqual(
    regions.map((region) => [region.period, region.cellCount, region.firstCell]),
    [[2, 3, 0], [4, 2, 3]],
  );
  // The representative is the best-conditioned interior point in the region.
  assert.equal(regions[0].seed.c.re, 4);
  assert.equal(regions[0].seed.multiplier, 0.1);

  // A component seed carries exactly the fields the boundary corrector takes.
  const seed = regions[0].seed;
  assert.equal(typeof seed.period, "number");
  assert.equal(typeof seed.c.re, "number");
  assert.equal(typeof seed.cycle.im, "number");
});

test("analytic primary boundaries recover the known cardioid and period-2 extrema", () => {
  const periodOne = curves.tracePrimaryOrbitSurfaceBoundary(1, 1e-4);
  const periodTwo = curves.tracePrimaryOrbitSurfaceBoundary(2, 1e-4);
  const nearest = (curve, re, im) => Math.min(...curve.points.map((point) =>
    Math.hypot(point.c.re - re, point.c.im - im)));

  assert.ok(nearest(periodOne, 0.25, 0) < 1e-12);
  assert.ok(nearest(periodOne, -0.75, 0) < 1e-12);
  assert.ok(nearest(periodTwo, -0.75, 0) < 1e-12);
  assert.ok(nearest(periodTwo, -1.25, 0) < 1e-12);
  assert.ok(periodOne.maxChordError <= 1e-4);
  assert.ok(periodTwo.maxChordError <= 1e-4);
  assert.equal(periodOne.closed, true);
  assert.equal(periodTwo.closed, true);
});

test("cycle-multiplier corrector recovers a known period-1 boundary point", () => {
  const corrected = curves.correctOrbitSurfaceBoundaryPoint(
    1,
    Math.PI / 2,
    { re: 0.1, im: 0.45 },
    { re: 0.2, im: 0.45 },
  );
  assert.ok(Math.abs(corrected.cycle.re) < 1e-11);
  assert.ok(Math.abs(corrected.cycle.im - 0.5) < 1e-11);
  assert.ok(Math.abs(corrected.c.re - 0.25) < 1e-11);
  assert.ok(Math.abs(corrected.c.im - 0.5) < 1e-11);
  assert.ok(corrected.residual <= 1e-12);
});

test("cycle-multiplier corrector recovers the real period-3 component root", () => {
  const corrected = curves.correctOrbitSurfaceBoundaryPoint(
    3,
    0,
    { re: -1.74698, im: 0 },
    { re: -1.75, im: 0 },
    1e-11,
    40,
  );
  assert.ok(Math.abs(corrected.c.re + 1.75) < 1e-11);
  assert.ok(Math.abs(corrected.c.im) < 1e-11);
  assert.ok(Math.abs(corrected.cycle.re + 1.7469796037174672) < 1e-11);
  assert.ok(Math.abs(corrected.cycle.im) < 1e-11);
  assert.ok(corrected.residual <= 1e-11);
});

test("predictor-corrector tracing is deterministic and adapts to curvature", () => {
  const seed = {
    angle: 0,
    c: { re: 0.25, im: 0 },
    cycle: { re: 0.5, im: 0 },
  };
  const loose = curves.traceOrbitSurfaceBoundary(1, seed, {
    maxChordError: 2e-3,
  });
  const tight = curves.traceOrbitSurfaceBoundary(1, seed, {
    maxChordError: 2e-4,
  });
  const repeated = curves.traceOrbitSurfaceBoundary(1, seed, {
    maxChordError: 2e-4,
  });

  assert.ok(loose.points.length > 8);
  assert.ok(tight.points.length > loose.points.length);
  assert.ok(loose.maxChordError <= 2e-3);
  assert.ok(tight.maxChordError <= 2e-4);
  assert.equal(tight.closed, true);
  assert.deepEqual(tight, repeated);
  assert.ok(tight.points.every((point) => point.residual <= 1e-12));
});

test("component catalogue tracing reports covered and fallback components", () => {
  const regions = [
    {
      period: 1,
      cellCount: 8,
      firstCell: 3,
      seed: {
        period: 1,
        c: { re: 0, im: 0 },
        cycle: { re: 0, im: 0 },
        multiplier: 0,
        multiplierAngle: 0,
      },
    },
    {
      period: 4,
      cellCount: 1,
      firstCell: 9,
      seed: {
        period: 4,
        c: { re: 20, im: 20 },
        cycle: { re: 20, im: 20 },
        multiplier: 0.5,
        multiplierAngle: 0,
      },
    },
  ];
  const result = curves.traceOrbitSurfaceComponentCatalogue(regions, 1e-4);
  assert.deepEqual(
    result.traced.map(({ componentId, period }) => [componentId, period]),
    [["period-1-cell-3", 1]],
  );
  assert.deepEqual(
    result.fallback.map(({ componentId, period }) => [componentId, period]),
    [["period-4-cell-9", 4]],
  );
  assert.deepEqual(
    curves.traceOrbitSurfaceComponentCatalogue(regions, 1e-4),
    result,
  );
});

test("analytic curve geometry supplies membership, distance, and exact crossings", () => {
  const points = Array.from({ length: 65 }, (_value, index) => {
    const angle = index / 64 * Math.PI * 2;
    return { x: 4 + Math.cos(angle) * 2, y: 4 + Math.sin(angle) * 2 };
  });
  const curve = { componentId: "circle", period: 2, points };
  assert.equal(surface.orbitSurfaceCurveContains(curve, 4, 4), true);
  assert.equal(surface.orbitSurfaceCurveContains(curve, 0, 0), false);
  const proximity = surface.nearestOrbitSurfaceBoundary([curve], 4, 4);
  assert.ok(Math.abs(proximity.distance - 2 * Math.cos(Math.PI / 64)) < 1e-12);
  assert.equal(proximity.inside, true);
  const crossing = surface.locateOrbitSurfaceCurveTransition(
    { x: 4, y: 4 },
    { x: 7, y: 4 },
    2,
    [curve],
  );
  assert.equal(crossing.componentId, "circle");
  assert.ok(Math.abs(crossing.x - 6) < 1e-12);
  assert.ok(Math.abs(crossing.y - 4) < 1e-12);
  assert.equal(surface.orbitSurfaceCurveIntersectsRect([curve], 5, 3, 7, 5), true);
  assert.equal(surface.orbitSurfaceCurveIntersectsRect([curve], 0, 0, 1, 1), false);
});

test("curve-trimmed mesh vertices land on the curve and dissolve at true zero distance", () => {
  const width = 9;
  const height = 9;
  const points = Array.from({ length: 129 }, (_value, index) => {
    const angle = index / 128 * Math.PI * 2;
    return { x: 4 + Math.cos(angle) * 2.5, y: 4 + Math.sin(angle) * 2.5 };
  });
  const boundaryCurves = [{ componentId: "period-1-circle", period: 1, points }];
  const sampler = (x, y) => {
    const distance = Math.hypot(x - 4, y - 4);
    const inside = distance <= 2.5;
    return {
      samples: new Float32Array([0.1 + x * 0.002]),
      period: inside ? 1 : 0,
      interior: 0.4,
      boundary: 0.2,
      dissolve: inside
        ? surface.orbitSurfaceDissolveCoverage(2.5 - distance, 8)
        : 0,
      escaped: false,
    };
  };
  const preparedSamples = new Map();
  const preparingSampler = (x, y) => {
    const sample = sampler(x, y);
    preparedSamples.set(`${x},${y}`, sample);
    return sample;
  };
  const preparedSampler = (x, y) => {
    const sample = preparedSamples.get(`${x},${y}`);
    if (!sample) throw new Error(`sample was not prepared at ${x},${y}`);
    return sample;
  };
  const cells = analyticSurfaceCells(width, height, 1, sampler);
  const refinedCells = [];
  for (let y = 0; y + 1 < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      if (!surface.orbitSurfaceCurveIntersectsRect(
        boundaryCurves,
        x,
        y,
        x + 1,
        y + 1,
      )) {
        continue;
      }
      const plan = surface.planOrbitSurfaceCellRefinement(
        x,
        y,
        preparingSampler,
        1,
        (gridX, gridY) => ({ x: gridX * 8, y: gridY * 8 }),
        0.25,
        5,
        4096 - refinedCells.length,
        boundaryCurves,
      );
      refinedCells.push(...plan.cells);
    }
  }
  const mesh = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler: preparedSampler, refinedCells, boundaryCurves },
  );
  let trimmedVertices = 0;
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    const nearest = surface.nearestOrbitSurfaceBoundary(boundaryCurves, x, y, 1);
    if (!nearest || nearest.distance > 1e-5) continue;
    assert.equal(mesh.dissolves[vertex], 0);
    trimmedVertices += 1;
  }
  assert.ok(trimmedVertices > 16);
  assertMeshSound(mesh);
});

test("live-grid analytic trimming does not require unprepared categorical midpoints", () => {
  const width = 768;
  const height = 768;
  const count = width * height;
  const samples = new Float32Array(count);
  const periods = new Int16Array(count);
  const interiors = new Float32Array(count);
  const boundaries = new Float32Array(count);
  const dissolves = new Float32Array(count).fill(1);
  const escaped = new Uint8Array(count);
  const sheetCell = 610 * width + 414;
  samples[sheetCell] = 0.1;
  periods[sheetCell] = 1;
  interiors[sheetCell] = 0.4;
  boundaries[sheetCell] = 0.2;

  const boundaryCurves = [{
    componentId: "live-period-1",
    period: 1,
    points: [
      { x: 413.75, y: 609.75 },
      { x: 414.25, y: 609.75 },
      { x: 414.25, y: 610.25 },
      { x: 413.75, y: 610.25 },
      { x: 413.75, y: 609.75 },
    ],
  }];
  const preparedSampler = (x, y) => {
    if (x === 414 && y === 610.5) {
      throw new Error(`Orbit surface sample was not prepared at ${x},${y}.`);
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      const inside = surface.orbitSurfaceCurveContains(boundaryCurves[0], x, y);
      return {
        samples: new Float32Array([inside ? 0.1 : 0]),
        period: inside ? 1 : 0,
        interior: inside ? 0.4 : 0,
        boundary: inside ? 0.2 : 0,
        dissolve: inside ? 1 : 0,
        escaped: false,
      };
    }
    const cell = y * width + x;
    return {
      samples,
      sampleOffset: cell,
      period: periods[cell],
      interior: interiors[cell],
      boundary: boundaries[cell],
      dissolve: dissolves[cell],
      escaped: escaped[cell] !== 0,
    };
  };

  let mesh;
  assert.doesNotThrow(() => {
    mesh = surface.buildOrbitSurface(
      {
        width,
        height,
        sampleCount: 1,
        samples,
        periods,
        interiors,
        boundaries,
        dissolves,
        escaped,
      },
      surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
      { sampler: preparedSampler, boundaryCurves },
    );
  });
  assert.ok(mesh.indices.length > 0);
});

test("metadata matches the renderer contract", () => {
  const kernel = new LogisticMandelbrotKernel();

  assert.equal(kernel.name, "Logistic Mandelbrot");
  assert.equal(kernel.channelCount, 2);
  assert.deepEqual(kernel.channelLabels, [
    "Attractor density",
    "Estimated period",
  ]);
  assert.deepEqual(kernel.channelRanges, [
    [0, 1],
    [0, model.MAX_DETECTABLE_PERIOD],
  ]);

  assert.deepEqual(
    kernel.paramSchema.map((descriptor) => descriptor.key),
    [
      "geometryMode",
      "surfaceOpacity",
      "colourMode",
      "exposure",
      "edgeGlow",
      "tailRefinement",
      "boundaryDetail",
      "pointDensity",
      "autoRotate",
      "continuousSpin",
      "realAxisSweep",
      "sweepSpeed",
      "cycleSpeed",
      "cascadeReveal",
      "cascadeDuration",
      "warmupIterations",
      "sampleCount",
      "plottedIterations",
      "realSliceOnly",
      "modelSource",
    ],
  );

  for (const descriptor of kernel.paramSchema) {
    if (descriptor.type === "boolean") {
      assert.equal(typeof descriptor.default, "boolean");
      continue;
    }
    if (descriptor.type === "enum") {
      assert.equal(typeof descriptor.default, "string");
      assert.ok(descriptor.options.includes(descriptor.default));
      continue;
    }
    assert.equal(descriptor.type, "number");
    assert.equal(typeof descriptor.default, "number");
    assert.ok(descriptor.min <= descriptor.default);
    assert.ok(descriptor.default <= descriptor.max);
  }

  const colourMode = kernel.paramSchema.find((d) => d.key === "colourMode");
  assert.equal(colourMode?.default, "period");
  assert.deepEqual(colourMode?.options, ["period", "inside-out", "mono", "cycle"]);

  const geometryMode = kernel.paramSchema.find((d) => d.key === "geometryMode");
  assert.deepEqual(geometryMode?.options, ["cloud", "hybrid"]);
  assert.equal(geometryMode?.default, "cloud");

  const surfaceOpacity = kernel.paramSchema.find((d) => d.key === "surfaceOpacity");
  assert.deepEqual(
    [
      surfaceOpacity?.default,
      surfaceOpacity?.min,
      surfaceOpacity?.max,
      surfaceOpacity?.step,
    ],
    [0.4, 0.1, 1, 0.05],
  );

  const cycleSpeed = kernel.paramSchema.find((d) => d.key === "cycleSpeed");
  assert.equal(cycleSpeed?.default, 0.151);
  assert.equal(cycleSpeed?.min, 0);
  assert.equal(cycleSpeed?.max, 5);
  assert.equal(cycleSpeed?.step, 0.001);

  const continuousSpin = kernel.paramSchema.find(
    (d) => d.key === "continuousSpin",
  );
  assert.equal(continuousSpin?.type, "boolean");
  assert.equal(continuousSpin?.default, true);

  const boundaryDetail = kernel.paramSchema.find((d) => d.key === "boundaryDetail");
  assert.equal(boundaryDetail?.default, 1);
  assert.equal(boundaryDetail?.min, 0);
  assert.equal(boundaryDetail?.max, 1);

  const warmup = kernel.paramSchema.find((d) => d.key === "warmupIterations");
  assert.equal(warmup?.default, 1500);
  const samples = kernel.paramSchema.find((d) => d.key === "sampleCount");
  assert.equal(samples?.default, 8);
  const plotted = kernel.paramSchema.find((d) => d.key === "plottedIterations");
  assert.equal(plotted?.default, 96);
  assert.equal(plotted?.min, 1);
});

test("surface builder emits a deterministic finite period-1 sheet", () => {
  const cells = surfaceCells({ samples: [0.12, 0.12, 0.12, 0.12] });
  const first = surface.buildOrbitSurface(cells);
  const second = surface.buildOrbitSurface(cells);

  for (const key of [
    "positions",
    "normals",
    "periods",
    "interiors",
    "boundaries",
    "ranks",
    "edgeFades",
    "dissolves",
    "indices",
  ]) {
    assert.deepEqual(Array.from(first[key]), Array.from(second[key]));
  }
  assert.equal(first.positions.length / 3, 4);
  assert.equal(first.indices.length, 2 * 3);
  assert.deepEqual(Array.from(first.periods), [1, 1, 1, 1]);
  assert.deepEqual(Array.from(first.ranks), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(first.normals), [
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]);
  assertMeshSound(first);
});

test("uniform period-1 contour input is identical to the pre-contour builder", () => {
  const cells = surfaceCells({ samples: [0.12, 0.12, 0.12, 0.12] });
  const legacy = surface.buildOrbitSurface(cells);
  const sampler = () => ({
    samples: new Float32Array([0.12]),
    period: 1,
    interior: 0.5,
    boundary: 0.25,
    escaped: false,
  });
  const contoured = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler },
  );
  for (const key of [
    "positions",
    "normals",
    "periods",
    "interiors",
    "boundaries",
    "ranks",
    "edgeFades",
    "dissolves",
    "indices",
  ]) {
    assert.deepEqual(Array.from(contoured[key]), Array.from(legacy[key]), key);
  }
});

test("surface diagnostics default off and accept only the two analysis modes", () => {
  assert.equal(surface.orbitSurfaceDiagnosticMode(undefined), "off");
  assert.equal(surface.orbitSurfaceDiagnosticMode("off"), "off");
  assert.equal(surface.orbitSurfaceDiagnosticMode("flat"), "flat");
  assert.equal(surface.orbitSurfaceDiagnosticMode("normals"), "normals");
  assert.equal(surface.orbitSurfaceDiagnosticMode("lighting"), "off");
});

test("diagnostics-off hybrid geometry matches the regularised byte snapshot", () => {
  const width = 4;
  const height = 4;
  const sampleCount = 2;
  const sampler = (x, y) => {
    const side = x + 0.37 * y - 2.15;
    if (side <= 0) {
      return {
        samples: new Float32Array([0.08 + x * 0.01, 0.08 + x * 0.01]),
        period: 1,
        interior: 0.25,
        boundary: Math.min(1, Math.abs(side)),
        escaped: false,
      };
    }
    return {
      samples: new Float32Array([-0.22 + y * 0.005, 0.22 + y * 0.005]),
      period: 2,
      interior: 0.55,
      boundary: Math.min(1, Math.abs(side)),
      escaped: false,
    };
  };
  const cells = analyticSurfaceCells(width, height, sampleCount, sampler);
  const mesh = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    {
      sampler,
      refinedCells: [
        { x: 1, y: 0, depth: 2 },
        { x: 1, y: 1, depth: 2 },
        { x: 0, y: 2, depth: 2 },
        { x: 1, y: 2, depth: 2 },
      ],
    },
  );
  const digest = crypto.createHash("sha256");
  for (const key of [
    "positions",
    "normals",
    "periods",
    "interiors",
    "boundaries",
    "ranks",
    "edgeFades",
    "dissolves",
    "indices",
  ]) {
    const attribute = mesh[key];
    digest.update(key);
    digest.update(
      Buffer.from(attribute.buffer, attribute.byteOffset, attribute.byteLength),
    );
  }
  assert.equal(mesh.positions.length / 3, 194);
  assert.equal(mesh.indices.length / 3, 249);
  assert.equal(
    digest.digest("hex"),
    "63c1b8bfbd88c339bfb5477745a6bfa8f1bddb885206bdede56fd781221139f1",
  );
});

test("depth-two refinement keeps its coarse-grid interface geometrically conforming", () => {
  const cells = surfaceCells({
    width: 3,
    height: 2,
    samples: [0, 0, 0, 1, 1, 1],
    periods: [1, 1, 1, 1, 1, 1],
    escaped: [0, 0, 0, 0, 0, 0],
  });
  const sampler = (x, y) => ({
    samples: new Float32Array([y * y + x * 0.01]),
    period: 1,
    interior: 0.4,
    boundary: 0.2,
    escaped: false,
  });
  const mesh = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler, refinedCells: [{ x: 0, y: 0, depth: 2 }] },
  );

  for (const y of [0.25, 0.5, 0.75]) {
    const vertex = Array.from(
      { length: mesh.positions.length / 3 },
      (_value, index) => index,
    ).find((index) =>
      Math.abs(mesh.positions[index * 3] - 1) < 1e-8 &&
      Math.abs(mesh.positions[index * 3 + 1] - y) < 1e-8);
    assert.notEqual(vertex, undefined);
    assert.ok(Math.abs(mesh.positions[vertex * 3 + 2] - y) < 1e-6);
  }
  assertMeshSound(mesh);
});

test("surface builder gives an isolated vertex an up-facing normal", () => {
  const mesh = surface.buildOrbitSurface(surfaceCells({
    width: 1,
    height: 1,
    samples: [0.25],
    periods: [1],
    escaped: [0],
  }));

  assert.equal(mesh.indices.length, 0);
  assert.deepEqual(Array.from(mesh.normals), [0, 0, 1]);
  assertMeshSound(mesh);
});

test("surface builder feathers exposed topology without dimming the interior", () => {
  const width = 7;
  const height = 7;
  const count = width * height;
  const mesh = surface.buildOrbitSurface(surfaceCells({
    width,
    height,
    samples: Array.from({ length: count }, () => 0),
    periods: Array.from({ length: count }, () => 1),
    escaped: Array.from({ length: count }, () => 0),
  }));

  assert.ok(mesh.edgeFades[0] < mesh.edgeFades[width + 1]);
  assert.ok(mesh.edgeFades[width + 1] < mesh.edgeFades[3 * width + 3]);
  assert.equal(mesh.edgeFades[3 * width + 3], 1);
  assertMeshSound(mesh);
});

test("surface builder sorts phase-shifted period-2 samples into equal-rank sheets", () => {
  const mesh = surface.buildOrbitSurface(
    surfaceCells({
      sampleCount: 2,
      samples: [0.2, -0.2, -0.18, 0.18, 0.16, -0.16, -0.14, 0.14],
      periods: [2, 2, 2, 2],
    }),
  );

  assert.equal(mesh.positions.length / 3, 8);
  assert.equal(mesh.indices.length, 2 * 2 * 3);
  for (let cell = 0; cell < 4; cell += 1) {
    const low = mesh.positions[(cell * 2) * 3 + 2];
    const high = mesh.positions[(cell * 2 + 1) * 3 + 2];
    assert.ok(low < high);
    assert.deepEqual(Array.from(mesh.ranks.subarray(cell * 2, cell * 2 + 2)), [0, 1]);
  }
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ranks = Array.from(mesh.indices.subarray(triangle, triangle + 3), (index) =>
      mesh.ranks[index]);
    assert.equal(new Set(ranks).size, 1);
  }
  assertMeshSound(mesh);
});

test("surface triangles reject each invalid corner independently", () => {
  const cases = [
    {
      name: "escaped",
      cells: surfaceCells({ escaped: [1, 0, 0, 0] }),
    },
    {
      name: "period zero",
      cells: surfaceCells({ periods: [0, 1, 1, 1] }),
    },
    {
      name: "under-sampled period",
      cells: surfaceCells({
        sampleCount: 2,
        samples: [0, 0, 0, 0, 0, 0, 0, 0],
        periods: [3, 1, 1, 1],
      }),
    },
    {
      name: "mixed period",
      cells: surfaceCells({
        sampleCount: 2,
        samples: [0, 0.1, 0, 0, 0, 0, 0, 0],
        periods: [2, 1, 1, 1],
      }),
    },
    {
      name: "excessive height jump",
      cells: surfaceCells({
        samples: [surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP + 0.01, 0, 0, 0],
      }),
    },
  ];

  for (const fixture of cases) {
    const mesh = surface.buildOrbitSurface(fixture.cells);
    assert.equal(mesh.indices.length, 3, fixture.name);
    assertMeshSound(mesh);
  }
});

test("surface contour follows an oblique period-1 to period-2 split", () => {
  const signedDistance = (x, y) => x + 0.37 * y - 2.45;
  const sampler = (x, y) => {
    const side = signedDistance(x, y);
    if (side <= 0) {
      return {
        samples: new Float32Array([0.08 + x * 0.01, 0.08 + x * 0.01]),
        period: 1,
        interior: 0.25,
        boundary: Math.min(1, Math.abs(side)),
        escaped: false,
      };
    }
    return {
      samples: new Float32Array([-0.22 + y * 0.005, 0.22 + y * 0.005]),
      period: 2,
      interior: 0.55,
      boundary: Math.min(1, Math.abs(side)),
      escaped: false,
    };
  };
  const mesh = assertAnalyticContour({
    sampler,
    distanceToBoundary: (x, y) =>
      Math.abs(signedDistance(x, y)) / Math.hypot(1, 0.37),
    expectedPeriods: [1, 2],
  });
  const transitionVertices = [];
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    if (Number.isInteger(x) && Number.isInteger(y)) continue;
    transitionVertices.push(vertex);
  }
  assert.ok(transitionVertices.length > 0);
  const incidence = new Uint16Array(mesh.positions.length / 3);
  for (const vertex of mesh.indices) incidence[vertex] += 1;
  assert.ok(transitionVertices
    .filter((vertex) => incidence[vertex] > 0)
    .every((vertex) => mesh.edgeFades[vertex] === 1));
});

test("surface contour follows an oblique period-1 to escaped split", () => {
  const signedDistance = (x, y) => x - 0.28 * y - 1.65;
  const sampler = (x, y) => {
    const side = signedDistance(x, y);
    if (side <= 0) {
      return {
        samples: new Float32Array([0.14 + y * 0.008, 0.14 + y * 0.008]),
        period: 1,
        interior: 0.35,
        boundary: Math.min(1, Math.abs(side)),
        escaped: false,
      };
    }
    return {
      samples: new Float32Array([0, 0]),
      period: 0,
      interior: 1,
      boundary: 0,
      escaped: true,
    };
  };
  assertAnalyticContour({
    sampler,
    distanceToBoundary: (x, y) =>
      Math.abs(signedDistance(x, y)) / Math.hypot(1, 0.28),
    expectedPeriods: [1],
  });
});

test("chaos contour tessellation is direct, crack-free, smoothed, and deterministic", () => {
  const signedDistance = (x, y) => x + 0.31 * y - 2.65;
  const sampler = (x, y) => {
    const side = signedDistance(x, y);
    if (side <= 0) {
      return {
        samples: new Float32Array([0.04 + x * x * 0.012 + y * 0.009]),
        period: 1,
        interior: 0.3,
        boundary: Math.min(1, Math.abs(side)),
        dissolve: Math.min(1, Math.max(0, -side / 2.5)),
        escaped: false,
      };
    }
    return {
      samples: new Float32Array([0]),
      period: 0,
      interior: 1,
      boundary: 0,
      dissolve: 0,
      escaped: false,
    };
  };
  const cells = analyticSurfaceCells(6, 6, 1, sampler);
  const build = () => surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler },
  );
  const first = build();
  const second = build();
  for (const key of [
    "positions",
    "normals",
    "periods",
    "interiors",
    "boundaries",
    "ranks",
    "edgeFades",
    "dissolves",
    "indices",
  ]) {
    assert.deepEqual(Array.from(first[key]), Array.from(second[key]), key);
  }
  assertMeshSound(first);

  const transition = new Set();
  for (let vertex = 0; vertex < first.positions.length / 3; vertex += 1) {
    const x = first.positions[vertex * 3];
    const y = first.positions[vertex * 3 + 1];
    if (!Number.isInteger(x) || !Number.isInteger(y)) transition.add(vertex);
  }
  const edges = new Map();
  for (let offset = 0; offset < first.indices.length; offset += 3) {
    addEdge(first.indices[offset], first.indices[offset + 1]);
    addEdge(first.indices[offset + 1], first.indices[offset + 2]);
    addEdge(first.indices[offset + 2], first.indices[offset]);
  }
  const adjacency = new Map();
  let directContourEdges = 0;
  for (const edge of edges.values()) {
    if (edge.count !== 1 || !transition.has(edge.first) || !transition.has(edge.second)) {
      continue;
    }
    directContourEdges += 1;
    addNeighbour(edge.first, edge.second);
    addNeighbour(edge.second, edge.first);
  }
  assert.ok(directContourEdges > 2, "trimmed halves should join transition points directly");
  assert.ok([...adjacency.values()].every((neighbours) => neighbours.length <= 2));

  let smoothedVertices = 0;
  for (const [vertex, neighbours] of adjacency) {
    if (neighbours.length !== 2) continue;
    const x = first.positions[vertex * 3];
    const y = first.positions[vertex * 3 + 1];
    const raw = sampler(x, y).samples[0];
    const neighbourRaw = neighbours.map((neighbour) => sampler(
      first.positions[neighbour * 3],
      first.positions[neighbour * 3 + 1],
    ).samples[0]);
    const expected = raw * 0.5 + neighbourRaw[0] * 0.25 + neighbourRaw[1] * 0.25;
    assert.ok(Math.abs(first.positions[vertex * 3 + 2] - expected) < 1e-6);
    assert.equal(first.dissolves[vertex], 0);
    smoothedVertices += 1;
  }
  assert.ok(smoothedVertices > 0);
  assert.ok([...transition].some((vertex) => first.edgeFades[vertex] === 1));

  function addEdge(left, right) {
    const firstVertex = Math.min(left, right);
    const secondVertex = Math.max(left, right);
    const key = `${firstVertex}:${secondVertex}`;
    const edge = edges.get(key);
    if (edge) edge.count += 1;
    else edges.set(key, { first: firstVertex, second: secondVertex, count: 1 });
  }

  function addNeighbour(vertex, neighbour) {
    const neighbours = adjacency.get(vertex) ?? [];
    if (!neighbours.includes(neighbour)) neighbours.push(neighbour);
    adjacency.set(vertex, neighbours);
  }
});

test("projected contour refinement stops at the pixel budget without cracks", () => {
  const sampler = (x, y) => {
    const side = x + 0.18 * y * y - 2.7;
    return side <= 0
      ? {
          samples: new Float32Array([0.08 + x * 0.01]),
          period: 1,
          interior: 0.4,
          boundary: Math.min(1, Math.abs(side)),
          dissolve: Math.min(1, Math.max(0, -side / 2.5)),
          escaped: false,
        }
      : {
          samples: new Float32Array([0]),
          period: 0,
          interior: 1,
          boundary: 0,
          dissolve: 0,
          escaped: false,
        };
  };
  const cells = analyticSurfaceCells(5, 5, 1, sampler);
  const refinedCells = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const periods = [sampler(x, y), sampler(x + 1, y), sampler(x, y + 1), sampler(x + 1, y + 1)]
        .map((sample) => sample.period);
      if (new Set(periods).size < 2) continue;
      const plan = surface.planOrbitSurfaceCellRefinement(
        x,
        y,
        sampler,
        1,
        (gridX, gridY) => ({ x: gridX * 11, y: gridY * 11 }),
        0.75,
        4,
        128 - refinedCells.length,
      );
      assert.ok(plan.maxErrorPx <= 0.75 + 1e-9);
      assert.equal(plan.budgetExhausted, false);
      refinedCells.push(...plan.cells);
    }
  }
  assert.ok(refinedCells.length > 0 && refinedCells.length <= 128);
  const first = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler, refinedCells },
  );
  const second = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler, refinedCells },
  );
  assert.deepEqual(Array.from(first.positions), Array.from(second.positions));
  assert.deepEqual(Array.from(first.indices), Array.from(second.indices));
  assertMeshSound(first);
});

test("c = 0 is the r = 2 logistic fixed point mapped to z = 0 (period 1)", () => {
  const r = 2;
  assert.equal(cFromR(r), 0);

  // Logistic fixed point x* = 1 - 1/r maps to z = 0.
  const zFixed = zFromX(r, 1 - 1 / r);
  assert.equal(zFixed, 0);

  const { period, out } = sampleCell(0, 0);
  assert.equal(period, 1);
  for (const value of out) {
    assert.ok(Math.abs(value - zFixed) < 1e-6);
  }
});

test("c = -1 is the r = 1 + sqrt(5) logistic 2-cycle mapped to {0, -1}", () => {
  const r = 1 + Math.sqrt(5);
  assert.ok(Math.abs(cFromR(r) - -1) < 1e-12);

  // Logistic 2-cycle: x± = (r + 1 ± sqrt((r - 3)(r + 1))) / (2r). At this r
  // the discriminant (r - 3)(r + 1) = (√5 - 2)(√5 + 2) = 1 exactly.
  const disc = Math.sqrt((r - 3) * (r + 1));
  assert.ok(Math.abs(disc - 1) < 1e-12);
  const mapped = [
    zFromX(r, (r + 1 + disc) / (2 * r)),
    zFromX(r, (r + 1 - disc) / (2 * r)),
  ].sort((a, b) => a - b);
  assert.ok(Math.abs(mapped[0] - -1) < 1e-9);
  assert.ok(Math.abs(mapped[1] - 0) < 1e-9);

  const { period, out } = sampleCell(-1, 0);
  assert.equal(period, 2);

  const observed = [out[0], out[1]].sort((a, b) => a - b);
  assert.ok(Math.abs(observed[0] - mapped[0]) < 1e-6);
  assert.ok(Math.abs(observed[1] - mapped[1]) < 1e-6);
  for (let index = 0; index + 2 < out.length; index += 1) {
    assert.ok(Math.abs(out[index + 2] - out[index]) < 1e-6);
  }
  assert.ok(Math.abs(out[1] - out[0]) > 0.5);
});

test("c = -1.76 sits inside the mapped logistic period-3 window (period 3)", () => {
  // The period-3 window opens at r = 1 + sqrt(8) and period-doubles near
  // r ≈ 3.8415; c = -1.76 maps back inside it.
  const r = 1 + Math.sqrt(1 - 4 * -1.76);
  assert.ok(r > 1 + Math.sqrt(8));
  assert.ok(r < 3.8415);

  const { period, out } = sampleCell(-1.76, 0);
  assert.equal(period, 3);

  for (let index = 0; index + 3 < out.length; index += 1) {
    assert.ok(Math.abs(out[index + 3] - out[index]) < 1e-6);
  }

  const levels = [out[0], out[1], out[2]];
  assert.ok(Math.abs(levels[0] - levels[1]) > 1e-3);
  assert.ok(Math.abs(levels[1] - levels[2]) > 1e-3);
  assert.ok(Math.abs(levels[0] - levels[2]) > 1e-3);
});

test("c = 0.5 escapes and contributes nothing", () => {
  const { period, out } = sampleCell(0.5, 0);
  assert.equal(period, model.ESCAPED);
  assert.ok(out.every((value) => value === 0));
});

test("interior measure follows the attracting-cycle multiplier", () => {
  const fixedPointMultiplier = (c) => Math.abs(1 - Math.sqrt(1 - 4 * c));

  const centre = sampleCell(0, 0);
  assert.equal(centre.period, 1);
  assert.ok(Math.abs(centre.interior - 0) < 1e-12);

  const negative = sampleCell(-0.5, 0);
  assert.equal(negative.period, 1);
  assert.ok(Math.abs(negative.interior - fixedPointMultiplier(-0.5)) < 1e-2);
  assert.ok(Math.abs(negative.interior - (Math.sqrt(3) - 1)) < 1e-2);

  const boundaryward = sampleCell(0.24, 0);
  assert.equal(boundaryward.period, 1);
  assert.ok(Math.abs(boundaryward.interior - fixedPointMultiplier(0.24)) < 1e-2);
  assert.ok(Math.abs(boundaryward.interior - 0.8) < 1e-2);

  const chaotic = sampleCell(-1.9, 0);
  assert.equal(chaotic.period, 0);
  assert.equal(chaotic.interior, 1);

  assert.equal(sampleCell(0.5, 0).period, model.ESCAPED);
});

test("sampleAttractorGrid returns contract-shaped typed arrays", () => {
  const field = model.sampleAttractorGrid(
    {
      width: 12,
      height: 8,
      reMin: model.RE_MIN,
      reMax: model.RE_MAX,
      imMin: model.IM_MIN,
      imMax: model.IM_MAX,
    },
    model.DEFAULT_WARMUP_ITERATIONS,
    model.DEFAULT_SAMPLE_COUNT,
  );

  assert.equal(field.width, 12);
  assert.equal(field.height, 8);
  assert.equal(field.samples.length, 12 * 8 * model.DEFAULT_SAMPLE_COUNT);
  assert.equal(field.escaped.length, 12 * 8);
  assert.equal(field.period.length, 12 * 8);

  let escapedCells = 0;
  for (let cell = 0; cell < 12 * 8; cell += 1) {
    if (field.escaped[cell] === 1) {
      escapedCells += 1;
      assert.equal(field.period[cell], 0);
      for (let s = 0; s < field.sampleCount; s += 1) {
        assert.equal(field.samples[cell * field.sampleCount + s], 0);
      }
    }
    for (let s = 0; s < field.sampleCount; s += 1) {
      const value = field.samples[cell * field.sampleCount + s];
      assert.ok(value >= -model.SAMPLE_CLIP && value <= model.SAMPLE_CLIP);
    }
  }
  assert.ok(escapedCells > 0);
  assert.ok(escapedCells < 12 * 8);
});

test("kernel grid output dimensions and channel ranges honour the contract", () => {
  const width = 30;
  const height = 20;
  const kernel = runKernel({}, width, height);
  const state = kernel.readState();

  assert.ok(state instanceof Float32Array);
  assert.equal(state.length, width * height * kernel.channelCount);
  assert.equal(kernel.readState(), state);

  let inSet = 0;
  let escaped = 0;
  for (let cell = 0; cell < width * height; cell += 1) {
    const density = state[cell * 2];
    const period = state[cell * 2 + 1];

    assert.ok(density >= 0 && density <= 1);
    assert.ok(period >= 0 && period <= model.MAX_DETECTABLE_PERIOD);
    assert.ok(Number.isInteger(period));

    if (density === 0) {
      escaped += 1;
      assert.equal(period, 0);
    } else {
      inSet += 1;
    }
  }
  assert.ok(inSet > 0, "some cells hold a bounded attractor");
  assert.ok(escaped > 0, "some cells escape");

  // Cell centres nearest the main cardioid and the period-2 disc.
  const cellNear = (re, im) => {
    const x = Math.round(
      ((re - model.RE_MIN) / (model.RE_MAX - model.RE_MIN)) * width - 0.5,
    );
    const y = Math.round(
      ((im - model.IM_MIN) / (model.IM_MAX - model.IM_MIN)) * height - 0.5,
    );
    return y * width + x;
  };
  const cardioid = cellNear(-0.5, 0) * 2;
  assert.equal(state[cardioid], 1);
  assert.equal(state[cardioid + 1], 1);
  const disc = cellNear(-1, 0) * 2;
  assert.equal(state[disc], 0.5);
  assert.equal(state[disc + 1], 2);
});

test("missing params use schema defaults", () => {
  const defaults = defaultsFromSchema(new LogisticMandelbrotKernel());

  assert.deepEqual(
    Array.from(runKernel({}).readState()),
    Array.from(runKernel(defaults).readState()),
  );
});

test("repeated runs are deterministic for the same params and steps", () => {
  const params = { warmupIterations: 150, sampleCount: 32, plottedIterations: 32 };

  assert.deepEqual(
    Array.from(runKernel(params).readState()),
    Array.from(runKernel(params).readState()),
  );
});

test("plotted iterations = 1 collapses the period structure", () => {
  const width = 30;
  const height = 20;
  const full = runKernel({}, width, height).readState();
  const collapsed = runKernel({ plottedIterations: 1 }, width, height).readState();

  const densities = (state) =>
    new Set(
      Array.from({ length: width * height }, (_v, cell) => state[cell * 2]).filter(
        (value) => value > 0,
      ),
    );

  // Full window: cardioid (1), period-2 disc (0.5), and more bands coexist.
  assert.ok(densities(full).size > 2);

  // One plotted sample: every bounded cell is a single level, no periods.
  assert.deepEqual(Array.from(densities(collapsed)), [1]);
  for (let cell = 0; cell < width * height; cell += 1) {
    assert.equal(collapsed[cell * 2 + 1], 0);
  }
});

test("real-slice-only repeats the bifurcation slice down every column", () => {
  const width = 30;
  const height = 20;
  const state = runKernel({ realSliceOnly: true }, width, height).readState();

  const row = (y) =>
    Array.from(state.subarray(y * width * 2, (y + 1) * width * 2));
  assert.deepEqual(row(0), row(10));
  assert.deepEqual(row(19), row(10));

  // Column at Re(c) = -1.35 maps to r = 1 + sqrt(6.4) ≈ 3.53, inside the
  // logistic period-4 window (3.4495 < r < 3.5441).
  const x = Math.round(
    ((-1.35 - model.RE_MIN) / (model.RE_MAX - model.RE_MIN)) * width - 0.5,
  );
  assert.equal(state[x * 2 + 1], 4);
});

test("destroy releases state and leaves step/readState safe", () => {
  const kernel = runKernel({}, 12, 10, 2);

  kernel.destroy();
  assert.equal(kernel.readState().length, 0);

  assert.doesNotThrow(() => {
    kernel.step(1 / 60);
  });
  assert.equal(kernel.readState().length, 0);
});

test("selfTest passes", () => {
  assert.equal(selfTest(), true);
});
