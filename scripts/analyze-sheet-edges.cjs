#!/usr/bin/env node

const path = require("node:path");

const surface = require(path.join(
  __dirname,
  "..",
  "src",
  "app",
  "orbitSurface.ts",
));
const curves = require(path.join(
  __dirname,
  "..",
  "src",
  "app",
  "orbitSurfaceCurves.ts",
));
const model = require(path.join(
  __dirname,
  "..",
  ".test-build",
  "sims",
  "logistic-mandelbrot",
  "model.js",
));

const WARMUP_ITERATIONS = 1500;
const SAMPLE_COUNT = 8;
const REFERENCE_DEPTH = 5;
const REFERENCE_BISECTION_STEPS = 12;
const DEPTHS = [1, 2, 3, 4, 5];
const EDGE_ERROR_PX = 0.5;
const MAX_REFINEMENT_DEPTH = 5;
const REFINEMENT_CELL_BUDGET = 32768;
const DISSOLVE_BAND_CELLS = 8;
const BAND_CANDIDATE_SUBDIVISION = 5;
const BAND_SAMPLES_PER_CELL = 4;
const BAND_SAMPLE_SPAN_CELLS = 0.25;
const VERIFIER_VIEWPORT = { width: 1280, height: 720, pixelsPerCell: 8 };
const ANALYTIC_CURVE_MAX_CHORD_ERROR_C = 0.00075;
const WINDOWS = [
  {
    name: "full-default",
    width: 19,
    height: 13,
    reMin: -2,
    reMax: 1,
    imMin: -1,
    imMax: 1,
  },
  {
    name: "period-2-bulb",
    width: 21,
    height: 21,
    reMin: -1.32,
    reMax: -0.68,
    imMin: -0.34,
    imMax: 0.34,
  },
];

const results = WINDOWS.flatMap(analyseWindow);
const bandDensityResults = WINDOWS.map(analyseBandDensity);
const baselineAdaptiveResults = WINDOWS.map((spec) => analyseAdaptiveWindow(spec, {
  edgeErrorPx: 0.75,
  maxRefinementDepth: 4,
}));
const adaptiveResults = WINDOWS.map((spec) => analyseAdaptiveWindow(spec, {
  edgeErrorPx: EDGE_ERROR_PX,
  maxRefinementDepth: MAX_REFINEMENT_DEPTH,
}));
const analyticCurveResults = WINDOWS.map(analyseAnalyticCurveWindow);
const costResults = WINDOWS.map((spec, index) => {
  const baseline = baselineAdaptiveResults[index];
  const adaptive = adaptiveResults[index];
  const density = bandDensityResults[index];
  const pointBytes = SAMPLE_COUNT * 28;
  return {
    window: spec.name,
    beforeRefinedCells: baseline.refinedCells,
    afterRefinedCells: adaptive.refinedCells,
    beforeBandPointCount: density.baseBandSites * SAMPLE_COUNT,
    afterBandPointCount: density.bandPointCount,
    beforePeakGeometryBytes:
      baseline.meshGeometryBytes + density.boundedSites * pointBytes,
    afterPeakGeometryBytes:
      adaptive.meshGeometryBytes
        + (density.boundedSites + density.addedBandSites) * pointBytes,
  };
});

