/**
 * Interestingness metrics for a simulation frame.
 *
 * A "frame" here is a single scalar field: the kernel's primary channel,
 * normalised to [0, 1] via its channelRange. Every kernel in emergence-lab
 * rasterises its state to a width*height*channelCount Float32Array (particle
 * sims included), so one channel of that field is a uniform representation we
 * can score the same way for every model.
 *
 * Scoring the float field, not the rendered pixels, is deliberate: the field is
 * the deterministic ground truth the renderer merely colours. Same params +
 * same step count => identical field => identical score, with no dependence on
 * colour map, GPU, or frame timing. That is what makes the sweep reproducible.
 *
 * This module has no imports so it runs unchanged in Node (the test process,
 * where it is unit-tested) and in the browser page (if ever needed there).
 */

export type Field = ArrayLike<number>;

export interface FrameMetrics {
  /** Shannon entropy of the intensity histogram, normalised to [0, 1]. */
  entropy: number;
  /** Population variance of the normalised intensities, in [0, 0.25]. */
  variance: number;
  /**
   * Lag-1 spatial autocorrelation (Moran's-I style): covariance between each
   * cell and its right/down neighbours divided by the field variance. ~[-1, 1].
   * Near 0 for white noise, high for coherent structure, negative for
   * checkerboard anti-correlation.
   */
  spatialAutocorrelation: number;
  /** Fraction of cells above the background threshold, in [0, 1]. */
  coverage: number;
}

export interface InterestingnessMetrics extends FrameMetrics {
  /** Mean absolute per-cell change between two frames, in [0, 1]. */
  temporalFlux: number;
  /** Composite interestingness score, in [0, 1]. Higher is more interesting. */
  score: number;
  /** Mean resultant length for an opted-in phase channel, in [0, 1]. */
  meanResultantLength?: number;
  /** Lag-1 circular coherence for an opted-in phase channel, in [-1, 1]. */
  circularSpatialAutocorrelation?: number;
  /**
   * Multi-lag spatial structure reading (see multiLagSpatialAutocorrelation).
   * Reported beside spatialAutocorrelation for comparison; not populated by
   * frameMetrics/scoreFrames and not part of the composite — callers compute
   * it explicitly where the extra pass is wanted.
   */
  multiLagStructure?: number;
  /**
   * Polarisation order parameter over the sim's velocity channels, in [0, 1].
   * Only present for point-cloud sims that opt in (see velocityCoherence);
   * never feeds the composite score.
   */
  velocityCoherence?: number;
  /**
   * Mean per-cell channel-mixing fraction over the sim's like-kind density
   * channels, in [0, 1 - 1/channelCount] (see channelMixing). Only present for
   * point-cloud sims whose channels are all densities; never feeds the
   * composite score.
   */
  channelMixing?: number;
}

export interface MetricSpread {
  min: number;
  max: number;
  standardDeviation: number;
}

export interface MultiSnapshotMetrics extends InterestingnessMetrics {
  sampleCount: number;
  spread: Partial<Record<keyof InterestingnessMetrics, MetricSpread>>;
}

const DEFAULT_BINS = 32;
const DEFAULT_COVERAGE_THRESHOLD = 0.08;

function mean(values: Field): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += values[i];
  return sum / n;
}

/**
 * Shannon entropy of the intensity histogram, normalised to [0, 1] by log2(bins).
 * A flat field scores 0; a field that fills every bin evenly scores 1. High
 * entropy means a rich spread of intensities — but white noise is also high
 * entropy, which is why the composite pairs it with spatial autocorrelation.
 */
export function entropy(values: Field, bins = DEFAULT_BINS): number {
  const n = values.length;
  if (n === 0 || bins <= 1) return 0;
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < n; i += 1) {
    let b = Math.floor(values[i] * bins);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    counts[b] += 1;
  }
  let h = 0;
  for (let b = 0; b < bins; b += 1) {
    const p = counts[b] / n;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h / Math.log2(bins);
}

/** Population variance of the normalised intensities. */
export function variance(values: Field): number {
  const n = values.length;
  if (n === 0) return 0;
  const m = mean(values);
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    const d = values[i] - m;
    acc += d * d;
  }
  return acc / n;
}

