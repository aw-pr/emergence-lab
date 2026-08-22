#!/usr/bin/env node

const path = require("node:path");

const surface = require(path.join(
  __dirname,
  "..",
  "src",
  "app",
  "orbitSurface.ts",
));
const orbit3d = require(path.join(
  __dirname,
  "..",
  "src",
  "app",
  "orbit3d.ts",
));
const curves = require(path.join(
  __dirname,
  "..",
  "src",
  "app",
  "orbitSurfaceCurves.ts",
));
const components = require(path.join(
  __dirname,
  "..",
  "src",
  "app",
  "orbitSurfaceComponents.ts",
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
const ANALYTIC_EDGE_ERROR_PX = 0.25;
const MAX_REFINEMENT_DEPTH = 5;
const ANALYTIC_MAX_REFINEMENT_DEPTH = 4;
const REFINEMENT_CELL_BUDGET = 32768;
const ANALYTIC_REFINEMENT_CELL_BUDGET = 5592;
// Sheet-side fade width, unchanged from stage 52.
const DISSOLVE_BAND_CELLS = 8;
// Cloud-side band, re-tuned by this stage.
const CLOUD_BAND_CELLS = 12;
const BAND_CANDIDATE_SUBDIVISION = 7;
const BAND_SAMPLES_PER_CELL = 16;
const BAND_SAMPLE_SPAN_CELLS = 0.75;
const BAND_SAMPLE_WEIGHT = 0.5;
const CLOUD_REFINEMENT_SUBDIVISION = 3;
const CLOUD_REFINEMENT_OFFSETS = surface.orbitSurfaceCloudRefinementOffsets(
  CLOUD_REFINEMENT_SUBDIVISION,
);
// Attempt-1 verifier measurements at one matched 1280 by 720 framing. The
// stage-55 runtime now uses the same GPU cloud build and 16M point budget in
// both modes, so the after total is the measured live cloud reference rather
// than a small-window lattice extrapolation.
const LIVE_CLOUD_PARITY = {
  framing: "1280x720 DPR2 matched camera",
  attemptHybridTotalPoints: 1_903_136,
  attemptHybridChaoticPoints: 749_544,
  cloudReferencePoints: 13_254_080,
  cloudPointBudget: 16_000_000,
  hybridPointBudget: 16_000_000,
};
// The stage-52 landing point, kept as the before column of every table.
const BASELINE_BAND = {
  label: "stage 52",
  bandCells: 8,
  subdivision: 5,
  samplesPerCell: 4,
  span: 0.25,
  weight: 1,
  classify: false,
};
const TUNED_BAND = {
  label: "stage 54",
  bandCells: CLOUD_BAND_CELLS,
  subdivision: BAND_CANDIDATE_SUBDIVISION,
  samplesPerCell: BAND_SAMPLES_PER_CELL,
  span: BAND_SAMPLE_SPAN_CELLS,
  weight: BAND_SAMPLE_WEIGHT,
  classify: true,
};
// The stage-52 constants re-measured under classification. Every tuning row
// below holds classification fixed, so the energy column compares band
// constants against band constants rather than against a different sheet set.
const BASELINE_BAND_CLASSIFIED = { ...BASELINE_BAND, label: "52 sheets54", classify: true };
// Alternatives measured to justify the landing point above.
const BAND_TUNING_CANDIDATES = [
  BASELINE_BAND,
  BASELINE_BAND_CLASSIFIED,
  { ...TUNED_BAND, label: "sites only", bandCells: 8 },
  { ...TUNED_BAND, label: "width only", subdivision: 5, samplesPerCell: 4, span: 0.25, weight: 1 },
  { ...TUNED_BAND, label: "weight 0.35", weight: 0.35 },
  { ...TUNED_BAND, label: "weight 0.50", weight: 0.5 },
  { ...TUNED_BAND, label: "weight 0.70", weight: 0.7 },
  { ...TUNED_BAND, label: "weight 1.00", weight: 1 },
  { ...TUNED_BAND, label: "band 16", bandCells: 16 },
];
const COMPONENT_MULTIPLIER_MARGIN =
  components.ORBIT_SURFACE_COMPONENT_MULTIPLIER_MARGIN;
const COMPONENT_MARGIN_SWEEP = [0, 0.005, 0.02, 0.05, 0.15];
const MAX_COMPONENT_PERIOD = components.ORBIT_SURFACE_MAX_COMPONENT_PERIOD;
// The verifier rig is 1280x720 at devicePixelRatio 2, so the live canvas —
// and therefore the projector the refinement planner sees — is 2560x1440
// device pixels. Modelling the CSS size instead under-predicts refinement
// spend by roughly 200 leaves.
const VERIFIER_VIEWPORT = {
  width: 1280,
  height: 720,
  devicePixelRatio: 2,
  pixelsPerCell: 8,
};
const ANALYTIC_CURVE_MAX_CHORD_ERROR_C = 0.00075;
const ANALYTIC_TRIM_INFLUENCE_CELLS = 12;
const WINDOWS = [
  {
    name: "full-default",
    width: 19,
    height: 13,
    reMin: -2,
    reMax: 1,
    imMin: -1,
    imMax: 1,
    modelsPrimaryCurves: true,
  },
  {
    name: "period-2-bulb",
    width: 21,
    height: 21,
    reMin: -1.32,
    reMax: -0.68,
    imMin: -0.34,
    imMax: 0.34,
    modelsPrimaryCurves: true,
  },
  // The period-4 to period-8 stretch of the real-axis cascade. Every period-8
  // component here is invisible to an eight-sample repeat test, so this window
  // is where extended classification has to earn its keep.
  {
    name: "period-8-cascade",
    width: 21,
    height: 21,
    reMin: -1.4,
    reMax: -1.36,
    imMin: -0.02,
    imMax: 0.02,
  },
];
const LIVE_DEFAULT_WINDOW = {
  name: "live-default-768",
  width: 768,
  height: 768,
  reMin: -2,
  reMax: 1,
  imMin: -1,
  imMax: 1,
};

const coverageResults = WINDOWS.map(analyseCoverageWindow);
const results = WINDOWS.flatMap((spec) => analyseWindow(spec, false));
const baselineBandDensityResults = WINDOWS.map((spec) =>
  analyseBandDensity(spec, BASELINE_BAND));
const baselineClassifiedBandResults = WINDOWS.map((spec) =>
  analyseBandDensity(spec, BASELINE_BAND_CLASSIFIED));
const bandDensityResults = WINDOWS.map((spec) =>
  analyseBandDensity(spec, TUNED_BAND));
const bandTuningResults = WINDOWS.flatMap((spec) =>
  BAND_TUNING_CANDIDATES.map((candidate) => analyseBandDensity(spec, candidate)));
const baselineAdaptiveResults = WINDOWS.map((spec) => analyseAdaptiveWindow(spec, {
  edgeErrorPx: 0.75,
  maxRefinementDepth: 4,
  classify: false,
}));
const unclassifiedAdaptiveResults = WINDOWS.map((spec) => analyseAdaptiveWindow(spec, {
  edgeErrorPx: EDGE_ERROR_PX,
  maxRefinementDepth: MAX_REFINEMENT_DEPTH,
  classify: false,
}));
const adaptiveResults = WINDOWS.map((spec) => analyseAdaptiveWindow(spec, {
  edgeErrorPx: EDGE_ERROR_PX,
  maxRefinementDepth: MAX_REFINEMENT_DEPTH,
  classify: true,
}));
const cloudParityResults = WINDOWS.map(analyseCloudParity);
const periodTransitionSeamResults = [analysePeriodTransitionSeamFixture()];
const analyticCurveResults = WINDOWS
  .filter((spec) => spec.modelsPrimaryCurves === true)
  .map(analyseAnalyticCurveWindow);
const curveIntegrationResults = WINDOWS.map(analyseCurveIntegrationWindow);
const liveCurveIntegrationResult = analyseCurveIntegrationWindow(
  LIVE_DEFAULT_WINDOW,
  {
    project: orbit3d.orbit3dDefaultSurfaceProjector(
      LIVE_DEFAULT_WINDOW.width,
      LIVE_DEFAULT_WINDOW.height,
      VERIFIER_VIEWPORT.width * VERIFIER_VIEWPORT.devicePixelRatio,
      VERIFIER_VIEWPORT.height * VERIFIER_VIEWPORT.devicePixelRatio,
    ),
    measureSilhouette: true,
    pointCount: LIVE_CLOUD_PARITY.cloudReferencePoints,
  },
);
for (const row of curveIntegrationResults) {
  if (
    row.curveTrimmedComponents.length > 0 &&
    row.silhouetteChordErrorPx > ANALYTIC_EDGE_ERROR_PX
  ) {
    throw new Error(
      `${row.window} analytic silhouette exceeded ${ANALYTIC_EDGE_ERROR_PX}px`,
    );
  }
}
for (const row of [...curveIntegrationResults, liveCurveIntegrationResult]) {
  if (row.demotedCells > 0) {
    throw new Error(
      `${row.window} demoted ${row.demotedCells} sampled periodic cells; ` +
      "curves must never overrule sampled membership.",
    );
  }
}
// Rescue-free integration keeps the whole stage-55 sampled boundary (6,214
// leaves at the DPR2 rig) and adds analytic refinement near curve crossings
// on top; the measured addition is 769 leaves and the envelope allows 7,000.
if (
  liveCurveIntegrationResult.triangleCount <= 0 ||
  liveCurveIntegrationResult.refinedCells > 7_000
) {
  throw new Error(
    "Pure live-default analytic surface build failed its invariant: "
    + `triangles ${liveCurveIntegrationResult.triangleCount}, `
    + `refined ${liveCurveIntegrationResult.refinedCells}.`,
  );
}
const costResults = WINDOWS.map((spec, index) => {
  const baseline = baselineAdaptiveResults[index];
  const adaptive = adaptiveResults[index];
  const before = baselineBandDensityResults[index];
  const after = bandDensityResults[index];
  const cloudParity = cloudParityResults[index];
  const pointBytes = SAMPLE_COUNT * 28;
  return {
    window: spec.name,
    beforeRefinedCells: baseline.refinedCells,
    afterRefinedCells: adaptive.refinedCells,
    beforeBandPointCount: before.bandPointCount,
    afterBandPointCount: after.bandPointCount,
    beforePeakGeometryBytes:
      baseline.meshGeometryBytes + (before.boundedSites + before.addedBandSites) * pointBytes,
    afterPeakGeometryBytes:
      adaptive.meshGeometryBytes
        + (after.boundedSites + after.addedBandSites) * pointBytes,
    stage55PeakGeometryBytes:
      adaptive.meshGeometryBytes
        + (after.boundedSites + after.addedBandSites + cloudParity.addedCloudSites)
          * pointBytes,
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
console.log("Surface coverage share of bounded cells");
console.log(
  [
    "Window".padEnd(20),
    "Bounded".padStart(9),
    "Sampler sheets".padStart(15),
    "Classified sheets".padStart(18),
    "Share before".padStart(13),
    "Share after".padStart(12),
    "Uplift".padStart(9),
  ].join("  "),
);
for (const row of coverageResults) {
  console.log(
    [
      row.window.padEnd(20),
      String(row.boundedCells).padStart(9),
      String(row.samplerPeriodicCells).padStart(15),
      String(row.classifiedPeriodicCells).padStart(18),
      row.coverageShareBefore.toFixed(6).padStart(13),
      row.coverageShareAfter.toFixed(6).padStart(12),
      `${row.coverageUplift.toFixed(3)}x`.padStart(9),
    ].join("  "),
  );
}
console.log("");
console.log("Coverage share against the accepted multiplier margin");
console.log(
  ["Window".padEnd(20), ...COMPONENT_MARGIN_SWEEP.map((margin) =>
    `margin ${margin}`.padStart(13))].join("  "),
);
for (const row of coverageResults) {
  console.log(
    [
      row.window.padEnd(20),
      ...row.marginSweep.map((entry) => entry.coverageShare.toFixed(6).padStart(13)),
    ].join("  "),
  );
}
console.log("");
console.log("Component catalogue through period 8");
console.log(
  [
    "Window".padEnd(20),
    "Period".padStart(7),
    "Regions".padStart(8),
    "Cells".padStart(7),
    "Seed c".padStart(26),
    "Seed |mu|".padStart(10),
  ].join("  "),
);
for (const row of coverageResults) {
  for (const entry of row.componentCatalogue) {
    console.log(
      [
        row.window.padEnd(20),
        String(entry.period).padStart(7),
        String(entry.regions).padStart(8),
        String(entry.cellCount).padStart(7),
        `${entry.seed.re.toFixed(6)}, ${entry.seed.im.toFixed(6)}`.padStart(26),
        entry.seed.multiplier.toFixed(6).padStart(10),
      ].join("  "),
    );
  }
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
console.log("Adaptive result without component classification, same settings");
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
for (const row of unclassifiedAdaptiveResults) {
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
console.log("Period-transition seam darkness");
console.log(
  [
    "Fixture".padEnd(20),
    "Vertices".padStart(10),
    "Dark before".padStart(13),
    "Dark after".padStart(12),
    "Max darkness before".padStart(20),
    "Max darkness after".padStart(19),
  ].join("  "),
);
for (const row of periodTransitionSeamResults) {
  console.log(
    [
      row.fixture.padEnd(20),
      String(row.transitionVertexCount).padStart(10),
      String(row.darkVerticesBefore).padStart(13),
      String(row.darkVerticesAfter).padStart(12),
      row.maxDarknessBefore.toFixed(2).padStart(20),
      row.maxDarknessAfter.toFixed(2).padStart(19),
    ].join("  "),
  );
}
console.log("");
console.log("Live cloud-path density at matched framing");
console.log(
  [
    "Attempt total".padStart(14),
    "Attempt chaos".padStart(14),
    "After total".padStart(14),
    "Cloud reference".padStart(16),
    "Budget parity".padStart(15),
  ].join("  "),
);
console.log(
  [
    String(LIVE_CLOUD_PARITY.attemptHybridTotalPoints).padStart(14),
    String(LIVE_CLOUD_PARITY.attemptHybridChaoticPoints).padStart(14),
    String(LIVE_CLOUD_PARITY.cloudReferencePoints).padStart(14),
    String(LIVE_CLOUD_PARITY.cloudReferencePoints).padStart(16),
    `${(LIVE_CLOUD_PARITY.hybridPointBudget /
      LIVE_CLOUD_PARITY.cloudPointBudget).toFixed(3)}x`.padStart(15),
  ].join("  "),
);
console.log("");
console.log("Deterministic 3 by 3 fallback density on fixture windows");
console.log(
  [
    "Window".padEnd(20),
    "Before points".padStart(14),
    "After points".padStart(13),
    "3x3 reference".padStart(16),
    "Fallback".padStart(9),
  ].join("  "),
);
for (const row of cloudParityResults) {
  console.log(
    [
      row.window.padEnd(20),
      String(row.beforePointCount).padStart(14),
      String(row.afterPointCount).padStart(13),
      String(row.cloudReferencePointCount).padStart(16),
      `${row.parity.toFixed(3)}x`.padStart(9),
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
console.log("Curve-trimmed silhouette and component fallback split");
console.log(
  [
    "Window".padEnd(20),
    "Trimmed".padStart(9),
    "Fallback".padStart(10),
    "Silhouette chord px".padStart(21),
    "Demoted".padStart(9),
    "Triangles".padStart(11),
    "Geometry bytes".padStart(16),
  ].join("  "),
);
for (const row of curveIntegrationResults) {
  console.log(
    [
      row.window.padEnd(20),
      String(row.curveTrimmedComponents.length).padStart(9),
      String(row.fallbackComponents.length).padStart(10),
      row.silhouetteChordErrorPx.toFixed(6).padStart(21),
      String(row.demotedCells).padStart(9),
      String(row.triangleCount).padStart(11),
      String(row.meshGeometryBytes).padStart(16),
    ].join("  "),
  );
  console.log(`  trimmed: ${row.curveTrimmedComponents.join(", ") || "none"}`);
  console.log(`  fallback: ${row.fallbackComponents.join(", ") || "none"}`);
}
console.log("");
console.log("Pure live-default surface build");
console.log(
  [
    "Window".padEnd(20),
    "Trimmed".padStart(9),
    "Fallback".padStart(10),
    "Demoted".padStart(9),
    "On-demand".padStart(11),
    "Refined".padStart(10),
    "Triangles".padStart(11),
    "Mesh bytes".padStart(12),
    "Peak geometry".padStart(15),
  ].join("  "),
);
console.log(
  [
    liveCurveIntegrationResult.window.padEnd(20),
    String(liveCurveIntegrationResult.curveTrimmedComponents.length).padStart(9),
    String(liveCurveIntegrationResult.fallbackComponents.length).padStart(10),
    String(liveCurveIntegrationResult.demotedCells).padStart(9),
    String(liveCurveIntegrationResult.onDemandSamples).padStart(11),
    String(liveCurveIntegrationResult.refinedCells).padStart(10),
    String(liveCurveIntegrationResult.triangleCount).padStart(11),
    String(liveCurveIntegrationResult.meshGeometryBytes).padStart(12),
    String(liveCurveIntegrationResult.peakGeometryBytes).padStart(15),
  ].join("  "),
);
console.log(
  "  live silhouette chord (grid cells): "
  + `max ${(liveCurveIntegrationResult.silhouetteChordErrorPx
      / VERIFIER_VIEWPORT.pixelsPerCell).toFixed(6)}, `
  + `boundary vertices ${(liveCurveIntegrationResult.boundaryVertexErrorPx
      / VERIFIER_VIEWPORT.pixelsPerCell).toFixed(6)}`,
);
for (const entry of liveCurveIntegrationResult.componentChordErrorsPx) {
  console.log(
    `  ${entry.componentId} (p${entry.period}): `
    + `${(entry.errorPx / VERIFIER_VIEWPORT.pixelsPerCell).toFixed(6)} cells`,
  );
}
console.log("");
console.log("Chaotic cloud density in the sheet-edge band");
console.log(
  [
    "Window".padEnd(20),
    "Setting".padEnd(12),
    "Base sites".padStart(11),
    "Added sites".padStart(12),
    "Band points".padStart(12),
    "Uplift".padStart(9),
    "Energy".padStart(11),
  ].join("  "),
);
for (let index = 0; index < WINDOWS.length; index += 1) {
  for (const row of [
    baselineBandDensityResults[index],
    baselineClassifiedBandResults[index],
    bandDensityResults[index],
  ]) {
    console.log(
      [
        row.window.padEnd(20),
        row.setting.padEnd(12),
        String(row.baseBandSites).padStart(11),
        String(row.addedBandSites).padStart(12),
        String(row.bandPointCount).padStart(12),
        `${row.bandDensityUplift.toFixed(3)}x`.padStart(9),
        row.bandEnergy.toFixed(3).padStart(11),
      ].join("  "),
    );
  }
}
console.log("");
console.log("Band saturation tuning sweep");
console.log(
  [
    "Window".padEnd(20),
    "Setting".padEnd(12),
    "Cells".padStart(6),
    "Sub".padStart(4),
    "Sites".padStart(6),
    "Span".padStart(6),
    "Weight".padStart(7),
    "Band points".padStart(12),
    "Uplift".padStart(9),
    "Energy".padStart(11),
  ].join("  "),
);
for (const row of bandTuningResults) {
  console.log(
    [
      row.window.padEnd(20),
      row.setting.padEnd(12),
      String(row.bandCells).padStart(6),
      String(row.subdivision).padStart(4),
      String(row.samplesPerCell).padStart(6),
      row.span.toFixed(2).padStart(6),
      row.weight.toFixed(2).padStart(7),
      String(row.bandPointCount).padStart(12),
      `${row.bandDensityUplift.toFixed(3)}x`.padStart(9),
      row.bandEnergy.toFixed(3).padStart(11),
    ].join("  "),
  );
}
console.log("");
console.log("Fixed-fixture fallback geometry cost through stage 55");
console.log(
  [
    "Window".padEnd(20),
    "Leaves before/after".padStart(21),
    "Band points before/after".padStart(26),
    "Geometry bytes 52/54/55".padStart(31),
  ].join("  "),
);
for (const row of costResults) {
  console.log(
    [
      row.window.padEnd(20),
      `${row.beforeRefinedCells}/${row.afterRefinedCells}`.padStart(21),
      `${row.beforeBandPointCount}/${row.afterBandPointCount}`.padStart(26),
      `${row.beforePeakGeometryBytes}/${row.afterPeakGeometryBytes}/${row.stage55PeakGeometryBytes}`
        .padStart(31),
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
    analyticEdgeErrorPx: ANALYTIC_EDGE_ERROR_PX,
    analyticMaxRefinementDepth: ANALYTIC_MAX_REFINEMENT_DEPTH,
    analyticRefinementCellBudget: ANALYTIC_REFINEMENT_CELL_BUDGET,
    maxRefinementDepth: MAX_REFINEMENT_DEPTH,
    refinementCellBudget: REFINEMENT_CELL_BUDGET,
    dissolveBandCells: DISSOLVE_BAND_CELLS,
    cloudBandCells: CLOUD_BAND_CELLS,
    bandCandidateSubdivision: BAND_CANDIDATE_SUBDIVISION,
    bandSamplesPerCell: BAND_SAMPLES_PER_CELL,
    bandSampleSpanCells: BAND_SAMPLE_SPAN_CELLS,
    bandSampleWeight: BAND_SAMPLE_WEIGHT,
    cloudRefinementSubdivision: CLOUD_REFINEMENT_SUBDIVISION,
    componentMultiplierMargin: COMPONENT_MULTIPLIER_MARGIN,
    componentMarginSweep: COMPONENT_MARGIN_SWEEP,
    maxComponentPeriod: MAX_COMPONENT_PERIOD,
    verifierViewport: VERIFIER_VIEWPORT,
    analyticCurveMaxChordErrorC: ANALYTIC_CURVE_MAX_CHORD_ERROR_C,
    analyticTrimInfluenceCells: ANALYTIC_TRIM_INFLUENCE_CELLS,
    windows: WINDOWS,
  },
  liveCloudParity: {
    ...LIVE_CLOUD_PARITY,
    afterTotalPoints: LIVE_CLOUD_PARITY.cloudReferencePoints,
    totalPointParity: 1,
    pointBudgetParity:
      LIVE_CLOUD_PARITY.hybridPointBudget / LIVE_CLOUD_PARITY.cloudPointBudget,
  },
  coverageResults,
  results,
  baselineAdaptiveResults,
  unclassifiedAdaptiveResults,
  adaptiveResults,
  cloudParityResults,
  periodTransitionSeamResults,
  analyticCurveResults,
  curveIntegrationResults,
  liveCurveIntegrationResult,
  baselineBandDensityResults,
  baselineClassifiedBandResults,
  bandDensityResults,
  bandTuningResults,
  costResults,
}, null, 2));
console.log("JSON_END");

function analyseWindow(spec, classify) {
  const context = createSampler(spec, classify);
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
  const context = createSampler(spec, configuration.classify === true);
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
  const context = createSampler(spec, true);
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

function analyseCurveIntegrationWindow(spec, options = {}) {
  const fixture = buildCurveIntegrationFixture(spec);
  const cells = buildCoarseCells(spec, fixture.sample);
  const refinedCells = [];
  const preparedSamples = new Map();
  const preparingSample = (x, y) => {
    const sample = fixture.sample(x, y);
    preparedSamples.set(`${coordinateKey(x)},${coordinateKey(y)}`, sample);
    return sample;
  };
  // The live build passes a total sampler: a lookup miss self-heals by
  // computing the sample on demand, so the harness must do the same or its
  // model diverges from the path it claims to measure.
  let onDemandSamples = 0;
  const totalSample = (x, y) => {
    const key = `${coordinateKey(x)},${coordinateKey(y)}`;
    const prepared = preparedSamples.get(key);
    if (prepared) return prepared;
    onDemandSamples += 1;
    const sample = fixture.sample(x, y);
    preparedSamples.set(key, sample);
    return sample;
  };
  const project = options.project ?? ((x, y) => ({
    x: x * VERIFIER_VIEWPORT.pixelsPerCell,
    y: y * VERIFIER_VIEWPORT.pixelsPerCell,
  }));
  let analyticRefinedCells = 0;
  for (let y = 0; y + 1 < spec.height; y += 1) {
    for (let x = 0; x + 1 < spec.width; x += 1) {
      const topLeft = y * spec.width + x;
      const periods = [
        cells.periods[topLeft],
        cells.periods[topLeft + 1],
        cells.periods[topLeft + spec.width],
        cells.periods[topLeft + spec.width + 1],
      ];
      const sampledBoundary = periods.some((period) => period > 0) &&
        periods.some((period) => period !== periods[0]);
      const curveBoundary = surface.orbitSurfaceCurveIntersectsRect(
        fixture.boundaryCurves,
        x,
        y,
        x + 1,
        y + 1,
      );
      if (!sampledBoundary && !curveBoundary) continue;
      const globalRemaining = REFINEMENT_CELL_BUDGET - refinedCells.length;
      const remaining = curveBoundary
        ? Math.min(
            globalRemaining,
            ANALYTIC_REFINEMENT_CELL_BUDGET - analyticRefinedCells,
          )
        : globalRemaining;
      if (remaining <= 0) continue;
      const plan = surface.planOrbitSurfaceCellRefinement(
        x,
        y,
        preparingSample,
        SAMPLE_COUNT,
        project,
        curveBoundary ? ANALYTIC_EDGE_ERROR_PX : EDGE_ERROR_PX,
        curveBoundary ? ANALYTIC_MAX_REFINEMENT_DEPTH : MAX_REFINEMENT_DEPTH,
        remaining,
        curveBoundary ? fixture.boundaryCurves : [],
      );
      refinedCells.push(...plan.cells);
      if (curveBoundary) analyticRefinedCells += plan.cells.length;
    }
  }
  prepareCategoricalTransitionSamples(
    cells,
    refinedCells,
    preparingSample,
  );
  const mesh = surface.buildOrbitSurface(
    cells,
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    {
      sampler: totalSample,
      refinedCells,
      boundaryCurves: fixture.boundaryCurves,
    },
  );
  const chord = options.measureSilhouette === false
    ? {
        maxErrorPx: 0,
        boundaryVertexErrorPx: 0,
        meshChordErrorPx: 0,
        tracedCurveChordErrorPx: 0,
        componentChordErrorsPx: [],
      }
    : measureIntegratedSilhouette(
        spec,
        extractCurveTrimmedSilhouette(
          mesh,
          fixture.boundaryCurves,
          spec.width,
          spec.height,
        ).segments,
        fixture.boundaryCurves,
        fixture.traced,
      );
  const meshGeometryBytes = orbitSurfaceMeshBytes(mesh);
  return {
    window: spec.name,
    curveTrimmedComponents: fixture.traced.map((entry) =>
      `p${entry.period}@${entry.firstCell}`),
    fallbackComponents: fixture.fallback.map((entry) =>
      `p${entry.period}@${entry.firstCell} (${entry.reason})`),
    silhouetteChordErrorPx: rounded(chord.maxErrorPx),
    boundaryVertexErrorPx: rounded(chord.boundaryVertexErrorPx),
    meshChordErrorPx: rounded(chord.meshChordErrorPx),
    tracedCurveChordErrorPx: rounded(chord.tracedCurveChordErrorPx),
    componentChordErrorsPx: chord.componentChordErrorsPx,
    curveDistanceDissolve: true,
    demotedCells: fixture.demotedCells(),
    onDemandSamples,
    refinedCells: refinedCells.length,
    analyticRefinedCells,
    fallbackRefinedCells: refinedCells.length - analyticRefinedCells,
    triangleCount: mesh.indices.length / 3,
    meshGeometryBytes,
    peakGeometryBytes: meshGeometryBytes + (options.pointCount ?? 0) * 28,
  };
}

function prepareCategoricalTransitionSamples(cells, refinedCells, sample) {
  const leavesByCell = new Map();
  for (const leaf of refinedCells) {
    const coarseX = Math.floor(leaf.coarseX ?? leaf.x);
    const coarseY = Math.floor(leaf.coarseY ?? leaf.y);
    const key = `${coarseX},${coarseY}`;
    const leaves = leavesByCell.get(key) ?? [];
    leaves.push(leaf);
    leavesByCell.set(key, leaves);
  }
  const preparedEdges = new Set();
  for (let y = 0; y + 1 < cells.height; y += 1) {
    for (let x = 0; x + 1 < cells.width; x += 1) {
      const leaves = leavesByCell.get(`${x},${y}`);
      if (leaves?.length > 0) {
        for (const leaf of leaves) {
          const size = leaf.size ?? 1 / 2 ** leaf.depth;
          prepareQuad(leaf.x, leaf.y, leaf.x + size, leaf.y + size);
        }
      } else {
        prepareQuad(x, y, x + 1, y + 1);
      }
    }
  }

  function prepareQuad(x0, y0, x1, y1) {
    prepareEdge(x0, y0, x0, y1);
    prepareEdge(x0, y1, x1, y0);
    prepareEdge(x1, y0, x0, y0);
    prepareEdge(x0, y1, x1, y1);
    prepareEdge(x1, y1, x1, y0);
  }

  function prepareEdge(x0, y0, x1, y1) {
    const firstKey = `${coordinateKey(x0)},${coordinateKey(y0)}`;
    const secondKey = `${coordinateKey(x1)},${coordinateKey(y1)}`;
    const key = firstKey < secondKey
      ? `${firstKey}|${secondKey}`
      : `${secondKey}|${firstKey}`;
    if (preparedEdges.has(key)) return;
    preparedEdges.add(key);
    const firstPeriod = periodAt(x0, y0);
    const secondPeriod = periodAt(x1, y1);
    if (firstPeriod === secondPeriod || (firstPeriod <= 0 && secondPeriod <= 0)) {
      return;
    }
    const firstIsLow = x0 < x1 || (x0 === x1 && y0 <= y1);
    let lowX = firstIsLow ? x0 : x1;
    let lowY = firstIsLow ? y0 : y1;
    let highX = firstIsLow ? x1 : x0;
    let highY = firstIsLow ? y1 : y0;
    const lowPeriod = periodAt(lowX, lowY);
    for (let step = 0;
      step < surface.ORBIT_SURFACE_CONTOUR_BISECTION_STEPS;
      step += 1) {
      const x = (lowX + highX) * 0.5;
      const y = (lowY + highY) * 0.5;
      if (periodAt(x, y) === lowPeriod) {
        lowX = x;
        lowY = y;
      } else {
        highX = x;
        highY = y;
      }
    }
  }

  function periodAt(x, y) {
    if (
      Number.isInteger(x) && Number.isInteger(y) &&
      x >= 0 && x < cells.width && y >= 0 && y < cells.height
    ) {
      const index = y * cells.width + x;
      return cells.escaped[index] === 0 ? cells.periods[index] : 0;
    }
    const sampled = sample(x, y);
    return sampled.escaped ? 0 : sampled.period;
  }
}

function extractCurveTrimmedSilhouette(mesh, boundaryCurves, width, height) {
  const edges = new Map();
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    add(mesh.indices[offset], mesh.indices[offset + 1]);
    add(mesh.indices[offset + 1], mesh.indices[offset + 2]);
    add(mesh.indices[offset + 2], mesh.indices[offset]);
  }
  const segments = [];
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue;
    const first = meshPoint(mesh, edge.first);
    const second = meshPoint(mesh, edge.second);
    if (
      first.rank !== 0 || second.rank !== 0 ||
      first.period <= 0 || first.period !== second.period ||
      isWindowEdge(first, width, height) || isWindowEdge(second, width, height)
    ) {
      continue;
    }
    const firstCurve = surface.nearestOrbitSurfaceBoundary(
      boundaryCurves,
      first.x,
      first.y,
      first.period,
    );
    const secondCurve = surface.nearestOrbitSurfaceBoundary(
      boundaryCurves,
      second.x,
      second.y,
      second.period,
    );
    if (
      !firstCurve || !secondCurve ||
      firstCurve.distance > 1e-4 || secondCurve.distance > 1e-4
    ) {
      continue;
    }
    segments.push({ first, second, period: first.period });
  }
  return { segments };

  function add(left, right) {
    const first = Math.min(left, right);
    const second = Math.max(left, right);
    const key = `${first}:${second}`;
    const edge = edges.get(key);
    if (edge) edge.count += 1;
    else edges.set(key, { first, second, count: 1 });
  }
}

function buildCurveIntegrationFixture(spec) {
  const classified = createSampler(spec, true);
  const count = spec.width * spec.height;
  const periods = new Int16Array(count);
  const seeds = new Array(count).fill(null);
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const index = y * spec.width + x;
      const sampled = classified.sample(x, y);
      if (!sampled.cycle || sampled.period <= 0) continue;
      periods[index] = sampled.period;
      seeds[index] = {
        period: sampled.period,
        c: sampled.c,
        cycle: sampled.cycle,
        multiplier: sampled.multiplier,
        multiplierAngle: sampled.multiplierAngle,
      };
    }
  }
  const catalogue = components.buildOrbitSurfaceComponentCatalogue(
    periods,
    spec.width,
    spec.height,
    (index) => seeds[index],
  );
  const tracedResult = curves.traceOrbitSurfaceComponentCatalogue(
    catalogue,
    ANALYTIC_CURVE_MAX_CHORD_ERROR_C,
    128,
  );
  const xScale = spec.width / (spec.reMax - spec.reMin);
  const yScale = spec.height / (spec.imMax - spec.imMin);
  const boundaryCurves = tracedResult.traced.map((entry) => ({
    componentId: entry.componentId,
    period: entry.period,
    points: entry.curve.points.map((pointValue) => ({
      x: (pointValue.c.re - spec.reMin) * xScale - 0.5,
      y: (pointValue.c.im - spec.imMin) * yScale - 0.5,
    })),
  }));
  const cache = new Map();
  let demotedCellCount = 0;
  const sample = (x, y) => {
    const key = `${coordinateKey(x)},${coordinateKey(y)}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const base = classified.sample(x, y);
    // Mirror the live membership rule: the sampled orbit is the sole
    // membership authority and traced curves never change a cell's period
    // in either direction. Any demotion of a sampled periodic cell is
    // counted and gates the run.
    const period = base.period;
    if (base.period > 0 && period <= 0) demotedCellCount += 1;
    const curve = period > 0
      ? surface.nearestOrbitSurfaceBoundary(boundaryCurves, x, y, period)
      : null;
    const result = {
      ...base,
      samples: Float32Array.from(base.samples),
      period,
      dissolve: curve?.inside
        ? surface.orbitSurfaceDissolveCoverage(curve.distance, DISSOLVE_BAND_CELLS)
        : period > 0 ? 1 : 0,
    };
    cache.set(key, result);
    return result;
  };
  return {
    sample,
    boundaryCurves,
    traced: tracedResult.traced,
    fallback: tracedResult.fallback,
    demotedCells: () => demotedCellCount,
  };
}

function measureIntegratedSilhouette(spec, candidateSegments, boundaryCurves, traced) {
  let boundaryVertexError = 0;
  let meshChordError = 0;
  const componentErrors = new Map(boundaryCurves.map((curve) => [curve.componentId, 0]));
  for (const segment of candidateSegments) {
    const midpoint = {
      x: (segment.first.x + segment.second.x) * 0.5,
      y: (segment.first.y + segment.second.y) * 0.5,
    };
    const associated = surface.nearestOrbitSurfaceBoundary(
      boundaryCurves,
      midpoint.x,
      midpoint.y,
      segment.period,
    );
    if (!associated) continue;
    const curve = boundaryCurves.find((candidate) =>
      candidate.componentId === associated.componentId);
    if (!curve) continue;
    const points = [segment.first, midpoint, segment.second];
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const pointValue = points[pointIndex];
      const nearest = surface.nearestOrbitSurfaceBoundary(
        [curve],
        pointValue.x,
        pointValue.y,
        segment.period,
      );
      if (!nearest) continue;
      meshChordError = Math.max(meshChordError, nearest.distance);
      if (pointIndex !== 1) {
        boundaryVertexError = Math.max(boundaryVertexError, nearest.distance);
      }
      componentErrors.set(
        curve.componentId,
        Math.max(componentErrors.get(curve.componentId) ?? 0, nearest.distance),
      );
    }
  }
  const xScale = spec.width / (spec.reMax - spec.reMin);
  const yScale = spec.height / (spec.imMax - spec.imMin);
  const tracedCurveChordErrorPx = traced.reduce((maximum, entry) => Math.max(
    maximum,
    entry.curve.maxChordError * Math.max(xScale, yScale) *
      VERIFIER_VIEWPORT.pixelsPerCell,
  ), 0);
  const componentChordErrorsPx = traced.map((entry) => {
    const meshChord = (componentErrors.get(entry.componentId) ?? 0) *
      VERIFIER_VIEWPORT.pixelsPerCell;
    const traceChord = entry.curve.maxChordError * Math.max(xScale, yScale) *
      VERIFIER_VIEWPORT.pixelsPerCell;
    return {
      componentId: entry.componentId,
      period: entry.period,
      errorPx: rounded(Math.max(meshChord, traceChord)),
    };
  });
  const boundaryVertexErrorPx = boundaryVertexError * VERIFIER_VIEWPORT.pixelsPerCell;
  const meshChordErrorPx = meshChordError * VERIFIER_VIEWPORT.pixelsPerCell;
  return {
    boundaryVertexErrorPx,
    meshChordErrorPx,
    tracedCurveChordErrorPx,
    componentChordErrorsPx,
    maxErrorPx: Math.max(
      boundaryVertexErrorPx,
      meshChordErrorPx,
      tracedCurveChordErrorPx,
    ),
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

function analyseBandDensity(spec, configuration) {
  const context = createSampler(spec, configuration.classify === true);
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
  let bandEnergy = 0;
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
      configuration.bandCells,
    )) {
      continue;
    }
    baseBandSites += 1;
    const coverage = surface.orbitSurfaceDissolveCoverage(
      periodicDistance,
      configuration.bandCells,
    );
    bandEnergy += coverage;
    let accepted = 0;
    for (let subY = 0; subY < configuration.subdivision; subY += 1) {
      for (let subX = 0; subX < configuration.subdivision; subX += 1) {
        if (accepted >= configuration.samplesPerCell) break;
        const sampleX = x
          + ((subX + 0.5) / configuration.subdivision - 0.5) * configuration.span;
        const sampleY = y
          + ((subY + 0.5) / configuration.subdivision - 0.5) * configuration.span;
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
          bandEnergy += surface.orbitSurfaceDissolveCoverage(
            nearestSiteDistance(sampleX, sampleY, periodicSites),
            configuration.bandCells,
          ) * configuration.weight;
        }
      }
    }
  }
  const totalBandSites = baseBandSites + addedBandSites;
  return {
    window: spec.name,
    setting: configuration.label,
    bandCells: configuration.bandCells,
    subdivision: configuration.subdivision,
    samplesPerCell: configuration.samplesPerCell,
    span: configuration.span,
    weight: configuration.weight,
    classified: configuration.classify === true,
    boundedSites,
    baseBandSites,
    addedBandSites,
    bandPointCount: totalBandSites * SAMPLE_COUNT,
    bandDensityUplift: rounded(baseBandSites === 0 ? 1 : totalBandSites / baseBandSites),
    bandEnergy: rounded(bandEnergy),
  };
}

function analyseCloudParity(spec) {
  const context = createSampler(spec, true);
  const cells = buildCoarseCells(spec, context.sample);
  const periodicSites = [];
  const chaoticSites = [];
  for (let index = 0; index < cells.periods.length; index += 1) {
    if (cells.escaped[index] !== 0) continue;
    const site = { x: index % cells.width, y: Math.floor(index / cells.width) };
    if (cells.periods[index] > 0) periodicSites.push(site);
    else chaoticSites.push(site);
  }

  const bandKeys = new Set();
  for (const site of chaoticSites) {
    const periodicDistance = nearestSiteDistance(site.x, site.y, periodicSites);
    if (!surface.isOrbitSurfaceCloudBandSample(
      0,
      false,
      periodicDistance,
      CLOUD_BAND_CELLS,
    )) {
      continue;
    }
    let accepted = 0;
    for (let subY = 0; subY < BAND_CANDIDATE_SUBDIVISION; subY += 1) {
      for (let subX = 0; subX < BAND_CANDIDATE_SUBDIVISION; subX += 1) {
        if (accepted >= BAND_SAMPLES_PER_CELL) break;
        const x = site.x
          + ((subX + 0.5) / BAND_CANDIDATE_SUBDIVISION - 0.5)
            * BAND_SAMPLE_SPAN_CELLS;
        const y = site.y
          + ((subY + 0.5) / BAND_CANDIDATE_SUBDIVISION - 0.5)
            * BAND_SAMPLE_SPAN_CELLS;
        if (
          (x === site.x && y === site.y) ||
          x < 0 || x > cells.width - 1 || y < 0 || y > cells.height - 1
        ) {
          continue;
        }
        const sampled = context.sample(x, y);
        if (!sampled.escaped && sampled.period === 0) {
          bandKeys.add(pointKey({ x, y }));
          accepted += 1;
        }
      }
    }
  }

  const hybridRefinedKeys = new Set(bandKeys);
  const cloudReferenceKeys = new Set();
  for (const site of chaoticSites) {
    for (const offset of CLOUD_REFINEMENT_OFFSETS) {
      const x = site.x + offset.x;
      const y = site.y + offset.y;
      if (x < 0 || x > cells.width - 1 || y < 0 || y > cells.height - 1) continue;
      const sampled = context.sample(x, y);
      if (sampled.escaped || sampled.period !== 0) continue;
      const key = pointKey({ x, y });
      cloudReferenceKeys.add(key);
      hybridRefinedKeys.add(key);
    }
  }

  const beforeSites = chaoticSites.length + bandKeys.size;
  const afterSites = chaoticSites.length + hybridRefinedKeys.size;
  const cloudReferenceSites = chaoticSites.length + cloudReferenceKeys.size;
  return {
    window: spec.name,
    sharedChaoticBaseSites: chaoticSites.length,
    bandSites: bandKeys.size,
    cloudRefinementSites: cloudReferenceKeys.size,
    addedCloudSites: hybridRefinedKeys.size - bandKeys.size,
    beforePointCount: beforeSites * SAMPLE_COUNT,
    afterPointCount: afterSites * SAMPLE_COUNT,
    cloudReferencePointCount: cloudReferenceSites * SAMPLE_COUNT,
    parity: rounded(cloudReferenceSites === 0 ? 1 : afterSites / cloudReferenceSites),
  };
}

function analysePeriodTransitionSeamFixture() {
  const spec = { width: 6, height: 6 };
  const signedDistance = (x, y) => x + 0.37 * y - 2.45;
  const sampler = (x, y) => {
    const side = signedDistance(x, y);
    if (side <= 0) {
      return {
        samples: Float32Array.from({ length: SAMPLE_COUNT }, () => 0.08 + x * 0.01),
        period: 1,
        interior: 0.25,
        boundary: Math.min(1, Math.abs(side)),
        escaped: false,
      };
    }
    return {
      samples: Float32Array.from(
        { length: SAMPLE_COUNT },
        (_, rank) => (rank % 2 === 0 ? -0.22 : 0.22) + y * 0.005,
      ),
      period: 2,
      interior: 0.55,
      boundary: Math.min(1, Math.abs(side)),
      escaped: false,
    };
  };
  const mesh = surface.buildOrbitSurface(
    buildCoarseCells(spec, sampler),
    surface.ORBIT_SURFACE_MAX_HEIGHT_JUMP,
    { sampler },
  );
  const incidence = new Uint16Array(mesh.positions.length / 3);
  for (const vertex of mesh.indices) incidence[vertex] += 1;
  const transitionVertices = [];
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    if (incidence[vertex] > 0 && (!Number.isInteger(x) || !Number.isInteger(y))) {
      transitionVertices.push(vertex);
    }
  }
  const baselineFades = stage54SurfaceEdgeFades(mesh.indices, incidence);
  const beforeFades = transitionVertices.map((vertex) => baselineFades[vertex]);
  const edgeFades = transitionVertices.map((vertex) => mesh.edgeFades[vertex]);
  return {
    fixture: "oblique period 1/2",
    transitionVertexCount: transitionVertices.length,
    darkVerticesBefore: beforeFades.filter((fade) => fade < 1).length,
    darkVerticesAfter: edgeFades.filter((fade) => fade < 1).length,
    maxDarknessBefore: rounded(1 - Math.min(...beforeFades)),
    maxDarknessAfter: rounded(1 - Math.min(...edgeFades)),
  };

  function stage54SurfaceEdgeFades(indices, vertexIncidence) {
    const levels = [0.16, 0.5, 0.82, 1];
    const rings = new Uint8Array(vertexIncidence.length);
    rings.fill(levels.length - 1);
    const edges = new Map();
    for (let offset = 0; offset < indices.length; offset += 3) {
      addEdge(indices[offset], indices[offset + 1]);
      addEdge(indices[offset + 1], indices[offset + 2]);
      addEdge(indices[offset + 2], indices[offset]);
    }
    for (const edge of edges.values()) {
      if (edge.count !== 1) continue;
      rings[edge.first] = 0;
      rings[edge.second] = 0;
    }
    let current = rings;
    for (let pass = 1; pass < levels.length - 1; pass += 1) {
      const next = new Uint8Array(current);
      for (let offset = 0; offset < indices.length; offset += 3) {
        relax(indices[offset], indices[offset + 1]);
        relax(indices[offset + 1], indices[offset + 2]);
        relax(indices[offset + 2], indices[offset]);
      }
      current = next;

      function relax(left, right) {
        next[left] = Math.min(next[left], current[right] + 1);
        next[right] = Math.min(next[right], current[left] + 1);
      }
    }
    return Float32Array.from(current, (ring, vertex) =>
      vertexIncidence[vertex] === 0 ? 0 : levels[ring]);

    function addEdge(first, second) {
      const low = Math.min(first, second);
      const high = Math.max(first, second);
      const key = `${low}:${high}`;
      const edge = edges.get(key);
      if (edge) edge.count += 1;
      else edges.set(key, { first: low, second: high, count: 1 });
    }
  }
}

/**
 * Coverage share is the share of bounded cells that carry a sheet. The before
 * column is the empirical sampler alone; the after column adds the exact
 * component classifier. The margin sweep shows how much of the gain survives
 * as the accepted multiplier margin tightens, which is the lever that keeps
 * sheet off chaotic parameter space.
 */
function analyseCoverageWindow(spec) {
  const cellCount = spec.width * spec.height;
  const periods = new Int16Array(cellCount);
  const seeds = new Array(cellCount).fill(null);
  const sampler = createSampler(spec, true).sample;
  let boundedCells = 0;
  let samplerPeriodicCells = 0;
  let classifiedPeriodicCells = 0;
  const periodHistogram = new Map();
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const cell = y * spec.width + x;
      const sampled = sampler(x, y);
      if (sampled.escaped) continue;
      boundedCells += 1;
      if (sampled.samplerPeriod > 0) samplerPeriodicCells += 1;
      if (sampled.period > 0) {
        classifiedPeriodicCells += 1;
        periods[cell] = sampled.period;
        periodHistogram.set(
          sampled.period,
          (periodHistogram.get(sampled.period) ?? 0) + 1,
        );
      }
      if (sampled.cycle) {
        seeds[cell] = {
          period: sampled.period,
          c: sampled.c,
          cycle: sampled.cycle,
          multiplier: sampled.multiplier,
        };
      }
    }
  }

  const regions = components.buildOrbitSurfaceComponentCatalogue(
    periods,
    spec.width,
    spec.height,
    (cell) => seeds[cell],
  );
  const catalogue = [];
  for (const period of [...new Set(regions.map((region) => region.period))].sort(
    (left, right) => left - right,
  )) {
    const matching = regions.filter((region) => region.period === period);
    const best = matching.reduce((chosen, region) =>
      region.seed.multiplier < chosen.seed.multiplier ? region : chosen);
    catalogue.push({
      period,
      regions: matching.length,
      cellCount: matching.reduce((sum, region) => sum + region.cellCount, 0),
      seed: {
        re: rounded(best.seed.c.re),
        im: rounded(best.seed.c.im),
        cycleRe: rounded(best.seed.cycle.re),
        cycleIm: rounded(best.seed.cycle.im),
        multiplier: rounded(best.seed.multiplier),
      },
    });
  }

  const marginSweep = COMPONENT_MARGIN_SWEEP.map((margin) => {
    const marginSampler = createSampler(spec, true, margin).sample;
    let periodic = 0;
    for (let y = 0; y < spec.height; y += 1) {
      for (let x = 0; x < spec.width; x += 1) {
        const sampled = marginSampler(x, y);
        if (!sampled.escaped && sampled.period > 0) periodic += 1;
      }
    }
    return {
      margin,
      periodicCells: periodic,
      coverageShare: rounded(boundedCells === 0 ? 0 : periodic / boundedCells),
    };
  });

  const before = boundedCells === 0 ? 0 : samplerPeriodicCells / boundedCells;
  const after = boundedCells === 0 ? 0 : classifiedPeriodicCells / boundedCells;
  return {
    window: spec.name,
    boundedCells,
    samplerPeriodicCells,
    classifiedPeriodicCells,
    coverageShareBefore: rounded(before),
    coverageShareAfter: rounded(after),
    coverageUplift: rounded(before === 0 ? 1 : after / before),
    periodHistogram: Object.fromEntries(
      [...periodHistogram.entries()].sort((left, right) => left[0] - right[0]),
    ),
    componentCatalogue: catalogue,
    marginSweep,
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

/**
 * The fixture sampler. `classify` mirrors the renderer's hybrid path: the
 * empirical window first, then the exact component classifier, which only ever
 * replaces a label it can prove.
 */
function createSampler(spec, classify = false, margin = COMPONENT_MULTIPLIER_MARGIN) {
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
      samplerPeriod: escaped ? 0 : detected,
      c: { re: cRe, im: cIm },
      cycle: null,
      multiplier: escaped ? 1 : measure.interior,
      multiplierAngle: 0,
    };
    if (!escaped && classify) {
      const classification = components.classifyOrbitSurfaceComponent(cRe, cIm, {
        multiplierMargin: margin,
      });
      if (
        classification.period > 0 &&
        classification.period <= SAMPLE_COUNT &&
        components.writeOrbitSurfaceCycleSamples(
          classification,
          cRe,
          cIm,
          values,
          0,
          SAMPLE_COUNT,
        )
      ) {
        result.period = classification.period;
        result.interior = Math.max(0, Math.min(1, classification.multiplier));
        result.cycle = classification.cycle;
        result.multiplier = classification.multiplier;
        result.multiplierAngle = classification.multiplierAngle;
      }
    }
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
