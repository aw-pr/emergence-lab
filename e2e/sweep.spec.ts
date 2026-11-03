import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { effectiveIterationLimit } from "../src/sims/fractal/detail.ts";
import { presetsFor } from "../src/app/presets.ts";
import { SPECS as LORENZ_SPECS } from "../src/sims/lorenz-attractor/kernel.ts";
import { MAP_SPECS } from "../src/sims/clifford-dejong/kernel.ts";
import { clumpScore, type ClumpReading } from "./harness/clumps.ts";
import { driveKernel, driveKernelDiagnostic, type DiagnosticSnapshot, type SweepDriverConfig } from "./harness/driver.ts";
import {
  channelMixing,
  ecaClassSignals,
  circularSpatialAutocorrelation,
  gaussianBlur,
  lyapunovSignMetrics,
  meanResultantLength,
  multiLagSpatialAutocorrelation,
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
  ATTRACTOR_148_METHOD,
  CLIFFORD_RENDER_148,
  BURNING_SHIP_REFINEMENT_CENTRES,
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
    preserveRange: Boolean(config.staticBoundary || config.eca),
  };
  const scoreAtWarmup = async (warmupSteps: number): Promise<InterestingnessMetrics> => {
    const snapshotConfig = { ...driverConfig, warmupSteps,
      ...(config.eca ? { generatedRows: warmupSteps + 1 } : {}) };
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
    if (config.eca) return { ...metrics, ...ecaClassSignals(frameA, result.width, result.height) };
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
      ...(config.signMix ? { methodVersion: config.signMix.methodVersion } : {}),
      ...(config.eca ? { methodVersion: config.eca.methodVersion } : {}) };
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

interface StaticStage {
  stage: string;
  dataFile: string;
  route: string;
  settleMs: number;
  sources: string[];
  shortlist: string;
  priorCoverage: { source: string; description: string }[];
  search: Record<string, unknown>;
  region: (c: ScoredCandidate) => string;
  referenceId: (region: string) => string;
}

const STATIC_STAGES: Record<string, StaticStage> = {
  "sweep-137-mandelbrot": {
    stage: "137", dataFile: "mandelbrot.json", route: "mandelbrot", settleMs: 150,
    sources: ["src/app/presets.ts", "src/sims/mandelbrot/kernel.ts", "src/sims/fractal/detail.ts", "e2e/harness/metrics.ts"],
    shortlist: "Best scored view in each of the three anchor-scale regions; one representative per region, even if rejected. No numerical morphology labels.",
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
    region: c => Number(c.params.zoom) >= 100 ? "spiral" : Number(c.params.zoom) >= 10 ? "seahorse" : "whole",
    referenceId: r => r === "whole" ? "137-current-whole-set" : r === "seahorse" ? "137-current-seahorse-valley" : "137-current-spiral-hub",
  },
  "sweep-138-burning-ship": {
    stage: "138", dataFile: "burning-ship.json", route: "burning-ship", settleMs: 3000,
    sources: ["src/app/presets.ts", "src/sims/burning-ship/kernel.ts", "src/sims/fractal/detail.ts", "e2e/harness/metrics.ts"],
    shortlist: "Best scored view in each of the three shipped-anchor scale regions (harbour hull, mast, ridge-deep filaments); one representative per region, even if rejected. Hull/filament character is a manual visual finding, not a numerical label.",
    priorCoverage: [
      { source: "docs/sweeps/2026-10-30-interestingness-batch.md#live-audit", description: "Planning audit: Burning Ship has no historical harness config, grid, appendix or retained rankings. Old coverage ranges: none. No old Burning Ship candidate grid is repeated." },
      { source: "src/app/presets.ts", description: "Shipped anchors: harbour (-0.5,-0.5,1;128), mast (-1.755,-0.03,14;260), ridge-deep (-1.744,-0.017,72;384). These are references, not novel candidates; palettePhase/cycleSpeed are overridden to 0 and autoIterations is the kernel default true." },
      { source: "src/sims/burning-ship/kernel.ts", description: "Kernel default equals the mast preset geometry (-1.755,-0.03,14;260), automatic detail true, base view width 3.4. Schema ranges centerX [-2.2,1.2], centerY [-2,1], zoom [0.25,100000000], base iterations [16,2048]. Candidate base512 is a fixed measurement setting, not a parameter search." },
      { source: "src/sims/fractal/detail.ts", description: "Effective = min(4096, bounded base + floor(48*log2(max(1,zoom)))) with automatic detail. All convergence rows record actual limits; impossible doubling uses lower reference and cap-limited uncertainty." },
    ],
    search: {
      coarse: "3 shipped anchors × zoom factors [1.2,1.6,2.2,3] × x/y offsets [-0.2,+0.2] times anchor span 3.4/zoom = 48 views; centre rounded to 12 decimals, zoom to 6.",
      inclusion: "Nearby nonidentical windows around all shipped anchor scales; all 48 retained, including empty/solid negatives.",
      exclusion: "No global slider Cartesian product, far/deep zoom, palette search, motion or logistic-mandelbrot; refinement only around the leading coarse view in each anchor-scale region, at most 32 views.",
      refined: "Best coarse window in each anchor-scale region. 3 centres × factors [1.15,1.45] × x/y offsets [-0.1,+0.1] times centre span 3.4/zoom = 24 views. First 48 entries are coarse; last 24 are refined.",
      refinementCentres: BURNING_SHIP_REFINEMENT_CENTRES,
    },
    region: c => Number(c.params.zoom) >= 50 ? "ridge" : Number(c.params.zoom) >= 6 ? "mast" : "harbour",
    referenceId: r => r === "harbour" ? "138-current-harbour" : r === "mast" ? "138-current-mast" : "138-current-ridge-deep",
  },
};

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
  const staged = config.staticBoundary ? STATIC_STAGES[artifactId] : undefined;
  const manifest = staged ? {
    slug, methodVersion: config.staticBoundary.methodVersion,
    grid: { width: config.gridWidth, height: config.gridHeight },
    warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
    command: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep ${staged.stage} "`,
    determinism: "Fixed deterministic geometry; no RNG or seed; fresh kernel per measurement.",
    fixedParams: config.baseParams,
    sourceHashes: Object.fromEntries(staged.sources.map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
    validationPlan: {
      shortlist: staged.shortlist,
      resolutions: [128, 256], viewport: { width: 1200, height: 900 },
      presentation: { palette: "inferno", gamma: 0.7, contrast: 1.5, paletteSteps: 0, pointSize: 1, bloom: 0.3, invert: false, paused: true, palettePhase: 0, cycleSpeed: 0 },
      iterationMethod: "Compute actual zoom boost; request base=2*effective-boost only if base<=2048 and effective<=4096. Otherwise measure actual effective limit against a lower reference and mark cap-limited. Additional top-view base2048 cap probe is validation, not a searched view.",
      replay: "Same Chromium/runtime, fresh direct kernel import; absolute metric tolerance1e-9 and identical full candidate ordering. Different resolutions are separate checks.",
    },
    candidateCounts: { coarse: 48, refined: sweepParams.length - 48 },
    candidates: planned,
    effectiveLimits: planned.map(c => ({ id: c.id, effective: effectiveIterationLimit(Number(c.params.maxIterations), Number(c.params.zoom), Boolean(c.params.autoIterations)) })),
    priorCoverage: staged.priorCoverage,
    search: staged.search,
    references: config.references,
  } : undefined;
  if (manifest) {
    expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(planned.length + config.references.length);
    // Persist the declaration before the first kernel measurement.
    writeText(`docs/sweeps/data/2026-10-30/${staged!.stage}/manifest-${sweepParams.length === 48 ? "coarse" : "refined"}.json`, JSON.stringify(manifest, null, 2));
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

  if (manifest) await retainStaticEvidence(page, config, staged!, ranked, references, manifest);

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

async function retainStaticEvidence(page: Page, config: SimSweepConfig, staged: StaticStage, ranked: ScoredCandidate[], references: ScoredCandidate[], manifest: object): Promise<void> {
  const root = `docs/sweeps/data/2026-10-30/${staged.stage}`;
  const imageRoot = "docs/images/sweeps-2026-10-30";
  const limit = (p: Params) => effectiveIterationLimit(Number(p.maxIterations), Number(p.zoom), Boolean(p.autoIterations));
  const drive = (p: Params, size: number) => page.evaluate(driveKernel, {
    registryUrl: REGISTRY_URL, slug: config.slug, params: p,
    gridWidth: size, gridHeight: size, warmupSteps: 0, fluxGap: 0, dt: 1, primaryChannel: 0, preserveRange: true,
  });
  // Keep spatially distinct evidence rather than three adjacent scalar winners.
  const finalists: ScoredCandidate[] = [];
  const region = staged.region;
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
    const fieldPath = `${imageRoot}/${staged.stage}-${c.id}-field-256.png`;
    writePng(fieldPath, high.frameA, 256, 256, 1);
    const maskPath = `${imageRoot}/${staged.stage}-${c.id}-membership-256.png`;
    writePng(maskPath, high.frameA.map(v => v === 0 ? 0 : 1), 256, 256, 1);
    const comparisonMaskPath = `${imageRoot}/${staged.stage}-${c.id}-comparison-membership-256.png`;
    writePng(comparisonMaskPath, comparison.frameA.map(v => v === 0 ? 0 : 1), 256, 256, 1);
    // Exercise the actual application and its GPU renderer through its controls.
    await page.goto(`/#/${staged.route}`);
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
    await page.waitForTimeout(staged.settleMs);
    const appPath = `${imageRoot}/${staged.stage}-${c.id}-app.png`;
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
      const referenceId = staged.referenceId(region(c));
      return { id: c.id, referenceId, images: [...images.get(c.id)!, ...images.get(referenceId)!] };
    }),
    calibration, replay, validation, iterationCapProbe, referenceImages: Object.fromEntries(images),
    replayTolerance: 1e-9, runtime: { browser: page.context().browser()?.version(), platform: process.platform, node: process.version } };
  writeText(`${root}/${staged.dataFile}`, JSON.stringify(result, null, 2));
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
    stencil: "five-point",
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