/**
 * Lag-1 spatial autocorrelation over right and down neighbour pairs (interior,
 * non-toroidal). Returns covariance(cell, neighbour) / variance(field), which is
 * a Moran's-I-like coherence measure: ~0 for white noise, → 1 for smoothly
 * varying structure, < 0 for high-frequency anti-correlation (checkerboards).
 */
export function spatialAutocorrelation(
  values: Field,
  width: number,
  height: number,
): number {
  if (width < 2 || height < 2 || values.length < width * height) return 0;
  const m = mean(values);
  let cov = 0;
  let pairs = 0;
  let varAcc = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const d = values[i] - m;
      varAcc += d * d;
      if (x + 1 < width) {
        cov += d * (values[i + 1] - m);
        pairs += 1;
      }
      if (y + 1 < height) {
        cov += d * (values[i + width] - m);
        pairs += 1;
      }
    }
  }
  const n = width * height;
  const fieldVar = varAcc / n;
  if (fieldVar <= 1e-12 || pairs === 0) return 0;
  return cov / pairs / fieldVar;
}

const DEFAULT_LAGS = [1, 2, 3, 4, 6, 8];

/**
 * Multi-lag spatial structure term: the same covariance/variance construction
 * as spatialAutocorrelation, generalised to a set of lag distances and
 * reporting the strongest (most positive) reading found at any of them.
 *
 * The instrument gap this closes: a fine-scale periodic pattern (Game of
 * Life's "Maze-like" — one-cell corridors alternating with one-cell walls) is
 * anti-correlated at lag 1, exactly the signal white noise also produces
 * there, so a lag-1-only reading cannot tell the two apart. At lag 2 the
 * corridor cells share phase with each other, so a periodic pattern lights up
 * positively somewhere in the lag set even though its fundamental period
 * makes lag 1 negative. White noise has no phase to share at any lag, so its
 * per-lag readings stay near zero and the max across lags stays low too.
 *
 * Chosen over an FFT band-energy term because it reuses the exact
 * covariance/variance formula already in this module at a different
 * neighbour offset — no transform, no new numerical machinery, no
 * dependencies, and each lag's reading is as easy to reason about as the
 * existing lag-1 term.
 */
export function multiLagSpatialAutocorrelation(
  values: Field,
  width: number,
  height: number,
  lags: number[] = DEFAULT_LAGS,
): number {
  if (width < 2 || height < 2 || values.length < width * height) return 0;
  const m = mean(values);
  let varAcc = 0;
  for (let i = 0; i < values.length; i += 1) {
    const d = values[i] - m;
    varAcc += d * d;
  }
  const fieldVar = varAcc / (width * height);
  if (fieldVar <= 1e-12) return 0;

  let best = -Infinity;
  for (const lag of lags) {
    if (lag < 1 || lag >= width || lag >= height) continue;
    let cov = 0;
    let pairs = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const d = values[i] - m;
        if (x + lag < width) {
          cov += d * (values[i + lag] - m);
          pairs += 1;
        }
        if (y + lag < height) {
          cov += d * (values[i + lag * width] - m);
          pairs += 1;
        }
      }
    }
    if (pairs === 0) continue;
    const reading = cov / pairs / fieldVar;
    if (reading > best) best = reading;
  }
  return best === -Infinity ? 0 : best;
}

/**
 * Circular order parameter for phases normalised to [0, 1]. Each value is
 * mapped to an angle on [0, 2π); the length of their mean unit vector is 1
 * for perfect synchrony and approaches 0 for phases spread around the circle.
 */
export function meanResultantLength(values: Field, inclusionMask?: Field): number {
  if (values.length === 0) return 0;
  let sumCos = 0;
  let sumSin = 0;
  let included = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (inclusionMask && !(inclusionMask[i] > 0)) continue;
    const angle = values[i] * Math.PI * 2;
    sumCos += Math.cos(angle);
    sumSin += Math.sin(angle);
    included += 1;
  }
  return included === 0 ? 0 : clamp01(Math.hypot(sumCos, sumSin) / included);
}

/**
 * Lag-1 circular spatial autocorrelation over right and down neighbour pairs
 * (interior, non-toroidal). This is the mean cosine of the angular difference:
 * 1 for locally aligned phases, 0 for unrelated neighbours, and -1 for
 * anti-phase neighbours. Unlike linear covariance, crossing phase 1 -> 0 does
 * not create a false discontinuity.
 */
