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
