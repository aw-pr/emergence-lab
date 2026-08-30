import { test, expect, type Page } from "@playwright/test";
import { driveKernel, type SweepDriverConfig } from "./harness/driver.ts";
import {
  circularSpatialAutocorrelation,
  meanResultantLength,
  scoreFrames,
  spatialAutocorrelation,
} from "./harness/metrics.ts";
import {
  SWEEP_CONFIGS,
  expandSweep,
  type SimSweepConfig,
  type Params,
} from "./harness/sims.ts";
import {
  metricsTable,
  writePng,
  writeText,
  type ScoredCandidate,
} from "./harness/report.ts";

const REGISTRY_URL = "http://localhost:5173/src/app/registry.ts";
const ARTIFACT_ROOT = "e2e/artifacts";

// Every test must run from the dev-server origin so the page-context dynamic
// import of the registry resolves same-origin (about:blank would block it).
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function scoreOne(
  page: Page,
  config: SimSweepConfig,
  id: string,
  label: string,
  params: Params,
): Promise<ScoredCandidate> {
  const driverConfig: SweepDriverConfig = {
    registryUrl: REGISTRY_URL,
    slug: config.slug,
    params,
    gridWidth: config.gridWidth,
    gridHeight: config.gridHeight,
    warmupSteps: config.warmupSteps,
    fluxGap: config.fluxGap,
    primaryChannel: config.primaryChannel,
    dt: config.dt,
  };
  const result = await page.evaluate(driveKernel, driverConfig);
  const metrics = scoreFrames(
    result.frameA,
    result.frameB,
    result.width,
    result.height,
    config.coverageThreshold,
  );

  if (config.phase) {
    const phaseResult = config.phase.channel === config.primaryChannel
      ? result
      : await page.evaluate(driveKernel, {
        ...driverConfig,
        primaryChannel: config.phase.channel,
        fluxGap: 0,
      });
    const occupancyResult = !config.phase.occupancy
      ? undefined
      : config.phase.occupancy.channel === config.primaryChannel
        ? result
        : await page.evaluate(driveKernel, {
          ...driverConfig,
          primaryChannel: config.phase.occupancy.channel,
          fluxGap: 0,
        });
    const inclusionMask = occupancyResult && Float32Array.from(
      occupancyResult.frameA,
      (value) => value > config.phase!.occupancy!.threshold ? 1 : 0,
    );
    metrics.meanResultantLength = meanResultantLength(
      phaseResult.frameA,
      inclusionMask,
    );
    metrics.circularSpatialAutocorrelation = circularSpatialAutocorrelation(
      phaseResult.frameA,
      phaseResult.width,
      phaseResult.height,
      inclusionMask,
    );
  }
  return { id, label, params, metrics };
}

function phaseMetricsTable(candidates: ScoredCandidate[]): string {
  const linear = [...candidates].sort((a, b) => b.metrics.score - a.metrics.score);
  const circular = [...candidates].sort(
    (a, b) =>
      (b.metrics.circularSpatialAutocorrelation ?? -Infinity) -
      (a.metrics.circularSpatialAutocorrelation ?? -Infinity),
  );
  const circularRanks = new Map(circular.map((candidate, index) => [candidate.id, index + 1]));
  const lines = [
    "| linear rank | circular rank | set | score | autocorr | flux | resultant length | circular autocorr |",
    "|---:|---:|---|---:|---:|---:|---:|---:|",
  ];
  linear.forEach((candidate, index) => {
    const metrics = candidate.metrics;
    lines.push(
      `| ${index + 1} | ${circularRanks.get(candidate.id)} | ${candidate.label} | ${metrics.score.toFixed(3)} | ${metrics.spatialAutocorrelation.toFixed(3)} | ${metrics.temporalFlux.toFixed(4)} | ${metrics.meanResultantLength?.toFixed(3)} | ${metrics.circularSpatialAutocorrelation?.toFixed(3)} |`,
    );
  });
  return lines.join("\n");
}

