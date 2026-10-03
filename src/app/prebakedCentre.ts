/**
 * Column centres for a prebaked (ELPC v1) point cloud.
 *
 * The bake carries no centre, but it carries every plotted sample of every
 * column, so the centre Inside-out needs (the mean height of the orbit at
 * that c) can be recovered at load time. For a column with a detected period
 * q the mean of its first q samples is the exact cycle mean; a column with no
 * detected period takes the mean of its whole window, which for a 64-sample
 * bake is within about 0.05 height units of the long-run mean (card 99,
 * running-mean error at N = 64). Nothing is re-baked and the format is
 * unchanged.
 *
 * Layout is sample-major like the live build: point i of sample s in cell c
 * sits at s * cellCount + c, with the z coordinate quantized to u16 over
 * [-SAMPLE_CLIP, SAMPLE_CLIP]. The returned centres use the same
 * quantization so the shader dequantizes them with the position's offset and
 * scale, and they are expanded per point because vertex attributes are.
 * Pure: no DOM, no WebGL.
 */

const Z_STRIDE = 3;
const Z_OFFSET = 2;
const U16_MAX = 65535;

export function deriveQuantizedCentres(
  positions: Uint16Array,
  periods: Uint8Array,
  cellCount: number,
  sampleCount: number,
): Uint16Array {
  const count = cellCount * sampleCount;
  const centres = new Uint16Array(count);
  if (count === 0) return centres;

  for (let cell = 0; cell < cellCount; cell += 1) {
    const period = periods[cell];
    const window = period > 0 && period <= sampleCount ? period : sampleCount;
    let sum = 0;
    for (let sample = 0; sample < window; sample += 1) {
      sum += positions[(sample * cellCount + cell) * Z_STRIDE + Z_OFFSET];
    }
    const centre = Math.round(sum / window);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      centres[sample * cellCount + cell] = centre;
    }
  }
  return centres;
}

/** Quantize a height in [-clip, clip] the way the baker does, for tests. */
export function quantizeHeight(z: number, clip: number): number {
  const t = (z + clip) / (2 * clip);
  return Math.max(0, Math.min(U16_MAX, Math.round(t * U16_MAX)));
}

/** Inverse of quantizeHeight. */
export function dequantizeHeight(q: number, clip: number): number {
  return -clip + (q / U16_MAX) * 2 * clip;
}
