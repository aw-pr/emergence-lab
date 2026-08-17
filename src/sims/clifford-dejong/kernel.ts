type ParamDescriptor = {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  info?: string;
  group?: string;
};

type SimParams = Record<string, number | boolean | string>;

interface SimKernel {
  init(width: number, height: number, params: SimParams): void;
  step(dt: number): void;
  readState(): Float32Array;
  readonly channelCount: number;
  readonly channelRanges: readonly (readonly [number, number])[];
  readonly name: string;
  readonly channelLabels: readonly string[];
  readonly paramSchema: readonly ParamDescriptor[];
  destroy(): void;
}

/** Density (brightness) and hue (palette position), same two-channel pairing
 * as the strange-attractor kernel: density already means brightness, so the
 * colour signal needs its own channel to survive the fade. */
const CHANNEL_COUNT = 2;

const MAPS = ["clifford", "dejong", "svensson"] as const;
type PointMap = (typeof MAPS)[number];
const DEFAULT_MAP: PointMap = "clifford";

const COLOUR_MODES = ["speed", "angle", "cycle"] as const;
type ColourMode = (typeof COLOUR_MODES)[number];
const DEFAULT_COLOUR_MODE: ColourMode = "speed";

const DEFAULT_A = -1.4;
const DEFAULT_B = 1.6;
const DEFAULT_C = 1.0;
const DEFAULT_D = 0.7;
const DEFAULT_POINTS_PER_FRAME = 14000;
const DEFAULT_EXPOSURE = 0.035;
const DEFAULT_FADE = 0.995;
const DEFAULT_CYCLE_SPEED = 0.02;
const DEFAULT_DRIFT_AMOUNT = 0.5;
const DEFAULT_DRIFT_SPEED = 0.5;
/** Incommensurate per-coefficient frequencies so the drift path through
 * coefficient space never closes; the phases spread the initial directions so
 * all four coefficients do not start moving in lockstep. */
const DRIFT_FREQS = [1, 1.31, 1.618, 1.93] as const;
const DRIFT_PHASES = [0, 2.1, 4.2, 0.7] as const;
/** Drift-time advance per frame at driftSpeed 1: the base-frequency
 * coefficient completes one full sine cycle every five seconds. */
const DRIFT_RATE = 0.2 / 60;
const TAU = Math.PI * 2;
const WARMUP_STEPS = 100;
const INITIAL_POINTS = 40000;
/** Frame margin so the attractor's analytic bound does not kiss the edge. */
const RANGE_MARGIN = 1.04;
/** Stretches the normalised step length across more of the palette; measured
 * step lengths cluster well below the analytic maximum. */
const SPEED_HUE_SCALE = 1.4;

/**
 * Per-map definition. These are discrete iterated maps, not flows: each
 * application of `apply` is one plotted point, and consecutive points land far
 * apart, so there is no line/ribbon interpolation — the image is a density
 * histogram of millions of visits.
 *
 * `bounds` returns the analytic half-extents of the attractor: every map here
 * is a sum of sin/cos terms, so |x'| and |y'| have hard bounds derived from
 * the coefficients. That keeps the framing exact for any parameter setting
 * with no settle-and-measure pass.
 */
interface MapSpec {
  apply(
    x: number,
    y: number,
    a: number,
    b: number,
    c: number,
    d: number,
  ): readonly [number, number];
  bounds(a: number, b: number, c: number, d: number): readonly [number, number];
}

/** Exported for the tests, which iterate the maps directly. */
export const MAP_SPECS: Record<PointMap, MapSpec> = {
  // Clifford Pickover's attractor: x' = sin(a y) + c cos(a x).
  clifford: {
    apply: (x, y, a, b, c, d) => [
      Math.sin(a * y) + c * Math.cos(a * x),
      Math.sin(b * x) + d * Math.cos(b * y),
    ],
    bounds: (_a, _b, c, d) => [1 + Math.abs(c), 1 + Math.abs(d)],
  },
  // Peter de Jong's attractor: all four coefficients feed trig terms, so the
  // orbit always lives in [-2, 2] squared.
  dejong: {
    apply: (x, y, a, b, c, d) => [
      Math.sin(a * y) - Math.cos(b * x),
      Math.sin(c * x) - Math.cos(d * y),
    ],
    bounds: () => [2, 2],
  },
  // Johnny Svensson's variant: d scales the x term, c the y term, which is why
  // its classic parameter sets carry a large |d|.
  svensson: {
    apply: (x, y, a, b, c, d) => [
      d * Math.sin(a * x) - Math.sin(b * y),
      c * Math.cos(a * x) + Math.cos(b * y),
    ],
    bounds: (_a, _b, c, d) => [1 + Math.abs(d), 1 + Math.abs(c)],
  },
};

