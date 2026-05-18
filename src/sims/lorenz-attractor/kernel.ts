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
const CHANNEL_COUNT = 1;
const INTERNAL_DT = 0.005;
const DEPOSIT = 0.65;
const DEPOSIT_RADIUS = 3;
const WARMUP_STEPS = 900;

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

type LorenzDerivative = {
  dx: number;
  dy: number;
  dz: number;
};

export class LorenzAttractorKernel implements SimKernel {
  readonly name = "Lorenz Attractor";
  readonly channelCount = CHANNEL_COUNT;
  readonly channelLabels = ["Density"] as const;
  readonly channelRanges = [[0, 1]] as const;
  readonly paramSchema = [
    {
      key: "sigma",
      label: "Sigma",
      type: "number",
      default: DEFAULT_SIGMA,
      min: 0,
      max: 30,
      step: 0.1,
    },
    {
      key: "rho",
      label: "Rho",
      type: "number",
      default: DEFAULT_RHO,
      min: 0,
      max: 60,
      step: 0.1,
    },
    {
      key: "beta",
      label: "Beta",
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
  ] as const satisfies readonly ParamDescriptor[];

  private width = 0;
  private height = 0;
  private state = new Float32Array(0);
  private sigma = DEFAULT_SIGMA;
  private rho = DEFAULT_RHO;
  private beta = DEFAULT_BETA;
  private stepsPerFrame = DEFAULT_STEPS_PER_FRAME;
  private fade = DEFAULT_FADE;
  private x = 0.1;
  private y = 0;
  private z = 0;

  init(width: number, height: number, params: SimParams): void {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));

    const length = this.width * this.height * this.channelCount;
    if (this.state.length !== length) {
      this.state = new Float32Array(length);
    } else {
      this.state.fill(0);
    }

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

    this.x = 0.1;
    this.y = 0;
    this.z = 0;

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
  }

  private derivative(x: number, y: number, z: number): LorenzDerivative {
    return {
      dx: this.sigma * (y - x),
      dy: x * (this.rho - z) - y,
      dz: x * y - this.beta * z,
    };
  }

  private integrate(): void {
    const dt = INTERNAL_DT;
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

    for (let step = 0; step < WARMUP_STEPS; step += 1) {
      this.integrate();
      this.deposit();
    }
  }

  private deposit(): void {
    const xNorm = (this.x + 30) / 60;
    const zNorm = this.z / 60;
    const gridX = Math.floor(xNorm * (this.width - 1));
    const gridY = this.height - 1 - Math.floor(zNorm * (this.height - 1));

    if (
      gridX < 0 ||
      gridX >= this.width ||
      gridY < 0 ||
      gridY >= this.height
    ) {
      return;
    }

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
        this.state[index] = clamp01(this.state[index] + DEPOSIT * falloff);
      }
    }
  }
}

export function selfTest(): boolean {
  try {
    const kernel = new LorenzAttractorKernel();
    kernel.init(48, 36, {});

    for (let i = 0; i < 220; i += 1) {
      kernel.step(1);
    }

    let occupied = 0;
    const state = kernel.readState();
    for (let index = 0; index < state.length; index += CHANNEL_COUNT) {
      if (state[index] > 0) {
        occupied += 1;
      }
    }

    return occupied > 1;
  } catch {
    return false;
  }
}