export function circularSpatialAutocorrelation(
  values: Field,
  width: number,
  height: number,
  inclusionMask?: Field,
): number {
  if (width < 1 || height < 1 || values.length < width * height) return 0;
  let coherence = 0;
  let pairs = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (inclusionMask && !(inclusionMask[i] > 0)) continue;
      const angle = values[i] * Math.PI * 2;
      if (x + 1 < width && (!inclusionMask || inclusionMask[i + 1] > 0)) {
        coherence += Math.cos((values[i + 1] * Math.PI * 2) - angle);
        pairs += 1;
      }
      if (y + 1 < height && (!inclusionMask || inclusionMask[i + width] > 0)) {
        coherence += Math.cos((values[i + width] * Math.PI * 2) - angle);
        pairs += 1;
      }
    }
  }
  return pairs === 0 ? 0 : coherence / pairs;
}

/** Fraction of cells whose normalised intensity exceeds the background threshold. */
export function coverage(
  values: Field,
  threshold = DEFAULT_COVERAGE_THRESHOLD,
): number {
  const n = values.length;
  if (n === 0) return 0;
  let above = 0;
  for (let i = 0; i < n; i += 1) {
    if (values[i] > threshold) above += 1;
  }
  return above / n;
}

/** Mean absolute per-cell difference between two equally sized frames. */
export function temporalFlux(a: Field, b: Field): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i += 1) acc += Math.abs(a[i] - b[i]);
  return acc / n;
}

