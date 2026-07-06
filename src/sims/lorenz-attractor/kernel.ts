type ParamDescriptor = {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
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

const DEFAULT_SIGMA = 10;
const DEFAULT_RHO = 28;
const DEFAULT_BETA = 2.6666667;
const DEFAULT_STEPS_PER_FRAME = 24;
const DEFAULT_FADE = 0.997;
const DEFAULT_COLOUR_BY_HEIGHT = true;
const CHANNEL_COUNT = 1;
const HEIGHT_FLOOR = 0.35;
const HEIGHT_SPAN = 0.65;
const DEPOSIT = 0.38;
const DEPOSIT_RADIUS = 1;

const ATTRACTORS = [
  "lorenz",
  "rossler",
  "thomas",
  "aizawa",
  "halvorsen",
] as const;
type Attractor = (typeof ATTRACTORS)[number];
const DEFAULT_ATTRACTOR: Attractor = "lorenz";

type Derivative = {
  dx: number;
  dy: number;
  dz: number;
};

/**
 * Per-attractor tuning. The RK4 integrator, Bresenham-style trail deposit and
 * exponential fade are shared across every attractor; only these differ:
 *
 *  - `dt` / `warmup`: integration step and pre-roll so the sim opens mid-orbit.
 *  - `start`: initial point on (or near) the attractor's basin.
 *  - `derivative`: the ODE right-hand side. Only Lorenz reads sigma/rho/beta;
 *    the others carry fixed textbook constants and ignore those params.
 *  - `projX` / `projY`: which state axes map to screen X and Y.
 *  - `depth`: the remaining axis, normalised via `depthRange` for height colour.
 *  - `xRange` / `yRange`: screen-axis extents (measured from the settled orbit)
 *    so each attractor fills the frame without per-frame renormalisation.
 */
interface AttractorSpec {
  dt: number;
  warmup: number;
  start: readonly [number, number, number];
  derivative(
    x: number,
    y: number,
    z: number,
    sigma: number,
    rho: number,
    beta: number,
  ): Derivative;
  projX(x: number, y: number, z: number): number;
  projY(x: number, y: number, z: number): number;
  depth(x: number, y: number, z: number): number;
  xRange: readonly [number, number];
  yRange: readonly [number, number];
  depthRange: readonly [number, number];
}

const SPECS: Record<Attractor, AttractorSpec> = {
  // Classic butterfly. Projects x -> screen X, z -> screen Y (depth axis: y).
  lorenz: {
    dt: 0.005,
    warmup: 900,
    start: [0.1, 0, 0],
    derivative: (x, y, z, sigma, rho, beta) => ({
      dx: sigma * (y - x),
      dy: x * (rho - z) - y,
      dz: x * y - beta * z,
    }),
    projX: (x) => x,
    projY: (_x, _y, z) => z,
    depth: (_x, y) => y,
    xRange: [-30, 30],
    yRange: [0, 60],
    depthRange: [-28, 28],
  },
  // Rössler (a=0.2, b=0.2, c=5.7): a flat spiral with a folding z-spike.
  // Projects the x-y spiral plane; depth axis: z.
  rossler: {
    dt: 0.02,
    warmup: 2000,
    start: [0.1, 0, 0],
    derivative: (x, y, z) => ({
      dx: -y - z,
      dy: x + 0.2 * y,
      dz: 0.2 + z * (x - 5.7),
    }),
    projX: (x) => x,
    projY: (_x, y) => y,
    depth: (_x, _y, z) => z,
    xRange: [-11, 13],
    yRange: [-13, 10],
    depthRange: [0, 23],
  },
  // Thomas cyclically symmetric sin-flow (b=0.208186): a slow, tightly wound
  // coil — larger dt and warmup than the faster attractors. Depth axis: z.
  thomas: {
    dt: 0.05,
    warmup: 1500,
    start: [0.1, 0, 0],
    derivative: (x, y, z) => ({
      dx: Math.sin(y) - 0.208186 * x,
      dy: Math.sin(z) - 0.208186 * y,
      dz: Math.sin(x) - 0.208186 * z,
    }),
    projX: (x) => x,
    projY: (_x, y) => y,
    depth: (_x, _y, z) => z,
    xRange: [-1.6, 4.3],
    yRange: [-1.6, 4.3],
    depthRange: [-1.4, 4.1],
  },
  // Aizawa (a=0.95,b=0.7,c=0.6,d=3.5,e=0.25,f=0.1): a spindle/onion with a
  // spike. Projects the x-z profile so the spike shows; depth axis: y.
  aizawa: {
    dt: 0.01,
    warmup: 2000,
    start: [0.1, 0, 0],
    derivative: (x, y, z) => {
      const a = 0.95;
      const b = 0.7;
      const c = 0.6;
      const d = 3.5;
      const e = 0.25;
      const f = 0.1;
      return {
        dx: (z - b) * x - d * y,
        dy: d * x + (z - b) * y,
        dz:
          c +
          a * z -
          (z * z * z) / 3 -
          (x * x + y * y) * (1 + e * z) +
          f * z * x * x * x,
      };
    },
    projX: (x) => x,
    projY: (_x, _y, z) => z,
    depth: (_x, y) => y,
    xRange: [-1.7, 1.7],
    yRange: [-0.6, 2.1],
    depthRange: [-1.6, 1.6],
  },
  // Halvorsen (a=1.89): cyclically symmetric three-armed spiral bloom.
  // Projects x -> screen X, y -> screen Y; depth axis: z.
  halvorsen: {
    dt: 0.008,
    warmup: 1500,
    start: [-5, 0, 0],
    derivative: (x, y, z) => {
      const a = 1.89;
      return {
        dx: -a * x - 4 * y - 4 * z - y * y,
        dy: -a * y - 4 * z - 4 * x - z * z,
        dz: -a * z - 4 * x - 4 * y - x * x,
      };
    },
    projX: (x) => x,
    projY: (_x, y) => y,
    depth: (_x, _y, z) => z,
    xRange: [-13, 7],
    yRange: [-13, 7],
    depthRange: [-13, 7],
  },
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

function boolParam(
  params: SimParams,
  key: string,
  fallback: boolean,
): boolean {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

function enumParam(
  params: SimParams,
  key: string,
  fallback: Attractor,
  options: readonly Attractor[],
): Attractor {
  const value = params[key];
  return typeof value === "string" &&
    (options as readonly string[]).includes(value)
    ? (value as Attractor)
    : fallback;
}

export class LorenzAttractorKernel implements SimKernel {
  readonly name = "Strange Attractor";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Density"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "attractor",
      label: "Attractor",
      type: "enum",
      default: DEFAULT_ATTRACTOR,
      options: ATTRACTORS,
    },
    {
      key: "sigma",
      label: "Sigma (Lorenz)",
      type: "number",
      default: DEFAULT_SIGMA,
      min: 0,
      max: 30,
      step: 0.1,
    },
    {
      key: "rho",
      label: "Rho (Lorenz)",
      type: "number",
      default: DEFAULT_RHO,
      min: 0,
      max: 60,
      step: 0.1,
    },
    {
      key: "beta",
      label: "Beta (Lorenz)",
      type: "number",
      default: DEFAULT_BETA,
      min: 0,
      max: 10,
      step: 0.0001,
    },
    {
      key: "stepsPerFrame",
      label: "Steps per frame",
      type: "number",
      default: DEFAULT_STEPS_PER_FRAME,
      min: 1,
      max: 64,
      step: 1,
    },
    {
      key: "fade",
      label: "Fade",
      type: "number",
      default: DEFAULT_FADE,
      min: 0.9,
      max: 1,
      step: 0.001,
    },
    {
      key: "colourByHeight",
      label: "Colour by height",
      type: "boolean",
      default: DEFAULT_COLOUR_BY_HEIGHT,
    },
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private attractor: Attractor = DEFAULT_ATTRACTOR;
  private spec: AttractorSpec = SPECS[DEFAULT_ATTRACTOR];
  private dt = SPECS[DEFAULT_ATTRACTOR].dt;
  private warmup = SPECS[DEFAULT_ATTRACTOR].warmup;
  private sigma = DEFAULT_SIGMA;
  private rho = DEFAULT_RHO;
  private beta = DEFAULT_BETA;
  private stepsPerFrame = DEFAULT_STEPS_PER_FRAME;
  private fade = DEFAULT_FADE;
  private colourByHeight = DEFAULT_COLOUR_BY_HEIGHT;
  private x = 0.1;
  private y = 0;
  private z = 0;
  private previousGridX: number | null = null;
  private previousGridY: number | null = null;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
    } else {
      this.state.fill(0);
    }

    this.attractor = enumParam(params, "attractor", DEFAULT_ATTRACTOR, ATTRACTORS);
    this.spec = SPECS[this.attractor];
    this.dt = this.spec.dt;
    this.warmup = this.spec.warmup;

    this.sigma = boundedNumber(params, "sigma", DEFAULT_SIGMA, 0, 30);
    this.rho = boundedNumber(params, "rho", DEFAULT_RHO, 0, 60);
    this.beta = boundedNumber(params, "beta", DEFAULT_BETA, 0, 10);
    this.stepsPerFrame = Math.max(
      1,
      Math.floor(
        boundedNumber(
          params,
          "stepsPerFrame",
          DEFAULT_STEPS_PER_FRAME,
          1,
          64,
        ),
      ),
    );
    this.fade = boundedNumber(params, "fade", DEFAULT_FADE, 0, 1);
    this.colourByHeight = boolParam(
      params,
      "colourByHeight",
      DEFAULT_COLOUR_BY_HEIGHT,
    );

    this.x = this.spec.start[0];
    this.y = this.spec.start[1];
    this.z = this.spec.start[2];
    this.previousGridX = null;
    this.previousGridY = null;

    this.seedInitialTrail();
  }

  step(_dt: number): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    const state = this.state;
    const fade = this.fade;
    for (let index = 0; index < state.length; index += 1) {
      state[index] *= fade;
    }

    for (let step = 0; step < this.stepsPerFrame; step += 1) {
      this.integrate();
      this.deposit();
    }
  }

  readState(): Float32Array {
    return this.state;
  }

  destroy(): void {
    this.width = 0;
    this.height = 0;
    this.state = new Float32Array(0);
    this.previousGridX = null;
    this.previousGridY = null;
  }

  private derivative(x: number, y: number, z: number): Derivative {
    return this.spec.derivative(x, y, z, this.sigma, this.rho, this.beta);
  }

  private integrate(): void {
    const dt = this.dt;
    const halfDt = dt * 0.5;

    const k1 = this.derivative(this.x, this.y, this.z);
    const k2 = this.derivative(
      this.x + k1.dx * halfDt,
      this.y + k1.dy * halfDt,
      this.z + k1.dz * halfDt,
    );
    const k3 = this.derivative(
      this.x + k2.dx * halfDt,
      this.y + k2.dy * halfDt,
      this.z + k2.dz * halfDt,
    );
    const k4 = this.derivative(
      this.x + k3.dx * dt,
      this.y + k3.dy * dt,
      this.z + k3.dz * dt,
    );

    this.x += (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
    this.y += (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
    this.z += (dt / 6) * (k1.dz + 2 * k2.dz + 2 * k3.dz + k4.dz);
  }

  private seedInitialTrail(): void {
    if (this.width === 0 || this.height === 0) {
      return;
    }

    for (let step = 0; step < this.warmup; step += 1) {
      this.integrate();
      this.deposit();
    }
  }

  private deposit(): void {
    const spec = this.spec;
    const px = spec.projX(this.x, this.y, this.z);
    const py = spec.projY(this.x, this.y, this.z);
    const xNorm =
      (px - spec.xRange[0]) / (spec.xRange[1] - spec.xRange[0]);
    const yNorm =
      (py - spec.yRange[0]) / (spec.yRange[1] - spec.yRange[0]);
    const gridX = Math.floor(xNorm * (this.width - 1));
    const gridY = this.height - 1 - Math.floor(yNorm * (this.height - 1));

    if (
      gridX < 0 ||
      gridX >= this.width ||
      gridY < 0 ||
      gridY >= this.height
    ) {
      this.previousGridX = null;
      this.previousGridY = null;
      return;
    }

    const intensity = this.depositIntensity();

    if (this.previousGridX !== null && this.previousGridY !== null) {
      this.depositLine(
        this.previousGridX,
        this.previousGridY,
        gridX,
        gridY,
        intensity,
      );
    } else {
      this.depositPoint(gridX, gridY, intensity);
    }

    this.previousGridX = gridX;
    this.previousGridY = gridY;
  }

  /**
   * Deposit strength for the current point. With height colouring on, the
   * trajectory's normalised depth axis (the state axis NOT projected to screen)
   * modulates intensity, so wings shade by depth. Off returns the flat DEPOSIT.
   */
  private depositIntensity(): number {
    if (!this.colourByHeight) {
      return DEPOSIT;
    }

    const spec = this.spec;
    const depthValue = spec.depth(this.x, this.y, this.z);
    const zNorm = clamp01(
      (depthValue - spec.depthRange[0]) /
        (spec.depthRange[1] - spec.depthRange[0]),
    );
    return DEPOSIT * (HEIGHT_FLOOR + HEIGHT_SPAN * zNorm);
  }

  private depositLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    intensity: number,
  ): void {
    const steps = Math.max(Math.abs(endX - startX), Math.abs(endY - startY), 1);
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const x = Math.round(startX + (endX - startX) * t);
      const y = Math.round(startY + (endY - startY) * t);
      this.depositPoint(x, y, intensity);
    }
  }

  private depositPoint(
    gridX: number,
    gridY: number,
    intensity: number,
  ): void {
    for (let dy = -DEPOSIT_RADIUS; dy <= DEPOSIT_RADIUS; dy += 1) {
      for (let dx = -DEPOSIT_RADIUS; dx <= DEPOSIT_RADIUS; dx += 1) {
        const px = gridX + dx;
        const py = gridY + dy;
        if (px < 0 || px >= this.width || py < 0 || py >= this.height) {
          continue;
        }

        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > DEPOSIT_RADIUS) {
          continue;
        }

        const falloff = 1 - distance / (DEPOSIT_RADIUS + 1);
        const index = py * this.width + px;
        this.state[index] = clamp01(this.state[index] + intensity * falloff);
      }
    }
  }
}

export function selfTest(): boolean {
  try {
    for (const attractor of ATTRACTORS) {
      const kernel = new LorenzAttractorKernel();
      kernel.init(48, 36, { attractor });

      for (let i = 0; i < 220; i += 1) {
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

      if (occupied <= 1) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
