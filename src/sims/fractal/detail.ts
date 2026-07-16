export const MAX_FRACTAL_ZOOM = 100_000_000;
export const MAX_BASE_ITERATIONS = 2048;
export const MAX_EFFECTIVE_ITERATIONS = 4096;

export function effectiveIterationLimit(
  base: number,
  zoom: number,
  automatic: boolean,
): number {
  const boundedBase = Math.max(16, Math.min(MAX_BASE_ITERATIONS, Math.round(base)));
  if (!automatic) return boundedBase;
  const boost = Math.floor(48 * Math.log2(Math.max(1, zoom)));
  return Math.min(MAX_EFFECTIVE_ITERATIONS, boundedBase + boost);
}

/** Analytic interior tests for the Mandelbrot set's main cardioid and period-2 bulb. */
export function isInMandelbrotMainBodies(cx: number, cy: number): boolean {
  const x = cx - 0.25;
  const q = x * x + cy * cy;
  if (q * (q + x) <= 0.25 * cy * cy) return true;
  const bulbX = cx + 1;
  return bulbX * bulbX + cy * cy <= 0.0625;
}
