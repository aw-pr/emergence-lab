export interface LyapunovGridSpec {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  zoom: number;
}

export const DEFAULT_SEQUENCE = "AB";
export const DEFAULT_WARMUP_ITERATIONS = 200;
export const DEFAULT_SAMPLE_ITERATIONS = 500;
export const BASE_PLANE_SPAN = 2;

// Avoid log(0) at superstable points while retaining a strongly negative,
// finite exponent for the kernel to clamp into its display range.
const MIN_DERIVATIVE = 1e-30;
const INITIAL_ORBIT_VALUE = 0.4;

function boundedDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normaliseSequence(sequence: string): string {
  if (sequence.length === 0) return DEFAULT_SEQUENCE;
  for (const symbol of sequence) {
    if (symbol !== "A" && symbol !== "B") return DEFAULT_SEQUENCE;
  }
  return sequence;
}

export function sampleLyapunovPoint(
  a: number,
  b: number,
  sequence: string,
  warmupIterations: number,
  sampleIterations: number,
): number {
  const schedule = normaliseSequence(sequence);
  const warmup = Math.max(0, Math.floor(warmupIterations));
  const samples = Math.max(1, Math.floor(sampleIterations));
  let x = INITIAL_ORBIT_VALUE;

  for (let iteration = 0; iteration < warmup; iteration += 1) {
    const r = schedule[iteration % schedule.length] === "A" ? a : b;
    x = r * x * (1 - x);
  }

  let logDerivativeSum = 0;
  for (let iteration = 0; iteration < samples; iteration += 1) {
    const scheduleIndex = (warmup + iteration) % schedule.length;
    const r = schedule[scheduleIndex] === "A" ? a : b;
    const derivative = Math.max(MIN_DERIVATIVE, Math.abs(r * (1 - 2 * x)));
    logDerivativeSum += Math.log(derivative);
    x = r * x * (1 - x);
  }

  return logDerivativeSum / samples;
}

export function sampleLyapunovGrid(
  spec: LyapunovGridSpec,
  sequence: string,
  warmupIterations: number,
  sampleIterations: number,
): Float32Array {
  const width = boundedDimension(spec.width);
  const height = boundedDimension(spec.height);
  const output = new Float32Array(width * height);
  if (width === 0 || height === 0) return output;

  const zoom = Number.isFinite(spec.zoom) && spec.zoom > 0 ? spec.zoom : 1;
  const scale = BASE_PLANE_SPAN / (Math.min(width, height) * zoom);

  for (let y = 0; y < height; y += 1) {
    const b = spec.centerY + (y - (height - 1) / 2) * scale;
    for (let x = 0; x < width; x += 1) {
      const a = spec.centerX + (x - (width - 1) / 2) * scale;
      output[y * width + x] = sampleLyapunovPoint(
        a,
        b,
        sequence,
        warmupIterations,
        sampleIterations,
      );
    }
  }

  return output;
}