console.log("Logistic Mandelbrot sheet-edge analysis");
console.log(
  `warmup=${WARMUP_ITERATIONS} samples=${SAMPLE_COUNT} referenceDepth=${REFERENCE_DEPTH} referenceBisections=${REFERENCE_BISECTION_STEPS}`,
);
console.log("");
console.log(
  [
    "Window".padEnd(20),
    "Depth".padStart(5),
    "Segments".padStart(10),
    "Refined cells".padStart(14),
    "Mean dev".padStart(11),
    "Max dev".padStart(11),
    "Alternation".padStart(12),
  ].join("  "),
);
for (const row of results) {
  console.log(
    [
      row.window.padEnd(20),
      String(row.depth).padStart(5),
      String(row.boundarySegments).padStart(10),
      String(row.refinedCells).padStart(14),
      row.meanDeviation.toFixed(6).padStart(11),
      row.maxDeviation.toFixed(6).padStart(11),
      row.alternation.toFixed(6).padStart(12),
    ].join("  "),
  );
}
console.log("");
console.log("Adaptive projected-error result");
console.log(
  [
    "Window".padEnd(20),
    "Segments".padStart(10),
    "Leaf cells".padStart(12),
    "Max chord px".padStart(13),
    "Alternation".padStart(12),
    "Budget".padStart(9),
  ].join("  "),
);
for (const row of adaptiveResults) {
  console.log(
    [
      row.window.padEnd(20),
      String(row.acceptedContourSegments).padStart(10),
      String(row.refinedCells).padStart(12),
      row.maxChordErrorPx.toFixed(6).padStart(13),
      row.alternation.toFixed(6).padStart(12),
      (row.budgetExhausted ? "exhausted" : "within").padStart(9),
    ].join("  "),
  );
}
console.log("");
console.log("Silhouette error against analytic period-1 and period-2 curves");
console.log(
  [
    "Window".padEnd(20),
    "Sampled ref px".padStart(15),
    "Adaptive mesh px".padStart(17),
    "Trace chord px".padStart(15),
    "Curve points".padStart(14),
  ].join("  "),
);
for (const row of analyticCurveResults) {
  console.log(
    [
      row.window.padEnd(20),
      row.sampledReferenceMaxErrorPx.toFixed(6).padStart(15),
      row.adaptiveMeshMaxErrorPx.toFixed(6).padStart(17),
      row.tracedCurveMaxChordErrorPx.toFixed(6).padStart(15),
      String(row.tracedCurvePoints).padStart(14),
    ].join("  "),
  );
}
console.log("");
console.log("Chaotic cloud density in the sheet-edge band");
console.log(
  [
    "Window".padEnd(20),
    "Base sites".padStart(11),
    "Added sites".padStart(12),
    "Band points".padStart(12),
    "Uplift".padStart(9),
  ].join("  "),
);
for (const row of bandDensityResults) {
  console.log(
    [
      row.window.padEnd(20),
      String(row.baseBandSites).padStart(11),
      String(row.addedBandSites).padStart(12),
      String(row.bandPointCount).padStart(12),
      `${row.bandDensityUplift.toFixed(3)}x`.padStart(9),
    ].join("  "),
  );
}
console.log("");
console.log("Fixed-fixture geometry cost before and after");
console.log(
  [
    "Window".padEnd(20),
    "Leaves before/after".padStart(21),
    "Band points before/after".padStart(26),
    "Geometry bytes before/after".padStart(29),
  ].join("  "),
);
for (const row of costResults) {
  console.log(
    [
      row.window.padEnd(20),
      `${row.beforeRefinedCells}/${row.afterRefinedCells}`.padStart(21),
      `${row.beforeBandPointCount}/${row.afterBandPointCount}`.padStart(26),
      `${row.beforePeakGeometryBytes}/${row.afterPeakGeometryBytes}`.padStart(29),
    ].join("  "),
  );
}
console.log("");
console.log("JSON_BEGIN");
console.log(JSON.stringify({
  configuration: {
    warmupIterations: WARMUP_ITERATIONS,
    sampleCount: SAMPLE_COUNT,
    referenceDepth: REFERENCE_DEPTH,
    referenceBisectionSteps: REFERENCE_BISECTION_STEPS,
    edgeErrorPx: EDGE_ERROR_PX,
    maxRefinementDepth: MAX_REFINEMENT_DEPTH,
    refinementCellBudget: REFINEMENT_CELL_BUDGET,
    dissolveBandCells: DISSOLVE_BAND_CELLS,
    bandCandidateSubdivision: BAND_CANDIDATE_SUBDIVISION,
    bandSamplesPerCell: BAND_SAMPLES_PER_CELL,
    bandSampleSpanCells: BAND_SAMPLE_SPAN_CELLS,
    verifierViewport: VERIFIER_VIEWPORT,
    analyticCurveMaxChordErrorC: ANALYTIC_CURVE_MAX_CHORD_ERROR_C,
    windows: WINDOWS,
  },
  results,
  baselineAdaptiveResults,
  adaptiveResults,
  analyticCurveResults,
  bandDensityResults,
  costResults,
}, null, 2));
console.log("JSON_END");