export function frameMetrics(
  values: Field,
  width: number,
  height: number,
  coverageThreshold = DEFAULT_COVERAGE_THRESHOLD,
): FrameMetrics {
  return {
    entropy: entropy(values),
    variance: variance(values),
    spatialAutocorrelation: spatialAutocorrelation(values, width, height),
    coverage: coverage(values, coverageThreshold),
  };
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Composite interestingness score in [0, 1]. The design intent:
 *
 *  - coverageFactor: a pattern must fill space but not saturate it. Plateaus at
 *    1 for coverage in roughly [0.12, 0.85], ramping to 0 at empty (0) and full
 *    (1). An empty field and a solid block are both uninteresting.
 *  - structure (spatial autocorrelation, clamped ≥ 0): rewards coherent
 *    organisation and starves white noise, which scores ~0 here.
 *  - detail (entropy): rewards a rich spread of intensities over a flat field.
 *  - liveliness (temporal flux): a gentle multiplicative bonus so an actively
 *    evolving regime edges out an otherwise-equal frozen one, without punishing
 *    legitimately static Turing patterns (floor 0.85).
 *
 * score = coverageFactor * (0.55*structure + 0.45*detail) * liveliness
 */
export function interestingness(
  frame: FrameMetrics,
  temporalFluxValue: number,
): number {
  const cov = frame.coverage;
  const lo = clamp01(cov / 0.12);
  const hi = clamp01((1 - cov) / 0.15);
  const coverageFactor = lo * hi;

  const structure = clamp01(frame.spatialAutocorrelation);
  const detail = clamp01(frame.entropy);
  const liveliness = 0.85 + 0.15 * Math.tanh(temporalFluxValue * 40);

  return coverageFactor * (0.55 * structure + 0.45 * detail) * liveliness;
}

/** Convenience: full metric set + composite from two frames of the same field. */
export function scoreFrames(
  frameA: Field,
  frameB: Field,
  width: number,
  height: number,
  coverageThreshold = DEFAULT_COVERAGE_THRESHOLD,
): InterestingnessMetrics {
  const fm = frameMetrics(frameA, width, height, coverageThreshold);
  const flux = temporalFlux(frameA, frameB);
  return { ...fm, temporalFlux: flux, score: interestingness(fm, flux) };
}

/** Mean metrics and population spread for deterministic frame-pair samples. */
export function summarizeMetrics(
  samples: InterestingnessMetrics[],
): MultiSnapshotMetrics {
  if (samples.length === 0) {
    throw new Error("summarizeMetrics requires at least one sample");
  }

  const keys: (keyof InterestingnessMetrics)[] = [
    "entropy",
    "variance",
    "spatialAutocorrelation",
    "coverage",
    "temporalFlux",
    "score",
    "meanResultantLength",
    "circularSpatialAutocorrelation",
    "velocityCoherence",
    "channelMixing",
  ];
  const means: Partial<Record<keyof InterestingnessMetrics, number>> = {};
  const spread: Partial<Record<keyof InterestingnessMetrics, MetricSpread>> = {};

  for (const key of keys) {
    const values = samples
      .map((sample) => sample[key])
      .filter((value): value is number => value !== undefined);
    if (values.length === 0) continue;

    const metricMean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const squaredDeviation = values.reduce(
      (sum, value) => sum + (value - metricMean) ** 2,
      0,
    );
    means[key] = metricMean;
    spread[key] = {
      min: Math.min(...values),
      max: Math.max(...values),
      standardDeviation: Math.sqrt(squaredDeviation / values.length),
    };
  }

  return {
    entropy: means.entropy!,
    variance: means.variance!,
    spatialAutocorrelation: means.spatialAutocorrelation!,
    coverage: means.coverage!,
    temporalFlux: means.temporalFlux!,
    score: means.score!,
    ...(means.meanResultantLength === undefined
      ? {}
      : { meanResultantLength: means.meanResultantLength }),
    ...(means.circularSpatialAutocorrelation === undefined
      ? {}
      : { circularSpatialAutocorrelation: means.circularSpatialAutocorrelation }),
    ...(means.velocityCoherence === undefined
      ? {}
      : { velocityCoherence: means.velocityCoherence }),
    ...(means.channelMixing === undefined
      ? {}
      : { channelMixing: means.channelMixing }),
    sampleCount: samples.length,
    spread,
  };
}

/*
 * ---------------------------------------------------------------------------
 * Point-cloud instruments (stage 63). Everything below is additive: the four
 * metrics and the composite above are untouched, and a sim only reaches these
 * through an explicit `pointCloud` opt-in on its sweep config. Two sweeps
 * recorded the same null result for sparse particle sims (boids 2026-07-16,
 * Particle Life 2026-08-23): a one-cell dot next to an empty cell is maximally
 * anti-correlated at lag 1 no matter how the dots are clustered, so clumping
 * is invisible to the raw stack. The fix both write-ups name: score a
 * smoothed density field, and score the organisation directly.
 * ---------------------------------------------------------------------------
 */

/**
 * Gaussian blur of a field, separable and toroidal (every sim here wraps).
 * `radius` is the kernel support in cells each side of centre; sigma is
 * radius/2 so the tap at the edge of the support carries ~13% of the centre
 * weight. Weights are normalised, so the field mean is preserved exactly.
 */
export function gaussianBlur(
  values: Field,
  width: number,
  height: number,
  radius: number,
): number[] {
  const n = width * height;
  const out = new Array<number>(n);
  if (n === 0 || values.length < n) return [];
  const r = Math.round(radius);
  if (r < 1) {
    for (let i = 0; i < n; i += 1) out[i] = values[i];
    return out;
  }
  const sigma = r / 2;
  const taps = new Array<number>(2 * r + 1);
  let weight = 0;
  for (let k = -r; k <= r; k += 1) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    taps[k + r] = w;
    weight += w;
  }
  for (let k = 0; k < taps.length; k += 1) taps[k] /= weight;

  const tmp = new Array<number>(n);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -r; k <= r; k += 1) {
        let xx = (x + k) % width;
        if (xx < 0) xx += width;
        acc += taps[k + r] * values[row + xx];
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -r; k <= r; k += 1) {
        let yy = (y + k) % height;
        if (yy < 0) yy += height;
        acc += taps[k + r] * tmp[yy * width + x];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

/**
 * Point-cloud preprocess: blur both frames of a sparse density field, then
 * rescale both by their joint maximum so the smoothed field spans [0, 1].
 * The blur turns dot occupancy into a graded density surface that lag-1
 * autocorrelation can actually read; the rescale matters because a blurred
 * spike of height 1 flattens to ~1/(2*pi*sigma^2), which would park the whole
 * histogram in the lowest entropy bin. One shared factor (not per-frame)
 * keeps frame A and B comparable so temporal flux stays meaningful.
 */
export function smoothPointCloudFrames(
  frameA: Field,
  frameB: Field,
  width: number,
  height: number,
  blurRadius: number,
): { frameA: number[]; frameB: number[] } {
  const a = gaussianBlur(frameA, width, height, blurRadius);
  const b = gaussianBlur(frameB, width, height, blurRadius);
  let max = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] > max) max = a[i];
  for (let i = 0; i < b.length; i += 1) if (b[i] > max) max = b[i];
  if (max > 0) {
    const inv = 1 / max;
    for (let i = 0; i < a.length; i += 1) a[i] *= inv;
    for (let i = 0; i < b.length; i += 1) b[i] *= inv;
  }
  return { frameA: a, frameB: b };
}

