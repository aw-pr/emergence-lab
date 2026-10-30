import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { effectiveIterationLimit } from "../src/sims/fractal/detail.ts";
import { driveKernel, type SweepDriverConfig } from "./harness/driver.ts";
import {
  channelMixing,
  circularSpatialAutocorrelation,
  gaussianBlur,
  lyapunovSignMetrics,
  meanResultantLength,
  scoreFrames,
  staticBoundaryMetrics,
  smoothPointCloudFrames,
  spatialAutocorrelation,
  summarizeMetrics,
  velocityCoherence,
  type InterestingnessMetrics,
  type MultiSnapshotMetrics,
} from "./harness/metrics.ts";
import {
  SWEEP_CONFIGS,
  MANDELBROT_REFINEMENT_CENTRES,
  MARKUS_COARSE_VIEWS,
  MARKUS_FINALISTS,
  MARKUS_REFINED_VIEWS,
  MARKUS_SEQUENCES,
  expandSweep,
  type ReferenceSet,
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

// The particle kernels rasterise species membership as an RGB triple, so the
// like-kind density channels the channel-mixing instrument reads are 0, 1, 2.
// This is a raster property of the harness, not a per-sim setting, which is why
// it is a constant here and not a field on PointCloudConfig.
const DENSITY_CHANNELS = [0, 1, 2] as const;

// Every test must run from the dev-server origin so the page-context dynamic
// import of the registry resolves same-origin (about:blank would block it).
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

/** Fraction of grid cells whose (A, B) lies outside the logistic map's [0,4]²
 * plane, where the kernel writes empty cells; mirrors sampleLyapunovGrid's
 * cell-to-plane mapping. */
function offPlaneFraction(params: Params, width: number, height: number): number {
  const scale = 2 / (Math.min(width, height) * Number(params.zoom));
  let outside = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const a = Number(params.centerX) + (x - (width - 1) / 2) * scale;
    const b = Number(params.centerY) + (y - (height - 1) / 2) * scale;
    if (a < 0 || a > 4 || b < 0 || b > 4) outside += 1;
  }
  return outside / (width * height);
}

/** Sign metrics plus raw-channel diagnostics for one pair of normalised
 * magnitude fields (channel value / channel span, so 1 is the ceiling). */