function analyseWindow(spec) {
  const context = createSampler(spec);
  const cells = buildCoarseCells(spec, context.sample);
  const boundaryCells = findBoundaryCells(cells);
  const coarseQuadCount = (spec.width - 1) * (spec.height - 1);
  const reference = buildReferenceContour(spec, boundaryCells, context.sample);

  return DEPTHS.map((depth) => {
    const mesh = surface.buildOrbitSurface(
      cells,
      surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
      {
        sampler: context.sample,
        refinedCells: boundaryCells.map(({ x, y }) => ({ x, y, depth })),
      },
    );
    const contour = extractSilhouette(mesh, depth, spec.width, spec.height);
    const metrics = measureContour(contour, reference);
    return {
      window: spec.name,
      depth,
      boundarySegments: contour.segments.length,
      refinedCells: boundaryCells.length * 4 ** depth,
      boundaryCoarseCells: boundaryCells.length,
      refinedCellShare: rounded(boundaryCells.length / coarseQuadCount),
      meanDeviation: rounded(metrics.meanDeviation),
      maxDeviation: rounded(metrics.maxDeviation),
      alternation: rounded(metrics.alternation),
      residualPairs: metrics.residualPairs,
    };
  });
}

function analyseAdaptiveWindow(spec, configuration) {
  const context = createSampler(spec);
  const cells = buildCoarseCells(spec, context.sample);
  const boundaryCells = findBoundaryCells(cells);
  const coarseQuadCount = (spec.width - 1) * (spec.height - 1);
  const reference = buildReferenceContour(spec, boundaryCells, context.sample);
  const refinedCells = [];
  let maxChordErrorPx = 0;
  let acceptedContourSegments = 0;
  let budgetExhausted = false;
  const project = (x, y, height) => ({
    x: x * VERIFIER_VIEWPORT.pixelsPerCell,
    y: y * VERIFIER_VIEWPORT.pixelsPerCell - height * 3,
  });
  for (const cell of boundaryCells) {
    const remaining = REFINEMENT_CELL_BUDGET - refinedCells.length;
    if (remaining <= 0) {
      budgetExhausted = true;
      break;
    }
    const plan = surface.planOrbitSurfaceCellRefinement(
      cell.x,
      cell.y,
      context.sample,
      SAMPLE_COUNT,
      project,
      configuration.edgeErrorPx,
      configuration.maxRefinementDepth,
      remaining,
    );
    refinedCells.push(...plan.cells);
    maxChordErrorPx = Math.max(maxChordErrorPx, plan.maxErrorPx);
    acceptedContourSegments += plan.segmentCount;
    budgetExhausted ||= plan.budgetExhausted;
  }
  const mesh = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler: context.sample, refinedCells },
  );
  const contour = extractSilhouette(
    mesh,
    configuration.maxRefinementDepth,
    spec.width,
    spec.height,
  );
  const metrics = measureContour(contour, reference);
  return {
    window: spec.name,
    acceptedContourSegments,
    boundarySegments: contour.segments.length,
    refinedCells: refinedCells.length,
    maxUsedDepth: refinedCells.reduce((deepest, cell) => Math.max(deepest, cell.depth), 0),
    boundaryCoarseCells: boundaryCells.length,
    refinedCellShare: rounded(boundaryCells.length / coarseQuadCount),
    maxChordErrorPx: rounded(maxChordErrorPx),
    alternation: rounded(metrics.alternation),
    residualPairs: metrics.residualPairs,
    budgetExhausted,
    meshGeometryBytes: orbitSurfaceMeshBytes(mesh),
  };
}