/**
 * Run the full Cartesian sweep + the reference sets for one sim, score every
 * frame, rank by composite score, and write the artifacts (per-candidate
 * grayscale PNGs, a markdown report, raw JSON). Returns the ranked candidates.
 */
async function runSweep(
  page: Page,
  config: SimSweepConfig,
): Promise<ScoredCandidate[]> {
  await page.goto("/");
  const paramKeys = config.axes.map((a) => a.key);
  const slug = config.slug;
  const artifactId = config.artifactId ?? config.slug;

  const sweepParams = expandSweep(config);
  const candidates: ScoredCandidate[] = [];

  let n = 0;
  for (const params of sweepParams) {
    const id = paramKeys.map((k) => `${k}${params[k]}`).join("_");
    candidates.push(await scoreOne(page, config, id, id, params));
    n += 1;
    if (n % 10 === 0) console.log(`  ${artifactId}: ${n}/${sweepParams.length} swept`);
  }

  const references: ScoredCandidate[] = [];
  for (const ref of config.references) {
    references.push(await scoreOne(page, config, ref.id, ref.label, ref.params));
  }

  const ranked = [...candidates].sort((a, b) => b.metrics.score - a.metrics.score);

  // Thumbnails for the top candidates and every reference, so the ranking can be
  // sanity-checked by eye (the aesthetic call the metrics only approximate).
  const topN = ranked.slice(0, 12);
  for (const cand of [...topN, ...references]) {
    const driverConfig: SweepDriverConfig = {
      registryUrl: REGISTRY_URL,
      slug,
      params: cand.params,
      gridWidth: config.gridWidth,
      gridHeight: config.gridHeight,
      warmupSteps: config.warmupSteps,
      fluxGap: 0,
      primaryChannel: config.primaryChannel,
      dt: config.dt,
    };
    const frame = await page.evaluate(driveKernel, driverConfig);
    const rel = `${artifactId}/${cand.id}.png`;
    writePng(`${ARTIFACT_ROOT}/${rel}`, frame.frameA, frame.width, frame.height, 3);
    cand.thumb = rel;
  }

  const md = [
    `# Interestingness sweep — ${artifactId}`,
    "",
    `Grid ${config.gridWidth}×${config.gridHeight}, warmup ${config.warmupSteps} steps, flux gap ${config.fluxGap}.`,
    `Scored on channel ${config.primaryChannel}, coverage threshold ${config.coverageThreshold}.`,
    `${sweepParams.length} swept sets + ${references.length} references.`,
    "",
    "## Top candidates",
    "",
    metricsTable(topN, paramKeys),
    "",
    "## References (current presets/defaults)",
    "",
    metricsTable(references, paramKeys),
    "",
    ...(config.phase ? [
      "## Linear and circular phase readings",
      "",
      `Circular statistics use phase channel ${config.phase.channel}. Circular rank is by circular spatial autocorrelation; it is reported alongside, not folded into, the existing composite.`,
      "",
      "### Swept sets",
      "",
      phaseMetricsTable(ranked),
      "",
      "### References",
      "",
      phaseMetricsTable(references),
      "",
    ] : []),
  ].join("\n");
  writeText(`${ARTIFACT_ROOT}/${artifactId}/report.md`, md);
  writeText(
    `${ARTIFACT_ROOT}/${artifactId}/results.json`,
    JSON.stringify({ ranked, references }, null, 2),
  );

  console.log(`\n=== ${artifactId} top 5 ===`);
  for (const c of ranked.slice(0, 5)) {
    console.log(
      `  ${c.metrics.score.toFixed(3)}  ${c.id}  (ent ${c.metrics.entropy.toFixed(2)} ac ${c.metrics.spatialAutocorrelation.toFixed(2)} cov ${c.metrics.coverage.toFixed(2)} flux ${c.metrics.temporalFlux.toFixed(4)})`,
    );
  }
  console.log(`=== ${artifactId} references ===`);
  for (const c of references) {
    console.log(`  ${c.metrics.score.toFixed(3)}  ${c.label}`);
  }

  return ranked;
}