/** Classic published coefficient sets, one per map. The schema defaults are
 * Clifford's; the registry variants and the self-test use these so De Jong and
 * Svensson open on their canonical figures rather than at Clifford's point of
 * coefficient space. */
export const CLASSIC_COEFFS: Record<
  PointMap,
  { a: number; b: number; c: number; d: number }
> = {
  clifford: { a: -1.4, b: 1.6, c: 1.0, d: 0.7 },
  dejong: { a: 1.4, b: -2.3, c: 2.4, d: -2.1 },
  svensson: { a: 1.4, b: 1.56, c: 1.4, d: -6.56 },
};

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/** Wrap into [0,1). Hue is a position on a cyclic palette, so it wraps rather
 * than clamping. */
function wrap01(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function numberParam(
  params: SimParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(
  params: SimParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, numberParam(params, key, fallback)));
}

function enumParam<T extends string>(
  params: SimParams,
  key: string,
  fallback: T,
  options: readonly T[],
): T {
  const value = params[key];
  return typeof value === "string" &&
    (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export class CliffordDeJongKernel implements SimKernel {
  readonly name = "Point-Map Attractor";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Density", "Hue"] as const;
  readonly channelRanges = [[0, 1], [0, 1]] as const;
  readonly paramSchema = [
    {
      key: "map",
      label: "Map",
      type: "enum",
      default: DEFAULT_MAP,
      options: MAPS,
      info: "Which two-dimensional iterated map draws the point cloud: Clifford's coefficient-weighted sin/cos pair, De Jong's all-trig variant, or Svensson's scaled form. Each folds the plane differently, so the same four coefficients give a completely different figure on each. Changing it resets the image.",
    },
    {
      key: "a",
      label: "a",
      type: "number",
      default: DEFAULT_A,
      min: -7,
      max: 7,
      step: 0.01,
      group: "Coefficients",
      info: "First coefficient of the map. All four coefficients together pick one attractor out of a continuous family: tiny changes usually warp the figure smoothly, while crossing certain values collapses it to a loop or a few fixed points — both are genuine behaviours of these maps. Changing it resets the image.",
    },
    {
      key: "b",
      label: "b",
      type: "number",
      default: DEFAULT_B,
      min: -7,
      max: 7,
      step: 0.01,
      group: "Coefficients",
      info: "Second coefficient of the map. Explore by nudging one coefficient at a time; the attractor deforms continuously until it bifurcates into a different shape. Changing it resets the image.",
    },
    {
      key: "c",
      label: "c",
      type: "number",
      default: DEFAULT_C,
      min: -7,
      max: 7,
      step: 0.01,
      group: "Coefficients",
      info: "Third coefficient of the map. On Clifford it also scales the x extent of the figure, so large values widen the frame to keep the attractor inside it. Changing it resets the image.",
    },
    {
      key: "d",
      label: "d",
      type: "number",
      default: DEFAULT_D,
      min: -7,
      max: 7,
      step: 0.01,
      group: "Coefficients",
      info: "Fourth coefficient of the map. On Clifford it scales the y extent; on Svensson it scales the x term, which is why Svensson's classic settings carry a large negative d. Changing it resets the image.",
    },
    {
      key: "driftAmount",
      label: "Drift amount",
      type: "number",
      default: DEFAULT_DRIFT_AMOUNT,
      min: 0,
      max: 1,
      step: 0.01,
      group: "Drift",
      info: "How far the four coefficients wander from their set values, in coefficient units. The wandering happens live, without resetting the image, so the old figure fades out as the new one accumulates and the attractor appears to morph. Crossing a periodic window can momentarily collapse the figure to a loop or a few points before it re-blooms — that is the map's genuine behaviour, not a glitch. Zero pins the coefficients.",
    },
    {
      key: "driftSpeed",
      label: "Drift speed",
      type: "number",
      default: DEFAULT_DRIFT_SPEED,
      min: 0,
      max: 1,
      step: 0.01,
      group: "Drift",
      info: "How fast the coefficients wander. Each follows its own sine cycle at a slightly different frequency, so the path through coefficient space never repeats. Slow speeds give a gradual morph; pair a faster drift with a lower fade so the trailing figure keeps up.",
    },
    {
      key: "pointsPerFrame",
      label: "Points per frame",
      type: "number",
      default: DEFAULT_POINTS_PER_FRAME,
      min: 1000,
      max: 50000,
      step: 1000,
      info: "How many iterations of the map are plotted each frame. More points develop the density image faster and keep it steadier against the fade, at the cost of frame rate. Changing it resets the image.",
    },
    {
      key: "exposure",
      label: "Exposure",
      type: "number",
      default: DEFAULT_EXPOSURE,
      min: 0.005,
      max: 0.15,
      step: 0.005,
      group: "Rendering",
      info: "Brightness deposited by each plotted point. Low values need many visits to light a cell, revealing the attractor's fine density structure; high values saturate the busy filaments quickly into a bolder, flatter figure. Changing it resets the image.",
    },
    {
      key: "fade",
      label: "Fade",
      type: "number",
      default: DEFAULT_FADE,
      min: 0.9,
      max: 1,
      step: 0.001,
      group: "Rendering",
      info: "Fraction of accumulated brightness kept each frame. At the maximum the image only ever accumulates, converging to a static portrait; lower values keep it breathing, with rarely-visited cells fading back out. Changing it resets the image.",
    },
    {
      key: "colourMode",
      label: "Colour by",
      type: "enum",
      default: DEFAULT_COLOUR_MODE,
      options: COLOUR_MODES,
      group: "Rendering",
      info: "What picks each point's palette position. Speed uses how far the orbit jumped to reach the point, shading the attractor's folds by how violently the map stretches there; angle uses the point's bearing from the centre for smooth radial gradients; cycle ignores geometry and drifts the whole palette over time. Changing it resets the image.",
    },
    {
      key: "cycleSpeed",
      label: "Colour cycle",
      type: "number",
      default: DEFAULT_CYCLE_SPEED,
      min: 0,
      max: 1,
      step: 0.01,
      group: "Rendering",
      info: "How fast the palette position drifts on top of the chosen colour mode, so a converged image keeps slowly shifting colour. Zero freezes the palette. Changing it resets the image.",
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private map: PointMap = DEFAULT_MAP;
  private spec: MapSpec = MAP_SPECS[DEFAULT_MAP];
  private a = DEFAULT_A;
  private b = DEFAULT_B;
  private c = DEFAULT_C;
  private d = DEFAULT_D;
  private pointsPerFrame = DEFAULT_POINTS_PER_FRAME;
  private exposure = DEFAULT_EXPOSURE;
  private fade = DEFAULT_FADE;
  private colourMode: ColourMode = DEFAULT_COLOUR_MODE;
  private cycleSpeed = DEFAULT_CYCLE_SPEED;
  private driftAmount = DEFAULT_DRIFT_AMOUNT;
  private driftSpeed = DEFAULT_DRIFT_SPEED;
  private driftT = 0;
  /** Effective coefficients: base a-d plus the live drift offsets. */
  private ea = DEFAULT_A;
  private eb = DEFAULT_B;
  private ec = DEFAULT_C;
  private ed = DEFAULT_D;
  private phase = 0;
  private x = 0.1;
  private y = 0.1;
  private halfExtentX = 1;
  private halfExtentY = 1;
  private maxStep = 1;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
    } else {
      this.state.fill(0);
    }

    this.map = enumParam(params, "map", DEFAULT_MAP, MAPS);
    this.spec = MAP_SPECS[this.map];
    this.a = boundedNumber(params, "a", DEFAULT_A, -7, 7);
    this.b = boundedNumber(params, "b", DEFAULT_B, -7, 7);
    this.c = boundedNumber(params, "c", DEFAULT_C, -7, 7);
    this.d = boundedNumber(params, "d", DEFAULT_D, -7, 7);
    this.pointsPerFrame = Math.max(
      1,
      Math.floor(
        boundedNumber(
          params,
          "pointsPerFrame",
          DEFAULT_POINTS_PER_FRAME,
          1000,
          50000,
        ),
      ),
    );
    this.exposure = boundedNumber(
      params,
      "exposure",
      DEFAULT_EXPOSURE,
      0.005,
      0.15,
    );
    this.fade = boundedNumber(params, "fade", DEFAULT_FADE, 0, 1);
    this.colourMode = enumParam(
      params,
      "colourMode",
      DEFAULT_COLOUR_MODE,
      COLOUR_MODES,
    );
    this.cycleSpeed = boundedNumber(
      params,
      "cycleSpeed",
      DEFAULT_CYCLE_SPEED,
      0,
      1,
    );
    this.driftAmount = boundedNumber(
      params,
      "driftAmount",
      DEFAULT_DRIFT_AMOUNT,
      0,
      1,
    );
    this.driftSpeed = boundedNumber(
      params,
      "driftSpeed",
      DEFAULT_DRIFT_SPEED,
      0,
      1,
    );
    this.driftT = 0;
    this.ea = this.a;
    this.eb = this.b;
    this.ec = this.c;
    this.ed = this.d;
    this.phase = 0;

    // Frame the whole drift envelope, not just the base coefficients: bounds
    // grow monotonically with |c| and |d|, so widening those by the drift
    // amplitude keeps every drifted attractor in shot without the frame
    // breathing as the coefficients move.
    const [boundX, boundY] = this.spec.bounds(
      this.a,
      this.b,
      Math.abs(this.c) + this.driftAmount,
      Math.abs(this.d) + this.driftAmount,
    );
    this.halfExtentX = boundX * RANGE_MARGIN;
    this.halfExtentY = boundY * RANGE_MARGIN;
    this.maxStep = Math.hypot(2 * boundX, 2 * boundY);

    this.x = 0.1;
    this.y = 0.1;

    this.seedInitialImage();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const state = this.state;
    const fade = this.fade;
    if (fade < 1) {
      // Density only. Hue is a palette position, not a quantity: fading it
      // would slide every filament towards hue 0 as it dims.
      for (let index = 0; index < state.length; index += CHANNEL_COUNT) {
        state[index] *= fade;
      }
    }

    this.phase = wrap01(this.phase + this.cycleSpeed * (1 / 60));

    if (this.driftAmount > 0) {
      // Offsets move once per frame, not per point: within a frame the orbit
      // samples one fixed attractor, and the fade cross-dissolves between
      // frames, which is what makes the morph read as one figure deforming.
      this.driftT += this.driftSpeed * DRIFT_RATE;
      const amount = this.driftAmount;
      const t = this.driftT;
      this.ea =
        this.a + amount * Math.sin(TAU * DRIFT_FREQS[0] * t + DRIFT_PHASES[0]);
      this.eb =
        this.b + amount * Math.sin(TAU * DRIFT_FREQS[1] * t + DRIFT_PHASES[1]);
      this.ec =
        this.c + amount * Math.sin(TAU * DRIFT_FREQS[2] * t + DRIFT_PHASES[2]);
      this.ed =
        this.d + amount * Math.sin(TAU * DRIFT_FREQS[3] * t + DRIFT_PHASES[3]);
    }

    this.plot(this.pointsPerFrame, 1);
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
  }

  private seedInitialImage(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    for (let index = 0; index < WARMUP_STEPS; index += 1) {
      this.advance();
    }
    this.plot(INITIAL_POINTS, 0.5);
  }

  /** One application of the map, returning the step length for colouring. */
  private advance(): number {
    const [nextX, nextY] = this.spec.apply(
      this.x,
      this.y,
      this.ea,
      this.eb,
      this.ec,
      this.ed,
    );
    const travelled = Math.hypot(nextX - this.x, nextY - this.y);
    this.x = nextX;
    this.y = nextY;
    return travelled;
  }

  private plot(points: number, intensityScale: number): void {
    const intensity = this.exposure * intensityScale;
    const width = this.width;
    const height = this.height;
    const state = this.state;

    for (let index = 0; index < points; index += 1) {
      const travelled = this.advance();

      const xNorm = (this.x + this.halfExtentX) / (2 * this.halfExtentX);
      const yNorm = (this.y + this.halfExtentY) / (2 * this.halfExtentY);
      const gridX = Math.round(xNorm * (width - 1));
      const gridY = Math.round(height - 1 - yNorm * (height - 1));
      if (gridX < 0 || gridX >= width || gridY < 0 || gridY >= height) {
        continue;
      }

      const cell = (gridY * width + gridX) * CHANNEL_COUNT;
      state[cell] = clamp01(state[cell] + intensity);
      // The freshest visit owns the cell's hue, matching the strange-attractor
      // convention: crossings read as one filament passing in front.
      state[cell + 1] = this.hueFor(travelled);
    }
  }

  private hueFor(travelled: number): number {
    if (this.colourMode === "cycle") {
      return this.phase;
    }
    if (this.colourMode === "angle") {
      const angle = Math.atan2(this.y, this.x);
      return wrap01(angle / (2 * Math.PI) + this.phase);
    }
    const speedNorm = (travelled / this.maxStep) * SPEED_HUE_SCALE;
    return wrap01(speedNorm + this.phase);
  }
}

export function selfTest(): boolean {
  try {
    for (const map of MAPS) {
      const kernel = new CliffordDeJongKernel();
      kernel.init(48, 36, { map, ...CLASSIC_COEFFS[map] });

      for (let index = 0; index < 60; index += 1) {
        kernel.step(1);
      }

      let occupied = 0;
      const state = kernel.readState();
      for (let index = 0; index < state.length; index += CHANNEL_COUNT) {
        if (!Number.isFinite(state[index])) {
          return false;
        }
        if (state[index] > 0) {
          occupied += 1;
        }
      }

      if (occupied < 40) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