function markusSignRow(
  stable: ArrayLike<number>,
  chaotic: ArrayLike<number>,
  width: number,
  height: number,
  params: Params,
): InterestingnessMetrics {
  const n = width * height;
  let invalid = 0, ceiling = 0, both = 0;
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(stable[i]) || !Number.isFinite(chaotic[i])) invalid += 1;
    if (stable[i] >= 1) ceiling += 1;
    if (chaotic[i] >= 1) ceiling += 1;
    if (stable[i] > 0 && chaotic[i] > 0) both += 1;
  }
  return {
    ...lyapunovSignMetrics(stable, chaotic, width, height),
    nonFiniteFraction: invalid / n,
    ceilingFraction: ceiling / n,
    bothSignFraction: both / n,
    offPlaneFraction: offPlaneFraction(params, width, height),
  } as InterestingnessMetrics;
}

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
    preserveRange: Boolean(config.staticBoundary),
  };
  const scoreAtWarmup = async (warmupSteps: number): Promise<InterestingnessMetrics> => {
    const snapshotConfig = { ...driverConfig, warmupSteps };
    const result = await page.evaluate(driveKernel, snapshotConfig);

    // Point-cloud sims (config.pointCloud) score a Gaussian-smoothed density
    // field instead of raw dot occupancy; field sims take the identical path
    // they always did. See PointCloudConfig in harness/sims.ts.
    const pc = config.pointCloud;
    let frameA: ArrayLike<number> = result.frameA;
    let frameB: ArrayLike<number> = result.frameB;
    let coverageThreshold = config.coverageThreshold;
    if (pc) {
      const smoothed = smoothPointCloudFrames(
        result.frameA,
        result.frameB,
        result.width,
        result.height,
        pc.blurRadius,
      );
      frameA = smoothed.frameA;
      frameB = smoothed.frameB;
      coverageThreshold = pc.coverageThreshold;
    }
    if (config.signMix) {
      // Both magnitude channels are replayed at identical params and time and
      // read unclipped; the sign is never inferred from a scalar frame.
      const stable = config.signMix.stableChannel === config.primaryChannel ? result
        : await page.evaluate(driveKernel, { ...snapshotConfig, primaryChannel: config.signMix.stableChannel, fluxGap: 0 });
      const chaotic = await page.evaluate(driveKernel, { ...snapshotConfig, primaryChannel: config.signMix.chaoticChannel, fluxGap: 0 });
      return markusSignRow(stable.frameA, chaotic.frameA, result.width, result.height, params);
    }
    const metrics = scoreFrames(
      frameA,
      frameB,
      result.width,
      result.height,
      coverageThreshold,
    );
    if (config.staticBoundary) {
      return { ...metrics, ...staticBoundaryMetrics(frameA, result.width, result.height) };
    }

    if (pc?.velocityChannels) {
      // The kernels are deterministic (same params + same step count => same
      // state), so re-driving with a different primaryChannel yields velocity
      // frames exactly aligned with the density frame; driver.ts stays
      // untouched. The channels carry a [-1, 1] channelRange that the driver
      // normalises to [0, 1], so map back to signed components before the
      // order parameter.
      const [vxChannel, vyChannel] = pc.velocityChannels;
      const vxResult = await page.evaluate(driveKernel, {
        ...snapshotConfig,
        primaryChannel: vxChannel,
        fluxGap: 0,
      });
      const vyResult = await page.evaluate(driveKernel, {
        ...snapshotConfig,
        primaryChannel: vyChannel,
        fluxGap: 0,
      });
      metrics.velocityCoherence = velocityCoherence(
        vxResult.frameA.map((v) => v * 2 - 1),
        vyResult.frameA.map((v) => v * 2 - 1),
      );
    } else if (pc) {
      // Channel mixing (stage 78), for point-cloud sims whose channels are all
      // like-kind densities. A sim that declares velocityChannels is excluded
      // by the branch above: its channels are density, speed and two signed
      // velocity components, which are not comparable quantities to blend.
      //
      // The raw dot raster cannot answer this — an occupied cell almost always
      // holds one particle of one species, so it reads 0 by construction, the
      // same one-cell blindness stage 63 recorded for autocorrelation. So each
      // channel is blurred with the sim's own blurRadius first, turning the
      // triple into a local per-species density estimate; the mixing fraction
      // is a within-cell ratio, so blurring every channel by the same kernel
      // leaves the reading comparable across cells.
      const smoothedChannels: number[][] = [];
      for (const channel of DENSITY_CHANNELS) {
        const channelResult = channel === config.primaryChannel
          ? result
          : await page.evaluate(driveKernel, {
            ...snapshotConfig,
            primaryChannel: channel,
            fluxGap: 0,
          });
        smoothedChannels.push(
          gaussianBlur(
            channelResult.frameA,
            result.width,
            result.height,
            pc.blurRadius,
          ),
        );
      }
      // Include the cells the composite's coverage term would call figure
      // rather than ground: total density, max-normalised the way
      // smoothPointCloudFrames normalises the primary channel, above the sim's
      // point-cloud threshold.
      const total = new Array<number>(result.width * result.height).fill(0);
      for (const field of smoothedChannels) {
        for (let i = 0; i < total.length; i += 1) total[i] += field[i];
      }
      let peak = 0;
      for (let i = 0; i < total.length; i += 1) if (total[i] > peak) peak = total[i];
      const mask = peak > 0
        ? total.map((value) => (value / peak > pc.coverageThreshold ? 1 : 0))
        : total.map(() => 0);
      metrics.channelMixing = channelMixing(smoothedChannels, mask);
    }

    if (!config.phase) return metrics;
    const phaseResult = config.phase.channel === config.primaryChannel
      ? result
      : await page.evaluate(driveKernel, {
        ...snapshotConfig,
        primaryChannel: config.phase.channel,
        fluxGap: 0,
      });
    const occupancyResult = !config.phase.occupancy
      ? undefined
      : config.phase.occupancy.channel === config.primaryChannel
        ? result
        : await page.evaluate(driveKernel, {
          ...snapshotConfig,
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
    return metrics;
  };

  if (!config.multiSnapshot) {
    return { id, label, params, metrics: await scoreAtWarmup(config.warmupSteps),
      ...(config.staticBoundary ? { methodVersion: config.staticBoundary.methodVersion } : {}),
      ...(config.signMix ? { methodVersion: config.signMix.methodVersion } : {}) };
  }

  if (config.multiSnapshot.warmupSteps.length === 0) {
    throw new Error(`${config.slug}: multiSnapshot.warmupSteps must not be empty`);
  }
  const samples: InterestingnessMetrics[] = [];
  for (const warmupSteps of config.multiSnapshot.warmupSteps) {
    samples.push(await scoreAtWarmup(warmupSteps));
  }
  return { id, label, params, metrics: summarizeMetrics(samples) };
}

function isMultiSnapshotMetrics(
  metrics: InterestingnessMetrics,
): metrics is MultiSnapshotMetrics {
  return "spread" in metrics;
}

function multiSnapshotMetricsTable(candidates: ScoredCandidate[]): string {
  const metricsKeys: (keyof InterestingnessMetrics)[] = [
    "score",
    "entropy",
    "variance",
    "spatialAutocorrelation",
    "coverage",
    "temporalFlux",
    "meanResultantLength",
    "circularSpatialAutocorrelation",
  ];
  const lines = [
    "| set | metric | mean | min | max | std dev |",
    "|---|---|---:|---:|---:|---:|",
  ];
  for (const candidate of candidates) {
    if (!isMultiSnapshotMetrics(candidate.metrics)) continue;
    for (const key of metricsKeys) {
      const value = candidate.metrics[key];
      const spread = candidate.metrics.spread[key];
      if (value === undefined || spread === undefined) continue;
      lines.push(
        `| ${candidate.label} | ${key} | ${value.toFixed(6)} | ${spread.min.toFixed(6)} | ${spread.max.toFixed(6)} | ${spread.standardDeviation.toFixed(6)} |`,
      );
    }
  }
  return lines.join("\n");
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
  const planned = sweepParams.map(params => ({
    id: paramKeys.map(k => `${k}${params[k]}`).join("_"), params,
  }));
  const manifest = config.staticBoundary ? {
    slug, methodVersion: config.staticBoundary.methodVersion,
    grid: { width: config.gridWidth, height: config.gridHeight },
    warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
    command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 137 "',
    determinism: "Fixed deterministic geometry; no RNG or seed; fresh kernel per measurement.",
    fixedParams: config.baseParams,
    sourceHashes: Object.fromEntries(["src/app/presets.ts", "src/sims/mandelbrot/kernel.ts", "src/sims/fractal/detail.ts", "e2e/harness/metrics.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
    validationPlan: {
      shortlist: "Best scored view in each of the three anchor-scale regions; one representative per region, even if rejected. No numerical morphology labels.",
      resolutions: [128, 256], viewport: { width: 1200, height: 900 },
      presentation: { palette: "inferno", gamma: 0.7, contrast: 1.5, paletteSteps: 0, pointSize: 1, bloom: 0.3, invert: false, paused: true, palettePhase: 0, cycleSpeed: 0 },
      iterationMethod: "Compute actual zoom boost; request base=2*effective-boost only if base<=2048 and effective<=4096. Otherwise measure actual effective limit against a lower reference and mark cap-limited. Additional top-view base2048 cap probe is validation, not a searched view.",
      replay: "Same Chromium/runtime, fresh direct kernel import; absolute metric tolerance1e-9 and identical full candidate ordering. Different resolutions are separate checks.",
    },
    candidateCounts: { coarse: 48, refined: sweepParams.length - 48 },
    candidates: planned,
    effectiveLimits: planned.map(c => ({ id: c.id, effective: effectiveIterationLimit(Number(c.params.maxIterations), Number(c.params.zoom), Boolean(c.params.autoIterations)) })),
    priorCoverage: [
      { source: "docs/sweeps/2026-10-30-interestingness-batch.md#live-audit", description: "Planning audit: Mandelbrot has no historical harness config, grid, appendix or retained rankings. Old coverage ranges: none. No old Mandelbrot candidate grid is repeated." },
      { source: "src/app/presets.ts", description: "Shipped anchors: whole-set (-0.5,0,1;128), seahorse-valley (-0.75,0.047,18;256), spiral-hub (-0.761574,-0.0847596,96;384). These are references, not novel candidates; palettePhase/cycleSpeed are overridden to 0." },
      { source: "src/sims/mandelbrot/kernel.ts", description: "Kernel default (-0.5,0,1;128), automatic detail true. Schema centre ranges [-2,1] and [-1.5,1.5], zoom [0.25,100000000], base iterations [16,2048]. Candidate base512 is a fixed measurement setting, not a parameter search." },
      { source: "src/sims/fractal/detail.ts", description: "Effective = min(4096, bounded base + floor(48*log2(max(1,zoom)))) with automatic detail. All convergence rows record actual limits; impossible doubling uses lower reference and cap-limited uncertainty." },
    ],
    search: {
      coarse: "3 shipped anchors × zoom factors [1.2,1.6,2.2,3] × x/y offsets [-0.12,+0.12] times anchor span 3/zoom = 48 views; centre rounded to 12 decimals, zoom to 6.",
      inclusion: "Nearby nonidentical windows around all shipped anchor scales; all 48 retained, including empty/solid negatives.",
      exclusion: "No global slider Cartesian product, far/deep zoom, palette search, motion or logistic-mandelbrot; refinement only around leading distinct coarse anchor regions, at most32 views.",
      refined: "Best coarse window in each original anchor-scale region; choose negative-y whole-set conjugate on tied score. 3 centres × factors [1.15,1.45] × x/y offsets [-0.06,+0.06] times centre span 3/zoom =24 views. First48 entries are coarse; last24 are refined.",
      refinementCentres: MANDELBROT_REFINEMENT_CENTRES,
    },
    references: config.references,
  } : undefined;
  if (manifest) {
    expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(planned.length + config.references.length);
    // Persist the declaration before the first kernel measurement.
    writeText(`docs/sweeps/data/2026-10-30/137/manifest-${sweepParams.length === 48 ? "coarse" : "refined"}.json`, JSON.stringify(manifest, null, 2));
  }
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
    if (config.pointCloud) {
      // Also emit what the instrument actually scores, so the smoothing can
      // be sanity-checked by eye alongside the raw dots.
      const smoothed = smoothPointCloudFrames(
        frame.frameA,
        frame.frameA,
        frame.width,
        frame.height,
        config.pointCloud.blurRadius,
      );
      writePng(
        `${ARTIFACT_ROOT}/${artifactId}/${cand.id}.smoothed.png`,
        smoothed.frameA,
        frame.width,
        frame.height,
        3,
      );
    }
  }

  const md = [
    `# Interestingness sweep — ${artifactId}`,
    "",
    `Grid ${config.gridWidth}×${config.gridHeight}, warmup ${config.warmupSteps} steps, flux gap ${config.fluxGap}.`,
    config.staticBoundary ? `Scored on channel ${config.primaryChannel}; ${config.staticBoundary.methodVersion}; zero/nonzero geometry, lag-1 and lag-2 edges; no temporal bonus.` : `Scored on channel ${config.primaryChannel}, coverage threshold ${config.coverageThreshold}.`,
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
    ...(config.multiSnapshot ? [
      "## Multi-snapshot metric spread",
      "",
      `Each value is the mean of N=${config.multiSnapshot.warmupSteps.length} deterministic frame pairs captured after warmup steps ${config.multiSnapshot.warmupSteps.join(", ")}. Runtime is roughly N times a single-pair drive because every position starts from a fresh kernel.`,
      "",
      multiSnapshotMetricsTable([...topN, ...references]),
      "",
    ] : []),
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
    JSON.stringify({ ranked, references, ...(config.staticBoundary ? { methodVersion: config.staticBoundary.methodVersion } : {}) }, null, 2),
  );

  if (manifest) await retainStaticEvidence(page, config, ranked, references, manifest);

  const coherenceNote = (c: ScoredCandidate): string =>
    (c.metrics.velocityCoherence === undefined
      ? ""
      : ` vcoh ${c.metrics.velocityCoherence.toFixed(3)}`) +
    (c.metrics.channelMixing === undefined
      ? ""
      : ` mix ${c.metrics.channelMixing.toFixed(3)}`);
  console.log(`\n=== ${artifactId} top 5 ===`);
  for (const c of ranked.slice(0, 5)) {
    console.log(
      `  ${c.metrics.score.toFixed(3)}  ${c.id}  (ent ${c.metrics.entropy.toFixed(2)} ac ${c.metrics.spatialAutocorrelation.toFixed(2)} cov ${c.metrics.coverage.toFixed(2)} flux ${c.metrics.temporalFlux.toFixed(4)}${coherenceNote(c)})`,
    );
  }
  console.log(`=== ${artifactId} references ===`);
  for (const c of references) {
    console.log(`  ${c.metrics.score.toFixed(3)}  ${c.label}${coherenceNote(c)}`);
  }

  return ranked;
}

async function retainStaticEvidence(page: Page, config: SimSweepConfig, ranked: ScoredCandidate[], references: ScoredCandidate[], manifest: object): Promise<void> {
  const root = "docs/sweeps/data/2026-10-30/137";
  const imageRoot = "docs/images/sweeps-2026-10-30";
  const limit = (p: Params) => effectiveIterationLimit(Number(p.maxIterations), Number(p.zoom), Boolean(p.autoIterations));
  const drive = (p: Params, size: number) => page.evaluate(driveKernel, {
    registryUrl: REGISTRY_URL, slug: config.slug, params: p,
    gridWidth: size, gridHeight: size, warmupSteps: 0, fluxGap: 0, dt: 1, primaryChannel: 0, preserveRange: true,
  });
  // Keep spatially distinct evidence rather than three adjacent scalar winners.
  const finalists: ScoredCandidate[] = [];
  const region = (c: ScoredCandidate) => Number(c.params.zoom) >= 100 ? "spiral" : Number(c.params.zoom) >= 10 ? "seahorse" : "whole";
  for (const c of ranked) {
    if (c.metrics.score <= 0) continue;
    if (finalists.every(f => region(f) !== region(c))) finalists.push(c);
    if (finalists.length === 3) break;
  }
  expect(finalists.length).toBeGreaterThan(0);
  const replay: object[] = [], validation: object[] = [], images = new Map<string, string[]>();
  const selected = [...finalists, ...references];
  await page.setViewportSize({ width: 1200, height: 900 });
  for (const c of selected) {
    const raw = await drive(c.params, 128);
    const replayed = staticBoundaryMetrics(raw.frameA, 128, 128);
    let maxDelta = 0;
    for (const [key, value] of Object.entries(replayed)) {
      maxDelta = Math.max(maxDelta, Math.abs(value - (c.metrics as any)[key]));
    }
    expect(maxDelta, `replay ${c.id}`).toBeLessThanOrEqual(1e-9);
    const hash = createHash("sha256").update(Buffer.from(new Float32Array(raw.frameA).buffer)).digest("hex");
    writeText(`${root}/${c.id}.field-128.json`, JSON.stringify({ id: c.id, width: 128, height: 128, params: c.params, sha256Float32: hash, field: raw.frameA }));
    replay.push({ id: c.id, metrics: replayed, maxAbsoluteDelta: maxDelta, sha256Float32: hash });
    const high = await drive(c.params, 256);
    const highMetrics = staticBoundaryMetrics(high.frameA, 256, 256);
    // Exact doubling must compensate for the automatic zoom boost.
    const effective = limit(c.params);
    const boost = effective - Number(c.params.maxIterations);
    const requestedBase = 2 * effective - boost;
    const doubled = requestedBase <= 2048 && 2 * effective <= 4096;
    const comparisonParams = { ...c.params, maxIterations: doubled ? requestedBase : Math.max(16, Math.floor(effective / 2) - boost) };
    const comparison = await drive(comparisonParams, 256);
    let membershipChanged = 0, absoluteDifference = 0;
    for (let i = 0; i < high.frameA.length; i += 1) {
      if ((high.frameA[i] === 0) !== (comparison.frameA[i] === 0)) membershipChanged += 1;
      absoluteDifference += Math.abs(high.frameA[i] - comparison.frameA[i]);
    }
    validation.push({ id: c.id, params: c.params, grid: 256, effectiveLimit: effective,
      comparisonParams, comparisonEffectiveLimit: limit(comparisonParams), exactDoubling: doubled,
      capLimitedUncertainty: !doubled, metrics: highMetrics,
      comparisonMetrics: staticBoundaryMetrics(comparison.frameA, 256, 256),
      membershipChangedFraction: membershipChanged / high.frameA.length,
      meanAbsoluteFieldDifference: absoluteDifference / high.frameA.length });
    const fieldPath = `${imageRoot}/137-${c.id}-field-256.png`;
    writePng(fieldPath, high.frameA, 256, 256, 1);
    const maskPath = `${imageRoot}/137-${c.id}-membership-256.png`;
    writePng(maskPath, high.frameA.map(v => v === 0 ? 0 : 1), 256, 256, 1);
    const comparisonMaskPath = `${imageRoot}/137-${c.id}-comparison-membership-256.png`;
    writePng(comparisonMaskPath, comparison.frameA.map(v => v === 0 ? 0 : 1), 256, 256, 1);
    // Exercise the actual application and its GPU renderer through its controls.
    await page.goto("/#/mandelbrot");
    await page.locator("[data-param-key=centerX]").waitFor();
    const pause = page.getByRole("button", { name: "Pause", exact: true });
    if (await pause.count()) await pause.evaluate(el => (el as HTMLButtonElement).click());
    const palette = page.locator("select").filter({ has: page.locator('option[value="inferno"]') });
    await palette.evaluate(el => {
      (el as HTMLSelectElement).value = "inferno";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await palette.inputValue()).toBe("inferno");
    await page.locator("[data-param-key=autoIterations]").setChecked(Boolean(c.params.autoIterations));
    const presentation = { Gamma: 0.7, Contrast: 1.5, "Palette steps": 0, "Point size (px)": 1, Bloom: 0.3 };
    for (const [label, value] of Object.entries(presentation)) {
      await page.getByText(label, { exact: true }).locator("..").locator("input").evaluate((el, value) => {
        const input = el as HTMLInputElement;
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    }
    await page.getByText("Invert colours", { exact: true }).locator("..").locator("input").evaluate(el => {
      const input = el as HTMLInputElement;
      if (input.checked) input.click();
    });
    for (const key of ["cycleSpeed", "palettePhase", "centerX", "centerY", "zoom", "maxIterations"]) {
      await page.locator(`[data-param-key=${key}]`).evaluate((el, value) => {
        const input = el as HTMLInputElement;
        input.step = "any";
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, c.params[key]);
    }
    const inputs = await page.locator("input[data-param-key]").evaluateAll(es => Object.fromEntries(es.map(el => {
      const e = el as HTMLInputElement;
      return [e.dataset.paramKey!, e.type === "checkbox" ? e.checked : Number(e.value)];
    })));
    for (const [key, value] of Object.entries(c.params)) expect(inputs[key], `app input ${key}`).toBe(value);
    await page.waitForTimeout(150);
    const appPath = `${imageRoot}/137-${c.id}-app.png`;
    await page.screenshot({ path: appPath, animations: "disabled", timeout: 20_000 });
    const canvas = await page.locator("canvas").evaluate(el => ({ width: el.width, height: el.height, attributes: Object.fromEntries(Array.from(el.attributes, a => [a.name, a.value])) }));
    validation[validation.length - 1] = { ...validation[validation.length - 1], app: { viewport: { width: 1200, height: 900 }, inputs, canvas, palette: "inferno", presentation, invert: false, motion: "paused; phase0 and speed0", note: "GPU app renderer; landscape aspect differs from square CPU field. UI inputs retain full precision via step=any before input/change events." } };
    images.set(c.id, [appPath, fieldPath, maskPath, comparisonMaskPath]);
    console.log(`  static validation: ${c.id}; replay delta ${maxDelta}; iterations ${effective} → ${limit(comparisonParams)}`);
  }
  const w = 32, blank = Array(w * w).fill(0);
  let seed = 1234567;
  const calibration = Object.fromEntries(Object.entries({
    empty: blank, full: blank.map(() => 1), split: blank.map((_, i) => i % w < 16 ? 0 : 1),
    bands: blank.map((_, i) => Math.floor((i % w) / 4) % 2),
    noise: blank.map(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 31; }),
  }).map(([id, field]) => [id, staticBoundaryMetrics(field, w, w)]));
  const capParams = { ...finalists[0].params, maxIterations: 2048 };
  const capEffective = limit(capParams);
  const capBoost = capEffective - 2048;
  const lowerParams = { ...capParams, maxIterations: Math.max(16, Math.floor(capEffective / 2) - capBoost) };
  const capField = await drive(capParams, 256), lowerField = await drive(lowerParams, 256);
  const iterationCapProbe = { params: capParams, effectiveLimit: capEffective,
    requestedDoubleEffectiveLimit: 2 * capEffective, requestedDoubleBase: 2 * capEffective - capBoost,
    exactDoubling: false, capLimitedUncertainty: true, reason: "Doubling exceeds base2048 and/or effective4096; this is a capped measurement against a lower reference, not a doubling.",
    lowerParams, lowerEffectiveLimit: limit(lowerParams),
    metrics: staticBoundaryMetrics(capField.frameA, 256, 256), lowerMetrics: staticBoundaryMetrics(lowerField.frameA, 256, 256),
    membershipChangedFraction: capField.frameA.filter((v, i) => (v === 0) !== (lowerField.frameA[i] === 0)).length / (256 * 256) };
  const result = { manifest, ranked, references,
    finalists: finalists.map(c => {
      const referenceId = region(c) === "whole" ? "137-current-whole-set" : region(c) === "seahorse" ? "137-current-seahorse-valley" : "137-current-spiral-hub";
      return { id: c.id, referenceId, images: [...images.get(c.id)!, ...images.get(referenceId)!] };
    }),
    calibration, replay, validation, iterationCapProbe, referenceImages: Object.fromEntries(images),
    replayTolerance: 1e-9, runtime: { browser: page.context().browser()?.version(), platform: process.platform, node: process.version } };
  writeText(`${root}/mandelbrot.json`, JSON.stringify(result, null, 2));
  if (ranked.length === 48) writeText(`${root}/coarse-results.json`, JSON.stringify({ manifest, ranked, references }, null, 2));
}

// Always-on: a fast sanity check that the metric stack rewards a coherent Turing
// regime over a washed-out one, and produces finite numbers. Keeps the default
// suite quick while still exercising the whole harness path through the browser.
// AUTOMETTA-CONTRACT-BEGIN card=docs/stages/70-gray-scott-rebaseline.md
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
// AUTOMETTA-CONTRACT-END

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

test("multi-snapshot summary reports the mean and population spread", () => {
  const first = {
    entropy: 0.2,
    variance: 0.02,
    spatialAutocorrelation: 0.4,
    coverage: 0.3,
    temporalFlux: 0.01,
    score: 0.25,
  };
  const second = {
    entropy: 0.6,
    variance: 0.06,
    spatialAutocorrelation: 0.8,
    coverage: 0.5,
    temporalFlux: 0.03,
    score: 0.75,
  };

  expect(summarizeMetrics([first, second])).toEqual({
    entropy: 0.4,
    variance: 0.04,
    spatialAutocorrelation: 0.6000000000000001,
    coverage: 0.4,
    temporalFlux: 0.02,
    score: 0.5,
    sampleCount: 2,
    spread: {
      entropy: { min: 0.2, max: 0.6, standardDeviation: 0.19999999999999998 },
      variance: { min: 0.02, max: 0.06, standardDeviation: 0.02 },
      spatialAutocorrelation: { min: 0.4, max: 0.8, standardDeviation: 0.2 },
      coverage: { min: 0.3, max: 0.5, standardDeviation: 0.1 },
      temporalFlux: { min: 0.01, max: 0.03, standardDeviation: 0.01 },
      score: { min: 0.25, max: 0.75, standardDeviation: 0.25 },
    },
  });
});

test("Lorenz multi-snapshot scoring reproduces its recorded mean", async ({ page }) => {
  const config = SWEEP_CONFIGS["lorenz-attractor"];
  const classic = await scoreOne(page, config, "classic", "Classic rho=28", {
    sigma: 10,
    rho: 28,
    beta: 2.6667,
    stepsPerFrame: 6,
    fade: 0.992,
  });

  expect(classic.metrics.score).toBe(0.5950786710384337);
  expect(isMultiSnapshotMetrics(classic.metrics)).toBe(true);
  if (isMultiSnapshotMetrics(classic.metrics)) {
    expect(classic.metrics.spread.score?.standardDeviation).toBe(
      0.010529246641957262,
    );
  }
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

test("static boundary diagnostics expose invalid fields and ignore escape brightness", () => {
  expect(() => staticBoundaryMetrics([], 0, 0)).toThrow();
  expect(() => staticBoundaryMetrics([0], 2, 2)).toThrow();
  const field = Array.from({ length: 64 }, (_, i) => i % 8 < 4 ? 0 : 0.1);
  expect(staticBoundaryMetrics(field, 8, 8)).toEqual(staticBoundaryMetrics(field.map(v => v ? 0.9 : 0), 8, 8));
  const invalid = staticBoundaryMetrics([0, NaN, Infinity, 2], 2, 2);
  expect(invalid.nonFiniteFraction).toBe(0.5);
  expect(invalid.outOfRangeFraction).toBe(0.25);
  expect(invalid.score).toBe(0);
});

const staticReplayTest = process.env.SWEEP_REPLAY === "137" ? test : test.skip;
staticReplayTest("137 independently replay retained geometry through direct browser imports", async ({ page }) => {
  test.setTimeout(180_000);
  const data = JSON.parse(readFileSync("docs/sweeps/data/2026-10-30/137/mandelbrot.json", "utf8"));
  const actual: { id: string; score: number; maxAbsoluteDelta: number }[] = [];
  for (const row of [...data.manifest.candidates, ...data.references]) {
    const measured = await page.evaluate(async params => {
      const kernelUrl = "/src/sims/mandelbrot/kernel.ts";
      const metricsUrl = "/e2e/harness/metrics.ts";
      const { MandelbrotKernel } = await import(/* @vite-ignore */ kernelUrl);
      const { staticBoundaryMetrics } = await import(/* @vite-ignore */ metricsUrl);
      const kernel = new MandelbrotKernel();
      kernel.init(128, 128, params);
      const result = staticBoundaryMetrics(kernel.readState(), 128, 128);
      kernel.destroy();
      return result;
    }, row.params);
    const expected = [...data.ranked, ...data.references].find(c => c.id === row.id);
    let maxAbsoluteDelta = 0;
    for (const [key, value] of Object.entries(measured)) {
      maxAbsoluteDelta = Math.max(maxAbsoluteDelta, Math.abs(Number(value) - expected.metrics[key]));
    }
    expect(maxAbsoluteDelta, row.id).toBeLessThanOrEqual(1e-9);
    actual.push({ id: row.id, score: measured.score, maxAbsoluteDelta });
  }
  const candidateIds = new Set(data.manifest.candidates.map(c => c.id));
  expect(actual.filter(c => candidateIds.has(c.id)).sort((a, b) => b.score - a.score).map(c => c.id)).toEqual(data.ranked.map(c => c.id));
  const shipped = await page.evaluate(async () => {
    const url = "/src/app/presets.ts";
    return (await import(/* @vite-ignore */ url)).presetsFor("mandelbrot");
  });
  expect(data.references).toHaveLength(shipped.length + 1);
  for (const preset of shipped) {
    const row = data.references.find(r => r.id === `137-current-${preset.id}`);
    expect(row.params).toEqual({ ...preset.params, autoIterations: true, palettePhase: 0, cycleSpeed: 0 });
  }
  writeText("e2e/artifacts/sweep-137-mandelbrot/independent-replay.json", JSON.stringify({ tolerance: 1e-9, actual }, null, 2));
  console.log(`Replayed ${actual.length} fields; identical ordering; maximum metric deviation ${Math.max(...actual.map(c => c.maxAbsoluteDelta))}`);
});

// Full sweeps are opt-in (SWEEP=1) — they step many kernels and take minutes.
const sweepTest = process.env.SWEEP ? test : test.skip;
const lorenzSnapshotsTest = process.env.LORENZ_SNAPSHOTS ? test : test.skip;
const mixingTest = process.env.PARTICLE_LIFE_MIXING ? test : test.skip;

sweepTest("sweep 137 Mandelbrot static boundaries", async ({ page }) => {
  test.setTimeout(900_000);
  await runSweep(page, SWEEP_CONFIGS["sweep-137-mandelbrot"]);
});

mixingTest("re-score Particle Life references under channel mixing", async ({ page }) => {
  // Stage 78 is a calibration read on the three shipped references only, not a
  // sweep: three extra kernel drives per reference, no ranking, no promotion.
  const config = SWEEP_CONFIGS["particle-life"];
  for (const ref of config.references) {
    const scored = await scoreOne(page, config, ref.id, ref.label, ref.params);
    console.log(JSON.stringify({ id: ref.id, label: ref.label, metrics: scored.metrics }));
  }
});

lorenzSnapshotsTest("record Lorenz multi-snapshot appendix sets", async ({ page }) => {
  const config = SWEEP_CONFIGS["lorenz-attractor"];
  const sets: ReferenceSet[] = [
    { id: "rho-28", label: "Classic rho=28", params: { sigma: 10, rho: 28, beta: 2.6667, stepsPerFrame: 6, fade: 0.992 } },
    { id: "rho-35", label: "Wide wings rho=35", params: { sigma: 10, rho: 35, beta: 2.6667, stepsPerFrame: 12, fade: 0.99 } },
    { id: "rho-37-fade", label: "rho=37 long fade", params: { sigma: 10, rho: 37, beta: 2.6667, stepsPerFrame: 6, fade: 0.997 } },
    { id: "rho-42-fade", label: "rho=42 long fade", params: { sigma: 10, rho: 42, beta: 2.6667, stepsPerFrame: 6, fade: 0.997 } },
  ];

  for (const set of sets) {
    const singleStart = performance.now();
    const single = await scoreOne(
      page,
      { ...config, multiSnapshot: undefined },
      set.id,
      set.label,
      set.params,
    );
    const singleMs = performance.now() - singleStart;
    const multiStart = performance.now();
    const multi = await scoreOne(page, config, set.id, set.label, set.params);
    const multiMs = performance.now() - multiStart;
    console.log(JSON.stringify({
      id: set.id,
      params: set.params,
      singleScore: single.metrics.score,
      wallClockMs: { single: singleMs, multi: multiMs },
      multiSnapshot: multi.metrics,
    }));
  }
});

sweepTest("sweep gray-scott F/k surface", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["gray-scott"]);
});

sweepTest("sweep boids", async ({ page }) => {
  // 60 sets on a 200² grid with two extra velocity-channel re-drives per set
  // outruns the global 180s budget (it died at ~50/60 there on 2026-08-30);
  // ~4.3 minutes measured end-to-end, so 15 minutes is a generous ceiling.
  test.setTimeout(900_000);
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

// Stage 81: the diffusion line, at Spiral waves' feed/kill. Named so that the
// card's `-g "sweep belousov"` runs it alongside the feed/kill sweep, which is
// what re-scores the three references in the same session.
sweepTest("sweep belousov-zhabotinsky diffusion line", async ({ page }) => {
  await runSweep(page, SWEEP_CONFIGS["belousov-zhabotinsky-diffusion"]);
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


sweepTest("sweep 139 Julia connectivity transitions", async ({ page }) => {
  test.setTimeout(900_000);
  const config = SWEEP_CONFIGS["sweep-139-julia-set"];
  const root = "docs/sweeps/data/2026-10-30/139";
  const imageRoot = "docs/images/sweeps-2026-10-30";
  const planned = expandSweep(config).map((params, i) => ({ id: `139-c${String(i + 1).padStart(2, "0")}`, params }));
  const manifest = {
    slug: config.slug, methodVersion: config.staticBoundary!.methodVersion,
    grid: { width: 128, height: 128 }, warmupSteps: 0, fluxGap: 0, dt: 1,
    command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 139 "',
    candidates: planned, references: config.references, fixedParams: config.baseParams,
    determinism: "Fresh deterministic Julia kernel per row, no RNG/seed, no step calls; phase0/cycle0; no rotation parameter exists.",
    candidateCounts: { constants: 64, refinedViews: planned.length - 64 },
    priorCoverage: [
      { source: "docs/sweeps/2026-10-30-interestingness-batch.md#live-baseline-and-scope-reconciliation", description: "Julia was one of five uncovered kernels: no old grid, appendix range, config, or retained Julia ranking. Historical candidate ranges: none; no old grid repeated." },
      { source: "src/app/presets.ts", description: "Current Dendrite seed c=(-0.8,0.156), centre(0,0),zoom1,base128,phase0,cycle0.30; Douady rabbit c=(-0.123,0.745),centre(0,0),zoom1.15,base220,phase0.12,cycle0.40. Both inherit adaptive detail true. References override phase/cycle to0 only." },
      { source: "src/sims/julia-set/kernel.ts", description: "Default c=(-0.4,0.6),centre(0,0),zoom1.45,base180,adaptive true,phase0.38,cycle0.1. Schema c real/imag [-1.5,1.5],centre[-2,2],zoom[0.25,1e8],base[16,2048]. Reference overrides phase/cycle to0." },
    ],
    search: {
      constants: "Four 4x4 neighborhoods: default re[-.44,-.42,-.38,-.36] im[.56,.58,.62,.64]; dendrite re[-.83,-.81,-.79,-.77] im[.141,.151,.161,.171]; rabbit re[-.153,-.133,-.113,-.093] im[.715,.735,.755,.775]; dendrite outward flank re[-.82,-.8,-.78,-.76] im[.185,.195,.205,.215]. Enumeration re outer, im inner, neighborhoods in this order. All at zoom.85/base512/adaptive false.",
      refined: "Six coarse constants chosen by manual 8x8 membership-montage inspection: c01 (coarse score leader), c13 (filled default-neighborhood comparison), c16 (branching star), c17 (dendrite lobes), c33 (rabbit lobes), c49 (sparse dust). Each paired with zoom[1,1.3,1.7,2.2]; centre remains0. Exact full list in candidates:24 refinements.",
      inclusion: "Local changes around every shipped seed and default; outward dendrite flank retained to expose fragmentation and zero-score negatives. Every candidate retained regardless of score.",
      exclusion: "No global constant slider sweep, pan search, palette/brightness/cycling search, random seed or temporal ranking; no production edits. No topology proof from raster morphology.",
    },
    validationPlan: { sizes: [128,256], viewport: { width:1200,height:900 }, iterations: "Exact effective doubling at256; adaptive references compensate zoom boost in base. Candidate512 to1024. Different-resolution checks are separate from numeric replay.",
      presentation: { palette:"inferno", gamma:.7, contrast:1.5, paletteSteps:0, pointSize:1, bloom:.3, invert:false, paused:true, palettePhase:0, cycleSpeed:0 } },
    sourceHashes: Object.fromEntries(["src/app/presets.ts", "src/sims/julia-set/kernel.ts", "e2e/harness/metrics.ts"].map(p => [p,createHash("sha256").update(readFileSync(p)).digest("hex")])),
  };
  expect(new Set([...planned,...config.references].map(c=>c.id)).size).toBe(planned.length+config.references.length);
  writeText(`${root}/manifest-${planned.length === 64 ? "coarse" : "refined"}.json`, JSON.stringify(manifest,null,2));
  const drive = (params: Params, size: number) => page.evaluate(driveKernel, { registryUrl: REGISTRY_URL, slug: config.slug, params,
    gridWidth:size,gridHeight:size,warmupSteps:0,fluxGap:0,dt:1,primaryChannel:0,preserveRange:true });
  const candidates: ScoredCandidate[] = [];
  const sheet = new Float32Array(8*128 * Math.ceil(planned.length/8)*128);
  for (const c of planned) {
    const scored = await scoreOne(page,config,c.id,c.id,c.params);
    expect(Object.values(scored.metrics).every(Number.isFinite),c.id).toBe(true);
    const raw = await drive(c.params,128);
    const i = candidates.length;
    for(let y=0;y<128;y++) for(let x=0;x<128;x++) sheet[(Math.floor(i/8)*128+y)*1024+(i%8)*128+x] = raw.frameA[y*128+x]===0 ? 0 : 1;
    candidates.push(scored);
    if (candidates.length % 16 === 0) console.log(`Julia measured ${candidates.length}/${planned.length}`);
  }
  writePng(`${ARTIFACT_ROOT}/sweep-139-julia-set/all-membership.png`,sheet,1024,Math.ceil(planned.length/8)*128,1);
  const references: ScoredCandidate[] = [];
  for (const c of config.references) references.push(await scoreOne(page,config,c.id,c.label,c.params));
  const ranked = [...candidates].sort((a,b)=>b.metrics.score-a.metrics.score);
  // Explicit evidence choices are frozen after inspection of the coarse montage.
  const finalistIds = [ranked[0].id, "139-c65", "139-c87"];
  const finalists = [...new Set(finalistIds)].map(id=>ranked.find(c=>c.id===id)!);
  const replay: object[] = [], validation: any[] = [], images = new Map<string,string[]>();
  const limit = (p: Params) => effectiveIterationLimit(Number(p.maxIterations),Number(p.zoom),Boolean(p.autoIterations));
  await page.setViewportSize({width:1200,height:900});
  for (const c of [...finalists,...references]) {
    const raw = await drive(c.params,128), replayed = staticBoundaryMetrics(raw.frameA,128,128);
    const maxDelta = Math.max(...Object.entries(replayed).map(([k,v])=>Math.abs(v-(c.metrics as any)[k])));
    expect(maxDelta,c.id).toBeLessThanOrEqual(1e-9);
    replay.push({id:c.id,metrics:replayed,maxAbsoluteDelta:maxDelta});
    writeText(`${root}/${c.id}.field-128.json`,JSON.stringify({id:c.id,params:c.params,width:128,height:128,field:raw.frameA}));
    const high = await drive(c.params,256), effective = limit(c.params), boost = effective - Number(c.params.maxIterations);
    const comparisonParams = {...c.params,maxIterations:2*effective-boost};
    expect(Number(comparisonParams.maxIterations)).toBeLessThanOrEqual(2048);
    const comparison = await drive(comparisonParams,256);
    validation.push({id:c.id,params:c.params,grid:256,effectiveLimit:effective,comparisonParams,comparisonEffectiveLimit:limit(comparisonParams),
      metrics:staticBoundaryMetrics(high.frameA,256,256),comparisonMetrics:staticBoundaryMetrics(comparison.frameA,256,256),
      membershipChangedFraction:high.frameA.filter((v,i)=>(v===0)!==(comparison.frameA[i]===0)).length/high.frameA.length});
    const fieldPath = `${imageRoot}/139-${c.id}-field-256.png`;
    const maskPath = `${imageRoot}/139-${c.id}-membership-256.png`;
    const comparisonMaskPath = `${imageRoot}/139-${c.id}-comparison-membership-256.png`;
    writePng(fieldPath,high.frameA,256,256,1);
    writePng(maskPath,high.frameA.map(v=>v===0?0:1),256,256,1);
    writePng(comparisonMaskPath,comparison.frameA.map(v=>v===0?0:1),256,256,1);
    // Exercise the actual application and its GPU renderer through its controls.
    await page.goto("/#/julia-set");
    await page.reload();
    await page.locator("[data-param-key=centerX]").waitFor();
    const pause = page.getByRole("button", { name: "Pause", exact: true });
    if (await pause.count()) await pause.evaluate(el => (el as HTMLButtonElement).click());
    const palette = page.locator("select").filter({ has: page.locator('option[value="inferno"]') });
    await palette.evaluate(el => {
      (el as HTMLSelectElement).value = "inferno";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await palette.inputValue()).toBe("inferno");
    await page.locator("[data-param-key=autoIterations]").evaluate((el, checked) => {
      const input = el as HTMLInputElement;
      if (input.checked !== checked) input.click();
    }, Boolean(c.params.autoIterations));
    const presentation = { Gamma: 0.7, Contrast: 1.5, "Palette steps": 0, "Point size (px)": 1, Bloom: 0.3 };
    for (const [label, value] of Object.entries(presentation)) {
      await page.getByText(label, { exact: true }).locator("..").locator("input").evaluate((el, value) => {
        const input = el as HTMLInputElement;
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    }
    await page.getByText("Invert colours", { exact: true }).locator("..").locator("input").evaluate(el => {
      const input = el as HTMLInputElement;
      if (input.checked) input.click();
    });
    for (const key of ["cycleSpeed", "palettePhase", "cRe", "cIm", "centerX", "centerY", "zoom", "maxIterations"]) {
      await page.locator(`[data-param-key=${key}]`).evaluate((el, value) => {
        const input = el as HTMLInputElement;
        input.step = "any";
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, c.params[key]);
    }
    // The GPU draws on animation frames; release pause after all frozen inputs
    // are installed, then pause again once the renderer has consumed them.
    await page.getByRole("button", { name: "Play", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Pause", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
    const inputs = await page.locator("input[data-param-key]").evaluateAll(es => Object.fromEntries(es.map(el => {
      const e = el as HTMLInputElement;
      return [e.dataset.paramKey!, e.type === "checkbox" ? e.checked : Number(e.value)];
    })));
    for (const [key, value] of Object.entries(c.params)) expect(inputs[key], `app input ${key}`).toBe(value);
    await page.waitForTimeout(1000);
    const appPath = `${imageRoot}/139-${c.id}-app.png`;
    await page.screenshot({ path: appPath, animations: "disabled", timeout: 20_000 });
    const canvas = await page.locator("canvas").evaluate(el => ({ width: el.width, height: el.height, attributes: Object.fromEntries(Array.from(el.attributes, a => [a.name, a.value])) }));
    validation[validation.length - 1] = { ...validation[validation.length - 1], app: { viewport: { width: 1200, height: 900 }, inputs, canvas, palette: "inferno", presentation, invert: false, motion: "paused; phase0 and speed0", note: "GPU app renderer; landscape aspect differs from square CPU field. UI inputs retain full precision via step=any before input/change events." } };
    images.set(c.id, [appPath, fieldPath, maskPath, comparisonMaskPath]);
    console.log(`Julia validated ${c.id}; replay delta ${maxDelta}`);

  }
  const result = {manifest,ranked,references,finalists:finalists.map(c=>({id:c.id,referenceId:"139-current-dendrite",images:[...images.get(c.id)!,...images.get("139-current-dendrite")!]})),
    replay,validation,referenceImages:Object.fromEntries(images),replayTolerance:1e-9,runtime:{browser:page.context().browser()?.version(),node:process.version,platform:process.platform}};
  writeText(`${root}/julia-set.json`,JSON.stringify(result,null,2));
  writeText(`${ARTIFACT_ROOT}/sweep-139-julia-set/report.md`,metricsTable(ranked,["cRe","cIm","zoom"]));
  console.log(JSON.stringify({counts:{candidates:ranked.length,references:references.length},top:ranked.slice(0,8),finalists:finalists.map(c=>c.id)},null,2));
});

const juliaReplayTest = process.env.SWEEP_REPLAY === "139" ? test : test.skip;
juliaReplayTest("139 independently replay retained geometry through direct browser imports", async ({ page }) => {
  test.setTimeout(180_000);
  const data = JSON.parse(readFileSync("docs/sweeps/data/2026-10-30/139/julia-set.json", "utf8"));
  const actual: { id: string; score: number; maxAbsoluteDelta: number; metrics: object }[] = [];
  for (const row of [...data.manifest.candidates, ...data.references]) {
    const measured = await page.evaluate(async params => {
      const kernelUrl = "/src/sims/julia-set/kernel.ts";
      const metricsUrl = "/e2e/harness/metrics.ts";
      const { JuliaSetKernel } = await import(/* @vite-ignore */ kernelUrl);
      const { staticBoundaryMetrics } = await import(/* @vite-ignore */ metricsUrl);
      const kernel = new JuliaSetKernel();
      kernel.init(128, 128, params);
      const result = staticBoundaryMetrics(kernel.readState(), 128, 128);
      kernel.destroy();
      return result;
    }, row.params);
    const expected = [...data.ranked, ...data.references].find(c => c.id === row.id);
    let maxAbsoluteDelta = 0;
    for (const [key, value] of Object.entries(measured)) {
      maxAbsoluteDelta = Math.max(maxAbsoluteDelta, Math.abs(Number(value) - expected.metrics[key]));
    }
    expect(maxAbsoluteDelta, row.id).toBeLessThanOrEqual(1e-9);
    actual.push({ id: row.id, score: measured.score, maxAbsoluteDelta, metrics: measured });
  }
  const candidateIds = new Set(data.manifest.candidates.map(c => c.id));
  expect(actual.filter(c => candidateIds.has(c.id)).sort((a, b) => b.score - a.score).map(c => c.id)).toEqual(data.ranked.map(c => c.id));
  const shipped = await page.evaluate(async () => {
    const url = "/src/app/presets.ts";
    return (await import(/* @vite-ignore */ url)).presetsFor("julia-set");
  });
  expect(data.references).toHaveLength(shipped.length + 1);
  for (const preset of shipped) {
    const row = data.references.find(r => r.id === `139-current-${preset.id === "kernel-dendrite" ? "dendrite" : "rabbit"}`);
    expect(row.params).toEqual({ ...preset.params, autoIterations: true, palettePhase: 0, cycleSpeed: 0 });
  }
  writeText("docs/sweeps/data/2026-10-30/139/direct-replay.json", JSON.stringify({ tolerance: 1e-9, actual }, null, 2));
  console.log(`Replayed ${actual.length} fields; identical ordering; maximum metric deviation ${Math.max(...actual.map(c => c.maxAbsoluteDelta))}`);
});


const MARKUS_ROOT = "docs/sweeps/data/2026-10-30/140";
const MARKUS_IMAGES = "docs/images/sweeps-2026-10-30";

/** Row-wise sign map: S stable, C chaotic, 0 neither. Compact and lossless for
 * every sign metric, which only ever tests each channel against zero. */
function signRows(stable: ArrayLike<number>, chaotic: ArrayLike<number>, width: number, height: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = "";
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      row += stable[i] > 0 && !(chaotic[i] > 0) ? "S" : chaotic[i] > 0 && !(stable[i] > 0) ? "C" : "0";
    }
    rows.push(row);
  }
  return rows;
}

/** Grayscale sign image: chaotic black, neither-sign mid grey, stable white. */
function signImage(rows: string[]): number[] {
  return rows.flatMap(row => [...row].map(c => (c === "S" ? 1 : c === "C" ? 0 : 0.4)));
}

sweepTest("sweep 140 Markus-Lyapunov sign mix", async ({ page }) => {
  test.setTimeout(3_600_000);
  const config = SWEEP_CONFIGS["sweep-140-markus-lyapunov"];
  const coarseOnly = MARKUS_REFINED_VIEWS.length === 0;
  const planned = expandSweep(config).map((params, i) => ({ id: `140-c${String(i + 1).padStart(2, "0")}`, params }));
  const { gridWidth, gridHeight } = config;
  const manifest = {
    slug: config.slug, methodVersion: config.signMix!.methodVersion,
    grid: { width: gridWidth, height: gridHeight }, warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
    command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 140 "',
    candidates: planned, references: config.references, fixedParams: config.baseParams,
    determinism: "Fresh deterministic Markus-Lyapunov kernel per measurement: no RNG or seed, no step calls (rotationSpeed pinned to 0). Both magnitude channels are read unclipped from the same init, at identical params.",
    candidateCounts: { coarse: MARKUS_SEQUENCES.length * MARKUS_COARSE_VIEWS.length, refined: MARKUS_REFINED_VIEWS.length },
    sequenceEnum: MARKUS_SEQUENCES,
    allocation: `${MARKUS_COARSE_VIEWS.length} views for each of the ${MARKUS_SEQUENCES.length} schema sequences (${MARKUS_SEQUENCES.length * MARKUS_COARSE_VIEWS.length} coarse), then ${MARKUS_REFINED_VIEWS.length} refined views around the leading coarse windows; IDs follow expansion order, sequence outer and view inner.`,
    coarseViews: MARKUS_COARSE_VIEWS,
    priorCoverage: [
      { source: "docs/sweeps/2026-10-30-interestingness-batch.md", description: "Planning audit: markus-lyapunov was one of five kernels with no historical sweep config, grid, appendix range or retained ranking. Old coverage ranges: none. No old grid is repeated." },
      { source: "src/app/presets.ts", description: "Shipped views: Zircon Zity (3,3, zoom 1, warmup 200, sample 500, AB) and Woven boundary (3.48,3.64, zoom 4.5, warmup 300, sample 700, AABAB). Both are references with rotationSpeed overridden to 0; the kernel default view equals Zircon Zity apart from rotation 6." },
      { source: "src/sims/markus-lyapunov/kernel.ts", description: "Schema: centre A/B [0,4], zoom [0.25,1e8], warmup [0,2048], sample [16,2048], sequence enum AB, AABB, AAB, ABB, AABAB, AAAABBBBBB, rotationSpeed [-30,30]. Channel 0 is -min(2,max(0,-exponent)) stability magnitude, channel 1 chaos magnitude, both in [0,2]; cells outside the [0,4] plane are empty." },
      { source: "src/sims/markus-lyapunov/model.ts", description: "Grid scale is 2/(min(width,height)*zoom) plane units per cell, centred on (centerX, centerY); sample iterations are raised with zoom by the shared automatic-detail rule in src/sims/fractal/detail.ts." },
    ],
    search: {
      coarse: "Every schema sequence on one shared 8-view set: Zircon Zity neighbourhood (3,3,z1), (3,3,z1.6), (3.3,3.3,z2.4), (2.7,3.3,z2.4); Woven boundary neighbourhood (3.48,3.64,z4.5), (3.48,3.64,z2.8), (3.36,3.52,z4.5), (3.6,3.76,z4.5). Warmup 300, sample 700, rotation 0 for all.",
      refined: MARKUS_REFINED_VIEWS.length ? "See the candidates list: views chosen from the coarse ranking, entries after the first coarse block." : "Not yet declared.",
      exclusion: "No global slider Cartesian product, no palette or rotation search, no iteration-count search beyond the doubling recheck, no custom sequences outside the schema enum.",
    },
    validationPlan: { sizes: [128, 256], iteration: "Finalists and references are re-measured with warmup and sample iterations doubled (capped 2048), at 128 and 256 grids; changed-sign fraction reported against the base reading.",
      app: "Real Renderer module (WebGL2) on the real kernel at app default Lyapunov palette (gamma 0.8, contrast 1.3), rotation 0; the app route is shelved so the full app page cannot be loaded.",
      replay: "Fresh kernel import, absolute metric tolerance 1e-9, identical full candidate ordering." },
    sourceHashes: Object.fromEntries(["src/app/presets.ts", "src/sims/markus-lyapunov/kernel.ts", "src/sims/markus-lyapunov/model.ts", "src/sims/fractal/detail.ts", "e2e/harness/metrics.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
  };
  expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(planned.length + config.references.length);
  writeText(`${MARKUS_ROOT}/manifest-${coarseOnly ? "coarse" : "refined"}.json`, JSON.stringify(manifest, null, 2));

  const candidates: ScoredCandidate[] = [];
  const sheet = new Float32Array(8 * gridWidth * Math.ceil(planned.length / 8) * gridHeight);
  const drive = (params: Params, size: number, channel: number) => page.evaluate(driveKernel, {
    registryUrl: REGISTRY_URL, slug: config.slug, params, gridWidth: size, gridHeight: size,
    warmupSteps: 0, fluxGap: 0, dt: 1, primaryChannel: channel, preserveRange: true });
  const signAt = async (params: Params, size: number) => {
    const stable = await drive(params, size, 0), chaotic = await drive(params, size, 1);
    return { stable: stable.frameA, chaotic: chaotic.frameA, rows: signRows(stable.frameA, chaotic.frameA, size, size),
      metrics: lyapunovSignMetrics(stable.frameA, chaotic.frameA, size, size) };
  };
  for (const c of planned) {
    const scored = await scoreOne(page, config, c.id, c.id, c.params);
    expect(Object.values(scored.metrics).every(Number.isFinite), c.id).toBe(true);
    const raw = await signAt(c.params, gridWidth);
    const i = candidates.length, image = signImage(raw.rows);
    for (let y = 0; y < gridHeight; y += 1) for (let x = 0; x < gridWidth; x += 1) {
      sheet[(Math.floor(i / 8) * gridHeight + y) * 8 * gridWidth + (i % 8) * gridWidth + x] = image[y * gridWidth + x];
    }
    candidates.push(scored);
    if (candidates.length % 12 === 0) console.log(`Markus measured ${candidates.length}/${planned.length}`);
  }
  writePng(`${ARTIFACT_ROOT}/sweep-140-markus-lyapunov/all-sign.png`, sheet, 8 * gridWidth, Math.ceil(planned.length / 8) * gridHeight, 1);
  const ranked = [...candidates].sort((a, b) => b.metrics.score - a.metrics.score);
  writeText(`${ARTIFACT_ROOT}/sweep-140-markus-lyapunov/report.md`, metricsTable(ranked, ["sequence", "centerX", "centerY", "zoom"]));
  if (coarseOnly) {
    writeText(`${MARKUS_ROOT}/coarse-results.json`, JSON.stringify({ manifest, ranked }, null, 2));
    console.log(JSON.stringify(ranked.slice(0, 12).map(c => ({ id: c.id, ...c.params, ...c.metrics })), null, 1));
    return;
  }

  const references: ScoredCandidate[] = [];
  for (const c of config.references) references.push(await scoreOne(page, config, c.id, c.label, c.params));
  const finalistIds = MARKUS_FINALISTS.length ? MARKUS_FINALISTS : [ranked[0].id];
  const finalists = finalistIds.map(id => ranked.find(c => c.id === id)!);
  expect(finalists.every(Boolean)).toBe(true);
  const replay: object[] = [], validation: any[] = [], images = new Map<string, string[]>();
  const doubled = (p: Params): Params => ({ ...p, warmupIterations: Math.min(2048, Number(p.warmupIterations) * 2), sampleIterations: Math.min(2048, Number(p.sampleIterations) * 2) });
  await page.setViewportSize({ width: 1200, height: 900 });
  for (const c of [...finalists, ...references]) {
    const base = await signAt(c.params, gridWidth);
    const maxDelta = Math.max(...Object.entries(base.metrics).map(([k, v]) => Math.abs(v - (c.metrics as any)[k])));
    expect(maxDelta, c.id).toBeLessThanOrEqual(1e-9);
    replay.push({ id: c.id, metrics: base.metrics, maxAbsoluteDelta: maxDelta });
    writeText(`${MARKUS_ROOT}/${c.id}.sign-${gridWidth}.json`, JSON.stringify({ id: c.id, params: c.params, width: gridWidth, height: gridHeight, legend: "S stable, C chaotic, 0 neither sign", rows: base.rows }));
    const convergence: any[] = [];
    let high256: string[] = [];
    for (const size of [gridWidth, 256]) {
      const here = size === gridWidth ? base : await signAt(c.params, size);
      const more = await signAt(doubled(c.params), size);
      if (size === 256) high256 = more.rows;
      const changed = here.rows.reduce((n, row, y) => n + [...row].filter((ch, x) => ch !== more.rows[y][x]).length, 0) / (size * size);
      convergence.push({ grid: size, metrics: here.metrics, doubledParams: doubled(c.params), doubledMetrics: more.metrics, changedSignFraction: changed,
        diagnostics: { nonFinite: [...here.stable, ...here.chaotic].filter(v => !Number.isFinite(v)).length, ceilingCells: [...here.stable, ...here.chaotic].filter(v => v >= 1).length, offPlaneFraction: offPlaneFraction(c.params, size, size) } });
    }
    const base256 = await signAt(c.params, 256);
    const signPath = `${MARKUS_IMAGES}/140-${c.id}-sign-256.png`;
    const doubledPath = `${MARKUS_IMAGES}/140-${c.id}-sign-256-doubled.png`;
    const magnitudePath = `${MARKUS_IMAGES}/140-${c.id}-stability-field-256.png`;
    writePng(signPath, signImage(base256.rows), 256, 256, 1);
    writePng(doubledPath, signImage(high256), 256, 256, 1);
    writePng(magnitudePath, base256.stable, 256, 256, 1);

    // The app route is shelved, so drive the app's own Renderer on the real kernel.
    const appPath = `${MARKUS_IMAGES}/140-${c.id}-app.png`;
    const rendered = await page.evaluate(async (params) => {
      const load = (url: string) => import(/* @vite-ignore */ url);
      const [{ Renderer }, { MarkusLyapunovKernel }, { defaultColourOptionsFor }, { qualityProfileFor }, { getRenderMode }] = await Promise.all([
        load("/src/app/renderer.ts"), load("/src/sims/markus-lyapunov/kernel.ts"), load("/src/app/colormap.ts"),
        load("/src/app/qualityProfiles.ts"), load("/src/app/renderModes.ts"),
      ]);
      document.body.innerHTML = "";
      const canvas = document.createElement("canvas");
      canvas.id = "markus-evidence";
      canvas.style.cssText = "position:fixed;left:0;top:0;width:1200px;height:900px;background:#000";
      document.body.appendChild(canvas);
      const kernel = new MarkusLyapunovKernel();
      const mode = getRenderMode("markus-lyapunov");
      const profile = qualityProfileFor("markus-lyapunov", mode, "desktop");
      const colourOptions = defaultColourOptionsFor("markus-lyapunov", kernel.channelCount);
      const renderer = new Renderer({ canvas, kernel, params, stepsPerFrame: 1, colourOptions,
        displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 }, renderMode: mode, resolution: profile.defaultPreset, qualityProfile: profile });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const info = { renderer: canvas.dataset.renderer, renderSize: canvas.dataset.renderSize, canvas: [canvas.width, canvas.height], colourOptions, resolution: profile.defaultPreset, running: renderer.isRunning() };
      (window as any).__markusRenderer = renderer;
      return info;
    }, c.params);
    expect(rendered.running).toBe(false);
    await page.waitForTimeout(500);
    await page.locator("#markus-evidence").screenshot({ path: appPath, timeout: 20_000 });
    await page.evaluate(() => (window as any).__markusRenderer?.destroy());
    validation.push({ id: c.id, params: c.params, convergence, app: { viewport: { width: 1200, height: 900 }, ...rendered,
      note: "Real Renderer on the real kernel; app route is shelved. Landscape aspect shows more plane than the square CPU field along the long axis." } });
    images.set(c.id, [appPath, signPath, doubledPath, magnitudePath]);
    console.log(`Markus validated ${c.id}; replay delta ${maxDelta}`);
  }
  const referenceApps = config.references.flatMap(r => images.get(r.id)!.slice(0, 1));
  const result = { manifest, ranked, references,
    finalists: finalists.map(c => ({ id: c.id, referenceIds: config.references.map(r => r.id), images: [...images.get(c.id)!, ...referenceApps] })),
    replay, validation, referenceImages: Object.fromEntries(images), replayTolerance: 1e-9,
    runtime: { browser: page.context().browser()?.version(), node: process.version, platform: process.platform } };
  writeText(`${MARKUS_ROOT}/markus-lyapunov.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ counts: { candidates: ranked.length, references: references.length }, top: ranked.slice(0, 8), finalists: finalists.map(c => c.id) }, null, 2));
});

const markusReplayTest = process.env.SWEEP_REPLAY === "140" ? test : test.skip;
markusReplayTest("140 independently replay retained sign geometry through direct browser imports", async ({ page }) => {
  test.setTimeout(600_000);
  const data = JSON.parse(readFileSync(`${MARKUS_ROOT}/markus-lyapunov.json`, "utf8"));
  const actual: { id: string; score: number; maxAbsoluteDelta: number; metrics: object }[] = [];
  const { gridWidth: width, gridHeight: height } = SWEEP_CONFIGS["sweep-140-markus-lyapunov"];
  for (const row of [...data.manifest.candidates, ...data.references]) {
    const measured = await page.evaluate(async ({ params, width, height }) => {
      const load = (url: string) => import(/* @vite-ignore */ url);
      const [{ MarkusLyapunovKernel }, { lyapunovSignMetrics }] = await Promise.all([load("/src/sims/markus-lyapunov/kernel.ts"), load("/e2e/harness/metrics.ts")]);
      const kernel = new MarkusLyapunovKernel();
      kernel.init(width, height, params);
      const state = kernel.readState();
      const stable = new Float32Array(width * height), chaotic = new Float32Array(width * height);
      for (let i = 0; i < width * height; i += 1) { stable[i] = state[i * 2]; chaotic[i] = state[i * 2 + 1]; }
      kernel.destroy();
      return lyapunovSignMetrics(stable, chaotic, width, height);
    }, { params: row.params, width, height });
    const expected = [...data.ranked, ...data.references].find((c: any) => c.id === row.id);
    let maxAbsoluteDelta = 0;
    for (const [key, value] of Object.entries(measured)) maxAbsoluteDelta = Math.max(maxAbsoluteDelta, Math.abs(Number(value) - expected.metrics[key]));
    expect(maxAbsoluteDelta, row.id).toBeLessThanOrEqual(1e-9);
    actual.push({ id: row.id, score: measured.score, maxAbsoluteDelta, metrics: measured });
  }
  const candidateIds = new Set(data.manifest.candidates.map((c: any) => c.id));
  expect(actual.filter(c => candidateIds.has(c.id)).sort((a, b) => b.score - a.score).map(c => c.id)).toEqual(data.ranked.map((c: any) => c.id));
  const shipped = await page.evaluate(async () => (await import(/* @vite-ignore */ "/src/app/presets.ts")).presetsFor("markus-lyapunov"));
  expect(data.references).toHaveLength(shipped.length);
  for (const preset of shipped) {
    const row = data.references.find((r: any) => r.id === `140-current-${preset.id === "zircon-zity" ? "zircon-zity" : "woven-boundary"}`);
    expect(row.params).toEqual({ ...preset.params, rotationSpeed: 0 });
  }
  writeText(`${MARKUS_ROOT}/direct-replay.json`, JSON.stringify({ tolerance: 1e-9, actual }, null, 2));
  console.log(`Replayed ${actual.length} fields; identical ordering; maximum metric deviation ${Math.max(...actual.map(c => c.maxAbsoluteDelta))}`);
});