test("non-phase Gray-Scott nine-point comparison matches the current default", async ({ page }) => {
  const config = SWEEP_CONFIGS["gray-scott"];
  const params = { ...config.baseParams, F: 0.0545, k: 0.062 };
  const explicit = await scoreOne(page, config, "nine", "Nine-point Coral", { ...params, stencil: "nine-point" });
  const implicit = await scoreOne(page, config, "default", "Default Coral", params);
  expect(explicit.metrics).toEqual(implicit.metrics);
  expect(explicit.metrics).toEqual({
    entropy: 0.6988568702841468, variance: 0.015872195007509353,
    spatialAutocorrelation: 0.9341877961656685, coverage: 0.692138671875,
    temporalFlux: 0.0004988930676859127, score: 0.7065245840037978,
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

const REPLAY_KERNELS: Record<string, { dataFile: string; kernelUrl: string; kernelClass: string; slug: string }> = {
  "137": { dataFile: "mandelbrot.json", kernelUrl: "/src/sims/mandelbrot/kernel.ts", kernelClass: "MandelbrotKernel", slug: "mandelbrot" },
  "138": { dataFile: "burning-ship.json", kernelUrl: "/src/sims/burning-ship/kernel.ts", kernelClass: "BurningShipKernel", slug: "burning-ship" },
};

for (const [stage, replay] of Object.entries(REPLAY_KERNELS)) {
  const staticReplayTest = process.env.SWEEP_REPLAY === stage ? test : test.skip;
  staticReplayTest(`${stage} independently replay retained geometry through direct browser imports`, async ({ page }) => {
    test.setTimeout(180_000);
    const data = JSON.parse(readFileSync(`docs/sweeps/data/2026-10-30/${stage}/${replay.dataFile}`, "utf8"));
    const actual: { id: string; score: number; maxAbsoluteDelta: number }[] = [];
    for (const row of [...data.manifest.candidates, ...data.references]) {
      const measured = await page.evaluate(async ({ params, kernelUrl, kernelClass }) => {
        const metricsUrl = "/e2e/harness/metrics.ts";
        const kernelModule = await import(/* @vite-ignore */ kernelUrl);
        const { staticBoundaryMetrics } = await import(/* @vite-ignore */ metricsUrl);
        const kernel = new kernelModule[kernelClass]();
        kernel.init(128, 128, params);
        const result = staticBoundaryMetrics(kernel.readState(), 128, 128);
        kernel.destroy();
        return result;
      }, { params: row.params, kernelUrl: replay.kernelUrl, kernelClass: replay.kernelClass });
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
    const shipped = await page.evaluate(async slug => {
      const url = "/src/app/presets.ts";
      return (await import(/* @vite-ignore */ url)).presetsFor(slug);
    }, replay.slug);
    expect(data.references).toHaveLength(shipped.length + 1);
    for (const preset of shipped) {
      const row = data.references.find(r => r.id === `${stage}-current-${preset.id}`);
      expect(row.params).toEqual({ ...preset.params, autoIterations: true, palettePhase: 0, cycleSpeed: 0 });
    }
    const artifactId = `sweep-${stage}-${replay.slug}`;
    writeText(`e2e/artifacts/${artifactId}/independent-replay.json`, JSON.stringify({ tolerance: 1e-9, actual }, null, 2));
    console.log(`Replayed ${actual.length} fields; identical ordering; maximum metric deviation ${Math.max(...actual.map(c => c.maxAbsoluteDelta))}`);
  });
}

// Full sweeps are opt-in (SWEEP=1) — they step many kernels and take minutes.
const sweepTest = process.env.SWEEP ? test : test.skip;
const lorenzSnapshotsTest = process.env.LORENZ_SNAPSHOTS ? test : test.skip;
const mixingTest = process.env.PARTICLE_LIFE_MIXING ? test : test.skip;

sweepTest("sweep 137 Mandelbrot static boundaries", async ({ page }) => {
  test.setTimeout(900_000);
  await runSweep(page, SWEEP_CONFIGS["sweep-137-mandelbrot"]);
});

sweepTest("sweep 138 Burning Ship static boundaries", async ({ page }) => {
  test.setTimeout(1_800_000);
  await runSweep(page, SWEEP_CONFIGS["sweep-138-burning-ship"]);
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

const ECA_ROOT = "docs/sweeps/data/2026-10-30/141";
const ECA_IMAGES = "docs/images/sweeps-2026-10-30";
// Evidence selections are fixed after inspecting the complete census montage.
const ECA_FINALISTS = ["141-r054-s1", "141-r106-s1", "141-r057-s0"];

function ecaId(params: Params): string {
  return `141-r${String(params.rule).padStart(3, "0")}-s${params.seedMode}`;
}

function ecaEquivalents(rule: number): { mirror: number; complement: number; mirrorComplement: number; representative: number } {
  let mirror = 0, complement = 0;
  for (let n = 0; n < 8; n += 1) {
    const reversed = ((n & 1) << 2) | (n & 2) | ((n & 4) >> 2);
    mirror |= ((rule >> reversed) & 1) << n;
    complement |= (1 - ((rule >> (7 - n)) & 1)) << n;
  }
  let mirrorComplement = 0;
  for (let n = 0; n < 8; n += 1) {
    const reversed = ((n & 1) << 2) | (n & 2) | ((n & 4) >> 2);
    mirrorComplement |= ((complement >> reversed) & 1) << n;
  }
  return { mirror, complement, mirrorComplement, representative: Math.min(rule, mirror, complement, mirrorComplement) };
}

function ecaReadings(frameA: number[], frameB: number[], width: number, height: number): InterestingnessMetrics {
  return { ...scoreFrames(frameA, frameB, width, height, 0.5), ...ecaClassSignals(frameA, width, height) };
}

function ecaDiagnostics(field: number[]) {
  return { nonFiniteFraction: field.filter(v => !Number.isFinite(v)).length / field.length,
    lowerEndpointFraction: field.filter(v => v === 0).length / field.length,
    upperEndpointFraction: field.filter(v => v === 1).length / field.length,
    outOfRangeFraction: field.filter(v => v < 0 || v > 1).length / field.length,
    offFrameClippingFraction: 0 };
}

const encodeEcaField = (field: number[]) => deflateSync(Uint8Array.from(field)).toString("base64");
const decodeEcaField = (field: string) => Array.from(inflateSync(Buffer.from(field, "base64")));

async function ecaDrive(page: Page, params: Params, size: number, generatedRows: number) {
  return page.evaluate(driveKernel, { registryUrl: REGISTRY_URL, slug: "elementary-cellular-automata", params,
    gridWidth: size, gridHeight: size, warmupSteps: generatedRows - 1, generatedRows,
    fluxGap: 1, dt: 1, primaryChannel: 0, preserveRange: true });
}

sweepTest("sweep 141 ECA labelled rule and seed census", async ({ page }) => {
  test.setTimeout(1_800_000);
  const config = SWEEP_CONFIGS["sweep-141-elementary-cellular-automata"];
  const planned = expandSweep(config).map(params => ({ id: ecaId(params), params }));
  const manifest = {
    slug: config.slug, methodVersion: config.eca!.methodVersion,
    grid: { width: 128, height: 128 }, warmupSteps: 127, fluxGap: 1, dt: 1,
    command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 141 "',
    candidates: planned, references: config.references, fixedParams: config.baseParams,
    axes: { rule: Array.from({ length: 256 }, (_, i) => i), seedMode: [0, 1, 2] },
    generatedRows: 128, initialRowOffset: 1, historyOrder: "newest first",
    determinism: "No RNG seed parameter. seedMode0: single centre cell; seedMode1: coordinateHash(x)<0.22; seedMode2: repeating 011010. Fresh kernel per reading; coordinate hash is deterministic but width changes the input row.",
    clock: "Init writes generation0. Census:127 step calls at stepsPerFrame1. Exact target history is generations0..127; flux partner1..128. Shipped traffic uses stepsPerFrame2:64 calls generate through128; retain an extra row and crop the overshoot to recover0..127, then shift the crop for1..128 without a further call. No padding is scored.",
    priorCoverage: [
      { source: "docs/sweeps/2026-10-30-interestingness-batch.md", description: "Live audit lists ECA among five kernels lacking a historical config. Prior grid/appendix ranges: none; no historical ECA candidate sweep is repeated." },
      { source: "src/app/presets.ts", description: "All four current presets: (rule,seedMode,stepsPerFrame)=(30,0,1),(90,0,1),(110,0,1),(184,1,2). These are references, not claimed discoveries. Kernel default equals Rule30." },
      { source: "src/sims/elementary-cellular-automata/kernel.ts", description: "Schema spans every integer rule0..255, seedMode0..2, stepsPerFrame1..32. Periodic spatial boundary, one generated row at init. Full labelled-rule census, no equivalence deduplication. Mirror/complement transforms annotate rule tables only; seed-specific outputs need not be equivalent." },
    ],
    inclusion: "Every labelled rule at all three built-in seed modes, including blank/solid/periodic negatives and shipped rules. Rule0,204,30,90,110 are calibrations, not automatic class proofs.",
    exclusion: "No speed search, arbitrary seed values, seed replication, custom initial rows, automatic Wolfram classes, palette search or production changes.",
    validationPlan: { shortlist: "At most3 diverse evidence selections after census inspection; no promotion quota.",
      sizes: [128, 256], generatedRows: [256, 384, 512, 1024],
      longerHistoryAllowance: 24, plannedFinalistLongerChecks: 12, plannedNegativeLongerChecks: 1,
      note: "Three256-square frames after256,384,512 generated rows plus a1024-row horizon. References/calibrations/replays are additional. All current references get the same settings.",
      app: "Real app route screenshot plus deterministic real WebGL Renderer snapshots on the real kernel. Grayscale fields labelled separately.",
      replay: "All768 candidates and4 references; exact ordering, absolute metric tolerance1e-9." },
    rawEncoding: "zlib-deflate of width*height uint8 cells in row-major newest-first order, base64; frameA and frameB per id in raw-fields.json. Values are actual binary kernel outputs, no quantization loss.",
    sourceHashes: Object.fromEntries(["src/app/presets.ts", "src/sims/elementary-cellular-automata/kernel.ts", "e2e/harness/driver.ts", "e2e/harness/metrics.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
  };
  expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(772);
  writeText(`${ECA_ROOT}/manifest.json`, JSON.stringify(manifest, null, 2));
  const candidates: ScoredCandidate[] = [], references: ScoredCandidate[] = [];
  const raw: Record<string, object> = {};
  const sheetWidth = 16 * 128, sheetHeight = 48 * 128;
  const sheet = new Uint8Array(sheetWidth * sheetHeight);
  for (const c of [...planned, ...config.references]) {
    const fields = await ecaDrive(page, c.params, 128, 128);
    const scored = await scoreOne(page, config, c.id, "label" in c ? c.label as string : c.id, c.params);
    expect(scored.metrics).toEqual(ecaReadings(fields.frameA, fields.frameB, 128, 128));
    expect(Object.values(scored.metrics).every(Number.isFinite), c.id).toBe(true);
    const diagnostics = ecaDiagnostics(fields.frameA);
    expect(diagnostics.nonFiniteFraction + diagnostics.outOfRangeFraction).toBe(0);
    raw[c.id] = { frameA: encodeEcaField(fields.frameA), frameB: encodeEcaField(fields.frameB), diagnostics,
      equivalents: ecaEquivalents(Number(c.params.rule)) };
    if (candidates.length < planned.length) {
      const i = candidates.length;
      for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
        sheet[(Math.floor(i / 16) * 128 + y) * sheetWidth + (i % 16) * 128 + x] = fields.frameA[y * 128 + x];
      }
      candidates.push(scored);
    } else references.push(scored);
    if (candidates.length % 96 === 0 && references.length === 0) console.log(`ECA measured ${candidates.length}/768`);
  }
  const ranked = [...candidates].sort((a, b) => b.metrics.score - a.metrics.score);
  writePng(`${ARTIFACT_ROOT}/sweep-141-elementary-cellular-automata/census.png`, sheet, sheetWidth, sheetHeight, 1);
  writeText(`${ECA_ROOT}/raw-fields.json`, JSON.stringify({ encoding: manifest.rawEncoding, width: 128, height: 128, readings: raw }));
  writeText(`${ARTIFACT_ROOT}/sweep-141-elementary-cellular-automata/report.md`, metricsTable(ranked, ["rule", "seedMode"]));
  writeText(`${ARTIFACT_ROOT}/sweep-141-elementary-cellular-automata/census.json`, JSON.stringify({ manifest, ranked, references }));
  if (process.env.SWEEP_141_CENSUS_ONLY) return;

  const negative = ranked[0];
  const negativeBase = await ecaDrive(page, negative.params, 128, 128);
  const negativeLong = await ecaDrive(page, negative.params, 256, 1024);
  const negativeImages = [`${ECA_IMAGES}/${negative.id}-rejected-field-128.png`, `${ECA_IMAGES}/${negative.id}-rejected-field-256-rows1024.png`];
  writePng(negativeImages[0], negativeBase.frameA, 128, 128, 2);
  writePng(negativeImages[1], negativeLong.frameA, 256, 256, 1);
  const negativeControl = { id: negative.id, params: negative.params, images: negativeImages,
    generatedRows: 1024, width: 256, height: 256,
    metrics: ecaReadings(negativeLong.frameA, negativeLong.frameB, 256, 256),
    diagnostics: ecaDiagnostics(negativeLong.frameA), frameA: encodeEcaField(negativeLong.frameA), frameB: encodeEcaField(negativeLong.frameB) };
  const finalists = ECA_FINALISTS.map(id => ranked.find(c => c.id === id)!);
  expect(finalists).toHaveLength(3);
  expect(finalists.every(Boolean)).toBe(true);
  const validation: object[] = [], images = new Map<string, string[]>(), replay: object[] = [];
  for (const c of [...finalists, ...references]) {
    const base = await ecaDrive(page, c.params, 128, 128);
    const measured = ecaReadings(base.frameA, base.frameB, 128, 128);
    const maxAbsoluteDelta = Math.max(...Object.entries(measured).map(([k, v]) => Math.abs(v! - (c.metrics as any)[k])));
    expect(maxAbsoluteDelta).toBeLessThanOrEqual(1e-9);
    replay.push({ id: c.id, metrics: measured, maxAbsoluteDelta });
    const paths: string[] = [], histories: object[] = [];
    for (const generatedRows of [256, 384, 512, 1024]) {
      const fields = await ecaDrive(page, c.params, 256, generatedRows);
      const fieldPath = `${ECA_IMAGES}/${c.id}-field-256-rows${generatedRows}.png`;
      writePng(fieldPath, fields.frameA, 256, 256, 1);
      const appPath = `${ECA_IMAGES}/${c.id}-renderer-256-rows${generatedRows}.png`;
      await page.setViewportSize({ width: 256, height: 256 });
      const rendering = await page.evaluate(async ({ params, generatedRows }) => {
        const load = (u: string) => import(/* @vite-ignore */ u);
        const [{ Renderer }, { ElementaryCellularAutomataKernel }, { defaultColourOptionsFor }, { qualityProfileFor }, { getRenderMode }] = await Promise.all([
          load("/src/app/renderer.ts"), load("/src/sims/elementary-cellular-automata/kernel.ts"), load("/src/app/colormap.ts"), load("/src/app/qualityProfiles.ts"), load("/src/app/renderModes.ts")]);
        document.body.innerHTML = "";
        const canvas = document.createElement("canvas"); canvas.id = "eca-evidence";
        canvas.style.cssText = "position:fixed;left:0;top:0;width:256px;height:256px"; document.body.appendChild(canvas);
        let grid: number[] = [], state: Float32Array;
        class SnapshotKernel extends ElementaryCellularAutomataKernel {
          init(w: number, h: number, p: Params) {
            const rate = Number(p.stepsPerFrame), calls = Math.ceil((generatedRows - 1) / rate);
            super.init(w, h + rate - 1, p);
            for (let i = 0; i < calls; i += 1) super.step(1);
            const offset = (1 + calls * rate - generatedRows) * w;
            state = super.readState().slice(offset, offset + w * h); grid = [w, h];
          }
          readState() { return state; }
        }
        const kernel = new SnapshotKernel(), mode = getRenderMode("elementary-cellular-automata");
        const profile = qualityProfileFor("elementary-cellular-automata", mode, "desktop");
        const colourOptions = defaultColourOptionsFor("elementary-cellular-automata", 1);
        const renderer = new Renderer({ canvas, kernel, params, stepsPerFrame: 1, colourOptions,
          displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 }, renderMode: mode, resolution: profile.defaultPreset, qualityProfile: profile });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        (window as any).__ecaRenderer = renderer;
        return { grid, canvas: [canvas.width, canvas.height], renderer: canvas.dataset.renderer, running: renderer.isRunning(), colourOptions,
          field: Array.from(state!) };
      }, { params: c.params, generatedRows });
      expect(rendering.grid).toEqual([256, 256]);
      expect(rendering.field).toEqual(fields.frameA);
      expect(rendering.running).toBe(false);
      expect(rendering.renderer).toBe("webgl2");
      await page.locator("#eca-evidence").screenshot({ path: appPath });
      await page.evaluate(() => (window as any).__ecaRenderer.destroy());
      const { field: _, ...renderInfo } = rendering;
      histories.push({ generatedRows, width: 256, height: 256, params: c.params,
        stepCalls: Math.ceil((generatedRows - 1) / Number(c.params.stepsPerFrame)),
        metrics: ecaReadings(fields.frameA, fields.frameB, 256, 256), diagnostics: ecaDiagnostics(fields.frameA),
        frameA: encodeEcaField(fields.frameA), frameB: encodeEcaField(fields.frameB), fieldImage: fieldPath, appRendererImage: appPath, renderInfo });
      paths.push(appPath, fieldPath);
    }
    await page.setViewportSize({ width: 1200, height: 900 });
    // Force a document load after the isolated Renderer replaced the app DOM.
    await page.goto(`/?sweep141=${c.id}#/elementary-cellular-automata`);
    await page.locator("[data-param-key=rule]").waitFor({ timeout: 20_000 });
    const pause = page.getByRole("button", { name: "Pause", exact: true });
    if (await pause.count()) await pause.evaluate(el => (el as HTMLButtonElement).click());
    for (const [key, value] of Object.entries(c.params)) {
      await page.locator(`[data-param-key=${key}]`).evaluate((el, value) => {
        const input = el as HTMLInputElement; input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
    }
    await page.getByRole("button", { name: "Reset", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
    await page.getByRole("button", { name: "Play", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: "Pause", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
    const appPath = `${ECA_IMAGES}/${c.id}-app-live.png`;
    await page.screenshot({ path: appPath, animations: "disabled" });
    const canvas = await page.locator("canvas").evaluate(e => ({ width: e.width, height: e.height, data: { ...e.dataset } }));
    const inputs = await page.locator("[data-param-key]").evaluateAll(es => Object.fromEntries(es.map(e => [(e as HTMLElement).dataset.paramKey, Number((e as HTMLInputElement).value)])));
    for (const [key, value] of Object.entries(c.params)) expect(inputs[key]).toBe(value);
    paths.push(appPath);
    c.thumb = paths[0];
    validation.push({ id: c.id, histories, liveApp: { path: appPath, canvas, inputs, viewport: [1200, 900], timing: "3 seconds of live play, paused for capture; timing and generated-row count uncontrolled. Qualitative UI evidence only; numeric and equal-history comparisons use renderer-256 images." } });
    images.set(c.id, paths);
    console.log(`ECA validated ${c.id}; exact replay delta ${maxAbsoluteDelta}`);
  }
  const calibration = [0, 204, 30, 90, 110].flatMap(rule => [0, 1, 2].map(seedMode => candidates.find(c => c.id === ecaId({ rule, seedMode }))!));
  writeText(`${ECA_ROOT}/elementary-cellular-automata.json`, JSON.stringify({ manifest, ranked, references,
    finalists: finalists.map(c => ({ id: c.id, images: images.get(c.id), referenceIds: references.map(r => r.id) })),
    calibration, replay, validation, negativeControl, referenceImages: Object.fromEntries(references.map(r => [r.id, images.get(r.id)])),
    rawFields: `${ECA_ROOT}/raw-fields.json`, replayTolerance: 1e-9,
    runtime: { browser: page.context().browser()?.version(), node: process.version, platform: process.platform } }));
  console.log(JSON.stringify({ counts: { candidates: ranked.length, references: references.length, finalistLongerChecks: 12, negativeLongerChecks: 1 }, top: ranked.slice(0, 10), finalists: finalists.map(c => c.id) }, null, 2));
});

const ecaReplayTest = process.env.SWEEP_REPLAY === "141" ? test : test.skip;
ecaReplayTest("141 replay all retained ECA metrics and ordering", async ({ page }) => {
  test.setTimeout(600_000);
  const data = JSON.parse(readFileSync(`${ECA_ROOT}/elementary-cellular-automata.json`, "utf8"));
  const raw = JSON.parse(readFileSync(`${ECA_ROOT}/raw-fields.json`, "utf8"));
  const actual: { id: string; score: number; maxAbsoluteDelta: number }[] = [];
  for (const row of [...data.manifest.candidates, ...data.references]) {
    const fields = await ecaDrive(page, row.params, 128, 128);
    expect(fields.frameA).toEqual(decodeEcaField(raw.readings[row.id].frameA));
    expect(fields.frameB).toEqual(decodeEcaField(raw.readings[row.id].frameB));
    const measured = ecaReadings(fields.frameA, fields.frameB, 128, 128);
    const expected = [...data.ranked, ...data.references].find(c => c.id === row.id);
    const maxAbsoluteDelta = Math.max(...Object.entries(measured).map(([k, v]) => Math.abs(v! - expected.metrics[k])));
    expect(maxAbsoluteDelta, row.id).toBeLessThanOrEqual(1e-9);
    actual.push({ id: row.id, score: measured.score, maxAbsoluteDelta });
  }
  const ids = new Set(data.manifest.candidates.map(c => c.id));
  expect(actual.filter(c => ids.has(c.id)).sort((a, b) => b.score - a.score).map(c => c.id)).toEqual(data.ranked.map(c => c.id));
  const shipped = await page.evaluate(async () => (await import(/* @vite-ignore */ "/src/app/presets.ts")).presetsFor("elementary-cellular-automata"));
  expect(data.references.length).toBe(shipped.length);
  for (const preset of shipped) expect(data.references.find(r => r.id === `141-current-${preset.id}`).params).toEqual(preset.params);
  writeText(`${ECA_ROOT}/worker-replay.json`, JSON.stringify({ tolerance: 1e-9, actual,
    independentVerifierRequired: true, note: "Worker repeat, not independent acceptance." }));
  console.log(`ECA replayed ${actual.length}; identical ordering; max absolute delta ${Math.max(...actual.map(c => c.maxAbsoluteDelta))}`);
});

test("ECA generated-row clock matches batch speeds without padding", async ({ page }) => {
  const params = { rule: 184, seedMode: 1, stepsPerFrame: 1 };
  for (const generatedRows of [128, 129, 256, 1024]) {
    const single = await ecaDrive(page, params, 128, generatedRows);
    const batched = await ecaDrive(page, { ...params, stepsPerFrame: 2 }, 128, generatedRows);
    expect(batched).toEqual(single);
  }
  expect(ecaClassSignals([0, 1, 1, 0], 2, 2)).toEqual({ rowEntropy: 1, rowChange: 1, repeatedRowFraction: 0 });
  expect(() => ecaClassSignals([0], 2, 1)).toThrow();
  expect(ecaEquivalents(30)).toEqual({ mirror: 86, complement: 135, mirrorComplement: 149, representative: 30 });
});

const LORENZ_ROOT = "docs/sweeps/data/2026-10-30/142";
const LORENZ_IMAGES = "docs/images/sweeps-2026-10-30";
// Evidence selections are fixed after inspecting the census montage.
const LORENZ_FINALISTS: string[] = ["142-c53", "142-c12", "142-c61"];
const LORENZ_SNAPSHOTS = [280, 420, 560, 700, 840];
const LORENZ_LONG_SNAPSHOTS = LORENZ_SNAPSHOTS.map(n => n + 2000);
const LORENZ_FRAME_STEPS = [280, 560, 840];

function lorenzId(index: number): string {
  return `142-c${String(index + 1).padStart(2, "0")}`;
}

/** Node-side RK4 replica of the kernel's integrate/deposit geometry, used only
 * to report divergence and off-frame clipping, which the density field hides. */
function lorenzTrajectoryDiagnostics(params: Params, gridWidth: number, gridHeight: number, frames: number) {
  const spec = LORENZ_SPECS.lorenz;
  const sigma = Number(params.sigma), rho = Number(params.rho), beta = Number(params.beta);
  const spf = Number(params.stepsPerFrame);
  let x = spec.start[0], y = spec.start[1], z = spec.start[2];
  const dt = spec.dt, h = dt / 2;
  const d = (a: number, b: number, c: number) => spec.derivative(a, b, c, sigma, rho, beta);
  const advance = () => {
    const k1 = d(x, y, z), k2 = d(x + k1.dx * h, y + k1.dy * h, z + k1.dz * h);
    const k3 = d(x + k2.dx * h, y + k2.dy * h, z + k2.dz * h), k4 = d(x + k3.dx * dt, y + k3.dy * dt, z + k3.dz * dt);
    x += (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
    y += (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
    z += (dt / 6) * (k1.dz + 2 * k2.dz + 2 * k3.dz + k4.dz);
  };
  for (let i = 0; i < spec.warmup + spec.initialTrace; i += 1) advance();
  const total = frames * spf;
  let nonFinite = 0, offFrame = 0, leftLobe = 0, switches = 0, lastSign = 0, maxAbs = 0;
  const tail = { x0: x, y0: y, z0: z };
  for (let i = 0; i < total; i += 1) {
    advance();
    if (![x, y, z].every(Number.isFinite)) { nonFinite += 1; continue; }
    maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z));
    const gx = ((spec.projX(x, y, z) - spec.xRange[0]) / (spec.xRange[1] - spec.xRange[0])) * (gridWidth - 1);
    const gy = gridHeight - 1 - ((spec.projY(x, y, z) - spec.yRange[0]) / (spec.yRange[1] - spec.yRange[0])) * (gridHeight - 1);
    if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) offFrame += 1;
    if (x < 0) leftLobe += 1;
    const sign = x > 0.5 ? 1 : x < -0.5 ? -1 : 0;
    if (sign !== 0) { if (lastSign !== 0 && sign !== lastSign) switches += 1; lastSign = sign; }
  }
  const end = d(x, y, z);
  return { integrationSteps: total, nonFiniteFraction: nonFinite / total, offFrameClippingFraction: offFrame / total,
    leftLobeTimeFraction: leftLobe / total, lobeSwitches: switches, maxAbsState: maxAbs,
    endSpeed: Math.hypot(end.dx, end.dy, end.dz), drift: Math.hypot(x - tail.x0, y - tail.y0, z - tail.z0) };
}

/** Density-frame readings: channel endpoints and left/right mass split. */
function lorenzFrameDiagnostics(field: number[], width: number, height: number) {
  let lower = 0, upper = 0, left = 0, right = 0, bad = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const v = field[y * width + x];
    if (!Number.isFinite(v)) { bad += 1; continue; }
    if (v <= 0) lower += 1;
    if (v >= 1) upper += 1;
    if (x < width / 2) left += v; else right += v;
  }
  const mass = left + right;
  return { nonFiniteFraction: bad / field.length, lowerEndpointFraction: lower / field.length,
    upperEndpointFraction: upper / field.length, leftMassFraction: mass > 0 ? left / mass : 0 };
}

async function lorenzDrive(page: Page, config: SimSweepConfig, params: Params, warmupSteps: number, size = config.gridWidth) {
  return page.evaluate(driveKernel, { registryUrl: REGISTRY_URL, slug: config.slug, params, gridWidth: size, gridHeight: size,
    warmupSteps, fluxGap: config.fluxGap, primaryChannel: config.primaryChannel, dt: config.dt });
}

sweepTest("sweep 142 Lorenz unexplored beta/rho and sigma/rho regimes", async ({ page }) => {
  test.setTimeout(3_600_000);
  const config = SWEEP_CONFIGS["sweep-142-lorenz-attractor"];
  const sets = expandSweep(config);
  const planned = sets.map((params, i) => ({ id: lorenzId(i), params }));
  expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(planned.length + config.references.length);
  const manifest = {
    slug: config.slug, methodVersion: "lorenz-unexplored-v1",
    grid: { width: config.gridWidth, height: config.gridHeight }, warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
    command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 142 "',
    snapshots: LORENZ_SNAPSHOTS, longHorizonSnapshots: LORENZ_LONG_SNAPSHOTS,
    fixedParams: { dynamicSets: { stepsPerFrame: 6, fade: 0.992, ribbonWidth: "kernel default 2.1", colourByHeight: "kernel default true" } },
    determinism: "No RNG: kernel starts at (0.1,0,0) and integrates fixed-step RK4 (dt 0.005); fresh kernel per snapshot; metric tolerance 1e-9 on replay.",
    candidates: planned, references: config.references,
    counts: { dynamic: 64, refinement: planned.length - 64, allowance: "64 novel pairs + at most 24 refined sets" },
    schemaBounds: { sigma: [0, 30], rho: [0, 60], beta: [0, 10], stepsPerFrame: [1, 64], fade: [0.9, 1] },
    axes: { betaRho: { sigma: 10, beta: [0.6, 1.4, 4.5, 7], rho: [8, 16, 22, 26, 50, 54, 57, 60] },
      sigmaRho: { beta: 2.6667, sigma: [1.5, 4, 20, 28], rho: [14, 20, 24, 30, 34, 48, 54, 60] } },
    priorCoverage: [
      { source: "e2e/harness/sims.ts", description: "Historical LORENZ config (preserved unchanged, id lorenz-attractor): rho {24,28.4,32.8,37.2,41.6,46} x sigma {8,10,12,14} x fade {0.985,0.992,0.997}, beta fixed 2.6667, stepsPerFrame 6, five snapshots 280..840. 72 candidates. Not repeated; beta was never swept and sigma never left 8..14." },
      { source: "docs/sweeps/gray-scott-interestingness.md", description: "Appendix: Lorenz multi-snapshot scoring (2026-08-30) and the Lorenz & Boids section: five-snapshot N=5 sets at rho 28 (sigma 10, fade 0.992, spf 6), rho 35 (fade 0.990, spf 12), rho 37 and rho 42 (fade 0.997, spf 6), all sigma 10, beta 2.6667. Not repeated; this stage adds beta/sigma variation and rho outside or between these values." },
      { source: "docs/sweeps/2026-10-30-interestingness-batch.md", description: "Batch report: Lorenz is already covered by a historical config; this stage explores beta/rho and sigma/rho outside or between that grid and does not claim first-ever coverage." },
      { source: "src/app/presets.ts", description: "Current shipped lorenz-attractor presets used as references (classic spf8/fade0.985, wide-wings spf12/fade0.99, dense-wings, fast-trace). Only the historical classic reference is stale (stepsPerFrame 6/fade 0.992 vs shipped 8/0.985); historical wide-wings (12/0.99) already matches the shipped preset and is re-measured under 142-current-wide-wings only for a uniform current-reference set." },
      { source: "src/sims/lorenz-attractor/kernel.ts", description: "Schema bounds sigma [0,30], rho [0,60], beta [0,10]; only Lorenz-family attractor is searched, trail fade and stepsPerFrame fixed at 6 / 0.992 in dynamic comparisons." },
    ],
    inclusion: "All 64 sets retained including equilibrium, transient and clipped outcomes; rho below and above the old grid, sigma 1.5..28, beta 0.6..7.",
    exclusion: "No rossler/thomas/aizawa/halvorsen; no old-grid repeat; no ribbonWidth/colour search; no production changes.",
    sourceHashes: Object.fromEntries(["src/app/presets.ts", "src/sims/lorenz-attractor/kernel.ts", "e2e/harness/driver.ts", "e2e/harness/metrics.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
  };
  writeText(`${LORENZ_ROOT}/manifest.json`, JSON.stringify(manifest, null, 2));
  const diagnostics: Record<string, object> = {};
  const measure = async (c: { id: string; params: Params }, label: string) => {
    const scored = await scoreOne(page, config, c.id, label, c.params);
    expect(Object.values(scored.metrics).filter(v => typeof v === "number").every(Number.isFinite), c.id).toBe(true);
    const frame = await lorenzDrive(page, config, c.params, 560);
    diagnostics[c.id] = { trajectory: lorenzTrajectoryDiagnostics(c.params, config.gridWidth, config.gridHeight, 840 + config.fluxGap),
      density560: lorenzFrameDiagnostics(frame.frameA, frame.width, frame.height) };
    return scored;
  };
  const candidates: ScoredCandidate[] = [], references: ScoredCandidate[] = [];
  const sheetCols = 8, cell = 128;
  const sheetW = sheetCols * cell, sheetH = Math.ceil(planned.length / sheetCols) * cell;
  const sheet = new Float32Array(sheetW * sheetH);
  for (const c of planned) {
    const scored = await measure(c, c.id);
    const frame = await lorenzDrive(page, config, c.params, 560);
    const i = candidates.length;
    for (let y = 0; y < cell; y += 1) for (let x = 0; x < cell; x += 1) sheet[(Math.floor(i / sheetCols) * cell + y) * sheetW + (i % sheetCols) * cell + x] = frame.frameA[y * cell + x];
    candidates.push(scored);
  }
  for (const r of config.references) references.push(await measure(r, r.label));
  const ranked = [...candidates].sort((a, b) => b.metrics.score - a.metrics.score);
  writePng(`${ARTIFACT_ROOT}/sweep-142-lorenz-attractor/census.png`, sheet, sheetW, sheetH, 1);
  writeText(`${ARTIFACT_ROOT}/sweep-142-lorenz-attractor/report.md`, metricsTable(ranked, ["sigma", "beta", "rho", "stepsPerFrame", "fade"]));
  writeText(`${ARTIFACT_ROOT}/sweep-142-lorenz-attractor/census.json`, JSON.stringify({ manifest, ranked, references, diagnostics }));
  if (!LORENZ_FINALISTS.length) return;

  const imagePath = (id: string, tag: string) => `${LORENZ_IMAGES}/${id}-${tag}.png`;
  const renderer = async (params: Params, warmup: number, path: string) => {
    await page.setViewportSize({ width: 256, height: 256 });
    const info = await page.evaluate(async ({ params, warmup }) => {
      const load = (u: string) => import(/* @vite-ignore */ u);
      const [{ Renderer }, { LorenzAttractorKernel }, { defaultColourOptionsFor }, { qualityProfileFor }, { getRenderMode }] = await Promise.all([
        load("/src/app/renderer.ts"), load("/src/sims/lorenz-attractor/kernel.ts"), load("/src/app/colormap.ts"), load("/src/app/qualityProfiles.ts"), load("/src/app/renderModes.ts")]);
      document.body.innerHTML = "";
      const canvas = document.createElement("canvas"); canvas.id = "lorenz-evidence";
      canvas.style.cssText = "position:fixed;left:0;top:0;width:256px;height:256px"; document.body.appendChild(canvas);
      class Snapshot extends LorenzAttractorKernel {
        init(w: number, h: number, p: Params) { super.init(w, h, p); for (let i = 0; i < warmup; i += 1) super.step(1); }
      }
      const kernel = new Snapshot(), mode = getRenderMode("lorenz-attractor");
      const profile = qualityProfileFor("lorenz-attractor", mode, "desktop");
      const colourOptions = defaultColourOptionsFor("lorenz-attractor", 1);
      const r = new Renderer({ canvas, kernel, params, stepsPerFrame: 0, colourOptions,
        displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 }, renderMode: mode, resolution: profile.defaultPreset, qualityProfile: profile });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      (window as any).__lorenzRenderer = r;
      return { canvas: [canvas.width, canvas.height], renderer: canvas.dataset.renderer };
    }, { params, warmup });
    expect(info.renderer).toBe("webgl2");
    await page.locator("#lorenz-evidence").screenshot({ path });
    await page.evaluate(() => (window as any).__lorenzRenderer.destroy());
    return info;
  };
  const longConfig = { ...config, multiSnapshot: { warmupSteps: LORENZ_LONG_SNAPSHOTS } };
  const finalists = LORENZ_FINALISTS.map(id => ranked.find(c => c.id === id)!);
  expect(finalists.every(Boolean)).toBe(true);
  const evidence: Record<string, object> = {}, replay: object[] = [];
  const finalistRows: { id: string; images: string[] }[] = [];
  let negativeControl: object | undefined, refinedControl: object | undefined;
  const negative = ranked.find(c => (diagnostics[c.id] as any).trajectory.offFrameClippingFraction > 0.1)!;
  const bestRefined = ranked.find(c => planned.findIndex(p => p.id === c.id) >= 64)!;
  for (const c of [...finalists, negative, bestRefined, ...references]) {
    const again = await scoreOne(page, config, c.id, c.label, c.params);
    const delta = Math.max(...Object.entries(again.metrics).filter(([, v]) => typeof v === "number").map(([k, v]) => Math.abs((v as number) - (c.metrics as any)[k])));
    expect(delta).toBeLessThanOrEqual(1e-9);
    replay.push({ id: c.id, maxAbsoluteDelta: delta });
    const frames: string[] = [], rendererFrames: string[] = [], renderInfo: object[] = [];
    for (const warmup of LORENZ_FRAME_STEPS) {
      const f = await lorenzDrive(page, config, c.params, warmup, 256);
      const fp = imagePath(c.id, `field-256-warmup${warmup}`);
      writePng(fp, f.frameA, f.width, f.height, 1); frames.push(fp);
      const rp = imagePath(c.id, `renderer-256-warmup${warmup}`);
      renderInfo.push(await renderer(c.params, warmup, rp)); rendererFrames.push(rp);
    }
    const long = await scoreOne(page, longConfig, c.id, c.label, c.params);
    evidence[c.id] = { fieldImages: frames, rendererImages: rendererFrames, renderInfo, longHorizon: { snapshots: LORENZ_LONG_SNAPSHOTS, metrics: long.metrics },
      longTrajectory: lorenzTrajectoryDiagnostics(c.params, config.gridWidth, config.gridHeight, 2840 + config.fluxGap) };
    if (finalists.includes(c)) finalistRows.push({ id: c.id, images: [...rendererFrames, ...frames] });
    else if (c === negative) negativeControl = { id: c.id, reason: "highest-scoring candidate with more than 10% of trajectory off-frame; rejected", images: [...rendererFrames, ...frames] };
    else if (c === bestRefined) refinedControl = { id: c.id, reason: "highest-scoring presentation refinement", images: [...rendererFrames, ...frames] };
    else c.thumb = rendererFrames[1];
  }
  writeText(`${LORENZ_ROOT}/lorenz-attractor.json`, JSON.stringify({ manifest, ranked, references, finalists: finalistRows, diagnostics, evidence,
    replay: { tolerance: 1e-9, workerRepeat: replay, independentVerifierRequired: true }, negativeControl, refinedControl }, null, 2));
  console.log(`Lorenz 142: ${candidates.length} candidates, ${references.length} references, ${finalists.length} evidence selections`);
});

const RD_ROOT = "docs/sweeps/data/2026-10-30/143";
const RD_IMAGES = "docs/images/sweeps-2026-10-30";
const RD_SLUGS = ["gray-scott", "belousov-zhabotinsky", "lenia"];

function rdDiagnostics(field: number[]) {
  return {
    nonFiniteFraction: field.filter(v => !Number.isFinite(v)).length / field.length,
    lowerEndpointFraction: field.filter(v => v === 0).length / field.length,
    upperEndpointFraction: field.filter(v => v === 1).length / field.length,
    outOfRangeFraction: field.filter(v => v < 0 || v > 1).length / field.length,
    offFrameClippingFraction: 0,
  };
}

function rdEncode(field: number[]) {
  const bytes = Buffer.alloc(field.length * 4);
  field.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
  return deflateSync(bytes).toString("base64");
}
function rdDecode(encoded: string) {
  const bytes = inflateSync(Buffer.from(encoded, "base64"));
  return Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readFloatLE(i * 4));
}
async function rdCapture(page: Page, config: SimSweepConfig, params: Params, size: number, steps: number) {
  return (await rdCaptureSeries(page, config, params, size, [steps]))[0];
}
async function rdCaptureSeries(page: Page, config: SimSweepConfig, params: Params, size: number, times: number[]) {
  const fields = await page.evaluate(driveKernel, {
    registryUrl: REGISTRY_URL, slug: config.slug, params, gridWidth: size, gridHeight: size,
    warmupSteps: times[0], sampleSteps: times, fluxGap: config.fluxGap, primaryChannel: config.primaryChannel, dt: config.dt, preserveRange: true,
  });
  return fields.snapshots!.map(fields => {
  const diagnostics = { frameA: rdDiagnostics(fields.frameA), frameB: rdDiagnostics(fields.frameB) };
  expect(diagnostics.frameA.nonFiniteFraction).toBe(0);
  expect(diagnostics.frameB.nonFiniteFraction).toBe(0);
  const metrics = scoreFrames(fields.frameA, fields.frameB, size, size, config.coverageThreshold);
  expect(Object.values(metrics).every(Number.isFinite)).toBe(true);
  return { steps: fields.steps, size, metrics, diagnostics, frameA: rdEncode(fields.frameA), frameB: rdEncode(fields.frameB) };
  });
}

const RD_PRIOR: Record<string, { source: string; description: string }[]> = {
  "gray-scott": [
    { source: "docs/sweeps/gray-scott-interestingness.md", description: "Subtract 56 pairs: F=linspace(0.01,0.066,8), k=linspace(0.045,0.067,7); whole plane 651 pairs F=0.010..0.070 step0.002, k=0.040..0.070 step0.0015 at96sq. Both fixed Du0.2097,Dv0.105. Subtract 210-pair glider box F0.056..0.066 step0.0005,k0.0590..0.0635 step0.0005 under five/nine-point and dt1/0.5/0.25/0.125, all canonical and labyrinth controls, later Waves/Coral five/nine-point and app-scale follow-ups. New F values are odd half-thousandths below0.056, and k quarter-thousandths; no old pair repeated. No discretisation search." },
    { source: "e2e/harness/sims.ts", description: "Historical GRAY_SCOTT entry and retired u-skate row preserved unchanged. New sets cross four transition neighbourhoods with Dv0.085/0.105/0.125 at fixed Du0.2097, nine-point, dt1,20 inner iterations. Dv-to-Du ratios0.40534/0.50072/0.59609. F/k transition locations are exploratory, not proven phase boundaries." },
  ],
  "belousov-zhabotinsky": [
    { source: "docs/sweeps/belousov-zhabotinsky-interestingness.md", description: "Subtract40 feed/kill pairs: feed linspace0.008..0.05(8), kill[0.008,0.016,0.024,0.032,0.044], fixed diffusion(0.18,0.08,0.035). Subtract12 diffusion probes at feed=kill0.02: A[0.06,0.09,0.12,0.14,0.18,0.21,0.24,0.27,0.30,0.34],B=A/2-0.01,C0.035 plus(0.18,0.08,C0.055/0.08). Subtract high-A appendix A0.18/0.24/0.27/0.35 at B0.08,C0.035,feed=kill0.02 and128/256/longer horizons. Every new triple is off the old A/B spine, every new set differs from all old full tuples; none uses feed=kill0.02." },
    { source: "e2e/harness/sims.ts", description: "Both historical BZ configurations preserved. New feed[0.014,0.026,0.038,0.05] x kill[0.016,0.028,0.04] x four explicit diffusion triples;12 reaction pairs per triple,48 total. stepsPerFrame1, internal Euler dt0.2 unchanged." },
  ],
  lenia: [
    { source: "docs/sweeps/lenia-interestingness.md", description: "Subtract24 mu[0.10,0.128,0.156,0.184,0.212,0.24] x sigma[0.010,0.016,0.022,0.028],radius8,muDrift0.015; subtract15 radius[6,8,10,12,14] x(mu,sigma)[(0.24,0.028),(0.212,0.028),(0.15,0.017)],muDrift0.015,dt0.1. Living labyrinth radius14/mu0.24/sigma0.028/drift0.015 is now a reference only. All new radii7/11/15 and growth pairs differ; drift[0,0.008,0.024,0.03] crosses previously unsearched drift with radius/growth." },
    { source: "src/sims/lenia/kernel.ts", description: "750 internal-step drift period, seed0 deterministic radius/grid-dependent blobs; optional seeds1/2 used only for validation. Outer dt argument ignored: actual dt0.1 in params. No dt or stepsPerFrame search. Include drift0 as static-growth control, high drift0.03 as fragility probe, not a promotion assumption." },
  ],
};

async function rdRender(page: Page, config: SimSweepConfig, params: Params, steps: number, path: string) {
  await page.setViewportSize({ width: 384, height: 384 });
  const info = await page.evaluate(async ({ slug, params, steps, channel }) => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const [{ Renderer }, mod, { defaultColourOptionsFor }, { qualityProfileFor }, { getRenderMode }] = await Promise.all([
      load("/src/app/renderer.ts"), load(`/src/sims/${slug}/kernel.ts`), load("/src/app/colormap.ts"), load("/src/app/qualityProfiles.ts"), load("/src/app/renderModes.ts"),
    ]);
    const Base: any = mod.default ?? Object.values(mod).find(v => typeof v === "function");
    let grid: number[] = [];
    const receivedParams: Params[] = [];
    class SnapshotKernel extends Base {
      init(w: number, h: number, p: Params) {
        receivedParams.push({ ...p });
        // App runs inject variety; exact snapshots preserve their declared seed.
        super.init(w, h, { ...p, ...(typeof params.seed === "number" ? { seed: params.seed } : {}) }); grid = [w, h];
        for (let i = 0; i < steps; i += 1) super.step(1);
      }
    }
    document.body.innerHTML = "";
    const canvas = document.createElement("canvas"); canvas.id = "rd-evidence";
    canvas.style.cssText = "position:fixed;left:0;top:0;width:384px;height:384px";
    document.body.appendChild(canvas);
    const kernel = new SnapshotKernel(), mode = getRenderMode(slug);
    const profile = qualityProfileFor(slug, mode, "desktop");
    const colourOptions = { ...defaultColourOptionsFor(slug, kernel.channelCount), channel };
    const renderer = new Renderer({ canvas, kernel, params, stepsPerFrame: 1, colourOptions,
      displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 }, renderMode: mode, resolution: "performance", qualityProfile: profile });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const state = kernel.readState(), cc = kernel.channelCount;
    const field = Array.from({ length: grid[0] * grid[1] }, (_, i) => Number(state[i * cc + channel]));
    (window as any).__rdRenderer = renderer;
    return { grid, field, receivedParams, canvas: [canvas.width, canvas.height], renderer: canvas.dataset.renderer, running: renderer.isRunning(), colourOptions };
  }, { slug: config.slug, params, steps, channel: config.primaryChannel });
  expect(info.running).toBe(false);
  expect(info.renderer).toBe("webgl2");
  await page.locator("#rd-evidence").screenshot({ path });
  await page.evaluate(() => (window as any).__rdRenderer.destroy());
  const { field, ...renderInfo } = info;
  return { ...renderInfo, field: rdEncode(field) };
}

for (const slug of RD_SLUGS) {
  sweepTest(`sweep 143 ${slug} missed regimes`, async ({ page }) => {
    test.setTimeout(3_600_000);
    const config = SWEEP_CONFIGS[`sweep-143-${slug}`];
    const previous = existsSync(`${RD_ROOT}/${slug}.json`) ? JSON.parse(readFileSync(`${RD_ROOT}/${slug}.json`, "utf8")) : null;
    const times = config.multiSnapshot!.warmupSteps;
    const planned = expandSweep(config).map((params, i) => ({ id: `143-${slug}-c${String(i + 1).padStart(2, "0")}`, params }));
    const manifest = {
      slug, methodVersion: config.reactionDiffusion!.methodVersion,
      grid: { width: config.gridWidth, height: config.gridHeight }, warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
      command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 143 " --workers=1',
      candidates: planned, references: config.references, fixedParams: config.baseParams, sampleSteps: times,
      priorCoverage: [...RD_PRIOR[slug], { source: "src/app/presets.ts", description: "Current shipped presets are all distinct new 143-current-* rows. Explicit current Gray-Scott nine-point/dt1 and Lenia seed0 complete implicit kernel defaults. Historical rows and IDs stay unchanged." }],
      candidateCounts: { novel: 48, refinements: 0 },
      inclusion: "48 exact full parameter tuples, declaration order; historical tuples subtracted as detailed in priorCoverage. Fixed resolution/iteration/threshold settings listed here. No adaptive truncation.",
      exclusion: "No glider box/discretisation repeat, global slider Cartesian product, production change or automatic promotion. No refinement allowance used.",
      determinism: slug === "lenia" ? "Explicit seed0 for ranking; seeds0,1,2 for finalists and all current references. Fresh deterministic kernel per parameter/size/seed trajectory, ordered captures." : "Closed-form deterministic seed geometry; no random source or seed parameter. Fresh kernel per parameter/size trajectory, ordered captures.",
      method: "Arithmetic mean of unchanged scoreFrames metrics at three separated times via summarizeMetrics; retain each reading and population spread. No new morphology class labels, weights, calibration orderings or aesthetic claims from scores.",
      rawEncoding: "zlib-deflated little-endian Float32, base64, channel range[0,1]; frameA and frameB separated by fluxGap; exact metric recomputation, not PNG quantisation.",
      validationPlan: { finalists: 1, selection: "Highest mean-score candidate, retained even if rejected; evidence selection only.", sizes: [128, 384], steps: [...times, slug === "gray-scott" ? 2000 : slug === "lenia" ? 1510 : 2000], seeds: slug === "lenia" ? [0, 1, 2] : [null],
        presentation: "Actual app WebGL2 Renderer at performance resolution, paused snapshot kernel at exact step counts; app default colour options, primary channel, bloom0. All finalists/references equal384px screenshots. Full live route also retained as qualitative context only.",
        clipping: "All kernels use a periodic field domain; no projection or off-frame particles, offFrameClippingFraction0 is geometric, not a count of boundary-crossing features.", replayTolerance: 1e-9 },
      sourceHashes: Object.fromEntries(["src/app/presets.ts", `src/sims/${slug}/kernel.ts`, "e2e/harness/metrics.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
    };
    expect(planned).toHaveLength(48);
    expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(48 + config.references.length);
    writeText(`${RD_ROOT}/manifest-${slug}.json`, JSON.stringify(manifest, null, 2));
    const started = Date.now();
    const pilot = await rdCapture(page, config, planned[0].params, 128, times[times.length - 1]);
    const pilotMs = Date.now() - started;
    const estimatedSweepMs = pilotMs * (48 + config.references.length) * times.length;
    writeText(`${RD_ROOT}/pilot-${slug}.json`, JSON.stringify({ pilotMs, estimatedSweepMs, allowanceMs: 3_600_000, params: planned[0].params, metrics: pilot.metrics }, null, 2));
    expect(estimatedSweepMs, "Pilot cannot fit declared grid: split/re-brief required").toBeLessThan(3_000_000);
    if (process.env.SWEEP_143_PILOT === "1") {
      const render = await rdRender(page, config, planned[0].params, times[0], `${ARTIFACT_ROOT}/${config.artifactId}/pilot-renderer.png`);
      expect(render.grid).toEqual([384, 384]);
      console.log(`${slug}: pilot ${pilotMs}ms, projected ranking ${estimatedSweepMs}ms; Renderer grid ${render.grid}`);
      return;
    }
    const raw: any[] = [], candidates: ScoredCandidate[] = [], references: ScoredCandidate[] = [];
    for (const [i, row] of [...planned, ...config.references].entries()) {
      const samples = await rdCaptureSeries(page, config, row.params, 128, times);
      const scored = { id: row.id, label: "label" in row ? row.label as string : row.id, params: row.params, metrics: summarizeMetrics(samples.map(s => s.metrics)), methodVersion: manifest.methodVersion };
      (i < planned.length ? candidates : references).push(scored);
      raw.push({ id: row.id, params: row.params, samples });
      writeText(`${RD_ROOT}/${slug}-raw.json`, JSON.stringify({ encoding: manifest.rawEncoding, rows: raw }));
      if ((i + 1) % 12 === 0) console.log(`${slug}: measured ${i + 1}/${planned.length + config.references.length}`);
    }
    const ranked = candidates.sort((a, b) => b.metrics.score - a.metrics.score);
    const finalist = ranked[0];
    if (previous) {
      expect(ranked.map(r => r.id)).toEqual(previous.ranked.map((r: ScoredCandidate) => r.id));
      for (const row of [...ranked, ...references]) {
        const old = [...previous.ranked, ...previous.references].find(r => r.id === row.id);
        expect(row.params).toEqual(old.params);
        for (const key of ["entropy", "variance", "spatialAutocorrelation", "coverage", "temporalFlux", "score"]) {
          expect(Math.abs((row.metrics as any)[key] - old.metrics[key]), `${row.id}:${key}`).toBeLessThanOrEqual(1e-9);
        }
      }
    }
    writeText(`${ARTIFACT_ROOT}/${config.artifactId}/report.md`, metricsTable(ranked, config.axes.map(a => a.key)));
    const sheet = new Float32Array(8 * 128 * 6 * 128);
    for (let i = 0; i < planned.length; i += 1) {
      const field = rdDecode(raw[i].samples[0].frameA);
      for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) sheet[(Math.floor(i / 8) * 128 + y) * 1024 + i % 8 * 128 + x] = field[y * 128 + x];
    }
    writePng(`${RD_IMAGES}/143-${slug}-census.png`, sheet, 1024, 768, 1);
    writeText(`${RD_ROOT}/${slug}-ranking.json`, JSON.stringify({ manifest, ranked, references }, null, 2));
    if (process.env.SWEEP_143_RANKING_ONLY === "1") return;
    const previousValidation = previous && (previous.rendererMethodVersion === "explicit-seed-v2" || slug !== "lenia")
      ? JSON.parse(readFileSync(previous.validation, "utf8")) : [];
    if (previous) expect(previous.manifest.sourceHashes).toEqual(manifest.sourceHashes);
    const validation: any[] = [], replay: any[] = [], paths = new Map<string, string[]>();
    for (const row of [finalist, ...references]) {
      const exact = await scoreOne(page, config, row.id, row.label, row.params);
      const delta = Math.max(...["entropy", "variance", "coverage", "spatialAutocorrelation", "temporalFlux", "score"].map(k => Math.abs((exact.metrics as any)[k] - (row.metrics as any)[k])));
      expect(delta, row.id).toBeLessThanOrEqual(1e-9);
      replay.push({ id: row.id, maxAbsoluteDelta: delta, metrics: exact.metrics });
      const images: string[] = [], readings: any[] = [], rendered: any[] = [];
      for (const size of [128, 384]) for (const seed of slug === "lenia" ? [0, 1, 2] : [null]) {
        const params = seed === null ? row.params : { ...row.params, seed };
        const samples = await rdCaptureSeries(page, config, params, size, manifest.validationPlan.steps);
        for (const sample of samples) {
          const steps = sample.steps;
          const priorRow = previousValidation.find(v => v.id === row.id);
          const priorReading = priorRow?.readings.find(r => r.size === size && r.steps === steps && (seed === null || r.params.seed === seed));
          if (previous) {
            expect(priorReading, `${row.id}:${size}:${seed}:${steps}`).toBeTruthy();
            for (const [key, value] of Object.entries(sample.metrics)) {
              expect(Math.abs(value - priorReading.metrics[key]), `${row.id}:${key}`).toBeLessThanOrEqual(1e-9);
            }
            expect(sample.diagnostics).toEqual(priorReading.diagnostics);
          }
          const path = `${RD_IMAGES}/${row.id}-field-${size}-seed${seed ?? "none"}-t${steps}.png`;
          writePng(path, rdDecode(sample.frameA), size, size, 1);
          images.push(path); readings.push({ ...sample, params, image: path });
          if (size === 384 && (seed === null || seed === 0)) {
            const appPath = `${RD_IMAGES}/${row.id}-renderer-t${steps}.png`;
            const prior = previousValidation.find(v => v.id === row.id);
            const priorField = prior?.readings.find(r => r.size === size && r.steps === steps && (seed === null || r.params.seed === seed));
            const priorRender = prior?.rendered.find(r => r.steps === steps);
            if (process.env.SWEEP_143_RENDER_FRESH !== "1" && priorRender && priorField?.frameA === sample.frameA && JSON.stringify(priorField.params) === JSON.stringify(params) && existsSync(appPath)) {
              rendered.push({ ...priorRender, reusedAfterExactFreshFieldReplay: true,
                imageSha256: createHash("sha256").update(readFileSync(appPath)).digest("hex") });
            } else {
              const rendering = await rdRender(page, config, params, steps, appPath);
              expect(rendering.grid).toEqual([384, 384]);
              expect(rdDecode(rendering.field)).toEqual(rdDecode(sample.frameA));
              rendered.push({ steps, image: appPath, ...rendering, field: undefined });
            }
            images.push(appPath);
          }
        }
      }
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.goto(`/?sweep143=${row.id}#/${slug}`);
      await page.locator("[data-param-key]").first().waitFor({ timeout: 20_000 });
      const pause = page.getByRole("button", { name: "Pause", exact: true });
      if (await pause.count()) await pause.evaluate(el => (el as HTMLButtonElement).click());
      for (const [key, value] of Object.entries(row.params)) {
        const input = page.locator(`[data-param-key=${key}]`);
        if (key === "seed") continue;
        await input.evaluate((el, value) => {
          (el as HTMLInputElement).value = String(value);
          el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
        }, value);
      }
      await page.getByRole("button", { name: "Reset", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
      await page.getByRole("button", { name: "Play", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
      await page.waitForTimeout(3000);
      await page.getByRole("button", { name: "Pause", exact: true }).evaluate(el => (el as HTMLButtonElement).click());
      const livePath = `${RD_IMAGES}/${row.id}-app-live.png`;
      await page.screenshot({ path: livePath, animations: "disabled" }); images.push(livePath);
      const inputs = await page.locator("[data-param-key]").evaluateAll(es => Object.fromEntries(es.map(e => [(e as HTMLElement).dataset.paramKey, (e as HTMLInputElement).value])));
      const canvas = await page.locator("canvas").first().evaluate((e: HTMLCanvasElement) => ({ width: e.width, height: e.height, data: { ...e.dataset } }));
      paths.set(row.id, images); row.thumb = images.find(p => p.includes("renderer"))!;
      validation.push({ id: row.id, readings, rendered, liveApp: { image: livePath, inputs, canvas, note: "Three seconds live play; step count and optional random seed uncontrolled. Qualitative route context only; exact equal-time comparisons use Renderer snapshots and raw fields." } });
      writeText(`${RD_ROOT}/${slug}-validation.json`, JSON.stringify(validation));
      console.log(`${slug}: validated ${row.id}, replay delta ${delta}`);
    }
    writeText(`${RD_ROOT}/${slug}.json`, JSON.stringify({ manifest, ranked, references,
      finalists: [{ id: finalist.id, images: paths.get(finalist.id), referenceIds: references.map(r => r.id) }],
      rendererMethodVersion: "explicit-seed-v2", replay, replayTolerance: 1e-9, rawFields: `${RD_ROOT}/${slug}-raw.json`, validation: `${RD_ROOT}/${slug}-validation.json`,
      referenceImages: Object.fromEntries(references.map(r => [r.id, paths.get(r.id)])), elapsedMs: Date.now() - started,
      runtime: { browser: page.context().browser()?.version(), node: process.version, platform: process.platform } }, null, 2));
    console.log(`${slug}: complete ${ranked.length} candidates, ${references.length} references, finalist ${finalist.id}`);
  });
}

const rdReplayTest = process.env.SWEEP_REPLAY === "143" ? test : test.skip;
rdReplayTest("143 retained raw fields reproduce every reading and current-reference provenance", async ({ page }) => {
  test.setTimeout(120_000);
  const summary = [];
  for (const slug of RD_SLUGS) {
    const result = JSON.parse(readFileSync(`${RD_ROOT}/${slug}.json`, "utf8"));
    const raw = JSON.parse(readFileSync(result.rawFields, "utf8"));
    const config = SWEEP_CONFIGS[`sweep-143-${slug}`];
    let maxAbsoluteDelta = 0;
    const recomputed: { id: string; score: number }[] = [];
    const check = (samples: any[], expected: InterestingnessMetrics) => {
      const metrics = samples.map(s => {
        const frameA = rdDecode(s.frameA), frameB = rdDecode(s.frameB);
        expect(rdDiagnostics(frameA)).toEqual(s.diagnostics.frameA);
        expect(rdDiagnostics(frameB)).toEqual(s.diagnostics.frameB);
        const actual = scoreFrames(frameA, frameB, s.size, s.size, config.coverageThreshold);
        for (const [k, value] of Object.entries(actual)) {
          const delta = Math.abs(value - s.metrics[k]);
          expect(delta).toBeLessThanOrEqual(1e-9); maxAbsoluteDelta = Math.max(maxAbsoluteDelta, delta);
        }
        return actual;
      });
      const actual = summarizeMetrics(metrics);
      for (const k of ["entropy", "variance", "spatialAutocorrelation", "coverage", "temporalFlux", "score"]) {
        const delta = Math.abs((actual as any)[k] - (expected as any)[k]);
        expect(delta).toBeLessThanOrEqual(1e-9); maxAbsoluteDelta = Math.max(maxAbsoluteDelta, delta);
      }
      return actual;
    };
    expect(raw.rows.map((r: any) => r.id)).toEqual([...result.manifest.candidates, ...result.references].map((r: any) => r.id));
    for (const row of raw.rows) {
      const expected = [...result.ranked, ...result.references].find((r: any) => r.id === row.id);
      expect(row.params).toEqual(expected.params);
      const actual = check(row.samples, expected.metrics);
      if (result.ranked.some((r: any) => r.id === row.id)) recomputed.push({ id: row.id, score: actual.score });
    }
    expect(recomputed.sort((a, b) => b.score - a.score).map(r => r.id)).toEqual(result.ranked.map((r: any) => r.id));
    const validations = JSON.parse(readFileSync(result.validation, "utf8"));
    let validationReadings = 0;
    for (const row of validations) for (const sample of row.readings) { check([sample], sample.metrics); validationReadings += 1; }
    const shipped = await page.evaluate(async slug => (await import(/* @vite-ignore */ "/src/app/presets.ts")).presetsFor(slug), slug);
    expect(result.references).toHaveLength(shipped.length);
    for (const preset of shipped) {
      const ref = result.references.find((r: any) => r.id === `143-current-${preset.id}`);
      expect(ref, preset.id).toBeTruthy();
      expect(ref.params).toEqual({ ...preset.params, ...(slug === "gray-scott" ? { stencil: "nine-point", dt: 1 } : slug === "lenia" ? { seed: 0 } : {}) });
    }
    summary.push({ slug, ranked: result.ranked.length, references: result.references.length, validationReadings, maxAbsoluteDelta, identicalOrdering: true, shippedReferenceMatch: true });
  }
  writeText(`${RD_ROOT}/raw-recomputation.json`, JSON.stringify({ tolerance: 1e-9, summary }, null, 2));
  console.log(JSON.stringify(summary));
});

rdReplayTest("143 multi-time driver matches fresh independent trajectories", async ({ page }) => {
  for (const slug of RD_SLUGS) {
    const config = SWEEP_CONFIGS[`sweep-143-${slug}`], params = expandSweep(config)[0];
    const cfg = { registryUrl: REGISTRY_URL, slug, params, gridWidth: 64, gridHeight: 64, warmupSteps: 10, fluxGap: 2, dt: 1, primaryChannel: config.primaryChannel, preserveRange: true };
    const series = await page.evaluate(driveKernel, { ...cfg, sampleSteps: [10, 20, 30] });
    for (const sample of series.snapshots!) {
      const fresh = await page.evaluate(driveKernel, { ...cfg, warmupSteps: sample.steps });
      expect(sample.frameA).toEqual(fresh.frameA); expect(sample.frameB).toEqual(fresh.frameB);
    }
  }
});

rdReplayTest("143 fresh replay preserves all metrics, ordering and validation readings", async ({ page }) => {
  test.setTimeout(3_600_000);
  const summary = [];
  for (const slug of RD_SLUGS) {
    const result = JSON.parse(readFileSync(`${RD_ROOT}/${slug}.json`, "utf8"));
    const config = SWEEP_CONFIGS[`sweep-143-${slug}`];
    let maxAbsoluteDelta = 0;
    const compare = (actual: InterestingnessMetrics, expected: InterestingnessMetrics, id: string) => {
      for (const key of ["entropy", "variance", "spatialAutocorrelation", "coverage", "temporalFlux", "score"]) {
        const delta = Math.abs((actual as any)[key] - (expected as any)[key]);
        expect(delta, `${id}:${key}`).toBeLessThanOrEqual(1e-9);
        maxAbsoluteDelta = Math.max(maxAbsoluteDelta, delta);
      }
      const spread = (expected as MultiSnapshotMetrics).spread;
      if (spread) for (const [key, readings] of Object.entries(spread)) {
        for (const [stat, expectedValue] of Object.entries(readings!)) {
          const delta = Math.abs((actual as any).spread[key][stat] - expectedValue);
          expect(delta, `${id}:spread:${key}:${stat}`).toBeLessThanOrEqual(1e-9);
          maxAbsoluteDelta = Math.max(maxAbsoluteDelta, delta);
        }
      }
    };
    const retainedRaw = JSON.parse(readFileSync(result.rawFields, "utf8"));
    const fresh = [];
    for (const row of [...result.manifest.candidates, ...result.references]) {
      const samples = await rdCaptureSeries(page, config, row.params, 128, result.manifest.sampleSteps);
      const expected = [...result.ranked, ...result.references].find(r => r.id === row.id);
      const retained = retainedRaw.rows.find(r => r.id === row.id);
      for (const [i, sample] of samples.entries()) {
        expect(sample.steps).toBe(retained.samples[i].steps);
        compare(sample.metrics, retained.samples[i].metrics, `${row.id}:${sample.steps}`);
        expect(sample.diagnostics).toEqual(retained.samples[i].diagnostics);
      }
      const metrics = summarizeMetrics(samples.map(s => s.metrics));
      compare(metrics, expected.metrics, row.id);
      if (result.ranked.some(r => r.id === row.id)) fresh.push({ id: row.id, score: metrics.score });
    }
    expect(fresh.sort((a, b) => b.score - a.score).map(r => r.id)).toEqual(result.ranked.map(r => r.id));
    const validations = JSON.parse(readFileSync(result.validation, "utf8"));
    let validationReadings = 0;
    for (const row of validations) {
      for (const size of [128, 384]) for (const seed of slug === "lenia" ? [0, 1, 2] : [null]) {
        const expected = row.readings.filter(r => r.size === size && (seed === null || r.params.seed === seed));
        const samples = await rdCaptureSeries(page, config, expected[0].params, size, expected.map(r => r.steps));
        for (const [i, sample] of samples.entries()) {
          compare(sample.metrics, expected[i].metrics, `${row.id}:${size}:${seed}:${sample.steps}`);
          expect(sample.diagnostics).toEqual(expected[i].diagnostics);
          validationReadings += 1;
        }
      }
    }
    summary.push({ slug, candidates: fresh.length, references: result.references.length, validationReadings,
      maxAbsoluteDelta, identicalOrdering: true, browser: page.context().browser()?.version() });
    console.log(`${slug}: fresh replay complete, max delta ${maxAbsoluteDelta}`);
  }
  writeText(`${RD_ROOT}/fresh-replay.json`, JSON.stringify({ tolerance: 1e-9, summary,
    note: "Identity of the executor determines independence; worker execution is a repeat, verifier execution is independent replay." }, null, 2));
});


test("143 Renderer snapshots keep declared seeds", async ({ page }) => {
  const config = SWEEP_CONFIGS["sweep-143-lenia"];
  const checks = [];
  for (const seed of [0, 1, 2]) {
    const params = { ...expandSweep(config)[0], seed };
    const actual = await rdRender(page, config, params, 0, `${ARTIFACT_ROOT}/143-seed-${seed}.png`);
    const expected = await rdCapture(page, config, params, 384, 0);
    const field = rdDecode(actual.field), reference = rdDecode(expected.frameA);
    const mismatchedCells = field.filter((v, i) => v !== reference[i]).length;
    checks.push({ seed, receivedParams: actual.receivedParams, mismatchedCells });
    writeText(`${RD_ROOT}/renderer-seed-regression.json`, JSON.stringify(checks, null, 2));
    expect(mismatchedCells).toBe(0);
  }
});


const CELLULAR_ROOT = "docs/sweeps/data/2026-10-30/147";
const CELLULAR_SLUGS = ["brians-brain", "cyclic-ca", "game-of-life"];
const CELLULAR_PRIOR: Record<string, string> = {
  "brians-brain": "August: birthCount[1,2,3,4] x seedDensity[0.06,0.12,0.18,0.22,0.28,0.36,0.45], dyingValue0.5. September: birth2 x seed[0.12,0.36] x dying[0.1,0.3,0.5,0.7,0.9]. Every new density differs. birth0 is an oscillation control; birth4/5 probe extinction, not expected promotions. September Math.fround fix and 0.9 afterglow retunes supersede the August escalation. All new sets hold dying0.5; firing-only coverage0.99; interior dying values are presentation only.",
  "cyclic-ca": "August: states[4,6,8,10,14,20] x threshold[1,2,3,4] x neighbourhood[moore,vonNeumann]; finer rescue: states10..16 x threshold[1,2], vonNeumann. All eight new state counts[3,5,7,9,17,18,21,23] differ from both grids. Cross neighbourhood/threshold to test wave persistence versus jamming. Current Crystal is already threshold1, not a rescue target. seed0, stepsPerFrame1 fixed.",
  "game-of-life": "August: B3 fixed, surviveMin[1,2,3] x surviveMax[3,4,5] x seedDensity[0.05,0.12,0.2,0.28,0.4]; spark0.1, ageShadingtrue. August30 appendix calibrated existing multi-lag on Maze-like and noise, no new rule search. Every new rule B1/B2/B23/B4 differs from B3. Cross three survival windows and spark[0,0.025,0.075,0.2], seedDensity0.28 fixed; no old full tuple repeated. Birth ranges are inclusive (B23), not B2/S3 notation.",
};

async function cellularCapture(page: Page, config: SimSweepConfig, params: Params, size: number, times: number[]) {
  const samples = await rdCaptureSeries(page, config, params, size, times);
  return samples.map(s => ({ ...s, metrics: { ...s.metrics,
    multiLagStructure: multiLagSpatialAutocorrelation(rdDecode(s.frameA), size, size) } }));
}
function cellularSummary(samples: { metrics: InterestingnessMetrics }[]) {
  const values = samples.map(s => s.metrics.multiLagStructure!);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const summary = summarizeMetrics(samples.map(s => s.metrics));
  return { ...summary, multiLagStructure: mean, spread: { ...summary.spread,
    multiLagStructure: { min: Math.min(...values), max: Math.max(...values),
      standardDeviation: Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length) } } };
}
function cellularDelta(actual: any, expected: any): number {
  if (typeof actual === "number") return Math.abs(actual - expected);
  return Math.max(0, ...Object.keys(actual).map(k => cellularDelta(actual[k], expected[k])));
}

for (const slug of CELLULAR_SLUGS) {
  sweepTest(`sweep 147 ${slug} missed regimes`, async ({ page }) => {
    test.setTimeout(3_600_000);
    const config = SWEEP_CONFIGS[`sweep-147-${slug}`], times = config.multiSnapshot!.warmupSteps;
    const output = `${CELLULAR_ROOT}/${slug}.json`;
    const previous = existsSync(output) ? JSON.parse(readFileSync(output, "utf8")) : null;
    const planned = expandSweep(config).map((params, i) => ({ id: `147-${slug}-c${String(i + 1).padStart(2, "0")}`, params }));
    const manifest = {
      slug, methodVersion: "cellular-persistence-v1", grid: { width: 128, height: 128 },
      warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
      candidates: planned, references: config.references, fixedParams: config.baseParams, sampleSteps: times,
      coverageThreshold: config.coverageThreshold, counts: { novel: 48, refinements: 0 },
      priorCoverage: [{ source: `docs/sweeps/${slug}-interestingness.md`, description: CELLULAR_PRIOR[slug] },
        { source: "e2e/harness/sims.ts", description: "Historical serialized configs unchanged. New artifact IDs only. All candidate values explicitly expanded in this manifest." },
        { source: "src/app/presets.ts", description: "All three shipped presets retained as separate 147-current-* references, with implicit defaults made explicit (Life spark0.1/ageShadingtrue, Cyclic seed0/stepsPerFrame1). Brian Sparse/Storm dying0.9; Crystal threshold1." },
        { source: `src/sims/${slug}/kernel.ts`, description: slug === "cyclic-ca" ? "mulberry32 initial random state depends on grid, states and explicit seed. Validation seeds0/1/2." : "Coordinate-hashed deterministic initial field; no supported seed parameter. Life sparks are deterministic functions of coordinates and generation, not Math.random. No invented seed replications." }],
      command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 147 " --workers=1',
      inclusion: "Complete 48-set declared interaction grid, novel full tuples relative to cited grids; no refinement or adaptive truncation.",
      exclusion: "No dyingValue, Life age shading/density, Cyclic speed, broad slider search or production changes. Ranking is a shortlist, not aesthetic superiority.",
      method: "Unchanged scoreFrames, arithmetic mean over200/500/1000. Existing multiLagSpatialAutocorrelation[1,2,3,4,6,8] reported separately, never changes composite. Persistence judged from separated frames, firing coverage, flux and longer horizon, not a new class metric.",
      validationPlan: { finalists: 1, selection: "Highest mean score, retained even if rejected", sizes: [128, 384], steps: [200, 500, 1000, 2000], seeds: slug === "cyclic-ca" ? [0, 1, 2] : [null], replayTolerance: 1e-9 },
      rawEncoding: "base64 zlib little-endian Float32; A at steps, B at steps+fluxGap; lossless before PNG quantisation",
      clipping: "Periodic lattice, no projected/off-frame objects: offFrameClippingFraction0 by geometry; endpoints are legitimate discrete states, not floating-point saturation.",
      presentation: "Grayscale kernel PNGs explicitly labelled field. Actual app Renderer WebGL2 snapshots at384sq, same primary channel/default colours, bloom0, exact declared steps; equal settings for finalist and references.",
      sourceHashes: Object.fromEntries(["src/app/presets.ts", `src/sims/${slug}/kernel.ts`, "e2e/harness/metrics.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
    };
    expect(planned).toHaveLength(48);
    expect(new Set(planned.map(c => JSON.stringify(c.params))).size).toBe(48);
    expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(51);
    writeText(`${CELLULAR_ROOT}/manifest-${slug}.json`, JSON.stringify(manifest, null, 2));
    const started = Date.now();
    const pilot = await cellularCapture(page, config, planned[0].params, 128, times);
    const pilotMs = Date.now() - started;
    const estimatedMs = pilotMs * 51;
    writeText(`${CELLULAR_ROOT}/pilot-${slug}.json`, JSON.stringify({ pilotMs, estimatedMs, budgetMs: 3_600_000, params: planned[0].params, metrics: cellularSummary(pilot) }, null, 2));
    expect(estimatedMs, "Pilot cannot fit declared grid; split/re-brief required").toBeLessThan(2_400_000);
    if (process.env.SWEEP_147_PILOT === "1") {
      const render = await rdRender(page, config, planned[0].params, 200, `${ARTIFACT_ROOT}/${config.artifactId}/pilot-renderer.png`);
      expect(render.grid).toEqual([384, 384]);
      console.log(`${slug}: pilot ${pilotMs}ms, ranking estimate ${estimatedMs}ms`); return;
    }
    const raw: any[] = [], candidates: ScoredCandidate[] = [], references: ScoredCandidate[] = [];
    for (const [i, c] of [...planned, ...config.references].entries()) {
      const samples = await cellularCapture(page, config, c.params, 128, times);
      const scored = { ...c, label: "label" in c ? c.label as string : c.id, metrics: cellularSummary(samples), methodVersion: manifest.methodVersion };
      (i < 48 ? candidates : references).push(scored); raw.push({ id: c.id, params: c.params, samples });
      if ((i + 1) % 12 === 0) console.log(`${slug}: measured ${i + 1}/51`);
    }
    const ranked = candidates.sort((a, b) => b.metrics.score - a.metrics.score), finalist = ranked[0];
    if (previous) {
      expect(ranked.map(c => c.id)).toEqual(previous.ranked.map(c => c.id));
      expect(manifest.sourceHashes).toEqual(previous.manifest.sourceHashes);
      for (const c of [...ranked, ...references]) expect(cellularDelta(c.metrics, [...previous.ranked, ...previous.references].find(r => r.id === c.id).metrics)).toBeLessThanOrEqual(1e-9);
    }
    writeText(`${CELLULAR_ROOT}/${slug}-raw.json`, JSON.stringify({ encoding: manifest.rawEncoding, rows: raw }));
    writeText(`${ARTIFACT_ROOT}/${config.artifactId}/report.md`, metricsTable(ranked, config.axes.map(a => a.key)));
    const sheet = new Float32Array(1024 * 768);
    for (let i = 0; i < 48; i += 1) {
      const field = rdDecode(raw[i].samples[0].frameA);
      for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) sheet[(Math.floor(i / 8) * 128 + y) * 1024 + i % 8 * 128 + x] = field[y * 128 + x];
    }
    writePng(`${RD_IMAGES}/147-${slug}-census.png`, sheet, 1024, 768, 1);
    const validation: any[] = [], replay: any[] = [], paths: Record<string, string[]> = {};
    const priorValidation = previous ? JSON.parse(readFileSync(previous.validation, "utf8")) : [];
    for (const c of [finalist, ...references]) {
      const fresh = await cellularCapture(page, config, c.params, 128, times);
      const delta = cellularDelta(cellularSummary(fresh), c.metrics);
      expect(delta).toBeLessThanOrEqual(1e-9); replay.push({ id: c.id, maxAbsoluteDelta: delta });
      const readings: any[] = [], rendered: any[] = [], images: string[] = [];
      for (const size of manifest.validationPlan.sizes) for (const seed of manifest.validationPlan.seeds) {
        const params = seed === null ? c.params : { ...c.params, seed };
        const samples = await cellularCapture(page, config, params, size, manifest.validationPlan.steps);
        for (const sample of samples) {
          const path = `${RD_IMAGES}/${c.id}-field-${size}-seed${seed ?? "none"}-t${sample.steps}.png`;
          writePng(path, rdDecode(sample.frameA), size, size, 1); images.push(path);
          readings.push({ ...sample, params, image: path });
          if (previous) {
            const old = priorValidation.find(v => v.id === c.id)?.readings.find(r => r.size === size && r.steps === sample.steps && r.params.seed === params.seed);
            expect(old).toBeTruthy(); expect(cellularDelta(sample.metrics, old.metrics)).toBeLessThanOrEqual(1e-9);
            expect(sample.diagnostics).toEqual(old.diagnostics);
          }
          if (size === 384 && (seed === null || seed === 0)) {
            const path = `${RD_IMAGES}/${c.id}-renderer-t${sample.steps}.png`;
            const info = await rdRender(page, config, params, sample.steps, path);
            expect(info.grid).toEqual([size, size]);
            expect(rdDecode(info.field)).toEqual(rdDecode(sample.frameA));
            rendered.push({ steps: sample.steps, image: path, ...info, field: undefined }); images.push(path);
          }
        }
      }
      paths[c.id] = images; validation.push({ id: c.id, readings, rendered });
      writeText(`${CELLULAR_ROOT}/${slug}-validation.json`, JSON.stringify(validation));
      console.log(`${slug}: validated ${c.id}, exact replay delta ${delta}`);
    }
    writeText(output, JSON.stringify({ manifest, ranked, references,
      finalists: [{ id: finalist.id, images: paths[finalist.id], referenceIds: references.map(c => c.id), recommendation: "Evidence selection; no promotion without visual sign-off" }],
      referenceImages: Object.fromEntries(references.map(c => [c.id, paths[c.id]])),
      rawFields: `${CELLULAR_ROOT}/${slug}-raw.json`, validation: `${CELLULAR_ROOT}/${slug}-validation.json`, replay,
      elapsedMs: Date.now() - started, runtime: { browser: page.context().browser()?.version(), node: process.version, platform: process.platform } }, null, 2));
    console.log(`${slug}: complete 48 candidates, 3 references, finalist ${finalist.id}`);
  });
}

const cellularReplayTest = process.env.SWEEP_REPLAY === "147" ? test : test.skip;
cellularReplayTest("147 retained fields reproduce every metric and rank", async ({ page }) => {
  test.setTimeout(120_000);
  const summary: any[] = [];
  for (const slug of CELLULAR_SLUGS) {
    const result = JSON.parse(readFileSync(`${CELLULAR_ROOT}/${slug}.json`, "utf8"));
    const raw = JSON.parse(readFileSync(result.rawFields, "utf8"));
    const validation = JSON.parse(readFileSync(result.validation, "utf8"));
    const config = SWEEP_CONFIGS[`sweep-147-${slug}`];
    expect(raw.rows.map(c => c.id)).toEqual([...result.manifest.candidates, ...result.references].map(c => c.id));
    const shipped = await page.evaluate(async slug => (await import(/* @vite-ignore */ "/src/app/presets.ts")).presetsFor(slug), slug);
    expect(result.references).toHaveLength(shipped.length);
    for (const preset of shipped) {
      const ref = result.references.find(c => c.id === `147-current-${preset.id}`);
      expect(ref).toBeTruthy();
      expect(ref.params).toEqual({ ...preset.params,
        ...(slug === "cyclic-ca" ? { seed: 0, stepsPerFrame: 1 } : slug === "game-of-life" ? { sparkRate: 0.1, ageShading: true } : {}) });
    }
    let maxAbsoluteDelta = 0;
    const recompute = (s: any) => {
      const a = rdDecode(s.frameA), b = rdDecode(s.frameB);
      expect(rdDiagnostics(a)).toEqual(s.diagnostics.frameA); expect(rdDiagnostics(b)).toEqual(s.diagnostics.frameB);
      const metrics = { ...scoreFrames(a, b, s.size, s.size, config.coverageThreshold), multiLagStructure: multiLagSpatialAutocorrelation(a, s.size, s.size) };
      const delta = cellularDelta(metrics, s.metrics); maxAbsoluteDelta = Math.max(maxAbsoluteDelta, delta);
      expect(delta).toBeLessThanOrEqual(1e-9); return { metrics };
    };
    const computed = raw.rows.map(c => ({ id: c.id, metrics: cellularSummary(c.samples.map(recompute)) }));
    for (const c of [...result.ranked, ...result.references]) expect(cellularDelta(computed.find(r => r.id === c.id).metrics, c.metrics)).toBeLessThanOrEqual(1e-9);
    expect(computed.slice(0, 48).sort((a, b) => b.metrics.score - a.metrics.score).map(c => c.id)).toEqual(result.ranked.map(c => c.id));
    for (const row of validation) row.readings.forEach(recompute);
    summary.push({ slug, ranked: result.ranked.length, references: result.references.length,
      validationReadings: validation.reduce((n, v) => n + v.readings.length, 0), maxAbsoluteDelta,
      identicalOrdering: true, shippedReferenceMatch: true });
  }
  writeText(`${CELLULAR_ROOT}/raw-recomputation.json`, JSON.stringify({ tolerance: 1e-9, summary }, null, 2));
  console.log(JSON.stringify(summary));
});
// Stage 146: growth and criticality regimes the 2026-08 sweeps missed.
const GC_ROOT = "docs/sweeps/data/2026-10-30/146";
const GC_SLUGS = ["abelian-sandpile", "diffusion-limited-aggregation", "ising-model"] as const;
const GC_SHORT: Record<string, string> = { "abelian-sandpile": "sandpile", "diffusion-limited-aggregation": "dla", "ising-model": "ising" };
const GC_METRICS = ["entropy", "variance", "spatialAutocorrelation", "coverage", "temporalFlux", "score"] as const;

const GC_PRIOR: Record<string, { source: string; description: string }[]> = {
  "abelian-sandpile": [
    { source: "docs/sweeps/abelian-sandpile-interestingness.md", description: "Old grid: initialPile {25000,60000,120000,250000} x toppleThreshold {4,5,6,8} x grainsPerStep {1,32}, topplesPerStep pinned at 120000, 256x256, 200 warmup steps, flux gap 4; 32 sets plus 3 references; re-swept 2026-08-25 after the conservation fix. topplesPerStep was never varied and influx stopped at 32 grains/step." },
    { source: "e2e/harness/sims.ts", description: "Historical config ABELIAN_SANDPILE preserved unchanged. References: classic-critical (100000,4,1,50000), fast-avalanches (250000,4,16,150000), high-threshold (350000,8,8,120000). New sets: initialPile 30000, threshold 4, grainsPerStep {3,8,20,50,120,250} x topplesPerStep {600,2000,5000,12000,25000,250000,700000,2000000}: no topplesPerStep value and no (pile, grains) pair repeats an old tuple." },
    { source: "src/sims/abelian-sandpile/kernel.ts", description: "Schema: grainsPerStep 0..1000, topplesPerStep 1..2000000, initialPile 0..16000000, toppleThreshold 2..12. The topple budget bounds cell relaxations per step, so a low budget against high influx leaves a standing backlog (transient state); a high budget relaxes within the step." },
    { source: "src/app/presets.ts", description: "Current shipped presets equal the three historical references; they are re-measured as new 146-current-* rows, historical rows untouched." },
  ],
  "diffusion-limited-aggregation": [
    { source: "docs/sweeps/diffusion-limited-aggregation-interestingness.md", description: "Old grid: stickiness {0.15,0.3,0.5,0.75,1} x spawnRadius {0.03,0.06,0.12} x seedCount {1,4,12}, walkersPerStep 64, maxWalkSteps 400, seed 7, 192x192, 500 warmup steps. Every set had finished growing, so flux was exactly 0 and the ranking read the finished cluster only. spawnRadius 0.03 is clamped to the kernel minimum 0.05." },
    { source: "e2e/harness/sims.ts", description: "Historical config DIFFUSION_LIMITED_AGGREGATION preserved unchanged. References: branching (stick 1, spawn 0.06, seeds 1), dense-coral (0.15, 0.06, 4), multi-seed (0.8, 0.06, 8). New sets: stickiness {0.04,0.08,0.22,0.4,0.62,0.9} x spawnRadius {0.08,0.16,0.26,0.5} x seedCount {2,6}; no value repeats an old axis value, and each set is read at fixed occupied-cell milestones 1000, 2500, 4500 (every candidate's finished cluster is larger than 5000 cells; edge stop is at 0.92 of the grid radius) rather than after a terminal-state warmup." },
    { source: "src/sims/diffusion-limited-aggregation/kernel.ts", description: "spawnRadius 0.05..0.5 sets only the ring gap: clamp(round(min(w,h)*spawnRadius*0.25), 2, 16) cells, so 0.08->4, 0.16->8, 0.26->12, 0.5->16 cells (saturated from 0.33). Kernel stops feeding at 0.92 of the grid radius (isComplete). Walkers die after maxWalkSteps or leaving the kill ring." },
    { source: "src/app/presets.ts", description: "Current shipped presets equal the three historical references with seed 7 added for determinism; re-measured as new 146-current-* rows." },
  ],
  "ising-model": [
    { source: "docs/sweeps/ising-model-interestingness.md", description: "Old grids: temperature linspace(0.8,4,8) x coupling {0.6,0.8,1,1.4} at field 0, random initial state only (32 sets, T/J sampled at ~1.33, 2.14, 2.85 around the critical 2.269); external field sweep 0.003-0.2 at coupling 1, T {1.8,2.1,2.4}, positive field only. initialState, sweepsPerStep and the 1.9-2.7 T/J window were not searched at fine resolution." },
    { source: "e2e/harness/sims.ts", description: "Historical config ISING_MODEL preserved unchanged. References: critical (2.269,1), cold-quench (0.7,1), hot-noise (4.5,1), field-sweep (1.8,1,h0.02). New sets: 16 T/J ratios {1.4,1.7,1.9,2.0,2.1,2.2,2.25,2.3,2.35,2.4,2.5,2.6,2.7,2.85,3.0,3.3} each paired with one coupling from {0.6,1.4,0.9,1.5} (T = ratio x coupling) and each at initialState random, up, checkerboard; field 0, sweepsPerStep 0.5, seed 7. 11 ratios lie in 2.0-2.7." },
    { source: "src/sims/ising-model/kernel.ts", description: "Metropolis acceptance exp(-dE/T) with dE = 2 s (J sum + h): at h = 0 the dynamics depend only on T/J, so coupling is a rescaling and T/J is the physical axis; pairing keeps every (T,J) distinct. Negative-field and initialState down counterparts are spin-flip symmetry controls, not new regimes: one is run explicitly and reported." },
    { source: "src/app/presets.ts", description: "Current shipped presets equal the four historical references with seed 7 pinned; re-measured as new 146-current-* rows." },
  ],
};

async function gcCapture(page: Page, config: SimSweepConfig, params: Params, size: number,
  opts: { sampleSteps?: number[]; milestones?: number[]; stepCap?: number } = {}) {
  const gc = config.growthCriticality!;
  const timing = opts.sampleSteps || opts.milestones ? opts : { sampleSteps: gc.sampleSteps, milestones: gc.milestones, stepCap: gc.stepCap };
  const result = await page.evaluate(driveKernelDiagnostic, {
    registryUrl: REGISTRY_URL, slug: config.slug, params, gridWidth: size, gridHeight: size,
    fluxGap: config.fluxGap, primaryChannel: config.primaryChannel, dt: config.dt,
    ...timing,
  });
  return result.snapshots.map((s: DiagnosticSnapshot) => ({
    steps: s.steps, target: s.target, diagnostics: s.diagnostics, frameA: s.frameA,
    metrics: scoreFrames(s.frameA, s.frameB, result.width, result.height, config.coverageThreshold),
  }));
}

function gcScore(id: string, label: string, params: Params, samples: Awaited<ReturnType<typeof gcCapture>>, methodVersion: string): ScoredCandidate {
  const keys = Object.keys(samples[0].diagnostics);
  const diagnostics = Object.fromEntries(keys.map(k => [k, samples.reduce((sum, s) => sum + s.diagnostics[k], 0) / samples.length]));
  const metrics = { ...summarizeMetrics(samples.map(s => s.metrics)), diagnostics } as unknown as InterestingnessMetrics;
  return { id, label, params, metrics, methodVersion };
}

function gcStrip(row: ScoredCandidate, samples: Awaited<ReturnType<typeof gcCapture>>) {
  return { id: row.id, params: row.params, samples: samples.map(s => ({ steps: s.steps, target: s.target, metrics: s.metrics, diagnostics: s.diagnostics })) };
}

for (const slug of GC_SLUGS) {
  sweepTest(`sweep 146 ${slug} missed regimes`, async ({ page }) => {
    test.setTimeout(3_600_000);
    const config = SWEEP_CONFIGS[`sweep-146-${slug}`];
    const gc = config.growthCriticality!;
    const short = GC_SHORT[slug];
    const planned = expandSweep(config).map((params, i) => ({ id: `146-${short}-c${String(i + 1).padStart(2, "0")}`, params }));
    const sampleKey = gc.sampleSteps ?? gc.milestones!;
    const manifest = {
      slug, methodVersion: gc.methodVersion,
      grid: { width: config.gridWidth, height: config.gridHeight }, warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
      command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 146 " --workers=1',
      candidates: planned, references: config.references, fixedParams: config.baseParams,
      capture: gc.sampleSteps ? { mode: "fixed-steps", sampleSteps: gc.sampleSteps } : { mode: "occupied-cell-milestones", milestones: gc.milestones, stepCap: gc.stepCap },
      priorCoverage: GC_PRIOR[slug],
      candidateCounts: { novel: planned.length, refinements: 0 },
      inclusion: "Exact full parameter tuples in declaration order; every candidate is retained and ranked, including pathological ones. Reference rows are separate 146-current-* IDs.",
      exclusion: "No repeat of the historical grid, no production change, no promotion. The 16-refinement allowance was not used.",
      determinism: slug === "abelian-sandpile" ? "Fully deterministic; no random source." : "Explicit seed parameter; fresh kernel per measurement; xorshift/hash driven. Finalists and references repeat at seeds 7, 11, 23.",
      method: "Mean of unchanged scoreFrames metrics over the declared captures via summarizeMetrics, with population spread. Diagnostics (non-finite, endpoint fraction, and per-kernel growth/avalanche/domain readings) are retained beside the metrics and never feed score. Scores shortlist; they do not decide aesthetics.",
      validationPlan: { finalists: "Top three by mean score among candidates with distinct measurements, kept as evidence even when rejected", sizes: [config.gridWidth, ...gc.validationSizes], longHorizon: gc.longHorizon, seeds: gc.seeds ?? null, replayTolerance: 1e-9 },
      sourceHashes: Object.fromEntries(["src/app/presets.ts", `src/sims/${slug}/kernel.ts`, "e2e/harness/metrics.ts", "e2e/harness/driver.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
    };
    expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(planned.length + config.references.length);
    writeText(`${GC_ROOT}/manifest-${slug}.json`, JSON.stringify(manifest, null, 2));

    const started = Date.now();
    const pilot = await gcCapture(page, config, planned[0].params, config.gridWidth);
    const pilotMs = Date.now() - started;
    const projectedMs = pilotMs * (planned.length + config.references.length);
    writeText(`${GC_ROOT}/pilot-${slug}.json`, JSON.stringify({ pilotMs, projectedMs, allowanceMs: 3_600_000, params: planned[0].params, steps: pilot.map(s => s.steps) }, null, 2));
    expect(projectedMs, "Pilot cannot fit declared grid: split/re-brief required").toBeLessThan(3_000_000);

    const candidates: ScoredCandidate[] = [], references: ScoredCandidate[] = [], readings: object[] = [];
    for (const [i, row] of [...planned, ...config.references].entries()) {
      const samples = await gcCapture(page, config, row.params, config.gridWidth);
      const scored = gcScore(row.id, "label" in row ? row.label as string : row.id, row.params, samples, gc.methodVersion);
      (i < planned.length ? candidates : references).push(scored);
      readings.push(gcStrip(scored, samples));
      if ((i + 1) % 12 === 0) console.log(`${slug}: measured ${i + 1}/${planned.length + config.references.length}`);
    }
    const ranked = [...candidates].sort((a, b) => b.metrics.score - a.metrics.score);
    writeText(`${ARTIFACT_ROOT}/${config.artifactId}/report.md`, metricsTable(ranked, config.axes.map(a => a.key)));
    writeText(`${GC_ROOT}/${slug}-ranking.json`, JSON.stringify({ manifest, ranked, references, readings }, null, 2));
    console.log(`${slug}: ranked ${ranked.length}, projected ${projectedMs}ms, actual ${Date.now() - started}ms, top ${ranked[0].id} ${ranked[0].metrics.score.toFixed(4)}`);
    if (process.env.SWEEP_146_RANKING_ONLY === "1") return;

    const scale = (size: number) => Math.max(1, Math.round(384 / size));
    // Candidates whose measurements are bit-identical to an earlier finalist (saturated topple budgets)
    // are the same observation, so the finalist slot goes to the next distinct reading.
    const signature = (c: ScoredCandidate) => GC_METRICS.map(k => (c.metrics as any)[k]).join("|");
    const finalists = ranked.filter((c, i) => ranked.findIndex(o => signature(o) === signature(c)) === i).slice(0, 3);
    const validation: object[] = [], replay: object[] = [], images = new Map<string, string[]>();
    let symmetryControl: object | undefined;
    for (const row of [...finalists, ...references]) {
      const rowImages: string[] = [];
      const again = await gcCapture(page, config, row.params, config.gridWidth);
      const delta = Math.max(...again.flatMap((s, i) => GC_METRICS.map(k => Math.abs((s.metrics as any)[k] - (readings.find((r: any) => r.id === row.id) as any).samples[i].metrics[k]))));
      expect(delta, row.id).toBeLessThanOrEqual(1e-9);
      replay.push({ id: row.id, maxAbsoluteDelta: delta });
      const note = (kind: string, size: number, seed: number | null, samples: typeof again, mid: number) => {
        const path = `${RD_IMAGES}/${row.id}-field-${size}-seed${seed ?? "none"}-${kind}-t${samples[mid].steps}.png`;
        writePng(path, samples[mid].frameA, size, size, scale(size)); rowImages.push(path); return path;
      };
      const entry: any = { id: row.id, readings: [] };
      for (const [i, s] of again.entries()) {
        entry.readings.push({ kind: "time-strip", size: config.gridWidth, seed: row.params.seed ?? null, steps: s.steps, target: s.target, metrics: s.metrics, diagnostics: s.diagnostics, image: note("strip", config.gridWidth, null, again, i) });
      }
      for (const size of gc.validationSizes) {
        const bigger = await gcCapture(page, config, row.params, size);
        entry.readings.push({ kind: "finite-size", size, steps: bigger[1].steps, metrics: bigger.map(s => s.metrics), diagnostics: bigger.map(s => s.diagnostics), image: note("size", size, null, bigger, 1) });
      }
      const long = await gcCapture(page, config, row.params, config.gridWidth, gc.sampleSteps
        ? { sampleSteps: [gc.longHorizon] } : { milestones: [gc.longHorizon], stepCap: gc.longHorizon });
      entry.readings.push({ kind: "long-horizon", size: config.gridWidth, steps: long[0].steps, target: long[0].target, metrics: long[0].metrics, diagnostics: long[0].diagnostics, image: note("long", config.gridWidth, null, long, 0) });
      for (const seed of (gc.seeds ?? []).filter(s => s !== row.params.seed)) {
        const seeded = await gcCapture(page, config, { ...row.params, seed }, config.gridWidth);
        entry.readings.push({ kind: "seed", size: config.gridWidth, seed, metrics: seeded.map(s => s.metrics), diagnostics: seeded.map(s => s.diagnostics), meanScore: seeded.reduce((sum, s) => sum + s.metrics.score, 0) / seeded.length, image: note("seed", config.gridWidth, seed, seeded, 1) });
      }
      const midSteps = again[1].steps;
      const rendered = await rdRender(page, config, row.params, midSteps, `${RD_IMAGES}/${row.id}-renderer-t${midSteps}.png`);
      rowImages.push(`${RD_IMAGES}/${row.id}-renderer-t${midSteps}.png`);
      entry.rendered = { steps: midSteps, image: rowImages[rowImages.length - 1], grid: rendered.grid, canvas: rendered.canvas, renderer: rendered.renderer,
        note: "Actual app WebGL2 Renderer screenshot at performance resolution; the renderer grid differs from the sweep grid, so this is an app-scale view at equal step count, not an equal-growth or equal-size numeric replay." };
      images.set(row.id, rowImages);
      validation.push(entry);
      console.log(`${slug}: validated ${row.id}, replay delta ${delta}`);
    }
    if (slug === "ising-model") {
      const up = ranked.find(r => r.params.initialState === "up")!;
      const a = await gcCapture(page, config, up.params, config.gridWidth, { sampleSteps: [gc.sampleSteps![1]] });
      const b = await gcCapture(page, config, { ...up.params, initialState: "down" }, config.gridWidth, { sampleSteps: [gc.sampleSteps![1]] });
      const mismatched = a[0].frameA.filter((v, i) => v !== 1 - b[0].frameA[i]).length;
      symmetryControl = { id: up.id, flippedInitialState: "down", steps: gc.sampleSteps![1], mismatchedCells: mismatched, exactComplement: mismatched === 0 };
    }
    writeText(`${GC_ROOT}/${slug}-validation.json`, JSON.stringify(validation));
    writeText(`${GC_ROOT}/${slug}.json`, JSON.stringify({ manifest, ranked, references,
      finalists: finalists.map(f => ({ id: f.id, images: images.get(f.id), referenceIds: references.map(r => r.id) })),
      referenceImages: Object.fromEntries(references.map(r => [r.id, images.get(r.id)])),
      replay, replayTolerance: 1e-9, validation: `${GC_ROOT}/${slug}-validation.json`, readings, symmetryControl, elapsedMs: Date.now() - started,
      runtime: { browser: page.context().browser()?.version(), node: process.version, platform: process.platform } }, null, 2));
    console.log(`${slug}: complete ${ranked.length} candidates, ${references.length} references, finalists ${finalists.map(f => f.id).join(",")}`);
  });
}

test("146 sandpile loss diagnostic balances each row's own initial pile", async ({ page }) => {
  await page.goto("/");
  const SIZE = 128, STEPS = 250;
  const rows: Array<{ params: Record<string, number>; expected?: number }> = [
    { params: { initialPile: 100000, toppleThreshold: 4, grainsPerStep: 1, topplesPerStep: 50000 }, expected: 0.13855361596009974 },
    { params: { initialPile: 250000, toppleThreshold: 4, grainsPerStep: 16, topplesPerStep: 150000 }, expected: 0.6230078740157481 },
    { params: { initialPile: 350000, toppleThreshold: 8, grainsPerStep: 8, topplesPerStep: 120000 }, expected: 0.5125170454545455 },
    { params: { initialPile: 30000, toppleThreshold: 4, grainsPerStep: 50, topplesPerStep: 8000 } },
  ];
  for (const { params, expected } of rows) {
    const driven = await page.evaluate(driveKernelDiagnostic, {
      registryUrl: REGISTRY_URL, slug: "abelian-sandpile", params, gridWidth: SIZE, gridHeight: SIZE,
      fluxGap: 4, primaryChannel: 0, dt: 1, sampleSteps: [STEPS],
    });
    const reported = driven.snapshots[0].diagnostics.lostGrainFraction;
    // Independent ledger: a separate kernel run, inventory taken from the row's own initialPile.
    const ledger = await page.evaluate(async ({ registryUrl, params, size, steps }) => {
      const reg: any = await import(/* @vite-ignore */ registryUrl);
      const kernel = await reg.REGISTRY.find((e: any) => e.slug === "abelian-sandpile").load();
      kernel.init(size, size, params);
      for (let i = 0; i < steps; i += 1) kernel.step(1);
      let total = 0;
      for (const g of kernel.grains as Float32Array) total += g;
      return { total };
    }, { registryUrl: REGISTRY_URL, params, size: SIZE, steps: STEPS });
    const injected = params.initialPile + params.grainsPerStep * STEPS;
    const loss = (injected - ledger.total) / injected;
    expect(loss, "grains cannot be created").toBeGreaterThanOrEqual(0);
    expect(Math.abs(reported - loss)).toBeLessThan(1e-9);
    if (expected !== undefined) expect(Math.abs(reported - expected)).toBeLessThan(1e-9);
  }
});

// ---------------------------------------------------------------------------
// Stage 148: Clifford / De Jong / Svensson c/d interactions around a/b anchors.
// ---------------------------------------------------------------------------
const ATTR_ROOT = "docs/sweeps/data/2026-10-30/148";
const ATTR_IMAGES = "docs/images/sweeps-2026-10-30";
const ATTR_VARIANTS = ["clifford", "dejong", "svensson"] as const;
/** Evidence selections per variant, chosen from the census sheet after the first
 * (finalist-free) pass. Empty keeps the pass census-only. */
const ATTR_FINALISTS: Record<(typeof ATTR_VARIANTS)[number], string[]> = {
  clifford: ["148-clifford-c12", "148-clifford-c34", "148-clifford-c43"],
  dejong: ["148-dejong-c13", "148-dejong-c43", "148-dejong-c03"],
  svensson: ["148-svensson-c29", "148-svensson-c16", "148-svensson-c07"],
};
/** Separated snapshots for the time strip; the last is the longer-horizon repeat. */
const ATTR_STEPS = [260, 560, 1260];
const ATTR_DRIFT = 0.3;
const ATTR_RENDER_SIZE = 384;

function attrDiagnostics(field: ArrayLike<number>, variant: string, params: Params) {
  const n = field.length;
  let bad = 0, lower = 0, upper = 0, support = 0;
  for (let i = 0; i < n; i += 1) {
    const v = field[i];
    if (!Number.isFinite(v)) { bad += 1; continue; }
    if (v <= 0) lower += 1;
    if (v >= 1) upper += 1;
    if (v > 0.04) support += 1;
  }
  // Off-frame clipping: iterate the map with the kernel's own analytic bounds
  // and count points that land outside the framed half-extents.
  const spec = MAP_SPECS[variant as keyof typeof MAP_SPECS];
  const [bx, by] = spec.bounds(Number(params.a), Number(params.b), Number(params.c), Number(params.d));
  let x = 0.1, y = 0.1, outside = 0;
  const samples = 20000;
  for (let i = 0; i < 100 + samples; i += 1) {
    [x, y] = spec.apply(x, y, Number(params.a), Number(params.b), Number(params.c), Number(params.d));
    if (i >= 100 && (Math.abs(x) > bx * 1.04 || Math.abs(y) > by * 1.04)) outside += 1;
  }
  return { nonFiniteFraction: bad / n, lowerEndpointFraction: lower / n, upperEndpointFraction: upper / n,
    supportFractionAbove004: support / n, offFrameClippingFraction: outside / samples };
}

async function attrDrive(page: Page, config: SimSweepConfig, params: Params, size: number, times: number[]) {
  return page.evaluate(driveKernel, { registryUrl: REGISTRY_URL, slug: config.slug, params, gridWidth: size, gridHeight: size,
    warmupSteps: times[0], sampleSteps: times, fluxGap: config.fluxGap, primaryChannel: config.primaryChannel, dt: config.dt, preserveRange: true });
}

async function attrRenderer(page: Page, params: Params, warmup: number, path: string) {
  await page.setViewportSize({ width: ATTR_RENDER_SIZE, height: ATTR_RENDER_SIZE });
  const info = await page.evaluate(async ({ params, warmup, size }) => {
    const load = (u: string) => import(/* @vite-ignore */ u);
    const [{ Renderer }, { CliffordDeJongKernel }, { defaultColourOptionsFor }, { qualityProfileFor }, { getRenderMode }] = await Promise.all([
      load("/src/app/renderer.ts"), load("/src/sims/clifford-dejong/kernel.ts"), load("/src/app/colormap.ts"), load("/src/app/qualityProfiles.ts"), load("/src/app/renderModes.ts")]);
    document.body.innerHTML = "";
    const canvas = document.createElement("canvas"); canvas.id = "attractor-evidence";
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px`; document.body.appendChild(canvas);
    class Snapshot extends CliffordDeJongKernel {
      init(w: number, h: number, p: Params) { super.init(w, h, p); for (let i = 0; i < warmup; i += 1) super.step(1); }
    }
    const kernel = new Snapshot(), mode = getRenderMode("clifford-dejong");
    const profile = qualityProfileFor("clifford-dejong", mode, "desktop");
    const colourOptions = defaultColourOptionsFor("clifford-dejong", 1);
    const r = new Renderer({ canvas, kernel, params, stepsPerFrame: 0, colourOptions,
      displayOptions: { dotSize: 1, trailFade: 0, bloom: 0 }, renderMode: mode, resolution: profile.defaultPreset, qualityProfile: profile });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    (window as any).__attractorRenderer = r;
    return { canvas: [canvas.width, canvas.height], renderer: canvas.dataset.renderer };
  }, { params, warmup, size: ATTR_RENDER_SIZE });
  expect(info.renderer).toBe("webgl2");
  await page.locator("#attractor-evidence").screenshot({ path });
  await page.evaluate(() => (window as any).__attractorRenderer.destroy());
  return info;
}

const ATTR_PRE_PATH = `${ATTR_ROOT}/premeasurement-manifest.json`;
const ATTR_FINE_PASS_ANCHORS: Record<string, [number, number]> = { clifford: [-1.8, -2.4], dejong: [1.4, -2.8], svensson: [-2.2, -2.2] };
const sha256File = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

function attrPlanned(variant: string) {
  const config = SWEEP_CONFIGS[`sweep-148-clifford-dejong-${variant}`];
  return { config, planned: expandSweep(config).map((params, i) => ({ id: `148-${variant}-c${String(i + 1).padStart(2, "0")}`, params })) };
}

/** Which planned sets sit on a historical a/b grid point with the historical pinned c/d (Svensson: d from its axis). */
function attrHistoricalOverlap(variant: string) {
  const { planned } = attrPlanned(variant);
  const old = SWEEP_CONFIGS[`clifford-dejong-${variant}`];
  const grid = (key: string) => old.axes.find(a => a.key === key)?.values ?? [];
  const near = (v: number, list: number[]) => list.some(x => Math.abs(x - v) < 1e-9);
  const pinned = old.baseParams;
  const onGrid = planned.filter(({ params: p }) => {
    const dOk = variant === "svensson" ? near(Number(p.d), grid("d")) : Number(p.d) === Number(pinned.d);
    return near(Number(p.a), grid("a")) && near(Number(p.b), grid("b")) && Number(p.c) === Number(pinned.c) && dOk;
  }).map(c => c.id);
  const [fa, fb] = ATTR_FINE_PASS_ANCHORS[variant];
  const atFineAnchor = planned.filter(({ params: p }) => Math.abs(Number(p.a) - fa) < 1e-9 && Math.abs(Number(p.b) - fb) < 1e-9).map(c => c.id);
  return { onHistoricalGridWithPinnedCd: onGrid, atHistoricalFinePassAnchor: atFineAnchor, fineAnchor: { a: fa, b: fb } };
}

function attrPreManifest() {
  const sources = ["src/app/presets.ts", "src/sims/clifford-dejong/kernel.ts", "e2e/harness/driver.ts", "e2e/harness/metrics.ts", "docs/sweeps/clifford-dejong-interestingness.md"];
  return {
    stage: "148-attractor-coefficient-interactions", authoredBefore: "repaired measurement run (re-brief 1, 2026-11-01)",
    note: "Written to disk by `sweep 148 pre-measurement manifest` before any 148 candidate or reference is measured. Supersedes nothing: the attempt-1 manifest embedded in the result JSON was written after measurement and is archived under archive-attempt-1/.",
    methodVersion: ATTRACTOR_148_METHOD,
    sourceHashes: Object.fromEntries(sources.map(p => [p, sha256File(p)])),
    historicalFinePass: {
      source: "docs/sweeps/clifford-dejong-interestingness.md",
      description: "The 2026-08-16 write-up records a second 'fine c/d' pass at each map's pass-1 winner: Clifford (-1.8,-2.4), De Jong (1.4,-2.8), Svensson (-2.2,-2.2). The c/d values and step sizes of that pass are not recorded in the write-up, e2e/harness/sims.ts or the commit that added them (46638d257). Only its outcomes are known: Clifford veils c -1.0 d 1.0, De Jong swan c 2.8 d -1.87, De Jong heart c 2.4 d -2.1, Svensson pass-2 winner c 0.9 d 1.5 (not promoted).",
      gap: "Exact fine-pass bounds cannot be reconstructed, so novelty at the three fine-pass a/b anchors is unproven. Candidate rows at those anchors (listed per variant) are reported as possible overlap, not as novel. Bounds are not fabricated.",
    },
    variants: ATTR_VARIANTS.map(variant => {
      const { config, planned } = attrPlanned(variant);
      const historical = SWEEP_CONFIGS[`clifford-dejong-${variant}`];
      return {
        slug: `clifford-dejong-${variant}`, artifactId: config.artifactId,
        grid: { width: config.gridWidth, height: config.gridHeight }, warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
        fixedParams: { ...CLIFFORD_RENDER_148, note: "screening knobs; shipped morph references use their own knobs" },
        historicalCoarseGrid: { axes: historical.axes.map(a => ({ key: a.key, values: a.values })), pinned: historical.baseParams, source: "e2e/harness/sims.ts (config clifford-dejong-" + variant + ", unchanged)" },
        newAxes: { anchors: config.axes[0].values.length, c: config.axes[1].values, d: config.axes[2].values },
        overlapAssessment: attrHistoricalOverlap(variant),
        candidates: planned,
        references: config.references.map(r => ({ id: r.id, label: r.label, params: r.params,
          provenance: "src/app/presets.ts" + (/morph/.test(r.id) ? " (morph preset: shipped drift/exposure/fade/pointsPerFrame, not the screening knobs)" : "") })),
        counts: { coarse: planned.length, refinements: 0, allowance: "48 novel sets + at most 16 refinements; none planned" },
        stopping: "Fixed list; no adaptive refinement. Stop on any non-finite score.",
      };
    }),
  };
}

sweepTest("sweep 148 pre-measurement manifest", () => {
  writeText(ATTR_PRE_PATH, JSON.stringify(attrPreManifest(), null, 2));
});

for (const variant of ATTR_VARIANTS) {
  sweepTest(`sweep 148 ${variant} c/d interactions`, async ({ page }) => {
    test.setTimeout(3_600_000);
    const slug = `clifford-dejong-${variant}`;
    const config = SWEEP_CONFIGS[`sweep-148-${slug}`];
    const sets = expandSweep(config);
    const planned = sets.map((params, i) => ({ id: `148-${variant}-c${String(i + 1).padStart(2, "0")}`, params }));
    expect(planned.length).toBeGreaterThanOrEqual(48);
    expect(new Set([...planned, ...config.references].map(c => c.id)).size).toBe(planned.length + config.references.length);
    const historical = SWEEP_CONFIGS[slug];
    expect(existsSync(ATTR_PRE_PATH), "pre-measurement manifest must exist on disk before measuring").toBe(true);
    const pre = JSON.parse(readFileSync(ATTR_PRE_PATH, "utf8"));
    const preVariant = pre.variants.find((v: any) => v.slug === slug);
    expect(JSON.stringify(preVariant.candidates)).toBe(JSON.stringify(planned));
    expect(JSON.stringify(preVariant.references.map((r: any) => [r.id, r.params]))).toBe(JSON.stringify(config.references.map(r => [r.id, r.params])));
    const manifest = {
      preMeasurementManifest: { path: ATTR_PRE_PATH, sha256: sha256File(ATTR_PRE_PATH) },
      slug, methodVersion: ATTRACTOR_148_METHOD,
      grid: { width: config.gridWidth, height: config.gridHeight }, warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
      command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 148 " --workers=1',
      candidates: planned,
      fixedParams: { ...CLIFFORD_RENDER_148, note: "driftAmount 0 pins coefficients for morphology screening; bounded drift is compared separately for finalists" },
      determinism: "No RNG: the kernel starts at (0.1,0.1) and iterates a fixed map; there is no seed parameter, so seed repeats are not supported and identical replays are expected to match to 1e-9.",
      counts: { coarse: planned.length, refinements: 0, allowance: "48 novel sets + at most 16 refinements; no refinement pass was run" },
      axes: { anchors: config.axes[0].values.length, c: config.axes[1].values, d: config.axes[2].values,
        historicalAxes: historical.axes.map(a => ({ key: a.key, values: a.values })), historicalBase: historical.baseParams },
      priorCoverage: [
        { source: "e2e/harness/sims.ts", description: `Historical ${variant} config (id ${slug}, preserved unchanged): ${historical.axes.map(a => `${a.key} ${JSON.stringify(a.values)}`).join(" x ")}; base c/d ${JSON.stringify({ c: historical.baseParams.c, d: historical.baseParams.d })}. Not repeated here; this stage varies c and d at every candidate.` },
        { source: "docs/sweeps/clifford-dejong-interestingness.md", description: "Original 2026-08-16 write-up: a/b grids with c/d pinned at a per-map anchor (Svensson also swept d at three values). Shipped promotions come from that run." },
        { source: "docs/sweeps/clifford-dejong-interestingness.md", description: pre.historicalFinePass.description + " " + pre.historicalFinePass.gap },
        { source: ATTR_PRE_PATH, description: `Overlap assessment (computed before measuring): ${JSON.stringify(preVariant.overlapAssessment)}` },
        { source: "src/app/presets.ts", description: "All shipped clifford-dejong presets, including clifford-morph and dejong-morph with their own drift/exposure/fade/pointsPerFrame, are the current references, re-measured under 148-current-* ids." },
        { source: "src/sims/clifford-dejong/kernel.ts", description: "Map definitions and analytic bounds; paramSchema ranges bound the search." },
        { source: "docs/sweeps/2026-10-30-interestingness-batch.md", description: "Batch report: Clifford, De Jong and Svensson are three variants of one kernel; this stage tests c/d interactions." },
      ],
      inclusion: "All 48 sets retained, including thin, saturated and degenerate outcomes: 4 a/b anchors (shipped and diverse) x 4 c x 3 d, map explicit.",
      exclusion: "No colour, exposure, fade, pointsPerFrame or drift search in the screening pass; no old-grid repeat; no production changes.",
      sourceHashes: Object.fromEntries(["src/app/presets.ts", "src/sims/clifford-dejong/kernel.ts", "e2e/harness/driver.ts", "e2e/harness/metrics.ts"].map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])),
    };
    const diagnostics: Record<string, object> = {};
    const measure = async (c: { id: string; params: Params }, label: string) => {
      const scored = await scoreOne(page, config, c.id, label, c.params);
      expect(Object.values(scored.metrics).filter(v => typeof v === "number").every(Number.isFinite), c.id).toBe(true);
      const d = await attrDrive(page, config, c.params, config.gridWidth, [config.warmupSteps]);
      const diag = attrDiagnostics(d.frameA, config.slug === "clifford-dejong" ? String(c.params.map) : variant, c.params);
      expect(diag.nonFiniteFraction, c.id).toBe(0);
      diagnostics[c.id] = diag;
      return { scored, field: d.frameA };
    };
    const candidates: ScoredCandidate[] = [], references: ScoredCandidate[] = [];
    const cols = 8, cell = 128;
    const sheetW = cols * cell, sheetH = Math.ceil(planned.length / cols) * cell;
    const sheet = new Float32Array(sheetW * sheetH);
    for (const c of planned) {
      const { scored, field } = await measure(c, c.id);
      const i = candidates.length;
      for (let y = 0; y < cell; y += 1) for (let x = 0; x < cell; x += 1) sheet[(Math.floor(i / cols) * cell + y) * sheetW + (i % cols) * cell + x] = field[y * cell + x];
      candidates.push(scored);
    }
    for (const r of config.references) references.push((await measure(r, r.label)).scored);
    const ranked = [...candidates].sort((a, b) => b.metrics.score - a.metrics.score);
    const censusPath = `${ATTR_IMAGES}/148-${variant}-census.png`;
    writePng(censusPath, sheet, sheetW, sheetH, 1);
    writeText(`${ARTIFACT_ROOT}/sweep-148-${slug}/report.md`, metricsTable(ranked, ["a", "b", "c", "d"]));
    writeText(`${ARTIFACT_ROOT}/sweep-148-${slug}/census.json`, JSON.stringify({ manifest, ranked, references, diagnostics }));
    const finalistIds = ATTR_FINALISTS[variant];
    if (!finalistIds.length) return;

    const finalists = finalistIds.map(id => ranked.find(c => c.id === id)!);
    expect(finalists.every(Boolean)).toBe(true);
    const evidence: Record<string, object> = {}, replay: object[] = [];
    const finalistRows: { id: string; images: string[] }[] = [];
    const longConfig = { ...config, multiSnapshot: { warmupSteps: ATTR_STEPS } };
    for (const c of [...finalists, ...references]) {
      const isFinalist = finalists.includes(c);
      const again = await scoreOne(page, config, c.id, c.label, c.params);
      const delta = Math.max(...Object.entries(again.metrics).filter(([, v]) => typeof v === "number").map(([k, v]) => Math.abs((v as number) - (c.metrics as any)[k])));
      expect(delta).toBeLessThanOrEqual(1e-9);
      replay.push({ id: c.id, maxAbsoluteDelta: delta });
      const isMorph = /morph/.test(c.id);
      const times = isFinalist || isMorph ? ATTR_STEPS : [ATTR_STEPS[1]];
      const rendererImages: string[] = [], fieldImages: string[] = [], renderInfo: object[] = [];
      for (const t of times) {
        const rp = `${ATTR_IMAGES}/${c.id}-renderer-${ATTR_RENDER_SIZE}-t${t}.png`;
        renderInfo.push(await attrRenderer(page, c.params, t, rp)); rendererImages.push(rp);
      }
      for (const size of [128, 384]) {
        const frames = await attrDrive(page, config, c.params, size, times);
        for (const snap of frames.snapshots!) {
          const fp = `${ATTR_IMAGES}/${c.id}-field-${size}-t${snap.steps}.png`;
          writePng(fp, snap.frameA, size, size, 1); fieldImages.push(fp);
        }
      }
      const longScore = await scoreOne(page, longConfig, c.id, c.label, c.params);
      const driftScore = isMorph ? longScore : await scoreOne(page, { ...longConfig }, c.id, c.label, { ...c.params, driftAmount: ATTR_DRIFT });
      const driftParams = isMorph ? c.params : { ...c.params, driftAmount: ATTR_DRIFT };
      const perSnapshot: Record<string, { static: object; boundedDrift: object }> = {};
      for (const t of ATTR_STEPS) {
        const atT = { ...config, warmupSteps: t };
        perSnapshot[String(t)] = { static: (await scoreOne(page, atT, c.id, c.label, c.params)).metrics, boundedDrift: (await scoreOne(page, atT, c.id, c.label, driftParams)).metrics };
      }
      evidence[c.id] = { perSnapshot, rendererImages, fieldImages, renderInfo,
        longHorizon: { snapshots: ATTR_STEPS, metrics: longScore.metrics },
        boundedDrift: { driftAmount: isMorph ? c.params.driftAmount : ATTR_DRIFT, shippedDriftPreset: isMorph, driftSpeed: "kernel default 0.5", snapshots: ATTR_STEPS, metrics: driftScore.metrics,
          scoreRetention: driftScore.metrics.score / (longScore.metrics.score || 1) },
        seeds: "not supported: kernel is deterministic with no seed parameter" };
      if (isFinalist) finalistRows.push({ id: c.id, images: [...rendererImages, ...fieldImages, censusPath] });
    }
    writeText(`${ATTR_ROOT}/${slug}.json`, JSON.stringify({ manifest, ranked, references, finalists: finalistRows, diagnostics, evidence,
      replay: { tolerance: 1e-9, workerRepeat: replay, independentVerifierRequired: true } }, null, 2));
    console.log(`Attractor 148 ${variant}: ${candidates.length} candidates, ${references.length} references, ${finalists.length} evidence selections`);
  });
}

// ---------------------------------------------------------------------------
// Stage 144: missed boids / physarum / particle-life regimes.
// ---------------------------------------------------------------------------
const S144_ROOT = "docs/sweeps/data/2026-10-30/144";
const S144_IMAGES = "docs/images/sweeps-2026-10-30";
const S144_VERSION = "particle-trail-regimes-v1";
const S144_SLUGS = ["boids", "physarum", "particle-life"] as const;
const S144_DENSITY_SCALE = 2.25; // second resolution: (grid2 / grid1)^2 cells, 1.5x per side
const S144_SUMMARY_KEYS = ["score", "entropy", "variance", "spatialAutocorrelation", "coverage", "temporalFlux", "velocityCoherence", "channelMixing"] as const;

interface FrameDiagnostics {
  nonFiniteFraction: number;
  fractionAtZero: number;
  fractionAtOne: number;
  borderToMeanDensity: number;
}

/** Pathology guards, not quality scores: non-finite cells, cells pinned at the
 * [0,1] channel endpoints, and the density on the outermost ring relative to the
 * frame mean (a swarm piling against the frame edge reads far above 1). */
function frameDiagnostics(frame: ArrayLike<number>, width: number, height: number): FrameDiagnostics {
  let bad = 0, zero = 0, one = 0, sum = 0, border = 0, borderCells = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const v = frame[y * width + x];
    const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (!Number.isFinite(v)) { bad += 1; continue; }
    if (v <= 0) zero += 1;
    if (v >= 1) one += 1;
    sum += v;
    if (onBorder) { border += v; borderCells += 1; }
  }
  const n = width * height;
  const mean = sum / n;
  return {
    nonFiniteFraction: bad / n, fractionAtZero: zero / n, fractionAtOne: one / n,
    borderToMeanDensity: mean > 0 ? border / borderCells / mean : 0,
  };
}

function s144Config(slug: string): SimSweepConfig {
  return SWEEP_CONFIGS[`sweep-144-${slug}`];
}

function s144CandidateId(config: SimSweepConfig, params: Params): string {
  return config.axes.map(a => `${a.key}${params[a.key]}`).join("_");
}

function s144Scale(slug: string, width: number): number {
  return width >= 256 ? 2 : 3;
}

async function s144Frame(page: Page, config: SimSweepConfig, params: Params, warmupSteps: number, width = config.gridWidth, height = config.gridHeight) {
  return page.evaluate(driveKernel, {
    registryUrl: REGISTRY_URL, slug: config.slug, params, gridWidth: width, gridHeight: height,
    warmupSteps, fluxGap: 0, primaryChannel: config.primaryChannel, dt: config.dt,
  });
}

function s144Pick(ranked: ScoredCandidate[], config: SimSweepConfig, bad: Set<string>): ScoredCandidate[] {
  const keys = config.axes.map(a => a.key);
  const pool = ranked.filter(c => !bad.has(c.id)).slice(0, 16);
  const picked: ScoredCandidate[] = [];
  while (picked.length < 3 && pool.length) {
    if (!picked.length) { picked.push(pool.shift()!); continue; }
    // Diversity outranks a marginal score gain: take the highest-scoring candidate
    // that differs from every pick in at least two swept parameters.
    const next = pool.findIndex(c => picked.every(p => keys.filter(k => c.params[k] !== p.params[k]).length >= 2));
    if (next < 0) break;
    picked.push(pool.splice(next, 1)[0]);
  }
  return picked;
}

async function s144Measure(page: Page, config: SimSweepConfig, row: { id: string; label: string; params: Params }) {
  const w = config.gridWidth, h = config.gridHeight, base = config.warmupSteps;
  const count = (k: string) => Number(row.params[k]);
  const countKey = config.slug === "physarum" ? "agentCount" : config.slug === "particle-life" ? "particleCount" : "boidCount";
  const larger = { ...config, gridWidth: Math.round(w * 1.5), gridHeight: Math.round(h * 1.5) };
  const largerParams = { ...row.params, [countKey]: Math.round(count(countKey) * S144_DENSITY_SCALE) };
  const times: Record<string, InterestingnessMetrics> = {};
  for (const mult of [1, 2, 4, 8]) times[`t${base * mult}`] = (await scoreOne(page, { ...config, warmupSteps: base * mult }, row.id, row.label, row.params)).metrics;
  const seeds: Record<string, InterestingnessMetrics> = {};
  if ("seed" in row.params) for (const delta of [1, 2]) {
    const seed = Number(row.params.seed) + delta;
    seeds[`seed${seed}`] = (await scoreOne(page, config, row.id, row.label, { ...row.params, seed })).metrics;
  }
  const pick = (m: InterestingnessMetrics) => Object.fromEntries(S144_SUMMARY_KEYS.filter(k => m[k] !== undefined).map(k => [k, m[k]]));
  return {
    id: row.id, params: row.params,
    timeSamples: Object.fromEntries(Object.entries(times).map(([k, m]) => [k, pick(m)])),
    seedSamples: Object.fromEntries(Object.entries(seeds).map(([k, m]) => [k, pick(m)])),
    seedNote: "seed" in row.params ? "Base seed in the ranked row plus two neighbouring seeds; three readings, not a distributional guarantee." : "Boids has no seed input; kernel seeding is deterministic, so repeats are identical by construction.",
    largerGrid: { width: larger.gridWidth, height: larger.gridHeight, params: largerParams, metrics: pick((await scoreOne(page, larger, row.id, row.label, largerParams)).metrics) },
  };
}

for (const slug of S144_SLUGS) {
  sweepTest(`sweep 144 ${slug} missed regimes`, async ({ page }) => {
    test.setTimeout(3_300_000);
    const config = s144Config(slug);
    const artifactId = config.artifactId!;
    const planned = expandSweep(config).map(params => ({ id: s144CandidateId(config, params), params }));
    expect(new Set([...planned.map(c => c.id), ...config.references.map(r => r.id)]).size).toBe(planned.length + config.references.length);
    const baseline = SWEEP_CONFIGS[slug];
    const manifest = {
      slug, methodVersion: S144_VERSION, grid: { width: config.gridWidth, height: config.gridHeight },
      warmupSteps: config.warmupSteps, fluxGap: config.fluxGap, dt: config.dt,
      command: 'SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 144 "',
      determinism: slug === "boids" ? "Kernel seeding is deterministic and has no seed input; fresh kernel per measurement." : "Explicit integer seed on every candidate and reference; fresh kernel per measurement.",
      instrument: { primaryChannel: config.primaryChannel, coverageThreshold: config.coverageThreshold, pointCloud: config.pointCloud, composite: "scoreFrames unchanged", diagnostics: "frameDiagnostics (nonFinite, endpoint fractions, border ratio) are pathology guards only" },
      fixedParams: config.baseParams,
      axes: config.axes,
      populationBasis: "Candidate population is held at the prior sweep's calibrated value; the second-resolution check scales it by the cell-count ratio (2.25); physarum's shipped counts are scaled by (256/384)^2.",
      priorCoverage: [
        { source: `docs/sweeps/${slug}-interestingness.md`, description: slug === "boids"
          ? "2026-09-01 grid: visualRadius {16,24,32,44,56} x separation {0.1,0.2,0.35,0.55} x separationRadius {5,8,12}; alignment 0.06, cohesion 0.012, maxSpeed 16, boidCount 2500 and obstacleLayout none pinned. Not searched: alignment, cohesion, initialFlocks."
          : slug === "physarum"
            ? "2026-08-23 grid: sensorAngle {12,22.5,38,60} x sensorDistance {5,9,17} x turnSpeed {12,22.5,40}; moveSpeed 1, depositAmount 0.22, evaporation 0.9 pinned. Root mat shipped 2026-08-30 from that grid."
            : "2026-08-23 grid: rmax {16,24,32} x forceScale {25,60,110} x matrixBias {-0.15,0.05,0.25}; friction 0.7, species 5, rmin 12, particleCount 3000 pinned." },
        { source: "e2e/harness/sims.ts", description: `Historical ${slug} config (key "${slug}") is unchanged: baseParams ${JSON.stringify(baseline.baseParams)}, references ${baseline.references.map(r => r.id).join(", ")}.` },
        { source: "src/app/presets.ts", description: "Shipped presets re-declared under 144-current-* ids; historical reference rows are preserved and not edited." },
      ],
      inclusion: slug === "boids"
        ? "Alignment {0.01,0.15,0.2,0.25} x cohesion {0,0.03,0.04,0.05} x initialFlocks {1,6,12}: every value outside the earlier pinned alignment 0.06 / cohesion 0.012. All 48 retained, obstacle-free."
        : slug === "physarum"
          ? "Corners of evaporation {0.8,0.975} x depositAmount {0.06,0.6} x moveSpeed {0.5,2.5} x sensorDistance {3,14} with sensorAngle {8,30,80}; none matches an earlier pinned value. All 48 retained."
          : "friction {0.1,0.35,0.9,0.97} x species {3,6,8} x forceScale {10,140} x matrixBias {-0.35,0.35}; every value outside the earlier friction 0.7 / species 5 / forceScale and matrixBias ranges. All 48 retained.",
      exclusion: "No refinement round was run (allowance 16 unused); obstacles are visual-only and never ranked; no population or resolution search; logistic-mandelbrot untouched.",
      candidates: planned, references: config.references,
    };
    writeText(`${S144_ROOT}/${slug}.manifest.json`, JSON.stringify(manifest, null, 2));

    const ranked = await runSweep(page, config);
    const artifacts = JSON.parse(readFileSync(`${ARTIFACT_ROOT}/${artifactId}/results.json`, "utf8"));
    const references: ScoredCandidate[] = artifacts.references;
    const finite = (c: ScoredCandidate) => Object.values(c.metrics).every(v => typeof v !== "number" || Number.isFinite(v));
    expect(ranked.length).toBe(planned.length);
    for (const c of [...ranked, ...references]) expect(finite(c), c.id).toBe(true);

    const diagnostics: Record<string, FrameDiagnostics> = {};
    for (const c of [...ranked.slice(0, 16), ...references]) {
      const f = await s144Frame(page, config, c.params, config.warmupSteps);
      diagnostics[c.id] = frameDiagnostics(f.frameA, f.width, f.height);
    }
    const rejected = new Set(ranked.slice(0, 16).filter(c => {
      const d = diagnostics[c.id];
      return d.nonFiniteFraction > 0 || d.fractionAtOne > 0.5 || d.fractionAtZero > 0.995;
    }).map(c => c.id));
    const picked = s144Pick(ranked, config, rejected);

    const scale = s144Scale(slug, config.gridWidth);
    for (const ref of references) {
      const f = await s144Frame(page, config, ref.params, config.warmupSteps);
      ref.thumb = `${S144_IMAGES}/${ref.id}-field.png`;
      writePng(ref.thumb, f.frameA, f.width, f.height, scale);
    }
    const finalists = [];
    for (const c of picked) {
      const images: string[] = [];
      for (const mult of [1, 2, 4]) {
        const steps = config.warmupSteps * mult;
        const f = await s144Frame(page, config, c.params, steps);
        const path = `${S144_IMAGES}/144-${slug}-${c.id}-t${steps}-field.png`;
        writePng(path, f.frameA, f.width, f.height, scale);
        images.push(path);
      }
      const longSteps = config.warmupSteps * 8;
      const long = await s144Frame(page, config, c.params, longSteps);
      const longHorizonImage = `${S144_IMAGES}/144-${slug}-${c.id}-t${longSteps}-field.png`;
      writePng(longHorizonImage, long.frameA, long.width, long.height, scale);
      const obstacleVisual: Record<string, string> = {};
      if (slug === "boids") for (const layout of ["breakwaters", "rocks", "reef"]) {
        const f = await s144Frame(page, config, { ...c.params, obstacleLayout: layout }, config.warmupSteps * 2);
        const path = `${S144_IMAGES}/144-boids-${c.id}-obstacle-${layout}-field.png`;
        writePng(path, f.frameA, f.width, f.height, scale);
        obstacleVisual[layout] = path;
      }
      finalists.push({ id: c.id, images, longHorizonImage, ...(slug === "boids" ? { obstacleVisual } : {}), validation: await s144Measure(page, config, { id: c.id, label: c.label, params: c.params }) });
      console.log(`144 ${slug} validated ${c.id}`);
    }
    const referenceValidation = [];
    for (const ref of references) referenceValidation.push(await s144Measure(page, config, ref));
    if (slug === "boids") {
      const balanced = references.find(r => r.id === "144-current-balanced-flock")!;
      const obstacleReference: Record<string, string> = {};
      for (const layout of ["breakwaters", "rocks", "reef"]) {
        const f = await s144Frame(page, config, { ...balanced.params, obstacleLayout: layout }, config.warmupSteps * 2);
        const path = `${S144_IMAGES}/144-boids-${balanced.id}-obstacle-${layout}-field.png`;
        writePng(path, f.frameA, f.width, f.height, scale);
        obstacleReference[layout] = path;
      }
      (referenceValidation as any[]).push({ id: "obstacle-reference", obstacleVisual: obstacleReference });
    }

    writeText(`${S144_ROOT}/${slug}.json`, JSON.stringify({
      manifest,
      ranked: ranked.map(({ thumb: _t, ...c }) => c),
      references,
      finalists,
      referenceValidation,
      diagnostics: { methodVersion: S144_VERSION, scope: "top-16 ranked candidates and all references at the sweep warmup", rows: diagnostics, rejectedAsPathological: [...rejected] },
      imageKinds: "All PNGs under docs/images/sweeps-2026-10-30/144-* and the *-field.png reference thumbs are grayscale kernel-field renders (channel 0), not app renderer screenshots; app screenshots, where present, are named *-app.png.",
      runtime: { browser: page.context().browser()?.version(), node: process.version, platform: process.platform },
    }, null, 2));
    console.log(JSON.stringify({ slug, top: ranked.slice(0, 5).map(c => [c.id, c.metrics.score]), finalists: finalists.map(f => f.id) }));
  });
}

// Stage 144 supplement: actual app-renderer screenshots from a deterministic
// fixed-step kernel-to-Renderer snapshot, scored at the same recorded grid.
const S144_APP_VIEWPORT = { width: 1280, height: 800 }; // launch default only; every capture sets and records its own viewport
const S144_APP_CANVAS = { width: 960, height: 600 };
const S144_APP_CONCURRENCY = 4;
const S144_APP_METHOD = "app-evidence-v2-fixed-step";
const S144_APP_PRESET_IDS: Record<string, string> = {
  "144-current-balanced-flock": "balanced-flock", "144-current-tight-flock": "tight-flock", "144-current-scatter": "scatter",
  "144-current-veins": "veins", "144-current-coral-fans": "coral-fans", "144-current-filigree-web": "filigree-web", "144-current-root-mat": "root-mat",
  "144-current-cells": "cells", "144-current-chasers": "chasers", "144-current-gas-clouds": "gas-clouds",
};
// Shipped finalist populations: boids shipped 17777; physarum Veins; particle life Cells.
const S144_SHIPPED_FINALIST_COUNT: Record<string, number> = { boids: 17777, physarum: 32000, "particle-life": 6000 };
const S144_COUNT_KEY: Record<string, string> = { boids: "boidCount", physarum: "agentCount", "particle-life": "particleCount" };
// Kernel population ceilings (MAX_*_COUNT in each kernel); the effective count is
// read back from the kernel and must equal the request, so these only choose grids.
const S144_POPULATION_CAP: Record<string, number> = { boids: 40000, physarum: 300000, "particle-life": 20000 };

interface S144Snapshot {
  viewport: { width: number; height: number }; grid: [number, number]; canvas: [number, number]; kernelCalls: number; callsAfterSettle: number; dts: number[];
  effectivePopulation: number; stateSha256: string; renderer: string; running: boolean; devicePixelRatio: number; resolution: string;
  /** Present only when the caller asked for a clump readout of the drawn state. */
  clump?: ClumpReading & { velocityCoherence: number };
}

/** Fresh kernel -> exact `steps` fixed-dt calls -> real Renderer draws that state. */
async function s144Snapshot(page: Page, slug: string, params: Params, canvasCss: { width: number; height: number }, steps: number, shotPath: string | null, clumpOptions?: typeof S152_METRIC_OPTIONS): Promise<S144Snapshot> {
  await page.setViewportSize({ width: Math.max(canvasCss.width, 400), height: Math.max(canvasCss.height, 300) });
  const info = await page.evaluate(async ({ slug, params, size, steps, countKey, clumpOptions }) => {
    const base = "http://localhost:5173/src/app/";
    const reg: any = await import(/* @vite-ignore */ base + "registry.ts");
    const rm: any = await import(/* @vite-ignore */ base + "renderModes.ts");
    const qp: any = await import(/* @vite-ignore */ base + "qualityProfiles.ts");
    const rd: any = await import(/* @vite-ignore */ base + "renderer.ts");
    const ctl: any = await import(/* @vite-ignore */ base + "controls.ts");
    const w: any = window;
    w.__s144?.destroy();
    document.getElementById("s144-canvas")?.remove();
    const loaded = await reg.REGISTRY.find((e: any) => e.slug === slug).load();
    const Base: any = loaded.constructor;
    let grid: [number, number] = [0, 0];
    let calls = 0;
    const dts: number[] = [];
    class SnapshotKernel extends Base {
      init(width: number, height: number, p: any) {
        // The app reseeds randomly per load; the snapshot pins the sweep's own seed (boids: none, i.e. 0).
        super.init(width, height, { ...p, seed: typeof params.seed === "number" ? params.seed : 0 });
        grid = [width, height];
        calls = 0; dts.length = 0;
        for (let i = 0; i < steps; i += 1) { super.step(1); calls += 1; dts.push(1); }
      }
      step(dt: number) { calls += 1; dts.push(dt); super.step(dt); }
    }
    const kernel: any = new SnapshotKernel();
    const mode = rm.getRenderMode(slug);
    const profile = qp.qualityProfileFor(slug, mode);
    const canvas = document.createElement("canvas");
    canvas.id = "s144-canvas";
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${size.width}px;height:${size.height}px;background:#000`;
    document.body.appendChild(canvas);
    const renderer = new rd.Renderer({
      canvas, kernel, params: { ...ctl.defaultParamsFromSchema(kernel.paramSchema), ...params },
      stepsPerFrame: 0, renderMode: mode, resolution: profile.defaultPreset, qualityProfile: profile,
    });
    renderer.pause();
    w.__s144 = renderer;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const state: Float32Array = kernel.readState();
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(state.buffer, state.byteOffset, state.byteLength));
    const [gw, gh] = canvas.dataset.renderSize!.split("x").map(Number);
    let clump: any;
    if (clumpOptions) {
      // The same readState the digest above covers, read through the Vite origin so no second kernel exists.
      const cm: any = await import(/* @vite-ignore */ "http://localhost:5173/e2e/harness/clumps.ts");
      const mm: any = await import(/* @vite-ignore */ "http://localhost:5173/e2e/harness/metrics.ts");
      const cells = gw * gh;
      if (state.length !== cells * 4) throw new Error(`state length ${state.length} is not ${cells} cells x 4 channels`);
      const channel = (c: number) => { const out = new Float32Array(cells); for (let i = 0; i < cells; i += 1) out[i] = state[i * 4 + c]; return out; };
      const [density, speed, vx, vy] = [channel(0), channel(1), channel(2), channel(3)];
      clump = { ...cm.clumpRegime({ width: gw, height: gh, density, speed, vx, vy }, clumpOptions), velocityCoherence: mm.velocityCoherence(vx, vy) };
    }
    return {
      clump,
      grid: [gw, gh] as [number, number], canvas: [canvas.width, canvas.height] as [number, number],
      kernelCalls: steps, callsAfterSettle: calls, dts: [...new Set(dts)],
      effectivePopulation: Number(kernel[countKey]), renderedGrid: grid,
      stateSha256: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""),
      renderer: canvas.dataset.renderer!, running: renderer.isRunning(), devicePixelRatio: window.devicePixelRatio, resolution: profile.defaultPreset,
    };
  }, { slug, params, size: canvasCss, steps, countKey: S144_COUNT_KEY[slug], clumpOptions: clumpOptions ?? null });
  expect(info.renderer).toBe("webgl2");
  expect(info.running, "snapshot renderer must stay paused").toBe(false);
  expect(info.callsAfterSettle, "no kernel call after the snapshot").toBe(steps);
  expect(info.dts).toEqual([1]);
  expect(info.renderedGrid).toEqual(info.grid);
  if (shotPath) await page.locator("#s144-canvas").screenshot({ path: shotPath });
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("page has no viewport");
  const { renderedGrid: _g, ...rest } = info;
  return { viewport, ...rest } as S144Snapshot;
}

/** Plain fresh kernel on the renderer's grid, same call count at the same dt: the state the metrics measure. */
async function s144MeasuredStateSha(page: Page, slug: string, params: Params, grid: [number, number], steps: number): Promise<string> {
  return page.evaluate(async ({ slug, params, grid, steps }) => {
    const reg: any = await import(/* @vite-ignore */ "http://localhost:5173/src/app/registry.ts");
    const loaded = await reg.REGISTRY.find((e: any) => e.slug === slug).load();
    const kernel: any = new loaded.constructor();
    kernel.init(grid[0], grid[1], { ...params, seed: typeof params.seed === "number" ? params.seed : 0 });
    for (let i = 0; i < steps; i += 1) kernel.step(1);
    const state: Float32Array = kernel.readState();
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(state.buffer, state.byteOffset, state.byteLength));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  }, { slug, params, grid, steps });
}

/** Canvas whose renderer grid keeps the sweep density within the kernel's population cap. */
function s144MatchedCanvas(slug: string, config: SimSweepConfig, sweepCount: number): { width: number; height: number; count: number } {
  const density = sweepCount / (config.gridWidth * config.gridHeight);
  const full = S144_APP_CANVAS.width * S144_APP_CANVAS.height;
  const cap = S144_POPULATION_CAP[slug];
  if (density * full <= cap) return { ...S144_APP_CANVAS, count: Math.round(density * full) };
  const side = Math.floor(Math.sqrt(cap * 0.995 / density)); // square canvas, 0.5% headroom under the cap
  return { width: side, height: side, count: Math.round(density * side * side) };
}

test.describe("sweep 144 app evidence", () => {
  test.use({ viewport: S144_APP_VIEWPORT });
  for (const slug of S144_SLUGS) {
    sweepTest(`sweep 144 ${slug} app-renderer and shipped-population evidence`, async ({ page }) => {
      test.setTimeout(7_200_000);
      await page.goto("/");
      const config = s144Config(slug);
      const retained = JSON.parse(readFileSync(`${S144_ROOT}/${slug}.json`, "utf8"));
      const countKey = S144_COUNT_KEY[slug];
      const sweepCells = config.gridWidth * config.gridHeight;
      const base = config.warmupSteps;
      const steps = [base, base * 2, base * 4];
      const presets = presetsFor(slug);
      type Row = { id: string; kind: "reference" | "finalist"; population: string; label: string; params: Params; canvas: { width: number; height: number }; sweepDensity?: number };
      const rows: Row[] = [];
      for (const ref of retained.references as ScoredCandidate[]) {
        const preset = presets.find(p => p.id === S144_APP_PRESET_IDS[ref.id]);
        if (!preset) throw new Error(`no shipped preset for ${ref.id}`);
        const params: Params = { ...ref.params, ...preset.params } as Params;
        if (slug === "boids") params.obstacleLayout = "none";
        rows.push({ id: ref.id, kind: "reference", population: `shipped ${params[countKey]}`, label: ref.label, params, canvas: S144_APP_CANVAS });
      }
      for (const f of retained.finalists as { id: string }[]) {
        const cand = (retained.ranked as ScoredCandidate[]).find(c => c.id === f.id)!;
        const sweepCount = Number(cand.params[countKey]);
        const matched = s144MatchedCanvas(slug, config, sweepCount);
        rows.push({ id: f.id, kind: "finalist", population: `matched-density ${matched.count}`, label: cand.label, params: { ...cand.params, [countKey]: matched.count } as Params,
          canvas: { width: matched.width, height: matched.height }, sweepDensity: sweepCount / sweepCells });
        const shipped = S144_SHIPPED_FINALIST_COUNT[slug];
        rows.push({ id: f.id, kind: "finalist", population: `shipped ${shipped}`, label: cand.label, params: { ...cand.params, [countKey]: shipped } as Params, canvas: S144_APP_CANVAS });
      }
      const processRow = async (row: Row, page: Page): Promise<any> => {
        const tag = `${row.kind === "reference" ? row.id : `144-${slug}-${row.id}`}-${row.population.replace(/[^a-z0-9]+/gi, "-")}`;
        const requested = Number(row.params[countKey]);
        const samples: any[] = [];
        let grid: [number, number] = [0, 0];
        let viewport = { width: 0, height: 0 };
        for (const [index, target] of steps.entries()) {
          const path = `${S144_IMAGES}/144-app-${slug}-${tag}-t${target}-app.png`;
          const snap = await s144Snapshot(page, slug, row.params, row.canvas, target, path);
          grid = snap.grid;
          viewport = snap.viewport;
          expect(snap.effectivePopulation, `${row.id} ${row.population}: effective population`).toBe(requested);
          const measured = await s144MeasuredStateSha(page, slug, row.params, snap.grid, target);
          expect(snap.stateSha256, `${row.id} ${row.population} t${target}: screenshot state equals measured state`).toBe(measured);
          let repeatSha256: string | null = null;
          if (index === 0) {
            repeatSha256 = (await s144Snapshot(page, slug, row.params, row.canvas, target, null)).stateSha256;
            expect(repeatSha256, `${row.id} ${row.population}: same-seed repeat`).toBe(snap.stateSha256);
          }
          samples.push({ steps: target, viewport: snap.viewport, kernelCalls: snap.kernelCalls, dt: 1, stateSha256: snap.stateSha256, measuredStateSha256: measured, repeatStateSha256: repeatSha256, image: path });
          if (index === 0) Object.assign(samples[0], { canvasPixels: snap.canvas, devicePixelRatio: snap.devicePixelRatio, resolutionPreset: snap.resolution });
        }
        const effective = requested;
        const cells = grid[0] * grid[1];
        const gridConfig: SimSweepConfig = { ...config, gridWidth: grid[0], gridHeight: grid[1] };
        const timeSamples: Record<string, Record<string, unknown>> = {};
        for (const t of steps) {
          const m = (await scoreOne(page, { ...gridConfig, warmupSteps: t }, row.id, row.label, row.params)).metrics;
          timeSamples[`t${t}`] = Object.fromEntries(S144_SUMMARY_KEYS.filter(k => m[k] !== undefined).map(k => [k, m[k]]));
          expect(Object.values(timeSamples[`t${t}`]).every(v => typeof v !== "number" || Number.isFinite(v)), `${row.id} t${t}`).toBe(true);
        }
        const density = effective / cells;
        if (row.sweepDensity !== undefined && row.population.startsWith("matched")) {
          expect(Math.abs(density - row.sweepDensity) / row.sweepDensity, `${row.id}: matched density`).toBeLessThan(0.005);
        }
        const result = {
          id: row.id, kind: row.kind, population: row.population, params: row.params,
          requestedPopulation: requested, effectivePopulation: effective, populationCap: S144_POPULATION_CAP[slug],
          canvasCss: row.canvas, viewport, grid: { width: grid[0], height: grid[1] }, cells, density,
          sweepDensity: row.sweepDensity ?? null, densityRelativeError: row.sweepDensity !== undefined && row.population.startsWith("matched") ? Math.abs(density - row.sweepDensity) / row.sweepDensity : null,
          samples, images: samples.map(s => s.image), timeSamples,
        };
        console.log(`144 app ${slug} ${row.id} ${row.population} grid ${grid.join("x")}`);
        return result;
      };
      const pages: Page[] = [page];
      for (let i = 1; i < S144_APP_CONCURRENCY; i += 1) { const extra = await page.context().newPage(); await extra.goto("/"); pages.push(extra); }
      const out: any[] = new Array(rows.length);
      let next = 0;
      await Promise.all(pages.map(async pg => { for (;;) { const idx = next++; if (idx >= rows.length) return; out[idx] = await processRow(rows[idx], pg); } }));
      for (const extra of pages.slice(1)) await extra.close();
      writeText(`${S144_ROOT}/${slug}.app-evidence.json`, JSON.stringify({
        slug, methodVersion: `${S144_VERSION}-${S144_APP_METHOD}`,
        viewportNote: "No single viewport: s144Snapshot sets page.viewportSize() to max(canvas CSS, 400x300) per capture; the actual value is recorded in each row's viewport and each sample's viewport.", shippedCanvasCss: S144_APP_CANVAS, sweepGrid: { width: config.gridWidth, height: config.gridHeight }, dt: 1,
        clock: "No wall-clock. Each capture builds a fresh kernel, issues exactly `kernelCalls` step(1) calls inside init, then the real Renderer (stepsPerFrame 0, paused) draws that state. The interactive iteration counter is not used; for particle renderers it advances 10 per kernel call.",
        note: "PNGs named *-app.png are canvas screenshots of the real Renderer (WebGL2, shipped quality profile and default resolution preset, default colour options). *-field.png files elsewhere are grayscale kernel-field renders. Numeric time samples use the recorded renderer grid and population through scoreOne; each screenshot state SHA-256 is asserted equal to a plain fresh kernel run at the same grid, seed, call count and dt, and the first sample is captured twice (same-seed repeat) with equal state hashes. Boids runs are obstacle-free; the app's schema default is reef. Boids has no seed input (kernel seeds are 0).",
        populations: "requestedPopulation and effectivePopulation are both recorded from the actual kernel and asserted equal. matched-density rows keep sweep agents-per-cell within 0.5% on the recorded renderer grid; where that needs more than the kernel cap (Particle Life, 20000) the canvas shrinks instead of the population being clamped. shipped rows use the full shipped population on the 960x600 canvas and are not density-matched.",
        runtime: { browser: page.context().browser()?.version(), node: process.version, platform: process.platform },
        rows: out,
      }, null, 2));
    });
  }
});

// ---------------------------------------------------------------------------
// Stage 152: faster flocks in several clumps going different ways.
// ---------------------------------------------------------------------------
const S152_ROOT = "docs/sweeps/data/2026-11-03/152";
const S152_DATA = `${S152_ROOT}/boids.json`;
const S152_PRESETS = `${S152_ROOT}/boids.presets.json`;
const S152_IMAGES = "docs/images/sweeps-2026-11-03";
const S152_ARTIFACTS = "e2e/artifacts/152-boids-clump-sweep";
const S152_VERSION = "boids-clump-regime-v1";
const S152_STEPS = [300, 600, 1200];
const S152_METRIC_OPTIONS = { blurRadius: 6, threshold: 0.25, minMassFraction: 0.03 };
const S152_CANVAS = { width: 960, height: 600 };
const S152_CONCURRENCY = 4;
const S152_POPULATION = 17777;
const S152_MAIN_SEED = 0;
const S152_REPEAT_SEEDS = [1, 2, 3];
const S152_REPEAT_STEPS = 600;
const S152_FINALISTS = 3;
const S152_COMMAND = 'CI=1 SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 152 boids" --global-timeout=14400000';
const S152_REPLAY_COMMAND = 'CI=1 SWEEP=1 SWEEP_152_REPLAY=1 npx playwright test e2e/sweep.spec.ts -g "sweep 152 boids replay" --global-timeout=14400000';
const s152Main = process.env.SWEEP && !process.env.SWEEP_152_REPLAY ? test : test.skip;
const s152Replay = process.env.SWEEP && process.env.SWEEP_152_REPLAY ? test : test.skip;
const s152Presets = process.env.SWEEP && process.env.SWEEP_152_PRESET_IDS !== undefined ? test : test.skip;

interface S152Sample {
  steps: number; seed: number; kernelCalls: number; viewport: { width: number; height: number };
  clumps: number; headingSpread: number; speedFraction: number; meanSpeed: number; velocityCoherence: number;
  masses: number[]; headings: number[]; stateSha256: string; image: string | null; artifact: string | null;
}
interface S152Row { id: string; label: string; params: Params; effectivePopulation: number; samples: S152Sample[]; metrics: { score: number; minClumps: number; minHeadingSpread: number; minMeanSpeed: number }; wallClockMs: number }

const s152Label = (p: Params) => `speed ${p.maxSpeed}, cohesion ${p.cohesion}, ${p.initialFlocks} flocks`;
const s152Id = (config: SimSweepConfig, p: Params) => config.axes.map(a => `${a.key}${p[a.key]}`).join("_");

/** One fixed-step app-renderer capture of a Boids state, with the clump reading taken from that same state. */
async function s152Capture(page: Page, params: Params, seed: number, steps: number, shotPath: string, retainedImage: string | null): Promise<S152Sample> {
  const snap = await s144Snapshot(page, "boids", { ...params, seed } as Params, S152_CANVAS, steps, shotPath, S152_METRIC_OPTIONS);
  expect(snap.effectivePopulation, "effective population").toBe(S152_POPULATION);
  expect(snap.kernelCalls).toBe(steps);
  const clump = snap.clump!;
  expect([clump.headingSpread, clump.meanSpeed, clump.velocityCoherence].every(Number.isFinite), "finite readings").toBe(true);
  const maxSpeed = Number(params.maxSpeed);
  return {
    steps, seed, kernelCalls: snap.kernelCalls, viewport: snap.viewport,
    clumps: clump.clumps, headingSpread: clump.headingSpread, speedFraction: clump.meanSpeed, meanSpeed: clump.meanSpeed * maxSpeed,
    velocityCoherence: clump.velocityCoherence, masses: clump.masses, headings: clump.headings,
    stateSha256: snap.stateSha256, image: retainedImage, artifact: retainedImage ? null : shotPath,
  };
}

function s152Score(samples: S152Sample[]): S152Row["metrics"] {
  return {
    score: clumpScore(samples),
    minClumps: Math.min(...samples.map(s => s.clumps)),
    minHeadingSpread: Math.min(...samples.map(s => s.headingSpread)),
    minMeanSpeed: Math.min(...samples.map(s => s.meanSpeed)),
  };
}

/** Run `jobs` across a pool of pages that share the context; the first page is the test's own. */
async function s152Pool<T, R>(page: Page, jobs: T[], work: (job: T, pg: Page) => Promise<R>): Promise<R[]> {
  const pages: Page[] = [page];
  for (let i = 1; i < Math.min(S152_CONCURRENCY, jobs.length); i += 1) { const extra = await page.context().newPage(); await extra.goto("/"); pages.push(extra); }
  const out: R[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(pages.map(async pg => { for (;;) { const idx = next++; if (idx >= jobs.length) return; out[idx] = await work(jobs[idx], pg); } }));
  for (const extra of pages.slice(1)) await extra.close();
  return out;
}

async function s152BuildPresets(page: Page, rows: { id: string; params: Params }[]): Promise<unknown[]> {
  return page.evaluate(async rows => {
    const base = "http://localhost:5173/src/app/";
    const reg: any = await import(/* @vite-ignore */ base + "registry.ts");
    const cm: any = await import(/* @vite-ignore */ base + "colormap.ts");
    const qp: any = await import(/* @vite-ignore */ base + "qualityProfiles.ts");
    const rm: any = await import(/* @vite-ignore */ base + "renderModes.ts");
    const sp: any = await import(/* @vite-ignore */ base + "savedPresets.ts");
    const kernel = await reg.findEntry("boids").load();
    const defaults = Object.fromEntries(kernel.paramSchema.map((p: any) => [p.key, p.default]));
    const colourOptions = cm.defaultColourOptionsFor("boids", kernel.channelCount);
    kernel.destroy();
    return rows.map(row => {
      const p = row.params as any;
      return {
        id: `boids-152-${row.id}`,
        name: `Boids 152 · speed ${p.maxSpeed}, cohesion ${p.cohesion}, ${p.initialFlocks} flocks`,
        snapshot: {
          slug: "boids", params: { ...defaults, ...p }, colourOptions: structuredClone(colourOptions),
          displayOptions: sp.defaultDisplayOptionsFor("boids"),
          resolution: qp.qualityProfileFor("boids", rm.getRenderMode("boids"), "desktop").defaultPreset,
          stepsPerFrame: sp.speedProfileFor("boids").initial, autoCycle: false,
        },
      };
    });
  }, rows);
}

function s152WritePresets(entries: unknown[]): void {
  writeText(S152_PRESETS, JSON.stringify({ format: "emergence-presets", version: 1, presets: entries }, null, 2) + "\n");
}

test.describe("sweep 152 boids clump regimes", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  s152Main("sweep 152 boids clump regimes", async ({ page }) => {
    test.setTimeout(14_000_000);
    const config = SWEEP_CONFIGS["sweep-152-boids"];
    const sets = expandSweep(config);
    const candidates = sets.map(params => ({ id: s152Id(config, params), label: s152Label(params), params }));
    expect(new Set(candidates.map(c => c.id)).size).toBe(27);
    const references = config.references.map(r => ({ id: r.id, label: r.label, params: r.params as Params }));
    const manifest = {
      slug: "boids", methodVersion: S152_VERSION, command: S152_COMMAND, canvasCss: S152_CANVAS, steps: S152_STEPS, metricOptions: S152_METRIC_OPTIONS,
      seeds: { main: S152_MAIN_SEED, repeats: S152_REPEAT_SEEDS, repeatSteps: S152_REPEAT_STEPS },
      ranking: "row score = min over samples of clamp((clumps-1)/4,0,1) x headingSpread x clamp(meanSpeed/40,0,1); meanSpeed = speedFraction x the row's maxSpeed",
      candidates, references: references.map(r => ({ id: r.id, params: r.params })),
      priorCoverage: [
        { source: "e2e/harness/sims.ts", description: "SWEEP_144_BOIDS and the 2026-07-16 BOIDS grid: maxSpeed pinned at 16, cohesion 0 in every stage-144 finalist, 2500-boid 200x200 sweep grids" },
        { source: "docs/sweeps/boids-interestingness.md", description: "stage-144 report and app-renderer supplement; its composite rewards even coverage, the opposite of clumping" },
        { source: "docs/sweeps/data/2026-10-30/144/boids.json", description: "stage-144 retained ranking and finalists" },
      ],
    };
    const ranked: S152Row[] = [];
    const referenceRows: S152Row[] = [];
    let finalists: unknown[] = [];
    const runtime = { startedAt: new Date().toISOString(), browser: page.context().browser()?.version(), node: process.version, platform: process.platform };
    const save = (status: string) => writeText(S152_DATA, JSON.stringify({
      status, manifest,
      ranked: [...ranked].sort((a, b) => b.metrics.score - a.metrics.score),
      references: referenceRows, finalists, runtime,
    }, null, 2) + "\n");
    save("running: manifest written, nothing measured yet");

    type Job = { kind: "candidate" | "reference"; row: { id: string; label: string; params: Params } };
    const jobs: Job[] = [...references.map(row => ({ kind: "reference" as const, row })), ...candidates.map(row => ({ kind: "candidate" as const, row }))];
    mkdirSync(S152_ARTIFACTS, { recursive: true });
    await s152Pool(page, jobs, async (job, pg) => {
      const t0 = Date.now();
      const samples: S152Sample[] = [];
      for (const steps of S152_STEPS) {
        const reference = job.kind === "reference";
        const shot = reference ? `${S152_IMAGES}/${job.row.id}-t${steps}.png` : `${S152_ARTIFACTS}/${job.row.id}-t${steps}.png`;
        mkdirSync(reference ? S152_IMAGES : S152_ARTIFACTS, { recursive: true });
        samples.push(await s152Capture(pg, job.row.params, S152_MAIN_SEED, steps, shot, reference ? shot : null));
      }
      const row: S152Row = { ...job.row, effectivePopulation: S152_POPULATION, samples, metrics: s152Score(samples), wallClockMs: Date.now() - t0 };
      (job.kind === "reference" ? referenceRows : ranked).push(row);
      save(`running: ${ranked.length} of ${candidates.length} candidates, ${referenceRows.length} of ${references.length} references`);
      console.log(`152 ${job.kind} ${row.id} score ${row.metrics.score.toFixed(4)} clumps ${samples.map(s => s.clumps).join("/")} spread ${samples.map(s => s.headingSpread.toFixed(2)).join("/")} speed ${samples.map(s => s.meanSpeed.toFixed(1)).join("/")} in ${(row.wallClockMs / 1000).toFixed(0)}s`);
      return row;
    });
    const order = new Map(candidates.map((c, i) => [c.id, i]));
    ranked.sort((a, b) => b.metrics.score - a.metrics.score || order.get(a.id)! - order.get(b.id)!);
    referenceRows.sort((a, b) => references.findIndex(r => r.id === a.id) - references.findIndex(r => r.id === b.id));
    expect(ranked.length, "every set measured").toBe(27);
    expect(referenceRows.length, "every reference measured").toBe(3);

    const top = ranked.slice(0, S152_FINALISTS);
    for (const row of top) for (const sample of row.samples) {
      const retained = `${S152_IMAGES}/152-boids-${row.id}-t${sample.steps}.png`;
      copyFileSync(sample.artifact!, retained);
      sample.image = retained;
      sample.artifact = null;
    }
    save("running: ranked, finalist repeats pending");
    const repeatJobs = top.flatMap(row => S152_REPEAT_SEEDS.map(seed => ({ row, seed })));
    const repeats = await s152Pool(page, repeatJobs, async ({ row, seed }, pg) => {
      const shot = `${S152_IMAGES}/152-boids-${row.id}-seed${seed}-t${S152_REPEAT_STEPS}.png`;
      return { id: row.id, sample: await s152Capture(pg, row.params, seed, S152_REPEAT_STEPS, shot, shot) };
    });
    finalists = top.map(row => ({ id: row.id, repeats: repeats.filter(r => r.id === row.id).map(r => r.sample) }));
    save("complete");
    s152WritePresets(await s152BuildPresets(page, top));
    console.log(`152 finalists ${top.map(r => r.id).join(", ")}`);
  });

  s152Presets("sweep 152 boids presets", async ({ page }) => {
    const retained = JSON.parse(readFileSync(S152_DATA, "utf8"));
    const extra = process.env.SWEEP_152_PRESET_IDS!.split(",").map(s => s.trim()).filter(Boolean);
    const ids: string[] = [...retained.finalists.map((f: { id: string }) => f.id), ...extra.filter(id => !retained.finalists.some((f: { id: string }) => f.id === id))];
    const rows = ids.map(id => { const row = (retained.ranked as S152Row[]).find(r => r.id === id); if (!row) throw new Error(`${id} is not a ranked candidate`); return { id, params: row.params }; });
    expect(rows.length).toBeLessThanOrEqual(9);
    s152WritePresets(await s152BuildPresets(page, rows));
  });

  s152Replay("sweep 152 boids replay", async ({ page }) => {
    test.setTimeout(7_200_000);
    const retained = JSON.parse(readFileSync(S152_DATA, "utf8"));
    const rows: { id: string; params: Params }[] = [
      ...retained.finalists.map((f: { id: string }) => (retained.ranked as S152Row[]).find(r => r.id === f.id)!),
      ...retained.references,
    ];
    // Seed 0 repeats the retained main captures at all three steps; seeds 11 to 13 at 600 steps are fresh runs.
    const replaySeeds = [11, 12, 13];
    const jobs = rows.flatMap(row => [
      ...S152_STEPS.map(steps => ({ row, seed: S152_MAIN_SEED, steps })),
      ...replaySeeds.map(seed => ({ row, seed, steps: S152_REPEAT_STEPS })),
    ]);
    mkdirSync(`${S152_ARTIFACTS}/replay`, { recursive: true });
    const samples = await s152Pool(page, jobs, async ({ row, seed, steps }, pg) => {
      const sample = await s152Capture(pg, row.params, seed, steps, `${S152_ARTIFACTS}/replay/${row.id}-seed${seed}-t${steps}.png`, null);
      return { id: row.id, ...sample };
    });
    writeText(`${S152_ARTIFACTS}/replay/replay.json`, JSON.stringify({ command: S152_REPLAY_COMMAND, retained: S152_DATA, samples }, null, 2) + "\n");
    for (const s of samples) console.log(`152 replay ${s.id} seed ${s.seed} t${s.steps} clumps ${s.clumps} spread ${s.headingSpread.toFixed(3)} speed ${s.meanSpeed.toFixed(2)}`);
  });
});
