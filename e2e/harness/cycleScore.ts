/**
 * Cycle interestingness: one score for a rendered colour-cycling sequence.
 *
 * The sweep harness scores kernel fields, and the palette sweep scores single
 * rendered frames with colour metrics only. Palette cycling is a renderer
 * effect that exists only in the rendered frame and only over time, so this
 * module scores an ordered sequence of decoded screenshots. Pure: no DOM, no
 * Playwright, no re-implementation of either metric stack. The repo composite
 * (`scoreFrames`, hence `frameMetrics` and `interestingness`) and the colour
 * metrics (`frameColourMetrics`, `frameDifference`) are called as they are;
 * everything here is the adapter that turns pixels into their inputs and the
 * formula that combines their outputs.
 *
 * Adapter (luminanceField): each frame becomes a scalar field in [0, 1] by
 * taking OKLab lightness L per pixel, box-averaging it onto a working grid
 * DOWNSAMPLE times coarser than the frame, then applying the repo's
 * `gaussianBlur` with BLUR_RADIUS cells (sigma = radius / 2). L is absolute,
 * not rescaled: LIT_THRESHOLD is the same 0.1 floor `frameColourMetrics`
 * uses for "lit", so coverage in the composite and lit share in the colour
 * metrics mean the same thing. The grid is coarsened because lag-1
 * autocorrelation on a blurred 1280×720 frame reads ~1 whatever is drawn; at
 * a quarter of the frame resolution one cell is four pixels and a palette
 * band at the shipped settings is tens of cells, so the structure term reads
 * band organisation rather than point-sprite texture. The blur is toroidal
 * (the repo function wraps); frame edges are background, so nothing wraps
 * into anything lit.
 *
 * Terms, every one exported on the result so a sweep can re-weight without
 * re-rendering:
 *
 *   field       mean over consecutive frame pairs (i, i+1) of
 *               interestingness(frameMetrics(lum_i), temporalFlux(lum_i, lum_i+1)),
 *               i.e. `scoreFrames(lum_i, lum_i+1)`. The repo composite applied
 *               to the rendered luminance; its own coverage, structure, detail
 *               and liveliness factors are untouched. `fieldSummary` carries
 *               the per-pair metrics' means and spreads (`summarizeMetrics`).
 *   colour      `frameColourMetrics` of each frame, averaged over the sequence
 *               (lit, edgeDensity, hueSpread, chroma, whiteClip, neon).
 *   travel      mean over consecutive pairs of `frameDifference`: mean OKLab×100
 *               distance per pixel lit in either frame. Units are per
 *               consecutive pair, so the capture interval is part of the
 *               number; the harness fixes it and records the phase per frame.
 *
 * Normalised colour terms:
 *
 *   chromaTerm  = clamp01(colour.chroma / CHROMA_FULL)        CHROMA_FULL = 0.08
 *   edgeTerm    = clamp01(colour.edgeDensity / EDGE_FULL)     EDGE_FULL   = 0.3
 *   travelTerm  = tanh(travel / TRAVEL_SCALE)                 TRAVEL_SCALE = 4
 *   colourScore = 0.4 * chromaTerm + 0.3 * edgeTerm + 0.3 * travelTerm
 *
 * Composite:
 *
 *   cycleInterestingness = sqrt(field * colourScore)
 *
 * A geometric mean so neither half can carry the score alone: a vivid,
 * fast-moving solid wash has field 0 (the composite's coverage factor zeroes
 * a frame that is all lit, as it zeroes an empty one) and scores 0; a
 * well-organised but colourless, motionless frame has colourScore 0 and
 * scores 0. Both factors lie in [0, 1], so the result does. The
 * normalisation constants were fixed before the baseline was measured, from
 * the palette sweep's rendered-frame readings (docs/sweeps/
 * logistic-mandelbrot-palette-cycling.md): a saturated ramp texel has OKLab
 * chroma about 0.15 and the rendered cloud read 0.02 to 0.04, so 0.08 is
 * "vivid"; the densest band edges measured were 0.30 of lit pixels; a third
 * of a lap moved 8 to 13 OKLab×100 per pixel, so a tenth of a lap moving 4
 * is clearly visible cycling and 4 is where tanh gives 0.76.
 */
import {
  frameColourMetrics,
  frameDifference,
  toOklab,
  type DecodedImage,
  type FrameColourMetrics,
} from "./frame.ts";
import {
  gaussianBlur,
  scoreFrames,
  summarizeMetrics,
  type InterestingnessMetrics,
  type MultiSnapshotMetrics,
} from "./metrics.ts";

/** OKLab L floor for a lit pixel; the same floor frameColourMetrics uses. */
export const LIT_THRESHOLD = 0.1;
/** Working grid is this many times coarser than the frame on each axis. */
export const DOWNSAMPLE = 4;
/** Gaussian blur support in working-grid cells each side of centre. */
export const BLUR_RADIUS = 2;
/** Mean OKLab chroma over lit pixels that counts as fully vivid. */
export const CHROMA_FULL = 0.08;
/** Band-edge share of lit pixels that counts as fully banded. */
export const EDGE_FULL = 0.3;
/** OKLab×100 per consecutive pair at which travelTerm reaches tanh(1). */
export const TRAVEL_SCALE = 4;
/** Weights of the three colour terms inside colourScore; they sum to 1. */
export const COLOUR_WEIGHTS = { chroma: 0.4, edges: 0.3, travel: 0.3 } as const;