/**
 * Polarisation order parameter over a rasterised velocity field: the magnitude
 * of the summed cell velocity vectors divided by the summed magnitudes,
 * in [0, 1]. 1 means every occupied cell moves the same way (a single
 * coherent flock); ~0 means directions cancel (disordered swarm, or several
 * flocks in balanced opposition). Cells with zero velocity (unoccupied cells
 * rasterise to 0) drop out of both sums, so no separate occupancy mask is
 * needed. Inputs are signed velocity components in the kernel's own units;
 * scale cancels in the ratio.
 */
export function velocityCoherence(vx: Field, vy: Field): number {
  const n = Math.min(vx.length, vy.length);
  let sumX = 0;
  let sumY = 0;
  let sumMag = 0;
  for (let i = 0; i < n; i += 1) {
    const mag = Math.hypot(vx[i], vy[i]);
    if (mag <= 0) continue;
    sumX += vx[i];
    sumY += vy[i];
    sumMag += mag;
  }
  if (sumMag <= 1e-12) return 0;
  return Math.hypot(sumX, sumY) / sumMag;
}

/**
 * Mean channel-mixing fraction over a set of like-kind density channels.
 *
 * Per included cell: `1 - max_c(fields[c][i]) / sum_c(fields[c][i])` — the
 * fraction of that cell's total density held by channels other than its
 * dominant one. The reading is the mean of that fraction over included cells.
 *
 * A cell is included when the optional `mask` marks it (`mask[i] > 0`, the same
 * convention the circular statistics above use) *and* its total density is
 * positive. Callers build the mask from the sim's point-cloud coverage
 * threshold applied to the smoothed total-density field, so "included" means
 * the same figure/ground split the composite's coverage term already uses.
 * With no mask, every cell carrying density is included. Empty cells have no
 * dominant channel and are never included, so they cannot drag the mean down.
 *
 * **Units:** a dimensionless fraction of per-cell density. It is a ratio within
 * each cell, so it is invariant to any rescaling applied equally to all
 * channels — blurred-and-normalised fields and raw ones read the same, as long
 * as one common factor was used.
 *
 * **Range: [0, 1 - 1/C] for C channels**, not [0, 1]. A field whose every
 * occupied cell holds all its density in one channel (perfect segregation)
 * reads 0. A field whose every occupied cell is an even C-way blend reads the
 * maximum 1 - 1/C, which is 2/3 for the three-channel raster this harness
 * produces. Read a value against 1 - 1/C, never against 1.
 *
 * **What it measures, and what it does not.** The harness rasterises a particle
 * sim into colour channels — for Particle Life, red/green/blue species density
 * — not one channel per species. So this reads *colour-channel* mixing and is a
 * proxy for species adjacency, not a measure of it: species that share a colour
 * channel are invisible to it, and a sim with more species than channels folds
 * several species into one reading. Report it as a channel proxy.
 *
 * Reported beside the composite for opted-in point-cloud sims; it never enters
 * `interestingness`, exactly as velocityCoherence does not.
 */
export function channelMixing(fields: readonly Field[], mask?: Field): number {
  if (fields.length < 2) return 0;
  let cells = fields[0].length;
  for (const field of fields) cells = Math.min(cells, field.length);
  if (cells === 0) return 0;

  let acc = 0;
  let included = 0;
  for (let i = 0; i < cells; i += 1) {
    if (mask && !(mask[i] > 0)) continue;
    let total = 0;
    let dominant = 0;
    for (let c = 0; c < fields.length; c += 1) {
      const density = fields[c][i];
      if (!(density > 0)) continue;
      total += density;
      if (density > dominant) dominant = density;
    }
    if (total <= 0) continue;
    acc += 1 - dominant / total;
    included += 1;
  }
  return included === 0 ? 0 : acc / included;
}
