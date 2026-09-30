/**
 * Inside-out colour mapping for the Logistic Mandelbrot orbit renderer.
 *
 * A cell with a detected period-q attracting cycle carries the multiplier
 * magnitude m = |∏ 2·z_j| over one complete cycle: 0 at the bulb's
 * superattracting centre, approaching 1 near the bulb edge where attraction
 * weakens. Inside-out mode reads the palette at fract(bands·m − phase), so at
 * a positive forward speed (phase increasing) a fixed colour travels towards
 * larger m, from the bulb centre outwards; reversing negates the phase rate
 * and nothing else. Height, Re(c), Im(c) and boundary distance play no part.
 *
 * The GLSL string is spliced into the point, sheet and ground shaders so all
 * three evaluate one definition; the TypeScript twin is the reference the
 * tests compare rendered palette lookups against. Pure: no DOM, no WebGL.
 */

/** Attraction-field classification, stored in the field texture's G channel. */
export const ATTRACTION_ESCAPED = 0;
export const ATTRACTION_UNRESOLVED = 0.5;
export const ATTRACTION_RESOLVED = 1;

/** Steady colour for bounded cells with no detected period. */
export const INSIDE_OUT_NEUTRAL: readonly [number, number, number] = [0.44, 0.47, 0.53];

/**
 * A sampled cell is escaped, resolved (period detected, multiplier measured)
 * or unresolved (bounded within the sampler budget, no period found). A
 * clamped multiplier of 1 without a period is not a measurement, so the
 * classification comes from the period, never from the multiplier value.
 */
export function classifyAttraction(escaped: boolean, period: number): number {
  if (escaped) return ATTRACTION_ESCAPED;
  return period > 0 ? ATTRACTION_RESOLVED : ATTRACTION_UNRESOLVED;
}

/** Palette coordinate for a resolved cell: fract(bands·m − phase). */
export function insideOutPaletteCoordinate(
  multiplier: number,
  cycleBands: number,
  phase: number,
): number {
  const m = Math.max(0, Math.min(1, multiplier));
  const value = cycleBands * m - phase;
  return value - Math.floor(value);
}

export const INSIDE_OUT_GLSL = `
const vec3 INSIDE_OUT_NEUTRAL = vec3(${INSIDE_OUT_NEUTRAL.map((v) => v.toFixed(2)).join(", ")});

float insideOutCoordinate(float multiplier, float bands, float phase) {
  return fract(bands * clamp(multiplier, 0.0, 1.0) - phase);
}
`;