export interface LuminanceOptions {
  downsample?: number;
  blurRadius?: number;
  litThreshold?: number;
}

export interface LuminanceField {
  values: number[];
  width: number;
  height: number;
}

export interface CycleTerms {
  chromaTerm: number;
  edgeTerm: number;
  travelTerm: number;
  colourScore: number;
  cycleInterestingness: number;
}

export interface CycleScore extends CycleTerms {
  frameCount: number;
  /** Working grid the composite was scored on. */
  grid: { width: number; height: number; downsample: number; blurRadius: number; litThreshold: number };
  /** Mean over consecutive pairs of the repo composite on the luminance field. */
  field: number;
  /** Per-pair composite metrics, in sequence order. */
  fieldPairs: InterestingnessMetrics[];
  /** Means and spreads of the per-pair metrics. */
  fieldSummary: MultiSnapshotMetrics;
  /** frameColourMetrics averaged over every frame. */
  colour: FrameColourMetrics;
  /** Per-frame colour metrics, in sequence order. */
  colourFrames: FrameColourMetrics[];
  /** Mean OKLab×100 distance per lit pixel between consecutive frames. */
  travel: number;
  /** Per-pair colour travel, in sequence order. */
  travelPairs: number[];
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * OKLab lightness of a frame, box-averaged onto the working grid and
 * Gaussian-blurred. Frame dimensions that are not multiples of the
 * downsample factor drop the remainder rows and columns at the right and
 * bottom edges, which are background in every capture this scores.
 */
export function luminanceField(image: DecodedImage, options: LuminanceOptions = {}): LuminanceField {
  const downsample = Math.max(1, Math.round(options.downsample ?? DOWNSAMPLE));
  const blurRadius = options.blurRadius ?? BLUR_RADIUS;
  const width = Math.floor(image.width / downsample);
  const height = Math.floor(image.height / downsample);
  const { L } = toOklab(image);
  const coarse = new Array<number>(width * height).fill(0);
  const inv = 1 / (downsample * downsample);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let sy = 0; sy < downsample; sy += 1) {
        const row = (y * downsample + sy) * image.width + x * downsample;
        for (let sx = 0; sx < downsample; sx += 1) acc += L[row + sx];
      }
      coarse[y * width + x] = clamp01(acc * inv);
    }
  }
  return { values: gaussianBlur(coarse, width, height, blurRadius), width, height };
}

/** The normalised colour terms and the composite, from the three raw readings. */
export function cycleTerms(
  field: number,
  colour: Pick<FrameColourMetrics, "chroma" | "edgeDensity">,
  travel: number,
  weights: { chroma: number; edges: number; travel: number } = COLOUR_WEIGHTS,
): CycleTerms {
  const chromaTerm = clamp01(colour.chroma / CHROMA_FULL);
  const edgeTerm = clamp01(colour.edgeDensity / EDGE_FULL);
  const travelTerm = Math.tanh(Math.max(0, travel) / TRAVEL_SCALE);
  const colourScore = clamp01(
    weights.chroma * chromaTerm + weights.edges * edgeTerm + weights.travel * travelTerm,
  );
  return {
    chromaTerm,
    edgeTerm,
    travelTerm,
    colourScore,
    cycleInterestingness: Math.sqrt(clamp01(field) * colourScore),
  };
}

function meanColour(frames: FrameColourMetrics[]): FrameColourMetrics {
  const keys: (keyof FrameColourMetrics)[] = ["lit", "edgeDensity", "hueSpread", "chroma", "whiteClip", "neon"];
  const out = {} as FrameColourMetrics;
  for (const key of keys) {
    out[key] = frames.reduce((sum, frame) => sum + frame[key], 0) / frames.length;
  }
  return out;
}

/** Score an ordered sequence of at least two equally sized decoded frames. */
export function scoreCycle(frames: DecodedImage[], options: LuminanceOptions = {}): CycleScore {
  if (frames.length < 2) throw new Error("scoreCycle needs at least two frames");
  const litThreshold = options.litThreshold ?? LIT_THRESHOLD;
  const fields = frames.map((frame) => luminanceField(frame, options));
  const { width, height } = fields[0];
  for (const field of fields) {
    if (field.width !== width || field.height !== height) throw new Error("frame size mismatch");
  }

  const fieldPairs: InterestingnessMetrics[] = [];
  const travelPairs: number[] = [];
  for (let i = 0; i + 1 < frames.length; i += 1) {
    fieldPairs.push(scoreFrames(fields[i].values, fields[i + 1].values, width, height, litThreshold));
    travelPairs.push(frameDifference(frames[i], frames[i + 1], litThreshold));
  }
  const fieldSummary = summarizeMetrics(fieldPairs);
  const colourFrames = frames.map((frame) => frameColourMetrics(frame, litThreshold));
  const colour = meanColour(colourFrames);
  const travel = travelPairs.reduce((sum, value) => sum + value, 0) / travelPairs.length;
  const field = fieldSummary.score;

  return {
    ...cycleTerms(field, colour, travel),
    frameCount: frames.length,
    grid: {
      width,
      height,
      downsample: Math.max(1, Math.round(options.downsample ?? DOWNSAMPLE)),
      blurRadius: options.blurRadius ?? BLUR_RADIUS,
      litThreshold,
    },
    field,
    fieldPairs,
    fieldSummary,
    colour,
    colourFrames,
    travel,
    travelPairs,
  };
}