function analyseAnalyticCurveWindow(spec) {
  const context = createSampler(spec);
  const cells = buildCoarseCells(spec, context.sample);
  const boundaryCells = findBoundaryCells(cells);
  const sampledReference = buildReferenceContour(spec, boundaryCells, context.sample);
  const analytic = buildAnalyticReference(spec);
  const sampledMetrics = measureSegmentsAgainstReference(sampledReference, analytic.segments);

  const refinedCells = [];
  const project = (x, y, height) => ({
    x: x * VERIFIER_VIEWPORT.pixelsPerCell,
    y: y * VERIFIER_VIEWPORT.pixelsPerCell - height * 3,
  });
  for (const cell of boundaryCells) {
    const remaining = REFINEMENT_CELL_BUDGET - refinedCells.length;
    if (remaining <= 0) break;
    const plan = surface.planOrbitSurfaceCellRefinement(
      cell.x,
      cell.y,
      context.sample,
      SAMPLE_COUNT,
      project,
      EDGE_ERROR_PX,
      MAX_REFINEMENT_DEPTH,
      remaining,
    );
    refinedCells.push(...plan.cells);
  }
  const mesh = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler: context.sample, refinedCells },
  );
  const contour = extractSilhouette(
    mesh,
    MAX_REFINEMENT_DEPTH,
    spec.width,
    spec.height,
  );
  const adaptiveMetrics = measureSegmentsAgainstReference(contour.segments, analytic.segments);
  return {
    window: spec.name,
    modelledPeriods: [1, 2],
    sampledReferenceVertices: sampledMetrics.vertexCount,
    sampledReferenceMeanErrorPx: rounded(
      sampledMetrics.meanDeviation * VERIFIER_VIEWPORT.pixelsPerCell,
    ),
    sampledReferenceMaxErrorPx: rounded(
      sampledMetrics.maxDeviation * VERIFIER_VIEWPORT.pixelsPerCell,
    ),
    adaptiveMeshVertices: adaptiveMetrics.vertexCount,
    adaptiveMeshMeanErrorPx: rounded(
      adaptiveMetrics.meanDeviation * VERIFIER_VIEWPORT.pixelsPerCell,
    ),
    adaptiveMeshMaxErrorPx: rounded(
      adaptiveMetrics.maxDeviation * VERIFIER_VIEWPORT.pixelsPerCell,
    ),
    tracedCurveMaxChordErrorPx: rounded(analytic.maxChordErrorPx),
    tracedCurvePoints: analytic.pointCount,
  };
}

function buildAnalyticReference(spec) {
  const xScale = spec.width / (spec.reMax - spec.reMin);
  const yScale = spec.height / (spec.imMax - spec.imMin);
  const segments = [];
  let maxChordErrorPx = 0;
  let pointCount = 0;
  for (const period of [1, 2]) {
    const curve = curves.tracePrimaryOrbitSurfaceBoundary(
      period,
      ANALYTIC_CURVE_MAX_CHORD_ERROR_C,
    );
    const points = curve.points.map((pointValue) => ({
      x: (pointValue.c.re - spec.reMin) * xScale - 0.5,
      y: (pointValue.c.im - spec.imMin) * yScale - 0.5,
    }));
    pointCount += points.length;
    maxChordErrorPx = Math.max(
      maxChordErrorPx,
      curve.maxChordError * Math.max(xScale, yScale) * VERIFIER_VIEWPORT.pixelsPerCell,
    );
    for (let index = 1; index < points.length; index += 1) {
      segments.push({ first: points[index - 1], second: points[index], period });
    }
  }
  return { segments, maxChordErrorPx, pointCount };
}