// Always-on: a fast sanity check that the metric stack rewards a coherent Turing
// regime over a washed-out one, and produces finite numbers. Keeps the default
// suite quick while still exercising the whole harness path through the browser.
test("metrics harness rewards structure over washout", async ({ page }) => {
  const config = SWEEP_CONFIGS["gray-scott"];
  const turing = await scoreOne(page, config, "coral", "Coral", {
    ...config.baseParams,
    F: 0.0545,
    k: 0.062,
  });
  const washout = await scoreOne(page, config, "washout", "Washout", {
    ...config.baseParams,
    F: 0.066,
    k: 0.045,
  });

  for (const m of [turing.metrics, washout.metrics]) {
    expect(Number.isFinite(m.score)).toBe(true);
    expect(Number.isFinite(m.entropy)).toBe(true);
    expect(Number.isFinite(m.spatialAutocorrelation)).toBe(true);
  }
  expect(turing.metrics.score).toBeGreaterThan(washout.metrics.score);
});

test("non-phase Gray-Scott scores are unchanged", async ({ page }) => {
  const config = SWEEP_CONFIGS["gray-scott"];
  const coral = await scoreOne(page, config, "coral", "Coral", {
    ...config.baseParams,
    F: 0.0545,
    k: 0.062,
  });

  expect(coral.metrics).toEqual({
    entropy: 0.6967874006572629,
    variance: 0.016457917737197007,
    spatialAutocorrelation: 0.9369885340278952,
    coverage: 0.6756591796875,
    temporalFlux: 0.0011477361467768787,
    score: 0.7102674508287455,
  });
});

test("circular autocorrelation is blind to a phase wrap", () => {
  const width = 32;
  const height = 32;
  const wrappedGradient = Float32Array.from(
    { length: width * height },
    (_, index) => ((index % width + Math.floor(index / width)) % 8) / 8,
  );
  const linear = spatialAutocorrelation(wrappedGradient, width, height);
  const circular = circularSpatialAutocorrelation(wrappedGradient, width, height);

  expect(linear).toBeLessThan(0.4);
  expect(circular).toBeGreaterThan(0.7);
});

// Full sweeps are opt-in (SWEEP=1) — they step many kernels and take minutes.
const sweepTest = process.env.SWEEP ? test : test.skip;

sweepTest("sweep gray-scott F/k surface", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["gray-scott"]);
});

sweepTest("sweep boids", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["boids"]);
});

sweepTest("sweep lorenz", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["lorenz-attractor"]);
});

sweepTest("sweep clifford coefficients", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["clifford-dejong-clifford"]);
});

sweepTest("sweep dejong coefficients", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["clifford-dejong-dejong"]);
});

sweepTest("sweep svensson coefficients", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["clifford-dejong-svensson"]);
});

// Stage 57: the twelve remaining dynamic kernels. Same shape as above — one
// test per config, all behind the SWEEP gate.
sweepTest("sweep lenia growth plane", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["lenia"]);
});

sweepTest("sweep belousov-zhabotinsky feed/kill", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["belousov-zhabotinsky"]);
});

sweepTest("sweep physarum sensing geometry", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["physarum"]);
});

sweepTest("sweep swarmalators J/K plane", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["swarmalators"]);
});

sweepTest("sweep abelian sandpile", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["abelian-sandpile"]);
});

sweepTest("sweep brians brain", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["brians-brain"]);
});

sweepTest("sweep cyclic ca", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["cyclic-ca"]);
});

sweepTest("sweep game of life rules", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["game-of-life"]);
});

sweepTest("sweep ising external field/temperature", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["ising-model"]);
});

sweepTest("sweep diffusion-limited aggregation", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["diffusion-limited-aggregation"]);
});

sweepTest("sweep kuramoto coupling", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["kuramoto-oscillators"]);
});

sweepTest("sweep particle life", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["particle-life"]);
});
