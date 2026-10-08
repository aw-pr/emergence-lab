/**
 * Inside-out colour mapping for the Logistic Mandelbrot orbit renderer.
 *
 * Every bounded cell carries the centre height h0(c) of its orbit: the mean of
 * Re(z) over one cycle when a period is detected, otherwise over a long
 * running window (model.ts, AttractorCellMeasure). Inside-out mode reads the
 * palette at fract(bands·|height − h0| − phase), so colour depends only on how
 * far a point sits above or below its column's centre: a period-1 sheet is at
 * distance zero and takes one colour that changes with the phase; the two
 * branches of a period-2 cycle are equally far from the centre and share a
 * hue; a chaotic column runs through several laps between its extremes. At a
 * positive forward speed a fixed colour travels to larger distance, out of
 * each column's centre upward and downward along the sheets; reversing
 * negates the phase rate and nothing else. The distance is never clamped.
 *
 * The ground reads the same function with the column's RMS deviation as the
 * height and zero as the centre: fract(bands·spread − phase).
 *
 * The GLSL string is spliced into the point, sheet and ground shaders so all
 * three evaluate one definition; the TypeScript twin is the reference the
 * tests compare rendered palette lookups against. Pure: no DOM, no WebGL.
 */

/** Attraction-field classification, stored in the field texture's B channel. */
export const ATTRACTION_ESCAPED = 0;
export const ATTRACTION_UNRESOLVED = 0.5;
export const ATTRACTION_RESOLVED = 1;

/**
 * A sampled cell is escaped, resolved (period detected) or unresolved
 * (bounded within the sampler budget, no period found). Both bounded classes
 * are coloured; only escaped texels keep the ground's escape-time colouring,
 * and the class comes from the escape flag and period, never from the centre
 * (an escaped cell's zero-filled window reads centre 0).
 */
export function classifyAttraction(escaped: boolean, period: number): number {
  if (escaped) return ATTRACTION_ESCAPED;
  return period > 0 ? ATTRACTION_RESOLVED : ATTRACTION_UNRESOLVED;
}

/** Palette coordinate fract(bands·|height − centre| − phase). */
export function spreadPaletteCoordinate(
  height: number,
  centre: number,
  cycleBands: number,
  phase: number,
): number {
  const value = cycleBands * Math.abs(height - centre) - phase;
  return value - Math.floor(value);
}

export const INSIDE_OUT_GLSL = `
float spreadPaletteCoordinate(float height, float centre, float bands, float phase) {
  return fract(bands * abs(height - centre) - phase);
}
`;