function measureSegmentsAgainstReference(candidateSegments, reference) {
  const referenceByPeriod = new Map();
  for (const segment of reference) {
    const list = referenceByPeriod.get(segment.period) ?? [];
    list.push(segment);
    referenceByPeriod.set(segment.period, list);
  }
  const vertices = new Map();
  for (const segment of candidateSegments) {
    if (!referenceByPeriod.has(segment.period)) continue;
    vertices.set(`${segment.period}|${pointKey(segment.first)}`, {
      ...segment.first,
      period: segment.period,
    });
    vertices.set(`${segment.period}|${pointKey(segment.second)}`, {
      ...segment.second,
      period: segment.period,
    });
  }
  const deviations = [];
  let maxDeviation = 0;
  for (const vertex of vertices.values()) {
    const nearest = nearestReference(vertex, referenceByPeriod.get(vertex.period) ?? []);
    if (!nearest) continue;
    deviations.push(nearest.distance);
    maxDeviation = Math.max(maxDeviation, nearest.distance);
  }
  return {
    vertexCount: deviations.length,
    meanDeviation: deviations.length === 0
      ? 0
      : deviations.reduce((sum, value) => sum + value, 0) / deviations.length,
    maxDeviation,
  };
}

function analyseBandDensity(spec) {
  const context = createSampler(spec);
  const cells = buildCoarseCells(spec, context.sample);
  const periodicSites = [];
  for (let index = 0; index < cells.periods.length; index += 1) {
    if (cells.escaped[index] === 0 && cells.periods[index] > 0) {
      periodicSites.push({ x: index % cells.width, y: Math.floor(index / cells.width) });
    }
  }
  let baseBandSites = 0;
  let addedBandSites = 0;
  let boundedSites = 0;
  for (let index = 0; index < cells.periods.length; index += 1) {
    if (cells.escaped[index] === 0) boundedSites += 1;
    if (cells.escaped[index] !== 0 || cells.periods[index] !== 0) continue;
    const x = index % cells.width;
    const y = Math.floor(index / cells.width);
    const periodicDistance = nearestSiteDistance(x, y, periodicSites);
    if (!surface.isOrbitSurfaceCloudBandSample(
      0,
      false,
      periodicDistance,
      DISSOLVE_BAND_CELLS,
    )) {
      continue;
    }
    baseBandSites += 1;
    let accepted = 0;
    for (let subY = 0; subY < BAND_CANDIDATE_SUBDIVISION; subY += 1) {
      for (let subX = 0; subX < BAND_CANDIDATE_SUBDIVISION; subX += 1) {
        if (accepted >= BAND_SAMPLES_PER_CELL) break;
        const sampleX = x
          + ((subX + 0.5) / BAND_CANDIDATE_SUBDIVISION - 0.5)
            * BAND_SAMPLE_SPAN_CELLS;
        const sampleY = y
          + ((subY + 0.5) / BAND_CANDIDATE_SUBDIVISION - 0.5)
            * BAND_SAMPLE_SPAN_CELLS;
        if (
          (sampleX === x && sampleY === y) ||
          sampleX < 0 || sampleX > cells.width - 1 ||
          sampleY < 0 || sampleY > cells.height - 1
        ) {
          continue;
        }
        const sampled = context.sample(sampleX, sampleY);
        if (!sampled.escaped && sampled.period === 0) {
          addedBandSites += 1;
          accepted += 1;
        }
      }
    }
  }
  const totalBandSites = baseBandSites + addedBandSites;
  return {
    window: spec.name,
    boundedSites,
    baseBandSites,
    addedBandSites,
    bandPointCount: totalBandSites * SAMPLE_COUNT,
    bandDensityUplift: rounded(baseBandSites === 0 ? 1 : totalBandSites / baseBandSites),
  };
}

function orbitSurfaceMeshBytes(mesh) {
  return [
    mesh.positions,
    mesh.normals,
    mesh.periods,
    mesh.interiors,
    mesh.boundaries,
    mesh.ranks,
    mesh.edgeFades,
    mesh.dissolves,
    mesh.indices,
  ].reduce((sum, values) => sum + values.byteLength, 0);
}

