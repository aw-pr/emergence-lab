/**
 * Logistic-Mandelbrot attractor sampler.
 *
 * For each c in a rectangle of the complex plane, iterate z ← z² + c from
 * z = 0, discard a transient warmup, then record the next K values of Re(z),
 * clipped to |Re(z)| ≤ 2. An orbit that leaves |z| ≤ 2 at any point during
 * warmup or sampling escapes and contributes nothing.
 *
 * On the real axis this point set is the logistic-map bifurcation diagram:
 * x ← r·x·(1 − x) is conjugate to z ← z² + c under z = r/2 − r·x with
 * c = (r/2)·(1 − r/2). Over each hyperbolic bulb of the Mandelbrot set the
 * samples land on that bulb's attracting period-q limit cycle.
 *
 * Everything here is pure and deterministic: no DOM, no WebGL, no RNG.
 */

export const RE_MIN = -2;
export const RE_MAX = 1;
export const IM_MIN = -1;
export const IM_MAX = 1;

export const DEFAULT_WARMUP_ITERATIONS = 200;
export const DEFAULT_SAMPLE_COUNT = 48;

export const ESCAPE_RADIUS = 2;
export const SAMPLE_CLIP = 2;

/** Return value of sampleAttractorCell for orbits that leave |z| <= 2. */
export const ESCAPED = -1;

export const MAX_DETECTABLE_PERIOD = 32;

/**
 * Attracting cycles reached via 200 warmup iterations converge geometrically,
 * so away from bulb boundaries the residual is far below this. A chaotic orbit
 * matching itself within this tolerance across an entire sample window is
 * vanishingly unlikely, which keeps false periods out.
 */
export const PERIOD_TOLERANCE = 1e-4;

export interface CGridSpec {
  width: number;
  height: number;
  reMin: number;
  reMax: number;
  imMin: number;
  imMax: number;
}

export interface AttractorField {
  width: number;
  height: number;
  sampleCount: number;
  /**
   * width · height · sampleCount values of Re(z), row-major by cell,
   * clipped to |Re(z)| <= SAMPLE_CLIP. Escaped cells are zero-filled.
   */
  samples: Float32Array;
  /** 1 where the orbit escaped, else 0. */
  escaped: Uint8Array;
  /** Estimated attractor period per cell; 0 = escaped or none detected. */
  period: Uint16Array;
}

/** Centre of grid cell `index` along an axis spanning [min, max]. */
export function cellCoordinate(
  min: number,
  max: number,
  index: number,
  count: number,
): number {
  if (count <= 0) {
    return min;
  }

  return min + ((index + 0.5) / count) * (max - min);
}

/**
 * Smallest period q (1..maxPeriod) such that the window repeats with lag q
 * within `tolerance` at every offset, or 0 when no period is detected.
 */
export function estimatePeriod(
  samples: ArrayLike<number>,
  offset: number,
  count: number,
  tolerance: number = PERIOD_TOLERANCE,
  maxPeriod: number = MAX_DETECTABLE_PERIOD,
): number {
  const limit = Math.min(maxPeriod, count - 1);

  for (let q = 1; q <= limit; q += 1) {
    let matches = true;

    for (let n = offset; n + q < offset + count; n += 1) {
      const delta = samples[n + q] - samples[n];
      if (delta > tolerance || delta < -tolerance) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return q;
    }
  }

  return 0;
}

/**
 * Sample one c-cell: warm up, then write `sampleCount` clipped Re(z) values
 * into samplesOut at `offset`. Returns ESCAPED for escaping orbits (window is
 * zero-filled), otherwise the estimated period of the sample window.
 */
export function sampleAttractorCell(
  cRe: number,
  cIm: number,
  warmupIterations: number,
  sampleCount: number,
  samplesOut: Float32Array,
  offset: number,
): number {
  const escapeSquared = ESCAPE_RADIUS * ESCAPE_RADIUS;
  let zr = 0;
  let zi = 0;

  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;

    if (zr * zr + zi * zi > escapeSquared) {
      samplesOut.fill(0, offset, offset + sampleCount);
      return ESCAPED;
    }
  }

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const nextR = zr * zr - zi * zi + cRe;
    zi = 2 * zr * zi + cIm;
    zr = nextR;

    if (zr * zr + zi * zi > escapeSquared) {
      samplesOut.fill(0, offset, offset + sampleCount);
      return ESCAPED;
    }

    samplesOut[offset + sample] =
      zr > SAMPLE_CLIP ? SAMPLE_CLIP : zr < -SAMPLE_CLIP ? -SAMPLE_CLIP : zr;
  }

  return estimatePeriod(samplesOut, offset, sampleCount);
}

/** Sample every cell of a c-grid in one pass. */
export function sampleAttractorGrid(
  spec: CGridSpec,
  warmupIterations: number = DEFAULT_WARMUP_ITERATIONS,
  sampleCount: number = DEFAULT_SAMPLE_COUNT,
): AttractorField {
  const width = Math.max(0, Math.floor(spec.width));
  const height = Math.max(0, Math.floor(spec.height));
  const cells = width * height;
  const samples = new Float32Array(cells * sampleCount);
  const escaped = new Uint8Array(cells);
  const period = new Uint16Array(cells);

  for (let y = 0; y < height; y += 1) {
    const cIm = cellCoordinate(spec.imMin, spec.imMax, y, height);

    for (let x = 0; x < width; x += 1) {
      const cRe = cellCoordinate(spec.reMin, spec.reMax, x, width);
      const cell = y * width + x;
      const result = sampleAttractorCell(
        cRe,
        cIm,
        warmupIterations,
        sampleCount,
        samples,
        cell * sampleCount,
      );

      if (result === ESCAPED) {
        escaped[cell] = 1;
      } else {
        period[cell] = result;
      }
    }
  }

  return { width, height, sampleCount, samples, escaped, period };
}