function nearestSiteDistance(x, y, sites) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const site of sites) nearest = Math.min(nearest, Math.hypot(x - site.x, y - site.y));
  return nearest;
}

function createSampler(spec) {
  const cache = new Map();
  const sample = (x, y) => {
    const key = `${coordinateKey(x)},${coordinateKey(y)}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const values = new Float32Array(SAMPLE_COUNT);
    const measure = { interior: 1 };
    const cRe = gridCoordinate(spec.reMin, spec.reMax, x, spec.width);
    const cIm = y === Math.floor(spec.height / 2)
      ? 0
      : gridCoordinate(spec.imMin, spec.imMax, y, spec.height);
    const detected = model.sampleAttractorCell(
      cRe,
      cIm,
      WARMUP_ITERATIONS,
      SAMPLE_COUNT,
      values,
      0,
      measure,
    );
    const escaped = detected === model.ESCAPED;
    const result = {
      samples: values,
      period: escaped ? 0 : detected,
      interior: escaped ? 1 : measure.interior,
      boundary: 0,
      escaped,
    };
    cache.set(key, result);
    return result;
  };
  return { sample };
}

function buildCoarseCells(spec, sampler) {
  const cellCount = spec.width * spec.height;
  const samples = new Float32Array(cellCount * SAMPLE_COUNT);
  const periods = new Int16Array(cellCount);
  const interiors = new Float32Array(cellCount);
  const boundaries = new Float32Array(cellCount);
  const escaped = new Uint8Array(cellCount);
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const cell = y * spec.width + x;
      const sampled = sampler(x, y);
      periods[cell] = sampled.period;
      interiors[cell] = sampled.interior;
      escaped[cell] = sampled.escaped ? 1 : 0;
      samples.set(sampled.samples, cell * SAMPLE_COUNT);
    }
  }
  return {
    width: spec.width,
    height: spec.height,
    sampleCount: SAMPLE_COUNT,
    samples,
    periods,
    interiors,
    boundaries,
    escaped,
  };
}

function findBoundaryCells(cells) {
  const boundary = [];
  const periodAt = (index) =>
    cells.escaped[index] === 0 && cells.periods[index] > 0
      ? cells.periods[index]
      : 0;
  for (let y = 0; y + 1 < cells.height; y += 1) {
    for (let x = 0; x + 1 < cells.width; x += 1) {
      const topLeft = y * cells.width + x;
      const periods = [
        periodAt(topLeft),
        periodAt(topLeft + 1),
        periodAt(topLeft + cells.width),
        periodAt(topLeft + cells.width + 1),
      ];
      if (periods.some((period) => period > 0) && periods.some((period) => period !== periods[0])) {
        boundary.push({ x, y });
      }
    }
  }
  return boundary;
}

function buildReferenceContour(spec, boundaryCells, sampler) {
  const divisions = 2 ** REFERENCE_DEPTH;
  const segments = [];
  const seen = new Set();
  for (const cell of boundaryCells) {
    for (let subY = 0; subY < divisions; subY += 1) {
      for (let subX = 0; subX < divisions; subX += 1) {
        const x0 = cell.x + subX / divisions;
        const y0 = cell.y + subY / divisions;
        const x1 = cell.x + (subX + 1) / divisions;
        const y1 = cell.y + (subY + 1) / divisions;
        const topLeft = point(x0, y0, sampler);
        const topRight = point(x1, y0, sampler);
        const bottomLeft = point(x0, y1, sampler);
        const bottomRight = point(x1, y1, sampler);
        addReferenceTriangle([topLeft, bottomLeft, topRight]);
        addReferenceTriangle([topRight, bottomLeft, bottomRight]);
      }
    }
  }
  return segments;

  function addReferenceTriangle(corners) {
    const periods = [...new Set(corners.map((corner) => corner.period))]
      .filter((period) => period > 0)
      .sort((left, right) => left - right);
    for (const period of periods) {
      const intersections = [];
      for (let index = 0; index < 3; index += 1) {
        const first = corners[index];
        const second = corners[(index + 1) % 3];
        if ((first.period === period) !== (second.period === period)) {
          intersections.push(referenceTransition(first, second, period, sampler));
        }
      }
      if (intersections.length !== 2) continue;
      let [first, second] = intersections;
      const inside = corners.find((corner) => corner.period === period);
      if (cross(first, second, inside) < 0) [first, second] = [second, first];
      const endpoints = [pointKey(first), pointKey(second)].sort();
      const key = `${period}|${endpoints[0]}|${endpoints[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({ first, second, period });
    }
  }
}

function point(x, y, sampler) {
  const sample = sampler(x, y);
  return {
    x,
    y,
    period: sample.escaped || sample.period <= 0 || sample.period > SAMPLE_COUNT
      ? 0
      : sample.period,
  };
}

function referenceTransition(first, second, targetPeriod, sampler) {
  let low = first;
  let high = second;
  const lowInside = low.period === targetPeriod;
  for (let step = 0; step < REFERENCE_BISECTION_STEPS; step += 1) {
    const middle = point((low.x + high.x) * 0.5, (low.y + high.y) * 0.5, sampler);
    if ((middle.period === targetPeriod) === lowInside) low = middle;
    else high = middle;
  }
  return { x: (low.x + high.x) * 0.5, y: (low.y + high.y) * 0.5 };
}

function extractSilhouette(mesh, depth, width, height) {
  const edgeCounts = new Map();
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    countEdge(mesh.indices[offset], mesh.indices[offset + 1]);
    countEdge(mesh.indices[offset + 1], mesh.indices[offset + 2]);
    countEdge(mesh.indices[offset + 2], mesh.indices[offset]);
  }
  const divisions = 2 ** depth;
  const segments = [];
  const seen = new Set();
  for (const edge of edgeCounts.values()) {
    if (edge.count !== 1) continue;
    const first = meshPoint(mesh, edge.first);
    const second = meshPoint(mesh, edge.second);
    if (
      first.rank !== 0 ||
      second.rank !== 0 ||
      first.period <= 0 ||
      first.period !== second.period ||
      !isTransitionPoint(first, divisions) ||
      !isTransitionPoint(second, divisions) ||
      isWindowEdge(first, width, height) ||
      isWindowEdge(second, width, height)
    ) {
      continue;
    }
    const firstKey = `${first.period}|${pointKey(first)}`;
    const secondKey = `${second.period}|${pointKey(second)}`;
    const endpoints = [firstKey, secondKey].sort();
    const key = `${endpoints[0]}|${endpoints[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    segments.push({ first, second, firstKey, secondKey, period: first.period });
  }
  return { segments };

  function countEdge(first, second) {
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    const key = `${low}:${high}`;
    const edge = edgeCounts.get(key);
    if (edge) edge.count += 1;
    else edgeCounts.set(key, { first: low, second: high, count: 1 });
  }
}

function measureContour(contour, reference) {
  const referenceByPeriod = new Map();
  for (const segment of reference) {
    const list = referenceByPeriod.get(segment.period) ?? [];
    list.push(segment);
    referenceByPeriod.set(segment.period, list);
  }
  const nodes = new Map();
  const adjacency = new Map();
  contour.segments.forEach((segment, index) => {
    nodes.set(segment.firstKey, segment.first);
    nodes.set(segment.secondKey, segment.second);
    addAdjacent(segment.firstKey, index);
    addAdjacent(segment.secondKey, index);
  });
  const residuals = new Map();
  const deviations = [];
  for (const [key, vertex] of nodes) {
    const nearest = nearestReference(vertex, referenceByPeriod.get(vertex.period) ?? []);
    if (!nearest) continue;
    residuals.set(key, nearest.signed);
    deviations.push(nearest.distance);
  }

  let flips = 0;
  let residualPairs = 0;
  const visited = new Set();
  for (let seed = 0; seed < contour.segments.length; seed += 1) {
    if (visited.has(seed)) continue;
    const seedSegment = contour.segments[seed];
    const start = (adjacency.get(seedSegment.firstKey)?.length ?? 0) === 1
      ? seedSegment.firstKey
      : seedSegment.secondKey;
    const chain = [];
    let current = start;
    while (true) {
      chain.push(current);
      const nextEdge = (adjacency.get(current) ?? []).find((edge) => !visited.has(edge));
      if (nextEdge === undefined) break;
      visited.add(nextEdge);
      const segment = contour.segments[nextEdge];
      current = segment.firstKey === current ? segment.secondKey : segment.firstKey;
    }
    for (let index = 1; index < chain.length; index += 1) {
      const first = residuals.get(chain[index - 1]);
      const second = residuals.get(chain[index]);
      if (first === undefined || second === undefined) continue;
      if (Math.abs(first) <= 1e-8 || Math.abs(second) <= 1e-8) continue;
      residualPairs += 1;
      if (Math.sign(first) !== Math.sign(second)) flips += 1;
    }
  }
  return {
    meanDeviation: deviations.length === 0
      ? 0
      : deviations.reduce((sum, value) => sum + value, 0) / deviations.length,
    maxDeviation: deviations.length === 0 ? 0 : Math.max(...deviations),
    alternation: residualPairs === 0 ? 0 : flips / residualPairs,
    residualPairs,
  };

  function addAdjacent(key, edge) {
    const list = adjacency.get(key) ?? [];
    list.push(edge);
    adjacency.set(key, list);
  }
}

function nearestReference(vertex, segments) {
  let best = null;
  for (const segment of segments) {
    const dx = segment.second.x - segment.first.x;
    const dy = segment.second.y - segment.first.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= Number.EPSILON) continue;
    const amount = Math.max(0, Math.min(1,
      ((vertex.x - segment.first.x) * dx + (vertex.y - segment.first.y) * dy)
        / lengthSquared,
    ));
    const nearestX = segment.first.x + amount * dx;
    const nearestY = segment.first.y + amount * dy;
    const offsetX = vertex.x - nearestX;
    const offsetY = vertex.y - nearestY;
    const distance = Math.hypot(offsetX, offsetY);
    if (!best || distance < best.distance) {
      best = {
        distance,
        signed: (dx * (vertex.y - segment.first.y) - dy * (vertex.x - segment.first.x))
          / Math.sqrt(lengthSquared),
      };
    }
  }
  return best;
}

function meshPoint(mesh, vertex) {
  return {
    x: mesh.positions[vertex * 3],
    y: mesh.positions[vertex * 3 + 1],
    period: mesh.periods[vertex],
    rank: mesh.ranks[vertex],
  };
}

function isTransitionPoint(pointValue, divisions) {
  return !nearInteger(pointValue.x * divisions) || !nearInteger(pointValue.y * divisions);
}

function isWindowEdge(pointValue, width, height) {
  return Math.abs(pointValue.x) < 1e-8 ||
    Math.abs(pointValue.y) < 1e-8 ||
    Math.abs(pointValue.x - (width - 1)) < 1e-8 ||
    Math.abs(pointValue.y - (height - 1)) < 1e-8;
}

function nearInteger(value) {
  return Math.abs(value - Math.round(value)) < 1e-7;
}

function cross(first, second, pointValue) {
  return (second.x - first.x) * (pointValue.y - first.y)
    - (second.y - first.y) * (pointValue.x - first.x);
}

function pointKey(pointValue) {
  return `${coordinateKey(pointValue.x)},${coordinateKey(pointValue.y)}`;
}

function coordinateKey(value) {
  return value.toFixed(12);
}

function gridCoordinate(min, max, index, count) {
  return min + ((index + 0.5) / count) * (max - min);
}

function rounded(value) {
  return Number(value.toFixed(6));
}
